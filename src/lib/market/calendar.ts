export const AS_OF_DATE = "2026-09-11";
export const AS_OF_MINUTES = 77;

const HOLIDAYS = new Set([
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
]);

export function isTradingDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const wd = dt.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !HOLIDAYS.has(date);
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

export function listTradingDays(count: number, through = AS_OF_DATE): string[] {
  const out: string[] = [];
  let cursor = through;
  let guard = 0;
  while (out.length < count && guard < 400) {
    if (isTradingDay(cursor)) out.push(cursor);
    cursor = shiftDate(cursor, -1);
    guard += 1;
  }
  return out;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** 9:30 America/New_York as unix seconds. Uses a simple DST table. */
export function sessionOpenUnix(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const offset = isEasternDaylight(y!, m!, d!) ? 4 : 5;
  return Math.floor(Date.UTC(y!, m! - 1, d!, 9 + offset, 30, 0) / 1000);
}

function isEasternDaylight(y: number, m: number, d: number): boolean {
  const march = nthWeekdayOfMonth(y, 3, 0, 2);
  const nov = nthWeekdayOfMonth(y, 11, 0, 1);
  const key = m * 100 + d;
  return key >= march && key < nov;
}

function nthWeekdayOfMonth(y: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return month * 100 + day;
}

export type EconEvent = {
  time: string;
  date: string;
  title: string;
  impact: "high" | "med" | "low";
  actual: string;
  forecast: string;
  prior: string;
};

export const ECON_EVENTS: EconEvent[] = [
  {
    date: "2026-09-11",
    time: "08:30",
    title: "PPI MoM",
    impact: "high",
    actual: "0.2%",
    forecast: "0.3%",
    prior: "0.4%",
  },
  {
    date: "2026-09-11",
    time: "10:00",
    title: "U. of Mich. Sentiment",
    impact: "med",
    actual: "71.4",
    forecast:  "70.8",
    prior: "69.9",
  },
  {
    date: "2026-09-12",
    time: "08:30",
    title: "Retail Sales MoM",
    impact: "high",
    actual: "—",
    forecast: "0.4%",
    prior: "0.5%",
  },
  {
    date: "2026-09-17",
    time: "14:00",
    title: "FOMC Rate Decision",
    impact: "high",
    actual: "—",
    forecast: "4.25%",
    prior: "4.50%",
  },
  {
    date: "2026-09-10",
    time: "08:30",
    title: "Initial Jobless Claims",
    impact: "med",
    actual: "228k",
    forecast: "235k",
    prior: "231k",
  },
];
