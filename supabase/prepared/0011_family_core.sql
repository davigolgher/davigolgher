-- 0011 — Flow Family: families, invitations, consent and the audit trail.
--
-- PREPARED, NOT APPLIED. The feature is built into the app only when
-- EXPO_PUBLIC_FLOW_FAMILY=1; apply 0011–0015 in order before shipping such a
-- build. Everything here is additive: no existing table, policy or function
-- changes, and nothing reads these tables unless the feature is on.
-- Tested against a real Postgres in supabase/tests/pg/family_*.test.ts.
--
-- What this adds. A guardian creates a family and invites a dependent with a
-- one-time code. The dependent (or, for a minor or a person under legal
-- guardianship, their legal representative) consents to a versioned term, and
-- that consent — who, to whom, which version, when, from which address, until
-- when — is the only thing that later lets the guardian read the dependent's
-- bank transactions (0012–0013). Ending the consent ends the access in the
-- same instant.
--
-- How access is controlled. This is the first place in the schema where one
-- account can learn anything about another, so nothing is left to the client:
--   · every table has RLS on and no policy for writes;
--   · `anon` has no privilege at all, and `authenticated` only SELECT on the
--     audit log (its own entries);
--   · every write, and every read that crosses accounts, goes through a
--     SECURITY DEFINER function that checks who is calling. Their search_path
--     is empty, so every name is schema-qualified and can't be shadowed.
-- Refusals use SQLSTATE PTxxx, which the API returns as HTTP xxx, with a short
-- code as the message (`not_a_guardian`, `plan_limit_dependents`…) that the
-- app turns into a sentence.

-- ── 1. Small helpers ─────────────────────────────────────────────────────────

create or replace function public.family_fail(p_code text, p_status int default 400)
returns void language plpgsql immutable set search_path = '' as $fn$
begin
  raise exception '%', p_code using errcode = 'PT' || p_status::text;
end;
$fn$;

/** Trim, drop control characters, collapse whitespace, cap the length. Null when nothing is left. */
create or replace function public.family_clean_text(p_text text, p_max int)
returns text language sql immutable set search_path = '' as $fn$
  select nullif(left(trim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), p_max), '')
$fn$;

/** "m***@example.com": enough to recognise an address, not enough to harvest it. */
create or replace function public.family_mask_email(p_email text)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end
$fn$;

/**
 * The caller's address, as the API gateway reports it. Cloudflare's header
 * can't be set by the client; the others are fallbacks. The raw forwarded
 * chain is kept beside it (family_request_ip_chain) because which header is
 * authoritative depends on the hosting, and a consent record should hold the
 * evidence rather than one interpretation of it.
 */
create or replace function public.family_request_ip()
returns inet language plpgsql stable set search_path = '' as $fn$
declare
  h jsonb;
  v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;
  v := coalesce(
    nullif(h ->> 'cf-connecting-ip', ''),
    nullif(h ->> 'x-real-ip', ''),
    nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), '')
  );
  if v is null then return null; end if;
  begin
    return v::inet;
  exception when others then
    return null;
  end;
end;
$fn$;

create or replace function public.family_request_ip_chain()
returns text language plpgsql stable set search_path = '' as $fn$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return left(h ->> 'x-forwarded-for', 200);
end;
$fn$;

create or replace function public.family_request_user_agent()
returns text language plpgsql stable set search_path = '' as $fn$
declare
  h jsonb;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return left(h ->> 'user-agent', 300);
end;
$fn$;

/**
 * An invitation code: 8 characters from 32 that can't be mistaken for one
 * another when read aloud or typed (no I, O, 0, 1). 40 bits, single use, seven
 * days, and guesses are rate-limited per account.
 */
create or replace function public.family_new_code()
returns text language plpgsql volatile set search_path = '' as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  -- A v4 UUID fixes some bits of bytes 6 and 8; these positions are fully random.
  picks constant int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  v_code text := '';
  i int;
begin
  foreach i in array picks loop
    v_code := v_code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  end loop;
  return v_code;
end;
$fn$;

create or replace function public.family_code_hash(p_code text)
returns text language sql immutable set search_path = '' as $fn$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$fn$;

/**
 * Whether this account pays for Flow: the same reading of `billing` as 0010
 * (active, trialing or in its billing grace period, with three days' slack for
 * a late renewal webhook). The family's plan is its creator's.
 */
create or replace function public.family_plan(p_user uuid)
returns text language sql stable security definer set search_path = '' as $fn$
  select case when exists (
    select 1
      from public.billing b
     where b.user_id = p_user
       and b.status in ('active', 'trialing', 'past_due')
       and coalesce(
             case when b.status = 'trialing' then coalesce(b.trial_end, b.current_period_end)
                  else b.current_period_end end,
             'infinity'::timestamptz
           ) > now() - interval '3 days'
  ) then 'paid' else 'free' end
$fn$;

-- ── 2. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- One family per guardian. Deleting the guardian's account deletes the family.
create unique index if not exists families_one_per_creator on public.families (created_by);

