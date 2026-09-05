import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { ChevronDownIcon } from "@/components/icons";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-[13px] font-medium text-chalk-soft">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "h-[52px] w-full appearance-none rounded-field border border-line-strong bg-ink-850 pl-4 pr-10 text-[15px] text-chalk",
            "transition-colors duration-150 focus:border-chalk/30 focus:outline-none focus:ring-2 focus:ring-chalk/10",
            className,
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-chalk-mute" />
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-chalk-mute">{hint}</p>}
    </div>
  );
});
