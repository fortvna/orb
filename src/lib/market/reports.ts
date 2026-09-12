import { getSessions } from "./generate";
import { listTradingDays } from "./calendar";
import { nyParts } from "./session";
import { computePerformance } from "./stats";
import { isMockOn } from "../mock";
import type {
  BreakKind,
  CustomReport,
  Playbook,
  PlaybookEvaluation,
  ReportId,
  SessionDay,
  Trade,
} from "./types";

export type SliceStat = {
  label: string;
  n: number;
  rate: number;
};

export type ReportView = {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  headline: { label: string; value: string; hint: string }[];
  distribution: { label: string; value: number; tone: "long" | "short" | "muted" | "warn" }[];
  byWeekday: SliceStat[];
  extras: { label: string; value: string }[];
  source: "session" | "playbook" | "custom";
};

const REPORT_META: Record<ReportId, { title: string; kicker: string }> = {
  gap: { title: "Gap fill", kicker: "Does the overnight gap get filled?" },
  orb: { title: "Opening range", kicker: "First 15 minutes, then the expansion." },
  ib: { title: "Initial balance", kicker: "First hour high/low — the day's container." },
  occ: { title: "Opening candle continuation", kicker: "Does the first hour's direction stick?" },
  adr: { title: "Average daily range", kicker: "How far does price typically travel?" },
  inside: { title: "Inside day", kicker: "When today opens inside yesterday's range." },
  power: { title: "Power hour", kicker: "Last 60 minutes — trend or fade?" },
};

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function rate(xs: boolean[]): number {
  if (!xs.length) return 0;
  return xs.filter(Boolean).length / xs.length;
}

function byWeekday(days: SessionDay[], pred: (d: SessionDay) => boolean): SliceStat[] {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
  return [1, 2, 3, 4, 5].map((wd) => {
    const slice = days.filter((d) => d.weekday === wd);
    return {
      label: names[wd] ?? "",
      n: slice.length,
      rate: rate(slice.map(pred)),
    };
  });
}

function breakCounts(days: SessionDay[], key: "orbBreak" | "ibBreak") {
  const n = days.length || 1;
  const count = (k: BreakKind) => days.filter((d) => d[key] === k).length / n;
  return {
    up: count("up"),
    down: count("down"),
    both: count("both"),
    none: count("none"),
  };
}

function bestWeekday(days: SessionDay[], pred: (d: SessionDay) => boolean): string {
  const stats = byWeekday(days, pred).filter((s) => s.n > 0);
  if (!stats.length) return "—";
  const max = Math.max(...stats.map((s) => s.rate));
  return stats.filter((s) => s.rate === max).map((s) => s.label).join(" / ");
}

export function sessionsFor(symbolId: string, lookback = 60, liveSessions?: SessionDay[]): SessionDay[] {
  if (liveSessions && liveSessions.length) return liveSessions.slice(0, lookback);
  if (isMockOn()) {
    const dates = listTradingDays(lookback + 1).slice(1);
    return getSessions(symbolId, dates, 5);
  }
  return [];
}

function emptyReport(report: ReportId): ReportView {
  const meta = REPORT_META[report];
  return {
    id: report,
    title: meta.title,
    kicker: meta.kicker,
    source: "session",
    summary:
      "No live sessions in this window. Pull Yahoo from Charts, or turn on Model tape for today in Desk settings.",
    headline: [
      { label: "Sample", value: "0", hint: "sessions" },
      { label: "Rate", value: "—", hint: "waiting" },
      { label: "Live", value: "off", hint: "feed" },
      { label: "Model", value: isMockOn() ? "on" : "off", hint: "desk setting" },
    ],
    distribution: [],
    byWeekday: [1, 2, 3, 4, 5].map((wd) => ({
      label: ["", "Mon", "Tue", "Wed", "Thu", "Fri"][wd] ?? "",
      n: 0,
      rate: 0,
    })),
    extras: [{ label: "Source", value: "waiting on tape" }],
  };
}

