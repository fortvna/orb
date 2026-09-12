import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward, SlidersHorizontal, Bookmark, PanelRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CandleChart, levelLines, type TimeBand } from "@/components/candle-chart";
import { DrawToolbar } from "@/components/draw-toolbar";
import { IndicatorPanel } from "@/components/indicator-panel";
import { IndicatorChips } from "@/components/indicator-chips";
import { PnlText } from "@/components/pnl";
import { SessionChooser } from "@/components/session-chooser";
import { Panel, Stat } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import { DRAW_COLORS, drawingsForSession, sessionDrawKey, type DrawTool } from "@/lib/drawings";
import { fmtPx, fmtTimeNy } from "@/lib/format";
import { containerRange, firstExit, setupsFromPlaybook, planFromPlaybook, type PlaybookPlan } from "@/lib/market/evaluate";
import { getSession } from "@/lib/market/generate";
import { rthStartIndex } from "@/lib/market/indicators";
import {
  containerClock,
  hoursForPlaybook,
  kitLabel,
  kitOf,
  rangeLabels,
  tfMinutes,
} from "@/lib/market/playbook-kit";
import { fmtClock } from "@/lib/market/clock";
import type { IndicatorId, Playbook, RangeLevel, ReplayMode, SessionDay, Trade } from "@/lib/market/types";
import { barsOnDate, filterSessionHours, nyParts, sessionFromBars, type SessionHours } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { PROP_CHALLENGES } from "@/lib/market/seed";
import { evaluateLive, useChart, useReplayTape } from "@/lib/market/use-feed";
import { computePerformance } from "@/lib/market/stats";
import { isMockOn } from "@/lib/mock";
import { useOrb, EMPTY_DRAWINGS } from "@/lib/store";
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
const HOURS: { id: SessionHours; label: string }[] = [
  { id: "all", label: "Globex" },
  { id: "asia", label: "Asia" },
  { id: "london", label: "London" },
  { id: "nyam", label: "NY AM" },
  { id: "rth", label: "RTH" },
];
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
  const playbooks = useOrb((s) => s.playbooks);
  const navigate = Route.useNavigate();
  const [symbol, setSymbol] = useState("NQ");
  const tape = useReplayTape(symbol);
  const compareId = symbol === "NQ" ? "ES" : symbol === "ES" ? "NQ" : null;
  const compare = useChart(compareId, "5m", "5d", 60_000);
  const dates = tape.dates;
  const [date, setDate] = useState("");
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
  const [showTicket, setShowTicket] = useState(mode === "eval");
  const [pbId, setPbId] = useState(playbookId ?? "");
  const [evalNotice, setEvalNotice] = useState<string | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const [goTo, setGoTo] = useState("");
  const [pickBar, setPickBar] = useState(false);
  const [hours, setHours] = useState<SessionHours>("all");
  const [kitIds, setKitIds] = useState<IndicatorId[] | null>(null);
  const seated = useRef("");
  const appliedPb = useRef("");

  const spec = getSymbol(symbol);
  const deskIndicators = useOrb((s) => s.indicators);
  const toggleIndicator = useOrb((s) => s.toggleIndicator);
  const indicators = kitIds ?? deskIndicators;
  const addTrade = useOrb((s) => s.addTrade);
  const closeTrade = useOrb((s) => s.closeTrade);
  const saveEvaluation = useOrb((s) => s.saveEvaluation);
  const trades = useOrb((s) => s.trades);
  const propId = useOrb((s) => s.propId);

  useEffect(() => {
    if (dates.length && !dates.includes(date)) setDate(dates[0]!);
  }, [dates, date]);

  useEffect(() => {
    if (playbookId) setPbId(playbookId);
  }, [playbookId]);

  function loadPlaybook(id: string) {
    setPbId(id);
    void navigate({ search: (s) => ({ ...s, playbook: id || undefined }) });
  }

  const rawBars = useMemo(() => (date ? tape.barsFor(date, tf) : []), [tape, date, tf]);
  const bars = useMemo(() => filterSessionHours(rawBars, hours), [rawBars, hours]);
  const unfilteredSource = date ? tape.sourceFor(date, tf) : "empty";
  const nativeTf = date ? tape.nativeMinutes(date, tf) : tf;
  const hoursEmpty = Boolean(rawBars.length >= 8 && bars.length < 8 && hours !== "all");
  const tapeSource: typeof unfilteredSource = hoursEmpty ? "empty" : unfilteredSource;
  const session = useMemo(() => {
    if (date && tape.sessionFor) return tape.sessionFor(date);
    return date && isMockOn() ? getSession(symbol, date, tf) : null;
  }, [tape, date, symbol, tf]);
  const rthStart = useMemo(() => rthStartIndex(bars), [bars]);
  const compareDay = useMemo(() => {
    if (!compareId || !date || !compare.chart) return [];
    return barsOnDate(compare.chart.bars, date, compareId);
  }, [compare.chart, date, compareId]);

  const visible = bars.slice(0, Math.max(2, Math.min(idx, bars.length)));
  const last = visible[visible.length - 1];
  const playbook = playbooks.find((p) => p.id === pbId) ?? null;
  const replaySession = useMemo(() => {
    if (!date || visible.length < 4) return session;
    try {
      return sessionFromBars({
        symbol,
        date,
        bars: visible,
        prevClose: session?.prevClose ?? visible[0]!.open,
        barMinutes: tf,
      });
    } catch {
      return session;
    }
  }, [date, visible, session, symbol, tf]);
  const planSession = useMemo(() => {
    if (!date || rawBars.length < 8) return session;
    try {
      return sessionFromBars({
        symbol,
        date,
        bars: rawBars,
        prevClose: session?.prevClose ?? rawBars[0]!.open,
        barMinutes: tf,
      });
    } catch {
      return session;
    }
  }, [date, rawBars, session, symbol, tf]);
  const plan = useMemo(() => {
    if (!playbook || !planSession) return null;
    return planFromPlaybook({ ...playbook, symbol }, planSession);
  }, [playbook, planSession, symbol]);
  const planLive = Boolean(plan && last && plan.time <= last.time);
  const tapeToHead = useMemo(() => {
    if (!last) return [];
    return rawBars.filter((b) => b.time <= last.time);
  }, [rawBars, last]);
  const pbContainer = useMemo(() => {
    if (!playbook || tapeToHead.length < 1) return null;
    return containerRange(playbook, tapeToHead);
  }, [playbook, tapeToHead]);
  const pbBands = useMemo<TimeBand[]>(() => {
    if (!playbook) return [];
    const out: TimeBand[] = [];
    const clock = containerClock(playbook);
    if (clock) {
      out.push({
        startMin: clock.start,
        endMin: clock.end,
        label: rangeLabels(playbook).band,
        color: "rgba(138,106,58,0.16)",
      });
    }
    out.push({
      startMin: playbook.windowStart,
      endMin: playbook.windowEnd,
      label: "Window",
      color: "rgba(28,27,24,0.06)",
    });
    return out;
  }, [playbook]);
  const chartLines = useMemo(() => {
    if (playbook) {
      return playbookLines(playbook, pbContainer, replaySession ?? session, plan, planLive, indicators);
    }
    return replaySession ? levelLines(replaySession.orb, replaySession.ib, indicators) : [];
  }, [playbook, pbContainer, replaySession, session, plan, planLive, indicators]);

  useEffect(() => {
    if (!playbook) {
      appliedPb.current = "";
      setKitIds(null);
      return;
    }
    if (appliedPb.current === playbook.id) return;
    appliedPb.current = playbook.id;
    setSymbol(playbook.symbol || "NQ");
    setTf(tfMinutes(playbook.timeframe));
    setHours(hoursForPlaybook(playbook));
    setKitIds(kitOf(playbook));
    if (playbook.stopTicks && playbook.stopTicks > 0) {
      setStopTicks(playbook.stopTicks);
      setTargetTicks(Math.max(1, Math.round(playbook.stopTicks * playbook.targetR)));
    }
  }, [playbook]);

  const open = trades.filter(
    (t) => t.open && t.symbol === symbol && t.source === (mode === "eval" ? "prop" : "replay"),
  );
  const replayClosed = trades.filter(
    (t) =>
      !t.open &&
      t.source === (mode === "eval" ? "prop" : "replay") &&
      t.symbol === symbol &&
      t.date === date,
  );
  const sessionPnl =
    open.reduce((s, t) => s + unrealized(t, last?.close ?? t.entry, spec.pointValue), 0) +
    replayClosed.reduce((s, t) => s + t.pnl, 0);

  const challenge = PROP_CHALLENGES.find((c) => c.id === propId) ?? PROP_CHALLENGES[0]!;
  const evalPnl = sessionPnl;
  const breached = mode === "eval" && (evalPnl <= -challenge.dailyDrawdown || evalPnl <= -challenge.maxDrawdown);

  const drawKey = date ? sessionDrawKey(symbol, date) : "";
  const drawingsMap = useOrb((s) => s.drawings);
  const drawings = useMemo(
    () => (date ? drawingsForSession(drawingsMap, symbol, date) : EMPTY_DRAWINGS),
    [drawingsMap, symbol, date],
  );
  const setDrawings = useOrb((s) => s.setDrawings);

  const setupMarks = useMemo(() => {
    const day = planSession ?? session;
    if (!playbook || !day || !last) return [];
    return setupsFromPlaybook({ ...playbook, symbol }, day).filter((s) => s.time <= last.time);
  }, [playbook, planSession, session, symbol, last]);

  useEffect(() => {
    if (!bars.length) return;
    const key = `${symbol}:${date}:${tf}:${hours}:${pbId}:${bars.length > 20 ? "ready" : "wait"}`;
    if (seated.current === key) return;
    const windowIdx = playbook
      ? bars.findIndex((b) => nyParts(b.time).minutes >= playbook.windowStart)
      : -1;
    const start =
      windowIdx >= 0 ? Math.max(1, windowIdx) : rthStart >= 0 ? rthStart : 0;
    setIdx(Math.max(1, Math.min(bars.length, start || 1)));
    setPlaying(false);
    if (bars.length > 8) seated.current = key;
  }, [symbol, date, tf, hours, pbId, rthStart, bars.length, playbook]);

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
    if (playing && bars.length > 0 && idx >= bars.length) setPlaying(false);
  }, [playing, idx, bars.length]);

  useEffect(() => {
    if (!last) return;
    for (const t of open) {
      if (!t.open) continue;
      const entryIdx = visible.findIndex((b) => b.time >= t.entryTime);
      if (entryIdx < 0) continue;
      const hit = firstExit(visible, entryIdx, t.side, t.stop, t.target);
      if (!hit) continue;
      const pnl = (t.side === "long" ? hit.exit - t.entry : t.entry - hit.exit) * t.qty * spec.pointValue;
      const risk = t.stop ? Math.abs((t.stop - t.entry) * t.qty * spec.pointValue) || 1 : 1;
      closeTrade(t.id, hit.exit, hit.time, pnl, pnl / risk);
    }
  }, [idx, last, open, closeTrade, spec.pointValue, visible]);

  function fillSource(): Trade["source"] {
    return mode === "eval" ? "prop" : "replay";
  }

  function place(side: "long" | "short") {
    if (!last || breached) return;
    const stopDist = stopTicks * spec.tick;
    const tgtDist = targetTicks * spec.tick;
    const src = fillSource();
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
      setup: playbook?.setup ?? (mode === "eval" ? "Prop" : "Replay"),
      tags: [src, playbook?.kind ?? "manual"],
      notes: `${mode === "eval" ? `Prop ${challenge.name}` : "Replay"} ${date}${playbook ? ` · ${playbook.name}` : ""}`,
      source: src,
      playbookId: playbook?.id ?? null,
      date,
      open: true,
    };
    addTrade(trade);
  }

  function takePlan() {
    if (!last || !plan || !planLive || breached) return;
    const src = fillSource();
    const trade: Trade = {
      id: `r-${Date.now()}`,
      symbol,
      side: plan.side,
      qty,
      entry: plan.entry,
      exit: null,
      entryTime: plan.time,
      exitTime: null,
      stop: plan.stop,
      target: plan.target,
      pnl: 0,
      fees: spec.kind === "futures" ? qty * 4.08 : 1,
      rMultiple: 0,
      setup: playbook?.setup ?? (mode === "eval" ? "Prop" : "Replay"),
      tags: [src, playbook?.kind ?? "playbook"],
      notes: `${mode === "eval" ? `Prop ${challenge.name}` : "Playbook"} ${playbook?.name ?? ""} · ${date}`,
      source: src,
      playbookId: playbook?.id ?? null,
      date,
      open: true,
    };
    addTrade(trade);
  }

  function flatten() {
    if (!last || breached) return;
    for (const t of open) {
      const pnl = unrealized(t, last.close, spec.pointValue);
      const risk = t.stop ? Math.abs((t.stop - t.entry) * t.qty * spec.pointValue) || 1 : 1;
      closeTrade(t.id, last.close, last.time, pnl, pnl / risk);
    }
  }

  function seatAtWindow() {
    const windowIdx = playbook
      ? bars.findIndex((b) => nyParts(b.time).minutes >= playbook.windowStart)
      : -1;
    const start = windowIdx >= 0 ? Math.max(1, windowIdx) : rthStart >= 0 ? rthStart : 1;
    setPlaying(false);
    setIdx(Math.max(1, Math.min(bars.length, start)));
  }

  const alreadyTaken = Boolean(
    playbook &&
      trades.some(
        (t) =>
          t.playbookId === playbook.id &&
          t.date === date &&
          (t.source === "replay" || t.source === "prop"),
      ),
  );

  const keysRef = useRef({ takePlan, flatten, seatAtWindow, n: bars.length });
  keysRef.current = { takePlan, flatten, seatAtWindow, n: bars.length };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) {
        return;
      }
      const a = keysRef.current;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((i) => Math.min(a.n, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setIdx((i) => Math.max(1, i - 1));
      } else if (e.key === "End") {
        e.preventDefault();
        setIdx(a.n);
      } else if (e.key === "Home") {
        e.preventDefault();
        a.seatAtWindow();
      } else if ((e.key === "t" || e.key === "T") && !e.metaKey && !e.ctrlKey) {
        a.takePlan();
      } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        a.flatten();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function scoreSession() {
    if (!playbook) return;
    const fills = replayClosed.filter((t) => t.playbookId === playbook.id);
    if (!fills.length) {
      setEvalNotice(
        `No fills on ${playbook.name} this session. Take the setup or place a ticket first — this scores your fills, not the 40-day engine.`,
      );
      return;
    }
    const perf = computePerformance(fills);
    setEvalNotice(
      `${playbook.name} · ${date}: ${perf.trades} of your fills · WR ${Math.round(perf.winRate * 100)}% · net ${Math.round(perf.net)} · avg ${perf.avgR.toFixed(2)}R. Session you sat — not the 40-day engine.`,
    );
  }

  async function runEvaluate(pb: Playbook) {
    setEvalBusy(true);
    try {
      const { evaluation, live } = await evaluateLive({ ...pb, symbol: pb.symbol || symbol }, 40);
      saveEvaluation(evaluation);
      const n = evaluation.summary.sessions;
      const cap =
        n > 0 && n < 40
          ? ` Yahoo 5m history returned ${n} sessions (requested 40; tape is capped around 60 Globex days).`
          : n >= 40
            ? " Yahoo 5m history."
            : "";
      setEvalNotice(
        evaluation.summary.source === "empty" || !evaluation.summary.sessions
          ? "No live 5m sessions in this window. Wait for the tape, or turn on Model tape for today in Settings."
          : `${pb.name}: ${evaluation.summary.trades} fills over ${n} ${live ? "live" : "model"} sessions · WR ${Math.round(evaluation.summary.winRate * 100)}% · PF ${evaluation.summary.profitFactor.toFixed(2)}. Engine backtest — not your fills.${cap}`,
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
    <div className="flex h-[calc(100dvh-3.5rem-5rem)] flex-col overflow-hidden lg:h-dvh">
      {showInd ? (
        <IndicatorPanel
          active={indicators}
          onToggle={(id) => {
            if (kitIds) {
              setKitIds(kitIds.includes(id) ? kitIds.filter((x) => x !== id) : [...kitIds, id]);
              return;
            }
            toggleIndicator(id);
          }}
          onClose={() => setShowInd(false)}
        />
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-3 py-1.5">
        <Link to="/app/replay" className="text-[11px] uppercase tracking-[0.14em] text-subtle hover:text-fg">
          Sessions
        </Link>
        <Badge tone={mode === "eval" ? "warn" : "muted"}>{mode === "eval" ? "Evaluation" : "Free play"}</Badge>
        <Badge
          tone={tapeSource === "live" ? "long" : tapeSource === "model" ? "warn" : "muted"}
        >
          {hoursEmpty
            ? `No bars in ${HOURS.find((h) => h.id === hours)?.label ?? hours}`
            : tapeSource === "live"
              ? "Live history"
              : tapeSource === "model"
                ? "Model tape"
                : tape.loading
                  ? "Loading tape"
                  : "No tape"}
        </Badge>
        {tape.yahoo && tape.yahoo !== spec.yahoo ? (
          <Badge tone="warn" title={`Same-index fallback — ${spec.label} via ${tape.yahoo}`}>
            via {tape.yahoo}
          </Badge>
        ) : null}
        {nativeTf !== tf && tapeSource === "live" ? (
          <Badge tone="warn" title="Yahoo 1m only covers about 5 Globex days. Older sessions stay on 5m.">
            Yahoo {nativeTf}m floor
          </Badge>
        ) : null}
        <SymbolSelect value={symbol} onChange={setSymbol} />
        <NativeSelect value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[11rem]">
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={pbId} onChange={(e) => loadPlaybook(e.target.value)} className="max-w-[14rem]">
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
        <div className="mx-1 hidden h-4 w-px bg-border sm:block" />
        {HOURS.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHours(h.id)}
            className={cn(
              "h-8 rounded-sm px-2 font-mono text-[11px]",
              hours === h.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {h.label}
          </button>
        ))}
        <form
          className="hidden items-center gap-1 sm:flex"
          onSubmit={(e) => {
            e.preventDefault();
            const m = goTo.trim().match(/^(\d{1,2}):?(\d{2})$/);
            if (!m) return;
            const minutes = Number(m[1]) * 60 + Number(m[2]);
            const i = bars.findIndex((b) => nyParts(b.time).minutes >= minutes);
            if (i >= 0) {
              setPlaying(false);
              setIdx(i + 1);
            }
          }}
        >
          <Input
            value={goTo}
            onChange={(e) => setGoTo(e.target.value)}
            placeholder="Go to 09:30"
            className="h-8 w-28"
            aria-label="Go to time"
          />
        </form>
        {playbook ? (
          <>
            <Button size="sm" variant="ghost" onClick={scoreSession}>
              Score session
            </Button>
            <Button size="sm" variant="secondary" disabled={evalBusy} onClick={() => void runEvaluate(playbook)}>
              {evalBusy ? "Evaluating…" : "Evaluate book"}
            </Button>
          </>
        ) : null}
        <span className="ml-auto font-mono text-sm tabular-nums">
          {last ? fmtPx(last.close, spec.digits) : "—"}
        </span>
        <Button size="sm" variant={showTicket ? "secondary" : "ghost"} onClick={() => setShowTicket((v) => !v)}>
          <PanelRight /> Trade
        </Button>
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

      <div className="relative flex min-h-0 flex-1">
        <DrawToolbar
          vertical
          tool={tool}
          color={color}
          onTool={setTool}
          onColor={setColor}
          onClear={() => {
            if (drawKey) setDrawings(drawKey, []);
          }}
          count={drawings.length}
        />
        <div className="relative min-h-0 min-w-0 flex-1" style={{ background: CHART.bg }}>
          {tape.loading && visible.length < 8 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center">
                <div className="font-display text-2xl text-fg">Loading live tape</div>
                <p className="mt-2 text-sm text-muted">Pulling Yahoo Globex history for {spec.label}…</p>
              </div>
            </div>
          ) : null}
          <CandleChart
            bars={visible}
            indicators={indicators}
            session={replaySession ?? session}
            lines={chartLines}
            bands={pbBands}
            markers={markers}
            drawings={drawings}
            tool={tool}
            color={color}
            compareBars={indicators.includes("smt") ? compareDay : []}
            onBarClick={
              pickBar
                ? (i) => {
                    setPlaying(false);
                    setIdx(i + 1);
                  }
                : undefined
            }
            onDrawingsChange={(next) => {
              if (drawKey) setDrawings(drawKey, next);
            }}
            watermark={`${nativeTf === 60 ? "1H" : nativeTf === 240 ? "4H" : `${nativeTf}m`}${nativeTf !== tf ? ` · asked ${tf}m` : ""}`}
            lastPrice={last?.close}
            className="absolute inset-0 h-full w-full"
          />
          {playbook ? (
            <PlaybookOverlay
              playbook={playbook}
              spec={spec}
              hours={HOURS.find((h) => h.id === hoursForPlaybook(playbook))?.label ?? hoursForPlaybook(playbook)}
              container={pbContainer}
              plan={planLive ? plan : null}
              lastMinutes={last ? nyParts(last.time).minutes : null}
              alreadyTaken={alreadyTaken}
              breached={breached}
              onTake={takePlan}
            />
          ) : null}
          <IndicatorChips
            active={indicators}
            ids={kitIds ?? undefined}
            onToggle={(id) => {
              if (kitIds) {
                setKitIds(kitIds.includes(id) ? kitIds.filter((x) => x !== id) : [...kitIds, id]);
                return;
              }
              toggleIndicator(id);
            }}
          />
        </div>

        {showTicket ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-72 space-y-3 overflow-y-auto border-l border-border bg-bg-elevated p-3 shadow-soft lg:static lg:z-0">
            {mode === "eval" ? (
              <Panel className="p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Evaluation rules</div>
                <div className="mt-2 font-mono text-lg">
                  <PnlText value={evalPnl} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {challenge.name} · target {challenge.profitTarget} · daily −{challenge.dailyDrawdown} · max DD{" "}
                  {challenge.maxDrawdown}. Fills land as source “prop”.
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
                <p className="mt-1 text-[11px] font-mono text-muted">
                  {playbook.symbol} · {playbook.timeframe} · {fmtClock(playbook.windowStart)}–
                  {fmtClock(playbook.windowEnd)} ET · {playbook.targetR}R
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{playbook.thesis}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {kitOf(playbook).map((id) => (
                    <span key={id} className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
                      {kitLabel(id)}
                    </span>
                  ))}
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-fg">
                  {playbook.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                {playbook.invalidation ? (
                  <p className="mt-2 text-[11px] text-subtle">Invalidation: {playbook.invalidation}</p>
                ) : null}
                {pbContainer && pbContainer.size > 0 ? (
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{rangeLabels(playbook).high}</dt>
                      <dd className="font-mono">{fmtPx(pbContainer.high, spec.digits)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">{rangeLabels(playbook).low}</dt>
                      <dd className="font-mono">{fmtPx(pbContainer.low, spec.digits)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-muted">Range maps while you play through the container.</p>
                )}
                {planLive && plan ? (
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Entry</dt>
                      <dd className="font-mono">{fmtPx(plan.entry, spec.digits)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Stop</dt>
                      <dd className="font-mono">{fmtPx(plan.stop, spec.digits)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Target</dt>
                      <dd className="font-mono">{fmtPx(plan.target, spec.digits)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-muted">Entry / SL / TP print on the first valid trigger.</p>
                )}
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
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 w-full"
                disabled={!open.length || breached}
                onClick={flatten}
              >
                Flatten {open.length ? `(${open.length})` : ""}
              </Button>
              <p className="mt-2 text-[11px] text-subtle">
                Space play · ← → step · Home window · End latest · T take · F flatten. Futures fees $4.08 RT/contract
                estimate — not an exchange invoice.
              </p>
            </Panel>
          </aside>
        ) : null}
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
          variant={pickBar ? "secondary" : "ghost"}
          onClick={() => setPickBar((v) => !v)}
        >
          Select bar
        </Button>
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={() => setPlaying((p) => !p)}
          disabled={idx >= bars.length || breached}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setIdx((i) => Math.max(1, i - 1)); }}>
          <StepBack />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIdx((i) => Math.min(bars.length, i + 1))}>
          <StepForward />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setIdx(bars.length)}>
          <SkipForward /> To latest
        </Button>
        <Button size="sm" variant="ghost" onClick={seatAtWindow}>
          <SkipBack /> Window
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setHours("rth");
            setIdx(Math.max(1, rthStart >= 0 ? rthStart : 1));
          }}
        >
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
          value={Math.min(idx, Math.max(9, bars.length))}
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

function sameRange(a: RangeLevel, b: RangeLevel) {
  return Math.abs(a.high - b.high) < 1e-6 && Math.abs(a.low - b.low) < 1e-6;
}

function playbookLines(
  playbook: Playbook,
  container: RangeLevel | null,
  session: SessionDay | null,
  plan: PlaybookPlan | null,
  planLive: boolean,
  kit: IndicatorId[],
) {
  const out: { price: number; color: string; title: string; solid?: boolean }[] = [];
  const labels = rangeLabels(playbook);
  if (container && container.size > 0) {
    const color = playbook.kind === "ib" || playbook.kind === "vwap" ? CHART.ib : CHART.orb;
    out.push({ price: container.high, color, title: labels.high });
    out.push({ price: container.low, color, title: labels.low });
  }
  if (session && session.orb.size > 0 && (kit.includes("orH") || kit.includes("orL"))) {
    if (!container || !sameRange(session.orb, container)) {
      if (kit.includes("orH")) out.push({ price: session.orb.high, color: CHART.orb, title: "OR H" });
      if (kit.includes("orL")) out.push({ price: session.orb.low, color: CHART.orb, title: "OR L" });
    }
  }
  if (session && session.ib.size > 0 && (kit.includes("ibH") || kit.includes("ibL"))) {
    if (!container || !sameRange(session.ib, container)) {
      if (kit.includes("ibH")) out.push({ price: session.ib.high, color: CHART.ib, title: "IB H" });
      if (kit.includes("ibL")) out.push({ price: session.ib.low, color: CHART.ib, title: "IB L" });
    }
  }
  if (playbook.kind === "gap" && session) {
    out.push({ price: session.prevClose, color: CHART.target, title: "Prior close" });
    out.push({ price: session.open, color: CHART.entry, title: "Open" });
  }
  if (planLive && plan) {
    out.push({ price: plan.entry, color: CHART.entry, title: "Entry", solid: true });
    out.push({ price: plan.stop, color: CHART.stop, title: "SL", solid: true });
    out.push({ price: plan.target, color: CHART.target, title: "TP", solid: true });
  }
  return out;
}

function PlaybookOverlay({
  playbook,
  spec,
  hours,
  container,
  plan,
  lastMinutes,
  alreadyTaken,
  breached,
  onTake,
}: {
  playbook: Playbook;
  spec: ReturnType<typeof getSymbol>;
  hours: string;
  container: RangeLevel | null;
  plan: PlaybookPlan | null;
  lastMinutes: number | null;
  alreadyTaken: boolean;
  breached: boolean;
  onTake: () => void;
}) {
  const labels = rangeLabels(playbook);
  const inWindow =
    lastMinutes != null && lastMinutes >= playbook.windowStart && lastMinutes < playbook.windowEnd;
  const afterWindow = lastMinutes != null && lastMinutes >= playbook.windowEnd;
  return (
    <div className="pointer-events-auto absolute left-14 right-3 top-2 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-bg/92 px-3 py-1.5 text-xs shadow-soft">
      <span className="truncate font-medium text-fg">{playbook.name}</span>
      <span className="font-mono text-[11px] text-muted">
        {playbook.symbol} · {playbook.timeframe} · {hours} · {fmtClock(playbook.windowStart)}–
        {fmtClock(playbook.windowEnd)}
      </span>
      {container && container.size > 0 ? (
        <span className="font-mono text-[11px] text-muted">
          {labels.high} {fmtPx(container.high, spec.digits)} · {labels.low} {fmtPx(container.low, spec.digits)}
        </span>
      ) : null}
      {plan ? (
        <>
          <span className={plan.side === "long" ? "text-long" : "text-short"}>
            {plan.side} {fmtPx(plan.entry, spec.digits)}
          </span>
          <span className="font-mono text-muted">SL {fmtPx(plan.stop, spec.digits)}</span>
          <span className="font-mono text-muted">TP {fmtPx(plan.target, spec.digits)}</span>
          <Button size="sm" disabled={breached || alreadyTaken} onClick={onTake}>
            {alreadyTaken ? "Taken" : "Take setup"}
          </Button>
        </>
      ) : afterWindow ? (
        <span className="text-muted">No fill this session — double break or no single-side trigger.</span>
      ) : inWindow ? (
        <span className="text-muted">In the window — waiting on the first single-side break.</span>
      ) : (
        <span className="text-muted">Waiting for the trigger — play into the window.</span>
      )}
    </div>
  );
}
