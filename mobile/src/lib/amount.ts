/**
 * Parsing for the amount fields.
 *
 * Typing "200" means two hundred, not two — the earlier field read digits as
 * cents, which quietly turned every amount into a hundredth of itself. So the
 * text is read as a normal decimal number and converted once, at the edge, into
 * the integer cents the rest of the app works in.
 *
 * Both "." and "," are accepted as the decimal separator, since which one a
 * keyboard offers depends on the phone's locale, not on the app's currency.
 */
import { toCents, type Cents } from "@/lib/money";

/**
 * Whole-number digits an amount may have: up to 9,999,999,999.99.
 *
 * Without a ceiling a long paste went through as 1e20, which JavaScript can't
 * hold exactly and the database column can't hold at all — the entry showed
 * on screen and was then refused by the server. Ten digits is past any real
 * expense in every currency the app offers, including yen and rupees.
 */
export const MAX_WHOLE_DIGITS = 10;

/** Keep digits and at most one decimal separator, with at most two decimals. */
export function sanitizeAmountText(text: string): string {
  let out = "";
  let separatorSeen = false;
  let whole = 0;
  let decimals = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      if (separatorSeen) {
        if (decimals === 2) continue;
        decimals += 1;
      } else {
        if (whole === MAX_WHOLE_DIGITS) continue;
        whole += 1;
      }
      out += ch;
    } else if ((ch === "." || ch === ",") && !separatorSeen && out.length > 0) {
      separatorSeen = true;
      out += ".";
    }
  }
  return out;
}

/** Cents for an amount field's text. Anything unparseable reads as zero. */
export function amountTextToCents(text: string): Cents {
  const n = Number(sanitizeAmountText(text));
  return Number.isFinite(n) && n > 0 ? toCents(n) : 0;
}

/** Text for an existing amount, for prefilling the field when editing. */
export function centsToAmountText(cents: Cents): string {
  if (!cents) return "";
  const main = cents / 100;
  // Whole amounts shouldn't come back as "200.00" — that's noisier to edit.
  return Number.isInteger(main) ? String(main) : main.toFixed(2);
}
