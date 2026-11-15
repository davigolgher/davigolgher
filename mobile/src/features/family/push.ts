/**
 * Push notifications for Flow Family alerts, on the guardian's phone.
 *
 * Asked for only when the guardian turns an alert on — never at launch, and
 * never on a dependent's phone, which receives nothing. The token goes to the
 * server (push_token_register) tied to the signed-in account, and is removed
 * on sign-out so the next person on this phone doesn't get the last one's
 * alerts.
 *
 * What a notification says is decided on the server and is deliberately
 * vague ("New alert about Ana"): it can be read on a locked screen.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { familyApi } from "@/lib/backend/family";
import { ensurePermission, hasPermission } from "~/lib/notifications";
import { signOut } from "@/lib/backend/auth";

function projectId(): string | undefined {
  // Set by `eas init` (app.json → extra.eas.projectId) and present in EAS builds.
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export type PushResult = "registered" | "denied" | "unavailable";

export async function registerForAlerts(): Promise<PushResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unavailable";
  if (!(await ensurePermission())) return "denied";
  const id = projectId();
  if (!id) return "unavailable";
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await familyApi.registerPushToken(token, Platform.OS);
    return "registered";
  } catch {
    return "unavailable";
  }
}

/**
 * Stop this phone receiving the signed-in guardian's alerts. Called before
 * signing out (the server only accepts it from the account that owns the
 * token). Asks Expo for the token again rather than remembering it, so it
 * works after a restart too; without permission there was never a token.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const id = projectId();
    if (!id || !(await hasPermission())) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await familyApi.removePushToken(token);
  } catch {
    /* not registered, or offline: the server drops tokens Expo reports gone */
  }
}

/** Sign out, after taking this phone off the guardian's alert list. */
export async function signOutOfFamily(): Promise<void> {
  await unregisterPush();
  await signOut();
}
