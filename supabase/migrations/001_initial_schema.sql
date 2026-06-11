-- ============================================================
-- 001_initial_schema.sql
-- Full schema for the Procurement App
-- ============================================================

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  po_prefix text NOT NULL DEFAULT 'PO',
  po_next_number integer NOT NULL DEFAULT 1,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  email text,
  phone text,
  tax_id text,
  logo_url text,
  bank_name text,
  bank_iban text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  vat_number text,
  contact_name text,
  email text,
  phone text,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  payment_terms text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  project_code text,
  customer text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  address_street text,
  address_city text,
  address_postal_code text,
  address_country text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  item_number text NOT NULL,
  name text NOT NULL,
  long_description text,
  category_id uuid REFERENCES categories(id),
  default_unit text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES users(id),
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent','closed','cancelled')),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  department_id uuid REFERENCES departments(id),
  payment_terms text NOT NULL,
  expected_delivery_date date NOT NULL,
  incoterm text,
  supplier_quote_ref text,
  notes text,
  delivery_notes text,
  total_amount decimal(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE po_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id),
  position integer NOT NULL DEFAULT 10,
  name text NOT NULL,
  long_description text,
  quantity decimal(12,3) NOT NULL,
  unit text NOT NULL,
  unit_price decimal(12,2) NOT NULL,
  line_total decimal(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies — all scoped to the authenticated user's company
-- ============================================================

CREATE POLICY "Users see own company"
  ON companies FOR ALL
  USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own company users"
  ON users FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own suppliers"
  ON suppliers FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own categories"
  ON categories FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own projects"
  ON projects FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own locations"
  ON locations FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own departments"
  ON departments FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own items"
  ON items FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own POs"
  ON purchase_orders FOR ALL
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users see own PO lines"
  ON po_line_items FOR ALL
  USING (po_id IN (
    SELECT id FROM purchase_orders
    WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  ));
