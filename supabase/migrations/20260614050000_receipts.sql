-- ============================================================
-- 20260614050000_receipts.sql
-- Goods receipts (prevzemi) against purchase orders.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS rec_prefix text NOT NULL DEFAULT 'REC';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS rec_next_number integer NOT NULL DEFAULT 1;

-- Derived receiving state of a PO (main status stays untouched)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_status text NOT NULL DEFAULT 'none'
  CHECK (received_status IN ('none', 'partial', 'full'));

-- ─── receipts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id              uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receipt_number     text NOT NULL,
  received_by        uuid NOT NULL REFERENCES users(id),
  received_date      date NOT NULL,
  supplier_receipt_no text,
  note               text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_company ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_receipts_po ON receipts(po_id);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members manage receipts"
ON receipts FOR ALL TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

-- ─── receipt_line_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  po_line_id        uuid NOT NULL REFERENCES po_line_items(id) ON DELETE CASCADE,
  quantity_received numeric(12,3) NOT NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_lines_receipt ON receipt_line_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_lines_po_line ON receipt_line_items(po_line_id);

ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members manage receipt lines"
ON receipt_line_items FOR ALL TO authenticated
USING (receipt_id IN (SELECT id FROM receipts WHERE company_id = (SELECT get_my_company_id())))
WITH CHECK (receipt_id IN (SELECT id FROM receipts WHERE company_id = (SELECT get_my_company_id())));

-- ─── receipt_attachments (packing slip) — reuses quotations bucket ──
CREATE TABLE IF NOT EXISTS receipt_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  file_size   bigint,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE receipt_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members manage receipt attachments"
ON receipt_attachments FOR ALL TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));
CREATE INDEX IF NOT EXISTS idx_receipt_attachments_receipt ON receipt_attachments(receipt_id);

-- ─── generate_receipt_number ─────────────────────────────────
CREATE OR REPLACE FUNCTION generate_receipt_number(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_number integer;
BEGIN
  UPDATE companies SET rec_next_number = rec_next_number + 1
  WHERE id = p_company_id
  RETURNING rec_prefix, rec_next_number - 1 INTO v_prefix, v_number;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Company % not found', p_company_id; END IF;
  RETURN v_prefix || '-' || lpad(v_number::text, 4, '0');
END; $$;
GRANT EXECUTE ON FUNCTION generate_receipt_number(uuid) TO authenticated;

-- ─── recompute a PO's received_status ────────────────────────
CREATE OR REPLACE FUNCTION recompute_po_received_status(p_po_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_full int; v_any int; v_status text;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE recv >= li.quantity),
         count(*) FILTER (WHERE recv > 0)
  INTO v_total, v_full, v_any
  FROM po_line_items li
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(rli.quantity_received), 0) AS recv
    FROM receipt_line_items rli WHERE rli.po_line_id = li.id
  ) r ON true
  WHERE li.po_id = p_po_id;

  v_status := CASE WHEN v_total > 0 AND v_full = v_total THEN 'full'
                   WHEN v_any > 0 THEN 'partial'
                   ELSE 'none' END;
  UPDATE purchase_orders SET received_status = v_status WHERE id = p_po_id;
  RETURN v_status;
END; $$;

-- ─── create_receipt ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_receipt(
  p_po_id uuid, p_received_date date, p_supplier_receipt_no text, p_note text, p_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_po purchase_orders%ROWTYPE; v_num text; v_receipt_id uuid;
  v_line jsonb; v_po_line uuid; v_qty numeric; v_ordered numeric; v_received numeric;
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
    v_qty := (v_line->>'quantity_received')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;

    SELECT quantity INTO v_ordered FROM po_line_items WHERE id = v_po_line AND po_id = p_po_id;
    IF v_ordered IS NULL THEN RAISE EXCEPTION 'Invalid line'; END IF;
    SELECT coalesce(sum(quantity_received), 0) INTO v_received FROM receipt_line_items WHERE po_line_id = v_po_line;
    IF v_qty > (v_ordered - v_received) THEN RAISE EXCEPTION 'Received quantity exceeds remaining'; END IF;

    INSERT INTO receipt_line_items (receipt_id, po_line_id, quantity_received)
    VALUES (v_receipt_id, v_po_line, v_qty);
  END LOOP;

  PERFORM recompute_po_received_status(p_po_id);

  INSERT INTO po_activity_log (company_id, po_id, actor_id, action, note)
  VALUES (v_po.company_id, p_po_id, v_uid, 'received', v_num);

  RETURN v_receipt_id;
END; $$;
GRANT EXECUTE ON FUNCTION create_receipt(uuid, date, text, text, jsonb) TO authenticated;
