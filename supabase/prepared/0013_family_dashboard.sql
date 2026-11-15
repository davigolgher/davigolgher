-- 0013 — Flow Family: what a guardian reads, the record of each read, live
-- signals and the dependent's budgets.
--
-- PREPARED, NOT APPLIED. Apply after 0012.
-- Tested in supabase/tests/pg/family_bank.test.ts.
--
-- How a guardian reads. Not from the tables: they have no policy on
-- bank_transactions. They call family_transactions(), which
--   1. checks the access rule (0011: an active, unexpired consent between two
--      active members, on a plan that covers that dependent);
--   2. returns only entries of accounts the dependent has switched to shared
--      (and, on the free plan, only of the first one);
--   3. writes the read into the audit log, where the dependent sees it.
-- A policy would do 1 and 2, but would leave 3 to the app — and an access
-- history that a modified app can skip is not a history.

-- ── 1. Which accounts a guardian may see ─────────────────────────────────────

create or replace function public.family_account_viewable(p_guardian uuid, p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1
      from public.bank_accounts a
     where a.id = p_account
       and a.shared
       and public.family_guardian_can_view(p_guardian, a.user_id)
       and (
         public.family_plan(p_guardian) = 'paid'
         -- Free plan: the first account the dependent shared.
         or a.id = (
           select b.id from public.bank_accounts b
            where b.user_id = a.user_id and b.shared
            order by b.shared_at, b.id
            limit 1
         )
       )
  )
$fn$;

