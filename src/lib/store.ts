import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Drawing } from "./drawings";
import { DEFAULT_INDICATORS } from "./market/indicators";
import { hydratePlaybook } from "./market/playbook-parse";
import { nyToday } from "./market/clock";
import { buildSeedTradesForDay, isSeedTrade, PLAYBOOKS } from "./market/seed";
import { WATCHLIST_DEFAULT } from "./market/symbols";
import { isMockOn, syncMock } from "./mock";
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
  ledgerClean: boolean;
  useMockData: boolean;
  mockDay: string | null;
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
  hydrate: () => void;
  setMockData: (on: boolean) => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  closeTrade: (id: string, exit: number, exitTime: number, pnl: number, rMultiple: number) => void;
  removeTrade: (id: string) => void;
  setWatchlist: (ids: string[]) => void;
  addWatch: (id: string) => void;
  removeWatch: (id: string) => void;
  setPropId: (id: string) => void;
  setPropStartedAt: (date: string | null) => void;
  setPlaybookStatus: (id: string, status: Playbook["status"]) => void;
  addPlaybook: (playbook: Playbook) => void;
  updatePlaybook: (id: string, patch: Partial<Playbook>) => void;
  removePlaybook: (id: string) => void;
  importPlaybooks: (list: Playbook[]) => number;
  importTrades: (list: Trade[]) => number;
  saveEvaluation: (ev: PlaybookEvaluation) => void;
  addCustomReport: (r: CustomReport) => void;
  removeCustomReport: (id: string) => void;
  setIndicators: (ids: IndicatorId[]) => void;
  toggleIndicator: (id: IndicatorId) => void;
  setDrawings: (key: string, drawings: Drawing[]) => void;
  setNote: (id: string, note: string) => void;
  clearLedger: () => void;
  resetDemo: () => void;
  importDesk: (snap: {
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
  }) => void;
};

const emptyStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function stripSeed(trades: Trade[]): Trade[] {
  return trades.filter((t) => !isSeedTrade(t));
}

function realignMock(state: {
  useMockData: boolean;
  mockDay: string | null;
  trades: Trade[];
}): { useMockData: boolean; mockDay: string | null; trades: Trade[] } {
  const today = nyToday();
  const on = state.useMockData && state.mockDay === today;
  if (!on) {
    syncMock(false, null);
    return { useMockData: false, mockDay: null, trades: stripSeed(state.trades) };
  }
  syncMock(true, today);
  const live = stripSeed(state.trades);
  const mock = buildSeedTradesForDay(today);
  return { useMockData: true, mockDay: today, trades: [...mock, ...live] };
}

function mergeDeskBooks(existing: Playbook[]): Playbook[] {
  const hydrated = existing.map((p) => {
    const next = hydratePlaybook(p);
    const seed = PLAYBOOKS.find((s) => s.id === next.id);
    if (!seed || next.origin !== "desk") return next;
    if (next.id === "pb-vwap" && next.rules.some((r) => /delta/i.test(r))) {
      return {
        ...next,
        thesis: seed.thesis,
        rules: seed.rules,
        invalidation: seed.invalidation,
        mentorNotes: seed.mentorNotes,
        indicators: seed.indicators,
      };
    }
    return next;
  });
  const seen = new Set(hydrated.map((p) => p.id));
  const extra = PLAYBOOKS.filter((p) => !seen.has(p.id));
  return extra.length ? [...hydrated, ...extra] : hydrated;
}

function reconcilePlaybooks(playbooks: Playbook[], evaluations: PlaybookEvaluation[]): Playbook[] {
  const byId = new Map(evaluations.map((e) => [e.playbookId, e]));
  return playbooks.map((p) => {
    const ev = byId.get(p.id);
    if (!ev || !ev.summary.sessions) {
      return {
        ...p,
        evaluation: undefined,
        validated: false,
        status: p.status === "validated" ? "active" : p.status,
      };
    }
    return { ...p, evaluation: ev.summary };
  });
}

