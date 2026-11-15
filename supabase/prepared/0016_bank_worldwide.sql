-- Flow Family: banks anywhere, not only in Brazil.
--
-- No single aggregator reaches every bank in the world, so a connection now
-- names the one that made it:
--   · pluggy   — Brazil (Open Finance Brasil)
--   · plaid    — United States, Canada, United Kingdom and 17 EU/EEA countries
--   · saltedge — the rest of the countries with open banking it covers
--                (Europe, the Americas, Asia-Pacific, the Middle East)
-- The server picks the provider from the country the person chooses.
--
-- Additive only:
--   1. Which provider and country each connection belongs to.
--   2. What only the server may hold: Plaid's per-connection access tokens
--      (encrypted by the Edge Functions before they get here), Salt Edge's
--      customer per person, and the connection windows the app opened.
--   3. Money in more than one currency: a budget and a purchase-alert amount
--      each have a currency, and only entries in that currency count.
--   4. Months in the dependent's own time zone, not Brazil's.
--   5. A new version of the consent terms naming the providers.

-- ── 1. Providers and countries ───────────────────────────────────────────────

alter table public.bank_connections drop constraint if exists bank_connections_provider_check;
alter table public.bank_connections
  add constraint bank_connections_provider_check check (provider in ('pluggy', 'plaid', 'saltedge'));
alter table public.bank_connections add column if not exists country_code text check (country_code ~ '^[A-Z]{2}$');

-- A connection queued to be ended may need its credential to end it (Plaid's
-- access token, still encrypted). Still nothing that names the person.
alter table public.bank_item_tombstones add column if not exists credential text check (length(credential) <= 2000);
alter table public.bank_item_tombstones add column if not exists environment text check (environment in ('production', 'sandbox'));

-- ── 2. Held for the server alone ─────────────────────────────────────────────

-- Plaid hands back an access token per connection; every later read needs it.
-- Stored only as the Edge Functions' ciphertext (AES-GCM, key in their
-- secrets), so a copy of the database alone can't use it.
create table if not exists public.bank_credentials (
  connection_id uuid primary key references public.bank_connections (id) on delete cascade,
  secret text not null check (length(secret) between 1 and 2000),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  -- Plaid's transactions/sync cursor: where the last read stopped.
  sync_cursor text check (length(sync_cursor) <= 2000),
  updated_at timestamptz not null default now()
);

-- Salt Edge keeps connections under a "customer"; one per person.
create table if not exists public.bank_customers (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('saltedge')),
  external_customer_id text not null check (length(external_customer_id) between 1 and 100),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, external_customer_id)
);

-- A connection window the app opened in the browser (Plaid Hosted Link, Salt
-- Edge Connect). Finishing it is checked against who opened it, so nobody can
-- claim a connection made in someone else's window.
create table if not exists public.bank_link_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('plaid', 'saltedge')),
  external_ref text not null check (length(external_ref) between 1 and 500),
  environment text not null default 'production' check (environment in ('production', 'sandbox')),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  reconnect_connection uuid references public.bank_connections (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);
create index if not exists bank_link_sessions_ref_idx on public.bank_link_sessions (provider, external_ref);

alter table public.bank_credentials enable row level security;
alter table public.bank_customers enable row level security;
alter table public.bank_link_sessions enable row level security;
revoke all on table public.bank_credentials, public.bank_customers, public.bank_link_sessions from anon, authenticated;

