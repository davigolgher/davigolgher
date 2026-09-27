/**
 * Changes on their way to the server.
 *
 * The store changes the screen at once and writes to Supabase behind it. Those
 * writes used to be fire-and-forget: offline, or on any refusal, the entry
 * stayed on screen for the session and was gone on the next launch — and the
 * client didn't even look at the errors Supabase returned, so nothing was
 * logged either. Money someone recorded must not quietly disappear.
 *
 * So every write goes through this queue first. It is saved on the phone (per
 * account) before it's sent, removed only once the server has confirmed it,
 * retried with a growing wait while the network is away, and folded back over
 * what the server returns on the next load so an unsent change never flickers
 * out of view.
 *
 * Every operation writes a whole row keyed by the row's own id — an upsert or a
 * delete — so sending one twice is harmless, and a newer change to the same row
 * simply replaces an older one still waiting.
 *
 * Pure TypeScript: no React, no storage, no network. Those are passed in, which
 * is what lets the tests below drive it with a fake server.
 */
import type { AppData, Budget, Category, Preferences, Subscription, Transaction } from "./types";

export type Op =
  | { kind: "tx.upsert"; tx: Transaction }
  | { kind: "tx.delete"; id: string }
  | { kind: "sub.upsert"; sub: Subscription }
  | { kind: "sub.delete"; id: string }
  | { kind: "cat.upsert"; category: Category }
  | { kind: "cat.delete"; id: string }
  | { kind: "budget.upsert"; budget: Budget }
  | { kind: "prefs.update"; prefs: Partial<Preferences> };

/** The row an operation writes. Two operations on one row can't both be pending. */
export function opKey(op: Op): string {
  switch (op.kind) {
    case "tx.upsert":
      return `tx:${op.tx.id}`;
    case "tx.delete":
      return `tx:${op.id}`;
    case "sub.upsert":
      return `sub:${op.sub.id}`;
    case "sub.delete":
      return `sub:${op.id}`;
    case "cat.upsert":
      return `cat:${op.category.id}`;
    case "cat.delete":
      return `cat:${op.id}`;
    case "budget.upsert":
      return `budget:${op.budget.scope}`;
    case "prefs.update":
      return "prefs";
  }
}

/**
 * Add `op`, replacing whatever was still waiting for the same row. Preferences
 * are the one partial write, so their patches merge instead.
 */
export function enqueue(queue: readonly Op[], op: Op): Op[] {
  const key = opKey(op);
  const previous = queue.find((o) => opKey(o) === key);
  const next =
    op.kind === "prefs.update" && previous?.kind === "prefs.update"
      ? { kind: op.kind, prefs: { ...previous.prefs, ...op.prefs } }
      : op;
  return [...queue.filter((o) => opKey(o) !== key), next];
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
}

/**
 * What the server returned, with the changes it hasn't received yet laid over
 * it — the account as the user last left it.
 */
export function applyPending(data: Partial<AppData>, ops: readonly Op[]): Partial<AppData> {
  const out: Partial<AppData> = { ...data };
  for (const op of ops) {
    switch (op.kind) {
      case "tx.upsert":
        out.transactions = upsertById(out.transactions ?? [], op.tx);
        break;
      case "tx.delete":
        out.transactions = (out.transactions ?? []).filter((t) => t.id !== op.id);
        break;
      case "sub.upsert":
        out.subscriptions = upsertById(out.subscriptions ?? [], op.sub);
        break;
      case "sub.delete":
        out.subscriptions = (out.subscriptions ?? []).filter((s) => s.id !== op.id);
        break;
      case "cat.upsert":
        out.categories = (out.categories ?? []).some((c) => c.id === op.category.id)
          ? (out.categories ?? []).map((c) => (c.id === op.category.id ? op.category : c))
          : [...(out.categories ?? []), op.category];
        break;
      case "cat.delete":
        out.categories = (out.categories ?? []).filter((c) => c.id !== op.id);
        break;
      case "budget.upsert": {
        const list = out.budgets ?? [];
        out.budgets = list.some((b) => b.scope === op.budget.scope)
          ? list.map((b) => (b.scope === op.budget.scope ? op.budget : b))
          : [...list, op.budget];
        break;
      }
      case "prefs.update":
        out.preferences = { ...(out.preferences as Preferences), ...op.prefs };
        break;
    }
  }
  return out;
}

