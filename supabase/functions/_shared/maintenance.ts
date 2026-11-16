/**
 * Housekeeping (0015's family_maintenance, made provider-aware in 0016 and
 * aware of personal imports in 0017), plus the part the database can't do
 * itself: ending connections at Pluggy, Plaid or Salt Edge. Also ages out
 * product events (0018).
 *
 * Connections nobody uses any more (not shared with a family, not imported
 * into the owner's own Flow) are ended 30 days
 * later: at their provider (which ends the consent with the bank), then here,
 * with everything read through them. If the provider can't be reached the
 * data goes now anyway and the connection waits in bank_item_tombstones.
 */
import { endConnections, retryAllTombstones, type EndTarget, type Providers } from "./providers.ts";
import type { ProviderId } from "./regions.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface MaintenanceResult {
  skipped: boolean;
  removed: Record<string, number>;
  ended: number;
  deferred: number;
  retried: number;
}

export async function runMaintenance(admin: Admin, p: Providers, options: { force?: boolean; limit?: number } = {}): Promise<MaintenanceResult> {
  const { data, error } = await admin.rpc("family_maintenance", { p_limit: options.limit ?? 20, p_force: options.force ?? false });
  if (error) throw new Error(`family_maintenance: ${error.message}`);
  const due = (data?.due_connections ?? []) as {
    connection_id: string;
    external_item_id: string;
    provider?: ProviderId;
    credential?: string | null;
    environment?: EndTarget["environment"];
  }[];

  const { deferred } = await endConnections(
    admin,
    p,
    due.map((d) => ({ provider: d.provider ?? "pluggy", externalId: d.external_item_id, credential: d.credential ?? null, environment: d.environment ?? null })),
  );
  for (const d of due) {
    const res = await admin.rpc("bank_remove_connection", { p_connection: d.connection_id });
    if (res.error) console.error("runMaintenance: bank_remove_connection:", res.error.message);
  }
  const retried = await retryAllTombstones(admin, p, 5);
  const removed: Record<string, number> = { ...(data?.removed ?? {}) };
  // Product events are kept 13 months (0018). Before that migration is
  // applied the function doesn't exist yet: nothing to purge.
  if (!data?.skipped) {
    const purge = await admin.rpc("product_events_purge");
    if (!purge.error && typeof purge.data === "number") removed.product_events = purge.data;
  }
  return { skipped: Boolean(data?.skipped), removed, ended: due.length - deferred, deferred, retried };
}
