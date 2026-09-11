import { isTradingDay, shiftDate } from "./calendar";
import { getSymbol } from "./symbols";
import type { Bar, BreakKind, MarketKind, RangeLevel, SessionDay } from "./types";

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

export function nyParts(unix: number): { date: string; minutes: number; weekday: number } {
  const bag: Record<string, string> = {};
  for (const p of NY_FMT.formatToParts(new Date(unix * 1000))) bag[p.type] = p.value;
  const hourRaw = bag.hour === "24" ? "0" : (bag.hour ?? "0");
  const minutes = Number(hourRaw) * 60 + Number(bag.minute ?? 0);
  return {
    date: `${bag.year}-${bag.month}-${bag.day}`,
    minutes,
    weekday: WD[bag.weekday ?? ""] ?? 0,
  };
}

/** CME Globex session date: 18:00 ET belongs to the next trading day. */
export function globexDate(unix: number): string {
  const p = nyParts(unix);
  if (p.minutes < 18 * 60) return p.date;
  let next = shiftDate(p.date, 1);
  let guard = 0;
  while (!isTradingDay(next) && guard++ < 6) next = shiftDate(next, 1);
  return next;
}

export function withDelta(bars: Bar[]): Bar[] {
  return bars.map((b) => {
    if (b.buyVolume || b.sellVolume) return b;
    const range = Math.max(b.high - b.low, 1e-9);
    const buyShare = Math.min(0.9, Math.max(0.1, (b.close - b.low) / range));
    const buyVolume = Math.round(b.volume * buyShare);
    return { ...b, buyVolume, sellVolume: Math.max(0, b.volume - buyVolume) };
  });
}

function usesCashOpen(kind: MarketKind): boolean {
  return kind === "futures" || kind === "stocks";
}

export function rthBars(bars: Bar[], kind: MarketKind): Bar[] {
  if (!usesCashOpen(kind)) return bars;
  return bars.filter((b) => {
    const { minutes } = nyParts(b.time);
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  });
}

function rangeOf(bars: Bar[]): RangeLevel {
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  return { high, low, mid: (high + low) / 2, size: high - low };
}

function classifyBreak(
  after: Bar[],
  range: RangeLevel,
): {
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
  return v ? pv / v : (bars[bars.length - 1]?.close ?? 0);
}

