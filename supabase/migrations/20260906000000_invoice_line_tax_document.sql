-- ============================================================
-- 20260906000000_invoice_line_tax_document.sql
-- Invoices: VAT rate per line (an invoice often mixes 22 % and 9,5 %), and a document
-- is required before an invoice goes to review.
-- ============================================================

ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2);
-- existing lines get the rate of their invoice
UPDATE invoice_line_items l SET tax_rate = i.tax_rate FROM invoices i WHERE i.id = l.invoice_id AND l.tax_rate IS NULL;
ALTER TABLE invoice_line_items ALTER COLUMN tax_rate SET DEFAULT 22;
UPDATE invoice_line_items SET tax_rate = 22 WHERE tax_rate IS NULL;
ALTER TABLE invoice_line_items ALTER COLUMN tax_rate SET NOT NULL;

-- the status function again, with the document check on submit
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
    IF NOT EXISTS (SELECT 1 FROM invoice_attachments WHERE invoice_id = p_invoice_id) THEN
      RAISE EXCEPTION 'The supplier invoice (document) must be attached before it is sent to review';
    END IF;
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
