/**
 * Product events on the phone: only known names and allowed properties are
 * kept, turning it off erases what is waiting, and nothing is sent without a
 * signed-in account (or when the server isn't ready).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => kv.get(k) ?? null,
    setItem: async (k: string, v: string) => void kv.set(k, v),
    removeItem: async (k: string) => void kv.delete(k),
  },
}));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: "ios" } }));
const server = vi.hoisted(() => ({
  session: true as boolean,
  rpc: vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ error: null as null | { message: string } })),
}));
vi.mock("@/lib/backend/client", () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: server.session ? {} : null } }) },
    rpc: server.rpc,
  }),
}));

const a = await import("./analytics");
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  kv.clear();
  a.__resetAnalytics();
  server.session = true;
  server.rpc.mockClear();
  server.rpc.mockResolvedValue({ error: null });
});

describe("cleanProps", () => {
  it("keeps the allowed keys only, as short plain values", () => {
    expect(a.cleanProps({ step: "goals", amount: 3990, merchant: "Netflix", count: 3.14159, on: true, country: "x".repeat(60), via: { nested: 1 } })).toEqual({
      step: "goals",
      count: 3.14,
      on: true,
      country: "x".repeat(40),
    });
  });
});

describe("track and flush", () => {
  it("queues known events and sends them for a signed-in account, then forgets them", async () => {
    a.track("onboarding_started");
    a.track("bank_import_completed", { banks: 1, entries: 42 });
    a.track("made_up" as never);
    await settle();
    expect(a.__queued().map((e) => e.name)).toEqual(["onboarding_started", "bank_import_completed"]);

    await a.flush();
    expect(server.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = server.rpc.mock.calls[0];
    expect(fn).toBe("product_events_record");
    expect((args.p_events as { name: string }[]).map((e) => e.name)).toEqual(["onboarding_started", "bank_import_completed"]);
    expect(args.p_platform).toBe("ios");
    expect(a.__queued()).toHaveLength(0);
  });

  it("keeps them while signed out or while the server refuses", async () => {
    a.track("welcome_viewed");
    await settle();
    server.session = false;
    await a.flush();
    expect(server.rpc).not.toHaveBeenCalled();
    server.session = true;
    server.rpc.mockResolvedValueOnce({ error: { message: "function does not exist" } });
    await a.flush();
    expect(a.__queued()).toHaveLength(1);
  });

  it("turned off: what is waiting is erased and nothing new is kept or sent", async () => {
    a.track("welcome_viewed");
    await settle();
    await a.setOptedOut(true);
    expect(a.__queued()).toHaveLength(0);
    a.track("sample_started");
    await settle();
    expect(a.__queued()).toHaveLength(0);
    await a.flush();
    expect(server.rpc).not.toHaveBeenCalled();
    expect(await a.isOptedOut()).toBe(true);
  });
});
