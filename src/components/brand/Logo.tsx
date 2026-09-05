import { APP } from "@/config/app";
import { cn } from "@/lib/cn";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} role="img" aria-label={`${APP.name} mark`}>
      <path d="M25.40 12.58 A10 10 0 1 1 19.42 6.60" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23.07" cy="8.93" r="2.7" fill="currentColor" />
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
