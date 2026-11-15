-- 0012 — Flow Family: bank connections, accounts and transactions (Open Finance).
--
-- PREPARED, NOT APPLIED. Apply after 0011. Additive: the existing
-- `transactions` table and everything that reads it are untouched.
-- Tested in supabase/tests/pg/family_bank.test.ts.
--
-- What this adds. A dependent connects their bank through the aggregator
-- (Pluggy). What comes back is stored here, and only here:
--   bank_connections   one per institution the person connected
--   bank_accounts      the accounts and cards in it, each with a `shared` flag
--   bank_transactions  the entries of the accounts the person chose to share
--
-- Why not the existing `transactions` table. That table is the person's own
-- ledger: they add, edit and delete its rows, and Home adds them up. Bank
-- entries are a different thing — they must not be editable by the person
-- they describe (a guardian is relying on them), must not double-count with
-- what the person typed in by hand, and must disappear when the account is
-- unshared. Same shape (integer cents, direction, description, category,
-- merchant, date), so the same calculations work on both; separate storage.
--
-- Who writes. Only the Edge Functions, as the service role, through the
-- functions below. The owner reads their own rows and flips `shared`. A
-- guardian has no access here at all: they read through 0013's functions.
--
-- What is not stored (minimisation): balances, credit limits, full account
-- numbers, tax ids, the payer and receiver of transfers, bank credentials
-- (which never reach us in the first place).

-- ── 1. The category list ─────────────────────────────────────────────────────
-- One fixed list for bank entries, so a guardian's budgets and alerts mean the
-- same thing whichever bank the entry came from. Kept identical to
-- src/lib/family/categories.ts and supabase/functions/_shared/categories.ts
-- by a test.

create or replace function public.family_categories()
returns text[] language sql immutable set search_path = '' as $fn$
  select array[
    'Groceries', 'Eating out', 'Transport', 'Shopping', 'Entertainment', 'Health',
    'Education', 'Housing & bills', 'Travel', 'Services', 'Betting & lotteries',
    'Loans & fees', 'Taxes', 'Transfers', 'Income', 'Internal', 'Other'
  ]
$fn$;

-- ── 2. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'pluggy' check (provider in ('pluggy')),
  -- The aggregator's id for this connection. Useless without the server's key.
  external_item_id text not null check (length(external_item_id) between 1 and 100),
  institution_name text not null default '' check (length(institution_name) <= 120),
  -- updating: the bank is being read · active: working · needs_attention: the
  -- person has to do something at their bank · expired: the bank's own consent
  -- ended or was withdrawn · error: the last read failed and will be retried.
  status text not null default 'updating'
    check (status in ('updating', 'active', 'needs_attention', 'expired', 'error')),
  status_detail text check (length(status_detail) <= 80),
  -- When the consent given at the bank (Open Finance) runs out.
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_item_id)
);
create index if not exists bank_connections_user_idx on public.bank_connections (user_id);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  external_account_id text not null check (length(external_account_id) between 1 and 100),
  kind text not null check (kind in ('checking', 'savings', 'credit_card')),
  name text not null default '' check (length(name) <= 120),
  -- The last four digits only; the full number is never stored.
  last4 text check (last4 ~ '^[0-9]{1,4}$'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  -- Off until the person turns it on. Nothing is read from the bank for an
  -- account that isn't shared.
  shared boolean not null default false,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (connection_id, external_account_id),
  constraint bank_accounts_shared_at check (shared = (shared_at is not null))
);
create index if not exists bank_accounts_user_idx on public.bank_accounts (user_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.bank_accounts (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 100),
  amount bigint not null check (amount between 0 and 999999999999),
  direction text not null check (direction in ('expense', 'income')),
  description text not null default '' check (length(description) <= 200),
  merchant text check (length(merchant) <= 200),
  category text not null default 'Other' check (category = any (public.family_categories())),
  date timestamptz not null,
  status text not null default 'posted' check (status in ('pending', 'posted')),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The same entry arriving twice (a retried webhook, an overlapping sync)
  -- lands on the same row.
  unique (account_id, external_id)
);
create index if not exists bank_transactions_user_date_idx on public.bank_transactions (user_id, date desc);
create index if not exists bank_transactions_account_date_idx on public.bank_transactions (account_id, date desc);

