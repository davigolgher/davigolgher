/**
 * Recurrence: next-charge math, day counts, monthly/annual equivalents.
 */
import { Money, type Cents } from "./money";
import { startOfDay } from "./format";

export type Frequency = "monthly" | "yearly" | "weekly" | "custom";

export interface RecurrenceLike {
  frequency: Frequency;
  customIntervalDays?: number;
  amount: Cents;
  nextChargeAt: string;
}

export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = startOfDay(new Date(iso)).getTime();
  const base = startOfDay(from).getTime();
  return Math.round((target - base) / 86_400_000);
}

/**
 * `iso` moved on by `n` billing periods.
 *
 * Months keep the day they were anchored to and clamp it to shorter months:
 * a charge on 31 January falls on 28 February and then 31 March. Plain
 * `setMonth` overflowed instead — 31 January plus a month became 3 March, and
 * every date after that stayed three days late.
 */
export function addPeriods(iso: string, freq: Frequency, n: number, customIntervalDays = 30): Date {
  const d = new Date(iso);
  switch (freq) {
    case "monthly":
    case "yearly": {
      const months = freq === "monthly" ? n : 12 * n;
      const target = new Date(d);
      target.setDate(1);
      target.setMonth(target.getMonth() + months);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(d.getDate(), lastDay));
      return target;
    }
    case "weekly": {
      const target = new Date(d);
      target.setDate(target.getDate() + 7 * n);
      return target;
    }
    case "custom": {
      const target = new Date(d);
      target.setDate(target.getDate() + Math.max(1, customIntervalDays) * n);
      return target;
    }
  }
}

export function advanceCharge(iso: string, freq: Frequency, customIntervalDays = 30): string {
  return addPeriods(iso, freq, 1, customIntervalDays).toISOString();
}

/** The longest a period can be, in days — so a jump by it never overshoots. */
function longestPeriodDays(freq: Frequency, customIntervalDays = 30): number {
  switch (freq) {
    case "monthly":
      return 31;
    case "yearly":
      return 366;
    case "weekly":
      return 7;
    case "custom":
      return Math.max(1, customIntervalDays);
  }
}

/**
 * The next `count` charges falling today or later.
 *
 * The stored `nextChargeAt` is the first charge the user entered, and nothing
 * moves it on — a monthly subscription added in August kept saying "Today"
 * from its first charge onward, and its reminders stopped for good. Working
 * it out from the anchor each time needs no background job and no write, and
 * keeps the day of the month exactly.
 */
export function upcomingChargeDates(r: RecurrenceLike, now: Date = new Date(), count = 1): Date[] {
  const anchor = new Date(r.nextChargeAt);
  if (Number.isNaN(anchor.getTime())) return [];
  const today = startOfDay(now).getTime();
  const at = (n: number) => addPeriods(r.nextChargeAt, r.frequency, n, r.customIntervalDays);

  let n = 0;
  const behind = Math.floor((today - startOfDay(anchor).getTime()) / 86_400_000);
  // Jump most of the way for a long-past anchor, then step.
  if (behind > 0) n = Math.max(0, Math.floor(behind / longestPeriodDays(r.frequency, r.customIntervalDays)) - 1);
  while (startOfDay(at(n)).getTime() < today) n += 1;

  return Array.from({ length: count }, (_, i) => at(n + i));
}

/** The next charge falling today or later, or null for an unreadable date. */
export function nextChargeDate(r: RecurrenceLike, now: Date = new Date()): Date | null {
  return upcomingChargeDates(r, now, 1)[0] ?? null;
}

/** Days until the next charge; 0 is today. */
export function daysUntilCharge(r: RecurrenceLike, now: Date = new Date()): number {
  const next = nextChargeDate(r, now);
  return next ? daysUntil(next.toISOString(), now) : 0;
}

export function monthlyEquivalent(r: RecurrenceLike): Cents {
  switch (r.frequency) {
    case "monthly":
      return r.amount;
    case "yearly":
      return Money.scale(r.amount, 1 / 12);
    case "weekly":
      return Money.scale(r.amount, 52 / 12);
    case "custom": {
      const days = Math.max(1, r.customIntervalDays ?? 30);
      return Money.scale(r.amount, 30.4375 / days);
    }
  }
}

export function annualEquivalent(r: RecurrenceLike): Cents {
  switch (r.frequency) {
    case "monthly":
      return Money.scale(r.amount, 12);
    case "yearly":
      return r.amount;
    case "weekly":
      return Money.scale(r.amount, 52);
    case "custom": {
      const days = Math.max(1, r.customIntervalDays ?? 30);
      return Money.scale(r.amount, 365.25 / days);
    }
  }
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  weekly: "Weekly",
  custom: "Custom",
};
