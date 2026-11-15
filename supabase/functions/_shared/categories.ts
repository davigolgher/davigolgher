/**
 * Flow Family's categories, and how a bank entry lands in one.
 *
 * Flow has no fixed category list — each account's categories are free text —
 * so bank entries get their own short list, the same for everyone. That is
 * what makes a guardian's budget for "Eating out" or an alert on betting mean
 * the same thing whichever bank an entry came from.
 *
 * The list exists in three places that a test keeps identical: here (the
 * server), src/lib/family/categories.ts (the app) and
 * public.family_categories() in supabase/prepared/0012.
 *
 * How an entry is placed. The aggregator suggests a category in its own words;
 * that, the merchant's category, the card's merchant category code and the
 * description are matched against the patterns below, most specific first.
 * Two of them carry weight beyond a pie chart:
 *   · Internal — moving money between one's own accounts, paying one's own
 *     card bill, investing. Not spending; counting it would double-count the
 *     purchases on the card. Excluded from totals, budgets and alerts.
 *   · Betting & lotteries — what the "sensitive category" alert watches by
 *     default. Matched on the aggregator's category, the card network's
 *     gambling codes (MCC 7800–7802, 7995) and the names of betting operators
 *     licensed in Brazil, but never on a bare "bet" inside a word ("Alphabet").
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

export interface CategoryInput {
  direction: "expense" | "income";
  /** The aggregator's category, e.g. "Food delivery" or "Same person transfer". */
  category?: string | null;
  /** The aggregator's merchant category, when it knows the merchant. */
  merchantCategory?: string | null;
  merchantName?: string | null;
  description?: string | null;
  /** Card network merchant category code. */
  mcc?: number | null;
}

