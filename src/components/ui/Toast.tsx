import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface ToastOptions {
  message: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const toast = useCallback((opts: ToastOptions) => {
    const id = ++toastSeq;
    setItems((prev) => [...prev, { ...opts, id }]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-24">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const timer = useRef<number>();
  useEffect(() => {
    timer.current = window.setTimeout(onDismiss, item.duration ?? 2600);
    return () => clearTimeout(timer.current);
  }, [item.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-[22rem] items-center gap-3 rounded-pill border border-line-strong bg-ink-850 px-4 py-3 shadow-xl shadow-black/10 animate-toast-in",
      )}
    >
      {item.icon && <span className="shrink-0 text-chalk-soft">{item.icon}</span>}
      <p className="min-w-0 flex-1 truncate text-sm text-chalk">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className="shrink-0 text-sm font-medium text-chalk underline-offset-2 hover:underline"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>.");
  return ctx;
}
