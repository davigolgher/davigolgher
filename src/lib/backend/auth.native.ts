/**
 * Supabase Auth for the native app — the React Native counterpart to `auth.ts`.
 * Metro picks this file; Vite ignores it (see client.native.ts).
 *
 * The web build signs in with a magic *link*: the email opens a URL and the
 * browser reads the token out of it. A phone has no URL bar to come back to, and
 * bouncing out to Mail and back is exactly the friction we want gone — so here
 * the same email carries a six-digit **code** the user types in the app instead.
 * Supabase sends a code whenever the email template includes one, and
 * `verifyOtp` exchanges it for a session.
 *
 * `getSession` / `onAuthChange` / `signOut` keep the same signatures as the web
 * module, which is what lets AuthProvider and the store be shared unchanged.
 */
import { getSupabase } from "./client";
import type { Session, User } from "@supabase/supabase-js";

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  return sb;
}

/**
 * Email the user a six-digit sign-in code, creating the account if it's new.
 * Resolves once the email has been sent.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Exchange a six-digit code for a session. Throws if the code is wrong or expired. */
export async function verifyEmailCode(email: string, code: string): Promise<Session> {
  const { data, error } = await client().auth.verifyOtp({
    email: email.trim(),
    token: code.replace(/\D/g, ""),
    type: "email",
  });
  if (error) throw error;
  if (!data.session) throw new Error("That code didn't work. Ask for a new one.");
  return data.session;
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
