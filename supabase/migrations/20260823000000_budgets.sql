-- Budgets: a yearly amount per department, optionally narrowed to one main category.
-- Spend is not stored, it is computed from orders and requests (budget_usage), so it is always up to date.
CREATE TABLE IF NOT EXISTS budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES categories(id) ON DELETE CASCADE,   -- a main category; NULL = the whole department
  amount        numeric(12,2) NOT NULL CHECK (amount >= 0),       -- the yearly total
  months        numeric(12,2)[],                                  -- optional split into 12 months (they add up to amount); NULL = no split
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- one budget per year, department and category (NULL category counts as one value)
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_scope
  ON budgets (company_id, year, department_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_budgets_company_year ON budgets (company_id, year);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_select ON budgets;
CREATE POLICY budgets_select ON budgets FOR SELECT TO authenticated USING (company_id = (SELECT get_my_company_id()));
DROP POLICY IF EXISTS budgets_write ON budgets;
CREATE POLICY budgets_write ON budgets FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('budgets', 'create')))
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('budgets', 'create')));

-- What has been spent / is claimed in a year, per department, main category and month:
--   'ordered'   = issued, sent and closed purchase orders
--   'requested' = pending and approved requests that have no order yet
-- A discount is spread over the lines in proportion. The document being edited can be left out.
CREATE OR REPLACE FUNCTION budget_usage(p_year integer, p_exclude_request uuid DEFAULT NULL, p_exclude_po uuid DEFAULT NULL)
RETURNS TABLE (kind text, dept_id uuid, cat_id uuid, mon integer, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'ordered'::text, po.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer,
         SUM(l.line_total * CASE WHEN po.total_amount + COALESCE(po.discount_amount, 0) > 0
                                 THEN po.total_amount / (po.total_amount + COALESCE(po.discount_amount, 0)) ELSE 1 END)
  FROM purchase_orders po
  JOIN po_line_items l ON l.po_id = po.id
  LEFT JOIN categories c ON c.id = l.category_id
  WHERE po.company_id = get_my_company_id()
    AND po.status IN ('issued', 'sent', 'closed')
    AND po.department_id IS NOT NULL
    AND extract(year FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  GROUP BY po.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))
  UNION ALL
  SELECT 'requested'::text, r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer,
         SUM(l.line_total * CASE WHEN r.total_estimate + COALESCE(r.discount_amount, 0) > 0
                                 THEN r.total_estimate / (r.total_estimate + COALESCE(r.discount_amount, 0)) ELSE 1 END)
  FROM requests r
  JOIN request_line_items l ON l.request_id = r.id
  LEFT JOIN categories c ON c.id = l.category_id
  WHERE r.company_id = get_my_company_id()
    AND r.status IN ('pending', 'approved')
    AND r.po_id IS NULL
    AND r.department_id IS NOT NULL
    AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_request IS NULL OR r.id <> p_exclude_request)
  GROUP BY r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'));
$$;
GRANT EXECUTE ON FUNCTION budget_usage(integer, uuid, uuid) TO authenticated;
