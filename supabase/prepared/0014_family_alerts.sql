-- 0014 — Flow Family: alert rules, alerts and push tokens.
--
-- PREPARED, NOT APPLIED. Apply after 0013.
-- Tested in supabase/tests/pg/family_alerts.test.ts.
--
-- A guardian chooses what they want to be told about a dependent:
--   large_purchase      an expense at or above an amount          (free plan)
--   connection_expired  a bank connection that stopped working    (free plan)
--   sensitive_category  an expense in a chosen category — betting,
--                       by default                                (paid plan)
--   budget_exceeded     a month's spending passing a budget       (paid plan)
--
-- Where the rules run. In the database, in the same transaction that stores
-- the bank entry: an alert exists if and only if the entry does, the consent
-- and plan are checked by the same functions as every read, and no other
-- service has to be trusted to apply them. The Edge Function that received
-- the bank's webhook then only delivers what is already here.
--
-- An alert is created once: each has a `dedupe_key`, so the same entry
-- arriving twice, or two entries crossing the same budget in one month, don't
-- repeat it. Entries older than three days never alert, so connecting a bank
-- and loading its history doesn't produce a flood about the past.

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.family_alert_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  guardian_id uuid not null references auth.users (id) on delete cascade,
  dependent_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('large_purchase', 'sensitive_category', 'budget_exceeded', 'connection_expired')),
  enabled boolean not null default true,
  -- large_purchase: the amount, in cents.
  threshold bigint check (threshold between 1 and 999999999999),
  -- sensitive_category: which ones. Null means the default, betting.
  categories text[] check (categories <@ public.family_categories()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guardian_id, dependent_id, kind)
);
create index if not exists family_alert_rules_dependent_idx on public.family_alert_rules (dependent_id) where enabled;

create table if not exists public.family_alert_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  guardian_id uuid not null references auth.users (id) on delete cascade,
  dependent_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('large_purchase', 'sensitive_category', 'budget_exceeded', 'connection_expired')),
  transaction_id uuid references public.bank_transactions (id) on delete cascade,
  connection_id uuid references public.bank_connections (id) on delete cascade,
  -- What the alert is about, for the list in the app. Never sent in a push.
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 2000),
  dedupe_key text not null unique check (length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_status text not null default 'pending' check (push_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  push_attempted_at timestamptz
);
create index if not exists family_alert_events_guardian_idx on public.family_alert_events (guardian_id, created_at desc);
create index if not exists family_alert_events_push_idx on public.family_alert_events (created_at) where push_status in ('pending', 'sending');

-- One row per installed app that may receive a push. A token belongs to the
-- account signed in on that phone, and moves when someone else signs in.
create table if not exists public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,100}\]$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ── 2. Row Level Security and grants ─────────────────────────────────────────

alter table public.family_alert_rules enable row level security;
alter table public.family_alert_events enable row level security;
alter table public.push_tokens enable row level security;

revoke all on table public.family_alert_rules, public.family_alert_events, public.push_tokens from anon, authenticated;
grant select on table public.family_alert_rules, public.family_alert_events to authenticated;

create policy "family_alert_rules: the guardian, while they may view" on public.family_alert_rules
  for select to authenticated
  using (guardian_id = (select auth.uid()) and public.family_can_view(dependent_id));
-- Transparency: a dependent sees what alerts exist about them.
create policy "family_alert_rules: the dependent they are about" on public.family_alert_rules
  for select to authenticated
  using (dependent_id = (select auth.uid()));

create policy "family_alert_events: the guardian, while they may view" on public.family_alert_events
  for select to authenticated
  using (guardian_id = (select auth.uid()) and public.family_can_view(dependent_id));
create policy "family_alert_events: the dependent they are about" on public.family_alert_events
  for select to authenticated
  using (dependent_id = (select auth.uid()));

-- ── 3. Rules ─────────────────────────────────────────────────────────────────

create or replace function public.family_alert_rule_set(
  p_family uuid,
  p_dependent uuid,
  p_kind text,
  p_enabled boolean,
  p_threshold bigint default null,
  p_categories text[] default null
)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
  v_enabled boolean := coalesce(p_enabled, false);
