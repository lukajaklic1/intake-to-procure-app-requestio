-- Exact analytics under a category filter.
-- Every dashboard number is now computed from PO lines. A line's value is its
-- line_total scaled so that a PO's lines add up to the PO's total_amount
-- (i.e. any PO-level discount is spread proportionally). Filtering by a
-- category therefore keeps only that category's share of each PO, and the
-- per-category numbers always add up to the overall total.

CREATE OR REPLACE FUNCTION dash_lines(
  p_company_id    uuid,
  p_date_from     timestamptz DEFAULT NULL,
  p_supplier_id   uuid        DEFAULT NULL,
  p_category_id   uuid        DEFAULT NULL,
  p_department_id uuid        DEFAULT NULL
)
RETURNS TABLE (
  po_id         uuid,
  status        text,
  created_at    timestamptz,
  supplier_id   uuid,
  department_id uuid,
  category_id   uuid,
  item_name     text,
  amt           numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.id, po.status, po.created_at, po.supplier_id, po.department_id,
         l.category_id, l.name,
         l.line_total * CASE WHEN s.sub > 0 THEN po.total_amount / s.sub ELSE 1 END
  FROM po_line_items l
  JOIN purchase_orders po ON po.id = l.po_id
  JOIN (SELECT x.po_id, SUM(x.line_total) AS sub FROM po_line_items x GROUP BY x.po_id) s ON s.po_id = po.id
  WHERE p_company_id = (SELECT get_my_company_id())
    AND po.company_id = p_company_id
    AND po.status = ANY(ARRAY['issued','sent','closed'])
    AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
    AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
    AND (p_department_id IS NULL OR po.department_id = p_department_id)
    AND (p_category_id   IS NULL OR l.category_id    = p_category_id);
$$;
REVOKE ALL ON FUNCTION dash_lines(uuid, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dash_lines(uuid, timestamptz, uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_company_id    uuid,
  p_date_from     timestamptz DEFAULT NULL,
  p_supplier_id   uuid        DEFAULT NULL,
  p_category_id   uuid        DEFAULT NULL,
  p_project_id    uuid        DEFAULT NULL,
  p_department_id uuid        DEFAULT NULL,
  p_months        int         DEFAULT 12,
  p_period_unit   text        DEFAULT 'month'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id <> (SELECT get_my_company_id()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_period_unit NOT IN ('day', 'week', 'month') THEN
    p_period_unit := 'month';
  END IF;

  RETURN json_build_object(

    'summary', (
      SELECT json_build_object(
        'total_spend', COALESCE(SUM(d.amt), 0),
        'po_count',    COUNT(DISTINCT d.po_id),
        'avg_po',      CASE WHEN COUNT(DISTINCT d.po_id) > 0 THEN SUM(d.amt) / COUNT(DISTINCT d.po_id) ELSE 0 END
      )
      FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
    ),

    'open_pos', (
      SELECT COUNT(id) FROM purchase_orders
      WHERE company_id = p_company_id AND status = ANY(ARRAY['issued','sent'])
    ),

    'received_pos', (
      SELECT COUNT(id) FROM purchase_orders
      WHERE company_id = p_company_id AND status = 'closed'
    ),

    'spend_by_month', (
      SELECT COALESCE(json_agg(
        json_build_object('month', to_char(m, 'YYYY-MM-DD'), 'amount', COALESCE(s.amount, 0))
        ORDER BY m
      ), '[]'::json)
      FROM generate_series(
        date_trunc(p_period_unit, NOW()) - ((p_months - 1) || ' ' || p_period_unit)::interval,
        date_trunc(p_period_unit, NOW()),
        ('1 ' || p_period_unit)::interval
      ) m
      LEFT JOIN (
        SELECT date_trunc(p_period_unit, d.created_at) AS mo, SUM(d.amt) AS amount
        FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
        GROUP BY mo
      ) s ON s.mo = m
    ),

    'spend_by_supplier', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT sup.name,
               SUM(d.amt) AS sent_amount,
               COUNT(DISTINCT d.po_id) AS sent_count,
               COALESCE(SUM(d.amt) FILTER (WHERE d.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT d.po_id) FILTER (WHERE d.status = 'closed') AS received_count
        FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
        LEFT JOIN suppliers sup ON sup.id = d.supplier_id
        GROUP BY sup.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    'spend_by_category', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT cat.name,
               SUM(d.amt) AS sent_amount,
               COUNT(DISTINCT d.po_id) AS sent_count,
               COALESCE(SUM(d.amt) FILTER (WHERE d.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT d.po_id) FILTER (WHERE d.status = 'closed') AS received_count
        FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
        LEFT JOIN categories cat ON cat.id = d.category_id
        GROUP BY cat.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    'spend_by_department', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT dept.name,
               SUM(d.amt) AS sent_amount,
               COUNT(DISTINCT d.po_id) AS sent_count,
               COALESCE(SUM(d.amt) FILTER (WHERE d.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT d.po_id) FILTER (WHERE d.status = 'closed') AS received_count
        FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
        LEFT JOIN departments dept ON dept.id = d.department_id
        GROUP BY dept.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    'spend_by_material', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT d.item_name AS name,
               SUM(d.amt) AS sent_amount,
               COUNT(DISTINCT d.po_id) AS sent_count,
               COALESCE(SUM(d.amt) FILTER (WHERE d.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT d.po_id) FILTER (WHERE d.status = 'closed') AS received_count
        FROM dash_lines(p_company_id, p_date_from, p_supplier_id, p_category_id, p_department_id) d
        GROUP BY d.item_name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    )

  );
END;
$$;
