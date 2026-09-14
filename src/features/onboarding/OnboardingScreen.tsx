import { useState, type ReactNode } from "react";
import { APP, STRIPE } from "@/config/app";
import { cn } from "@/lib/cn";
import { toCents } from "@/lib/money";
import { safeHttpUrl } from "@/lib/sanitize";
import { useStore } from "@/data/store";
import { useFlow } from "@/features/flow/FlowProvider";
import { LegalViewer, type LegalDocId } from "@/features/legal/Legal";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { createCheckout } from "@/lib/backend/billing";
import { Button, useToast } from "@/components/ui";
import { BarChartIcon, CheckIcon, ChevronLeftIcon, MailIcon, RepeatIcon, ShieldIcon, WalletIcon } from "@/components/icons";

type Step = "preview1" | "preview2" | "quiz" | "value" | "trust" | "pay";
const STEPS: Step[] = ["preview1", "preview2", "quiz", "value", "trust", "pay"];

export function OnboardingScreen() {
  const { subscribe, reset } = useFlow();
  const { setMonthlyBudget } = useStore();
  const { toast } = useToast();
  const [i, setI] = useState(0);
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);
  const step = STEPS[i];

  const planPrice = plan === "yearly" ? STRIPE.yearlyPrice : STRIPE.monthlyPrice;
  const planPeriod = plan === "yearly" ? "year" : "month";

  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : subscribe(plan));
  // Back one step; from the very first step, back out to sign-up.
  const prev = () => (i > 0 ? setI(i - 1) : reset());
  const skipToPaywall = () => setI(STEPS.indexOf("value"));

  const startTrial = async () => {
    // Connected mode: create a Stripe Checkout Session via the Edge Function.
    if (isSupabaseConfigured) {
      try {
        const url = await createCheckout(plan);
        window.location.assign(url);
        return;
      } catch (e) {
        toast({ message: (e as Error)?.message || "Couldn't start checkout." });
        return;
      }
    }
    // Otherwise, if a static Stripe Payment Link is configured, use it (https only).
    const link = safeHttpUrl(plan === "yearly" ? STRIPE.yearlyPaymentLink : STRIPE.monthlyPaymentLink);
    if (link) {
      try {
        window.location.assign(link);
        return;
      } catch {
        /* fall through */
      }
    }
    // Local demo — start the free trial and go straight into the app.
    subscribe(plan);
  };

  return (
    <div className="app-shell flex min-h-full flex-col px-6 pb-8 pt-safe">
      {/* back + progress */}
      <div className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={prev}
          aria-label="Go back"
          className="-ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-chalk-mute transition-colors hover:bg-ink-800 hover:text-chalk"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <div className="flex flex-1 items-center gap-1.5">
          {STEPS.map((s, idx) => (
            <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors", idx <= i ? "bg-chalk" : "bg-ink-700")} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center py-4">
        {step === "preview1" && (
          <Hero icon={<WalletIcon size={30} />} title="Log spending in seconds" body="Add an expense with just an amount and a tap. No clutter, no friction." />
        )}
        {step === "preview2" && (
          <Hero icon={<BarChartIcon size={30} />} title="See where your money goes" body="A clear monthly picture and a category breakdown — always up to date." />
        )}
        {step === "quiz" && <BudgetQuiz onPick={(cents) => { setMonthlyBudget(cents); next(); }} onSkip={next} />}
        {step === "value" && (
          <Paywall
            eyebrow="What you get"
            title={`Everything in ${APP.name}`}
            rows={[
              { icon: <WalletIcon size={18} />, text: "Unlimited expenses & subscriptions" },
              { icon: <BarChartIcon size={18} />, text: "Category reports & monthly trends" },
              { icon: <MailIcon size={18} />, text: "Auto-import purchases from Gmail" },
              { icon: <RepeatIcon size={18} />, text: "Renewal reminders so nothing slips" },
            ]}
          />
        )}
        {step === "trust" && (
          <Paywall
            eyebrow="Built for trust"
            title="Your money, private by design"
            rows={[
              { icon: <ShieldIcon size={18} />, text: "Your data stays yours — never sold" },
              { icon: <CheckIcon size={18} />, text: "Cancel anytime, right from Settings" },
              { icon: <CheckIcon size={18} />, text: "7-day free trial — no charge today" },
              { icon: <CheckIcon size={18} />, text: "Loved by people taking control of spending" },
            ]}
          />
        )}
        {step === "pay" && <PlanChooser plan={plan} onPlan={setPlan} />}
      </div>

      {/* actions */}
      <div className="space-y-3">
        {step !== "quiz" && (
          <Button variant="primary" size="lg" fullWidth onClick={step === "pay" ? startTrial : next}>
            {step === "pay" ? `Start ${STRIPE.trialDays}-day free trial` : "Continue"}
          </Button>
        )}
        {(step === "preview1" || step === "preview2") && (
          <button type="button" onClick={skipToPaywall} className="mx-auto block text-[13px] font-medium text-chalk-mute hover:text-chalk">
            Skip
          </button>
        )}
        {step === "pay" && (
          <div className="space-y-2 pt-1">
            <p className="text-center text-[11px] leading-relaxed text-chalk-faint">
              {STRIPE.trialDays}-day free trial, then {planPrice}/{planPeriod}. Your subscription auto-renews at {planPrice}/
              {planPeriod} until canceled — manage or cancel anytime in Settings, at least 24 hours before the period ends.
              Payment is charged at confirmation of purchase.
            </p>
            <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-chalk-mute">
              <button type="button" onClick={() => setLegalDoc("terms")} className="underline underline-offset-2 hover:text-chalk">
                Terms of Use
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => setLegalDoc("privacy")} className="underline underline-offset-2 hover:text-chalk">
                Privacy Policy
              </button>
            </div>
          </div>
        )}
      </div>

      {legalDoc && <LegalViewer doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}

function Hero({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-ink-800 text-chalk ring-1 ring-line">{icon}</span>
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">{title}</h1>
      <p className="mx-auto mt-3 max-w-[20rem] text-[15px] leading-relaxed text-chalk-mute">{body}</p>
    </div>
  );
}

function Paywall({ eyebrow, title, rows }: { eyebrow: string; title: string; rows: { icon: ReactNode; text: string }[] }) {
  return (
    <div>
      <p className="text-eyebrow uppercase text-chalk-faint">{eyebrow}</p>
      <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">{title}</h1>
      <ul className="mt-7 space-y-4">
        {rows.map((r, idx) => (
          <li key={idx} className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-chalk ring-1 ring-line">{r.icon}</span>
            <span className="text-[15px] text-chalk">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BudgetQuiz({ onPick, onSkip }: { onPick: (cents: number) => void; onSkip: () => void }) {
  const [val, setVal] = useState("");
  const num = Math.max(0, Number(val.replace(/[^\d.]/g, "")) || 0);
  return (
    <div className="text-center">
      <p className="text-eyebrow uppercase text-chalk-faint">Quick setup</p>
      <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">What's your monthly budget?</h1>
      <p className="mx-auto mt-3 max-w-[18rem] text-[15px] text-chalk-mute">Enter your own amount — you can change it anytime in Settings.</p>

      <div className="mx-auto mt-8 flex max-w-[16rem] items-center justify-center gap-1 border-b border-line-strong pb-3">
        <span className="text-4xl font-semibold text-chalk">$</span>
        <input
          inputMode="decimal"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          aria-label="Monthly budget"
          className="w-full min-w-0 bg-transparent text-center text-4xl font-semibold tracking-tight text-chalk tnum placeholder:text-chalk-faint focus:outline-none"
        />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {[1000, 2000, 3000, 5000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVal(String(v))}
            className="rounded-pill border border-line-strong px-4 py-1.5 text-[13px] font-medium tabular-nums text-chalk-mute transition-colors hover:text-chalk"
          >
            ${v.toLocaleString("en-US")}
          </button>
        ))}
      </div>

      <Button variant="primary" size="lg" fullWidth className="mt-8" disabled={num <= 0} onClick={() => onPick(toCents(num))}>
        Continue
      </Button>
      <button type="button" onClick={onSkip} className="mt-4 text-[13px] font-medium text-chalk-mute hover:text-chalk">
        Decide later
      </button>
    </div>
  );
}

function PlanChooser({ plan, onPlan }: { plan: "monthly" | "yearly"; onPlan: (p: "monthly" | "yearly") => void }) {
  return (
    <div>
      <p className="text-eyebrow uppercase text-chalk-faint">Choose your plan</p>
      <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">Start your free trial</h1>
      <div className="mt-7 space-y-3">
        <PlanCard active={plan === "yearly"} onClick={() => onPlan("yearly")} name="Yearly" price="$39.99 / year" note="Best value · 2 months free" badge="Save 33%" />
        <PlanCard active={plan === "monthly"} onClick={() => onPlan("monthly")} name="Monthly" price="$4.99 / month" note="Flexible, cancel anytime" />
      </div>
    </div>
  );
}

function PlanCard({ active, onClick, name, price, note, badge }: { active: boolean; onClick: () => void; name: string; price: string; note: string; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-card border p-4 text-left transition-colors",
        active ? "border-chalk bg-ink-800" : "border-line-strong bg-ink-850 hover:bg-ink-800",
      )}
    >
      <span>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-chalk">{name}</span>
          {badge && <span className="rounded-pill bg-chalk px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-950">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] text-chalk-mute">{note}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="text-[15px] font-semibold tabular-nums text-chalk">{price}</span>
        <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full border", active ? "border-chalk bg-chalk text-ink-950" : "border-line-strong text-transparent")}>
          <CheckIcon size={13} />
        </span>
      </span>
    </button>
  );
}
