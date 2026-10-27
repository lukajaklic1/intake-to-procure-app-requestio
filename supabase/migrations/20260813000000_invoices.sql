-- Invoices (računi): enter / upload a supplier invoice, match it against the purchase
-- order and the goods receipts (2-way / 3-way match), approve it and mark it paid.
--   invoices                 header, totals, status, match result, payment
--   invoice_line_items       lines, optionally linked to a PO line
--   invoice_attachments      the supplier's PDF (stored in the `quotations` bucket)
--   invoice_activity         audit trail
-- Permissions use the existing "invoices" module: view / create / approve / pay.
-- Status changes go through set_invoice_status() only.

CREATE TABLE IF NOT EXISTS invoices (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number          text NOT NULL DEFAULT '',               -- internal number, INV-0001
  supplier_invoice_number text NOT NULL,                          -- number printed on the supplier's invoice
  supplier_id             uuid NOT NULL REFERENCES suppliers(id),
  po_id                   uuid REFERENCES purchase_orders(id),
  invoice_date            date NOT NULL,
  due_date                date,
  tax_rate                numeric(5,2) NOT NULL DEFAULT 22,
  subtotal                numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount              numeric(12,2) NOT NULL DEFAULT 0,
  total_amount            numeric(12,2) NOT NULL DEFAULT 0,
  document_total          numeric(12,2),                          -- total printed on the invoice (control total)
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'paid')),
  match_status            text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'mismatch')),
  match_notes             text,
  decision_note           text,
  submitted_at            timestamptz,
  approved_by             uuid REFERENCES users(id),
  approved_at             timestamptz,
  paid_at                 date,
  payment_reference       text,
  notes                   text,
  created_by              uuid REFERENCES users(id),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);
-- The same supplier invoice cannot be entered twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_supplier_number ON invoices (company_id, supplier_id, lower(supplier_invoice_number));
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_po      ON invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due     ON invoices(company_id, due_date);

CREATE OR REPLACE FUNCTION invoices_set_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('invoices:' || NEW.company_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_next FROM invoices WHERE company_id = NEW.company_id;
  NEW.invoice_number := 'RAC-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invoices_set_number ON invoices;
CREATE TRIGGER trg_invoices_set_number BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION invoices_set_number();

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_line_id  uuid REFERENCES po_line_items(id) ON DELETE SET NULL,
  position    integer NOT NULL DEFAULT 10,
  name        text NOT NULL,
  quantity    numeric(12,3) NOT NULL DEFAULT 1,
  unit        text,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  line_total  numeric(12,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_poline  ON invoice_line_items(po_line_id);

CREATE TABLE IF NOT EXISTS invoice_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  file_size   bigint,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice ON invoice_attachments(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  note        text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_invoice ON invoice_activity(invoice_id);

-- ── RLS ──
ALTER TABLE invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_activity    ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_see_invoices() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('invoices', 'view') OR has_perm('invoices', 'create')
         OR has_perm('invoices', 'approve') OR has_perm('invoices', 'pay');
$$;
CREATE OR REPLACE FUNCTION can_edit_invoices() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('invoices', 'create');
$$;
GRANT EXECUTE ON FUNCTION can_see_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_invoices() TO authenticated;

DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_invoices());
DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_invoices() AND status = 'draft' AND created_by = auth.uid());
DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices FOR UPDATE TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_edit_invoices() AND status IN ('draft', 'rejected'))
  WITH CHECK (company_id = (SELECT get_my_company_id()));
DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices FOR DELETE TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_edit_invoices() AND status = 'draft');

-- Content columns only; status / approval / payment fields change through set_invoice_status().
REVOKE UPDATE ON invoices FROM authenticated;
GRANT UPDATE (supplier_invoice_number, supplier_id, po_id, invoice_date, due_date, tax_rate, subtotal, tax_amount,
              total_amount, document_total, match_status, match_notes, notes, updated_at) ON invoices TO authenticated;

