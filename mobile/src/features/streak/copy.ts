/**
 * Every word the streak says, in Brazilian Portuguese and in English.
 *
 * The streak is written in Portuguese first. The rest of the app is still in
 * English, so the language follows the phone: a phone set to Portuguese gets
 * this in Portuguese, anything else gets English — rather than one component
 * suddenly speaking a language the rest of the screen doesn't.
 *
 * Tone: short, warm, no guilt. A lapsed streak is an invitation to start again,
 * never a failure, and the record is always mentioned as something kept.
 */
import { getLocales } from "expo-localization";

export type Lang = "pt" | "en";

export function deviceLang(): Lang {
  try {
    if (getLocales()[0]?.languageCode === "pt") return "pt";
  } catch {
    /* fall through to Intl */
  }
  try {
    if (Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("pt")) return "pt";
  } catch {
    /* default below */
  }
  return "en";
}

const years = (n: number) => n / 365;

type Mark = "done" | "today" | "missed" | "future" | "idle";

/** What each language has to provide. */
interface Copy {
  locale: string;
  weekInitials: string[];
  unit: (n: number) => string;
  days: (n: number) => string;
  statusDone: string;
  statusPending: string;
  restarted: string;
  firstTitle: string;
  firstBody: string;
  resumeTitle: string;
  resumeBody: (best: number) => string;
  cta: string;
  ctaDone: string;
  goal: (n: number, first: boolean) => string;
  remaining: (k: number, goal: string) => string;
  reached: (n: number, first: boolean) => string;
  rung: (n: number) => string;
  reviewTitle: string;
  close: string;
  today: string;
  noEntries: string;
  noEntriesNote: string;
  outflow: string;
  inflow: string;
  upcoming: string;
  when: (days: number) => string;
  addMissing: string;
  confirm: string;
  saving: string;
  alreadyDone: string;
  alreadyDoneBody: string;
  errorTitle: string;
  errorBody: string;
  rule: string;
  detailTitle: string;
  record: string;
  reviewedDays: string;
  next: string;
  ladder: string;
  history: string;
  previousMonth: string;
  nextMonth: string;
  lapse: string;
  a11yCard: (n: number, done: boolean) => string;
  a11yDay: (label: string, mark: string) => string;
  a11yMarks: Record<Mark, string>;
  a11yReached: string;
}