/** One audit line per kind of read every 30 minutes: a history to read, not a log of every refresh. */
create or replace function public.family_log_access(
  p_family uuid, p_actor uuid, p_subject uuid, p_action text, p_detail jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if exists (
    select 1 from public.family_audit_log l
     where l.actor_id = p_actor and l.subject_id = p_subject and l.action = p_action
       and l.created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  perform public.family_audit(p_family, p_actor, p_subject, p_action, p_detail);
end;
$fn$;

/** The family through which this guardian currently sees this dependent. */
create or replace function public.family_shared_family(p_guardian uuid, p_dependent uuid)
returns uuid language sql stable security definer set search_path = '' as $fn$
  select c.family_id
    from public.family_consents c
   where c.guardian_id = p_guardian and c.dependent_id = p_dependent and c.status = 'active'
   limit 1
$fn$;

-- ── 2. Reading ───────────────────────────────────────────────────────────────

/**
 * A dependent's shared bank entries, newest first, for the guardian calling.
 * `p_from` inclusive, `p_to` exclusive. At most 1,000 a call; page with
 * `p_offset`.
 */
create or replace function public.family_transactions(
  p_dependent uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 500,
  p_offset int default 0
)
returns table (
  id uuid, account_id uuid, amount bigint, direction text, description text,
  merchant text, category text, date timestamptz, status text, currency text
)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if not public.family_guardian_can_view(v_uid, p_dependent) then
    perform public.family_fail('no_access', 403);
  end if;
  perform public.family_log_access(
    public.family_shared_family(v_uid, p_dependent), v_uid, p_dependent, 'viewed_transactions');
  return query
    select t.id, t.account_id, t.amount, t.direction, t.description, t.merchant, t.category, t.date, t.status, t.currency
      from public.bank_transactions t
     where t.user_id = p_dependent
       and t.account_id in (
         select a.id from public.bank_accounts a
          where a.user_id = p_dependent and public.family_account_viewable(v_uid, a.id)
       )
       and (p_from is null or t.date >= p_from)
       and (p_to is null or t.date < p_to)
     order by t.date desc, t.id
     limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

-- ── 3. Budgets a guardian follows for a dependent ────────────────────────────
-- A monthly amount per category (or 'total'), to compare spending against.
-- It blocks nothing. The dependent can read the ones set for them.

create table if not exists public.family_budgets (
  family_id uuid not null references public.families (id) on delete cascade,
  guardian_id uuid not null references auth.users (id) on delete cascade,
  dependent_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category = 'total' or category = any (public.family_categories())),
  "limit" bigint not null check ("limit" between 1 and 999999999999),
  updated_at timestamptz not null default now(),
  primary key (guardian_id, dependent_id, category)
);
create index if not exists family_budgets_dependent_idx on public.family_budgets (dependent_id);

alter table public.family_budgets enable row level security;
revoke all on table public.family_budgets from anon, authenticated;
grant select on table public.family_budgets to authenticated;
create policy "family_budgets: the guardian, while they may view" on public.family_budgets
  for select to authenticated
  using (guardian_id = (select auth.uid()) and public.family_can_view(dependent_id));
create policy "family_budgets: the dependent they are about" on public.family_budgets
  for select to authenticated
  using (dependent_id = (select auth.uid()));

/** Set a monthly limit for a category; a null or zero limit removes it. */
create or replace function public.family_budget_set(p_family uuid, p_dependent uuid, p_category text, p_limit bigint)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
begin
  if not public.family_guardian_can_view(v_uid, p_dependent)
     or public.family_shared_family(v_uid, p_dependent) is distinct from p_family then
    perform public.family_fail('no_access', 403);
  end if;
  if p_category is null or not (p_category = 'total' or p_category = any (public.family_categories())) then
    perform public.family_fail('invalid_category', 400);
  end if;
  if coalesce(p_limit, 0) <= 0 then
    delete from public.family_budgets
     where guardian_id = v_uid and dependent_id = p_dependent and category = p_category;
  else
    if p_limit > 999999999999 then
      perform public.family_fail('invalid_amount', 400);
    end if;
    insert into public.family_budgets (family_id, guardian_id, dependent_id, category, "limit")
    values (p_family, v_uid, p_dependent, p_category, p_limit)
    on conflict (guardian_id, dependent_id, category) do update set "limit" = excluded."limit", updated_at = now();
  end if;
  perform public.family_audit(p_family, v_uid, p_dependent, 'budget_set',
    jsonb_build_object('category', p_category, 'limit', nullif(greatest(coalesce(p_limit, 0), 0), 0)));
end;
$fn$;

/**
 * What a guardian needs about one dependent besides the entries themselves:
 * the shared accounts, the state of each bank connection and the budgets.
 * Names and states only — no amounts from the bank.
 */
create or replace function public.family_dependent_overview(p_dependent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if not public.family_guardian_can_view(v_uid, p_dependent) then
    perform public.family_fail('no_access', 403);
  end if;
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'kind', a.kind, 'last4', a.last4, 'currency', a.currency,
        'institution', c.institution_name,
        'locked', not public.family_account_viewable(v_uid, a.id)
      ) order by a.shared_at, a.id)
        from public.bank_accounts a
        join public.bank_connections c on c.id = a.connection_id
       where a.user_id = p_dependent and a.shared
    ), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'institution', c.institution_name, 'status', c.status,
        'consent_expires_at', c.consent_expires_at, 'last_synced_at', c.last_synced_at
      ) order by c.created_at, c.id)
        from public.bank_connections c
       where c.user_id = p_dependent
         and exists (select 1 from public.bank_accounts a where a.connection_id = c.id and a.shared)
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object('category', b.category, 'limit', b."limit") order by b.category)
        from public.family_budgets b
       where b.guardian_id = v_uid and b.dependent_id = p_dependent
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ── 4. Live signals ──────────────────────────────────────────────────────────
-- "Something changed for this dependent" — and nothing more. The app listens
-- to this table over Realtime and then reads through the functions above, so
-- the financial data itself only ever travels by the checked, recorded path.
-- `audience_id` addresses a signal to one person: how a guardian hears that
-- sharing stopped, at the moment they lose the right to hear anything else.

create table if not exists public.family_sync_signals (
  id bigint generated always as identity primary key,
  dependent_id uuid not null references auth.users (id) on delete cascade,
  audience_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('transactions', 'connection', 'sharing', 'alerts', 'budgets')),
  created_at timestamptz not null default now()
);
create index if not exists family_sync_signals_created_idx on public.family_sync_signals (created_at);

alter table public.family_sync_signals enable row level security;
revoke all on table public.family_sync_signals from anon, authenticated;
revoke all on sequence public.family_sync_signals_id_seq from anon, authenticated;
grant select on table public.family_sync_signals to authenticated;
create policy "family_sync_signals: about me, to me, or about someone I may view" on public.family_sync_signals
  for select to authenticated
  using (
    dependent_id = (select auth.uid())
    or audience_id = (select auth.uid())
    or (audience_id is null and public.family_can_view(dependent_id))
  );

create or replace function public.family_signal(p_dependent uuid, p_kind text, p_audience uuid default null)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  begin
    insert into public.family_sync_signals (dependent_id, audience_id, kind) values (p_dependent, p_audience, p_kind);
  exception when foreign_key_violation then
    -- The account is being deleted, and this is its rows going with it:
    -- there is no one left to signal, and the deletion must not fail over it.
    return;
  end;
  -- Signals are only useful for a moment.
  delete from public.family_sync_signals where created_at < now() - interval '1 day';
