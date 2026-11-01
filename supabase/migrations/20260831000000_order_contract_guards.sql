-- Rules that were only in the screens, now enforced in the database too:
--   - cancelling an order: someone who may edit orders, only an issued or sent order with nothing received yet
--   - leaving the status cancelled or closed ("reopen"): admin only
--   - deleting a contract: admin only (an order linked to it already blocks the delete through the foreign key)
-- The receipt functions change statuses on their own and tell the guard so with a transaction-local setting.

CREATE OR REPLACE FUNCTION purchase_orders_guard_status()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF current_setting('app.po_status_bypass', true) = 'on' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;   -- migrations and the service role

  IF OLD.status IN ('cancelled', 'closed') AND NOT is_my_admin() THEN
    RAISE EXCEPTION 'Only an admin can reopen an order';
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NOT (is_my_admin() OR has_perm('purchase_orders', 'create')) THEN RAISE EXCEPTION 'No permission to cancel orders'; END IF;
    IF OLD.status NOT IN ('issued', 'sent') THEN RAISE EXCEPTION 'Only an issued or sent order can be cancelled'; END IF;
    IF OLD.received_status <> 'none' THEN RAISE EXCEPTION 'An order with received goods cannot be cancelled'; END IF;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_purchase_orders_guard_status ON purchase_orders;
CREATE TRIGGER trg_purchase_orders_guard_status BEFORE UPDATE OF status ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION purchase_orders_guard_status();

-- contracts: create and edit as before, delete for the admin only
DROP POLICY IF EXISTS contracts_write ON contracts;
DROP POLICY IF EXISTS contracts_insert ON contracts;
DROP POLICY IF EXISTS contracts_update ON contracts;
DROP POLICY IF EXISTS contracts_delete ON contracts;
CREATE POLICY contracts_insert ON contracts FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('purchase_orders', 'create')));
CREATE POLICY contracts_update ON contracts FOR UPDATE TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('purchase_orders', 'create')))
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('purchase_orders', 'create')));
CREATE POLICY contracts_delete ON contracts FOR DELETE TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND is_my_admin());

-- cancelling a receipt reopens the order it had closed: that is a status change the guard has to let through
CREATE OR REPLACE FUNCTION reverse_receipt(p_receipt_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec receipts%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_num text;
  v_new uuid;
  v_was_full boolean;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  SELECT * INTO v_rec FROM receipts WHERE id = p_receipt_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF v_rec.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT (is_my_admin() OR (has_perm('receipts', 'create') AND v_rec.received_by = v_uid)) THEN
    RAISE EXCEPTION 'No permission to cancel this receipt';
  END IF;
  IF v_rec.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'A cancellation cannot be cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM receipts WHERE reversal_of = p_receipt_id) THEN RAISE EXCEPTION 'This receipt is already cancelled'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_rec.po_id;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'The order is cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE po_id = v_po.id AND status IN ('approved', 'paid')) THEN
    RAISE EXCEPTION 'An invoice of this order is already approved';
  END IF;

  v_was_full := (v_po.received_status = 'full');
  v_num := generate_receipt_number(v_rec.company_id);
  INSERT INTO receipts (company_id, po_id, receipt_number, received_by, received_date, note, reversal_of)
  VALUES (v_rec.company_id, v_rec.po_id, v_num, v_uid, (now() AT TIME ZONE 'Europe/Ljubljana')::date, trim(p_reason), p_receipt_id)
  RETURNING id INTO v_new;

  INSERT INTO receipt_line_items (receipt_id, po_line_id, quantity_received, quantity_rejected)
  SELECT v_new, po_line_id, -quantity_received, 0
  FROM receipt_line_items WHERE receipt_id = p_receipt_id AND quantity_received <> 0;

  INSERT INTO stock_movements (company_id, item_id, location_id, movement_type, quantity, reason, receipt_id, created_by)
  SELECT company_id, item_id, location_id, 'reversal', -quantity, trim(p_reason), v_new, v_uid
  FROM stock_movements WHERE receipt_id = p_receipt_id AND movement_type = 'receipt';

  v_status := recompute_po_received_status(v_po.id);

  -- the order was closed because everything had been received: it is open again (the guard on order statuses lets this through)
  PERFORM set_config('app.po_status_bypass', 'on', true);
  IF v_was_full AND v_status <> 'full' AND v_po.status = 'closed' THEN
    UPDATE purchase_orders SET status = 'sent', updated_at = now() WHERE id = v_po.id;
    IF v_po.request_id IS NOT NULL THEN
      UPDATE requests SET status = 'approved', updated_at = now() WHERE id = v_po.request_id AND status = 'completed';
    END IF;
  END IF;

  INSERT INTO po_activity_log (company_id, po_id, actor_id, action, note)
  VALUES (v_po.company_id, v_po.id, v_uid, 'receipt_cancelled', v_num);

  RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION reverse_receipt(uuid, text) TO authenticated;
