/**
 * Motion shared by the whole app: the curves, Reduce Motion, and the feedback
 * every tappable surface gives under the finger.
 *
 * The curves are the strong variants. The platform's own ease-out is too weak
 * to read as intentional, and nothing here uses ease-in: it starts slow, at
 * the exact moment the eye is on the element.
 */
import { useRef, useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/** Entering, leaving, answering a press. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Moving across the screen, like a segmented control's thumb. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/*
 * Reduce Motion, read once for the whole app. Every pressable asks for it, and
 * a listener per button would be dozens of subscriptions for one setting.
 */
let reduceMotion = false;
let listening = false;
const listeners = new Set<() => void>();

function setReduceMotion(on: boolean) {
  if (on === reduceMotion) return;
  reduceMotion = on;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!listening) {
    listening = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether iOS Reduce Motion is on. Reduced means fewer and gentler, not none:
 * fades stay, because they explain a change; slides and scales go.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduceMotion,
    () => false,
  );
}

/**
 * Press feedback: the surface gives a little on touch-down and settles back on
 * release.
 *
 * Feedback lands on press-in, not on the tap's completion. Waiting for the
 * finger to lift is the latency people actually feel. The scale is small and
 * quick because these are touched dozens of times a day: past 3% and 160ms
 * it starts to be watched rather than felt. Bigger surfaces want less (0.98),
 * since the same ratio moves their edges further.
 *
 * With Reduce Motion the surface dims instead of shrinking.
 *
 * Runs on the native driver, so a busy JS thread can't make a tap feel late.
 */
export function usePressFeedback(scaleTo = 0.97) {
  const reduced = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;

  const to = (value: number, duration: number) =>
    Animated.timing(pressed, { toValue: value, duration, easing: EASE_OUT, useNativeDriver: true }).start();

  return {
    onPressIn: () => to(1, 100),
    onPressOut: () => to(0, 160),
    style: reduced
      ? { opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }
      : { transform: [{ scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] }) }] },
  };
}
