-- 0009 — Input limits, least-privilege grants and receipt paths bound to their owner.
--
-- PREPARED, NOT APPLIED. Checked inside a rolled-back transaction against the
-- live schema (see SEGURANCA.md → "Testes"); apply it by moving this file to
-- supabase/migrations/ and running it (SQL editor or `supabase db push`).
-- Every existing row already satisfies these rules (counted before writing).
--
-- Why. Row Level Security keeps each account to its own rows, and the two-
-- account probe confirmed it. What it doesn't do is limit *what* an account
-- writes into its own rows. The API accepted, from a signed-in user:
--   · a negative amount, or one past what the app can show;
--   · a description, note or name of any length (megabytes per row);
--   · an unknown subscription frequency or status, or a 0-day interval;
--   · any number of rows;
--   · an upload anywhere in the receipts bucket, of any size or type.
-- One account could therefore fill the free plan's 500 MB database or its
-- storage and stop the project for everyone (OWASP API4:2023, Unrestricted
-- Resource Consumption), or store values its own app can't display (ASVS V2,
-- validation at the server rather than only in the client).
--
-- The limits match what the app already enforces (src/lib/sanitize.ts: 200
-- characters, 1,000 for notes; mobile/src/lib/amount.ts: ten whole digits),
-- so nothing the app sends today is refused.

-- ── 1. Values ────────────────────────────────────────────────────────────────

alter table public.transactions
  add constraint transactions_amount_range check (amount between 0 and 999999999999),
  add constraint transactions_text_lengths check (
    length(description) <= 200 and length(category) <= 200
    and length(coalesce(merchant, '')) <= 200 and length(coalesce(note, '')) <= 1000
  ),
  add constraint transactions_currency_code check (currency ~ '^[A-Z]{3}$'),
  -- Nothing sets this today. If attachments come back, a path can only name
  -- a file in the owner's own folder.
  add constraint transactions_receipt_own_folder check (
    receipt_path is null or (length(receipt_path) <= 300 and receipt_path like user_id::text || '/%')
  );

alter table public.subscriptions
  add constraint subscriptions_amount_range check (amount between 0 and 999999999999),
  add constraint subscriptions_text_lengths check (length(name) <= 200 and length(coalesce(category, '')) <= 200),
  add constraint subscriptions_currency_code check (currency ~ '^[A-Z]{3}$'),
  add constraint subscriptions_frequency_known check (frequency in ('monthly', 'yearly', 'weekly', 'custom')),
  add constraint subscriptions_status_known check (status in ('active', 'paused', 'canceled', 'archived', 'trial')),
  add constraint subscriptions_interval_range check (custom_interval_days is null or custom_interval_days between 1 and 3660);

alter table public.categories
  add constraint categories_label_length check (length(label) between 1 and 200);

alter table public.budgets
  add constraint budgets_limit_range check ("limit" between 0 and 999999999999),
  add constraint budgets_text_lengths check (length(scope) between 1 and 200 and length(label) <= 200);