-- Every webhook delivery, by the aggregator's event id: a delivery seen before
-- is acknowledged and not processed again.
create table if not exists public.bank_webhook_events (
  event_id text primary key check (length(event_id) between 1 and 100),
  event text not null check (length(event) <= 60),
  item_id text check (length(item_id) <= 100),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text check (length(error) <= 300)
);

-- Connections whose removal at the aggregator failed (it was unreachable while
-- an account was being deleted, say). The account deletion goes ahead; the
-- connection is retried from here until the aggregator confirms. Holds no
-- reference to a person.
create table if not exists public.bank_item_tombstones (
  provider text not null default 'pluggy',
  external_item_id text not null check (length(external_item_id) between 1 and 100),
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  last_error text check (length(last_error) <= 300),
  primary key (provider, external_item_id)
);

-- ── 3. Row Level Security and grants ─────────────────────────────────────────

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_webhook_events enable row level security;
alter table public.bank_item_tombstones enable row level security;

revoke all on table
  public.bank_connections, public.bank_accounts, public.bank_transactions,
  public.bank_webhook_events, public.bank_item_tombstones
from anon, authenticated;

-- The owner reads their own; nobody writes from the app.
grant select on table public.bank_connections, public.bank_accounts, public.bank_transactions to authenticated;

create policy "bank_connections: owner reads" on public.bank_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bank_accounts: owner reads" on public.bank_accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bank_transactions: owner reads" on public.bank_transactions
  for select to authenticated using (user_id = (select auth.uid()));

-- ── 4. Limits ────────────────────────────────────────────────────────────────

/** The best plan among the families this person shares with. No family: 'none'. */
create or replace function public.family_dependent_plan(p_user uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  -- An aggregate over no rows still returns a row, so "in no family" has to be
  -- counted rather than left to a null.
  select case
           when count(*) = 0 then 'none'
           when bool_or(public.family_plan(f.created_by) = 'paid') then 'paid'
           else 'free'
         end
    from public.family_members m
    join public.families f on f.id = m.family_id
   where m.user_id = p_user and m.role = 'dependent' and m.status = 'active'
$fn$;

/**
 * May this person connect (another) bank? Only someone who is sharing with a
 * family — connections cost money at the aggregator and exist for this
 * feature. One on the free plan, ten when the family pays.
 */
create or replace function public.bank_connection_allowance(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_plan text := public.family_dependent_plan(p_user);
  v_used int := (select count(*) from public.bank_connections c where c.user_id = p_user);
  v_max int := case v_plan when 'paid' then 10 when 'free' then 1 else 0 end;
begin
  return jsonb_build_object(
    'plan', v_plan, 'used', v_used, 'max', v_max,
    'allowed', v_used < v_max,
    'reason', case
      when v_plan = 'none' then 'not_a_dependent'
      when v_used >= v_max and v_plan = 'free' then 'plan_limit_connections'
      when v_used >= v_max then 'too_many_connections'
    end
  );
end;
$fn$;

-- ── 5. What the app calls ────────────────────────────────────────────────────

/**
 * Share an account, or stop. The person's own switch.
 *
 * Unsharing deletes what was stored from that account: the data is kept for
 * sharing and for nothing else. On the free plan one account can be shared.
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
    delete from public.bank_transactions where account_id = p_account;
  end if;

  perform public.family_audit(null, v_uid, v_uid,
    case when p_shared then 'account_shared' else 'account_unshared' end,
    jsonb_build_object('account_id', p_account, 'name', v_account.name, 'last4', v_account.last4));
end;
$fn$;

-- ── 6. What the Edge Functions call (service role only) ──────────────────────

/** Record a connection as the aggregator reports it. Returns the row and the status it had before. */
create or replace function public.bank_upsert_connection(
  p_user uuid,
  p_item text,
  p_institution text,
  p_status text,
  p_detail text default null,
  p_consent_expires timestamptz default null,
  p_synced boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_existing public.bank_connections;
  v_id uuid;
begin
  select * into v_existing from public.bank_connections c where c.provider = 'pluggy' and c.external_item_id = p_item for update;
  if v_existing.id is not null and v_existing.user_id <> p_user then
    -- A connection never changes hands.
    perform public.family_fail('connection_belongs_to_another_account', 409);
  end if;
  if v_existing.id is null then
    insert into public.bank_connections (user_id, external_item_id, institution_name, status, status_detail, consent_expires_at, last_synced_at)
    values (p_user, p_item, coalesce(public.family_clean_text(p_institution, 120), ''), p_status, left(p_detail, 80), p_consent_expires,
            case when p_synced then now() end)
    returning id into v_id;
    perform public.family_audit(null, p_user, p_user, 'bank_connected',
      jsonb_build_object('connection_id', v_id, 'institution', coalesce(public.family_clean_text(p_institution, 120), '')));
  else
    v_id := v_existing.id;
    update public.bank_connections
       set institution_name = coalesce(public.family_clean_text(p_institution, 120), institution_name),
           status = p_status,
           status_detail = left(p_detail, 80),
           consent_expires_at = coalesce(p_consent_expires, consent_expires_at),
           last_synced_at = case when p_synced then now() else last_synced_at end,
           updated_at = now()
     where id = v_id;
  end if;
  return jsonb_build_object('connection_id', v_id, 'user_id', p_user, 'previous_status', v_existing.status, 'status', p_status);
end;
$fn$;

/**
 * Record the accounts of a connection: [{ external_id, kind, name, last4, currency }].
 * New ones arrive unshared. Ones the bank no longer reports are removed.
 */
create or replace function public.bank_upsert_accounts(p_connection uuid, p_accounts jsonb)
returns setof public.bank_accounts language plpgsql security definer set search_path = '' as $fn$
declare
  v_user uuid := (select c.user_id from public.bank_connections c where c.id = p_connection);
begin
  if v_user is null then
    perform public.family_fail('connection_not_found', 404);
  end if;
  insert into public.bank_accounts (connection_id, user_id, external_account_id, kind, name, last4, currency)
  select p_connection, v_user, a ->> 'external_id', a ->> 'kind',
         coalesce(public.family_clean_text(a ->> 'name', 120), ''),
         nullif(right(regexp_replace(coalesce(a ->> 'last4', ''), '[^0-9]', '', 'g'), 4), ''),
         coalesce(nullif(a ->> 'currency', ''), 'BRL')
    from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) a
  on conflict (connection_id, external_account_id) do update
    set kind = excluded.kind, name = excluded.name, last4 = excluded.last4, currency = excluded.currency;

  delete from public.bank_accounts b
   where b.connection_id = p_connection
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_accounts, '[]'::jsonb)) a
        where a ->> 'external_id' = b.external_account_id
     );

  return query select * from public.bank_accounts b where b.connection_id = p_connection order by b.created_at, b.id;
