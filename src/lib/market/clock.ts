/** New York calendar helpers — one place so UTC never leaks into session dates. */

export function nyToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function nyMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const bag: Record<string, string> = {};
  for (const p of parts) bag[p.type] = p.value;
  const hour = bag.hour === "24" ? 0 : Number(bag.hour ?? 0);
  return hour * 60 + Number(bag.minute ?? 0);
}

export function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseClock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const t = value.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
