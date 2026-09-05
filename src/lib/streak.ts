/** Logging streak (gamification), computed from expense dates. */
import { startOfDay } from "./format";
import type { Transaction } from "@/data/types";

function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

function loggedDays(txs: Transaction[]): Set<string> {
  const set = new Set<string>();
  for (const t of txs) if (t.direction === "expense") set.add(dayKey(new Date(t.date)));
  return set;
}

/** Consecutive days with at least one expense, ending today (or yesterday, grace). */
export function currentStreak(txs: Transaction[], now: Date = new Date()): number {
  const days = loggedDays(txs);
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

/** Whether each of the last 7 days had a logged expense (oldest → today). */
export function last7Days(txs: Transaction[], now: Date = new Date()): boolean[] {
  const days = loggedDays(txs);
  const today = startOfDay(now);
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(days.has(dayKey(d)));
  }
  return out;
}
