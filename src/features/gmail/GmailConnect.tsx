import { createPortal } from "react-dom";
import { APP, GOOGLE } from "@/config/app";
import { useMountTransition } from "@/lib/hooks";
import { cn } from "@/lib/cn";

function GoogleG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/**
 * Google-style OAuth consent for connecting Gmail. Reading a real inbox needs
 * Google OAuth + a backend that holds the token and calls the Gmail API — none
 * of which can live safely in a static frontend. So this runs the consent UI
 * and, on Allow, imports sample receipts. Set GOOGLE.clientId (+ a backend) to
 * make it real.
 */
export function GmailConnect({
  open,
  email,
  onClose,
  onAllow,
}: {
  open: boolean;
  email?: string;
  onClose: () => void;
  onAllow: () => void;
}) {
  const { mounted, visible } = useMountTransition(open, 220);
  if (!mounted) return null;

  const account = email && email.includes("@") ? email : "you@gmail.com";
  const initial = account.charAt(0).toUpperCase();

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in with Google"
        className={cn(
          "relative w-full max-w-[26rem] overflow-hidden rounded-[16px] bg-white shadow-2xl transition-all duration-200 ease-premium",
          visible ? "translate-y-0 opacity-100 scale-100" : "translate-y-2 opacity-0 scale-[0.98]",
        )}
      >
        <div className="px-7 pb-6 pt-7">
          <div className="flex items-center gap-2">
            <GoogleG />
            <span className="text-[14px] font-medium text-[#5f6368]">Sign in with Google</span>
          </div>

          <h2 className="mt-5 text-[22px] font-normal leading-snug text-[#202124]">{APP.name} wants to access your Google Account</h2>

          <div className="mt-4 flex items-center gap-2.5 rounded-full border border-[#dadce0] py-1.5 pl-1.5 pr-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1a73e8] text-[13px] font-medium text-white">{initial}</span>
            <span className="truncate text-[14px] text-[#3c4043]">{account}</span>
          </div>

          <p className="mt-5 text-[14px] font-medium text-[#202124]">This will allow {APP.name} to:</p>
          <div className="mt-2 flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m4 7 8 5.5L20 7" />
              </svg>
            </span>
            <span className="text-[14px] leading-relaxed text-[#3c4043]">
              View your email messages and settings
              <span className="mt-0.5 block text-[12px] text-[#5f6368]">Read-only access ({GOOGLE.scopes[0].split("/").pop()})</span>
            </span>
          </div>

          <p className="mt-5 text-[12px] leading-relaxed text-[#5f6368]">
            Make sure you trust {APP.name}. You can remove access anytime in your Google Account. Real access requires Google
            verification and a backend — this demo imports sample receipts.
          </p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[4px] px-4 py-2 text-[14px] font-medium text-[#1a73e8] transition-colors hover:bg-[#f6fafe]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onAllow}
              className="rounded-[4px] bg-[#1a73e8] px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b66c9]"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
