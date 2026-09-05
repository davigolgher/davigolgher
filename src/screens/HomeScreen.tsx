import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { incomeThisMonth, savingsThisMonth, totalThisMonth } from "@/lib/calc";
import { Button, ScreenHeader, StatCard, Skeleton } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { ExpenseRow } from "@/components/rows";
import { StreakCard } from "@/components/StreakCard";
import { useModals } from "@/features/modals/ModalsProvider";

export function HomeScreen() {
  const { data, now, loading } = useStore();
  const money = useMoney();
  const { openAddExpense, openDetails } = useModals();

  if (loading) return <HomeSkeleton />;

  const txs = data.transactions;
  const spent = totalThisMonth(txs, now);
  const income = incomeThisMonth(txs, now);
  const savings = savingsThisMonth(txs, now);
  const budget = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const remaining = Money.clampMin(Money.subtract(budget, spent));
  const recent = [...txs].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);

  return (
    <div className="space-y-8 pb-4">
      <ScreenHeader
        eyebrow="Overview"
        title="This month"
        action={
          <Button variant="primary" size="sm" pill leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={openAddExpense}>
            Add Expense
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Income" value={money.format(income)} />
        <StatCard label="Spent" value={money.format(spent)} />
        <StatCard label="Savings" value={money.format(savings)} sub={savings < 0 ? "Spending over income" : "Income − spending"} />
        <StatCard label="Remaining budget" value={money.format(remaining)} sub={`of ${money.format(budget)}`} />
      </div>

      <StreakCard />

      <section>
        <p className="mb-1 text-eyebrow uppercase text-chalk-faint">Recent</p>
        {recent.length > 0 ? (
          <div>
            {recent.map((t) => (
              <ExpenseRow key={t.id} transaction={t} onClick={() => openDetails(t)} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-[15px] text-chalk-mute">No transactions yet. Add one to get started.</p>
        )}
      </section>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-8 pb-4" aria-busy="true" aria-label="Loading">
      <div className="flex items-start justify-between pt-safe">
        <div className="space-y-2">
          <Skeleton width={80} height={11} radius="sm" />
          <Skeleton width={160} height={30} radius="sm" />
        </div>
        <Skeleton width={120} height={36} radius="full" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-line bg-ink-850 p-5">
            <Skeleton width={90} height={10} radius="sm" />
            <Skeleton className="mt-3" width="70%" height={26} radius="sm" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton width={64} height={11} radius="sm" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between border-b border-line-soft py-2">
            <div className="space-y-2">
              <Skeleton width={120} height={14} radius="sm" />
              <Skeleton width={80} height={11} radius="sm" />
            </div>
            <Skeleton width={60} height={16} radius="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
