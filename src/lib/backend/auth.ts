/** Supabase Auth helpers. No-ops / throw clearly when the backend isn't configured. */
import { getSupabase } from "./client";
import type { Session, User } from "@supabase/supabase-js";

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  return sb;
}

/** Passwordless email sign-in (magic link). Returns after the email is sent. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

/** OAuth sign-in — redirects the browser to the provider. */
export async function signInWithProvider(provider: "google" | "apple"): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export type { Session, User };
