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

/**
 * Minimum for a *new* password (sign-up, change). OWASP ASVS asks for at least
 * 8, Supabase's own default is 6 — set the project's minimum to match this
 * (Authentication → Providers → Email → Minimum password length), since only
 * the server's check actually binds. Signing in accepts whatever length an
 * existing password already has.
 */
export const MIN_PASSWORD_LENGTH = 8;

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
 * Change the signed-in user's password, proving the current one first.
 *
 * A session alone used to be enough, so whoever had an unlocked phone (or a
 * copied token) could set a new password and lock the owner out (OWASP ASVS
 * V6.2.3: changing a password takes the current and the new one). The current
 * password travels as `current_password`, which Supabase checks when
 * "Require current password when changing password" is on in the project's
 * Auth settings — the server is what makes this binding, not this screen.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password: newPassword, current_password: currentPassword });
  if (!error) return;
  // Supabase's wording varies by version; name the likely cause plainly.
  if (/current.?password|invalid.*credentials|reauthenticat/i.test(`${error.message} ${error.code ?? ""}`)) {
    throw new Error("Your current password isn't right.");
  }
  if (/same.?password|different from the old/i.test(`${error.message} ${error.code ?? ""}`)) {
    throw new Error("Choose a password different from the current one.");
  }
  throw error;
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
