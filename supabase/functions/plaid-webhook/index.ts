// Plaid → Flow Family. Plaid calls this when a connection's transactions
// change, when a connection needs the person, and when a Link session ends.
//
// Deploy WITHOUT JWT verification — Plaid has no Supabase session:
//   supabase functions deploy plaid-webhook --no-verify-jwt
// Secrets: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, BANK_TOKEN_KEY;
// optional PLAID_SANDBOX_SECRET, EXPO_ACCESS_TOKEN.
// The webhook URL is set per connection when its Link token is created
// (https://<ref>.supabase.co/functions/v1/plaid-webhook); nothing to
// configure at Plaid.
//
// What is trusted. Every call must carry Plaid's signature: an ES256 JWT in
// the Plaid-Verification header, by a key Plaid publishes
// (/webhook_verification_key/get), issued within five minutes, whose claims
// hold this exact body's SHA-256. Without it the caller learns nothing. Even
// then the body is only used for ids: the facts are read back from Plaid.
//
// Each delivery is processed once (by the body's hash). A failure answers 500
// so Plaid tries again.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SyncError } from "../_shared/bankSync.ts";
import { jwtHeader, sha256Hex, verifyPlaidJwt } from "../_shared/crypto.ts";
import { adminClient, fail, inBackground, json, readEnv, type Env, type MakeClient } from "../_shared/http.ts";
import { runMaintenance } from "../_shared/maintenance.ts";
import type { PlaidEnvironment } from "../_shared/plaid.ts";
import type { Fetch } from "../_shared/pluggy.ts";
import { plaidLinkComplete, providersFromEnv, syncPlaidConnection, type LinkSession, type Providers } from "../_shared/providers.ts";
import { deliverAlerts } from "../_shared/push.ts";

interface Payload {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  link_token?: string;
}

/** Find the key in whichever Plaid environment this server talks to. */
async function verify(p: Providers, token: string, body: string): Promise<boolean> {
  const kid = jwtHeader(token)?.kid;
  if (!kid || kid.length > 200) return false;
  for (const environment of ["production", "sandbox"] as PlaidEnvironment[]) {
    const plaid = p.plaid(environment);
    if (!plaid) continue;
    try {
      const key = await plaid.verificationKey(kid);
      return await verifyPlaidJwt(token, key, body);
    } catch {
      /* not this environment's key */
    }
  }
  return false;
}

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch, pushFetcher?: Fetch): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);
  const p = providersFromEnv(env, fetcher);
  if (!env.url || !env.service || !(p.plaid("production") ?? p.plaid("sandbox"))) {
    console.error("plaid-webhook: Plaid or Supabase is not configured");
    return fail("unavailable", "Unavailable.", 503);
  }

  const body = await req.text();
  const token = req.headers.get("Plaid-Verification") ?? "";
  if (!token || body.length > 100_000 || !(await verify(p, token, body))) return fail("unauthorized", "Unauthorized.", 401);

  let payload: Payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return fail("invalid_payload", "Invalid payload.", 400);
  }

  const admin = adminClient(env, make);
  const eventId = `plaid:${(await sha256Hex(body)).slice(0, 64)}`;
  const { data: seen } = await admin.from("bank_webhook_events").select("processed_at").eq("event_id", eventId).maybeSingle();
  if (seen?.processed_at) return json({ ok: true, duplicate: true });
  if (!seen) {
    const { error } = await admin
      .from("bank_webhook_events")
      .insert({ event_id: eventId, event: `${payload.webhook_type ?? ""}/${payload.webhook_code ?? ""}`.slice(0, 60), item_id: payload.item_id ?? null });
    if (error?.code === "23505") return json({ ok: true, duplicate: true });
    if (error) return fail("unavailable", "Unavailable.", 500);
  }

  try {
    let outcome = "ignored";
    if (payload.webhook_type === "LINK" && payload.link_token) {
      // The Link session ended: store what it connected, even if the app
      // never came back from the browser.
      const { data: session } = await admin
        .from("bank_link_sessions")
        .select("*")
        .eq("provider", "plaid")
        .eq("external_ref", payload.link_token)
        .maybeSingle();
      if (session && !session.completed_at) {
        const results = await plaidLinkComplete(admin, p, session as LinkSession);
        outcome = `linked:${results.length}`;
      }
    } else if (payload.item_id && (payload.webhook_type === "TRANSACTIONS" || payload.webhook_type === "ITEM")) {
      const { data: conn } = await admin.from("bank_connections").select("id").eq("provider", "plaid").eq("external_item_id", payload.item_id).maybeSingle();
      if (conn) {
        const r = await syncPlaidConnection(admin, p, conn.id);
        outcome = `synced:${r.status}:${r.inserted}`;
      }
    }
    await admin.from("bank_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("event_id", eventId);
    await inBackground(Promise.all([deliverAlerts(admin, { fetcher: pushFetcher, accessToken: env.expoAccessToken || undefined }), runMaintenance(admin, p)]));
    return json({ ok: true, outcome });
  } catch (e) {
    if (e instanceof SyncError) {
      await admin.from("bank_webhook_events").update({ processed_at: new Date().toISOString(), error: e.code }).eq("event_id", eventId);
      return json({ ok: true, outcome: `refused:${e.code}` });
    }
    const message = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("plaid-webhook:", message);
    await admin.from("bank_webhook_events").update({ error: message }).eq("event_id", eventId);
    return fail("processing_failed", "Processing failed.", 500);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
