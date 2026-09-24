/**
 * Legal & privacy document TEXT — data only, no React and no DOM, so the web
 * viewer and the native app render the same words. Legal copy must not drift
 * between the two apps, which is why it lives here rather than in either one.
 *
 * NOTE: plain-language TEMPLATE text to review with your own lawyer before
 * launch — not legal advice. Specifics (governing law, arbitration provider,
 * company details, effective date) must be filled in for your business.
 */
import { APP } from "@/config/app";

export type LegalDocId = "terms" | "privacy" | "ai" | "nutrition";

export const UPDATED = "September 2026";

export interface Section {
  heading: string;
  body?: string[];
  bullets?: string[];
}

const N = APP.name;
/** The one address that's read. The legal@ / ai@ addresses these pages used to name don't exist. */
const CONTACT = APP.supportEmail;

export const TERMS: Section[] = [
  { heading: "1. Acceptance", body: [`By creating an account or using ${N} ("the app"), you agree to these Terms. If you do not agree, do not use the app.`] },
  { heading: "2. Eligibility", body: ["You must be at least 18 years old, or the age of majority where you live, and able to form a binding contract."] },
  { heading: "3. The service", body: [`${N} helps you record expenses and subscriptions and see summaries of them. It is an organizational tool for your personal use and does not provide financial, tax, accounting, or investment advice.`] },
  { heading: "4. Your account", body: ["You are responsible for the activity on your account and for keeping your credentials secure. You may delete your account at any time from Settings; deletion removes your data as described in the Privacy Policy."] },
  {
    heading: "5. Subscriptions, free trial & billing",
    body: [`Paid plans may start with a free trial. Unless you cancel before the trial ends, the plan renews automatically at the then-current price until you cancel.`],
    bullets: [
      "Payments are processed by the app store (Apple); we never see or store your card details.",
      "You can cancel anytime; cancellation stops future renewals and takes effect at the end of the current period.",
      "Except where the law requires otherwise, payments are non-refundable.",
    ],
  },
  {
    heading: "6. Your content & responsibility (UGC)",
    body: [
      "You keep ownership of the content you add — transactions, notes and category names (\"User Content\").",
      `You grant ${N} a limited, worldwide, royalty-free license to host, store, process, and display your User Content solely to operate the app for you.`,
      "You are solely responsible for your User Content and confirm you have the right to upload it and that it does not violate any law or third-party right.",
    ],
    bullets: [
      "Do not upload content that is illegal, infringing, malicious, or that contains another person's data without their permission.",
      `${N} does not pre-screen User Content and is not responsible or liable for it; you use and rely on it at your own risk.`,
      "We may remove content or suspend accounts that violate these Terms, and will respond to valid legal or takedown requests.",
    ],
  },
  { heading: "7. Acceptable use", bullets: ["No illegal use, no infringing others' rights, no malware, no attempts to break, overload, reverse-engineer, or gain unauthorized access to the app or other users' data."] },
  { heading: "8. Intellectual property", body: [`The app, its design, and its software are owned by ${N} and its licensors and are protected by law. These Terms grant you a personal, non-transferable, revocable license to use the app — nothing more.`] },
  { heading: "9. Disclaimers", body: ["The app is provided \"as is\" and \"as available,\" without warranties of any kind, express or implied, to the fullest extent permitted by law. We do not warrant that it will be uninterrupted, error-free, or that any summary or figure is accurate."] },
  { heading: "10. Limitation of liability", body: ["To the fullest extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages, and our total liability for any claim is limited to the amount you paid us in the 12 months before the claim (or USD 50 if you paid nothing)."] },
  { heading: "11. Indemnification", body: ["You agree to indemnify and hold us harmless from claims arising out of your User Content, your use of the app, or your violation of these Terms or the law."] },
  {
    heading: "12. Binding arbitration & class-action waiver",
    body: [
      "PLEASE READ THIS SECTION CAREFULLY — IT AFFECTS YOUR LEGAL RIGHTS. You and " + N + " agree that any dispute relating to these Terms or the app will be resolved by binding individual arbitration, not in court, except that either party may bring an individual claim in small-claims court.",
      "Arbitration will be administered by a recognized arbitration provider (for example, the American Arbitration Association) under its consumer rules, before a single arbitrator, in the county where you live or another mutually agreed location.",
    ],
    bullets: [
      "Class-action waiver: disputes will be brought only in an individual capacity — not as a plaintiff or class member in any class, consolidated, or representative action.",
      "Jury-trial waiver: you and we waive any right to a jury trial.",
      `30-day opt-out: you may reject this arbitration agreement by emailing ${CONTACT} within 30 days of first accepting these Terms.`,
    ],
  },
  { heading: "13. Governing law", body: ["These Terms are governed by the laws of the state/country you designate for your business, without regard to conflict-of-laws rules, and subject to the arbitration section above."] },
  { heading: "14. Changes", body: ["We may update these Terms; material changes will be notified in the app. Continued use after changes take effect means you accept them."] },
  { heading: "15. Termination", body: ["You may stop using the app and delete your account at any time. We may suspend or end access for violations of these Terms or where required by law."] },
  { heading: "16. Contact", body: [`Questions? Contact ${CONTACT}.`] },
];

