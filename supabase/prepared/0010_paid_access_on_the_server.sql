-- 0010 — The subscription, enforced by the server as well as the app.
--
-- PREPARED, NOT APPLIED — and not to be applied before, in this order:
--   1. the revenuecat-webhook function is deployed and configured in
--      RevenueCat, and a sandbox purchase has written a `billing` row;
--   2. an app version that keeps writes refused with HTTP 402 queued (instead
--      of discarding them) is the one people have — src/data/outbox.ts,
--      isRetryable. Flow isn't released yet, so that's version 1.0;
--   3. any account that must work without buying (yours, while developing in
--      Expo Go, where there is no store) has a row, as the service role:
--        insert into public.billing (user_id, status, current_period_end)
--        values ('<account id>', 'active', now() + interval '1 year');
-- Checked inside a rolled-back transaction (see SEGURANCA.md → "Testes").
--
-- Why. The paywall is a screen. Behind it, the database accepts writes from
-- any signed-in account, subscribed or not: a free account can keep its
-- records through the API directly, or through a copy of the app with the
-- paywall patched out on a jailbroken phone (OWASP API6:2023, sensitive
-- business flows; MASVS-RESILIENCE — client checks can be bypassed).
--
-- What it does. Adding or changing entries, subscriptions and categories
-- needs an active, trialing or past-due (billing grace period) subscription
-- whose period hasn't ended more than 3 days ago — slack for a renewal whose
-- webhook arrives late. Reading and deleting are never blocked: people keep
-- access to their own data, and can take it with them or erase it (LGPD).
-- Budgets and preferences stay open, since the intro sets a budget before the
-- paywall. The refusal is SQLSTATE PT402, which the API returns as HTTP 402.
--
-- Only the app's users are checked (role `authenticated`). The sign-up
-- trigger, the webhook and account deletion run as other roles.

create or replace function public.require_paid_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if current_user = 'authenticated' and not exists (
    select 1
      from public.billing b
     where b.user_id = (select auth.uid())
       and b.status in ('active', 'trialing', 'past_due')
       and coalesce(
             case when b.status = 'trialing' then coalesce(b.trial_end, b.current_period_end)
                  else b.current_period_end end,
             'infinity'::timestamptz
           ) > now() - interval '3 days'
  ) then
    raise exception 'An active subscription is needed to add or change entries.'
      using errcode = 'PT402', hint = 'Subscribe, or restore your purchase, in the app.';
  end if;
  return null;
end;
$fn$;

revoke execute on function public.require_paid_access() from public, anon, authenticated;

create trigger transactions_paid_access before insert or update on public.transactions
  for each statement execute function public.require_paid_access();
create trigger subscriptions_paid_access before insert or update on public.subscriptions
  for each statement execute function public.require_paid_access();
create trigger categories_paid_access before insert or update on public.categories
  for each statement execute function public.require_paid_access();
