// Pluggy → Flow Family. Pluggy calls this when a connection changes or the
// bank reports new, changed or withdrawn entries.
//
// Deploy WITHOUT JWT verification — Pluggy has no Supabase session:
//   supabase functions deploy pluggy-webhook --no-verify-jwt
// Secrets: PLUGGY_WEBHOOK_SECRET, PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET;
// optional PLUGGY_API_URL, EXPO_ACCESS_TOKEN.
//
// At Pluggy, create the webhook (dashboard or POST /webhooks) with
//   url:     https://<ref>.supabase.co/functions/v1/pluggy-webhook
//   event:   all
//   headers: { "x-flow-webhook-secret": <PLUGGY_WEBHOOK_SECRET> }
//
// What is trusted. The secret header proves the call came from where the
// webhook was configured; without it the caller learns nothing, not even
// whether the function is set up. Even then the body is only used for ids:
// every fact (whose connection, its status, the entries) is read back from
// Pluggy's API. A forged or replayed event can at worst make Flow re-read
// what the bank already gave it.
//
// Each event is processed once (bank_webhook_events, by Pluggy's eventId). A
// failure answers 500 so Pluggy delivers it again; a refusal that retrying
// can't fix (a connection over the plan's limit, one Flow didn't make) is
// logged and acknowledged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyTransactionEvent, forgetItem, SyncError, syncConnection } from "../_shared/bankSync.ts";
import { adminClient, fail, inBackground, json, readEnv, safeEqual, type Env, type MakeClient } from "../_shared/http.ts";
import { runMaintenance } from "../_shared/maintenance.ts";
import { providersFromEnv } from "../_shared/providers.ts";
import { PluggyError, pluggyFromEnv, type Fetch, type PluggyItem } from "../_shared/pluggy.ts";
import { deliverAlerts } from "../_shared/push.ts";

export const SECRET_HEADER = "x-flow-webhook-secret";

const ITEM_EVENTS = new Set([
  "item/created",
  "item/updated",
  "item/error",
  "item/waiting_user_input",
  "item/waiting_user_action",
  "item/login_succeeded",
]);
const TRANSACTION_EVENTS = new Set(["transactions/created", "transactions/updated", "transactions/deleted"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Payload {
  eventId: string;
  event: string;
  itemId?: string;
  accountId?: string;
  transactionIds?: string[];
  transactionsCreatedAtFrom?: string;
}

function parse(body: unknown): Payload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
  const eventId = str(b.eventId, 100);
  const event = str(b.event, 60);
  if (!eventId || !event) return null;
  const ids = Array.isArray(b.transactionIds) ? b.transactionIds.filter((x): x is string => typeof x === "string" && x.length <= 100) : undefined;
  return {
    eventId,
    event,
    itemId: str(b.itemId, 100),
    accountId: str(b.accountId, 100),
    transactionIds: ids?.slice(0, 500),
    transactionsCreatedAtFrom: str(b.transactionsCreatedAtFrom, 40),
  };
}

export async function handle(
  req: Request,
  env: Env = readEnv(),
  make: MakeClient = createClient,
  fetcher?: Fetch,
  pushFetcher?: Fetch,
): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  // Fail closed: with no secret configured, nothing is accepted.
  const given = req.headers.get(SECRET_HEADER) ?? "";
  if (!env.webhookSecret || !given || !safeEqual(given, env.webhookSecret)) {
    if (!env.webhookSecret) console.error("pluggy-webhook: PLUGGY_WEBHOOK_SECRET is not set");
    return fail("unauthorized", "Unauthorized.", 401);
  }
  const pluggy = pluggyFromEnv(env, fetcher);
  if (!env.url || !env.service || !pluggy) {
    console.error("pluggy-webhook: missing Supabase or Pluggy configuration");
    return fail("unavailable", "Unavailable.", 503);
  }

  let payload: Payload | null = null;
  try {
    payload = parse(await req.json());
  } catch {
    /* not JSON */
  }
  if (!payload) return fail("invalid_payload", "Invalid payload.", 400);

  const admin = adminClient(env, make);
  const { data: seen } = await admin.from("bank_webhook_events").select("processed_at").eq("event_id", payload.eventId).maybeSingle();
  if (seen?.processed_at) return json({ ok: true, duplicate: true });
  if (!seen) {
    const { error } = await admin
      .from("bank_webhook_events")
      .insert({ event_id: payload.eventId, event: payload.event, item_id: payload.itemId ?? null });
    // Another delivery of the same event got here first and is processing it.
    if (error?.code === "23505") return json({ ok: true, duplicate: true });
    if (error) {
      console.error("pluggy-webhook: record event:", error.message);
      return fail("unavailable", "Unavailable.", 500);
    }
  }

  try {
    const outcome = await process(admin, pluggy, payload);
    await admin.from("bank_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("event_id", payload.eventId);

    await inBackground(
      Promise.all([
        deliverAlerts(admin, { fetcher: pushFetcher, accessToken: env.expoAccessToken || undefined }),
        // Housekeeping, at most hourly (0015): retention, connections nobody
        // shares anymore, connections still to be ended at Pluggy.
        runMaintenance(admin, providersFromEnv(env, fetcher)),
      ]),
    );
    return json({ ok: true, outcome });
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("pluggy-webhook:", payload.event, message);
    await admin.from("bank_webhook_events").update({ error: message }).eq("event_id", payload.eventId);
    return fail("processing_failed", "Processing failed.", 500);
  }
}

// deno-lint-ignore no-explicit-any
async function process(admin: any, pluggy: NonNullable<ReturnType<typeof pluggyFromEnv>>, p: Payload): Promise<string> {
  if (TRANSACTION_EVENTS.has(p.event)) {
    const n = await applyTransactionEvent(admin, pluggy, p);
    return `transactions:${n}`;
  }
  if (p.event === "item/deleted") {
    return p.itemId && (await forgetItem(admin, p.itemId)) ? "forgotten" : "ignored";
  }
  if (!ITEM_EVENTS.has(p.event) || !p.itemId) return "ignored";

  // Whose connection: the one Flow stored, or, for one it hasn't stored yet,
  // the person Pluggy says it was made for.
  const { data: known } = await admin
    .from("bank_connections")
    .select("user_id")
    .eq("provider", "pluggy")
    .eq("external_item_id", p.itemId)
    .maybeSingle();
  let item: PluggyItem | undefined;
  let userId: string | null = known?.user_id ?? null;
  try {
    if (!userId) {
      item = await pluggy.getItem(p.itemId);
      userId = item?.clientUserId && UUID.test(item.clientUserId) ? item.clientUserId : null;
    }
    if (!userId) return "ignored";
    const result = await syncConnection(admin, pluggy, userId, p.itemId, { item });
    return `synced:${result.status}:${result.inserted}`;
  } catch (e) {
    if (e instanceof SyncError) {
      console.warn("pluggy-webhook: not kept:", p.itemId, e.code);
      return `refused:${e.code}`;
    }
    if (e instanceof PluggyError && e.status === 404) {
      await forgetItem(admin, p.itemId);
      return "forgotten";
    }
    throw e;
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
