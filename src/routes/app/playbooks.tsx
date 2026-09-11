import { createFileRoute } from "@tanstack/react-router";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { closedTrades } from "@/lib/market/stats";
import { useOrb } from "@/lib/store";

export const Route = createFileRoute("/app/playbooks")({ component: PlaybooksPage });

function PlaybooksPage() {
  const playbooks = useOrb((s) => s.playbooks);
  const trades = useOrb((s) => s.trades);
  const setStatus = useOrb((s) => s.setPlaybookStatus);
  const closed = closedTrades(trades);

  return (
    <div>
      <PageHead kicker="Playbooks" title="Rules that pay" />
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {playbooks.map((pb) => {
          const list = closed.filter((t) => t.playbookId === pb.id || t.setup === pb.setup);
          const net = list.reduce((s, t) => s + t.pnl, 0);
          const wr = list.length ? list.filter((t) => t.pnl > 0).length / list.length : 0;
          return (
            <Panel key={pb.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl tracking-tight">{pb.name}</h2>
                  <div className="mt-1 text-xs text-muted">{pb.session}</div>
                </div>
                <Badge tone={pb.status === "active" ? "long" : "muted"}>{pb.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{pb.thesis}</p>
              <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-fg">
                {pb.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-subtle">Invalidation: {pb.invalidation}</p>
              <div className="mt-5 flex items-end justify-between gap-3 border-t border-border pt-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Book P&L</div>
                  <PnlText value={net} className="text-lg" />
                  <div className="text-xs text-muted">
                    {list.length} fills · {Math.round(wr * 100)}% win
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setStatus(pb.id, pb.status === "active" ? "paused" : "active")}
                >
                  {pb.status === "active" ? "Pause" : "Activate"}
                </Button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
