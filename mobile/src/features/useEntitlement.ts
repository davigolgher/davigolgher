/**
 * Does this user have access?
 *
 * Two sources, on purpose. The store is the authority on the device, and the
 * `billing` row is the server's cached copy, written by RevenueCat's webhook —
 * it covers a fresh install or a second device before the store has been asked,
 * and it's what anything server-side can read.
 *
 * In Expo Go the store isn't reachable at all (no native module). The paywall
 * still shows — it's the screen most worth looking at while building — but it
 * offers a way past, which exists only in development. A release build has the
 * module; if it somehow doesn't, access falls back to the server row rather
 * than being given away.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchBilling, isActive } from "@/lib/backend/billing";
import { useAuth } from "@/features/auth/AuthProvider";
import { purchases } from "~/lib/purchases";

export interface Entitlement {
  loading: boolean;
  entitled: boolean;
  /** True when the paywall may offer a way past, because this is a dev build with no store. */
  canSkip: boolean;
  refresh: () => void;
}

export function useEntitlement(): Entitlement {
  const { configured, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    // Without a backend there's nothing to check and nothing to sell.
    if (!configured || !userId) {
      setEntitled(false);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    (async () => {
      const [fromStore, fromServer] = await Promise.all([
        purchases.isEntitled().catch(() => false),
        fetchBilling()
          .then(isActive)
          .catch(() => false),
      ]);

      if (!alive) return;
      setEntitled(fromStore || fromServer);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [configured, userId, tick]);

  return { loading, entitled, canSkip: !purchases.available && __DEV__, refresh };
}
