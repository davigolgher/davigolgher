/**
 * Gmail connect on native — the counterpart to `gmail.ts`, which navigates the
 * page away and so can't work here.
 *
 * The consent screen opens in an auth session (SFAuthenticationSession on iOS),
 * which shares Safari's cookies — so a user already signed in to Google isn't
 * asked to log in again — and hands control back to the app when the flow
 * finishes. The return address travels inside the signed `state`, so the Edge
 * Function knows to redirect into the app rather than to the web pages.
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getSupabase } from "./client";

export type GmailConnectResult = "connected" | "denied" | "error" | "dismissed";

export async function startGmailConnect(): Promise<GmailConnectResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");

  // flow://gmail in a build, exp://…/--/gmail in Expo Go.
  const returnTo = Linking.createURL("gmail");

  const { data, error } = await sb.functions.invoke("gmail-oauth", {
    body: { action: "start", returnTo },
  });
  if (error) throw error;
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("Couldn't start Gmail connect");

  const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
  // Closing the sheet isn't a failure — it's a decision not to continue.
  if (result.type !== "success") return "dismissed";

  const status = Linking.parse(result.url).queryParams?.gmail;
  if (status === "connected") return "connected";
  if (status === "denied") return "denied";
  return "error";
}

/** Trigger a sync; resolves with the number of newly imported transactions. */
export async function syncGmail(): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error("Backend not configured");
  const { data, error } = await sb.functions.invoke("gmail-sync", { body: {} });
  if (error) throw error;
  return (data as { imported?: number })?.imported ?? 0;
}
