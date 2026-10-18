/**
 * Covers the app while it isn't in the foreground.
 *
 * iOS photographs the screen as an app leaves the foreground and shows that
 * picture in the app switcher — to anyone holding the phone, and without Face
 * ID. For Flow that picture was a balance, a budget or a list of charges
 * (MASVS-PLATFORM-3; Apple suggests hiding sensitive content before the
 * snapshot). `inactive` arrives before the picture is taken, so the cover is
 * already drawn by then; `background` keeps it up until the app is back.
 *
 * Nothing is unmounted, so a half-typed expense is still there on return.
 */
import { useEffect, useState } from "react";
import { AppState, StyleSheet, View, type AppStateStatus } from "react-native";
import { LogoMark } from "./Logo";

/**
 * Covered when leaving or gone. Not for "unknown" (reported before the first
 * event on some launches): no event may follow it, and a cover nothing
 * lifts would leave the app blank.
 */
export const coversApp = (state: AppStateStatus) => state === "inactive" || state === "background";

export function PrivacyShield() {
  const [covered, setCovered] = useState(() => coversApp(AppState.currentState));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setCovered(coversApp(state)));
    return () => sub.remove();
  }, []);

  if (!covered) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      className="items-center justify-center bg-ink-950"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LogoMark size={44} />
    </View>
  );
}
