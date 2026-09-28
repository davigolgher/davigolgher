import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, INSTALL_MARKER, chunked, sessionStorage, type KeyValueStore } from "./sessionStorage";

/** An in-memory store that behaves like expo-secure-store: same key rule, optional size cap. */
function memory(opts: { maxValue?: number; failing?: boolean } = {}) {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    async getItem(key) {
      if (opts.failing) throw new Error("keychain unavailable");
      return data.has(key) ? (data.get(key) as string) : null;
    },
    async setItem(key, value) {
      if (opts.failing) throw new Error("keychain unavailable");
      if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid key ${key}`);
      if (opts.maxValue && value.length > opts.maxValue) throw new Error("value too large");
      data.set(key, value);
    },
    async removeItem(key) {
      if (opts.failing) throw new Error("keychain unavailable");
      data.delete(key);
    },
  };
  return { store, data };
}

const KEY = "sb-abcdefghijklmnopqrst-auth-token";
/** A realistic session: a JWT, a refresh token and a user object, ~2.5 KB. */
const SESSION = JSON.stringify({
  access_token: `eyJ${"a".repeat(900)}.${"b".repeat(400)}.${"c".repeat(86)}`,
  refresh_token: "r".repeat(12),
  expires_at: 1_900_000_000,
  user: { id: "00000000-0000-4000-8000-000000000000", email: "a@example.test", user_metadata: { note: "x".repeat(900) } },
});

describe("chunked Keychain store", () => {
  it("round-trips a session larger than one Keychain item", async () => {
    const { store, data } = memory({ maxValue: 2048 });
    const s = chunked(store);
    expect(SESSION.length).toBeGreaterThan(2048);
    await s.setItem(KEY, SESSION);
    expect(await s.getItem(KEY)).toBe(SESSION);
    // Every piece fits, and every key is one SecureStore accepts.
    for (const [k, v] of data) {
      expect(v.length).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(k).toMatch(/^[\w.-]+$/);
    }
  });

  it("shrinking a value removes the pieces it no longer needs", async () => {
    const { store, data } = memory();
    const s = chunked(store, 10);
    await s.setItem(KEY, "x".repeat(95));
    await s.setItem(KEY, "short");
    expect(await s.getItem(KEY)).toBe("short");
    expect([...data.keys()].filter((k) => k.startsWith(KEY)).length).toBe(2); // one piece + the count
  });

  it("treats a half-written value as absent rather than returning a corrupt session", async () => {
    const { store, data } = memory();
    const s = chunked(store, 10);
    await s.setItem(KEY, "a".repeat(40));
    // An interrupted save of a different value: first piece replaced, count not yet updated.
    data.set(`${KEY}.0`, "55:bbbbbbb");
    expect(await s.getItem(KEY)).toBeNull();
  });

  it("remove deletes every piece", async () => {
    const { store, data } = memory();
    const s = chunked(store, 10);
    await s.setItem(KEY, "z".repeat(50));
    await s.removeItem(KEY);
    expect(data.size).toBe(0);
    expect(await s.getItem(KEY)).toBeNull();
  });
});

describe("session storage (Keychain, with the move from AsyncStorage)", () => {
  it("writes the session to the Keychain and never to AsyncStorage", async () => {
    const keychain = memory();
    const legacy = memory();
    await legacy.store.setItem(INSTALL_MARKER, "1");
    const s = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    await s.setItem(KEY, SESSION);
    expect(await s.getItem(KEY)).toBe(SESSION);
    expect(legacy.data.has(KEY)).toBe(false);
    expect([...keychain.data.values()].join("")).toContain("refresh_token");
  });

  it("moves an older version's session out of AsyncStorage without signing anyone out", async () => {
    const keychain = memory();
    const legacy = memory();
    // An install from before this change: session in AsyncStorage, no marker yet.
    await legacy.store.setItem(KEY, SESSION);
    const s = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    expect(await s.getItem(KEY)).toBe(SESSION);
    expect(legacy.data.has(KEY)).toBe(false);
    expect(await chunked(keychain.store).getItem(KEY)).toBe(SESSION);
  });

  it("drops a session the Keychain kept from before the app was deleted and reinstalled", async () => {
    const keychain = memory();
    await chunked(keychain.store).setItem(KEY, SESSION); // left behind by the previous install
    const legacy = memory(); // AsyncStorage is empty after a reinstall
    const s = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    expect(await s.getItem(KEY)).toBeNull();
    expect(keychain.data.size).toBe(0);
    expect(legacy.data.get(INSTALL_MARKER)).toBe("1");
  });

  it("keeps the session on every later launch of the same install", async () => {
    const keychain = memory();
    const legacy = memory();
    const first = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    await first.getItem(KEY);
    await first.setItem(KEY, SESSION);
    const second = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    expect(await second.getItem(KEY)).toBe(SESSION);
  });

  it("sign-out removes the session from both places", async () => {
    const keychain = memory();
    const legacy = memory();
    await legacy.store.setItem(INSTALL_MARKER, "1");
    await legacy.store.setItem(KEY, SESSION);
    const s = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    await s.setItem(KEY, SESSION);
    await s.removeItem(KEY);
    expect(await s.getItem(KEY)).toBeNull();
    expect(keychain.data.size).toBe(0);
    expect(legacy.data.has(KEY)).toBe(false);
  });

  it("a Keychain failure reads as signed out and never falls back to AsyncStorage", async () => {
    const keychain = memory({ failing: true });
    const legacy = memory();
    await legacy.store.setItem(INSTALL_MARKER, "1");
    const s = sessionStorage({ secure: chunked(keychain.store), legacy: legacy.store });
    await expect(s.setItem(KEY, SESSION)).resolves.toBeUndefined();
    await expect(s.getItem(KEY)).resolves.toBeNull();
    expect(legacy.data.has(KEY)).toBe(false);
  });
});

describe("native client wiring", () => {
  it("hands supabase-js the Keychain store, device-only, not AsyncStorage", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/lib/backend/client.native.ts"), "utf8");
    expect(src).toMatch(/storage:\s*sessionStorage\(\{\s*secure:\s*keychain,\s*legacy:\s*AsyncStorage\s*\}\)/);
    expect(src).toContain("AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY");
    expect(src).not.toMatch(/storage:\s*AsyncStorage\b/);
  });
});
