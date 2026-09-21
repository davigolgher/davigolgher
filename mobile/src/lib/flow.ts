/**
 * One-time flags for the first-run flow: the intro screens before the paywall,
 * and the tour after it.
 *
 * Local to the device rather than stored with the account. Whether someone has
 * seen a tour is a property of this install, not of the user — a new phone
 * deserves the tour again, and it shouldn't cost a round trip to find out.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flow.flags.v1";

export interface Flags {
  onboardingDone: boolean;
  tutorialDone: boolean;
}

const DEFAULTS: Flags = { onboardingDone: false, tutorialDone: false };

export function useFlowFlags() {
  /** null while reading storage — the gate waits rather than flashing a screen. */
  const [flags, setFlags] = useState<Flags | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : {};
        if (alive) setFlags({ ...DEFAULTS, ...parsed });
      })
      .catch(() => {
        // First launch or unreadable value: the defaults are the right answer.
        if (alive) setFlags(DEFAULTS);
      });
    return () => {
      alive = false;
    };
  }, []);

  const mark = useCallback((patch: Partial<Flags>) => {
    setFlags((current) => {
      const next = { ...(current ?? DEFAULTS), ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /** Used by account deletion, so the next account starts from the beginning. */
  const reset = useCallback(async () => {
    setFlags(DEFAULTS);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { flags, mark, reset };
}
