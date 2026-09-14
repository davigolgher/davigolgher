/**
 * Supabase client — config-driven. When VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set (see .env.example), the app runs in "connected"
 * mode: real auth + data persistence. When they are empty, the app stays in the
 * local demo mode it has today (in-memory data, local funnel), so the published
 * artifact keeps working with no backend.
 *
 * Only the *public* anon key belongs here — Row Level Security protects the data.
 * Secret keys (service role, Stripe secret, Google client secret) live only in
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
