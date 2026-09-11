import { hash32, mulberry32, randn } from "./rng";
import { getSymbol } from "./symbols";
import { sessionFromBars } from "./session";
import { AS_OF_DATE, AS_OF_MINUTES, globexOpenUnix, sessionOpenUnix } from "./calendar";
import type { Bar, SessionDay, SymbolSpec } from "./types";

const MINUTE_CACHE = new Map<string, Bar[]>();
const SESSION_CACHE = new Map<string, SessionDay>();
const PREV_CACHE = new Map<string, number>();

type Regime =
  | "trendUp"
  | "trendDown"
  | "breakoutUp"
  | "breakoutDown"
  | "range"
  | "reversalUp"
  | "reversalDown";

function roundTick(n: number, tick: number): number {
  return Math.round(n / tick) * tick;
}

function prevCloseFor(spec: SymbolSpec, date: string): number {
  const key = `${spec.id}:${date}`;
  const hit = PREV_CACHE.get(key);
  if (hit !== undefined) return hit;

  const rng = mulberry32(hash32(`px:${spec.id}:${date}`));
  const daysBack = Math.abs(hash32(date) % 80) / 80;
  const walk = (rng() - 0.48) * spec.gapSigma * 18 * (0.4 + daysBack);
  const px = roundTick(spec.typical * (1 + walk), spec.tick);
  PREV_CACHE.set(key, px);
  return px;
}

function pickRegime(spec: SymbolSpec, rng: () => number): Regime {
  const r = rng();
  const t = spec.pTrend;
  const b = t + spec.pBreakout;
  const v = b + spec.pReversal;
  if (r < t) return rng() < 0.54 ? "trendUp" : "trendDown";
  if (r < b) return rng() < 0.52 ? "breakoutUp" : "breakoutDown";
  if (r < v) return rng() < 0.5 ? "reversalUp" : "reversalDown";
  return "range";
}

/** 18:00 ET previous day → 16:00 ET session date (Globex + RTH). */
export function generateMinuteBars(symbolId: string, date: string): Bar[] {
  const key = `${symbolId}:${date}`;
  const cached = MINUTE_CACHE.get(key);
  if (cached) return cached;

  const spec = getSymbol(symbolId);
  const rng = mulberry32(hash32(`m1:${symbolId}:${date}`));
  const globex = globexOpenUnix(date);
  const rthOpen = sessionOpenUnix(date);
  const prevClose = prevCloseFor(spec, date);
  const gap = roundTick(prevClose * (rng() - 0.49) * spec.gapSigma * 2.4, spec.tick);
  let price = roundTick(prevClose * (1 + (rng() - 0.5) * spec.gapSigma * 0.35), spec.tick);
  const rthOpenPx = roundTick(prevClose + gap, spec.tick);
  const regime = pickRegime(spec, rng);
  const reversalFlip = 0.28 + rng() * 0.18;

  const n = 1320;
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const time = globex + i * 60;
    const clock = (18 * 60 + i) % (24 * 60);
    const isRth = clock >= 9 * 60 + 30 && clock < 16 * 60;
    const rthT = isRth ? (clock - (9 * 60 + 30)) / 390 : 0;
    const overnight = !isRth;
    const uShape = isRth ? 0.65 + 1.15 * (2 * rthT - 1) ** 2 : 0.38;
    const lunch = isRth && rthT > 0.38 && rthT < 0.58 ? 0.52 : 1;
    const asia = clock >= 20 * 60 || clock < 3 * 60 ? 0.55 : 1;
    const london = clock >= 3 * 60 && clock < 8 * 60 ? 0.85 : 1;
    const vol = spec.barVol * uShape * lunch * (overnight ? 0.42 * asia * london : 1);

    if (time === rthOpen) price = rthOpenPx;

    let drift = 0;
    if (isRth) {
      const iRth = clock - (9 * 60 + 30);
      if (regime === "trendUp") drift = spec.barVol * 0.16;
      else if (regime === "trendDown") drift = -spec.barVol * 0.16;
      else if (regime === "breakoutUp" && iRth > 15) drift = spec.barVol * 0.22;
      else if (regime === "breakoutDown" && iRth > 15) drift = -spec.barVol * 0.22;
      else if (regime === "reversalUp")
        drift = (rthT < reversalFlip ? -1 : 1) * spec.barVol * 0.2;
      else if (regime === "reversalDown")
        drift = (rthT < reversalFlip ? 1 : -1) * spec.barVol * 0.2;
      else if (regime === "range" && iRth > 20)
        drift = ((rthOpenPx - price) / Math.max(price, 1e-9)) * 0.12;
    } else {
      drift = ((prevClose - price) / Math.max(price, 1e-9)) * 0.04;
    }

    const shock = randn(rng) * vol;
    const o = price;
    let c = roundTick(o * (1 + drift + shock), spec.tick);
    const wickAmp = Math.abs(randn(rng)) * vol * o * 0.85;
    let h = roundTick(Math.max(o, c) + wickAmp * rng(), spec.tick);
    let l = roundTick(Math.min(o, c) - wickAmp * rng(), spec.tick);
    if (h < Math.max(o, c)) h = Math.max(o, c);
    if (l > Math.min(o, c)) l = Math.min(o, c);
    if (h === l) h = roundTick(h + spec.tick, spec.tick);

    const dir = c >= o ? 1 : -1;
    const baseVol = spec.kind === "crypto" ? 42 : spec.kind === "forex" ? 80 : 18;
    const volume = Math.max(
      1,
      Math.round(
        (baseVol + Math.abs(c - o) / spec.tick) *
          uShape *
          lunch *
          (overnight ? 4 + rng() * 6 : 8 + rng() * 10),
      ),
    );
    const buyShare = 0.5 + dir * 0.16 + (rng() - 0.5) * 0.12;
    const buyVolume = Math.round(volume * Math.min(0.88, Math.max(0.12, buyShare)));

    bars.push({
      time,
      open: o,
      high: h,
      low: l,
      close: c,
      volume,
      buyVolume,
      sellVolume: volume - buyVolume,
    });
    price = c;
  }

  const cutoff = date === AS_OF_DATE ? rthOpen + Math.max(16, AS_OF_MINUTES) * 60 : Infinity;
  const truncated = bars.filter((b) => b.time <= cutoff);
  MINUTE_CACHE.set(key, truncated);
  return truncated;
}

