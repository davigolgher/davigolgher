/**
 * Connecting a bank, wherever it is.
 *
 * The person says which country their bank is in; the server picks the
 * provider that covers it and opens the connection:
 *   · Brazil (Pluggy): Pluggy Connect, shown full screen in a WebView.
 *   · Elsewhere (Plaid, Salt Edge): the provider's own page in the system's
 *     secure browser (ASWebAuthenticationSession on iOS, Custom Tabs on
 *     Android). Banks' Open Banking logins redirect to the bank's own app or
 *     site, which a WebView can't do reliably; the system browser can, and
 *     brings the person back to Flow when they finish.
 * Bank logins never pass through Flow. When the window closes the server
 * checks that the connection was made in a window this person opened, then
 * reads it.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Text, View } from "react-native";
import * as Localization from "expo-localization";
import * as WebBrowser from "expo-web-browser";
import { PluggyConnect } from "react-native-pluggy-connect";
import { FamilyError } from "@/lib/backend/family";
import { bankApi } from "@/lib/backend/banks";
import { countryOptions, orderForRegion, PROVIDER_NAME, type CountryOption, type ProviderId } from "@/lib/family/countries";
import { Button, Group, GroupRow } from "~/components/ui";
import { CheckIcon } from "~/components/icons";
import { iconSize } from "~/theme/tokens";
import { Loading, Notice } from "~/components/kit";

type Phase = { step: "idle" } | { step: "opening" } | { step: "widget"; token: string; sandbox: boolean; updateItem?: string } | { step: "syncing" };

export type ConnectTarget = { country: string } | { connectionId: string; provider: ProviderId; itemId: string };

export function useBankConnect(onDone: (result: { inserted: number; accounts: number } | null) => void) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);

  const finish = async (target: { itemId: string } | { session: string } | { connectionId: string }) => {
    setPhase({ step: "syncing" });
    try {
      const res = await bankApi.sync(target);
      setPhase({ step: "idle" });
      onDone({ inserted: res.inserted, accounts: res.accounts });
    } catch (e) {
      setPhase({ step: "idle" });
      setError(e instanceof FamilyError ? e.message : "The bank was connected, but the first update failed. Pull to refresh in a moment.");
      onDone(null);
    }
  };

  const start = async (target: ConnectTarget) => {
    setError(null);
    setPhase({ step: "opening" });
    try {
      const opened = await bankApi.connectToken("country" in target ? { country: target.country } : { connectionId: target.connectionId });
      if (opened.provider === "pluggy") {
        setPhase({ step: "widget", token: opened.connectToken, sandbox: opened.includeSandbox, updateItem: "itemId" in target ? target.itemId : undefined });
        return;
      }
      // The provider's page, in the system's secure browser.
      await WebBrowser.openAuthSessionAsync(opened.url, opened.returnUrl);
      // Done, cancelled or closed: the server knows whether anything was
      // connected in that window, so ask it either way.
      await finish({ session: opened.session });
    } catch (e) {
      setPhase({ step: "idle" });
      setError((e as Error).message);
    }
  };

  const modal = (
    <Modal
      visible={phase.step === "widget" || phase.step === "syncing"}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setPhase({ step: "idle" })}
    >
      {phase.step === "widget" ? (
        <PluggyConnect
          connectToken={phase.token}
          includeSandbox={phase.sandbox}
          updateItem={phase.updateItem}
          language="en"
          theme="light"
          onSuccess={({ item }) => void finish({ itemId: item.id })}
          onError={({ message, data }) => {
            // A connection that exists but needs attention is still stored, so
            // the person sees its state; anything else is an error to show.
            if (data?.item?.id) void finish({ itemId: data.item.id });
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

/** The countries this server can connect banks in, the phone's own first. */
export function useCountryOptions() {
  const [options, setOptions] = useState<CountryOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    bankApi
      .coverage()
      .then(({ providers }) => {
        if (!alive) return;
        let region: string | null = null;
        try {
          region = Localization.getLocales()[0]?.regionCode ?? null;
        } catch {
          /* no locale information: alphabetical */
        }
        setOptions(orderForRegion(countryOptions(providers), region));
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);
  return { options, error };
}

/**
 * What the person is told, and asked, before anything opens. `note` says what
 * happens to the accounts once connected (shared with nobody yet, for Flow
 * Family; imported into Flow, for the person's own banks).
 */
export function BankConnectIntro({ onStart, busy, note }: { onStart: (country: string) => void; busy: boolean; note?: ReactNode }) {
  const { options, error } = useCountryOptions();
  const [country, setCountry] = useState<CountryOption | null>(null);
  const [showAll, setShowAll] = useState(false);
  const chosen = country ?? options?.[0] ?? null;
  const shown = showAll ? (options ?? []) : (options ?? []).slice(0, 5);

  return (
    <View>
      <Text className="text-body text-chalk-soft">
        You'll choose your bank and approve sharing on a secure page run by a regulated open banking provider. Flow never sees your bank
        password.
      </Text>

      <Text className="mt-6 text-subhead font-semibold text-chalk" accessibilityRole="header">
        Where is your bank?
      </Text>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {!options && !error ? <Loading label="Checking which countries are available…" /> : null}
      {options && options.length === 0 ? (
        <Notice tone="warn">Bank connections aren't available yet. Try again later.</Notice>
      ) : null}
      {options && options.length > 0 ? (
        <View className="mt-2">
          <Group>
            {shown.map((o) => (
              <GroupRow
                key={o.code}
                title={o.name}
                sub={`Through ${PROVIDER_NAME[o.provider]}`}
                onPress={() => setCountry(o)}
                accessibilityHint={chosen?.code === o.code ? "Selected" : "Chooses this country"}
                trailing={chosen?.code === o.code ? <CheckIcon size={iconSize.md} strokeWidth={2.2} /> : <View />}
              />
            ))}
            {!showAll && options.length > shown.length ? <GroupRow title={`Show all ${options.length} options`} onPress={() => setShowAll(true)} /> : null}
          </Group>
        </View>
      ) : null}

      {note}
      <View className="mt-5">
        <Button variant="primary" size="lg" fullWidth disabled={busy || !chosen} onPress={() => chosen && onStart(chosen.code)}>
          {busy ? "Opening…" : chosen ? `Connect a bank in ${chosen.name === "Another country" ? "another country" : chosen.name}` : "Connect a bank"}
        </Button>
      </View>
    </View>
  );
}
