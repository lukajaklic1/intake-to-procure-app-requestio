-- Stock: value of the stock. The price of an item is the price on its last receipt at that location, and when there has not been one
-- (a starting stock, for example) the default price of the item in the catalog. The overview function returns it as unit_cost.

DROP FUNCTION IF EXISTS stock_overview();
CREATE OR REPLACE FUNCTION stock_overview()
RETURNS TABLE (item_id uuid, location_id uuid, on_hand numeric, min_qty numeric, target_qty numeric, moq numeric, on_order numeric, unit_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT get_my_company_id() AS cid),
  mv AS (
    SELECT m.item_id, m.location_id, SUM(m.quantity) AS qty
    FROM stock_movements m, me WHERE m.company_id = me.cid GROUP BY m.item_id, m.location_id
  ),
  lim AS (
    SELECT l.item_id, l.location_id, l.min_qty, l.target_qty, l.moq
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
  SELECT k.item_id, k.location_id, COALESCE(mv.qty, 0), lim.min_qty, lim.target_qty, lim.moq, COALESCE(ord.qty, 0),
         COALESCE(last_price.unit_price, i.default_unit_price)
  FROM keys k
  JOIN items i ON i.id = k.item_id AND i.track_stock
  LEFT JOIN mv  ON mv.item_id  = k.item_id AND mv.location_id  = k.location_id
  LEFT JOIN lim ON lim.item_id = k.item_id AND lim.location_id = k.location_id
  LEFT JOIN ord ON ord.item_id = k.item_id AND ord.location_id = k.location_id
  LEFT JOIN LATERAL (
    SELECT pli.unit_price
    FROM stock_movements sm
    JOIN receipt_line_items rli ON rli.receipt_id = sm.receipt_id
    JOIN po_line_items pli ON pli.id = rli.po_line_id AND pli.item_id = k.item_id
    WHERE sm.item_id = k.item_id AND sm.location_id = k.location_id AND sm.movement_type = 'receipt'
    ORDER BY sm.created_at DESC
    LIMIT 1
  ) last_price ON true
  WHERE can_see_stock();
$$;
GRANT EXECUTE ON FUNCTION stock_overview() TO authenticated;
