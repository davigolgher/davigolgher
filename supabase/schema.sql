-- Flow — full schema (mirror of supabase/migrations/*, for one-paste in the Supabase SQL editor).
-- The CLI path uses the individual migration files instead.

-- Flow — schema + Row Level Security.
-- Apply with `supabase db push` (CLI) or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- profiles: 1:1 with auth.users, created automatically on sign-up.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  insert into public.preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  insert into public.budgets (user_id, scope, label, "limit") values (new.id, 'total', 'Monthly budget', 0)
  on conflict (user_id, scope) do nothing;
  return new;
end; $$;

-- A trigger function, not an API: nobody calls it directly (see 0008).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- transactions (amounts are integer cents).
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  direction text not null check (direction in ('expense','income')),
  description text not null default '',
  category text not null default '',
  date timestamptz not null,
  merchant text,
  note text,
  currency text not null default 'USD',
  source text not null default 'manual' check (source in ('manual')),
  receipt_path text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- subscriptions.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  amount bigint not null,
  currency text not null default 'USD',
  frequency text not null,
  custom_interval_days int,
  next_charge_at timestamptz,
  status text not null default 'active',
  category text,
  reminders boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- categories.
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  custom boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

-- budgets (one row per scope; 'total' is the monthly budget).
create table if not exists public.budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'total',
  label text not null default 'Monthly budget',
  "limit" bigint not null default 0,
  primary key (user_id, scope)
);

-- preferences (one row per user).
create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'USD',
  locale text not null default 'en-US',
  reminders boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Server-side copy of the store entitlement, written by the RevenueCat webhook.
-- The store is the authority; this survives reinstalls and can be read without
-- a device.
create table if not exists public.billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text,
  status text not null default 'inactive',
  provider text not null default 'app_store',
  product_id text,
  rc_app_user_id text,
  -- False once auto-renew is off, while access continues to period end.
  will_renew boolean,
  current_period_end timestamptz,
  trial_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.transactions  enable row level security;
alter table public.subscriptions enable row level security;
alter table public.categories    enable row level security;
alter table public.budgets       enable row level security;
alter table public.preferences   enable row level security;
alter table public.billing       enable row level security;

-- `(select auth.uid())` is evaluated once per query rather than once per row
-- (see 0008). Same comparison, same result.
create policy "profiles self" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "transactions owner" on public.transactions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "subscriptions owner" on public.subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories owner" on public.categories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "budgets owner" on public.budgets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences owner" on public.preferences
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- billing: users may read their own row; only the service role writes it.
create policy "billing read own" on public.billing
  for select using ((select auth.uid()) = user_id);

-- activity_days: the days each account completed its daily review — what the
-- streak counts. One row per account per day, so recording today twice is a
-- no-op, and a day can only be recorded on that day (± one, for time zones).
-- See 0006 and 0007.
create table if not exists public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;
create policy "activity_days read own" on public.activity_days
  for select using ((select auth.uid()) = user_id);
create policy "activity_days add own" on public.activity_days
  for insert with check (
    (select auth.uid()) = user_id
    and day between current_date - 1 and current_date + 1
  );

-- Private bucket for receipt files. Objects are stored under `<user_id>/<file>`,
-- so `owner = auth.uid()` scopes access to the uploader.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts read own" on storage.objects
  for select using (bucket_id = 'receipts' and owner = auth.uid());

create policy "receipts insert own" on storage.objects
  for insert with check (bucket_id = 'receipts' and owner = auth.uid());

create policy "receipts delete own" on storage.objects
  for delete using (bucket_id = 'receipts' and owner = auth.uid());
