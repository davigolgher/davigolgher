import { useId } from "react";
import { cn } from "@/lib/cn";
import { digitsToCents, toMain, type Cents } from "@/lib/money";
import { useStore } from "@/data/store";
import { currencyByCode } from "@/data/currencies";

export interface AmountFieldProps {
  value: Cents;
  onChange: (cents: Cents) => void;
  autoFocus?: boolean;
  label?: string;
  className?: string;
}

/** Big amount entry: digits are entered as cents (type "2099" → 20.99). */
export function AmountField({ value, onChange, autoFocus, label = "Amount", className }: AmountFieldProps) {
  const { data } = useStore();
  const { locale } = currencyByCode(data.preferences.currency);
  const id = useId();

  const display = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toMain(value));

  return (
    <div className={cn("border-b border-line pb-4", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        autoFocus={autoFocus}
        value={display}
        onChange={(e) => onChange(digitsToCents(e.target.value))}
        className={cn(
          "w-full bg-transparent text-[3rem] font-semibold leading-none tracking-tight tnum caret-chalk focus:outline-none",
          value === 0 ? "text-chalk-faint" : "text-chalk",
        )}
      />
    </div>
  );
}
