import { useState } from "react";
import { useStore } from "@/data/store";
import { toCents, toMain } from "@/lib/money";
import { CURRENCIES } from "@/data/currencies";
import { Alert, Button, Input, ScreenHeader, Select, useToast } from "@/components/ui";
import { CheckIcon, CloseIcon, LogOutIcon, MailIcon, PlusIcon } from "@/components/icons";

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-3 text-eyebrow uppercase text-chalk-faint">{children}</p>;
}

export function SettingsScreen() {
  const { data, importing, setMonthlyBudget, setCurrency, addCategory, removeCategory, connectGmail, disconnectGmail, importFromGmail } =
    useStore();
  const { toast } = useToast();

  const currentBudget = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const [budget, setBudget] = useState(String(toMain(currentBudget)));
  const [category, setCategory] = useState("");
  const gmail = data.preferences.gmailConnected;

  const saveBudget = () => {
    setMonthlyBudget(toCents(Math.max(0, Number(budget) || 0)));
    toast({ message: "Budget saved", icon: <CheckIcon size={18} /> });
  };

  const addNewCategory = () => {
    const name = category.trim();
    if (!name) return;
    addCategory(name);
    setCategory("");
  };

  return (
    <div className="space-y-10 pb-4">
      <ScreenHeader eyebrow="Preferences" title="Settings" />

      <section>
        <SectionLabel>Monthly budget</SectionLabel>
        <div className="flex items-stretch gap-3">
          <Input type="number" inputMode="decimal" min={0} aria-label="Monthly budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <Button variant="primary" onClick={saveBudget} className="px-6">
            Save
          </Button>
        </div>
      </section>

      <section>
        <SectionLabel>Currency</SectionLabel>
        <Select
          aria-label="Currency"
          value={data.preferences.currency}
          onChange={(e) => setCurrency(e.target.value)}
          options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.label} (${c.symbol})` }))}
        />
      </section>

      <section>
        <SectionLabel>Categories</SectionLabel>
        <form
          className="flex items-stretch gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addNewCategory();
          }}
        >
          <Input placeholder="New category" aria-label="New category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Button type="submit" variant="secondary" className="px-6">
            Add
          </Button>
        </form>
        {data.categories.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {data.categories.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-2 rounded-pill bg-ink-800 py-1.5 pl-3.5 pr-2 text-[13px] text-chalk">
                {c.label}
                <button
                  type="button"
                  aria-label={`Remove ${c.label}`}
                  onClick={() => removeCategory(c.id)}
                  className="rounded-full p-0.5 text-chalk-mute transition-colors hover:text-chalk"
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-chalk-mute">No categories yet.</p>
        )}
      </section>

      <section>
        <SectionLabel>Gmail import</SectionLabel>
        {gmail ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[15px] text-chalk">
              <MailIcon size={18} className="text-chalk-mute" /> Gmail connected
            </div>
            <div className="flex gap-3">
              <Button variant="primary" leadingIcon={<PlusIcon size={17} strokeWidth={2.2} />} loading={importing} onClick={importFromGmail}>
                {importing ? "Importing…" : "Import purchases"}
              </Button>
              <Button variant="ghost" onClick={disconnectGmail}>
                Disconnect
              </Button>
            </div>
            <Alert title="Demo import">
              This pulls sample purchases to show the flow. Real Gmail access requires a backend (Gmail API + OAuth).
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[15px] text-chalk-mute">Automatically turn purchase receipt emails into expenses.</p>
            <Button
              variant="secondary"
              leadingIcon={<MailIcon size={18} />}
              onClick={() => {
                connectGmail();
                toast({ message: "Gmail connected (demo)" });
              }}
            >
              Connect Gmail
            </Button>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => toast({ message: "Sign out needs an auth backend (coming with Supabase)." })}
        className="flex items-center gap-2.5 text-[15px] text-chalk-mute transition-colors hover:text-chalk"
      >
        <LogOutIcon size={18} /> Sign out
      </button>
    </div>
  );
}
