import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Modal, AmountField, Input, Button, Segmented, useToast } from "@/components/ui";
import { CloseIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import type { Receipt, Transaction } from "@/data/types";
import { validateUpload, readAsDataUrl } from "@/lib/upload";
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
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUploadErr(null);
    if (editing) {
      setDirection(editing.direction);
      setAmount(editing.amount);
      setMerchant(editing.merchant ?? "");
      setCategory(editing.categoryId);
      setDate(editing.date);
      setNote(editing.note ?? "");
      setReceipt(editing.receipt ?? null);
    } else {
      setDirection("expense");
      setAmount(0);
      setMerchant("");
      setCategory("");
      setDate(new Date().toISOString());
      setNote("");
      setReceipt(null);
    }
  }, [open, editing]);

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after removal
    if (!file) return;
    setUploadErr(null);
    const check = await validateUpload(file);
    if (!check.ok) {
      setUploadErr(check.error);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setReceipt({ name: check.name, type: check.type, dataUrl });
    } catch {
      setUploadErr("Couldn't read that file.");
    }
  };

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
      receipt: receipt ?? undefined,
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

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={onPickFile}
          />
          {receipt ? (
            <div className="flex items-center gap-3 rounded-field border border-line-strong bg-ink-850 p-3">
              {receipt.type.startsWith("image/") ? (
                <img src={receipt.dataUrl} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-ink-800 text-[10px] font-semibold text-chalk-mute">PDF</span>
              )}
              <span className="min-w-0 flex-1 truncate text-[14px] text-chalk">{receipt.name}</span>
              <button
                type="button"
                aria-label="Remove receipt"
                onClick={() => setReceipt(null)}
                className="shrink-0 rounded-full p-1 text-chalk-mute transition-colors hover:text-chalk"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          ) : (
            <Button type="button" variant="secondary" fullWidth leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} onClick={() => fileRef.current?.click()}>
              Attach receipt (optional)
            </Button>
          )}
          {uploadErr && <p className="mt-1.5 text-[12px] text-chalk-soft">{uploadErr}</p>}
          <p className="mt-1.5 text-[12px] text-chalk-faint">JPG, PNG, WEBP or PDF · up to 8 MB.</p>
        </div>

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
