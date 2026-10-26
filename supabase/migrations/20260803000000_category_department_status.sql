-- Categories and departments never had an active/inactive lifecycle like
-- suppliers/projects/locations/items, so an in-use one couldn't be retired —
-- only deleted (and deletion is already blocked while it's referenced).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
ALTER TABLE departments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
