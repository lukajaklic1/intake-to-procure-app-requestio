-- ============================================================
-- 20260905000000_stock_usage_department.sql
-- Usage and waste are booked to a department (who used it up).
-- Older movements keep an empty department.
-- ============================================================

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_department ON stock_movements (company_id, department_id, created_at DESC);

-- the new version has one more argument, so the old one goes
DROP FUNCTION IF EXISTS record_stock_movement(uuid, uuid, text, numeric, text);

CREATE OR REPLACE FUNCTION record_stock_movement(
  p_item_id uuid, p_location_id uuid, p_type text, p_quantity numeric, p_reason text DEFAULT NULL, p_department_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cid uuid := get_my_company_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_edit_stock() THEN RAISE EXCEPTION 'No permission to change the stock'; END IF;
  IF p_type NOT IN ('usage', 'waste') THEN RAISE EXCEPTION 'Invalid movement type'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0'; END IF;
  IF p_department_id IS NULL THEN RAISE EXCEPTION 'Department is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM departments WHERE id = p_department_id AND company_id = v_cid) THEN RAISE EXCEPTION 'Invalid department'; END IF;
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND company_id = v_cid AND track_stock) THEN RAISE EXCEPTION 'Item is not tracked in stock'; END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND company_id = v_cid) THEN RAISE EXCEPTION 'Invalid location'; END IF;

  INSERT INTO stock_movements (company_id, item_id, location_id, movement_type, quantity, reason, department_id, created_by)
  VALUES (v_cid, p_item_id, p_location_id, p_type, -p_quantity, NULLIF(trim(p_reason), ''), p_department_id, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION record_stock_movement(uuid, uuid, text, numeric, text, uuid) TO authenticated;