DROP POLICY IF EXISTS invoice_lines_select ON invoice_line_items;
CREATE POLICY invoice_lines_select ON invoice_line_items FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_invoices());
DROP POLICY IF EXISTS invoice_lines_write ON invoice_line_items;
CREATE POLICY invoice_lines_write ON invoice_line_items FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_edit_invoices()
         AND invoice_id IN (SELECT id FROM invoices WHERE status IN ('draft', 'rejected')))
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_invoices()
         AND invoice_id IN (SELECT id FROM invoices WHERE status IN ('draft', 'rejected')));

DROP POLICY IF EXISTS invoice_attachments_select ON invoice_attachments;
CREATE POLICY invoice_attachments_select ON invoice_attachments FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_invoices());
DROP POLICY IF EXISTS invoice_attachments_write ON invoice_attachments;
CREATE POLICY invoice_attachments_write ON invoice_attachments FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_edit_invoices())
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_invoices());

DROP POLICY IF EXISTS invoice_activity_select ON invoice_activity;
CREATE POLICY invoice_activity_select ON invoice_activity FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_invoices());
-- activity rows are written by set_invoice_status() and the client (append-only)
DROP POLICY IF EXISTS invoice_activity_insert ON invoice_activity;
CREATE POLICY invoice_activity_insert ON invoice_activity FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND actor_id = auth.uid() AND can_see_invoices());

-- ── Status changes ──
-- draft/rejected -> in_review (submit) | in_review -> approved / rejected (approve perm) |
-- approved -> paid (pay perm) | in_review/rejected -> draft (recall / reopen) | paid -> approved (admin undo)
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
  v_uid  uuid := auth.uid();
  v_inv  invoices%ROWTYPE;
  v_lines integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF v_inv.status IN ('draft', 'rejected') AND p_status = 'in_review' THEN
    IF NOT can_edit_invoices() THEN RAISE EXCEPTION 'No permission to submit invoices'; END IF;
    SELECT COUNT(*) INTO v_lines FROM invoice_line_items WHERE invoice_id = p_invoice_id;
    IF v_lines = 0 OR v_inv.total_amount <= 0 THEN RAISE EXCEPTION 'An invoice needs at least one line with an amount'; END IF;
    UPDATE invoices SET status = 'in_review', submitted_at = now(), decision_note = NULL, updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'in_review' AND p_status IN ('approved', 'rejected') THEN
    IF NOT (is_my_admin() OR has_perm('invoices', 'approve')) THEN RAISE EXCEPTION 'No permission to approve invoices'; END IF;
    IF p_status = 'rejected' AND coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'A note is required to reject an invoice'; END IF;
    IF p_status = 'approved' AND v_inv.match_status = 'mismatch' AND coalesce(trim(p_note), '') = '' THEN
      RAISE EXCEPTION 'A note is required to approve an invoice that does not match';
    END IF;
    UPDATE invoices SET status = p_status, decision_note = p_note, approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'approved' AND p_status = 'paid' THEN
    IF NOT (is_my_admin() OR has_perm('invoices', 'pay')) THEN RAISE EXCEPTION 'No permission to mark invoices as paid'; END IF;
    UPDATE invoices SET status = 'paid', paid_at = COALESCE(p_paid_at, CURRENT_DATE), payment_reference = NULLIF(trim(p_payment_ref), ''), updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status IN ('in_review', 'rejected') AND p_status = 'draft' THEN
    IF NOT can_edit_invoices() THEN RAISE EXCEPTION 'No permission to edit invoices'; END IF;
    UPDATE invoices SET status = 'draft', updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'paid' AND p_status = 'approved' THEN
    IF NOT is_my_admin() THEN RAISE EXCEPTION 'Only an admin can undo a payment'; END IF;
    UPDATE invoices SET status = 'approved', paid_at = NULL, payment_reference = NULL, updated_at = now() WHERE id = p_invoice_id;

  ELSE
    RAISE EXCEPTION 'This status change is not allowed (% -> %)', v_inv.status, p_status;
  END IF;

  INSERT INTO invoice_activity (invoice_id, company_id, actor_id, action, note)
  VALUES (p_invoice_id, v_inv.company_id, v_uid, p_status, p_note);

  RETURN json_build_object('status', p_status);
END;
$$;
GRANT EXECUTE ON FUNCTION set_invoice_status(uuid, text, text, date, text) TO authenticated;
