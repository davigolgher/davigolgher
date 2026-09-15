/** Billing helpers — talk to the Stripe Edge Functions and the billing table. */
import { getSupabase } from "./client";

export interface BillingRow {
  plan?: string | null;
  status: string;
  current_period_end?: string | null;
  trial_end?: string | null;
}

/** Ask the backend for a Stripe Checkout URL for the given plan. */
export async function createCheckout(plan: "monthly" | "yearly"): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  const { data, error } = await sb.functions.invoke("create-checkout", { body: { plan } });
  if (error) throw error;
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("No checkout URL returned");
  return url;
}

/** Open the Stripe Billing Portal (manage/cancel). Returns the portal URL. */
export async function openBillingPortal(): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  const { data, error } = await sb.functions.invoke("create-portal", { body: {} });
  if (error) throw error;
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("No portal URL returned");
  return url;
}

/** The current user's billing row (RLS-scoped), or null. */
export async function fetchBilling(): Promise<BillingRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("billing").select("plan,status,current_period_end,trial_end").maybeSingle();
  return (data as BillingRow) ?? null;
}

export function isActive(b: BillingRow | null): boolean {
  return Boolean(b && (b.status === "active" || b.status === "trialing"));
}
