-- Sourcing (povpraševanja): a buyer runs an RFQ / RFP / RFI with several suppliers and keeps everything in one place.
--   sourcing_events        the procedure: title, type, status, deadline, rounds, award, savings
--   sourcing_items         what is asked for (lines, optionally from the catalog, with a target price)
--   sourcing_invitations   which suppliers it is sent to, and what became of each
--   sourcing_bids          the offer of a supplier in a round (entered by the buyer) + sourcing_bid_lines (price per item)
--   sourcing_criteria      evaluation criteria with weights (price and delivery are calculated, the rest is scored by hand)
--   sourcing_scores        a score 0-10 of an evaluator for a criterion and a supplier
--   sourcing_attachments   documents of the event (and offers received from a supplier)
--   sourcing_activity      audit trail
-- Permissions follow orders: whoever may view orders sees sourcing, whoever may create orders edits it.
-- The winner can be turned into a purchase order (purchase_orders.sourcing_event_id keeps the link).

CREATE TABLE IF NOT EXISTS sourcing_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_number          text NOT NULL DEFAULT '',
  title                 text NOT NULL,
  event_type            text NOT NULL DEFAULT 'rfq' CHECK (event_type IN ('rfq', 'rfp', 'rfi')),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'evaluation', 'awarded', 'cancelled')),
  description           text,
  department_id         uuid REFERENCES departments(id),
  location_id           uuid REFERENCES locations(id),
  category_id           uuid REFERENCES categories(id),
  request_id            uuid REFERENCES requests(id),
  deadline              date,
  sent_at               timestamptz,
  current_round         integer NOT NULL DEFAULT 1,
  baseline_amount       numeric(12,2),                 -- starting value for the savings, typed by the buyer (otherwise the average offer)
  awarded_invitation_id uuid,
  awarded_at            timestamptz,
  awarded_by            uuid REFERENCES users(id),
  award_note            text,
  awarded_total         numeric(12,2),
  baseline_total        numeric(12,2),                 -- the baseline that was used when the event was awarded
  notes                 text,
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_number)
);
CREATE INDEX IF NOT EXISTS idx_sourcing_events_company ON sourcing_events (company_id, status);

-- RFQ-260001 / RFP-260001 / RFI-260001: the type, two digits of the year and a four-digit counter that starts again every year
CREATE OR REPLACE FUNCTION sourcing_events_set_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_yy text := to_char(now() AT TIME ZONE 'Europe/Ljubljana', 'YY');
  v_next integer;
BEGIN
  IF NEW.event_number IS NOT NULL AND NEW.event_number <> '' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('sourcing:' || NEW.company_id::text));
  SELECT COALESCE(MAX((substring(event_number FROM ('^[A-Z]{3}-' || v_yy || '(\d{4})$')))::integer), 0) + 1
    INTO v_next FROM sourcing_events WHERE company_id = NEW.company_id;
  NEW.event_number := upper(NEW.event_type) || '-' || v_yy || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sourcing_events_set_number ON sourcing_events;
CREATE TRIGGER trg_sourcing_events_set_number BEFORE INSERT ON sourcing_events FOR EACH ROW EXECUTE FUNCTION sourcing_events_set_number();

CREATE TABLE IF NOT EXISTS sourcing_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position     integer NOT NULL DEFAULT 10,
  item_id      uuid REFERENCES items(id),
  name         text NOT NULL,
  description  text,
  quantity     numeric(12,3) NOT NULL DEFAULT 1,
  unit         text,
  target_price numeric(12,2),
  category_id  uuid REFERENCES categories(id)
);
CREATE INDEX IF NOT EXISTS idx_sourcing_items_event ON sourcing_items (event_id);