/** Lowercase, accents removed, so "Farmácia" and "farmacia" are one word. */
export function fold(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const GAMBLING_MCC = new Set([7800, 7801, 7802, 7995]);

// Operators that run betting and lottery sites in Brazil. Matched as whole
// words in the merchant name or description.
const BETTING_BRANDS =
  /\b(bet365|betano|sportingbet|estrelabet|superbet|novibet|pixbet|betnacional|f12bet|betfair|parimatch|galera\.?bet|stake|kto|blaze|esportes da sorte|vai de bet|mcgames|betsson|rivalo|1xbet|bet7k|betpix|lotogreen|apostaganha)\b/;

type Rule = [FamilyCategory, RegExp];

/** Checked against the aggregator's category words, in this order. */
const BY_CATEGORY: Rule[] = [
  ["Internal", /same person|mesma titularidade|credit card payment|pagamento de (cartao|fatura)|card bill|investment|investiment|aplicac|resgate|proprias contas|own account/],
  ["Betting & lotteries", /gambl|betting|\bbets?\b|lotter|loteri|casino|cassino|aposta|bingo/],
  // Whole words: "tax" is also the start of "taxi", "fee" the end of "coffee".
  ["Taxes", /\btax(es)?\b|impost|tribut|\biof\b|darf|ipva|iptu/],
  ["Loans & fees", /loan|emprestim|financing|financiamento|interest|juros|tarifa|\bfees?\b|late payment|multa|overdraft|cheque especial/],
  ["Income", /income|salar|wage|payroll|pension|aposentad|refund|reembols|cashback|dividend|rendimento/],
  ["Groceries", /grocer|supermarket|supermercad|hortifruti|atacad|acougue|hipermercad/],
  ["Eating out", /restaurant|eating out|food|bakery|padaria|lanchonete|cafe|coffee|\bbars?\b|delivery|fast food/],
  ["Transport", /transport|taxi|ride|fuel|gas station|posto|combustiv|parking|estacionament|toll|pedagi|public transit|metro|onibus|vehicle|automotiv|car rental/],
  ["Health", /health|pharma|farmac|drogaria|hospital|clinic|medic|dentist|optic|gym|fitness|academia|wellness/],
  ["Education", /educat|school|escola|college|faculdade|universit|course|curso|tuition|books?\b|livrari/],
  ["Housing & bills", /housing|rent|aluguel|utilit|electricity|energia|water|agua|sewage|internet|telecom|phone|telefon|mobile plan|condomin|home|moradia/],
  ["Travel", /travel|hotel|lodging|accommodat|airline|flight|passage|viagem|turism|tourism|airbnb/],
  ["Entertainment", /entertain|leisure|lazer|cinema|movie|theat|music|game|gaming|streaming|event|show|ticket|ingresso|sport/],
  ["Shopping", /shopping|clothing|apparel|vestuar|electronic|department|retail|store|loja|e-commerce|online shopping|marketplace|pet|gift|beauty|cosmetic/],
  ["Services", /service|servico|digital|software|subscription|assinatura|cloud|insurance|seguro|donation|doac|charity/],
  ["Transfers", /transfer|transferenc|\bpix\b|\bted\b|\bdoc\b|boleto|payment/],
];

/** Checked against the merchant's name and the description, when the category words didn't settle it. */
const BY_TEXT: Rule[] = [
  ["Internal", /pagamento de fatura|pgto fatura|pag fatura|aplicacao|resgate|transf(erencia)? (entre|mesma) (contas|titularidade)/],
  ["Betting & lotteries", /\baposta(s)?\b|\bloteria|\bloterica|\bcassino\b|\bcasino\b|\bbingo\b|mega-?sena|lotofacil|quina\b/],
  ["Taxes", /\bdarf\b|\bipva\b|\biptu\b|\biof\b|receita federal/],
  ["Groceries", /supermercad|mercado\b|hortifruti|atacadao|assai|carrefour|pao de acucar/],
  ["Eating out", /ifood|rappi|restaurante|padaria|lanchonete|pizzaria|hamburgueria|starbucks|mcdonald|burger king|cafe\b|cafeteria/],
  ["Transport", /\buber\b|\b99\s?(app|pop|taxi|tecnologia)\b|cabify|\bposto\b|\bshell\b|ipiranga|petrobras|estacionamento|sem parar|conectcar|veloe|\bmetro\b|bilhete unico/],
  ["Health", /farmacia|drogaria|drogasil|raia|pague menos|hospital|laboratorio|clinica|smart ?fit/],
  // Utility companies by name. Not the phone carriers: "vivo", "claro" and "oi"
  // are everyday words, and a transfer message could hold any of them.
  ["Housing & bills", /aluguel|condominio|\benel\b|sabesp|copasa|cemig|light s\.?a\b|net servicos/],
  ["Travel", /hotel|pousada|airbnb|latam|gol linhas|azul linhas|booking\.com|decolar|123milhas/],
  ["Entertainment", /netflix|spotify|disney|hbo|prime video|youtube|deezer|cinema|ingresso|steam|playstation|xbox|nintendo/],
  ["Shopping", /amazon|mercado ?livre|shopee|magazine luiza|magalu|americanas|shein|aliexpress|renner|riachuelo|c&a/],
  ["Education", /escola|colegio|faculdade|universidade|curso|udemy|alura|livraria/],
  ["Transfers", /\bpix\b|\bted\b|\bdoc\b|transferencia/],
];

/** Where a bank entry belongs. Always one of FAMILY_CATEGORIES. */
export function categorize(input: CategoryInput): FamilyCategory {
  const aggregator = `${fold(input.category)} | ${fold(input.merchantCategory)}`;
  const text = `${fold(input.merchantName)} | ${fold(input.description)}`;

  // Money moving between one's own accounts is never spending or income.
  if (BY_CATEGORY[0][1].test(aggregator) || BY_TEXT[0][1].test(text)) return "Internal";

  if (input.direction === "income") return "Income";

  if ((input.mcc != null && GAMBLING_MCC.has(input.mcc)) || BETTING_BRANDS.test(text)) return "Betting & lotteries";

  for (const [category, pattern] of BY_CATEGORY) {
    if (category === "Income") continue;
    if (pattern.test(aggregator)) return category;
  }
  for (const [category, pattern] of BY_TEXT) {
    if (pattern.test(text)) return category;
  }
  return "Other";
}
