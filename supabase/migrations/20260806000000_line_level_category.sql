-- Category lives on the line item (postavka), not on the request/PO header:
-- a single order can mix food and cleaning supplies. Each line stores the
-- category it had when it was ordered (copied from the item, or picked for a
-- free-text line), so later changes to an item's category don't rewrite
-- history. The header category_id columns stay but are no longer used.

ALTER TABLE request_line_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id);
ALTER TABLE po_line_items      ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS idx_request_lines_category ON request_line_items(category_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_category      ON po_line_items(category_id);

-- Carry the line category over when a request becomes a PO.
CREATE OR REPLACE FUNCTION create_po_from_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid;
  v_req       requests%ROWTYPE;
  v_po_id     uuid;
  v_po_number text;
  v_sup       suppliers%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'Only approved requests can become a PO'; END IF;
  IF v_req.po_id IS NOT NULL THEN RAISE EXCEPTION 'A PO already exists for this request'; END IF;
  IF NOT (has_perm('purchase_orders', 'create') OR is_my_admin()) THEN
    RAISE EXCEPTION 'No permission to create purchase orders';
  END IF;

  v_po_number := generate_po_number(v_req.company_id);

  IF v_req.supplier_id IS NOT NULL THEN
    SELECT * INTO v_sup FROM suppliers WHERE id = v_req.supplier_id;
  END IF;

  INSERT INTO purchase_orders (
    company_id, created_by, po_number, status, request_id,
    supplier_id, location_id, department_id,
    payment_terms, incoterm, expected_delivery_date, notes, discount_amount, total_amount
  ) VALUES (
    v_req.company_id, v_uid, v_po_number, 'draft', p_request_id,
    v_req.supplier_id, v_req.location_id, v_req.department_id,
    v_sup.payment_terms, v_sup.incoterm, v_req.needed_by_date, v_req.note, v_req.discount_amount, v_req.total_estimate
  ) RETURNING id INTO v_po_id;

  INSERT INTO po_line_items (po_id, item_id, category_id, position, name, long_description, quantity, unit, unit_price)
  SELECT v_po_id, item_id, category_id, position, name, long_description, quantity, unit, coalesce(est_unit_price, 0)
  FROM request_line_items
  WHERE request_id = p_request_id
  ORDER BY position;

  UPDATE requests SET po_id = v_po_id, updated_at = now() WHERE id = p_request_id;

  INSERT INTO activity_log (company_id, request_id, actor_id, action, meta)
  VALUES (v_req.company_id, p_request_id, v_uid, 'po_created',
          json_build_object('po_id', v_po_id, 'po_number', v_po_number));

  RETURN v_po_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_po_from_request(uuid) TO authenticated;

-- Analytics: spend by category now sums line totals by the line's category.
-- The category filter matches POs that contain at least one line in it.
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
AS $$
BEGIN
  IF p_period_unit NOT IN ('day', 'week', 'month') THEN
    p_period_unit := 'month';
  END IF;

  RETURN json_build_object(

    'summary', (
      SELECT json_build_object(
        'total_spend', COALESCE(SUM(po.total_amount), 0),
        'po_count',    COUNT(po.id),
        'avg_po',      CASE WHEN COUNT(po.id) > 0 THEN SUM(po.total_amount) / COUNT(po.id) ELSE 0 END
      )
      FROM purchase_orders po
      WHERE po.company_id = p_company_id
        AND po.status     = ANY(ARRAY['issued','sent','closed'])
        AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
        AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
        AND (p_department_id IS NULL OR po.department_id = p_department_id)
        AND (p_category_id   IS NULL OR EXISTS (SELECT 1 FROM po_line_items l WHERE l.po_id = po.id AND l.category_id = p_category_id))
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
        SELECT date_trunc(p_period_unit, po.created_at) AS mo, SUM(po.total_amount) AS amount
        FROM purchase_orders po
        WHERE po.company_id = p_company_id
          AND po.status     = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
          AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
          AND (p_department_id IS NULL OR po.department_id = p_department_id)
          AND (p_category_id   IS NULL OR EXISTS (SELECT 1 FROM po_line_items l WHERE l.po_id = po.id AND l.category_id = p_category_id))
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
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN suppliers sup ON sup.id = po.supplier_id
        WHERE po.company_id = p_company_id
          AND po.status     = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
          AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
          AND (p_department_id IS NULL OR po.department_id = p_department_id)
          AND (p_category_id   IS NULL OR EXISTS (SELECT 1 FROM po_line_items l WHERE l.po_id = po.id AND l.category_id = p_category_id))
        GROUP BY sup.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    ),

    -- Category: sum of the lines, grouped by each line's own category.
    'spend_by_category', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', name, 'sent_amount', sent_amount, 'sent_count', sent_count,
        'received_amount', received_amount, 'received_count', received_count
      ) ORDER BY sent_amount DESC), '[]'::json)
      FROM (
        SELECT cat.name,
               SUM(l.line_total) AS sent_amount,
               COUNT(DISTINCT po.id) AS sent_count,
               COALESCE(SUM(l.line_total) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM po_line_items l
        JOIN purchase_orders po ON po.id = l.po_id
        LEFT JOIN categories cat ON cat.id = l.category_id
        WHERE po.company_id = p_company_id
          AND po.status     = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
          AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
          AND (p_department_id IS NULL OR po.department_id = p_department_id)
          AND (p_category_id   IS NULL OR l.category_id    = p_category_id)
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
               SUM(po.total_amount) AS sent_amount,
               COUNT(po.id) AS sent_count,
               COALESCE(SUM(po.total_amount) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM purchase_orders po
        LEFT JOIN departments dept ON dept.id = po.department_id
        WHERE po.company_id = p_company_id
          AND po.status     = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
          AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
          AND (p_department_id IS NULL OR po.department_id = p_department_id)
          AND (p_category_id   IS NULL OR EXISTS (SELECT 1 FROM po_line_items l WHERE l.po_id = po.id AND l.category_id = p_category_id))
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
        SELECT li.name,
               SUM(li.line_total) AS sent_amount,
               COUNT(DISTINCT po.id) AS sent_count,
               COALESCE(SUM(li.line_total) FILTER (WHERE po.status = 'closed'), 0) AS received_amount,
               COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'closed') AS received_count
        FROM po_line_items li
        JOIN purchase_orders po ON po.id = li.po_id
        WHERE po.company_id = p_company_id
          AND po.status     = ANY(ARRAY['issued','sent','closed'])
          AND (p_date_from     IS NULL OR po.created_at   >= p_date_from)
          AND (p_supplier_id   IS NULL OR po.supplier_id   = p_supplier_id)
          AND (p_department_id IS NULL OR po.department_id = p_department_id)
          AND (p_category_id   IS NULL OR li.category_id   = p_category_id)
        GROUP BY li.name
        ORDER BY sent_amount DESC
        LIMIT 50
      ) t
    )

  );
END;
$$;
