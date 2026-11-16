/**
 * Finding subscriptions in what someone already spent.
 *
 * People routinely lose track of what they pay for every month; a bank
 * connection brings in 90 days of purchases, which is three charges of any
 * monthly plan. This looks for the same merchant charged at a steady rhythm
 * for a steady amount, and offers it as a subscription to track. Nothing is
 * added without the person saying so.
 *
 * Pure: no React, no storage. Works on typed-in expenses as well as imported
 * ones.
 */
import type { Subscription, Transaction } from "@/data/types";
import type { Cents } from "./money";
import type { Frequency } from "./recurrence";

export interface SubscriptionCandidate {
  /** Stable for the same merchant, so a dismissal sticks. */
  key: string;
  name: string;
  /** The latest charge. */
  amount: Cents;
  currency: string;
  frequency: Extract<Frequency, "weekly" | "monthly">;
  /** How many charges were seen. */
  occurrences: number;
  lastChargedAt: string;
  /** When the next charge is expected, from the rhythm seen. */
  nextChargeAt: string;
  categoryId: string;
  /** What the charges add up to per month. */
  monthly: Cents;
}

const DAY = 86_400_000;

/** Categories that are never a subscription, however regular. */
const NEVER = new Set(["income", "internal", "transfers", "taxes"]);

const RHYTHMS: { frequency: SubscriptionCandidate["frequency"]; days: number; tolerance: number; perMonth: number }[] = [
  { frequency: "monthly", days: 30.4, tolerance: 4, perMonth: 1 },
  { frequency: "weekly", days: 7, tolerance: 1.5, perMonth: 52 / 12 },
];

/** "NETFLIX.COM 0423 SAO PAULO" and "Netflix.com" are the same merchant. */
export function merchantKey(t: { merchant?: string; description?: string }): string {
  const raw = (t.merchant || t.description || "").toLowerCase();
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(pag|pg|pgto|compra|debito|credito|parc|parcela)\b\*?/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/\.(com|net|br|io)\b/g, "")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    // A distinctive first word names the merchant ("netflix sao paulo"); a
    // short one needs the next word too ("uber eats").
    .reduce<string[]>((words, w) => (words.length === 0 || (words.length === 1 && words[0].length < 5) ? [...words, w] : words), [])
    .join(" ");
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function displayName(t: Transaction): string {
  const name = (t.merchant || t.description || "").trim();
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

/** Is this candidate already something the person tracks? */
function alreadyTracked(key: string, subs: Subscription[]): boolean {
  return subs.some((s) => s.status !== "archived" && s.status !== "canceled" && merchantKey({ merchant: s.name, description: s.name }) === key);
}

/**
 * Charges that look like subscriptions, biggest monthly cost first.
 * `dismissed` holds the keys the person said aren't subscriptions.
 */
export function detectSubscriptions(
  transactions: Transaction[],
  subscriptions: Subscription[] = [],
  dismissed: ReadonlySet<string> = new Set(),
  now: Date = new Date(),
): SubscriptionCandidate[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.direction !== "expense" || t.amount <= 0) continue;
    if (NEVER.has(t.categoryId.toLowerCase())) continue;
    if (+new Date(t.date) > +now) continue;
    const key = merchantKey(t);
    if (key.length < 3) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const found: SubscriptionCandidate[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2 || dismissed.has(key) || alreadyTracked(key, subscriptions)) continue;
    const charges = [...list].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const gaps = charges.slice(1).map((t, i) => (+new Date(t.date) - +new Date(charges[i].date)) / DAY);
    const gap = median(gaps);
    const rhythm = RHYTHMS.find((r) => Math.abs(gap - r.days) <= r.tolerance && gaps.every((g) => Math.abs(g - r.days) <= r.tolerance * 2));
    if (!rhythm) continue;
    // Two weekly charges are just a habit; weekly plans need a longer run.
    if (rhythm.frequency === "weekly" && charges.length < 4) continue;

    // The same plan costs about the same each time: a price rise is fine, a
    // supermarket's different total every visit is not a plan.
    const amounts = charges.map((t) => t.amount);
    const typical = median(amounts);
    if (amounts.some((a) => Math.abs(a - typical) > Math.max(typical * 0.15, 100))) continue;

    const last = charges[charges.length - 1];
    // A plan that stopped charging is not one to track now.
    if (+now - +new Date(last.date) > (rhythm.days + rhythm.tolerance * 2) * DAY) continue;

    found.push({
      key,
      name: displayName(last),
      amount: last.amount,
      currency: last.currency,
      frequency: rhythm.frequency,
      occurrences: charges.length,
      lastChargedAt: last.date,
      nextChargeAt: new Date(+new Date(last.date) + Math.round(rhythm.days) * DAY).toISOString(),
      categoryId: last.categoryId,
      monthly: Math.round(last.amount * rhythm.perMonth),
    });
  }
  return found.sort((a, b) => b.monthly - a.monthly);
}

/** What tracking a candidate adds: a subscription in the store's shape. */
export function candidateToSubscription(c: SubscriptionCandidate): Omit<Subscription, "id"> {
  return {
    name: c.name,
    amount: c.amount,
    currency: c.currency,
    frequency: c.frequency,
    nextChargeAt: c.nextChargeAt,
    status: "active",
    categoryId: c.categoryId,
    reminders: false,
  };
}
