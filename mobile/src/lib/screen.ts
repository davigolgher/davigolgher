/**
 * Padding for a tab screen's scroll view.
 *
 * On iOS the native tab bar adjusts each screen's first scroll view itself
 * (`contentInsetAdjustmentBehavior` "automatic"): it starts below the status
 * bar and scrolls clear of the tab bar, which content passes under. Adding the
 * safe-area insets as well would count them twice. Elsewhere — the web build —
 * the top inset is added here; Android's native tabs pad the bottom
 * themselves.
 */
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function useTabScreenPadding(bottom = 32) {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: Platform.OS === "ios" ? 12 : insets.top + 12,
    paddingBottom: bottom,
    paddingHorizontal: 24,
  };
}
