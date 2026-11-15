/**
 * The consent screen: what is shared, with whom, for how long, what never is,
 * and how to stop — then an explicit agreement.
 *
 * Agreeing records, on the server, the date, the version of these terms, the
 * period, and the network address the agreement came from (0011). An adult
 * confirms being 18 or over and consents for themselves. For a child or a
 * person under curatela, the parent or legal representative consented when
 * they made the invitation; the person confirms here (a child by their date
 * of birth, so the right person joins) and sees everything they are agreeing
 * to share.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { familyApi, type InvitePreview } from "@/lib/backend/family";
import { CONSENT_DURATIONS, CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";
import { Button, Input } from "~/components/ui";
import { useFamily } from "~/features/family/FamilyProvider";
import { parseBirthdate, TermView } from "~/features/family/Term";
import { Check, Choices, Failed, FamilyScroll, Lead, Loading, Notice, Section } from "~/features/family/ui";
import { hapticSuccess } from "~/lib/haptics";

export default function Consent() {
  const { code = "" } = useLocalSearchParams<{ code?: string }>();
  const { refresh } = useFamily();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [months, setMonths] = useState<number>(12);
  const [displayName, setDisplayName] = useState("");
  const [adult, setAdult] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [birthText, setBirthText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const p = await familyApi.previewInvite(String(code));
      if (!p.found) throw new Error("This invitation is no longer valid. Ask for a new one.");
      setPreview(p);
      setMonths(p.months ?? 12);
      setDisplayName((n) => n || p.label || "");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loadError) return <Failed message={loadError} onRetry={() => void load()} />;
  if (!preview) return <Loading />;

  const kind = preview.kind ?? "adult";
  const guardian = preview.guardian_name ?? "the guardian";
  const outdated = preview.term_version !== CONSENT_TERM_VERSION;
  const birthdate = kind === "minor" ? parseBirthdate(birthText) : null;
  const ready =
    !outdated && understood && displayName.trim().length > 0 && (kind !== "adult" || adult) && (kind !== "minor" || birthdate !== null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await familyApi.acceptInvite({
        code: String(code),
        displayName: displayName.trim(),
        termVersion: CONSENT_TERM_VERSION,
        months,
        confirmAdult: kind === "adult" && adult,
        birthdate,
      });
      if (!res.ok) throw new Error("This invitation is no longer valid. Ask for a new one.");
      hapticSuccess();
      await refresh();
      router.dismissAll();
      router.push("/family/connect");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FamilyScroll>
      <Text className="mt-2 text-title font-bold text-chalk" accessibilityRole="header">
        Share your spending with {guardian}?
      </Text>
      <Lead>
        {guardian}
        {preview.guardian_email ? ` (${preview.guardian_email})` : ""} invited you to the family "{preview.family_name}". Read what
        this means before agreeing.
      </Lead>

      {outdated ? (
        <Notice tone="warn" title="Update Flow to continue">
          These terms changed since this version of the app. Update Flow from the App Store, then open the invitation again.
        </Notice>
      ) : null}

      {kind !== "adult" ? (
        <Notice title={kind === "minor" ? "Your parent or guardian has agreed" : "Your legal representative has agreed"}>
          {guardian} consented on your behalf, as the law asks for {kind === "minor" ? "people under 18" : "people under curatela"}. You
          still see exactly what is shared, and you can stop it yourself at any time.
        </Notice>
      ) : null}

      <Section label="The terms">
        <TermView guardian={guardian} />
        <Pressable onPress={() => router.push("/legal?doc=family")} accessibilityRole="link" className="mt-2 self-start py-2 active:opacity-60">
          <Text className="text-footnote font-medium text-chalk-mute underline">Flow Family Privacy & Terms</Text>
        </Pressable>
      </Section>

      <Section label="For how long" footer={kind === "minor" ? "Ends on this date, or on your 18th birthday if that comes first." : "It ends by itself on that date. You can stop sooner."}>
        {kind === "adult" ? (
          <Choices label="For how long" value={months} onChange={setMonths} options={CONSENT_DURATIONS.map((m) => ({ value: m, label: `${m} months` }))} />
        ) : (
          <Text className="text-body text-chalk">{months} months, as chosen by {guardian}</Text>
        )}
      </Section>

      <Section label="Your name for them" footer={`How ${guardian} will see you.`}>
        <Input value={displayName} onChangeText={setDisplayName} maxLength={60} accessibilityLabel="Your name for them" autoCapitalize="words" />
      </Section>

      {kind === "minor" ? (
        <Section label="Your date of birth" footer="To check the invitation is for you.">
          <Input value={birthText} onChangeText={setBirthText} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="Your date of birth, day month year" />
        </Section>
      ) : null}

      <Section label="Your agreement">
        {kind === "adult" ? (
          <Check checked={adult} onChange={setAdult}>
            I'm 18 or older and I'm agreeing for myself.
          </Check>
        ) : null}
        <Check checked={understood} onChange={setUnderstood}>
          I've read what is shared and what isn't. I understand that {guardian} will see the spending in the accounts I choose, and that I
          can stop sharing at any time in Family → Sharing.
        </Check>
      </Section>

      {error ? <Notice tone="alert">{error}</Notice> : null}

      <View className="mt-8 gap-3">
        <Button variant="primary" size="lg" fullWidth disabled={!ready || busy} onPress={accept}>
          {busy ? "Saving…" : "Agree and continue"}
        </Button>
        <Button variant="secondary" size="lg" fullWidth disabled={busy} onPress={() => router.back()}>
          Not now
        </Button>
      </View>
      <Text className="mt-4 text-center text-caption text-chalk-mute">
        We record when you agreed, the version of these terms ({CONSENT_TERM_VERSION}) and your network address, as proof of
        consent. Next, you choose which accounts to share — nothing is shared until you do.
      </Text>
    </FamilyScroll>
  );
}
