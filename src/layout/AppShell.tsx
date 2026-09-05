import { Outlet } from "react-router-dom";
import { BottomNavigation } from "@/components/ui";

export function AppShell() {
  return (
    <div className="relative min-h-full">
      <main className="app-shell min-h-full px-5 pb-28">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
}
