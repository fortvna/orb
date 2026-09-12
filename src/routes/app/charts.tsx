import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CandleChart, levelLines } from "@/components/candle-chart";
import { DrawToolbar } from "@/components/draw-toolbar";
import { IndicatorPanel } from "@/components/indicator-panel";
import { IndicatorChips } from "@/components/indicator-chips";
import { Panel } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { TradingViewChart } from "@/components/tv-chart";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import { DRAW_COLORS, drawingsForSession, sessionDrawKey, type DrawTool } from "@/lib/drawings";
import { fmtPct, fmtPx } from "@/lib/format";
import { aggregateBars, generateMinuteBars, getSession, volumeProfile, cumulativeDelta } from "@/lib/market/generate";
import { globexDate, lastSessionBars, nyParts, resampleBars, sessionFromBars } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { useChart } from "@/lib/market/use-feed";
import type { FeedInterval, FeedRange } from "@/lib/market/types";
import { isMockOn } from "@/lib/mock";
import { nyToday } from "@/lib/market/clock";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/charts")({ component: ChartsPage });

const INTERVALS: { id: string; feed: FeedInterval; range: FeedRange; minutes: number; label: string; tv: string }[] = [
  { id: "1m", feed: "1m", range: "5d", minutes: 1, label: "1m", tv: "1" },
  { id: "3m", feed: "1m", range: "5d", minutes: 3, label: "3m", tv: "3" },
  { id: "5m", feed: "5m", range: "5d", minutes: 5, label: "5m", tv: "5" },
  { id: "15m", feed: "15m", range: "5d", minutes: 15, label: "15m", tv: "15" },
  { id: "30m", feed: "5m", range: "5d", minutes: 30, label: "30m", tv: "30" },
  { id: "1h", feed: "60m", range: "1mo", minutes: 60, label: "1H", tv: "60" },
  { id: "4h", feed: "60m", range: "1mo", minutes: 240, label: "4H", tv: "240" },
  { id: "1d", feed: "1d", range: "6mo", minutes: 390, label: "1D", tv: "D" },
];

