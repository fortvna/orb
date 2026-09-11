import { ema, rsi as rsiSeries, sma, volumeProfile } from "./generate";
import { nyParts } from "./session";
import type { Bar, IndicatorId, SessionDay } from "./types";

export const DEFAULT_INDICATORS: IndicatorId[] = [
  "volume",
  "killzones",
  "keyTimes",
  "vwap",
  "htf",
  "po3",
  "fvg",
];

export const INDICATOR_CATALOG: {
  group: string;
  items: { id: IndicatorId; name: string; blurb: string }[];
}[] = [
  {
    group: "Sessions & time",
    items: [
      { id: "sessionHL", name: "Session high / low", blurb: "Asia, London, NY range extremes." },
      { id: "keyTimes", name: "Key time levels", blurb: "8:30 / 9:30 / 10:00 opens, extended." },
      { id: "killzones", name: "ICT killzones", blurb: "Asia / London / NY AM / NY PM windows." },
      { id: "openPrice", name: "Opening price", blurb: "Midnight and RTH 09:30 opens." },
      { id: "quarterly", name: "Quarterly theory", blurb: "Q1–Q4 of the 18:00→18:00 day." },
    ],
  },
  {
    group: "Bands & averages",
    items: [
      { id: "vwap", name: "VWAP", blurb: "Session-anchored VWAP." },
      { id: "stdev", name: "StdDev bands", blurb: "SMA ± k·σ envelope over closes." },
      { id: "ema", name: "EMA", blurb: "Exponential averages — 9 and 21." },
    ],
  },
  {
    group: "Oscillators",
    items: [{ id: "rsi", name: "RSI", blurb: "Relative strength in a bottom pane." }],
  },
  {
    group: "Volume",
    items: [
      { id: "volume", name: "Volume", blurb: "Per-bar volume histogram." },
      { id: "vrvp", name: "Visible range profile", blurb: "Volume profile over the visible range, with POC." },
      { id: "hvn", name: "High volume nodes", blurb: "HVN price levels — peaks of the profile." },
    ],
  },
  {
    group: "Higher timeframe",
    items: [
      { id: "htf", name: "HTF candles", blurb: "Hourly candles overlaid on the chart." },
      { id: "po3", name: "HTF PO3 candle", blurb: "Power of 3 open + range on the first RTH hour." },
    ],
  },
  {
    group: "Price action",
    items: [
      { id: "fvg", name: "Fair value gap", blurb: "3-candle imbalances, tracked until filled." },
      { id: "pivots", name: "Pivots", blurb: "Swing pivot highs and lows." },
      { id: "eqHL", name: "Equal highs / lows", blurb: "Paired equals within tolerance." },
      { id: "stopHunt", name: "Stop hunt", blurb: "Wick past a pivot, close back inside." },
    ],
  },
];

export type Killzone = {
  label: string;
  startMin: number;
  endMin: number;
  color: string;
};

export const KILLZONES: Killzone[] = [
  { label: "Asia", startMin: 20 * 60, endMin: 24 * 60, color: "rgba(90,110,90,0.14)" },
  { label: "Asia", startMin: 0, endMin: 2 * 60, color: "rgba(90,110,90,0.14)" },
  { label: "London", startMin: 2 * 60, endMin: 5 * 60, color: "rgba(28,27,24,0.06)" },
  { label: "NY AM", startMin: 7 * 60, endMin: 10 * 60, color: "rgba(196,165,116,0.22)" },
  { label: "NY PM", startMin: 13 * 60 + 30, endMin: 16 * 60, color: "rgba(90,110,130,0.12)" },
];

export type HtfCandle = {
  start: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FvgBox = {
  start: number;
  end: number;
  high: number;
  low: number;
  dir: "up" | "down";
  filled: boolean;
};

export type Pivot = { time: number; price: number; kind: "h" | "l" };

export type ChartModel = {
  vwap: number[];
  ema9: number[];
  ema21: number[];
  rsi: number[];
  stdMid: number[];
  stdUp: number[];
  stdDn: number[];
  htf: HtfCandle[];
  po3: HtfCandle | null;
  fvgs: FvgBox[];
  pivots: Pivot[];
  equals: { a: number; b: number; price: number; kind: "h" | "l" }[];
  stopHunts: { time: number; price: number; kind: "h" | "l" }[];
  profile: { price: number; volume: number }[];
  poc: number;
  keyOpens: { minutes: number; price: number; label: string }[];
  midnightOpen: number | null;
  rthOpen: number | null;
};

export function buildChartModel(bars: Bar[], session: SessionDay | null, tick: number): ChartModel {
  const closes = bars.map((b) => b.close);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const mid = sma(closes, 20);
  const std = closes.map((_, i) => {
    const slice = closes.slice(Math.max(0, i - 19), i + 1);
    const m = mid[i] ?? 0;
    const v = slice.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, slice.length);
    return Math.sqrt(v);
  });
  const vwap: number[] = [];
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
    vwap.push(vol ? pv / vol : tp);
  }

  const htf = aggregateHtf(bars, 60);
  const po3 = rthHourPo3(bars);
  const fvgs = findFvgs(bars);
  const pivots = findPivots(bars, 3);
  const equals = findEquals(pivots, tick);
  const stopHunts = findStopHunts(bars, pivots, tick);
  const profile = volumeProfile(bars, tick, 24);
  const keyOpens = findKeyOpens(bars);
  const midnight = bars.find((b) => nyParts(b.time).minutes === 0);
  const rth = bars.find((b) => nyParts(b.time).minutes === 9 * 60 + 30);

  return {
    vwap,
    ema9: e9,
    ema21: e21,
    rsi: rsiSeries(closes, 14),
    stdMid: mid,
    stdUp: mid.map((m, i) => m + 2 * (std[i] ?? 0)),
    stdDn: mid.map((m, i) => m - 2 * (std[i] ?? 0)),
    htf,
    po3,
    fvgs,
    pivots,
    equals,
    stopHunts,
    profile: profile.rows,
    poc: session?.poc ?? profile.poc,
    keyOpens,
    midnightOpen: midnight?.open ?? null,
    rthOpen: rth?.open ?? session?.open ?? null,
  };
}

