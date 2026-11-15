/**
 * Flow Family's shared state: who this person is in a family (guardian,
 * dependent, both or neither), kept current while the app is open.
 *
 * Current means: a live signal from the server (Realtime on
 * family_sync_signals) whenever something about a family view changes, and —
 * only while a Family screen is open and the live channel isn't connected — a
 * fresh read every 30 seconds. A screen that wants either calls `useFamilyLive`.
 *
 * Offline, the last state seen on this phone is shown with its time; nothing
 * is cached once nobody is signed in.
 *
 * Mounted only when the feature flag is on (see app/_layout). With it off,
 * `useFamily` reports the feature as absent and every entry point hides.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { familyApi, FamilyError, type FamilyState } from "@/lib/backend/family";
import { clearAllCaches, readCache, writeCache } from "./cache";

const POLL_MS = 30_000;

interface FamilyContextValue {
  enabled: boolean;
  state: FamilyState | null;
  loading: boolean;
  error: FamilyError | null;
  /** Set when what's shown came from this phone's copy, not the server. */
  savedAt: string | null;
  refresh: () => Promise<void>;
  /** Goes up whenever the server says something changed, or a poll is due. */
  tick: number;
  /** A subscriber-less account using only Flow Family (see the paywall). */
  familyOnly: boolean;
  watch: () => () => void;
}

const Ctx = createContext<FamilyContextValue>({
  enabled: false,
  state: null,
  loading: false,
  error: null,
  savedAt: null,
  refresh: async () => {},
  tick: 0,
  familyOnly: false,
  watch: () => () => {},
});

export function FamilyProvider({ children, familyOnly }: { children: ReactNode; familyOnly: boolean }) {
  const { userId, configured } = useAuth();
  const [state, setState] = useState<FamilyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FamilyError | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const [watchers, setWatchers] = useState(0);
  const owner = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const uid = owner.current;
    if (!uid) return;
    try {
      const next = await familyApi.myState();
      if (owner.current !== uid) return;
      setState(next);
      setError(null);
      setSavedAt(null);
      void writeCache(uid, "state", next);
    } catch (e) {
      if (owner.current !== uid) return;
      setError(e instanceof FamilyError ? e : new FamilyError("unavailable"));
    } finally {
      if (owner.current === uid) setLoading(false);
    }
  }, []);

  // A new account: its cached copy first, then the server.
  useEffect(() => {
    const previous = owner.current;
    owner.current = configured ? userId : null;
    setState(null);
    setError(null);
    setSavedAt(null);
    if (!userId || !configured) {
      setLoading(false);
      // Signed out: nothing of anyone's family stays on the phone. (The push
      // token was removed before signing out — see signOutOfFamily.)
      if (previous) void clearAllCaches();
      return;
    }
    setLoading(true);
    void readCache<FamilyState>(userId, "state").then((cached) => {
      if (owner.current !== userId || !cached) return;
      setState((s) => s ?? cached.data);
      setSavedAt((s) => s ?? cached.savedAt);
    });
    void refresh();
  }, [userId, configured, refresh]);

  const member = Boolean(state?.guardian_of || state?.dependent_of.length);

  // The live channel, for members only.
  useEffect(() => {
    if (!userId || !member) return;
    const stop = familyApi.subscribe(
      userId,
      (signal) => {
        if (signal.kind === "sharing" || signal.kind === "connection") void refresh();
        setTick((t) => t + 1);
      },
      setLive,
    );
    return () => {
      stop();
      setLive(false);
    };
  }, [userId, member, refresh]);

  // Polling, only while someone is watching and the channel is down.
  useEffect(() => {
    if (!userId || watchers === 0 || live) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void refresh();
      setTick((t) => t + 1);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [userId, watchers, live, refresh]);

  // Back in the app: whatever happened meanwhile.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && owner.current) {
        void refresh();
        setTick((t) => t + 1);
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const watch = useCallback(() => {
    setWatchers((n) => n + 1);
    return () => setWatchers((n) => Math.max(0, n - 1));
  }, []);

  const value = useMemo<FamilyContextValue>(
    () => ({ enabled: true, state, loading, error, savedAt, refresh, tick, familyOnly, watch }),
    [state, loading, error, savedAt, refresh, tick, familyOnly, watch],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily() {
  const ctx = useContext(Ctx);
  const s = ctx.state;
  return {
    ...ctx,
    isGuardian: Boolean(s?.guardian_of),
    isDependent: Boolean(s?.dependent_of.length),
    /** Sharing with at least one family right now. */
    isSharing: Boolean(s?.dependent_of.some((d) => d.consent?.status === "active")),
  };
}

/** Keep this screen current while it's focused: live signals, or a poll every 30s. */
export function useFamilyLive() {
  const { watch } = useContext(Ctx);
  useFocusEffect(useCallback(() => watch(), [watch]));
}
