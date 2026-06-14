-- ============================================================
-- 20260614010000_reassign_on_manager_change.sql
-- When a project's manager changes, reassign in-flight requests
-- that are still waiting on the manager (step 1) to the new manager.
-- ============================================================

CREATE OR REPLACE FUNCTION reassign_pending_on_manager_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id AND NEW.manager_id IS NOT NULL THEN
    -- Step-1 (manager) pending approvals → new manager
    UPDATE approvals a
    SET approver_id = NEW.manager_id
    FROM requests r
    WHERE a.request_id = r.id
      AND r.project_id = NEW.id
      AND r.status = 'pending'
      AND a.status = 'pending'
      AND a.step = 1
      AND a.approver_id = OLD.manager_id;

    -- Mirror the current approver on the request row
    UPDATE requests r
    SET approver_id = NEW.manager_id, updated_at = now()
    WHERE r.project_id = NEW.id
      AND r.status = 'pending'
      AND r.approver_id = OLD.manager_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reassign_on_manager_change ON projects;
CREATE TRIGGER trg_reassign_on_manager_change
AFTER UPDATE OF manager_id ON projects
FOR EACH ROW EXECUTE FUNCTION reassign_pending_on_manager_change();
