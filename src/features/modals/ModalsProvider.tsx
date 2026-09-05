import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Subscription, Transaction } from "@/data/types";
import { useStore } from "@/data/store";
import { AddExpenseModal } from "./AddExpenseModal";
import { AddSubscriptionModal } from "./AddSubscriptionModal";
import { TransactionDetails } from "./TransactionDetails";

interface ModalsContextValue {
  openAddExpense: () => void;
  openDetails: (tx: Transaction) => void;
  openEditExpense: (tx: Transaction) => void;
  openAddSubscription: () => void;
  openEditSubscription: (sub: Subscription) => void;
}

const ModalsContext = createContext<ModalsContextValue | null>(null);

export function ModalsProvider({ children }: { children: ReactNode }) {
  const { deleteTransaction } = useStore();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [detailsTx, setDetailsTx] = useState<Transaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openAddExpense = useCallback(() => {
    setEditingExpense(null);
    setExpenseOpen(true);
  }, []);
  const openEditExpense = useCallback((tx: Transaction) => {
    setEditingExpense(tx);
    setExpenseOpen(true);
  }, []);
  const openDetails = useCallback((tx: Transaction) => {
    setDetailsTx(tx);
    setDetailsOpen(true);
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
    () => ({ openAddExpense, openDetails, openEditExpense, openAddSubscription, openEditSubscription }),
    [openAddExpense, openDetails, openEditExpense, openAddSubscription, openEditSubscription],
  );

  return (
    <ModalsContext.Provider value={value}>
      {children}
      <AddExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} editing={editingExpense} />
      <AddSubscriptionModal open={subOpen} onClose={() => setSubOpen(false)} editing={editingSub} />
      <TransactionDetails
        tx={detailsTx}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onEdit={(tx) => {
          setDetailsOpen(false);
          openEditExpense(tx);
        }}
        onDelete={(id) => deleteTransaction(id)}
      />
    </ModalsContext.Provider>
  );
}

export function useModals(): ModalsContextValue {
  const ctx = useContext(ModalsContext);
  if (!ctx) throw new Error("useModals must be inside <ModalsProvider>.");
  return ctx;
}
