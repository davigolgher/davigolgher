/**
 * The RevenueCat adapter against a fake store: every purchase and restore
 * happens as the signed-in account, and one account's subscription never
 * unlocks another on the same phone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Purchases } from "./purchases";
import type { FakeStore } from "react-native-purchases";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_test_public_key";

/** A fresh launch of the app: new module instances, same store on the phone. */
async function launch(): Promise<{ purchases: Purchases; store: FakeStore }> {
  vi.resetModules();
  const stub = await import("react-native-purchases");
  const { purchases } = await import("./purchases");
  expect(purchases.available).toBe(true); // the real adapter, not the dev fallback
  return { purchases, store: stub.fakeStore() };
}

beforeEach(async () => {
  (await import("react-native-purchases")).resetFakeStore();
});

describe("purchases are tied to the signed-in account", () => {
  it("buys under the signed-in account's id", async () => {
    const { purchases, store } = await launch();
    await purchases.identify("user-a");
    const result = await purchases.purchase("yearly");
    expect(result.entitled).toBe(true);
    expect(store.log).toEqual(["buy:user-a"]);
  });

  it("refuses to buy or restore when the store couldn't be told who is signed in", async () => {
    const { purchases, store } = await launch();
    store.online = false;
    await expect(purchases.identify("user-b")).rejects.toThrow();
    store.online = true; // the network is back, but the account change never happened
    await expect(purchases.purchase("monthly")).rejects.toThrow("link this to your account");
    await expect(purchases.restore()).rejects.toThrow("link this to your account");
    expect(store.log).toEqual([]); // nothing bought or restored anonymously
  });

  it("goes through once the account is named", async () => {
    const { purchases, store } = await launch();
    store.online = false;
    await purchases.identify("user-b").catch(() => {});
    store.online = true;
    await purchases.identify("user-b");
    await purchases.purchase("monthly");
    expect(store.log).toEqual(["buy:user-b"]);
  });
});

describe("entitlement belongs to one account", () => {
  it("another account's subscription on this phone doesn't unlock the next one", async () => {
    const { purchases, store } = await launch();
    await purchases.identify("user-a");
    store.entitled.add("user-a");
    expect(await purchases.isEntitled("user-a")).toBe(true);

    // A signs out and B signs in with no connection: the store never switches.
    store.online = false;
    await purchases.identify(null).catch(() => {});
    await purchases.identify("user-b").catch(() => {});
    expect(await purchases.isEntitled("user-b")).toBe(false);
  });

  it("a subscriber who opens the app offline keeps access", async () => {
    const first = await launch();
    await first.purchases.identify("user-a");
    first.store.entitled.add("user-a");

    const { purchases, store } = await launch(); // relaunch; the store remembers user-a
    store.online = false;
    await purchases.identify("user-a").catch(() => {});
    expect(await purchases.isEntitled("user-a")).toBe(true);
  });
});
