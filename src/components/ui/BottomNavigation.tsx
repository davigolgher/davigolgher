import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { HomeIcon, ReceiptIcon, RepeatIcon, BarChartIcon, GearIcon, type IconComponent } from "@/components/icons";

interface NavItem {
  to: string;
  label: string;
  Icon: IconComponent;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/expenses", label: "Expenses", Icon: ReceiptIcon },
  { to: "/subs", label: "Subs", Icon: RepeatIcon },
  { to: "/reports", label: "Reports", Icon: BarChartIcon },
  { to: "/settings", label: "Settings", Icon: GearIcon },
];

export function BottomNavigation() {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-950/90 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-app items-stretch justify-around px-2 pb-safe pt-2">
        {ITEMS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-field py-1.5 text-[11px] font-medium transition-colors duration-150",
                  isActive ? "text-chalk" : "text-chalk-faint hover:text-chalk-mute",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2 : 1.6} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
