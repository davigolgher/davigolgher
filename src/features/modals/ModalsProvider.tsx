import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Subscription, Transaction } from "@/data/types";
import { AddExpenseModal } from "./AddExpenseModal";
import { AddSubscriptionModal } from "./AddSubscriptionModal";

interface ModalsContextValue {
  openAddExpense: () => void;
  openEditExpense: (tx: Transaction) => void;
  openAddSubscription: () => void;
  openEditSubscription: (sub: Subscription) => void;
}

const ModalsContext = createContext<ModalsContextValue | null>(null);

export function ModalsProvider({ children }: { children: ReactNode }) {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  const openAddExpense = useCallback(() => {
    setEditingExpense(null);
    setExpenseOpen(true);
  }, []);
  const openEditExpense = useCallback((tx: Transaction) => {
    setEditingExpense(tx);
    setExpenseOpen(true);
  }, []);
  const openAddSubscription = useCallback(() => {
    setEditingSub(null);
    setSubOpen(true);
  }, []);
  const openEditSubscription = useCallback((sub: Subscription) => {
    setEditingSub(sub);
    setSubOpen(true);
  }, []);

  const value = useMemo(
    () => ({ openAddExpense, openEditExpense, openAddSubscription, openEditSubscription }),
    [openAddExpense, openEditExpense, openAddSubscription, openEditSubscription],
  );

  return (
    <ModalsContext.Provider value={value}>
      {children}
      <AddExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} editing={editingExpense} />
      <AddSubscriptionModal open={subOpen} onClose={() => setSubOpen(false)} editing={editingSub} />
    </ModalsContext.Provider>
  );
}

export function useModals(): ModalsContextValue {
  const ctx = useContext(ModalsContext);
  if (!ctx) throw new Error("useModals must be inside <ModalsProvider>.");
  return ctx;
}
