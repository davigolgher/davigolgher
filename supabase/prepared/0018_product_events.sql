-- Product events: measuring whether Flow delivers value, without tracking.
--
-- What the app records about how it is used (docs/produto/eventos.md): the
-- steps of onboarding, the first expense, connecting a bank, the first time a
-- person sees their own month (the "aha"), coming back. Never amounts,
-- merchants, names, notes or anything typed; no advertising identifiers; no
-- third party. A person can turn it off in Settings.
--
-- Additive only:
--   1. product_events, written only through product_events_record (checked
--      names, checked properties, at most 100 per call and 2,000 a day per
--      account), readable by nobody but the service role.
--   2. Kept 13 months (product_events_purge, run by the daily maintenance).
--   3. Read-outs for the team, service role only: the activation funnel,
--      retention by cohort (D1, D7, D30, D90) and time to first value.
-- Deleting an account deletes its events (foreign key).

-- ── 1. The table ─────────────────────────────────────────────────────────────

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- A random id made on the phone at first launch; not the device's own id.
  install_id uuid,
  session_id uuid,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,47}$'),
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1000),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  platform text check (platform in ('ios', 'android', 'web')),
  app_version text check (length(app_version) <= 20)
);
create index if not exists product_events_user_time_idx on public.product_events (user_id, occurred_at);
create index if not exists product_events_name_time_idx on public.product_events (name, occurred_at);

alter table public.product_events enable row level security;
revoke all on table public.product_events from anon, authenticated;
-- No policies: the app writes through the function below and reads nothing.

/** The events the app may send (mobile/src/lib/analytics.ts keeps the same list). */
create or replace function public.product_event_names()
returns text[] language sql immutable set search_path = '' as $fn$
  select array[
    'app_opened', 'welcome_viewed', 'sample_started', 'sample_exited',
    'signup_started', 'signup_completed', 'signin_completed',
    'onboarding_started', 'onboarding_step_viewed', 'onboarding_step_completed', 'onboarding_skipped', 'onboarding_completed',
    'paywall_viewed', 'paywall_converted', 'family_only_chosen',
    'home_viewed', 'first_expense_added', 'expense_added', 'subscription_added', 'budget_set',
    'aha_reached', 'insight_viewed', 'next_step_viewed', 'next_step_tapped', 'returned_after_absence',
    'bank_intro_viewed', 'bank_connect_started', 'bank_connect_succeeded', 'bank_connect_failed',
    'bank_import_completed', 'bank_sync_succeeded', 'bank_sync_failed', 'bank_account_import_set',
    'bank_reconnect_started', 'bank_disconnected',
    'subscription_suggestion_viewed', 'subscription_suggestion_accepted', 'subscription_suggestion_dismissed',
    'weekly_summary_set'
  ]
$fn$;

/** The properties an event may carry. */
create or replace function public.product_event_props()
returns text[] language sql immutable set search_path = '' as $fn$
  select array[
    'step', 'goals', 'via', 'stage', 'kind', 'country', 'banks', 'accounts', 'entries',
    'seconds', 'days_away', 'count', 'on', 'kept', 'manual', 'source', 'plan', 'screen'
  ]
$fn$;