create table if not exists public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('guardian', 'dependent')),
  display_name text not null check (length(display_name) between 1 and 60),
  -- Dependents only. 'ward' is an adult with a legal representative (curatela).
  kind text check (kind in ('adult', 'minor', 'ward')),
  -- Kept for minors only, and only so the consent can end on the 18th birthday.
  birthdate date,
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (family_id, user_id),
  constraint family_members_kind_for_dependents check ((role = 'dependent') = (kind is not null)),
  constraint family_members_birthdate_for_minors check ((kind is not distinct from 'minor') = (birthdate is not null))
);
create index if not exists family_members_user_idx on public.family_members (user_id);

-- The versions of the consent term the server accepts, each with the SHA-256
-- of its exact text (src/lib/family/consentTerm.ts → consentTermText()).
-- Append-only: a changed term is a new row, never an edit.
create table if not exists public.family_consent_terms (
  version text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now()
);
insert into public.family_consent_terms (version, sha256)
values ('2026-11', 'da73b413f53f850af608636e3a43c5da990085ed4cd20996816c1471070ff91d')
on conflict (version) do nothing;

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  -- Only the hash is stored: a copy of this table is not a list of usable codes.
  code_hash text not null unique,
  kind text not null check (kind in ('adult', 'minor', 'ward')),
  -- What the guardian calls this person, shown back to them on the invitation.
  label text not null check (length(label) between 1 and 60),
  birthdate date,
  months int not null check (months in (3, 6, 12)),
  term_version text not null references public.family_consent_terms (version),
  -- For a minor or a ward the consent is the legal representative's, given
  -- here, when the invitation is made.
  rep_declared boolean not null default false,
  rep_consented_at timestamptz,
  rep_ip inet,
  rep_ip_chain text,
  rep_user_agent text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint family_invites_rep_for_represented check (kind = 'adult' or (rep_declared and rep_consented_at is not null)),
  constraint family_invites_birthdate_for_minors check ((kind = 'minor') = (birthdate is not null))
);
create index if not exists family_invites_family_idx on public.family_invites (family_id);

create table if not exists public.family_consents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  dependent_id uuid not null references auth.users (id) on delete cascade,
  guardian_id uuid not null references auth.users (id) on delete cascade,
  term_version text not null references public.family_consent_terms (version),
  -- 'self': an adult consenting for themselves. 'legal_representative': the
  -- guardian consenting for a minor or a ward, who then confirms.
  given_by text not null check (given_by in ('self', 'legal_representative')),
  representative_id uuid references auth.users (id) on delete set null,
  -- The dependent's own acceptance.
  granted_at timestamptz not null default now(),
  granted_ip inet,
  granted_ip_chain text,
  granted_user_agent text,
  -- The representative's consent, copied from the invitation (or a renewal).
  rep_consented_at timestamptz,
  rep_ip inet,
  rep_ip_chain text,
  rep_user_agent text,
  months int not null check (months in (3, 6, 12)),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  end_reason text check (
    end_reason in ('revoked_by_dependent', 'removed_by_guardian', 'left_family', 'expired', 'came_of_age', 'renewed', 'family_deleted')
  ),
  created_at timestamptz not null default now(),
  constraint family_consents_rep_recorded check (given_by = 'self' or rep_consented_at is not null),
  constraint family_consents_end_recorded check ((status = 'active') = (ended_at is null))
);
-- At most one consent in force between two people; history stays as ended rows.
create unique index if not exists family_consents_one_active
  on public.family_consents (dependent_id, guardian_id) where status = 'active';
create index if not exists family_consents_guardian_idx on public.family_consents (guardian_id) where status = 'active';

-- Who did what about whose data. Written only by the functions below.
-- A dependent reads every entry about them; that is the "access history".
create table if not exists public.family_audit_log (
  id bigint generated always as identity primary key,
  family_id uuid references public.families (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  -- As it was at the time; survives the actor's account.
  actor_name text,
  subject_id uuid references auth.users (id) on delete cascade,
  action text not null check (length(action) between 1 and 40),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 2000),
  created_at timestamptz not null default now()
);
create index if not exists family_audit_subject_idx on public.family_audit_log (subject_id, created_at desc);
create index if not exists family_audit_actor_idx on public.family_audit_log (actor_id, created_at desc);

-- Wrong invitation codes, per account, to slow down guessing.
create table if not exists public.family_invite_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists family_invite_attempts_idx on public.family_invite_attempts (user_id, attempted_at);

-- ── 3. Row Level Security and grants ─────────────────────────────────────────

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_consent_terms enable row level security;
alter table public.family_invites enable row level security;
alter table public.family_consents enable row level security;
alter table public.family_audit_log enable row level security;
alter table public.family_invite_attempts enable row level security;

-- Supabase grants new tables to anon and authenticated in full. Take all of it
-- back; what the app may do is granted below, by name.
revoke all on table
  public.families, public.family_members, public.family_consent_terms, public.family_invites,
  public.family_consents, public.family_audit_log, public.family_invite_attempts
