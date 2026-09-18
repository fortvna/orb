import { getSessions } from "./generate";
import { listTradingDays } from "./calendar";
import { containerClock, containerMinutes } from "./playbook-kit";
import { barsInClock, inNyWindow, nyParts, rangeOf, rthBars } from "./session";
import { getSymbol } from "./symbols";
import { computePerformance } from "./stats";
import { isMockOn } from "../mock";
import { isLonnyPlaybook } from "../hypothesis/id-map";
import type { Bar, Playbook, PlaybookEvalSummary, PlaybookEvaluation, RangeLevel, SessionDay, Trade } from "./types";
import { canMarkValidated } from "./types";

export { canMarkValidated, isLonnyPlaybook };

/** Grounding-v1 §1 frozen IB clocks (America/New_York). */
const LONNY_LONDON_START = 2 * 60;
const LONNY_LONDON_END = 8 * 60;
const LONNY_IB_START = 9 * 60 + 30;
const LONNY_IB_END = 10 * 60 + 30;
const LONNY_KILL = 15 * 60;
const LONNY_ENTRY_PCT = 0.25;
const LONNY_STOP_PCT = 0.5;
const LONNY_TP_EXT = 0.5;

export function lonnyLevels(
  ib: RangeLevel,
  side: "long" | "short",
): { entry: number; stop: number; target: number } {
  const size = ib.size;
  const entry = side === "long" ? ib.high - size * LONNY_ENTRY_PCT : ib.low + size * LONNY_ENTRY_PCT;
  const stop = ib.low + size * LONNY_STOP_PCT;
  const target = side === "long" ? ib.high + size * LONNY_TP_EXT : ib.low - size * LONNY_TP_EXT;
  return { entry, stop, target };
}

function workBars(playbook: Playbook, session: SessionDay): Bar[] {
  const spec = getSymbol(session.symbol);
  const rth = rthBars(session.bars, spec.kind);
  const overnight = playbook.windowStart < 9 * 60 + 30 || playbook.windowEnd <= 9 * 60 + 30;
  const bars = overnight || rth.length < 8 ? session.bars : rth;
  return bars.length >= 8 ? bars : session.bars;
}

function inWindow(bar: Bar, startMin: number, endMin: number): boolean {
  return inNyWindow(nyParts(bar.time).minutes, startMin, endMin);
}

