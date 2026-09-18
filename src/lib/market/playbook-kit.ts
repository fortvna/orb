import { fmtClock } from "./clock";
import type { IndicatorId, Playbook, PlaybookKind } from "./types";
import type { SessionHours } from "./session";

export const KIT_CHOICES: { id: IndicatorId; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "keyTimes", label: "KeyTimes" },
  { id: "killzones", label: "Killzones" },
  { id: "orH", label: "OR H" },
  { id: "orL", label: "OR L" },
  { id: "ibH", label: "IB H" },
  { id: "ibL", label: "IB L" },
  { id: "vwap", label: "VWAP" },
  { id: "openPrice", label: "Open" },
  { id: "fvg", label: "FVG" },
  { id: "ema", label: "EMA" },
  { id: "htf", label: "HTF" },
  { id: "po3", label: "PO3" },
];

export function kitForKind(kind: PlaybookKind): IndicatorId[] {
  switch (kind) {
    case "orb":
      return ["volume", "keyTimes", "killzones", "orH", "orL", "vwap"];
    case "ib":
      return ["volume", "keyTimes", "killzones", "orH", "orL", "ibH", "ibL", "vwap"];
    case "gap":
      return ["volume", "keyTimes", "openPrice", "orH", "orL", "vwap"];
    case "vwap":
      return ["volume", "keyTimes", "ibH", "ibL", "vwap", "ema"];
    case "fvg":
      return ["volume", "keyTimes", "killzones", "orH", "orL", "fvg"];
    case "streak":
      return ["volume", "keyTimes", "killzones"];
    default:
      return ["volume", "keyTimes", "orH", "orL", "ibH", "ibL", "vwap"];
  }
}

export function kitOf(playbook: Playbook): IndicatorId[] {
  return playbook.indicators.length ? playbook.indicators : kitForKind(playbook.kind);
}

export function hoursForPlaybook(playbook: Playbook): SessionHours {
  const start = playbook.windowStart;
  const end = playbook.windowEnd;
  if (start >= 18 * 60 || start < 3 * 60) return "asia";
  if (start < 8 * 60) return "london";
  if (end <= 11 * 60) return "nyam";
  if (start >= 9 * 60 + 30 && end <= 16 * 60) return "rth";
  return "all";
}

export function tfMinutes(tf: Playbook["timeframe"]): number {
  if (tf === "1m") return 1;
  if (tf === "15m") return 15;
  return 5;
}

export function kitLabel(id: IndicatorId): string {
  return KIT_CHOICES.find((c) => c.id === id)?.label ?? id;
}

/** Minutes of range mapped before `windowStart`. IB / VWAP use the first hour. */
export function containerMinutes(kind: PlaybookKind): number {
  if (kind === "ib" || kind === "vwap") return 60;
  if (kind === "gap" || kind === "fvg" || kind === "streak") return 0;
  return 15;
}

export function containerClock(playbook: Playbook): { start: number; end: number } | null {
  const mins = containerMinutes(playbook.kind);
  if (mins <= 0) return null;
  const end = playbook.windowStart;
  const start = (end - mins + 24 * 60) % (24 * 60);
  return { start, end };
}

export function rangeLabels(playbook: Playbook): { high: string; low: string; band: string } {
  if (playbook.kind === "ib" || playbook.kind === "vwap") {
    return { high: "IB H", low: "IB L", band: "IB" };
  }
  const clock = containerClock(playbook);
  if (playbook.kind === "orb" && clock && clock.start === 9 * 60 + 30) {
    return { high: "OR H", low: "OR L", band: "OR" };
  }
  if (clock) {
    const stamp = fmtClock(clock.start);
    return { high: `${stamp} H`, low: `${stamp} L`, band: stamp };
  }
  return { high: "Range H", low: "Range L", band: "Range" };
}
