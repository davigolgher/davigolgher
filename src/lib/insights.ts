/**
 * Insights: one useful sentence each about the person's own money, worth
 * opening the app for. Only facts computed from their data, never advice and
 * never made up; nothing is shown until there is enough to say something
 * true.
 *
 * Pure: no React, no storage.
 */
import type { Subscription, Transaction } from "@/data/types";
import type { Cents } from "./money";
import { nextChargeDate } from "./recurrence";

export type InsightKind = "pace" | "top_category" | "upcoming" | "biggest";

export interface Insight {
  kind: InsightKind;
  /** Short line, the headline of a card. */
  title: string;
  /** The numbers behind it; the screen formats them. */
  amount: Cents;
  /** For "pace": the difference with last month at the same day (negative = less). */
  delta?: Cents;
  /** A category, a merchant or a count, depending on the kind. */
  detail?: string;
  count?: number;
}

const DAY = 86_400_000;

function expenses(txs: Transaction[]) {
  return txs.filter((t) => t.direction === "expense");
}

function sumBetween(txs: Transaction[], from: Date, to: Date): Cents {
  return expenses(txs)
    .filter((t) => {
      const d = +new Date(t.date);
      return d >= +from && d < +to;
    })
    .reduce((s, t) => s + t.amount, 0);
}

function startOfMonth(d: Date, offset = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

/** Month to date against the same stretch of last month. Needs a few entries in both. */
export function pace(txs: Transaction[], now: Date = new Date()): Insight | null {
  const thisStart = startOfMonth(now);
  const lastStart = startOfMonth(now, -1);
  const day = now.getDate();
  const lastDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const lastCut = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(day, lastDays), now.getHours(), now.getMinutes());
  const thisCount = expenses(txs).filter((t) => +new Date(t.date) >= +thisStart && +new Date(t.date) <= +now).length;
  const lastCount = expenses(txs).filter((t) => +new Date(t.date) >= +lastStart && +new Date(t.date) < +thisStart).length;
  if (thisCount < 3 || lastCount < 3) return null;
  const current = sumBetween(txs, thisStart, new Date(+now + 1));
  const previous = sumBetween(txs, lastStart, lastCut);
  const delta = current - previous;
  return {
    kind: "pace",
    title: delta <= 0 ? "Spending less than last month" : "Spending more than last month",
    amount: current,
    delta,
  };
}

/** The category taking the most this month, and its share. */
export function topCategory(txs: Transaction[], now: Date = new Date()): Insight | null {
  const from = startOfMonth(now);
  const month = expenses(txs).filter((t) => +new Date(t.date) >= +from && +new Date(t.date) <= +now);
  if (month.length < 3) return null;
  const by = new Map<string, Cents>();
  for (const t of month) by.set(t.categoryId || "Uncategorized", (by.get(t.categoryId || "Uncategorized") ?? 0) + t.amount);
  const total = month.reduce((s, t) => s + t.amount, 0);
  const [category, amount] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!total) return null;
  return { kind: "top_category", title: `${category} leads this month`, amount, detail: category, count: Math.round((amount / total) * 100) };
}

/** What subscriptions will charge in the next 7 days. */
export function upcoming(subs: Subscription[], now: Date = new Date()): Insight | null {
  const soon = subs.filter((s) => {
    if (s.status !== "active" && s.status !== "trial") return false;
    const next = nextChargeDate(s, now);
    return next !== null && +next - +now <= 7 * DAY;
  });
  if (soon.length === 0) return null;
  return {
    kind: "upcoming",
    title: soon.length === 1 ? `${soon[0].name} charges this week` : `${soon.length} charges coming this week`,
    amount: soon.reduce((s, x) => s + x.amount, 0),
    count: soon.length,
    detail: soon.length === 1 ? soon[0].name : undefined,
  };
}

/** The biggest single purchase of the last 7 days. */
export function biggest(txs: Transaction[], now: Date = new Date()): Insight | null {
  const week = expenses(txs).filter((t) => +now - +new Date(t.date) <= 7 * DAY && +new Date(t.date) <= +now);
  if (week.length < 2) return null;
  const top = [...week].sort((a, b) => b.amount - a.amount)[0];
  return { kind: "biggest", title: "Biggest purchase this week", amount: top.amount, detail: top.merchant || top.description };
}

/** The insights worth a card right now, most useful first, at most `max`. */
export function insightsFor(txs: Transaction[], subs: Subscription[], now: Date = new Date(), max = 2): Insight[] {
  return [upcoming(subs, now), pace(txs, now), topCategory(txs, now), biggest(txs, now)].filter((i): i is Insight => i !== null).slice(0, max);
}
