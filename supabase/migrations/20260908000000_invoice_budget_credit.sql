-- ============================================================
-- 20260908000000_invoice_budget_credit.sql
-- Invoices and the budget:
--   invoices.department_id (an invoice without an order needs one), invoice_line_items.category_id (for those)
--   budget_usage(): orders, invoiced (approved invoices), paid, requested - an order that is closed shrinks to what was
--   invoiced / received, an invoice above its order adds the difference, an invoice without an order counts on its own
-- Credit notes: invoices.kind = 'credit_note' (negative amounts), credits_invoice_id
-- Taking an approval back (approved -> in review, with a reason), refresh of the stored match
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice', 'credit_note'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credits_invoice_id uuid REFERENCES invoices(id);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id);

-- the content columns an editor may change (status and approval fields still go through set_invoice_status only)
GRANT UPDATE (department_id, credits_invoice_id) ON invoices TO authenticated;

-- ── Status changes (the previous version plus: department rule, credit notes, taking an approval back) ──
CREATE OR REPLACE FUNCTION set_invoice_status(
  p_invoice_id   uuid,
  p_status       text,
  p_note         text DEFAULT NULL,
  p_paid_at      date DEFAULT NULL,
  p_payment_ref  text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_inv     invoices%ROWTYPE;
  v_co      companies%ROWTYPE;
  v_step    invoice_approvals%ROWTYPE;
  v_lines   integer;
  v_pending integer;
  v_final   boolean := true;
  v_action  text := p_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF v_inv.status IN ('draft', 'rejected') AND p_status = 'in_review' THEN
    IF NOT can_edit_invoices() THEN RAISE EXCEPTION 'No permission to submit invoices'; END IF;
    SELECT COUNT(*) INTO v_lines FROM invoice_line_items WHERE invoice_id = p_invoice_id;
    IF v_lines = 0 OR (v_inv.kind = 'invoice' AND v_inv.total_amount <= 0) OR (v_inv.kind = 'credit_note' AND v_inv.total_amount >= 0) THEN
      RAISE EXCEPTION 'An invoice needs at least one line with an amount';
    END IF;
    IF v_inv.po_id IS NULL AND v_inv.department_id IS NULL THEN
      RAISE EXCEPTION 'An invoice without an order needs a department';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM invoice_attachments WHERE invoice_id = p_invoice_id) THEN
      RAISE EXCEPTION 'The supplier invoice (document) must be attached before it is sent to review';
    END IF;

    SELECT * INTO v_co FROM companies WHERE id = v_inv.company_id;
    IF v_co.invoice_approver_id IS NULL THEN RAISE EXCEPTION 'No invoice approver set. Choose one in Settings.'; END IF;
    DELETE FROM invoice_approvals WHERE invoice_id = p_invoice_id;
    INSERT INTO invoice_approvals (invoice_id, company_id, step, approver_id) VALUES (p_invoice_id, v_inv.company_id, 1, v_co.invoice_approver_id);
    IF v_co.invoice_second_approver_id IS NOT NULL AND v_co.invoice_second_over IS NOT NULL
       AND abs(v_inv.total_amount) > v_co.invoice_second_over AND v_co.invoice_second_approver_id <> v_co.invoice_approver_id THEN
      INSERT INTO invoice_approvals (invoice_id, company_id, step, approver_id) VALUES (p_invoice_id, v_inv.company_id, 2, v_co.invoice_second_approver_id);
    END IF;

    UPDATE invoices SET status = 'in_review', submitted_at = now(), decision_note = NULL, updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'in_review' AND p_status IN ('approved', 'rejected') THEN
    SELECT * INTO v_step FROM invoice_approvals WHERE invoice_id = p_invoice_id AND status = 'pending' ORDER BY step LIMIT 1;
    IF v_step.id IS NULL THEN
      IF NOT (is_my_admin() OR has_perm('invoices', 'approve')) THEN RAISE EXCEPTION 'No permission to approve invoices'; END IF;
    ELSIF NOT (is_my_admin() OR v_uid = v_step.approver_id) THEN
      RAISE EXCEPTION 'Only the approver of this invoice can decide on it';
    END IF;
    IF p_status = 'approved' AND v_inv.created_by = v_uid AND NOT is_my_admin() THEN
      RAISE EXCEPTION 'You cannot approve an invoice you entered yourself';
    END IF;
    IF p_status = 'rejected' AND coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'A note is required to reject an invoice'; END IF;
    IF p_status = 'approved' AND v_inv.match_status = 'mismatch' AND coalesce(trim(p_note), '') = '' THEN
      RAISE EXCEPTION 'A note is required to approve an invoice that does not match';
    END IF;

    IF v_step.id IS NOT NULL THEN
      UPDATE invoice_approvals SET status = p_status, decided_by = v_uid, decided_at = now(), decision_note = p_note WHERE id = v_step.id;
    END IF;
    IF p_status = 'approved' THEN
      SELECT COUNT(*) INTO v_pending FROM invoice_approvals WHERE invoice_id = p_invoice_id AND status = 'pending';
      IF v_pending > 0 THEN v_final := false; v_action := 'step_approved'; END IF;
    END IF;
    IF v_final THEN
      UPDATE invoices SET status = p_status, decision_note = p_note, approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = p_invoice_id;
    ELSE
      UPDATE invoices SET updated_at = now() WHERE id = p_invoice_id;
    END IF;

  -- an approval that was a mistake: back to review (before it is paid), all steps wait again
  ELSIF v_inv.status = 'approved' AND p_status = 'in_review' THEN
    IF NOT (is_my_admin() OR v_inv.approved_by = v_uid) THEN
      RAISE EXCEPTION 'Only an admin or the person who approved the invoice can take the approval back';
    END IF;
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'A note is required to take an approval back'; END IF;
    UPDATE invoice_approvals SET status = 'pending', decided_by = NULL, decided_at = NULL, decision_note = NULL WHERE invoice_id = p_invoice_id;
    UPDATE invoices SET status = 'in_review', approved_by = NULL, approved_at = NULL, decision_note = NULL, updated_at = now() WHERE id = p_invoice_id;
    v_action := 'revoked';

  ELSIF v_inv.status = 'approved' AND p_status = 'paid' THEN
    IF NOT (is_my_admin() OR has_perm('invoices', 'pay')) THEN RAISE EXCEPTION 'No permission to mark invoices as paid'; END IF;
    UPDATE invoices SET status = 'paid', paid_at = COALESCE(p_paid_at, CURRENT_DATE), payment_reference = NULLIF(trim(p_payment_ref), ''), updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status IN ('in_review', 'rejected') AND p_status = 'draft' THEN
    IF NOT can_edit_invoices() THEN RAISE EXCEPTION 'No permission to edit invoices'; END IF;
    DELETE FROM invoice_approvals WHERE invoice_id = p_invoice_id;
    UPDATE invoices SET status = 'draft', updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'paid' AND p_status = 'approved' THEN
    IF NOT is_my_admin() THEN RAISE EXCEPTION 'Only an admin can undo a payment'; END IF;
    UPDATE invoices SET status = 'approved', paid_at = NULL, payment_reference = NULL, updated_at = now() WHERE id = p_invoice_id;

  ELSE
    RAISE EXCEPTION 'This status change is not allowed (% -> %)', v_inv.status, p_status;
  END IF;

  INSERT INTO invoice_activity (invoice_id, company_id, actor_id, action, note)
  VALUES (p_invoice_id, v_inv.company_id, v_uid, v_action, p_note);

  RETURN json_build_object('status', CASE WHEN v_final THEN p_status ELSE 'in_review' END);
