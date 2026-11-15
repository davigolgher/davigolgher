/** Start a family: its name, and how the guardian appears to the people they invite. */
import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { familyApi } from "@/lib/backend/family";
import { Button, Input } from "~/components/ui";
import { useFamily } from "~/features/family/FamilyProvider";
import { FamilyScroll, Lead, Notice, Section } from "~/features/family/ui";

export default function CreateFamily() {
  const { refresh } = useFamily();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = name.trim().length > 0 && displayName.trim().length > 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await familyApi.create(name.trim(), displayName.trim());
      await refresh();
      router.replace("/family/invite");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FamilyScroll>
      <Lead>You'll be the guardian: you invite people, and see what they choose to share with you.</Lead>
      <Section label="Family name">
        <Input value={name} onChangeText={setName} placeholder="e.g. The Silvas" maxLength={60} accessibilityLabel="Family name" autoCapitalize="words" />
      </Section>
      <Section label="Your name" footer="This is how the people you invite will see you, in the invitation and on their sharing screen.">
        <Input value={displayName} onChangeText={setDisplayName} placeholder="e.g. Mum, or Maria" maxLength={60} accessibilityLabel="Your name" autoCapitalize="words" />
      </Section>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <View className="mt-8">
        <Button variant="primary" size="lg" fullWidth disabled={!ok || busy} onPress={create}>
          {busy ? "Creating…" : "Create family"}
        </Button>
      </View>
      <Text className="mt-4 text-center text-caption text-chalk-mute">
        Free for one person and one account. A Flow subscription adds more people, more alerts and the PDF report.
      </Text>
    </FamilyScroll>
  );
}