drop function if exists public.bank_upsert_connection(uuid, text, text, text, text, timestamptz, boolean);
create or replace function public.bank_upsert_connection(
  p_user uuid,
  p_item text,
  p_institution text,
  p_status text,
  p_detail text default null,
  p_consent_expires timestamptz default null,
  p_synced boolean default false,
  p_provider text default 'pluggy',
  p_country text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_existing public.bank_connections;
  v_id uuid;
  v_country text := case when upper(p_country) ~ '^[A-Z]{2}$' then upper(p_country) end;
begin
  if p_provider is null or p_provider not in ('pluggy', 'plaid', 'saltedge') then
    perform public.family_fail('invalid_provider', 400);
  end if;
  select * into v_existing from public.bank_connections c where c.provider = p_provider and c.external_item_id = p_item for update;
  if v_existing.id is not null and v_existing.user_id <> p_user then
    -- A connection never changes hands.
    perform public.family_fail('connection_belongs_to_another_account', 409);
  end if;
  if v_existing.id is null then
    insert into public.bank_connections (user_id, provider, country_code, external_item_id, institution_name, status, status_detail, consent_expires_at, last_synced_at)
    values (p_user, p_provider, v_country, p_item, coalesce(public.family_clean_text(p_institution, 120), ''), p_status, left(p_detail, 80), p_consent_expires,
            case when p_synced then now() end)
    returning id into v_id;
    perform public.family_audit(null, p_user, p_user, 'bank_connected',
      jsonb_build_object('connection_id', v_id, 'institution', coalesce(public.family_clean_text(p_institution, 120), ''), 'provider', p_provider));
  else
    v_id := v_existing.id;
    update public.bank_connections
       set institution_name = coalesce(public.family_clean_text(p_institution, 120), institution_name),
           status = p_status,
           status_detail = left(p_detail, 80),
           consent_expires_at = coalesce(p_consent_expires, consent_expires_at),
           country_code = coalesce(v_country, country_code),
           last_synced_at = case when p_synced then now() else last_synced_at end,
           updated_at = now()
     where id = v_id;
  end if;
  return jsonb_build_object('connection_id', v_id, 'user_id', p_user, 'previous_status', v_existing.status, 'status', p_status);
end;
$fn$;

-- ── 3. Time zones ────────────────────────────────────────────────────────────

alter table public.family_members add column if not exists time_zone text check (length(time_zone) <= 64);

/** The app tells the server its time zone (IANA name), so months end at the person's midnight. */
create or replace function public.family_set_time_zone(p_tz text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_tz) then
    perform public.family_fail('invalid_time_zone', 400);
  end if;
  update public.family_members set time_zone = p_tz where user_id = v_uid and time_zone is distinct from p_tz;
end;
$fn$;

/** A person's time zone; Brazil's until their phone says otherwise. */
create or replace function public.family_user_time_zone(p_user uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  select coalesce(
    (select m.time_zone from public.family_members m
      where m.user_id = p_user and m.time_zone is not null
      order by m.joined_at desc limit 1),
    'America/Sao_Paulo')
$fn$;

/** The start of the calendar month `p_at` falls in, in time zone `p_tz`. */
create or replace function public.family_month_start_in(p_at timestamptz, p_tz text)
returns timestamptz language sql stable set search_path = '' as $fn$
  select pg_catalog.date_trunc('month', p_at at time zone p_tz) at time zone p_tz
$fn$;

-- ── 4. Currencies ────────────────────────────────────────────────────────────

alter table public.family_budgets add column if not exists currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$');
alter table public.family_alert_rules add column if not exists currency text check (currency ~ '^[A-Z]{3}$');

/** The currency most of a person's shared accounts use. */
create or replace function public.family_main_currency(p_user uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  select coalesce(
    (select a.currency from public.bank_accounts a
      where a.user_id = p_user and a.shared
      group by a.currency order by count(*) desc, a.currency limit 1),
    (select a.currency from public.bank_accounts a
      where a.user_id = p_user
      group by a.currency order by count(*) desc, a.currency limit 1),
    'BRL')
$fn$;

drop function if exists public.family_budget_set(uuid, uuid, text, bigint);
create or replace function public.family_budget_set(p_family uuid, p_dependent uuid, p_category text, p_limit bigint, p_currency text default null)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
  v_currency text := coalesce(upper(p_currency), public.family_main_currency(p_dependent));
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
    if v_currency !~ '^[A-Z]{3}$' then
      perform public.family_fail('invalid_currency', 400);
    end if;
    insert into public.family_budgets (family_id, guardian_id, dependent_id, category, "limit", currency)
    values (p_family, v_uid, p_dependent, p_category, p_limit, v_currency)
    on conflict (guardian_id, dependent_id, category) do update
      set "limit" = excluded."limit", currency = excluded.currency, updated_at = now();
  end if;
  perform public.family_audit(p_family, v_uid, p_dependent, 'budget_set',
    jsonb_build_object('category', p_category, 'limit', nullif(greatest(coalesce(p_limit, 0), 0), 0), 'currency', v_currency));
end;
$fn$;

drop function if exists public.family_alert_rule_set(uuid, uuid, text, boolean, bigint, text[]);
create or replace function public.family_alert_rule_set(
  p_family uuid,
  p_dependent uuid,
  p_kind text,
  p_enabled boolean,
  p_threshold bigint default null,
  p_categories text[] default null,
  p_currency text default null
)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
  v_enabled boolean := coalesce(p_enabled, false);
  v_currency text := case when p_kind = 'large_purchase' then coalesce(upper(p_currency), public.family_main_currency(p_dependent)) end;
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
  if v_currency is not null and v_currency !~ '^[A-Z]{3}$' then
    perform public.family_fail('invalid_currency', 400);
  end if;
  if p_categories is not null and not (p_categories <@ public.family_categories()) then
    perform public.family_fail('invalid_category', 400);
  end if;

  insert into public.family_alert_rules (family_id, guardian_id, dependent_id, kind, enabled, threshold, categories, currency)
  values (
    p_family, v_uid, p_dependent, p_kind, v_enabled,
    case when p_kind = 'large_purchase' then p_threshold end,
    case when p_kind = 'sensitive_category' then nullif(p_categories, '{}'::text[]) end,
    v_currency
  )
  on conflict (guardian_id, dependent_id, kind) do update
    set enabled = excluded.enabled,
        threshold = coalesce(excluded.threshold, public.family_alert_rules.threshold),
        categories = excluded.categories,
        currency = coalesce(excluded.currency, public.family_alert_rules.currency),
        family_id = excluded.family_id,
        updated_at = now();

  perform public.family_audit(p_family, v_uid, p_dependent, 'alert_rule_set',
    jsonb_build_object('kind', p_kind, 'enabled', v_enabled, 'threshold', p_threshold, 'currency', v_currency));
end;
$fn$;

create or replace function public.family_alerts_on_transactions()
returns trigger language plpgsql security definer set search_path = '' as $fn$
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
     -- An amount means something only in its own currency.
     and (r.currency is null or r.currency = n.currency)
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
  -- The month is the dependent's own calendar month, in their time zone.
  insert into public.family_alert_events (family_id, guardian_id, dependent_id, kind, detail, dedupe_key)
  select b.family_id, b.guardian_id, b.dependent_id, 'budget_exceeded',
         jsonb_build_object('category', b.category, 'limit', b."limit", 'currency', b.currency, 'month', u.month_key),
         'budget:' || b.guardian_id || ':' || b.dependent_id || ':' || b.category || ':' || u.month_key
    from (
      select d.user_id, d.month_start, to_char(d.month_start at time zone d.tz, 'YYYY-MM') as month_key
        from (
          select x.user_id, public.family_user_time_zone(x.user_id) as tz,
                 public.family_month_start_in(now(), public.family_user_time_zone(x.user_id)) as month_start
            from (select distinct n.user_id from new_rows n) x
        ) d
    ) u
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
          and t.currency = b.currency
          and t.date >= u.month_start
          and public.family_account_viewable(b.guardian_id, t.account_id)
     ) > b."limit"
  on conflict (dedupe_key) do nothing;

  return null;
end;
$fn$;

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
        'id', c.id, 'institution', c.institution_name, 'status', c.status, 'provider', c.provider, 'country', c.country_code,
        'consent_expires_at', c.consent_expires_at, 'last_synced_at', c.last_synced_at
      ) order by c.created_at, c.id)
        from public.bank_connections c
       where c.user_id = p_dependent
         and exists (select 1 from public.bank_accounts a where a.connection_id = c.id and a.shared)
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object('category', b.category, 'limit', b."limit", 'currency', b.currency) order by b.category)
        from public.family_budgets b
       where b.guardian_id = v_uid and b.dependent_id = p_dependent
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind, 'enabled', r.enabled, 'threshold', r.threshold, 'categories', r.categories, 'currency', r.currency
      ) order by r.kind)
        from public.family_alert_rules r
       where r.guardian_id = v_uid and r.dependent_id = p_dependent
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ── 5. Housekeeping and export, provider-aware ───────────────────────────────

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
  update public.bank_connections b set orphaned_at = now(), updated_at = now()
   where b.orphaned_at is null and not public.family_sharing_active(b.user_id);

  delete from public.bank_transactions where date < now() - interval '13 months';
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

