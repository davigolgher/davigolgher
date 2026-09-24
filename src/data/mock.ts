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
    // No budget until the user sets one. A made-up $5,000 here showed as "left
    // to spend" on Home while the account loaded — and for good if it couldn't
    // load — turning the intro's "Decide later" into a budget nobody chose.
    budgets: [],
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
