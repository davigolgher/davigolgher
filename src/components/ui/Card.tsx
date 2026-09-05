import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  radius?: "card" | "card-sm";
  elevated?: boolean;
  padded?: boolean;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { radius = "card", elevated, padded = true, interactive, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "border border-line",
        radius === "card" ? "rounded-card" : "rounded-card-sm",
        elevated ? "bg-ink-800" : "bg-ink-850",
        padded && "p-5",
        interactive &&
          "cursor-pointer transition-[transform,background-color] duration-150 ease-premium hover:bg-ink-800 active:scale-[0.99]",
        className,
      )}
      {...props}
    />
  );
});