END;
$$;
GRANT EXECUTE ON FUNCTION set_invoice_status(uuid, text, text, date, text) TO authenticated;

-- ── The stored match follows what the receipts say now (computed on the page, saved here) ──
CREATE OR REPLACE FUNCTION refresh_invoice_match(p_invoice_id uuid, p_status text, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv invoices%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_status NOT IN ('unmatched', 'matched', 'mismatch') THEN RAISE EXCEPTION 'Invalid match status'; END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL OR v_inv.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_inv.status NOT IN ('draft', 'in_review', 'rejected') THEN RETURN; END IF;
  IF NOT (can_edit_invoices() OR is_my_admin() OR EXISTS (SELECT 1 FROM invoice_approvals WHERE invoice_id = p_invoice_id AND approver_id = v_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE invoices SET match_status = p_status, match_notes = p_notes
  WHERE id = p_invoice_id AND (match_status IS DISTINCT FROM p_status OR match_notes IS DISTINCT FROM p_notes);
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_invoice_match(uuid, text, text) TO authenticated;

-- ── Budget use: ordered (open), invoiced (approved invoices), paid, requested ──
-- Per order line:  an open order counts what is still not invoiced; a closed one what was received and not invoiced yet;
-- invoices count in full, so an invoice above its order adds the difference. Invoices are without VAT, like the orders.
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
      AND extract(year FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
      AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  )
  -- the part of the orders that is not invoiced yet
  SELECT 'ordered'::text, department_id, cat_id, mon,
         SUM(GREATEST(0, CASE WHEN status = 'closed' THEN received_amt ELSE ordered_amt END - invoiced_amt - paid_amt))
  FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  SELECT 'invoiced'::text, department_id, cat_id, mon, SUM(invoiced_amt) FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  SELECT 'paid'::text, department_id, cat_id, mon, SUM(paid_amt) FROM pol GROUP BY department_id, cat_id, mon
  UNION ALL
  -- lines of an invoice of an order that are not tied to an order line (they do not shrink the order)
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, po.department_id, COALESCE(c.parent_id, c.id),
         extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))::integer, SUM(il.line_total)
  FROM invoices i
  JOIN purchase_orders po ON po.id = i.po_id
  JOIN invoice_line_items il ON il.invoice_id = i.id AND il.po_line_id IS NULL
  LEFT JOIN categories c ON c.id = il.category_id
  WHERE i.company_id = get_my_company_id() AND i.status IN ('approved', 'paid')
    AND po.status IN ('issued', 'sent', 'closed') AND po.department_id IS NOT NULL
    AND extract(year FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_po IS NULL OR po.id <> p_exclude_po)
  GROUP BY 1, po.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (po.created_at AT TIME ZONE 'Europe/Ljubljana'))
  UNION ALL
  -- invoices without an order count on their own (department and category from the invoice), in the month of the invoice
  SELECT CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'invoiced' END, i.department_id, COALESCE(c.parent_id, c.id),
         extract(month FROM i.invoice_date)::integer, SUM(il.line_total)
  FROM invoices i
  JOIN invoice_line_items il ON il.invoice_id = i.id
  LEFT JOIN categories c ON c.id = il.category_id
  WHERE i.company_id = get_my_company_id() AND i.po_id IS NULL AND i.status IN ('approved', 'paid')
    AND i.department_id IS NOT NULL AND extract(year FROM i.invoice_date) = p_year
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
    AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = p_year
    AND (p_exclude_request IS NULL OR r.id <> p_exclude_request)
  GROUP BY r.department_id, COALESCE(c.parent_id, c.id), extract(month FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana'));
$$;
GRANT EXECUTE ON FUNCTION budget_usage(integer, uuid, uuid) TO authenticated;
