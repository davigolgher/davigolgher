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
import { AppState } from "react-native";
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

/**
 * How long to wait for an answer before letting the app move on.
 *
 * `loading` holds the gate on a blank screen. A request that never settles —
 * no signal, a stalled socket — would hold it forever, and a frozen launch is
 * worse than a paywall. Timing out leaves `entitled` false, so the fallback is
 * to ask for payment, never to hand out access.
 */
const CHECK_TIMEOUT_MS = 6000;

function settled<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), CHECK_TIMEOUT_MS);
    const finish = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    promise.then(finish).catch(() => finish(fallback));
  });
}

export function useEntitlement(): Entitlement {
  const { configured, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entitled, setEntitled] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Only a new account blocks the gate. A refresh is a background re-check of
  // an answer we already have, and reporting it as loading blanked the app the
  // user had just been let into — the screen went back to a spinner the moment
  // they got past the paywall.
  useEffect(() => {
    setLoading(true);
  }, [configured, userId]);

  // A subscription can lapse or renew while the app sits in the background for
  // days; check again whenever it comes back. In the background, like refresh.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Without a backend there's nothing to check and nothing to sell.
    if (!configured || !userId) {
      // Nobody signed in: purchases stop belonging to the last account.
      purchases.identify(null).catch(() => {});
      setEntitled(false);
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      const [fromStore, fromServer] = await Promise.all([
        // The store answers for the account only once it knows which one it is.
        // Offline, naming the account can fail while the store's cached answer
        // for it is still right — so ask anyway rather than lock out a
        // subscriber who opened the app on a plane.
        settled(
          purchases
            .identify(userId)
            .catch(() => {})
            .then(() => purchases.isEntitled(userId)),
          false,
        ),
        settled(fetchBilling().then(isActive), false),
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
