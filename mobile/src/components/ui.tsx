/**
 * Native UI primitives, matching the web app's look through the shared design
 * tokens in tailwind.config.js.
 */
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
  Pressable,
  Text,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { ChevronRightIcon } from "./icons";
import { hapticSelection } from "~/lib/haptics";
import { EASE_IN_OUT, EASE_OUT, usePressFeedback, useReducedMotion } from "~/lib/motion";

/* ── Surfaces ──────────────────────────────────────────────────────────── */

/**
 * iOS draws rounded rectangles as continuous curves — the corner eases into
 * the straight edge instead of meeting it at the end of a circular arc. Every
 * rounded surface gets it; it's the difference people feel without naming.
 */
export const CONTINUOUS: ViewStyle = Platform.OS === "ios" ? { borderCurve: "continuous" } : {};

/**
 * A card lifted off the page by a soft, semi-transparent shadow instead of a
 * solid outline: a faint 1px ring for the edge, then two layers of depth. On
 * white it reads as a surface rather than a box drawn around content.
 */
export const CARD_SURFACE: ViewStyle = {
  ...CONTINUOUS,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)",
};

/* ── Motion ──────────────────────────────────────────────────────────────── */

/**
 * Content that arrives instead of appearing: a short fade with a small rise.
 *
 * `delay` staggers siblings so a screen resolves top to bottom. Keep the gaps
 * short (30–80ms): longer and the screen feels slow to load. Nothing waits on
 * it, so taps work while it plays.
 *
 * It plays once, when the content first mounts. Tab screens stay mounted, so
 * switching back to one shows it as it was — tabs are switched dozens of times
 * a day, and content that re-arrives every time feels slow, not alive.
 *
 * Runs on the native driver, so it stays smooth while the rest of the screen is
 * still laying out. 260ms with a strong ease-out: felt, not watched. With
 * Reduce Motion it fades without moving.
 */