function ChartsPage() {
  const [symbol, setSymbol] = useState("NQ");
  const [interval, setInterval] = useState("5m");
  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<string>(DRAW_COLORS[0]!);
  const [showInd, setShowInd] = useState(false);
  const [mode, setMode] = useState<"tape" | "tv">("tape");
  const spec = getSymbol(symbol);
  const picked = INTERVALS.find((i) => i.id === interval) ?? INTERVALS[2]!;
  const range = picked.range;
  const minutes = picked.minutes;
  const { chart, live, loading, error } = useChart(symbol, picked.feed, range);
  const compareId = symbol === "NQ" ? "ES" : symbol === "ES" ? "NQ" : null;
  const compareFeed: FeedInterval = picked.feed === "1d" || picked.feed === "60m" ? picked.feed : "5m";
  const compare = useChart(compareId, compareFeed, range);
  const date = nyToday();
  const model = useMemo(
    () => (isMockOn() ? getSession(symbol, date, minutes === 390 ? 5 : Math.min(minutes, 60)) : null),
    [symbol, date, minutes],
  );
  const bars = useMemo(() => {
    if (chart?.bars && chart.bars.length > 8) {
      let slice = picked.feed === "1d" || picked.feed === "60m" ? chart.bars : lastSessionBars(chart.bars, symbol);
      if (minutes === 3 || minutes === 30 || minutes === 240) slice = resampleBars(slice, minutes === 240 ? 240 : minutes);
      return slice;
    }
    if (!isMockOn() || !model) return [];
    if (minutes === 390) return aggregateBars(generateMinuteBars(symbol, date), 60).slice(-80);
    return model.bars;
  }, [chart, model, minutes, symbol, date, picked.feed]);
  const sessionDate = useMemo(() => {
    const lastBar = bars.at(-1);
    if (!lastBar) return date;
    return spec.kind === "futures" ? globexDate(lastBar.time) : nyParts(lastBar.time).date;
  }, [bars, spec.kind, date]);
  const session = useMemo(() => {
    if (bars.length >= 4) {
      const dayBars = picked.feed === "1d" ? bars : lastSessionBars(bars, symbol);
      const source = dayBars.length >= 4 ? dayBars : bars;
      try {
        return sessionFromBars({
          symbol,
          date: sessionDate,
          bars: source,
          prevClose: chart?.prevClose ?? source[0]!.open,
          barMinutes: minutes === 390 ? 390 : minutes,
        });
      } catch {
        return model;
      }
    }
    return model;
  }, [bars, chart, model, symbol, sessionDate, minutes, picked.feed]);
  const compareBars = useMemo(() => {
    if (!compareId || !compare.chart?.bars?.length) return [];
    if (picked.feed === "1d" || picked.feed === "60m") return compare.chart.bars;
    return lastSessionBars(compare.chart.bars, compareId);
  }, [compare.chart, compareId, picked.feed]);
  const profile = useMemo(() => volumeProfile(session?.bars ?? bars, spec.tick), [session, bars, spec.tick]);
  const delta = useMemo(() => cumulativeDelta(session?.bars ?? bars), [session, bars]);
  const lastDelta = delta.at(-1)?.value ?? 0;
  const drawKey = sessionDrawKey(symbol, sessionDate);
  const drawingsMap = useOrb((s) => s.drawings);
  const drawings = useMemo(
    () => drawingsForSession(drawingsMap, symbol, sessionDate),
    [drawingsMap, symbol, sessionDate],
  );
  const setDrawings = useOrb((s) => s.setDrawings);
  const indicators = useOrb((s) => s.indicators);
  const toggleIndicator = useOrb((s) => s.toggleIndicator);
  const last = chart?.last && chart.last > 0 ? chart.last : session?.close ?? null;
  const ch = chart?.changePct ?? 0;
  const usingModel = !live && Boolean(model && bars.length);
  const fallbackYahoo = chart?.yahoo && chart.yahoo !== spec.yahoo ? chart.yahoo : null;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col overflow-hidden lg:h-dvh">
      {showInd ? (
        <IndicatorPanel active={indicators} onToggle={toggleIndicator} onClose={() => setShowInd(false)} />
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="font-mono text-sm">
            {spec.label} · {INTERVALS.find((i) => i.id === interval)?.label}
          </div>
          <div className="text-[11px] text-muted">{spec.name}</div>
        </div>
        <Badge tone={live ? "long" : usingModel ? "warn" : "muted"}>
          {live ? "Yahoo live" : loading ? "Connecting" : usingModel ? "Model tape" : "No tape"}
        </Badge>
        {fallbackYahoo ? (
          <Badge tone="warn" title={`Same-index fallback — ${spec.label} tape via ${fallbackYahoo}`}>
            via {fallbackYahoo}
          </Badge>
        ) : null}
        {picked.minutes === 3 ? (
          <Badge tone="muted">3m from 1m</Badge>
        ) : picked.minutes === 30 ? (
          <Badge tone="muted">30m from 5m</Badge>
        ) : picked.minutes === 240 ? (
          <Badge tone="muted">4H from 60m</Badge>
        ) : picked.feed === "1m" ? (
          <Badge tone="muted">1m · ~5d</Badge>
        ) : null}
        {indicators.includes("smt") && compareId ? (
          <Badge tone="steel" title="SMT compares last two swing highs/lows vs the paired index">
            SMT vs {compareId}
          </Badge>
        ) : null}
        {error && !live ? <span className="text-[11px] text-short">{error}</span> : null}
        <SymbolSelect value={symbol} onChange={setSymbol} />
        <div className="flex rounded-md border border-border p-0.5">
          <button
            type="button"
            onClick={() => setMode("tape")}
            className={cn("h-8 rounded-sm px-2.5 text-xs", mode === "tape" ? "bg-surface text-fg" : "text-muted")}
          >
            Tape
          </button>
          <button
            type="button"
            onClick={() => setMode("tv")}
            className={cn("h-8 rounded-sm px-2.5 text-xs", mode === "tv" ? "bg-surface text-fg" : "text-muted")}
          >
            TradingView
          </button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowInd(true)}>
          <SlidersHorizontal /> Indicators
        </Button>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(spec.tv)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted hover:text-fg"
        >
          {spec.tv} ↗
        </a>
        <div className="ml-auto text-right">
          <div className="font-mono text-sm tabular-nums">{last != null ? fmtPx(last, spec.digits) : "—"}</div>
          <div className={cn("font-mono text-[11px]", ch >= 0 ? "text-long" : "text-short")}>{fmtPct(ch)}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode === "tape" ? (
          <DrawToolbar
            vertical
            tool={tool}
            color={color}
            onTool={setTool}
            onColor={setColor}
            onClear={() => setDrawings(drawKey, [])}
            count={drawings.length}
          />
        ) : null}
        <div className="relative min-h-0 min-w-0 flex-1">
          {mode === "tv" ? (
            <TradingViewChart symbol={symbol} interval={picked.tv} className="absolute inset-0 h-full w-full" />
          ) : (
            <>
              {loading && bars.length < 8 ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/40">
                  <p className="text-sm text-muted">Loading live tape…</p>
                </div>
              ) : null}
              {!loading && bars.length < 8 ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <p className="max-w-sm text-center text-sm text-muted">
                    {error ??
                      (picked.feed === "1m"
                        ? "Yahoo 1m only covers about 5 Globex days. Switch to 5m for the month."
                        : "No tape for this session. Try another interval, or turn on Model tape for today in Settings.")}
                  </p>
                </div>
              ) : null}
              <CandleChart
                bars={bars}
                indicators={indicators}
                session={session}
                lines={session ? levelLines(session.orb, session.ib, indicators) : []}
                drawings={drawings}
                tool={tool}
                color={color}
                onDrawingsChange={(next) => setDrawings(drawKey, next)}
                watermark={picked.label}
                lastPrice={last ?? undefined}
                compareBars={indicators.includes("smt") ? compareBars : []}
                className="absolute inset-0 h-full w-full"
              />
              <IndicatorChips active={indicators} onToggle={toggleIndicator} />
            </>
          )}
        </div>
        <aside className="hidden w-72 shrink-0 space-y-3 overflow-y-auto border-l border-border p-3 lg:block">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Session</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Last" v={last != null ? fmtPx(last, spec.digits) : "—"} />
              <Row k="VWAP" v={session ? fmtPx(session.vwap, spec.digits) : "—"} />
              <Row k="POC" v={session ? fmtPx(session.poc, spec.digits) : "—"} />
              <Row
                k="Open range"
                v={session ? `${fmtPx(session.orb.low, spec.digits)}–${fmtPx(session.orb.high, spec.digits)}` : "—"}
              />
              <Row
                k="IB"
                v={session ? `${fmtPx(session.ib.low, spec.digits)}–${fmtPx(session.ib.high, spec.digits)}` : "—"}
              />
            </dl>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Cumulative delta</h2>
              <span className={cn("font-mono text-xs", lastDelta >= 0 ? "text-long" : "text-short")}>
                {lastDelta >= 0 ? "+" : ""}
                {lastDelta}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-subtle">Close-in-bar estimate — not tick delta.</p>
            <div className="mt-2 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={delta.filter((_, i) => i % 4 === 0)}>
                  <XAxis hide dataKey="time" />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "#101114",
                      border: "1px solid rgba(236,238,241,0.1)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill={CHART.vwap} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Volume profile</h2>
            <p className="mt-1 text-[11px] text-subtle">Yahoo bar volume — delayed, not a tick profile.</p>
            <div className="mt-3 space-y-0.5">
              {profile.rows.map((r) => {
                const max = Math.max(...profile.rows.map((x) => x.volume), 1);
                return (
                  <div key={r.price} className="flex items-center gap-2">
                    <div className="w-14 font-mono text-[10px] text-muted">{fmtPx(r.price, spec.digits)}</div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn("h-full rounded-full", r.price === profile.poc ? "bg-steel" : "bg-subtle")}
                        style={{ width: `${(r.volume / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </aside>
      </div>

      <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-border px-3 py-1.5 font-mono text-[11px] lg:hidden">
        <span className="whitespace-nowrap text-fg">Last {last != null ? fmtPx(last, spec.digits) : "—"}</span>
        <span className="whitespace-nowrap text-muted">VWAP {session ? fmtPx(session.vwap, spec.digits) : "—"}</span>
        <span className="whitespace-nowrap text-muted">
          OR {session ? `${fmtPx(session.orb.low, spec.digits)}–${fmtPx(session.orb.high, spec.digits)}` : "—"}
        </span>
        <span className="whitespace-nowrap text-muted">
          IB {session ? `${fmtPx(session.ib.low, spec.digits)}–${fmtPx(session.ib.high, spec.digits)}` : "—"}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-border bg-bg-elevated px-3 py-1.5">
        {INTERVALS.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setInterval(i.id)}
            className={cn(
              "h-8 rounded-sm px-2.5 font-mono text-xs",
              interval === i.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {i.label}
          </button>
        ))}
        <NativeSelect
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="ml-auto hidden h-8 max-w-[5rem] sm:block"
        >
          {INTERVALS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono tabular-nums">{v}</dd>
    </div>
  );
}
