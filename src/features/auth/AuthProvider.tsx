import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { getSession, onAuthChange, type Session } from "@/lib/backend/auth";

interface AuthValue {
  /** Whether a Supabase backend is configured (else the app runs local/demo). */
  configured: boolean;
  /** True while the initial session is being resolved (connected mode only). */
  loading: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    getSession()
      .then((s) => {
        if (mounted) setSession(s);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const off = onAuthChange((s) => setSession(s));
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      userId: session?.user?.id ?? null,
      email: session?.user?.email ?? null,
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>.");
  return ctx;
}

/** Like useAuth but returns null instead of throwing when no provider is mounted. */
export function useOptionalAuth(): AuthValue | null {
  return useContext(AuthContext);
}
