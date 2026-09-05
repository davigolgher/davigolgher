import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  const control = (
    <button
      id={label ? id : undefined}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={!label ? "Toggle" : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ease-premium disabled:opacity-40",
        checked ? "bg-chalk" : "bg-ink-700",
      )}
    >
      <span
        className={cn("inline-block rounded-full transition-transform duration-200 ease-premium", checked ? "translate-x-[1.15rem] bg-ink-950" : "translate-x-1 bg-chalk-mute")}
        style={{ height: "1.125rem", width: "1.125rem" }}
      />
    </button>
  );

  if (!label) return <span className={className}>{control}</span>;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-[15px] text-chalk">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-chalk-mute">{description}</span>}
      </label>
      {control}
    </div>
  );
}
