/**
 * The one next thing worth doing, by where the person is.
 *
 * Home always answers "what can I do now, and what do I get for it?" — a new
 * account is never left looking at zeros. One suggestion at a time, the most
 * valuable first; dismissing it is never needed because each one disappears
 * by itself once done.
 *
 * Pure: the screen gathers the facts and renders the result.
 */
export type NextStepId =
  | "reconnect_bank"
  | "connect_bank"
  | "first_expense"
  | "review_found_subscriptions"
  | "set_budget"
  | "add_subscription"
  | "turn_on_reminders";

export interface NextStep {
  id: NextStepId;
  title: string;
  body: string;
  cta: string;
  /** Where the button goes. */
  href: string;
  /** A second, lighter way forward. */
  alt?: { cta: string; href: string };
  tone: "info" | "warn";
}

export interface Stage {
  /** Own expenses in the last 30 days (typed or imported). */
  recentExpenses: number;
  hasBudget: boolean;
  activeSubscriptions: number;
  /** Charges that look like subscriptions and aren't tracked yet. */
  foundSubscriptions: number;
  foundMonthly?: string;
  banksEnabled: boolean;
  /** null while unknown (still loading); pass banksEnabled false if banks can't be reached. */
  bankConnected: boolean | null;
  /** The name of a bank that needs the person, if any. */
  bankNeedsAttention: string | null;
  remindersOn: boolean;
  /** What the person said they want, from onboarding. */
  goals?: readonly string[];
}

export function nextStep(s: Stage): NextStep | null {
  if (s.bankNeedsAttention) {
    return {
      id: "reconnect_bank",
      title: `Reconnect ${s.bankNeedsAttention}`,
      body: "New purchases stopped arriving. Signing in to your bank again takes a minute.",
      cta: "Reconnect",
      href: "/banks",
      tone: "warn",
    };
  }
  if (s.recentExpenses === 0) {
    // Still finding out whether a bank is connected: say nothing for that
    // moment rather than flash the wrong suggestion.
    if (s.banksEnabled && s.bankConnected === null) return null;
    if (s.banksEnabled && s.bankConnected === false) {
      return {
        id: "connect_bank",
        title: "See your last 90 days in a minute",
        body: "Connect your bank and every purchase appears here, sorted into categories. Read-only; your password never reaches Flow.",
        cta: "Connect your bank",
        href: "/banks",
        alt: { cta: "Add an expense by hand", href: "/add-expense" },
        tone: "info",
      };
    }
    return {
      id: "first_expense",
      title: "Log your first expense",
      body: "An amount and a tap. After a few, this screen shows where your money goes.",
      cta: "Add an expense",
      href: "/add-expense",
      tone: "info",
    };
  }
  if (s.foundSubscriptions > 0) {
    return {
      id: "review_found_subscriptions",
      title: `${s.foundSubscriptions} possible subscription${s.foundSubscriptions === 1 ? "" : "s"} found`,
      body: `Charges that repeat every month${s.foundMonthly ? ` — ${s.foundMonthly} a month` : ""}. Track them to see what's coming.`,
      cta: "Review them",
      href: "/subs",
      tone: "info",
    };
  }
  const wantsBudget = !s.goals || s.goals.length === 0 || s.goals.includes("budget");
  if (!s.hasBudget && wantsBudget) {
    return {
      id: "set_budget",
      title: "Set a monthly budget",
      body: "Home then shows what's left to spend, and whether you're on track.",
      cta: "Set a budget",
      href: "/budget",
      tone: "info",
    };
  }
  if (s.activeSubscriptions === 0) {
    return {
      id: "add_subscription",
      title: "Add what you pay for every month",
      body: "Streaming, phone, gym: see the monthly and yearly total in one place.",
      cta: "Add a subscription",
      href: "/add-subscription",
      tone: "info",
    };
  }
  if (!s.remindersOn) {
    return {
      id: "turn_on_reminders",
      title: "Know before you're charged",
      body: "A heads-up a few days before each renewal, so nothing renews by surprise.",
      cta: "Turn on reminders",
      href: "/settings",
      tone: "info",
    };
  }
  return null;
}
