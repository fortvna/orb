import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, SkipForward, StepForward, SlidersHorizontal, Bookmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CandleChart, levelLines } from "@/components/candle-chart";
import { DrawToolbar } from "@/components/draw-toolbar";
import { IndicatorPanel } from "@/components/indicator-panel";
import { PnlText } from "@/components/pnl";
import { SessionChooser } from "@/components/session-chooser";
import { Panel, Stat } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import { DRAW_COLORS, type DrawTool } from "@/lib/drawings";
import { fmtPx, fmtTimeNy } from "@/lib/format";
import { listTradingDays } from "@/lib/market/calendar";
import { setupsFromPlaybook } from "@/lib/market/evaluate";
import { getSession } from "@/lib/market/generate";
import { nyParts } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { PROP_CHALLENGES } from "@/lib/market/seed";
import { evaluateLive, useReplayTape } from "@/lib/market/use-feed";
import { useOrb, EMPTY_DRAWINGS } from "@/lib/store";
import type { Playbook, ReplayMode, Trade } from "@/lib/market/types";
import { cn } from "@/lib/utils";

type Search = { mode?: ReplayMode; playbook?: string };

export const Route = createFileRoute("/app/replay")({
  component: ReplayPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "eval" || s.mode === "free" ? s.mode : undefined,
    playbook: typeof s.playbook === "string" ? s.playbook : undefined,
  }),
});

const SPEEDS = [1, 2, 4, 8, 16];
const TFS = [
  { id: 1, label: "1m" },
  { id: 3, label: "3m" },
  { id: 5, label: "5m" },
  { id: 15, label: "15m" },
  { id: 30, label: "30m" },
  { id: 60, label: "1H" },
  { id: 240, label: "4H" },
] as const;

function ReplayPage() {
  const search = Route.useSearch();
  if (!search.mode) return <SessionChooser />;
  return <ReplayWorkspace mode={search.mode} playbookId={search.playbook} />;
}

