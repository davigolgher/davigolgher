// Flow Family: open a bank connection for the signed-in person, with the
// provider that covers their bank's country.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy bank-connect-token
// Secrets, per provider you use (any subset works):
//   Pluggy (Brazil):        PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET
//   Plaid (US, CA, UK, EU): PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, BANK_TOKEN_KEY
//   Salt Edge (elsewhere):  SALTEDGE_APP_ID, SALTEDGE_SECRET (SALTEDGE_PRIVATE_KEY in live)
// Optional: BANK_SANDBOX_USER_IDS (review accounts that see test banks),
// PLAID_SANDBOX_SECRET, BANK_RETURN_URL, PLUGGY_INCLUDE_SANDBOX,
// PLUGGY_OAUTH_REDIRECT_URI, PLUGGY_API_URL, SALTEDGE_API_URL.
//
// Requests (POST JSON):
//   { probe: true }                  → { providers: { pluggy, plaid, saltedge } }
//   { country: "US" }                → open a new connection in that country
//   { connectionId }                 → reopen a stored one to fix it (any provider)
//   { itemId }                       → reopen a Pluggy connection (older apps)
// Answers:
//   Pluggy:  { provider: "pluggy", connectToken, includeSandbox }   — the in-app widget
//   others:  { provider, url, session, returnUrl }                  — a page for the
//            system browser; when it returns, call bank-connection-sync with { session }.
//
// The providers' keys never leave the server, and bank logins never pass
// through Flow: they're typed into the provider's or the bank's own page.
// Who may connect: someone sharing with a family, within their plan.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SyncError } from "../_shared/bankSync.ts";
import { adminClient, callerId, corsHeaders, fail, json, readEnv, readJson, type Env, type MakeClient } from "../_shared/http.ts";
import type { Fetch } from "../_shared/pluggy.ts";
import { availability, plaidLinkStart, providersFromEnv, saltEdgeLinkStart } from "../_shared/providers.ts";
import { providerFor, type ProviderId } from "../_shared/regions.ts";

const LIMIT_MESSAGES: Record<string, [string, number]> = {
  not_a_dependent: ["Join a family before connecting a bank.", 403],
  plan_limit_connections: ["The free plan includes one bank connection. The family's guardian can upgrade for more.", 402],
  too_many_connections: ["You've reached the maximum number of bank connections.", 409],
  provider_unavailable: ["Bank connections in this country aren't available yet.", 503],
  connection_not_found: ["That bank connection wasn't found.", 404],
};

const refuse = (code: string) => {
  const [message, status] = LIMIT_MESSAGES[code] ?? LIMIT_MESSAGES.too_many_connections;
  return fail(code, message, status);
};

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);

  const p = providersFromEnv(env, fetcher);
  const available = availability(p);
  if (!env.url || !env.anon || !env.service || !Object.values(available).some(Boolean)) {
    console.error("bank-connect-token: missing Supabase configuration or every bank provider");
    return fail("unavailable", "Bank connections are unavailable right now. Try again later.", 503);
  }

  try {
    const uid = await callerId(req, env, make);
    if (!uid) return fail("not_signed_in", "Sign in again, then try connecting.", 401);

    const body = await readJson(req);
    if (body.probe === true) return json({ providers: available });

    const admin = adminClient(env, make);
    const sandbox = env.sandboxUserIds.includes(uid);
    const webhook = `${env.url}/functions/v1/plaid-webhook`;

    // Reopening a stored connection: its own provider, and it must be theirs.
    const connectionId = typeof body.connectionId === "string" && body.connectionId.length <= 64 ? body.connectionId : null;
    const legacyItem = typeof body.itemId === "string" && body.itemId.length <= 100 ? body.itemId : null;
    if (connectionId || legacyItem) {
      let q = admin.from("bank_connections").select("id,user_id,provider,external_item_id,institution_name,country_code,orphaned_at").eq("user_id", uid);
      q = connectionId ? q.eq("id", connectionId) : q.eq("provider", "pluggy").eq("external_item_id", legacyItem);
      const { data: conn } = await q.maybeSingle();
      if (!conn) return refuse("connection_not_found");
      if (!available[conn.provider as ProviderId]) return refuse("provider_unavailable");
      if (conn.provider === "pluggy") {
        const connectToken = await p.pluggy!.createConnectToken({
          clientUserId: uid,
          itemId: conn.external_item_id,
          oauthRedirectUri: env.pluggyOauthRedirectUri || undefined,
        });
        return json({ provider: "pluggy", connectToken, includeSandbox: env.pluggyIncludeSandbox || sandbox });
      }
      const opened =
        conn.provider === "plaid"
          ? await plaidLinkStart(admin, p, { userId: uid, country: conn.country_code ?? "US", webhook, returnUrl: env.bankReturnUrl, reconnect: conn })
          : await saltEdgeLinkStart(admin, p, { userId: uid, country: conn.country_code, returnUrl: env.bankReturnUrl, includeFakeProviders: sandbox, reconnect: conn });
      return json({ provider: conn.provider, ...opened, returnUrl: env.bankReturnUrl });
    }

    // A new connection: the plan first, then the provider for the country.
    const country = typeof body.country === "string" && /^[A-Za-z]{2}$/.test(body.country) ? body.country.toUpperCase() : "BR";
    const { data: allowance, error } = await admin.rpc("bank_connection_allowance", { p_user: uid });
    if (error) throw new Error(`bank_connection_allowance: ${error.message}`);
    if (!allowance?.allowed) return refuse(allowance?.reason ?? "too_many_connections");

    const provider = providerFor(country, available);
    if (!provider) return refuse("provider_unavailable");
    if (provider === "pluggy") {
      const connectToken = await p.pluggy!.createConnectToken({ clientUserId: uid, oauthRedirectUri: env.pluggyOauthRedirectUri || undefined });
      return json({ provider, connectToken, includeSandbox: env.pluggyIncludeSandbox || sandbox });
    }
    const opened =
      provider === "plaid"
        ? await plaidLinkStart(admin, p, { userId: uid, country, webhook, returnUrl: env.bankReturnUrl })
        : await saltEdgeLinkStart(admin, p, { userId: uid, country: country === "XX" ? null : country, returnUrl: env.bankReturnUrl, includeFakeProviders: sandbox });
    return json({ provider, ...opened, returnUrl: env.bankReturnUrl });
  } catch (e) {
    if (e instanceof SyncError) return refuse(e.code);
    console.error("bank-connect-token:", (e as Error)?.message ?? String(e));
    return fail("unavailable", "Couldn't start the bank connection. Try again in a moment.", 502);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
