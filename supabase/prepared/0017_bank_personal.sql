-- Banks in Flow itself, not only in Flow Family.
--
-- Until now a bank connection existed to share spending with a family. This
-- lets anyone with Flow connect their own banks and have the purchases appear
-- as their own expenses, categorised, with no typing.
--
-- Additive only:
--   1. `bank_accounts.import_to_flow`: the person's own switch, per account.
--      An account is read from the bank when it is shared with a family OR
--      imported; nothing else changes for Flow Family.
--   2. `transactions.source = 'bank'` and `transactions.bank_transaction_id`:
--      an imported entry is an ordinary Flow expense (editable, deletable)
--      that remembers where it came from, so the bank's corrections reach it
--      and it is never imported twice.
--   3. Triggers that copy new bank entries into Flow, follow the bank's
--      corrections (a pending purchase posting, an amount changing), and drop
--      the copy when the bank withdraws an entry. A person's own edits to the
--      category, description and note are never overwritten.
--   4. Keeping or deleting: disconnecting a bank asks the person whether to
--      keep what was imported; the 13-month retention of the bank's copy
--      never deletes what is now the person's own record.
--   5. Who may connect: a Flow subscriber (personal use) or, as before, a
--      dependent sharing with a family.
--   6. A connection used only for the person's own Flow is "in use": it is
--      not ended by the rule that ends connections nobody shares (0015).
--
-- Internal moves (paying a card bill from a checking account) are not
-- imported: with both accounts connected they would count the same money
-- twice.

-- ── 1. The switch ────────────────────────────────────────────────────────────

alter table public.bank_accounts add column if not exists import_to_flow boolean not null default false;
comment on column public.bank_accounts.import_to_flow is
  'The owner''s switch: copy this account''s entries into their own Flow expenses.';

-- ── 2. Imported entries ──────────────────────────────────────────────────────

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('manual', 'bank'));
alter table public.transactions
  add column if not exists bank_transaction_id uuid unique references public.bank_transactions (id) on delete set null;
comment on column public.transactions.bank_transaction_id is
  'The bank entry this expense was imported from. Null for one typed by hand, or once the bank''s copy is gone.';

/** Is this connection's owner using bank data at all: a family, or their own Flow? */
create or replace function public.bank_in_use(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.family_sharing_active(p_user)
      or exists (select 1 from public.bank_accounts a where a.user_id = p_user and a.import_to_flow)
$fn$;

/** Is this account read from the bank? Shared with a family, or imported. */
create or replace function public.bank_account_read(p_account public.bank_accounts)
returns boolean language sql immutable set search_path = '' as $fn$
  select p_account.shared or p_account.import_to_flow
$fn$;

/** The Flow category an imported entry starts in: the bank category's own name. */
create or replace function public.bank_flow_category(p_category text, p_direction text)
returns text language sql immutable set search_path = '' as $fn$
  select case when p_direction = 'income' then 'Income' else coalesce(nullif(p_category, ''), 'Other') end
$fn$;

/**
 * Copy one bank entry into the owner's Flow. Never fails the bank write: an
 * entry Flow can't take (the row cap, a limit) is simply not imported.
 */
create or replace function public.bank_copy_to_flow(p_row public.bank_transactions)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_category text := public.bank_flow_category(p_row.category, p_row.direction);
begin
  if p_row.category = 'Internal' then
    return;
  end if;
  begin
    insert into public.categories (user_id, label, custom)
    values (p_row.user_id, v_category, false)
    on conflict (user_id, label) do nothing;
    insert into public.transactions (user_id, amount, direction, description, category, date, merchant, currency, source, bank_transaction_id)
    values (
      p_row.user_id, p_row.amount, p_row.direction,
      left(coalesce(nullif(p_row.merchant, ''), nullif(p_row.description, ''), 'Bank entry'), 200),
      v_category, p_row.date, nullif(p_row.merchant, ''), p_row.currency, 'bank', p_row.id
    )
    on conflict (bank_transaction_id) do nothing;
  exception when others then
    -- Keep the bank's copy; the person can still see it was not imported
    -- (the account screen counts what is in Flow).
    null;
  end;
end;
$fn$;

/** New and corrected bank entries reach Flow. */
create or replace function public.bank_transactions_to_flow()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if not exists (select 1 from public.bank_accounts a where a.id = new.account_id and a.import_to_flow) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.bank_copy_to_flow(new);
  else
    -- The bank's facts follow the bank; what the person chose (category,
    -- description, note) stays theirs. A copy the person deleted stays deleted.
    update public.transactions t
       set amount = new.amount, direction = new.direction, date = new.date, currency = new.currency
     where t.bank_transaction_id = new.id
       and (t.amount, t.direction, t.date, t.currency) is distinct from (new.amount, new.direction, new.date, new.currency);
  end if;
  return null;