export function FadeIn({
  children,
  delay = 0,
  distance = 8,
  className,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    const animation = Animated.timing(t, {
      toValue: 1,
      duration: 260,
      delay,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    animation.start();
    // Stop rather than leave it running if the screen leaves mid-animation.
    return () => animation.stop();
  }, [t, delay]);

  return (
    <Animated.View
      className={className}
      style={{
        opacity: t,
        transform: reduced ? [] : [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/* ── Pressable that gives under the finger ───────────────────────────────── */

/**
 * A Pressable whose surface scales down while it's held (see
 * `usePressFeedback`).
 *
 * `className` styles the surface that moves — fill, border, radius, padding.
 * `containerClassName` is for the touch area's place in the layout (`flex-1`,
 * `self-start`), which mustn't scale or its neighbours would shift.
 */
export function PressableScale({
  children,
  className = "",
  containerClassName = "",
  scaleTo,
  style,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  scaleTo?: number;
  style?: ViewStyle;
}) {
  const press = usePressFeedback(scaleTo);
  return (
    <Pressable
      {...props}
      className={containerClassName}
      onPressIn={(e) => {
        press.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        onPressOut?.(e);
      }}
    >
      <Animated.View className={className} style={[CONTINUOUS, style, press.style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <View className={`rounded-card bg-ink-850 p-5 ${className}`} style={CARD_SURFACE}>
      {children}
    </View>
  );
}

/* ── Grouped list ────────────────────────────────────────────────────────── */

/**
 * Rows in one rounded block, the way iOS Settings groups them: a grey fill,
 * hairline separators between rows that start where the text does, and no
 * line above the first or below the last. Pass rows as direct children (not
 * wrapped in a fragment) so each one gets its separator.
 */
export function Group({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View className="overflow-hidden rounded-card-sm bg-ink-800" style={CONTINUOUS}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 ? <View className="ml-4" style={{ height: StyleSheet.hairlineWidth, backgroundColor: SEPARATOR }} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

const SEPARATOR = "rgba(0,0,0,0.18)";

/**
 * One row of a `Group`: 17pt title like iOS's own lists, an optional line
 * under it, and a chevron when it opens something. Highlights grey while
 * held, as table cells do. `trailing` replaces the chevron (a switch, a check).
 */
export function GroupRow({
  title,
  sub,
  onPress,
  trailing,
  accessibilityHint,
}: {
  title: string;
  sub?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  accessibilityHint?: string;
}) {
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-[17px] text-chalk">{title}</Text>
        {sub ? <Text className="mt-0.5 text-[13px] leading-[18px] text-chalk-mute">{sub}</Text> : null}
      </View>
      {trailing ?? (onPress ? <ChevronRightIcon size={18} color="#8A8A8F" /> : null)}
    </>
  );
  if (!onPress) return <View className="min-h-[48px] flex-row items-center gap-3 px-4 py-3">{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      className="min-h-[48px] flex-row items-center gap-3 px-4 py-3 active:bg-ink-700"
    >
      {body}
    </Pressable>
  );
}

/* ── Text bits ───────────────────────────────────────────────────────────── */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text className="text-eyebrow uppercase text-chalk-mute">{children}</Text>;
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
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      containerClassName={fullWidth ? "w-full" : "self-start"}
      className={[
        "flex-row items-center justify-center",
        pill ? "rounded-pill" : "rounded-button",
        s.box,
        v.box,
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {leadingIcon}
      <Text className={`${s.text} font-semibold ${v.text}`}>{children}</Text>
    </PressableScale>
  );
}

/* ── Segmented control ───────────────────────────────────────────────────── */

/* iOS's own segmented control, kept monochrome: a grey track and a white thumb
   that slides to the chosen segment. The shadow is the one UIKit draws under
   its thumb. */
const SEG_PAD = 2;
const SEG_TRACK = "#EEEEEF";
const SEG_THUMB_SHADOW = "0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)";

/**
 * A choice between two to four peers — expense or income, a billing period,
 * which chart.
 *
 * The thumb moves with ease-in-out (it travels across the screen rather than
 * arriving or leaving) in 220ms. Its position is set straight from the
 * measured width before the thumb first shows, so it never flashes in on the
 * wrong segment. Reduce Motion: it moves without sliding.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  role = "button",
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** "tab" when the segments switch what's shown below them. */
  role?: "button" | "tab";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [segment, setSegment] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!segment) return;
    Animated.timing(x, {
      toValue: index * segment,
      duration: reduced ? 0 : 220,
      easing: EASE_IN_OUT,
      useNativeDriver: true,
    }).start();
  }, [x, index, segment, reduced]);

  return (
    <View
      className={`h-10 flex-row rounded-pill ${className}`}
      style={{ backgroundColor: SEG_TRACK, padding: SEG_PAD }}
      onLayout={(e) => {
        const w = (e.nativeEvent.layout.width - SEG_PAD * 2) / options.length;
        // Placed before the re-render that reveals it, not animated there.
        x.setValue(index * w);
        setSegment(w);
      }}
    >
      {segment ? (
        <Animated.View
          className="absolute rounded-pill bg-ink-850"
          style={{
            pointerEvents: "none",
            top: SEG_PAD,
            bottom: SEG_PAD,
            left: SEG_PAD,
            width: segment,
            boxShadow: SEG_THUMB_SHADOW,
            transform: [{ translateX: x }],
          }}
        />
      ) : null}
      {options.map((o, i) => {
        const on = i === index;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (on) return;
              hapticSelection();
              onChange(o.value);
            }}
            accessibilityRole={role}
            accessibilityState={{ selected: on }}
            className="flex-1 items-center justify-center active:opacity-60"
          >
            <Text
              numberOfLines={1}
              className={`text-[14px] ${on ? "font-semibold text-chalk" : "font-medium text-chalk-soft"}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Input ───────────────────────────────────────────────────────────────── */

/**
 * Text field matching the web Input: hairline border that darkens on focus,
 * no boxy focus ring.
 *
 * The border colour is a style, not a class. The field's fill is `ink-850`,
 * which is plain white — the same as the screen behind it — so the border is
 * the only thing that draws the box at all, and it shouldn't hang on a
 * class-string swap with an opacity shorthand (`border-chalk/50`) on every
 * focus change.
 *
 * Don't auto-focus one of these inside a `FadeIn`: a field that takes focus
 * while its parent is mid-animation on the native driver renders blank on iOS.
 * See the budget step in OnboardingScreen.
 *
 * Fields say what they are to iOS AutoFill. One that doesn't is left to iOS's
 * guesswork, which can take an amount field right after sign-up for part of
 * the password form: it turns yellow ("Strong Password") and hides what's
 * typed. So a field that names no content type is marked as having none —
 * the email and password fields name theirs, and keep AutoFill.
 */
const BORDER = { idle: "rgba(0,0,0,0.16)", focus: "rgba(10,10,10,0.5)" };

export function Input({
  leading,
  trailing,
  className = "",
  ...props
}: TextInputProps & { leading?: ReactNode; trailing?: ReactNode; className?: string }) {
  const [focused, setFocused] = useState(false);
  const plain = props.textContentType == null && props.autoComplete == null;
  return (
    <View
      className={`h-[52px] flex-row items-center gap-2 rounded-field border bg-ink-850 px-4 ${className}`}
      style={{ ...CONTINUOUS, borderColor: focused ? BORDER.focus : BORDER.idle }}
    >
      {leading}
      <TextInput
        placeholderTextColor="#8A8A8F"
        {...(plain ? { textContentType: "none" as const, autoComplete: "off" as const } : null)}
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
        {/* iOS's large title: 34pt bold. A long one shrinks to fit beside the
            action rather than wrapping under it. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          accessibilityRole="header"
          className="mt-1 text-[34px] font-bold tracking-tight text-chalk"
        >
          {title}
        </Text>
      </View>
      {action}
    </View>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-1 rounded-card bg-ink-800 p-4" style={CONTINUOUS}>
      <Eyebrow>{label}</Eyebrow>
      <FitNumber className="mt-1.5 text-[22px] font-semibold tracking-tight text-chalk">{value}</FitNumber>
      {sub ? <Text className="mt-0.5 text-[12px] text-chalk-mute">{sub}</Text> : null}
    </View>
  );
}