create or replace function public.family_export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_out jsonb;
begin
  perform public.family_expire_consents(v_uid);

  select jsonb_build_object(
    'format', 'flow-family-export/1',
    'exported_at', now(),
    'user_id', v_uid,

    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'family', f.name, 'role', m.role, 'display_name', m.display_name, 'kind', m.kind, 'time_zone', m.time_zone,
        'birthdate', m.birthdate, 'status', m.status, 'joined_at', m.joined_at, 'ended_at', m.ended_at
      ) order by m.joined_at)
        from public.family_members m join public.families f on f.id = m.family_id
       where m.user_id = v_uid), '[]'::jsonb),

    'families_i_created', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', f.name, 'created_at', f.created_at,
        'members', (select coalesce(jsonb_agg(jsonb_build_object(
                      'display_name', m.display_name, 'role', m.role, 'kind', m.kind, 'status', m.status)
                      order by m.joined_at), '[]'::jsonb)
                      from public.family_members m where m.family_id = f.id)
      ))
        from public.families f where f.created_by = v_uid), '[]'::jsonb),

    'consents_i_gave', coalesce((
      select jsonb_agg(jsonb_build_object(
        'term_version', c.term_version, 'given_by', c.given_by, 'months', c.months,
        'granted_at', c.granted_at, 'granted_ip', host(c.granted_ip), 'granted_user_agent', c.granted_user_agent,
        'expires_at', c.expires_at, 'status', c.status, 'ended_at', c.ended_at, 'end_reason', c.end_reason
      ) order by c.granted_at)
        from public.family_consents c where c.dependent_id = v_uid), '[]'::jsonb),

    'consents_received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dependent', (select m.display_name from public.family_members m
                       where m.family_id = c.family_id and m.user_id = c.dependent_id),
        'term_version', c.term_version, 'given_by', c.given_by, 'months', c.months,
        'granted_at', c.granted_at, 'expires_at', c.expires_at, 'status', c.status,
        'ended_at', c.ended_at, 'end_reason', c.end_reason,
        -- What the guardian declared as the legal representative is theirs.
        'my_representative_declaration', case when c.representative_id = v_uid then jsonb_build_object(
          'at', c.rep_consented_at, 'ip', host(c.rep_ip), 'user_agent', c.rep_user_agent) end
      ) order by c.granted_at)
        from public.family_consents c where c.guardian_id = v_uid), '[]'::jsonb),

    'invitations_i_created', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', i.label, 'kind', i.kind, 'birthdate', i.birthdate, 'months', i.months,
        'status', i.status, 'created_at', i.created_at, 'expires_at', i.expires_at, 'accepted_at', i.accepted_at,
        'representative_declaration', case when i.rep_declared then jsonb_build_object(
          'at', i.rep_consented_at, 'ip', host(i.rep_ip), 'user_agent', i.rep_user_agent) end
      ) order by i.created_at)
        from public.family_invites i where i.created_by = v_uid), '[]'::jsonb),

    'bank_connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'institution', b.institution_name, 'provider', b.provider, 'country', b.country_code,
        'status', b.status, 'connected_at', b.created_at,
        'consent_expires_at', b.consent_expires_at, 'last_synced_at', b.last_synced_at,
        'not_shared_since', b.orphaned_at,
        'accounts', (select coalesce(jsonb_agg(jsonb_build_object(
                       'kind', a.kind, 'name', a.name, 'last4', a.last4, 'currency', a.currency,
                       'shared', a.shared, 'shared_at', a.shared_at,
                       'transactions', (select coalesce(jsonb_agg(jsonb_build_object(
                                          'date', t.date, 'amount_cents', t.amount, 'direction', t.direction,
                                          'description', t.description, 'merchant', t.merchant,
                                          'category', t.category, 'status', t.status, 'currency', t.currency)
                                          order by t.date), '[]'::jsonb)
                                          from public.bank_transactions t where t.account_id = a.id)
                     ) order by a.created_at), '[]'::jsonb)
                     from public.bank_accounts a where a.connection_id = b.id)
      ) order by b.created_at)
        from public.bank_connections b where b.user_id = v_uid), '[]'::jsonb),

    'budgets_i_set', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dependent', (select m.display_name from public.family_members m
                       where m.family_id = g.family_id and m.user_id = g.dependent_id),
        'category', g.category, 'limit_cents', g."limit", 'currency', g.currency, 'updated_at', g.updated_at))
        from public.family_budgets g where g.guardian_id = v_uid), '[]'::jsonb),

    'alert_rules_i_set', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dependent', (select m.display_name from public.family_members m
                       where m.family_id = r.family_id and m.user_id = r.dependent_id),
        'kind', r.kind, 'enabled', r.enabled, 'threshold_cents', r.threshold, 'currency', r.currency, 'categories', r.categories,
        'updated_at', r.updated_at))
        from public.family_alert_rules r where r.guardian_id = v_uid), '[]'::jsonb),

    'alerts_i_received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', e.kind, 'created_at', e.created_at, 'read_at', e.read_at, 'push', e.push_status)
        order by e.created_at)
        from public.family_alert_events e where e.guardian_id = v_uid), '[]'::jsonb),

    'devices_for_alerts', coalesce((
      select jsonb_agg(jsonb_build_object('platform', p.platform, 'registered_at', p.created_at))
        from public.push_tokens p where p.user_id = v_uid), '[]'::jsonb),

    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', l.created_at, 'action', l.action, 'by', l.actor_name,
        'by_me', l.actor_id = v_uid, 'about_me', l.subject_id = v_uid, 'detail', l.detail)
        order by l.created_at desc)
        from (select * from public.family_audit_log l
               where l.subject_id = v_uid or l.actor_id = v_uid
               order by l.created_at desc limit 5000) l), '[]'::jsonb)
  ) into v_out;

  perform public.family_audit(null, v_uid, v_uid, 'data_exported', '{}'::jsonb);
  return v_out;
