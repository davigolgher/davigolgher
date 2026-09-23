/**
 * Domain model. All monetary values are integer cents (see lib/money).
 */
import type { Cents } from "@/lib/money";
import type { Frequency } from "@/lib/recurrence";

export type ID = string;

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  label: string;
  icon?: string;
  custom?: boolean;
}

/** An attached receipt file, validated client-side (see lib/upload). */
export interface Receipt {
  name: string;
  type: string;
  /** In-memory data URL (no backend storage yet). */
  dataUrl: string;
}

export interface Transaction {
  id: ID;
  amount: Cents;
  direction: "expense" | "income";
  description: string;
  categoryId: CategoryId;
  date: string; // ISO
  note?: string;
  /** Who it was paid to / received from (e.g. "Dunkin'"). */
  merchant?: string;
  currency: string;
  source?: "manual";
  receipt?: Receipt;
}

export type SubscriptionStatus = "active" | "paused" | "canceled" | "archived" | "trial";

export interface Subscription {
  id: ID;
  name: string;
  amount: Cents;
  currency: string;
  frequency: Frequency;
  customIntervalDays?: number;
  nextChargeAt: string;
  status: SubscriptionStatus;
  categoryId: CategoryId;
  icon?: string;
  reminders: boolean;
  previousAmount?: Cents;
  lastUsedAt?: string;
  trialEndsAt?: string;
}

export type BudgetScope = "total" | "subscriptions" | CategoryId;

export interface Budget {
  id: ID;
  scope: BudgetScope;
  label: string;
  limit: Cents;
}

export interface Preferences {
  locale: string;
  currency: string;
  hideAmounts: boolean;
  biometricLock: boolean;
  useStatusColor: boolean;
}

export interface User {
  id: ID;
  name: string;
  email: string;
}

export interface AppData {
  user: User;
  accounts: never[];
  cards: never[];
  categories: Category[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  budgets: Budget[];
  notifications: never[];
  preferences: Preferences;
  /**
   * Days this account opened the app, as `dayKey()` strings — what the streak
   * counts alongside days with an expense. Stored with the account, so it
   * follows the person to a new phone and isn't shared with anyone else's
   * account on this one.
   */
  activeDays: string[];
  isSimulated: boolean;
}