begin
  if not public.family_guardian_can_view(v_uid, p_dependent)
     or public.family_shared_family(v_uid, p_dependent) is distinct from p_family then
    perform public.family_fail('no_access', 403);
  end if;
  if p_kind is null or p_kind not in ('large_purchase', 'sensitive_category', 'budget_exceeded', 'connection_expired') then
    perform public.family_fail('invalid_kind', 400);
  end if;
  if v_enabled and p_kind in ('sensitive_category', 'budget_exceeded') and public.family_plan(v_uid) <> 'paid' then
    perform public.family_fail('plan_limit_alerts', 402);
  end if;
  if p_kind = 'large_purchase' and v_enabled and (p_threshold is null or p_threshold < 1 or p_threshold > 999999999999) then
    perform public.family_fail('invalid_amount', 400);
  end if;
  if p_categories is not null and not (p_categories <@ public.family_categories()) then
    perform public.family_fail('invalid_category', 400);
  end if;

  insert into public.family_alert_rules (family_id, guardian_id, dependent_id, kind, enabled, threshold, categories)
  values (
    p_family, v_uid, p_dependent, p_kind, v_enabled,
    case when p_kind = 'large_purchase' then p_threshold end,
    case when p_kind = 'sensitive_category' then nullif(p_categories, '{}'::text[]) end
  )
  on conflict (guardian_id, dependent_id, kind) do update
    set enabled = excluded.enabled,
        threshold = coalesce(excluded.threshold, public.family_alert_rules.threshold),
        categories = excluded.categories,
        family_id = excluded.family_id,
        updated_at = now();

  perform public.family_audit(p_family, v_uid, p_dependent, 'alert_rule_set',
    jsonb_build_object('kind', p_kind, 'enabled', v_enabled, 'threshold', p_threshold));
end;
$fn$;