function ReplayWorkspace({ mode, playbookId }: { mode: ReplayMode; playbookId?: string }) {
  const fallbackDates = useMemo(() => listTradingDays(40), []);
  const playbooks = useOrb((s) => s.playbooks);
  const [symbol, setSymbol] = useState("NQ");
  const tape = useReplayTape(symbol);
  const dates = tape.dates.length ? tape.dates : fallbackDates;
  const [date, setDate] = useState(dates[0] ?? "");
  const [tf, setTf] = useState(5);
  const [idx, setIdx] = useState(40);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [qty, setQty] = useState(1);
  const [stopTicks, setStopTicks] = useState(16);
  const [targetTicks, setTargetTicks] = useState(24);
  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<string>(DRAW_COLORS[0]!);
  const [showInd, setShowInd] = useState(false);
  const [pbId, setPbId] = useState(playbookId ?? playbooks[0]?.id ?? "");
  const [evalNotice, setEvalNotice] = useState<string | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);

  const spec = getSymbol(symbol);
  const indicators = useOrb((s) => s.indicators);
  const toggleIndicator = useOrb((s) => s.toggleIndicator);
  const addTrade = useOrb((s) => s.addTrade);
  const closeTrade = useOrb((s) => s.closeTrade);
  const saveEvaluation = useOrb((s) => s.saveEvaluation);
  const trades = useOrb((s) => s.trades);
  const propId = useOrb((s) => s.propId);

  useEffect(() => {
    if (dates.length && !dates.includes(date)) setDate(dates[0]!);
  }, [dates, date]);

  const bars = useMemo(() => (date ? tape.barsFor(date, tf) : []), [tape, date, tf]);
  const session = useMemo(() => {
    if (date && tape.sessionFor) return tape.sessionFor(date);
    return date ? getSession(symbol, date, tf) : null;
  }, [tape, date, symbol, tf]);
  const rthStart = useMemo(() => {
    const i = bars.findIndex((b) => nyParts(b.time).minutes >= 9 * 60 + 30);
    return i < 0 ? Math.min(12, Math.max(2, bars.length - 1)) : i;
  }, [bars]);

  const visible = bars.slice(0, Math.max(2, Math.min(idx, bars.length)));
  const last = visible[visible.length - 1];
  const playbook = playbooks.find((p) => p.id === pbId) ?? null;

  const open = trades.filter((t) => t.open && t.symbol === symbol && t.source === "replay");
  const replayClosed = trades.filter(
    (t) => !t.open && t.source === "replay" && t.symbol === symbol && t.date === date,
  );
  const sessionPnl =
    open.reduce((s, t) => s + unrealized(t, last?.close ?? t.entry, spec.pointValue), 0) +
    replayClosed.reduce((s, t) => s + t.pnl, 0);

  const challenge = PROP_CHALLENGES.find((c) => c.id === propId) ?? PROP_CHALLENGES[0]!;
  const evalPnl = sessionPnl;
  const breached = mode === "eval" && (evalPnl <= -challenge.dailyDrawdown || evalPnl <= -challenge.maxDrawdown);

  const drawKey = `replay:${symbol}:${date}:${tf}`;
  const drawings = useOrb((s) => s.drawings[drawKey] ?? EMPTY_DRAWINGS);
  const setDrawings = useOrb((s) => s.setDrawings);

  const setupMarks = useMemo(() => {
    if (!playbook || !session) return [];
    return setupsFromPlaybook({ ...playbook, symbol }, session);
  }, [playbook, session, symbol]);

  useEffect(() => {
    setIdx(Math.max(8, rthStart));
    setPlaying(false);
  }, [symbol, date, tf, rthStart]);

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
        const hit = t.side === "long" ? last.low <= t.stop : last.high >= t.stop;
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
    if (!last || breached) return;
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
      setup: playbook?.setup ?? "Replay",
      tags: ["replay", playbook?.kind ?? "manual"],
      notes: `Replay ${date}${playbook ? ` · ${playbook.name}` : ""}`,
      source: "replay",
      playbookId: playbook?.id ?? null,
      date,
      open: true,
    };
    addTrade(trade);
  }

  async function runEvaluate(pb: Playbook) {
    setEvalBusy(true);
    try {
      const { evaluation, live } = await evaluateLive({ ...pb, symbol: pb.symbol || symbol }, 40);
      saveEvaluation(evaluation);
      setEvalNotice(
        `${pb.name}: ${evaluation.summary.trades} fills over ${evaluation.summary.sessions} ${live ? "live" : "model"} sessions · WR ${Math.round(evaluation.summary.winRate * 100)}% · PF ${evaluation.summary.profitFactor.toFixed(2)}`,
      );
    } catch {
      setEvalNotice("Could not evaluate on the live tape.");
    } finally {
      setEvalBusy(false);
    }
  }

  const markers = [
    ...[...open, ...replayClosed].map((t) => ({
      time: t.entryTime,
      position: t.side === "long" ? ("belowBar" as const) : ("aboveBar" as const),
      color: t.side === "long" ? CHART.up : CHART.down,
      shape: t.side === "long" ? ("arrowUp" as const) : ("arrowDown" as const),
      text: t.side === "long" ? "L" : "S",
    })),
    ...setupMarks.map((s) => ({
      time: s.time,
      position: s.side === "long" ? ("belowBar" as const) : ("aboveBar" as const),
      color: CHART.orb,
      shape: s.side === "long" ? ("arrowUp" as const) : ("arrowDown" as const),
      text: "PB",
    })),
  ];

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col overflow-hidden lg:h-dvh">
      {showInd ? (
        <IndicatorPanel active={indicators} onToggle={toggleIndicator} onClose={() => setShowInd(false)} />
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Link to="/app/replay" className="text-[11px] uppercase tracking-[0.14em] text-subtle hover:text-fg">
          Sessions
        </Link>
        <Badge tone={mode === "eval" ? "warn" : "muted"}>{mode === "eval" ? "Evaluation" : "Free play"}</Badge>
        <Badge tone={tape.live ? "long" : "muted"}>{tape.live ? "Live history" : tape.loading ? "Loading tape" : "Model"}</Badge>
        <SymbolSelect value={symbol} onChange={setSymbol} />
        <NativeSelect value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[11rem]">
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={pbId} onChange={(e) => setPbId(e.target.value)} className="max-w-[14rem]">
          <option value="">Manual</option>
          {playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Button size="sm" variant="ghost" onClick={() => setShowInd(true)}>
          <SlidersHorizontal /> Indicators
        </Button>
        {playbook ? (
          <Button size="sm" variant="secondary" disabled={evalBusy} onClick={() => void runEvaluate(playbook)}>
            {evalBusy ? "Evaluating…" : "Evaluate playbook"}
          </Button>
        ) : null}
        <span className="ml-auto font-mono text-sm tabular-nums">
          {last ? fmtPx(last.close, spec.digits) : "—"}
        </span>
      </div>

      {evalNotice ? (
        <div className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted">
          {evalNotice}{" "}
          <Link to="/app/reports" className="text-fg underline-offset-2 hover:underline">
            Open reports
          </Link>
          {" · "}
          <Link to="/app/analytics" className="text-fg underline-offset-2 hover:underline">
            Analytics
          </Link>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DrawToolbar
          vertical
          tool={tool}
          color={color}
          onTool={setTool}
          onColor={setColor}
          onClear={() => setDrawings(drawKey, [])}
          count={drawings.length}
        />
        <div className="relative min-h-0 min-w-0 flex-1">
          <CandleChart
            bars={visible}
            indicators={indicators}
            session={session}
            lines={session ? levelLines(session.orb, session.ib) : []}
            markers={markers}
            drawings={drawings}
            tool={tool}
            color={color}
            onDrawingsChange={(next) => setDrawings(drawKey, next)}
            watermark={`${tf === 60 ? "1H" : tf === 240 ? "4H" : `${tf}m`}`}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <aside className="hidden w-72 shrink-0 space-y-3 overflow-y-auto border-l border-border p-3 lg:block">
          {mode === "eval" ? (
            <Panel className="p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Evaluation rules</div>
              <div className="mt-2 font-mono text-lg">
                <PnlText value={evalPnl} />
              </div>
              <p className="mt-1 text-xs text-muted">
                Target {challenge.profitTarget} · daily −{challenge.dailyDrawdown} · max DD {challenge.maxDrawdown}
              </p>
              {breached ? <p className="mt-2 text-xs text-short">Rule breached — session locked.</p> : null}
            </Panel>
          ) : null}

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{spec.label}</span>
              <Badge tone={sessionPnl >= 0 ? "long" : "short"}>session</Badge>
            </div>
            <div className="mt-2 font-mono text-2xl tabular-nums">
              {last ? fmtPx(last.close, spec.digits) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted">
              OR {session?.orbBreak ?? "—"} · IB {session?.ibBreak ?? "—"}
            </div>
            <div className="mt-3">
              <Stat label="Replay P&L" value={<PnlText value={sessionPnl} />} />
            </div>
          </Panel>

          {playbook ? (
            <Panel className="p-4">
              <h2 className="text-sm font-medium">{playbook.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">{playbook.thesis}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-fg">
                {playbook.rules.slice(0, 4).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              {playbook.evaluation ? (
                <p className="mt-2 text-xs text-muted">
                  Last eval {Math.round(playbook.evaluation.winRate * 100)}% WR · {playbook.evaluation.trades} fills
                </p>
              ) : null}
            </Panel>
          ) : null}

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
                Stop
                <Input
                  type="number"
                  min={1}
                  value={stopTicks}
                  onChange={(e) => setStopTicks(Number(e.target.value) || 1)}
                  className="mt-1 h-9"
                />
              </label>
              <label className="text-[11px] text-subtle">
                Target
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
              <Button variant="long" disabled={breached} onClick={() => place("long")}>
                Buy
              </Button>
              <Button variant="short" disabled={breached} onClick={() => place("short")}>
                Sell
              </Button>
            </div>
          </Panel>
        </aside>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-border bg-bg-elevated px-3 py-1.5">
        {TFS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTf(t.id)}
            className={cn(
              "h-8 rounded-sm px-2 font-mono text-xs",
              tf === t.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={() => setPlaying((p) => !p)}
          disabled={idx >= bars.length || breached}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIdx((i) => Math.min(bars.length, i + 1))}>
          <StepForward />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIdx(bars.length)}>
          <SkipForward /> To latest
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIdx(Math.max(8, rthStart))}>
          RTH
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMarks((m) => (m.includes(idx) ? m : [...m, idx]))}
        >
          <Bookmark />
        </Button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={cn(
              "h-8 rounded-sm px-2 font-mono text-xs",
              speed === s ? "bg-surface text-fg" : "text-muted",
            )}
          >
            {s}×
          </button>
        ))}
        <input
          type="range"
          min={8}
          max={Math.max(9, bars.length)}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
          className="mx-2 hidden h-8 w-40 accent-steel md:block"
          aria-label="Scrub bars"
        />
        {marks.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setIdx(m)}
            className="h-8 rounded-sm px-2 font-mono text-[10px] text-muted hover:text-fg"
          >
            {m}
          </button>
        ))}
        <div className="ml-auto font-mono text-xs text-muted">
          {last ? fmtTimeNy(last.time) : "—"} · {idx}/{bars.length} ET
        </div>
      </div>
    </div>
  );
}

function unrealized(t: Trade, px: number, pointValue: number) {
  return (t.side === "long" ? px - t.entry : t.entry - px) * t.qty * pointValue;
}
