import { hash32, mulberry32 } from "./rng";
import { getSession } from "./generate";
import { getSymbol } from "./symbols";
import { nyToday } from "./clock";
import { kitForKind } from "./playbook-kit";
import { SLEEVES } from "../hypothesis/id-map";
import type { Playbook, PropChallenge, Trade } from "./types";

const LONNY = SLEEVES["strt-fortvna-lonny-ib"]!;

const DESK_BOOKS: Omit<Playbook, "indicators">[] = [
  {
    id: "pb-or",
    name: "Opening range continuation",
    setup: "Open range",
    kind: "orb",
    symbol: "NQ",
    timeframe: "5m",
    windowStart: 9 * 60 + 45,
    windowEnd: 11 * 60,
    targetR: 1,
    stopTicks: null,
    validated: false,
    mentorNotes: "Desk default. First single-side break of 09:30–09:45.",
    thesis:
      "After the first 15 minutes, trade the first single-side break and hold for 0.8–1.2× the opening range.",
    rules: [
      "Map 9:30–9:45 high/low before any order.",
      "Only take the first break. Skip if both sides trade through.",
      "Stop goes beyond the far side of the range.",
      "Target 1.0× range; trail remainder if ADR is under 70% spent.",
    ],
    invalidation: "Double break within 30 minutes, or a news print inside the first hour.",
    session: "NY RTH",
    status: "active",
    origin: "desk",
  },
  {
    id: LONNY.orbPlaybookId!,
    name: LONNY.playbookName,
    setup: LONNY.setup,
    kind: LONNY.kind,
    symbol: LONNY.symbol,
    timeframe: LONNY.timeframe,
    windowStart: LONNY.windowStart,
    windowEnd: LONNY.windowEnd,
    targetR: LONNY.targetR,
    stopTicks: null,
    validated: false,
    mentorNotes: LONNY.mentorNotes,
    thesis: LONNY.thesis,
    rules: LONNY.rules,
    invalidation: LONNY.invalidation,
    session: LONNY.session,
    status: "active",
    origin: "desk",
    metisSlug: LONNY.metisSlug,
    hypothesisId: LONNY.hypothesisId,
    groundingVersion: LONNY.groundingVersion,
  },
  {
    id: "pb-gap",
    name: "Gap fill fade",
    setup: "Gap",
    kind: "gap",
    symbol: "ES",
    timeframe: "5m",
    windowStart: 9 * 60 + 30,
    windowEnd: 10 * 60 + 30,
    targetR: 1,
    stopTicks: null,
    validated: false,
    mentorNotes: "Fade stretched opens back toward prior close.",
    thesis:
      "Unfilled overnight gaps are magnets. Fade stretched opens back toward prior close when fill-rate is historically high.",
    rules: [
      "Gap ≥ 0.25× ADR.",
      "Wait for the first 5-minute failure (wick through then close back).",
      "Target prior close. Stop beyond the session extreme.",
      "Stand down on FOMC / CPI / NFP.",
    ],
    invalidation: "Acceptance beyond the gap extreme for two consecutive 5-minute closes.",
    session: "NY open",
    status: "active",
    origin: "desk",
  },
  {
    id: "pb-vwap",
    name: "VWAP reclaim",
    setup: "VWAP",
    kind: "vwap",
    symbol: "ES",
    timeframe: "5m",
    windowStart: 10 * 60 + 30,
    windowEnd: 14 * 60,
    targetR: 1.2,
    stopTicks: null,
    validated: false,
    mentorNotes: "Yahoo has no tick delta — this book uses a 5-minute VWAP close only.",
    thesis:
      "After a morning sweep, a 5-minute close back through session VWAP is a continuation for the rest of the day.",
    rules: [
      "Sweep of IB extreme first.",
      "Reclaim VWAP on a 5-minute close.",
      "Stop: other side of VWAP. Target: session extreme then ADR remainder.",
    ],
    invalidation: "Immediate loss of VWAP on the next 5-minute close.",
    session: "NY midday",
    status: "paused",
    origin: "desk",
  },
  {
    id: "pb-fvg",
    name: "NYAM FVG invert",
    setup: "FVG",
    kind: "fvg",
    symbol: "NQ",
    timeframe: "5m",
    windowStart: 9 * 60 + 30,
    windowEnd: 11 * 60,
    targetR: 1,
    stopTicks: null,
    validated: false,
    mentorNotes: "Entry polish, not a standalone bias. Validate in replay before activating.",
    thesis:
      "First displacement fair-value gap of the cash open. Enter on the 50% fill, stop beyond the origin wick.",
    rules: [
      "Only the first FVG after 09:30.",
      "Enter on a 50% fill of the gap.",
      "Stop: far side of the 3-candle pattern.",
      "Target 1R. Do not stack with ORB on the same print.",
    ],
    invalidation: "Third candle closes through the gap (impulsive continuation — skip the retrace).",
    session: "NY AM",
    status: "draft",
    origin: "desk",
  },
  {
    id: "pb-530",
    name: "5:30 NQ range",
    setup: "Open range",
    kind: "orb",
    symbol: "NQ",
    timeframe: "5m",
    windowStart: 5 * 60 + 45,
    windowEnd: 8 * 60,
    targetR: 1,
    stopTicks: null,
    validated: false,
    mentorNotes: "From Metis / Edgeful 5:30 range notes. First break after the 05:30–05:45 container.",
    thesis:
      "The 05:30 ET range is the London-into-NY container. Trade the first single-side break and hold for 1× the range.",
    rules: [
      "Map 05:30–05:45 high/low before any order.",
      "First break only. Skip a double break.",
      "Stop beyond the far side of the 15-minute range.",
      "Target 1.0× range. Stand down into 08:30 if still open.",
    ],
    invalidation: "Both sides trade through before 06:30, or a news print inside the window.",
    session: "London / NY AM",
    status: "active",
    origin: "imported",
  },
];

