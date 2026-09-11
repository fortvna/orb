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
  yahoo: string;
  tv: string;
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

export type TradeSource = "journal" | "replay" | "prop" | "evaluated";

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

export type PlaybookKind = "orb" | "ib" | "gap" | "vwap" | "fvg" | "custom";

export type PlaybookStatus = "draft" | "active" | "paused" | "validated";

export type PlaybookEvalSummary = {
  at: number;
  symbol: string;
  sessions: number;
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  net: number;
  avgR: number;
};

export type Playbook = {
  id: string;
  name: string;
  setup: string;
  thesis: string;
  rules: string[];
  invalidation: string;
  session: string;
  status: PlaybookStatus;
  origin?: "desk" | "imported" | "custom" | "mentor";
  kind: PlaybookKind;
  symbol: string;
  timeframe: "1m" | "5m" | "15m";
  windowStart: number;
  windowEnd: number;
  targetR: number;
  stopTicks: number | null;
  validated: boolean;
  mentorNotes: string;
  evaluation?: PlaybookEvalSummary;
};

export type PlaybookEvaluation = {
  id: string;
  playbookId: string;
  at: number;
  symbol: string;
  summary: PlaybookEvalSummary;
  trades: Trade[];
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

export type ReportId = "gap" | "orb" | "ib" | "occ" | "adr" | "inside" | "power";

export type CustomReport = {
  id: string;
  name: string;
  blurb: string;
  source: "playbook" | "session" | "replay";
  playbookId: string | null;
  metric: "winRate" | "expectancy" | "net" | "fillRate" | "breakRate";
};

export type Quote = {
  id: string;
  last: number;
  prevClose: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  spark: number[];
  asOf: number;
};

export type FeedInterval = "1m" | "5m" | "15m" | "60m" | "1d";
export type FeedRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y";

export type ChartFeed = {
  id: string;
  interval: string;
  bars: Bar[];
  last: number;
  prevClose: number;
  changePct: number;
  asOf: number;
};

export type IndicatorId =
  | "volume"
  | "sessionHL"
  | "keyTimes"
  | "killzones"
  | "openPrice"
  | "vwap"
  | "stdev"
  | "ema"
  | "rsi"
  | "vrvp"
  | "hvn"
  | "htf"
  | "po3"
  | "quarterly"
  | "stopHunt"
  | "eqHL"
  | "fvg"
  | "pivots";

export type ReplayMode = "free" | "eval";
