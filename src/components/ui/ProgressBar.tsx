import { cn } from "@/lib/cn";

export interface ProgressBarProps {
  value: number;
  className?: string;
  size?: "sm" | "md";
  over?: boolean;
  label?: string;
}

export function ProgressBar({ value, className, size = "md", over, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("w-full overflow-hidden rounded-pill bg-ink-700", size === "md" ? "h-2" : "h-1.5", className)}
    >
      <div
        className={cn("h-full rounded-pill transition-[width] duration-500 ease-premium", over ? "bg-chalk-mute" : "bg-chalk")}
        style={{
          width: `${clamped}%`,
          backgroundImage: over ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 4px, transparent 4px 8px)" : undefined,
        }}
      />
    </div>
  );
}
