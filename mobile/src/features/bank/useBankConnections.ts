/**
 * The person's bank connections, for the banks screen and the cards that
 * point to it. Kept in memory between screens so going back and forth doesn't
 * flash a spinner; read again on focus and after every change.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { bankApi, type BankConnection } from "@/lib/backend/banks";

let cache: { userId: string; data: BankConnection[] } | null = null;
const listeners = new Set<() => void>();

/** Forget what was read (signing out, tests). */
export function forgetBankConnections() {
  cache = null;
}

/** Tell every open screen to read the connections again. */
export function invalidateBankConnections() {
  for (const l of listeners) l();
}

export function useBankConnections(enabled = true) {
  const { userId } = useAuth();
  const cached = cache && cache.userId === userId ? cache.data : null;
  const [data, setData] = useState<BankConnection[] | null>(cached);
  const [loading, setLoading] = useState(enabled && !cached);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !userId) return;
    setLoading(true);
    try {
      const list = await bankApi.list();
      cache = { userId, data: list };
      setData(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void reload();
    const l = () => void reload();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [reload]);

  return { data, loading, error, reload };
}
