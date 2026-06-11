-- Fix RLS policies that block onboarding inserts.
--
-- The original FOR ALL policies use a subquery into `users` to scope by
-- company_id. During onboarding neither the company nor the user profile
-- row exists yet, so that subquery returns NULL and every INSERT is
-- silently blocked.
--
-- Solution: drop the FOR ALL policies and replace them with explicit
-- per-operation policies so INSERT paths can use looser rules.

-- ── companies ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users see own company" ON companies;

-- Any authenticated user may create a company (first-time onboarding).
CREATE POLICY "companies: authenticated can insert"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Read/update/delete only the company the user belongs to.
CREATE POLICY "companies: select own"
  ON companies FOR SELECT
  TO authenticated
  USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "companies: update own"
  ON companies FOR UPDATE
  TO authenticated
  USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "companies: delete own"
  ON companies FOR DELETE
  TO authenticated
  USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

-- ── users ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users see own company users" ON users;

-- A user may insert only their own profile row (id must match auth.uid()).
CREATE POLICY "users: insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Read/update/delete rows that share the same company_id.
CREATE POLICY "users: select own company"
  ON users FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "users: update own company"
  ON users FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "users: delete own company"
  ON users FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));
