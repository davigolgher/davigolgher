import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { APP, STRIPE } from "@/config/app";
import type { PlanId } from "@/features/flow/FlowProvider";
import { Button } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";

/* — tiny formatting helpers (display only; no real card data leaves the page) — */
function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}
function formatCard(v: string) {
  return onlyDigits(v).slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(v: string) {
  const d = onlyDigits(v).slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}
function cardBrand(v: string): string {
  const d = onlyDigits(v);
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex";
  if (/^6(011|5)/.test(d)) return "Discover";
  return "";
}

function LockGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** A single field styled like Stripe's checkout inputs. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoComplete,
  trailing,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "email";
  autoComplete?: string;
  trailing?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-chalk-soft">{label}</span>
      <span className="flex items-center gap-2 rounded-field border border-line-strong bg-ink-850 px-3.5 transition-colors focus-within:border-chalk/50">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          className="h-12 w-full bg-transparent text-[15px] text-chalk placeholder:text-chalk-faint focus:outline-none"
        />
        {trailing && <span className="shrink-0 text-[12px] font-medium text-chalk-mute">{trailing}</span>}
      </span>
    </label>
  );
}

/**
 * A Stripe-style checkout page. This is the payment UI; when a real Stripe
 * Payment Link is configured in `STRIPE`, the paywall redirects to Stripe
 * instead of showing this form (see OnboardingScreen). Rendered in-app so the
 * flow is testable now — it validates card *format* only and never charges a
 * real card (that requires a live Payment Link or a backend Checkout Session).
 */
export function StripeCheckout({
  open,
  plan,
  email = "",
  onClose,
  onPaid,
}: {
  open: boolean;
  plan: PlanId;
  email?: string;
  onClose: () => void;
  onPaid: (plan: PlanId) => void;
}) {
  const [mail, setMail] = useState(email);
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "processing">("idle");

  const price = plan === "yearly" ? STRIPE.yearlyPrice : STRIPE.monthlyPrice;
  const per = plan === "yearly" ? "year" : "month";
  const brand = cardBrand(card);

  const valid = useMemo(
    () =>
      /\S+@\S+\.\S+/.test(mail) &&
      onlyDigits(card).length >= 15 &&
      exp.length === 5 &&
      onlyDigits(cvc).length >= 3 &&
      name.trim().length > 1 &&
      zip.trim().length >= 3,
    [mail, card, exp, cvc, name, zip],
  );

  if (!open) return null;

  const pay = () => {
    if (!valid || status === "processing") return;
    setStatus("processing");
    // Simulated authorization delay. A real charge happens on Stripe's servers.
    setTimeout(() => onPaid(plan), 1400);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-ink-950 animate-fade-in">
      <div className="app-shell flex min-h-full flex-col px-6 pb-10 pt-safe">
        {/* header */}
        <div className="flex items-center justify-between py-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-chalk-mute transition-colors hover:bg-ink-800 hover:text-chalk"
          >
            <ChevronLeftIcon size={22} />
          </button>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-chalk-faint">
            <LockGlyph /> Secure checkout
          </span>
          <span className="h-9 w-9" aria-hidden="true" />
        </div>

        {/* order summary */}
        <div className="mt-2">
          <p className="text-[13px] font-medium text-chalk-mute">{APP.name} Premium · {plan === "yearly" ? "Yearly" : "Monthly"}</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[2.5rem] font-bold tracking-tight text-chalk tnum">{price}</span>
            <span className="text-[15px] text-chalk-mute">/ {per}</span>
          </div>
          <p className="mt-1 text-[13px] text-chalk-mute">
            {STRIPE.trialDays}-day free trial · then {price}/{per}. Cancel anytime.
          </p>
        </div>

        {/* payment form */}
        <div className="mt-7 space-y-4">
          <Field label="Email" value={mail} onChange={setMail} placeholder="you@example.com" inputMode="email" autoComplete="email" />

          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-chalk-soft">Card information</span>
            {/* Stripe groups card fields in one bordered block with dividers */}
            <div className="overflow-hidden rounded-field border border-line-strong bg-ink-850 transition-colors focus-within:border-chalk/50">
              <div className="flex items-center gap-2 px-3.5">
                <input
                  value={card}
                  onChange={(e) => setCard(formatCard(e.target.value))}
                  placeholder="1234 1234 1234 1234"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className="h-12 w-full bg-transparent text-[15px] tnum text-chalk placeholder:text-chalk-faint focus:outline-none"
                />
                {brand && <span className="shrink-0 text-[12px] font-semibold text-chalk-mute">{brand}</span>}
              </div>
              <div className="grid grid-cols-2 border-t border-line-soft">
                <input
                  value={exp}
                  onChange={(e) => setExp(formatExpiry(e.target.value))}
                  placeholder="MM / YY"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  className="h-12 w-full bg-transparent px-3.5 text-[15px] tnum text-chalk placeholder:text-chalk-faint focus:outline-none"
                />
                <input
                  value={cvc}
                  onChange={(e) => setCvc(onlyDigits(e.target.value).slice(0, 4))}
                  placeholder="CVC"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  className="h-12 w-full border-l border-line-soft bg-transparent px-3.5 text-[15px] tnum text-chalk placeholder:text-chalk-faint focus:outline-none"
                />
              </div>
            </div>
          </div>

          <Field label="Name on card" value={name} onChange={setName} placeholder="Full name" autoComplete="cc-name" />
          <Field label="ZIP / Postal code" value={zip} onChange={setZip} placeholder="10001" inputMode="numeric" autoComplete="postal-code" maxLength={10} />
        </div>

        <div className="mt-7">
          <Button variant="primary" size="lg" fullWidth loading={status === "processing"} disabled={!valid} onClick={pay}>
            {status === "processing" ? "Processing…" : `Start ${STRIPE.trialDays}-day free trial`}
          </Button>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-chalk-faint">
            You won't be charged today. After {STRIPE.trialDays} days, {price}/{per} unless you cancel.
          </p>
        </div>

        {/* trust footer */}
        <div className="mt-auto pt-8">
          <div className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-chalk-mute">
            <LockGlyph size={12} /> Powered by <span className="font-semibold text-chalk">stripe</span>
          </div>
          <p className="mx-auto mt-2 max-w-[22rem] text-center text-[11px] leading-relaxed text-chalk-faint">
            Demo checkout — no real card is charged. Add a Stripe Payment Link in <span className="tnum">config/app.ts</span> to take live payments.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
