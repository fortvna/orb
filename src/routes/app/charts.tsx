import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CandleChart, levelLines } from "@/components/candle-chart";
import { DrawToolbar } from "@/components/draw-toolbar";
import { IndicatorPanel } from "@/components/indicator-panel";
import { Panel } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { TradingViewChart } from "@/components/tv-chart";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import { DRAW_COLORS, type DrawTool } from "@/lib/drawings";
import { fmtPct, fmtPx } from "@/lib/format";
import { listTradingDays } from "@/lib/market/calendar";
import { aggregateBars, generateMinuteBars, getSession, volumeProfile, cumulativeDelta } from "@/lib/market/generate";
import { lastSessionBars, nyParts, sessionFromBars } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { useChart } from "@/lib/market/use-feed";
import type { FeedInterval, FeedRange } from "@/lib/market/types";
import { useOrb, EMPTY_DRAWINGS } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/charts")({ component: ChartsPage });

const INTERVALS: { id: FeedInterval; range: FeedRange; minutes: number; label: string }[] = [
  { id: "1m", range: "5d", minutes: 1, label: "1m" },
  { id: "5m", range: "5d", minutes: 5, label: "5m" },
  { id: "15m", range: "5d", minutes: 15, label: "15m" },
  { id: "60m", range: "1mo", minutes: 60, label: "1h" },
  { id: "1d", range: "6mo", minutes: 390, label: "1D" },
];

function ChartsPage() {
  const [symbol, setSymbol] = useState("NQ");
  const [interval, setInterval] = useState<FeedInterval>("5m");
  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<string>(DRAW_COLORS[0]!);
  const [showInd, setShowInd] = useState(false);
  const [mode, setMode] = useState<"tape" | "tv">("tape");
  const spec = getSymbol(symbol);
  const range = INTERVALS.find((i) => i.id === interval)?.range ?? "5d";
  const minutes = INTERVALS.find((i) => i.id === interval)?.minutes ?? 5;
  const { chart, live, loading, error } = useChart(symbol, interval, range);
  const date = listTradingDays(2)[0] ?? listTradingDays(1)[0]!;
  const model = useMemo(() => getSession(symbol, date, minutes === 390 ? 5 : minutes), [symbol, date, minutes]);
  const bars = useMemo(() => {
    if (chart?.bars && chart.bars.length > 8) {
      if (interval === "1d" || interval === "60m") return chart.bars;
      return lastSessionBars(chart.bars, symbol);
    }
    if (minutes === 390) return aggregateBars(generateMinuteBars(symbol, date), 60).slice(-80);
    return model.bars;
  }, [chart, model.bars, minutes, symbol, date, interval]);
  const session = useMemo(() => {
    if (chart?.bars && chart.bars.length > 8 && bars.length) {
      return sessionFromBars({
        symbol,
        date: nyParts(bars[bars.length - 1]!.time).date,
        bars,
        prevClose: chart.prevClose,
        barMinutes: minutes,
      });
    }
    return model;
  }, [chart, model, minutes, symbol, bars]);
  const profile = useMemo(() => volumeProfile(session.bars, spec.tick), [session, spec.tick]);
  const delta = useMemo(() => cumulativeDelta(session.bars), [session]);
  const lastDelta = delta.at(-1)?.value ?? 0;
  const drawKey = `charts:${symbol}:${interval}`;
  const drawings = useOrb((s) => s.drawings[drawKey] ?? EMPTY_DRAWINGS);
  const setDrawings = useOrb((s) => s.setDrawings);
  const indicators = useOrb((s) => s.indicators);
  const toggleIndicator = useOrb((s) => s.toggleIndicator);
  const last = chart?.last ?? session.close;
  const ch = chart?.changePct ?? 0;

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
        <Badge tone={live ? "long" : "muted"}>{live ? "Yahoo live" : loading ? "Connecting" : "Model tape"}</Badge>
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
          <div className="font-mono text-sm tabular-nums">{fmtPx(last, spec.digits)}</div>
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
            <TradingViewChart symbol={symbol} interval={interval} className="absolute inset-0 h-full w-full" />
          ) : (
            <CandleChart
              bars={bars}
              indicators={indicators}
              session={session}
              lines={levelLines(session.orb, session.ib)}
              drawings={drawings}
              tool={tool}
              color={color}
              onDrawingsChange={(next) => setDrawings(drawKey, next)}
              watermark={INTERVALS.find((i) => i.id === interval)?.label}
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>
        <aside className="hidden w-72 shrink-0 space-y-3 overflow-y-auto border-l border-border p-3 lg:block">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Session</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Last" v={fmtPx(last, spec.digits)} />
              <Row k="VWAP" v={fmtPx(session.vwap, spec.digits)} />
              <Row k="POC" v={fmtPx(session.poc, spec.digits)} />
              <Row
                k="Open range"
                v={`${fmtPx(session.orb.low, spec.digits)}–${fmtPx(session.orb.high, spec.digits)}`}
              />
              <Row
                k="IB"
                v={`${fmtPx(session.ib.low, spec.digits)}–${fmtPx(session.ib.high, spec.digits)}`}
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
          onChange={(e) => setInterval(e.target.value as FeedInterval)}
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