/** Keep the allowed keys only, as short strings, numbers or booleans. */
create or replace function public.product_clean_props(p jsonb)
returns jsonb language sql immutable set search_path = '' as $fn$
  select coalesce(jsonb_object_agg(e.key,
           case jsonb_typeof(e.value)
             when 'string' then to_jsonb(left(e.value #>> '{}', 40))
             else e.value
           end), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
   where e.key = any (public.product_event_props())
     and jsonb_typeof(e.value) in ('string', 'number', 'boolean')
$fn$;

-- ── 2. Writing ───────────────────────────────────────────────────────────────

/**
 * Record a batch of the signed-in person's events. Unknown names and
 * properties are dropped, times outside the last 30 days are dropped, and an
 * account sending more than 2,000 events a day has the rest ignored.
 * Returns how many were stored.
 */
create or replace function public.product_events_record(
  p_events jsonb,
  p_platform text default null,
  p_app_version text default null
)
returns int language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_today int;
  v_room int;
  v_stored int;
begin
  if v_uid is null then
    return 0;
  end if;
  if jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  select count(*) into v_today from public.product_events e
   where e.user_id = v_uid and e.received_at > now() - interval '1 day';
  v_room := greatest(0, 2000 - v_today);
  if v_room = 0 then
    return 0;
  end if;

  insert into public.product_events (user_id, install_id, session_id, name, props, occurred_at, platform, app_version)
  select v_uid,
         case when e ->> 'install_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e ->> 'install_id')::uuid end,
         case when e ->> 'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e ->> 'session_id')::uuid end,
         e ->> 'name',
         public.product_clean_props(e -> 'props'),
         (e ->> 'occurred_at')::timestamptz,
         case when p_platform in ('ios', 'android', 'web') then p_platform end,
         left(p_app_version, 20)
    from (
      select e from jsonb_array_elements(p_events) e
       where e ->> 'name' = any (public.product_event_names())
         and (e ->> 'occurred_at') ~ '^\d{4}-\d{2}-\d{2}T'
       limit least(100, v_room)
    ) x(e)
   where (e ->> 'occurred_at')::timestamptz between now() - interval '30 days' and now() + interval '5 minutes';
  get diagnostics v_stored = row_count;
  return v_stored;
end;
$fn$;

/** Kept 13 months. Run by the daily maintenance (service role). */
create or replace function public.product_events_purge()
returns int language plpgsql security definer set search_path = '' as $fn$
declare
  n int;
begin
  delete from public.product_events where occurred_at < now() - interval '13 months';
  get diagnostics n = row_count;
  return n;
end;
$fn$;

-- ── 3. Read-outs (service role) ──────────────────────────────────────────────

/**
 * The activation funnel for people who signed up in [p_from, p_to): how many
 * reached each step, ever. Steps in order:
 *   signed up → finished onboarding → subscribed → first value (an expense
 *   or a bank import) → aha (saw their own month) → came back on day 1–7.
 */
create or replace function public.analytics_activation_funnel(p_from timestamptz, p_to timestamptz)
returns table (step int, name text, users bigint, pct_of_signups numeric)
language sql stable security definer set search_path = '' as $fn$
  with cohort as (
    select e.user_id, min(e.occurred_at) as signed_up
      from public.product_events e
     where e.name = 'signup_completed'
     group by e.user_id
    having min(e.occurred_at) >= p_from and min(e.occurred_at) < p_to
  ),
  reached as (
    select c.user_id,
           bool_or(e.name = 'onboarding_completed') as onboarded,
           bool_or(e.name = 'paywall_converted') as subscribed,
           bool_or(e.name in ('first_expense_added', 'bank_import_completed')) as first_value,
           bool_or(e.name = 'aha_reached') as aha,
           bool_or(e.name = 'app_opened' and e.occurred_at >= c.signed_up + interval '1 day'
                   and e.occurred_at < c.signed_up + interval '8 days') as came_back
      from cohort c
      left join public.product_events e on e.user_id = c.user_id
     group by c.user_id
  ),
  steps(step, name, users) as (
    select 1, 'signed up', count(*) from reached
    union all select 2, 'finished onboarding', count(*) filter (where onboarded) from reached
    union all select 3, 'subscribed', count(*) filter (where subscribed) from reached
    union all select 4, 'first value', count(*) filter (where first_value) from reached
    union all select 5, 'aha', count(*) filter (where aha) from reached
    union all select 6, 'came back in week 1', count(*) filter (where came_back) from reached
  )
  select s.step, s.name, s.users,
         round(100.0 * s.users / nullif((select users from steps where step = 1), 0), 1)
    from steps s order by s.step
$fn$;

/**
 * Retention by weekly signup cohort: of the people who signed up that week,
 * the share who opened Flow on day 1, 7, 30 and 90 after signing up (that
 * calendar day, in UTC). A day still in the future reads null.
 */
create or replace function public.analytics_retention(p_weeks int default 12)
returns table (cohort_week date, users bigint, d1 numeric, d7 numeric, d30 numeric, d90 numeric)
language sql stable security definer set search_path = '' as $fn$
  with cohort as (
    select e.user_id, min(e.occurred_at) as signed_up
      from public.product_events e
     where e.name = 'signup_completed'
     group by e.user_id
    having min(e.occurred_at) >= date_trunc('week', now()) - make_interval(weeks => greatest(1, least(coalesce(p_weeks, 12), 104)))
  ),
  opened as (
    select c.user_id, c.signed_up,
           ((e.occurred_at at time zone 'UTC')::date - (c.signed_up at time zone 'UTC')::date) as day
      from cohort c
      join public.product_events e on e.user_id = c.user_id and e.name = 'app_opened'
  )
  select date_trunc('week', c.signed_up)::date as cohort_week,
         count(*) as users,
         case when max(c.signed_up) + interval '1 day' <= now() then round(100.0 * count(*) filter (where exists (select 1 from opened o where o.user_id = c.user_id and o.day = 1)) / count(*), 1) end,
         case when max(c.signed_up) + interval '7 days' <= now() then round(100.0 * count(*) filter (where exists (select 1 from opened o where o.user_id = c.user_id and o.day = 7)) / count(*), 1) end,
         case when max(c.signed_up) + interval '30 days' <= now() then round(100.0 * count(*) filter (where exists (select 1 from opened o where o.user_id = c.user_id and o.day = 30)) / count(*), 1) end,
         case when max(c.signed_up) + interval '90 days' <= now() then round(100.0 * count(*) filter (where exists (select 1 from opened o where o.user_id = c.user_id and o.day = 90)) / count(*), 1) end
    from cohort c
   group by 1
   order by 1
$fn$;

/**
 * Time to first value and to the aha, from signing up, for people who signed
 * up in [p_from, p_to): median and 90th percentile in seconds, and how many
 * got there at all.
 */
create or replace function public.analytics_time_to_value(p_from timestamptz, p_to timestamptz)
returns table (milestone text, reached bigint, median_seconds numeric, p90_seconds numeric)
language sql stable security definer set search_path = '' as $fn$
  with cohort as (
    select e.user_id, min(e.occurred_at) as signed_up
      from public.product_events e
     where e.name = 'signup_completed'
     group by e.user_id
    having min(e.occurred_at) >= p_from and min(e.occurred_at) < p_to
  ),
  firsts as (
    select c.user_id, m.milestone, extract(epoch from min(e.occurred_at) - c.signed_up) as seconds
      from cohort c
      cross join (values ('first value'), ('aha')) m(milestone)
      join public.product_events e on e.user_id = c.user_id
       and e.occurred_at >= c.signed_up
       and ((m.milestone = 'first value' and e.name in ('first_expense_added', 'bank_import_completed'))
         or (m.milestone = 'aha' and e.name = 'aha_reached'))
     group by c.user_id, c.signed_up, m.milestone
  )
  select f.milestone, count(*),
         round(percentile_cont(0.5) within group (order by f.seconds)::numeric, 0),
         round(percentile_cont(0.9) within group (order by f.seconds)::numeric, 0)
    from firsts f
   group by f.milestone
   order by f.milestone desc
$fn$;

-- ── 4. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.product_event_names(),
  public.product_event_props(),
  public.product_clean_props(jsonb),
  public.product_events_record(jsonb, text, text),
  public.product_events_purge(),
  public.analytics_activation_funnel(timestamptz, timestamptz),
  public.analytics_retention(int),
  public.analytics_time_to_value(timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function public.product_events_record(jsonb, text, text) to authenticated;
grant execute on function
  public.product_events_purge(),
  public.analytics_activation_funnel(timestamptz, timestamptz),
  public.analytics_retention(int),
  public.analytics_time_to_value(timestamptz, timestamptz)
to service_role;
