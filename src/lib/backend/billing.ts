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
  /**
   * False once auto-renew is off while access continues to the end of the paid
   * period. The renewal reminder reads it: warning about a charge that isn't
   * coming is worse than staying quiet.
   */
  will_renew?: boolean | null;
}

/** The signed-in user's billing row (RLS-scoped), or null. */
export async function fetchBilling(): Promise<BillingRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("billing")
    .select("plan,status,current_period_end,trial_end,will_renew")
    .maybeSingle();
  return (data as BillingRow) ?? null;
}

/**
 * Trialing counts as active: the user has access, Apple just hasn't charged yet.
 *
 * The row only repeats what the last webhook said. If the period it describes
 * is over and no renewal arrived — a missed or failed delivery — it no longer
 * grants anything; the store, checked alongside it, has the final word.
 */
export function isActive(b: BillingRow | null, now: number = Date.now()): boolean {
  if (!b || (b.status !== "active" && b.status !== "trialing")) return false;
  const end = b.status === "trialing" && b.trial_end ? b.trial_end : b.current_period_end;
  if (!end) return true;
  const t = Date.parse(end);
  return !Number.isFinite(t) || t > now;
}