export const PLAYBOOKS: Playbook[] = DESK_BOOKS.map((p) => ({
  ...p,
  indicators: kitForKind(p.kind),
}));

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

const SETUPS = [
  { setup: "Open range", id: "pb-or" },
  { setup: "IB", id: "pb-ib" },
  { setup: "Gap", id: "pb-gap" },
  { setup: "VWAP", id: "pb-vwap" },
  { setup: "FVG", id: "pb-fvg" },
] as const;

export function isSeedTrade(t: Trade): boolean {
  return t.id.startsWith("sd-") || t.tags.includes("mock");
}

function decideSide(setup: string, session: ReturnType<typeof getSession>, rng: () => number): "long" | "short" {
  if (setup === "Open range") return session.orbBreak === "down" ? "short" : "long";
  if (setup === "IB") return session.ibFirstBreak === "down" ? "short" : "long";
  if (setup === "Gap") return session.gap > 0 ? "short" : "long";
  return rng() < 0.5 ? "long" : "short";
}

function tradeOnDay(symbolId: string, date: string, pick: (typeof SETUPS)[number], rng: () => number): Trade | null {
  const spec = getSymbol(symbolId);
  const session = getSession(symbolId, date, 5);
  const side = decideSide(pick.setup, session, rng);
  const rth = session.bars.filter((b) => {
    const t = new Date(b.time * 1000);
    const h = t.getUTCHours();
    return h >= 13 && h < 21;
  });
  const book = rth.length > 20 ? rth : session.bars;
  const entryBar = book[8 + Math.floor(rng() * 18)] ?? book[5];
  const exitBar =
    book[30 + Math.floor(rng() * Math.max(1, book.length - 32))] ?? book[book.length - 1];
  if (!entryBar || !exitBar) return null;

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
  const qty = Math.max(1, Math.round(riskUsd / Math.max(stopDist * spec.pointValue, 1)));
  const pnl = (side === "long" ? exit - entry : entry - exit) * qty * spec.pointValue;

  return {
    id: `sd-${symbolId}-${date}-${entryBar.time}`,
    symbol: symbolId,
    side,
    qty,
    entry,
    exit,
    entryTime: entryBar.time,
    exitTime: exitBar.time,
    stop,
    target: side === "long" ? entry + stopDist * 1.2 : entry - stopDist * 1.2,
    pnl,
    fees: spec.kind === "futures" ? qty * 4.08 : 1,
    rMultiple,
    setup: pick.setup,
    tags: [pick.setup.toLowerCase(), "mock"],
    notes: "Model tape · demo fill for today",
    source: "journal",
    playbookId: pick.id,
    date,
    open: false,
  };
}

/** A handful of demo fills for the current NY session only. */
export function buildSeedTradesForDay(date = nyToday()): Trade[] {
  const symbols = ["NQ", "ES", "CL"];
  const trades: Trade[] = [];
  for (const symbolId of symbols) {
    const rng = mulberry32(hash32(`tr-day:${symbolId}:${date}`));
    const pick = SETUPS[Math.floor(rng() * SETUPS.length)]!;
    const t = tradeOnDay(symbolId, date, pick, rng);
    if (t) trades.push(t);
  }
  return trades.sort((a, b) => b.entryTime - a.entryTime);
}
