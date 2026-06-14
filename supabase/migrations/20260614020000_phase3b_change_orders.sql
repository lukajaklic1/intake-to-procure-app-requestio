-- ============================================================
-- 20260614020000_phase3b_change_orders.sql
-- Phase 3b: change orders + version history for purchase orders.
-- ============================================================

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS change_note text;

CREATE TABLE IF NOT EXISTS po_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version     int NOT NULL,
  snapshot    jsonb NOT NULL,
  change_note text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_versions_po ON po_versions(po_id, version);

ALTER TABLE po_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members see po versions"
ON po_versions FOR ALL
TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

-- Snapshot the current PO state before a change order, then bump version.
CREATE OR REPLACE FUNCTION save_po_change_order(p_po_id uuid, p_change_note text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid;
  v_po          purchase_orders%ROWTYPE;
  v_snapshot    jsonb;
  v_new_version int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_po.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_po.status NOT IN ('issued', 'sent') THEN
    RAISE EXCEPTION 'Only issued or sent purchase orders can have a change order';
  END IF;
  IF NOT (has_perm('purchase_orders', 'create') OR is_my_admin()) THEN
    RAISE EXCEPTION 'No permission to change purchase orders';
  END IF;

  v_snapshot := jsonb_build_object(
    'status', v_po.status,
    'total_amount', v_po.total_amount,
    'discount_amount', v_po.discount_amount,
    'supplier_id', v_po.supplier_id,
    'category_id', v_po.category_id,
    'project_id', v_po.project_id,
    'location_id', v_po.location_id,
    'department_id', v_po.department_id,
    'payment_terms', v_po.payment_terms,
    'expected_delivery_date', v_po.expected_delivery_date,
    'incoterm', v_po.incoterm,
    'notes', v_po.notes,
    'line_items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'unit', unit, 'unit_price', unit_price, 'line_total', line_total) ORDER BY position)
      FROM po_line_items WHERE po_id = p_po_id
    ), '[]'::jsonb)
  );

  INSERT INTO po_versions (po_id, company_id, version, snapshot, change_note, created_by)
  VALUES (p_po_id, v_po.company_id, v_po.version, v_snapshot, p_change_note, v_uid);

  v_new_version := v_po.version + 1;
  UPDATE purchase_orders SET version = v_new_version, change_note = p_change_note, updated_at = now() WHERE id = p_po_id;

  RETURN v_new_version;
END;
$$;
GRANT EXECUTE ON FUNCTION save_po_change_order(uuid, text) TO authenticated;
