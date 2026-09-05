import { useEffect, useState } from "react";
import { Modal, AmountField, Input, Button, useToast } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { useStore } from "@/data/store";
import type { Transaction } from "@/data/types";
import { toDateInput, fromDateInput } from "./dateInput";

export interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
}

export function AddExpenseModal({ open, onClose, editing }: AddExpenseModalProps) {
  const { data, addTransaction, updateTransaction, deleteTransaction } = useStore();
  const { toast } = useToast();

  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAmount(editing.amount);
      setCategory(editing.categoryId);
      setDate(editing.date);
      setNote(editing.note ?? "");
    } else {
      setAmount(0);
      setCategory("");
      setDate(new Date().toISOString());
      setNote("");
    }
  }, [open, editing]);

  const canSave = amount > 0;

  const handleSave = () => {
    if (!canSave) return;
    const label = category.trim() || "Expense";
    if (editing) {
      updateTransaction({ ...editing, amount, description: label, categoryId: label, date, note: note.trim() || undefined });
      toast({ message: "Expense updated" });
    } else {
      addTransaction({ amount, description: label, categoryId: label, date, note });
      toast({ message: "Expense added" });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit expense" : "Add expense"}>
      <div className="space-y-4">
        <AmountField value={amount} onChange={setAmount} autoFocus />

        <Input
          placeholder="Category"
          list="category-suggestions"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
        />
        <datalist id="category-suggestions">
          {data.categories.map((c) => (
            <option key={c.id} value={c.label} />
          ))}
        </datalist>

        <Input type="date" aria-label="Date" value={toDateInput(date)} onChange={(e) => setDate(fromDateInput(e.target.value))} />

        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />

        <Button variant="primary" size="lg" fullWidth disabled={!canSave} onClick={handleSave}>
          {editing ? "Save changes" : "Save expense"}
        </Button>

        {editing && (
          <Button
            variant="ghost"
            fullWidth
            leadingIcon={<TrashIcon size={17} />}
            onClick={() => {
              deleteTransaction(editing.id);
              toast({ message: "Expense deleted" });
              onClose();
            }}
          >
            Delete expense
          </Button>
        )}
      </div>
    </Modal>
  );
}