end;
$fn$;

drop trigger if exists bank_transactions_to_flow on public.bank_transactions;
create trigger bank_transactions_to_flow after insert or update of amount, direction, date, currency on public.bank_transactions
  for each row execute function public.bank_transactions_to_flow();

/**
 * The bank withdrew an entry (a pending purchase replaced by the posted one):
 * its copy in Flow goes too. Not when the bank's copy is only being aged out
 * or the person disconnected and chose to keep what was imported: then the
 * copy stays as their own record. Runs BEFORE the delete so it fires ahead of
 * the foreign key that would otherwise just unlink the copy.
 */
create or replace function public.bank_transactions_drop_imported()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if coalesce(current_setting('flow.keep_imported', true), '') <> 'on' then
    delete from public.transactions t where t.bank_transaction_id = old.id;
  end if;
  return old;
end;
$fn$;

drop trigger if exists bank_transactions_drop_imported on public.bank_transactions;
create trigger bank_transactions_drop_imported before delete on public.bank_transactions
  for each row execute function public.bank_transactions_drop_imported();

-- ── 3. What the app calls ────────────────────────────────────────────────────

/**
 * Import one account into my Flow, or stop. Turning it on brings in what is
 * already stored from it; turning it off keeps what was imported (it is the
 * person's own record now) and imports nothing new.
 */
create or replace function public.bank_account_set_import(p_account uuid, p_import boolean)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_account public.bank_accounts;
  v_row public.bank_transactions;
  v_before int;
  v_after int;
begin
  if v_uid is null then
    perform public.family_fail('not_signed_in', 401);
  end if;
  select * into v_account from public.bank_accounts a where a.id = p_account and a.user_id = v_uid for update;
  if v_account.id is null then
    perform public.family_fail('account_not_found', 404);
  end if;

  update public.bank_accounts set import_to_flow = coalesce(p_import, false) where id = p_account;
  select count(*) into v_before from public.transactions t where t.user_id = v_uid and t.source = 'bank';
  if coalesce(p_import, false) then
    for v_row in select * from public.bank_transactions b where b.account_id = p_account order by b.date loop
      perform public.bank_copy_to_flow(v_row);
    end loop;
  elsif not v_account.shared then
    -- No longer read for anything: the bank's copy has no purpose left. What
    -- was imported stays in the person's Flow.
    perform set_config('flow.keep_imported', 'on', true);
    delete from public.bank_transactions where account_id = p_account;
    perform set_config('flow.keep_imported', 'off', true);
  end if;
  select count(*) into v_after from public.transactions t where t.user_id = v_uid and t.source = 'bank';
  perform public.bank_mark_orphans(v_uid);
  return jsonb_build_object('import', coalesce(p_import, false), 'imported', v_after - v_before);
end;
$fn$;

/**
 * Share an account with my family, or stop (0012), now aware of importing:
 * stopping keeps what the account brought into my own Flow, and keeps
 * reading it while it is still imported.
 */
