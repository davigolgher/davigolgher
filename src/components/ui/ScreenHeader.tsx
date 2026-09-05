import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ScreenHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Screen header: uppercase eyebrow, large title, optional action. Wraps on
 * narrow screens so a long title and long action never overlap.
 */
export function ScreenHeader({ eyebrow, title, action, className }: ScreenHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 pt-safe pb-2", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-eyebrow uppercase text-chalk-faint tnum">{eyebrow}</p>}
        <h1 className="text-3xl font-bold tracking-tight text-chalk">{title}</h1>
      </div>
      {action && <div className="ml-auto shrink-0 pt-1">{action}</div>}
    </header>
  );
}
