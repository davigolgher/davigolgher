/**
 * Sample data, to see what Flow does before giving it anything.
 *
 * Every figure is invented and the app labels it "Sample data" on every
 * screen while it is shown; none of it is saved or sent anywhere. Dates are
 * relative to today, so it always looks like a lived-in current month: two
 * months of everyday spending, a salary, a budget, tracked subscriptions,
 * and two monthly charges nobody tracked yet (so "found in your spending"
 * has something to show).
 */
import type { AppData, Category, Subscription, Transaction } from "./types";
import { createInitialData } from "./mock";

export const SAMPLE_CATEGORIES = ["Groceries", "Eating out", "Transport", "Housing & bills", "Shopping", "Health", "Entertainment", "Other"];

interface Line {
  day: number;
  name: string;
  category: string;
  /** In the currency's main unit; scaled per currency below. */
  amount: number;
  income?: boolean;
}

const MONTH: Line[] = [
  { day: 1, name: "Salary", category: "Income", amount: 4200, income: true },
  { day: 1, name: "Rent", category: "Housing & bills", amount: 1100 },
  { day: 2, name: "Corner Café", category: "Eating out", amount: 9.5 },
  { day: 3, name: "Fresh Market", category: "Groceries", amount: 86.4 },
  { day: 4, name: "Metro card", category: "Transport", amount: 40 },
  { day: 5, name: "StreamBox", category: "Entertainment", amount: 15.99 },
  { day: 6, name: "Pharmacy Plus", category: "Health", amount: 23.1 },
  { day: 7, name: "Noodle Bar", category: "Eating out", amount: 18.7 },
  { day: 8, name: "CloudDrive", category: "Other", amount: 2.99 },
  { day: 9, name: "Fresh Market", category: "Groceries", amount: 64.25 },
  { day: 10, name: "Electric bill", category: "Housing & bills", amount: 72.4 },
  { day: 11, name: "Bookshop", category: "Shopping", amount: 27 },
  { day: 12, name: "Ride app", category: "Transport", amount: 14.6 },
  { day: 13, name: "Pizza Napoli", category: "Eating out", amount: 31.8 },
  { day: 14, name: "Phone plan", category: "Housing & bills", amount: 30 },
  { day: 15, name: "FitClub", category: "Health", amount: 39 },
  { day: 16, name: "Fresh Market", category: "Groceries", amount: 92.1 },
  { day: 18, name: "Cinema", category: "Entertainment", amount: 22 },
  { day: 19, name: "Sneaker Store", category: "Shopping", amount: 89.9 },
  { day: 21, name: "Corner Café", category: "Eating out", amount: 7.8 },
  { day: 22, name: "Fresh Market", category: "Groceries", amount: 58.6 },
  { day: 24, name: "Ride app", category: "Transport", amount: 11.2 },
  { day: 26, name: "Burger Joint", category: "Eating out", amount: 16.4 },
  { day: 27, name: "MusicNow", category: "Entertainment", amount: 10.99 },
];

/** Rough size of a month's spending per currency, so sample amounts look ordinary. */
const SCALE: Record<string, number> = { BRL: 5, JPY: 150, INR: 80, MXN: 18, ARS: 900, CLP: 900, COP: 4000, KRW: 1300, HUF: 360, CZK: 23, SEK: 10, NOK: 10, DKK: 7, PLN: 4, ZAR: 18, TRY: 33 };

const DAY = 86_400_000;

export function createSampleData(currency = "USD", now: Date = new Date(), locale = "en-US"): AppData {
  const scale = SCALE[currency] ?? 1;
  const cents = (v: number) => Math.round(v * scale * 100);
  const base = createInitialData();
  const transactions: Transaction[] = [];
  let n = 0;
  for (const offset of [-1, 0]) {
    const y = now.getFullYear();
    const m = now.getMonth() + offset;
    for (const line of MONTH) {
      const date = new Date(y, m, line.day, 12 + (n % 7), 10);
      if (+date > +now) continue;
      n += 1;
      // Last month runs a little higher, so this month reads "spending less".
      const amount = line.income ? cents(line.amount) : Math.round(cents(line.amount) * (offset === -1 ? 1.12 : 1));
      transactions.push({
        id: `sample-tx-${n}`,
        amount,
        direction: line.income ? "income" : "expense",
        description: line.name,
        merchant: line.name,
        categoryId: line.category,
        date: date.toISOString(),
        currency,
        source: "manual",
      });
    }
  }
  transactions.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const sub = (id: string, name: string, amount: number, day: number, category: string): Subscription => {
    let next = new Date(now.getFullYear(), now.getMonth(), day, 9);
    if (+next < +now) next = new Date(now.getFullYear(), now.getMonth() + 1, day, 9);
    return { id, name, amount: cents(amount), currency, frequency: "monthly", nextChargeAt: next.toISOString(), status: "active", categoryId: category, reminders: true };
  };
  // StreamBox, the phone plan and FitClub are tracked; CloudDrive and
  // MusicNow repeat every month but aren't, so Flow finds them.
  const subscriptions = [
    sub("sample-sub-1", "StreamBox", 15.99, 5, "Entertainment"),
    sub("sample-sub-2", "Phone plan", 30, 14, "Housing & bills"),
    sub("sample-sub-3", "FitClub", 39, 15, "Health"),
  ];

  const categories: Category[] = [...SAMPLE_CATEGORIES, "Income"].map((label, i) => ({ id: `sample-cat-${i}`, label }));

  return {
    ...base,
    isSimulated: true,
    user: { id: "sample", name: "Sample", email: "" },
    categories,
    transactions,
    subscriptions,
    budgets: [{ id: "sample-budget", scope: "total", label: "Monthly budget", limit: cents(2400) }],
    activeDays: [0, 1, 2, 4].map((d) => new Date(+now - d * DAY).toISOString().slice(0, 10)),
    preferences: { ...base.preferences, currency, locale },
  };
}
