-- ============================================================
-- 20260614000000_phase3_request_to_po.sql
-- Phase 3a: create a PO from an approved request + cross-links.
-- ============================================================

-- A draft PO created from a request may be incomplete; the buyer
-- fills the required fields before issuing (enforced in the form).
ALTER TABLE purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN payment_terms DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN expected_delivery_date DROP NOT NULL;

-- Link requests <-> purchase_orders
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL;

ALTER TABLE requests
  ADD CONSTRAINT requests_po_id_fkey
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- ─── create_po_from_request ──────────────────────────────────
CREATE OR REPLACE FUNCTION create_po_from_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid;
  v_req       requests%ROWTYPE;
  v_po_id     uuid;
  v_po_number text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'Only approved requests can become a PO'; END IF;
  IF v_req.po_id IS NOT NULL THEN RAISE EXCEPTION 'A PO already exists for this request'; END IF;
  IF NOT (has_perm('purchase_orders', 'create') OR is_my_admin()) THEN
    RAISE EXCEPTION 'No permission to create purchase orders';
  END IF;

  v_po_number := generate_po_number(v_req.company_id);

  INSERT INTO purchase_orders (
    company_id, created_by, po_number, status, request_id,
    supplier_id, category_id, location_id, project_id, department_id,
    payment_terms, expected_delivery_date, notes, discount_amount, total_amount
  ) VALUES (
    v_req.company_id, v_uid, v_po_number, 'draft', p_request_id,
    v_req.supplier_id, v_req.category_id, v_req.location_id, v_req.project_id, v_req.department_id,
    NULL, v_req.needed_by_date, v_req.note, v_req.discount_amount, v_req.total_estimate
  ) RETURNING id INTO v_po_id;

  INSERT INTO po_line_items (po_id, item_id, position, name, long_description, quantity, unit, unit_price)
  SELECT v_po_id, item_id, position, name, long_description, quantity, unit, coalesce(est_unit_price, 0)
  FROM request_line_items
  WHERE request_id = p_request_id
  ORDER BY position;

  UPDATE requests SET po_id = v_po_id, updated_at = now() WHERE id = p_request_id;

  INSERT INTO activity_log (company_id, request_id, actor_id, action, meta)
  VALUES (v_req.company_id, p_request_id, v_uid, 'po_created',
          json_build_object('po_id', v_po_id, 'po_number', v_po_number));

  RETURN v_po_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_po_from_request(uuid) TO authenticated;
