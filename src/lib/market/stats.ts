import type { Trade } from "./types";

export type Performance = {
  net: number;
  gross: number;
  fees: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  avgR: number;
  maxDrawdown: number;
  best: number;
  worst: number;
  equity: { t: number; v: number; date: string }[];
};

/** Fills the trader actually took — journal + replay. Never evaluated backtests. */
export function takenTrades(trades: Trade[], includeSeed = true): Trade[] {
  return trades.filter((t) => {
    if (t.source !== "journal" && t.source !== "replay" && t.source !== "prop") return false;
    if (!includeSeed && (t.id.startsWith("sd-") || t.tags.includes("mock"))) return false;
    return true;
  });
}

export function closedTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => !t.open && t.exit !== null);
}

export function computePerformance(trades: Trade[]): Performance {
  const closed = [...closedTrades(trades)].sort((a, b) => a.entryTime - b.entryTime);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl <= 0);
  const grossWins = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLossAbs = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const net = closed.reduce((s, t) => s + t.pnl, 0);
  const fees = closed.reduce((s, t) => s + t.fees, 0);

  let peak = 0;
  let eq = 0;
  let maxDd = 0;
  const equity = closed.map((t) => {
    eq += t.pnl;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
    return { t: t.exitTime ?? t.entryTime, v: eq, date: t.date };
  });

  return {
    net,
    gross: net + fees,
    fees,
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    profitFactor: grossLossAbs === 0 ? (grossWins > 0 ? 99 : 0) : grossWins / grossLossAbs,
    expectancy: closed.length ? net / closed.length : 0,
    avgWin: wins.length ? grossWins / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
    avgR: closed.length ? closed.reduce((s, t) => s + t.rMultiple, 0) / closed.length : 0,
    maxDrawdown: maxDd,
    best: closed.reduce((m, t) => Math.max(m, t.pnl), 0),
    worst: closed.reduce((m, t) => Math.min(m, t.pnl), 0),
    equity,
  };
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function dailyPnl(trades: Trade[]): { date: string; pnl: number; n: number }[] {
  const map = new Map<string, { pnl: number; n: number }>();
  for (const t of closedTrades(trades)) {
    const cur = map.get(t.date) ?? { pnl: 0, n: 0 };
    cur.pnl += t.pnl;
    cur.n += 1;
    map.set(t.date, cur);
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function hourOfNy(unix: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/New_York",
  }).formatToParts(new Date(unix * 1000));
  const raw = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(raw === "24" ? "0" : raw);
}

export type Bucket = {
  key: string;
  label: string;
  n: number;
  wins: number;
  winRate: number;
  net: number;
  avgR: number;
};

export function bucketTrades(
  trades: Trade[],
  of: (t: Trade) => { key: string; label: string },
): Bucket[] {
  const closed = closedTrades(trades);
  const map = new Map<string, { label: string; items: Trade[] }>();
  for (const t of closed) {
    const { key, label } = of(t);
    const cur = map.get(key) ?? { label, items: [] };
    cur.items.push(t);
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => {
      const wins = v.items.filter((t) => t.pnl > 0).length;
      const net = v.items.reduce((s, t) => s + t.pnl, 0);
      const avgR = v.items.reduce((s, t) => s + t.rMultiple, 0) / (v.items.length || 1);
      return {
        key,
        label: v.label,
        n: v.items.length,
        wins,
        winRate: v.items.length ? wins / v.items.length : 0,
        net,
        avgR,
      };
    })
    .sort((a, b) => b.n - a.n || Math.abs(b.net) - Math.abs(a.net));
}

export function bySetup(trades: Trade[]): Bucket[] {
  return bucketTrades(trades, (t) => {
    const label = t.setup.trim() || "Untagged";
    return { key: label.toLowerCase(), label };
  });
}

export function byWeekdayTaken(trades: Trade[]): Bucket[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = bucketTrades(trades, (t) => {
    const wd = new Date(`${t.date}T12:00:00Z`).getUTCDay();
    return { key: String(wd), label: names[wd] ?? "?" };
  });
  return [1, 2, 3, 4, 5, 0, 6]
    .map((wd) => rows.find((r) => r.key === String(wd)))
    .filter((r): r is Bucket => Boolean(r));
}

export function byHourTaken(trades: Trade[]): Bucket[] {
  return bucketTrades(trades, (t) => {
    const h = hourOfNy(t.entryTime);
    const label = `${String(h).padStart(2, "0")}:00`;
    return { key: label, label };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

export function bySourceTaken(trades: Trade[]): Bucket[] {
  return bucketTrades(trades, (t) => {
    if (t.source === "replay") return { key: "replay", label: "Replay" };
    if (t.source === "prop") return { key: "prop", label: "Prop" };
    return { key: "journal", label: "Journal" };
  });
}