CREATE TABLE IF NOT EXISTS sourcing_invitations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id    uuid NOT NULL REFERENCES suppliers(id),
  contact_email  text,
  sent_at        timestamptz,
  status         text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'responded', 'declined')),
  responded_at   timestamptz,
  decline_reason text,
  notes          text,
  UNIQUE (event_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_sourcing_invitations_event ON sourcing_invitations (event_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sourcing_events_awarded_invitation_fk') THEN
    ALTER TABLE sourcing_events ADD CONSTRAINT sourcing_events_awarded_invitation_fk
      FOREIGN KEY (awarded_invitation_id) REFERENCES sourcing_invitations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sourcing_bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL REFERENCES sourcing_invitations(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  round         integer NOT NULL DEFAULT 1,
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,
  complete      boolean NOT NULL DEFAULT true,         -- a price for every item
  delivery_days integer,
  payment_terms text,
  valid_until   date,
  notes         text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users(id),
  UNIQUE (invitation_id, round)
);
CREATE INDEX IF NOT EXISTS idx_sourcing_bids_event ON sourcing_bids (event_id);

CREATE TABLE IF NOT EXISTS sourcing_bid_lines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id     uuid NOT NULL REFERENCES sourcing_bids(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES sourcing_items(id) ON DELETE CASCADE,
  unit_price numeric(12,2),
  UNIQUE (bid_id, item_id)
);

CREATE TABLE IF NOT EXISTS sourcing_criteria (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position   integer NOT NULL DEFAULT 10,
  name       text NOT NULL,
  weight     numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
  kind       text NOT NULL DEFAULT 'manual' CHECK (kind IN ('price', 'delivery', 'manual'))
);
CREATE INDEX IF NOT EXISTS idx_sourcing_criteria_event ON sourcing_criteria (event_id);

CREATE TABLE IF NOT EXISTS sourcing_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  criterion_id  uuid NOT NULL REFERENCES sourcing_criteria(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL REFERENCES sourcing_invitations(id) ON DELETE CASCADE,
  evaluator_id  uuid NOT NULL REFERENCES users(id),
  score         numeric(4,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  UNIQUE (criterion_id, invitation_id, evaluator_id)
);

CREATE TABLE IF NOT EXISTS sourcing_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES sourcing_invitations(id) ON DELETE CASCADE,   -- set when it is a document of one supplier (their offer)
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path     text NOT NULL,
  file_name     text NOT NULL,
  file_size     bigint,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sourcing_attachments_event ON sourcing_attachments (event_id);

CREATE TABLE IF NOT EXISTS sourcing_activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES sourcing_events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES users(id),
  action     text NOT NULL,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sourcing_activity_event ON sourcing_activity (event_id);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sourcing_event_id uuid REFERENCES sourcing_events(id);
CREATE INDEX IF NOT EXISTS idx_po_sourcing_event ON purchase_orders (sourcing_event_id);

-- ── RLS ──
CREATE OR REPLACE FUNCTION can_see_sourcing() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('purchase_orders', 'view') OR has_perm('purchase_orders', 'create');
$$;
CREATE OR REPLACE FUNCTION can_edit_sourcing() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_my_admin() OR has_perm('purchase_orders', 'create');
$$;
GRANT EXECUTE ON FUNCTION can_see_sourcing() TO authenticated;
GRANT EXECUTE ON FUNCTION can_edit_sourcing() TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sourcing_events', 'sourcing_items', 'sourcing_invitations', 'sourcing_bids', 'sourcing_bid_lines',
                           'sourcing_criteria', 'sourcing_attachments', 'sourcing_activity'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id = (SELECT get_my_company_id()) AND can_see_sourcing())', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_write', t);
    IF t = 'sourcing_events' THEN
      -- only a draft can be deleted; everything else is cancelled
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
      EXECUTE format($f$CREATE POLICY %I ON %I FOR INSERT TO authenticated
        WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing())$f$, t || '_insert', t);
      EXECUTE format($f$CREATE POLICY %I ON %I FOR UPDATE TO authenticated
        USING (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing())
        WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing())$f$, t || '_update', t);
      EXECUTE format($f$CREATE POLICY %I ON %I FOR DELETE TO authenticated
        USING (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing() AND status = 'draft')$f$, t || '_delete', t);
    ELSE
      EXECUTE format($f$CREATE POLICY %I ON %I FOR ALL TO authenticated
        USING (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing())
        WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_edit_sourcing())$f$, t || '_write', t);
    END IF;
  END LOOP;
END $$;

-- scores: anyone who sees the event may score, but only in their own name
ALTER TABLE sourcing_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sourcing_scores_select ON sourcing_scores;
CREATE POLICY sourcing_scores_select ON sourcing_scores FOR SELECT TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_sourcing());
DROP POLICY IF EXISTS sourcing_scores_write ON sourcing_scores;
CREATE POLICY sourcing_scores_write ON sourcing_scores FOR ALL TO authenticated
  USING (company_id = (SELECT get_my_company_id()) AND can_see_sourcing() AND evaluator_id = auth.uid())
  WITH CHECK (company_id = (SELECT get_my_company_id()) AND can_see_sourcing() AND evaluator_id = auth.uid());
