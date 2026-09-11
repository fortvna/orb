import { createFileRoute } from "@tanstack/react-router";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { dailyPnl } from "@/lib/market/stats";
import { PROP_CHALLENGES } from "@/lib/market/seed";
import { fmtUsd } from "@/lib/format";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/prop")({ component: PropPage });

function PropPage() {
  const propId = useOrb((s) => s.propId);
  const setPropId = useOrb((s) => s.setPropId);
  const trades = useOrb((s) => s.trades);
  const challenge = PROP_CHALLENGES.find((c) => c.id === propId) ?? PROP_CHALLENGES[0]!;
  const daily = dailyPnl(trades);
  const window = daily.slice(-18);
  const net = window.reduce((s, d) => s + d.pnl, 0);
  const equity = window.reduce<number[]>((acc, d) => {
    acc.push((acc.at(-1) ?? 0) + d.pnl);
    return acc;
  }, []);
  const peak = equity.reduce((m, v) => Math.max(m, v), 0);
  const trough = equity.reduce((m, v, i) => {
    const p = equity.slice(0, i + 1).reduce((a, b) => Math.max(a, b), 0);
    return Math.max(m, p - v);
  }, 0);
  const worstDay = window.reduce((m, d) => Math.min(m, d.pnl), 0);
  const tradingDays = window.filter((d) => d.n > 0).length;
  const bestDayShare =
    window.length === 0 ? 0 : Math.max(0, ...window.map((d) => d.pnl)) / Math.max(net, 1);

  const targetPct = Math.min(1, Math.max(0, net / challenge.profitTarget));
  const ddPct = Math.min(1, trough / challenge.maxDrawdown);
  const dayPct = Math.min(1, Math.abs(Math.min(0, worstDay)) / challenge.dailyDrawdown);
  const passed =
    net >= challenge.profitTarget &&
    trough < challenge.maxDrawdown &&
    Math.abs(Math.min(0, worstDay)) < challenge.dailyDrawdown &&
    tradingDays >= challenge.minDays &&
    (challenge.consistency === 0 || bestDayShare <= challenge.consistency);

  return (
    <div>
      <PageHead kicker="Prop" title="Challenge simulator">
        <Badge tone={passed ? "long" : net < 0 ? "short" : "warn"}>
          {passed ? "rules held" : "in progress"}
        </Badge>
      </PageHead>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {PROP_CHALLENGES.map((c) => (
            <button
              key={c.id}
              onClick={() => setPropId(c.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                c.id === propId ? "bg-fg text-bg" : "bg-surface text-muted hover:text-fg",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <Stat label="Account" value={fmtUsd(challenge.account)} hint={challenge.name} />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Net vs target"
              value={<PnlText value={net} />}
              hint={`${fmtUsd(challenge.profitTarget)} target`}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Trailing DD"
              value={<PnlText value={-trough} />}
              hint={`max ${fmtUsd(challenge.maxDrawdown)}`}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Worst day"
              value={<PnlText value={worstDay} />}
              hint={`daily cap ${fmtUsd(challenge.dailyDrawdown)}`}
            />
          </Panel>
        </div>

        <Panel className="p-5">
          <h2 className="text-sm font-medium">Rule board</h2>
          <div className="mt-4 space-y-4">
            <Meter label="Profit target" value={targetPct} ok={net >= challenge.profitTarget} />
            <Meter label="Max drawdown used" value={ddPct} ok={trough < challenge.maxDrawdown} invert />
            <Meter label="Daily loss used (worst)" value={dayPct} ok={dayPct < 1} invert />
            <Meter
              label="Min trading days"
              value={Math.min(1, tradingDays / challenge.minDays)}
              ok={tradingDays >= challenge.minDays}
            />
          </div>
          <p className="mt-5 text-sm text-muted">
            Simulated against your journal window ({tradingDays} active days, peak equity{" "}
            {fmtUsd(peak)}). Consistency{" "}
            {challenge.consistency
              ? `best-day share ${(bestDayShare * 100).toFixed(0)}% vs ${(challenge.consistency * 100).toFixed(0)}% cap.`
              : "not required on this firm."}
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  ok,
  invert,
}: {
  label: string;
  value: number;
  ok: boolean;
  invert?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={ok ? "text-long" : invert ? "text-short" : "text-warn"}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", ok ? "bg-long" : "bg-short")}
          style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }}
        />
      </div>
    </div>
  );
}
