/**
 * Monthly budgets for one dependent, by category — numbers to follow, never
 * blocks. Each is saved when its field loses focus; an empty field removes it.
 * The dependent sees the same limits on their Sharing screen.
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { familyApi } from "@/lib/backend/family";
import { BUDGET_CATEGORIES, CATEGORY_HINTS, type FamilyCategory } from "@/lib/family/categories";
import { currencySymbol } from "@/lib/family/summary";
import { amountTextToCents, centsToAmountText, sanitizeAmountText } from "~/lib/amount";
import { Input } from "~/components/ui";
import { useFamily } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Choices, Failed, FamilyScroll, Lead, Loading, Notice, Section } from "~/features/family/ui";
import { hapticSuccess } from "~/lib/haptics";

type Key = FamilyCategory | "total";
const KEYS: Key[] = ["total", ...BUDGET_CATEGORIES];

export default function Budgets() {
  const { dependent = "" } = useLocalSearchParams<{ dependent: string }>();
  const { state } = useFamily();
  const g = state?.guardian_of;
  const name = g?.dependents.find((d) => d.user_id === dependent)?.display_name ?? "them";
  const overview = useFamilyQuery(dependent ? `overview-${dependent}` : null, () => familyApi.overview(dependent));
  const [text, setText] = useState<Partial<Record<Key, string>>>({});
  const [saved, setSaved] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Budgets are in one currency at a time: the ones of the shared accounts.
  const currencies = [
    ...new Set([...(overview.data?.budgets ?? []).map((b) => b.currency ?? "BRL"), ...(overview.data?.accounts ?? []).map((a) => a.currency)]),
  ];
  const [currencyPick, setCurrencyPick] = useState<string | null>(null);
  const currency = currencyPick ?? currencies[0] ?? "BRL";

  useEffect(() => {
    if (!overview.data) return;
    const next: Partial<Record<Key, string>> = {};
    for (const b of overview.data.budgets) if ((b.currency ?? "BRL") === currency) next[b.category] = centsToAmountText(b.limit);
    setText(next);
  }, [overview.data, currency]);

  if (overview.loading) return <Loading />;
  if (!overview.data && overview.error) return <Failed message={overview.error.message} onRetry={() => void overview.reload()} />;
  if (!g) return null;

  const save = async (key: Key) => {
    const cents = amountTextToCents(text[key] ?? "");
    const existing = overview.data?.budgets.find((b) => b.category === key);
    const current = existing && (existing.currency ?? "BRL") === currency ? existing.limit : 0;
    if (cents === current) return;
    setError(null);
    try {
      await familyApi.setBudget(g.family.id, dependent, key, cents > 0 ? cents : null, currency);
      hapticSuccess();
      setSaved(key);
      void overview.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <FamilyScroll>
      <Lead>
        A monthly amount to follow for {name}, overall or by category. They'll see these limits too. Nothing is blocked — a
        budget only compares.
      </Lead>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {currencies.length > 1 ? (
        <Section label="Currency" footer="Each budget counts only spending in its currency. Setting one in another currency replaces it.">
          <Choices label="Currency" value={currency} onChange={setCurrencyPick} options={currencies.map((c) => ({ value: c, label: c }))} />
        </Section>
      ) : null}
      {KEYS.map((key) => (
        <Section key={key} label={key === "total" ? "All spending" : key}>
          <Input
            value={text[key] ?? ""}
            onChangeText={(t) => {
              setText((s) => ({ ...s, [key]: sanitizeAmountText(t) }));
              if (saved === key) setSaved(null);
            }}
            onBlur={() => void save(key)}
            keyboardType="decimal-pad"
            placeholder="No limit"
            accessibilityLabel={`${key === "total" ? "All spending" : key} monthly budget`}
            accessibilityHint="Leave empty for no limit"
            leading={<Text className="text-callout text-chalk-mute">{currencySymbol(currency)}</Text>}
          />
          <View className="mt-1 flex-row justify-between px-1">
            <Text className="text-caption text-chalk-mute">{key === "total" ? "Everything except moves between their own accounts" : CATEGORY_HINTS[key]}</Text>
            {saved === key ? <Text className="text-caption text-signal-ok">Saved</Text> : null}
          </View>
        </Section>
      ))}
    </FamilyScroll>
  );
}