create or replace function public.bank_account_set_shared(p_account uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_account public.bank_accounts;
begin
  select * into v_account from public.bank_accounts a where a.id = p_account and a.user_id = v_uid for update;
  if v_account.id is null then
    perform public.family_fail('account_not_found', 404);
  end if;
  if coalesce(p_shared, false) = v_account.shared then
    return;
  end if;

  if p_shared then
    if public.family_dependent_plan(v_uid) = 'none' then
      perform public.family_fail('not_a_dependent', 403);
    end if;
    if public.family_dependent_plan(v_uid) = 'free'
       and exists (select 1 from public.bank_accounts a where a.user_id = v_uid and a.shared) then
      perform public.family_fail('plan_limit_accounts', 402);
    end if;
    update public.bank_accounts set shared = true, shared_at = now() where id = p_account;
  else
    update public.bank_accounts set shared = false, shared_at = null where id = p_account;
    if not v_account.import_to_flow then
      perform set_config('flow.keep_imported', 'on', true);
      delete from public.bank_transactions where account_id = p_account;
      perform set_config('flow.keep_imported', 'off', true);
    end if;
  end if;

  perform public.family_audit(null, v_uid, v_uid,
    case when p_shared then 'account_shared' else 'account_unshared' end,
    jsonb_build_object('account_id', p_account, 'name', v_account.name, 'last4', v_account.last4));
end;
$fn$;

/**
 * After connecting from Flow: import every account of the connection in the
 * person's Flow currency (others stay off, since Flow totals one currency).
 * Returns the accounts switched on and the ones left off.
 */
create or replace function public.bank_connection_import_defaults(p_connection uuid, p_currency text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_on int;
  v_off int;
  v_id uuid;
begin
  if v_uid is null then
    perform public.family_fail('not_signed_in', 401);
  end if;
  if not exists (select 1 from public.bank_connections c where c.id = p_connection and c.user_id = v_uid) then
    perform public.family_fail('connection_not_found', 404);
  end if;
  for v_id in
    select a.id from public.bank_accounts a
     where a.connection_id = p_connection and not a.import_to_flow
       and (p_currency is null or a.currency = upper(p_currency))
  loop
    perform public.bank_account_set_import(v_id, true);
  end loop;
  select count(*) filter (where a.import_to_flow), count(*) filter (where not a.import_to_flow)
    into v_on, v_off
    from public.bank_accounts a where a.connection_id = p_connection;
  return jsonb_build_object('imported_accounts', v_on, 'other_accounts', v_off);
end;
$fn$;

/**
 * Forget a connection and what was read through it. `p_keep_imported` keeps
 * the expenses it brought into the person's Flow (as their own records);
 * false deletes them too.
 */
-- Replaces the one-argument version (0012): calls that send only the
-- connection (Edge Functions already deployed) reach this one and keep what
-- was imported. Two versions side by side would make such a call ambiguous.
drop function if exists public.bank_remove_connection(uuid);
create or replace function public.bank_remove_connection(p_connection uuid, p_keep_imported boolean default true)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_conn public.bank_connections;
begin
  select * into v_conn from public.bank_connections c where c.id = p_connection;
  if v_conn.id is null then return; end if;
  perform set_config('flow.keep_imported', case when coalesce(p_keep_imported, true) then 'on' else 'off' end, true);
  delete from public.bank_connections where id = p_connection;
  perform set_config('flow.keep_imported', 'off', true);
  perform public.family_audit(null, v_conn.user_id, v_conn.user_id, 'bank_disconnected',
    jsonb_build_object('connection_id', p_connection, 'institution', v_conn.institution_name));
end;
$fn$;


-- ── 4. Reading an account: shared or imported ────────────────────────────────

create or replace function public.bank_ingest_transactions(p_account uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_account public.bank_accounts;
  v_inserted int;
  v_total int;
begin
  select * into v_account from public.bank_accounts a where a.id = p_account;
  if v_account.id is null then
    perform public.family_fail('account_not_found', 404);
  end if;
  if not public.bank_account_read(v_account) then
    perform public.family_fail('account_not_shared', 409);
  end if;

  with incoming as (
    select distinct on (r ->> 'external_id')
           r ->> 'external_id' as external_id,
           (r ->> 'amount')::bigint as amount,
           r ->> 'direction' as direction,
           coalesce(public.family_clean_text(r ->> 'description', 200), '') as description,
           public.family_clean_text(r ->> 'merchant', 200) as merchant,
           case when r ->> 'category' = any (public.family_categories()) then r ->> 'category' else 'Other' end as category,
           (r ->> 'date')::timestamptz as date,
           case when r ->> 'status' = 'pending' then 'pending' else 'posted' end as status,
           coalesce(nullif(r ->> 'currency', ''), v_account.currency) as currency
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
     where nullif(r ->> 'external_id', '') is not null
  ),
  written as (
    insert into public.bank_transactions (user_id, account_id, external_id, amount, direction, description, merchant, category, date, status, currency)
    select v_account.user_id, p_account, i.external_id, i.amount, i.direction, i.description, i.merchant, i.category, i.date, i.status, i.currency
      from incoming i
    on conflict (account_id, external_id) do update
      set amount = excluded.amount, direction = excluded.direction, description = excluded.description,
          merchant = excluded.merchant, category = excluded.category, date = excluded.date,
          status = excluded.status, currency = excluded.currency, updated_at = now()
      where (public.bank_transactions.amount, public.bank_transactions.direction, public.bank_transactions.description,
             public.bank_transactions.merchant, public.bank_transactions.category, public.bank_transactions.date,
             public.bank_transactions.status, public.bank_transactions.currency)
            is distinct from
            (excluded.amount, excluded.direction, excluded.description, excluded.merchant, excluded.category,
             excluded.date, excluded.status, excluded.currency)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new), count(*) into v_inserted, v_total from written;

  update public.bank_connections set last_synced_at = now(), updated_at = now() where id = v_account.connection_id;
  return jsonb_build_object('inserted', v_inserted, 'updated', v_total - v_inserted);
end;
$fn$;

-- ── 5. Who may connect ───────────────────────────────────────────────────────

/**
 * May this person connect (another) bank? A Flow subscriber, for their own
 * Flow (up to 10); or, as before, someone sharing with a family (one on the
 * family's free plan, ten when it pays). The larger allowance wins.
 */
create or replace function public.bank_connection_allowance(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_family text := public.family_dependent_plan(p_user);
  v_personal text := public.family_plan(p_user);
  v_used int := (select count(*) from public.bank_connections c where c.user_id = p_user);
  v_family_max int := case v_family when 'paid' then 10 when 'free' then 1 else 0 end;
  v_personal_max int := case v_personal when 'paid' then 10 else 0 end;
  v_max int := greatest(v_family_max, v_personal_max);
begin
  return jsonb_build_object(
    'plan', case when v_personal_max >= v_family_max and v_personal_max > 0 then 'personal' else v_family end,
    'used', v_used, 'max', v_max,
    'allowed', v_used < v_max,
    'reason', case
      when v_max = 0 then 'subscription_required'
      when v_used >= v_max and v_max = 1 then 'plan_limit_connections'
      when v_used >= v_max then 'too_many_connections'
    end
  );
end;
$fn$;

-- ── 6. In use: shared or imported ────────────────────────────────────────────

create or replace function public.bank_mark_orphans(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if public.bank_in_use(p_user) then
    update public.bank_connections set orphaned_at = null, updated_at = now()
     where user_id = p_user and orphaned_at is not null;
  else
    update public.bank_connections set orphaned_at = now(), updated_at = now()
     where user_id = p_user and orphaned_at is null;
  end if;
end;
$fn$;

create or replace function public.family_maintenance(p_limit int default 20, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid;
  v_txns int;
  v_alerts int;
  v_audit int;
  v_invites int;
  v_attempts int;
  v_events int;
  v_due jsonb;
begin
  if not coalesce(p_force, false)
     and exists (select 1 from public.family_maintenance_runs r where r.ran_at > now() - interval '1 hour') then
    return jsonb_build_object('skipped', true, 'due_connections', '[]'::jsonb);
  end if;
  insert into public.family_maintenance_runs (id, ran_at) values (1, now())
  on conflict (id) do update set ran_at = excluded.ran_at;

  -- Consents run out by the calendar, with no write to fire a trigger.
  for v_uid in
    select distinct c.dependent_id from public.family_consents c
     where c.status = 'active' and c.expires_at <= now()
  loop
    perform public.family_expire_consents(v_uid);
  end loop;
  -- In use means shared with a family or imported into the person's own Flow.
  update public.bank_connections b set orphaned_at = now(), updated_at = now()
   where b.orphaned_at is null and not public.bank_in_use(b.user_id);
  update public.bank_connections b set orphaned_at = null, updated_at = now()
   where b.orphaned_at is not null and public.bank_in_use(b.user_id);

  -- What a person imported into their own Flow is theirs and stays when the
  -- bank's copy ages out (see bank_transactions_drop_imported).
  perform set_config('flow.keep_imported', 'on', true);
  delete from public.bank_transactions where date < now() - interval '13 months';
  perform set_config('flow.keep_imported', 'off', true);
  get diagnostics v_txns = row_count;
  delete from public.family_alert_events where created_at < now() - interval '12 months';
  get diagnostics v_alerts = row_count;
  delete from public.family_audit_log where created_at < now() - interval '24 months';
  get diagnostics v_audit = row_count;
  -- An invitation nobody used holds a code hash and, for a minor, a birthdate
  -- and the representative's IP: no purpose once it can't be used.
  delete from public.family_invites where status <> 'accepted' and expires_at < now() - interval '30 days';
  get diagnostics v_invites = row_count;
  delete from public.family_invite_attempts where attempted_at < now() - interval '1 day';
  get diagnostics v_attempts = row_count;
  delete from public.bank_webhook_events where received_at < now() - interval '30 days' and processed_at is not null;
  get diagnostics v_events = row_count;
  -- Connection windows nobody finished.
  delete from public.bank_link_sessions where expires_at < now() - interval '1 day';

  select coalesce(jsonb_agg(jsonb_build_object(
           'connection_id', d.id, 'external_item_id', d.external_item_id, 'provider', d.provider,
           'credential', d.secret, 'environment', d.environment)), '[]'::jsonb)
    into v_due
    from (
      select b.id, b.external_item_id, b.provider, k.secret, coalesce(k.environment, 'production') as environment
        from public.bank_connections b
        left join public.bank_credentials k on k.connection_id = b.id
       where b.orphaned_at < now() - interval '30 days'
       order by b.orphaned_at
       limit greatest(1, least(coalesce(p_limit, 20), 100))
    ) d;

  return jsonb_build_object(
    'removed', jsonb_build_object(
      'bank_transactions', v_txns, 'alerts', v_alerts, 'audit', v_audit,
      'invites', v_invites, 'invite_attempts', v_attempts, 'webhook_events', v_events),
    'due_connections', v_due);
end;
$fn$;

-- ── 7. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.bank_account_set_shared(uuid, boolean),
  public.bank_in_use(uuid),
  public.bank_account_read(public.bank_accounts),
  public.bank_flow_category(text, text),
  public.bank_copy_to_flow(public.bank_transactions),
  public.bank_transactions_to_flow(),
  public.bank_transactions_drop_imported(),
  public.bank_account_set_import(uuid, boolean),
  public.bank_connection_import_defaults(uuid, text),
  public.bank_remove_connection(uuid, boolean),
  public.bank_ingest_transactions(uuid, jsonb),
  public.bank_connection_allowance(uuid),
  public.bank_mark_orphans(uuid),
  public.family_maintenance(int, boolean)
from public, anon, authenticated;

grant execute on function
  public.bank_account_set_shared(uuid, boolean),
  public.bank_account_set_import(uuid, boolean),
  public.bank_connection_import_defaults(uuid, text)
to authenticated;
grant execute on function
  public.bank_remove_connection(uuid, boolean),
  public.bank_ingest_transactions(uuid, jsonb),
  public.bank_connection_allowance(uuid),
  public.family_maintenance(int, boolean)
to service_role;
