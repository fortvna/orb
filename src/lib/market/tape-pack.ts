import { nyParts, sessionsFromIntraday, withDelta } from "./session";
import { resolveSymbolId } from "./symbols";
import type { Bar, SessionDay } from "./types";

export const TAPE_SCHEMA = "fortvna.tape.v0";
export const TAPE_INTERVAL = "1m";
export const TAPE_MAX_BARS = 80_000;
export const TAPE_WARN_BARS = 50_000;
export const TAPE_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const LONDON_START_MIN = 2 * 60;
export const LONDON_END_MIN = 8 * 60;

export type TapePackSource = "databento" | "csv" | "manual";

export type TapePackBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TapePack = {
  schema: typeof TAPE_SCHEMA;
  symbol: string;
  interval: "1m";
  source: TapePackSource;
  session_tz: string;
  bars: TapePackBar[];
};

export type TapePackMeta = {
  id: string;
  symbol: string;
  uploadedAt: number;
  barCount: number;
  source: TapePackSource;
  dateStart: string | null;
  dateEnd: string | null;
  londonBars: number;
  persisted: boolean;
};

export type TapePackCoverage = {
  barCount: number;
  start: number | null;
  end: number | null;
  dateStart: string | null;
  dateEnd: string | null;
  londonBars: number;
  hasLondon: boolean;
};

export type TapePackParseOk = { ok: true; pack: TapePack; warnings: string[] };
export type TapePackParseErr = { ok: false; error: string };
export type TapePackParseResult = TapePackParseOk | TapePackParseErr;

export type TapePackParseOpts = {
  filename?: string;
  fallbackSymbol?: string;
};

const TIME_KEYS = ["ts_event", "timestamp", "time", "datetime", "date", "ts", "ts_recv", "t"];
const OPEN_KEYS = ["open", "o"];
const HIGH_KEYS = ["high", "h"];
const LOW_KEYS = ["low", "l"];
const CLOSE_KEYS = ["close", "c"];
const VOL_KEYS = ["volume", "vol", "size", "v"];
const SYMBOL_KEYS = ["symbol", "ticker", "instrument", "stype_in_symbol"];

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function pickKey(keys: string[], aliases: string[]): string | null {
  const set = new Map(keys.map((k) => [normKey(k), k]));
  for (const a of aliases) {
    const hit = set.get(a);
    if (hit) return hit;
  }
  return null;
}

function asFinite(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim()) {
    const v = Number(n);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Map Databento / Yahoo / Orb ids onto an Orb symbol. Never maps QQQ→NQ or SPY→ES. */
export function resolveTapeSymbol(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const direct = resolveSymbolId(s);
  if (direct) return direct;
  const noExch = s.replace(/^[^:]+:/, "");
  const root = (noExch.split(/[./]/)[0] ?? noExch).trim();
  const fromRoot = resolveSymbolId(root);
  if (fromRoot) return fromRoot;
  const token = root.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (token.length >= 1 && token.length <= 8 && /^[A-Z][A-Z0-9]*$/.test(token)) return token;
  return null;
}

function nyWallToUnix(y: number, mo: number, d: number, h: number, mi: number, s = 0): number {
  const wantDate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const wantMin = h * 60 + mi;
  let unix = Math.floor(Date.UTC(y, mo - 1, d, h + 4, mi, s) / 1000);
  for (let i = 0; i < 4; i++) {
    const p = nyParts(unix);
    const dayDelta = (Date.parse(`${wantDate}T00:00:00Z`) - Date.parse(`${p.date}T00:00:00Z`)) / 1000;
    const minDelta = (wantMin - p.minutes) * 60;
    const delta = dayDelta + minDelta;
    if (delta === 0) break;
    unix += delta;
  }
  return unix;
}

function fromEpochNumber(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e18) return Math.floor(n / 1e9);
  if (n >= 1e15) return Math.floor(n / 1e6);
  if (n >= 1e12) return Math.floor(n / 1e3);
  return Math.floor(n);
}

