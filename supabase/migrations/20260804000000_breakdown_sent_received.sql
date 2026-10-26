-- Replace the single-metric "amount" per category/supplier/project/department/
-- material with a sent-vs-received breakdown (value + count of each), so the
-- dashboard can show a proper table (like Vercel's project table) instead of
-- a bar chart that can only encode one number per row. Also raised the LIMIT
-- on each from 8/10 to 50 now that these paginate client-side.
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_company_id   uuid,
  p_date_from    timestamptz DEFAULT NULL,
  p_supplier_id  uuid        DEFAULT NULL,
  p_category_id  uuid        DEFAULT NULL,
  p_project_id   uuid        DEFAULT NULL,
  p_department_id uuid       DEFAULT NULL,
  p_months       int         DEFAULT 12,
  p_period_unit  text        DEFAULT 'month'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_period_unit NOT IN ('day', 'week', 'month') THEN
    p_period_unit := 'month';
  END IF;

  RETURN json_build_object(

    -- ── Summary ────────────────────────────────────────────────────────────────
    'summary', (
      SELECT json_build_object(
        'total_spend', COALESCE(SUM(total_amount), 0),
        'po_count',    COUNT(id),
        'avg_po',      CASE WHEN COUNT(id) > 0 THEN SUM(total_amount) / COUNT(id) ELSE 0 END
      )
      FROM purchase_orders
      WHERE company_id    = p_company_id
        AND status        = ANY(ARRAY['issued','sent','closed'])
        AND (p_date_from      IS NULL OR created_at  >= p_date_from)
        AND (p_supplier_id    IS NULL OR supplier_id  = p_supplier_id)
        AND (p_category_id    IS NULL OR category_id  = p_category_id)
        AND (p_project_id     IS NULL OR project_id   = p_project_id)
        AND (p_department_id  IS NULL OR department_id = p_department_id)
    ),

    -- ── Open POs (no filters — always global) ─────────────────────────────────
    'open_pos', (
      SELECT COUNT(id)
      FROM purchase_orders
      WHERE company_id = p_company_id
        AND status = ANY(ARRAY['issued','sent'])
    ),

    -- ── Received POs (no filters — always global) ─────────────────────────────
    'received_pos', (
      SELECT COUNT(id)
      FROM purchase_orders
      WHERE company_id = p_company_id
        AND status = 'closed'
    ),

    -- ── Spend by period (day/week/month bucket, per p_period_unit) ───────────
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
        SELECT date_trunc(p_period_unit, created_at) AS mo, SUM(total_amount) AS amount
        FROM purchase_orders
        WHERE company_id    = p_company_id
          AND status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR category_id  = p_category_id)
          AND (p_project_id     IS NULL OR project_id   = p_project_id)
          AND (p_department_id  IS NULL OR department_id = p_department_id)
        GROUP BY mo
      ) s ON s.mo = m
    ),

    -- ── Spend by supplier ──────────────────────────────────────────────────────
    'spend_by_supplier', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT sup.name,
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN suppliers sup ON sup.id = po.supplier_id
        WHERE po.company_id    = p_company_id
          AND po.status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR po.created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR po.supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR po.category_id  = p_category_id)
          AND (p_project_id     IS NULL OR po.project_id   = p_project_id)
          AND (p_department_id  IS NULL OR po.department_id = p_department_id)
        GROUP BY sup.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- ── Spend by category ──────────────────────────────────────────────────────
    'spend_by_category', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT cat.name,
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN categories cat ON cat.id = po.category_id
        WHERE po.company_id    = p_company_id
          AND po.status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR po.created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR po.supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR po.category_id  = p_category_id)
          AND (p_project_id     IS NULL OR po.project_id   = p_project_id)
          AND (p_department_id  IS NULL OR po.department_id = p_department_id)
        GROUP BY cat.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- ── Spend by project ───────────────────────────────────────────────────────
    'spend_by_project', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT proj.name,
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN projects proj ON proj.id = po.project_id
        WHERE po.company_id    = p_company_id
          AND po.status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR po.created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR po.supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR po.category_id  = p_category_id)
          AND (p_project_id     IS NULL OR po.project_id   = p_project_id)
          AND (p_department_id  IS NULL OR po.department_id = p_department_id)
        GROUP BY proj.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- ── Spend by department ────────────────────────────────────────────────────
    'spend_by_department', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT dept.name,
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN departments dept ON dept.id = po.department_id
        WHERE po.company_id    = p_company_id
          AND po.status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR po.created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR po.supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR po.category_id  = p_category_id)
          AND (p_project_id     IS NULL OR po.project_id   = p_project_id)
          AND (p_department_id  IS NULL OR po.department_id = p_department_id)
        GROUP BY dept.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- ── Spend by material / line item ─────────────────────────────────────────
    'spend_by_material', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT li.name,
               SUM(li.line_total) AS sent_amount,
               COUNT(DISTINCT po.id) AS sent_count,
               COALESCE(SUM(li.line_total) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM po_line_items li
        JOIN purchase_orders po ON po.id = li.po_id
        WHERE po.company_id    = p_company_id
          AND po.status        = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from      IS NULL OR po.created_at  >= p_date_from)
          AND (p_supplier_id    IS NULL OR po.supplier_id  = p_supplier_id)
          AND (p_category_id    IS NULL OR po.category_id  = p_category_id)
          AND (p_project_id     IS NULL OR po.project_id   = p_project_id)
          AND (p_department_id  IS NULL OR po.department_id = p_department_id)
        GROUP BY li.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- ── Recent POs (last 8, no filters) ──────────────────────────────────────
    'recent_pos', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT po.id, po.po_number, po.status, po.total_amount, po.created_at,
               sup.name  AS supplier_name,
               proj.name AS project_name
        FROM purchase_orders po
        LEFT JOIN suppliers sup  ON sup.id  = po.supplier_id
        LEFT JOIN projects proj  ON proj.id = po.project_id
        WHERE po.company_id = p_company_id
        ORDER BY po.created_at DESC
        LIMIT 8
      ) t
    )

  );
END;
$$;
