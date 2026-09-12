import { createServerFn } from "@tanstack/react-start";
import { evaluatePlaybook } from "./evaluate";
import { sessionsFromDaily, sessionsFromIntraday, withDelta } from "./session";
import { getSymbol, SYMBOLS } from "./symbols";
import type { Bar, ChartFeed, FeedInterval, FeedRange, Playbook, Quote } from "./types";

const mem = new Map<string, { t: number; v: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then((v) => {
      mem.set(key, { t: Date.now(), v });
      if (mem.size > 240) {
        const first = mem.keys().next().value;
        if (first) mem.delete(first);
      }
      return v;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function yahooJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Feed ${res.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Feed ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Feed down");
}

function lastNum(xs: Array<number | null | undefined>): number | null {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function pos(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function parseBars(payload: unknown): {
  bars: Bar[];
  last: number;
  prevClose: number;
  changePct: number;
  asOf: number;
} {
  const root = payload as {
    chart?: {
      result?: {
        timestamp?: number[];
        meta?: {
          regularMarketPrice?: number;
          chartPreviousClose?: number;
          previousClose?: number;
          regularMarketTime?: number;
        };
        indicators?: { quote?: Array<Record<string, Array<number | null>>> };
      }[];
    };
  };
  const result = root.chart?.result?.[0];
  if (!result) throw new Error("No chart data");
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens = q.open ?? [];
  const highs = q.high ?? [];
  const lows = q.low ?? [];
  const closes = q.close ?? [];
  const vols = q.volume ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }
    bars.push({
      time: ts[i]!,
      open,
      high,
      low,
      close,
      volume: typeof vols[i] === "number" ? vols[i]! : 0,
      buyVolume: 0,
      sellVolume: 0,
    });
  }
  const meta = result.meta ?? {};
  const last = pos(meta.regularMarketPrice) ?? lastNum(closes) ?? pos(bars.at(-1)?.close) ?? 0;
  const prevClose = pos(meta.chartPreviousClose) ?? pos(meta.previousClose) ?? pos(bars[0]?.open) ?? last;
  const changePct = prevClose ? (last - prevClose) / prevClose : 0;
  return {
    bars: withDelta(bars),
    last,
    prevClose,
    changePct,
    asOf: meta.regularMarketTime ?? bars.at(-1)?.time ?? Math.floor(Date.now() / 1000),
  };
}

export const fetchQuotes = createServerFn({ method: "POST" })
  .validator((input: { ids: string[] }) => input)
  .handler(async ({ data }) => {
    const ids = data.ids.filter((id) => SYMBOLS.some((s) => s.id === id)).slice(0, 16);
    if (!ids.length) return { ok: false as const, error: "No symbols" };
    const key = `q:${ids.join(",")}`;
    try {
      const quotes = await cached(key, 8000, async () => {
        const yahoos = ids.map((id) => getSymbol(id).yahoo);
        const params = new URLSearchParams({
          symbols: yahoos.join(","),
          range: "1d",
          interval: "5m",
        });
        const raw = (await yahooJson(
          `https://query1.finance.yahoo.com/v8/finance/spark?${params.toString()}`,
        )) as Record<
          string,
          {
            symbol?: string;
            previousClose?: number;
            chartPreviousClose?: number;
            fulldayPrice?: number;
            fulldayChange?: number;
            fulldayChangePercent?: number;
            close?: Array<number | null>;
            timestamp?: number[];
          }
        >;
        const byYahoo = new Map(ids.map((id) => [getSymbol(id).yahoo, id]));
        const out: Record<string, Quote> = {};
        for (const [yahoo, row] of Object.entries(raw)) {
          const id = byYahoo.get(yahoo) ?? byYahoo.get(row.symbol ?? "") ?? null;
          if (!id || !row || typeof row !== "object") continue;
          const closes = (row.close ?? []).filter((n): n is number => typeof n === "number" && n > 0);
          const last = pos(row.fulldayPrice) ?? closes.at(-1) ?? 0;
          if (last <= 0) continue;
          const prev = pos(row.chartPreviousClose) ?? pos(row.previousClose) ?? closes[0] ?? last;
          const change = typeof row.fulldayChange === "number" ? row.fulldayChange : last - prev;
          const changePct =
            typeof row.fulldayChangePercent === "number"
              ? row.fulldayChangePercent / 100
              : prev
                ? change / prev
                : 0;
          const spark = closes.filter((_, i) => i % 3 === 0 || i === closes.length - 1);
          out[id] = {
            id,
            last,
            prevClose: prev,
            change,
            changePct,
            high: closes.length ? Math.max(...closes) : last,
            low: closes.length ? Math.min(...closes) : last,
            volume: 0,
            spark,
            asOf: row.timestamp?.at(-1) ?? Math.floor(Date.now() / 1000),
          };
        }
        if (!Object.keys(out).length) throw new Error("Empty spark");
        return out;
      });
      return { ok: true as const, quotes };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Feed down" };
    }
  });

/** Same-contract futures only — never label QQQ as NQ. */
const YAHOO_FALLBACKS: Record<string, string[]> = {
  NQ: ["NQ=F", "MNQ=F"],
  ES: ["ES=F", "MES=F"],
  YM: ["YM=F", "MYM=F"],
  CL: ["CL=F"],
  GC: ["GC=F"],
};

function yahooInterval(interval: FeedInterval): string {
  if (interval === "60m") return "60m";
  return interval;
}

function chartQuery(interval: FeedInterval, range: FeedRange): string {
  return `interval=${yahooInterval(interval)}&range=${range}&includePrePost=true`;
}

async function loadChart(id: string, yahoo: string, interval: FeedInterval, range: FeedRange): Promise<ChartFeed> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?${chartQuery(interval, range)}`;
  const parsed = parseBars(await yahooJson(url));
  if (parsed.bars.length < 4) throw new Error("Sparse chart");
  return {
    id,
    interval,
    bars: parsed.bars,
    last: parsed.last,
    prevClose: parsed.prevClose,
    changePct: parsed.changePct,
    asOf: parsed.asOf,
    yahoo,
  };
}

export const fetchChart = createServerFn({ method: "POST" })
  .validator((input: { id: string; interval?: FeedInterval; range?: FeedRange }) => input)
  .handler(async ({ data }) => {
    const spec = getSymbol(data.id);
    const interval = data.interval ?? "5m";
    const range = data.range ?? "5d";
    const tickers = [...new Set([spec.yahoo, ...(YAHOO_FALLBACKS[data.id] ?? [])])];
    const key = `c:${tickers.join("|")}:${interval}:${range}`;
    const ttl = range === "1mo" || range === "3mo" || range === "1y" ? 180_000 : 12_000;
    try {
      const chart = await cached(key, ttl, async () => {
        let lastErr: unknown;
        for (const yahoo of tickers) {
          try {
            return await loadChart(data.id, yahoo, interval, range);
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error("Chart down");
      });
      return { ok: true as const, chart };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Chart down" };
    }
  });

async function packedSessions(id: string): Promise<{
  sessions: ReturnType<typeof sessionsFromIntraday>;
  daily: ReturnType<typeof sessionsFromDaily>;
}> {
  const spec = getSymbol(id);
  const tickers = [...new Set([spec.yahoo, ...(YAHOO_FALLBACKS[id] ?? [])])];
  const key = `s:${tickers.join("|")}`;
  return cached(key, 180_000, async () => {
    let lastErr: unknown;
    let sessions: ReturnType<typeof sessionsFromIntraday> = [];
    for (const yahoo of tickers) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=5m&range=60d&includePrePost=true`;
        const parsed = parseBars(await yahooJson(url));
        const list = sessionsFromIntraday(id, parsed.bars);
        if (list.length >= 4) {
          sessions = list;
          break;
        }
        lastErr = new Error("Sparse sessions");
      } catch (err) {
        lastErr = err;
      }
    }
    if (!sessions.length) {
      for (const yahoo of tickers) {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=5m&range=1mo&includePrePost=true`;
          const parsed = parseBars(await yahooJson(url));
          const list = sessionsFromIntraday(id, parsed.bars);
          if (list.length >= 4) {
            sessions = list;
            break;
          }
        } catch (err) {
          lastErr = err;
        }
      }
    }
    if (!sessions.length) throw lastErr instanceof Error ? lastErr : new Error("Sessions down");

    let daily: ReturnType<typeof sessionsFromDaily> = [];
    for (const yahoo of tickers) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1y&includePrePost=true`;
        const parsed = parseBars(await yahooJson(url));
        daily = sessionsFromDaily(id, parsed.bars);
        if (daily.length >= 20) break;
      } catch {
        /* optional */
      }
    }
    return { sessions, daily };
  });
}

export const fetchSessions = createServerFn({ method: "POST" })
  .validator((input: { id: string; days?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const packed = await packedSessions(data.id);
      const days = data.days ?? 40;
      return {
        ok: true as const,
        sessions: packed.sessions.slice(0, days),
        daily: packed.daily.slice(0, Math.max(days, 80)),
        available: packed.sessions.length,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Sessions down" };
    }
  });

export const evaluateOnFeed = createServerFn({ method: "POST" })
  .validator((input: { playbook: Playbook; days?: number; allowMock?: boolean }) => input)
  .handler(async ({ data }) => {
    const playbook = data.playbook;
    const symbol = playbook.symbol || "NQ";
    const days = data.days ?? 40;
    let live: ReturnType<typeof sessionsFromIntraday> | null = null;
    try {
      const packed = await packedSessions(symbol);
      if (packed.sessions.length >= 4) live = packed.sessions;
    } catch {
      live = null;
    }
    const evaluation = evaluatePlaybook(playbook, days, live ?? undefined, Boolean(data.allowMock) && !live);
    return { ok: true as const, evaluation, live: Boolean(live && live.length >= 4) };
  });
