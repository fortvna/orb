import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Drawing } from "./drawings";
import { DEFAULT_INDICATORS } from "./market/indicators";
import { hydratePlaybook } from "./market/playbook-parse";
import { buildSeedTrades, buildSeedEvaluations, PLAYBOOKS } from "./market/seed";
import { WATCHLIST_DEFAULT } from "./market/symbols";
import type {
  CustomReport,
  IndicatorId,
  Playbook,
  PlaybookEvaluation,
  Trade,
} from "./market/types";

export const EMPTY_DRAWINGS: Drawing[] = [];

type OrbState = {
  ready: boolean;
  trades: Trade[];
  playbooks: Playbook[];
  evaluations: PlaybookEvaluation[];
  customReports: CustomReport[];
  watchlist: string[];
  propId: string;
  notes: Record<string, string>;
  drawings: Record<string, Drawing[]>;
  indicators: IndicatorId[];
  hydrate: () => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  closeTrade: (id: string, exit: number, exitTime: number, pnl: number, rMultiple: number) => void;
  removeTrade: (id: string) => void;
  setWatchlist: (ids: string[]) => void;
  setPropId: (id: string) => void;
  setPlaybookStatus: (id: string, status: Playbook["status"]) => void;
  addPlaybook: (playbook: Playbook) => void;
  updatePlaybook: (id: string, patch: Partial<Playbook>) => void;
  removePlaybook: (id: string) => void;
  importPlaybooks: (list: Playbook[]) => number;
  saveEvaluation: (ev: PlaybookEvaluation) => void;
  addCustomReport: (r: CustomReport) => void;
  removeCustomReport: (id: string) => void;
  setIndicators: (ids: IndicatorId[]) => void;
  toggleIndicator: (id: IndicatorId) => void;
  setDrawings: (key: string, drawings: Drawing[]) => void;
  setNote: (id: string, note: string) => void;
  resetDemo: () => void;
};

const emptyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useOrb = create<OrbState>()(
  persist(
    (set, get) => ({
      ready: false,
      trades: [],
      playbooks: PLAYBOOKS,
      evaluations: [],
      customReports: [],
      watchlist: WATCHLIST_DEFAULT,
      propId: "apex-50",
      notes: {},
      drawings: {},
      indicators: DEFAULT_INDICATORS,
      hydrate: () => {
        if (get().ready) return;
        const playbooks = (get().playbooks.length ? get().playbooks : PLAYBOOKS).map((p) =>
          hydratePlaybook(p),
        );
        let evaluations = get().evaluations;
        let nextBooks = playbooks;
        if (evaluations.length === 0) {
          evaluations = buildSeedEvaluations(playbooks);
          const byId = new Map(evaluations.map((e) => [e.playbookId, e]));
          nextBooks = playbooks.map((p) => {
            const ev = byId.get(p.id);
            return ev ? { ...p, evaluation: ev.summary } : p;
          });
        }
        const trades = get().trades.length === 0 ? buildSeedTrades() : get().trades;
        set({ trades, playbooks: nextBooks, evaluations, ready: true });
      },
      addTrade: (trade) => set({ trades: [trade, ...get().trades] }),
      updateTrade: (id, patch) =>
        set({ trades: get().trades.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      closeTrade: (id, exit, exitTime, pnl, rMultiple) =>
        set({
          trades: get().trades.map((t) =>
            t.id === id ? { ...t, exit, exitTime, pnl, rMultiple, open: false } : t,
          ),
        }),
      removeTrade: (id) => set({ trades: get().trades.filter((t) => t.id !== id) }),
      setWatchlist: (ids) => set({ watchlist: ids }),
      setPropId: (id) => set({ propId: id }),
      setPlaybookStatus: (id, status) =>
        set({
          playbooks: get().playbooks.map((p) => (p.id === id ? { ...p, status } : p)),
        }),
      addPlaybook: (playbook) => set({ playbooks: [hydratePlaybook(playbook), ...get().playbooks] }),
      updatePlaybook: (id, patch) =>
        set({
          playbooks: get().playbooks.map((p) => (p.id === id ? hydratePlaybook({ ...p, ...patch }) : p)),
        }),
      removePlaybook: (id) => set({ playbooks: get().playbooks.filter((p) => p.id !== id) }),
      importPlaybooks: (list) => {
        if (!list.length) return 0;
        const existing = new Set(get().playbooks.map((p) => p.name.toLowerCase()));
        const incoming = list.map((p, i) => {
          const name = existing.has(p.name.toLowerCase()) ? `${p.name} (${i + 1})` : p.name;
          existing.add(name.toLowerCase());
          return hydratePlaybook({ ...p, name, origin: p.origin ?? "imported" });
        });
        set({ playbooks: [...incoming, ...get().playbooks] });
        return incoming.length;
      },
      saveEvaluation: (ev) => {
        const evaluations = [ev, ...get().evaluations.filter((e) => e.playbookId !== ev.playbookId)];
        set({
          evaluations,
          playbooks: get().playbooks.map((p) =>
            p.id === ev.playbookId ? { ...p, evaluation: ev.summary, status: p.status === "draft" ? "active" : p.status } : p,
          ),
          trades: [
            ...ev.trades,
            ...get().trades.filter((t) => !(t.source === "evaluated" && t.playbookId === ev.playbookId)),
          ],
        });
      },
      addCustomReport: (r) => set({ customReports: [r, ...get().customReports] }),
      removeCustomReport: (id) =>
        set({ customReports: get().customReports.filter((r) => r.id !== id) }),
      setIndicators: (ids) => set({ indicators: ids }),
      toggleIndicator: (id) => {
        const cur = get().indicators;
        set({
          indicators: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        });
      },
      setDrawings: (key, drawings) =>
        set({ drawings: { ...get().drawings, [key]: drawings } }),
      setNote: (id, note) => set({ notes: { ...get().notes, [id]: note } }),
      resetDemo: () =>
        set({
          trades: buildSeedTrades(),
          playbooks: PLAYBOOKS,
          evaluations: [],
          customReports: [],
          watchlist: WATCHLIST_DEFAULT,
          propId: "apex-50",
          notes: {},
          drawings: {},
          indicators: DEFAULT_INDICATORS,
        }),
    }),
    {
      name: "orb-store-v4",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? emptyStorage : localStorage,
      ),
      skipHydration: true,
      partialize: (s) => ({
        trades: s.trades,
        playbooks: s.playbooks,
        evaluations: s.evaluations,
        customReports: s.customReports,
        watchlist: s.watchlist,
        propId: s.propId,
        notes: s.notes,
        drawings: s.drawings,
        indicators: s.indicators,
      }),
    },
  ),
);
