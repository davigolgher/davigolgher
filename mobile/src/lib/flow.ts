/**
 * One-time flags for the first-run flow: the intro screens before the paywall,
 * and the tour after it.
 *
 * Kept per account, on the device. They used to be per device, on the theory
 * that having seen a tour belongs to the install — but the intro isn't only a
 * tour. Its last step sets the monthly budget, which is stored on the account,
 * so a second account on the same phone skipped straight past it and started
 * with no budget. A new account gets the whole first run.
 *
 * One value shared by every caller, rather than a hook with its own `useState`.
 * Settings resets these and the gate above the tabs reads them; with a copy
 * each, the reset would land in the copy nobody renders from.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/features/auth/AuthProvider";

const KEY = "flow.flags.v2";
const keyFor = (userId: string) => `${KEY}.${userId}`;

// v1 was one set for the whole device. Whose it was can't be known, so it isn't
// carried over — each account simply sees its own first run once.
AsyncStorage.removeItem("flow.flags.v1").catch(() => {});

export interface Flags {
  onboardingDone: boolean;
  tutorialDone: boolean;
}

const DEFAULTS: Flags = { onboardingDone: false, tutorialDone: false };

/** The account whose flags are loaded, and the flags — null until read. */
let owner: string | null = null;
let flags: Flags | null = null;
const listeners = new Set<() => void>();

function publish(next: Flags | null) {
  flags = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switch to this account's flags. A no-op when they're already the ones loaded. */
function select(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  publish(null);
  if (!userId) return;
  AsyncStorage.getItem(keyFor(userId))
    // The owner check drops a read that lands after a quick sign-out and back
    // in as someone else — it would otherwise install the wrong account's flags.
    .then((raw) => owner === userId && publish({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }))
    .catch(() => owner === userId && publish(DEFAULTS));
}

export function useFlowFlags() {
  const { userId } = useAuth();
  const uid = userId ?? null;

  useEffect(() => {
    select(uid);
  }, [uid]);

  // Until this account's flags are loaded, report nothing rather than the
  // previous account's — the gate waits on null instead of guessing.
  const current = useSyncExternalStore(
    subscribe,
    () => (owner === uid ? flags : null),
    () => null,
  );

  const mark = useCallback((patch: Partial<Flags>) => {
    const who = owner;
    if (!who) return;
    const next = { ...(flags ?? DEFAULTS), ...patch };
    publish(next);
    AsyncStorage.setItem(keyFor(who), JSON.stringify(next)).catch(() => {});
  }, []);

  /**
   * Back to a clean first run for this account: the intro, the paywall, then
   * the tour. Used by Settings → "Show the intro again", and by account
   * deletion so the deleted account's flags don't outlive it.
   */
  const reset = useCallback(async () => {
    const who = owner;
    if (!who) return;
    publish(DEFAULTS);
    try {
      await AsyncStorage.removeItem(keyFor(who));
    } catch {
      /* ignore */
    }
  }, []);

  return { flags: current, mark, reset };
}
