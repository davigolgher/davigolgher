-- Input limits and least-privilege probe — what migration 0009 enforces.
--
-- Before 0009 is applied, the "ACCEPTED (FAIL)" lines are the findings; after
-- it, every line should read "refused" or PASS. Safe on the real project: one
-- DO block ending in RAISE EXCEPTION, so everything rolls back — fictitious
-- users only (audit-a / audit-b @example.test), no real row read or touched.
do $probe$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  b_tx uuid := gen_random_uuid();
  a_tx uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid();
  n int;
  r text := E'\n';
  capped boolean := exists (select 1 from pg_trigger where tgname = 'categories_row_cap');
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-a@example.test', '', now(), now(), now(), '{}', '{}'),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-b@example.test', '', now(), now(), now(), '{}', '{}');
  insert into public.transactions (id, user_id, amount, direction, description, category, date) values (b_tx, b, 250000, 'expense', 'B rent', 'Housing', now());
  -- The category cap is 500; lowered to 3 inside this transaction so it can be exercised.
  if capped then
    execute 'drop trigger categories_row_cap on public.categories';
    execute $m$create trigger categories_row_cap after insert on public.categories referencing new table as new_rows for each statement execute function public.enforce_row_cap('3')$m$;
  end if;
  select count(*) into n from public.budgets where user_id = a;
  r := r || 'S01 sign-up still creates the default budget: ' || case when n = 1 then 'PASS' else 'FAIL n=' || n end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin insert into public.transactions (user_id, amount, direction, date, description) values (a, 10, 'expense', now(), repeat('x', 5000000));
    r := r || 'A01 5,000,000-char description: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A01 5,000,000-char description: refused 23514' || E'\n'; end;
  begin insert into public.transactions (user_id, amount, direction, date) values (a, -500000, 'expense', now());
    r := r || 'A02 negative amount: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A02 negative amount: refused 23514' || E'\n'; end;
  begin insert into public.transactions (user_id, amount, direction, date) values (a, 1000000000000, 'expense', now());
    r := r || 'A03 amount past 9,999,999,999.99: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A03 amount past 9,999,999,999.99: refused 23514' || E'\n'; end;
  begin insert into public.transactions (user_id, amount, direction, date, currency) values (a, 1, 'expense', now(), 'not-a-currency');
    r := r || 'A04 bad currency: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A04 bad currency: refused 23514' || E'\n'; end;
  begin insert into public.subscriptions (user_id, name, amount, frequency) values (a, 'x', 1, 'hourly');
    r := r || 'A05 frequency hourly: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A05 frequency hourly: refused 23514' || E'\n'; end;
  begin insert into public.subscriptions (user_id, name, amount, frequency, custom_interval_days) values (a, 'x', 1, 'custom', 0);
    r := r || 'A06 0-day interval: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A06 0-day interval: refused 23514' || E'\n'; end;
  begin update public.preferences set locale = repeat('z', 100000) where user_id = a;
    r := r || 'A07 100,000-char locale: ACCEPTED (FAIL)' || E'\n';
  exception when check_violation then r := r || 'A07 100,000-char locale: refused 23514' || E'\n'; end;
  begin update public.profiles set email = 'someone-else@example.test' where id = a; get diagnostics n = row_count;
    r := r || 'A08 rewrite own profile: ' || case when n = 0 then 'nothing changed PASS' else 'ACCEPTED (FAIL)' end || E'\n';
  exception when insufficient_privilege then r := r || 'A08 rewrite own profile: refused 42501' || E'\n'; end;
  begin insert into public.billing (user_id, status) values (a, 'active');
    r := r || 'A09 grant self billing: ACCEPTED (FAIL)' || E'\n';
  exception when insufficient_privilege then r := r || 'A09 grant self billing: refused 42501' || E'\n'; end;
  insert into public.activity_days (user_id, day) values (a, current_date);
  begin delete from public.activity_days where user_id = a; get diagnostics n = row_count;
    r := r || 'A10 delete own streak days: ' || case when n = 0 then 'nothing deleted (no policy) PASS' else 'DELETED (FAIL)' end || E'\n';
  exception when insufficient_privilege then r := r || 'A10 delete own streak days: refused 42501' || E'\n'; end;
  insert into public.categories (id, user_id, label) values (c1, a, 'One'), (gen_random_uuid(), a, 'Two'), (gen_random_uuid(), a, 'Three');
  if capped then
    begin insert into public.categories (user_id, label) values (a, 'Four');
      r := r || 'A11 4th category past a cap of 3: ACCEPTED (FAIL)' || E'\n';
    exception when check_violation then r := r || 'A11 4th category past a cap of 3: refused 23514' || E'\n'; end;
  else
    r := r || 'A11 rows per account: no cap (FAIL — 0009 not applied)' || E'\n';
  end if;
  insert into public.categories (id, user_id, label) values (c1, a, 'One renamed') on conflict (id) do update set label = excluded.label;
  select count(*) into n from public.categories where id = c1 and label = 'One renamed';
  r := r || 'A12 legit: edit (upsert) an existing category: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin insert into storage.objects (bucket_id, name, owner, owner_id) values ('receipts', b::text || '/planted.jpg', a, a::text);
    r := r || 'A13 write into B''s receipts folder: ACCEPTED (FAIL)' || E'\n';
  exception when insufficient_privilege then r := r || 'A13 write into B''s receipts folder: refused 42501' || E'\n'; end;
  insert into storage.objects (bucket_id, name, owner, owner_id) values ('receipts', a::text || '/mine.jpg', a, a::text);
  r := r || 'A14 legit: write into own receipts folder: PASS' || E'\n';
  insert into public.transactions (id, user_id, amount, direction, description, category, date, merchant, note, currency, source)
    values (a_tx, a, 999999999999, 'expense', repeat('d', 200), repeat('c', 200), now(), repeat('m', 200), repeat('n', 1000), 'BRL', 'manual');
  insert into public.transactions (id, user_id, amount, direction, description, category, date, currency, source)
    values (a_tx, a, 4200, 'income', 'Salary', 'Income', now(), 'BRL', 'manual')
    on conflict (id) do update set amount = excluded.amount, direction = excluded.direction, description = excluded.description;
  select count(*) into n from public.transactions where id = a_tx and amount = 4200;
  r := r || 'A15 legit: insert at every limit, then edit by upsert: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  insert into public.subscriptions (user_id, name, amount, currency, frequency, custom_interval_days, status, category, reminders)
    values (a, 'Netflix', 1599, 'USD', 'custom', 30, 'trial', 'Subscriptions', true);
  insert into public.budgets (user_id, scope, label, "limit") values (a, 'total', 'Monthly budget', 300000)
    on conflict (user_id, scope) do update set "limit" = excluded."limit";
  insert into public.preferences (user_id, currency, locale) values (a, 'BRL', 'pt-BR')
    on conflict (user_id) do update set currency = excluded.currency, locale = excluded.locale;
  insert into public.activity_days (user_id, day) values (a, current_date) on conflict do nothing;
  delete from public.transactions where id = a_tx; get diagnostics n = row_count;
  r := r || 'A16 legit: subscription, budget, preferences, streak day, delete own entry: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.transactions where id = b_tx;
  r := r || 'A17 A reads B transaction: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin insert into public.transactions (id, user_id, amount, direction, date) values (b_tx, a, 1, 'expense', now())
      on conflict (id) do update set user_id = excluded.user_id;
    r := r || 'A18 A takes over B row by upsert: ACCEPTED (FAIL)' || E'\n';
  exception when insufficient_privilege then r := r || 'A18 A takes over B row by upsert: refused 42501' || E'\n'; end;
  select count(*) into n from public.profiles where id = a;
  r := r || 'A19 legit: A reads own profile: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin select count(*) into n from public.transactions;
    r := r || 'A20 anon can query transactions (RLS returns ' || n || ' rows): FAIL (grant should be gone)' || E'\n';
  exception when insufficient_privilege then r := r || 'A20 anon queries transactions: refused 42501 (no grant)' || E'\n'; end;
  reset role;
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon';
  r := r || 'A21 table privileges held by anon: ' || n || case when n = 0 then ' PASS' else ' FAIL' end || E'\n';
  select count(*) into n from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'TRUNCATE';
  r := r || 'A22 tables authenticated may TRUNCATE: ' || n || case when n = 0 then ' PASS' else ' FAIL' end || E'\n';
  select count(*) into n from storage.buckets where id = 'receipts' and file_size_limit = 8388608 and allowed_mime_types @> array['image/jpeg'];
  r := r || 'A23 receipts bucket: 8 MB limit and type allowlist: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  raise exception 'LIMITS PROBE (rolled back):%', r;
end $probe$;
