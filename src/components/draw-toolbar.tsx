import {
  Eraser,
  Minus,
  MousePointer2,
  MoveRight,
  Spline,
  Square,
  TrendingUp,
  Type,
} from "lucide-react";
import { DRAW_COLORS, DRAW_TOOLS, type DrawTool } from "@/lib/drawings";
import { cn } from "@/lib/utils";

const ICONS: Record<DrawTool, typeof Minus> = {
  select: MousePointer2,
  hline: Minus,
  trend: TrendingUp,
  ray: MoveRight,
  rect: Square,
  fib: Spline,
  text: Type,
  erase: Eraser,
};

export function DrawToolbar({
  tool,
  color,
  onTool,
  onColor,
  onClear,
  count,
  vertical = false,
}: {
  tool: DrawTool;
  color: string;
  onTool: (t: DrawTool) => void;
  onColor: (c: string) => void;
  onClear: () => void;
  count: number;
  vertical?: boolean;
}) {
  if (vertical) {
    return (
      <div className="flex h-full w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-bg-elevated py-2">
        {DRAW_TOOLS.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => onTool(t.id)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                tool === t.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          );
        })}
        <span className="my-1 h-px w-6 bg-border" />
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Drawing color"
            onClick={() => onColor(c)}
            className={cn("size-3.5 rounded-full border", color === c ? "border-fg" : "border-transparent")}
            style={{ background: c }}
          />
        ))}
        <button
          type="button"
          onClick={onClear}
          className="mt-auto px-1 pb-2 text-[9px] uppercase tracking-[0.12em] text-subtle hover:text-fg"
        >
          {count ? count : "clr"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {DRAW_TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTool(t.id)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px]",
            tool === t.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label="Drawing color"
          onClick={() => onColor(c)}
          className={cn("size-4 rounded-full border", color === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full px-2.5 py-1 text-[11px] text-muted hover:text-fg"
      >
        Clear{count ? ` (${count})` : ""}
      </button>
    </div>
  );
}
