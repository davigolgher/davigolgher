/**
 * App-usage activity log for the streak. Records each day the app is opened, in
 * localStorage, so a streak builds from *using* the app (Duolingo-style) — not
 * only from logging an expense. Today always counts, because you're here now.
 */
import { dayKey } from "./streak";

const KEY = "flow.activity.v1";
const MAX_DAYS = 400;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* ignore */
  }
  return [];
}

function write(days: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(days.slice(-MAX_DAYS)));
  } catch {
    /* ignore */
  }
}

/** Mark today as active. Call once when the app opens. */
export function recordActivityToday(now: Date = new Date()): void {
  const key = dayKey(now);
  const days = read();
  if (!days.includes(key)) {
    days.push(key);
    write(days);
  }
}

/** Active days recorded so far, always including today. */
export function activeDaySet(now: Date = new Date()): Set<string> {
  const set = new Set(read());
  set.add(dayKey(now));
  return set;
}

/** Clear the activity log (used by account deletion). */
export function clearActivity(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
