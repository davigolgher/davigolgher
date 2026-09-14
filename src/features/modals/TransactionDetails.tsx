import { BottomSheet, Button } from "@/components/ui";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { useMoney } from "@/lib/useMoney";
import { formatTime } from "@/lib/format";
import type { Transaction } from "@/data/types";

export interface TransactionDetailsProps {
  tx: Transaction | null;
  open: boolean;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft py-3.5 last:border-0">
      <span className="text-[13px] text-chalk-mute">{label}</span>
      <span className="text-right text-[15px] text-chalk">{value}</span>
    </div>
  );
}

export function TransactionDetails({ tx, open, onClose, onEdit, onDelete }: TransactionDetailsProps) {
  const money = useMoney();
  if (!tx) return <BottomSheet open={open} onClose={onClose} title="Transaction" children={null} />;

  const isIncome = tx.direction === "income";
  const longDate = new Intl.DateTimeFormat(money.locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(tx.date),
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Transaction details">
      <div className="mb-4 text-center">
        <p className="text-[2.5rem] font-semibold leading-none tracking-tight text-chalk tnum">
          {isIncome ? "+" : "−"}
          {money.format(tx.amount)}
        </p>
        {tx.merchant && <p className="mt-2 text-[15px] text-chalk-mute">{tx.merchant}</p>}
      </div>

      <div className="rounded-card-sm border border-line bg-ink-850 px-4">
        <Row label="Type" value={isIncome ? "Income" : "Expense"} />
        <Row label="Category" value={tx.categoryId} />
        <Row label="Date" value={`${longDate}, ${formatTime(tx.date, money.locale)}`} />
        {tx.merchant && <Row label={isIncome ? "From" : "To"} value={tx.merchant} />}
        {tx.note && <Row label="Note" value={tx.note} />}
        {tx.source === "gmail" && <Row label="Source" value="Imported from Gmail" />}
      </div>

      {tx.receipt && (
        <div className="mt-4">
          <p className="mb-2 text-eyebrow uppercase text-chalk-faint">Receipt</p>
          {tx.receipt.type.startsWith("image/") ? (
            <img src={tx.receipt.dataUrl} alt="Receipt" className="w-full rounded-card-sm border border-line" />
          ) : (
            <div className="flex items-center gap-3 rounded-card-sm border border-line bg-ink-850 p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-ink-800 text-[10px] font-semibold text-chalk-mute">PDF</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-chalk">{tx.receipt.name}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <Button
          variant="ghost"
          fullWidth
          leadingIcon={<TrashIcon size={17} />}
          onClick={() => {
            onDelete(tx.id);
            onClose();
          }}
        >
          Delete
        </Button>
        <Button
          variant="primary"
          fullWidth
          leadingIcon={<PencilIcon size={17} />}
          onClick={() => {
            onEdit(tx);
          }}
        >
          Edit
        </Button>
      </div>
    </BottomSheet>
  );
}
