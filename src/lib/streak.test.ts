import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  fromDayKey,
  isMilestone,
  monthCells,
  nextMilestone,
  previousMilestone,
  streakSummary,
  weekCells,
} from "./streak";

// Wednesday 23 September 2026, mid-morning.
const NOW = new Date(2026, 8, 23, 10, 0);
/** Day key `offset` days from NOW (0 = today, -1 = yesterday). */
const k = (offset: number) => dayKey(addDays(NOW, offset));
const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => k(from + i));

describe("streak — day keys", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("files a moment under its local calendar day, east of UTC too", () => {
    // The old key formatted local midnight as UTC: in Tokyo, 00:30 on the 23rd
    // came out as the 22nd.
    process.env.TZ = "Asia/Tokyo";
    expect(dayKey(new Date(2026, 8, 23, 0, 30))).toBe("2026-09-23");
    process.env.TZ = "America/Sao_Paulo";
    expect(dayKey(new Date(2026, 8, 23, 23, 59))).toBe("2026-09-23");
  });

  it("round-trips through a key", () => {
    expect(dayKey(fromDayKey("2026-02-28"))).toBe("2026-02-28");
  });

  it("steps across a month end", () => {
    expect(dayKey(addDays(new Date(2026, 7, 31), 1))).toBe("2026-09-01");
  });
});

describe("streak — summary", () => {
  it("first use: nothing reviewed yet", () => {
    const s = streakSummary([], NOW);
    expect(s).toMatchObject({ state: "first", current: 0, best: 0, total: 0, doneToday: false, since: null });
    expect(s.next).toEqual({ target: 7, remaining: 7, firstTime: true });
  });

  it("pending: the run is alive through yesterday, today still open", () => {
    const s = streakSummary(run(-2, -1), NOW);
    expect(s).toMatchObject({ state: "pending", current: 2, doneToday: false });
    expect(s.next.remaining).toBe(5);
  });

  it("done: today reviewed — 'Faltam 2 dias para sua primeira semana'", () => {
    const s = streakSummary(run(-4, 0), NOW);
    expect(s).toMatchObject({ state: "done", current: 5, doneToday: true, milestoneToday: null });
    expect(s.next).toEqual({ target: 7, remaining: 2, firstTime: true });
  });

  it("resume: a lapsed run keeps its history and its record", () => {
    const s = streakSummary(run(-6, -4), NOW);
    expect(s).toMatchObject({ state: "resume", current: 0, best: 3, total: 3 });
  });

  it("a milestone is marked on the day it's reached", () => {
    const s = streakSummary(run(-6, 0), NOW);
    expect(s).toMatchObject({ current: 7, milestoneToday: 7, milestoneFirstTime: true });
    expect(s.next).toEqual({ target: 14, remaining: 7, firstTime: true });
  });

  it("…and only that day — tomorrow it's just the count", () => {
    const s = streakSummary(run(-7, -1), NOW);
    expect(s).toMatchObject({ state: "pending", current: 7, milestoneToday: null });
  });

  it("a milestone reached before isn't 'first' again", () => {
    const s = streakSummary([...run(-30, -21), ...run(-6, 0)], NOW);
    expect(s).toMatchObject({ current: 7, best: 10, milestoneToday: 7, milestoneFirstTime: false });
  });

  it("counts each day once, however many times it was recorded", () => {
    const s = streakSummary([k(0), k(0), k(-1), k(-1)], NOW);
    expect(s).toMatchObject({ current: 2, total: 2 });
  });

  it("keeps the record across a gap", () => {
    const s = streakSummary([...run(-20, -11), ...run(-2, 0)], NOW);
    expect(s).toMatchObject({ current: 3, best: 10 });
  });

  it("carries a run across a month boundary", () => {
    const end = new Date(2026, 8, 1, 9);
    const s = streakSummary(["2026-08-30", "2026-08-31", "2026-09-01"], end);
    expect(s.current).toBe(3);
  });
});

describe("streak — milestones", () => {
  it("steps through the ladder, then yearly", () => {
    expect([0, 6, 7, 13, 29, 99, 364, 365].map(nextMilestone)).toEqual([7, 7, 14, 14, 30, 100, 365, 730]);
    expect(previousMilestone(10)).toBe(7);
    expect(previousMilestone(5)).toBe(0);
    expect(isMilestone(30)).toBe(true);
    expect(isMilestone(730)).toBe(true);
    expect(isMilestone(8)).toBe(false);
  });
});

describe("streak — calendar cells", () => {
  it("week: done, today, missed, idle and future are told apart", () => {
    // Started reviewing on Monday; skipped Tuesday; today (Wednesday) open.
    const cells = weekCells([k(-2)], NOW);
    expect(cells).toHaveLength(7);
    expect(cells[0].date.getDay()).toBe(0); // Sunday first
    const byKey = Object.fromEntries(cells.map((c) => [c.key, c.mark]));
    expect(byKey[k(-3)]).toBe("idle"); // before the first review — not a miss
    expect(byKey[k(-2)]).toBe("done");
    expect(byKey[k(-1)]).toBe("missed");
    expect(byKey[k(0)]).toBe("today");
    expect(byKey[k(1)]).toBe("future");
    expect(cells.find((c) => c.isToday)?.key).toBe(k(0));
  });

  it("week: today becomes done once reviewed", () => {
    const today = weekCells([k(0)], NOW).find((c) => c.isToday);
    expect(today?.mark).toBe("done");
  });

  it("month: full weeks, padded before the 1st", () => {
    const rows = monthCells([k(0)], 2026, 8, NOW);
    expect(rows.every((r) => r.length === 7)).toBe(true);
    const flat = rows.flat();
    expect(flat.filter(Boolean)).toHaveLength(30);
    const firstIndex = flat.findIndex(Boolean);
    expect(firstIndex).toBe(new Date(2026, 8, 1).getDay());
    expect(flat.find((c) => c?.isToday)?.mark).toBe("done");
  });
});
