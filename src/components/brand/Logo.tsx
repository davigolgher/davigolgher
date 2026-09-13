import { APP } from "@/config/app";
import { cn } from "@/lib/cn";

/**
 * Flow mark — a monochrome stack of cards (a wallet), rendered in a single
 * `currentColor`. Depth comes from opacity only, so it stays monochrome on any
 * background: dark on the light app surfaces, white on the black app icon.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} role="img" aria-label={`${APP.name} mark`}>
      {/* cards fanned back-to-front — depth via opacity keeps it monochrome */}
      <rect x="8" y="5.5" width="16" height="7" rx="2.2" fill="currentColor" opacity="0.3" />
      <rect x="6" y="9" width="20" height="7" rx="2.6" fill="currentColor" opacity="0.55" />
      {/* front card / wallet body */}
      <rect x="4" y="12.5" width="24" height="13.5" rx="3.4" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 24, showName = true, className }: { size?: number; showName?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {showName && (
        <span className="font-semibold tracking-tight text-current" style={{ fontSize: size * 0.82, letterSpacing: "-0.02em" }}>
          {APP.name}
        </span>
      )}
    </span>
  );
}
