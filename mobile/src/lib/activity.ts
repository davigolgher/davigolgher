/**
 * Native activity log for the streak — the counterpart to the web app's
 * `@/lib/activity`, which uses localStorage.
 *
 * Same idea: record every day the app is opened, so the streak builds from
 * *using* the app, not only from logging an expense. AsyncStorage is async
 * though, so the day list is hydrated once on launch and then held in memory;
 * that keeps `activeDaySet()` synchronous for the components that render it.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { dayKey } from "@/lib/streak";

const KEY = "flow.activity.v1";
const MAX_DAYS = 400;

let days: string[] = [];
let hydrated = false;

/** Read the stored log into memory. Call once, before the first render. */
export async function loadActivity(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) days = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // First launch, or the value was corrupted — an empty log is the right answer.
  }
  hydrated = true;
}

function persist(): void {
  // Fire and forget: a lost write costs one day of streak history, and blocking
  // the UI on it would be worse.
  AsyncStorage.setItem(KEY, JSON.stringify(days.slice(-MAX_DAYS))).catch(() => {});
}

/** Mark today as active. Call when the app opens or returns to the foreground. */
export function recordActivityToday(now: Date = new Date()): void {
  const key = dayKey(now);
  if (!days.includes(key)) {
    days.push(key);
    persist();
  }
}

/** Active days recorded so far, always including today. */
export function activeDaySet(now: Date = new Date()): Set<string> {
  const set = new Set(days);
  set.add(dayKey(now));
  return set;
}

/** Clear the log (used by account deletion). */
export async function clearActivity(): Promise<void> {
  days = [];
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