from anon, authenticated;
revoke all on sequence public.family_audit_log_id_seq from anon, authenticated;

grant select on table public.family_audit_log to authenticated;
create policy "family_audit_log: about me or by me" on public.family_audit_log
  for select to authenticated
  using (subject_id = (select auth.uid()) or actor_id = (select auth.uid()));

-- ── 4. The access rule ───────────────────────────────────────────────────────

/**
 * On the free plan a family follows one dependent: the first to have joined.
 * The others aren't removed if a subscription lapses — they are locked, and
 * unlock when it returns.
 */
create or replace function public.family_dependent_locked(p_family uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce((
    select case
      when public.family_plan(f.created_by) = 'paid' then false
      else p_dependent is distinct from (
        select m.user_id
          from public.family_members m
         where m.family_id = p_family and m.role = 'dependent' and m.status = 'active'
         order by m.joined_at, m.user_id
         limit 1
      )
    end
    from public.families f
    where f.id = p_family
  ), true)
$fn$;

/**
 * THE rule. A guardian may see a dependent's shared data when, and only when,
 * a consent between the two is active and unexpired, and both are still
 * members of that family. Everything that crosses accounts asks this.
 */
create or replace function public.family_guardian_can_view(p_guardian uuid, p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select p_guardian is not null and p_dependent is not null and exists (
    select 1
      from public.family_consents c
      join public.family_members g
        on g.family_id = c.family_id and g.user_id = c.guardian_id and g.role = 'guardian' and g.status = 'active'
      join public.family_members d
        on d.family_id = c.family_id and d.user_id = c.dependent_id and d.role = 'dependent' and d.status = 'active'
     where c.guardian_id = p_guardian
       and c.dependent_id = p_dependent
       and c.status = 'active'
       and c.expires_at > now()
       and not public.family_dependent_locked(c.family_id, c.dependent_id)
  )
$fn$;

create or replace function public.family_can_view(p_dependent uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select public.family_guardian_can_view((select auth.uid()), p_dependent)
$fn$;

-- ── 5. Internal pieces ───────────────────────────────────────────────────────

create or replace function public.family_uid()
returns uuid language plpgsql stable set search_path = '' as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform public.family_fail('not_signed_in', 401);
  end if;
  return v_uid;
end;
$fn$;

create or replace function public.family_audit(
  p_family uuid, p_actor uuid, p_subject uuid, p_action text, p_detail jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.family_audit_log (family_id, actor_id, actor_name, subject_id, action, detail)
  values (
    p_family,
    p_actor,
    (select m.display_name from public.family_members m where m.family_id = p_family and m.user_id = p_actor),
    p_subject,
    p_action,
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$fn$;

/** The family this caller is the active guardian of, or a refusal. */
create or replace function public.family_require_guardian(p_family uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if not exists (
    select 1 from public.family_members m
     where m.family_id = p_family and m.user_id = v_uid and m.role = 'guardian' and m.status = 'active'
  ) then
    perform public.family_fail('not_a_guardian', 403);
  end if;
  return v_uid;
end;
$fn$;

/** Close consents, with the reason, and leave a line in the audit log for each. */
create or replace function public.family_end_consents(
  p_family uuid, p_dependent uuid, p_reason text, p_by uuid
)
returns int language plpgsql security definer set search_path = '' as $fn$
declare
  r record;
  n int := 0;
begin
  for r in
    update public.family_consents c
       set status = case when p_reason in ('expired', 'came_of_age') then 'expired' else 'revoked' end,
           ended_at = now(),
           ended_by = p_by,
           end_reason = p_reason
     where c.family_id = p_family
       and (p_dependent is null or c.dependent_id = p_dependent)
       and c.status = 'active'
    returning c.id, c.dependent_id, c.guardian_id
  loop
    n := n + 1;
    perform public.family_audit(p_family, p_by, r.dependent_id, 'consent_ended',
      jsonb_build_object('reason', p_reason, 'consent_id', r.id));
  end loop;
  return n;
end;
$fn$;

/** Mark consents whose date has passed. Called before anything reports state. */
create or replace function public.family_expire_consents(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  r record;
begin
  for r in
    update public.family_consents c
       set status = 'expired',
           ended_at = now(),
           end_reason = case
             when exists (
               select 1 from public.family_members m
                where m.family_id = c.family_id and m.user_id = c.dependent_id
                  and m.kind = 'minor' and m.birthdate + interval '18 years' <= now()
             ) then 'came_of_age' else 'expired' end
     where c.status = 'active'
       and c.expires_at <= now()
       and (c.dependent_id = p_user or c.guardian_id = p_user)
    returning c.id, c.family_id, c.dependent_id, c.end_reason
  loop
    perform public.family_audit(r.family_id, null, r.dependent_id, 'consent_ended',
      jsonb_build_object('reason', r.end_reason, 'consent_id', r.id));
  end loop;
end;
$fn$;

/** How many dependents a family may have: 1 on the free plan, no limit when paid. */
create or replace function public.family_require_dependent_slot(p_family uuid, p_except_invite uuid default null)
returns void language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_owner uuid;
  v_used int;
begin
  select f.created_by into v_owner from public.families f where f.id = p_family;
  if public.family_plan(v_owner) = 'paid' then return; end if;
  select
    (select count(*) from public.family_members m
      where m.family_id = p_family and m.role = 'dependent' and m.status = 'active')
    +
    (select count(*) from public.family_invites i
      where i.family_id = p_family and i.status = 'pending' and i.expires_at > now()
        and i.id is distinct from p_except_invite)
    into v_used;
  if v_used >= 1 then
    perform public.family_fail('plan_limit_dependents', 402);
  end if;
end;
$fn$;

-- ── 6. What the app calls ────────────────────────────────────────────────────

create or replace function public.family_create(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_name text := public.family_clean_text(p_name, 60);
  v_display text := public.family_clean_text(p_display_name, 60);
  v_family uuid;
begin
  if v_name is null or v_display is null then
    perform public.family_fail('invalid_name', 400);
  end if;
  if exists (select 1 from public.families f where f.created_by = v_uid) then
    perform public.family_fail('family_exists', 409);
  end if;
  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family;
  insert into public.family_members (family_id, user_id, role, display_name)
  values (v_family, v_uid, 'guardian', v_display);
  perform public.family_audit(v_family, v_uid, v_uid, 'family_created');
  return v_family;
end;
$fn$;

create or replace function public.family_rename(p_family uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_name text := public.family_clean_text(p_name, 60);
begin
  perform public.family_require_guardian(p_family);
  if v_name is null then
    perform public.family_fail('invalid_name', 400);
  end if;
  update public.families set name = v_name where id = p_family;
end;
$fn$;

/**
 * Invite a dependent. Returns the code once; only its hash is kept.
 *
 * For a minor (under 18) or a ward (an adult the guardian legally represents),
 * the guardian must declare that they are the legal representative, and this
 * call is their consent on the dependent's behalf: version, time and address
 * are recorded here and carried into the consent when the dependent confirms.
 */
create or replace function public.family_invite_create(
  p_family uuid,
  p_kind text,
  p_label text,
  p_months int default 12,
  p_birthdate date default null,
  p_rep_declared boolean default false,
  p_term_version text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
  v_label text := public.family_clean_text(p_label, 60);
  v_current text := (select t.version from public.family_consent_terms t order by t.published_at desc, t.version desc limit 1);
  v_code text;
  v_invite uuid;
  v_expires timestamptz := now() + interval '7 days';
  v_represented boolean := p_kind in ('minor', 'ward');
begin
  if p_kind is null or p_kind not in ('adult', 'minor', 'ward') then
    perform public.family_fail('invalid_kind', 400);
  end if;
  if v_label is null then
    perform public.family_fail('invalid_name', 400);
  end if;
  if p_months is null or p_months not in (3, 6, 12) then
    perform public.family_fail('invalid_months', 400);
  end if;
  if p_kind = 'minor' then
    if p_birthdate is null or p_birthdate > current_date or p_birthdate + interval '18 years' <= now() then
      perform public.family_fail('invalid_birthdate', 400);
    end if;
  elsif p_birthdate is not null then
    perform public.family_fail('invalid_birthdate', 400);
  end if;
  if v_represented then
    if not coalesce(p_rep_declared, false) then
      perform public.family_fail('representative_declaration_required', 400);
    end if;
    if p_term_version is distinct from v_current then
      perform public.family_fail('term_outdated', 409);
    end if;
  end if;

  perform public.family_require_dependent_slot(p_family);

  -- A used or expired invitation shouldn't sit around as a pending one.
  update public.family_invites set status = 'revoked'
   where family_id = p_family and status = 'pending' and expires_at <= now();

  loop
    v_code := public.family_new_code();
    begin
      insert into public.family_invites (
        family_id, created_by, code_hash, kind, label, birthdate, months, term_version,
        rep_declared, rep_consented_at, rep_ip, rep_ip_chain, rep_user_agent, expires_at
      ) values (
        p_family, v_uid, public.family_code_hash(v_code), p_kind, v_label,
        case when p_kind = 'minor' then p_birthdate end, p_months, v_current,
        v_represented,
        case when v_represented then now() end,
        case when v_represented then public.family_request_ip() end,
        case when v_represented then public.family_request_ip_chain() end,
        case when v_represented then public.family_request_user_agent() end,
        v_expires
      ) returning id into v_invite;
      exit;
    exception when unique_violation then
      -- The same code twice: draw again.
    end;
  end loop;

  perform public.family_audit(p_family, v_uid, v_uid, 'invite_created',
    jsonb_build_object('invite_id', v_invite, 'kind', p_kind));
  return jsonb_build_object('invite_id', v_invite, 'code', v_code, 'expires_at', v_expires);
end;
$fn$;

create or replace function public.family_invite_revoke(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_family uuid := (select i.family_id from public.family_invites i where i.id = p_invite);
begin
  if v_family is null then
    perform public.family_fail('invite_invalid', 404);
  end if;
  perform public.family_require_guardian(v_family);
  update public.family_invites set status = 'revoked' where id = p_invite and status = 'pending';
end;
$fn$;

/**
 * Look an invitation up by its code. A wrong code is not an error but a
 * `found: false`: a raised exception would roll back the very row that counts
 * the wrong guess. Ten wrong codes an hour, then the account waits.
 */
create or replace function public.family_invite_lookup(p_uid uuid, p_code text)
returns public.family_invites language plpgsql security definer set search_path = '' as $fn$
declare
  v_invite public.family_invites;
begin
  if (select count(*) from public.family_invite_attempts a
       where a.user_id = p_uid and a.attempted_at > now() - interval '1 hour') >= 10 then
    perform public.family_fail('too_many_attempts', 429);
  end if;
  select * into v_invite
    from public.family_invites i
   where i.code_hash = public.family_code_hash(p_code)
     and i.status = 'pending'
     and i.expires_at > now();
  if v_invite.id is null then
    delete from public.family_invite_attempts where user_id = p_uid and attempted_at < now() - interval '1 day';
    insert into public.family_invite_attempts (user_id) values (p_uid);
  end if;
  return v_invite;
end;
$fn$;

/** Who is inviting, and to what — shown to the dependent before any consent. */
create or replace function public.family_invite_preview(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_invite public.family_invites := public.family_invite_lookup(v_uid, p_code);
begin
  if v_invite.id is null then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'own_invite', v_invite.created_by = v_uid,
    'family_name', (select f.name from public.families f where f.id = v_invite.family_id),
    'guardian_name', (select m.display_name from public.family_members m
                       where m.family_id = v_invite.family_id and m.user_id = v_invite.created_by),
    'guardian_email', public.family_mask_email((select p.email from public.profiles p where p.id = v_invite.created_by)),
    'kind', v_invite.kind,
    'label', v_invite.label,
    'months', v_invite.months,
    'term_version', v_invite.term_version,
    'expires_at', v_invite.expires_at
  );
end;
$fn$;

/**
 * Accept an invitation: this is the consent.
 *
 * An adult consents for themselves (and must say they are 18 or older) and
 * picks the period. A minor or a ward confirms what their representative
 * consented to when inviting; a minor also confirms the birth date the
 * guardian declared, and the consent can't outlast their 18th birthday.
 */
create or replace function public.family_invite_accept(
  p_code text,
  p_display_name text,
  p_term_version text,
  p_months int default null,
  p_confirm_adult boolean default false,
  p_birthdate date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_display text := public.family_clean_text(p_display_name, 60);
  v_invite public.family_invites;
  v_months int;
  v_expires timestamptz;
  v_consent uuid;
  v_represented boolean;
begin
  if v_display is null then
    perform public.family_fail('invalid_name', 400);
  end if;
  v_invite := public.family_invite_lookup(v_uid, p_code);
  if v_invite.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invite_invalid');
  end if;
  -- Two people racing for one code: the second waits here and then finds it used.
  perform 1 from public.family_invites i where i.id = v_invite.id and i.status = 'pending' for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_invalid');
  end if;

  if v_invite.created_by = v_uid then
    perform public.family_fail('cannot_join_own_family', 409);
  end if;
  if exists (
    select 1 from public.family_members m
     where m.family_id = v_invite.family_id and m.user_id = v_uid and m.status = 'active'
  ) then
    perform public.family_fail('already_a_member', 409);
  end if;
  if (select count(*) from public.family_members m
       where m.user_id = v_uid and m.role = 'dependent' and m.status = 'active') >= 5 then
    perform public.family_fail('too_many_families', 409);
  end if;
  if p_term_version is distinct from v_invite.term_version then
    perform public.family_fail('term_outdated', 409);
  end if;

  v_represented := v_invite.kind in ('minor', 'ward');
  if v_invite.kind = 'adult' then
    if not coalesce(p_confirm_adult, false) then
      perform public.family_fail('adult_confirmation_required', 400);
    end if;
    v_months := coalesce(p_months, v_invite.months);
    if v_months not in (3, 6, 12) then
      perform public.family_fail('invalid_months', 400);
    end if;
    v_expires := now() + make_interval(months => v_months);
  else
    v_months := v_invite.months;
    v_expires := now() + make_interval(months => v_months);
    if v_invite.kind = 'minor' then
      if p_birthdate is distinct from v_invite.birthdate then
        perform public.family_fail('birthdate_mismatch', 409);
      end if;
      if v_invite.birthdate + interval '18 years' <= now() then
        perform public.family_fail('not_a_minor', 409);
      end if;
      v_expires := least(v_expires, (v_invite.birthdate + interval '18 years')::timestamptz);
    end if;
  end if;

  perform public.family_require_dependent_slot(v_invite.family_id, v_invite.id);

  insert into public.family_members (family_id, user_id, role, display_name, kind, birthdate, status, joined_at, ended_at)
  values (v_invite.family_id, v_uid, 'dependent', v_display, v_invite.kind, v_invite.birthdate, 'active', now(), null)
  on conflict (family_id, user_id) do update
    set display_name = excluded.display_name, kind = excluded.kind, birthdate = excluded.birthdate,
        status = 'active', joined_at = now(), ended_at = null;

  insert into public.family_consents (
    family_id, dependent_id, guardian_id, term_version, given_by, representative_id,
    granted_ip, granted_ip_chain, granted_user_agent,
    rep_consented_at, rep_ip, rep_ip_chain, rep_user_agent, months, expires_at
  ) values (
    v_invite.family_id, v_uid, v_invite.created_by, v_invite.term_version,
    case when v_represented then 'legal_representative' else 'self' end,
    case when v_represented then v_invite.created_by end,
    public.family_request_ip(), public.family_request_ip_chain(), public.family_request_user_agent(),
    v_invite.rep_consented_at, v_invite.rep_ip, v_invite.rep_ip_chain, v_invite.rep_user_agent,
    v_months, v_expires
  ) returning id into v_consent;

  update public.family_invites
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_invite.id;

  perform public.family_audit(v_invite.family_id, v_uid, v_uid, 'consent_granted',
    jsonb_build_object(
      'consent_id', v_consent, 'term_version', v_invite.term_version, 'months', v_months,
      'given_by', case when v_represented then 'legal_representative' else 'self' end,
      'guardian_id', v_invite.created_by
    ));

  return jsonb_build_object('ok', true, 'family_id', v_invite.family_id, 'consent_id', v_consent, 'expires_at', v_expires);
end;
$fn$;

/** The dependent stops sharing. Immediate, unconditional, and theirs alone to decide. */
create or replace function public.family_consent_revoke(p_family uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if not exists (
    select 1 from public.family_members m
     where m.family_id = p_family and m.user_id = v_uid and m.role = 'dependent'
  ) then
    perform public.family_fail('not_a_dependent', 403);
  end if;
  perform public.family_end_consents(p_family, v_uid, 'revoked_by_dependent', v_uid);
end;
$fn$;

/** The dependent stops sharing and leaves the family. */
create or replace function public.family_leave(p_family uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
begin
  if not exists (
    select 1 from public.family_members m
     where m.family_id = p_family and m.user_id = v_uid and m.role = 'dependent' and m.status = 'active'
  ) then
    perform public.family_fail('not_a_dependent', 403);
  end if;
  perform public.family_end_consents(p_family, v_uid, 'left_family', v_uid);
  update public.family_members set status = 'left', ended_at = now()
   where family_id = p_family and user_id = v_uid;
end;
$fn$;

/** The guardian stops following a dependent. */
create or replace function public.family_member_remove(p_family uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
begin
  if not exists (
    select 1 from public.family_members m
     where m.family_id = p_family and m.user_id = p_user and m.role = 'dependent' and m.status = 'active'
  ) then
    perform public.family_fail('not_a_dependent', 404);
  end if;
  perform public.family_end_consents(p_family, p_user, 'removed_by_guardian', v_uid);
  update public.family_members set status = 'removed', ended_at = now()
   where family_id = p_family and user_id = p_user;
  perform public.family_audit(p_family, v_uid, p_user, 'member_removed');
end;
$fn$;

/**
 * Consent again, by the dependent, after it ended or to extend it.
 *
 * Only someone who can consent for themselves: an adult, or a former minor
 * who has turned 18 (who becomes an adult member here, and whose birth date is
 * then dropped). A minor or a ward needs their representative — see
 * family_consent_renew_as_representative.
 */
create or replace function public.family_consent_renew(p_family uuid, p_term_version text, p_months int, p_confirm_adult boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_member public.family_members;
  v_guardian uuid;
  v_current text := (select t.version from public.family_consent_terms t order by t.published_at desc, t.version desc limit 1);
  v_expires timestamptz;
  v_consent uuid;
begin
  -- A consent whose date has passed is closed for what it was (expired, or a
  -- minor coming of age) before this one replaces it.
  perform public.family_expire_consents(v_uid);
  select * into v_member from public.family_members m
   where m.family_id = p_family and m.user_id = v_uid and m.role = 'dependent' and m.status = 'active';
  if v_member.user_id is null then
    perform public.family_fail('not_a_dependent', 403);
  end if;
  if v_member.kind = 'ward' or (v_member.kind = 'minor' and v_member.birthdate + interval '18 years' > now()) then
    perform public.family_fail('representative_required', 403);
  end if;
  if not coalesce(p_confirm_adult, false) then
    perform public.family_fail('adult_confirmation_required', 400);
  end if;
  if p_months is null or p_months not in (3, 6, 12) then
    perform public.family_fail('invalid_months', 400);
  end if;
  if p_term_version is distinct from v_current then
    perform public.family_fail('term_outdated', 409);
  end if;
  select f.created_by into v_guardian from public.families f where f.id = p_family;

  if v_member.kind = 'minor' then
    update public.family_members set kind = 'adult', birthdate = null
     where family_id = p_family and user_id = v_uid;
  end if;

  perform public.family_end_consents(p_family, v_uid, 'renewed', v_uid);
  v_expires := now() + make_interval(months => p_months);
  insert into public.family_consents (
    family_id, dependent_id, guardian_id, term_version, given_by,
    granted_ip, granted_ip_chain, granted_user_agent, months, expires_at
  ) values (
    p_family, v_uid, v_guardian, v_current, 'self',
    public.family_request_ip(), public.family_request_ip_chain(), public.family_request_user_agent(), p_months, v_expires
  ) returning id into v_consent;
  perform public.family_audit(p_family, v_uid, v_uid, 'consent_granted',
    jsonb_build_object('consent_id', v_consent, 'term_version', v_current, 'months', p_months, 'given_by', 'self', 'guardian_id', v_guardian));
  return jsonb_build_object('consent_id', v_consent, 'expires_at', v_expires);
end;
$fn$;

/**
 * The legal representative extends a minor's or a ward's consent.
 *
 * Only while it is still in force, or within 30 days of it running out on its
 * date. Never after the dependent stopped sharing themselves: undoing that
 * takes a new invitation, which the dependent has to accept.
 */
create or replace function public.family_consent_renew_as_representative(
  p_family uuid, p_dependent uuid, p_term_version text, p_months int, p_rep_declared boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
  v_member public.family_members;
  v_last public.family_consents;
  v_current text := (select t.version from public.family_consent_terms t order by t.published_at desc, t.version desc limit 1);
  v_expires timestamptz;
  v_consent uuid;
begin
  select * into v_member from public.family_members m
   where m.family_id = p_family and m.user_id = p_dependent and m.role = 'dependent' and m.status = 'active';
  if v_member.user_id is null then
    perform public.family_fail('not_a_dependent', 404);
  end if;
  if v_member.kind = 'adult' or (v_member.kind = 'minor' and v_member.birthdate + interval '18 years' <= now()) then
    perform public.family_fail('dependent_must_consent', 403);
  end if;
  if not coalesce(p_rep_declared, false) then
    perform public.family_fail('representative_declaration_required', 400);
  end if;
  if p_months is null or p_months not in (3, 6, 12) then
    perform public.family_fail('invalid_months', 400);
  end if;
  if p_term_version is distinct from v_current then
    perform public.family_fail('term_outdated', 409);
  end if;

  perform public.family_expire_consents(p_dependent);
  select * into v_last from public.family_consents c
   where c.family_id = p_family and c.dependent_id = p_dependent and c.guardian_id = v_uid
   order by c.created_at desc limit 1;
  if v_last.id is null
     or not (v_last.status = 'active' or (v_last.end_reason = 'expired' and v_last.ended_at > now() - interval '30 days')) then
    perform public.family_fail('new_invite_required', 409);
  end if;

  perform public.family_end_consents(p_family, p_dependent, 'renewed', v_uid);
  v_expires := now() + make_interval(months => p_months);
  if v_member.kind = 'minor' then
    v_expires := least(v_expires, (v_member.birthdate + interval '18 years')::timestamptz);
  end if;
  insert into public.family_consents (
    family_id, dependent_id, guardian_id, term_version, given_by, representative_id,
    granted_at, granted_ip, granted_ip_chain, granted_user_agent,
    rep_consented_at, rep_ip, rep_ip_chain, rep_user_agent, months, expires_at
  ) values (
    p_family, p_dependent, v_uid, v_current, 'legal_representative', v_uid,
    -- The dependent's own confirmation stands from the consent being renewed.
    v_last.granted_at, v_last.granted_ip, v_last.granted_ip_chain, v_last.granted_user_agent,
    now(), public.family_request_ip(), public.family_request_ip_chain(), public.family_request_user_agent(), p_months, v_expires
  ) returning id into v_consent;
  perform public.family_audit(p_family, v_uid, p_dependent, 'consent_granted',
    jsonb_build_object('consent_id', v_consent, 'term_version', v_current, 'months', p_months,
      'given_by', 'legal_representative', 'guardian_id', v_uid, 'renewal', true));
  return jsonb_build_object('consent_id', v_consent, 'expires_at', v_expires);
end;
$fn$;

/** Delete the family: every consent ends, and each dependent's history says why. */
create or replace function public.family_delete(p_family uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_require_guardian(p_family);
begin
  if not exists (select 1 from public.families f where f.id = p_family and f.created_by = v_uid) then
    perform public.family_fail('not_the_owner', 403);
  end if;
  delete from public.families where id = p_family;
end;
$fn$;

-- However a family goes (family_delete, or its guardian deleting their
-- account), the people who were sharing get an entry saying it ended.
create or replace function public.family_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.family_audit_log (family_id, actor_id, actor_name, subject_id, action, detail)
  select null, null,
         (select m.display_name from public.family_members m where m.family_id = old.id and m.user_id = old.created_by),
         c.dependent_id, 'consent_ended',
         jsonb_build_object('reason', 'family_deleted', 'consent_id', c.id)
    from public.family_consents c
   where c.family_id = old.id and c.status = 'active' and c.dependent_id <> old.created_by;
  return old;
end;
$fn$;

drop trigger if exists family_before_delete on public.families;
create trigger family_before_delete before delete on public.families
  for each row execute function public.family_before_delete();

/**
 * Everything the Family screens need about the caller, in one read: the
 * family they look after (dependents, invitations, plan) and the families they
 * share with (who sees their data, under which consent). No financial data.
 */
create or replace function public.family_my_state()
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := public.family_uid();
  v_family public.families;
  v_guardian jsonb := null;
  v_dependent jsonb;
begin
  perform public.family_expire_consents(v_uid);

  select f.* into v_family
    from public.families f
    join public.family_members m on m.family_id = f.id and m.user_id = v_uid and m.role = 'guardian' and m.status = 'active'
   limit 1;

  if v_family.id is not null then
    v_guardian := jsonb_build_object(
      'family', jsonb_build_object('id', v_family.id, 'name', v_family.name, 'created_at', v_family.created_at),
      'display_name', (select m.display_name from public.family_members m where m.family_id = v_family.id and m.user_id = v_uid),
      'plan', public.family_plan(v_family.created_by),
      'dependents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', d.user_id,
          'display_name', d.display_name,
          'kind', d.kind,
          'joined_at', d.joined_at,
          'locked', public.family_dependent_locked(v_family.id, d.user_id),
          'consent', (
            select jsonb_build_object(
              'id', c.id, 'status', c.status, 'given_by', c.given_by, 'term_version', c.term_version,
              'months', c.months, 'granted_at', c.granted_at, 'expires_at', c.expires_at,
              'ended_at', c.ended_at, 'end_reason', c.end_reason)
              from public.family_consents c
             where c.family_id = v_family.id and c.dependent_id = d.user_id and c.guardian_id = v_uid
             order by c.created_at desc limit 1
          )
        ) order by d.joined_at, d.user_id)
          from public.family_members d
         where d.family_id = v_family.id and d.role = 'dependent' and d.status = 'active'
      ), '[]'::jsonb),
      'invites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'label', i.label, 'kind', i.kind, 'months', i.months,
          'expires_at', i.expires_at, 'created_at', i.created_at
        ) order by i.created_at desc)
          from public.family_invites i
         where i.family_id = v_family.id and i.status = 'pending' and i.expires_at > now()
      ), '[]'::jsonb)
    );
  end if;

  v_dependent := coalesce((
    select jsonb_agg(jsonb_build_object(
      'family', jsonb_build_object('id', f.id, 'name', f.name),
      'display_name', me.display_name,
      'kind', me.kind,
      -- Whether this person can consent for themselves from here on.
      'can_self_consent', me.kind = 'adult' or (me.kind = 'minor' and me.birthdate + interval '18 years' <= now()),
      'joined_at', me.joined_at,
      'guardians', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', g.user_id,
          'display_name', g.display_name,
          'email', public.family_mask_email((select p.email from public.profiles p where p.id = g.user_id))
        ) order by g.joined_at)
          from public.family_members g
         where g.family_id = f.id and g.role = 'guardian' and g.status = 'active'
      ), '[]'::jsonb),
      'consent', (
        select jsonb_build_object(
          'id', c.id, 'status', c.status, 'given_by', c.given_by, 'term_version', c.term_version,
          'months', c.months, 'granted_at', c.granted_at, 'expires_at', c.expires_at,
          'ended_at', c.ended_at, 'end_reason', c.end_reason, 'guardian_id', c.guardian_id)
          from public.family_consents c
         where c.family_id = f.id and c.dependent_id = v_uid
         order by c.created_at desc limit 1
      )
    ) order by me.joined_at)
      from public.family_members me
      join public.families f on f.id = me.family_id
     where me.user_id = v_uid and me.role = 'dependent' and me.status = 'active'
  ), '[]'::jsonb);

  return jsonb_build_object(
    'user_id', v_uid,
    'plan', public.family_plan(v_uid),
    'term_version', (select t.version from public.family_consent_terms t order by t.published_at desc, t.version desc limit 1),
    'guardian_of', v_guardian,
    'dependent_of', v_dependent
  );
end;
$fn$;

-- ── 7. Who may call what ─────────────────────────────────────────────────────
-- Functions are executable by everyone by default, and Supabase grants them to
-- anon and authenticated on top. Take that away from every function above,
-- then grant the app exactly the ones it calls.

do $do$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname like 'family\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end;
$do$;

grant execute on function
  public.family_can_view(uuid),
  public.family_create(text, text),
  public.family_rename(uuid, text),
  public.family_invite_create(uuid, text, text, int, date, boolean, text),
  public.family_invite_revoke(uuid),
  public.family_invite_preview(text),
  public.family_invite_accept(text, text, text, int, boolean, date),
  public.family_consent_revoke(uuid),
  public.family_consent_renew(uuid, text, int, boolean),
  public.family_consent_renew_as_representative(uuid, uuid, text, int, boolean),
  public.family_leave(uuid),
  public.family_member_remove(uuid, uuid),
  public.family_delete(uuid),
  public.family_my_state()
to authenticated;
