import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function Segmented<T extends string>({ options, value, onChange, className, "aria-label": ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-12 rounded-field text-[15px] font-semibold transition-colors duration-150 active:scale-[0.98]",
              active ? "bg-chalk text-ink-950" : "bg-ink-850 text-chalk ring-1 ring-line-strong hover:bg-ink-800",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
