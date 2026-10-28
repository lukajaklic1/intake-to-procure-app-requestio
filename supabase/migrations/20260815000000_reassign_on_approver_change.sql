-- When the company's approver (or second approver) changes in Settings, requests that are still
-- waiting on the old person move to the new one. Decided approvals are left untouched.
CREATE OR REPLACE FUNCTION reassign_pending_on_company_approver_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approver_id IS NOT NULL AND NEW.approver_id IS DISTINCT FROM OLD.approver_id THEN
    UPDATE approvals a
    SET approver_id = NEW.approver_id
    FROM requests r
    WHERE a.request_id = r.id
      AND r.company_id = NEW.id
      AND r.status = 'pending'
      AND a.status = 'pending'
      AND a.step = 1
      AND a.approver_id IS NOT DISTINCT FROM OLD.approver_id;
  END IF;

  IF NEW.second_approver_id IS NOT NULL AND NEW.second_approver_id IS DISTINCT FROM OLD.second_approver_id THEN
    UPDATE approvals a
    SET approver_id = NEW.second_approver_id
    FROM requests r
    WHERE a.request_id = r.id
      AND r.company_id = NEW.id
      AND r.status = 'pending'
      AND a.status = 'pending'
      AND a.step = 2
      AND a.approver_id IS NOT DISTINCT FROM OLD.second_approver_id;
  END IF;

  -- keep requests.approver_id in sync with whoever the open approval now belongs to
  UPDATE requests r
  SET approver_id = a.approver_id, updated_at = now()
  FROM approvals a
  WHERE a.request_id = r.id
    AND r.company_id = NEW.id
    AND r.status = 'pending'
    AND a.status = 'pending'
    AND r.approver_id IS DISTINCT FROM a.approver_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reassign_on_company_approver_change ON companies;
CREATE TRIGGER trg_reassign_on_company_approver_change
AFTER UPDATE OF approver_id, second_approver_id ON companies
FOR EACH ROW EXECUTE FUNCTION reassign_pending_on_company_approver_change();
