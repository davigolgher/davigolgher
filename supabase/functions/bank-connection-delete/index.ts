// Disconnect a bank, whichever provider made the connection.
// Ends it at the provider (which ends the consent with the bank) and deletes
// everything Flow read through it. What it brought into the person's own
// Flow expenses is kept unless they send { keepImported: false } (0017).
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy bank-connection-delete
// Secrets: as bank-connect-token.
//
// If the provider can't be reached the data is deleted anyway and the
// connection is queued in bank_item_tombstones to be ended later: a person
// who disconnects must never be told "try again" while Flow keeps their data.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, callerId, corsHeaders, fail, json, readEnv, readJson, type Env, type MakeClient } from "../_shared/http.ts";
import type { Fetch } from "../_shared/pluggy.ts";
import { endConnections, endTargetFor, providersFromEnv } from "../_shared/providers.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);
  if (!env.url || !env.anon || !env.service) {
    console.error("bank-connection-delete: missing Supabase configuration");
    return fail("unavailable", "Disconnecting is unavailable right now. Try again later.", 503);
  }

  try {
    const uid = await callerId(req, env, make);
    if (!uid) return fail("not_signed_in", "Sign in again, then try again.", 401);

    const body = await readJson(req);
    const connectionId = typeof body.connectionId === "string" && UUID.test(body.connectionId) ? body.connectionId : null;
    if (!connectionId) return fail("invalid_request", "Which connection? Send its connectionId.", 400);

    const admin = adminClient(env, make);
    const { data: conn } = await admin.from("bank_connections").select("id").eq("id", connectionId).eq("user_id", uid).maybeSingle();
    if (!conn) return fail("connection_not_found", "That bank connection wasn't found.", 404);

    const target = await endTargetFor(admin, conn.id);
    const { deferred } = await endConnections(admin, providersFromEnv(env, fetcher), target ? [target] : []);
    const keepImported = body.keepImported !== false;
    const { error } = await admin.rpc("bank_remove_connection", { p_connection: conn.id, p_keep_imported: keepImported });
    if (error) throw new Error(`bank_remove_connection: ${error.message}`);
    return json({ removed: true, providerPending: deferred > 0 });
  } catch (e) {
    console.error("bank-connection-delete:", (e as Error)?.message ?? String(e));
    return fail("delete_failed", "Couldn't disconnect right now. Try again in a moment.", 500);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
