// Salt Edge → Flow Family. Salt Edge calls back when a connection finishes
// connecting or refreshing, fails, or is removed.
//
// Deploy WITHOUT JWT verification — Salt Edge has no Supabase session:
//   supabase functions deploy saltedge-webhook --no-verify-jwt
// Secrets: SALTEDGE_APP_ID, SALTEDGE_SECRET, SALTEDGE_CALLBACK_PUBLIC_KEY
// (Salt Edge's public key, PEM), SALTEDGE_CALLBACK_URL (the exact URL set in
// Salt Edge's dashboard); optional SALTEDGE_PRIVATE_KEY, EXPO_ACCESS_TOKEN.
//
// At Salt Edge, point the success, fail, notify and destroy callbacks at
//   https://<ref>.supabase.co/functions/v1/saltedge-webhook?type=<success|fail|notify|destroy>
//
// What is trusted. Salt Edge signs each callback (RSA-SHA256, base64, in the
// Signature header) over "<callback url>|<body>". Without a valid signature
// — or with no public key configured — nothing is accepted. Even then the
// body is only used for ids: the connection is read back from Salt Edge and
// must belong to a customer Flow created.
import { createClient } from "npm:@supabase/supabase-js@2";
import { forgetItem, SyncError } from "../_shared/bankSync.ts";
import { rsaVerify, sha256Hex } from "../_shared/crypto.ts";
import { adminClient, fail, inBackground, json, readEnv, type Env, type MakeClient } from "../_shared/http.ts";
import { runMaintenance } from "../_shared/maintenance.ts";
import type { Fetch } from "../_shared/pluggy.ts";
import { providersFromEnv, syncSaltEdgeConnection } from "../_shared/providers.ts";
import { deliverAlerts } from "../_shared/push.ts";

const TYPES = new Set(["success", "fail", "notify", "destroy"]);

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch, pushFetcher?: Fetch): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);
  const p = providersFromEnv(env, fetcher);
  if (!env.saltedgeCallbackPublicKey || !p.saltedge || !env.url || !env.service) {
    console.error("saltedge-webhook: Salt Edge (callback key) or Supabase is not configured");
    return fail("unauthorized", "Unauthorized.", 401);
  }

  const body = await req.text();
  const signature = req.headers.get("Signature") ?? "";
  const url = new URL(req.url);
  const signedUrl = env.saltedgeCallbackUrl ? `${env.saltedgeCallbackUrl}${url.search}` : req.url;
  if (!signature || body.length > 100_000 || !(await rsaVerify(env.saltedgeCallbackPublicKey, `${signedUrl}|${body}`, signature))) {
    return fail("unauthorized", "Unauthorized.", 401);
  }

  let payload: { data?: { connection_id?: string | number; customer_id?: string | number; stage?: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return fail("invalid_payload", "Invalid payload.", 400);
  }
  const type = url.searchParams.get("type") ?? "";
  const connectionId = payload.data?.connection_id != null ? String(payload.data.connection_id) : "";
  const customerId = payload.data?.customer_id != null ? String(payload.data.customer_id) : "";
  if (!TYPES.has(type) || !connectionId || connectionId.length > 100) return fail("invalid_payload", "Invalid payload.", 400);

  const admin = adminClient(env, make);
  const eventId = `saltedge:${(await sha256Hex(`${type}|${body}`)).slice(0, 64)}`;
  const { data: seen } = await admin.from("bank_webhook_events").select("processed_at").eq("event_id", eventId).maybeSingle();
  if (seen?.processed_at) return json({ ok: true, duplicate: true });
  if (!seen) {
    const { error } = await admin.from("bank_webhook_events").insert({ event_id: eventId, event: `saltedge/${type}`, item_id: connectionId });
    if (error?.code === "23505") return json({ ok: true, duplicate: true });
    if (error) return fail("unavailable", "Unavailable.", 500);
  }

  try {
    let outcome = "ignored";
    if (type === "destroy") {
      outcome = (await forgetItem(admin, connectionId, "saltedge")) ? "forgotten" : "ignored";
    } else if (type !== "notify" || payload.data?.stage === "finish") {
      // Whose: the person whose Salt Edge customer this is.
      const { data: customer } = await admin
        .from("bank_customers")
        .select("user_id")
        .eq("provider", "saltedge")
        .eq("external_customer_id", customerId)
        .maybeSingle();
      if (customer) {
        const r = await syncSaltEdgeConnection(admin, p, customer.user_id, connectionId);
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
    console.error("saltedge-webhook:", message);
    await admin.from("bank_webhook_events").update({ error: message }).eq("event_id", eventId);
    return fail("processing_failed", "Processing failed.", 500);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