export const PRIVACY: Section[] = [
  { heading: "Overview", body: [`This Privacy Policy explains what ${N} collects, why, and the choices you have. ${N} is built to keep your financial data private.`] },
  {
    heading: "Data we collect",
    bullets: [
      "Account: your email address. Your password is never stored — only a hash of it, held by our authentication provider.",
      "Financial data you enter: expenses, income, subscriptions, budgets, categories, and notes.",
      "Usage: the calendar days you complete your daily review, stored with your account to count your streak. Opening the app isn't recorded.",
      "Technical data our hosting provider records when the app talks to our server — such as IP address and the time of the request — kept for a short period for security and troubleshooting. We don't use analytics, advertising or crash-reporting tools.",
    ],
  },
  { heading: "How we use it", bullets: ["To provide the app's features (tracking, summaries, reminders), process your subscription, support you, keep the app secure, and comply with law. We do not sell your personal data."] },
  {
    heading: "Automated processing & AI",
    body: [
      `${N} doesn't use artificial intelligence. Totals, summaries, next charge dates and reminders are calculated by fixed rules from the entries you make. Nothing about you is decided automatically, and your data isn't used to train AI models. If that ever changes, we'll ask you first — see the AI Disclosure.`,
    ],
  },
  {
    heading: "Where your data is stored",
    body: [
      `Your expenses, subscriptions, budgets, categories and settings are stored in ${N}'s database, which is hosted by Supabase (supabase.com). Supabase is our infrastructure provider: they hold the data on our behalf and do not use it for their own purposes.`,
      "It travels encrypted (TLS) and is encrypted at rest.",
      "Access is scoped per user by Row Level Security, enforced by the database itself: every query is restricted to the rows belonging to the signed-in account, so one user's data cannot be read by another even if the app asked for it.",
      "The app keeps you signed in on the phone, holds your data in memory while it's open, and reads it from our database each time you sign in. A change you make without a connection is kept on the phone, tied to your account, only until our database confirms it has it.",
    ],
  },
  {
    heading: "Third-party service providers",
    body: ["We use third parties that process your data on our behalf, under contract and only as needed to run the app:"],
    bullets: [
      "Supabase — database and authentication (our backend/hosting provider).",
      "Apple — processes your subscription purchase through the App Store; we never receive your card details.",
      "RevenueCat — records which subscription you hold so the app can unlock; it does not receive payment details.",
      "Legal/safety: disclosed when required by law or to protect rights and safety.",
      "We do not sell your personal data or share it with advertising data brokers.",
    ],
  },
  {
    heading: "Your rights",
    bullets: [
      `See all of your data in the app, and ask us for a copy of it by emailing ${CONTACT}.`,
      "Delete your account and data at any time from Settings > Delete account.",
      "Depending on where you live (e.g. GDPR/CCPA), you may have additional rights to correct, restrict, or object; contact us to exercise them.",
    ],
  },
  { heading: "Data retention", body: ["We keep your data while your account is active. Deleting your account from Settings deletes the account and every record it holds from our database straight away; our hosting provider's backups expire on a rolling schedule."] },
  { heading: "Children", body: [`${N} is not directed to children under 13 (or the minimum age in your region) and we do not knowingly collect their data.`] },
  { heading: "Changes", body: ["We may update this policy; material changes will be notified in the app."] },
  { heading: "Contact", body: [`Privacy questions? Email ${APP.supportEmail}.`] },
];

export const AI: Section[] = [
  {
    heading: "In short",
    body: [
      `${N} doesn't use artificial intelligence (AI). Every category is one you chose, and nothing is guessed for you. In line with FTC guidance we say so plainly, rather than leave you to guess what is automated and what isn't.`,
    ],
  },
  {
    heading: "What is automated",
    body: ["A few things are calculated for you, by fixed rules that give the same answer every time:"],
    bullets: [
      "Totals, percentages, charts and month-to-month comparisons.",
      "Each subscription's next charge date, and the renewal reminders built from it.",
      "Your streak, counted from the days you complete the daily review.",
    ],
  },
  { heading: "It can still be wrong", body: ["A calculation is only as good as the entries behind it. Check anything important — you can edit or delete any entry at any time."] },
  { heading: "Not professional advice", body: [`${N} is for organizing your own records. It is not financial, investment, tax or legal advice.`] },
  {
    heading: "If we add AI",
    body: [
      "We'll update this page and tell you in the app before any AI feature is switched on. If a feature would send your data to an outside AI provider, we'll name the provider and ask for your permission first — nothing is sent until you agree, and you can say no and keep using the app.",
    ],
  },
  { heading: "Your data", body: ["We don't sell your data and don't use it to train AI models."] },
  { heading: "Questions", body: [`Contact ${CONTACT}.`] },
];

export interface NutritionGroup {
  title: string;
  note: string;
  items: string[];
}
export const NUTRITION: NutritionGroup[] = [
  { title: "Data used to track you", note: "Used to track you across other companies' apps and sites.", items: ["None"] },
  {
    title: "Data linked to you",
    note: "May be linked to your identity. Used only to run the app for you.",
    items: [
      "Contact Info — email address",
      "Identifiers — your account ID",
      "Financial Info — expenses, income, subscriptions, budgets",
      "User Content — descriptions, notes and category names",
      "Usage Data — days you completed your daily review, for your streak",
    ],
  },
  { title: "Data not linked to you", note: "Not linked to your identity.", items: ["None"] },
];

export const LEGAL_TITLES: Record<LegalDocId, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  ai: "AI Disclosure",
  nutrition: "Privacy Nutrition Label",
};
