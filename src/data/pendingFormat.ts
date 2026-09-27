/** The saved form of the sync queue, shared by both storage backends. */
import type { Op } from "./outbox";

const KINDS = new Set<Op["kind"]>([
  "tx.upsert",
  "tx.delete",
  "sub.upsert",
  "sub.delete",
  "cat.upsert",
  "cat.delete",
  "budget.upsert",
  "prefs.update",
]);

export const pendingKey = (userId: string) => `flow.pending.v1.${userId}`;

/** Whatever was saved, keeping only entries that still look like operations. */
export function parsePending(raw: string | null): Op[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is Op => typeof o === "object" && o !== null && KINDS.has((o as { kind?: Op["kind"] }).kind as Op["kind"]),
    );
  } catch {
    return [];
  }
}
