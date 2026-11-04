-- ============================================================
-- 20260907000000_invoice_approvers.sql
-- Invoices get named approvers, like requests:
--   Settings: one invoice approver and, over an amount, a second one
--   invoice_approvals: one row per step (step 1, and step 2 above the amount)
--   only the approver of the current step (or an admin) decides; nobody approves
--   an invoice they entered themselves (an admin may)
-- Invoices that were already in review before this keep working with the permission only.
-- ============================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_approver_id uuid REFERENCES users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_second_approver_id uuid REFERENCES users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_second_over numeric(12,2);

CREATE TABLE IF NOT EXISTS invoice_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  step          integer NOT NULL,
  approver_id   uuid NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (invoice_id, step)
);
CREATE INDEX IF NOT EXISTS idx_invoice_approvals_approver ON invoice_approvals (approver_id, status);

ALTER TABLE invoice_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_approvals_select ON invoice_approvals;
CREATE POLICY invoice_approvals_select ON invoice_approvals FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND (can_see_invoices() OR approver_id = auth.uid()));
-- no insert / update / delete policy: the steps are written by set_invoice_status() only

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
    IF v_lines = 0 OR v_inv.total_amount <= 0 THEN RAISE EXCEPTION 'An invoice needs at least one line with an amount'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoice_attachments WHERE invoice_id = p_invoice_id) THEN
      RAISE EXCEPTION 'The supplier invoice (document) must be attached before it is sent to review';
    END IF;

    SELECT * INTO v_co FROM companies WHERE id = v_inv.company_id;
    IF v_co.invoice_approver_id IS NULL THEN RAISE EXCEPTION 'No invoice approver set. Choose one in Settings.'; END IF;
    DELETE FROM invoice_approvals WHERE invoice_id = p_invoice_id;
    INSERT INTO invoice_approvals (invoice_id, company_id, step, approver_id) VALUES (p_invoice_id, v_inv.company_id, 1, v_co.invoice_approver_id);
    IF v_co.invoice_second_approver_id IS NOT NULL AND v_co.invoice_second_over IS NOT NULL
       AND v_inv.total_amount > v_co.invoice_second_over AND v_co.invoice_second_approver_id <> v_co.invoice_approver_id THEN
      INSERT INTO invoice_approvals (invoice_id, company_id, step, approver_id) VALUES (p_invoice_id, v_inv.company_id, 2, v_co.invoice_second_approver_id);
    END IF;

    UPDATE invoices SET status = 'in_review', submitted_at = now(), decision_note = NULL, updated_at = now() WHERE id = p_invoice_id;

  ELSIF v_inv.status = 'in_review' AND p_status IN ('approved', 'rejected') THEN
    SELECT * INTO v_step FROM invoice_approvals WHERE invoice_id = p_invoice_id AND status = 'pending' ORDER BY step LIMIT 1;
    IF v_step.id IS NULL THEN
      -- sent to review before approvers existed: the permission decides
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
      IF v_pending > 0 THEN v_final := false; v_action := 'step_approved'; END IF;   -- the second step is still to come
    END IF;
    IF v_final THEN
      UPDATE invoices SET status = p_status, decision_note = p_note, approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = p_invoice_id;
    ELSE
      UPDATE invoices SET updated_at = now() WHERE id = p_invoice_id;
    END IF;

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
