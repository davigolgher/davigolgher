/**
 * One-time flags for the first-run flow: the intro screens before the paywall,
 * and the tour after it.
 *
 * Local to the device rather than stored with the account. Whether someone has
 * seen a tour is a property of this install, not of the user — a new phone
 * deserves the tour again, and it shouldn't cost a round trip to find out.
 *
 * One value shared by every caller, rather than a hook with its own `useState`.
 * Settings resets these and the gate above the tabs reads them; with a copy
 * each, the reset would land in the copy nobody renders from.
 */
import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flow.flags.v1";

export interface Flags {
  onboardingDone: boolean;
  tutorialDone: boolean;
}

const DEFAULTS: Flags = { onboardingDone: false, tutorialDone: false };

/** null until storage has been read — the gate waits rather than flashing a screen. */
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

AsyncStorage.getItem(KEY)
  .then((raw) => publish({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }))
  // First launch or an unreadable value: the defaults are the right answer.
  .catch(() => publish(DEFAULTS));

export function useFlowFlags() {
  const current = useSyncExternalStore(
    subscribe,
    () => flags,
    () => flags,
  );

  const mark = useCallback((patch: Partial<Flags>) => {
    const next = { ...(flags ?? DEFAULTS), ...patch };
    publish(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /**
   * Back to a clean first run: the intro, the paywall, then the tour.
   *
   * Used by account deletion, so the next account starts from the beginning,
   * and by Settings → "Show the intro again".
   */
  const reset = useCallback(async () => {
    publish(DEFAULTS);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { flags: current, mark, reset };
}
