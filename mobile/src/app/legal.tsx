import { router, useLocalSearchParams } from "expo-router";
import { LegalDocView, isDocId } from "~/features/LegalDoc";

export default function Legal() {
  const { doc } = useLocalSearchParams();
  return <LegalDocView doc={isDocId(doc) ? doc : "privacy"} onClose={() => router.back()} />;
}
