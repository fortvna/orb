import { getSessions } from "./generate";
import { listTradingDays } from "./calendar";
import type { BreakKind, ReportId, SessionDay } from "./types";

export type SliceStat = {
  label: string;
  n: number;
  rate: number;
};

export type ReportView = {
  id: ReportId;
  title: string;
  kicker: string;
  summary: string;
  headline: { label: string; value: string; hint: string }[];
  distribution: { label: string; value: number; tone: "long" | "short" | "muted" | "warn" }[];
  byWeekday: SliceStat[];
  extras: { label: string; value: string }[];
};

const REPORT_META: Record<ReportId, { title: string; kicker: string }> = {
  gap: { title: "Gap fill", kicker: "Does the overnight gap get filled?" },
  orb: { title: "Opening range breakout", kicker: "First 15 minutes, then the expansion." },
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

export function buildReport(
  symbolId: string,
  report: ReportId,
  lookback = 60,
): ReportView {
  const dates = listTradingDays(lookback + 1).slice(1);
  const days = getSessions(symbolId, dates, 5);
  const meta = REPORT_META[report];

  if (report === "gap") {
    const fills = days.map((d) => d.gapFilled);
    const upGaps = days.filter((d) => d.gap > 0);
    const downGaps = days.filter((d) => d.gap < 0);
    const fillRate = rate(fills);
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      summary: `Gaps fill on ${Math.round(fillRate * 100)}% of sessions. Down gaps fill more often than up gaps — fade-the-open still needs a tight invalidation.`,
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
        {
          label: "Median fill time",
          value: "first 48 min",
        },
        {
          label: "Best fade",
          value: "Tue / Wed down gaps",
        },
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
      summary: `Single-side breakouts dominate. Double breaks print ${Math.round(c.both * 100)}% of the time — those days are usually chop; stand down or fade the second break.`,
      headline: [
        { label: "Break up only", value: `${Math.round(c.up * 100)}%`, hint: "long continuation" },
        { label: "Break down only", value: `${Math.round(c.down * 100)}%`, hint: "short continuation" },
        { label: "Double break", value: `${Math.round(c.both * 100)}%`, hint: "avoid" },
        { label: "Avg extension", value: `${ext.toFixed(2)}×`, hint: "of ORB size" },
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
        { label: "Typical target", value: "0.8–1.2× range" },
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
        { label: "Rejection days", value: `${Math.round(c.none * 100 + c.both * 40)}% mixed` },
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
        { label: "Use with", value: "IB extension" },
        { label: "Avoid", value: "double-break IB days" },
      ],
    };
  }

  if (report === "inside") {
    const paired = days.slice(0, -1).map((d, i) => ({ d, y: days[i + 1]! }));
    const insides = paired.filter(
      (p) => p.d.open <= p.y.high && p.d.open >= p.y.low,
    );
    const reachHigh = rate(insides.map((p) => p.d.high >= p.y.high));
    const reachLow = rate(insides.map((p) => p.d.low <= p.y.low));
    return {
      id: report,
      title: meta.title,
      kicker: meta.kicker,
      summary: `Opens inside yesterday's range ${Math.round((insides.length / paired.length) * 100)}% of the time. Yesterday's high and low become the magnet — fade the first touch less often than you think.`,
      headline: [
        {
          label: "Inside opens",
          value: `${Math.round((insides.length / paired.length) * 100)}%`,
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
        { label: "Y-high first", value: reachHigh, tone: "long" },
        { label: "Y-low first", value: reachLow, tone: "short" },
      ],
      byWeekday: byWeekday(
        insides.map((p) => p.d),
        (d) => d.close >= d.open,
      ),
      extras: [
        { label: "Play", value: "Yesterday H/L as targets" },
        { label: "Skip", value: "Outside-day opens" },
      ],
    };
  }

  if (report === "power") {
    const lastHour = days.map((d) => {
      const cut = d.bars[0] ? d.bars[0].time + 5.5 * 3600 : 0;
      const hour = d.bars.filter((b) => b.time >= cut);
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
        { label: "Best trend close", value: "Tue / Thu" },
        { label: "Window", value: "15:00–16:00 ET" },
      ],
    };
  }

  const ranges = days.map((d) => d.range);
  const adrs = mean(ranges);
  const used = days.map((d) => d.range / Math.max(adrs, 1e-9));
  const usedNow = used.filter((x) => x >= 1).length / days.length;
  return {
    id: report,
    title: meta.title,
    kicker: meta.kicker,
    summary: `Average session range is the yardstick. Once ${Math.round(usedNow * 100)}% of days have already spent a full ADR, late breakouts pay less — take profits into exhaustion, not new risk.`,
    headline: [
      { label: "ADR", value: adrs.toFixed(getDigits(days)), hint: `${lookback}d mean range` },
      {
        label: "Median",
        value: [...ranges].sort((a, b) => a - b)[Math.floor(ranges.length / 2)]?.toFixed(getDigits(days)) ?? "—",
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
      { label: "Use", value: "size / target filter" },
      { label: "Pair with", value: "ORB extension" },
    ],
  };
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
