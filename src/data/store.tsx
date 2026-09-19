/**
 * App store (Context + Reducer). In-memory, seeded EMPTY (start from zero).
 * A short initial load drives the skeletons; a simulated Gmail import adds
 * sample purchases. Wire to a backend to persist.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { AppData, Budget, Category, Preferences, Receipt, Subscription, SubscriptionStatus, Transaction } from "./types";
import { createInitialData, gmailSampleExpenses } from "./mock";
import { sanitizeMultiline, sanitizeText } from "@/lib/sanitize";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { useOptionalAuth } from "@/features/auth/AuthProvider";
import * as remote from "@/lib/backend/data";

let fallbackSeq = Date.now();
const newId = (p = "id") =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${p}_${(fallbackSeq++).toString(36)}`;

type Action =
  | { type: "add-tx"; tx: Transaction }
  | { type: "add-many-tx"; txs: Transaction[] }
  | { type: "update-tx"; tx: Transaction }
  | { type: "delete-tx"; id: string }
  | { type: "add-sub"; sub: Subscription }
  | { type: "update-sub"; sub: Subscription }
  | { type: "set-sub-status"; id: string; status: SubscriptionStatus }
  | { type: "upsert-budget"; budget: Budget }
  | { type: "add-category"; category: Category }
  | { type: "remove-category"; id: string }
  | { type: "update-prefs"; prefs: Partial<Preferences> }
  | { type: "hydrate"; data: Partial<AppData> }
  | { type: "reset-all" };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case "add-tx":
      return { ...state, transactions: [action.tx, ...state.transactions] };
    case "add-many-tx":
      return { ...state, transactions: [...action.txs, ...state.transactions] };
    case "update-tx":
      return { ...state, transactions: state.transactions.map((t) => (t.id === action.tx.id ? action.tx : t)) };
    case "delete-tx":
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };
    case "add-sub":
      return { ...state, subscriptions: [action.sub, ...state.subscriptions] };
    case "update-sub":
      return { ...state, subscriptions: state.subscriptions.map((s) => (s.id === action.sub.id ? action.sub : s)) };
    case "set-sub-status":
      return {
        ...state,
        subscriptions: state.subscriptions.map((s) => (s.id === action.id ? { ...s, status: action.status } : s)),
      };
    case "upsert-budget": {
      const exists = state.budgets.some((b) => b.id === action.budget.id);
      return {
        ...state,
        budgets: exists
          ? state.budgets.map((b) => (b.id === action.budget.id ? action.budget : b))
          : [...state.budgets, action.budget],
      };
    }
    case "add-category":
      if (state.categories.some((c) => c.label.toLowerCase() === action.category.label.toLowerCase())) return state;
      return { ...state, categories: [...state.categories, action.category] };
    case "remove-category":
      return { ...state, categories: state.categories.filter((c) => c.id !== action.id) };
    case "update-prefs":
      return { ...state, preferences: { ...state.preferences, ...action.prefs } };
    case "hydrate": {
      const p = action.data;
      return {
        ...state,
        transactions: p.transactions ?? state.transactions,
        subscriptions: p.subscriptions ?? state.subscriptions,
        categories: p.categories ?? state.categories,
        budgets: p.budgets && p.budgets.length ? p.budgets : state.budgets,
        preferences: p.preferences ? { ...state.preferences, ...p.preferences } : state.preferences,
      };
    }
    case "reset-all":
      return createInitialData();
    default:
      return state;
  }
}

/** Clean the free-text fields of a transaction before it enters the store. */
function cleanTx(tx: Transaction): Transaction {
  return {
    ...tx,
    description: sanitizeText(tx.description),
    categoryId: sanitizeText(tx.categoryId),
    merchant: tx.merchant ? sanitizeText(tx.merchant) : undefined,
    note: tx.note ? sanitizeMultiline(tx.note) : undefined,
  };
}

export interface NewTransactionInput {
  amount: number;
  description: string;
  categoryId: string;
  date: string;
  note?: string;
  merchant?: string;
  direction?: "expense" | "income";
  receipt?: Receipt;
}

