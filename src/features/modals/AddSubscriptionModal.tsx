import { useEffect, useState } from "react";
import { Modal, AmountField, Input, Button, Segmented, useToast } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { useStore } from "@/data/store";
import type { Subscription } from "@/data/types";
import { toDateInput, fromDateInput } from "./dateInput";

export interface AddSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Subscription | null;
}

type Freq = "monthly" | "yearly";

export function AddSubscriptionModal({ open, onClose, editing }: AddSubscriptionModalProps) {
  const { data, addSubscription, updateSubscription, deleteSubscription } = useStore();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [frequency, setFrequency] = useState<Freq>("monthly");
  const [date, setDate] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setAmount(editing.amount);
      setFrequency(editing.frequency === "yearly" ? "yearly" : "monthly");
      setDate(editing.nextChargeAt);
    } else {
      setName("");
      setAmount(0);
      setFrequency("monthly");
      setDate(new Date().toISOString());
    }
  }, [open, editing]);

  const canSave = amount > 0 && name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const base = {
      name: name.trim(),
      amount,
      currency: data.preferences.currency,
      frequency,
      nextChargeAt: date,
      categoryId: "Subscriptions",
      reminders: false,
    };
    if (editing) {
      updateSubscription({ ...editing, ...base });
      toast({ message: "Subscription updated" });
    } else {
      addSubscription({ ...base, status: "active" });
      toast({ message: "Subscription added" });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit subscription" : "Add subscription"}>
      <div className="space-y-4">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" autoFocus />

        <AmountField value={amount} onChange={setAmount} />

        <Segmented
          aria-label="Billing period"
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
          value={frequency}
          onChange={setFrequency}
        />

        <Input type="date" aria-label="Next charge" value={toDateInput(date)} onChange={(e) => setDate(fromDateInput(e.target.value))} />

        <Button variant="primary" size="lg" fullWidth disabled={!canSave} onClick={handleSave}>
          {editing ? "Save changes" : "Save subscription"}
        </Button>

        {editing && (
          <Button
            variant="ghost"
            fullWidth
            leadingIcon={<TrashIcon size={17} />}
            onClick={() => {
              deleteSubscription(editing.id);
              toast({ message: "Subscription removed" });
              onClose();
            }}
          >
            Remove subscription
          </Button>
        )}
      </div>
    </Modal>
  );
}
