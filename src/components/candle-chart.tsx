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

export type PriceGuide = { price: number; color: string; title: string };

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
  xAt: (i: number) => number;
  yAt: (px: number) => number;
  indexAt: (x: number) => number;
  priceAt: (y: number) => number;
  rsiTop: number;
  rsiH: number;
  volTop: number;
  volH: number;
};

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
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const geomRef = useRef<Geom | null>(null);
  const hoverRef = useRef<{ i: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ tool: DrawTool; a: DrawPoint; b?: DrawPoint } | null>(null);
  const interactive = Boolean(onDrawingsChange) && tool !== "select";
  const ids = useMemo<IndicatorId[]>(() => {
    if (indicators?.length) return indicators;
    const out: IndicatorId[] = [];
    if (overlays.includes("volume")) out.push("volume");
    if (overlays.includes("vwap")) out.push("vwap");
    if (overlays.includes("ema")) out.push("ema");
    return out;
  }, [indicators, overlays]);
  const tick = getSymbol(session?.symbol ?? "ES").tick;
  const visible = useMemo(() => (bars.length > 520 ? bars.slice(-520) : bars), [bars]);
  const model = useMemo(() => buildChartModel(visible, session, tick), [visible, session, tick]);

  const argsRef = useRef({ visible, ids, lines, markers, drawings, draft, model, session, watermark });
  argsRef.current = { visible, ids, lines, markers, drawings, draft, model, session, watermark };

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
      a.visible,
      a.ids,
      a.lines,
      a.markers,
      a.drawings,
      a.draft,
      a.model,
      a.session,
      a.watermark,
      hoverRef.current,
    );
  };
  const paintRef = useRef(paintNow);
  paintRef.current = paintNow;

  useEffect(() => {
    paintNow();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paintRef.current());
    ro.observe(wrap);
    const t1 = window.setTimeout(() => paintRef.current(), 50);
    const t2 = window.setTimeout(() => paintRef.current(), 250);
    const raf = window.requestAnimationFrame(() => paintRef.current());
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.cancelAnimationFrame(raf);
    };
  }, [visible, ids, drawings, draft, model, session, watermark]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): DrawPoint | null {
    const canvas = ref.current;
    const geom = geomRef.current;
    if (!canvas || !geom || !visible.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.max(0, Math.min(visible.length - 1, geom.indexAt(x)));
    return { time: visible[idx]!.time, price: geom.priceAt(y) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!onDrawingsChange || tool === "select") return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    if (tool === "erase") {
      const hit = hitDrawing(drawings, pt, geomRef.current, visible);
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
    if (!canvas || !geom || !visible.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const i = Math.max(0, Math.min(visible.length - 1, geom.indexAt(x)));
    hoverRef.current = { i, x, y };
    if (draft) {
      const pt = pointFromEvent(e);
      if (pt) {
        setDraft({ ...draft, b: pt });
        return;
      }
    }
    paintRef.current();
  }

  function onPointerLeave() {
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
        style={{ cursor: interactive ? "crosshair" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={() => undefined}
      />
    </div>
  );
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
): Geom {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = CHART.bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 8;
  const padR = 62;
  const padT = 28;
  const showVol = ids.includes("volume");
  const showRsi = ids.includes("rsi");
  const volH = showVol ? Math.max(32, h * 0.13) : 0;
  const rsiH = showRsi ? Math.max(36, h * 0.12) : 0;
  const padB = 22 + volH + rsiH;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const rsiTop = h - 18 - rsiH;
  const volTop = h - 18 - rsiH - volH;

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
    xAt: () => padL,
    yAt: () => padT,
    indexAt: () => 0,
    priceAt: () => 0,
    rsiTop,
    rsiH,
    volTop,
    volH,
  };
  if (!bars.length) {
    ctx.fillStyle = CHART.text;
    ctx.font = "13px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No tape for this session", w / 2, h / 2);
    return empty;
  }

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  for (const line of lines) {
    lo = Math.min(lo, line.price);
    hi = Math.max(hi, line.price);
  }
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;

  const xAt = (i: number) => padL + ((i + 0.5) / bars.length) * plotW;
  const yAt = (px: number) => padT + ((hi - px) / span) * plotH;
  const indexAt = (x: number) => Math.round(((x - padL) / plotW) * bars.length - 0.5);
  const priceAt = (y: number) => hi - ((y - padT) / plotH) * span;
  const geom: Geom = { w, h, padL, padR, padT, plotW, plotH, lo, hi, xAt, yAt, indexAt, priceAt, rsiTop, rsiH, volTop, volH };
  const slot = plotW / bars.length;
  const bodyW = Math.max(1.4, Math.min(11, slot * 0.7));

  if (ids.includes("killzones") || ids.includes("quarterly")) {
    paintBands(ctx, bars, geom, ids);
  }

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

  if (ids.includes("htf")) paintHtf(ctx, bars, model, geom);
  if (ids.includes("po3") && model.po3) paintPo3(ctx, bars, model.po3, geom);
  if (ids.includes("fvg")) paintFvg(ctx, bars, model, geom);
  if (ids.includes("quarterly")) paintQuarterly(ctx, bars, geom);

  for (const line of lines) {
    const y = yAt(line.price);
    ctx.strokeStyle = line.color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = line.color;
    ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(line.title, padL + 4, y - 8);
    ctx.textAlign = "right";
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

  for (let i = 0; i < bars.length; i++) {
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

  if (ids.includes("vwap")) strokeSeries(ctx, model.vwap, xAt, yAt, CHART.vwap, 1.3);
  if (ids.includes("ema")) {
    strokeSeries(ctx, model.ema9, xAt, yAt, CHART.emaFast, 1);
    strokeSeries(ctx, model.ema21, xAt, yAt, CHART.emaSlow, 1);
  }
  if (ids.includes("stdev")) {
    strokeSeries(ctx, model.stdMid, xAt, yAt, CHART.std, 1);
    strokeSeries(ctx, model.stdUp, xAt, yAt, CHART.std, 0.8);
    strokeSeries(ctx, model.stdDn, xAt, yAt, CHART.std, 0.8);
  }

  if (ids.includes("vrvp") || ids.includes("hvn")) {
    paintProfile(ctx, model, geom, ids.includes("hvn"));
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

  if (volH > 0) {
    const maxVol = Math.max(...bars.map((b) => b.volume), 1);
    for (let i = 0; i < bars.length; i++) {
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
    model.rsi.forEach((v, i) => {
      const y = yR(v);
      if (i === 0) ctx.moveTo(xAt(i), y);
      else ctx.lineTo(xAt(i), y);
    });
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
  }

  ctx.fillStyle = CHART.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
  const first = bars[0]!;
  const last = bars[bars.length - 1]!;
  ctx.fillText(clock(first.time), padL, h - 6);
  ctx.textAlign = "right";
  ctx.fillText(clock(last.time), w - padR, h - 6);

  const ly = yAt(last.close);
  ctx.fillStyle = CHART.lastTag;
  ctx.fillRect(w - padR + 1, ly - 9, padR - 2, 18);
  ctx.fillStyle = CHART.up;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(formatAxis(last.close), w - 8, ly);
  return geom;
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
        ctx.fillStyle = kz.color;
        ctx.fillRect(x1, geom.padT, Math.max(4, x2 - x1), geom.plotH);
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
    const slot = geom.plotW / bars.length;
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
    ctx.globalAlpha = 0.45;
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
    const w = (r.volume / max) * width;
    const isPoc = Math.abs(r.price - model.poc) < 1e-6;
    ctx.fillStyle = isPoc ? "rgba(184,192,204,0.45)" : "rgba(184,192,204,0.12)";
    ctx.fillRect(geom.w - geom.padR - w, y - 2, w, 4);
    if (hvn && r.volume > max * 0.72) {
      ctx.strokeStyle = "rgba(184,192,204,0.4)";
      ctx.beginPath();
      ctx.moveTo(geom.padL, y);
      ctx.lineTo(geom.w - geom.padR, y);
      ctx.stroke();
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
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  values.forEach((v, i) => {
    const y = yAt(v);
    if (i === 0) ctx.moveTo(xAt(i), y);
    else ctx.lineTo(xAt(i), y);
  });
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
  ctx.textAlign = "left";
  ctx.fillText(label, geom.padL + 4, y - 6);
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

export function levelLines(orb?: RangeLevel, ib?: RangeLevel): PriceGuide[] {
  const lines: PriceGuide[] = [];
  if (orb) {
    lines.push(
      { price: orb.high, color: CHART.orb, title: "OR H" },
      { price: orb.low, color: CHART.orb, title: "OR L" },
    );
  }
  if (ib) {
    lines.push(
      { price: ib.high, color: CHART.ib, title: "IB H" },
      { price: ib.low, color: CHART.ib, title: "IB L" },
    );
  }
  return lines;
}