export interface StoreValue {
  data: AppData;
  now: Date;
  loading: boolean;
  importing: boolean;
  addTransaction: (input: NewTransactionInput) => Transaction;
  updateTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addSubscription: (sub: Omit<Subscription, "id">) => Subscription;
  updateSubscription: (sub: Subscription) => void;
  deleteSubscription: (id: string) => void;
  setMonthlyBudget: (limitCents: number) => void;
  addCategory: (name: string) => void;
  removeCategory: (id: string) => void;
  setCurrency: (code: string) => void;
  connectGmail: () => void;
  disconnectGmail: () => void;
  importFromGmail: () => void;
  /** Erase all data (used by "Delete account"). Also clears server rows when connected. */
  deleteAccount: () => Promise<void>;
  /** Re-hydrate from the backend (connected mode); no-op locally. */
  refresh: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  seed,
  simulateLoading = true,
}: {
  children: ReactNode;
  seed?: AppData;
  simulateLoading?: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const [state, dispatch] = useReducer(reducer, undefined, () => seed ?? createInitialData());
  const [loading, setLoading] = useState(simulateLoading);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const userId = useOptionalAuth()?.userId ?? null;

  useEffect(() => {
    if (!simulateLoading) return;
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, [simulateLoading]);

  // Connected mode: hydrate from Supabase when a user signs in; clear on sign-out.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    if (userId) {
      remote
        .fetchAllData(userId)
        .then((data) => {
          if (!cancelled) dispatch({ type: "hydrate", data });
        })
        .catch((e) => console.warn("[sync] hydrate failed", e));
    } else {
      dispatch({ type: "reset-all" });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const value = useMemo<StoreValue>(() => {
    const canSync = isSupabaseConfigured && !!userId;
    const bg = (run: () => Promise<unknown>) => {
      if (canSync) void run().catch((e) => console.warn("[sync]", e));
    };

    return {
      data: state,
      now,
      loading,
      importing,

      addTransaction(input) {
        const direction = input.direction ?? "expense";
        const description = sanitizeText(input.description);
        const categoryId = sanitizeText(input.categoryId);
        const merchant = sanitizeText(input.merchant ?? "");
        const note = sanitizeMultiline(input.note ?? "");
        const tx: Transaction = {
          id: newId("tx"),
          amount: Math.abs(Math.trunc(input.amount)),
          direction,
          description: description || (direction === "income" ? "Income" : "Expense"),
          categoryId: categoryId || (direction === "income" ? "Income" : "Uncategorized"),
          date: input.date,
          note: note || undefined,
          merchant: merchant || undefined,
          currency: state.preferences.currency,
          source: "manual",
          receipt: input.receipt,
        };
        dispatch({ type: "add-tx", tx });
        bg(() => remote.upsertTransaction(userId as string, tx));
        return tx;
      },
      updateTransaction: (tx) => {
        const clean = cleanTx(tx);
        dispatch({ type: "update-tx", tx: clean });
        bg(() => remote.upsertTransaction(userId as string, clean));
      },
      deleteTransaction: (id) => {
        dispatch({ type: "delete-tx", id });
        bg(() => remote.deleteTransactionRow(userId as string, id));
      },

      addSubscription(sub) {
        const created: Subscription = { ...sub, id: newId("sub"), name: sanitizeText(sub.name) };
        dispatch({ type: "add-sub", sub: created });
        bg(() => remote.upsertSubscription(userId as string, created));
        return created;
      },
      updateSubscription: (sub) => {
        const clean = { ...sub, name: sanitizeText(sub.name) };
        dispatch({ type: "update-sub", sub: clean });
        bg(() => remote.upsertSubscription(userId as string, clean));
      },
      deleteSubscription: (id) => {
        dispatch({ type: "set-sub-status", id, status: "archived" });
        bg(() => remote.deleteSubscriptionRow(userId as string, id));
      },

      setMonthlyBudget: (limitCents) => {
        const budget: Budget = { id: "bud_total", scope: "total", label: "Monthly budget", limit: Math.max(0, Math.trunc(limitCents)) };
        dispatch({ type: "upsert-budget", budget });
        bg(() => remote.upsertBudget(userId as string, budget));
      },
      addCategory: (name) => {
        const label = sanitizeText(name);
        if (!label) return;
        const category: Category = { id: newId("cat"), label, custom: true };
        dispatch({ type: "add-category", category });
        bg(() => remote.upsertCategory(userId as string, category));
      },
      removeCategory: (id) => {
        dispatch({ type: "remove-category", id });
        bg(() => remote.deleteCategoryRow(userId as string, id));
      },
      setCurrency: (code) => {
        dispatch({ type: "update-prefs", prefs: { currency: code } });
        bg(() => remote.updatePreferences(userId as string, { currency: code }));
      },

      connectGmail: () => {
        dispatch({ type: "update-prefs", prefs: { gmailConnected: true } });
        bg(() => remote.updatePreferences(userId as string, { gmailConnected: true }));
      },
      disconnectGmail: () => {
        dispatch({ type: "update-prefs", prefs: { gmailConnected: false } });
        bg(() => remote.updatePreferences(userId as string, { gmailConnected: false }));
      },
      importFromGmail() {
        setImporting(true);
        setTimeout(() => {
          const existing = new Set(state.transactions.filter((t) => t.source === "gmail").map((t) => t.description));
          const incoming = gmailSampleExpenses(now, state.preferences.currency)
            .filter((t) => !existing.has(t.description))
            .map((t) => ({ ...t, id: newId("tx") }));
          if (incoming.length) {
            dispatch({ type: "add-many-tx", txs: incoming });
            bg(() => remote.upsertTransactions(userId as string, incoming));
          }
          setImporting(false);
        }, 900);
      },
      async deleteAccount() {
        if (canSync) {
          try {
            await remote.deleteAllData(userId as string);
          } catch (e) {
            console.warn("[sync] delete failed", e);
          }
        }
        dispatch({ type: "reset-all" });
      },
      refresh: () => setRefreshKey((k) => k + 1),
    };
  }, [state, now, loading, importing, userId]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be inside <StoreProvider>.");
  return ctx;
}

export { newId };
