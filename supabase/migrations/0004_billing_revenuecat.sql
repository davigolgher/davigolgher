-- Billing moves from Stripe to Apple In-App Purchase, wrapped by RevenueCat.
--
-- The Stripe columns were never written to — there is no web checkout any more,
-- and Guideline 3.1.1 rules one out for a subscription consumed in the app — so
-- dropping them removes a misleading shape rather than data.

alter table public.billing drop column if exists stripe_customer_id;
alter table public.billing drop column if exists stripe_subscription_id;

-- Which store the entitlement came from. Room for Google Play later without
-- another migration.
alter table public.billing add column if not exists provider text not null default 'app_store';

-- The store product behind the entitlement, e.g. flow_pro_yearly. Useful for
-- support ("which plan is this account on?") and for spotting a bad rollout.
alter table public.billing add column if not exists product_id text;

-- RevenueCat's app_user_id. Set to the Supabase user id at sign-in, so the
-- webhook can find the row; kept for reconciling against RevenueCat's dashboard.
alter table public.billing add column if not exists rc_app_user_id text;

-- False once auto-renew is switched off, while access continues to period end.
-- The difference matters: a cancelled-but-still-valid subscription must keep
-- working, and a renewal reminder must not be sent for one.
alter table public.billing add column if not exists will_renew boolean;

comment on table public.billing is
  'Server-side copy of the store entitlement, written by the RevenueCat webhook. The store is the authority; this is the cached view that survives reinstalls and can be read without a device.';
