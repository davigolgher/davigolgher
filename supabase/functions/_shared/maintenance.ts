/**
 * Housekeeping for Flow Family (0015's family_maintenance), plus the part the
 * database can't do itself: ending connections at Pluggy.
 *
 * Connections whose owner stopped sharing with every family are ended 30 days
 * later: at Pluggy (which ends the consent with the bank), then here, with
 * everything read through them. If Pluggy can't be reached the data goes now
 * anyway and the connection waits in bank_item_tombstones.
 */
import { endItems, retryTombstones } from "./bankSync.ts";
import type { Pluggy } from "./pluggy.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface MaintenanceResult {
  skipped: boolean;
  removed: Record<string, number>;
  ended: number;
  deferred: number;
  retried: number;
}

export async function runMaintenance(admin: Admin, pluggy: Pluggy | null, options: { force?: boolean; limit?: number } = {}): Promise<MaintenanceResult> {
  const { data, error } = await admin.rpc("family_maintenance", { p_limit: options.limit ?? 20, p_force: options.force ?? false });
  if (error) throw new Error(`family_maintenance: ${error.message}`);
  const due = (data?.due_connections ?? []) as { connection_id: string; external_item_id: string }[];

  const { deferred } = await endItems(admin, pluggy, due.map((d) => d.external_item_id));
  for (const d of due) {
    const res = await admin.rpc("bank_remove_connection", { p_connection: d.connection_id });
    if (res.error) console.error("runMaintenance: bank_remove_connection:", res.error.message);
  }
  const retried = pluggy ? await retryTombstones(admin, pluggy, 5) : 0;
  return { skipped: Boolean(data?.skipped), removed: data?.removed ?? {}, ended: due.length - deferred.length, deferred: deferred.length, retried };
}
