import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { BottomNavigation } from "@/components/ui";
import { recordActivityToday } from "@/lib/activity";

export function AppShell() {
  // Using the app counts toward the streak (Duolingo-style), not only logging.
  useEffect(() => {
    recordActivityToday();
  }, []);

  return (
    <div className="relative min-h-full">
      <main className="app-shell min-h-full px-5 pb-28">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
