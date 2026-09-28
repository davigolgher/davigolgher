-- Two-account isolation probe (accounts A and B). Re-run after any change to
-- tables, policies, grants or storage rules.
--
-- Safe on the real project: everything happens in one DO block that ends in
-- RAISE EXCEPTION, so the transaction rolls back — the fictitious users
-- (audit-a / audit-b @example.test), their rows and files never persist, and
-- no real account is read or touched. Run it in the SQL editor; the result is
-- the error message, one line per check. Every line should end in PASS.
--
-- A acts through the same roles and JWT claims the API uses (`authenticated`
-- with sub = A; `anon` with no user), so what RLS and the grants allow here
-- is what the REST API allows. Last run: see SEGURANCA.md.

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  b_tx uuid := gen_random_uuid();
  b_sub uuid := gen_random_uuid();
  b_cat uuid := gen_random_uuid();
  a_tx uuid := gen_random_uuid();
  n int;
  r text := E'\n';
  obj_ok boolean := true;

  -- small helpers are not available in a DO block, so each case is inline:
  -- 'PASS' means the attack was refused, 'FAIL' means it worked.
begin
  ------------------------------------------------------------------ setup (as postgres)
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-a@example.test', '', now(), now(), now(), '{}', '{}'),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-b@example.test', '', now(), now(), now(), '{}', '{}');

  insert into public.transactions (id, user_id, amount, direction, description, category, date, note)
    values (b_tx, b, 250000, 'expense', 'B rent', 'Housing', now(), 'B private note');
  insert into public.subscriptions (id, user_id, name, amount, frequency) values (b_sub, b, 'B Netflix', 1599, 'monthly');
  insert into public.categories (id, user_id, label) values (b_cat, b, 'B private');
  insert into public.billing (user_id, status, current_period_end) values (b, 'active', now() + interval '30 days');
  insert into public.activity_days (user_id, day) values (b, current_date);
  update public.budgets set "limit" = 900000 where user_id = b;
  update public.preferences set currency = 'BRL' where user_id = b;

  begin
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
      values ('receipts', b::text || '/receipt.jpg', b, b::text, '{"mimetype":"image/jpeg","size":10}');
  exception when others then
    obj_ok := false;
    r := r || 'setup storage.objects: not inserted (' || sqlerrm || ')' || E'\n';
  end;

  ------------------------------------------------------------------ act as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  set local role authenticated;

  -- READ (BOLA by id and by owner filter), every table
  select count(*) into n from public.transactions where id = b_tx or user_id = b;
  r := r || 'T01 A reads B transactions by id/user_id: ' || case when n = 0 then 'PASS' else 'FAIL rows=' || n end || E'\n';
  select count(*) into n from public.subscriptions where id = b_sub or user_id = b;
  r := r || 'T02 A reads B subscriptions: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.categories where user_id = b;
  r := r || 'T03 A reads B categories: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.budgets where user_id = b;
  r := r || 'T04 A reads B budgets: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.preferences where user_id = b;
  r := r || 'T05 A reads B preferences: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.billing where user_id = b;
  r := r || 'T06 A reads B billing: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.activity_days where user_id = b;
  r := r || 'T07 A reads B activity_days: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.profiles where id = b;
  r := r || 'T08 A reads B profile (email): ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.transactions;
  r := r || 'T09 A unfiltered select sees only own rows: ' || case when n = 0 then 'PASS' else 'FAIL rows=' || n end || E'\n';

  -- UPDATE / DELETE of B's rows
  begin
    update public.transactions set amount = 1 where id = b_tx; get diagnostics n = row_count;
    r := r || 'T10 A updates B transaction: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T10 A updates B transaction: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    delete from public.transactions where id = b_tx; get diagnostics n = row_count;
    r := r || 'T11 A deletes B transaction: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T11 A deletes B transaction: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    update public.subscriptions set amount = 1 where id = b_sub; get diagnostics n = row_count;
    r := r || 'T12 A updates B subscription: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T12 A updates B subscription: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    delete from public.categories where id = b_cat; get diagnostics n = row_count;
    r := r || 'T13 A deletes B category: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T13 A deletes B category: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    update public.budgets set "limit" = 1 where user_id = b; get diagnostics n = row_count;
    r := r || 'T14 A updates B budget: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T14 A updates B budget: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    update public.preferences set currency = 'USD' where user_id = b; get diagnostics n = row_count;
    r := r || 'T15 A updates B preferences: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T15 A updates B preferences: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    delete from public.activity_days where user_id = b; get diagnostics n = row_count;
    r := r || 'T16 A deletes B activity_days: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T16 A deletes B activity_days: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    update public.profiles set email = 'x@example.test' where id = b; get diagnostics n = row_count;
    r := r || 'T17 A updates B profile: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T17 A updates B profile: PASS (42501, no privilege)' || E'\n';
  end;

  -- INSERT as B (owner field forged in the body)
  begin
    insert into public.transactions (user_id, amount, direction, date) values (b, 1, 'expense', now());
    r := r || 'T18 A inserts a transaction owned by B: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T18 A inserts a transaction owned by B: PASS (42501)' || E'\n';
  end;
  begin
    insert into public.subscriptions (user_id, name, amount, frequency) values (b, 'x', 1, 'monthly');
    r := r || 'T19 A inserts a subscription owned by B: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T19 A inserts a subscription owned by B: PASS (42501)' || E'\n';
  end;

  -- UPSERT reusing B's primary key (what a tampered sync op would send)
  begin
    insert into public.transactions (id, user_id, amount, direction, date)
      values (b_tx, a, 1, 'expense', now())
      on conflict (id) do update set amount = excluded.amount, user_id = excluded.user_id;
    r := r || 'T20 A upserts with B transaction id (take over row): FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T20 A upserts with B transaction id: PASS (42501)' || E'\n';
  end;
  begin
    insert into public.subscriptions (id, user_id, name, amount, frequency)
      values (b_sub, a, 'x', 1, 'monthly')
      on conflict (id) do update set name = excluded.name;
    r := r || 'T21 A upserts with B subscription id: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T21 A upserts with B subscription id: PASS (42501)' || E'\n';
  end;
  begin
    insert into public.budgets (user_id, scope, label, "limit") values (b, 'total', 'x', 1)
      on conflict (user_id, scope) do update set "limit" = excluded."limit";
    r := r || 'T22 A upserts B budget by composite key: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T22 A upserts B budget by composite key: PASS (42501)' || E'\n';
  end;

  -- Ownership transfer of A's own row to B (mass assignment of user_id)
  insert into public.transactions (id, user_id, amount, direction, date) values (a_tx, a, 500, 'expense', now());
  begin
    update public.transactions set user_id = b where id = a_tx;
    r := r || 'T23 A reassigns own transaction to B: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T23 A reassigns own transaction to B: PASS (42501)' || E'\n';
  end;
  begin
    update public.profiles set id = b where id = a;
    r := r || 'T24 A rewrites own profile id to B: FAIL' || E'\n';
  exception when insufficient_privilege or unique_violation or foreign_key_violation then
    r := r || 'T24 A rewrites own profile id to B: PASS (' || sqlstate || ')' || E'\n';
  end;

  -- Paid access: A grants itself a subscription
  begin
    insert into public.billing (user_id, status, current_period_end) values (a, 'active', now() + interval '10 years');
    r := r || 'T25 A inserts own billing=active: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T25 A inserts own billing=active: PASS (42501)' || E'\n';
  end;
  begin
    update public.billing set status = 'active' where user_id = a; get diagnostics n = row_count;
    r := r || 'T26 A updates own billing: ' || case when n = 0 then 'PASS (no row visible to update)' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T26 A updates own billing: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    update public.billing set status = 'inactive' where user_id = b; get diagnostics n = row_count;
    r := r || 'T27 A revokes B billing: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when insufficient_privilege then r := r || 'T27 A revokes B billing: PASS (42501, no privilege)' || E'\n';
  end;

  -- Streak: forge days for B, or backfill own history
  begin
    insert into public.activity_days (user_id, day) values (b, current_date - 1);
    r := r || 'T28 A inserts activity day for B: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T28 A inserts activity day for B: PASS (42501)' || E'\n';
  end;
  begin
    insert into public.activity_days (user_id, day) values (a, current_date - 10);
    r := r || 'T29 A backfills own streak 10 days back: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T29 A backfills own streak 10 days back: PASS (42501)' || E'\n';
  end;
  insert into public.activity_days (user_id, day) values (a, current_date);
  r := r || 'T30 legit: A records today: PASS' || E'\n';

  -- Files
  if obj_ok then
    select count(*) into n from storage.objects where bucket_id = 'receipts' and owner = b;
    r := r || 'T31 A lists/reads B receipt object: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
    begin
      insert into storage.objects (bucket_id, name, owner, owner_id) values ('receipts', b::text || '/planted.jpg', a, a::text);
      r := r || 'T32 A writes a file into B''s folder: FAIL (allowed; fixed by 0009)' || E'\n';
    exception when insufficient_privilege then r := r || 'T32 A writes a file into B''s folder: PASS (42501)' || E'\n';
    end;
  end if;

  -- Legitimate use still works for A
  select count(*) into n from public.transactions where user_id = a;
  r := r || 'T33 legit: A reads own transaction: ' || case when n = 1 then 'PASS' else 'FAIL n=' || n end || E'\n';
  update public.transactions set amount = 700 where id = a_tx; get diagnostics n = row_count;
  r := r || 'T34 legit: A edits own transaction: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';

  ------------------------------------------------------------------ anonymous caller (anon key, no session)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select (select count(*) from public.transactions) + (select count(*) from public.subscriptions)
         + (select count(*) from public.profiles) + (select count(*) from public.billing)
         + (select count(*) from public.categories) + (select count(*) from public.budgets)
         + (select count(*) from public.preferences) + (select count(*) from public.activity_days)
      into n;
    r := r || 'T35 anon reads any table: ' || case when n = 0 then 'PASS' else 'FAIL rows=' || n end || E'\n';
  exception when insufficient_privilege then r := r || 'T35 anon reads any table: PASS (42501, no privilege)' || E'\n';
  end;
  begin
    insert into public.transactions (user_id, amount, direction, date) values (b, 1, 'expense', now());
    r := r || 'T36 anon inserts for B: FAIL' || E'\n';
  exception when insufficient_privilege then r := r || 'T36 anon inserts for B: PASS (42501)' || E'\n';
  end;
  reset role;

  ------------------------------------------------------------------ B's data is intact
  select count(*) into n from public.transactions where id = b_tx and amount = 250000 and user_id = b;
  r := r || 'T37 B transaction intact after all attempts: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.billing where user_id = b and status = 'active';
  r := r || 'T38 B billing intact: ' || case when n = 1 then 'PASS' else 'FAIL' end || E'\n';

  raise exception 'PROBE (rolled back):%', r;
end $$;
