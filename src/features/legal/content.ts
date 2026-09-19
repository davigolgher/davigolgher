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
      "You keep ownership of the content you add — including transactions, notes, category names, and any receipt files you upload (\"User Content\").",
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
      `30-day opt-out: you may reject this arbitration agreement by emailing legal@${(N.toLowerCase().replace(/\s+/g, ""))}.app within 30 days of first accepting these Terms.`,
    ],
  },
  { heading: "13. Governing law", body: ["These Terms are governed by the laws of the state/country you designate for your business, without regard to conflict-of-laws rules, and subject to the arbitration section above."] },
  { heading: "14. Changes", body: ["We may update these Terms; material changes will be notified in the app. Continued use after changes take effect means you accept them."] },
  { heading: "15. Termination", body: ["You may stop using the app and delete your account at any time. We may suspend or end access for violations of these Terms or where required by law."] },
  { heading: "16. Contact", body: [`Questions? Contact legal@${(N.toLowerCase().replace(/\s+/g, ""))}.app.`] },
];

export const PRIVACY: Section[] = [
  { heading: "Overview", body: [`This Privacy Policy explains what ${N} collects, why, and the choices you have. ${N} is built to keep your financial data private.`] },
  {
    heading: "Data we collect",
    bullets: [
      "Account: your email address (or Apple/Google sign-in identifier).",
      "Financial data you enter: expenses, income, subscriptions, budgets, categories, and notes.",
      "Files you upload: receipt images or PDFs you attach to a transaction.",
      "If you connect Gmail: read-only access to message content used only to create expense records.",
      "Limited technical/diagnostic data needed to run and improve the app.",
    ],
  },
  { heading: "How we use it", bullets: ["To provide the app's features (tracking, summaries, reminders), process your subscription, support you, keep the app secure, and comply with law. We do not sell your personal data."] },
  {
    heading: "Automated processing & AI",
    body: [
      `${N} may use automated systems and AI to categorize transactions, parse imported receipts, and generate spending summaries. These process your financial data only to provide those features. They do not make legally significant decisions about you, and your data is not used to train third-party AI models without your consent. See the AI Disclosure for details.`,
    ],
  },
  { heading: "Storage & security", body: ["In this version your data lives on your device and is not transmitted to our servers. When server features are enabled, data is encrypted in transit (TLS) and at rest, held in a private storage bucket, and access is scoped per user (Row Level Security)."] },
  {
    heading: "Third-party service providers",
    body: ["We use third parties that process your data on our behalf, under contract and only as needed to run the app:"],
    bullets: [
      "Supabase — database, authentication, and file storage (our backend/hosting provider).",
      "Apple — processes your subscription purchase through the App Store; we never receive your card details.",
      "RevenueCat — records which subscription you hold so the app can unlock; it does not receive payment details.",
      "Google — only if you connect Gmail (read-only), under the permissions you grant.",
      "Legal/safety: disclosed when required by law or to protect rights and safety.",
      "We do not sell your personal data or share it with advertising data brokers.",
    ],
  },
  { heading: "Gmail data", body: ["If you connect Gmail, access is read-only and used solely to turn purchase receipts into expenses. It is not sold, not used for ads, and not shared. You can disconnect anytime in Settings or revoke access in your Google Account."] },
  {
    heading: "Your rights",
    bullets: [
      "Access and export your data.",
      "Delete your account and data at any time from Settings > Delete account.",
      "Depending on where you live (e.g. GDPR/CCPA), you may have additional rights to correct, restrict, or object; contact us to exercise them.",
    ],
  },
  { heading: "Data retention", body: ["We keep your data while your account is active. When you delete your account, your data is removed from the app; backups (once server features exist) are purged on a rolling schedule."] },
  { heading: "Children", body: [`${N} is not directed to children under 13 (or the minimum age in your region) and we do not knowingly collect their data.`] },
  { heading: "Changes", body: ["We may update this policy; material changes will be notified in the app."] },
  { heading: "Contact", body: [`Privacy questions? Contact privacy@${(N.toLowerCase().replace(/\s+/g, ""))}.app.`] },
];

export const AI: Section[] = [
  { heading: "Why you're seeing this", body: [`${N} may use automated and AI systems for some features. In line with FTC guidance, we tell you clearly where AI is involved and what it can and cannot do.`] },
  {
    heading: "Where AI is used",
    bullets: [
      "Suggesting a category for a transaction or an imported receipt.",
      "Generating summaries and insights about your spending.",
      "Any recommendation or \"picked for you\" content is algorithmic, not a personalized professional opinion.",
    ],
  },
  { heading: "AI output can be wrong", body: ["Automated results may be inaccurate, incomplete, or out of date. Review anything important and correct it — you are always in control of your records."] },
  { heading: "Not professional advice", body: ["AI features are for organization and information only. They are not financial, investment, tax, legal, or medical advice."] },
  { heading: "Safety", body: [`${N} has no chat or conversational AI. If we ever add one, messages that indicate self-harm or crisis will be met with support resources (such as a crisis hotline) and will not be handled as ordinary requests.`] },
  { heading: "Human control", body: ["You can edit, override, or delete any AI-suggested value. We do not make solely-automated decisions that would have legal or similarly significant effects on you."] },
  { heading: "Your data & AI", body: ["Your financial data is used to power features for you. We do not sell it and do not use it to train third-party AI models without your consent."] },
  { heading: "Questions", body: [`Contact ai@${(N.toLowerCase().replace(/\s+/g, ""))}.app.`] },
];

export interface NutritionGroup {
  title: string;
  note: string;
  items: string[];
}
export const NUTRITION: NutritionGroup[] = [
  { title: "Data used to track you", note: "Used to track you across other companies' apps and sites.", items: ["None"] },
  { title: "Data linked to you", note: "May be linked to your identity.", items: ["Contact Info — email address", "Financial Info — expenses, income, subscriptions, budgets", "User Content — receipt files, notes"] },
  { title: "Data not linked to you", note: "Not linked to your identity.", items: ["Diagnostics — basic crash/usage data (if enabled)"] },
];

export const LEGAL_TITLES: Record<LegalDocId, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  ai: "AI Disclosure",
  nutrition: "Privacy Nutrition Label",
};
