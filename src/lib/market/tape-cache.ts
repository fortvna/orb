import {
  packStorageId,
  tapePackMetaFrom,
  TAPE_MAX_BARS,
  type TapePack,
  type TapePackBar,
  type TapePackMeta,
} from "./tape-pack";

export const TAPE_BARS_STORAGE_KEY = "orb-tape-bars-v0";
const MAX_BYTES = 4_500_000;

type CompactBar = [number, number, number, number, number, number];
type Stored = Record<string, { s: string; src: TapePack["source"]; tz: string; b: CompactBar[] }>;

type MemPack = {
  symbol: string;
  source: TapePack["source"];
  session_tz: string;
  bars: TapePackBar[];
};

const mem = new Map<string, MemPack>();
let hydrated = false;

function expand(b: CompactBar): TapePackBar {
  return { time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] };
}

function compact(b: TapePackBar): CompactBar {
  return [b.time, b.open, b.high, b.low, b.close, b.volume];
}

export function hydrateTapeCache(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TAPE_BARS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Stored;
    for (const [id, row] of Object.entries(parsed)) {
      if (!row || !Array.isArray(row.b)) continue;
      mem.set(id, {
        symbol: row.s,
        source: row.src ?? "manual",
        session_tz: row.tz || "America/New_York",
        bars: row.b.slice(0, TAPE_MAX_BARS).map(expand),
      });
    }
  } catch {
    /* corrupt cache — start empty */
  }
}

function persistAll(): { persisted: boolean; warning?: string } {
  if (typeof window === "undefined") return { persisted: false, warning: "Not in a browser." };
  const stored: Stored = {};
  for (const [id, row] of mem) {
    stored[id] = { s: row.symbol, src: row.source, tz: row.session_tz, b: row.bars.map(compact) };
  }
  try {
    const json = JSON.stringify(stored);
    if (json.length > MAX_BYTES) {
      return {
        persisted: false,
        warning: `Pack is ${Math.round(json.length / 1_000_000)}MB — over the ${Math.round(MAX_BYTES / 1_000_000)}MB localStorage budget. Kept in memory only for this tab.`,
      };
    }
    window.localStorage.setItem(TAPE_BARS_STORAGE_KEY, json);
    return { persisted: true };
  } catch {
    return {
      persisted: false,
      warning: "localStorage quota hit. Pack is in memory for this tab only — export the JSON if you need it later.",
    };
  }
}

export function writeTapePack(pack: TapePack): { id: string; persisted: boolean; warning?: string; meta: TapePackMeta } {
  hydrateTapeCache();
  const id = packStorageId(pack.symbol);
  mem.set(id, {
    symbol: pack.symbol,
    source: pack.source,
    session_tz: pack.session_tz,
    bars: pack.bars,
  });
  const result = persistAll();
  return {
    id,
    persisted: result.persisted,
    warning: result.warning,
    meta: tapePackMetaFrom(pack, id, Date.now(), result.persisted),
  };
}

export function deleteTapePack(id: string): void {
  hydrateTapeCache();
  mem.delete(id);
  persistAll();
}

export function clearAllTapePacks(): void {
  mem.clear();
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TAPE_BARS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredTapePack(id: string): TapePack | null {
  hydrateTapeCache();
  const row = mem.get(id);
  if (!row) return null;
  return {
    schema: "fortvna.tape.v0",
    symbol: row.symbol,
    interval: "1m",
    source: row.source,
    session_tz: row.session_tz,
    bars: row.bars,
  };
}

export function getTapePackForSymbol(symbol: string): TapePack | null {
  return getStoredTapePack(packStorageId(symbol));
}

export function listStoredTapePacks(): TapePack[] {
  hydrateTapeCache();
  return [...mem.keys()].map((id) => getStoredTapePack(id)!).filter(Boolean);
}
