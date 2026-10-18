/**
 * Centralized currency / date / time formatting. Adaptable to other
 * currencies and locales.
 */
import { APP } from "@/config/app";
import { toMain, type Cents } from "./money";

export interface FormatOptions {
  locale?: string;
  currency?: string;
}

const defaults = { locale: APP.defaultLocale, currency: APP.defaultCurrency };

export function formatCurrency(
  cents: Cents,
  opts: FormatOptions & { signDisplay?: "auto" | "always" | "never" | "exceptZero" } = {},
): string {
  const { locale = defaults.locale, currency = defaults.currency, signDisplay = "auto" } = opts;
  return new Intl.NumberFormat(locale, { style: "currency", currency, signDisplay }).format(toMain(cents));
}

export function formatCurrencyCompact(cents: Cents, opts: FormatOptions = {}): string {
  const { locale = defaults.locale, currency = defaults.currency } = opts;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(toMain(cents));
}

export function formatDate(iso: string, locale: string = defaults.locale): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso));
}

export function formatDateShort(iso: string, locale: string = defaults.locale): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
}

/** Medium date. Ex.: "Jul 25, 2026". */
export function formatDateMedium(iso: string, locale: string = defaults.locale): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function formatMonth(iso: string, locale: string = defaults.locale): string {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(iso));
}

export function formatTime(iso: string, locale: string = defaults.locale): string {
  const base = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return locale.startsWith("pt") ? base.replace(":", "h") : base;
}

export function formatRelativeDay(iso: string, locale: string = defaults.locale): string {
  const date = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return formatDateShort(iso, locale);
}

export function formatDaysUntil(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