function pocOf(bars: Bar[], tick: number): number {
  const buckets = new Map<number, number>();
  for (const b of bars) {
    const key = Math.round((b.high + b.low + b.close) / 3 / tick) * tick;
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

function windowFrom(bars: Bar[], minutes: number): Bar[] {
  if (!bars.length) return [];
  const start = bars[0]!.time;
  return bars.filter((b) => b.time < start + minutes * 60);
}

export function sessionFromBars(input: {
  symbol: string;
  date: string;
  bars: Bar[];
  prevClose: number;
  barMinutes?: number;
}): SessionDay {
  const spec = getSymbol(input.symbol);
  const all = withDelta(input.bars.filter((b) => Number.isFinite(b.close)));
  const rth = rthBars(all, spec.kind);
  const work = rth.length >= 4 ? rth : all;
  const first = work[0];
  const last = work[work.length - 1];
  if (!first || !last) {
    const px = input.prevClose || 0;
    const dummy: RangeLevel = { high: px, low: px, mid: px, size: 0 };
    return {
      symbol: input.symbol,
      date: input.date,
      weekday: 0,
      bars: all,
      barMinutes: input.barMinutes ?? 5,
      prevClose: input.prevClose,
      open: px,
      close: px,
      high: px,
      low: px,
      gap: 0,
      gapPct: 0,
      gapFilled: false,
      gapFillTime: null,
      orb: dummy,
      orbBreak: "none",
      orbBreakTime: null,
      orbExtension: 0,
      ib: dummy,
      ibBreak: "none",
      ibBreakTime: null,
      ibExtension: 0,
      ibFirstBreak: null,
      occ: "up",
      occContinued: false,
      range: 0,
      vwap: px,
      poc: px,
    };
  }

  const orbBars = windowFrom(work, 15);
  const ibBars = windowFrom(work, 60);
  const orb = rangeOf(orbBars.length ? orbBars : work.slice(0, 3));
  const ib = rangeOf(ibBars.length ? ibBars : work.slice(0, 12));
  const afterOrb = work.filter((b) => b.time >= (orbBars.at(-1)?.time ?? first.time) + 1);
  const afterIb = work.filter((b) => b.time >= (ibBars.at(-1)?.time ?? first.time) + 1);
  const orbB = classifyBreak(afterOrb, orb);
  const ibB = classifyBreak(afterIb, ib);

  const high = Math.max(...work.map((b) => b.high));
  const low = Math.min(...work.map((b) => b.low));
  const gap = first.open - input.prevClose;
  const gapDir = gap >= 0 ? 1 : -1;
  let gapFilled = Math.abs(gap) < spec.tick;
  let gapFillTime: number | null = gapFilled ? first.time : null;
  if (!gapFilled) {
    for (const b of work) {
      if (gapDir > 0 && b.low <= input.prevClose) {
        gapFilled = true;
        gapFillTime = b.time;
        break;
      }
      if (gapDir < 0 && b.high >= input.prevClose) {
        gapFilled = true;
        gapFillTime = b.time;
        break;
      }
    }
  }

  const occ: "up" | "down" = ib.mid >= first.open ? "up" : "down";
  const occContinued = occ === "up" ? last.close >= ib.high : last.close <= ib.low;
  const prev = Math.max(input.prevClose, 1e-9);

  return {
    symbol: input.symbol,
    date: input.date,
    weekday: nyParts(first.time).weekday,
    bars: all,
    barMinutes: input.barMinutes ?? 5,
    prevClose: input.prevClose,
    open: first.open,
    close: last.close,
    high,
    low,
    gap,
    gapPct: gap / prev,
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
    vwap: vwapOf(work),
    poc: pocOf(work, spec.tick),
  };
}

function sessionKey(symbolId: string, bar: Bar): string {
  const spec = getSymbol(symbolId);
  return spec.kind === "futures" ? globexDate(bar.time) : nyParts(bar.time).date;
}

export function sessionsFromIntraday(symbolId: string, bars: Bar[]): SessionDay[] {
  const byDate = new Map<string, Bar[]>();
  for (const b of bars) {
    const date = sessionKey(symbolId, b);
    const list = byDate.get(date) ?? [];
    list.push(b);
    byDate.set(date, list);
  }
  const dates = [...byDate.keys()].sort().reverse();
  const out: SessionDay[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const dayBars = byDate.get(date)!;
    const older = dates[i + 1];
    const prevClose = older ? (byDate.get(older)!.at(-1)?.close ?? dayBars[0]!.open) : dayBars[0]!.open;
    try {
      out.push(sessionFromBars({ symbol: symbolId, date, bars: dayBars, prevClose, barMinutes: 5 }));
    } catch {
      /* skip empty days */
    }
  }
  return out;
}

export function lastSessionBars(bars: Bar[], symbolId = "NQ"): Bar[] {
  if (bars.length < 8) return bars;
  const last = bars[bars.length - 1]!;
  const key = sessionKey(symbolId, last);
  const slice = bars.filter((b) => sessionKey(symbolId, b) === key);
  return slice.length >= 8 ? slice : bars.slice(-240);
}

export function capBars(bars: Bar[], max = 480): Bar[] {
  if (bars.length <= max) return bars;
  return bars.slice(-max);
}

export function barsOnDate(bars: Bar[], date: string, symbolId?: string): Bar[] {
  if (!symbolId) return bars.filter((b) => nyParts(b.time).date === date);
  return bars.filter((b) => sessionKey(symbolId, b) === date);
}

export function resampleBars(bars: Bar[], minutes: number): Bar[] {
  if (minutes <= 1 || bars.length < 2) return bars;
  const step = minutes * 60;
  const out: Bar[] = [];
  let bucket: Bar[] = [];
  let start = -1;
  for (const b of bars) {
    const t = Math.floor(b.time / step) * step;
    if (start === -1) start = t;
    if (t !== start && bucket.length) {
      out.push(fromSlice(bucket));
      bucket = [];
      start = t;
    }
    bucket.push(b);
  }
  if (bucket.length) out.push(fromSlice(bucket));
  return out;
}

function fromSlice(slice: Bar[]): Bar {
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  return {
    time: first.time,
    open: first.open,
    high: Math.max(...slice.map((b) => b.high)),
    low: Math.min(...slice.map((b) => b.low)),
    close: last.close,
    volume: slice.reduce((s, b) => s + b.volume, 0),
    buyVolume: slice.reduce((s, b) => s + b.buyVolume, 0),
    sellVolume: slice.reduce((s, b) => s + b.sellVolume, 0),
  };
}