/** Unix seconds. Accepts unix sec/ms/us/ns, ISO (Z or offset), or naive America/New_York wall time. */
export function parseBarTime(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return fromEpochNumber(raw);
  if (typeof raw === "bigint") return fromEpochNumber(Number(raw));
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    if (!s.includes(".")) {
      if (s.length >= 18) return Number(s.slice(0, -9));
      if (s.length >= 16) return Number(s.slice(0, -6));
      if (s.length >= 13) return Number(s.slice(0, -3));
    }
    return fromEpochNumber(Number(s));
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  if (hasZone) {
    const cleaned = s.replace(/(\.\d{3})\d+/, "$1");
    const ms = Date.parse(cleaned);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return nyWallToUnix(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function readOhlc(row: Record<string, unknown>, keys?: { o?: string; h?: string; l?: string; c?: string; t?: string; v?: string }): TapePackBar | null {
  const time = parseBarTime(keys?.t ? row[keys.t] : row.ts_event ?? row.timestamp ?? row.time ?? row.datetime ?? row.date ?? row.ts ?? row.t);
  const open = asFinite(keys?.o ? row[keys.o] : row.open ?? row.o);
  const high = asFinite(keys?.h ? row[keys.h] : row.high ?? row.h);
  const low = asFinite(keys?.l ? row[keys.l] : row.low ?? row.l);
  const close = asFinite(keys?.c ? row[keys.c] : row.close ?? row.c);
  if (time == null || open == null || high == null || low == null || close == null) return null;
  if (!(high >= low && high >= open && high >= close && low <= open && low <= close)) return null;
  const volume = asFinite(keys?.v ? row[keys.v] : row.volume ?? row.vol ?? row.size ?? row.v) ?? 0;
  return { time, open, high, low, close, volume: volume < 0 ? 0 : volume };
}

function sourceFrom(raw: unknown, filename?: string): TapePackSource {
  const s = String(raw ?? "").toLowerCase();
  if (s === "databento" || s === "dbn" || s === "db") return "databento";
  if (s === "csv") return "csv";
  if (s === "manual") return "manual";
  const name = (filename ?? "").toLowerCase();
  if (name.includes("databento") || name.includes(".dbn")) return "databento";
  if (name.endsWith(".csv") || name.endsWith(".tsv")) return "csv";
  return "manual";
}

function finalizeBars(raw: TapePackBar[], warnings: string[]): TapePackBar[] {
  const byTime = new Map<number, TapePackBar>();
  for (const b of raw) byTime.set(b.time, b);
  let bars = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (bars.length > TAPE_MAX_BARS) {
    warnings.push(`Truncated to ${TAPE_MAX_BARS.toLocaleString()} most-recent bars (had ${bars.length.toLocaleString()}).`);
    bars = bars.slice(-TAPE_MAX_BARS);
  }
  if (bars.length >= TAPE_WARN_BARS) {
    warnings.push(
      `Large pack (${bars.length.toLocaleString()} bars). Cap is ${TAPE_MAX_BARS.toLocaleString()}; localStorage may not persist this — in-memory until the tab closes.`,
    );
  }
  return bars;
}

function intervalWarning(bars: TapePackBar[], declared: string | undefined, warnings: string[]) {
  if (declared && declared !== "1m" && declared !== "1min" && declared !== "1") {
    warnings.push(`interval is ${declared}, not 1m — Grounding clocks expect 1m. Bars were not resampled.`);
  }
  if (bars.length < 3) return;
  const dts: number[] = [];
  for (let i = 1; i < Math.min(bars.length, 40); i++) {
    const d = bars[i]!.time - bars[i - 1]!.time;
    if (d > 0 && d <= 3600) dts.push(d);
  }
  if (!dts.length) return;
  dts.sort((a, b) => a - b);
  const med = dts[Math.floor(dts.length / 2)]!;
  if (med > 90) {
    warnings.push(`Median bar spacing is ${Math.round(med / 60)}m, not 1m. Pack is used as uploaded — bars were not invented.`);
  }
}

function finishPack(input: {
  symbol: string | null;
  interval?: string;
  source: TapePackSource;
  session_tz?: string;
  bars: TapePackBar[];
  warnings: string[];
}): TapePackParseResult {
  if (!input.symbol) return { ok: false, error: "symbol is required (Orb id or futures root like NQ)." };
  if (!input.bars.length) return { ok: false, error: "No OHLC bars. Empty pack is not filled in." };
  intervalWarning(input.bars, input.interval, input.warnings);
  return {
    ok: true,
    pack: {
      schema: TAPE_SCHEMA,
      symbol: input.symbol,
      interval: "1m",
      source: input.source,
      session_tz: input.session_tz?.trim() || "America/New_York",
      bars: input.bars,
    },
    warnings: input.warnings,
  };
}

function barsFromUnknown(raw: unknown, warnings: string[]): { bars: TapePackBar[]; symbol: string | null } {
  if (!Array.isArray(raw)) return { bars: [], symbol: null };
  const out: TapePackBar[] = [];
  let symbol: string | null = null;
  let skipped = 0;
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      skipped += 1;
      continue;
    }
    const rec = row as Record<string, unknown>;
    const bar = readOhlc(rec);
    if (!bar) {
      skipped += 1;
      continue;
    }
    out.push(bar);
    if (!symbol) {
      const s = rec.symbol ?? rec.ticker ?? rec.instrument;
      if (typeof s === "string") symbol = resolveTapeSymbol(s);
    }
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped === 1 ? "" : "s"} without valid time/OHLC.`);
  return { bars: finalizeBars(out, warnings), symbol };
}

function readMetaField(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
    const hit = Object.keys(obj).find((x) => normKey(x) === normKey(k));
    if (hit && obj[hit] != null) return obj[hit];
  }
  return undefined;
}

export function parseTapePackJson(text: string, opts: TapePackParseOpts = {}): TapePackParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  const warnings: string[] = [];
  const root = parsed as Record<string, unknown> | unknown[];
  if (Array.isArray(root)) {
    const { bars, symbol } = barsFromUnknown(root, warnings);
    return finishPack({
      symbol: symbol ?? (opts.fallbackSymbol ? resolveTapeSymbol(opts.fallbackSymbol) : null),
      source: sourceFrom(undefined, opts.filename),
      bars,
      warnings,
    });
  }
  if (!root || typeof root !== "object") return { ok: false, error: "JSON must be an object or an array of bars." };

  const schema = String(readMetaField(root, ["schema"]) ?? "");
  if (schema && schema !== TAPE_SCHEMA) {
    warnings.push(`schema is ${schema}, expected ${TAPE_SCHEMA}. Parsed anyway.`);
  }

  const barRaw =
    root.bars ?? root.data ?? root.ohlcv ?? root.records ?? (Array.isArray(root.result) ? root.result : null);
  const { bars, symbol: rowSymbol } = barsFromUnknown(barRaw, warnings);
  const rawSym = readMetaField(root, ["symbol", "ticker", "instrument"]);
  const symbol =
    (typeof rawSym === "string" ? resolveTapeSymbol(rawSym) : null) ??
    rowSymbol ??
    (opts.fallbackSymbol ? resolveTapeSymbol(opts.fallbackSymbol) : null);
  const interval = String(readMetaField(root, ["interval", "timeframe", "tf"]) ?? "1m");
  const tz = String(readMetaField(root, ["session_tz", "sessionTz", "tz", "timezone"]) ?? "America/New_York");

  return finishPack({
    symbol,
    interval,
    source: sourceFrom(readMetaField(root, ["source"]), opts.filename),
    session_tz: tz,
    bars,
    warnings,
  });
}

function detectDelim(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        q = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      q = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseHashMeta(lines: string[]): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^#\s*([A-Za-z0-9_]+)\s*[:=]\s*(.+)$/);
    if (m) meta[normKey(m[1]!)] = m[2]!.trim();
  }
  return meta;
}

export function parseTapePackCsv(text: string, opts: TapePackParseOpts = {}): TapePackParseResult {
  const warnings: string[] = [];
  const stripped = text.replace(/^\uFEFF/, "");
  const lines = stripped.split(/\r?\n/);
  const commentLines = lines.filter((l) => l.trimStart().startsWith("#"));
  const hash = parseHashMeta(commentLines);
  const body = lines.filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("#");
  });
  if (body.length < 2) return { ok: false, error: "CSV needs a header row and at least one bar." };

  const delim = detectDelim(body[0]!);
  const headers = splitCsvLine(body[0]!, delim).map((h) => h.trim());
  const timeKey = pickKey(headers, TIME_KEYS);
  const openKey = pickKey(headers, OPEN_KEYS);
  const highKey = pickKey(headers, HIGH_KEYS);
  const lowKey = pickKey(headers, LOW_KEYS);
  const closeKey = pickKey(headers, CLOSE_KEYS);
  const volKey = pickKey(headers, VOL_KEYS);
  const symKey = pickKey(headers, SYMBOL_KEYS);
  if (!timeKey || !openKey || !highKey || !lowKey || !closeKey) {
    return { ok: false, error: "CSV header must include time (ts_event/time) and open, high, low, close." };
  }

  const keys = { t: timeKey, o: openKey, h: highKey, l: lowKey, c: closeKey, v: volKey ?? undefined };
  const out: TapePackBar[] = [];
  let rowSymbol: string | null = null;
  let skipped = 0;
  for (let i = 1; i < body.length; i++) {
    const cols = splitCsvLine(body[i]!, delim);
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) rec[headers[c]!] = cols[c] ?? "";
    const bar = readOhlc(rec, keys);
    if (!bar) {
      skipped += 1;
      continue;
    }
    out.push(bar);
    if (!rowSymbol && symKey) {
      const s = String(rec[symKey] ?? "");
      rowSymbol = resolveTapeSymbol(s);
    }
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped === 1 ? "" : "s"} without valid time/OHLC.`);

  const symbol =
    (hash.symbol ? resolveTapeSymbol(hash.symbol) : null) ??
    rowSymbol ??
    (opts.fallbackSymbol ? resolveTapeSymbol(opts.fallbackSymbol) : null);

  return finishPack({
    symbol,
    interval: hash.interval ?? "1m",
    source: sourceFrom(hash.source ?? "csv", opts.filename),
    session_tz: hash.session_tz ?? hash.tz,
    bars: finalizeBars(out, warnings),
    warnings,
  });
}

