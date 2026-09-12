import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dailyPnl, takenTrades } from "@/lib/market/stats";
import { PROP_CHALLENGES } from "@/lib/market/seed";
import { nyToday } from "@/lib/market/clock";
import { fmtUsd } from "@/lib/format";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/prop")({ component: PropPage });

function PropPage() {
  const propId = useOrb((s) => s.propId);
  const setPropId = useOrb((s) => s.setPropId);
  const propStartedAt = useOrb((s) => s.propStartedAt);
  const setPropStartedAt = useOrb((s) => s.setPropStartedAt);
  const trades = takenTrades(useOrb((s) => s.trades), useOrb((s) => Boolean(s.useMockData && s.mockDay)));
  const challenge = PROP_CHALLENGES.find((c) => c.id === propId) ?? PROP_CHALLENGES[0]!;
  const today = nyToday();
  const started = propStartedAt && propStartedAt <= today ? propStartedAt : null;
  const scoped = started ? trades.filter((t) => t.date >= started) : [];
  const daily = dailyPnl(scoped);
  const window = daily;
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
    window.length === 0 || net <= 0 ? 0 : Math.max(0, ...window.map((d) => d.pnl)) / Math.max(net, 1);

  const targetPct = Math.min(1, Math.max(0, net / challenge.profitTarget));
  const ddPct = Math.min(1, trough / challenge.maxDrawdown);
  const dayPct = Math.min(1, Math.abs(Math.min(0, worstDay)) / challenge.dailyDrawdown);
  const passed =
    Boolean(started) &&
    net >= challenge.profitTarget &&
    trough < challenge.maxDrawdown &&
    Math.abs(Math.min(0, worstDay)) < challenge.dailyDrawdown &&
    tradingDays >= challenge.minDays &&
    (challenge.consistency === 0 || bestDayShare <= challenge.consistency);

  return (
    <div>
      <PageHead kicker="Prop" title="Challenge simulator">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={!started ? "muted" : passed ? "long" : net < 0 ? "short" : "warn"}>
            {!started ? "not started" : passed ? "rules held" : "in progress"}
          </Badge>
          <Button size="sm" variant="secondary" asChild>
            <Link to="/app/replay" search={{ mode: "eval" }}>
              Run evaluation
            </Link>
          </Button>
        </div>
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

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Start date</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Public Apex / Topstep-style rule templates — not a firm login or live prop feed. The board counts journal,
            replay, and evaluation fills from this day forward.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={propStartedAt ?? ""}
              onChange={(e) => setPropStartedAt(e.target.value || null)}
              className="h-9 max-w-[12rem]"
              aria-label="Challenge start date"
            />
            <Button size="sm" variant="secondary" onClick={() => setPropStartedAt(today)}>
              Start today
            </Button>
            {propStartedAt ? (
              <Button size="sm" variant="ghost" onClick={() => setPropStartedAt(null)}>
                Clear
              </Button>
            ) : null}
          </div>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <Stat label="Account" value={fmtUsd(challenge.account)} hint={challenge.name} />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Net vs target"
              value={started ? <PnlText value={net} /> : "—"}
              hint={`${fmtUsd(challenge.profitTarget)} target`}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Trailing DD"
              value={started ? <PnlText value={-trough} /> : "—"}
              hint={`max ${fmtUsd(challenge.maxDrawdown)}`}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Worst day"
              value={started ? <PnlText value={worstDay} /> : "—"}
              hint={`daily cap ${fmtUsd(challenge.dailyDrawdown)}`}
            />
          </Panel>
        </div>

        <Panel className="p-5">
          <h2 className="text-sm font-medium">Rule board</h2>
          {!started ? (
            <p className="mt-4 text-sm text-muted">
              Set a start date. Until then this is a template — not an 18-day smear of old fills.
            </p>
          ) : (
            <>
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
                {tradingDays === 0
                  ? `Started ${started}. Journal a fill or paper an evaluation session before this board means anything.`
                  : `From ${started} · ${tradingDays} active day${tradingDays === 1 ? "" : "s"} · peak equity ${fmtUsd(peak)}. Consistency ${
                      challenge.consistency
                        ? `best-day share ${(bestDayShare * 100).toFixed(0)}% vs ${(challenge.consistency * 100).toFixed(0)}% cap.`
                        : "not required on this firm."
                    } Evaluation fills land as source “prop”; journal and replay from the start date also count.`}
              </p>
            </>
          )}
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
