import { useEffect, useMemo, useRef, useState } from "react";
import { CHART } from "@/lib/chart-theme";
import {
  DRAW_COLORS,
  FIB_LEVELS,
  drawingId,
  needsSecondPoint,
  type Drawing,
  type DrawPoint,
  type DrawTool,
} from "@/lib/drawings";
import { buildChartModel, KILLZONES, type ChartModel } from "@/lib/market/indicators";
import { nyParts } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { cn } from "@/lib/utils";
import type { Bar, IndicatorId, RangeLevel, SessionDay } from "@/lib/market/types";

export type ChartOverlay = "vwap" | "ema" | "volume" | "delta";

export type PriceGuide = { price: number; color: string; title: string; solid?: boolean };

export type TimeBand = {
  startMin: number;
  endMin: number;
  label: string;
  color?: string;
};

export type ChartMarker = {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text?: string;
};

type Geom = {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  plotW: number;
  plotH: number;
  lo: number;
  hi: number;
  from: number;
  to: number;
  xAt: (i: number) => number;
  yAt: (px: number) => number;
  indexAt: (x: number) => number;
  priceAt: (y: number) => number;
  rsiTop: number;
  rsiH: number;
  volTop: number;
  volH: number;
  timeH: number;
};

type View = {
  from: number;
  to: number;
  lo: number | null;
  hi: number | null;
  follow: boolean;
};

type Drag =
  | {
      kind: "pan";
      x: number;
      y: number;
      from: number;
      to: number;
      lo: number;
      hi: number;
      moved: boolean;
    }
  | { kind: "price"; y: number; lo: number; hi: number; anchor: number }
  | { kind: "time"; x: number; from: number; to: number; anchor: number };

const TIME_H = 28;
const PRICE_W = 70;
const MIN_BARS = 12;

