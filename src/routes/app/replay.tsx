import { createFileRoute } from "@tanstack/react-router";
import { Pause, Play, SkipForward, StepForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CandleChart, levelLines } from "@/components/candle-chart";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { fmtPx, fmtTimeNy } from "@/lib/format";
import { CHART } from "@/lib/chart-theme";
import { AS_OF_DATE, listTradingDays } from "@/lib/market/calendar";
import { generateMinuteBars, getSession } from "@/lib/market/generate";
import { getSymbol } from "@/lib/market/symbols";
import { useOrb } from "@/lib/store";
import type { Trade } from "@/lib/market/types";

export const Route = createFileRoute("/app/replay")({ component: ReplayPage });

const SPEEDS = [1, 2, 4, 8, 16];

function ReplayPage() {
  const days = useMemo(() => listTradingDays(40), []);
  const [symbol, setSymbol] = useState("ES");
  const [date, setDate] = useState(days[1] ?? AS_OF_DATE);
  const [idx, setIdx] = useState(20);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [qty, setQty] = useState(1);
  const [stopTicks, setStopTicks] = useState(16);
  const [targetTicks, setTargetTicks] = useState(24);

  const spec = getSymbol(symbol);
  const bars = useMemo(() => generateMinuteBars(symbol, date), [symbol, date]);
  const session = useMemo(() => getSession(symbol, date, 1), [symbol, date]);
  const visible = bars.slice(0, Math.max(2, Math.min(idx, bars.length)));
  const last = visible[visible.length - 1];
  const addTrade = useOrb((s) => s.addTrade);
  const closeTrade = useOrb((s) => s.closeTrade);
  const trades = useOrb((s) => s.trades);
  const open = trades.filter((t) => t.open && t.symbol === symbol && t.source === "replay");
  const replayClosed = trades.filter(
    (t) => !t.open && t.source === "replay" && t.symbol === symbol && t.date === date,
  );
  const sessionPnl =
    open.reduce((s, t) => s + unrealized(t, last?.close ?? t.entry, spec.pointValue), 0) +
    replayClosed.reduce((s, t) => s + t.pnl, 0);

  useEffect(() => {
    setIdx(20);
    setPlaying(false);
  }, [symbol, date]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        if (i >= bars.length) return i;
        return i + 1;
      });
    }, Math.max(40, 700 / speed));
    return () => window.clearInterval(id);
  }, [playing, speed, bars.length]);

  useEffect(() => {
    if (!last) return;
    for (const t of open) {
      if (t.stop !== null) {
        const hit =
          t.side === "long" ? last.low <= t.stop : last.high >= t.stop;
        if (hit) {
          const exit = t.stop;
          const pnl = (t.side === "long" ? exit - t.entry : t.entry - exit) * t.qty * spec.pointValue;
          const risk = Math.abs((t.stop - t.entry) * t.qty * spec.pointValue) || 1;
          closeTrade(t.id, exit, last.time, pnl, pnl / risk);
        }
      }
      if (t.target !== null) {
        const hit = t.side === "long" ? last.high >= t.target : last.low <= t.target;
        if (hit) {
          const exit = t.target;
          const pnl = (t.side === "long" ? exit - t.entry : t.entry - exit) * t.qty * spec.pointValue;
          const risk = t.stop ? Math.abs((t.stop - t.entry) * t.qty * spec.pointValue) : 1;
          closeTrade(t.id, exit, last.time, pnl, pnl / risk);
        }
      }
    }
  }, [idx, last, open, closeTrade, spec.pointValue]);

  function place(side: "long" | "short") {
    if (!last) return;
    const stopDist = stopTicks * spec.tick;
    const tgtDist = targetTicks * spec.tick;
    const trade: Trade = {
      id: `r-${Date.now()}`,
      symbol,
      side,
      qty,
      entry: last.close,
      exit: null,
      entryTime: last.time,
      exitTime: null,
      stop: side === "long" ? last.close - stopDist : last.close + stopDist,
      target: side === "long" ? last.close + tgtDist : last.close - tgtDist,
      pnl: 0,
      fees: spec.kind === "futures" ? qty * 4.08 : 1,
      rMultiple: 0,
      setup: "ORB",
      tags: ["replay"],
      notes: `Replay ${date}`,
      source: "replay",
      playbookId: "pb-orb",
      date,
      open: true,
    };
    addTrade(trade);
  }

  const markers = [...open, ...replayClosed].map((t) => ({
    time: t.entryTime,
    position: t.side === "long" ? ("belowBar" as const) : ("aboveBar" as const),
    color: t.side === "long" ? CHART.up : CHART.down,
    shape: t.side === "long" ? ("arrowUp" as const) : ("arrowDown" as const),
    text: t.side === "long" ? "L" : "S",
  }));

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-dvh">
      <PageHead kicker="Replay" title="Session playback">
        <div className="flex flex-wrap items-center gap-2">
          <SymbolSelect value={symbol} onChange={setSymbol} />
          <NativeSelect value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </div>
      </PageHead>

      <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-h-[420px] flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <Button
              size="sm"
              variant={playing ? "secondary" : "default"}
              onClick={() => setPlaying((p) => !p)}
              disabled={idx >= bars.length}
            >
              {playing ? <Pause /> : <Play />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIdx((i) => Math.min(bars.length, i + 1))}
            >
              <StepForward /> Step
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIdx(bars.length)}>
              <SkipForward /> Close
            </Button>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`h-8 rounded-sm px-2 font-mono text-xs ${speed === s ? "bg-surface text-fg" : "text-muted"}`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="ml-auto font-mono text-xs text-muted">
              {last ? fmtTimeNy(last.time) : "—"} · {idx}/{bars.length}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CandleChart
              bars={visible}
              overlays={["volume", "vwap"]}
              lines={levelLines(session.orb, session.ib)}
              markers={markers}
              className="h-full min-h-[360px] w-full"
            />
          </div>
        </div>

        <aside className="space-y-4 p-4">
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{spec.label}</span>
              <Badge tone={sessionPnl >= 0 ? "long" : "short"}>session</Badge>
            </div>
            <div className="mt-2 font-mono text-2xl tabular-nums">
              {last ? fmtPx(last.close, spec.digits) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted">
              ORB {session.orbBreak} · IB {session.ibBreak}
            </div>
            <div className="mt-4">
              <Stat label="Replay P&L" value={<PnlText value={sessionPnl} />} />
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Ticket</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-[11px] text-subtle">
                Qty
                <Input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value) || 1)}
                  className="mt-1 h-9"
                />
              </label>
              <label className="text-[11px] text-subtle">
                Stop ticks
                <Input
                  type="number"
                  min={1}
                  value={stopTicks}
                  onChange={(e) => setStopTicks(Number(e.target.value) || 1)}
                  className="mt-1 h-9"
                />
              </label>
              <label className="text-[11px] text-subtle">
                Target ticks
                <Input
                  type="number"
                  min={1}
                  value={targetTicks}
                  onChange={(e) => setTargetTicks(Number(e.target.value) || 1)}
                  className="mt-1 h-9"
                />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="long" onClick={() => place("long")}>
                Buy
              </Button>
              <Button variant="short" onClick={() => place("short")}>
                Sell
              </Button>
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Open</h2>
            {open.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No working orders.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {open.map((t) => (
                  <li key={t.id} className="flex justify-between">
                    <span className="font-mono">
                      {t.side} {t.qty}
                    </span>
                    <PnlText
                      value={unrealized(t, last?.close ?? t.entry, spec.pointValue)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function unrealized(t: Trade, px: number, pointValue: number) {
  return (t.side === "long" ? px - t.entry : t.entry - px) * t.qty * pointValue;
}
