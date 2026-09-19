/**
 * Safe money. Values are always integer minor units (cents) — never floats.
 */
export type Cents = number;

export function toCents(main: number): Cents {
  return Math.round(main * 100);
}

export function toMain(cents: Cents): number {
  return cents / 100;
}

/** Parse a string of digits ("1250") as cents → 1250 ($12.50). */
export function digitsToCents(digits: string): Cents {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return 0;
  return Number(clean.slice(0, 12));
}

export const Money = {
  zero: 0 as Cents,
  add(...values: Cents[]): Cents {
    return values.reduce((acc, v) => acc + Math.trunc(v), 0);
  },
  subtract(a: Cents, b: Cents): Cents {
    return Math.trunc(a) - Math.trunc(b);
  },
  scale(value: Cents, factor: number): Cents {
    return Math.round(value * factor);
  },
  sum(values: Cents[]): Cents {
    return values.reduce((acc, v) => acc + Math.trunc(v), 0);
  },
  abs(value: Cents): Cents {
    return Math.abs(value);
  },
  isNegative(value: Cents): boolean {
    return value < 0;
  },
  percent(part: Cents, whole: Cents): number {
    if (whole <= 0) return 0;
    return Math.round((part / whole) * 100);
  },
  clampMin(value: Cents, min: Cents = 0): Cents {
    return value < min ? min : value;
  },
};
