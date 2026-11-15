// Flow Family: read a bank connection now. The app calls it right after the
// connection widget succeeds, after the person shares an account, and when
// they pull to refresh; webhooks from Pluggy keep it current otherwise.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy bank-connection-sync
// Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET; optional PLUGGY_API_URL,
// EXPO_ACCESS_TOKEN.
//
// The item id comes from the app, so it is checked with Pluggy: the
// connection must have been made for this person (the `clientUserId` the
// connect token carried). Anything else is "not found".
import { createClient } from "npm:@supabase/supabase-js@2";
import { SyncError, syncConnection } from "../_shared/bankSync.ts";
import { adminClient, callerId, corsHeaders, fail, inBackground, json, readEnv, readJson, type Env, type MakeClient } from "../_shared/http.ts";
import { PluggyError, pluggyFromEnv, type Fetch } from "../_shared/pluggy.ts";
import { deliverAlerts } from "../_shared/push.ts";

const REFUSALS: Record<string, [string, number]> = {
  connection_not_yours: ["That bank connection wasn't found.", 404],
  not_a_dependent: ["Join a family before connecting a bank.", 403],
  plan_limit_connections: ["The free plan includes one bank connection. The family's guardian can upgrade for more.", 402],
  too_many_connections: ["You've reached the maximum number of bank connections.", 409],
};

export async function handle(
  req: Request,
  env: Env = readEnv(),
  make: MakeClient = createClient,
  fetcher?: Fetch,
  pushFetcher?: Fetch,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  const pluggy = pluggyFromEnv(env, fetcher);
  if (!env.url || !env.anon || !env.service || !pluggy) {
    console.error("bank-connection-sync: missing Supabase or Pluggy configuration");
    return fail("unavailable", "Bank connections are unavailable right now. Try again later.", 503);
  }

  try {
    const uid = await callerId(req, env, make);
    if (!uid) return fail("not_signed_in", "Sign in again, then try again.", 401);

    const body = await readJson(req);
    const itemId = typeof body.itemId === "string" && body.itemId.length > 0 && body.itemId.length <= 100 ? body.itemId : null;
    if (!itemId) return fail("invalid_request", "Which connection? Send its itemId.", 400);

    const admin = adminClient(env, make);
    const result = await syncConnection(admin, pluggy, uid, itemId);
    // New entries may have tripped a guardian's alert.
    await inBackground(deliverAlerts(admin, { fetcher: pushFetcher, accessToken: env.expoAccessToken || undefined }));
    return json({ status: result.status, accounts: result.accounts, inserted: result.inserted });
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
