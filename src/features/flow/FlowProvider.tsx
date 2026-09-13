import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * User funnel state (sign-up → paywall → tutorial → rating), persisted in
 * localStorage so the flow is only shown once. This is UI/local state; real
 * auth + payment happen with the backend (Supabase) / native (Expo, Stripe).
 */
export type PlanId = "monthly" | "yearly";

export interface FlowState {
  signedUp: boolean;
  subscribed: boolean;
  tutorialDone: boolean;
  ratingDone: boolean;
  reminders: boolean;
  email?: string;
  plan?: PlanId;
}

const KEY = "walletflow.flow.v1";
const DEFAULT: FlowState = {
  signedUp: false,
  subscribed: false,
  tutorialDone: false,
  ratingDone: false,
  reminders: false,
};

function read(): FlowState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<FlowState>) };
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

interface FlowContextValue extends FlowState {
  signUp: (email?: string) => void;
  subscribe: (plan?: PlanId) => void;
  finishTutorial: () => void;
  finishRating: () => void;
  setReminders: (on: boolean) => void;
  reset: () => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(read);

  const update = useCallback((patch: Partial<FlowState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<FlowContextValue>(
    () => ({
      ...state,
      signUp: (email) => update({ signedUp: true, email }),
      subscribe: (plan) => update({ subscribed: true, ...(plan ? { plan } : {}) }),
      finishTutorial: () => update({ tutorialDone: true }),
      finishRating: () => update({ ratingDone: true }),
      setReminders: (on) => update({ reminders: on }),
      reset: () => update({ ...DEFAULT }),
    }),
    [state, update],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be inside <FlowProvider>.");
  return ctx;
}
