-- A streak day now means "completed the daily review", not "opened the app"
-- (see src/lib/streak.ts for why). The table keeps its shape; only what a row
-- means changes — and no rows existed when it did, so nothing is reinterpreted.
--
-- A day can only be recorded on that day. The app sends the device's local
-- date and the database clock is UTC, so a genuine local date is always within
-- one day of the server's, either side — every real time zone, from UTC−12 to
-- UTC+14, lands inside that window. Anything outside it is refused: a request
-- can't backfill last week to rebuild a lapsed streak. The app never tries to;
-- this makes sure nothing else can either.

drop policy if exists "activity_days add own" on public.activity_days;

create policy "activity_days add own" on public.activity_days
  for insert with check (
    auth.uid() = user_id
    and day between current_date - 1 and current_date + 1
  );
