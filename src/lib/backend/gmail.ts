/** Gmail helpers — talk to the gmail-oauth / gmail-sync Edge Functions. */
import { getSupabase } from "./client";

/** Begin Google OAuth: fetch the consent URL, then redirect the browser to it. */
export async function startGmailConnect(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  const { data, error } = await sb.functions.invoke("gmail-oauth", { body: { action: "start" } });
  if (error) throw error;
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("Couldn't start Gmail connect");
  window.location.assign(url);
}

/** Trigger a sync; resolves with the number of newly imported transactions. */
export async function syncGmail(): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  const { data, error } = await sb.functions.invoke("gmail-sync", { body: {} });
  if (error) throw error;
  return (data as { imported?: number })?.imported ?? 0;
}