end;
$fn$;

create or replace function public.family_signal_bank_transactions()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  r record;
begin
  for r in select distinct c.user_id from changed c loop
    perform public.family_signal(r.user_id, 'transactions');
  end loop;
  return null;
end;
$fn$;

drop trigger if exists bank_transactions_signal_insert on public.bank_transactions;
create trigger bank_transactions_signal_insert after insert on public.bank_transactions
  referencing new table as changed for each statement execute function public.family_signal_bank_transactions();
drop trigger if exists bank_transactions_signal_update on public.bank_transactions;
create trigger bank_transactions_signal_update after update on public.bank_transactions
  referencing new table as changed for each statement execute function public.family_signal_bank_transactions();
drop trigger if exists bank_transactions_signal_delete on public.bank_transactions;
create trigger bank_transactions_signal_delete after delete on public.bank_transactions
  referencing old table as changed for each statement execute function public.family_signal_bank_transactions();

create or replace function public.family_signal_row()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if TG_TABLE_NAME = 'bank_connections' then
    if TG_OP = 'DELETE' then
      perform public.family_signal(old.user_id, 'connection');
    elsif TG_OP = 'INSERT' or new.status is distinct from old.status then
      perform public.family_signal(new.user_id, 'connection');
    end if;
  elsif TG_TABLE_NAME = 'bank_accounts' then
    if TG_OP = 'UPDATE' and new.shared is distinct from old.shared then
      perform public.family_signal(new.user_id, 'sharing');
    end if;
  elsif TG_TABLE_NAME = 'family_consents' then
    -- To the guardian by name: after a consent ends they can no longer read
    -- signals about the dependent, and this is the one they need.
    if TG_OP = 'INSERT' or new.status is distinct from old.status then
      perform public.family_signal(new.dependent_id, 'sharing', new.guardian_id);
    end if;
  elsif TG_TABLE_NAME = 'family_budgets' then
    perform public.family_signal(coalesce(new.dependent_id, old.dependent_id), 'budgets');
  end if;
  return null;
end;
$fn$;

drop trigger if exists bank_connections_signal on public.bank_connections;
create trigger bank_connections_signal after insert or update or delete on public.bank_connections
  for each row execute function public.family_signal_row();
drop trigger if exists bank_accounts_signal on public.bank_accounts;
create trigger bank_accounts_signal after update on public.bank_accounts
  for each row execute function public.family_signal_row();
drop trigger if exists family_consents_signal on public.family_consents;
create trigger family_consents_signal after insert or update on public.family_consents
  for each row execute function public.family_signal_row();
drop trigger if exists family_budgets_signal on public.family_budgets;
create trigger family_budgets_signal after insert or update or delete on public.family_budgets
  for each row execute function public.family_signal_row();

-- Realtime delivers a table's changes only if the table is in its publication.
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'family_sync_signals'
     ) then
    alter publication supabase_realtime add table public.family_sync_signals;
  end if;
end;
$do$;

-- ── 5. When someone stops being followed ─────────────────────────────────────
-- Budgets belong to a guardian–dependent pair. When the dependent leaves or is
-- removed they go; a consent that merely ended keeps them, so sharing again
-- picks up where it was.

create or replace function public.family_member_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.role = 'dependent' and new.status <> 'active' and old.status = 'active' then
    delete from public.family_budgets where family_id = new.family_id and dependent_id = new.user_id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists family_members_cleanup on public.family_members;
create trigger family_members_cleanup after update on public.family_members
  for each row execute function public.family_member_cleanup();

-- ── 6. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.family_account_viewable(uuid, uuid),
  public.family_log_access(uuid, uuid, uuid, text, jsonb),
  public.family_shared_family(uuid, uuid),
  public.family_transactions(uuid, timestamptz, timestamptz, int, int),
  public.family_budget_set(uuid, uuid, text, bigint),
  public.family_dependent_overview(uuid),
  public.family_signal(uuid, text, uuid),
  public.family_signal_bank_transactions(),
  public.family_signal_row(),
  public.family_member_cleanup()
from public, anon, authenticated;

grant execute on function
  public.family_transactions(uuid, timestamptz, timestamptz, int, int),
  public.family_budget_set(uuid, uuid, text, bigint),
  public.family_dependent_overview(uuid)
to authenticated;
