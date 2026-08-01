-- ============================================================
-- 20260614060000_receipts_rejected_autoclose.sql
-- Precoro-like receiving: rejected quantities + auto-close (Received)
-- on full receipt.
-- ============================================================

ALTER TABLE receipt_line_items ADD COLUMN IF NOT EXISTS quantity_rejected numeric(12,3) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION create_receipt(
  p_po_id uuid, p_received_date date, p_supplier_receipt_no text, p_note text, p_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_po purchase_orders%ROWTYPE; v_num text; v_receipt_id uuid;
  v_line jsonb; v_po_line uuid; v_qty numeric; v_rej numeric; v_ordered numeric; v_received numeric;
  v_recv_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_po.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_po.status NOT IN ('issued', 'sent') THEN RAISE EXCEPTION 'Only issued or sent orders can be received'; END IF;
  IF NOT (has_perm('receipts', 'create') OR is_my_admin()) THEN RAISE EXCEPTION 'No permission to receive'; END IF;

  v_num := generate_receipt_number(v_po.company_id);
  INSERT INTO receipts (company_id, po_id, receipt_number, received_by, received_date, supplier_receipt_no, note)
  VALUES (v_po.company_id, p_po_id, v_num, v_uid, p_received_date, p_supplier_receipt_no, p_note)
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_po_line := (v_line->>'po_line_id')::uuid;
    v_qty := coalesce((v_line->>'quantity_received')::numeric, 0);
    v_rej := coalesce((v_line->>'quantity_rejected')::numeric, 0);
    IF v_qty <= 0 AND v_rej <= 0 THEN CONTINUE; END IF;

    SELECT quantity INTO v_ordered FROM po_line_items WHERE id = v_po_line AND po_id = p_po_id;
    IF v_ordered IS NULL THEN RAISE EXCEPTION 'Invalid line'; END IF;
    SELECT coalesce(sum(quantity_received), 0) INTO v_received FROM receipt_line_items WHERE po_line_id = v_po_line;
    IF v_qty > (v_ordered - v_received) THEN RAISE EXCEPTION 'Received quantity exceeds remaining'; END IF;

    INSERT INTO receipt_line_items (receipt_id, po_line_id, quantity_received, quantity_rejected)
    VALUES (v_receipt_id, v_po_line, v_qty, v_rej);
  END LOOP;

  v_recv_status := recompute_po_received_status(p_po_id);

  -- Fully received → order becomes "Received" (closed); remember prior status for reopen
  IF v_recv_status = 'full' AND v_po.status IN ('issued', 'sent') THEN
    UPDATE purchase_orders SET status = 'closed', prev_status = v_po.status, updated_at = now() WHERE id = p_po_id;
  END IF;

  INSERT INTO po_activity_log (company_id, po_id, actor_id, action, note)
  VALUES (v_po.company_id, p_po_id, v_uid, 'received', v_num);

  RETURN v_receipt_id;
END; $$;
GRANT EXECUTE ON FUNCTION create_receipt(uuid, date, text, text, jsonb) TO authenticated;
