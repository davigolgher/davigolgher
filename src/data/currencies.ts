/**
 * Supported currencies. The user picks one in Settings; formatting derives
 * from the currency's locale.
 */
export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE" },
  { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$", locale: "pt-BR" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", locale: "ja-JP" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", locale: "en-CA" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$", locale: "en-AU" },
  { code: "INR", label: "Indian Rupee", symbol: "₹", locale: "en-IN" },
];

export function currencyByCode(code: string): CurrencyOption {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
