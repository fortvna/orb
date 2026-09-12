import { DEFAULT_INDICATORS } from "@/lib/market/indicators";
import type { IndicatorId } from "@/lib/market/types";
import { cn } from "@/lib/utils";

const CHIP_LABEL: Record<string, string> = {
  volume: "Volume",
  killzones: "Killzones",
  keyTimes: "KeyTimes",
  orH: "OR H",
  orL: "OR L",
  ibH: "IB H",
  ibL: "IB L",
  vwap: "VWAP",
  htf: "HTF",
  po3: "PO3",
  fvg: "FVG",
  ema: "EMA",
  rsi: "RSI",
  smt: "SMT",
  vrvp: "VRVP",
  hvn: "HVN",
  pvp: "PVP",
  quarterly: "QT",
  sessionHL: "H/L",
  openPrice: "Open",
  stdev: "StdDev",
  pivots: "Pivots",
  eqHL: "Eq H/L",
  stopHunt: "Stop hunt",
};

const CHIP_HINT: Record<string, string> = {
  orH: "Opening range high — first 15 minutes of NY (9:30–9:45)",
  orL: "Opening range low — first 15 minutes of NY. Sometimes written OB L.",
  ibH: "Initial balance high — first hour of NY (9:30–10:30)",
  ibL: "Initial balance low — first hour of NY (9:30–10:30)",
};

export function IndicatorChips({
  active,
  onToggle,
  className,
  ids,
}: {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
  className?: string;
  /** When set (playbook kit), only these chips show — not the full default row. */
  ids?: IndicatorId[];
}) {
  const list = ids?.length
    ? [...ids, ...active.filter((id) => !ids.includes(id))]
    : [...DEFAULT_INDICATORS, ...active.filter((id) => !DEFAULT_INDICATORS.includes(id))];
  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-14 left-3 z-20 flex max-w-[min(100%,42rem)] flex-wrap gap-1",
        className,
      )}
    >
      {list.map((id) => {
        const on = active.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(id);
            }}
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
              on ? "bg-bg/80 text-fg" : "bg-bg/35 text-muted hover:text-fg",
            )}
            aria-pressed={on}
            title={CHIP_HINT[id] ?? CHIP_LABEL[id] ?? id}
          >
            {CHIP_LABEL[id] ?? id}
          </button>
        );
      })}
    </div>
  );
}
