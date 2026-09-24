/**
 * Today's local day key, kept current.
 *
 * The store's `now` is fixed when the app starts, so a phone left open past
 * midnight would go on reviewing yesterday. This refreshes when the app returns
 * to the foreground and at local midnight while it's open. It returns the key
 * rather than a Date so nothing re-renders until the day actually changes.
 */
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { dayKey } from "@/lib/streak";

export function useTodayKey(): string {
  const [key, setKey] = useState(() => dayKey(new Date()));

  useEffect(() => {
    const refresh = () => setKey(dayKey(new Date()));
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = new Date();
      // A second past midnight, so the new key is unambiguous.
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, next.getTime() - now.getTime());
    };
    arm();

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return key;
}
