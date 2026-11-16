/**
 * Flow Family connects banks with the app-wide flow (features/bank); what it
 * adds is the promise shown before connecting: nothing is shared until the
 * person picks accounts.
 */
import { BankConnectIntro as Intro } from "~/features/bank/BankConnect";
import { Notice } from "~/components/kit";

export { useBankConnect, useCountryOptions, type ConnectTarget } from "~/features/bank/BankConnect";

export function BankConnectIntro({ onStart, busy }: { onStart: (country: string) => void; busy: boolean }) {
  return (
    <Intro
      onStart={onStart}
      busy={busy}
      note={
        <Notice title="Nothing is shared yet">
          After connecting, you pick which accounts to share. Until you do, your guardian sees nothing from this bank.
        </Notice>
      }
    />
  );
}
