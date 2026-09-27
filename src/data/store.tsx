/**
 * App store (Context + Reducer). Seeded EMPTY (start from zero), mutated
 * locally and persisted to Supabase in the background, through a sync queue
 * that is saved on the phone until the server confirms each change (see
 * ./outbox).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { AppData, Budget, Category, Preferences, Receipt, Subscription, SubscriptionStatus, Transaction } from "./types";
import { createInitialData } from "./mock";
import { sanitizeMultiline, sanitizeText } from "@/lib/sanitize";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { useOptionalAuth } from "@/features/auth/AuthProvider";
import * as remote from "@/lib/backend/data";
import { applyPending, createSyncQueue, type Op, type SyncQueue, type SyncStatus } from "./outbox";
import { loadPending, savePending } from "./pendingStore";

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
  | { type: "mark-active-day"; day: string }
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
        // Replaced, never merged — merging would carry one account's days into
        // the next if the user changed without passing through a sign-out.
        activeDays: p.activeDays ?? state.activeDays,
      };
    }
    case "mark-active-day":
      if (state.activeDays.includes(action.day)) return state;
      return { ...state, activeDays: [...state.activeDays, action.day] };
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
  /** Erase all data (used by "Delete account"). Also clears server rows when connected. */
  deleteAccount: () => Promise<void>;
  /**
   * Complete the daily review for `day` (a `dayKey`) — the one action that
   * counts toward the streak. Resolves once the server has it.
   */
  reviewDay: (day: string) => Promise<void>;
  /** Re-hydrate from the backend (connected mode); no-op locally. */
  refresh: () => void;
  /** Where the account's changes stand with the server. */
  sync: SyncState;
  /** Try sending waiting changes now, instead of at the next scheduled retry. */
  retrySync: () => void;
}

export interface SyncState extends SyncStatus {
  /** The last attempt to load the account from the server failed. */
  loadFailed: boolean;
}

