import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-chalk-soft">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-field border bg-ink-850 px-4 transition-colors duration-150",
          "focus-within:border-chalk/50",
          error ? "border-chalk/40" : "border-line-strong",
        )}
      >
        {leading && <span className="shrink-0 text-chalk-mute">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-[52px] w-full bg-transparent text-[15px] text-chalk placeholder:text-chalk-faint focus:outline-none",
            className,
          )}
          {...props}
        />
        {trailing && <span className="shrink-0 text-chalk-mute">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-[12px] text-chalk-soft">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[12px] text-chalk-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
