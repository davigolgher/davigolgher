import { useEffect, useState } from "react";
import { Modal, AmountField, Input, Button, Segmented, useToast } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import type { Transaction } from "@/data/types";
import { toDateInput, fromDateInput } from "./dateInput";

export interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
}

type Dir = "expense" | "income";

export function AddExpenseModal({ open, onClose, editing }: AddExpenseModalProps) {
  const { data, addTransaction, updateTransaction, deleteTransaction } = useStore();
  const { toast } = useToast();

  const [direction, setDirection] = useState<Dir>("expense");
  const [amount, setAmount] = useState(0);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDirection(editing.direction);
      setAmount(editing.amount);
      setMerchant(editing.merchant ?? "");
      setCategory(editing.categoryId);
      setDate(editing.date);
      setNote(editing.note ?? "");
    } else {
      setDirection("expense");
      setAmount(0);
      setMerchant("");
      setCategory("");
      setDate(new Date().toISOString());
      setNote("");
    }
  }, [open, editing]);

  const isIncome = direction === "income";
  const canSave = amount > 0;

  const handleSave = () => {
    if (!canSave) return;
    const label = category.trim() || (isIncome ? "Income" : "Expense");
    const fields = {
      amount,
      direction,
      description: label,
      categoryId: label,
      date,
      note: note.trim() || undefined,
      merchant: merchant.trim() || undefined,
    };
    if (editing) {
      updateTransaction({ ...editing, ...fields });
      toast({ message: isIncome ? "Income updated" : "Expense updated" });
    } else {
      addTransaction(fields);
      toast({ message: isIncome ? "Income added" : "Expense added" });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit transaction" : isIncome ? "Add income" : "Add expense"}>
      <div className="space-y-4">
        <Segmented
          aria-label="Type"
          options={[
            { value: "expense", label: "Expense" },
            { value: "income", label: "Income" },
          ]}
          value={direction}
          onChange={(v) => setDirection(v as Dir)}
        />

        <AmountField value={amount} onChange={setAmount} autoFocus />

        <Input
          placeholder={isIncome ? "From (source)" : "To whom (merchant)"}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          aria-label={isIncome ? "Source" : "Merchant"}
        />

        <div>
          <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" />
          {data.categories.length > 0 && (
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
              {data.categories.map((c) => {
                const active = category.trim().toLowerCase() === c.label.toLowerCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(c.label)}
                    className={cn(
                      "shrink-0 rounded-pill border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                      active ? "border-transparent bg-chalk text-ink-950" : "border-line-strong text-chalk-mute hover:text-chalk",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Input type="date" aria-label="Date" value={toDateInput(date)} onChange={(e) => setDate(fromDateInput(e.target.value))} />

        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />

        <Button variant="primary" size="lg" fullWidth disabled={!canSave} onClick={handleSave}>
          {editing ? "Save changes" : isIncome ? "Save income" : "Save expense"}
        </Button>

        {editing && (
          <Button
            variant="ghost"
            fullWidth
            leadingIcon={<TrashIcon size={17} />}
            onClick={() => {
              deleteTransaction(editing.id);
              toast({ message: "Deleted" });
              onClose();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </Modal>
  );
}
