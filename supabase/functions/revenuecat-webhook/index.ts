// RevenueCat → Supabase. Keeps `billing` in step with the store.
//
// Deploy WITHOUT JWT verification — RevenueCat has no Supabase session:
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets: REVENUECAT_WEBHOOK_SECRET (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are injected by Supabase).
//
// In RevenueCat: Project settings → Integrations → Webhooks, pointing at
//   https://<ref>.supabase.co/functions/v1/revenuecat-webhook
// with the same secret in the Authorization header field.
//
// A caller that hasn't proven itself with the secret learns nothing — not
// even whether the function is configured. Details go to the function's logs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isStale, updatesFor, type RcEvent } from "./logic.ts";

export interface Env {
  url: string;
  service: string;
  secret: string;
}

// deno-lint-ignore no-explicit-any
type MakeClient = (url: string, key: string, options?: any) => any;

function readEnv(): Env {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  return {
    url: env?.get("SUPABASE_URL") ?? "",
    service: env?.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    secret: env?.get("REVENUECAT_WEBHOOK_SECRET") ?? "",
  };
}

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient): Promise<Response> {
  // Fail closed: without a secret we cannot tell RevenueCat from anyone else.
  // 503, so RevenueCat retries once the configuration is fixed.
  if (!env.secret || !env.url || !env.service) {
    console.error("revenuecat-webhook: REVENUECAT_WEBHOOK_SECRET, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
    return new Response("Unavailable", { status: 503 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!safeEqual(req.headers.get("Authorization") ?? "", env.secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: RcEvent;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as RcEvent;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Anonymous ids (RevenueCat's own, before logIn) don't map to an account.
  const updates = updatesFor(event);
  if (updates.length === 0) return json({ ignored: "no account" });

  const admin = make(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const periodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  // When the event happened, not when it arrived — what isStale compares.
  const happenedAt = new Date(event.event_timestamp_ms ?? Date.now()).toISOString();
  let applied = 0;

  for (const { userId, access } of updates) {
    const { data: current, error: readError } = await admin
      .from("billing")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) {
      console.error("revenuecat-webhook: read billing:", readError.message);
      return new Response("Try again", { status: 500 });
    }
    // RevenueCat retries and doesn't promise order; never roll the state back.
    if (isStale(event, current?.updated_at as string | undefined)) continue;

    const { error } = await admin.from("billing").upsert({
      user_id: userId,
      provider: event.store === "PLAY_STORE" ? "play_store" : "app_store",
      status: access.status,
      plan: event.product_id?.includes("year") ? "yearly" : event.product_id ? "monthly" : null,
      product_id: event.product_id ?? null,
      rc_app_user_id: userId,
      will_renew: access.willRenew,
      current_period_end: periodEnd,
      trial_end: event.period_type === "TRIAL" ? periodEnd : null,
      updated_at: happenedAt,
    });
    // The account has been deleted since: nothing left to update, and
    // retrying won't change that.
    if (error?.code === "23503") continue;
    // A non-2xx makes RevenueCat retry, which is what a transient database
    // error needs. Every write is keyed by user_id, so a replay is harmless.
    if (error) {
      console.error("revenuecat-webhook: write billing:", error.message);
      return new Response("Try again", { status: 500 });
    }
    applied += 1;
  }

  return json({ received: true, applied });
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
