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

/** 18:00 ET the previous calendar day — Globex open for this session date. */
export function globexOpenUnix(date: string): number {
  return sessionOpenUnix(date) - (15 * 60 + 30) * 60;
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
    title: "PPI",
    impact: "high",
    actual: "0.3%",
    forecast: "0.2%",
    prior: "0.4%",
  },
  {
    date: "2026-09-10",
    time: "10:00",
    title: "Wholesale Inventories",
    impact: "low",
    actual: "0.1%",
    forecast: "0.1%",
    prior: "0.0%",
  },
  {
    date: "2026-09-09",
    time: "08:30",
    title: "JOLTS",
    impact: "med",
    actual: "7.18M",
    forecast: "7.20M",
    prior: "7.40M",
  },
];
