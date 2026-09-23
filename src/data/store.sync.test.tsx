/**
 * The store against a fake Supabase: what happens to an entry made offline,
 * across a restart, and when the connection comes back.
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Op } from "./outbox";
import { SyncError } from "./outbox";
import type { AppData, Transaction } from "./types";

const h = vi.hoisted(() => ({
  online: true,
  refuse: null as null | ((op: Op) => boolean),
  server: new Map<string, Transaction>(),
  phone: new Map<string, string>(),
  sent: [] as string[],
}));

vi.mock("@/lib/backend/client", () => ({ isSupabaseConfigured: true, getSupabase: () => null }));
vi.mock("@/features/auth/AuthProvider", () => ({ useOptionalAuth: () => ({ userId: "user-a" }) }));
vi.mock("./pendingStore", () => ({
  loadPending: async (userId: string) => JSON.parse(h.phone.get(userId) ?? "[]"),
  savePending: async (userId: string, ops: Op[]) => {
    if (ops.length) h.phone.set(userId, JSON.stringify(ops));
    else h.phone.delete(userId);
  },
}));
vi.mock("@/lib/backend/data", () => ({
  fetchAllData: async (): Promise<Partial<AppData>> => {
    if (!h.online) throw new SyncError("TypeError: Network request failed", 0);
    return { transactions: [...h.server.values()], subscriptions: [], categories: [], activeDays: [] };
  },
  sendOp: async (_userId: string, op: Op) => {
    if (!h.online) throw new SyncError("TypeError: Network request failed", 0);
    if (h.refuse?.(op)) throw new SyncError("invalid input", 400, "22P02");
    h.sent.push(op.kind);
    if (op.kind === "tx.upsert") h.server.set(op.tx.id, op.tx);
    if (op.kind === "tx.delete") h.server.delete(op.id);
  },
  deleteAccount: async () => {},
  recordActiveDay: async () => {},
}));

const { StoreProvider, useStore } = await import("./store");
type Store = ReturnType<typeof useStore>;

function mount() {
  const ref: { current: Store | null } = { current: null };
  function Probe() {
    ref.current = useStore();
    return null;
  }
  const view = render(
    <StoreProvider simulateLoading={false}>
      <Probe />
    </StoreProvider>,
  );
  return { store: () => ref.current!, unmount: view.unmount };
}

/** Let promises and effects run. */
const settle = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
});

const add = (s: Store, description: string, amount = 1250) =>
  act(() => {
    s.addTransaction({ amount, description, categoryId: "Food", date: new Date().toISOString() });
  });

beforeEach(() => {
  h.online = true;
  h.refuse = null;
  h.server.clear();
  h.phone.clear();
  h.sent = [];
});

describe("store sync", () => {
  it("sends an entry and clears it from the phone once the server has it", async () => {
    const app = mount();
    await settle();
    await add(app.store(), "Lunch");
    await settle();
    expect([...h.server.values()].map((t) => t.description)).toEqual(["Lunch"]);
    expect(app.store().sync).toMatchObject({ pending: 0, failing: false, loadFailed: false });
    expect(h.phone.size).toBe(0);
  });

  it("keeps an entry made offline through a restart, then sends it", async () => {
    // Offline from launch: the account can't load and the entry can't be sent.
    h.online = false;
    const first = mount();
    await settle();
    expect(first.store().sync.loadFailed).toBe(true);
    await add(first.store(), "Taxi", 2300);
    await settle();
    expect(first.store().data.transactions.map((t) => t.description)).toEqual(["Taxi"]);
    expect(first.store().sync).toMatchObject({ pending: 1, failing: true });
    expect(JSON.parse(h.phone.get("user-a")!)).toHaveLength(1);
    first.unmount();

    // Relaunch, still offline: the entry is not on the server, but it's kept.
    const second = mount();
    await settle();
    expect(second.store().sync.pending).toBe(1);
    second.unmount();

    // Relaunch online: it's sent, shown, and the phone's copy is cleared.
    h.online = true;
    h.server.set("old", {
      id: "old",
      amount: 900,
      direction: "expense",
      description: "Coffee",
      categoryId: "Food",
      date: new Date().toISOString(),
      currency: "USD",
      source: "manual",
    });
    const third = mount();
    await settle();
    const shown = third.store().data.transactions.map((t) => t.description).sort();
    expect(shown).toEqual(["Coffee", "Taxi"]);
    expect([...h.server.values()].map((t) => t.description).sort()).toEqual(["Coffee", "Taxi"]);
    expect(third.store().sync).toMatchObject({ pending: 0, failing: false, loadFailed: false });
    expect(h.phone.size).toBe(0);
  });

  it("retries on request once the connection is back", async () => {
    const app = mount();
    await settle();
    h.online = false;
    await add(app.store(), "Groceries");
    await settle();
    expect(app.store().sync).toMatchObject({ pending: 1, failing: true });
    h.online = true;
    await act(async () => app.store().retrySync());
    await settle();
    expect(app.store().sync).toMatchObject({ pending: 0, failing: false });
    expect(h.server.size).toBe(1);
  });

  it("doesn't let one refused write hold up the rest", async () => {
    h.refuse = (op) => op.kind === "tx.upsert" && op.tx.description === "Broken";
    const app = mount();
    await settle();
    await add(app.store(), "Broken");
    await add(app.store(), "Fine");
    await settle();
    expect([...h.server.values()].map((t) => t.description)).toEqual(["Fine"]);
    expect(app.store().sync.pending).toBe(0);
  });

  it("drops what's waiting when the account is deleted", async () => {
    const app = mount();
    await settle();
    h.online = false;
    await add(app.store(), "Rent");
    await settle();
    expect(h.phone.size).toBe(1);
    h.online = true;
    await act(async () => {
      await app.store().deleteAccount();
    });
    await settle();
    expect(h.phone.size).toBe(0);
    expect(app.store().sync.pending).toBe(0);
  });
});
