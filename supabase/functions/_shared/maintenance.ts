/**
 * Housekeeping for Flow Family (0015's family_maintenance, made
 * provider-aware in 0016), plus the part the database can't do itself:
 * ending connections at Pluggy, Plaid or Salt Edge.
 *
 * Connections whose owner stopped sharing with every family are ended 30 days
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
  return { skipped: Boolean(data?.skipped), removed: data?.removed ?? {}, ended: due.length - deferred, deferred, retried };
}
