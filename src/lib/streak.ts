/** Activity streak (gamification): days the app was used and/or an expense logged. */
import { startOfDay } from "./format";
import type { Transaction } from "@/data/types";

export function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

/** Union of expense-logged days with any extra active days (e.g. app-usage days). */
function activeDays(txs: Transaction[], extra?: Set<string>): Set<string> {
  const set = new Set<string>(extra ?? []);
  for (const t of txs) if (t.direction === "expense") set.add(dayKey(new Date(t.date)));
  return set;
}

/** Consecutive active days ending today (with a one-day grace for today). */
export function currentStreak(txs: Transaction[], now: Date = new Date(), extra?: Set<string>): number {
  const days = activeDays(txs, extra);
  const today = startOfDay(now);
  const cursor = new Date(today);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // grace for today
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Whether each of the last 7 days was active (oldest → today). */
export function last7Days(txs: Transaction[], now: Date = new Date(), extra?: Set<string>): boolean[] {
  const days = activeDays(txs, extra);
  const today = startOfDay(now);
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(days.has(dayKey(d)));
  }
  return out;
}
