-- ============================================================
-- 20260910000000_projects.sql
-- Projects next to departments: a purchase can belong to a project (an investment, a renovation) that has its own
-- budget, start and end and a project manager.
--   projects: name, code, manager, dates, budget (kept), description
--   requests.project_id, purchase_orders.project_id (already there), invoices.project_id (new, for invoices without an order)
--   a document with a project counts against the budget of the project only, not against the department
--   project_usage(): the same stages as budget_usage (ordered, invoiced, paid, requested), over the whole life of a project
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_amount numeric(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_requests_project ON requests (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_project ON purchase_orders (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_code ON projects (company_id, lower(project_code)) WHERE project_code IS NOT NULL AND project_code <> '';

GRANT UPDATE (project_id) ON invoices TO authenticated;

-- everybody of the company sees the projects (to pick one on a document); an admin or a budget manager changes them
DROP POLICY IF EXISTS "Users see own projects" ON projects;
DROP POLICY IF EXISTS projects_select ON projects;
DROP POLICY IF EXISTS projects_write ON projects;
CREATE POLICY projects_select ON projects FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()));
CREATE POLICY projects_write ON projects FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('budgets', 'create')))
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('budgets', 'create')));

-- ── Department budgets leave out what belongs to a project ──
CREATE OR REPLACE FUNCTION budget_usage(p_year integer, p_exclude_request uuid DEFAULT NULL, p_exclude_po uuid DEFAULT NULL)
RETURNS TABLE (kind text, dept_id uuid, cat_id uuid, mon integer, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pol AS (
    SELECT po.id AS po_id, po.status, po.department_id, l.id AS line_id, COALESCE(c.parent_id, c.id) AS cat_id,
           extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer AS mon,
           l.line_total * f.v AS ordered_amt,
           COALESCE((SELECT SUM(rl.quantity_received) FROM receipt_line_items rl WHERE rl.po_line_id = l.id), 0) * l.unit_price * f.v AS received_amt,
           COALESCE((SELECT SUM(il.line_total) FROM invoice_line_items il JOIN invoices i ON i.id = il.invoice_id WHERE il.po_line_id = l.id AND i.status = 'approved'), 0) AS invoiced_amt,
           COALESCE((SELECT SUM(il.line_total) FROM invoice_line_items il JOIN invoices i ON i.id = il.invoice_id WHERE il.po_line_id = l.id AND i.status = 'paid'), 0) AS paid_amt
    FROM purchase_orders po
    JOIN po_line_items l ON l.po_id = po.id
    LEFT JOIN categories c ON c.id = l.category_id
    CROSS JOIN LATERAL (SELECT CASE WHEN po.total_amount + COALESCE(po.discount_amount, 0) > 0
                                    THEN po.total_amount / (po.total_amount + COALESCE(po.discount_amount, 0)) ELSE 1 END AS v) f
    WHERE po.company_id = get_my_company_id()
      AND po.status IN ('issued', 'sent', 'closed')
      AND po.department_id IS NOT NULL
      AND po.project_id IS NULL
      AND extract(year FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
      AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  )
  SELECT 'ordered'::text, department_id, cat_id, mon,
         SUM(GREATEST(0, CASE WHEN status = 'closed' THEN received_amt ELSE ordered_amt END - invoiced_amt - paid_amt))
  FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  SELECT 'invoiced'::text, department_id, cat_id, mon, SUM(invoiced_amt) FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  SELECT 'paid'::text, department_id, cat_id, mon, SUM(paid_amt) FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, po.department_id, COALESCE(c.parent_id, c.id),
         extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer, SUM(il.line_total)
  FROM invoices i
  JOIN purchase_orders po ON po.id = i.po_id
  JOIN invoice_line_items il ON il.invoice_id = i.id AND il.po_line_id IS NULL
  LEFT JOIN categories c ON c.id = il.category_id
  WHERE i.company_id = get_my_company_id() AND i.status IN ('approved', 'paid')
    AND po.status IN ('issued', 'sent', 'closed') AND po.department_id IS NOT NULL AND po.project_id IS NULL
    AND extract(year FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  GROUP BY 1, po.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))
  UNION ALL
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, i.department_id, COALESCE(c.parent_id, c.id),
         extract(month FROM i.invoice_date)::integer, SUM(il.line_total)
  FROM invoices i
  JOIN invoice_line_items il ON il.invoice_id = i.id
  LEFT JOIN categories c ON c.id = il.category_id
  WHERE i.company_id = get_my_company_id() AND i.po_id IS NULL AND i.status IN ('approved', 'paid')
    AND i.department_id IS NOT NULL AND i.project_id IS NULL AND extract(year FROM i.invoice_date) = p_year
  GROUP BY 1, i.department_id, COALESCE(c.parent_id, c.id), extract(month FROM i.invoice_date)
  UNION ALL
  SELECT 'requested'::text, r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer,
         SUM(l.line_total * CASE WHEN r.total_estimate + COALESCE(r.discount_amount, 0) > 0
                                 THEN r.total_estimate / (r.total_estimate + COALESCE(r.discount_amount, 0)) ELSE 1 END)
  FROM requests r
  JOIN request_line_items l ON l.request_id = r.id
  LEFT JOIN categories c ON c.id = l.category_id
  LEFT JOIN purchase_orders p ON p.id = r.po_id
  WHERE r.company_id = get_my_company_id()
    AND r.status IN ('pending', 'approved')
    AND (r.po_id IS NULL OR p.status = 'draft')
    AND r.department_id IS NOT NULL
    AND r.project_id IS NULL
    AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_request IS NULL OR r.id <> p_exclude_request)
  GROUP BY r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'));
