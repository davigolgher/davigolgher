/**
 * Where a provider's page sends the browser back to (flow://bank-return).
 * Normally the secure browser session catches it and the screen that opened
 * it carries on by itself; if the system opens the link instead (it can on
 * Android), land on the screen that lists the connections, which reads them
 * again. flow://family/bank-return still works for addresses registered
 * before this one.
 */
import { Redirect } from "expo-router";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { FAMILY_ENABLED } from "~/features/family/flag";

export default function BankReturn() {
  return <Redirect href={BANKS_ENABLED ? "/banks" : FAMILY_ENABLED ? "/family/connect" : "/"} />;
}