end;
$fn$;

/**
 * Store entries for one account:
 *   [{ external_id, amount, direction, description, merchant, category, date, status, currency }]
 * Only for a shared account — anything else is refused, not stored. An entry
 * seen before is updated in place (a pending purchase becoming posted), never
 * duplicated. Returns how many were new and how many changed.
 */
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
  if not v_account.shared then
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

/** Remove entries the bank withdrew. */
create or replace function public.bank_delete_transactions(p_account uuid, p_external_ids text[])
returns int language plpgsql security definer set search_path = '' as $fn$
declare
  n int;
begin
  delete from public.bank_transactions t
   where t.account_id = p_account and t.external_id = any (coalesce(p_external_ids, '{}'::text[]));
  get diagnostics n = row_count;
  return n;
end;
$fn$;

/** Forget a connection and everything read through it. */
create or replace function public.bank_remove_connection(p_connection uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_conn public.bank_connections;
begin
  select * into v_conn from public.bank_connections c where c.id = p_connection;
  if v_conn.id is null then return; end if;
  delete from public.bank_connections where id = p_connection;
  perform public.family_audit(null, v_conn.user_id, v_conn.user_id, 'bank_disconnected',
    jsonb_build_object('connection_id', p_connection, 'institution', v_conn.institution_name));
end;
$fn$;

-- ── 7. Who may call what ─────────────────────────────────────────────────────

do $do$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proname like 'bank\_%' or p.proname in ('family_categories', 'family_dependent_plan'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$do$;

grant execute on function public.bank_account_set_shared(uuid, boolean) to authenticated;
grant execute on function public.family_categories() to authenticated;
