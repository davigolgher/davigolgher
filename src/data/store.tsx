/**
 * App store (Context + Reducer). In-memory, seeded EMPTY (start from zero).
 * A short initial load drives the skeletons; a simulated Gmail import adds
 * sample purchases. Wire to a backend to persist.
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { AppData, Budget, Category, Preferences, Subscription, SubscriptionStatus, Transaction } from "./types";
import { createInitialData, gmailSampleExpenses } from "./mock";

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
  | { type: "update-prefs"; prefs: Partial<Preferences> };

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
    default:
      return state;
  }
}

export interface NewTransactionInput {
  amount: number;
  description: string;
  categoryId: string;
  date: string;
  note?: string;
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

  useEffect(() => {
    if (!simulateLoading) return;
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, [simulateLoading]);

  const value = useMemo<StoreValue>(() => {
    return {
      data: state,
      now,
      loading,
      importing,

      addTransaction(input) {
        const tx: Transaction = {
          id: newId("tx"),
          amount: Math.abs(Math.trunc(input.amount)),
          direction: "expense",
          description: input.description.trim() || "Expense",
          categoryId: input.categoryId.trim() || "Uncategorized",
          date: input.date,
          note: input.note?.trim() || undefined,
          currency: state.preferences.currency,
          source: "manual",
        };
        dispatch({ type: "add-tx", tx });
        return tx;
      },
      updateTransaction: (tx) => dispatch({ type: "update-tx", tx }),
      deleteTransaction: (id) => dispatch({ type: "delete-tx", id }),

      addSubscription(sub) {
        const created: Subscription = { ...sub, id: newId("sub") };
        dispatch({ type: "add-sub", sub: created });
        return created;
      },
      updateSubscription: (sub) => dispatch({ type: "update-sub", sub }),
      deleteSubscription: (id) => dispatch({ type: "set-sub-status", id, status: "archived" }),

      setMonthlyBudget: (limitCents) =>
        dispatch({
          type: "upsert-budget",
          budget: { id: "bud_total", scope: "total", label: "Monthly budget", limit: Math.max(0, Math.trunc(limitCents)) },
        }),
      addCategory: (name) => {
        const label = name.trim();
        if (!label) return;
        dispatch({ type: "add-category", category: { id: newId("cat"), label, custom: true } });
      },
      removeCategory: (id) => dispatch({ type: "remove-category", id }),
      setCurrency: (code) => dispatch({ type: "update-prefs", prefs: { currency: code } }),

      connectGmail: () => dispatch({ type: "update-prefs", prefs: { gmailConnected: true } }),
      disconnectGmail: () => dispatch({ type: "update-prefs", prefs: { gmailConnected: false } }),
      importFromGmail() {
        setImporting(true);
        setTimeout(() => {
          const existing = new Set(state.transactions.filter((t) => t.source === "gmail").map((t) => t.description));
          const incoming = gmailSampleExpenses(now, state.preferences.currency)
            .filter((t) => !existing.has(t.description))
            .map((t) => ({ ...t, id: newId("tx") }));
          if (incoming.length) dispatch({ type: "add-many-tx", txs: incoming });
          setImporting(false);
        }, 900);
      },
    };
  }, [state, now, loading, importing]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be inside <StoreProvider>.");
  return ctx;
}

export { newId };
