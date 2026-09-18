/**
 * In-app legal & privacy viewer (web). The document text lives in ./content so
 * the native app renders exactly the same words — see mobile/README.md.
 */
import { createPortal } from "react-dom";
import { APP } from "@/config/app";
import { Button } from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";
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

export { LEGAL_TITLES, type LegalDocId };

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
        A plain summary of {APP.name}&apos;s data practices, in the style of an app-store privacy label. In this version your data
        stays on your device; the categories below reflect data handling once account, payment, and Gmail features are live.
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

/**
 * The document itself, without any chrome — shared by the in-app viewer and the
 * public `/privacy` · `/terms` pages (App Store review needs those reachable
 * without an account).
 */
export function LegalBody({ doc }: { doc: LegalDocId }) {
  const isTemplate = doc !== "nutrition";
  return (
    <>
      <p className="text-[12px] uppercase tracking-wide text-chalk-faint">Last updated · {UPDATED}</p>
      {isTemplate && (
        <div className="mt-3 rounded-card-sm border border-line bg-ink-850 p-3.5 text-[12px] leading-relaxed text-chalk-mute">
          Template for review by your legal counsel before launch — this is not legal advice, and details (company,
          governing law, arbitration provider, contact) must be completed for your business.
        </div>
      )}
      <div className="mt-6">
        {doc === "terms" && <Prose sections={TERMS} />}
        {doc === "privacy" && <Prose sections={PRIVACY} />}
        {doc === "ai" && <Prose sections={AI} />}
        {doc === "nutrition" && <Nutrition />}
      </div>
    </>
  );
}

export function LegalViewer({ doc, onClose }: { doc: LegalDocId; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-ink-950 animate-fade-in">
      <div className="app-shell flex min-h-full flex-col px-6 pb-12 pt-safe">
        <div className="sticky top-0 -mx-6 flex items-center gap-3 border-b border-line-soft bg-ink-950/90 px-6 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="-ml-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full text-chalk-mute transition-colors hover:bg-ink-800 hover:text-chalk"
          >
            <ChevronLeftIcon size={22} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight text-chalk">{LEGAL_TITLES[doc]}</h1>
        </div>

        <div className="pt-5">
          <LegalBody doc={doc} />

          <Button variant="secondary" fullWidth className="mt-8" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
