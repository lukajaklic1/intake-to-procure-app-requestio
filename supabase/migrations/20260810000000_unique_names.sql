-- Duplicates can no longer be created, from the forms, Excel import or any other client:
-- a name is unique within the company, ignoring upper/lower case. Subcategories are
-- unique within their category, and the same name may exist under different categories.

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_company_name ON departments (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_company_name   ON locations   (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_company_name   ON suppliers   (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_company_name       ON items       (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_company_parent_name
  ON categories (company_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
