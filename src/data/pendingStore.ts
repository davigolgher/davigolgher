/**
 * Where the sync queue is kept between launches — web: localStorage.
 * The native app uses pendingStore.native.ts (AsyncStorage) instead.
 *
 * One entry per account, so changes one person made offline are only ever
 * sent, or shown, when that same account signs in again.
 */
import { parsePending, pendingKey } from "./pendingFormat";
import type { Op } from "./outbox";

export async function loadPending(userId: string): Promise<Op[]> {
  try {
    return parsePending(globalThis.localStorage?.getItem(pendingKey(userId)) ?? null);
  } catch {
    return [];
  }
}

export async function savePending(userId: string, ops: readonly Op[]): Promise<void> {
  try {
    if (ops.length) globalThis.localStorage?.setItem(pendingKey(userId), JSON.stringify(ops));
    else globalThis.localStorage?.removeItem(pendingKey(userId));
  } catch {
    /* storage full or unavailable — the queue still lives in memory */
  }
}
