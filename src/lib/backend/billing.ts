/**
 * Subscription state as the server sees it.
 *
 * RevenueCat's webhook writes the entitlement into `billing`; the app reads it
 * here. Having a server-side copy matters for two reasons: it survives a
 * reinstall or a new device before the store has been consulted, and anything
 * running server-side (a renewal reminder, say) can check it without a device.
 *
 * The store is still the authority on the device — this is the cached view of
 * it, not a second source of truth.
 */
import { getSupabase } from "./client";

export interface BillingRow {
  plan?: string | null;
  status: string;
  current_period_end?: string | null;
  trial_end?: string | null;
}

/** The signed-in user's billing row (RLS-scoped), or null. */
export async function fetchBilling(): Promise<BillingRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("billing").select("plan,status,current_period_end,trial_end").maybeSingle();
  return (data as BillingRow) ?? null;
}

/** Trialing counts as active: the user has access, Apple just hasn't charged yet. */
export function isActive(b: BillingRow | null): boolean {
  return Boolean(b && (b.status === "active" || b.status === "trialing"));
}
