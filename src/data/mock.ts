/**
 * Initial (EMPTY) app data. The app starts from zero — the user adds expenses
 * manually or imports purchases from Gmail.
 *
 * `gmailSampleExpenses` simulates what a Gmail integration WOULD parse from
 * receipt emails (real access needs a backend). Marked source: "gmail".
 */
import type { AppData, Transaction } from "./types";

export function createInitialData(): AppData {
  return {
    isSimulated: false,
    user: { id: "u_1", name: "You", email: "" },
    accounts: [],
    cards: [],
    categories: [],
    transactions: [],
    subscriptions: [],
    budgets: [{ id: "bud_total", scope: "total", label: "Monthly budget", limit: 500000 }],
    notifications: [],
    preferences: {
      locale: "en-US",
      currency: "USD",
      hideAmounts: false,
      biometricLock: false,
      useStatusColor: false,
      gmailConnected: false,
    },
  };
}

let sampleSeq = 0;
const sid = () => `gmail_${Date.now().toString(36)}_${(sampleSeq++).toString(36)}`;

function daysAgo(now: Date, d: number, hour = 10): string {
  const date = new Date(now);
  date.setDate(date.getDate() - d);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function gmailSampleExpenses(now: Date, currency: string): Transaction[] {
  const rows: [number, string, string, number][] = [
    [4211, "Amazon order", "Shopping", 0],
    [1899, "Uber", "Transport", 1],
    [1290, "Spotify", "Subscriptions", 2],
    [6540, "Whole Foods", "Groceries", 3],
    [999, "App Store", "Apps", 5],
  ];
  return rows.map(([amount, name, category, d]) => ({
    id: sid(),
    amount,
    direction: "expense" as const,
    description: name,
    categoryId: category,
    date: daysAgo(now, d),
    currency,
    source: "gmail" as const,
  }));
}
