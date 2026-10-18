/**
 * Says so when the account and the server are out of step.
 *
 * Quiet the rest of the time: most changes reach the server in well under a
 * second, and a spinner for each would be noise. It appears only when something
 * is actually waiting — the account couldn't load, or changes are held on the
 * phone because the server can't be reached — so that a missing entry is never
 * a mystery and nothing looks saved that isn't.
 */
import { Text, View } from "react-native";
import { useStore } from "@/data/store";
import { Button } from "./ui";

export function SyncNotice() {
  const { sync, refresh, retrySync } = useStore();

  let title: string;
  let body: string;
  let onRetry: () => void;
  if (sync.loadFailed) {
    title = "Couldn't load your account";
    body = "Check your connection. Anything you add now is kept on this phone and sent once you're back online.";
    onRetry = refresh;
  } else if (sync.failing && sync.pending > 0) {
    title = sync.pending === 1 ? "1 change not saved yet" : `${sync.pending} changes not saved yet`;
    body = "They're kept on this phone and will be sent automatically when you're back online.";
    onRetry = retrySync;
  } else {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className="mt-6 rounded-card border border-line-strong bg-ink-800 p-4"
    >
      <Text className="text-[14px] font-semibold text-chalk">{title}</Text>
      <Text className="mt-1 text-[13px] leading-relaxed text-chalk-soft">{body}</Text>
      <View className="mt-3">
        <Button variant="secondary" size="sm" pill onPress={onRetry}>
          Try again
        </Button>
      </View>
    </View>
  );
}
