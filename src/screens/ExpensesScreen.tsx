import { useMemo } from "react";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { Button, ScreenHeader, Skeleton } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { ExpenseRow } from "@/components/rows";
import { useModals } from "@/features/modals/ModalsProvider";

export function ExpensesScreen() {
  const { data, loading } = useStore();
  const money = useMoney();
  const { openAddExpense, openEditExpense } = useModals();

  const expenses = useMemo(
    () => [...data.transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [data.transactions],
  );
  const total = Money.sum(expenses.map((t) => t.amount));

  if (loading) return <ExpensesSkeleton />;

  return (
    <div className="pb-4">
      <ScreenHeader
        eyebrow={`${expenses.length} ${expenses.length === 1 ? "entry" : "entries"} · ${money.format(total)}`}
        title="Daily Expenses"
        action={
          <Button variant="primary" size="sm" pill leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={openAddExpense}>
            Add Expense
          </Button>
        }
      />

      <div className="mt-4 border-t border-line-soft">
        {expenses.length > 0 ? (
          expenses.map((t) => <ExpenseRow key={t.id} transaction={t} onClick={() => openEditExpense(t)} />)
        ) : (
          <div className="flex flex-col items-center gap-5 py-16 text-center">
            <p className="text-[15px] text-chalk-mute">You haven't logged any expenses yet.</p>
            <Button variant="primary" pill leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={openAddExpense}>
              Add your first expense
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpensesSkeleton() {
  return (
    <div className="pb-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-start justify-between pt-safe">
        <div className="space-y-2">
          <Skeleton width={120} height={11} radius="sm" />
          <Skeleton width={180} height={30} radius="sm" />
        </div>
        <Skeleton width={120} height={36} radius="full" />
      </div>
      <div className="mt-6 space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between border-b border-line-soft py-2">
            <div className="space-y-2">
              <Skeleton width={130} height={14} radius="sm" />
              <Skeleton width={80} height={11} radius="sm" />
            </div>
            <Skeleton width={60} height={16} radius="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
