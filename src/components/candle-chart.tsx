import { useEffect, useRef } from "react";
import { CHART } from "@/lib/chart-theme";
import { ema } from "@/lib/market/generate";
import { cn } from "@/lib/utils";
import type { Bar, RangeLevel } from "@/lib/market/types";

export type ChartOverlay = "vwap" | "ema" | "volume" | "delta";

export type PriceGuide = { price: number; color: string; title: string };

export type ChartMarker = {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text?: string;
};

export function CandleChart({
  bars,
  overlays = ["volume"],
  lines = [],
  markers = [],
  className,
}: {
  bars: Bar[];
  overlays?: ChartOverlay[];
  lines?: PriceGuide[];
  markers?: ChartMarker[];
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, parent.clientWidth);
      const h = Math.max(1, parent.clientHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, w, h, bars, overlays, lines, markers);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [bars, overlays, lines, markers]);

  return <canvas ref={ref} className={cn("block h-full w-full", className)} />;
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bars: Bar[],
  overlays: ChartOverlay[],
  lines: PriceGuide[],
  markers: ChartMarker[],
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = CHART.bg;
  ctx.fillRect(0, 0, w, h);
  if (!bars.length) return;

  const padL = 8;
  const padR = 56;
  const padT = 12;
  const volH = overlays.includes("volume") ? Math.max(36, h * 0.16) : 0;
  const padB = 22 + volH;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  let lo = Math.min(...lows);
  let hi = Math.max(...highs);
  for (const line of lines) {
    lo = Math.min(lo, line.price);
    hi = Math.max(hi, line.price);
  }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  hi += pad;
  const span = hi - lo || 1;

  const xAt = (i: number) => padL + ((i + 0.5) / bars.length) * plotW;
  const yAt = (px: number) => padT + ((hi - px) / span) * plotH;
  const slot = plotW / bars.length;
  const bodyW = Math.max(1.5, Math.min(12, slot * 0.62));

  ctx.strokeStyle = CHART.grid;
  ctx.lineWidth = 1;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = CHART.text;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const px = hi - (span * t) / ticks;
    const y = yAt(px);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(formatAxis(px), w - 8, y);
  }

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
    ctx.textAlign = "left";
    ctx.fillText(line.title, padL + 4, y - 8);
    ctx.textAlign = "right";
  }

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const x = xAt(i);
    const up = b.close >= b.open;
    ctx.strokeStyle = up ? CHART.wickUp : CHART.wickDown;
    ctx.beginPath();
    ctx.moveTo(x, yAt(b.high));
    ctx.lineTo(x, yAt(b.low));
    ctx.stroke();
    const y1 = yAt(Math.max(b.open, b.close));
    const y2 = yAt(Math.min(b.open, b.close));
    const bh = Math.max(1, y2 - y1);
    ctx.fillStyle = up ? CHART.up : CHART.down;
    ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);
  }

  if (overlays.includes("vwap") && bars.length) {
    let pv = 0;
    let v = 0;
    ctx.beginPath();
    ctx.strokeStyle = CHART.vwap;
    ctx.lineWidth = 1.2;
    bars.forEach((b, i) => {
      const tp = (b.high + b.low + b.close) / 3;
      pv += tp * b.volume;
      v += b.volume;
      const y = yAt(v ? pv / v : tp);
      if (i === 0) ctx.moveTo(xAt(i), y);
      else ctx.lineTo(xAt(i), y);
    });
    ctx.stroke();
  }

  if (overlays.includes("ema")) {
    const closes = bars.map((b) => b.close);
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const stroke = (values: number[], color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      values.forEach((val, i) => {
        const y = yAt(val);
        if (i === 0) ctx.moveTo(xAt(i), y);
        else ctx.lineTo(xAt(i), y);
      });
      ctx.stroke();
    };
    stroke(e9, CHART.emaFast);
    stroke(e21, CHART.emaSlow);
  }

  if (volH > 0) {
    const maxVol = Math.max(...bars.map((b) => b.volume), 1);
    const top = h - 18 - volH;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]!;
      const vh = (b.volume / maxVol) * (volH - 4);
      ctx.fillStyle = b.close >= b.open ? CHART.volumeUp : CHART.volumeDown;
      ctx.fillRect(xAt(i) - bodyW / 2, top + volH - vh, bodyW, vh);
    }
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
      ctx.lineTo(x + 5, y - 4);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = CHART.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const first = bars[0]!;
  const last = bars[bars.length - 1]!;
  ctx.fillText(clock(first.time), padL, h - 6);
  ctx.textAlign = "right";
  ctx.fillText(clock(last.time), w - padR, h - 6);
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
      { price: orb.high, color: CHART.orb, title: "ORB H" },
      { price: orb.low, color: CHART.orb, title: "ORB L" },
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
