export type MarketKind = "futures" | "stocks" | "forex" | "crypto";

export type BreakKind = "up" | "down" | "both" | "none";

export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
};

export type RangeLevel = {
  high: number;
  low: number;
  mid: number;
  size: number;
};

export type SymbolSpec = {
  id: string;
  label: string;
  name: string;
  kind: MarketKind;
  digits: number;
  tick: number;
  pointValue: number;
  typical: number;
  barVol: number;
  gapSigma: number;
  pTrend: number;
  pBreakout: number;
  pReversal: number;
};

export type SessionDay = {
  symbol: string;
  date: string;
  weekday: number;
  bars: Bar[];
  barMinutes: number;
  prevClose: number;
  open: number;
  close: number;
  high: number;
  low: number;
  gap: number;
  gapPct: number;
  gapFilled: boolean;
  gapFillTime: number | null;
  orb: RangeLevel;
  orbBreak: BreakKind;
  orbBreakTime: number | null;
  orbExtension: number;
  ib: RangeLevel;
  ibBreak: BreakKind;
  ibBreakTime: number | null;
  ibExtension: number;
  ibFirstBreak: "up" | "down" | null;
  occ: "up" | "down";
  occContinued: boolean;
  range: number;
  vwap: number;
  poc: number;
};

export type TradeSide = "long" | "short";

export type TradeSource = "journal" | "replay" | "prop";

export type Trade = {
  id: string;
  symbol: string;
  side: TradeSide;
  qty: number;
  entry: number;
  exit: number | null;
  entryTime: number;
  exitTime: number | null;
  stop: number | null;
  target: number | null;
  pnl: number;
  fees: number;
  rMultiple: number;
  setup: string;
  tags: string[];
  notes: string;
  source: TradeSource;
  playbookId: string | null;
  date: string;
  open: boolean;
};

export type Playbook = {
  id: string;
  name: string;
  setup: string;
  thesis: string;
  rules: string[];
  invalidation: string;
  session: string;
  status: "active" | "paused";
};

export type PropChallenge = {
  id: string;
  name: string;
  account: number;
  profitTarget: number;
  maxDrawdown: number;
  dailyDrawdown: number;
  consistency: number;
  minDays: number;
};

export type ReportId =
  | "gap"
  | "orb"
  | "ib"
  | "occ"
  | "adr"
  | "inside"
  | "power";