alter table public.preferences
  add constraint preferences_currency_code check (currency ~ '^[A-Z]{3}$'),
  add constraint preferences_locale_tag check (length(locale) <= 35 and locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$');

-- ── 2. Rows per account ──────────────────────────────────────────────────────
-- Far past real use (50,000 entries is decades of daily logging), low enough
-- that one account can't fill the database.
--
-- Checked once per statement, after it runs, over the rows it inserted (a
-- transition table): one count per statement, however many rows it carries.
-- A per-row check counted the account's rows once per inserted row, which
-- turned a bulk insert quadratic — found when seeding 20,000 test rows took
-- over a minute. An edit saved as an upsert inserts nothing, so it's never
-- refused. Refusals use SQLSTATE 23514, which the API returns as 400, and the
-- app then stops retrying instead of looping. Two statements racing at the
-- very limit can both pass: this is a ceiling on abuse, not an invariant.
-- SECURITY INVOKER: the count runs under the caller's own RLS, so it can't be
-- used to learn anything about another account's rows.

create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  cap int := TG_ARGV[0]::int;
  over uuid;
begin
  execute format(
    'select u.user_id from (select distinct user_id from new_rows) u
      where (select count(*) from (select 1 from %I.%I t where t.user_id = u.user_id limit %s) s) > %s
      limit 1',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, cap + 1, cap)
    into over;
  if over is not null then
    raise exception 'This account has reached the limit of % rows in %.', cap, TG_TABLE_NAME
      using errcode = '23514', hint = 'Delete entries you no longer need, or contact support.';
  end if;
  return null;
end;
$fn$;

revoke execute on function public.enforce_row_cap() from public, anon, authenticated;

create trigger transactions_row_cap after insert on public.transactions
  referencing new table as new_rows for each statement execute function public.enforce_row_cap('50000');
create trigger subscriptions_row_cap after insert on public.subscriptions
  referencing new table as new_rows for each statement execute function public.enforce_row_cap('1000');
create trigger categories_row_cap after insert on public.categories
  referencing new table as new_rows for each statement execute function public.enforce_row_cap('500');
create trigger budgets_row_cap after insert on public.budgets
  referencing new table as new_rows for each statement execute function public.enforce_row_cap('100');

-- ── 3. Least privilege ───────────────────────────────────────────────────────
-- (Tables created later still get Supabase's broad default grants; each new
-- table needs RLS enabled and its own grants reviewed the same way.)
-- Supabase grants anon and authenticated every privilege on new tables,
-- TRUNCATE included — which RLS does not govern. The API can't issue a
-- TRUNCATE today, and anon matches no policy, but the grants are the second
-- lock, and they should describe what each role actually does:
--   · anon (no session) touches no table at all in this app;
--   · billing is written only by the RevenueCat webhook (service role);
--   · activity_days is add-only — a streak day is never edited or removed
--     by the app (account deletion runs as the service role);
--   · profiles is written only by the sign-up trigger.

revoke all on table
  public.transactions, public.subscriptions, public.categories, public.budgets,
  public.preferences, public.profiles, public.billing, public.activity_days
from anon;

revoke truncate, references, trigger on table
  public.transactions, public.subscriptions, public.categories, public.budgets,
  public.preferences, public.profiles, public.billing, public.activity_days
from authenticated;

revoke insert, update, delete on table public.billing from authenticated;
revoke update, delete on table public.activity_days from authenticated;
revoke insert, update, delete on table public.profiles from authenticated;

drop policy "profiles self" on public.profiles;
create policy "profiles read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Name the role each remaining policy is for, instead of PUBLIC.
alter policy "transactions owner" on public.transactions to authenticated;
alter policy "subscriptions owner" on public.subscriptions to authenticated;
alter policy "categories owner" on public.categories to authenticated;
alter policy "budgets owner" on public.budgets to authenticated;
alter policy "preferences owner" on public.preferences to authenticated;
alter policy "billing read own" on public.billing to authenticated;
alter policy "activity_days read own" on public.activity_days to authenticated;
alter policy "activity_days add own" on public.activity_days to authenticated;

-- ── 4. Receipts bucket ───────────────────────────────────────────────────────
-- Private already. An upload could still land in another account's folder
-- (reproduced: user A wrote receipts/<B's id>/planted.jpg — B's files stayed
-- unreadable to A, but A's file sat in B's folder and outlived A's own
-- deletion), and could be any size or type. The app uploads nothing today;
-- these rules are what an attachment feature would have to live within.

update storage.buckets
   set file_size_limit = 8388608, -- 8 MB, as src/lib/upload.ts
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'receipts';

drop policy "receipts insert own" on storage.objects;
create policy "receipts insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and owner = (select auth.uid())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
alter policy "receipts read own" on storage.objects to authenticated;
alter policy "receipts delete own" on storage.objects to authenticated;
