import { describe, expect, it } from "vitest";
import { applyPending, createSyncQueue, enqueue, isRetryable, SyncError, type Op, type SyncStatus } from "./outbox";
import type { Transaction } from "./types";

const tx = (id: string, amount = 1000): Transaction => ({
  id,
  amount,
  direction: "expense",
  description: id,
  categoryId: "Food",
  date: "2026-09-23T12:00:00.000Z",
  currency: "USD",
  source: "manual",
});

/** A fake server, a fake clock and a fake phone. */
function harness(fail: (op: Op) => SyncError | null = () => null) {
  const server = new Map<string, Transaction>();
  const saved: (readonly Op[])[] = [];
  const statuses: SyncStatus[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let outage: SyncError | null = null;
  const q = createSyncQueue({
    async send(op) {
      const err = outage ?? fail(op);
      if (err) throw err;
      if (op.kind === "tx.upsert") server.set(op.tx.id, op.tx);
      if (op.kind === "tx.delete") server.delete(op.id);
    },
    save: (ops) => saved.push(ops),
    onChange: (s) => statuses.push(s),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  return {
    q,
    server,
    saved,
    statuses,
    timers,
    goOffline: () => (outage = new SyncError("TypeError: Network request failed", 0)),
    goOnline: () => (outage = null),
  };
}

describe("enqueue", () => {
  it("keeps one pending write per row, the newest", () => {
    let q: Op[] = [];
    q = enqueue(q, { kind: "tx.upsert", tx: tx("a", 100) });
    q = enqueue(q, { kind: "tx.upsert", tx: tx("b", 200) });
    q = enqueue(q, { kind: "tx.upsert", tx: tx("a", 150) });
    expect(q.map((o) => (o.kind === "tx.upsert" ? `${o.tx.id}:${o.tx.amount}` : o.kind))).toEqual(["b:200", "a:150"]);
    q = enqueue(q, { kind: "tx.delete", id: "a" });
    expect(q.map((o) => o.kind)).toEqual(["tx.upsert", "tx.delete"]);
  });

  it("merges preference patches", () => {
    let q: Op[] = [];
    q = enqueue(q, { kind: "prefs.update", prefs: { currency: "BRL" } });
    q = enqueue(q, { kind: "prefs.update", prefs: { locale: "pt-BR" } });
    expect(q).toEqual([{ kind: "prefs.update", prefs: { currency: "BRL", locale: "pt-BR" } }]);
  });
});

describe("applyPending", () => {
  it("lays unsent changes over what the server returned", () => {
    const server = { transactions: [tx("a", 100), tx("b", 200)] };
    const out = applyPending(server, [
      { kind: "tx.upsert", tx: tx("a", 999) },
      { kind: "tx.delete", id: "b" },
      { kind: "tx.upsert", tx: tx("c", 300) },
      { kind: "budget.upsert", budget: { id: "bud_total", scope: "total", label: "Monthly budget", limit: 50000 } },
    ]);
    expect(out.transactions?.map((t) => `${t.id}:${t.amount}`)).toEqual(["c:300", "a:999"]);
    expect(out.budgets?.[0].limit).toBe(50000);
  });
});

describe("isRetryable", () => {
  it("retries what can pass later and drops what never will", () => {
    expect(isRetryable(new SyncError("offline", 0))).toBe(true);
    expect(isRetryable(new SyncError("expired", 401))).toBe(true);
    expect(isRetryable(new SyncError("busy", 503))).toBe(true);
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryable(new SyncError("duplicate", 409, "23505"))).toBe(false);
    expect(isRetryable(new SyncError("bad uuid", 400, "22P02"))).toBe(false);
  });
});

describe("sync queue", () => {
  it("sends in order and empties once the server has everything", async () => {
    const h = harness();
    h.q.push({ kind: "tx.upsert", tx: tx("a") });
    h.q.push({ kind: "tx.upsert", tx: tx("b") });
    await h.q.flush();
    expect([...h.server.keys()]).toEqual(["a", "b"]);
    expect(h.q.status).toEqual({ pending: 0, failing: false });
    expect(h.saved.at(-1)).toEqual([]);
  });

  it("keeps an offline change, saved, until the connection returns", async () => {
    const h = harness();
    h.goOffline();
    h.q.push({ kind: "tx.upsert", tx: tx("a") });
    await h.q.flush();
    expect(h.server.size).toBe(0);
    expect(h.q.status).toEqual({ pending: 1, failing: true });
    // Saved on the phone, so a restart doesn't lose it either.
    expect(h.saved.at(-1)?.length).toBe(1);
    expect(h.timers.map((t) => t.ms)).toEqual([2000]);

    h.goOnline();
    h.timers[0].fn();
    await h.q.flush();
    expect(h.server.has("a")).toBe(true);
    expect(h.q.status).toEqual({ pending: 0, failing: false });
  });

  it("backs off between failed retries", async () => {
    const h = harness();
    h.goOffline();
    h.q.push({ kind: "tx.upsert", tx: tx("a") });
    await h.q.flush();
    for (let i = 0; i < 6; i += 1) {
      h.timers.at(-1)!.fn();
      await h.q.flush();
    }
    expect(h.timers.map((t) => t.ms)).toEqual([2000, 5000, 15000, 30000, 60000, 60000, 60000]);
  });

  it("drops a write the server will never accept, and carries on", async () => {
    const h = harness((op) => (op.kind === "tx.upsert" && op.tx.id === "bad" ? new SyncError("invalid", 400) : null));
    h.q.push({ kind: "tx.upsert", tx: tx("bad") });
    h.q.push({ kind: "tx.upsert", tx: tx("good") });
    await h.q.flush();
    expect([...h.server.keys()]).toEqual(["good"]);
    expect(h.q.status.pending).toBe(0);
  });

  it("puts back what a previous session left unsent, under newer edits", async () => {
    const h = harness();
    h.goOffline();
    h.q.push({ kind: "tx.upsert", tx: tx("a", 500) });
    await h.q.flush();
    h.q.restore([
      { kind: "tx.upsert", tx: tx("a", 100) },
      { kind: "tx.upsert", tx: tx("z", 700) },
    ]);
    expect(h.q.ops.map((o) => (o.kind === "tx.upsert" ? `${o.tx.id}:${o.tx.amount}` : ""))).toEqual(["z:700", "a:500"]);
    h.goOnline();
    await h.q.flush();
    expect(h.server.get("a")?.amount).toBe(500);
    expect(h.server.get("z")?.amount).toBe(700);
  });

  it("reports what landed while a load was in flight", async () => {
    const h = harness();
    const mark = h.q.mark();
    h.q.push({ kind: "tx.upsert", tx: tx("a") });
    await h.q.flush();
    expect(h.q.sentSince(mark).map((o) => o.kind)).toEqual(["tx.upsert"]);
    expect(h.q.sentSince(h.q.mark())).toEqual([]);
  });

  it("forgets everything when the account is deleted", async () => {
    const h = harness();
    h.goOffline();
    h.q.push({ kind: "tx.upsert", tx: tx("a") });
    await h.q.flush();
    h.q.clear();
    expect(h.q.status).toEqual({ pending: 0, failing: false });
    expect(h.saved.at(-1)).toEqual([]);
  });
});
