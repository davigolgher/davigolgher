import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useEscape, useLockBodyScroll, useMountTransition } from "@/lib/hooks";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Sheet that slides up from the bottom. */
export function BottomSheet({ open, onClose, title, description, children, className }: BottomSheetProps) {
  const { mounted, visible } = useMountTransition(open, 260);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = title ? "sheet-title" : undefined;

  useEscape(mounted, onClose);
  useLockBodyScroll(mounted);
  useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/40 transition-opacity duration-250 ease-premium", visible ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-app rounded-t-sheet border-t border-line bg-ink-950 pb-safe outline-none",
          "transition-transform duration-250 ease-premium",
          visible ? "translate-y-0" : "translate-y-full",
          className,
        )}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-ink-600" aria-hidden="true" />
        </div>
        {title && (
          <div className="px-5 pb-1 pt-3">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-chalk">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-chalk-mute">{description}</p>}
          </div>
        )}
        <div className="px-5 pb-6 pt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
