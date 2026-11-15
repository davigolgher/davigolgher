/**
 * Where a provider's page sends the browser back to (flow://family/bank-return).
 * Normally the secure browser session catches it and the connection screen
 * carries on by itself; if the system opens the link instead (it can on
 * Android), land on the banks screen, which reads the connections again.
 */
import { Redirect } from "expo-router";

export default function BankReturn() {
  return <Redirect href="/family/connect" />;
}
