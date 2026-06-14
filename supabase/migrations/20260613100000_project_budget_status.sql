-- ============================================================
-- 20260613100000_project_budget_status.sql
-- Budget consumption for a project: budget vs ordered (POs) /
-- approved (requests) / pending (requests in approval).
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_budget_status(p_project_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company  uuid;
  v_budget   numeric;
  v_ordered  numeric;
  v_approved numeric;
  v_pending  numeric;
BEGIN
  SELECT company_id, budget_amount INTO v_company, v_budget
  FROM projects WHERE id = p_project_id;

  IF v_company IS NULL OR v_company <> get_my_company_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT coalesce(sum(total_amount), 0) INTO v_ordered
  FROM purchase_orders
  WHERE project_id = p_project_id AND status <> 'cancelled';

  SELECT coalesce(sum(total_estimate), 0) INTO v_approved
  FROM requests
  WHERE project_id = p_project_id AND status = 'approved';

  SELECT coalesce(sum(total_estimate), 0) INTO v_pending
  FROM requests
  WHERE project_id = p_project_id AND status = 'pending';

  RETURN json_build_object(
    'budget',   v_budget,
    'ordered',  v_ordered,
    'approved', v_approved,
    'pending',  v_pending
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_project_budget_status(uuid) TO authenticated;