export function aggregateBars(bars: Bar[], minutes: number): Bar[] {
  if (minutes <= 1) return bars;
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += minutes) {
    const slice = bars.slice(i, i + minutes);
    const first = slice[0];
    const last = slice[slice.length - 1];
    if (!first || !last) continue;
    out.push({
      time: first.time,
      open: first.open,
      high: Math.max(...slice.map((b) => b.high)),
      low: Math.min(...slice.map((b) => b.low)),
      close: last.close,
      volume: slice.reduce((s, b) => s + b.volume, 0),
      buyVolume: slice.reduce((s, b) => s + b.buyVolume, 0),
      sellVolume: slice.reduce((s, b) => s + b.sellVolume, 0),
    });
  }
  return out;
}

export function getSession(symbolId: string, date: string, barMinutes = 5): SessionDay {
  const key = `${symbolId}:${date}:${barMinutes}`;
  const cached = SESSION_CACHE.get(key);
  if (cached) return cached;

  const spec = getSymbol(symbolId);
  const minutes = generateMinuteBars(symbolId, date);
  const bars = aggregateBars(minutes, barMinutes);
  const prevClose = prevCloseFor(spec, date);
  const session = sessionFromBars({
    symbol: symbolId,
    date,
    bars: minutes,
    prevClose,
    barMinutes: 1,
  });
  session.bars = bars;
  session.barMinutes = barMinutes;
  SESSION_CACHE.set(key, session);
  return session;
}

export function getSessions(symbolId: string, dates: string[], barMinutes = 5): SessionDay[] {
  return dates.map((d) => getSession(symbolId, d, barMinutes));
}

export function lastPrice(symbolId: string, date = AS_OF_DATE): number {
  const s = getSession(symbolId, date, 5);
  return s.close;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= period) sum -= values[i - period] ?? 0;
    const n = Math.min(i + 1, period);
    out.push(sum / n);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [];
  let avgG = 0;
  let avgL = 0;
  for (let i = 0; i < values.length; i++) {
    const ch = i === 0 ? 0 : (values[i] ?? 0) - (values[i - 1] ?? 0);
    const g = Math.max(0, ch);
    const l = Math.max(0, -ch);
    if (i <= period) {
      avgG += g / period;
      avgL += l / period;
    } else {
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
    }
    const rs = avgL === 0 ? 100 : avgG / avgL;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function cumulativeDelta(bars: Bar[]): { time: number; value: number }[] {
  let sum = 0;
  return bars.map((b) => {
    sum += b.buyVolume - b.sellVolume;
    return { time: b.time, value: sum };
  });
}

export function volumeProfile(bars: Bar[], tick: number, buckets = 28) {
  if (!bars.length) return { rows: [], poc: 0, step: tick };
  const lo = Math.min(...bars.map((b) => b.low));
  const hi = Math.max(...bars.map((b) => b.high));
  const step = Math.max(tick, (hi - lo) / buckets);
  const rows = Array.from({ length: buckets }, (_, i) => ({
    price: lo + (i + 0.5) * step,
    volume: 0,
    buy: 0,
    sell: 0,
  }));
  for (const b of bars) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((b.close - lo) / step)));
    const row = rows[idx];
    if (!row) continue;
    row.volume += b.volume;
    row.buy += b.buyVolume;
    row.sell += b.sellVolume;
  }
  const poc = rows.reduce((a, b) => (b.volume > a.volume ? b : a), rows[0]!);
  return { rows, poc: poc.price, step };
}