export const useOrb = create<OrbState>()(
  persist(
    (set, get) => ({
      ready: false,
      ledgerClean: false,
      useMockData: false,
      mockDay: null,
      trades: [],
      playbooks: PLAYBOOKS,
      evaluations: [],
      customReports: [],
      watchlist: WATCHLIST_DEFAULT,
      propId: "apex-50",
      propStartedAt: null,
      notes: {},
      drawings: {},
      indicators: DEFAULT_INDICATORS,
      hydrate: () => {
        if (get().ready) return;
        const playbooks = mergeDeskBooks(get().playbooks.length ? get().playbooks : PLAYBOOKS);
        const levels: IndicatorId[] = ["orH", "orL", "ibH", "ibL"];
        const indicators = levels.some((id) => get().indicators.includes(id))
          ? get().indicators
          : [...get().indicators, ...levels];

        let evaluations = get().evaluations;
        let trades = stripSeed(get().trades).filter((t) => t.source !== "evaluated");

        if (!get().ledgerClean) {
          evaluations = [];
        }

        const mock = realignMock({
          useMockData: get().useMockData,
          mockDay: get().mockDay,
          trades,
        });

        set({
          trades: mock.trades,
          playbooks: reconcilePlaybooks(playbooks, evaluations),
          evaluations,
          indicators,
          useMockData: mock.useMockData,
          mockDay: mock.mockDay,
          propStartedAt: get().propStartedAt ?? null,
          ledgerClean: true,
          ready: true,
        });
      },
      setMockData: (on) => {
        const today = nyToday();
        if (on) {
          syncMock(true, today);
          const live = stripSeed(get().trades).filter((t) => t.source !== "evaluated");
          set({
            useMockData: true,
            mockDay: today,
            trades: [...buildSeedTradesForDay(today), ...live],
          });
          return;
        }
        syncMock(false, null);
        set({ useMockData: false, mockDay: null, trades: stripSeed(get().trades).filter((t) => t.source !== "evaluated") });
      },
      addTrade: (trade) => set({ trades: [trade, ...get().trades.filter((t) => t.id !== trade.id)] }),
      updateTrade: (id, patch) =>
        set({ trades: get().trades.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      closeTrade: (id, exit, exitTime, pnl, rMultiple) =>
        set({
          trades: get().trades.map((t) =>
            t.id === id && t.open ? { ...t, exit, exitTime, pnl, rMultiple, open: false } : t,
          ),
        }),
      removeTrade: (id) => set({ trades: get().trades.filter((t) => t.id !== id) }),
      setWatchlist: (ids) => set({ watchlist: ids }),
      addWatch: (id) => {
        if (get().watchlist.includes(id)) return;
        set({ watchlist: [...get().watchlist, id] });
      },
      removeWatch: (id) => set({ watchlist: get().watchlist.filter((x) => x !== id) }),
      setPropId: (id) => set({ propId: id }),
      setPropStartedAt: (date) => set({ propStartedAt: date }),
      setPlaybookStatus: (id, status) =>
        set({
          playbooks: get().playbooks.map((p) => {
            if (p.id !== id) return p;
            if (status === "paused") return { ...p, status: "paused" };
            if (status === "validated") return { ...p, status: "validated", validated: true };
            if (p.validated) return { ...p, status: "validated" };
            return { ...p, status };
          }),
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
          return hydratePlaybook({ ...p, name, origin: p.origin ?? "imported", validated: false, status: p.status === "validated" ? "active" : p.status });
        });
        set({ playbooks: [...incoming, ...get().playbooks] });
        return incoming.length;
      },
      importTrades: (list) => {
        if (!list.length) return 0;
        const existing = new Set(
          get().trades.map((t) => `${t.date}|${t.symbol}|${t.side}|${t.entry}|${t.source}`),
        );
        const incoming = list.filter((t) => {
          if (t.source === "evaluated") return false;
          if (existing.has(`${t.date}|${t.symbol}|${t.side}|${t.entry}|${t.source}`)) return false;
          return true;
        });
        if (!incoming.length) return 0;
        set({ trades: [...incoming, ...get().trades] });
        return incoming.length;
      },
      saveEvaluation: (ev) => {
        const evaluations = [ev, ...get().evaluations.filter((e) => e.playbookId !== ev.playbookId)];
        set({
          evaluations,
          playbooks: get().playbooks.map((p) => {
            if (p.id !== ev.playbookId) return p;
            const nextStatus =
              p.status === "draft" ? "active" : p.status === "validated" ? "validated" : p.status;
            return { ...p, evaluation: ev.summary, status: nextStatus };
          }),
          trades: get().trades.filter((t) => !(t.source === "evaluated" && t.playbookId === ev.playbookId)),
        });
      },
      addCustomReport: (r) => set({ customReports: [r, ...get().customReports] }),
      removeCustomReport: (id) =>
        set({ customReports: get().customReports.filter((r) => r.id !== id) }),
      setIndicators: (ids) => set({ indicators: ids }),
      toggleIndicator: (id) =>
        set((s) => ({
          indicators: s.indicators.includes(id)
            ? s.indicators.filter((x) => x !== id)
            : [...s.indicators, id],
        })),
      setDrawings: (key, drawings) =>
        set({ drawings: { ...get().drawings, [key]: drawings } }),
      setNote: (id, note) => set({ notes: { ...get().notes, [id]: note } }),
      clearLedger: () =>
        set({
          trades: isMockOn() ? buildSeedTradesForDay(nyToday()) : [],
          evaluations: [],
          playbooks: get().playbooks.map((p) => ({
            ...p,
            evaluation: undefined,
            validated: false,
            status: p.status === "validated" ? "active" : p.status,
          })),
        }),
      resetDemo: () => {
        syncMock(false, null);
        set({
          trades: [],
          playbooks: PLAYBOOKS,
          evaluations: [],
          customReports: [],
          watchlist: WATCHLIST_DEFAULT,
          propId: "apex-50",
          propStartedAt: null,
          notes: {},
          drawings: {},
          indicators: DEFAULT_INDICATORS,
          useMockData: false,
          mockDay: null,
          ledgerClean: true,
        });
      },
      importDesk: (snap) => {
        const playbooks = mergeDeskBooks(snap.playbooks.length ? snap.playbooks : PLAYBOOKS);
        const evaluations = snap.evaluations ?? [];
        const live = stripSeed(snap.trades ?? []).filter((t) => t.source !== "evaluated");
        const mock = realignMock({
          useMockData: get().useMockData,
          mockDay: get().mockDay,
          trades: live,
        });
        set({
          trades: mock.trades,
          playbooks: reconcilePlaybooks(playbooks, evaluations),
          evaluations,
          customReports: snap.customReports ?? [],
          watchlist: snap.watchlist.length ? snap.watchlist : WATCHLIST_DEFAULT,
          propId: snap.propId || "apex-50",
          propStartedAt: snap.propStartedAt ?? null,
          notes: snap.notes ?? {},
          drawings: snap.drawings ?? {},
          indicators: snap.indicators.length ? snap.indicators : DEFAULT_INDICATORS,
          ledgerClean: true,
        });
      },
    }),
    {
      name: "orb-store-v4",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? emptyStorage : localStorage,
      ),
      skipHydration: true,
      partialize: (s) => ({
        ledgerClean: s.ledgerClean,
        useMockData: s.useMockData,
        mockDay: s.mockDay,
        trades: s.trades,
        playbooks: s.playbooks,
        evaluations: s.evaluations,
        customReports: s.customReports,
        watchlist: s.watchlist,
        propId: s.propId,
        propStartedAt: s.propStartedAt,
        notes: s.notes,
        drawings: s.drawings,
        indicators: s.indicators,
      }),
    },
  ),
);
