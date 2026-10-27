-- Contract management: framework agreements with suppliers.
--  contracts            the agreement (supplier, validity, renewal/notice, value, owner)
--  contract_items       agreed prices per catalog item (the contract's price list)
--  contract_attachments signed documents (stored in the existing `quotations` bucket)
--  purchase_orders.contract_id   optional link, so spend can be tracked against a contract
-- Everyone in the company can read contracts; creating/editing needs admin or the
-- "purchase_orders: create" permission.

CREATE TABLE IF NOT EXISTS contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_number text NOT NULL DEFAULT '',
  title           text NOT NULL,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'terminated')),
  start_date      date NOT NULL,
  end_date        date,                       -- NULL = open-ended
  auto_renew      boolean NOT NULL DEFAULT false,
  renewal_months  integer,                    -- length of each automatic renewal
  notice_days     integer,                    -- days before the end by which it must be cancelled / renegotiated
  total_value     numeric(12,2),              -- agreed ceiling / expected value over the term
  payment_terms   text,
  owner_id        uuid REFERENCES users(id),  -- who manages the contract
  description     text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (company_id, contract_number)
);
CREATE INDEX IF NOT EXISTS idx_contracts_company  ON contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_contracts_end      ON contracts(company_id, end_date);

-- Number per company: POG-0001, POG-0002 ... (serialised per company)
CREATE OR REPLACE FUNCTION contracts_set_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.contract_number IS NOT NULL AND NEW.contract_number <> '' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('contracts:' || NEW.company_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(contract_number, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_next FROM contracts WHERE company_id = NEW.company_id;
  NEW.contract_number := 'POG-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_contracts_set_number ON contracts;
CREATE TRIGGER trg_contracts_set_number BEFORE INSERT ON contracts FOR EACH ROW EXECUTE FUNCTION contracts_set_number();

CREATE TABLE IF NOT EXISTS contract_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES items(id),
  agreed_price numeric(12,2) NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (contract_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_items_contract ON contract_items(contract_id);

CREATE TABLE IF NOT EXISTS contract_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_size    bigint,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract ON contract_attachments(contract_id);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id);
CREATE INDEX IF NOT EXISTS idx_po_contract ON purchase_orders(contract_id);

-- ── RLS ──
ALTER TABLE contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_attachments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contracts', 'contract_items', 'contract_attachments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id = (SELECT get_my_company_id()))', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    EXECUTE format($f$CREATE POLICY %I ON %I FOR ALL TO authenticated
      USING (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('purchase_orders', 'create')))
      WITH CHECK (company_id = (SELECT get_my_company_id()) AND (is_my_admin() OR has_perm('purchase_orders', 'create')))$f$, t || '_write', t);
  END LOOP;
END $$;

-- Contract documents are usually PDF or Word; allow those in the shared bucket (and a bit more room).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    file_size_limit = 20971520
WHERE id = 'quotations';
