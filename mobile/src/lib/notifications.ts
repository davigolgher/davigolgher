/**
 * Local notifications: permission, the device preference, and scheduling.
 *
 * Local, not push. A renewal reminder is a date the phone already knows, so
 * sending it through a server would mean a push certificate, a device token
 * table and a cron job to deliver something iOS can fire on its own while
 * offline. It also means the reminder works before there is any paid account.
 *
 * Nothing here knows what a subscription is — it takes a finished plan from
 * `@/lib/reminders` and hands it to the OS.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { DEFAULT_LEAD_DAYS, type ReminderPlan } from "@/lib/reminders";
import { useAuth } from "@/features/auth/AuthProvider";

/**
 * Per account. The switch used to be one setting for the whole phone, so the
 * next person to sign in inherited reminders they never asked for.
 */
const keyFor = (userId: string) => `flow.reminders.v2.${userId}`;

// The old phone-wide setting can't be told apart by account; drop it rather
// than hand it to whoever signs in next.
AsyncStorage.removeItem("flow.reminders.v1").catch(() => {});

/** Stamped on everything we schedule, so a sync never cancels anyone else's. */
const TAG = "flow.renewal";

try {
  Notifications.setNotificationHandler({
    // Worth interrupting for: it's about money leaving an account today or
    // tomorrow. Still silent — a banner is enough.
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  // This runs at import, so an unavailable native module would take the whole
  // app down on launch rather than costing one feature. Settings reports it.
}

export interface ReminderPrefs {
  enabled: boolean;
  leadDays: number;
}

/**
 * Off until asked for. Turning it on is what triggers the iOS permission
 * prompt, and a prompt nobody asked for is the one people deny for good.
 */
const DEFAULTS: ReminderPrefs = { enabled: false, leadDays: DEFAULT_LEAD_DAYS };

/** True if notifications may be shown. Returns false rather than throwing. */
export async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // iOS only shows the prompt once ever. After a denial the only way back is
    // the Settings app, so re-asking here would silently do nothing.
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Whether the OS would actually deliver one, without prompting. */
export async function hasPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Runs syncs one at a time.
 *
 * A sync cancels everything and re-adds it. Two of them overlapping would both
 * cancel, then both add, and the user would get every reminder twice.
 */
let chain: Promise<unknown> = Promise.resolve();

/**
 * Make the scheduled set match `plans` exactly.
 *
 * Cancel-then-reschedule rather than diffing: a plan changes whenever a
 * subscription is edited, renamed, deleted or paid, and at sixty notifications
 * the bookkeeping to work out which of those happened costs more than redoing
 * the lot. Doing it wholesale also means a stale reminder can't survive.
 */
export function syncReminders(plans: ReminderPlan[]): Promise<number> {
  const run = chain.then(async () => {
    try {
      await cancelReminders();
      for (const p of plans) {
        await Notifications.scheduleNotificationAsync({
          content: { title: p.title, body: p.body, data: { tag: TAG, key: p.key } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
        });
      }
      return plans.length;
    } catch {
      // A phone that won't schedule is a reminder that doesn't arrive, not a
      // broken app — the screens behind this must keep working.
      return 0;
    }
  });
  chain = run.catch(() => {});
  return run;
}

/**
 * Remove every reminder this app scheduled, once any sync in flight is done —
 * a sync finishing after the cancel would put them straight back.
 *
 * For when the account on the phone changes: sign-out, deletion, or another
 * sign-in. A reminder carries a subscription's name and amount, and a signed-
 * out account's renewals must not keep arriving on this phone.
 */
export function clearReminders(): Promise<void> {
  const run = chain.then(() => cancelReminders());
  chain = run.catch(() => {});
  return run;
}

/** Remove only the ones this app scheduled. */
export async function cancelReminders(): Promise<void> {
  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of existing) {
      if ((n.content.data as { tag?: string } | null)?.tag === TAG) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    /* nothing scheduled, or notifications unavailable */
  }
}

/**
 * Fire one a few seconds from now.
 *
 * A reminder you can't check is a reminder you don't trust: the real ones are
 * days away, so without this the only way to know the plumbing works is to wait
 * for a charge.
 */
export async function sendTestReminder(): Promise<boolean> {
  if (!(await ensurePermission())) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Reminders are on",
        body: "This is what you'll see a few days before a subscription charges you.",
        data: { tag: TAG, key: "test" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false },
    });
    return true;
  } catch {
    return false;
  }
}

export function useReminderPrefs() {
  const { userId } = useAuth();
  /** null while reading storage, so the UI shows nothing rather than the wrong state. */
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);

  useEffect(() => {
    setPrefs(null);
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(keyFor(userId))
      .then((raw) => {
        if (alive) setPrefs({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) });
      })
      .catch(() => {
        if (alive) setPrefs(DEFAULTS);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<ReminderPrefs>) => {
      if (!userId) return;
      setPrefs((current) => {
        const next = { ...(current ?? DEFAULTS), ...patch };
        AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  return { prefs, update };
}
