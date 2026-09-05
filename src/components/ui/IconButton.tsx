import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: "surface" | "ghost" | "primary";
  size?: "sm" | "md";
  children: ReactNode;
}

const VARIANTS = {
  surface: "bg-ink-800 text-chalk-soft ring-1 ring-line hover:bg-ink-750",
  ghost: "bg-transparent text-chalk-mute hover:bg-ink-800 hover:text-chalk",
  primary: "bg-chalk text-ink-950 hover:bg-chalk/90",
};

const SIZES = { sm: "h-9 w-9", md: "h-11 w-11" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "surface", size = "md", className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-[transform,background-color] duration-150 ease-premium active:scale-95",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
