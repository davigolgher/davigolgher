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
import { accessFor, isStale, type RcEvent } from "./logic.ts";

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

  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: current, error: readError } = await admin
    .from("billing")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return new Response(readError.message, { status: 500 });
  if (isStale(event, current?.updated_at as string | undefined)) {
    return new Response(JSON.stringify({ ignored: "older than the current state" }), { status: 200 });
  }

  const { status, willRenew } = accessFor(event);
  const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

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
    // When the event happened, not when it arrived — what isStale compares.
    updated_at: new Date(event.event_timestamp_ms ?? Date.now()).toISOString(),
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
