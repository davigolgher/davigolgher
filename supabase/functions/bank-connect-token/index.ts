// Flow Family: a token that opens Pluggy Connect, the bank connection widget,
// for the signed-in person.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy bank-connect-token
// Secrets: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET; optional PLUGGY_API_URL,
// PLUGGY_INCLUDE_SANDBOX=1 (development and App Review only),
// PLUGGY_OAUTH_REDIRECT_URI.
//
// The aggregator's keys never leave the server. The app receives a connect
// token, which only opens the widget, for this person, for a short while; the
// bank credentials are typed into the widget and go from it to Pluggy and the
// bank, never through Flow.
//
// Who may connect: someone sharing with a family, within their plan (one bank
// on the free plan). To reopen a connection they already have (renew the
// consent, fix a login) they pass its id, and it must be theirs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, callerId, corsHeaders, fail, json, readEnv, readJson, type Env, type MakeClient } from "../_shared/http.ts";
import { pluggyFromEnv, type Fetch } from "../_shared/pluggy.ts";

const LIMIT_MESSAGES: Record<string, [string, number]> = {
  not_a_dependent: ["Join a family before connecting a bank.", 403],
  plan_limit_connections: ["The free plan includes one bank connection. The family's guardian can upgrade for more.", 402],
  too_many_connections: ["You've reached the maximum number of bank connections.", 409],
};

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  const pluggy = pluggyFromEnv(env, fetcher);
  if (!env.url || !env.anon || !env.service || !pluggy) {
    console.error("bank-connect-token: missing Supabase or Pluggy configuration");
    return fail("unavailable", "Bank connections are unavailable right now. Try again later.", 503);
  }

  try {
    const uid = await callerId(req, env, make);
    if (!uid) return fail("not_signed_in", "Sign in again, then try connecting.", 401);

    const body = await readJson(req);
    const itemId = typeof body.itemId === "string" && body.itemId.length <= 100 ? body.itemId : undefined;
    const admin = adminClient(env, make);

    if (itemId) {
      const { data } = await admin
        .from("bank_connections")
        .select("id")
        .eq("provider", "pluggy")
        .eq("external_item_id", itemId)
        .eq("user_id", uid)
        .maybeSingle();
      // Someone else's connection and one that doesn't exist look the same.
      if (!data) return fail("connection_not_found", "That bank connection wasn't found.", 404);
    } else {
      const { data: allowance, error } = await admin.rpc("bank_connection_allowance", { p_user: uid });
      if (error) throw new Error(`bank_connection_allowance: ${error.message}`);
      if (!allowance?.allowed) {
        const [message, status] = LIMIT_MESSAGES[allowance?.reason] ?? LIMIT_MESSAGES.too_many_connections;
        return fail(allowance?.reason ?? "too_many_connections", message, status);
      }
    }

    const connectToken = await pluggy.createConnectToken({
      clientUserId: uid,
      itemId,
      oauthRedirectUri: env.pluggyOauthRedirectUri || undefined,
    });
    return json({ connectToken, includeSandbox: env.pluggyIncludeSandbox });
  } catch (e) {
    console.error("bank-connect-token:", (e as Error)?.message ?? String(e));
    return fail("unavailable", "Couldn't start the bank connection. Try again in a moment.", 502);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
