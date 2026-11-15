/**
 * Flow Family's categories for bank entries, as the app shows them.
 *
 * The same list lives in supabase/functions/_shared/categories.ts (where bank
 * entries are placed in one) and in public.family_categories() in
 * supabase/prepared/0012; a test keeps the three identical. The database
 * refuses any other value, so a category the app doesn't know can't arrive.
 */

export const FAMILY_CATEGORIES = [
  "Groceries",
  "Eating out",
  "Transport",
  "Shopping",
  "Entertainment",
  "Health",
  "Education",
  "Housing & bills",
  "Travel",
  "Services",
  "Betting & lotteries",
  "Loans & fees",
  "Taxes",
  "Transfers",
  "Income",
  "Internal",
  "Other",
] as const;

export type FamilyCategory = (typeof FAMILY_CATEGORIES)[number];

/** Categories a guardian can set a monthly budget for: money going out. */
export const BUDGET_CATEGORIES = FAMILY_CATEGORIES.filter((c) => c !== "Income" && c !== "Internal") as FamilyCategory[];

/** What the "sensitive category" alert watches unless the guardian picks others. */
export const DEFAULT_SENSITIVE: FamilyCategory[] = ["Betting & lotteries"];

/**
 * Moving money between one's own accounts, paying one's own card bill,
 * investing. Shown in the feed, never counted as spending: counting a card
 * bill would count every purchase on the card twice.
 */
export const isInternal = (category: string) => category === "Internal";

export function isFamilyCategory(value: string): value is FamilyCategory {
  return (FAMILY_CATEGORIES as readonly string[]).includes(value);
}

/** One line for a screen reader and the category screen. */
export const CATEGORY_HINTS: Record<FamilyCategory, string> = {
  Groceries: "Supermarkets and food shops",
  "Eating out": "Restaurants, cafés and delivery",
  Transport: "Rides, fuel, parking and transit",
  Shopping: "Shops and online stores",
  Entertainment: "Streaming, games, cinema and events",
  Health: "Pharmacies, doctors and gyms",
  Education: "Schools, courses and books",
  "Housing & bills": "Rent, utilities, internet and phone",
  Travel: "Hotels, flights and trips",
  Services: "Subscriptions, insurance and services",
  "Betting & lotteries": "Betting sites, casinos and lotteries",
  "Loans & fees": "Loans, interest, bank fees and fines",
  Taxes: "Taxes and government fees",
  Transfers: "Pix, TED and payments to people",
  Income: "Money received",
  Internal: "Between own accounts, card bills, investments",
  Other: "Everything else",
};