$$;
GRANT EXECUTE ON FUNCTION budget_usage(integer, uuid, uuid) TO authenticated;

-- ── Use of the budget of the projects (the whole life of a project, not a year) ──
CREATE OR REPLACE FUNCTION project_usage(p_exclude_request uuid DEFAULT NULL, p_exclude_po uuid DEFAULT NULL)
RETURNS TABLE (kind text, project_id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pol AS (
    SELECT po.project_id, po.status,
           l.line_total * f.v AS ordered_amt,
           COALESCE((SELECT SUM(rl.quantity_received) FROM receipt_line_items rl WHERE rl.po_line_id = l.id), 0) * l.unit_price * f.v AS received_amt,
           COALESCE((SELECT SUM(il.line_total) FROM invoice_line_items il JOIN invoices i ON i.id = il.invoice_id WHERE il.po_line_id = l.id AND i.status = 'approved'), 0) AS invoiced_amt,
           COALESCE((SELECT SUM(il.line_total) FROM invoice_line_items il JOIN invoices i ON i.id = il.invoice_id WHERE il.po_line_id = l.id AND i.status = 'paid'), 0) AS paid_amt
    FROM purchase_orders po
    JOIN po_line_items l ON l.po_id = po.id
    CROSS JOIN LATERAL (SELECT CASE WHEN po.total_amount + COALESCE(po.discount_amount, 0) > 0
                                    THEN po.total_amount / (po.total_amount + COALESCE(po.discount_amount, 0)) ELSE 1 END AS v) f
    WHERE po.company_id = get_my_company_id() AND po.status IN ('issued', 'sent', 'closed') AND po.project_id IS NOT NULL
      AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  )
  SELECT 'ordered'::text, project_id, SUM(GREATEST(0, CASE WHEN status = 'closed' THEN received_amt ELSE ordered_amt END - invoiced_amt - paid_amt)) FROM pol GROUP BY project_id
  UNION ALL
  SELECT 'invoiced'::text, project_id, SUM(invoiced_amt) FROM pol GROUP BY project_id
  UNION ALL
  SELECT 'paid'::text, project_id, SUM(paid_amt) FROM pol GROUP BY project_id
  UNION ALL
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, po.project_id, SUM(il.line_total)
  FROM invoices i
  JOIN purchase_orders po ON po.id = i.po_id
  JOIN invoice_line_items il ON il.invoice_id = i.id AND il.po_line_id IS NULL
  WHERE i.company_id = get_my_company_id() AND i.status IN ('approved', 'paid') AND po.status IN ('issued', 'sent', 'closed') AND po.project_id IS NOT NULL
    AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  GROUP BY 1, po.project_id
  UNION ALL
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, i.project_id, SUM(il.line_total)
  FROM invoices i
  JOIN invoice_line_items il ON il.invoice_id = i.id
  WHERE i.company_id = get_my_company_id() AND i.po_id IS NULL AND i.status IN ('approved', 'paid') AND i.project_id IS NOT NULL
  GROUP BY 1, i.project_id
  UNION ALL
  SELECT 'requested'::text, r.project_id,
         SUM(l.line_total * CASE WHEN r.total_estimate + COALESCE(r.discount_amount, 0) > 0
                                 THEN r.total_estimate / (r.total_estimate + COALESCE(r.discount_amount, 0)) ELSE 1 END)
  FROM requests r
  JOIN request_line_items l ON l.request_id = r.id
  LEFT JOIN purchase_orders p ON p.id = r.po_id
  WHERE r.company_id = get_my_company_id() AND r.status IN ('pending', 'approved') AND (r.po_id IS NULL OR p.status = 'draft')
    AND r.project_id IS NOT NULL AND (p_exclude_request IS NULL OR r.id <> p_exclude_request)
  GROUP BY r.project_id;
$$;
GRANT EXECUTE ON FUNCTION project_usage(uuid, uuid) TO authenticated;
