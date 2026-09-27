/**
 * Browser globals the shared code expects. Imported once, first thing, from the
 * root layout.
 *
 * The shared store mints ids with `crypto.randomUUID()` and falls back to a
 * short non-uuid string when crypto is missing. React Native has no global
 * `crypto`, and every `id` column in the Postgres schema is a `uuid`, so that
 * fallback would be rejected on insert — silently, since writes are
 * fire-and-forget. Filling in the one function it looks for keeps the shared
 * store usable as-is.
 */
import { randomUUID } from "expo-crypto";

// Cast through unknown: globalThis types `crypto` as a full Crypto, and we only
// fill in the one method, so the real type would reject a partial object.
const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };

if (!g.crypto) g.crypto = {};
if (typeof g.crypto.randomUUID !== "function") g.crypto.randomUUID = randomUUID;
