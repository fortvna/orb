import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { buildSeedTrades, PLAYBOOKS } from "./market/seed";
import { WATCHLIST_DEFAULT } from "./market/symbols";
import type { Playbook, Trade } from "./market/types";

type OrbState = {
  ready: boolean;
  trades: Trade[];
  playbooks: Playbook[];
  watchlist: string[];
  propId: string;
  notes: Record<string, string>;
  hydrate: () => void;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  closeTrade: (id: string, exit: number, exitTime: number, pnl: number, rMultiple: number) => void;
  removeTrade: (id: string) => void;
  setWatchlist: (ids: string[]) => void;
  setPropId: (id: string) => void;
  setPlaybookStatus: (id: string, status: Playbook["status"]) => void;
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
      watchlist: WATCHLIST_DEFAULT,
      propId: "apex-50",
      notes: {},
      hydrate: () => {
        if (get().ready) return;
        if (get().trades.length === 0) {
          set({ trades: buildSeedTrades(), playbooks: PLAYBOOKS, ready: true });
        } else {
          set({ ready: true });
        }
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
      setNote: (id, note) => set({ notes: { ...get().notes, [id]: note } }),
      resetDemo: () =>
        set({
          trades: buildSeedTrades(),
          playbooks: PLAYBOOKS,
          watchlist: WATCHLIST_DEFAULT,
          propId: "apex-50",
          notes: {},
        }),
    }),
    {
      name: "orb-store-v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? emptyStorage : localStorage,
      ),
      skipHydration: true,
      partialize: (s) => ({
        trades: s.trades,
        playbooks: s.playbooks,
        watchlist: s.watchlist,
        propId: s.propId,
        notes: s.notes,
      }),
    },
  ),
);
