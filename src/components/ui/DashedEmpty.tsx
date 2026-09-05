import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DashedEmptyProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function DashedEmpty({ children, action, className }: DashedEmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 rounded-card border border-dashed border-line-strong px-6 py-14 text-center",
        className,
      )}
    >
      <p className="max-w-[20rem] text-[15px] text-chalk-mute">{children}</p>
      {action}
    </div>
  );
}
