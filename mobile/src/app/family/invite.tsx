/**
 * Invite someone. The guardian says who they are inviting; for a child or a
 * person under curatela, the guardian consents here as their legal
 * representative (LGPD art. 14), and the person then confirms on their own
 * phone. An adult consents for themselves, later, on theirs.
 *
 * The result is an 8-character code, valid for 7 days and once. Only its hash
 * is stored, so it can be shown now and never again.
 */
import { useState } from "react";
import { Share, Text, View } from "react-native";
import { router } from "expo-router";
import { familyApi, type DependentKind } from "@/lib/backend/family";
import { CONSENT_DURATIONS, CONSENT_TERM_VERSION, DEFAULT_CONSENT_MONTHS } from "@/lib/family/consentTerm";
import { KIND_HINT, KIND_LABEL } from "@/lib/family/copy";
import { APP } from "@/config/app";
import { Button, CONTINUOUS, Input } from "~/components/ui";
import { useFamily } from "~/features/family/FamilyProvider";
import { parseBirthdate, TermView } from "~/features/family/Term";
import { Check, Choices, FamilyScroll, Lead, Notice, Section } from "~/features/family/ui";

const KINDS: DependentKind[] = ["adult", "minor", "ward"];
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function Invite() {
  const { state, refresh } = useFamily();
  const g = state?.guardian_of;
  const [kind, setKind] = useState<DependentKind>("adult");
  const [label, setLabel] = useState("");
  const [months, setMonths] = useState<number>(DEFAULT_CONSENT_MONTHS);
  const [birthText, setBirthText] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; expires_at: string } | null>(null);

  if (!g) {
    return (
      <FamilyScroll>
        <Notice title="Start a family first">You need a family before you can invite anyone.</Notice>
        <View className="mt-4">
          <Button variant="primary" onPress={() => router.replace("/family/create")}>
            Start a family
          </Button>
        </View>
      </FamilyScroll>
    );
  }

  const represented = kind !== "adult";
  const birthdate = kind === "minor" ? parseBirthdate(birthText) : null;
  const ready = label.trim().length > 0 && (kind !== "minor" || birthdate !== null) && (!represented || declared);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await familyApi.createInvite({
        familyId: g.family.id,
        kind,
        label: label.trim(),
        months,
        birthdate,
        representativeDeclared: represented ? declared : false,
        termVersion: CONSENT_TERM_VERSION,
      });
      setResult({ code: res.code, expires_at: res.expires_at });
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const pretty = `${result.code.slice(0, 4)} ${result.code.slice(4)}`;
    const message =
      `${g.display_name} invited you to share spending with "${g.family.name}" on ${APP.name}.\n\n` +
      `Open ${APP.name}, go to Family, choose "I have an invitation code" and enter: ${result.code}\n` +
      `Or tap: flow://family/join?code=${result.code}\n\n` +
      `The code works once, until ${dateFmt.format(new Date(result.expires_at))}. You'll see exactly what is shared before agreeing.`;
    return (
      <FamilyScroll>
        <Text className="mt-2 text-title font-bold text-chalk" accessibilityRole="header">
          Invitation ready
        </Text>
        <Lead>Send this code to {label.trim()}. It's shown only now — if it's lost, cancel it and make another.</Lead>
        <View className="mt-6 items-center rounded-card bg-ink-800 px-4 py-8" style={CONTINUOUS} accessible accessibilityLabel={`Code ${result.code.split("").join(" ")}`}>
          <Text selectable className="text-metric font-bold text-chalk">
            {pretty}
          </Text>
          <Text className="mt-3 text-footnote text-chalk-mute">Works once, until {dateFmt.format(new Date(result.expires_at))}</Text>
        </View>
        <View className="mt-6 gap-3">
          <Button variant="primary" size="lg" fullWidth onPress={() => void Share.share({ message })}>
            Share invitation
          </Button>
          <Button variant="secondary" size="lg" fullWidth onPress={() => router.back()}>
            Done
          </Button>
        </View>
      </FamilyScroll>
    );
  }

  return (
    <FamilyScroll>
      <Section label="Who are you inviting?">
        <Choices label="Who are you inviting" value={kind} onChange={(k) => { setKind(k); setDeclared(false); }} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <Text className="mt-3 text-footnote text-chalk-mute">{KIND_HINT[kind]}</Text>
      </Section>

      <Section label="Their name" footer="Just for you and them — a first name or a nickname is enough.">
        <Input value={label} onChangeText={setLabel} placeholder="e.g. Ana" maxLength={60} accessibilityLabel="Their name" autoCapitalize="words" />
      </Section>

      {kind === "minor" ? (
        <Section
          label="Date of birth"
          footer="Kept only so the sharing ends on their 18th birthday. They confirm it when they accept, so the right person joins."
        >
          <Input value={birthText} onChangeText={setBirthText} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" maxLength={10} accessibilityLabel="Date of birth, day month year" />
          {birthText.length >= 8 && !birthdate ? <Text className="mt-2 text-caption text-signal-alert">Check the date.</Text> : null}
        </Section>
      ) : null}

      <Section label="For how long" footer={kind === "adult" ? "They can choose a different period when they accept." : "Sharing ends on this date, or on their 18th birthday, whichever comes first."}>
        <Choices label="For how long" value={months} onChange={setMonths} options={CONSENT_DURATIONS.map((m) => ({ value: m, label: `${m} months` }))} />
      </Section>

      {represented ? (
        <Section label="Your consent as their representative">
          <Lead>
            {kind === "minor"
              ? "For someone under 18, the law asks for a parent's or legal guardian's specific consent. Read what they will share:"
              : "For an adult under curatela, their legal representative consents. Read what they will share:"}
          </Lead>
          <TermView guardian={g.display_name} />
          <Check checked={declared} onChange={setDeclared}>
            I am {label.trim() || "this person"}'s {kind === "minor" ? "parent or legal guardian" : "legal representative (curador)"}, and I consent to this
            sharing on their behalf and in their best interest. I understand they can see exactly what is shared, and can stop it.
          </Check>
        </Section>
      ) : null}

      {error ? <Notice tone="alert">{error}</Notice> : null}
      <View className="mt-8">
        <Button variant="primary" size="lg" fullWidth disabled={!ready || busy} onPress={create}>
          {busy ? "Creating…" : "Create invitation"}
        </Button>
      </View>
    </FamilyScroll>
  );
}
