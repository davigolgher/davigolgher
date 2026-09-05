import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useEscape, useLockBodyScroll, useMountTransition } from "@/lib/hooks";
import { IconButton } from "./IconButton";
import { CloseIcon } from "@/components/icons";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Centered dialog with overlay, scale-in, Escape/overlay close. */
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const { mounted, visible } = useMountTransition(open, 200);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = title ? "modal-title" : undefined;

  useEscape(mounted, onClose);
  useLockBodyScroll(mounted);

  useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200 ease-premium", visible ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-[400px] rounded-card border border-line bg-ink-850 p-5 shadow-2xl shadow-black/20 outline-none",
          "transition-[opacity,transform] duration-200 ease-premium",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className,
        )}
      >
        {title && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-chalk">
              {title}
            </h2>
            <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}>
              <CloseIcon size={18} />
            </IconButton>
          </div>
        )}
        <div>{children}</div>
        {footer && <div className="mt-5 flex gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
