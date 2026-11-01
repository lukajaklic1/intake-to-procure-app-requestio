-- Stock: transfer of an item between two locations (e.g. warehouse -> kitchen). Two movements, one minus and one plus,
-- each pointing to the other location, so the total stock stays the same and the history shows where it went.

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS related_location_id uuid REFERENCES locations(id);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('receipt', 'usage', 'waste', 'count', 'reversal', 'transfer'));

CREATE OR REPLACE FUNCTION transfer_stock(
  p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cid uuid := get_my_company_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_edit_stock() THEN RAISE EXCEPTION 'No permission to change the stock'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'Choose two different locations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND company_id = v_cid AND track_stock) THEN RAISE EXCEPTION 'Item is not tracked in stock'; END IF;
  IF (SELECT count(*) FROM locations WHERE id IN (p_from, p_to) AND company_id = v_cid) <> 2 THEN RAISE EXCEPTION 'Invalid location'; END IF;

  INSERT INTO stock_movements (company_id, item_id, location_id, related_location_id, movement_type, quantity, reason, created_by)
  VALUES (v_cid, p_item_id, p_from, p_to, 'transfer', -p_quantity, NULLIF(trim(p_reason), ''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO stock_movements (company_id, item_id, location_id, related_location_id, movement_type, quantity, reason, created_by)
  VALUES (v_cid, p_item_id, p_to, p_from, 'transfer', p_quantity, NULLIF(trim(p_reason), ''), auth.uid());
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION transfer_stock(uuid, uuid, uuid, numeric, text) TO authenticated;
