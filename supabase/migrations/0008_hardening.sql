-- Two findings from Supabase's database advisors. Neither changes who can see
-- or write what; both were verified afterwards with the two-account probe.
--
-- 1. handle_new_user() was callable over the API (/rest/v1/rpc/handle_new_user)
--    by anon and signed-in users, as a SECURITY DEFINER function. Being a
--    trigger function it refuses to run outside a trigger, so nothing leaked —
--    but nobody should be able to reach it at all. EXECUTE comes from PUBLIC by
--    default, so that's where it's revoked. The sign-up trigger doesn't need it
--    (checked by inserting a user in a rolled-back transaction); the auth
--    service's role keeps it explicitly anyway.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- 2. `auth.uid()` in a policy is re-evaluated for every row; wrapped in a
--    sub-select, Postgres evaluates it once per query (advisor 0003,
--    auth_rls_initplan). Same comparison, same result.
alter policy "profiles self" on public.profiles
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "transactions owner" on public.transactions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "subscriptions owner" on public.subscriptions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "categories owner" on public.categories
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "budgets owner" on public.budgets
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "preferences owner" on public.preferences
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "billing read own" on public.billing
  using ((select auth.uid()) = user_id);
alter policy "activity_days read own" on public.activity_days
  using ((select auth.uid()) = user_id);
alter policy "activity_days add own" on public.activity_days
  with check (
    (select auth.uid()) = user_id
    and day between current_date - 1 and current_date + 1
  );
