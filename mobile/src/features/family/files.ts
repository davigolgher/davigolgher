/**
 * Files Flow Family hands to the person: the monthly report as a PDF, and a
 * copy of their data as JSON (LGPD art. 18). Made on the phone, saved to the
 * app's cache folder, handed to the share sheet, and nothing else: no copy is
 * uploaded anywhere.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { familyApi } from "@/lib/backend/family";

export async function shareReportPdf(html: string, name: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: name });
}

export async function shareMyData(): Promise<void> {
  const data = await familyApi.exportMyData();
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `flow-family-data-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Your Flow Family data" });
}