export function buildReport(
  symbolId: string,
  report: ReportId,
  lookback = 60,
  liveSessions?: SessionDay[],
  dailySessions?: SessionDay[],
): ReportView {
  const usesDaily = report === "gap" || report === "adr" || report === "inside";
  const tape = sessionsFor(symbolId, lookback, liveSessions);
  const daily = dailySessions?.length ? dailySessions.slice(0, lookback) : [];
  const days = usesDaily && daily.length > tape.length ? daily : tape;
  const meta = REPORT_META[report];
  if (!days.length) return emptyReport(report);

  if (report === "gap") {
    const fills = days.map((d) => d.gapFilled);
    const upGaps = days.filter((d) => d.gap > 0);
    const downGaps = days.filter((d) => d.gap < 0);
    const fillRate = rate(fills);
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary:
        downGaps.length || upGaps.length
          ? `Gaps fill on ${Math.round(fillRate * 100)}% of sessions. ${
              rate(downGaps.map((d) => d.gapFilled)) > rate(upGaps.map((d) => d.gapFilled))
                ? "Down gaps filled more than up gaps in this window."
                : rate(upGaps.map((d) => d.gapFilled)) > rate(downGaps.map((d) => d.gapFilled))
                  ? "Up gaps filled more than down gaps in this window."
                  : "Up and down fill rates are similar here."
            }`
          : `No measurable overnight gaps in this window.`,
      headline: [
        { label: "Fill rate", value: `${Math.round(fillRate * 100)}%`, hint: `${days.length} sessions` },
        {
          label: "Up-gap fill",
          value: `${Math.round(rate(upGaps.map((d) => d.gapFilled)) * 100)}%`,
          hint: `${upGaps.length} gaps`,
        },
        {
          label: "Down-gap fill",
          value: `${Math.round(rate(downGaps.map((d) => d.gapFilled)) * 100)}%`,
          hint: `${downGaps.length} gaps`,
        },
        {
          label: "Avg |gap|",
          value: `${(mean(days.map((d) => Math.abs(d.gapPct))) * 100).toFixed(2)}%`,
          hint: "overnight",
        },
      ],
      distribution: [
        { label: "Filled", value: fillRate, tone: "long" },
        { label: "Unfilled", value: 1 - fillRate, tone: "short" },
      ],
      byWeekday: byWeekday(days, (d) => d.gapFilled),
      extras: [
        { label: "Sample", value: `${days.length} sessions` },
        { label: "Best fade", value: bestWeekday(downGaps, (d) => d.gapFilled) || "—" },
      ],
    };
  }

  if (report === "orb") {
    const c = breakCounts(days, "orbBreak");
    const ext = mean(days.filter((d) => d.orbBreak !== "none").map((d) => d.orbExtension));
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary: `${Math.round((c.up + c.down) * 100)}% single-side, ${Math.round(c.both * 100)}% double break. ${
        c.up + c.down >= c.both
          ? "First-break continuation is the base rate — skip two-way days."
          : "Two-way days dominate this sample — stand down more often."
      }`,
      headline: [
        { label: "Break up only", value: `${Math.round(c.up * 100)}%`, hint: "long continuation" },
        { label: "Break down only", value: `${Math.round(c.down * 100)}%`, hint: "short continuation" },
        { label: "Double break", value: `${Math.round(c.both * 100)}%`, hint: "avoid" },
        { label: "Avg extension", value: `${ext.toFixed(2)}×`, hint: "of opening range" },
      ],
      distribution: [
        { label: "Up", value: c.up, tone: "long" },
        { label: "Down", value: c.down, tone: "short" },
        { label: "Both", value: c.both, tone: "warn" },
        { label: "None", value: c.none, tone: "muted" },
      ],
      byWeekday: byWeekday(days, (d) => d.orbBreak === "up" || d.orbBreak === "down"),
      extras: [
        { label: "Hold inside", value: `${Math.round(c.none * 100)}%` },
        { label: "Median extension", value: `${ext.toFixed(2)}× range` },
      ],
    };
  }

  if (report === "ib") {
    const c = breakCounts(days, "ibBreak");
    const firstUp = rate(days.map((d) => d.ibFirstBreak === "up"));
    const ext = mean(days.filter((d) => d.ibBreak !== "none").map((d) => d.ibExtension));
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary: `The first hour still frames the day. First break is up ${Math.round(firstUp * 100)}% of the time. Double breaks are the trap — IB by rejection is the tell.`,
      headline: [
        { label: "Break up only", value: `${Math.round(c.up * 100)}%`, hint: "IB high taken" },
        { label: "Break down only", value: `${Math.round(c.down * 100)}%`, hint: "IB low taken" },
        { label: "Double break", value: `${Math.round(c.both * 100)}%`, hint: "two-way" },
        { label: "Avg extension", value: `${ext.toFixed(2)}×`, hint: "of IB size" },
      ],
      distribution: [
        { label: "Up", value: c.up, tone: "long" },
        { label: "Down", value: c.down, tone: "short" },
        { label: "Both", value: c.both, tone: "warn" },
        { label: "None", value: c.none, tone: "muted" },
      ],
      byWeekday: byWeekday(days, (d) => d.ibBreak === "up"),
      extras: [
        { label: "First break up", value: `${Math.round(firstUp * 100)}%` },
        { label: "Hold / reject", value: `${Math.round(c.none * 100)}%` },
      ],
    };
  }

  if (report === "occ") {
    const r = rate(days.map((d) => d.occContinued));
    const up = days.filter((d) => d.occ === "up");
    const down = days.filter((d) => d.occ === "down");
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary: `When the first hour closes in a direction, the rest of the session follows ${Math.round(r * 100)}% of the time. Strongest as a filter on top of IB, not a standalone trigger.`,
      headline: [
        { label: "Continuation", value: `${Math.round(r * 100)}%`, hint: "first hour holds" },
        {
          label: "Up hour follows",
          value: `${Math.round(rate(up.map((d) => d.occContinued)) * 100)}%`,
          hint: `${up.length} days`,
        },
        {
          label: "Down hour follows",
          value: `${Math.round(rate(down.map((d) => d.occContinued)) * 100)}%`,
          hint: `${down.length} days`,
        },
        { label: "Sample", value: `${days.length}`, hint: "sessions" },
      ],
      distribution: [
        { label: "Continued", value: r, tone: "long" },
        { label: "Failed", value: 1 - r, tone: "short" },
      ],
      byWeekday: byWeekday(days, (d) => d.occContinued),
      extras: [
        { label: "Best continuation", value: bestWeekday(days, (d) => d.occContinued) },
        { label: "Sample", value: `${days.length} sessions` },
      ],
    };
  }

  if (report === "inside") {
    const paired = days.slice(0, -1).map((d, i) => ({ d, y: days[i + 1]! }));
    const insides = paired.filter((p) => p.d.open <= p.y.high && p.d.open >= p.y.low);
    const reachHigh = rate(insides.map((p) => p.d.high >= p.y.high));
    const reachLow = rate(insides.map((p) => p.d.low <= p.y.low));
    const base = paired.length || 1;
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary: `Opens inside yesterday's range ${Math.round((insides.length / base) * 100)}% of the time. Yesterday's high and low become the magnet — fade the first touch less often than you think.`,
      headline: [
        {
          label: "Inside opens",
          value: `${Math.round((insides.length / base) * 100)}%`,
          hint: `${insides.length} days`,
        },
        { label: "Reach y-high", value: `${Math.round(reachHigh * 100)}%`, hint: "same session" },
        { label: "Reach y-low", value: `${Math.round(reachLow * 100)}%`, hint: "same session" },
        {
          label: "Both extremes",
          value: `${Math.round(rate(insides.map((p) => p.d.high >= p.y.high && p.d.low <= p.y.low)) * 100)}%`,
          hint: "range day",
        },
      ],
      distribution: [
        { label: "Reached y-high", value: reachHigh, tone: "long" },
        { label: "Reached y-low", value: reachLow, tone: "short" },
      ],
      byWeekday: byWeekday(
        insides.map((p) => p.d),
        (d) => d.close >= d.open,
      ),
      extras: [
        { label: "Inside-open weekdays", value: bestWeekday(insides.map((p) => p.d), (d) => d.close >= d.open) },
        { label: "Sample", value: `${insides.length} inside opens` },
      ],
    };
  }

  if (report === "power") {
    const lastHour = days.map((d) => {
      const hour = d.bars.filter((b) => {
        const m = nyParts(b.time).minutes;
        return m >= 15 * 60 && m < 16 * 60;
      });
      const start = hour[0]?.open ?? d.close;
      const end = hour[hour.length - 1]?.close ?? d.close;
      return { d, up: end >= start, follow: (end - start) * (d.close - d.open) > 0 };
    });
    const up = rate(lastHour.map((x) => x.up));
    const follow = rate(lastHour.map((x) => x.follow));
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      source: "session",
      summary: `The last hour agrees with the day's direction ${Math.round(follow * 100)}% of the time. Trend days tend to finish. Range days mean-revert into the close — size down into 15:00.`,
      headline: [
        { label: "Close-hour up", value: `${Math.round(up * 100)}%`, hint: "15:00–16:00" },
        { label: "Follows day", value: `${Math.round(follow * 100)}%`, hint: "same sign as open→close" },
        { label: "Fade risk", value: `${Math.round((1 - follow) * 100)}%`, hint: "counter-close" },
        { label: "Sample", value: `${days.length}`, hint: "sessions" },
      ],
      distribution: [
        { label: "Follows", value: follow, tone: "long" },
        { label: "Fades", value: 1 - follow, tone: "short" },
      ],
      byWeekday: byWeekday(days, (d) => {
        const x = lastHour.find((h) => h.d.date === d.date);
        return x?.follow ?? false;
      }),
      extras: [
        { label: "Best trend close", value: bestWeekday(days, (d) => {
          const x = lastHour.find((h) => h.d.date === d.date);
          return x?.follow ?? false;
        }) },
        { label: "Window", value: "15:00–16:00 ET" },
      ],
    };
  }

  const ranges = days.map((d) => d.range);
  const adrs = mean(ranges);
  const used = days.map((d) => d.range / Math.max(adrs, 1e-9));
  const usedNow = used.filter((x) => x >= 1).length / Math.max(days.length, 1);
  return {
    id: report,
    title: meta.title,
    kicker: meta.kicker,
    source: "session",
    summary: `Average session range is the yardstick. Once ${Math.round(usedNow * 100)}% of days have already spent a full ADR, late breakouts pay less — take profits into exhaustion, not new risk.`,
    headline: [
      { label: "ADR", value: adrs.toFixed(getDigits(days)), hint: `${lookback}d mean range` },
      {
        label: "Median",
        value:
          [...ranges].sort((a, b) => a - b)[Math.floor(ranges.length / 2)]?.toFixed(getDigits(days)) ??
          "—",
        hint: "session range",
      },
      { label: "Days ≥ ADR", value: `${Math.round(usedNow * 100)}%`, hint: "exhaustion filter" },
      {
        label: "Tight days",
        value: `${Math.round(rate(used.map((x) => x < 0.7)) * 100)}%`,
        hint: "< 0.7× ADR",
      },
    ],
    distribution: [
      { label: "<0.7×", value: rate(used.map((x) => x < 0.7)), tone: "muted" },
      { label: "0.7–1.2×", value: rate(used.map((x) => x >= 0.7 && x <= 1.2)), tone: "long" },
      { label: ">1.2×", value: rate(used.map((x) => x > 1.2)), tone: "warn" },
    ],
    byWeekday: byWeekday(days, (d) => d.range >= adrs),
    extras: [
      { label: "Sample", value: `${days.length} sessions` },
      { label: "Widest weekdays", value: bestWeekday(days, (d) => d.range >= adrs) },
    ],
  };
}

