/**
 * The web build is *only* the public legal & support pages. Flow itself is a
 * native app — see `mobile/`.
 *
 * These pages exist because App Store Connect requires a reachable **Privacy
 * Policy URL** and **Support URL**, which App Review opens straight from the
 * store listing (Google also requires the privacy one for OAuth). There is no
 * web version of the product and no sign-in here.
 */
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { LegalPage, SupportPage } from "@/features/legal/PublicPages";

// Opaque origins (sandboxed iframe, file://) block the History API.
const Router = typeof window !== "undefined" && window.origin === "null" ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/support" element={<SupportPage />} />
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/ai" element={<LegalPage doc="ai" />} />
        <Route path="/nutrition" element={<LegalPage doc="nutrition" />} />
        {/* Anything else lands on Support, which links to all of the above. */}
        <Route path="*" element={<Navigate to="/support" replace />} />
      </Routes>
    </Router>
  );
}
