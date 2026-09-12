import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LiveDot } from "@/components/live-dot";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { upcomingEcon } from "@/lib/market/calendar";
import { nyToday } from "@/lib/market/clock";
import { fmtPx } from "@/lib/format";
import { getSession } from "@/lib/market/generate";
import { lastSessionBars, sessionFromBars } from "@/lib/market/session";
import { getSymbol, SYMBOLS } from "@/lib/market/symbols";
import { isSeedTrade } from "@/lib/market/seed";
import { computePerformance, takenTrades } from "@/lib/market/stats";
import { useChart, useQuotes } from "@/lib/market/use-feed";
import { isMockOn } from "@/lib/mock";
import { useOrb } from "@/lib/store";
import type { BreakKind, Quote, SessionDay } from "@/lib/market/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: DeskPage });

function DeskPage() {
  const watchlist = useOrb((s) => s.watchlist);
  const addWatch = useOrb((s) => s.addWatch);
  const removeWatch = useOrb((s) => s.removeWatch);
  const trades = useOrb((s) => s.trades);
  const mock = useOrb((s) => Boolean(s.useMockData && s.mockDay));
  const taken = takenTrades(trades, mock);
  const perf = computePerformance(taken);
  const { quotes, live } = useQuotes(watchlist);
  const [clock, setClock] = useState("");
  const today = useMemo(() => nyToday(), []);
  const events = upcomingEcon(today, 5);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div>
      <PageHead kicker="Desk" title="What's in play">
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums text-fg">
            {today} · {clock || "—"} ET
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <LiveDot live={live} label={live ? "Yahoo tape" : "Connecting"} />
            {mock ? <Badge tone="warn">Model today</Badge> : null}
          </div>
        </div>
      </PageHead>

      <div className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <Stat label="Net P&L" value={<PnlText value={perf.net} />} hint={`${perf.trades} taken fills`} />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Win rate"
                value={perf.trades ? `${Math.round(perf.winRate * 100)}%` : "—"}
                hint={perf.trades ? `PF ${perf.profitFactor.toFixed(2)}` : "no fills yet"}
              />
            </Panel>
            <Panel className="p-4">
              <Stat label="Max drawdown" value={<PnlText value={-perf.maxDrawdown} />} hint={`avg R ${perf.avgR.toFixed(2)}`} />
            </Panel>
          </div>

          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Watchlist</h2>
              <WatchAdd ids={watchlist} onAdd={addWatch} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Symbol</th>
                    <th className="px-2 py-2 font-medium">Last</th>
                    <th className="px-2 py-2 font-medium">Change</th>
                    <th className="px-2 py-2 font-medium">Spark</th>
                    <th className="px-4 py-2 font-medium">Day</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((id) => (
                    <WatchRow key={id} id={id} quote={quotes[id]} live={live} onRemove={() => removeWatch(id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-3 md:grid-cols-2">
            {watchlist.slice(0, 4).map((id) => (
              <SessionCard key={id} id={id} quote={quotes[id]} live={live} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Calendar</h2>
            <p className="mt-1 text-[11px] text-subtle">Scheduled US prints — no invented actuals. Desk calendar through Mar 2027.</p>
            <ul className="mt-3 space-y-3">
              {events.length === 0 ? (
                <li className="text-sm text-muted">No scheduled prints remaining in this window.</li>
              ) : (
                events.map((e) => (
                  <li key={`${e.date}-${e.time}-${e.title}`} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm">{e.title}</div>
                      <div className="text-xs text-muted">
                        {e.date === today ? "Today" : e.date.slice(5)} · {e.time} ET
                        {e.period ? ` · ${e.period}` : ""}
                      </div>
                    </div>
                    <Badge tone={e.impact === "high" ? "warn" : "muted"}>{e.impact}</Badge>
                  </li>
                ))
              )}
            </ul>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Recent fills</h2>
            <ul className="mt-3 space-y-2">
              {taken.slice(0, 6).length === 0 ? (
                <li className="text-sm text-muted">Empty ledger — add a journal fill or paper a replay.</li>
              ) : (
                taken.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-mono">{t.symbol}</span>
                      <span className="text-muted"> · {t.setup}</span>
                      {isSeedTrade(t) ? <span className="text-subtle"> · mock</span> : null}
                    </div>
                    <PnlText value={t.pnl} />
                  </li>
                ))
              )}
            </ul>
            <Link to="/app/journal" className="mt-3 inline-block text-xs text-muted hover:text-fg">
              Open journal
            </Link>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Today's read</h2>
            <TodayRead watchlist={watchlist} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WatchAdd({ ids, onAdd }: { ids: string[]; onAdd: (id: string) => void }) {
  const unused = SYMBOLS.filter((s) => !ids.includes(s.id));
  if (!unused.length) return <span className="text-xs text-muted">Last · change</span>;
  return (
    <NativeSelect
      className="h-8 text-xs"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
        e.target.value = "";
      }}
    >
      <option value="">Add symbol</option>
      {unused.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </NativeSelect>
  );
}

function WatchRow({
  id,
  quote,
  live,
  onRemove,
}: {
  id: string;
  quote?: Quote;
  live: boolean;
  onRemove: () => void;
}) {
  const spec = getSymbol(id);
  const has = Boolean(quote && quote.last > 0);
  const px = has ? quote!.last : null;
  const ch = has ? quote!.changePct : 0;
  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="px-4 py-3">
        <div className="font-mono">{spec.label}</div>
        <div className="text-xs text-muted">{spec.name}</div>
      </td>
      <td className="px-2 py-3 font-mono tabular-nums">{px != null ? fmtPx(px, spec.digits) : "—"}</td>
      <td className="px-2 py-3">{has ? <PnlText value={ch} as="pct" /> : <span className="text-subtle">—</span>}</td>
      <td className="px-2 py-3">
        <Spark values={quote?.spark ?? []} up={ch >= 0} />
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        {has
          ? `${fmtPx(quote!.low, spec.digits)} – ${fmtPx(quote!.high, spec.digits)}`
          : live
            ? "waiting"
            : "connecting"}
      </td>
      <td className="px-3 py-3 text-right">
        <button type="button" className="text-[11px] text-muted hover:text-fg" onClick={onRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}

function SessionCard({ id, quote, live }: { id: string; quote?: Quote; live: boolean }) {
  const spec = getSymbol(id);
  const { chart } = useChart(id, "5m", "1d", 20000);
  const today = nyToday();
  const session = useMemo((): SessionDay | null => {
    if (chart?.bars.length) {
      try {
        const dayBars = lastSessionBars(chart.bars, id);
        return sessionFromBars({
          symbol: id,
          date: today,
          bars: dayBars,
          prevClose: chart.prevClose,
          barMinutes: 5,
        });
      } catch {
        /* fall through */
      }
    }
    return isMockOn() ? getSession(id, today, 5) : null;
  }, [chart, id, today]);
  const last = quote && quote.last > 0 ? quote.last : session?.close && session.close > 0 ? session.close : null;

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono">{spec.label}</div>
        <Badge tone={quote && quote.last > 0 ? "long" : "muted"}>{quote && quote.last > 0 ? "live" : live ? "…" : "connecting"}</Badge>
      </div>
      <div className="mt-2 font-mono text-xl tabular-nums">{last != null ? fmtPx(last, spec.digits) : "—"}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-subtle">Open range</div>
          <div className="font-mono tabular-nums text-fg">
            {session ? `${fmtPx(session.orb.low, spec.digits)} – ${fmtPx(session.orb.high, spec.digits)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-subtle">IB</div>
          <div className="font-mono tabular-nums text-fg">
            {session ? `${fmtPx(session.ib.low, spec.digits)} – ${fmtPx(session.ib.high, spec.digits)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-subtle">VWAP</div>
          <div className="font-mono tabular-nums">{session ? fmtPx(session.vwap, spec.digits) : "—"}</div>
        </div>
        <div>
          <div className="text-subtle">Prior close</div>
          <div className="font-mono tabular-nums">{session ? fmtPx(session.prevClose, spec.digits) : "—"}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {session ? (
            <>
              Gap {session.gapFilled ? "filled" : "open"} · <BreakLabel kind={session.orbBreak} />
            </>
          ) : (
            "Waiting on tape"
          )}
        </span>
        {quote && quote.last > 0 ? <PnlText value={quote.changePct} as="pct" /> : null}
      </div>
    </Panel>
  );
}

function BreakLabel({ kind }: { kind: BreakKind }) {
  if (kind === "up") return <span className="text-long">OR break up</span>;
  if (kind === "down") return <span className="text-short">OR break down</span>;
  if (kind === "both") return <span className="text-warn">two-way</span>;
  return <span>range holds</span>;
}

function TodayRead({ watchlist }: { watchlist: string[] }) {
  const id = watchlist.includes("NQ") ? "NQ" : (watchlist[0] ?? "NQ");
  const spec = getSymbol(id);
  const { chart, live } = useChart(id, "5m", "1d", 20000);
  const today = nyToday();
  const session = useMemo((): SessionDay | null => {
    if (chart?.bars.length) {
      try {
        const dayBars = lastSessionBars(chart.bars, id);
        return sessionFromBars({
          symbol: id,
          date: today,
          bars: dayBars,
          prevClose: chart.prevClose,
          barMinutes: 5,
        });
      } catch {
        /* fall through */
      }
    }
    return isMockOn() ? getSession(id, today, 5) : null;
  }, [chart, id, today]);

  if (!session) {
    return (
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {live ? "Session levels print once the tape has enough bars." : "Waiting on the live tape."} Map OR and IB
        before you size.
      </p>
    );
  }

  const or =
    session.orbBreak === "up"
      ? "OR broke high"
      : session.orbBreak === "down"
        ? "OR broke low"
        : session.orbBreak === "both"
          ? "OR went both ways — stand down or fade the second break"
          : "OR still holds";
  const gap = session.gapFilled ? "overnight gap filled" : "gap still open";

  return (
    <p className="mt-2 text-sm leading-relaxed text-muted">
      {spec.label}: {or}. {gap}. IB {fmtPx(session.ib.low, spec.digits)}–{fmtPx(session.ib.high, spec.digits)}. Size
      from the journal, not the last tick.
    </p>
  );
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <span className="text-xs text-subtle">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const w = 72;
  const h = 22;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - lo) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className={cn(up ? "text-long" : "text-short")}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