const pt: Copy = {
  locale: "pt-BR",
  /** Sunday first, as Brazilian calendars are. */
  weekInitials: ["D", "S", "T", "Q", "Q", "S", "S"],

  unit: (n: number) => (n === 1 ? "dia de constância" : "dias de constância"),
  days: (n: number) => (n === 1 ? "1 dia" : `${n} dias`),

  statusDone: "Hoje está em dia.",
  statusPending: "Revise hoje para manter a sequência.",
  restarted: "Nova sequência começou. Hoje está em dia.",
  firstTitle: "Comece sua sequência.",
  firstBody: "Revise seu dia para marcar o primeiro.",
  resumeTitle: "Vamos começar uma nova sequência?",
  resumeBody: (best: number) => `Seu recorde continua: ${best === 1 ? "1 dia" : `${best} dias`}.`,

  cta: "Revisar meu dia",
  ctaDone: "Dia revisado",

  /** What comes after "para": "Faltam 2 dias para sua primeira semana." */
  goal: (n: number, first: boolean) => {
    if (n === 7) return first ? "sua primeira semana" : "uma semana";
    if (n === 14) return "duas semanas";
    if (n === 30) return first ? "seu primeiro mês" : "um mês";
    if (n === 60) return "dois meses";
    if (n === 180) return "seis meses";
    if (n === 365) return first ? "seu primeiro ano" : "um ano";
    if (n > 365 && n % 365 === 0) return `${years(n)} anos`;
    return `${n} dias`;
  },
  remaining: (k: number, goal: string) => (k === 1 ? `Falta 1 dia para ${goal}.` : `Faltam ${k} dias para ${goal}.`),
  reached: (n: number, first: boolean) => {
    if (n === 7) return first ? "Primeira semana completa." : "Uma semana de constância.";
    if (n === 14) return "Duas semanas de constância.";
    if (n === 30) return first ? "Primeiro mês completo." : "Um mês de constância.";
    if (n === 60) return "Dois meses de constância.";
    if (n === 100) return "100 dias de constância.";
    if (n === 180) return "Seis meses de constância.";
    if (n === 365) return first ? "Um ano inteiro de constância." : "Mais um ano de constância.";
    return `${years(n)} anos de constância.`;
  },
  /** Short label for a rung of the milestone ladder. */
  rung: (n: number) => (n % 365 === 0 ? (n === 365 ? "1 ano" : `${years(n)} anos`) : `${n}`),

  // Review sheet
  reviewTitle: "Revisar meu dia",
  close: "Fechar",
  today: "Hoje",
  noEntries: "Nenhum lançamento hoje.",
  noEntriesNote: "Dias sem gastos também contam.",
  outflow: "Saídas",
  inflow: "Entradas",
  upcoming: "Próximas cobranças",
  when: (days: number) => (days <= 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`),
  addMissing: "Adicionar algo que faltou",
  confirm: "Concluir revisão",
  saving: "Salvando…",
  alreadyDone: "Hoje já está em dia.",
  alreadyDoneBody: "Volte amanhã para continuar a sequência.",
  errorTitle: "Não deu para salvar",
  errorBody: "Verifique sua conexão e tente de novo.",
  rule: "Sua sequência conta os dias em que você revisa suas finanças — com ou sem gastos.",

  // Detail view
  detailTitle: "Sua sequência",
  record: "Recorde",
  reviewedDays: "Dias revisados",
  next: "Próximo marco",
  ladder: "Marcos",
  history: "Histórico",
  previousMonth: "Mês anterior",
  nextMonth: "Próximo mês",
  lapse: "Se um dia passar, seu histórico e seu recorde continuam aqui. É só revisar o próximo para recomeçar.",

  a11yCard: (n: number, done: boolean) =>
    `Sequência de ${n === 1 ? "1 dia" : `${n} dias`}. ${done ? "Hoje está em dia." : "Hoje ainda não foi revisado."} Toque para ver detalhes.`,
  a11yDay: (label: string, mark: string) => `${label}: ${mark}`,
  a11yMarks: { done: "revisado", today: "hoje, pendente", missed: "não revisado", future: "ainda não chegou", idle: "antes do início" },
  a11yReached: "alcançado",
};

const en: Copy = {
  locale: "en-US",
  weekInitials: ["S", "M", "T", "W", "T", "F", "S"],

  unit: (n) => (n === 1 ? "day in a row" : "days in a row"),
  days: (n) => (n === 1 ? "1 day" : `${n} days`),

  statusDone: "You're up to date today.",
  statusPending: "Review today to keep it going.",
  restarted: "A new streak has begun. You're up to date today.",
  firstTitle: "Start your streak.",
  firstBody: "Review your day to mark the first one.",
  resumeTitle: "Start a new streak?",
  resumeBody: (best) => `Your record stays: ${best === 1 ? "1 day" : `${best} days`}.`,

  cta: "Review my day",
  ctaDone: "Day reviewed",

  goal: (n, first) => {
    if (n === 7) return first ? "your first week" : "one week";
    if (n === 14) return "two weeks";
    if (n === 30) return first ? "your first month" : "one month";
    if (n === 60) return "two months";
    if (n === 180) return "six months";
    if (n === 365) return first ? "your first year" : "one year";
    if (n > 365 && n % 365 === 0) return `${years(n)} years`;
    return `${n} days`;
  },
  remaining: (k, goal) => (k === 1 ? `1 day to ${goal}.` : `${k} days to ${goal}.`),
  reached: (n, first) => {
    if (n === 7) return first ? "First week complete." : "One week in a row.";
    if (n === 14) return "Two weeks in a row.";
    if (n === 30) return first ? "First month complete." : "One month in a row.";
    if (n === 60) return "Two months in a row.";
    if (n === 100) return "100 days in a row.";
    if (n === 180) return "Six months in a row.";
    if (n === 365) return first ? "A whole year in a row." : "Another year in a row.";
    return `${years(n)} years in a row.`;
  },
  rung: (n) => (n % 365 === 0 ? (n === 365 ? "1 yr" : `${years(n)} yrs`) : `${n}`),

  reviewTitle: "Review my day",
  close: "Close",
  today: "Today",
  noEntries: "Nothing logged today.",
  noEntriesNote: "Days without spending count too.",
  outflow: "Out",
  inflow: "In",
  upcoming: "Coming up",
  when: (days) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`),
  addMissing: "Add something I missed",
  confirm: "Finish review",
  saving: "Saving…",
  alreadyDone: "You're up to date today.",
  alreadyDoneBody: "Come back tomorrow to keep the streak going.",
  errorTitle: "Couldn't save",
  errorBody: "Check your connection and try again.",
  rule: "Your streak counts the days you review your finances — with or without spending.",

  detailTitle: "Your streak",
  record: "Record",
  reviewedDays: "Days reviewed",
  next: "Next milestone",
  ladder: "Milestones",
  history: "History",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  lapse: "If a day slips by, your history and record stay here. Review the next one to start again.",

  a11yCard: (n, done) =>
    `${n === 1 ? "1 day" : `${n} days`} in a row. ${done ? "You're up to date today." : "Today isn't reviewed yet."} Tap for details.`,
  a11yDay: (label, mark) => `${label}: ${mark}`,
  a11yMarks: { done: "reviewed", today: "today, open", missed: "not reviewed", future: "not yet", idle: "before you started" },
  a11yReached: "reached",
};

export function streakCopy(lang: Lang = deviceLang()): Copy {
  return lang === "pt" ? pt : en;
}

export type StreakCopy = Copy;