end;
$fn$;


-- ── 6. Consent terms naming the providers ────────────────────────────────────
-- Text in src/lib/family/consentTerm.ts; a test checks the hash. Consents
-- already given under 2026-11 stay valid for their period.

insert into public.family_consent_terms (version, sha256)
values ('2026-11.2', 'dd0f490c15a4a23ffefded328caa3810e54b3d90771a3212fbdd91ac16d6acf5')
on conflict (version) do nothing;

-- ── 7. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.bank_upsert_connection(uuid, text, text, text, text, timestamptz, boolean, text, text),
  public.family_set_time_zone(text),
  public.family_user_time_zone(uuid),
  public.family_month_start_in(timestamptz, text),
  public.family_main_currency(uuid),
  public.family_budget_set(uuid, uuid, text, bigint, text),
  public.family_alert_rule_set(uuid, uuid, text, boolean, bigint, text[], text),
  public.family_alerts_on_transactions(),
  public.family_dependent_overview(uuid),
  public.family_maintenance(int, boolean),
  public.family_export_my_data()
from public, anon, authenticated;

grant execute on function
  public.family_set_time_zone(text),
  public.family_budget_set(uuid, uuid, text, bigint, text),
  public.family_alert_rule_set(uuid, uuid, text, boolean, bigint, text[], text),
  public.family_dependent_overview(uuid),
  public.family_export_my_data()
to authenticated;
grant execute on function public.family_maintenance(int, boolean) to service_role;
