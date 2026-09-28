import { afterEach, describe, expect, it, vi } from "vitest";

describe("devWarn", () => {
  afterEach(() => {
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("says nothing in a release build", async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { devWarn } = await import("./devLog");
    devWarn("[sync] refused, dropped", "tx.upsert", new Error("amount 1599"));
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns in a development build", async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { devWarn } = await import("./devLog");
    devWarn("[sync] hydrate failed");
    expect(warn).toHaveBeenCalledWith("[sync] hydrate failed");
  });
});