const IDLE: SyncState = { pending: 0, failing: false, loadFailed: false };

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
  // Today, for every "this month" and "today" total. Fixed at launch it went
  // stale: iOS keeps an app in memory for days, and Home went on showing
  // September's figures into October until the app was closed. Checked every
  // half minute, and replaced only when the date has changed.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNow((prev) => (prev.toDateString() === d.toDateString() ? prev : d));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  const [state, dispatch] = useReducer(reducer, undefined, () => seed ?? createInitialData());
  const [loading, setLoading] = useState(simulateLoading);
  const [refreshKey, setRefreshKey] = useState(0);
  const userId = useOptionalAuth()?.userId ?? null;
  const [sync, setSync] = useState<SyncState>(IDLE);
  const queueRef = useRef<SyncQueue | null>(null);
  /** Settles once the queue holds what this account left unsent last time. */
  const restoredRef = useRef<Promise<void>>(Promise.resolve());

  // One queue per signed-in account, created before anything can be edited and
  // restored from the phone as soon as the saved copy is read.
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let alive = true;
    const loaded = loadPending(userId);
    // Saves wait for that read, so an edit made in the first instant can't
    // overwrite the saved copy before it has been read.
    let saving: Promise<unknown> = loaded;
    const q = createSyncQueue({
      send: (op) => remote.sendOp(userId, op),
      // In order, so an older snapshot can never land after a newer one.
      save: (ops) => {
        const snapshot = [...ops];
        saving = saving.then(() => savePending(userId, snapshot));
      },
      onChange: (st) => setSync((prev) => ({ ...prev, ...st })),
      onDrop: (op, e) => console.warn("[sync] refused, dropped", op.kind, e),
    });
    queueRef.current = q;
    restoredRef.current = loaded.then((ops) => {
      if (alive) q.restore(ops);
    });
    setSync(IDLE);
    return () => {
      alive = false;
      q.dispose();
      if (queueRef.current === q) queueRef.current = null;
    };
  }, [userId]);

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
      const q = queueRef.current;
      const restored = restoredRef.current;
      (async () => {
        // First what this account left unsent last time, so it goes out now
        // and is on screen whatever the server says.
        await restored;
        if (cancelled) return;
        void q?.flush();
        const mark = q?.mark() ?? 0;
        try {
          // Opening the app no longer counts toward the streak — only
          // completing the daily review does (see reviewDay and lib/streak).
          const data = await remote.fetchAllData(userId);
          if (cancelled) return;
          // Changes that landed while this was loading aren't in `data`;
          // changes still waiting certainly aren't. Lay both back over it.
          const pending: Op[] = q ? [...q.sentSince(mark), ...q.ops] : [];
          dispatch({ type: "hydrate", data: applyPending(data, pending) });
          setSync((prev) => ({ ...prev, loadFailed: false }));
        } catch (e) {
          console.warn("[sync] hydrate failed", e);
          if (!cancelled) setSync((prev) => ({ ...prev, loadFailed: true }));
        }
      })();
    } else {
      dispatch({ type: "reset-all" });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const retrySync = useCallback(() => {
    void queueRef.current?.flush();
  }, []);

  const value = useMemo<StoreValue>(() => {
    const canSync = isSupabaseConfigured && !!userId;
    const bg = (op: Op) => {
      if (canSync) queueRef.current?.push(op);
    };

    return {
      data: state,
      now,
      loading,

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
        bg({ kind: "tx.upsert", tx });
        return tx;
      },
      updateTransaction: (tx) => {
        const clean = cleanTx(tx);
        dispatch({ type: "update-tx", tx: clean });
        bg({ kind: "tx.upsert", tx: clean });
      },
      deleteTransaction: (id) => {
        dispatch({ type: "delete-tx", id });
        bg({ kind: "tx.delete", id });
      },

      addSubscription(sub) {
        const created: Subscription = { ...sub, id: newId("sub"), name: sanitizeText(sub.name) };
        dispatch({ type: "add-sub", sub: created });
        bg({ kind: "sub.upsert", sub: created });
        return created;
      },
      updateSubscription: (sub) => {
        const clean = { ...sub, name: sanitizeText(sub.name) };
        dispatch({ type: "update-sub", sub: clean });
        bg({ kind: "sub.upsert", sub: clean });
      },
      deleteSubscription: (id) => {
        dispatch({ type: "set-sub-status", id, status: "archived" });
        bg({ kind: "sub.delete", id });
      },

      setMonthlyBudget: (limitCents) => {
        const budget: Budget = { id: "bud_total", scope: "total", label: "Monthly budget", limit: Math.max(0, Math.trunc(limitCents)) };
        dispatch({ type: "upsert-budget", budget });
        bg({ kind: "budget.upsert", budget });
      },
      addCategory: (name) => {
        const label = sanitizeText(name);
        if (!label) return;
        // The reducer ignores a name already in the list; so must the server
        // write, or it's refused as a duplicate.
        if (state.categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) return;
        const category: Category = { id: newId("cat"), label, custom: true };
        dispatch({ type: "add-category", category });
        bg({ kind: "cat.upsert", category });
      },
      removeCategory: (id) => {
        dispatch({ type: "remove-category", id });
        bg({ kind: "cat.delete", id });
      },
      setCurrency: (code) => {
        dispatch({ type: "update-prefs", prefs: { currency: code } });
        bg({ kind: "prefs.update", prefs: { currency: code } });
      },

      async deleteAccount() {
        // Deletes the auth user too, not just the rows — see remote.deleteAccount.
        // Errors propagate so the caller can tell the user it didn't work,
        // rather than clearing the screen and leaving the account alive.
        if (canSync) await remote.deleteAccount();
        // Nothing left to send changes to.
        queueRef.current?.clear();
        if (userId) await savePending(userId, []);
        dispatch({ type: "reset-all" });
      },
      async reviewDay(day) {
        // Awaited, unlike the other writes. The day is only marked once the
        // server has it: celebrating a day that then reappears as undone on
        // the next launch would be worse than a moment's wait. The insert
        // ignores duplicates, so a second device or a double tap is a no-op.
        if (canSync) await remote.recordActiveDay(userId as string, day);
        dispatch({ type: "mark-active-day", day });
      },
      refresh: () => setRefreshKey((k) => k + 1),
      sync,
      retrySync,
    };
  }, [state, now, loading, userId, sync, retrySync]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be inside <StoreProvider>.");
  return ctx;
}

export { newId };
