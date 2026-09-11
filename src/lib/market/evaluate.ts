import { getSessions } from "./generate";
import { listTradingDays } from "./calendar";
import { nyParts, rthBars } from "./session";
import { getSymbol } from "./symbols";
import { computePerformance } from "./stats";
import type { Bar, Playbook, PlaybookEvalSummary, PlaybookEvaluation, SessionDay, Trade } from "./types";

function rthOf(session: SessionDay): Bar[] {
  const spec = getSymbol(session.symbol);
  const rth = rthBars(session.bars, spec.kind);
  return rth.length >= 8 ? rth : session.bars;
}

function inWindow(bar: Bar, startMin: number, endMin: number): boolean {
  const { minutes } = nyParts(bar.time);
  return minutes >= startMin && minutes < endMin;
}

function simulate(
  bars: Bar[],
  from: number,
  side: "long" | "short",
  entry: number,
  stop: number,
  target: number,
): { exit: number; time: number; hit: "stop" | "target" | "close" } {
  for (let i = from + 1; i < bars.length; i++) {
    const b = bars[i]!;
    if (side === "long") {
      if (b.low <= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (b.high >= target) return { exit: target, time: b.time, hit: "target" };
    } else {
      if (b.high >= stop) return { exit: stop, time: b.time, hit: "stop" };
      if (b.low <= target) return { exit: target, time: b.time, hit: "target" };
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
): Trade {
  const spec = getSymbol(session.symbol);
  const sim = simulate(bars, entryIdx, side, entryBar.close, stop, target);
  const qty = 1;
  const pnl = (side === "long" ? sim.exit - entryBar.close : entryBar.close - sim.exit) * qty * spec.pointValue;
  const risk = Math.abs((stop - entryBar.close) * qty * spec.pointValue) || 1;
  return {
    id: `ev-${playbook.id}-${session.date}-${entryBar.time}`,
    symbol: session.symbol,
    side,
    qty,
    entry: entryBar.close,
    exit: sim.exit,
    entryTime: entryBar.time,
    exitTime: sim.time,
    stop,
    target,
    pnl,
    fees: spec.kind === "futures" ? 4.08 : 1,
    rMultiple: pnl / risk,
    setup: playbook.setup,
    tags: ["evaluated", playbook.kind],
    notes: `Evaluated ${playbook.name} · ${sim.hit}`,
    source: "evaluated",
    playbookId: playbook.id,
    date: session.date,
    open: false,
  };
}

function runOrb(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = rthOf(session);
  if (bars.length < 20) return null;
  const orb = session.orb;
  if (session.orbBreak === "none" || session.orbBreak === "both") return null;
  const side = session.orbBreak === "up" ? "long" : "short";
  const idx = bars.findIndex((b) => session.orbBreakTime && b.time >= session.orbBreakTime);
  if (idx < 8) return null;
  const entry = bars[idx]!;
  if (!inWindow(entry, playbook.windowStart, playbook.windowEnd)) return null;
  const stop = side === "long" ? orb.low : orb.high;
  const dist = Math.abs(entry.close - stop) || orb.size;
  const target = side === "long" ? entry.close + dist * playbook.targetR : entry.close - dist * playbook.targetR;
  return tradeOf(playbook, session, side, entry, idx, bars, stop, target);
}

function runIb(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = rthOf(session);
  if (bars.length < 30) return null;
  if (session.ibBreak === "none" || session.ibBreak === "both") return null;
  const side = session.ibFirstBreak === "up" ? "long" : session.ibFirstBreak === "down" ? "short" : null;
  if (!side) return null;
  if (session.occ !== (side === "long" ? "up" : "down")) return null;
  const idx = bars.findIndex((b) => session.ibBreakTime && b.time >= session.ibBreakTime);
  if (idx < 12) return null;
  const entry = bars[idx]!;
  if (!inWindow(entry, playbook.windowStart, playbook.windowEnd)) return null;
  const retrace = session.ib.size * 0.25;
  const stop = side === "long" ? entry.close - retrace : entry.close + retrace;
  const target =
    side === "long"
      ? entry.close + session.ib.size * playbook.targetR
      : entry.close - session.ib.size * playbook.targetR;
  return tradeOf(playbook, session, side, entry, idx, bars, stop, target);
}

function runGap(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = rthOf(session);
  if (bars.length < 12) return null;
  const adr = session.range || Math.abs(session.gap) * 4;
  if (Math.abs(session.gap) < 0.25 * adr) return null;
  const side: "long" | "short" = session.gap > 0 ? "short" : "long";
  const first = bars[0]!;
  let entryIdx = -1;
  for (let i = 1; i < Math.min(bars.length, 18); i++) {
    const b = bars[i]!;
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
  const extreme = side === "short" ? Math.max(...bars.slice(0, entryIdx + 1).map((b) => b.high)) : Math.min(...bars.slice(0, entryIdx + 1).map((b) => b.low));
  const stop = extreme;
  const target = session.prevClose;
  return tradeOf(playbook, session, side, entry, entryIdx, bars, stop, target);
}

function runVwap(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = rthOf(session);
  if (bars.length < 40) return null;
  const sweptHigh = bars.some((b) => b.high > session.ib.high);
  const sweptLow = bars.some((b) => b.low < session.ib.low);
  if (!sweptHigh && !sweptLow) return null;
  const side: "long" | "short" = sweptLow && !sweptHigh ? "long" : sweptHigh && !sweptLow ? "short" : session.occ === "up" ? "long" : "short";
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
  const stopDist = session.ib.size * 0.35;
  const stop = side === "long" ? entry.close - stopDist : entry.close + stopDist;
  const target = side === "long" ? entry.close + stopDist * playbook.targetR : entry.close - stopDist * playbook.targetR;
  return tradeOf(playbook, session, side, entry, entryIdx, bars, stop, target);
}

function runFvg(playbook: Playbook, session: SessionDay): Trade | null {
  const bars = rthOf(session);
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
          const stop = a.high;
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
          const stop = a.low;
          const dist = Math.abs(entry.close - stop) || session.orb.size;
          const target = entry.close - dist * playbook.targetR;
          return tradeOf(playbook, session, "short", entry, j, bars, stop, target);
        }
      }
    }
  }
  return null;
}

function runSession(playbook: Playbook, session: SessionDay): Trade | null {
  switch (playbook.kind) {
    case "orb":
      return runOrb(playbook, session);
    case "ib":
      return runIb(playbook, session);
    case "gap":
      return runGap(playbook, session);
    case "vwap":
      return runVwap(playbook, session);
    case "fvg":
      return runFvg(playbook, session);
    default:
      return runOrb(playbook, session);
  }
}

export function evaluatePlaybook(
  playbook: Playbook,
  lookback = 40,
  liveSessions?: SessionDay[],
): PlaybookEvaluation {
  const symbol = playbook.symbol || "NQ";
  const dates = listTradingDays(lookback + 1).slice(1);
  const sessions =
    liveSessions && liveSessions.length > 6
      ? liveSessions.slice(0, lookback)
      : getSessions(symbol, dates, 5);
  const trades: Trade[] = [];
  for (const s of sessions) {
    const t = runSession({ ...playbook, symbol }, { ...s, symbol });
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

export function setupsFromPlaybook(playbook: Playbook, session: SessionDay): { time: number; side: "long" | "short"; label: string }[] {
  const t = runSession(playbook, { ...session, symbol: playbook.symbol || session.symbol });
  if (!t) return [];
  return [{ time: t.entryTime, side: t.side, label: playbook.name }];
}
