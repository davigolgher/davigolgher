/**
 * Supabase client, browser build.
 *
 * The app itself runs on `client.native.ts`, which Metro resolves ahead of this
 * file. Nothing in the deployed web bundle (the legal and support pages) needs a
 * Supabase client at all — this exists so the shared modules that import
 * `./client` (data, auth, AuthProvider, the store) still typecheck from the web
 * project, where React Native packages aren't installed. Keep the two exports in
 * sync with the native file.
 *
 * Only the *public* anon key belongs here — Row Level Security protects the data.
 * Secret keys (the service role key, RevenueCat's webhook secret) live only in
 * Edge Function env vars, never in the frontend. See SUPABASE.md.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(URL && ANON);

let cached: SupabaseClient | null = null;

/** The Supabase client, or null when the app is running in local demo mode. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!cached) {
    cached = createClient(URL as string, ANON as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cached;
}
