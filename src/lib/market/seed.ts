import { hash32, mulberry32 } from "./rng";
import { getSession } from "./generate";
import { getSymbol } from "./symbols";
import { listTradingDays } from "./calendar";
import type { Playbook, PropChallenge, Trade } from "./types";

export const PLAYBOOKS: Playbook[] = [
  {
    id: "pb-orb",
    name: "ORB continuation",
    setup: "ORB",
    thesis: "After the first 15 minutes, trade the first single-side break and hold for 0.8–1.2× the opening range.",
    rules: [
      "Map 9:30–9:45 high/low before any order.",
      "Only take the first break. Skip if both sides trade through.",
      "Stop goes beyond the far side of the range.",
      "Target 1.0× range; trail remainder if ADR is under 70% spent.",
    ],
    invalidation: "Double break within 30 minutes, or a news print inside the first hour.",
    session: "NY RTH",
    status: "active",
  },
  {
    id: "pb-ib",
    name: "IB extension",
    setup: "IB",
    thesis: "The first hour is the container. Trade the first break of IB high/low in the direction of opening candle continuation.",
    rules: [
      "Wait for 10:30. No anticipation.",
      "First break only, with OCC agreement.",
      "Stop: 25% retrace back inside IB.",
      "Scale at 0.5× and 1.0× IB size.",
    ],
    invalidation: "IB double break or first break that immediately re-enters and holds.",
    session: "NY RTH",
    status: "active",
  },
  {
    id: "pb-gap",
    name: "Gap fill fade",
    setup: "Gap",
    thesis: "Unfilled overnight gaps are magnets. Fade stretched opens back toward prior close when fill-rate is historically high.",
    rules: [
      "Gap ≥ 0.25× ADR.",
      "Wait for the first 5-minute failure (wick through then close back).",
      "Target prior close. Stop beyond the session extreme.",
      "Stand down on FOMC / CPI / NFP.",
    ],
    invalidation: "Acceptance beyond the gap extreme for two consecutive 5-minute closes.",
    session: "NY open",
    status: "active",
  },
  {
    id: "pb-vwap",
    name: "VWAP reclaim",
    setup: "VWAP",
    thesis: "After a morning sweep, a reclaim of session VWAP with delta confirmation is a continuation long/short for the rest of the day.",
    rules: [
      "Sweep of IB extreme first.",
      "Reclaim VWAP on a 5-minute close.",
      "Delta flips in the same direction.",
      "Stop: other side of VWAP. Target: session extreme then ADR remainder.",
    ],
    invalidation: "Immediate loss of VWAP with expanding opposing delta.",
    session: "NY midday",
    status: "paused",
  },
];

export const PROP_CHALLENGES: PropChallenge[] = [
  {
    id: "apex-50",
    name: "Apex 50K",
    account: 50000,
    profitTarget: 3000,
    maxDrawdown: 2500,
    dailyDrawdown: 2500,
    consistency: 0.3,
    minDays: 7,
  },
  {
    id: "topstep-150",
    name: "Topstep 150K",
    account: 150000,
    profitTarget: 9000,
    maxDrawdown: 4500,
    dailyDrawdown: 3000,
    consistency: 0.5,
    minDays: 5,
  },
  {
    id: "ftmo-100",
    name: "FTMO 100K",
    account: 100000,
    profitTarget: 10000,
    maxDrawdown: 10000,
    dailyDrawdown: 5000,
    consistency: 0,
    minDays: 4,
  },
];

const SETUPS = ["ORB", "IB", "Gap", "VWAP", "FVG"] as const;

