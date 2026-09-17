/**
 * Native UI primitives, matching the web app's look through the shared design
 * tokens in tailwind.config.js.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

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

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  disabled?: boolean;
  leadingIcon?: ReactNode;
}

const PAD = { sm: "px-3.5 py-2", md: "px-4 py-3", lg: "px-5 py-4" } as const;
const TEXT = { sm: "text-[13px]", md: "text-[15px]", lg: "text-[16px]" } as const;

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  fullWidth,
  disabled,
  leadingIcon,
}: ButtonProps) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={[
        "flex-row items-center justify-center gap-2 rounded-button active:opacity-80",
        PAD[size],
        primary ? "bg-chalk" : "border border-line-strong bg-ink-800",
        fullWidth ? "w-full" : "self-start",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {leadingIcon}
      <Text className={`${TEXT[size]} font-semibold ${primary ? "text-ink-950" : "text-chalk"}`}>{children}</Text>
    </Pressable>
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
