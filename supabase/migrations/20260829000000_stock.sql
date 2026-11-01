-- Stock (zaloga): only for catalog items marked "track stock", per delivery location.
--   items.track_stock      the switch on the catalog item
--   stock_movements        every change of the stock: receipt (+), usage (-), waste (-), count (correction)
--   stock_limits           minimum (safety) stock and optional "order up to" quantity per item and location
-- The stock of an item at a location is the sum of its movements. A receipt adds to the stock by itself
-- (accepted quantity, location of the order); usage, waste and counts are entered by hand.
-- Writes to stock_movements only go through the functions below. Permissions: module "stock" (view / create).

ALTER TABLE items ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false;

-- the list of modules a permission can be for gets "stock" (whatever the old check constraint is called)
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.user_permissions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%module%'
  LOOP
    EXECUTE format('ALTER TABLE user_permissions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN ('requests', 'purchase_orders', 'receipts', 'invoices', 'budgets', 'reports', 'stock'));

CREATE TABLE IF NOT EXISTS stock_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES items(id),
  location_id   uuid NOT NULL REFERENCES locations(id),
  movement_type text NOT NULL CHECK (movement_type IN ('receipt', 'usage', 'waste', 'count')),
  quantity      numeric(12,3) NOT NULL,              -- signed: + adds to the stock, - takes from it
  reason        text,
  receipt_id    uuid REFERENCES receipts(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements (company_id, item_id, location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  min_qty     numeric(12,3) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  target_qty  numeric(12,3) CHECK (target_qty IS NULL OR target_qty >= 0),
  UNIQUE (item_id, location_id)
);

CREATE OR REPLACE FUNCTION can_see_stock() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('stock', 'view') OR has_perm('stock', 'create');
$$;
CREATE OR REPLACE FUNCTION can_edit_stock() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('stock', 'create');
$$;
GRANT EXECUTE ON FUNCTION can_see_stock() TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_stock() TO authenticated;

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_limits    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_select ON stock_movements;
CREATE POLICY stock_movements_select ON stock_movements FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_stock());
-- no insert / update / delete policy on purpose: movements are written by the functions below only

DROP POLICY IF EXISTS stock_limits_select ON stock_limits;
CREATE POLICY stock_limits_select ON stock_limits FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_stock());
DROP POLICY IF EXISTS stock_limits_write ON stock_limits;
CREATE POLICY stock_limits_write ON stock_limits FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_edit_stock())
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_stock());

