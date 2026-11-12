/**
 * The Flow Family sharing consent, as text and as a version.
 *
 * This is the legal heart of the feature: what a dependent (or the person
 * legally responsible for them) agrees to before anyone else can see their
 * spending. It is plain language on purpose — LGPD asks for consent that is
 * free, informed and unambiguous (art. 8), given for a stated purpose, and a
 * wall of legalese is none of those.
 *
 * Versioned, and pinned. Every consent row stores the version it was given
 * under, and the database only accepts versions it knows, each with the
 * SHA-256 of `consentTermText()` (see supabase/prepared/0011). A test checks
 * the hash in the migration against this file, so the words a person agreed
 * to can always be shown again exactly, and can't drift from what the server
 * recorded. Changing a single character here means a new version and a new
 * row in `family_consent_terms` — never an edit to an old one.
 */
import { APP } from "@/config/app";

export const CONSENT_TERM_VERSION = "2026-11";

export interface TermSection {
  heading: string;
  body?: string[];
  bullets?: string[];
}

export const CONSENT_TERM_TITLE = `${APP.name} Family — sharing consent`;

/**
 * The term itself. `{guardian}` is the only placeholder: the person who will
 * see the data, named on the screen and stored on the consent row.
 */
export const CONSENT_TERM: TermSection[] = [
  {
    heading: "What you are agreeing to",
    body: [
      `You are choosing to let {guardian} see, in their own ${APP.name} app, the spending recorded in the bank accounts and cards you decide to share. It is view-only, it is for the period you choose, and you can stop it at any time.`,
    ],
  },
  {
    heading: "What is shared",
    bullets: [
      "Transactions in the accounts and cards you choose: date, amount, description, merchant, category, and whether each is pending or posted.",
      "For each shared account: its name, type, the institution, and the last four digits.",
      "Whether each bank connection is working or needs to be renewed.",
      "Monthly limits and alerts the guardian sets for you, which you can also see.",
    ],
  },
  {
    heading: "What is never shared",
    bullets: [
      "Your bank password or login. They are typed into your bank or its authorised connection screen and never reach us.",
      "Balances, credit limits and full account numbers.",
      "Accounts and cards you have not chosen to share.",
      `Anything you record by hand in ${APP.name}: your own expenses, subscriptions and budgets.`,
    ],
  },
  {
    heading: "Who sees it",
    body: [
      `Only {guardian}, signed in to their own account. We process the data to provide the feature, with Supabase (database) and Pluggy (the regulated Open Finance connection to your bank) acting on our behalf. It is not sold, not used for advertising, and not used to track you.`,
    ],
  },
  {
    heading: "What they can do",
    body: [
      "See the transactions, set alerts for themselves and set monthly limits to follow. Nothing here can move money, block a purchase or change anything at your bank. A limit is a number to compare against, not a block.",
    ],
  },
  {
    heading: "For how long",
    body: [
      "For the period chosen on the next screen: 3, 6 or 12 months. It ends on its own on that date unless it is renewed. For a person under 18 it also ends, at the latest, on their 18th birthday; from then on only they can renew it.",
    ],
  },
  {
    heading: "You can stop at any time",
    body: [
      "Family → Sharing → Stop sharing. Access ends immediately: the guardian stops seeing your data, and the alerts already created for them are deleted. Disconnecting a bank stops new data from that bank. Stopping costs you nothing and needs no reason.",
    ],
  },
  {
    heading: "You can always see who looked",
    body: [
      "Each time the guardian opens your data, the access is recorded. You can read the record in Family → Sharing → Access history.",
    ],
  },
  {
    heading: "If you are under 18, or someone is legally responsible for you",
    body: [
      "The consent is given by your parent or legal representative, who declares being responsible for you. You still see exactly what is shared and with whom, and you can stop it yourself.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      `You can ask to see, correct, export or delete your data, and you can withdraw this consent, at any time and at no cost (LGPD, arts. 8 and 18). Export and deletion are in the app; for anything else write to ${APP.supportEmail}. The Privacy Policy has the details.`,
    ],
  },
  {
    heading: "Legal basis",
    body: [
      "Consent (LGPD, art. 7, I). For children and adolescents, specific consent given by a parent or legal guardian, in their best interest (art. 14).",
    ],
  },
];

/**
 * The exact text that is hashed and recorded: every heading, paragraph and
 * bullet, one per line, with the placeholder left in. Formatting on screen can
 * change freely; this can't.
 */
export function consentTermText(sections: TermSection[] = CONSENT_TERM): string {
  const lines: string[] = [CONSENT_TERM_TITLE, `Version ${CONSENT_TERM_VERSION}`];
  for (const s of sections) {
    lines.push(s.heading);
    for (const p of s.body ?? []) lines.push(p);
    for (const b of s.bullets ?? []) lines.push(`- ${b}`);
  }
  return lines.join("\n");
}

/** The term with the guardian named, for display. */
export function consentTermFor(guardian: string): TermSection[] {
  const fill = (t: string) => t.split("{guardian}").join(guardian);
  return CONSENT_TERM.map((s) => ({
    heading: s.heading,
    body: s.body?.map(fill),
    bullets: s.bullets?.map(fill),
  }));
}

/** How long sharing may last, in months. The person consenting picks one. */
export const CONSENT_DURATIONS = [3, 6, 12] as const;
export type ConsentMonths = (typeof CONSENT_DURATIONS)[number];
export const DEFAULT_CONSENT_MONTHS: ConsentMonths = 12;
