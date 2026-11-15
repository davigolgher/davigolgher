/**
 * The sharing terms, as the person consenting reads them. The text is
 * src/lib/family/consentTerm.ts — the same text whose hash the database
 * stores with the version — with the guardian's name filled in.
 */
import { Text, View } from "react-native";
import { CONSENT_TERM_TITLE, CONSENT_TERM_VERSION, consentTermFor } from "@/lib/family/consentTerm";
import { CONTINUOUS } from "~/components/ui";

export function TermView({ guardian }: { guardian: string }) {
  return (
    <View className="mt-3 rounded-card-sm bg-ink-800 p-4" style={CONTINUOUS}>
      <Text className="text-subhead font-semibold text-chalk" accessibilityRole="header">
        {CONSENT_TERM_TITLE}
      </Text>
      <Text className="mt-0.5 text-caption text-chalk-mute">Version {CONSENT_TERM_VERSION}</Text>
      {consentTermFor(guardian).map((s) => (
        <View key={s.heading} className="mt-4">
          <Text className="text-footnote font-semibold text-chalk" accessibilityRole="header">
            {s.heading}
          </Text>
          {s.body?.map((p) => (
            <Text key={p} className="mt-1 text-footnote text-chalk-soft">
              {p}
            </Text>
          ))}
          {s.bullets?.map((b) => (
            <View key={b} className="mt-1 flex-row gap-2">
              <Text className="text-footnote text-chalk-soft" importantForAccessibility="no" accessibilityElementsHidden>
                •
              </Text>
              <Text className="flex-1 text-footnote text-chalk-soft">{b}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** "2014-05-20" from what was typed, or null. Accepts DD/MM/YYYY too, as Brazil writes it. */
export function parseBirthdate(text: string, now: Date = new Date()): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > now.getTime() || y < now.getFullYear() - 120) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
