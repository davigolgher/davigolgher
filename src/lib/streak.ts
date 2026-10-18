/**
 * The streak: consecutive days on which the user reviewed their finances.
 *
 * A day counts when the daily review is completed — a look at the day's entries
 * and the charges coming up, then a confirmation. Nothing else counts. In
 * particular:
 *
 *   - Opening the app doesn't. It used to, and it meant the day completed itself
 *     the moment Home loaded, so there was never anything left to do today and
 *     never a moment of finishing it.
 *   - Logging an expense doesn't. It used to, which rewarded spending, ignored
 *     income, and let a backdated expense quietly repair a broken streak.
 *
 * So a day with no spending counts as fully as any other, and no amount of money
 * moved — in or out — earns anything.
 *
 * Days are the device's local calendar days, keyed YYYY-MM-DD. Everything here
 * is pure and takes `now`, so it can be tested without a clock.
 */

/** The counts worth marking. Past the last, one every year. */
export const MILESTONES = [7, 14, 30, 60, 100, 180, 365] as const;

/**
 * Local calendar day as YYYY-MM-DD.
 *
 * Built from the local date parts. The previous version formatted local midnight
 * with toISOString, which is UTC — correct west of Greenwich, and a day early
 * everywhere east of it: 00:30 on the 23rd in Tokyo was filed under the 22nd.
 */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local midnight for a key. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar arithmetic — `new Date(y, m, d + n)` stays on local midnight across DST changes. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function isMilestone(n: number): boolean {
  return (MILESTONES as readonly number[]).includes(n) || (n > 365 && n % 365 === 0);
}

/** The first milestone strictly above `n`. */
export function nextMilestone(n: number): number {
  return MILESTONES.find((m) => m > n) ?? (Math.floor(n / 365) + 1) * 365;
}

/** The milestone at or below `n` — where the progress bar towards the next one starts. */
export function previousMilestone(n: number): number {
  if (n >= 365) return Math.floor(n / 365) * 365;
  let prev = 0;
  for (const m of MILESTONES) if (m <= n) prev = m;
  return prev;
}

export type StreakState =
  /** Never reviewed a day. */
  | "first"
  /** A run is alive through yesterday, and today is still open. */
  | "pending"
  /** Today is reviewed. */
  | "done"
  /** Reviewed before, but the run has lapsed. History and record are kept. */
  | "resume";

export interface StreakSummary {
  state: StreakState;
  /**
   * The run that's alive now: through today if it's reviewed, otherwise through
   * yesterday — a streak isn't lost until the day actually ends.
   */
  current: number;
  doneToday: boolean;
  /** Longest run ever, including the current one. */
  best: number;
  /** Days reviewed in total. */
  total: number;
  /** Earliest reviewed day, or null before the first. */
  since: string | null;
  next: {
    target: number;
    /** Days still to review to reach it, today included when it's open. */
    remaining: number;
    /** Whether this account has never reached it — "your first week". */
    firstTime: boolean;
  };
  /** Set on the day a milestone is reached, for that day only. */
  milestoneToday: number | null;
  /** Whether today's milestone is one this account had never reached before. */
  milestoneFirstTime: boolean;
}

function runEndingAt(days: Set<string>, end: Date): number {
  let n = 0;
  for (let d = end; days.has(dayKey(d)); d = addDays(d, -1)) n += 1;
  return n;
}

function longestRun(sorted: string[]): number {
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    const d = fromDayKey(key);
    run = prev && dayKey(addDays(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function streakSummary(reviewed: Iterable<string>, now: Date): StreakSummary {
  const days = new Set(reviewed);
  const sorted = [...days].sort();
  const today = fromDayKey(dayKey(now));
  const doneToday = days.has(dayKey(today));

  const current = runEndingAt(days, doneToday ? today : addDays(today, -1));
  const best = Math.max(longestRun(sorted), current);

  const state: StreakState =
    days.size === 0 ? "first" : doneToday ? "done" : current > 0 ? "pending" : "resume";

  // Earned on the day it's reached, and only then — tomorrow the same count
  // is simply where the streak stands.
  const milestoneToday = doneToday && isMilestone(current) ? current : null;

  // Once today's milestone is in hand, the goal moves on to the next one.
  const target = nextMilestone(current);

  // "First week" means the record *before* today was short of it — today's own
  // run is what just reached it.
  const bestBeforeToday = doneToday ? longestRun(sorted.filter((k) => k !== dayKey(today))) : best;

  return {
    state,
    current,
    doneToday,
    best,
    total: days.size,
    since: sorted[0] ?? null,
    next: { target, remaining: target - current, firstTime: best < target },
    milestoneToday,
    milestoneFirstTime: milestoneToday !== null && bestBeforeToday < milestoneToday,
  };
}

export type DayMark =
  /** Reviewed. */
  | "done"
  /** Today, still open. */
  | "today"
  /** A past day after the first review that wasn't reviewed. */
  | "missed"
  /** Hasn't happened yet. */
  | "future"
  /** Before this account's first review — not a miss, just not started. */
  | "idle";

export interface DayCell {
  key: string;
  date: Date;
  mark: DayMark;
  isToday: boolean;
}

function markFor(key: string, todayKey: string, days: Set<string>, since: string | null): DayMark {
  if (key > todayKey) return "future";
  if (days.has(key)) return "done";
  if (key === todayKey) return "today";
  // A new account's first week shouldn't open on a row of failures.
  if (!since || key < since) return "idle";
  return "missed";
}

/** The seven days of the current week, starting on `weekStartsOn` (0 = Sunday). */
export function weekCells(reviewed: Iterable<string>, now: Date, weekStartsOn = 0): DayCell[] {
  const days = new Set(reviewed);
  const since = [...days].sort()[0] ?? null;
  const today = fromDayKey(dayKey(now));
  const todayKey = dayKey(today);
  const start = addDays(today, -((today.getDay() - weekStartsOn + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = dayKey(date);
    return { key, date, mark: markFor(key, todayKey, days, since), isToday: key === todayKey };
  });
}

/**
 * A month as calendar rows of seven, padded with nulls before the first and
 * after the last so every row is a full week.
 */
export function monthCells(
  reviewed: Iterable<string>,
  year: number,
  month: number,
  now: Date,
  weekStartsOn = 0,
): (DayCell | null)[][] {
  const days = new Set(reviewed);
  const since = [...days].sort()[0] ?? null;
  const todayKey = dayKey(now);
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() - weekStartsOn + 7) % 7;

  const cells: (DayCell | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= count; d += 1) {
    const date = new Date(year, month, d);
    const key = dayKey(date);
    cells.push({ key, date, mark: markFor(key, todayKey, days, since), isToday: key === todayKey });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (DayCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
