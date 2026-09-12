import { nyToday } from "./clock";

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
  "2026-11-26",
  "2026-12-25",
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

export function listTradingDays(count: number, through = nyToday()): string[] {
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
  period?: string;
};

/** Scheduled US prints only — no invented actuals/forecasts. */
export const ECON_EVENTS: EconEvent[] = [
  { date: "2026-09-11", time: "08:30", title: "CPI", impact: "high", period: "Aug" },
  { date: "2026-09-16", time: "08:30", title: "Retail Sales", impact: "med", period: "Aug" },
  { date: "2026-09-16", time: "14:00", title: "FOMC decision", impact: "high", period: "Sep 15–16" },
  { date: "2026-09-29", time: "10:00", title: "JOLTS", impact: "med", period: "Aug" },
  { date: "2026-09-30", time: "08:30", title: "GDP / PCE", impact: "high", period: "Q2 / Aug" },
  { date: "2026-10-02", time: "08:30", title: "NFP", impact: "high", period: "Sep" },
  { date: "2026-10-14", time: "08:30", title: "CPI", impact: "high", period: "Sep" },
  { date: "2026-10-15", time: "08:30", title: "PPI", impact: "med", period: "Sep" },
  { date: "2026-10-28", time: "14:00", title: "FOMC decision", impact: "high", period: "Oct 27–28" },
  { date: "2026-10-29", time: "08:30", title: "GDP advance / PCE", impact: "high", period: "Q3 / Sep" },
  { date: "2026-11-06", time: "08:30", title: "NFP", impact: "high", period: "Oct" },
  { date: "2026-11-10", time: "08:30", title: "CPI", impact: "high", period: "Oct" },
  { date: "2026-11-13", time: "08:30", title: "PPI", impact: "med", period: "Oct" },
  { date: "2026-12-04", time: "08:30", title: "NFP", impact: "high", period: "Nov" },
  { date: "2026-12-09", time: "14:00", title: "FOMC + SEP", impact: "high", period: "Dec 8–9" },
  { date: "2027-01-09", time: "08:30", title: "NFP", impact: "high", period: "Dec" },
  { date: "2027-01-14", time: "08:30", title: "CPI", impact: "high", period: "Dec" },
  { date: "2027-01-28", time: "14:00", title: "FOMC decision", impact: "high", period: "Jan 27–28" },
  { date: "2027-02-05", time: "08:30", title: "NFP", impact: "high", period: "Jan" },
  { date: "2027-02-11", time: "08:30", title: "CPI", impact: "high", period: "Jan" },
  { date: "2027-03-06", time: "08:30", title: "NFP", impact: "high", period: "Feb" },
  { date: "2027-03-11", time: "08:30", title: "CPI", impact: "high", period: "Feb" },
  { date: "2027-03-17", time: "14:00", title: "FOMC + SEP", impact: "high", period: "Mar 16–17" },
];

export function upcomingEcon(from = nyToday(), n = 5): EconEvent[] {
  return ECON_EVENTS.filter((e) => e.date >= from).slice(0, n);
}
