import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/page-head";
import { DeskChain } from "@/components/desk-chain";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { closedTrades, dailyPnl } from "@/lib/market/stats";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";
import { weekdayName } from "@/lib/format";

export const Route = createFileRoute("/app/journal")({ component: JournalPage });

function JournalPage() {
  const trades = useOrb((s) => s.trades);
  const closed = closedTrades(trades);
  const daily = dailyPnl(trades);
  const [month, setMonth] = useState(() => monthOf(daily.at(-1)?.date ?? closed[0]?.date));
  const [selected, setSelected] = useState<string | null>(daily.at(-1)?.date ?? null);

  const months = useMemo(() => {
    const set = new Set(daily.map((d) => d.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [daily]);

  const cells = useMemo(() => buildMonth(month, daily), [month, daily]);
  const dayTrades = closed.filter((t) => t.date === selected);
  const dayNet = dayTrades.reduce((s, t) => s + t.pnl, 0);
  const monthDays = daily.filter((d) => d.date.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.pnl, 0);
  const monthWins = monthDays.filter((d) => d.pnl > 0).length;
  const monthN = monthDays.filter((d) => d.n > 0).length;

  return (
    <div>
      <PageHead kicker="Journal" title="Calendar">
        <div className="flex flex-col items-end gap-2">
          <DeskChain current="/app/journal" />
          <NativeSelect value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {labelMonth(m)}
            </option>
          ))}
        </NativeSelect>
        </div>
      </PageHead>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <Stat label="Month net" value={<PnlText value={monthNet} />} hint={`${monthN} trading days`} />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Green days"
                value={`${monthWins}/${monthN || 0}`}
                hint={`${monthN ? Math.round((monthWins / monthN) * 100) : 0}%`}
              />
            </Panel>
            <Panel className="p-4">
              <Stat label="Fills" value={`${closed.filter((t) => t.date.startsWith(month)).length}`} hint="this month" />
            </Panel>
          </div>

          <Panel className="p-4">
            <div className="grid grid-cols-7 gap-1">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={`${d}${i}`} className="pb-2 text-center text-[10px] uppercase tracking-[0.12em] text-subtle">
                  {d}
                </div>
              ))}
              {cells.map((c, i) => {
                if (!c.date) return <div key={i} />;
                const active = selected === c.date;
                return (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() => setSelected(c.date)}
                    className={cn(
                      "aspect-square rounded-md p-1 text-left",
                      c.n === 0 && "bg-surface-2/40 text-subtle",
                      c.n > 0 && c.pnl > 0 && "bg-long/25 text-fg",
                      c.n > 0 && c.pnl < 0 && "bg-short/25 text-fg",
                      c.n > 0 && c.pnl === 0 && "bg-surface text-fg",
                      active && "ring-1 ring-steel",
                    )}
                  >
                    <div className="text-[10px] text-muted">{Number(c.date.slice(8))}</div>
                    {c.n > 0 ? (
                      <div className="mt-1 font-mono text-[10px] tabular-nums">
                        {c.pnl >= 0 ? "+" : ""}
                        {Math.round(c.pnl)}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel className="p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                    {weekdayName(new Date(`${selected}T12:00:00Z`).getUTCDay())}
                  </div>
                  <h2 className="font-mono text-sm">{selected}</h2>
                </div>
                <PnlText value={dayNet} className="text-lg" />
              </div>
              <p className="mt-1 text-xs text-muted">{dayTrades.length} fills</p>
              <ul className="mt-4 space-y-2">
                {dayTrades.length === 0 ? (
                  <li className="text-sm text-muted">No fills this session.</li>
                ) : (
                  dayTrades.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{t.symbol}</span>
                          <Badge tone={t.side === "long" ? "long" : "short"}>{t.side}</Badge>
                        </div>
                        <div className="text-xs text-muted">{t.setup}</div>
                      </div>
                      <PnlText value={t.pnl} />
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Pick a day.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function monthOf(date?: string) {
  return (date ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function labelMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMonth(ym: string, daily: { date: string; pnl: number; n: number }[]) {
  const map = new Map(daily.map((d) => [d.date, d]));
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  const pad = (start.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells: { date: string | null; pnl: number; n: number }[] = Array.from({ length: pad }, () => ({
    date: null,
    pnl: 0,
    n: 0,
  }));
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    const hit = map.get(date);
    cells.push({ date, pnl: hit?.pnl ?? 0, n: hit?.n ?? 0 });
  }
  return cells;
}