/** A write that failed, with the HTTP status Supabase answered (0 when it never arrived). */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/**
 * Worth trying again later: no connection, a server hiccup, an expired session
 * that is about to refresh, or rate limiting. Anything else — a malformed row, a
 * duplicate the database refuses — would fail the same way forever, and
 * keeping it would block every change queued behind it.
 */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof SyncError)) return true;
  const s = e.status;
  return s === 0 || s === 401 || s === 408 || s === 429 || s >= 500;
}

export interface SyncStatus {
  /** Changes not yet confirmed by the server. */
  pending: number;
  /** The last attempt failed and a retry is scheduled. */
  failing: boolean;
}

export interface SyncQueueOptions {
  send: (op: Op) => Promise<void>;
  /** Persist the queue. Called after every change to it, in order. */
  save: (ops: readonly Op[]) => void;
  onChange: (status: SyncStatus) => void;
  /** Waits between retries, in ms; the last one repeats. */
  retryDelays?: readonly number[];
  onDrop?: (op: Op, error: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface SyncQueue {
  readonly ops: readonly Op[];
  readonly status: SyncStatus;
  push(op: Op): void;
  /** Put back what was saved on the phone, under anything queued since. */
  restore(saved: readonly Op[]): void;
  /** Send everything, in order, stopping at the first failure worth retrying. */
  flush(): Promise<void>;
  /** A position in the sent log. See `sentSince`. */
  mark(): number;
  /**
   * Operations confirmed since `mark`. A load started before they landed
   * returns rows without them; folding these in keeps them on screen.
   */
  sentSince(mark: number): Op[];
  /** Forget everything — the account is gone. */
  clear(): void;
  /** Stop retrying. The saved copy stays for the next session. */
  dispose(): void;
}

const DEFAULT_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];
const SENT_LOG = 200;

export function createSyncQueue(opts: SyncQueueOptions): SyncQueue {
  const delays = opts.retryDelays ?? DEFAULT_DELAYS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let ops: Op[] = [];
  let sent: Op[] = [];
  let sentOffset = 0;
  let failing = false;
  let flushing: Promise<void> | null = null;
  let attempt = 0;
  let timer: unknown = null;
  let disposed = false;

  const status = (): SyncStatus => ({ pending: ops.length, failing });
  const changed = () => {
    opts.save(ops);
    opts.onChange(status());
  };
  const cancelRetry = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const scheduleRetry = () => {
    cancelRetry();
    const wait = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    timer = setTimer(() => {
      timer = null;
      void queue.flush();
    }, wait);
  };

  async function run(): Promise<void> {
    while (ops.length > 0 && !disposed) {
      const op = ops[0];
      let delivered = true;
      try {
        await opts.send(op);
      } catch (e) {
        if (disposed) return;
        if (isRetryable(e)) {
          failing = true;
          opts.onChange(status());
          scheduleRetry();
          return;
        }
        delivered = false;
        opts.onDrop?.(op, e);
      }
      if (disposed) return;
      // By identity: a newer change to the same row may have replaced this one
      // while it was in flight, and that one still has to go.
      ops = ops.filter((o) => o !== op);
      if (delivered) {
        sent.push(op);
        // Only a load in flight reads this, and loads take seconds.
        if (sent.length > SENT_LOG) {
          sentOffset += sent.length - SENT_LOG;
          sent = sent.slice(-SENT_LOG);
        }
      }
      attempt = 0;
      failing = false;
      changed();
    }
  }

  const queue: SyncQueue = {
    get ops() {
      return ops;
    },
    get status() {
      return status();
    },
    push(op) {
      if (disposed) return;
      ops = enqueue(ops, op);
      changed();
      void queue.flush();
    },
    restore(saved) {
      if (disposed || saved.length === 0) return;
      let merged: Op[] = [];
      for (const op of saved) merged = enqueue(merged, op);
      for (const op of ops) merged = enqueue(merged, op);
      ops = merged;
      changed();
    },
    flush() {
      if (disposed) return Promise.resolve();
      if (!flushing) {
        cancelRetry();
        flushing = run().finally(() => {
          flushing = null;
        });
      }
      return flushing;
    },
    mark() {
      return sentOffset + sent.length;
    },
    sentSince(mark) {
      return sent.slice(Math.max(0, mark - sentOffset));
    },
    clear() {
      cancelRetry();
      ops = [];
      sentOffset += sent.length;
      sent = [];
      failing = false;
      changed();
    },
    dispose() {
      disposed = true;
      cancelRetry();
    },
  };
  return queue;
}
