import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHead } from "@/components/page-head";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { PnlText } from "@/components/pnl";
import { AS_OF_DATE, ECON_EVENTS } from "@/lib/market/calendar";
import { getSession, lastPrice } from "@/lib/market/generate";
import { getSymbol } from "@/lib/market/symbols";
import { fmtPx, fmtTimeNy } from "@/lib/format";
import { computePerformance } from "@/lib/market/stats";
import { useOrb } from "@/lib/store";
import type { BreakKind, SessionDay } from "@/lib/market/types";

export const Route = createFileRoute("/app/")({ component: DeskPage });

function DeskPage() {
  const watchlist = useOrb((s) => s.watchlist);
  const trades = useOrb((s) => s.trades);
  const perf = computePerformance(trades);
  const events = ECON_EVENTS.filter((e) => e.date >= AS_OF_DATE).slice(0, 4);

  return (
    <div>
      <PageHead kicker="Desk" title="What's in play">
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums text-fg">{AS_OF_DATE} · 10:47 ET</div>
          <div className="text-xs text-muted">NY session live · simulated tape</div>
        </div>
      </PageHead>

      <div className="grid min-w-0 gap-4 p-4 sm:p-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <Stat label="Net P&L" value={<PnlText value={perf.net} />} hint={`${perf.trades} closed fills`} />
            </Panel>
            <Panel className="p-4">
              <Stat label="Win rate" value={`${Math.round(perf.winRate * 100)}%`} hint={`PF ${perf.profitFactor.toFixed(2)}`} />
            </Panel>
            <Panel className="p-4">
              <Stat label="Max drawdown" value={<PnlText value={-perf.maxDrawdown} />} hint={`avg R ${perf.avgR.toFixed(2)}`} />
            </Panel>
          </div>

          <Panel className="min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Watchlist</h2>
              <span className="text-xs text-muted">ORB · IB · gap vs prior close</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Symbol</th>
                    <th className="px-2 py-2 font-medium">Last</th>
                    <th className="px-2 py-2 font-medium">Gap</th>
                    <th className="px-2 py-2 font-medium">ORB</th>
                    <th className="px-2 py-2 font-medium">IB</th>
                    <th className="px-4 py-2 font-medium">Bias</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((id) => (
                    <WatchRow key={id} id={id} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-3 md:grid-cols-2">
            {watchlist.slice(0, 4).map((id) => (
              <SessionCard key={id} id={id} />
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
              PPI printed soft. Index futures are holding the opening range high — look for IB
              extension rather than a gap fade. Crude is two-way. Size down into 14:00 if you are
              already at half ADR.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function WatchRow({ id }: { id: string }) {
  const spec = getSymbol(id);
  const s = getSession(id, AS_OF_DATE, 5);
  const px = lastPrice(id);
  return (
    <tr className="border-b border-border/70 last:border-0">
      <td className="px-4 py-3">
        <div className="font-mono">{spec.label}</div>
        <div className="text-xs text-muted">{spec.name}</div>
      </td>
      <td className="px-2 py-3 font-mono tabular-nums">{fmtPx(px, spec.digits)}</td>
      <td className="px-2 py-3">
        <PnlText value={s.gapPct} as="pct" />
      </td>
      <td className="px-2 py-3">
        <BreakBadge kind={s.orbBreak} />
      </td>
      <td className="px-2 py-3">
        <BreakBadge kind={s.ibBreak} />
      </td>
      <td className="px-4 py-3 text-xs text-muted">{bias(s)}</td>
    </tr>
  );
}

function SessionCard({ id }: { id: string }) {
  const spec = getSymbol(id);
  const s = getSession(id, AS_OF_DATE, 5);
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono">{spec.label}</div>
        <Badge tone="steel">in play</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-subtle">ORB</div>
          <div className="font-mono tabular-nums text-fg">
            {fmtPx(s.orb.low, spec.digits)} – {fmtPx(s.orb.high, spec.digits)}
          </div>
        </div>
        <div>
          <div className="text-subtle">IB</div>
          <div className="font-mono tabular-nums text-fg">
            {fmtPx(s.ib.low, spec.digits)} – {fmtPx(s.ib.high, spec.digits)}
          </div>
        </div>
        <div>
          <div className="text-subtle">VWAP</div>
          <div className="font-mono tabular-nums">{fmtPx(s.vwap, spec.digits)}</div>
        </div>
        <div>
          <div className="text-subtle">Prior close</div>
          <div className="font-mono tabular-nums">{fmtPx(s.prevClose, spec.digits)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted">
        Gap {s.gapFilled ? "filled" : "open"}
        {s.gapFillTime ? ` · ${fmtTimeNy(s.gapFillTime)}` : ""}. {bias(s)}
      </div>
    </Panel>
  );
}

function BreakBadge({ kind }: { kind: BreakKind }) {
  if (kind === "up") return <Badge tone="long">up</Badge>;
  if (kind === "down") return <Badge tone="short">down</Badge>;
  if (kind === "both") return <Badge tone="warn">both</Badge>;
  return <Badge>hold</Badge>;
}

function bias(s: SessionDay): string {
  if (s.orbBreak === "both" || s.ibBreak === "both") return "Two-way — stand down";
  if (s.orbBreak === "up" && s.ibFirstBreak !== "down") return "Long continuation";
  if (s.orbBreak === "down" && s.ibFirstBreak !== "up") return "Short continuation";
  if (!s.gapFilled && s.gap < 0) return "Unfilled down-gap";
  if (!s.gapFilled && s.gap > 0) return "Unfilled up-gap";
  return "Range / wait";
}
