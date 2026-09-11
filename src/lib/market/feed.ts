import { createServerFn } from "@tanstack/react-start";
import { evaluatePlaybook } from "./evaluate";
import { sessionsFromIntraday, withDelta } from "./session";
import { getSymbol, SYMBOLS } from "./symbols";
import type { Bar, ChartFeed, FeedInterval, FeedRange, Playbook, Quote } from "./types";

const mem = new Map<string, { t: number; v: unknown }>();

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v as T;
  const v = await fn();
  mem.set(key, { t: Date.now(), v });
  if (mem.size > 240) {
    const first = mem.keys().next().value;
    if (first) mem.delete(first);
  }
  return v;
}

async function yahooJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OrbDesk/1.0; +https://grok.com)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Feed ${res.status}`);
  return res.json();
}

function lastNum(xs: Array<number | null | undefined>): number | null {
  for (let i = xs.length - 1; i >= 0; i--) {
    const v = xs[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
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
  const last = meta.regularMarketPrice ?? lastNum(closes) ?? bars.at(-1)?.close ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? bars[0]?.open ?? last;
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
          const closes = (row.close ?? []).filter((n): n is number => typeof n === "number");
          const last = row.fulldayPrice ?? closes.at(-1) ?? 0;
          const prev = row.chartPreviousClose ?? row.previousClose ?? closes[0] ?? last;
          const change = row.fulldayChange ?? last - prev;
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

const YAHOO_FALLBACKS: Record<string, string[]> = {
  NQ: ["NQ=F", "MNQ=F", "QQQ"],
  ES: ["ES=F", "MES=F", "SPY"],
  YM: ["YM=F", "DIA"],
  CL: ["CL=F"],
  GC: ["GC=F"],
};

function yahooInterval(interval: FeedInterval): string {
  if (interval === "60m") return "60m";
  return interval;
}

async function loadChart(id: string, yahoo: string, interval: FeedInterval, range: FeedRange): Promise<ChartFeed> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${yahooInterval(interval)}&range=${range}&includePrePost=true`;
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
  };
}

export const fetchChart = createServerFn({ method: "POST" })
  .validator((input: { id: string; interval?: FeedInterval; range?: FeedRange }) => input)
  .handler(async ({ data }) => {
    const spec = getSymbol(data.id);
    const interval = data.interval ?? "5m";
    const range = data.range ?? "1d";
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

export const fetchSessions = createServerFn({ method: "POST" })
  .validator((input: { id: string; days?: number }) => input)
  .handler(async ({ data }) => {
    const spec = getSymbol(data.id);
    const tickers = [...new Set([spec.yahoo, ...(YAHOO_FALLBACKS[data.id] ?? [])])];
    const key = `s:${tickers.join("|")}`;
    try {
      const sessions = await cached(key, 180_000, async () => {
        let lastErr: unknown;
        for (const yahoo of tickers) {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=5m&range=1mo&includePrePost=true`;
            const parsed = parseBars(await yahooJson(url));
            const list = sessionsFromIntraday(data.id, parsed.bars);
            if (list.length >= 4) return list;
            lastErr = new Error("Sparse sessions");
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error("Sessions down");
      });
      const days = data.days ?? 40;
      return { ok: true as const, sessions: sessions.slice(0, days) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Sessions down" };
    }
  });

export const evaluateOnFeed = createServerFn({ method: "POST" })
  .validator((input: { playbook: Playbook; days?: number }) => input)
  .handler(async ({ data }) => {
    const playbook = data.playbook;
    const symbol = playbook.symbol || "NQ";
    const days = data.days ?? 40;
    const spec = getSymbol(symbol);
    const tickers = [...new Set([spec.yahoo, ...(YAHOO_FALLBACKS[symbol] ?? [])])];
    let live = null as ReturnType<typeof sessionsFromIntraday> | null;
    for (const yahoo of tickers) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=5m&range=1mo&includePrePost=true`;
        const parsed = parseBars(await yahooJson(url));
        const sessions = sessionsFromIntraday(symbol, parsed.bars);
        if (sessions.length >= 6) {
          live = sessions;
          break;
        }
      } catch {
        /* next ticker */
      }
    }
    const evaluation = evaluatePlaybook(playbook, days, live ?? undefined);
    return { ok: true as const, evaluation, live: Boolean(live && live.length >= 6) };
  });
