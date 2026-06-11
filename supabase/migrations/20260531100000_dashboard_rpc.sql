-- Dashboard aggregation RPC
-- Replaces fetching all PO rows to the client — all grouping done in Postgres.

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_company_id   uuid,
  p_date_from    timestamptz DEFAULT NULL,
  p_supplier_id  uuid        DEFAULT NULL,
  p_category_id  uuid        DEFAULT NULL,
  p_project_id   uuid        DEFAULT NULL,
  p_department_id uuid       DEFAULT NULL,
  p_months       int         DEFAULT 12
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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

    -- ── Spend by month ────────────────────────────────────────────────────────
    'spend_by_month', (
      SELECT COALESCE(json_agg(
        json_build_object('month', to_char(m, 'YYYY-MM'), 'amount', COALESCE(s.amount, 0))
        ORDER BY m
      ), '[]'::json)
      FROM generate_series(
        date_trunc('month', NOW()) - ((p_months - 1) || ' months')::interval,
        date_trunc('month', NOW()),
        '1 month'::interval
      ) m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS mo, SUM(total_amount) AS amount
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

    -- ── Spend by supplier (top 10) ────────────────────────────────────────────
    'spend_by_supplier', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'amount', amount) ORDER BY amount DESC), '[]'::json)
      FROM (
        SELECT sup.name, SUM(po.total_amount) AS amount
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
        ORDER BY amount DESC
        LIMIT 10
      ) t
    ),

    -- ── Spend by category (top 8) ─────────────────────────────────────────────
    'spend_by_category', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'value', amount) ORDER BY amount DESC), '[]'::json)
      FROM (
        SELECT cat.name, SUM(po.total_amount) AS amount
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
        ORDER BY amount DESC
        LIMIT 8
      ) t
    ),

    -- ── Spend by project (top 10) ─────────────────────────────────────────────
    'spend_by_project', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'amount', amount) ORDER BY amount DESC), '[]'::json)
      FROM (
        SELECT proj.name, SUM(po.total_amount) AS amount
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
        ORDER BY amount DESC
        LIMIT 10
      ) t
    ),

    -- ── Spend by department (top 10) ──────────────────────────────────────────
    'spend_by_department', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'amount', amount) ORDER BY amount DESC), '[]'::json)
      FROM (
        SELECT dept.name, SUM(po.total_amount) AS amount
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
        ORDER BY amount DESC
        LIMIT 10
      ) t
    ),

    -- ── Spend by material / line item (top 10) ────────────────────────────────
    'spend_by_material', (
      SELECT COALESCE(json_agg(json_build_object('name', name, 'amount', amount) ORDER BY amount DESC), '[]'::json)
      FROM (
        SELECT li.name, SUM(li.line_total) AS amount
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
        ORDER BY amount DESC
        LIMIT 10
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

-- Indexes that help this query (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_po_company_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_company_created ON purchase_orders(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_po_line_items_po_id ON po_line_items(po_id);
