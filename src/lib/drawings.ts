export type DrawTool = "select" | "hline" | "trend" | "ray" | "rect" | "fib" | "text" | "erase";

export type DrawPoint = { time: number; price: number };

export type Drawing = {
  id: string;
  tool: Exclude<DrawTool, "select" | "erase">;
  a: DrawPoint;
  b?: DrawPoint;
  color: string;
  text?: string;
};

export const DRAW_TOOLS: { id: DrawTool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "hline", label: "Price" },
  { id: "trend", label: "Trend" },
  { id: "ray", label: "Ray" },
  { id: "rect", label: "Box" },
  { id: "fib", label: "Fib" },
  { id: "text", label: "Note" },
  { id: "erase", label: "Erase" },
];

export const DRAW_COLORS = ["#c4a574", "#b8c0cc", "#3f8f6b", "#c45c52", "#7a8fa8"] as const;

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export function drawingId(): string {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function needsSecondPoint(tool: DrawTool): boolean {
  return tool === "trend" || tool === "ray" || tool === "rect" || tool === "fib";
}

export const EMPTY_SESSION_DRAWINGS: Drawing[] = [];

export function sessionDrawKey(symbol: string, date: string): string {
  return `${symbol}:${date}`;
}

/** Drawings live on the session (symbol + date), not the timeframe. Old TF-suffixed keys still resolve. */
export function drawingsForSession(
  all: Record<string, Drawing[]>,
  symbol: string,
  date: string,
): Drawing[] {
  if (!symbol || !date) return EMPTY_SESSION_DRAWINGS;
  const key = sessionDrawKey(symbol, date);
  if (Object.prototype.hasOwnProperty.call(all, key)) return all[key] ?? EMPTY_SESSION_DRAWINGS;
  const out: Drawing[] = [];
  const seen = new Set<string>();
  for (const [k, list] of Object.entries(all)) {
    if (!list.length) continue;
    const legacy =
      k.startsWith(`replay:${symbol}:${date}:`) ||
      k.startsWith(`charts:${symbol}:`) ||
      k === `charts:${symbol}`;
    if (!legacy) continue;
    for (const d of list) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
  }
  return out.length ? out : EMPTY_SESSION_DRAWINGS;
}
