import type { PlaybookKind } from "../market/types";

/**
 * Locked sleeve IDs (do not invent aliases).
 *
 *   strt-fortvna-lonny-ib  ↔  orb pb-ib  ↔  crucible lonny-ib
 *   strt-santana-nq-sma25-orb  ↔  crucible santana-sma25-orb
 *
 * QQQ is not NQ. SPY is not ES. Yahoo session tape is not a Themis venue.
 */
export type SleeveLock = {
  metisSlug: string;
  hypothesisId: string;
  orbPlaybookId: string | null;
  crucibleStrategyId: string;
  playbookName: string;
  kind: PlaybookKind;
  symbol: string;
  timeframe: "1m" | "5m" | "15m";
  windowStart: number;
  windowEnd: number;
  session: string;
  targetR: number;
  groundingVersion: "v1";
  setup: string;
  thesis: string;
  rules: string[];
  invalidation: string;
  mentorNotes: string;
};

export const LONNY_METIS_SLUG = "strt-fortvna-lonny-ib";
export const SANTANA_METIS_SLUG = "strt-santana-nq-sma25-orb";

export const SLEEVES: Record<string, SleeveLock> = {
  [LONNY_METIS_SLUG]: {
    metisSlug: LONNY_METIS_SLUG,
    hypothesisId: "hyp-fortvna-lonny-ib",
    orbPlaybookId: "pb-ib",
    crucibleStrategyId: "lonny-ib",
    playbookName: "LONNY-IB",
    kind: "ib",
    symbol: "NQ",
    timeframe: "1m",
    windowStart: 10 * 60 + 30,
    windowEnd: 15 * 60,
    session: "London → NY RTH",
    targetR: 0.5,
    groundingVersion: "v1",
    setup: "IB",
    thesis:
      "London color (02:00–08:00 NY) sets the NY side. After IB 09:30–10:30, break the IB extreme and limit at IB 25% from the break side; stop IB 50% mid; TP 0.5× IB; flat 15:00 NY.",
    rules: [
      "London color 02:00–08:00 America/New_York (Metis freeze). Green → NY longs only; red → shorts only.",
      "Wait for NY IB 09:30–10:30. OCC is first-hour color.",
      "Conflict: London lean ≠ OCC or ≠ break side → no trade.",
      "Break IB extreme, then limit at IB 25% from the break side.",
      "Stop: IB 50% (mid).",
      "TP1: 0.5× IB range beyond the broken extreme. Flat 15:00 NY.",
    ],
    invalidation:
      "London lean disagrees with OCC or with the break side. Large-London filter and ES confirm are off in v1.",
    mentorNotes:
      "Fortvna primary sleeve. Metis strt-fortvna-lonny-ib · Grounding-v1 §1. Yahoo session tape ≠ Themis ask; execution_ready false.",
  },
  [SANTANA_METIS_SLUG]: {
    metisSlug: SANTANA_METIS_SLUG,
    hypothesisId: "hyp-santana-nq-sma25-orb",
    orbPlaybookId: "pb-santana-sma25-orb",
    crucibleStrategyId: "santana-sma25-orb",
    playbookName: "Santana SMA25 ORB",
    kind: "orb",
    symbol: "NQ",
    timeframe: "1m",
    windowStart: 10 * 60 + 1,
    windowEnd: 11 * 60,
    session: "NY RTH 10:01–11:00",
    targetR: 2,
    groundingVersion: "v1",
    setup: "Open range",
    thesis:
      "09:45–10:01 NY range. First break after 10:01 sets the day side. Return to SMA(25) on 1m, engulf the touch candle, enter on engulf close. Stop beyond last engulfed extreme; fixed 1:2; one trade/day.",
    rules: [
      "SMA(25) on 1m (speech said EMA once — freeze SMA).",
      "Range box 09:45–10:01 America/New_York.",
      "Trade window 10:01–11:00 only. First break of range H/L sets the day side.",
      "Trigger: return to SMA25 + engulf of the touch candle; enter on engulf close.",
      "Stop beyond last engulfed candle extreme. Target fixed 1:2. No BE, no partials.",
      "One trade per day; else flat. SMT / SPX off in v1.",
    ],
    invalidation: "No engulf in the 10:01–11:00 window, or a second trade the same day.",
    mentorNotes:
      "Metis strt-santana-nq-sma25-orb · Grounding-v1 §3. Author April sample is not evidence. Yahoo session tape ≠ Themis ask; execution_ready false.",
  },
};

export function sleeveByMetisSlug(slug: string | undefined | null): SleeveLock | undefined {
  if (!slug) return undefined;
  return SLEEVES[slug];
}

export function sleeveByPlaybookId(id: string | undefined | null): SleeveLock | undefined {
  if (!id) return undefined;
  return Object.values(SLEEVES).find((s) => s.orbPlaybookId === id);
}

export function sleeveByCrucibleId(id: string | undefined | null): SleeveLock | undefined {
  if (!id) return undefined;
  return Object.values(SLEEVES).find((s) => s.crucibleStrategyId === id);
}

export function isLonnyPlaybook(p: {
  id?: string;
  metisSlug?: string;
  hypothesisId?: string;
  name?: string;
  setup?: string;
}): boolean {
  const s = SLEEVES[LONNY_METIS_SLUG]!;
  if (p.id === s.orbPlaybookId) return true;
  if (p.metisSlug === s.metisSlug) return true;
  if (p.hypothesisId === s.hypothesisId) return true;
  if (p.name && /lonny/i.test(p.name)) return true;
  if (p.setup && /lonny/i.test(p.setup)) return true;
  return false;
}