-- ── Usage / waste ──
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_item_id uuid, p_location_id uuid, p_type text, p_quantity numeric, p_reason text DEFAULT NULL
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
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND company_id = v_cid AND track_stock) THEN RAISE EXCEPTION 'Item is not tracked in stock'; END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND company_id = v_cid) THEN RAISE EXCEPTION 'Invalid location'; END IF;

  INSERT INTO stock_movements (company_id, item_id, location_id, movement_type, quantity, reason, created_by)
  VALUES (v_cid, p_item_id, p_location_id, p_type, -p_quantity, NULLIF(trim(p_reason), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION record_stock_movement(uuid, uuid, text, numeric, text) TO authenticated;

-- ── Count: the counted quantity becomes the stock, the difference is kept as a correction ──
CREATE OR REPLACE FUNCTION set_stock_count(
  p_item_id uuid, p_location_id uuid, p_counted numeric, p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cid uuid := get_my_company_id();
  v_current numeric;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT can_edit_stock() THEN RAISE EXCEPTION 'No permission to change the stock'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN RAISE EXCEPTION 'Counted quantity cannot be negative'; END IF;
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item_id AND company_id = v_cid AND track_stock) THEN RAISE EXCEPTION 'Item is not tracked in stock'; END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE id = p_location_id AND company_id = v_cid) THEN RAISE EXCEPTION 'Invalid location'; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM stock_movements
  WHERE company_id = v_cid AND item_id = p_item_id AND location_id = p_location_id;

  INSERT INTO stock_movements (company_id, item_id, location_id, movement_type, quantity, reason, created_by)
  VALUES (v_cid, p_item_id, p_location_id, 'count', p_counted - v_current, NULLIF(trim(p_reason), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION set_stock_count(uuid, uuid, numeric, text) TO authenticated;

-- ── Overview: stock, limits and what is on order but not received yet, per item and location ──
CREATE OR REPLACE FUNCTION stock_overview()
RETURNS TABLE (item_id uuid, location_id uuid, on_hand numeric, min_qty numeric, target_qty numeric, on_order numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT get_my_company_id() AS cid),
  mv AS (
    SELECT m.item_id, m.location_id, SUM(m.quantity) AS qty
    FROM stock_movements m, me WHERE m.company_id = me.cid GROUP BY m.item_id, m.location_id
  ),
  lim AS (
    SELECT l.item_id, l.location_id, l.min_qty, l.target_qty
    FROM stock_limits l, me WHERE l.company_id = me.cid
  ),
  ord AS (
    SELECT li.item_id, p.location_id, SUM(GREATEST(li.quantity - COALESCE(r.recv, 0), 0)) AS qty
    FROM po_line_items li
    JOIN purchase_orders p ON p.id = li.po_id
    LEFT JOIN LATERAL (SELECT SUM(rli.quantity_received) AS recv FROM receipt_line_items rli WHERE rli.po_line_id = li.id) r ON true
    CROSS JOIN me
    WHERE p.company_id = me.cid AND p.status IN ('issued', 'sent') AND li.item_id IS NOT NULL AND p.location_id IS NOT NULL
    GROUP BY li.item_id, p.location_id
  ),
  keys AS (
    SELECT a.item_id, a.location_id FROM mv a
    UNION SELECT b.item_id, b.location_id FROM lim b
    UNION SELECT c.item_id, c.location_id FROM ord c
  )
  SELECT k.item_id, k.location_id, COALESCE(mv.qty, 0), lim.min_qty, lim.target_qty, COALESCE(ord.qty, 0)
  FROM keys k
  JOIN items i ON i.id = k.item_id AND i.track_stock
  LEFT JOIN mv  ON mv.item_id  = k.item_id AND mv.location_id  = k.location_id
  LEFT JOIN lim ON lim.item_id = k.item_id AND lim.location_id = k.location_id
  LEFT JOIN ord ON ord.item_id = k.item_id AND ord.location_id = k.location_id
  WHERE can_see_stock();
$$;
GRANT EXECUTE ON FUNCTION stock_overview() TO authenticated;

-- ── A receipt adds the accepted quantity of tracked items to the stock of the order's location ──
CREATE OR REPLACE FUNCTION create_receipt(
  p_po_id uuid, p_received_date date, p_supplier_receipt_no text, p_note text, p_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_po purchase_orders%ROWTYPE; v_num text; v_receipt_id uuid;
  v_line jsonb; v_po_line uuid; v_qty numeric; v_rej numeric; v_ordered numeric;
  v_recv_status text; v_item uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_po.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_po.status <> 'sent' THEN RAISE EXCEPTION 'Only sent orders can be received'; END IF;
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

    SELECT quantity, item_id INTO v_ordered, v_item FROM po_line_items WHERE id = v_po_line AND po_id = p_po_id;
    IF v_ordered IS NULL THEN RAISE EXCEPTION 'Invalid line'; END IF;
    -- over-delivery allowed: no upper bound on received

    INSERT INTO receipt_line_items (receipt_id, po_line_id, quantity_received, quantity_rejected)
    VALUES (v_receipt_id, v_po_line, v_qty, v_rej);

    -- tracked item: the accepted quantity goes to the stock of the order's delivery location
    IF v_qty > 0 AND v_item IS NOT NULL AND v_po.location_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM items WHERE id = v_item AND track_stock) THEN
      INSERT INTO stock_movements (company_id, item_id, location_id, movement_type, quantity, receipt_id, created_by)
      VALUES (v_po.company_id, v_item, v_po.location_id, 'receipt', v_qty, v_receipt_id, v_uid);
    END IF;
  END LOOP;

  v_recv_status := recompute_po_received_status(p_po_id);

  IF v_recv_status = 'full' THEN
    UPDATE purchase_orders SET status = 'closed', prev_status = v_po.status, updated_at = now() WHERE id = p_po_id;
    IF v_po.request_id IS NOT NULL THEN
      UPDATE requests SET status = 'completed', updated_at = now()
      WHERE id = v_po.request_id AND status NOT IN ('rejected', 'cancelled');
    END IF;
  END IF;

  INSERT INTO po_activity_log (company_id, po_id, actor_id, action, note)
  VALUES (v_po.company_id, p_po_id, v_uid, 'received', v_num);

  RETURN v_receipt_id;
END; $$;
GRANT EXECUTE ON FUNCTION create_receipt(uuid, date, text, text, jsonb) TO authenticated;

-- the sidebar counter of items under their minimum follows the stock live
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stock_movements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  END IF;
END $$;
