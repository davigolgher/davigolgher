/**
 * React Native's primitives as plain DOM, for rendering whole screens in
 * jsdom: text is text, a Pressable is a button, a Switch is a checkbox with
 * role "switch", and accessibility props become ARIA, so tests find things the
 * way a screen reader would. Styles and animation are ignored.
 *
 * Used by a test with: vi.mock("react-native", () => import(".../react-native-dom")).
 */
import type { ReactNode } from "react";
import { vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;

const ROLE: Record<string, string> = {
  button: "button",
  link: "link",
  header: "heading",
  checkbox: "checkbox",
  radio: "radio",
  radiogroup: "radiogroup",
  progressbar: "progressbar",
  alert: "alert",
  tab: "tab",
  switch: "switch",
};

function a11y(p: P) {
  return {
    role: p.accessibilityRole ? ROLE[p.accessibilityRole] : undefined,
    "aria-label": p.accessibilityLabel,
    "aria-checked": p.accessibilityState?.checked,
    "aria-selected": p.accessibilityState?.selected,
    "aria-disabled": p.accessibilityState?.disabled || undefined,
    "aria-hidden": p.accessibilityElementsHidden || undefined,
  };
}

export const View = ({ children, ...p }: P & { children?: ReactNode }) => <div {...a11y(p)}>{children}</div>;
export const Text = ({ children, ...p }: P & { children?: ReactNode }) => <span {...a11y(p)}>{children}</span>;
export const ScrollView = ({ children }: P & { children?: ReactNode }) => <div>{children}</div>;
export const Pressable = ({ children, onPress, disabled, ...p }: P) => (
  <button type="button" onClick={disabled ? undefined : onPress} disabled={Boolean(disabled)} {...a11y(p)}>
    {typeof children === "function" ? children({ pressed: false }) : children}
  </button>
);
export const Switch = ({ value, onValueChange, disabled, accessibilityLabel }: P) => (
  <input
    type="checkbox"
    role="switch"
    aria-label={accessibilityLabel}
    checked={Boolean(value)}
    disabled={Boolean(disabled)}
    onChange={(e) => onValueChange?.(e.target.checked)}
  />
);
export const TextInput = ({ value, onChangeText, placeholder, accessibilityLabel, onBlur, onFocus, onSubmitEditing, editable }: P) => (
  <input
    aria-label={accessibilityLabel ?? placeholder}
    placeholder={placeholder}
    value={value ?? ""}
    readOnly={editable === false}
    onChange={(e) => onChangeText?.(e.target.value)}
    onBlur={onBlur}
    onFocus={onFocus}
    onKeyDown={(e) => e.key === "Enter" && onSubmitEditing?.()}
  />
);
export const ActivityIndicator = () => <span role="progressbar" />;
export const KeyboardAvoidingView = ({ children }: P & { children?: ReactNode }) => <div>{children}</div>;
export const RefreshControl = () => null;
export const Modal = ({ visible, children }: P) => (visible ? <div role="dialog">{children}</div> : null);

export const Alert = { alert: vi.fn() };
export const Share = { share: vi.fn(async () => ({ action: "sharedAction" })) };
export const Linking = { openURL: vi.fn(async () => true), openSettings: vi.fn(async () => true) };
export const Platform = { OS: "ios" as const, select: (o: P) => o.ios ?? o.default };
export const StyleSheet = { hairlineWidth: 0.5, create: <T,>(s: T) => s };
export const AppState = { currentState: "active", addEventListener: () => ({ remove() {} }) };
export const AccessibilityInfo = { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) };
export const Easing = { bezier: () => () => 0, out: () => () => 0, cubic: () => 0 };

class Value {
  constructor(public v = 0) {}
  setValue(v: number) {
    this.v = v;
  }
  interpolate() {
    return 0;
  }
}
const animation = { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop() {} };
export const Animated = { View, Text, Value, timing: () => animation, spring: () => animation, sequence: () => animation, parallel: () => animation };
