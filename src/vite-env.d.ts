/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (safe to expose). Empty = local demo mode. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key (safe to expose; RLS protects data). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
