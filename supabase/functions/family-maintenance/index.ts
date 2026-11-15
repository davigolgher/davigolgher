// Flow Family housekeeping, once a day: consents that ran out, connections
// nobody shares anymore (ended at Pluggy after 30 days), and the retention
// limits in 0015. The webhook also runs it, at most hourly, whenever Pluggy
// calls; this schedule makes sure it runs even when no bank is connected.
//
// Deploy with JWT verification ON (the default):
//   supabase functions deploy family-maintenance
// Secrets: those of the bank providers in use (see bank-connect-token), to end
// connections at them.
//
// Only the service role may run it: the gateway accepts any valid JWT, so the
// key itself is checked here. Schedule it from the database (pg_cron and
// pg_net, both available on Supabase), with the key kept in Vault:
//
//   select cron.schedule('flow-family-maintenance', '17 6 * * *', $$
//     select net.http_post(
//       url := 'https://<ref>.supabase.co/functions/v1/family-maintenance',
//       headers := jsonb_build_object('Authorization', 'Bearer ' ||
//         (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'))
//     ) $$);
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, fail, json, readEnv, safeEqual, type Env, type MakeClient } from "../_shared/http.ts";
import { runMaintenance } from "../_shared/maintenance.ts";
import type { Fetch } from "../_shared/pluggy.ts";
import { providersFromEnv } from "../_shared/providers.ts";

export async function handle(req: Request, env: Env = readEnv(), make: MakeClient = createClient, fetcher?: Fetch): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", "Use POST.", 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.service || !token || !safeEqual(token, env.service)) return fail("unauthorized", "Unauthorized.", 401);
  if (!env.url) return fail("unavailable", "Unavailable.", 503);

  try {
    const result = await runMaintenance(adminClient(env, make), providersFromEnv(env, fetcher), { force: true, limit: 100 });
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("family-maintenance:", (e as Error)?.message ?? String(e));
    return fail("maintenance_failed", "Maintenance failed.", 500);
  }
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno?.serve) deno.serve((req: Request) => handle(req));
