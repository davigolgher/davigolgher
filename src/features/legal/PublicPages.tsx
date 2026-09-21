/**
 * The public pages. This is the entire web surface now — Flow is an app, and
 * these exist because App Store Connect requires a reachable **Privacy Policy
 * URL** and **Support URL**. App Review opens them straight from the store
 * listing, so they must not sit behind a sign-in.
 *
 * The document text comes from ./content, the same module the native app reads,
 * so the two can never drift apart.
 */
import { Link } from "react-router-dom";
import { APP } from "@/config/app";
import {
  AI,
  LEGAL_TITLES,
  NUTRITION,
  PRIVACY,
  TERMS,
  UPDATED,
  type LegalDocId,
  type Section,
} from "./content";

const DOCS: Record<LegalDocId, Section[] | null> = {
  terms: TERMS,
  privacy: PRIVACY,
  ai: AI,
  nutrition: null, // rendered as grouped chips, not prose
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-reader flex-col px-6 pb-16">
      <header className="flex items-center justify-between gap-3 border-b border-line-soft py-4">
        <span className="text-[17px] font-bold tracking-tight text-chalk">{APP.name}</span>
      </header>

      <main className="flex-1 pt-6">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-chalk">{title}</h1>
        <div className="mt-5">{children}</div>
      </main>

      <footer className="mt-10 border-t border-line-soft pt-5">
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-chalk-mute">
          <Link to="/privacy" className="hover:text-chalk">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-chalk">
            Terms of Service
          </Link>
          <Link to="/ai" className="hover:text-chalk">
            AI Disclosure
          </Link>
          <Link to="/support" className="hover:text-chalk">
            Support
          </Link>
        </nav>
        <p className="mt-3 text-[12px] text-chalk-faint">
          {APP.company || APP.name} · {APP.name} v{APP.version}
        </p>
      </footer>
    </div>
  );
}

function Prose({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.heading}>
          <h2 className="text-[15px] font-semibold text-chalk">{s.heading}</h2>
          {s.body?.map((p, i) => (
            <p key={i} className="mt-2 text-[14px] leading-relaxed text-chalk-mute">
              {p}
            </p>
          ))}
          {s.bullets && (
            <ul className="mt-2 space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-chalk-mute">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-chalk-faint" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Nutrition() {
  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed text-chalk-mute">
        A plain summary of {APP.name}&apos;s data practices, in the style of an app-store privacy label.
      </p>
      {NUTRITION.map((g) => (
        <div key={g.title} className="rounded-card border border-line bg-ink-850 p-4">
          <p className="text-[15px] font-semibold text-chalk">{g.title}</p>
          <p className="mt-0.5 text-[12px] text-chalk-faint">{g.note}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {g.items.map((it) => (
              <li key={it} className="rounded-pill bg-ink-800 px-3 py-1 text-[13px] text-chalk ring-1 ring-line">
                {it}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A legal document at its own public URL (`/privacy`, `/terms`, `/ai`). */
export function LegalPage({ doc }: { doc: LegalDocId }) {
  const sections = DOCS[doc];
  return (
    <Shell title={LEGAL_TITLES[doc]}>
      <p className="text-[12px] uppercase tracking-wide text-chalk-faint">Last updated · {UPDATED}</p>
      {doc !== "nutrition" && (
        <div className="mt-3 rounded-card-sm border border-line bg-ink-850 p-3.5 text-[12px] leading-relaxed text-chalk-mute">
          Template for review by your legal counsel before launch — this is not legal advice, and details (company,
          governing law, arbitration provider, contact) must be completed for your business.
        </div>
      )}
      <div className="mt-6">{sections ? <Prose sections={sections} /> : <Nutrition />}</div>
    </Shell>
  );
}

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-ink-850 p-4">
      <h2 className="text-[15px] font-semibold text-chalk">{heading}</h2>
      <div className="mt-2 space-y-2 text-[14px] leading-relaxed text-chalk-mute">{children}</div>
    </section>
  );
}

/** Public support page (`/support`) — the Support URL for the store listing. */
export function SupportPage() {
  const email = APP.supportEmail;
  return (
    <Shell title="Support">
      <div className="space-y-4">
        <Block heading="Contact us">
          {email ? (
            <p>
              Email{" "}
              <a href={`mailto:${email}`} className="font-medium text-chalk underline underline-offset-2">
                {email}
              </a>{" "}
              and we&apos;ll get back to you. Include your account email and, if it&apos;s about a charge, the date of
              the payment.
            </p>
          ) : (
            <p>
              A support address hasn&apos;t been set for this build yet. Set <code>APP.supportEmail</code> in{" "}
              <code>src/config/app.ts</code> before submitting to the App Store — Apple requires a Support URL with a
              contact that actually reaches you.
            </p>
          )}
        </Block>

        <Block heading="Cancel your subscription">
          <p>
            {APP.name} subscriptions are bought through the App Store, so cancelling happens there: iOS Settings → your
            name → Subscriptions → {APP.name} → Cancel Subscription.
          </p>
          <p>You keep access until the end of the period you already paid for.</p>
        </Block>

        <Block heading="Delete your account">
          <p>
            Open {APP.name} → Settings → Delete account. This erases your expenses, subscriptions, budgets and
            categories, and closes the account itself. It cannot be undone.
          </p>
          <p>
            Deleting the account does not cancel an App Store subscription — cancel that first, using the steps above,
            so you aren&apos;t charged again.
          </p>
        </Block>

        <Block heading="Your data and privacy">
          <p>
            We don&apos;t sell your data and we don&apos;t use data brokers. What we collect, why, and who processes it
            is listed in the{" "}
            <Link to="/privacy" className="font-medium text-chalk underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </Block>
      </div>
    </Shell>
  );
}
