-- Cancelling a receipt (storno): a receipt is never edited or deleted. Cancelling it creates a second receipt
-- (number REC-YYNNNN, `reversal_of` points to the original) with the same quantities as negative numbers.
-- Because every total is a sum over the receipt lines, the order, the matching of invoices and the stock all
-- follow without any special case; the history keeps both documents.
--   - allowed for an admin, or for the user who made the receipt (with the receipts permission)
--   - a reason is required (kept as the note of the cancellation)
--   - not for a cancellation, not twice, not on a cancelled order, not once an invoice of the order is approved or paid
--   - an order that was closed by this receipt being complete is opened again (and its request is no longer "completed")

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES receipts(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_reversal_of ON receipts (reversal_of) WHERE reversal_of IS NOT NULL;

-- stock: a cancelled receipt takes its quantity out of the stock again
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('receipt', 'usage', 'waste', 'count', 'reversal'));

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

  -- the order was closed because everything had been received: it is open again
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