create or replace function public.family_alerts_mark_read(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  update public.family_alert_events
     set read_at = now()
   where guardian_id = v_uid and id = any (coalesce(p_ids, '{}'::uuid[])) and read_at is null;
end;
$fn$;

-- Sharing starts with one alert on: being told when a bank connection stops
-- working is what keeps everything else from quietly going stale.
create or replace function public.family_consent_default_rules()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.family_alert_rules (family_id, guardian_id, dependent_id, kind, enabled)
  values (new.family_id, new.guardian_id, new.dependent_id, 'connection_expired', true)
  on conflict (guardian_id, dependent_id, kind) do nothing;
  return null;
end;
$fn$;

drop trigger if exists family_consents_default_rules on public.family_consents;
create trigger family_consents_default_rules after insert on public.family_consents
  for each row execute function public.family_consent_default_rules();

-- ── 4. Evaluation ────────────────────────────────────────────────────────────

/**
 * The first instant of the month `p_at` falls in, in Brasília time (UTC−3,
 * with no daylight saving since 2019): the clock Brazilian banks date entries
 * by, and so the month a budget means.
 */
create or replace function public.family_month_start(p_at timestamptz)
returns timestamptz language sql immutable set search_path = '' as $fn$
  select (date_trunc('month', (p_at at time zone 'UTC') - interval '3 hours') + interval '3 hours') at time zone 'UTC'
$fn$;

create or replace function public.family_alerts_on_transactions()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_month timestamptz := public.family_month_start(now());
begin
  -- A purchase at or above the guardian's amount.
  insert into public.family_alert_events (family_id, guardian_id, dependent_id, kind, transaction_id, detail, dedupe_key)
  select r.family_id, r.guardian_id, n.user_id, 'large_purchase', n.id,
         jsonb_build_object('threshold', r.threshold),
         'large:' || r.id || ':' || n.id
    from new_rows n
    join public.family_alert_rules r
      on r.dependent_id = n.user_id and r.kind = 'large_purchase' and r.enabled and r.threshold is not null
   where n.direction = 'expense'
     and n.category <> 'Internal'
     and n.amount >= r.threshold
     and n.date > now() - interval '3 days'
     and public.family_account_viewable(r.guardian_id, n.account_id)
  on conflict (dedupe_key) do nothing;

  -- A purchase in a category the guardian follows (paid plan).
  insert into public.family_alert_events (family_id, guardian_id, dependent_id, kind, transaction_id, detail, dedupe_key)
  select r.family_id, r.guardian_id, n.user_id, 'sensitive_category', n.id,
         jsonb_build_object('category', n.category),
         'sensitive:' || r.id || ':' || n.id
    from new_rows n
    join public.family_alert_rules r
      on r.dependent_id = n.user_id and r.kind = 'sensitive_category' and r.enabled
   where n.direction = 'expense'
     and n.category = any (coalesce(r.categories, array['Betting & lotteries']))
     and n.date > now() - interval '3 days'
     and public.family_plan(r.guardian_id) = 'paid'
     and public.family_account_viewable(r.guardian_id, n.account_id)
  on conflict (dedupe_key) do nothing;

  -- This month's spending passing a budget (paid plan). Once per budget per month.
  insert into public.family_alert_events (family_id, guardian_id, dependent_id, kind, detail, dedupe_key)
  select b.family_id, b.guardian_id, b.dependent_id, 'budget_exceeded',
         jsonb_build_object('category', b.category, 'limit', b."limit", 'month', to_char(v_month + interval '1 day', 'YYYY-MM')),
         'budget:' || b.guardian_id || ':' || b.dependent_id || ':' || b.category || ':' || to_char(v_month + interval '1 day', 'YYYY-MM')
    from (select distinct n.user_id from new_rows n) u
    join public.family_budgets b on b.dependent_id = u.user_id
    join public.family_alert_rules r
      on r.guardian_id = b.guardian_id and r.dependent_id = b.dependent_id and r.kind = 'budget_exceeded' and r.enabled
   where public.family_plan(b.guardian_id) = 'paid'
     and public.family_guardian_can_view(b.guardian_id, b.dependent_id)
     and (
       select coalesce(sum(t.amount), 0)
         from public.bank_transactions t
        where t.user_id = b.dependent_id
          and t.direction = 'expense'
          and t.category <> 'Internal'
          and (b.category = 'total' or t.category = b.category)
          and t.date >= v_month
          and public.family_account_viewable(b.guardian_id, t.account_id)
     ) > b."limit"
  on conflict (dedupe_key) do nothing;

  return null;
end;
$fn$;

drop trigger if exists bank_transactions_alerts on public.bank_transactions;
create trigger bank_transactions_alerts after insert on public.bank_transactions
  referencing new table as new_rows for each statement execute function public.family_alerts_on_transactions();

-- A connection that needs the dependent to act. Once a day per connection.
create or replace function public.family_alerts_on_connection()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.status in ('expired', 'needs_attention') and new.status is distinct from old.status then
    insert into public.family_alert_events (family_id, guardian_id, dependent_id, kind, connection_id, detail, dedupe_key)
    select r.family_id, r.guardian_id, new.user_id, 'connection_expired', new.id,
           jsonb_build_object('institution', new.institution_name, 'status', new.status),
           'conn:' || r.id || ':' || new.id || ':' || to_char(now(), 'YYYY-MM-DD')
      from public.family_alert_rules r
     where r.dependent_id = new.user_id and r.kind = 'connection_expired' and r.enabled
       and public.family_guardian_can_view(r.guardian_id, new.user_id)
       -- Only if this guardian was seeing something through it.
       and exists (
         select 1 from public.bank_accounts a
          where a.connection_id = new.id and public.family_account_viewable(r.guardian_id, a.id)
       )
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$fn$;

drop trigger if exists bank_connections_alerts on public.bank_connections;
create trigger bank_connections_alerts after update on public.bank_connections
  for each row execute function public.family_alerts_on_connection();

-- Tell the guardian's open app that there is a new alert.
create or replace function public.family_alert_event_signal()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.family_signal(new.dependent_id, 'alerts', new.guardian_id);
  return null;
end;
$fn$;

drop trigger if exists family_alert_events_signal on public.family_alert_events;
create trigger family_alert_events_signal after insert on public.family_alert_events
  for each row execute function public.family_alert_event_signal();

-- ── 5. When sharing stops ────────────────────────────────────────────────────
-- Alerts carry the dependent's data. When a consent ends they are deleted for
-- that guardian — not just hidden. (A consent replaced by its renewal isn't an
-- end.) Rules go when the dependent leaves the family.

create or replace function public.family_consent_end_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if old.status = 'active' and new.status <> 'active' and new.end_reason is distinct from 'renewed' then
    delete from public.family_alert_events
     where guardian_id = new.guardian_id and dependent_id = new.dependent_id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists family_consents_end_cleanup on public.family_consents;
create trigger family_consents_end_cleanup after update on public.family_consents
  for each row execute function public.family_consent_end_cleanup();

create or replace function public.family_member_cleanup_alerts()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.role = 'dependent' and new.status <> 'active' and old.status = 'active' then
    delete from public.family_alert_rules where family_id = new.family_id and dependent_id = new.user_id;
    delete from public.family_alert_events where family_id = new.family_id and dependent_id = new.user_id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists family_members_cleanup_alerts on public.family_members;
create trigger family_members_cleanup_alerts after update on public.family_members
  for each row execute function public.family_member_cleanup_alerts();

-- ── 6. Push tokens ───────────────────────────────────────────────────────────

/** This phone now receives pushes for the account signed in on it — and for no other. */
create or replace function public.push_token_register(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,100}\]$' then
    perform public.family_fail('invalid_token', 400);
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    perform public.family_fail('invalid_platform', 400);
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
  -- A handful of devices is plenty; drop the oldest beyond that.
  delete from public.push_tokens t
   where t.user_id = v_uid
     and t.token not in (
       select k.token from public.push_tokens k where k.user_id = v_uid order by k.last_seen_at desc limit 10
     );