export function buildPlaybookReport(playbook: Playbook, evaluation?: PlaybookEvaluation): ReportView {
  const trades = evaluation?.trades ?? [];
  const perf = computePerformance(trades);
  const wr = perf.winRate;
  return {
    id: `pb:${playbook.id}`,
    title: playbook.name,
    kicker: `${playbook.symbol} · ${playbook.kind.toUpperCase()} · replay evaluation`,
    source: "playbook",
    summary: playbook.evaluation
      ? `${playbook.name} was run across ${playbook.evaluation.sessions} ${playbook.evaluation.source === "model" ? "model" : "live"} sessions. ${playbook.evaluation.trades} fills, ${Math.round(playbook.evaluation.winRate * 100)}% win, expectancy ${playbook.evaluation.expectancy >= 0 ? "+" : ""}${Math.round(playbook.evaluation.expectancy)}.`
      : `${playbook.name} has not been evaluated yet. Open Replay, load this playbook, and run Evaluate on the live tape — the report is generated from those fills.`,
    headline: [
      { label: "Win rate", value: `${Math.round(wr * 100)}%`, hint: `${perf.trades} fills` },
      { label: "Expectancy", value: `${perf.expectancy >= 0 ? "+" : ""}${Math.round(perf.expectancy)}`, hint: "per fill" },
      { label: "Profit factor", value: perf.profitFactor.toFixed(2), hint: "gross win / loss" },
      { label: "Net", value: `${Math.round(perf.net)}`, hint: playbook.symbol },
    ],
    distribution: [
      { label: "Wins", value: wr, tone: "long" },
      { label: "Losses", value: 1 - wr, tone: "short" },
    ],
    byWeekday: [1, 2, 3, 4, 5].map((wd) => {
      const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
      const slice = trades.filter((t) => new Date(`${t.date}T12:00:00Z`).getUTCDay() === wd);
      const wins = slice.filter((t) => t.pnl > 0);
      return { label: names[wd] ?? "", n: slice.length, rate: slice.length ? wins.length / slice.length : 0 };
    }),
    extras: [
      { label: "Kind", value: playbook.kind },
      { label: "Window", value: `${fmtMin(playbook.windowStart)}–${fmtMin(playbook.windowEnd)} ET` },
      { label: "Target", value: `${playbook.targetR}R` },
      { label: "Validated", value: playbook.validated ? "yes" : "pending eval" },
    ],
  };
}

