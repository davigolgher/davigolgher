// RevenueCat → Supabase. Keeps `billing` in step with the store.
//
// Deploy WITHOUT JWT verification — RevenueCat has no Supabase session:
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: REVENUECAT_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// In RevenueCat: Project settings → Integrations → Webhooks, pointing at
//   https://<ref>.supabase.co/functions/v1/revenuecat-webhook
// with the same secret in the Authorization header field.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

/**
 * Constant-time compare. A plain `===` returns as soon as two bytes differ,
 * and that timing difference is enough to recover a secret one character at a
 * time — worth avoiding on the endpoint that grants paid access.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface RcEvent {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  period_type?: string; // NORMAL | TRIAL | INTRO
  expiration_at_ms?: number | null;
  store?: string;
}

/** What the event means for access. */
function statusFor(event: RcEvent): { status: string; willRenew: boolean | null } {
  const trial = event.period_type === "TRIAL";
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "TRANSFER":
      return { status: trial ? "trialing" : "active", willRenew: true };

    // Auto-renew was switched off. Access continues to the end of the paid
    // period, so this is not the moment to take it away.
    case "CANCELLATION":
      return { status: trial ? "trialing" : "active", willRenew: false };

    // Apple couldn't charge. Access stays in its grace period; the status marks
    // it so the app can nudge rather than lock the user out mid-period.
    case "BILLING_ISSUE":
      return { status: "past_due", willRenew: true };

    case "EXPIRATION":
    case "SUBSCRIPTION_PAUSED":
      return { status: "inactive", willRenew: false };

    default:
      return { status: "inactive", willRenew: null };
  }
}

Deno.serve(async (req) => {
  // Fail closed: without a secret we cannot tell RevenueCat from anyone else.
  if (!SECRET) return new Response("REVENUECAT_WEBHOOK_SECRET is not set", { status: 500 });
  if (!safeEqual(req.headers.get("Authorization") ?? "", SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: RcEvent;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as RcEvent;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const userId = event.app_user_id;
  // Anonymous ids (RevenueCat's own, before logIn) don't map to an account.
  if (!userId || userId.startsWith("$RCAnonymousID:")) {
    return new Response(JSON.stringify({ ignored: "no account" }), { status: 200 });
  }

  const { status, willRenew } = statusFor(event);
  const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { error } = await admin.from("billing").upsert({
    user_id: userId,
    provider: event.store === "PLAY_STORE" ? "play_store" : "app_store",
    status,
    plan: event.product_id?.includes("year") ? "yearly" : event.product_id ? "monthly" : null,
    product_id: event.product_id ?? null,
    rc_app_user_id: userId,
    will_renew: willRenew,
    current_period_end: periodEnd,
    trial_end: event.period_type === "TRIAL" ? periodEnd : null,
    updated_at: new Date().toISOString(),
  });

  // A non-2xx makes RevenueCat retry, which is what we want for a transient
  // database error. The upsert is keyed by user_id, so a replayed event is
  // harmless.
  if (error) return new Response(error.message, { status: 500 });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
