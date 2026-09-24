/**
 * Legal document rendering, shared by the `/legal` route and the sign-in screen.
 *
 * Sign-in needs the modal form: when signed out the router stack isn't mounted,
 * so the Terms and Privacy links there can't navigate — they open this over the
 * screen instead, the way the web app's overlay did.
 *
 * Text comes from the shared `features/legal/content`.
 */
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AI, LEGAL_TITLES, NUTRITION, PRIVACY, TERMS, UPDATED, type LegalDocId, type Section } from "@/features/legal/content";
import { APP } from "@/config/app";

const DOCS: Record<LegalDocId, Section[] | null> = {
  terms: TERMS,
  privacy: PRIVACY,
  ai: AI,
  nutrition: null, // rendered as grouped chips below, not prose
};

export function isDocId(v: unknown): v is LegalDocId {
  return v === "terms" || v === "privacy" || v === "ai" || v === "nutrition";
}

function Prose({ sections }: { sections: Section[] }) {
  return (
    <View className="gap-6">
      {sections.map((s) => (
        <View key={s.heading}>
          <Text className="text-[15px] font-semibold text-chalk">{s.heading}</Text>
          {s.body?.map((p, i) => (
            <Text key={i} className="mt-2 text-[14px] leading-relaxed text-chalk-mute">
              {p}
            </Text>
          ))}
          {s.bullets?.map((b, i) => (
            <View key={i} className="mt-1.5 flex-row gap-2">
              <Text className="text-[14px] leading-relaxed text-chalk-faint">•</Text>
              <Text className="flex-1 text-[14px] leading-relaxed text-chalk-mute">{b}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Nutrition() {
  return (
    <View className="gap-4">
      <Text className="text-[14px] leading-relaxed text-chalk-mute">
        A plain summary of {APP.name}&apos;s data practices, in the style of an app-store privacy label.
      </Text>
      {NUTRITION.map((g) => (
        <View key={g.title} className="rounded-card border border-line bg-ink-850 p-4">
          <Text className="text-[15px] font-semibold text-chalk">{g.title}</Text>
          <Text className="mt-0.5 text-[12px] text-chalk-mute">{g.note}</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {g.items.map((it) => (
              <View key={it} className="rounded-pill border border-line bg-ink-800 px-3 py-1">
                <Text className="text-[13px] text-chalk">{it}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Full-screen document with a close affordance. */
export function LegalDocView({ doc, onClose }: { doc: LegalDocId; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const sections = DOCS[doc];

  return (
    <View className="flex-1 bg-ink-950">
      <View
        className="flex-row items-center gap-3 border-b border-line-soft px-6 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable onPress={onClose} className="py-1 active:opacity-60">
          <Text className="text-[15px] font-medium text-chalk-mute">Close</Text>
        </Pressable>
        <Text numberOfLines={1} className="flex-1 text-[17px] font-semibold tracking-tight text-chalk">
          {LEGAL_TITLES[doc]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40 }}>
        <Text className="text-[12px] uppercase tracking-wide text-chalk-mute">Last updated · {UPDATED}</Text>
        {doc !== "nutrition" ? (
          <View className="mt-3 rounded-card-sm border border-line bg-ink-850 p-3.5">
            <Text className="text-[12px] leading-relaxed text-chalk-mute">
              Template for review by your legal counsel before launch — this is not legal advice, and details (company,
              governing law, arbitration provider, contact) must be completed for your business.
            </Text>
          </View>
        ) : null}

        <View className="mt-6">{sections ? <Prose sections={sections} /> : <Nutrition />}</View>
      </ScrollView>
    </View>
  );
}

/** The same document presented over whatever is on screen. */
export function LegalModal({ doc, onClose }: { doc: LegalDocId | null; onClose: () => void }) {
  return (
    <Modal visible={doc !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {doc ? <LegalDocView doc={doc} onClose={onClose} /> : null}
    </Modal>
  );
}