export function parseTapePack(text: string, opts: TapePackParseOpts = {}): TapePackParseResult {
  const name = (opts.filename ?? "").toLowerCase();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "File is empty." };
  if (name.endsWith(".csv") || name.endsWith(".tsv")) return parseTapePackCsv(trimmed, opts);
  if (name.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseTapePackJson(trimmed, opts);
  }
  const head = trimmed.slice(0, 280);
  if (/ts_event|open[,	]|timestamp/i.test(head) && (head.includes(",") || head.includes("\t"))) {
    return parseTapePackCsv(trimmed, opts);
  }
  return parseTapePackJson(trimmed, opts);
}

export function packBarsToMarket(pack: TapePack): Bar[] {
  return withDelta(
    pack.bars.map((b) => ({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      buyVolume: 0,
      sellVolume: 0,
    })),
  );
}

/** Globex-aware session split via `sessionsFromIntraday` (18:00 ET rolls to the next trading day). */
export function sessionsFromTapePack(pack: TapePack): SessionDay[] {
  if (!pack.bars.length) return [];
  return sessionsFromIntraday(pack.symbol, packBarsToMarket(pack));
}

export function tapePackCoverage(pack: { bars: TapePackBar[] }): TapePackCoverage {
  const bars = pack.bars;
  if (!bars.length) {
    return {
      barCount: 0,
      start: null,
      end: null,
      dateStart: null,
      dateEnd: null,
      londonBars: 0,
      hasLondon: false,
    };
  }
  let londonBars = 0;
  for (const b of bars) {
    const m = nyParts(b.time).minutes;
    if (m >= LONDON_START_MIN && m < LONDON_END_MIN) londonBars += 1;
  }
  const start = bars[0]!.time;
  const end = bars[bars.length - 1]!.time;
  return {
    barCount: bars.length,
    start,
    end,
    dateStart: nyParts(start).date,
    dateEnd: nyParts(end).date,
    londonBars,
    hasLondon: londonBars > 0,
  };
}

export function tapePackMetaFrom(pack: TapePack, id: string, uploadedAt: number, persisted: boolean): TapePackMeta {
  const cov = tapePackCoverage(pack);
  return {
    id,
    symbol: pack.symbol,
    uploadedAt,
    barCount: pack.bars.length,
    source: pack.source,
    dateStart: cov.dateStart,
    dateEnd: cov.dateEnd,
    londonBars: cov.londonBars,
    persisted,
  };
}

export function packStorageId(symbol: string): string {
  return `pack-${symbol}`;
}
