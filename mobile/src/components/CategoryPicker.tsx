/**
 * Category chips with an inline "New" affordance, so a category can be created
 * where it's needed instead of only in Settings.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useStore } from "@/data/store";
import { Button, Input } from "./ui";

export function CategoryPicker({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const { data, addCategory } = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const create = () => {
    const label = draft.trim();
    if (!label) return;
    addCategory(label);
    // addCategory sanitizes and ignores duplicates; select by label either way
    // so the new chip is the one chosen.
    onChange(label);
    setDraft("");
    setAdding(false);
  };

  return (
    <View>
      <View className="flex-row flex-wrap gap-2">
        {data.categories.map((c) => {
          const on = c.label === value;
          return (
            <Pressable
              key={c.id}
              onPress={() => onChange(c.label)}
              className={`rounded-pill border px-3.5 py-2 active:opacity-80 ${
                on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
              }`}
            >
              <Text className={`text-[13px] font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{c.label}</Text>
            </Pressable>
          );
        })}

        {!adding ? (
          <Pressable
            onPress={() => setAdding(true)}
            className="rounded-pill border border-dashed border-line-strong px-3.5 py-2 active:opacity-70"
          >
            <Text className="text-[13px] font-medium text-chalk-mute">+ New</Text>
          </Pressable>
        ) : null}
      </View>

      {adding ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder="Category name"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={create}
            className="flex-1"
          />
          <Button variant="primary" disabled={!draft.trim()} onPress={create}>
            Add
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setAdding(false);
              setDraft("");
            }}
          >
            Cancel
          </Button>
        </View>
      ) : null}
    </View>
  );
}
