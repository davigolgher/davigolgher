/**
 * Central money-display hook. Formatting follows the user's chosen currency
 * (and the locale derived from it).
 */
import { useMemo } from "react";
import { useStore } from "@/data/store";
import { currencyByCode } from "@/data/currencies";
import { formatCurrency, formatCurrencyCompact } from "./format";
import type { Cents } from "./money";

type CurrencyOpts = { signDisplay?: "auto" | "always" | "never" | "exceptZero" };

export function useMoney() {
  const { data } = useStore();
  const code = data.preferences.currency;

  return useMemo(() => {
    const { locale, code: currency } = currencyByCode(code);
    return {
      currency,
      locale,
      format: (cents: Cents, opts: CurrencyOpts = {}) => formatCurrency(cents, { locale, currency, ...opts }),
      compact: (cents: Cents) => formatCurrencyCompact(cents, { locale, currency }),
    };
  }, [code]);
}
