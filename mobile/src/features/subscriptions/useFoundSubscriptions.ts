/**
 * Charges in the person's spending that look like subscriptions they don't
 * track yet (lib/detectSubscriptions), with their "not a subscription"
 * answers remembered on this phone, per account.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "@/data/store";
import { useOptionalAuth } from "@/features/auth/AuthProvider";
import { candidateToSubscription, detectSubscriptions, type SubscriptionCandidate } from "@/lib/detectSubscriptions";
import { track } from "~/lib/analytics";

const keyFor = (owner: string) => `flow.subs.dismissed.v1.${owner}`;

export function useFoundSubscriptions() {
  const { data, now, addSubscription } = useStore();
  const userId = useOptionalAuth()?.userId ?? null;
  const owner = data.isSimulated ? "sample" : userId;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(new Set());
    if (!owner || owner === "sample") return;
    let alive = true;
    AsyncStorage.getItem(keyFor(owner))
      .then((raw) => alive && setDismissed(new Set(raw ? (JSON.parse(raw) as string[]) : [])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [owner]);

  const candidates = useMemo(
    () => detectSubscriptions(data.transactions, data.subscriptions, dismissed, now),
    [data.transactions, data.subscriptions, dismissed, now],
  );

  const dismiss = useCallback(
    (c: SubscriptionCandidate) => {
      track("subscription_suggestion_dismissed");
      setDismissed((prev) => {
        const next = new Set(prev).add(c.key);
        if (owner && owner !== "sample") AsyncStorage.setItem(keyFor(owner), JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [owner],
  );

  const accept = useCallback(
    (c: SubscriptionCandidate) => {
      addSubscription(candidateToSubscription(c));
      track("subscription_suggestion_accepted", { kind: c.frequency });
    },
    [addSubscription],
  );

  const monthly = candidates.reduce((s, c) => s + c.monthly, 0);
  return { candidates, monthly, dismiss, accept };
}