export function buildCustomReport(
  report: CustomReport,
  playbooks: Playbook[],
  evaluations: PlaybookEvaluation[],
  replayTrades: Trade[],
  liveSessions?: SessionDay[],
): ReportView {
  const pb = playbooks.find((p) => p.id === report.playbookId);
  const ev = evaluations.find((e) => e.playbookId === report.playbookId);
  if (report.source === "session") {
    const days = liveSessions && liveSessions.length ? liveSessions : sessionsFor("NQ", 40, liveSessions);
    const fillRate = days.length ? days.filter((d) => d.gapFilled).length / days.length : 0;
    const breakRate = days.length
      ? days.filter((d) => d.orbBreak === "up" || d.orbBreak === "down").length / days.length
      : 0;
    const value =
      report.metric === "fillRate"
        ? `${Math.round(fillRate * 100)}%`
        : report.metric === "breakRate"
          ? `${Math.round(breakRate * 100)}%`
          : `${days.length}`;
    return {
      id: report.id,
      title: report.name,
      kicker: report.blurb || "Session study",
      source: "custom",
      summary: `${report.name} is counted from live (or model) session tape — ${days.length} days.`,
      headline: [
        { label: report.metric, value, hint: `${days.length} sessions` },
        { label: "Fill rate", value: `${Math.round(fillRate * 100)}%`, hint: "overnight gap" },
        { label: "OR break", value: `${Math.round(breakRate * 100)}%`, hint: "single-side" },
        { label: "Sample", value: `${days.length}`, hint: "sessions" },
      ],
      distribution: [
        { label: "Filled", value: fillRate, tone: "long" },
        { label: "Broke OR", value: breakRate, tone: "warn" },
      ],
      byWeekday: byWeekday(days, (d) => (report.metric === "breakRate" ? d.orbBreak !== "none" : d.gapFilled)),
      extras: [
        { label: "Source", value: "session tape" },
        { label: "Metric", value: report.metric },
      ],
    };
  }
  const trades =
    report.source === "replay"
      ? replayTrades.filter((t) => t.source === "replay")
      : ev?.trades ?? replayTrades.filter((t) => t.playbookId === report.playbookId);
  const perf = computePerformance(trades);
  const metric =
    report.metric === "winRate"
      ? `${Math.round(perf.winRate * 100)}%`
      : report.metric === "expectancy"
        ? `${Math.round(perf.expectancy)}`
        : report.metric === "net"
          ? `${Math.round(perf.net)}`
          : report.metric === "fillRate"
            ? `${perf.trades}`
            : `${Math.round(perf.winRate * 100)}%`;
  return {
    id: report.id,
    title: report.name,
    kicker: report.blurb || "User-defined report",
    source: "custom",
    summary: `${report.name} is counted from ${report.source === "replay" ? "manual replay fills" : pb ? pb.name + " evaluations" : "the journal"}. ${perf.trades} trades in sample.`,
    headline: [
      { label: report.metric, value: metric, hint: `${perf.trades} fills` },
      { label: "Win rate", value: `${Math.round(perf.winRate * 100)}%`, hint: `${perf.wins}W / ${perf.losses}L` },
      { label: "Net", value: `${Math.round(perf.net)}`, hint: "evaluated + replay" },
      { label: "Avg R", value: perf.avgR.toFixed(2), hint: "per fill" },
    ],
    distribution: [
      { label: "Wins", value: perf.winRate, tone: "long" },
      { label: "Losses", value: 1 - perf.winRate, tone: "short" },
    ],
    byWeekday: [1, 2, 3, 4, 5].map((wd) => {
      const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
      const slice = trades.filter((t) => new Date(`${t.date}T12:00:00Z`).getUTCDay() === wd);
      const wins = slice.filter((t) => t.pnl > 0);
      return { label: names[wd] ?? "", n: slice.length, rate: slice.length ? wins.length / slice.length : 0 };
    }),
    extras: [
      { label: "Source", value: report.source },
      { label: "Playbook", value: pb?.name ?? "—" },
    ],
  };
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function getDigits(days: SessionDay[]): number {
  const r = days[0]?.range ?? 1;
  if (r < 0.05) return 5;
  if (r < 2) return 2;
  if (r < 20) return 2;
  return 1;
}

export const REPORT_LIST: { id: ReportId; title: string; blurb: string }[] = [
  { id: "orb", title: "Opening range", blurb: "15-minute breakout / breakdown" },
  { id: "ib", title: "Initial balance", blurb: "First-hour container" },
  { id: "gap", title: "Gap fill", blurb: "Overnight gap as a magnet" },
  { id: "occ", title: "Opening continuation", blurb: "First hour direction" },
  { id: "adr", title: "Daily range", blurb: "ADR as a fuel gauge" },
  { id: "inside", title: "Inside day", blurb: "Yesterday's range as target" },
  { id: "power", title: "Power hour", blurb: "Close-of-day trend" },
];
