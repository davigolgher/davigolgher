import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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
      <p className="mt-3 text-[1.375rem] font-semibold leading-none tracking-tight text-chalk tnum">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-chalk-mute tnum">{sub}</p>}
    </div>
  );
}
