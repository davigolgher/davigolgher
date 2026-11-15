-- Flow Family, phase 6: a person's own copy of their data, and data that has
-- lost its purpose stops being kept (LGPD art. 6 III, 15, 16 and 18).
--
-- Additive only: one nullable column, new functions, one trigger.
--
--   1. Connections nobody is sharing anymore. Bank data is collected to be
--      shared with a family. When a person has no active consent anywhere,
--      their connections are marked; nothing new is stored from them; after 30
--      days the server ends them at the aggregator and deletes what was read
--      (the app shows the date, and the person can disconnect sooner or share
--      again to keep them).
--   2. Retention. Bank entries older than 13 months (the dashboard compares a
--      month with the one before; a year back is the most any screen uses),
--      alerts older than 12 months, the audit trail after 24 months, spent
--      invitations and code attempts, delivered webhook records.
--   3. Export. Everything Flow Family holds about the caller, as JSON, for the
--      app to hand to them as a file.

-- ── 1. Connections nobody is sharing ─────────────────────────────────────────

alter table public.bank_connections add column if not exists orphaned_at timestamptz;

comment on column public.bank_connections.orphaned_at is
  'When its owner stopped sharing with every family. Ended 30 days later unless they share again.';

/** Is this person sharing with at least one family right now? */
create or replace function public.family_sharing_active(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.family_consents c
     where c.dependent_id = p_user and c.status = 'active' and c.expires_at > now()
  )
$fn$;

create or replace function public.bank_mark_orphans(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if public.family_sharing_active(p_user) then
    update public.bank_connections set orphaned_at = null, updated_at = now()
     where user_id = p_user and orphaned_at is not null;
  else
    update public.bank_connections set orphaned_at = now(), updated_at = now()
     where user_id = p_user and orphaned_at is null;
  end if;
end;
$fn$;

create or replace function public.family_consents_orphans()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.bank_mark_orphans(coalesce(new.dependent_id, old.dependent_id));
  return null;
end;
$fn$;

drop trigger if exists family_consents_orphans on public.family_consents;
create trigger family_consents_orphans after insert or delete or update of status on public.family_consents
  for each row execute function public.family_consents_orphans();

-- Nothing new is stored from a connection nobody is sharing: enforced here,
-- whatever calls bank_ingest_transactions.
create or replace function public.bank_transactions_skip_orphans()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if exists (
    select 1 from public.bank_accounts a
      join public.bank_connections c on c.id = a.connection_id
     where a.id = new.account_id and c.orphaned_at is not null
  ) then
    return null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists bank_transactions_skip_orphans on public.bank_transactions;
create trigger bank_transactions_skip_orphans before insert on public.bank_transactions
  for each row execute function public.bank_transactions_skip_orphans();

-- ── 2. Maintenance (service role only) ───────────────────────────────────────

-- When housekeeping last ran, so the webhook can offer to run it often and it
-- runs at most hourly.
create table if not exists public.family_maintenance_runs (
  id int primary key default 1 check (id = 1),
  ran_at timestamptz not null
);
alter table public.family_maintenance_runs enable row level security;
revoke all on table public.family_maintenance_runs from anon, authenticated;

/**
 * Housekeeping, run by the server: offered by the webhook after each delivery
 * (at most hourly) and forced by a daily schedule. Returns what it removed,
 * and the connections now due to be ended at the aggregator — which only the
 * server can do, so it ends them and then calls bank_remove_connection.
 */
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

  select coalesce(jsonb_agg(jsonb_build_object('connection_id', d.id, 'external_item_id', d.external_item_id)), '[]'::jsonb)
    into v_due
    from (
      select b.id, b.external_item_id from public.bank_connections b
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

-- ── 3. Export ────────────────────────────────────────────────────────────────

/**
 * Everything Flow Family holds about the caller (LGPD art. 18 II and V), as
 * they could read it in the app, plus what only the records show: when and
 * from where they consented.
 *
 * Other people's personal data is left out: a guardian's copy names the
 * family's members and what the guardian set up, not the dependents' bank
 * entries or the network details of their consent; those are in the
 * dependent's own copy.
 */
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
        'family', f.name, 'role', m.role, 'display_name', m.display_name, 'kind', m.kind,
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
        'institution', b.institution_name, 'status', b.status, 'connected_at', b.created_at,
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
        'category', g.category, 'limit_cents', g."limit", 'updated_at', g.updated_at))
        from public.family_budgets g where g.guardian_id = v_uid), '[]'::jsonb),

    'alert_rules_i_set', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dependent', (select m.display_name from public.family_members m
                       where m.family_id = r.family_id and m.user_id = r.dependent_id),
        'kind', r.kind, 'enabled', r.enabled, 'threshold_cents', r.threshold, 'categories', r.categories,
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

-- ── 4. Who may call what ─────────────────────────────────────────────────────

revoke execute on function
  public.family_sharing_active(uuid),
  public.bank_mark_orphans(uuid),
  public.family_consents_orphans(),
  public.bank_transactions_skip_orphans(),
  public.family_maintenance(int, boolean),
  public.family_export_my_data()
from public, anon, authenticated;

grant execute on function public.family_maintenance(int, boolean) to service_role;
grant execute on function public.family_export_my_data() to authenticated;
