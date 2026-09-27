/**
 * Legal & privacy document TEXT — data only, no React and no DOM, so the web
 * viewer and the native app render the same words. Legal copy must not drift
 * between the two apps, which is why it lives here rather than in either one.
 *
 * Plain-language terms written for a developer based in Brazil, under
 * Brazilian law, with the consumer protections that can't be waived kept
 * intact. Not legal advice: have a lawyer read them before relying on them.
 * Setting APP.company puts the legal name in place of the generic description.
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
/** Who runs the app, as the documents name it. */
const OPERATOR = APP.company || `an independent developer based in Brazil, named as the seller on ${N}'s App Store page`;

export const TERMS: Section[] = [
  { heading: "1. Who we are", body: [`${N} is developed and operated by ${OPERATOR} ("we", "us"). You can reach us at ${CONTACT}.`] },
  {
    heading: "2. Acceptance",
    body: [
      `By creating an account or using ${N} ("the app"), you agree to these Terms. If you do not agree, do not use the app.`,
      "If you got the app from Apple's App Store, Apple's Licensed Application End User License Agreement (https://www.apple.com/legal/internet-services/itunes/appstore/dev/stdeula/) also applies to your use of it.",
    ],
  },
  { heading: "3. Eligibility", body: ["You must be at least 18 years old, or the age of majority where you live, and able to form a binding contract."] },
  { heading: "4. The service", body: [`${N} helps you record expenses and subscriptions and see summaries of them. It is an organizational tool for your personal use and does not provide financial, tax, accounting, or investment advice.`] },
  { heading: "5. Your account", body: ["You are responsible for the activity on your account and for keeping your credentials secure. You may delete your account at any time from Settings; deletion removes your data as described in the Privacy Policy."] },
  {
    heading: "6. Subscription, free trial & billing",
    body: [
      "Using the app requires a subscription, billed through the App Store. New subscribers may get a free trial. Unless you cancel at least 24 hours before the trial or the current period ends, the subscription starts or renews automatically at the price shown when you subscribed, until you cancel.",
    ],
    bullets: [
      "Payments are processed by Apple; we never see or store your card details.",
      "You can cancel at any time in your Apple ID's subscription settings; cancelling stops future renewals, and access continues until the end of the period you've paid for.",
      "Refunds are requested from Apple, which handles all App Store payments. This doesn't limit any refund or withdrawal right the law gives you.",
      "If the price changes, Apple tells you beforehand and, where required, asks for your agreement before charging the new price.",
    ],
  },
  {
    heading: "7. Your content & responsibility (UGC)",
    body: [
      "You keep ownership of the content you add — transactions, notes and category names (\"User Content\").",
      `You grant ${N} a limited, worldwide, royalty-free license to host, store, process, and display your User Content solely to operate the app for you.`,
      "You are responsible for your User Content and confirm you have the right to add it and that it does not violate any law or third-party right.",
    ],
    bullets: [
      "Do not add content that is illegal, infringing, malicious, or that contains another person's data without their permission.",
      `${N} does not pre-screen User Content; it is visible only to you.`,
      "We may remove content or suspend accounts that violate these Terms, and will respond to valid legal requests.",
    ],
  },
  { heading: "8. Acceptable use", bullets: ["No illegal use, no infringing others' rights, no malware, no attempts to break, overload, reverse-engineer, or gain unauthorized access to the app or other users' data."] },
  { heading: "9. Intellectual property", body: [`The app, its design, and its software belong to us and our licensors and are protected by law. These Terms grant you a personal, non-transferable, revocable license to use the app — nothing more.`] },
  { heading: "10. The app as it is", body: ["We work to keep the app available and its figures correct, but we can't promise it will never be interrupted or contain an error. Check anything important; the figures are only as accurate as the entries behind them."] },
  { heading: "11. Limits of our responsibility", body: ["As far as the law allows, we are not responsible for indirect losses, such as lost profits, that come from using or not being able to use the app. This doesn't limit liability that the law doesn't allow to be limited."] },
  {
    heading: "12. Your rights as a consumer",
    body: [
      "Nothing in these Terms removes or limits any right you have under consumer protection law that can't be waived by contract — in Brazil, the Consumer Defense Code (Law 8,078/1990). Where a clause here conflicts with those rights, the law prevails.",
    ],
  },
  {
    heading: "13. If something goes wrong",
    body: [
      `Write to us first at ${CONTACT}; most problems are solved that way, usually within a few business days. You can also use public channels such as consumidor.gov.br or your local consumer protection agency (Procon). There's no mandatory arbitration: any claim can be brought in the courts of the place where you live.`,
    ],
  },
  { heading: "14. Governing law", body: ["These Terms are governed by the laws of Brazil. If you live in another country, you keep the protections of its consumer laws that can't be waived by contract."] },
  { heading: "15. Changes", body: ["We may update these Terms; material changes will be notified in the app before they take effect. If you don't agree with them, you can cancel your subscription and delete your account."] },
  { heading: "16. Termination", body: ["You may stop using the app and delete your account at any time. We may suspend or end access for serious or repeated violations of these Terms, or where required by law."] },
  { heading: "17. Contact", body: [`Questions? Contact ${CONTACT}.`] },
];

