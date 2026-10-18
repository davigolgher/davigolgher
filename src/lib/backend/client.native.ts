/**
 * Supabase client for the native app — the React Native counterpart to
 * `client.ts`.
 *
 * Metro resolves `.native.ts` ahead of the plain file and Vite ignores it, so
 * everything built on top (`auth`, `data`, `AuthProvider`, the store) is shared
 * between web and native with no changes. See mobile/README.md.
 *
 * Three differences from the web client:
 *  - config comes from Expo's `EXPO_PUBLIC_*` vars, not Vite's `import.meta.env`
 *  - the session is persisted in the iOS Keychain (see ./sessionStorage)
 *  - `detectSessionInUrl` is off: on a phone there is no URL bar to read a
 *    token back from, and leaving it on makes Supabase look for one
 *
 * Only the *public* anon key belongs here — Row Level Security is what protects
 * the data. Secret keys live in Edge Function env vars. See SUPABASE.md.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunked, sessionStorage } from "./sessionStorage";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(URL && ANON);

/**
 * Readable after the first unlock since boot, so a token refresh that lands
 * while the phone is locked can still be saved; `THIS_DEVICE_ONLY`, so the
 * item is never copied into a backup or onto another phone.
 */
const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychain = chunked({
  getItem: (key) => SecureStore.getItemAsync(key, KEYCHAIN),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  removeItem: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN),
});

let cached: SupabaseClient | null = null;

/** The Supabase client, or null when the app is running in local demo mode. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createClient(URL as string, ANON as string, {
      auth: {
        storage: sessionStorage({ secure: keychain, legacy: AsyncStorage }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}
