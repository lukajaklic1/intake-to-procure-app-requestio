-- Nuclear reset of all companies + users RLS policies.
-- Run this to guarantee a clean state.

-- 1. Temporarily disable RLS to clear everything safely
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 2. Drop every policy that could exist on these two tables
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE tablename IN ('companies', 'users')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 3. Re-enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Create the security definer helper (avoids recursion)
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM users WHERE id = auth.uid()
$$;

-- 5. companies policies
CREATE POLICY "companies_insert"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "companies_select"
  ON companies FOR SELECT TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "companies_update"
  ON companies FOR UPDATE TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "companies_delete"
  ON companies FOR DELETE TO authenticated
  USING (id = get_my_company_id());

-- 6. users policies
CREATE POLICY "users_insert"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_select"
  ON users FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "users_update"
  ON users FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "users_delete"
  ON users FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());
