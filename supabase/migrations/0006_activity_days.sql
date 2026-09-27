-- The days each account opened the app — what the streak counts.
--
-- This used to live in the phone's local storage, one log for the whole device.
-- That was wrong twice over: a second account on the same phone inherited the
-- first one's streak, and the same person on a new phone (or after reinstalling)
-- started again from zero. A streak belongs to a person, so it lives with their
-- account.
--
-- One row per account per day, keyed on both, so recording today is an insert
-- that does nothing the second time — safe from two devices at once, and no
-- read-modify-write to race.
--
-- Stored as the device's local calendar day, as `dayKey()` produces it: a
-- streak is about the user's days, not UTC's.

create table if not exists public.activity_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

alter table public.activity_days enable row level security;

-- Read and add your own days. No update or delete policy: history is append-only
-- from the app, and the rows go with the account through the cascade above.
create policy "activity_days read own" on public.activity_days
  for select using (auth.uid() = user_id);
create policy "activity_days add own" on public.activity_days
  for insert with check (auth.uid() = user_id);
