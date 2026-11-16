/**
 * Before signing in: the welcome, the way to sign up or in, and "explore with
 * sample data" — the whole app, filled with an invented month, labelled on
 * every screen, kept in memory only. It exists so the first minute shows what
 * Flow does instead of asking for an email first.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import * as Localization from "expo-localization";
import type { AppData } from "@/data/types";
import { createSampleData } from "@/data/sample";
import { Button, CONTINUOUS } from "~/components/ui";
import { track } from "~/lib/analytics";

export type Entry = "welcome" | "signUp" | "signIn";

interface SampleMode {
  /** The sample month while exploring, otherwise null. */
  data: AppData | null;
  /** Which screen someone signed out sees. */
  entry: Entry;
  setEntry: (e: Entry) => void;
  start: () => void;
  /** Leave the sample, to the welcome or straight to signing up. */
  exit: (to?: Entry) => void;
}

const Ctx = createContext<SampleMode | null>(null);

function deviceCurrency(): { currency: string; locale: string } {
  try {
    const l = Localization.getLocales()[0];
    return { currency: l?.currencyCode ?? "USD", locale: l?.languageTag ?? "en-US" };
  } catch {
    return { currency: "USD", locale: "en-US" };
  }
}

export function SampleModeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [entry, setEntry] = useState<Entry>("welcome");

  const start = useCallback(() => {
    const { currency, locale } = deviceCurrency();
    setData(createSampleData(currency, new Date(), locale));
    track("sample_started");
  }, []);

  const exit = useCallback((to: Entry = "welcome") => {
    track("sample_exited", { screen: to });
    setData(null);
    setEntry(to);
  }, []);

  const value = useMemo(() => ({ data, entry, setEntry, start, exit }), [data, entry, start, exit]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const OUTSIDE: SampleMode = { data: null, entry: "welcome", setEntry: () => {}, start: () => {}, exit: () => {} };

export function useSampleMode(): SampleMode {
  return useContext(Ctx) ?? OUTSIDE;
}

/** On every screen while exploring: what this is, and the way out. */
export function SampleBanner() {
  const { data, exit } = useSampleMode();
  if (!data) return null;
  return (
    <View className="mt-3 flex-row items-center gap-3 rounded-card-sm bg-signal-warn-tint p-3" style={CONTINUOUS} accessibilityRole="summary">
      <View className="min-w-0 flex-1">
        <Text className="text-subhead font-semibold text-signal-warn">Sample data</Text>
        <Text className="mt-0.5 text-caption text-signal-warn">Invented, to show how Flow works. Nothing you do here is saved.</Text>
      </View>
      <Button variant="primary" size="sm" onPress={() => exit("signUp")}>
        Make it mine
      </Button>
    </View>
  );
}
