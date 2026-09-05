import { cn } from "@/lib/cn";
import { useMoney } from "@/lib/useMoney";
import { formatDateMedium, formatTime } from "@/lib/format";
import { daysUntil, FREQUENCY_LABEL } from "@/lib/recurrence";
import { MailIcon } from "@/components/icons";
import type { Subscription, Transaction } from "@/data/types";

/** Transaction row: who + category + time on the left, price on the right. */
export function ExpenseRow({ transaction, onClick }: { transaction: Transaction; onClick?: () => void }) {
  const money = useMoney();
  const isIncome = transaction.direction === "income";
  const title = transaction.merchant || transaction.categoryId;
  const meta = [
    transaction.merchant ? transaction.categoryId : null,
    `${formatDateMedium(transaction.date)}, ${formatTime(transaction.date)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center justify-between gap-4 border-b border-line-soft py-4 text-left last:border-0",
        onClick && "transition-opacity duration-150 hover:opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-chalk">{title}</span>
          {transaction.source === "gmail" && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-ink-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-chalk-mute">
              <MailIcon size={11} /> Gmail
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-chalk-mute">{meta}</span>
      </span>
      <span className={cn("shrink-0 text-[15px] font-semibold tabular-nums", isIncome ? "text-chalk-soft" : "text-chalk")}>
        {isIncome ? "+" : "−"}
        {money.format(transaction.amount)}
      </span>
    </button>
  );
}

/** Subscription row: name + cadence/next charge, amount on the right. */
export function SubRow({ subscription, onClick, now = new Date() }: { subscription: Subscription; onClick?: () => void; now?: Date }) {
  const money = useMoney();
  const d = daysUntil(subscription.nextChargeAt, now);
  const when = d < 0 ? "Overdue" : d === 0 ? "Renews today" : d === 1 ? "Renews tomorrow" : `Renews in ${d} days`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center justify-between gap-4 border-b border-line-soft py-4 text-left last:border-0",
        onClick && "transition-opacity duration-150 hover:opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="truncate text-[15px] font-semibold text-chalk">{subscription.name}</span>
        <span className="mt-0.5 block text-[13px] text-chalk-mute">
          {FREQUENCY_LABEL[subscription.frequency]} · {when}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-chalk">{money.format(subscription.amount)}</span>
    </button>
  );
}
