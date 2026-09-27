/**
 * Keeps the scheduled reminders in step with the data.
 *
 * A context rather than a plain hook, deliberately. Two copies of this would
 * each hold their own preference state and run their own sync, so the switch in
 * Settings wouldn't reach the one doing the scheduling, and both would race to
 * cancel and re-add the same notifications. One instance, mounted above the
 * tabs, means editing a subscription on any screen reschedules on the way back.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { planReminders } from "@/lib/reminders";
import { fetchBilling, type BillingRow } from "@/lib/backend/billing";
import { clearReminders, ensurePermission, hasPermission, syncReminders, useReminderPrefs } from "~/lib/notifications";

export interface Reminders {
  prefs: { enabled: boolean; leadDays: number } | null;
  /** How many are queued with the OS; null while it's being worked out. */
  scheduled: number | null;
  /** False when iOS is blocking them — the switch can be on and nothing arrive. */
  allowed: boolean;
  /** Returns false if permission was refused, so the switch doesn't lie. */
  setEnabled: (on: boolean) => Promise<boolean>;
  setLeadDays: (days: number) => void;
}

const Ctx = createContext<Reminders | null>(null);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const { data } = useStore();
  const money = useMoney();
  const { prefs, update } = useReminderPrefs();
  const [billing, setBilling] = useState<BillingRow | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [allowed, setAllowed] = useState(true);

  // Flow's own renewal date. Read once: it changes when the store charges, not
  // while someone is using the app.
  useEffect(() => {
    let alive = true;
    fetchBilling()
      .then((b) => alive && setBilling(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const subscriptions = data.subscriptions;

  useEffect(() => {
    if (!prefs) return;

    let alive = true;
    (async () => {
      if (!prefs.enabled) {
        await clearReminders();
        if (alive) setScheduled(0);
        return;
      }

      // Permission can be revoked in iOS Settings long after it was granted, so
      // it's checked on every sync rather than remembered.
      const ok = await hasPermission();
      if (!alive) return;
      setAllowed(ok);
      if (!ok) {
        setScheduled(0);
        return;
      }

      const count = await syncReminders(
        planReminders({ subscriptions, billing, leadDays: prefs.leadDays, formatAmount: money.format }),
      );
      if (alive) setScheduled(count);
    })();

    return () => {
      alive = false;
    };
    // `money` is memoised on the currency code, so this re-runs when the
    // currency changes and not on every render.
  }, [prefs, subscriptions, billing, money]);

  /** Turning it on asks for permission first, and stays off if refused. */
  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!on) {
        update({ enabled: false });
        return true;
      }
      const ok = await ensurePermission();
      setAllowed(ok);
      if (ok) update({ enabled: true });
      return ok;
    },
    [update],
  );

  const setLeadDays = useCallback((leadDays: number) => update({ leadDays }), [update]);

  const value = useMemo(
    () => ({ prefs, scheduled, allowed, setEnabled, setLeadDays }),
    [prefs, scheduled, allowed, setEnabled, setLeadDays],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRenewalReminders(): Reminders {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRenewalReminders must be used inside RemindersProvider");
  return ctx;
}
