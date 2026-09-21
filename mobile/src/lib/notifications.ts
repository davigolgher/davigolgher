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

const KEY = "flow.reminders.v1";

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
  /** null while reading storage, so the UI shows nothing rather than the wrong state. */
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive) setPrefs({ ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) });
      })
      .catch(() => {
        if (alive) setPrefs(DEFAULTS);
      });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<ReminderPrefs>) => {
    setPrefs((current) => {
      const next = { ...(current ?? DEFAULTS), ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { prefs, update };
}
