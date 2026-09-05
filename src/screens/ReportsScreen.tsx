import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { totalThisMonth, activeSubscriptions, subscriptionsMonthlyTotal } from "@/lib/calc";
import { categoryBreakdown, monthlyTotals } from "@/lib/reports";
import { currencyByCode } from "@/data/currencies";
import { cn } from "@/lib/cn";
import { ScreenHeader, DashedEmpty, Skeleton } from "@/components/ui";
import { FREQUENCY_LABEL } from "@/lib/recurrence";

/** A single labeled horizontal bar (monochrome). Value is text, not color-only. */
function BarRow({ label, value, pct, barPct, thin }: { label: string; value: string; pct?: number; barPct: number; thin?: boolean }) {
  return (
    <div role="img" aria-label={`${label}: ${value}${pct != null ? `, ${pct}%` : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[15px] font-medium text-chalk">{label}</span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-chalk">
          {value}
          {pct != null && <span className="ml-1.5 text-[13px] font-normal text-chalk-mute">{pct}%</span>}
        </span>
      </div>
      <div className={cn("mt-2 w-full overflow-hidden rounded-pill bg-ink-750", thin ? "h-1" : "h-2")} aria-hidden="true">
        <div className="h-full rounded-pill bg-chalk transition-[width] duration-500 ease-premium" style={{ width: `${Math.max(2, barPct)}%` }} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-4 text-eyebrow uppercase text-chalk-faint">{children}</p>;
}

export function ReportsScreen() {
  const { data, now, loading } = useStore();
  const money = useMoney();
  const { locale } = currencyByCode(data.preferences.currency);

  const spent = totalThisMonth(data.transactions, now);
  const months = monthlyTotals(data.transactions, locale);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const categories = categoryBreakdown(data.transactions, now);
  const subs = activeSubscriptions(data.subscriptions);
  const subsMonthly = subscriptionsMonthlyTotal(data.subscriptions);
  const maxSub = Math.max(1, ...subs.map((x) => x.amount));

  if (loading) return <ReportsSkeleton />;

  return (
    <div className="space-y-10 pb-4">
      <ScreenHeader eyebrow={`${money.format(spent)} spent this month`} title="Reports" />

      <section>
        <SectionLabel>Monthly spending</SectionLabel>
        {months.length > 0 ? (
          <div className="space-y-6">
            {months.map((m) => (
              <BarRow key={m.key} label={m.label} value={money.format(m.total)} barPct={(m.total / maxMonth) * 100} thin />
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-chalk-mute">No spending yet.</p>
        )}
      </section>

      <section>
        <SectionLabel>Spending by category</SectionLabel>
        {categories.length > 0 ? (
          <div className="space-y-6">
            {categories.map((c) => (
              <BarRow key={c.category} label={c.category} value={money.format(c.total)} pct={c.pct} barPct={c.pct} />
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-chalk-mute">No spending yet.</p>
        )}
      </section>

      <section>
        <SectionLabel>Subscription costs</SectionLabel>
        {subs.length > 0 ? (
          <div>
            <div className="space-y-6">
              {subs.map((s) => (
                <BarRow key={s.id} label={`${s.name} · ${FREQUENCY_LABEL[s.frequency]}`} value={money.format(s.amount)} barPct={(s.amount / maxSub) * 100} thin />
              ))}
            </div>
            <p className="mt-6 border-t border-line-soft pt-4 text-[13px] text-chalk-mute">
              Total <span className="font-semibold text-chalk">{money.format(subsMonthly)}</span> per month
            </p>
          </div>
        ) : (
          <DashedEmpty>No active subscriptions.</DashedEmpty>
        )}
      </section>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-10 pb-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 pt-safe">
        <Skeleton width={160} height={11} radius="sm" />
        <Skeleton width={140} height={30} radius="sm" />
      </div>
      {[0, 1].map((s) => (
        <div key={s} className="space-y-5">
          <Skeleton width={140} height={11} radius="sm" />
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton width={100} height={14} radius="sm" />
                <Skeleton width={70} height={14} radius="sm" />
              </div>
              <Skeleton height={6} radius="full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
