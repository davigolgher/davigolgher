/**
 * Supabase Auth for the native app — the React Native counterpart to `auth.ts`.
 * Metro picks this file; Vite ignores it (see client.native.ts).
 *
 * Email + password, on purpose. The web build signs in with a magic *link*,
 * which on a phone means leaving for Mail and hoping to land back in the app —
 * and Supabase's own sender is rate-limited to a handful of messages an hour and
 * isn't meant for production anyway. With password auth, creating an account and
 * signing in need no email at all.
 *
 * That requires **Confirm email turned off** in Supabase (Authentication → Sign
 * In / Providers → Email). With it on, `signUp` returns a user but no session,
 * and the account stays locked until the emailed link is opened — so
 * `signUpWithPassword` below detects exactly that case and says so.
 *
 * `getSession` / `onAuthChange` / `signOut` keep the same signatures as the web
 * module, which is what lets AuthProvider and the store be shared unchanged.
 */
import { getSupabase } from "./client";
import type { Session, User } from "@supabase/supabase-js";

/** Supabase's default minimum. Checked here so the error arrives before the round trip. */
export const MIN_PASSWORD_LENGTH = 6;

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  return sb;
}

/** Create an account and sign straight in. */
export async function signUpWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await client().auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) {
    // Confirm email is still on for this project: the user exists but can't sign
    // in until they open the emailed link.
    throw new Error(
      "This project still requires email confirmation. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers → Email.",
    );
  }
  return data.session;
}

/** Sign in to an existing account. */
export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error("Couldn't sign in. Check your email and password.");
  return data.session;
}

/**
 * Set or change the signed-in user's password.
 *
 * Also the migration path for accounts created before password auth: those were
 * made passwordless, so they have nothing to sign in with until this is called
 * from a session that's still valid.
 */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password });
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
