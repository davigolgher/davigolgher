// Flow Family: read a bank connection now. The app calls it when a
// connection window closes, after the person shares an account, and when
// they pull to refresh; the providers' webhooks keep it current otherwise.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy bank-connection-sync
// Secrets: as bank-connect-token, plus optional EXPO_ACCESS_TOKEN.
//
// Requests (POST JSON):
//   { itemId }        — a Pluggy connection, as Pluggy's widget reported it
//   { session }       — a Plaid or Salt Edge window this person opened
//   { connectionId }  — a stored connection of this person, any provider
//
// Whatever the app sends is checked: a Pluggy item must have been made for
// this person (Pluggy's clientUserId), a window must be one they opened, a
// stored connection must be theirs, and a Salt Edge connection must belong
// to their Salt Edge customer. Anything else is "not found".
import { createClient } from "npm:@supabase/supabase-js@2";
import { SyncError, syncConnection } from "../_shared/bankSync.ts";
import { adminClient, callerId, corsHeaders, fail, inBackground, json, readEnv, readJson, type Env, type MakeClient } from "../_shared/http.ts";
import { PluggyError, type Fetch } from "../_shared/pluggy.ts";
import {
  loadSession,
  plaidLinkComplete,
  providersFromEnv,
  saltEdgeLinkComplete,
  syncPlaidConnection,
  syncSaltEdgeConnection,
  type WorldSyncResult,
} from "../_shared/providers.ts";
import { deliverAlerts } from "../_shared/push.ts";

const REFUSALS: Record<string, [string, number]> = {
  connection_not_yours: ["That bank connection wasn't found.", 404],
  connection_not_found: ["That bank connection wasn't found.", 404],
  not_a_dependent: ["Join a family before connecting a bank.", 403],
  plan_limit_connections: ["The free plan includes one bank connection. The family's guardian can upgrade for more.", 402],
  too_many_connections: ["You've reached the maximum number of bank connections.", 409],
  provider_unavailable: ["Bank connections in this country aren't available right now.", 503],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handle(
  req: Request,
  env: Env = readEnv(),
  make: MakeClient = createClient,
  fetcher?: Fetch,
  pushFetcher?: Fetch,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  const p = providersFromEnv(env, fetcher);
  if (!env.url || !env.anon || !env.service) {
    console.error("bank-connection-sync: missing Supabase configuration");
    return fail("unavailable", "Bank connections are unavailable right now. Try again later.", 503);
  }

  try {
    const uid = await callerId(req, env, make);
    if (!uid) return fail("not_signed_in", "Sign in again, then try again.", 401);

    const body = await readJson(req);
    const admin = adminClient(env, make);
    const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
    let results: WorldSyncResult[] = [];

    const session = str(body.session, 64);
    const connectionId = str(body.connectionId, 64);
    const itemId = str(body.itemId, 100);

    if (session && UUID.test(session)) {
      const s = await loadSession(admin, session, uid);
      results = s.provider === "plaid" ? await plaidLinkComplete(admin, p, s) : await saltEdgeLinkComplete(admin, p, s);
    } else if (connectionId && UUID.test(connectionId)) {
      const { data: conn } = await admin.from("bank_connections").select("id,user_id,provider,external_item_id").eq("id", connectionId).eq("user_id", uid).maybeSingle();
      if (!conn) throw new SyncError("connection_not_found");
      if (conn.provider === "plaid") results = [await syncPlaidConnection(admin, p, conn.id)];
      else if (conn.provider === "saltedge") results = [await syncSaltEdgeConnection(admin, p, uid, conn.external_item_id)];
      else {
        if (!p.pluggy) throw new SyncError("provider_unavailable");
        const r = await syncConnection(admin, p.pluggy, uid, conn.external_item_id);
        results = [{ connectionId: r.connectionId, status: r.status, accounts: r.accounts, inserted: r.inserted }];
      }
    } else if (itemId) {
      if (!p.pluggy) throw new SyncError("provider_unavailable");
      const r = await syncConnection(admin, p.pluggy, uid, itemId);
      results = [{ connectionId: r.connectionId, status: r.status, accounts: r.accounts, inserted: r.inserted }];
    } else {
      return fail("invalid_request", "Send itemId, session or connectionId.", 400);
    }

    // New entries may have tripped a guardian's alert.
    await inBackground(deliverAlerts(admin, { fetcher: pushFetcher, accessToken: env.expoAccessToken || undefined }));
    const first = results[0];
    return json({
      status: first?.status ?? null,
      accounts: results.reduce((n, r) => n + r.accounts, 0),
      inserted: results.reduce((n, r) => n + r.inserted, 0),
      connections: results.length,
    });
  } catch (e) {
    if (e instanceof SyncError) {
      const [message, status] = REFUSALS[e.code] ?? REFUSALS.connection_not_yours;
      return fail(e.code, message, status);
    }
    // Pluggy saying the item doesn't exist is the same answer.
    if (e instanceof PluggyError && (e.status === 404 || e.status === 403)) {
      return fail("connection_not_yours", REFUSALS.connection_not_yours[0], 404);
    }
    console.error("bank-connection-sync:", (e as Error)?.message ?? String(e));
    return fail("sync_failed", "Couldn't update from the bank right now. Your data is safe; try again in a moment.", 502);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
