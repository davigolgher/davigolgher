import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider, useStore } from "@/data/store";
import { ToastProvider } from "@/components/ui";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { fetchBilling, isActive, type BillingRow } from "@/lib/backend/billing";
import { FlowProvider, useFlow } from "@/features/flow/FlowProvider";
import { LegalPage, SupportPage } from "@/features/legal/PublicPages";
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
        {/*
          Public, no account required. App Store Connect's Privacy Policy / EULA /
          Support URLs point here and App Review opens them from the listing, so
          they are matched *before* the gate below.
        */}
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/ai" element={<LegalPage doc="ai" />} />
        <Route path="/support" element={<SupportPage />} />

        {/* Everything else needs an account and an active subscription. */}
        <Route element={<Gate />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/expenses" element={<ExpensesScreen />} />
            <Route path="/subs" element={<SubsScreen />} />
            <Route path="/reports" element={<ReportsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
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

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-chalk/30 border-t-chalk" aria-label="Loading" />
    </div>
  );
}

function Gate() {
  const flow = useFlow();
  const auth = useAuth();
  const [billing, setBilling] = useState<BillingRow | null>(null);

  // Connected mode: read the user's subscription status from the billing table.
  useEffect(() => {
    if (!auth.configured || !auth.userId) {
      setBilling(null);
      return;
    }
    let ok = true;
    fetchBilling()
      .then((b) => {
        if (ok) setBilling(b);
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [auth.configured, auth.userId]);

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

  // Connected mode: the real Supabase session decides sign-in. Local mode: the funnel flag.
  if (auth.configured && auth.loading) return <Splash />;
  const signedUp = auth.configured ? Boolean(auth.session) : flow.signedUp;

  if (!signedUp) return <SignUpScreen />;
  const subscribed = auth.configured ? isActive(billing) || flow.subscribed : flow.subscribed;
  if (!subscribed) return <OnboardingScreen />;
  return (
    <>
      <Outlet />
      {!flow.tutorialDone && <TutorialOverlay />}
      <RatingGate />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <ToastProvider>
          <FlowProvider>
            <ModalsProvider>
              <AppRoutes />
            </ModalsProvider>
          </FlowProvider>
        </ToastProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
