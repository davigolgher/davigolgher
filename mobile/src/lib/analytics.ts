/**
 * Product events: how people move through Flow, so we can tell whether a
 * change helps (docs/produto/eventos.md has the taxonomy, the funnel and the
 * retention queries).
 *
 * First-party and minimal on purpose:
 *   · no third-party SDK, no advertising identifier, no tracking across apps;
 *   · events carry names and small facts (a step, a count, a country code),
 *     never amounts, merchants, names, notes or anything typed;
 *   · they are kept on the phone and sent to Flow's own database only for a
 *     signed-in account (product_events_record, migration 0018), which checks
 *     every name and property again;
 *   · anyone can turn it off in Settings → Privacy; the queue is then erased.
 *
 * Nothing here may ever throw into the app: analytics failing is silent.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { getSupabase } from "@/lib/backend/client";

export const EVENTS = [
  // Arriving
  "app_opened",
  "welcome_viewed",
  "sample_started",
  "sample_exited",
  "signup_started",
  "signup_completed",
  "signin_completed",
  // Onboarding
  "onboarding_started",
  "onboarding_step_viewed",
  "onboarding_step_completed",
  "onboarding_skipped",
  "onboarding_completed",
  "paywall_viewed",
  "paywall_converted",
  "family_only_chosen",
  // Value
  "home_viewed",
  "first_expense_added",
  "expense_added",
  "subscription_added",
  "budget_set",
  "aha_reached",
  "insight_viewed",
  "next_step_viewed",
  "next_step_tapped",
  "returned_after_absence",
  // Banks
  "bank_intro_viewed",
  "bank_connect_started",
  "bank_connect_succeeded",
  "bank_connect_failed",
  "bank_import_completed",
  "bank_sync_succeeded",
  "bank_sync_failed",
  "bank_account_import_set",
  "bank_reconnect_started",
  "bank_disconnected",
  // Subscriptions found in spending
  "subscription_suggestion_viewed",
  "subscription_suggestion_accepted",
  "subscription_suggestion_dismissed",
  // Return triggers
  "weekly_summary_set",
] as const;

export type EventName = (typeof EVENTS)[number];

/** The only properties an event may carry, and nothing longer than 40 characters. */
export const PROPS = [
  "step",
  "goals",
  "via",
  "stage",
  "kind",
  "country",
  "banks",
  "accounts",
  "entries",
  "seconds",
  "days_away",
  "count",
  "on",
  "kept",
  "manual",
  "source",
  "plan",
  "screen",
] as const;
export type Props = Partial<Record<(typeof PROPS)[number], string | number | boolean>>;

const KNOWN = new Set<string>(EVENTS);
const ALLOWED = new Set<string>(PROPS);
const QUEUE_KEY = "flow.events.v1";
const OPT_OUT_KEY = "flow.analytics.optout";
const INSTALL_KEY = "flow.install.v1";
const MAX_QUEUE = 500;
const BATCH = 100;

interface Queued {
  name: EventName;
  props: Props;
  occurred_at: string;
  session_id: string;
  install_id: string;
}

function uuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/** Keep only the allowed properties, as small plain values. */
export function cleanProps(props: Record<string, unknown> = {}): Props {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED.has(k)) continue;
    if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === "string") out[k] = v.slice(0, 40);
  }
  return out as Props;
}

const session = uuid();
let installId: string | null = null;
let optedOut: boolean | null = null;
let queue: Queued[] = [];
let loaded: Promise<void> | null = null;
let flushing = false;

function load(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const [out, inst, saved] = await Promise.all([
          AsyncStorage.getItem(OPT_OUT_KEY),
          AsyncStorage.getItem(INSTALL_KEY),
          AsyncStorage.getItem(QUEUE_KEY),
        ]);
        optedOut = out === "1";
        installId = inst ?? uuid();
        if (!inst) await AsyncStorage.setItem(INSTALL_KEY, installId);
        const parsed = saved ? (JSON.parse(saved) as Queued[]) : [];
        queue = [...(Array.isArray(parsed) ? parsed : []), ...queue].slice(-MAX_QUEUE);
      } catch {
        optedOut = optedOut ?? false;
        installId = installId ?? uuid();
      }
    })();
  }
  return loaded;
}

function persist() {
  AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))).catch(() => {});
}

/** Record an event. Returns at once; never throws. */
export function track(name: EventName, props?: Props): void {
  try {
    if (!KNOWN.has(name)) return;
    const event: Queued = {
      name,
      props: cleanProps(props as Record<string, unknown>),
      occurred_at: new Date().toISOString(),
      session_id: session,
      install_id: installId ?? "",
    };
    void load().then(() => {
      if (optedOut) return;
      if (!event.install_id) event.install_id = installId ?? "";
      queue.push(event);
      if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
      persist();
    });
  } catch {
    /* never into the app */
  }
}

/** Send what is waiting, for a signed-in account. Safe to call any time. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await load();
    const client = getSupabase();
    if (optedOut || !client || queue.length === 0) return;
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      const { error } = await client.rpc("product_events_record", {
        p_events: batch,
        p_platform: Platform.OS,
        p_app_version: Constants.expoConfig?.version ?? null,
      });
      // Not deployed yet, offline, refused: keep them for next time.
      if (error) return;
      queue = queue.slice(batch.length);
      persist();
    }
  } catch {
    /* next time */
  } finally {
    flushing = false;
  }
}

export async function isOptedOut(): Promise<boolean> {
  await load();
  return Boolean(optedOut);
}

/** The Settings switch. Turning it off erases what is waiting on the phone. */
export async function setOptedOut(out: boolean): Promise<void> {
  await load();
  optedOut = out;
  if (out) queue = [];
  try {
    await AsyncStorage.setItem(OPT_OUT_KEY, out ? "1" : "0");
    persist();
  } catch {
    /* the in-memory switch still holds for this launch */
  }
}

const LAST_OPEN_KEY = "flow.lastOpen.v1";
/** A visit counts again after half an hour away. */
const NEW_VISIT_MS = 30 * 60_000;

/** "app_opened", with how many days since the last time: the basis of retention. */
async function trackOpen(): Promise<void> {
  try {
    const prev = Number(await AsyncStorage.getItem(LAST_OPEN_KEY));
    const now = Date.now();
    await AsyncStorage.setItem(LAST_OPEN_KEY, String(now));
    if (Number.isFinite(prev) && prev > 0) track("app_opened", { days_away: Math.floor((now - prev) / 86_400_000) });
    else track("app_opened", { stage: "first" });
  } catch {
    track("app_opened");
  }
}

let started = false;
/** Count the visit, then send periodically and when the app goes to the background. Call once. */
export function startAnalytics(): void {
  if (started) return;
  started = true;
  void trackOpen();
  let backgroundAt = 0;
  setInterval(() => void flush(), 60_000);
  AppState.addEventListener("change", (s) => {
    if (s === "background") {
      backgroundAt = Date.now();
      void flush();
    } else if (s === "active" && backgroundAt && Date.now() - backgroundAt > NEW_VISIT_MS) {
      void trackOpen();
    }
  });
}

/** For tests. */
export function __resetAnalytics() {
  queue = [];
  loaded = null;
  optedOut = null;
  installId = null;
  started = false;
}
export function __queued(): readonly Queued[] {
  return queue;
}
