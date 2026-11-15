/**
 * Join with a code: type it (or arrive from the invitation link), see who
 * invited you, then read the terms before anything is shared.
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { familyApi, type InvitePreview } from "@/lib/backend/family";
import { KIND_LABEL } from "@/lib/family/copy";
import { Button, CONTINUOUS, Input } from "~/components/ui";
import { FamilyScroll, Lead, Notice, Section } from "~/features/family/ui";

const clean = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(clean(String(params.code ?? "")));
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = async (value = code) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const p = await familyApi.previewInvite(value);
      if (!p.found) setError("That code isn't valid. Check it with the person who invited you — codes last 7 days and work once.");
      else if (p.own_invite) setError("That's your own invitation. Send it to the person you want to add.");
      else setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Arrived from the link: look it up straight away.
  useEffect(() => {
    if (code.length === 8) void look(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FamilyScroll>
      <Lead>Enter the 8-character code from your invitation. Nothing is shared until you agree on the next screen.</Lead>
      <Section label="Invitation code">
        <Input
          value={code}
          onChangeText={(t) => {
            setCode(clean(t));
            setPreview(null);
          }}
          placeholder="ABCD 2345"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel="Invitation code"
          onSubmitEditing={() => code.length === 8 && void look()}
        />
      </Section>

      {error ? <Notice tone="alert">{error}</Notice> : null}

      {preview?.found ? (
        <View className="mt-6 rounded-card-sm bg-ink-800 p-4" style={CONTINUOUS} accessible>
          <Text className="text-caption text-chalk-mute">Invitation from</Text>
          <Text className="mt-1 text-headline font-semibold text-chalk">{preview.guardian_name}</Text>
          {preview.guardian_email ? <Text className="text-footnote text-chalk-mute">{preview.guardian_email}</Text> : null}
          <Text className="mt-3 text-footnote text-chalk-soft">
            Family "{preview.family_name}" · {KIND_LABEL[preview.kind ?? "adult"]} · up to {preview.months} months
          </Text>
        </View>
      ) : null}

      <View className="mt-8">
        {preview?.found ? (
          <Button variant="primary" size="lg" fullWidth onPress={() => router.push({ pathname: "/family/consent", params: { code } })}>
            Review what's shared
          </Button>
        ) : (
          <Button variant="primary" size="lg" fullWidth disabled={code.length !== 8 || busy} onPress={() => void look()}>
            {busy ? "Checking…" : "Continue"}
          </Button>
        )}
      </View>
      <Text className="mt-4 text-center text-caption text-chalk-mute">Don't recognise who invited you? Don't continue.</Text>
    </FamilyScroll>
  );
}
