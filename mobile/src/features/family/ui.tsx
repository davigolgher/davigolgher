/**
 * The pieces Flow Family's screens are built from, on top of the app's own
 * kit (components/ui): same surfaces, same type, same grouped lists. Every
 * size and colour comes from the design tokens.
 *
 * Each screen handles four states the same way: loading, empty, error with a
 * retry, and offline (the last copy on this phone, with its time).
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, CONTINUOUS, Eyebrow, GroupRow, PressableScale } from "~/components/ui";
import { hapticSelection } from "~/lib/haptics";
import { colors, layout } from "~/theme/tokens";

/* ── Screen ─────────────────────────────────────────────────────────────── */

export function FamilyScroll({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingTop: layout.gutter / 2, paddingBottom: insets.bottom + layout.sectionGap }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.chalk.mute} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Section({ label, children, footer }: { label?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <View className="mt-8">
      {label ? (
        <View accessibilityRole="header">
          <Eyebrow>{label}</Eyebrow>
        </View>
      ) : null}
      <View className={label ? "mt-2" : ""}>{children}</View>
      {footer ? <Text className="mt-2 px-4 text-caption text-chalk-mute">{footer}</Text> : null}
    </View>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <Text className="mt-2 text-body text-chalk-soft">{children}</Text>;
}

/* ── Notices ────────────────────────────────────────────────────────────── */

type Tone = "info" | "alert" | "warn" | "ok";

const TONE: Record<Tone, { box: string; text: string }> = {
  info: { box: "bg-ink-800", text: "text-chalk" },
  alert: { box: "bg-signal-alert-tint", text: "text-signal-alert" },
  warn: { box: "bg-signal-warn-tint", text: "text-signal-warn" },
  ok: { box: "bg-signal-ok-tint", text: "text-signal-ok" },
};

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = TONE[tone];
  return (
    <View className={`mt-4 rounded-card-sm p-4 ${t.box}`} style={CONTINUOUS} accessibilityRole={tone === "alert" ? "alert" : undefined}>
      {title ? <Text className={`text-subhead font-semibold ${t.text}`}>{title}</Text> : null}
      {children ? <Text className={`${title ? "mt-1" : ""} text-footnote ${tone === "info" ? "text-chalk-soft" : t.text}`}>{children}</Text> : null}
      {action ? <View className="mt-3">{action}</View> : null}
    </View>
  );
}

/** "Offline — showing what was saved at 14:02." */
export function SavedNotice({ savedAt }: { savedAt: string | null }) {
  if (!savedAt) return null;
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(savedAt));
  return (
    <Notice tone="warn" title="Offline">
      Showing what was saved on this phone on {when}. It updates when you're back online.
    </Notice>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View className="items-center py-16" accessible accessibilityLabel={label}>
      <ActivityIndicator color={colors.chalk.mute} />
      <Text className="mt-3 text-footnote text-chalk-mute">{label}</Text>
    </View>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View className="items-center px-4 py-12">
      <Text className="text-center text-headline font-semibold text-chalk">{title}</Text>
      {children ? <Text className="mt-2 text-center text-footnote text-chalk-mute">{children}</Text> : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="items-center px-4 py-12" accessibilityRole="alert">
      <Text className="text-center text-headline font-semibold text-chalk">Couldn't load this</Text>
      <Text className="mt-2 text-center text-footnote text-chalk-mute">{message}</Text>
      {onRetry ? (
        <View className="mt-5">
          <Button variant="secondary" onPress={onRetry}>
            Try again
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/* ── Rows and controls ──────────────────────────────────────────────────── */

export function SwitchRow({
  title,
  sub,
  value,
  onChange,
  disabled,
}: {
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <GroupRow
      title={title}
      sub={sub}
      trailing={
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: colors.ink[700], true: colors.chalk.DEFAULT }}
          thumbColor={colors.ink[950]}
          ios_backgroundColor={colors.ink[700]}
        />
      }
    />
  );
}

/** Two to four peers as pills; one is chosen. */
export function Choices<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={String(o.value)}
            onPress={() => {
              if (!on) hapticSelection();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            className={`rounded-pill border px-4 py-2.5 ${on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"}`}
          >
            <Text className={`text-footnote font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A box to tick, with the whole line as the target. */
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onChange(!checked);
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="mt-3 flex-row items-start gap-3 py-1 active:opacity-60"
    >
      <View
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${checked ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"}`}
        style={CONTINUOUS}
      >
        {checked ? <Text className="text-caption font-bold text-ink-950">✓</Text> : null}
      </View>
      <Text className="flex-1 text-footnote text-chalk">{children}</Text>
    </Pressable>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <View className={`self-start rounded-pill px-2.5 py-1 ${t.box}`}>
      <Text className={`text-micro font-semibold uppercase ${t.text}`}>{children}</Text>
    </View>
  );
}

/** A bar for a share or a budget; announced as a percentage. */
export function Bar({ pct, over = false, label }: { pct: number; over?: boolean; label: string }) {
  const width = Math.max(2, Math.min(100, pct));
  return (
    <View
      className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-ink-750"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(pct, 100)), text: over ? "Over the limit" : `${Math.round(pct)}%` }}
    >
      <View className={`h-full rounded-pill ${over ? "bg-signal-alert" : "bg-chalk"}`} style={{ width: `${width}%` }} />
    </View>
  );
}

/** A label above a value, in a grey tile. */
export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-1 rounded-card-sm bg-ink-800 p-4" style={CONTINUOUS} accessible accessibilityLabel={`${label}: ${value}${sub ? `. ${sub}` : ""}`}>
      <Eyebrow>{label}</Eyebrow>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} className="mt-1.5 text-metric-sm font-semibold text-chalk">
        {value}
      </Text>
      {sub ? <Text className="mt-0.5 text-caption text-chalk-mute">{sub}</Text> : null}
    </View>
  );
}
