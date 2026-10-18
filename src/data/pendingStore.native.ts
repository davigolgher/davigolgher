/**
 * Where the sync queue is kept between launches — native: AsyncStorage.
 * Metro picks this file; the web build uses pendingStore.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePending, pendingKey } from "./pendingFormat";
import type { Op } from "./outbox";

export async function loadPending(userId: string): Promise<Op[]> {
  try {
    return parsePending(await AsyncStorage.getItem(pendingKey(userId)));
  } catch {
    return [];
  }
}

export async function savePending(userId: string, ops: readonly Op[]): Promise<void> {
  try {
    if (ops.length) await AsyncStorage.setItem(pendingKey(userId), JSON.stringify(ops));
    else await AsyncStorage.removeItem(pendingKey(userId));
  } catch {
    /* storage full or unavailable — the queue still lives in memory */
  }
}
