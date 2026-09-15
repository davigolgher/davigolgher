import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FitText } from "./FitText";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}

/** Overview stat card: an uppercase label, one big number, an optional subline. */
export function StatCard({ label, value, sub, className }: StatCardProps) {
  return (
    <div className={cn("rounded-card border border-line bg-ink-850 p-4", className)}>
      <p className="text-eyebrow uppercase text-chalk-faint">{label}</p>
      <FitText maxRem={1.375} minRem={0.8} className="mt-3" spanClassName="font-semibold leading-none tracking-tight text-chalk tnum">
        {value}
      </FitText>
      {sub && <p className="mt-2 text-[13px] text-chalk-mute tnum">{sub}</p>}
    </div>
  );
}