export const PRIVACY: Section[] = [
  { heading: "Overview", body: [`This Privacy Policy explains what ${N} collects, why, and the choices you have. ${N} is built to keep your financial data private.`] },
  {
    heading: "Who is responsible",
    body: [
      `The controller of your personal data — in the terms of Brazil's General Data Protection Law (LGPD, Law 13,709/2018) — is ${OPERATOR}. For anything about your data, including requests under the LGPD, write to ${CONTACT}. We reply within 15 days.`,
    ],
  },
  {
    heading: "Data we collect",
    bullets: [
      "Account: your email address. Your password is never stored — only a hash of it, held by our authentication provider.",
      "Financial data you enter: expenses, income, subscriptions, budgets, categories, and notes.",
      "Usage: the calendar days you complete your daily review, stored with your account to count your streak. Opening the app isn't recorded.",
      "Your subscription: which plan you have, whether it's active or in a free trial, and when it renews or ends — reported by Apple through RevenueCat and stored with your account, so the app can unlock on any of your devices. We never see your card or Apple ID payment details.",
      "Technical data our hosting provider records when the app talks to our server — such as IP address and the time of the request — kept for a short period for security and troubleshooting. We don't use analytics, advertising or crash-reporting tools.",
    ],
  },
  { heading: "How we use it", bullets: ["To provide the app's features (tracking, summaries, reminders), process your subscription, support you, keep the app secure, and comply with law. We do not sell your personal data."] },
  {
    heading: "Legal bases",
    bullets: [
      "Your account, financial data, review days and subscription status: to perform the contract you enter into when you create an account and subscribe (LGPD art. 7, V).",
      "Server request logs: our legitimate interest in keeping the service secure and working (LGPD art. 7, IX).",
      "Records the law requires us to keep: compliance with a legal obligation (LGPD art. 7, II).",
      "Renewal reminders are scheduled on your phone only if you turn them on, and nothing about them is sent to us.",
    ],
  },
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
      "The database is in the United States (Virginia). Sending your data there is necessary to provide the service you signed up for, which the LGPD allows (art. 33, IX), and Supabase is bound by contract to protect it.",
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
      "Under the LGPD — and similar laws elsewhere, such as the GDPR — you can also: confirm whether we process your data; correct data that's incomplete, wrong or out of date; ask for data that's unnecessary or excessive to be anonymized, blocked or deleted; take a copy to another service (portability); know who we share it with; and withdraw any consent you gave. Write to us to use any of these rights.",
      "You can also complain to Brazil's data protection authority (ANPD, gov.br/anpd).",
    ],
  },
  { heading: "Data retention", body: ["We keep your data while your account is active. Deleting your account from Settings deletes the account and every record it holds from our database straight away. After that, what's left is only our hosting provider's request logs and backups, which expire on their own rolling schedule, and any record the law requires us to keep."] },
  { heading: "Children", body: [`${N} is for adults (18 and over). We don't knowingly collect data from children or teenagers; if you believe we have, write to us and we'll delete it.`] },
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
      "Purchases — your subscription plan and its status",
      "Diagnostics — server request logs (IP address, time), kept briefly for security and troubleshooting",
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
