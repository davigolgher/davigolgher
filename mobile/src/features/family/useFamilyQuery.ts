/**
 * Load something for a Flow Family screen: the copy saved on this phone
 * first, then the server; again whenever the server signals a change (or the
 * 30-second poll comes round) while the screen is open.
 *
 * Offline, the saved copy stays on screen with its time (`savedAt`). A
 * refusal (`no_access`, say, after the dependent stopped sharing) clears it:
 * data someone may no longer see is not kept for them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { FamilyError } from "@/lib/backend/family";
import { dropCache, readCache, writeCache } from "./cache";
import { useFamily } from "./FamilyProvider";

export interface Query<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: FamilyError | null;
  savedAt: string | null;
  reload: () => Promise<void>;
}

export function useFamilyQuery<T>(key: string | null, load: () => Promise<T>, options: { live?: boolean } = {}): Query<T> {
  const { userId } = useAuth();
  const { tick } = useFamily();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FamilyError | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const current = useRef<string | null>(null);

  const fetchNow = useCallback(async () => {
    if (!key || !userId) return;
    const id = `${userId}:${key}`;
    current.current = id;
    try {
      const next = await loadRef.current();
      if (current.current !== id) return;
      setData(next);
      setError(null);
      setSavedAt(null);
      void writeCache(userId, key, next);
    } catch (e) {
      if (current.current !== id) return;
      const err = e instanceof FamilyError ? e : new FamilyError("unavailable");
      setError(err);
      if (err.code === "no_access" || err.code === "not_signed_in") {
        setData(null);
        setSavedAt(null);
        void dropCache(userId, key);
      }
    } finally {
      if (current.current === id) setLoading(false);
    }
  }, [key, userId]);

  // First load: the saved copy, then the server.
  useEffect(() => {
    setData(null);
    setError(null);
    setSavedAt(null);
    setLoading(true);
    if (!key || !userId) {
      setLoading(false);
      return;
    }
    let alive = true;
    void readCache<T>(userId, key).then((cached) => {
      if (!alive || !cached) return;
      setData((d) => d ?? cached.data);
      setSavedAt((s) => s ?? cached.savedAt);
    });
    void fetchNow();
    return () => {
      alive = false;
    };
  }, [key, userId, fetchNow]);

  // Live updates.
  const firstTick = useRef(tick);
  useEffect(() => {
    if (!options.live || tick === firstTick.current) return;
    void fetchNow();
  }, [tick, options.live, fetchNow]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await fetchNow();
    setRefreshing(false);
  }, [fetchNow]);

  return { data, loading: loading && data === null, refreshing, error, savedAt: error ? savedAt : null, reload };
}
