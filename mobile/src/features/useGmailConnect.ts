/**
 * Connecting, importing and disconnecting Gmail, in one place so the Settings
 * section and the prompt on the Expenses screen can't drift apart.
 */
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useStore } from "@/data/store";
import { startGmailConnect, syncGmail } from "@/lib/backend/gmail";

function importedMessage(n: number): string {
  if (n === 0) return "No new receipts found.";
  return `Imported ${n} purchase${n === 1 ? "" : "s"}.`;
}

export function useGmailConnect() {
  const { data, connectGmail, disconnectGmail } = useStore();
  const [busy, setBusy] = useState(false);

  const connected = data.preferences.gmailConnected;

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const result = await startGmailConnect();
      if (result === "connected") {
        connectGmail();
        // Import straight away: connecting and then seeing nothing change is a
        // confusing first impression.
        const n = await syncGmail().catch(() => 0);
        Alert.alert("Gmail connected", importedMessage(n));
      } else if (result === "denied") {
        Alert.alert("Not connected", "Access wasn't granted.");
      } else if (result === "error") {
        Alert.alert("Couldn't connect", "Something went wrong. Try again.");
      }
      // "dismissed" means the sheet was closed — a decision, not a failure.
    } catch (e) {
      Alert.alert("Couldn't connect", (e as Error)?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  }, [connectGmail]);

  const importNow = useCallback(async () => {
    setBusy(true);
    try {
      Alert.alert("Import finished", importedMessage(await syncGmail()));
    } catch (e) {
      Alert.alert("Couldn't import", (e as Error)?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    Alert.alert("Disconnect Gmail?", "Flow stops reading your inbox. Expenses already imported stay.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => disconnectGmail() },
    ]);
  }, [disconnectGmail]);

  return { connected, busy, connect, importNow, disconnect };
}
