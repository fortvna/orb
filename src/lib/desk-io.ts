import type { Drawing } from "./drawings";
import type { CustomReport, IndicatorId, Playbook, PlaybookEvaluation, Trade } from "./market/types";

export type DeskSnapshot = {
  v: 1;
  at: string;
  trades: Trade[];
  playbooks: Playbook[];
  evaluations: PlaybookEvaluation[];
  customReports: CustomReport[];
  watchlist: string[];
  propId: string;
  propStartedAt: string | null;
  notes: Record<string, string>;
  drawings: Record<string, Drawing[]>;
  indicators: IndicatorId[];
};

export function parseDeskSnapshot(text: string): DeskSnapshot | null {
  try {
    const raw = JSON.parse(text) as Partial<DeskSnapshot> & { v?: number };
    if (!raw || raw.v !== 1) return null;
    if (!Array.isArray(raw.trades) || !Array.isArray(raw.playbooks)) return null;
    return {
      v: 1,
      at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
      trades: raw.trades,
      playbooks: raw.playbooks,
      evaluations: Array.isArray(raw.evaluations) ? raw.evaluations : [],
      customReports: Array.isArray(raw.customReports) ? raw.customReports : [],
      watchlist: Array.isArray(raw.watchlist) ? raw.watchlist.map(String) : [],
      propId: typeof raw.propId === "string" ? raw.propId : "apex-50",
      propStartedAt: typeof raw.propStartedAt === "string" && raw.propStartedAt ? raw.propStartedAt : null,
      notes: raw.notes && typeof raw.notes === "object" ? raw.notes : {},
      drawings: raw.drawings && typeof raw.drawings === "object" ? raw.drawings : {},
      indicators: Array.isArray(raw.indicators) ? (raw.indicators as IndicatorId[]) : [],
    };
  } catch {
    return null;
  }
}