export function CandleChart({
  bars,
  overlays = ["volume"],
  indicators,
  session = null,
  lines = [],
  markers = [],
  drawings = [],
  tool = "select",
  color = DRAW_COLORS[0],
  onDrawingsChange,
  watermark,
  compareBars,
  onBarClick,
  lastPrice,
  bands = [],
  className,
}: {
  bars: Bar[];
  overlays?: ChartOverlay[];
  indicators?: IndicatorId[];
  session?: SessionDay | null;
  lines?: PriceGuide[];
  markers?: ChartMarker[];
  drawings?: Drawing[];
  tool?: DrawTool;
  color?: string;
  onDrawingsChange?: (next: Drawing[]) => void;
  watermark?: string;
  compareBars?: Bar[];
  onBarClick?: (index: number) => void;
  lastPrice?: number;
  bands?: TimeBand[];
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const geomRef = useRef<Geom | null>(null);
  const hoverRef = useRef<{ i: number; x: number; y: number } | null>(null);
  const viewRef = useRef<View>({ from: 0, to: 0, lo: null, hi: null, follow: true });
  const dragRef = useRef<Drag | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; width: number; anchor: number } | null>(null);
  const barsRef = useRef(bars);
  barsRef.current = bars;
  const [draft, setDraft] = useState<{ tool: DrawTool; a: DrawPoint; b?: DrawPoint } | null>(null);
  const interactive = Boolean(onDrawingsChange) && tool !== "select";
  const ids = useMemo<IndicatorId[]>(() => {
    if (indicators) return indicators;
    const out: IndicatorId[] = [];
    if (overlays.includes("volume")) out.push("volume");
    if (overlays.includes("vwap")) out.push("vwap");
    if (overlays.includes("ema")) out.push("ema");
    return out;
  }, [indicators, overlays]);
  const tick = getSymbol(session?.symbol ?? "ES").tick;
  const model = useMemo(
    () => buildChartModel(bars, session, tick, compareBars),
    [bars, session, tick, compareBars],
  );

  const sessionKey = bars[0]?.time ?? 0;
  useEffect(() => {
    viewRef.current = { from: 0, to: barsRef.current.length, lo: null, hi: null, follow: true };
  }, [sessionKey]);

  useEffect(() => {
    const n = bars.length;
    const v = viewRef.current;
    if (n < 2) return;
    if (v.follow || v.to <= 0) {
      const width = Math.max(MIN_BARS, v.to > v.from ? v.to - v.from : n);
      v.to = n + Math.min(4, width * 0.04);
      v.from = Math.max(0, v.to - width);
    } else {
      const width = Math.max(MIN_BARS, v.to - v.from);
      v.to = Math.min(v.to, n + width * 0.15);
      v.from = Math.max(0, Math.min(v.from, n - MIN_BARS));
    }
  }, [bars.length]);

  const argsRef = useRef({ bars, ids, lines, markers, drawings, draft, model, session, watermark, lastPrice, bands });
  argsRef.current = { bars, ids, lines, markers, drawings, draft, model, session, watermark, lastPrice, bands };

  const paintNow = () => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 8 || h < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.floor(w * dpr);
    const ch = Math.floor(h * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const a = argsRef.current;
    geomRef.current = paint(
      ctx,
      w,
      h,
      a.bars,
      a.ids,
      a.lines,
      a.markers,
      a.drawings,
      a.draft,
      a.model,
      a.session,
      a.watermark,
      hoverRef.current,
      viewRef.current,
      a.lastPrice,
      a.bands,
    );
  };
  const paintRef = useRef(paintNow);
  paintRef.current = paintNow;

  useEffect(() => {
    paintNow();
    const wrap = wrapRef.current;
    const canvas = ref.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paintRef.current());
    ro.observe(wrap);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const geom = geomRef.current;
      const series = barsRef.current;
      if (!geom || !series.length) return;
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const zone = zoneAt(geom, x, y);
      const factor = Math.exp(e.deltaY * 0.0018);
      if (zone === "price" || e.altKey || e.shiftKey) {
        zoomPrice(viewRef.current, geom.priceAt(y), factor, geom);
      } else {
        zoomTime(viewRef.current, geom.indexAt(x), factor, series.length);
      }
      paintRef.current();
    };
    canvas?.addEventListener("wheel", onWheel, { passive: false });
    const t1 = window.setTimeout(() => paintRef.current(), 50);
    const t2 = window.setTimeout(() => paintRef.current(), 250);
    const raf = window.requestAnimationFrame(() => paintRef.current());
    return () => {
      ro.disconnect();
      canvas?.removeEventListener("wheel", onWheel);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.cancelAnimationFrame(raf);
    };
  }, [bars, ids, drawings, draft, model, session, watermark, lines, markers, lastPrice, bands]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): DrawPoint | null {
    const canvas = ref.current;
    const geom = geomRef.current;
    if (!canvas || !geom || !bars.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.max(0, Math.min(bars.length - 1, geom.indexAt(x)));
    return { time: bars[idx]!.time, price: geom.priceAt(y) };
  }

  function setCur(next: string) {
    const canvas = ref.current;
    if (canvas && canvas.style.cursor !== next) canvas.style.cursor = next;
  }

  function cursorFor(zone: ReturnType<typeof zoneAt>, grabbing: boolean): string {
    if (grabbing) return "grabbing";
    if (zone === "price" || zone === "auto") return "ns-resize";
    if (zone === "time") return "ew-resize";
    if (interactive) return "crosshair";
    if (onBarClick) return "pointer";
    if (tool === "select") return "grab";
    return "default";
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const geom = geomRef.current;
    if (!geom || !bars.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointersRef.current.set(e.pointerId, { x, y });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchRef.current = {
        dist: Math.max(24, dist),
        width: viewRef.current.to - viewRef.current.from,
        anchor: geom.indexAt((pts[0]!.x + pts[1]!.x) / 2),
      };
      dragRef.current = null;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const zone = zoneAt(geom, x, y);
    if (zone === "auto") {
      viewRef.current.lo = null;
      viewRef.current.hi = null;
      paintRef.current();
      return;
    }
    if (zone === "price") {
      const lo = viewRef.current.lo ?? geom.lo;
      const hi = viewRef.current.hi ?? geom.hi;
      dragRef.current = { kind: "price", y, lo, hi, anchor: geom.priceAt(y) };
      e.currentTarget.setPointerCapture(e.pointerId);
      setCur("ns-resize");
      return;
    }
    if (zone === "time") {
      dragRef.current = {
        kind: "time",
        x,
        from: viewRef.current.from,
        to: viewRef.current.to,
        anchor: geom.indexAt(x),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setCur("ew-resize");
      return;
    }
    if (tool === "select" || !onDrawingsChange) {
      const lo = viewRef.current.lo ?? geom.lo;
      const hi = viewRef.current.hi ?? geom.hi;
      dragRef.current = {
        kind: "pan",
        x,
        y,
        from: viewRef.current.from,
        to: viewRef.current.to,
        lo,
        hi,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (tool === "erase") {
      const hit = hitDrawing(drawings, pt, geomRef.current, bars);
      if (hit) onDrawingsChange(drawings.filter((d) => d.id !== hit));
      return;
    }
    if (tool === "hline") {
      onDrawingsChange([...drawings, { id: drawingId(), tool: "hline", a: pt, color }]);
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Note");
      if (text?.trim()) {
        onDrawingsChange([...drawings, { id: drawingId(), tool: "text", a: pt, color, text: text.trim() }]);
      }
      return;
    }
    if (draft && needsSecondPoint(draft.tool)) {
      onDrawingsChange([
        ...drawings,
        {
          id: drawingId(),
          tool: draft.tool as Drawing["tool"],
          a: draft.a,
          b: pt,
          color,
        },
      ]);
      setDraft(null);
      return;
    }
    setDraft({ tool, a: pt, b: pt });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    const geom = geomRef.current;
    if (!canvas || !geom || !bars.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x, y });
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const p = pinchRef.current;
      const next = Math.min(bars.length, Math.max(MIN_BARS, p.width * (p.dist / Math.max(24, dist))));
      clampTime(viewRef.current, p.anchor - next / 2, p.anchor + next / 2, bars.length);
      paintRef.current();
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const n = bars.length;
      if (drag.kind === "pan") {
        const dx = x - drag.x;
        const dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 6) {
          hoverRef.current = { i: Math.max(0, Math.min(n - 1, geom.indexAt(x))), x, y };
          paintRef.current();
          return;
        }
        drag.moved = true;
        const bp = (drag.to - drag.from) / geom.plotW;
        let from = drag.from - dx * bp;
        let to = drag.to - dx * bp;
        clampTime(viewRef.current, from, to, n);
        if (viewRef.current.lo != null && viewRef.current.hi != null) {
          const pp = (drag.hi - drag.lo) / geom.plotH;
          viewRef.current.lo = drag.lo + dy * pp;
          viewRef.current.hi = drag.hi + dy * pp;
        }
        setCur("grabbing");
        paintRef.current();
        return;
      }
      if (drag.kind === "price") {
        const factor = Math.exp((y - drag.y) * 0.012);
        viewRef.current.lo = drag.anchor - (drag.anchor - drag.lo) * factor;
        viewRef.current.hi = drag.anchor + (drag.hi - drag.anchor) * factor;
        if (viewRef.current.hi - viewRef.current.lo < 1e-6) {
          viewRef.current.lo = drag.lo;
          viewRef.current.hi = drag.hi;
        }
        paintRef.current();
        return;
      }
      if (drag.kind === "time") {
        const factor = Math.exp(-(x - drag.x) * 0.008);
        zoomTimeFrom(viewRef.current, drag.from, drag.to, drag.anchor, factor, n);
        paintRef.current();
        return;
      }
    }
    const i = Math.max(0, Math.min(bars.length - 1, geom.indexAt(x)));
    hoverRef.current = { i, x, y };
    if (draft) {
      const pt = pointFromEvent(e);
      if (pt) {
        setDraft({ ...draft, b: pt });
        return;
      }
    }
    setCur(cursorFor(zoneAt(geom, x, y), false));
    paintRef.current();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    const geom = geomRef.current;
    if (drag?.kind === "pan" && !drag.moved && onBarClick && geom && tool === "select") {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (zoneAt(geom, x, y) === "plot") {
        onBarClick(Math.max(0, Math.min(bars.length - 1, geom.indexAt(x))));
      }
    }
    dragRef.current = null;
    if (geom) {
      const rect = e.currentTarget.getBoundingClientRect();
      setCur(cursorFor(zoneAt(geom, e.clientX - rect.left, e.clientY - rect.top), false));
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const geom = geomRef.current;
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = zoneAt(geom, e.clientX - rect.left, e.clientY - rect.top);
    const n = bars.length;
    if (zone === "price" || zone === "auto") {
      viewRef.current.lo = null;
      viewRef.current.hi = null;
    } else if (zone === "time" || zone === "plot") {
      viewRef.current.from = 0;
      viewRef.current.to = n;
      viewRef.current.follow = true;
      viewRef.current.lo = null;
      viewRef.current.hi = null;
    }
    paintRef.current();
  }

  function onPointerLeave() {
    if (dragRef.current) return;
    hoverRef.current = null;
    paintRef.current();
  }

  return (
    <div
      ref={wrapRef}
      className={cn("relative h-full w-full min-h-[220px] overflow-hidden", className)}
      style={{ background: CHART.bg }}
    >
      <canvas
        ref={ref}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}

function zoneAt(geom: Geom, x: number, y: number): "price" | "time" | "auto" | "plot" | "outside" {
  if (x >= geom.w - geom.padR) {
    if (y >= geom.padT && y <= geom.padT + 22) return "auto";
    if (y >= geom.padT && y <= geom.padT + geom.plotH + 4) return "price";
  }
  if (y >= geom.h - geom.timeH && x <= geom.w - geom.padR + 4) return "time";
  if (x >= geom.padL && x <= geom.w - geom.padR && y >= geom.padT && y < geom.h - geom.timeH) return "plot";
  return "outside";
}

function clampTime(view: View, from: number, to: number, n: number) {
  const width = Math.max(MIN_BARS, to - from);
  const maxTo = n + Math.max(3, width * 0.12);
  if (from < 0) {
    to -= from;
    from = 0;
  }
  if (to > maxTo) {
    from -= to - maxTo;
    to = maxTo;
  }
  if (from < 0) from = 0;
  if (to - from < MIN_BARS) to = from + MIN_BARS;
  view.from = from;
  view.to = to;
  view.follow = to >= n - 0.85;
}

function zoomTime(view: View, anchor: number, factor: number, n: number) {
  zoomTimeFrom(view, view.from, view.to, anchor, factor, n);
}

function zoomTimeFrom(view: View, from0: number, to0: number, anchor: number, factor: number, n: number) {
  const width = Math.max(MIN_BARS, to0 - from0);
  const next = Math.min(Math.max(n, MIN_BARS), Math.max(MIN_BARS, width * factor));
  let from = anchor - (anchor - from0) * (next / width);
  let to = from + next;
  clampTime(view, from, to, n);
}

function zoomPrice(view: View, anchor: number, factor: number, geom: Geom) {
  const lo0 = view.lo ?? geom.lo;
  const hi0 = view.hi ?? geom.hi;
  const span = hi0 - lo0 || 1;
  const next = Math.min(span * 40, Math.max(span * 0.04, span * factor));
  const scale = next / span;
  view.lo = anchor - (anchor - lo0) * scale;
  view.hi = anchor + (hi0 - anchor) * scale;
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  ids: IndicatorId[],
  lines: PriceGuide[],
  markers: ChartMarker[],
  drawings: Drawing[],
  draft: { tool: DrawTool; a: DrawPoint; b?: DrawPoint } | null,
  model: ChartModel,
  session: SessionDay | null,
  watermark: string | undefined,
  hover: { i: number; x: number; y: number } | null,
  view: View,
  lastPrice?: number,
  bands: TimeBand[] = [],
): Geom {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = CHART.bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 8;
  const padR = PRICE_W;
  const padT = 28;
  const showVol = ids.includes("volume");
  const showRsi = ids.includes("rsi");
  const volH = showVol ? Math.max(32, h * 0.13) : 0;
  const rsiH = showRsi ? Math.max(36, h * 0.12) : 0;
  const timeH = TIME_H;
  const padB = timeH + volH + rsiH;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const rsiTop = h - timeH - rsiH;
  const volTop = h - timeH - rsiH - volH;

  const empty: Geom = {
    w,
    h,
    padL,
    padR,
    padT,
    plotW,
    plotH,
    lo: 0,
    hi: 1,
    from: 0,
    to: 1,
    xAt: () => padL,
    yAt: () => padT,
    indexAt: () => 0,
    priceAt: () => 0,
    rsiTop,
    rsiH,
    volTop,
    volH,
    timeH,
  };
  if (!bars.length) {
    ctx.fillStyle = CHART.text;
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No tape for this session", w / 2, h / 2);
    return empty;
  }

  let from = view.to > view.from + 1 ? view.from : 0;
  let to = view.to > view.from + 1 ? view.to : bars.length;
  const spanX = Math.max(1e-6, to - from);
  const i0 = Math.max(0, Math.floor(from) - 1);
  const i1 = Math.min(bars.length - 1, Math.ceil(to) + 1);

  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = Math.max(0, Math.floor(from)); i < Math.min(bars.length, Math.ceil(to)); i++) {
    highs.push(bars[i]!.high);
    lows.push(bars[i]!.low);
  }
  if (!highs.length) {
    highs.push(bars[bars.length - 1]!.high);
    lows.push(bars[bars.length - 1]!.low);
  }
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  for (const line of lines) {
    lo = Math.min(lo, line.price);
    hi = Math.max(hi, line.price);
  }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  if (view.lo != null && view.hi != null && view.hi > view.lo) {
    lo = view.lo;
    hi = view.hi;
  }
  const span = hi - lo || 1;

  const xAt = (i: number) => padL + ((i - from + 0.5) / spanX) * plotW;
  const yAt = (px: number) => padT + ((hi - px) / span) * plotH;
  const indexAt = (x: number) => from + ((x - padL) / plotW) * spanX - 0.5;
  const priceAt = (y: number) => hi - ((y - padT) / plotH) * span;
  const geom: Geom = {
    w,
    h,
    padL,
    padR,
    padT,
    plotW,
    plotH,
    lo,
    hi,
    from,
    to,
    xAt,
    yAt,
    indexAt,
    priceAt,
    rsiTop,
    rsiH,
    volTop,
    volH,
    timeH,
  };
  const slot = plotW / spanX;
  const bodyW = Math.max(1.4, Math.min(11, slot * 0.7));

  ctx.fillStyle = "rgba(28,27,24,0.05)";
  ctx.fillRect(w - padR, padT, padR, plotH);
  ctx.fillRect(0, h - timeH, w, timeH);
  ctx.strokeStyle = CHART.border;
  ctx.beginPath();
  ctx.moveTo(w - padR, padT);
  ctx.lineTo(w - padR, padT + plotH);
  ctx.moveTo(padL, h - timeH);
  ctx.lineTo(w - padR, h - timeH);
  ctx.stroke();

  if (ids.includes("killzones") || ids.includes("quarterly")) {
    paintBands(ctx, bars, geom, ids);
  }
  if (bands.length) paintTimeBands(ctx, bars, geom, bands);

  if (watermark) {
    ctx.fillStyle = CHART.watermark;
    ctx.font = `600 ${Math.min(120, plotH * 0.28)}px 'IBM Plex Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(watermark, padL + plotW / 2, padT + plotH / 2);
  }

  ctx.strokeStyle = CHART.grid;
  ctx.lineWidth = 1;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = CHART.text;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const px = hi - (span * t) / ticks;
    const y = yAt(px);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(formatAxis(px), w - 8, y);
  }

  ctx.fillStyle = view.lo == null ? CHART.textStrong : CHART.text;
  ctx.font = "10px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("A", w - padR / 2, padT + 6);

  if (ids.includes("htf")) paintHtf(ctx, bars, model, geom);
  if (ids.includes("po3") && model.po3) paintPo3(ctx, bars, model.po3, geom);
  if (ids.includes("fvg")) paintFvg(ctx, bars, model, geom);
  if (ids.includes("quarterly")) paintQuarterly(ctx, bars, geom);

  for (const line of lines) {
    const y = yAt(line.price);
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.solid ? 1.6 : 1;
    ctx.setLineDash(line.solid ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.fillStyle = line.color;
    ctx.font = line.solid
      ? "600 10px 'IBM Plex Mono', ui-monospace, monospace"
      : "10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(line.title, w - padR - 6, y - 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
  }

  if (ids.includes("openPrice") && model.rthOpen != null) {
    strokeH(ctx, geom, model.rthOpen, "rgba(236,238,241,0.35)", "RTH");
  }
  if (ids.includes("keyTimes")) {
    for (const k of model.keyOpens) {
      strokeH(ctx, geom, k.price, "rgba(196,165,116,0.55)", k.label);
    }
  }
  if (ids.includes("sessionHL") && session) {
    strokeH(ctx, geom, session.high, "rgba(63,143,107,0.7)", "H");
    strokeH(ctx, geom, session.low, "rgba(196,92,82,0.7)", "L");
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();
  for (let i = i0; i <= i1; i++) {
    const b = bars[i]!;
    const x = xAt(i);
    const up = b.close >= b.open;
    ctx.strokeStyle = up ? CHART.wickUp : CHART.wickDown;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yAt(b.high));
    ctx.lineTo(x, yAt(b.low));
    ctx.stroke();
    const y1 = yAt(Math.max(b.open, b.close));
    const y2 = yAt(Math.min(b.open, b.close));
    const bh = Math.max(1, y2 - y1);
    if (up) {
      ctx.fillStyle = CHART.up;
      ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);
      ctx.strokeStyle = CHART.wickUp;
      ctx.strokeRect(x - bodyW / 2, y1, bodyW, bh);
    } else {
      ctx.fillStyle = CHART.down;
      ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);
    }
  }
  ctx.restore();

  if (ids.includes("vwap")) strokeSeries(ctx, model.vwap, xAt, yAt, CHART.vwap, 1.3, i0, i1);
  if (ids.includes("ema")) {
    strokeSeries(ctx, model.ema9, xAt, yAt, CHART.emaFast, 1, i0, i1);
    strokeSeries(ctx, model.ema21, xAt, yAt, CHART.emaSlow, 1, i0, i1);
  }
  if (ids.includes("stdev")) {
    strokeSeries(ctx, model.stdMid, xAt, yAt, CHART.std, 1, i0, i1);
    strokeSeries(ctx, model.stdUp, xAt, yAt, CHART.std, 0.8, i0, i1);
    strokeSeries(ctx, model.stdDn, xAt, yAt, CHART.std, 0.8, i0, i1);
  }

  if (ids.includes("vrvp") || ids.includes("hvn")) {
    paintProfile(ctx, model, geom, ids.includes("hvn"));
  }
  if (ids.includes("pvp")) {
    paintPeriodProfiles(ctx, bars, model, geom);
  }
  if (ids.includes("pivots")) {
    for (const p of model.pivots) {
      const i = nearest(bars, p.time);
      ctx.fillStyle = p.kind === "h" ? CHART.down : CHART.up;
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(p.price), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (ids.includes("eqHL")) {
    ctx.setLineDash([3, 4]);
    for (const eq of model.equals) {
      ctx.strokeStyle = eq.kind === "h" ? CHART.down : CHART.up;
      ctx.beginPath();
      ctx.moveTo(xAt(nearest(bars, eq.a)), yAt(eq.price));
      ctx.lineTo(xAt(nearest(bars, eq.b)), yAt(eq.price));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (ids.includes("stopHunt")) {
    for (const s of model.stopHunts) {
      const i = nearest(bars, s.time);
      ctx.strokeStyle = CHART.orb;
      ctx.strokeRect(xAt(i) - 6, yAt(s.price) - 6, 12, 12);
    }
  }
  if (ids.includes("smt")) {
    for (const s of model.smt) {
      const i = nearest(bars, s.time);
      const x = xAt(i);
      const y = yAt(s.price);
      ctx.strokeStyle = s.kind === "bear" ? CHART.down : CHART.up;
      ctx.fillStyle = s.kind === "bear" ? CHART.fvgDown : CHART.fvgUp;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7, y + (s.kind === "bear" ? 10 : -10));
      ctx.lineTo(x + 7, y + (s.kind === "bear" ? 10 : -10));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = CHART.textStrong;
      ctx.font = "9px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("SMT", x + 8, y);
    }
  }

  if (volH > 0) {
    const maxVol = Math.max(...bars.slice(Math.max(0, i0), i1 + 1).map((b) => b.volume), 1);
    for (let i = i0; i <= i1; i++) {
      const b = bars[i]!;
      const vh = (b.volume / maxVol) * (volH - 4);
      ctx.fillStyle = b.close >= b.open ? CHART.volumeUp : CHART.volumeDown;
      ctx.fillRect(xAt(i) - bodyW / 2, volTop + volH - vh, bodyW, vh);
    }
  }

  if (showRsi && rsiH > 0) {
    ctx.fillStyle = "rgba(236,238,241,0.03)";
    ctx.fillRect(padL, rsiTop, plotW, rsiH);
    const yR = (v: number) => rsiTop + ((100 - v) / 100) * rsiH;
    ctx.strokeStyle = "rgba(196,92,82,0.35)";
    ctx.beginPath();
    ctx.moveTo(padL, yR(70));
    ctx.lineTo(w - padR, yR(70));
    ctx.stroke();
    ctx.strokeStyle = "rgba(63,143,107,0.35)";
    ctx.beginPath();
    ctx.moveTo(padL, yR(30));
    ctx.lineTo(w - padR, yR(30));
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = CHART.emaFast;
    for (let i = i0; i <= i1; i++) {
      const v = model.rsi[i];
      if (v == null) continue;
      const y = yR(v);
      if (i === i0) ctx.moveTo(xAt(i), y);
      else ctx.lineTo(xAt(i), y);
    }
    ctx.stroke();
  }

  const lastT = bars.at(-1)?.time ?? 0;
  for (const m of markers) {
    if (m.time > lastT) continue;
    let idx = bars.findIndex((b) => b.time >= m.time);
    if (idx < 0) idx = bars.length - 1;
    const bar = bars[idx]!;
    const x = xAt(idx);
    const y = m.position === "belowBar" ? yAt(bar.low) + 10 : yAt(bar.high) - 10;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    if (m.shape === "arrowUp") {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x - 5, y + 4);
      ctx.lineTo(x + 5, y + 4);
    } else {
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x - 5, y - 4);
      ctx.lineTo(x + 5, y + 4);
    }
    ctx.closePath();
    ctx.fill();
  }

  const render = [...drawings];
  if (draft && draft.tool !== "select" && draft.tool !== "erase") {
    render.push({
      id: "draft",
      tool: draft.tool as Drawing["tool"],
      a: draft.a,
      b: draft.b,
      color: CHART.crosshair,
      text: draft.tool === "text" ? "note" : undefined,
    });
  }
  paintDrawings(ctx, render, bars, geom);

  if (hover && bars[hover.i]) {
    const b = bars[hover.i]!;
    ctx.strokeStyle = CHART.crosshair;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xAt(hover.i), padT);
    ctx.lineTo(xAt(hover.i), padT + plotH);
    ctx.moveTo(padL, hover.y);
    ctx.lineTo(w - padR, hover.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(244,240,232,0.92)";
    ctx.fillRect(padL, 6, 360, 18);
    ctx.fillStyle = CHART.textStrong;
    ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const up = b.close >= b.open;
    ctx.fillStyle = up ? CHART.up : CHART.down;
    ctx.fillText(
      `${clock(b.time)}  O ${formatAxis(b.open)}  H ${formatAxis(b.high)}  L ${formatAxis(b.low)}  C ${formatAxis(b.close)}`,
      padL + 6,
      15,
    );
    ctx.fillStyle = CHART.lastTag;
    const hy = Math.max(padT + 8, Math.min(padT + plotH - 8, hover.y));
    ctx.fillRect(w - padR + 1, hy - 9, padR - 2, 18);
    ctx.fillStyle = CHART.up;
    ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatAxis(priceAt(hover.y)), w - 8, hy);
  }

  ctx.fillStyle = CHART.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
  const shown = Math.max(1, to - from);
  const minGap = shown < 40 ? 64 : 52;
  let lastLabelX = -999;
  for (let i = i0; i <= i1; i++) {
    const p = nyParts(bars[i]!.time);
    const step = shown < 28 ? 15 : shown < 80 ? 30 : 60;
    if (p.minutes % step !== 0) continue;
    const x = xAt(i);
    if (x - lastLabelX < minGap) continue;
    if (x < padL - 8 || x > w - padR + 8) continue;
    lastLabelX = x;
    ctx.strokeStyle = "rgba(28,27,24,0.08)";
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = CHART.text;
    ctx.fillText(clockLabel(p.minutes, step < 60), x, h - 8);
  }

  const last = bars[bars.length - 1]!;
  const tagPx = lastPrice && lastPrice > 0 ? lastPrice : last.close;
  const ly = Math.max(padT + 8, Math.min(padT + plotH - 8, yAt(tagPx)));
  const lastUp = tagPx >= last.open;
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();
  ctx.strokeStyle = lastUp ? "rgba(28,27,24,0.42)" : "rgba(122,58,50,0.55)";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, ly);
  ctx.lineTo(w - padR, ly);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = lastUp ? CHART.up : CHART.down;
  ctx.fillRect(w - padR + 1, ly - 9, padR - 2, 18);
  ctx.fillStyle = lastUp ? CHART.textStrong : CHART.up;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(formatAxis(tagPx), w - 8, ly);
  return geom;
}

function clockLabel(minutes: number, withMin: boolean): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (!withMin && m === 0) return `${String(h).padStart(2, "0")}:00`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function paintBands(ctx: CanvasRenderingContext2D, bars: Bar[], geom: Geom, ids: IndicatorId[]) {
  if (!ids.includes("killzones")) return;
  for (const kz of KILLZONES) {
    let start = -1;
    for (let i = 0; i <= bars.length; i++) {
      const m = i < bars.length ? nyParts(bars[i]!.time).minutes : -1;
      const inside = i < bars.length && inMinRange(m, kz.startMin, kz.endMin);
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) {
        const x1 = geom.xAt(start) - 2;
        const x2 = geom.xAt(i - 1) + 2;
        const bw = Math.max(4, x2 - x1);
        ctx.fillStyle = kz.color;
        ctx.fillRect(x1, geom.padT, bw, geom.plotH);
        if (bw > 56) {
          ctx.fillStyle = "rgba(28,27,24,0.45)";
          ctx.font = "10px 'IBM Plex Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`${kz.label} KZ`, x1 + bw / 2, geom.padT + geom.plotH - 6);
        }
        start = -1;
      }
    }
  }
}

function paintTimeBands(ctx: CanvasRenderingContext2D, bars: Bar[], geom: Geom, bands: TimeBand[]) {
  for (const band of bands) {
    let start = -1;
    for (let i = 0; i <= bars.length; i++) {
      const m = i < bars.length ? nyParts(bars[i]!.time).minutes : -1;
      const inside = i < bars.length && inMinRange(m, band.startMin, band.endMin);
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) {
        const x1 = geom.xAt(start) - 2;
        const x2 = geom.xAt(i - 1) + 2;
        const bw = Math.max(4, x2 - x1);
        ctx.fillStyle = band.color ?? "rgba(138,106,58,0.14)";
        ctx.fillRect(x1, geom.padT, bw, geom.plotH);
        if (bw > 48) {
          ctx.fillStyle = "rgba(28,27,24,0.5)";
          ctx.font = "10px 'IBM Plex Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(band.label, x1 + bw / 2, geom.padT + geom.plotH - 6);
        }
        start = -1;
      }
    }
  }
}

function inMinRange(m: number, a: number, b: number) {
  if (a < b) return m >= a && m < b;
  return m >= a || m < b;
}

function paintQuarterly(ctx: CanvasRenderingContext2D, bars: Bar[], geom: Geom) {
  const qColors = [
    "rgba(196,165,116,0.05)",
    "rgba(63,143,107,0.05)",
    "rgba(122,143,168,0.05)",
    "rgba(196,92,82,0.05)",
  ];
  for (let i = 0; i < bars.length; i++) {
    const m = nyParts(bars[i]!.time).minutes;
    const fromOpen = (m - 18 * 60 + 24 * 60) % (24 * 60);
    const q = Math.min(3, Math.floor(fromOpen / (6 * 60)));
    ctx.fillStyle = qColors[q]!;
    const x = geom.xAt(i);
    const slot = geom.plotW / Math.max(1, geom.to - geom.from);
    ctx.fillRect(x - slot / 2, geom.padT, slot, geom.plotH);
  }
}

function paintHtf(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  model: ChartModel,
  geom: Geom,
) {
  for (const c of model.htf) {
    const i0 = nearest(bars, c.start);
    const i1 = nearest(bars, c.end);
    const x1 = geom.xAt(i0);
    const x2 = geom.xAt(i1);
    const up = c.close >= c.open;
    ctx.fillStyle = up ? CHART.htfUp : CHART.htfDown;
    ctx.strokeStyle = up ? CHART.up : CHART.down;
    const y1 = geom.yAt(Math.max(c.open, c.close));
    const y2 = geom.yAt(Math.min(c.open, c.close));
    ctx.fillRect(x1, y1, Math.max(4, x2 - x1), Math.max(2, y2 - y1));
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(x1, geom.yAt(c.high), Math.max(4, x2 - x1), Math.max(2, geom.yAt(c.low) - geom.yAt(c.high)));
    ctx.globalAlpha = 1;
  }
}

function paintPo3(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  po3: ChartModel["po3"],
  geom: Geom,
) {
  if (!po3) return;
  const i0 = nearest(bars, po3.start);
  const i1 = nearest(bars, po3.end);
  const x1 = geom.xAt(i0);
  const x2 = geom.xAt(i1);
  ctx.fillStyle = CHART.po3;
  ctx.fillRect(x1, geom.yAt(po3.high), Math.max(8, x2 - x1), Math.max(4, geom.yAt(po3.low) - geom.yAt(po3.high)));
  ctx.strokeStyle = CHART.orb;
  ctx.strokeRect(x1, geom.yAt(po3.high), Math.max(8, x2 - x1), Math.max(4, geom.yAt(po3.low) - geom.yAt(po3.high)));
  ctx.fillStyle = CHART.textStrong;
  ctx.font = "10px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("1H CANDLE PO3", x2 + 6, geom.yAt((po3.high + po3.low) / 2));
  ctx.fillStyle = CHART.text;
  ctx.fillText(`Range ${(po3.high - po3.low).toFixed(2)}`, x2 + 6, geom.yAt((po3.high + po3.low) / 2) + 12);
}

function paintFvg(ctx: CanvasRenderingContext2D, bars: Bar[], model: ChartModel, geom: Geom) {
  for (const f of model.fvgs) {
    const i0 = nearest(bars, f.start);
    const i1 = nearest(bars, f.end);
    ctx.fillStyle = f.dir === "up" ? CHART.fvgUp : CHART.fvgDown;
    ctx.fillRect(
      geom.xAt(i0),
      geom.yAt(f.high),
      Math.max(4, geom.xAt(i1) - geom.xAt(i0)),
      Math.max(2, geom.yAt(f.low) - geom.yAt(f.high)),
    );
  }
}

function paintProfile(ctx: CanvasRenderingContext2D, model: ChartModel, geom: Geom, hvn: boolean) {
  const max = Math.max(...model.profile.map((r) => r.volume), 1);
  const width = geom.plotW * 0.22;
  for (const r of model.profile) {
    const y = geom.yAt(r.price);
    const bw = (r.volume / max) * width;
    const isPoc = Math.abs(r.price - model.poc) < 1e-6;
    ctx.fillStyle = isPoc ? "rgba(184,192,204,0.45)" : "rgba(184,192,204,0.12)";
    ctx.fillRect(geom.w - geom.padR - bw, y - 2, bw, 4);
    if (hvn && r.volume > max * 0.72) {
      ctx.strokeStyle = "rgba(184,192,204,0.4)";
      ctx.beginPath();
      ctx.moveTo(geom.padL, y);
      ctx.lineTo(geom.w - geom.padR, y);
      ctx.stroke();
    }
  }
}

function paintPeriodProfiles(ctx: CanvasRenderingContext2D, bars: Bar[], model: ChartModel, geom: Geom) {
  for (const p of model.periodProfiles) {
    const i0 = nearest(bars, p.start);
    const i1 = nearest(bars, p.end);
    const x0 = geom.xAt(i0);
    const x1 = geom.xAt(i1);
    const span = Math.max(24, x1 - x0);
    const max = Math.max(...p.rows.map((r) => r.volume), 1);
    const width = Math.min(span * 0.45, geom.plotW * 0.12);
    for (const r of p.rows) {
      const y = geom.yAt(r.price);
      const bw = (r.volume / max) * width;
      const isPoc = Math.abs(r.price - p.poc) < 1e-6;
      ctx.fillStyle = isPoc ? "rgba(184,192,204,0.4)" : "rgba(184,192,204,0.1)";
      ctx.fillRect(x0, y - 1.5, bw, 3);
    }
  }
}

function strokeSeries(
  ctx: CanvasRenderingContext2D,
  values: number[],
  xAt: (i: number) => number,
  yAt: (px: number) => number,
  color: string,
  width: number,
  i0 = 0,
  i1 = values.length - 1,
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  let started = false;
  const a = Math.max(0, i0);
  const b = Math.min(values.length - 1, i1);
  for (let i = a; i <= b; i++) {
    const v = values[i];
    if (v == null) continue;
    const y = yAt(v);
    if (!started) {
      ctx.moveTo(xAt(i), y);
      started = true;
    } else ctx.lineTo(xAt(i), y);
  }
  ctx.stroke();
}

function strokeH(ctx: CanvasRenderingContext2D, geom: Geom, price: number, color: string, label: string) {
  const y = geom.yAt(price);
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(geom.padL, y);
  ctx.lineTo(geom.w - geom.padR, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, geom.w - geom.padR - 6, y - 2);
}

function nearest(bars: Bar[], time: number): number {
  let idx = bars.findIndex((b) => b.time >= time);
  if (idx < 0) idx = bars.length - 1;
  return idx;
}

function xOfTime(time: number, bars: Bar[], geom: Geom): number {
  if (!bars.length) return geom.padL;
  return geom.xAt(nearest(bars, time));
}

function paintDrawings(ctx: CanvasRenderingContext2D, drawings: Drawing[], bars: Bar[], geom: Geom) {
  for (const d of drawings) {
    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = 1.2;
    const x1 = xOfTime(d.a.time, bars, geom);
    const y1 = geom.yAt(d.a.price);
    const x2 = xOfTime(d.b?.time ?? d.a.time, bars, geom);
    const y2 = geom.yAt(d.b?.price ?? d.a.price);

    if (d.tool === "hline") {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(geom.padL, y1);
      ctx.lineTo(geom.w - geom.padR, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(formatAxis(d.a.price), geom.padL + 4, y1 - 6);
    } else if (d.tool === "trend") {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (d.tool === "ray") {
      const dx = x2 - x1 || 1;
      const dy = y2 - y1;
      const t = (geom.w - geom.padR - x1) / dx;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + dx * Math.max(t, 1), y1 + dy * Math.max(t, 1));
      ctx.stroke();
    } else if (d.tool === "rect") {
      ctx.globalAlpha = 0.12;
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.globalAlpha = 1;
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (d.tool === "fib" && d.b) {
      ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      for (const lvl of FIB_LEVELS) {
        const price = d.a.price + (d.b.price - d.a.price) * lvl;
        const y = geom.yAt(price);
        ctx.globalAlpha = lvl === 0.5 || lvl === 0.618 ? 1 : 0.55;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2) + 48, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(`${lvl.toFixed(3)}  ${formatAxis(price)}`, Math.max(x1, x2) + 6, y - 4);
      }
      ctx.globalAlpha = 1;
    } else if (d.tool === "text") {
      ctx.font = "12px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(d.text ?? "", x1, y1);
    }
    ctx.restore();
  }
}

function hitDrawing(drawings: Drawing[], pt: DrawPoint, geom: Geom | null, bars: Bar[]): string | null {
  if (!geom) return null;
  const y = geom.yAt(pt.price);
  const x = xOfTime(pt.time, bars, geom);
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    if (d.tool === "hline" && Math.abs(geom.yAt(d.a.price) - y) < 8) return d.id;
    if (d.tool === "text") {
      const dx = xOfTime(d.a.time, bars, geom) - x;
      const dy = geom.yAt(d.a.price) - y;
      if (dx * dx + dy * dy < 18 * 18) return d.id;
    }
    if (d.b) {
      const x1 = xOfTime(d.a.time, bars, geom);
      const y1 = geom.yAt(d.a.price);
      const x2 = xOfTime(d.b.time, bars, geom);
      const y2 = geom.yAt(d.b.price);
      const dist = distToSeg(x, y, x1, y1, x2, y2);
      if (dist < 10) return d.id;
    }
  }
  return null;
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function formatAxis(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function clock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function levelLines(
  orb?: RangeLevel,
  ib?: RangeLevel,
  ids?: IndicatorId[] | null,
): PriceGuide[] {
  const on = (id: IndicatorId) => !ids || ids.includes(id);
  const lines: PriceGuide[] = [];
  if (orb && orb.size > 0) {
    if (on("orH")) lines.push({ price: orb.high, color: CHART.orb, title: "OR H" });
    if (on("orL")) lines.push({ price: orb.low, color: CHART.orb, title: "OR L" });
  }
  if (ib && ib.size > 0) {
    if (on("ibH")) lines.push({ price: ib.high, color: CHART.ib, title: "IB H" });
    if (on("ibL")) lines.push({ price: ib.low, color: CHART.ib, title: "IB L" });
  }
  return lines;
}
