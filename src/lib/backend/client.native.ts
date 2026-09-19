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
 *  - the session is persisted in AsyncStorage rather than localStorage
 *  - `detectSessionInUrl` is off: on a phone there is no URL bar to read a
 *    token back from, and leaving it on makes Supabase look for one
 *
 * Only the *public* anon key belongs here — Row Level Security is what protects
 * the data. Secret keys live in Edge Function env vars. See SUPABASE.md.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(URL && ANON);

let cached: SupabaseClient | null = null;

/** The Supabase client, or null when the app is running in local demo mode. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createClient(URL as string, ANON as string, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cached;
}
