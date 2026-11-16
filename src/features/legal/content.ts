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

export type LegalDocId = "terms" | "privacy" | "ai" | "nutrition" | "family";

export const UPDATED = "November 2026";

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
  {
    heading: "3. Eligibility",
    body: [
      "You must be at least 18 years old, or the age of majority where you live, and able to form a binding contract.",
      `The one exception is Flow Family, where it is available: a person under 18 may have an account only to share their spending with a parent or legal guardian, who invites them and consents for them. The Flow Family Privacy & Terms explain how.`,
    ],
  },
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
      "Bank data, only if you connect a bank where that's available: the bank's name, each account's type, name, currency and last four digits, and the purchases of the accounts you choose to bring into Flow (date, amount, description, merchant, category). They become expenses you can edit or delete. Your bank password is never asked for or stored: you sign in on your bank's or a regulated open banking provider's own page.",
      "Review days: the calendar days you complete your daily review, stored with your account to count your streak.",
      "Usage statistics: which screens and features you use and when (for example, that you finished the introduction, opened the app, or connected a bank), with a random identifier created on your phone. Never amounts, merchants, names, notes or anything you type, and no advertising identifier. You can turn this off in Settings → Legal & privacy.",
      "Your subscription: which plan you have, whether it's active or in a free trial, and when it renews or ends — reported by Apple through RevenueCat and stored with your account, so the app can unlock on any of your devices. We never see your card or Apple ID payment details.",
      "Technical data our hosting provider records when the app talks to our server — such as IP address and the time of the request — kept for a short period for security and troubleshooting. We don't use third-party analytics, advertising or crash-reporting tools: the usage statistics above go to our own database only.",
    ],
  },
  { heading: "How we use it", bullets: ["To provide the app's features (tracking, summaries, reminders), process your subscription, support you, keep the app secure, and comply with law. We do not sell your personal data."] },
  {
    heading: "Legal bases",
    bullets: [
      "Your account, financial data, review days and subscription status: to perform the contract you enter into when you create an account and subscribe (LGPD art. 7, V).",
      "Server request logs: our legitimate interest in keeping the service secure and working (LGPD art. 7, IX).",
      "Usage statistics: our legitimate interest in understanding whether the app is useful and improving it (LGPD art. 7, IX), limited to what's described above and with a switch to turn it off.",
      "Bank data: your consent, given at your bank and in the app when you connect (LGPD art. 7, I). Disconnecting withdraws it.",
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
      "Open banking providers, only if you connect a bank: Pluggy (Brazil), Plaid (United States, Canada, United Kingdom, EU/EEA) or Salt Edge (other countries) connect to your bank with your consent and pass on the accounts and purchases you approve. Their keys are held on our server, never in the app.",
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
  {
    heading: "Data retention",
    body: [
      "We keep your data while your account is active. Deleting your account from Settings deletes the account and every record it holds from our database straight away. After that, what's left is only our hosting provider's request logs and backups, which expire on their own rolling schedule, and any record the law requires us to keep.",
      "Usage statistics are deleted after 13 months. If you connect a bank, the bank's own copy of each purchase is deleted after 13 months; what you brought into Flow stays as your expenses until you delete it. Disconnecting a bank ends the connection and lets you choose whether to keep or delete what it brought in.",
    ],
  },
  {
    heading: "Children",
    body: [
      `${N} is for adults (18 and over). We don't knowingly collect data from children or teenagers outside Flow Family; if you believe we have, write to us and we'll delete it.`,
      "Flow Family, where it is available, lets a parent or legal guardian follow the spending of a person under 18 with the specific consent the LGPD requires (art. 14). What is collected then, and why, is in the Flow Family Privacy & Terms.",
    ],
  },
  { heading: "Changes", body: ["We may update this policy; material changes will be notified in the app."] },
  { heading: "Contact", body: [`Privacy questions? Email ${APP.supportEmail}.`] },
];

/**
 * Flow Family: its own privacy notice and terms, shown in builds with the
 * feature (Settings → Family, the consent and account screens) and on the
 * public site. Kept apart from the main documents so someone who never uses
 * the feature isn't asked to read it.
 */
export const FAMILY: Section[] = [
  {
    heading: "What Flow Family is",
    body: [
      `Flow Family lets a guardian follow, read-only, the spending of someone they look after (a child, a teenager, an adult child, an older relative, or a person under curatela) from the bank accounts and cards that person chooses to share through open banking — Open Finance Brasil in Brazil, and the open banking networks of other countries. It cannot move money, block purchases, issue cards or change anything at a bank.`,
      `${OPERATOR} is the controller of the personal data processed in Flow Family, as in the main Privacy Policy. Contact: ${CONTACT}.`,
    ],
  },
  {
    heading: "Who is who",
    bullets: [
      "Guardian: creates a family, invites people, sees what they share, and sets alerts and monthly limits for themselves.",
      "Dependent: accepts an invitation, connects their bank, chooses which accounts to share, sees exactly what the guardian sees, and can stop at any time.",
      "Legal representative: for a person under 18 or under curatela, the guardian consents on their behalf and declares that they are their parent, legal guardian or curador.",
    ],
  },
  {
    heading: "What we collect",
    bullets: [
      "About the family: its name, the names members give themselves, each member's role and type (adult, under 18, under curatela) and, for a person under 18, their date of birth — kept only so sharing ends on their 18th birthday.",
      "Consent records: the version of the terms agreed to, the date and time, the chosen period, who consented (the person or their representative), and the network (IP) address and app identifier the agreement came from — kept as proof of consent.",
      "From the banks the dependent connects, through the open banking provider for their country: the institution and its country, each account's type, name, currency and last four digits, and — only for the accounts the dependent shares — each transaction's date, amount, currency, description, merchant, category and status. Balances, credit limits and full account numbers are not stored.",
      "The phone's time zone, so monthly budgets end at the dependent's own midnight.",
      "What the guardian sets up: monthly limits, alert rules, and the alerts produced.",
      "An access history: when the guardian opened the dependent's data, and the actions each member took (inviting, consenting, sharing an account, stopping).",
      "For guardians who allow notifications: the phone's push token, to deliver alerts.",
      "We never receive or store bank passwords or logins. They are entered in the bank's or Pluggy's authorised screen.",
    ],
  },
  {
    heading: "Why, and on what legal basis",
    bullets: [
      "To show the guardian the shared spending, produce alerts and reports, and let the dependent see and control the sharing: the dependent's consent (LGPD art. 7, I), and for a person under 18, the specific consent of a parent or legal guardian given in their best interest (art. 14, §1).",
      "To keep proof of consent and the access history: compliance with the LGPD's accountability duties (art. 7, II and art. 8, §2), and our legitimate interest in demonstrating that each access was authorised (art. 7, IX).",
      "Bank data is used for nothing else: not for advertising, not for credit decisions, not sold, not used to train AI, and not used to track anyone.",
      "Where the GDPR (European Union, European Economic Area) or the UK GDPR applies, the same purposes rest on consent (art. 6(1)(a)); for a child below the age of digital consent in their country, on consent given by the holder of parental responsibility (art. 8). Other countries' data protection laws apply where they protect you more.",
    ],
  },
  {
    heading: "Where your data goes",
    body: [
      "Our database is in the United States (see the main Privacy Policy). Bank data travels from the bank to the provider for its country and from there to us, encrypted in transit. Transfers out of Brazil rely on LGPD art. 33, IX; out of the EU/EEA and the UK, on the providers' and our processors' standard contractual clauses. You can ask us for a copy of these safeguards.",
    ],
  },
  {
    heading: "Who processes it for us",
    bullets: [
      "The open banking provider for the bank's country, each authorised or registered where it operates, which connects to the bank with the dependent's authorisation and passes us the data of the connection, acting on our behalf: Pluggy (pluggy.ai) in Brazil; Plaid (plaid.com) in the United States, Canada, the United Kingdom and the European Economic Area; Salt Edge (saltedge.com) in other countries.",
      "For Plaid, the access key it issues for each connection is stored encrypted, on our servers only.",
      "Supabase — our database and authentication provider, as in the main Privacy Policy (United States; LGPD art. 33, IX).",
      "Expo, Apple and Google — deliver push notifications to the guardian's phone. A notification says only that there is an alert and about whom; amounts, merchants and categories are never in it.",
    ],
  },
  {
    heading: "How long we keep it",
    bullets: [
      "Shared transactions: up to 13 months. Alerts: 12 months. Access history: 24 months. Unused invitations: 30 days after they expire.",
      "When a dependent stops sharing with every family, nothing new is read from their banks; 30 days later the bank connections are ended and what was read is deleted, unless they share again.",
      "Stopping sharing an account deletes what was read from it. Disconnecting a bank ends the connection at its provider (and the consent given at the bank) and deletes everything read through it.",
      "Deleting your account deletes all of the above that is yours, ends your bank connections at their providers, and removes you from every family.",
    ],
  },
  {
    heading: "Your rights and controls",
    bullets: [
      "Dependents can, at any time and without giving a reason: see who sees what and every access (Family → Sharing → Access history), stop sharing (Family → Sharing → Stop sharing, effective immediately), stop sharing a single account, disconnect a bank, or leave the family.",
      "Everyone can download a copy of their Flow Family data in the app, and delete their account in the app.",
      `The other LGPD rights in the main Privacy Policy apply: write to ${CONTACT}, or complain to the ANPD (gov.br/anpd).`,
    ],
  },
  {
    heading: "Children and adolescents",
    body: [
      "A person under 18 joins only through an invitation from a parent or legal guardian, who consents for them. They confirm with their date of birth, see exactly what is shared, and can stop it themselves. The sharing ends at the latest on their 18th birthday; after that only they can renew it. We collect from them only what the feature needs, and never use it for advertising or profiling.",
    ],
  },
  {
    heading: "Terms of use",
    bullets: [
      "Invite only people you have a legitimate relationship with and who agree, or whom you represent by law. Using Flow Family to watch someone without their knowledge, to pressure or harm them, is forbidden and ends your access.",
      "A guardian sees spending only while the dependent's consent is active. Monthly limits are numbers to compare against, not blocks.",
      "Bank data comes from the banks through Pluggy. It may arrive late, be incomplete or be categorised imperfectly; check anything important with the bank. Flow Family is not financial advice.",
      "Free plan: one dependent, one shared account, alerts for large purchases and stopped connections. A Flow subscription (sold and billed by the App Store or Google Play, as in the main Terms) adds unlimited dependents and accounts, category and budget alerts, and the monthly PDF report. If the subscription ends, nothing is deleted; the guardian sees one dependent and one account until it's back.",
      "The main Terms of Service apply to everything else.",
    ],
  },
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
      "Flow Family, where available and only if you use it — Name (what you call yourself in a family), Financial Info (transactions of the bank accounts a dependent chooses to share), Identifiers (the push token for a guardian's alerts) and Other Data (a dependent's date of birth if under 18, the network address recorded with a consent, and the phone's time zone)",
    ],
  },
  { title: "Data not linked to you", note: "Not linked to your identity.", items: ["None"] },
];

export const LEGAL_TITLES: Record<LegalDocId, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  ai: "AI Disclosure",
  nutrition: "Privacy Nutrition Label",
  family: "Flow Family Privacy & Terms",
};
