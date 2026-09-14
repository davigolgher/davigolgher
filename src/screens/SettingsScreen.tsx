import { useState } from "react";
import { APP, STRIPE } from "@/config/app";
import { useStore } from "@/data/store";
import { toCents, toMain } from "@/lib/money";
import { cn } from "@/lib/cn";
import { CURRENCIES } from "@/data/currencies";
import { Alert, BottomSheet, Button, Input, ScreenHeader, Select, Switch, useToast } from "@/components/ui";
import { BellIcon, CheckIcon, ChevronRightIcon, CloseIcon, LogOutIcon, MailIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useFlow } from "@/features/flow/FlowProvider";
import { GmailConnect } from "@/features/gmail/GmailConnect";
import { LegalViewer, type LegalDocId } from "@/features/legal/Legal";

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-3 text-eyebrow uppercase text-chalk-faint">{children}</p>;
}

export function SettingsScreen() {
  const { data, importing, setMonthlyBudget, setCurrency, addCategory, removeCategory, connectGmail, disconnectGmail, importFromGmail, deleteAccount } =
    useStore();
  const { toast } = useToast();
  const flow = useFlow();

  const currentBudget = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const [budget, setBudget] = useState(String(toMain(currentBudget)));
  const [category, setCategory] = useState("");
  const [gmailOpen, setGmailOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const gmail = data.preferences.gmailConnected;

  const LEGAL_ROWS: [LegalDocId, string][] = [
    ["nutrition", "Privacy nutrition label"],
    ["privacy", "Privacy policy"],
    ["terms", "Terms of service"],
    ["ai", "AI disclosure"],
  ];
  const planLabel = flow.plan === "monthly" ? `${STRIPE.monthlyPrice}/month` : `${STRIPE.yearlyPrice}/year`;

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
            <Button variant="secondary" leadingIcon={<MailIcon size={18} />} onClick={() => setGmailOpen(true)}>
              Connect Gmail
            </Button>
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Reminders</SectionLabel>
        <div className="space-y-3">
          <Switch
            label="Daily spending reminder"
            description="A gentle nudge to log your expenses."
            checked={flow.reminders}
            onChange={(on) => {
              flow.setReminders(on);
              toast({ message: on ? "Reminders on" : "Reminders off", icon: <BellIcon size={18} /> });
            }}
          />
          <Alert title="On device">
            Push notifications (like Duolingo's) are delivered by the installed app — they turn on with the native build
            (Expo push + your backend). This toggle saves your preference for then.
          </Alert>
        </div>
      </section>

      <section>
        <SectionLabel>Subscription</SectionLabel>
        <div className="space-y-3">
          <div className="rounded-card border border-line bg-ink-850 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-chalk">{APP.name} Premium</p>
                <p className="mt-0.5 text-[13px] text-chalk-mute">
                  {planLabel} · {STRIPE.trialDays}-day free trial
                </p>
              </div>
              <span className="shrink-0 rounded-pill bg-ink-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-chalk-mute ring-1 ring-line">
                Trial
              </span>
            </div>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] text-chalk-faint">
              Billing secured by <span className="font-semibold text-chalk-mute">Stripe</span>.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => toast({ message: "No purchases to restore" })}>
              Restore purchases
            </Button>
            <Button variant="secondary" fullWidth onClick={() => toast({ message: "Manage in App Store · Subscriptions" })}>
              Manage subscription
            </Button>
          </div>
          <Alert title="Managing your subscription">
            In the App Store build, subscriptions are managed and canceled in App Store · Subscriptions, and{" "}
            <span className="font-semibold text-chalk-mute">Restore purchases</span> re-links a prior purchase via StoreKit.
            (A web/Stripe subscription is managed in the Stripe customer portal via the backend.)
          </Alert>
        </div>
      </section>

      <section>
        <SectionLabel>Legal &amp; privacy</SectionLabel>
        <div className="overflow-hidden rounded-card border border-line bg-ink-850">
          {LEGAL_ROWS.map(([id, label], idx) => (
            <button
              key={id}
              type="button"
              onClick={() => setLegalDoc(id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] text-chalk transition-colors hover:bg-ink-800",
                idx < LEGAL_ROWS.length - 1 && "border-b border-line-soft",
              )}
            >
              {label}
              <ChevronRightIcon size={18} className="shrink-0 text-chalk-faint" />
            </button>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>Account</SectionLabel>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => flow.reset()}
            className="flex items-center gap-2.5 text-[15px] text-chalk-mute transition-colors hover:text-chalk"
          >
            <LogOutIcon size={18} /> Sign out
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2.5 text-[15px] text-chalk-soft transition-colors hover:text-chalk"
          >
            <TrashIcon size={18} /> Delete account
          </button>
          <Alert title="Deleting your account">
            Removes your transactions, subscriptions, budgets, categories, and settings from this device — permanently. Real
            server-side deletion is handled by the backend when it is connected.
          </Alert>
        </div>
      </section>

      <GmailConnect
        open={gmailOpen}
        email={flow.email}
        onClose={() => setGmailOpen(false)}
        onAllow={() => {
          setGmailOpen(false);
          connectGmail();
          importFromGmail();
          toast({ message: "Gmail connected", icon: <CheckIcon size={18} /> });
        }}
      />

      <BottomSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete account?"
        description="This permanently erases everything on this device — transactions, subscriptions, budgets, categories, and settings. This can't be undone."
      >
        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-chalk-mute">
            If you have a paid subscription, cancel it in App Store · Subscriptions first — deleting your account here won't
            stop App Store billing.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            leadingIcon={<TrashIcon size={17} />}
            onClick={() => {
              setConfirmDelete(false);
              deleteAccount();
              flow.reset();
              toast({ message: "Account deleted" });
            }}
          >
            Delete everything
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      </BottomSheet>

      {legalDoc && <LegalViewer doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