end;
$fn$;

/** Signing out: this phone stops receiving this account's pushes. */
create or replace function public.push_token_remove(p_token text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  delete from public.push_tokens where token = p_token and user_id = v_uid;
end;
$fn$;

-- ── 7. Delivery (service role only) ──────────────────────────────────────────

/**
 * Take a batch of alerts to deliver. Claimed alerts are marked `sending`, so
 * two webhook runs at once don't both send the same one; a claim abandoned
 * for five minutes can be taken again. An alert whose guardian can no longer
 * view the dependent is skipped, as is one with no device to send to.
 *
 * Returns only what a push may carry: the kind and the name the guardian
 * knows the dependent by. No amount, no merchant.
 */
create or replace function public.family_push_claim(p_limit int default 50)
returns table (event_id uuid, guardian_id uuid, kind text, dependent_name text, tokens text[])
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.family_alert_events e
     set push_status = 'skipped', push_attempted_at = now()
   where e.push_status in ('pending', 'sending')
     and (e.push_status = 'pending' or e.push_attempted_at < now() - interval '5 minutes')
     and (
       not public.family_guardian_can_view(e.guardian_id, e.dependent_id)
       or not exists (select 1 from public.push_tokens t where t.user_id = e.guardian_id)
       -- Old news isn't worth a notification.
       or e.created_at < now() - interval '1 day'
     );

  return query
    with claimed as (
      update public.family_alert_events e
         set push_status = 'sending', push_attempted_at = now()
       where e.id in (
         select c.id from public.family_alert_events c
          where c.push_status = 'pending'
             or (c.push_status = 'sending' and c.push_attempted_at < now() - interval '5 minutes')
          order by c.created_at
          limit least(greatest(coalesce(p_limit, 50), 1), 200)
          for update skip locked
       )
      returning e.id, e.guardian_id, e.kind, e.family_id, e.dependent_id
    )
    select c.id, c.guardian_id, c.kind,
           coalesce((select m.display_name from public.family_members m
                      where m.family_id = c.family_id and m.user_id = c.dependent_id), 'Someone'),
           array(select t.token from public.push_tokens t where t.user_id = c.guardian_id)
      from claimed c;
end;
$fn$;

/** Record how delivery went, and forget tokens the push service says are dead. */
create or replace function public.family_push_finish(p_sent uuid[], p_failed uuid[], p_dead_tokens text[] default null)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  update public.family_alert_events set push_status = 'sent', push_attempted_at = now()
   where id = any (coalesce(p_sent, '{}'::uuid[])) and push_status = 'sending';
  update public.family_alert_events set push_status = 'failed', push_attempted_at = now()
   where id = any (coalesce(p_failed, '{}'::uuid[])) and push_status = 'sending';
  delete from public.push_tokens where token = any (coalesce(p_dead_tokens, '{}'::text[]));
end;
$fn$;

-- ── 8. The overview, now with the rules ──────────────────────────────────────

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
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind, 'enabled', r.enabled, 'threshold', r.threshold, 'categories', r.categories
      ) order by r.kind)
        from public.family_alert_rules r
       where r.guardian_id = v_uid and r.dependent_id = p_dependent
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ── 9. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.family_alert_rule_set(uuid, uuid, text, boolean, bigint, text[]),
  public.family_alerts_mark_read(uuid[]),
  public.family_consent_default_rules(),
  public.family_month_start(timestamptz),
  public.family_alerts_on_transactions(),
  public.family_alerts_on_connection(),
  public.family_alert_event_signal(),
  public.family_consent_end_cleanup(),
  public.family_member_cleanup_alerts(),
  public.push_token_register(text, text),
  public.push_token_remove(text),
  public.family_push_claim(int),
  public.family_push_finish(uuid[], uuid[], text[]),
  public.family_dependent_overview(uuid)
from public, anon, authenticated;

grant execute on function
  public.family_alert_rule_set(uuid, uuid, text, boolean, bigint, text[]),
  public.family_alerts_mark_read(uuid[]),
  public.push_token_register(text, text),
  public.push_token_remove(text),
  public.family_dependent_overview(uuid)
to authenticated;
