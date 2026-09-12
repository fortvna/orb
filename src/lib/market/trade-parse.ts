import { getSymbol, resolveSymbolId } from "./symbols";
import type { Trade, TradeSide } from "./types";

function csvRows(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = !q;
      } else if (c === "," && !q) {
        out.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

function sideOf(raw: string): TradeSide | null {
  const s = raw.toLowerCase();
  if (s === "long" || s === "buy" || s === "b") return "long";
  if (s === "short" || s === "sell" || s === "s") return "short";
  return null;
}

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function tagsOf(raw: Record<string, unknown>): string[] {
  const src = String(raw.tags ?? raw.tag ?? "").trim();
  const extra = src
    ? src.split(/[|,]/).map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  return [...new Set(["journal", "imported", ...extra])];
}

function asTrade(raw: Record<string, unknown>, index: number): Trade | null {
  const symbol = resolveSymbolId(String(raw.symbol ?? raw.ticker ?? raw.instrument ?? ""));
  const side = sideOf(String(raw.side ?? raw.direction ?? ""));
  const entry = num(raw.entry ?? raw.entryPrice ?? raw.entryprice ?? raw.open);
  const date = String(raw.date ?? raw.session ?? raw.day ?? "").slice(0, 10);
  if (!symbol || !side || entry == null || entry <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const spec = getSymbol(symbol);
  const qty = Math.max(1, Math.round(num(raw.qty ?? raw.quantity ?? raw.size ?? raw.contracts) ?? 1));
  const exit = num(raw.exit ?? raw.exitPrice ?? raw.exitprice ?? raw.close);
  const pnlGiven = num(raw.pnl ?? raw.profit);
  const pnl =
    pnlGiven ??
    (exit == null ? 0 : (side === "long" ? exit - entry : entry - exit) * qty * spec.pointValue);
  const stop = num(raw.stop ?? raw.sl);
  const risk =
    stop != null && stop !== entry
      ? Math.abs(entry - stop) * qty * spec.pointValue
      : spec.tick * 8 * qty * spec.pointValue || 1;
  const entryTime = parseEntryTime(date, raw.time ?? raw.entrytime ?? raw.entryTime) ?? noonUnix(date);
  const playbookId = String(raw.playbookId ?? raw.playbookid ?? "").trim() || null;
  return {
    id: String(raw.id ?? `jn-${date}-${symbol}-${side}-${Math.round(entry * 100)}`),
    symbol: spec.id,
    side,
    qty,
    entry,
    exit,
    entryTime,
    exitTime: exit == null ? null : entryTime + 3600,
    stop,
    target: num(raw.target ?? raw.tp),
    pnl,
    fees: num(raw.fees) ?? (spec.kind === "futures" ? qty * 4.08 : 1),
    rMultiple: pnl / risk,
    setup: String(raw.setup ?? raw.playbook ?? "Journal").trim() || "Journal",
    tags: tagsOf(raw),
    notes: String(raw.notes ?? raw.note ?? raw.comment ?? "").trim(),
    source: "journal",
    playbookId,
    date,
    open: exit == null,
  };
}

function noonUnix(date: string): number {
  return Math.floor(new Date(`${date}T16:00:00Z`).getTime() / 1000);
}

function parseEntryTime(date: string, raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 1e9) return Math.round(raw);
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  const utcGuess = Date.parse(`${date}T00:00:00-05:00`) / 1000 + minutes * 60;
  return Number.isFinite(utcGuess) ? utcGuess : null;
}

export function parseTrades(text: string): Trade[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(json)
        ? json
        : Array.isArray((json as { trades?: unknown }).trades)
          ? (json as { trades: unknown[] }).trades
          : [json];
      return list
        .map((row, i) => asTrade((row ?? {}) as Record<string, unknown>, i))
        .filter((t): t is Trade => Boolean(t));
    } catch {
      return [];
    }
  }
  const rows = csvRows(trimmed);
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.toLowerCase().replace(/[\s_]+/g, ""));
  return rows
    .slice(1)
    .map((cols, i) => {
      const raw: Record<string, unknown> = {};
      header.forEach((h, idx) => {
        raw[h] = cols[idx];
      });
      return asTrade(raw, i);
    })
    .filter((t): t is Trade => Boolean(t));
}

export const TRADE_CSV_TEMPLATE = `date,time,symbol,side,qty,entry,exit,stop,target,setup,playbookId,notes,tags,pnl
2026-09-04,05:50,NQ,long,1,23644,23669.5,23618.5,23669.5,Open range,pb-530,First single-side break,orb,
`;

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function clockNy(unix: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/New_York",
  }).formatToParts(new Date(unix * 1000));
  const bag: Record<string, string> = {};
  for (const p of parts) bag[p.type] = p.value;
  const h = bag.hour === "24" ? "00" : (bag.hour ?? "00");
  return `${h}:${bag.minute ?? "00"}`;
}

export function serializeTradesCsv(trades: Trade[]): string {
  const header = [
    "date",
    "time",
    "symbol",
    "side",
    "qty",
    "entry",
    "exit",
    "stop",
    "target",
    "setup",
    "playbookId",
    "notes",
    "tags",
    "pnl",
    "rMultiple",
    "source",
    "open",
  ];
  const rows = trades.map((t) =>
    [
      t.date,
      clockNy(t.entryTime),
      t.symbol,
      t.side,
      t.qty,
      t.entry,
      t.exit,
      t.stop,
      t.target,
      t.setup,
      t.playbookId,
      t.notes,
      t.tags.filter((tag) => tag !== "journal" && tag !== "imported").join("|"),
      t.pnl,
      t.rMultiple,
      t.source,
      t.open,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

export function serializeTradesJson(trades: Trade[]): string {
  return JSON.stringify({ trades }, null, 2);
}
