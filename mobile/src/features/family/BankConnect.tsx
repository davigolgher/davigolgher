/**
 * Connecting a bank through Open Finance, with Pluggy Connect: Pluggy's own
 * page, shown full screen in a WebView. The person picks their bank and
 * authorises sharing there (or in their bank's app, for Open Finance
 * connectors). Their bank login never passes through Flow: the widget talks
 * to Pluggy and the bank directly, and Flow only receives the id of the new
 * connection, which the server then checks with Pluggy.
 *
 * The token that opens the widget comes from the bank-connect-token function,
 * which checks the person may connect (they share with a family, within the
 * plan). The aggregator's keys never reach the phone.
 */
import { useState } from "react";
import { Modal, Text, View } from "react-native";
import { PluggyConnect } from "react-native-pluggy-connect";
import { familyApi, FamilyError } from "@/lib/backend/family";
import { Button } from "~/components/ui";
import { Loading, Notice } from "./ui";

type Phase = { step: "idle" } | { step: "token" } | { step: "widget"; token: string; sandbox: boolean } | { step: "syncing" };

export function useBankConnect(onDone: (result: { inserted: number; accounts: number } | null) => void) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [updateItem, setUpdateItem] = useState<string | undefined>(undefined);

  const start = async (itemId?: string) => {
    setError(null);
    setUpdateItem(itemId);
    setPhase({ step: "token" });
    try {
      const { connectToken, includeSandbox } = await familyApi.connectToken(itemId);
      setPhase({ step: "widget", token: connectToken, sandbox: includeSandbox });
    } catch (e) {
      setPhase({ step: "idle" });
      setError((e as Error).message);
    }
  };

  const finish = async (itemId: string) => {
    setPhase({ step: "syncing" });
    try {
      const res = await familyApi.syncConnection(itemId);
      setPhase({ step: "idle" });
      onDone({ inserted: res.inserted, accounts: res.accounts });
    } catch (e) {
      setPhase({ step: "idle" });
      setError(e instanceof FamilyError ? e.message : "The bank was connected, but the first update failed. Pull to refresh in a moment.");
      onDone(null);
    }
  };

  const modal = (
    <Modal visible={phase.step === "widget" || phase.step === "syncing"} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPhase({ step: "idle" })}>
      {phase.step === "widget" ? (
        <PluggyConnect
          connectToken={phase.token}
          includeSandbox={phase.sandbox}
          updateItem={updateItem}
          language="en"
          theme="light"
          onSuccess={({ item }) => void finish(item.id)}
          onError={({ message, data }) => {
            // A connection that exists but needs attention is still stored, so
            // the person sees its state; anything else is an error to show.
            if (data?.item?.id) void finish(data.item.id);
            else {
              setPhase({ step: "idle" });
              setError(message || "The connection didn't finish. Try again.");
            }
          }}
          onClose={() => setPhase((p) => (p.step === "widget" ? { step: "idle" } : p))}
        />
      ) : (
        <View className="flex-1 justify-center bg-ink-950">
          <Loading label="Reading your accounts…" />
        </View>
      )}
    </Modal>
  );

  return { start, busy: phase.step !== "idle", error, clearError: () => setError(null), modal };
}

/** What the person is told before the widget opens. */
export function BankConnectIntro({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <View>
      <Text className="text-body text-chalk-soft">
        You'll choose your bank and approve sharing through Open Finance Brasil, in a window run by Pluggy, our
        Open Finance partner. Flow never sees your bank password.
      </Text>
      <Notice title="Nothing is shared yet">
        After connecting, you pick which accounts to share. Until you do, your guardian sees nothing from this bank.
      </Notice>
      <View className="mt-5">
        <Button variant="primary" size="lg" fullWidth disabled={busy} onPress={onStart}>
          {busy ? "Opening…" : "Connect a bank"}
        </Button>
      </View>
    </View>
  );
}
