/**
 * Recurrence: next-charge math, day counts, monthly/annual equivalents.
 */
import { Money, type Cents } from "./money";
import { startOfDay } from "./format";

export type Frequency = "monthly" | "yearly" | "weekly" | "custom";

export interface RecurrenceLike {
  frequency: Frequency;
  customIntervalDays?: number;
  amount: Cents;
  nextChargeAt: string;
}

export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = startOfDay(new Date(iso)).getTime();
  const base = startOfDay(from).getTime();
  return Math.round((target - base) / 86_400_000);
}

export function advanceCharge(iso: string, freq: Frequency, customIntervalDays = 30): string {
  const d = new Date(iso);
  switch (freq) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "custom":
      d.setDate(d.getDate() + Math.max(1, customIntervalDays));
      break;
  }
  return d.toISOString();
}

export function monthlyEquivalent(r: RecurrenceLike): Cents {
  switch (r.frequency) {
    case "monthly":
      return r.amount;
    case "yearly":
      return Money.scale(r.amount, 1 / 12);
    case "weekly":
      return Money.scale(r.amount, 52 / 12);
    case "custom": {
      const days = Math.max(1, r.customIntervalDays ?? 30);
      return Money.scale(r.amount, 30.4375 / days);
    }
  }
}

export function annualEquivalent(r: RecurrenceLike): Cents {
  switch (r.frequency) {
    case "monthly":
      return Money.scale(r.amount, 12);
    case "yearly":
      return r.amount;
    case "weekly":
      return Money.scale(r.amount, 52);
    case "custom": {
      const days = Math.max(1, r.customIntervalDays ?? 30);
      return Money.scale(r.amount, 365.25 / days);
    }
  }
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  weekly: "Weekly",
  custom: "Custom",
};