function aggregateHtf(bars: Bar[], minutes: number): HtfCandle[] {
  if (!bars.length) return [];
  const out: HtfCandle[] = [];
  let bucket: Bar[] = [];
  let bucketStart = -1;
  for (const b of bars) {
    const { minutes: m } = nyParts(b.time);
    const start = Math.floor(m / minutes) * minutes;
    if (bucketStart === -1) bucketStart = start;
    if (start !== bucketStart && bucket.length) {
      out.push(fromBucket(bucket));
      bucket = [];
      bucketStart = start;
    }
    bucket.push(b);
  }
  if (bucket.length) out.push(fromBucket(bucket));
  return out;
}

function fromBucket(slice: Bar[]): HtfCandle {
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  return {
    start: first.time,
    end: last.time,
    open: first.open,
    high: Math.max(...slice.map((b) => b.high)),
    low: Math.min(...slice.map((b) => b.low)),
    close: last.close,
  };
}

function rthHourPo3(bars: Bar[]): HtfCandle | null {
  const hour = bars.filter((b) => {
    const { minutes } = nyParts(b.time);
    return minutes >= 9 * 60 + 30 && minutes < 10 * 60 + 30;
  });
  if (hour.length < 3) return null;
  return fromBucket(hour);
}

function findFvgs(bars: Bar[]): FvgBox[] {
  const out: FvgBox[] = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2]!;
    const c = bars[i]!;
    if (c.low > a.high) {
      const box: FvgBox = {
        start: a.time,
        end: c.time,
        high: c.low,
        low: a.high,
        dir: "up",
        filled: false,
      };
      for (let j = i + 1; j < bars.length; j++) {
        if (bars[j]!.low <= box.low) {
          box.filled = true;
          box.end = bars[j]!.time;
          break;
        }
      }
      if (!box.filled) box.end = bars[bars.length - 1]!.time;
      if (box.high - box.low > 0) out.push(box);
    } else if (c.high < a.low) {
      const box: FvgBox = {
        start: a.time,
        end: c.time,
        high: a.low,
        low: c.high,
        dir: "down",
        filled: false,
      };
      for (let j = i + 1; j < bars.length; j++) {
        if (bars[j]!.high >= box.high) {
          box.filled = true;
          box.end = bars[j]!.time;
          break;
        }
      }
      if (!box.filled) box.end = bars[bars.length - 1]!.time;
      if (box.high - box.low > 0) out.push(box);
    }
  }
  return out.slice(-18);
}

function findPivots(bars: Bar[], left = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i < bars.length - left; i++) {
    const b = bars[i]!;
    let hi = true;
    let lo = true;
    for (let k = 1; k <= left; k++) {
      if (bars[i - k]!.high >= b.high || bars[i + k]!.high >= b.high) hi = false;
      if (bars[i - k]!.low <= b.low || bars[i + k]!.low <= b.low) lo = false;
    }
    if (hi) out.push({ time: b.time, price: b.high, kind: "h" });
    if (lo) out.push({ time: b.time, price: b.low, kind: "l" });
  }
  return out;
}

function findEquals(pivots: Pivot[], tick: number) {
  const out: { a: number; b: number; price: number; kind: "h" | "l" }[] = [];
  const tol = tick * 8;
  for (let i = 0; i < pivots.length; i++) {
    for (let j = i + 1; j < pivots.length; j++) {
      const a = pivots[i]!;
      const b = pivots[j]!;
      if (a.kind !== b.kind) continue;
      if (Math.abs(a.price - b.price) <= tol) {
        out.push({ a: a.time, b: b.time, price: (a.price + b.price) / 2, kind: a.kind });
      }
    }
  }
  return out.slice(-8);
}

function findStopHunts(bars: Bar[], pivots: Pivot[], tick: number) {
  const out: { time: number; price: number; kind: "h" | "l" }[] = [];
  for (const p of pivots) {
    const idx = bars.findIndex((b) => b.time > p.time);
    if (idx < 0) continue;
    for (let i = idx; i < Math.min(bars.length, idx + 24); i++) {
      const b = bars[i]!;
      if (p.kind === "h" && b.high > p.price + tick && b.close < p.price) {
        out.push({ time: b.time, price: b.high, kind: "h" });
        break;
      }
      if (p.kind === "l" && b.low < p.price - tick && b.close > p.price) {
        out.push({ time: b.time, price: b.low, kind: "l" });
        break;
      }
    }
  }
  return out.slice(-10);
}

function findKeyOpens(bars: Bar[]) {
  const want = [
    { minutes: 8 * 60 + 30, label: "8:30" },
    { minutes: 9 * 60 + 30, label: "9:30" },
    { minutes: 10 * 60, label: "10:00" },
  ];
  const out: { minutes: number; price: number; label: string }[] = [];
  for (const w of want) {
    const hit = bars.find((b) => nyParts(b.time).minutes === w.minutes);
    if (hit) out.push({ minutes: w.minutes, price: hit.open, label: w.label });
  }
  return out;
}

export function rthStartIndex(bars: Bar[]): number {
  const i = bars.findIndex((b) => nyParts(b.time).minutes >= 9 * 60 + 30);
  return Math.max(0, i);
}