/** First stop or target after the entry bar. Stop wins if both print on the same bar. */
export function firstExit(
  bars: Bar[],
  from: number,
  side: "long" | "short",
  stop: number | null,
  target: number | null,
): { exit: number; time: number; hit: "stop" | "target" } | null {
  for (let i = from + 1; i < bars.length; i++) {
    const b = bars[i]!;
    if (side === "long") {
      if (stop != null && b.low <= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (target != null && b.high >= target) return { exit: target, time: b.time, hit: "target" };
    } else {
      if (stop != null && b.high >= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (target != null && b.low <= target) return { exit: target, time: b.time, hit: "target" };
    }
  }
  return null;
}

function simulate(
  bars: Bar[],
  from: number,
  side: "long" | "short",
  stop: number,
  target: number,
  killMinutes?: number,
): { exit: number; time: number; hit: "stop" | "target" | "close" | "time" } {
  if (killMinutes == null) {
    const hit = firstExit(bars, from, side, stop, target);
    if (hit) return hit;
    const last = bars[bars.length - 1]!;
    return { exit: last.close, time: last.time, hit: "close" };
  }
  for (let i = from + 1; i < bars.length; i++) {
    const b = bars[i]!;
    const m = nyParts(b.time).minutes;
    if (m >= killMinutes) return { exit: b.open, time: b.time, hit: "time" };
    if (side === "long") {
      if (stop != null && b.low <= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (target != null && b.high >= target) return { exit: target, time: b.time, hit: "target" };
    } else {
      if (stop != null && b.high >= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (target != null && b.low <= target) return { exit: target, time: b.time, hit: "target" };
    }
  }
  const last = bars[bars.length - 1]!;
  return { exit: last.close, time: last.time, hit: "close" };
}

function tradeOf(
  playbook: Playbook,
  session: SessionDay,
  side: "long" | "short",
  entryBar: Bar,
  entryIdx: number,
  bars: Bar[],
  stop: number,
  target: number,
  opts?: { entry?: number; simulateFrom?: number; killMinutes?: number; tag?: string },
): Trade {
  const spec = getSymbol(session.symbol);
  const entry = opts?.entry ?? entryBar.close;
  const sim = simulate(bars, opts?.simulateFrom ?? entryIdx, side, stop, target, opts?.killMinutes);
  const qty = 1;
  const pnl = (side === "long" ? sim.exit - entry : entry - sim.exit) * qty * spec.pointValue;
  const risk = Math.abs((stop - entry) * qty * spec.pointValue) || 1;
  return {
    id: `ev-${playbook.id}-${session.date}-${entryBar.time}`,
    symbol: session.symbol,
    side,
    qty,
    entry,
    exit: sim.exit,
    entryTime: entryBar.time,
    exitTime: sim.time,
    stop,
    target,
    pnl,
    fees: spec.kind === "futures" ? 4.08 : 1,
    rMultiple: pnl / risk,
    setup: playbook.setup,
    tags: ["evaluated", playbook.kind, ...(opts?.tag ? [opts.tag] : [])],
    notes: `Evaluated ${playbook.name} · ${sim.hit}`,
    source: "evaluated",
    playbookId: playbook.id,
    date: session.date,
    open: false,
  };
}

function stopFromTicks(
  playbook: Playbook,
  session: SessionDay,
  side: "long" | "short",
  entry: number,
  fallback: number,
): number {
  const spec = getSymbol(session.symbol);
  if (playbook.stopTicks && playbook.stopTicks > 0) {
    const dist = playbook.stopTicks * spec.tick;
    return side === "long" ? entry - dist : entry + dist;
  }
  return fallback;
}

/** High/low of the playbook's mapping range on the bars seen so far (grows with the playhead). */
export function containerRange(playbook: Playbook, bars: Bar[]): RangeLevel | null {
  const clock = containerClock(playbook);
  if (!clock) return null;
  const container = barsInClock(bars, clock.start, clock.end);
  if (container.length < 1) return null;
  return rangeOf(container);
}

/** Container is the `rangeMinutes` before windowStart; first single-side break inside the window. */
function runRangeBreak(
  playbook: Playbook,
  session: SessionDay,
  rangeMinutes: number,
  requireOcc: boolean,
): Trade | null {
  const bars = workBars(playbook, session);
  if (bars.length < 8) return null;
  const rangeStart = (playbook.windowStart - rangeMinutes + 24 * 60) % (24 * 60);
  const container = barsInClock(bars, rangeStart, playbook.windowStart);
  if (container.length < 2) return null;
  const range = rangeOf(container);
  const lastContainer = container[container.length - 1]!.time;
  const occUp = container[container.length - 1]!.close >= container[0]!.open;

  let first: "up" | "down" | null = null;
  let idx = -1;
  let sawUp = false;
  let sawDown = false;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (b.time <= lastContainer) continue;
    if (!inWindow(b, playbook.windowStart, playbook.windowEnd)) continue;
    const brokeHigh = b.high > range.high;
    const brokeLow = b.low < range.low;
    if (brokeHigh) sawUp = true;
    if (brokeLow) sawDown = true;
    if (!first) {
      if (brokeHigh && !brokeLow) {
        first = "up";
        idx = i;
      } else if (brokeLow && !brokeHigh) {
        first = "down";
        idx = i;
      } else if (brokeHigh && brokeLow) {
        return null;
      }
    }
  }
  if (!first || idx < 0) return null;
  if (sawUp && sawDown) return null;
  if (requireOcc) {
    if (occUp && first !== "up") return null;
    if (!occUp && first !== "down") return null;
  }

  const side = first === "up" ? "long" : "short";
  const entry = bars[idx]!;
  const retrace = requireOcc ? range.size * 0.25 : 0;
  const stopFallback = requireOcc
    ? side === "long"
      ? entry.close - retrace
      : entry.close + retrace
    : side === "long"
      ? range.low
      : range.high;
  const stop = stopFromTicks(playbook, session, side, entry.close, stopFallback);
  const dist = Math.abs(entry.close - stop) || range.size;
  const target =
    side === "long" ? entry.close + dist * playbook.targetR : entry.close - dist * playbook.targetR;
  return tradeOf(playbook, session, side, entry, idx, bars, stop, target);
}

function runGap(playbook: Playbook, session: SessionDay, prev?: SessionDay): Trade | null {
  const bars = workBars(playbook, session);
  if (bars.length < 12) return null;
  const adr = prev?.range && prev.range > 0 ? prev.range : Math.abs(session.prevClose) * 0.006;
  if (Math.abs(session.gap) < 0.25 * adr) return null;
  const side: "long" | "short" = session.gap > 0 ? "short" : "long";
  const first = bars[0]!;
  let entryIdx = -1;
  for (let i = 1; i < Math.min(bars.length, 18); i++) {
    const b = bars[i]!;
    if (!inWindow(b, playbook.windowStart, playbook.windowEnd)) continue;
    if (side === "short" && b.high > first.high && b.close < first.close) {
      entryIdx = i;
      break;
    }
    if (side === "long" && b.low < first.low && b.close > first.close) {
      entryIdx = i;
      break;
    }
  }
  if (entryIdx < 0) return null;
  const entry = bars[entryIdx]!;
  const extreme =
    side === "short"
      ? Math.max(...bars.slice(0, entryIdx + 1).map((b) => b.high))
      : Math.min(...bars.slice(0, entryIdx + 1).map((b) => b.low));
  const stop = stopFromTicks(playbook, session, side, entry.close, extreme);
  const target = session.prevClose;
  return tradeOf(playbook, session, side, entry, entryIdx, bars, stop, target);
}

function runVwap(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = workBars(playbook, session);
  if (bars.length < 40) return null;
  const ib = session.ib.size > 0 ? session.ib : rangeOf(barsInClock(bars, 9 * 60 + 30, 10 * 60 + 30));
  const sweptHigh = bars.some((b) => b.high > ib.high);
  const sweptLow = bars.some((b) => b.low < ib.low);
  if (!sweptHigh && !sweptLow) return null;
  const side: "long" | "short" =
    sweptLow && !sweptHigh ? "long" : sweptHigh && !sweptLow ? "short" : session.occ === "up" ? "long" : "short";
  let pv = 0;
  let vol = 0;
  let entryIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
    const vwap = vol ? pv / vol : tp;
    if (i < 20) continue;
    if (!inWindow(b, playbook.windowStart, playbook.windowEnd)) continue;
    if (side === "long" && b.close > vwap && bars[i - 1]!.close <= vwap) {
      entryIdx = i;
      break;
    }
    if (side === "short" && b.close < vwap && bars[i - 1]!.close >= vwap) {
      entryIdx = i;
      break;
    }
  }
  if (entryIdx < 0) return null;
  const entry = bars[entryIdx]!;
  const stopDist = Math.max(ib.size * 0.35, Math.abs(session.orb.size) * 0.35);
  const stop = stopFromTicks(
    playbook,
    session,
    side,
    entry.close,
    side === "long" ? entry.close - stopDist : entry.close + stopDist,
  );
  const dist = Math.abs(entry.close - stop) || stopDist;
  const target = side === "long" ? entry.close + dist * playbook.targetR : entry.close - dist * playbook.targetR;
  return tradeOf(playbook, session, side, entry, entryIdx, bars, stop, target);
}

function runFvg(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = workBars(playbook, session);
  if (bars.length < 16) return null;
  for (let i = 2; i < Math.min(bars.length, 36); i++) {
    const a = bars[i - 2]!;
    const c = bars[i]!;
    if (!inWindow(c, playbook.windowStart, playbook.windowEnd)) continue;
    if (c.low > a.high) {
      const mid = (c.low + a.high) / 2;
      for (let j = i + 1; j < bars.length; j++) {
        if (bars[j]!.low <= mid) {
          const entry = bars[j]!;
          const stop = stopFromTicks(playbook, session, "long", entry.close, a.high);
          const dist = Math.abs(entry.close - stop) || session.orb.size;
          const target = entry.close + dist * playbook.targetR;
          return tradeOf(playbook, session, "long", entry, j, bars, stop, target);
        }
      }
    }
    if (c.high < a.low) {
      const mid = (a.low + c.high) / 2;
      for (let j = i + 1; j < bars.length; j++) {
        if (bars[j]!.high >= mid) {
          const entry = bars[j]!;
          const stop = stopFromTicks(playbook, session, "short", entry.close, a.low);
          const dist = Math.abs(entry.close - stop) || session.orb.size;
          const target = entry.close - dist * playbook.targetR;
          return tradeOf(playbook, session, "short", entry, j, bars, stop, target);
        }
      }
    }
  }
  return null;
}

function londonColor(bars: Bar[]): "up" | "down" | null {
  const london = barsInClock(bars, LONNY_LONDON_START, LONNY_LONDON_END);
  if (london.length < 2) return null;
  return london[london.length - 1]!.close >= london[0]!.open ? "up" : "down";
}

/**
 * LONNY-IB (Grounding-v1 §1). Not the generic IB OCC+0.25 stop.
 *
 * Fill gap: next-open + stop-first same-bar when the open is through IB 25%.
 * Limit-on-wick skips same-bar stop/target (OHLC path unknown). See
 * src/lib/hypothesis/README.md.
 */
function runLonnyIb(playbook: Playbook, session: SessionDay): Trade | null {
  const london = londonColor(session.bars);
  if (!london) return null;

  const bars = workBars(playbook, session);
  if (bars.length < 8) return null;

  const ibBars = barsInClock(bars, LONNY_IB_START, LONNY_IB_END);
  const ib = session.ib.size > 0 ? session.ib : ibBars.length >= 2 ? rangeOf(ibBars) : null;
  if (!ib || ib.size <= 0) return null;

  const occUp =
    ibBars.length >= 2 ? ibBars[ibBars.length - 1]!.close >= ibBars[0]!.open : session.occ === "up";
  const occ: "up" | "down" = occUp ? "up" : "down";
  if (london !== occ) return null;

  const lastIbTime = ibBars.at(-1)?.time ?? 0;
  let first: "up" | "down" | null = null;
  let breakIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (lastIbTime && b.time <= lastIbTime) continue;
    const m = nyParts(b.time).minutes;
    if (m < LONNY_IB_END || m >= LONNY_KILL) continue;
    const brokeHigh = b.high > ib.high;
    const brokeLow = b.low < ib.low;
    if (brokeHigh && brokeLow) return null;
    if (brokeHigh) {
      first = "up";
      breakIdx = i;
      break;
    }
    if (brokeLow) {
      first = "down";
      breakIdx = i;
      break;
    }
  }
  if (!first || breakIdx < 0) return null;
  if (london === "up" && first !== "up") return null;
  if (london === "down" && first !== "down") return null;

  const side = first === "up" ? "long" : "short";
  const levels = lonnyLevels(ib, side);

  let fillIdx = -1;
  let fillPx = levels.entry;
  let scanFillBar = false;
  for (let j = breakIdx + 1; j < bars.length; j++) {
    const b = bars[j]!;
    const m = nyParts(b.time).minutes;
    if (m >= LONNY_KILL) return null;
    if (side === "long") {
      if (b.open <= levels.entry) {
        fillIdx = j;
        fillPx = b.open;
        scanFillBar = true;
        break;
      }
      if (b.low <= levels.entry) {
        fillIdx = j;
        fillPx = levels.entry;
        scanFillBar = false;
        break;
      }
    } else if (b.open >= levels.entry) {
      fillIdx = j;
      fillPx = b.open;
      scanFillBar = true;
      break;
    } else if (b.high >= levels.entry) {
      fillIdx = j;
      fillPx = levels.entry;
      scanFillBar = false;
      break;
    }
  }
  if (fillIdx < 0) return null;

  const entryBar = bars[fillIdx]!;
  const simulateFrom = scanFillBar ? Math.max(0, fillIdx - 1) : fillIdx;
  return tradeOf(playbook, session, side, entryBar, fillIdx, bars, levels.stop, levels.target, {
    entry: fillPx,
    simulateFrom,
    killMinutes: LONNY_KILL,
    tag: "lonny",
  });
}

function runSession(playbook: Playbook, session: SessionDay, prev?: SessionDay): Trade | null {
  switch (playbook.kind) {
    case "orb":
    case "custom":
      return runRangeBreak(playbook, session, containerMinutes(playbook.kind), false);
    case "ib":
      return isLonnyPlaybook(playbook)
        ? runLonnyIb(playbook, session)
        : runRangeBreak(playbook, session, containerMinutes("ib"), true);
    case "gap":
      return runGap(playbook, session, prev);
    case "vwap":
      return runVwap(playbook, session);
    case "fvg":
      return runFvg(playbook, session);
    default:
      return null;
  }
}

function emptyEval(playbook: Playbook, symbol: string, source: PlaybookEvalSummary["source"]): PlaybookEvaluation {
  const summary: PlaybookEvalSummary = {
    at: Date.now(),
    symbol,
    sessions: 0,
    trades: 0,
    wins: 0,
    winRate: 0,
    expectancy: 0,
    profitFactor: 0,
    net: 0,
    avgR: 0,
    source,
  };
  return {
    id: `eval-${playbook.id}-${summary.at}`,
    playbookId: playbook.id,
    at: summary.at,
    symbol,
    summary,
    trades: [],
  };
}

export function evaluatePlaybook(
  playbook: Playbook,
  lookback = 40,
  liveSessions?: SessionDay[],
  allowMock = false,
  tapeKind: "live" | "pack" = "live",
): PlaybookEvaluation {
  const symbol = playbook.symbol || "NQ";
  const mock = allowMock || isMockOn();
  const provided = liveSessions !== undefined;
  const sessions = provided
    ? liveSessions.slice(0, lookback)
    : mock
      ? getSessions(symbol, listTradingDays(lookback + 1).slice(1), 5)
      : [];
  if (!sessions.length) {
    const emptySource = !provided && mock ? "model" : "empty";
    return emptyEval(playbook, symbol, emptySource);
  }

  const trades: Trade[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    const prev = sessions[i + 1];
    const t = runSession({ ...playbook, symbol }, { ...s, symbol }, prev);
    if (t) trades.push(t);
  }
  const perf = computePerformance(trades);
  const summary: PlaybookEvalSummary = {
    at: Date.now(),
    symbol,
    sessions: sessions.length,
    trades: perf.trades,
    wins: perf.wins,
    winRate: perf.winRate,
    expectancy: perf.expectancy,
    profitFactor: perf.profitFactor,
    net: perf.net,
    avgR: perf.avgR,
    source: provided ? tapeKind : "model",
  };
  return {
    id: `eval-${playbook.id}-${summary.at}`,
    playbookId: playbook.id,
    at: summary.at,
    symbol,
    summary,
    trades,
  };
}

export type PlaybookPlan = {
  time: number;
  side: "long" | "short";
  label: string;
  entry: number;
  stop: number;
  target: number;
};

export function planFromPlaybook(playbook: Playbook, session: SessionDay): PlaybookPlan | null {
  const t = runSession(playbook, { ...session, symbol: playbook.symbol || session.symbol });
  if (!t || t.stop == null || t.target == null) return null;
  return {
    time: t.entryTime,
    side: t.side,
    label: playbook.name,
    entry: t.entry,
    stop: t.stop,
    target: t.target,
  };
}

export function setupsFromPlaybook(
  playbook: Playbook,
  session: SessionDay,
): { time: number; side: "long" | "short"; label: string }[] {
  const plan = planFromPlaybook(playbook, session);
  if (!plan) return [];
  return [{ time: plan.time, side: plan.side, label: plan.label }];
}
