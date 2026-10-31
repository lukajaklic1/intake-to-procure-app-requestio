-- A request whose order is still only a draft keeps counting as "requested" in the budget (the draft is not an order yet),
-- so the amount does not disappear between creating the order and issuing it.
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
  LEFT JOIN purchase_orders p ON p.id = r.po_id
  WHERE r.company_id = get_my_company_id()
    AND r.status IN ('pending', 'approved')
    AND (r.po_id IS NULL OR p.status = 'draft')
    AND r.department_id IS NOT NULL
    AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_request IS NULL OR r.id <> p_exclude_request)
  GROUP BY r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'));
$$;
GRANT EXECUTE ON FUNCTION budget_usage(integer, uuid, uuid) TO authenticated;
