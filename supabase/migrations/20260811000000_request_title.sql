-- Short title / purpose of a request ("Weekly meat delivery"), shown in lists and approvals.
ALTER TABLE requests ADD COLUMN IF NOT EXISTS title text;

-- Content columns of requests are updated through column-level grants (security hardening),
-- so the new column has to be added to them.
GRANT UPDATE (title) ON requests TO authenticated;
