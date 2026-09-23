/** Initial (EMPTY) app data. The app starts from zero; the user adds expenses. */
import type { AppData } from "./types";

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
    activeDays: [],
    preferences: {
      locale: "en-US",
      currency: "USD",
      hideAmounts: false,
      biometricLock: false,
      useStatusColor: false,
    },
  };
}
