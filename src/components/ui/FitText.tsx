import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Renders text at `maxRem`, shrinking the font down to `minRem` until it fits
 * its container width on one line. Keeps big numbers (amounts) inside their card
 * instead of overflowing off-screen.
 */
export function FitText({
  children,
  maxRem,
  minRem = 0.8,
  className,
  spanClassName,
}: {
  children: ReactNode;
  maxRem: number;
  minRem?: number;
  className?: string;
  spanClassName?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const span = spanRef.current;
    if (!wrap || !span) return;

    const fit = () => {
      let size = maxRem;
      span.style.fontSize = `${size}rem`;
      let guard = 0;
      while (span.scrollWidth > wrap.clientWidth && size > minRem && guard < 60) {
        size = Math.max(minRem, size - 0.05);
        span.style.fontSize = `${size}rem`;
        guard += 1;
      }
    };

    fit();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(fit);
      ro.observe(wrap);
    }
    return () => ro?.disconnect();
  });

  return (
    <div ref={wrapRef} className={cn("w-full overflow-hidden", className)}>
      <span ref={spanRef} className={cn("inline-block whitespace-nowrap", spanClassName)} style={{ fontSize: `${maxRem}rem` }}>
        {children}
      </span>
    </div>
  );
}
