import { hash32, mulberry32, randn } from "./rng";
import { getSymbol } from "./symbols";
import {
  AS_OF_DATE,
  AS_OF_MINUTES,
  sessionOpenUnix,
  weekdayOf,
} from "./calendar";
import type { Bar, BreakKind, RangeLevel, SessionDay, SymbolSpec } from "./types";

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

export function generateMinuteBars(symbolId: string, date: string): Bar[] {
  const key = `${symbolId}:${date}`;
  const cached = MINUTE_CACHE.get(key);
  if (cached) return cached;

  const spec = getSymbol(symbolId);
  const rng = mulberry32(hash32(`m1:${symbolId}:${date}`));
  const openUnix = sessionOpenUnix(date);
  const prevClose = prevCloseFor(spec, date);
  const gap = roundTick(prevClose * (rng() - 0.49) * spec.gapSigma * 2.4, spec.tick);
  let price = roundTick(prevClose + gap, spec.tick);
  const open = price;
  const regime = pickRegime(spec, rng);
  const reversalFlip = 0.28 + rng() * 0.18;

  const n = 390;
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const uShape = 0.65 + 1.15 * (2 * t - 1) ** 2;
    const lunch = t > 0.38 && t < 0.58 ? 0.52 : 1;
    const vol = spec.barVol * uShape * lunch;

    let drift = 0;
    if (regime === "trendUp") drift = spec.barVol * 0.16;
    else if (regime === "trendDown") drift = -spec.barVol * 0.16;
    else if (regime === "breakoutUp" && i > 15) drift = spec.barVol * 0.22;
    else if (regime === "breakoutDown" && i > 15) drift = -spec.barVol * 0.22;
    else if (regime === "reversalUp")
      drift = (t < reversalFlip ? -1 : 1) * spec.barVol * 0.2;
    else if (regime === "reversalDown")
      drift = (t < reversalFlip ? 1 : -1) * spec.barVol * 0.2;
    else if (regime === "range" && i > 20)
      drift = ((open - price) / Math.max(price, 1e-9)) * 0.12;

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
      Math.round((baseVol + Math.abs(c - o) / spec.tick) * uShape * lunch * (8 + rng() * 10)),
    );
    const buyShare = 0.5 + dir * 0.16 + (rng() - 0.5) * 0.12;
    const buyVolume = Math.round(volume * Math.min(0.88, Math.max(0.12, buyShare)));

    bars.push({
      time: openUnix + i * 60,
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

  const truncated =
    date === AS_OF_DATE ? bars.slice(0, Math.max(16, AS_OF_MINUTES)) : bars;
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

function rangeOf(bars: Bar[]): RangeLevel {
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  return { high, low, mid: (high + low) / 2, size: high - low };
}

function classifyBreak(after: Bar[], range: RangeLevel): {
  kind: BreakKind;
  time: number | null;
  first: "up" | "down" | null;
  extension: number;
} {
  let up = false;
  let down = false;
  let first: "up" | "down" | null = null;
  let time: number | null = null;
  let maxExt = 0;
  const size = Math.max(range.size, 1e-9);
  for (const b of after) {
    if (b.high > range.high) {
      if (!up && !down) {
        first = "up";
        time = b.time;
      }
      up = true;
      maxExt = Math.max(maxExt, (b.high - range.high) / size);
    }
    if (b.low < range.low) {
      if (!up && !down) {
        first = "down";
        time = b.time;
      }
      if (!down && up && time === null) time = b.time;
      down = true;
      maxExt = Math.max(maxExt, (range.low - b.low) / size);
    }
  }
  const kind: BreakKind = up && down ? "both" : up ? "up" : down ? "down" : "none";
  return { kind, time, first, extension: maxExt };
}

function vwapOf(bars: Bar[]): number {
  let pv = 0;
  let v = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    v += b.volume;
  }
  return v ? pv / v : bars[bars.length - 1]?.close ?? 0;
}

function pocOf(bars: Bar[], tick: number): number {
  const buckets = new Map<number, number>();
  for (const b of bars) {
    const key = Math.round(((b.high + b.low + b.close) / 3) / tick) * tick;
    buckets.set(key, (buckets.get(key) ?? 0) + b.volume);
  }
  let best = bars[0]?.close ?? 0;
  let max = -1;
  for (const [px, vol] of buckets) {
    if (vol > max) {
      max = vol;
      best = px;
    }
  }
  return best;
}

export function getSession(symbolId: string, date: string, barMinutes = 5): SessionDay {
  const key = `${symbolId}:${date}:${barMinutes}`;
  const cached = SESSION_CACHE.get(key);
  if (cached) return cached;

  const spec = getSymbol(symbolId);
  const minutes = generateMinuteBars(symbolId, date);
  const bars = aggregateBars(minutes, barMinutes);
  const prevClose = prevCloseFor(spec, date);
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (!first || !last) {
    throw new Error(`No bars for ${symbolId} ${date}`);
  }

  const orbMinutes = Math.max(1, Math.round(15 / barMinutes));
  const ibMinutes = Math.max(1, Math.round(60 / barMinutes));
  const orbBars = minutes.slice(0, 15);
  const ibBars = minutes.slice(0, 60);
  const orb = rangeOf(orbBars.length ? orbBars : bars.slice(0, orbMinutes));
  const ib = rangeOf(ibBars.length ? ibBars : bars.slice(0, ibMinutes));
  const afterOrb = minutes.slice(15);
  const afterIb = minutes.slice(60);
  const orbB = classifyBreak(afterOrb, orb);
  const ibB = classifyBreak(afterIb, ib);

  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const gap = first.open - prevClose;
  const gapDir = gap >= 0 ? 1 : -1;
  const fillLevel = prevClose;
  let gapFilled = false;
  let gapFillTime: number | null = null;
  if (Math.abs(gap) < spec.tick) {
    gapFilled = true;
    gapFillTime = first.time;
  } else {
    for (const b of minutes) {
      if (gapDir > 0 && b.low <= fillLevel) {
        gapFilled = true;
        gapFillTime = b.time;
        break;
      }
      if (gapDir < 0 && b.high >= fillLevel) {
        gapFilled = true;
        gapFillTime = b.time;
        break;
      }
    }
  }

  const occ: "up" | "down" = ib.mid >= first.open ? "up" : "down";
  const occContinued = occ === "up" ? last.close >= ib.high : last.close <= ib.low;

  const session: SessionDay = {
    symbol: symbolId,
    date,
    weekday: weekdayOf(date),
    bars,
    barMinutes,
    prevClose,
    open: first.open,
    close: last.close,
    high,
    low,
    gap,
    gapPct: gap / prevClose,
    gapFilled,
    gapFillTime,
    orb,
    orbBreak: orbB.kind,
    orbBreakTime: orbB.time,
    orbExtension: orbB.extension,
    ib,
    ibBreak: ibB.kind,
    ibBreakTime: ibB.time,
    ibExtension: ibB.extension,
    ibFirstBreak: ibB.first,
    occ,
    occContinued,
    range: high - low,
    vwap: vwapOf(bars),
    poc: pocOf(bars, spec.tick),
  };
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

export function cumulativeDelta(bars: Bar[]): { time: number; value: number }[] {
  let sum = 0;
  return bars.map((b) => {
    sum += b.buyVolume - b.sellVolume;
    return { time: b.time, value: sum };
  });
}

export function volumeProfile(bars: Bar[], tick: number, buckets = 28) {
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
