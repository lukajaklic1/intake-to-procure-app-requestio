-- Demo data: 10 requests with lines taken from the existing catalog.
-- NOT a migration (lives outside supabase/migrations, `db push` ignores it).
-- Run it in the Supabase SQL Editor. It only INSERTS, nothing is deleted or changed.
-- Each request draws its lines from one top-level category, so the list clearly shows what was bought.
DO $$
DECLARE
  v_company   uuid;
  v_user      uuid;
  v_approver  uuid;
  v_tops      uuid[];
  v_top_names text[];
  v_locs      uuid[];
  v_depts     uuid[];
  v_sups      uuid[];
  v_statuses  text[] := ARRAY['approved','pending','approved','draft','pending','approved','rejected','approved','pending','draft'];
  v_purposes  text[] := ARRAY['Tedenska dobava','Mesečna zaloga','Nujno dopolnilo','Sezonska priprava','Dopolnitev zaloge',
                              'Redna nabava','Menjava dotrajanega','Priprava na vikend','Obnova zaloge','Predlog za naslednji mesec'];
  v_notes     text[] := ARRAY['Dostava do 10. ure.','Prosim za potrditev do petka.','Nujno – zaloga skoraj pri koncu.',NULL,
                              'Enako kot prejšnji mesec.',NULL,'Cena je previsoka, poiščite alternativo.','Redna tedenska nabava.',NULL,'Še v pripravi.'];
  v_status    text;
  v_req       uuid;
  v_top       uuid;
  v_total     numeric(12,2);
  v_pos       integer;
  v_created   timestamptz;
  r           record;
  i           integer;
BEGIN
  SELECT id INTO v_company FROM companies ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No company found'; END IF;

  SELECT id INTO v_user FROM users WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  SELECT coalesce(approver_id, v_user) INTO v_approver FROM companies WHERE id = v_company;

  SELECT array_agg(id ORDER BY name), array_agg(name ORDER BY name) INTO v_tops, v_top_names
    FROM categories WHERE company_id = v_company AND parent_id IS NULL;
  SELECT array_agg(id) INTO v_locs  FROM locations   WHERE company_id = v_company;
  SELECT array_agg(id) INTO v_depts FROM departments WHERE company_id = v_company;
  SELECT array_agg(id) INTO v_sups  FROM suppliers   WHERE company_id = v_company;

  IF v_tops IS NULL THEN RAISE EXCEPTION 'The catalog has no categories yet. Import the catalog first.'; END IF;

  FOR i IN 1..10 LOOP
    v_status  := v_statuses[i];
    v_top     := v_tops[((i - 1) % array_length(v_tops, 1)) + 1];
    v_created := now() - ((11 - i) * 3 || ' days')::interval;

    INSERT INTO requests (company_id, request_number, created_by, title, supplier_id, location_id, department_id,
                          needed_by_date, note, status, approver_id, created_at, updated_at)
    VALUES (v_company, generate_request_number(v_company), v_user,
            v_top_names[((i - 1) % array_length(v_tops, 1)) + 1] || ' – ' || v_purposes[i],
            CASE WHEN v_sups  IS NULL THEN NULL ELSE v_sups [((i - 1) % array_length(v_sups, 1))  + 1] END,
            CASE WHEN v_locs  IS NULL THEN NULL ELSE v_locs [((i - 1) % array_length(v_locs, 1))  + 1] END,
            CASE WHEN v_depts IS NULL THEN NULL ELSE v_depts[((i - 1) % array_length(v_depts, 1)) + 1] END,
            (v_created + interval '10 days')::date, v_notes[i],
            v_status, CASE WHEN v_status = 'draft' THEN NULL ELSE v_approver END, v_created, v_created)
    RETURNING id INTO v_req;

    v_total := 0; v_pos := 0;
    FOR r IN
      SELECT it.id, it.name, it.long_description, it.category_id, coalesce(it.default_unit, 'kos') AS unit,
             coalesce(it.default_unit_price, round((5 + random() * 95)::numeric, 2)) AS price,
             (1 + floor(random() * 20))::numeric AS qty
        FROM items it JOIN categories sub ON sub.id = it.category_id
       WHERE it.company_id = v_company AND it.status = 'active' AND sub.parent_id = v_top
       ORDER BY random() LIMIT 3 + (i % 3)
    LOOP
      v_pos := v_pos + 10;
      INSERT INTO request_line_items (request_id, item_id, category_id, position, name, long_description, quantity, unit, est_unit_price)
      VALUES (v_req, r.id, r.category_id, v_pos, r.name, r.long_description, r.qty, r.unit, r.price);
      v_total := v_total + r.qty * r.price;
    END LOOP;

    IF v_pos = 0 THEN
      RAISE NOTICE 'Request % has no lines: top-level category has no active items in its subcategories.', i;
    END IF;
    UPDATE requests SET total_estimate = v_total WHERE id = v_req;

    INSERT INTO activity_log (company_id, request_id, actor_id, action, created_at) VALUES (v_company, v_req, v_user, 'created', v_created);
    IF v_status <> 'draft' THEN
      INSERT INTO activity_log (company_id, request_id, actor_id, action, created_at) VALUES (v_company, v_req, v_user, 'submitted', v_created);
      INSERT INTO approvals (request_id, step, approver_id, status, decided_at, decision_note, created_at)
      VALUES (v_req, 1, v_approver, CASE WHEN v_status = 'pending' THEN 'pending' ELSE v_status END,
              CASE WHEN v_status = 'pending' THEN NULL ELSE v_created + interval '1 day' END,
              CASE WHEN v_status = 'rejected' THEN 'Cena je previsoka, poiščite alternativo.' END, v_created);
    END IF;
    IF v_status IN ('approved','rejected') THEN
      UPDATE requests SET decided_by = v_approver, decided_at = v_created + interval '1 day',
             decision_note = CASE WHEN v_status = 'rejected' THEN 'Cena je previsoka, poiščite alternativo.' END
       WHERE id = v_req;
      INSERT INTO activity_log (company_id, request_id, actor_id, action, created_at)
      VALUES (v_company, v_req, v_approver, v_status, v_created + interval '1 day');
    END IF;
  END LOOP;
END $$;
