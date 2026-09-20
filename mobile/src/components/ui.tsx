/**
 * Native UI primitives, matching the web app's look through the shared design
 * tokens in tailwind.config.js.
 */
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

/* ── Card ────────────────────────────────────────────────────────────────── */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`rounded-card border border-line bg-ink-850 p-5 ${className}`}>{children}</View>;
}

/* ── Text bits ───────────────────────────────────────────────────────────── */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text className="text-eyebrow uppercase text-chalk-faint">{children}</Text>;
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-pill border border-line bg-ink-800 px-2.5 py-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-chalk-soft">{children}</Text>
    </View>
  );
}

/**
 * A number that shrinks to fit its line rather than overflowing the card — the
 * problem the web app solved with a measure-and-resize component. React Native
 * does this natively, so one Text with `adjustsFontSizeToFit` is the whole
 * implementation.
 */
export function FitNumber({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} className={className}>
      {children}
    </Text>
  );
}

/* ── Button ──────────────────────────────────────────────────────────────── */

/* Heights, paddings and variants mirror the web Button so the two look alike. */

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  pill?: boolean;
  leadingIcon?: ReactNode;
}

const SIZES = {
  sm: { box: "h-9 px-3.5 gap-1.5", text: "text-[14px]" },
  md: { box: "h-11 px-4 gap-2", text: "text-[15px]" },
  lg: { box: "h-[52px] px-5 gap-2", text: "text-[16px]" },
} as const;

const VARIANTS: Record<Variant, { box: string; text: string }> = {
  primary: { box: "bg-chalk", text: "text-ink-950" },
  secondary: { box: "bg-ink-850 border border-line", text: "text-chalk" },
  ghost: { box: "bg-transparent", text: "text-chalk-soft" },
};

export function Button({
  children,
  onPress,
  variant = "secondary",
  size = "md",
  fullWidth,
  disabled,
  pill,
  leadingIcon,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={[
        "flex-row items-center justify-center active:opacity-80",
        pill ? "rounded-pill" : "rounded-button",
        s.box,
        v.box,
        fullWidth ? "w-full" : "self-start",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {leadingIcon}
      <Text className={`${s.text} font-semibold ${v.text}`}>{children}</Text>
    </Pressable>
  );
}

/* ── Input ───────────────────────────────────────────────────────────────── */

/**
 * Text field matching the web Input: hairline border that darkens on focus,
 * no boxy focus ring.
 */
export function Input({
  leading,
  trailing,
  className = "",
  ...props
}: TextInputProps & { leading?: ReactNode; trailing?: ReactNode; className?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      className={`h-[52px] flex-row items-center gap-2 rounded-field border bg-ink-850 px-4 ${
        focused ? "border-chalk/50" : "border-line-strong"
      } ${className}`}
    >
      {leading}
      <TextInput
        placeholderTextColor="#AEAEB4"
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        className="h-full flex-1 text-[16px] text-chalk"
      />
      {trailing}
    </View>
  );
}

/* ── Screen header ───────────────────────────────────────────────────────── */

export function ScreenHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between gap-3">
      <View className="min-w-0 flex-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text className="mt-1 text-[26px] font-bold tracking-tight text-chalk">{title}</Text>
      </View>
      {action}
    </View>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-1 rounded-card border border-line bg-ink-800 p-4">
      <Eyebrow>{label}</Eyebrow>
      <FitNumber className="mt-1.5 text-[22px] font-semibold tracking-tight text-chalk">{value}</FitNumber>
      {sub ? <Text className="mt-0.5 text-[12px] text-chalk-mute">{sub}</Text> : null}
    </View>
  );
}
