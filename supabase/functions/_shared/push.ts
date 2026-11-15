/**
 * Delivering Flow Family alerts as push notifications, through Expo's push
 * service (which forwards to Apple's APNs and Google's FCM).
 *
 * A push says that there is an alert and about whom — never the amount, the
 * merchant or the category. Notifications show on a locked screen, and App
 * Review asks that they not carry sensitive personal information (Guideline
 * 4.5.4). The details are in the app, behind the guardian's sign-in.
 *
 * The alerts themselves are already in the database (0014); this only takes
 * the ones waiting (family_push_claim), sends them, and records the outcome
 * (family_push_finish), dropping device tokens Expo reports as gone.
 */
import type { Fetch } from "./pluggy.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface Claimed {
  event_id: string;
  guardian_id: string;
  kind: string;
  dependent_name: string;
  tokens: string[];
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { type: "family_alert"; eventId: string };
}

/** What the notification says. Deliberately vague about money. */
export function messageFor(kind: string, dependentName: string): { title: string; body: string } {
  const name = dependentName.trim().slice(0, 40) || "Someone";
  if (kind === "connection_expired") {
    return { title: "Flow Family", body: `${name}'s bank connection needs attention.` };
  }
  return { title: "Flow Family", body: `New alert about ${name}. Open Flow to see it.` };
}

interface Ticket {
  status: "ok" | "error";
  details?: { error?: string };
}

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function deliverAlerts(
  admin: Admin,
  options: { fetcher?: Fetch; accessToken?: string; limit?: number } = {},
): Promise<{ sent: number; failed: number }> {
  const fetcher: Fetch = options.fetcher ?? ((input, init) => fetch(input, init));
  const { data, error } = await admin.rpc("family_push_claim", { p_limit: options.limit ?? 50 });
  if (error) throw new Error(`family_push_claim: ${error.message}`);
  const claimed = (data ?? []) as Claimed[];
  if (!claimed.length) return { sent: 0, failed: 0 };

  const messages: { eventId: string; message: PushMessage }[] = [];
  for (const c of claimed) {
    const text = messageFor(c.kind, c.dependent_name);
    for (const to of c.tokens) {
      messages.push({ eventId: c.event_id, message: { to, ...text, sound: "default", data: { type: "family_alert", eventId: c.event_id } } });
    }
  }

  const delivered = new Set<string>();
  const dead: string[] = [];
  // Expo takes up to 100 messages a request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetcher(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => m.message)),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: Ticket[] };
      if (!res.ok || !Array.isArray(body.data)) {
        console.error("deliverAlerts: Expo answered", res.status);
        continue;
      }
      body.data.forEach((ticket, j) => {
        const m = chunk[j];
        if (!m) return;
        if (ticket.status === "ok") delivered.add(m.eventId);
        else if (ticket.details?.error === "DeviceNotRegistered") dead.push(m.message.to);
      });
    } catch (e) {
      console.error("deliverAlerts:", (e as Error)?.message ?? String(e));
    }
  }

  const sent = claimed.filter((c) => delivered.has(c.event_id)).map((c) => c.event_id);
  const failed = claimed.filter((c) => !delivered.has(c.event_id)).map((c) => c.event_id);
  const finish = await admin.rpc("family_push_finish", { p_sent: sent, p_failed: failed, p_dead_tokens: dead });
  if (finish.error) console.error("family_push_finish:", finish.error.message);
  return { sent: sent.length, failed: failed.length };
}
