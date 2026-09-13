import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider, useStore } from "@/data/store";
import { ToastProvider } from "@/components/ui";
import { FlowProvider, useFlow } from "@/features/flow/FlowProvider";
import { ModalsProvider } from "@/features/modals/ModalsProvider";
import { SignUpScreen } from "@/features/onboarding/SignUpScreen";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { TutorialOverlay } from "@/features/onboarding/TutorialOverlay";
import { RatingSheet } from "@/features/rating/RatingSheet";
import { AppShell } from "@/layout/AppShell";
import { HomeScreen } from "@/screens/HomeScreen";
import { ExpensesScreen } from "@/screens/ExpensesScreen";
import { SubsScreen } from "@/screens/SubsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

// Opaque origins (sandboxed iframe, file://) block the History API — fall back to hash routing.
const Router = typeof window !== "undefined" && window.origin === "null" ? HashRouter : BrowserRouter;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/expenses" element={<ExpensesScreen />} />
          <Route path="/subs" element={<SubsScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

/** Shows the "rate this app" sheet once, after a little real usage. */
function RatingGate() {
  const { data } = useStore();
  const flow = useFlow();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!flow.ratingDone && data.transactions.length >= 3) {
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, [data.transactions.length, flow.ratingDone]);

  return <RatingSheet open={open} onClose={() => setOpen(false)} />;
}

function Gate() {
  const flow = useFlow();

  // Return from a real Stripe Payment Link redirect (?checkout=success[&plan=…]).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const co = params.get("checkout");
      if (!co) return;
      if (co === "success") {
        const plan = params.get("plan");
        flow.subscribe(plan === "monthly" || plan === "yearly" ? plan : undefined);
      }
      params.delete("checkout");
      params.delete("plan");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    } catch {
      /* ignore */
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!flow.signedUp) return <SignUpScreen />;
  if (!flow.subscribed) return <OnboardingScreen />;
  return (
    <>
      <AppRoutes />
      {!flow.tutorialDone && <TutorialOverlay />}
      <RatingGate />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <FlowProvider>
          <ModalsProvider>
            <Gate />
          </ModalsProvider>
        </FlowProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
