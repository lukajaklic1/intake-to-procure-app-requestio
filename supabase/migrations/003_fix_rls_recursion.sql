-- Fix infinite recursion in RLS policies.
--
-- The companies INSERT policy was checking a subquery on `users`,
-- which itself triggered the users RLS policy, causing infinite recursion.
-- Solution: use auth.uid() directly and avoid cross-table subqueries on INSERT.

-- ── Drop all existing policies ────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users see own company" ON companies;
DROP POLICY IF EXISTS "companies: authenticated can insert" ON companies;
DROP POLICY IF EXISTS "companies: select own" ON companies;
DROP POLICY IF EXISTS "companies: update own" ON companies;
DROP POLICY IF EXISTS "companies: delete own" ON companies;

DROP POLICY IF EXISTS "Users see own company users" ON users;
DROP POLICY IF EXISTS "users: insert own profile" ON users;
DROP POLICY IF EXISTS "users: select own company" ON users;
DROP POLICY IF EXISTS "users: update own company" ON users;
DROP POLICY IF EXISTS "users: delete own company" ON users;

-- ── companies ─────────────────────────────────────────────────────────────────

-- Any authenticated user can insert a company (first-time onboarding).
CREATE POLICY "companies_insert"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- For SELECT/UPDATE/DELETE use a security definer function to avoid recursion.
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM users WHERE id = auth.uid()
$$;

CREATE POLICY "companies_select"
  ON companies FOR SELECT
  TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "companies_update"
  ON companies FOR UPDATE
  TO authenticated
  USING (id = get_my_company_id());

CREATE POLICY "companies_delete"
  ON companies FOR DELETE
  TO authenticated
  USING (id = get_my_company_id());

-- ── users ─────────────────────────────────────────────────────────────────────

-- Can only insert your own profile row.
CREATE POLICY "users_insert"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Use the security definer function to avoid recursive self-join.
CREATE POLICY "users_select"
  ON users FOR SELECT
  TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "users_update"
  ON users FOR UPDATE
  TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "users_delete"
  ON users FOR DELETE
  TO authenticated
  USING (company_id = get_my_company_id());
