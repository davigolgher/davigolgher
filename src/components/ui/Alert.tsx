import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InfoIcon } from "@/components/icons";

export interface AlertProps {
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  emphasis?: boolean;
}

export function Alert({ title, children, icon, action, className, emphasis }: AlertProps) {
  return (
    <div
      role="note"
      className={cn("flex gap-3 rounded-card-sm border bg-ink-800 p-4", emphasis ? "border-line-strong" : "border-line", className)}
    >
      <span className="mt-0.5 shrink-0 text-chalk-mute">{icon ?? <InfoIcon size={18} />}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium text-chalk">{title}</p>}
        <div className={cn("text-[13px] leading-relaxed text-chalk-mute", title && "mt-0.5")}>{children}</div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