export function buildSeedTrades(): Trade[] {
  const days = listTradingDays(52).slice(1);
  const symbols = ["ES", "NQ", "CL", "GC", "NVDA", "BTCUSD"];
  const trades: Trade[] = [];
  let n = 0;

  for (const date of days) {
    for (const symbolId of symbols) {
      const rng = mulberry32(hash32(`tr:${symbolId}:${date}`));
      if (rng() > 0.18) continue;
      const spec = getSymbol(symbolId);
      const session = getSession(symbolId, date, 5);
      const setup = SETUPS[Math.floor(rng() * SETUPS.length)]!;
      const side = decideSide(setup, session, rng);
      const entryBar = session.bars[8 + Math.floor(rng() * 18)] ?? session.bars[5];
      const exitBar =
        session.bars[30 + Math.floor(rng() * Math.max(1, session.bars.length - 32))] ??
        session.bars[session.bars.length - 1];
      if (!entryBar || !exitBar) continue;

      const stopDist = Math.max(session.orb.size * (0.55 + rng() * 0.4), spec.tick * 8);
      const entry = entryBar.close;
      const stop = side === "long" ? entry - stopDist : entry + stopDist;
      const winner = rng() < 0.54;
      let exit: number;
      let rMultiple: number;
      if (winner) {
        rMultiple = 0.7 + rng() * 1.8;
        exit = side === "long" ? entry + stopDist * rMultiple : entry - stopDist * rMultiple;
      } else if (rng() < 0.25) {
        rMultiple = -0.15 - rng() * 0.25;
        exit = side === "long" ? entry + stopDist * rMultiple : entry - stopDist * rMultiple;
      } else {
        rMultiple = -0.85 - rng() * 0.2;
        exit = stop;
      }

      const riskUsd = 180 + rng() * 520;
      const qtyRaw = riskUsd / (stopDist * spec.pointValue);
      const qty =
        spec.kind === "stocks"
          ? Math.max(10, Math.round(qtyRaw / 10) * 10)
          : spec.kind === "crypto"
            ? Math.max(0.01, Math.round(qtyRaw * 100) / 100)
            : Math.max(1, Math.round(qtyRaw));

      const pnlGross =
        (side === "long" ? exit - entry : entry - exit) * qty * spec.pointValue;
      const fees = spec.kind === "futures" ? qty * 4.08 : Math.max(0.8, Math.abs(pnlGross) * 0.0008);
      const pnl = pnlGross - fees;
      const playbookId =
        setup === "ORB"
          ? "pb-orb"
          : setup === "IB"
            ? "pb-ib"
            : setup === "Gap"
              ? "pb-gap"
              : setup === "VWAP"
                ? "pb-vwap"
                : null;

      n += 1;
      trades.push({
        id: `t-${n.toString().padStart(3, "0")}`,
        symbol: symbolId,
        side,
        qty,
        entry,
        exit,
        entryTime: entryBar.time,
        exitTime: exitBar.time,
        stop,
        target: side === "long" ? entry + stopDist : entry - stopDist,
        pnl,
        fees,
        rMultiple,
        setup,
        tags: [setup, session.orbBreak === "both" ? "chop" : "clean", side],
        notes: noteFor(setup, side, winner, session.date),
        source: "journal",
        playbookId,
        date,
        open: false,
      });
    }
  }

  return trades.sort((a, b) => b.entryTime - a.entryTime);
}

function decideSide(
  setup: string,
  session: ReturnType<typeof getSession>,
  rng: () => number,
): "long" | "short" {
  if (setup === "Gap") return session.gap > 0 ? "short" : "long";
  if (setup === "ORB") {
    if (session.orbBreak === "up") return "long";
    if (session.orbBreak === "down") return "short";
  }
  if (setup === "IB") {
    if (session.ibFirstBreak === "up") return "long";
    if (session.ibFirstBreak === "down") return "short";
  }
  return rng() < 0.5 ? "long" : "short";
}

function noteFor(setup: string, side: string, winner: boolean, date: string): string {
  if (winner) {
    return `${date} ${setup} ${side}: held through the first pullback. Size was right; left a runner on the table.`;
  }
  return `${date} ${setup} ${side}: early. Should have waited for acceptance instead of the first tick through.`;
}
