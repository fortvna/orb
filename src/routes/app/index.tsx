import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LiveDot } from "@/components/live-dot";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { ECON_EVENTS } from "@/lib/market/calendar";
import { fmtPx } from "@/lib/format";
import { getSession } from "@/lib/market/generate";
import { sessionFromBars } from "@/lib/market/session";
import { getSymbol } from "@/lib/market/symbols";
import { computePerformance } from "@/lib/market/stats";
import { useChart, useQuotes } from "@/lib/market/use-feed";
import { useOrb } from "@/lib/store";
import type { BreakKind, Quote, SessionDay } from "@/lib/market/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: DeskPage });

function DeskPage() {
  const watchlist = useOrb((s) => s.watchlist);
  const trades = useOrb((s) => s.trades);
  const perf = computePerformance(trades);
  const { quotes, live } = useQuotes(watchlist);
  const [clock, setClock] = useState("");
  const today = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    [],
  );
  const events = ECON_EVENTS.filter((e) => e.date >= today).slice(0, 4);

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
          <div className="mt-1 flex justify-end">
            <LiveDot live={live} label={live ? "Live tape" : "Connecting"} />
          </div>
        </div>
      </PageHead>

      <div className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <Stat label="Net P&L" value={<PnlText value={perf.net} />} hint={`${perf.trades} closed fills`} />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Win rate"
                value={`${Math.round(perf.winRate * 100)}%`}
                hint={`PF ${perf.profitFactor.toFixed(2)}`}
              />
            </Panel>
            <Panel className="p-4">
              <Stat label="Max drawdown" value={<PnlText value={-perf.maxDrawdown} />} hint={`avg R ${perf.avgR.toFixed(2)}`} />
            </Panel>
          </div>

          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Watchlist</h2>
              <span className="text-xs text-muted">Last · change · spark</span>
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
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((id) => (
                    <WatchRow key={id} id={id} quote={quotes[id]} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-3 md:grid-cols-2">
            {watchlist.slice(0, 4).map((id) => (
              <SessionCard key={id} id={id} quote={quotes[id]} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Calendar</h2>
            <ul className="mt-3 space-y-3">
              {events.map((e) => (
                <li key={e.title} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm">{e.title}</div>
                    <div className="text-xs text-muted">
                      {e.date.slice(5)} · {e.time} ET
                    </div>
                  </div>
                  <Badge tone={e.impact === "high" ? "warn" : "muted"}>{e.impact}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Recent fills</h2>
            <ul className="mt-3 space-y-2">
              {trades.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-mono">{t.symbol}</span>
                    <span className="text-muted"> · {t.setup}</span>
                  </div>
                  <PnlText value={t.pnl} />
                </li>
              ))}
            </ul>
            <Link to="/app/journal" className="mt-3 inline-block text-xs text-muted hover:text-fg">
              Open journal
            </Link>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-sm font-medium">Today's read</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tape is live. Map opening range and initial balance on the chart, draw your levels, then
              size from the journal — not from the last tick.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WatchRow({ id, quote }: { id: string; quote?: Quote }) {
  const spec = getSymbol(id);
  const px = quote?.last ?? spec.typical;
  const ch = quote?.changePct ?? 0;
  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="px-4 py-3">
        <div className="font-mono">{spec.label}</div>
        <div className="text-xs text-muted">{spec.name}</div>
      </td>
      <td className="px-2 py-3 font-mono tabular-nums">{fmtPx(px, spec.digits)}</td>
      <td className="px-2 py-3">
        <PnlText value={ch} as="pct" />
      </td>
      <td className="px-2 py-3">
        <Spark values={quote?.spark ?? []} up={ch >= 0} />
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        {quote
          ? `${fmtPx(quote.low, spec.digits)} – ${fmtPx(quote.high, spec.digits)}`
          : "waiting"}
      </td>
    </tr>
  );
}

function SessionCard({ id, quote }: { id: string; quote?: Quote }) {
  const spec = getSymbol(id);
  const { chart } = useChart(id, "5m", "1d", 20000);
  const session = useMemo((): SessionDay => {
    const fallback = getSession(id, new Date().toISOString().slice(0, 10), 5);
    if (!chart?.bars.length) return fallback;
    try {
      return sessionFromBars({
        symbol: id,
        date: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        bars: chart.bars,
        prevClose: chart.prevClose,
        barMinutes: 5,
      });
    } catch {
      return fallback;
    }
  }, [chart, id]);
  const last = quote?.last ?? session.close;

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono">{spec.label}</div>
        <Badge tone={quote ? "long" : "muted"}>{quote ? "live" : "…"}</Badge>
      </div>
      <div className="mt-2 font-mono text-xl tabular-nums">{fmtPx(last, spec.digits)}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-subtle">Open range</div>
          <div className="font-mono tabular-nums text-fg">
            {fmtPx(session.orb.low, spec.digits)} – {fmtPx(session.orb.high, spec.digits)}
          </div>
        </div>
        <div>
          <div className="text-subtle">IB</div>
          <div className="font-mono tabular-nums text-fg">
            {fmtPx(session.ib.low, spec.digits)} – {fmtPx(session.ib.high, spec.digits)}
          </div>
        </div>
        <div>
          <div className="text-subtle">VWAP</div>
          <div className="font-mono tabular-nums">{fmtPx(session.vwap, spec.digits)}</div>
        </div>
        <div>
          <div className="text-subtle">Prior close</div>
          <div className="font-mono tabular-nums">{fmtPx(session.prevClose, spec.digits)}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          Gap {session.gapFilled ? "filled" : "open"} · <BreakLabel kind={session.orbBreak} />
        </span>
        {quote ? <PnlText value={quote.changePct} as="pct" /> : null}
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
