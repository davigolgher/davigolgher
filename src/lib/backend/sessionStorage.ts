/**
 * Where the native app keeps its Supabase session: the iOS Keychain.
 *
 * The session holds the refresh token, which signs in as the account until it
 * is revoked — the one thing on the phone worth stealing. It used to sit in
 * AsyncStorage: a plain file in the app's container, copied into every device
 * backup and readable from an unencrypted computer backup or a jailbroken
 * phone. The Keychain is where iOS expects credentials (MASVS-STORAGE-1), and
 * with a `…THIS_DEVICE_ONLY` accessibility the item never leaves this device,
 * not even inside an encrypted backup restored to a new phone.
 *
 * Kept free of React Native imports — the Keychain and AsyncStorage are passed
 * in — so the rules below are tested directly (sessionStorage.test.ts).
 */

/** The shape supabase-js expects for `auth.storage`, and that both stores offer. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Largest piece written as one Keychain item. A session is 1.5–3 KB, and
 * expo-secure-store has warned that iOS may refuse values past 2,048 bytes, so
 * longer values are split rather than risking a session that silently fails
 * to save.
 */
export const CHUNK_SIZE = 1800;

const countKey = (key: string) => `${key}.n`;
const partKey = (key: string, i: number) => `${key}.${i}`;

/**
 * A store that splits each value across `CHUNK_SIZE` pieces. The piece count
 * is written last, so a save interrupted halfway leaves the old count pointing
 * at a mix of pieces — which `getItem` rejects as missing rather than
 * returning a corrupt session.
 */
export function chunked(store: KeyValueStore, size = CHUNK_SIZE): KeyValueStore {
  async function count(key: string): Promise<number> {
    const n = Number(await store.getItem(countKey(key)));
    return Number.isInteger(n) && n > 0 ? n : 0;
  }

  return {
    async getItem(key) {
      const n = await count(key);
      if (!n) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const part = await store.getItem(partKey(key, i));
        if (part === null) return null;
        parts.push(part);
      }
      const value = parts.join("");
      // Each piece is prefixed with the total length, so a stale piece left by
      // an interrupted save of a different value is caught here.
      const sep = value.indexOf(":");
      const expected = Number(value.slice(0, sep));
      const body = value.slice(sep + 1);
      return sep > 0 && body.length === expected ? body : null;
    },

    async setItem(key, value) {
      const before = await count(key);
      const framed = `${value.length}:${value}`;
      const n = Math.max(1, Math.ceil(framed.length / size));
      for (let i = 0; i < n; i += 1) await store.setItem(partKey(key, i), framed.slice(i * size, (i + 1) * size));
      await store.setItem(countKey(key), String(n));
      for (let i = n; i < before; i += 1) await store.removeItem(partKey(key, i));
    },

    async removeItem(key) {
      const n = await count(key);
      await store.removeItem(countKey(key));
      for (let i = 0; i < n; i += 1) await store.removeItem(partKey(key, i));
    },
  };
}

/** Set in AsyncStorage on first launch. AsyncStorage goes with the app; the Keychain doesn't. */
export const INSTALL_MARKER = "flow.installed.v1";

/**
 * The session store supabase-js is given.
 *
 * - Reads and writes go to the Keychain (`secure`).
 * - A session still in AsyncStorage (`legacy`) from an earlier version is
 *   moved across on first read and deleted from AsyncStorage, so updating the
 *   app doesn't sign anyone out.
 * - iOS keeps Keychain items after the app is deleted. Without a check, a
 *   phone handed on with Flow deleted but not erased would sign the next
 *   person who installs it into the previous owner's account. So on the first
 *   launch of an install — known by AsyncStorage, which *is* deleted with the
 *   app, lacking the marker — whatever session the Keychain still holds is
 *   discarded.
 * - Failures never throw into supabase-js. A Keychain that can't be read is
 *   treated as "signed out"; one that can't be written leaves the session in
 *   memory for this launch. Falling back to AsyncStorage instead would quietly
 *   put the token back where this module exists to keep it out of.
 */
export function sessionStorage({ secure, legacy }: { secure: KeyValueStore; legacy: KeyValueStore }): KeyValueStore {
  let freshInstall: Promise<boolean> | null = null;
  const isFreshInstall = () =>
    (freshInstall ??= (async () => {
      try {
        if (await legacy.getItem(INSTALL_MARKER)) return false;
        await legacy.setItem(INSTALL_MARKER, "1");
        return true;
      } catch {
        return false;
      }
    })());

  const checked = new Map<string, Promise<void>>();
  const prepare = (key: string) => {
    let p = checked.get(key);
    if (!p) {
      p = (async () => {
        if (await isFreshInstall()) await secure.removeItem(key).catch(() => {});
      })();
      checked.set(key, p);
    }
    return p;
  };

  return {
    async getItem(key) {
      await prepare(key);
      try {
        const value = await secure.getItem(key);
        if (value !== null) return value;
      } catch {
        return null;
      }
      // Moving an older version's session across.
      let old: string | null = null;
      try {
        old = await legacy.getItem(key);
      } catch {
        return null;
      }
      if (old === null) return null;
      try {
        await secure.setItem(key, old);
        await legacy.removeItem(key);
      } catch {
        /* still usable this launch; the move is retried on the next read */
      }
      return old;
    },

    async setItem(key, value) {
      await prepare(key);
      try {
        await secure.setItem(key, value);
      } catch {
        /* kept in memory by supabase-js for this launch — see above */
      }
      await legacy.removeItem(key).catch(() => {});
    },

    async removeItem(key) {
      await prepare(key);
      await secure.removeItem(key).catch(() => {});
      await legacy.removeItem(key).catch(() => {});
    },
  };
}
