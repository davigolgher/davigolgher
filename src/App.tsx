import { useEffect } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { StoreProvider } from "@/data/store";
import { ToastProvider } from "@/components/ui";
import { ModalsProvider } from "@/features/modals/ModalsProvider";
import { AppShell } from "@/layout/AppShell";
import { HomeScreen } from "@/screens/HomeScreen";
import { ExpensesScreen } from "@/screens/ExpensesScreen";
import { SubsScreen } from "@/screens/SubsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

// In opaque origins (sandboxed iframe, file://) the History API blocks
// pushState/replaceState with a URL. Fall back to hash routing there.
const Router = typeof window !== "undefined" && window.origin === "null" ? HashRouter : BrowserRouter;

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ModalsProvider>
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
        </ModalsProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
