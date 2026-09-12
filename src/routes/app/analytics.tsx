import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeskChain } from "@/components/desk-chain";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { buildCustomReport, buildPlaybookReport, buildReport, REPORT_LIST } from "@/lib/market/reports";
import { byHourTaken, bySetup, bySourceTaken, byWeekdayTaken, computePerformance, takenTrades } from "@/lib/market/stats";
import { useSessions } from "@/lib/market/use-feed";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const trades = useOrb((s) => s.trades);
  const playbooks = useOrb((s) => s.playbooks);
  const evaluations = useOrb((s) => s.evaluations);
  const customReports = useOrb((s) => s.customReports);
  const mock = useOrb((s) => Boolean(s.useMockData && s.mockDay));
  const { sessions, daily, live, loading, error } = useSessions("NQ", 40);
  const evaluated = evaluations.flatMap((e) => e.trades);
  const taken = takenTrades(trades, mock);
  const perf = computePerformance(taken);
  const evalPerf = computePerformance(evaluated);
  const setupRows = bySetup(taken);
  const weekdayRows = byWeekdayTaken(taken);
  const hourRows = byHourTaken(taken);
  const sourceRows = bySourceTaken(taken);

  const bookRows = playbooks.map((p) => {
    const ev = evaluations.find((e) => e.playbookId === p.id);
    const view = buildPlaybookReport(p, ev);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      validated: p.validated,
      n: p.evaluation?.trades ?? 0,
      wr: p.evaluation?.winRate ?? 0,
      exp: p.evaluation?.expectancy ?? 0,
      pf: p.evaluation?.profitFactor ?? 0,
      net: p.evaluation?.net ?? 0,
      kicker: view.kicker,
    };
  });

  const sessionEdges = REPORT_LIST.slice(0, 5).map((r) => {
    const view = buildReport("NQ", r.id, 40, sessions, daily);
    return { id: r.id, title: r.title, value: view.headline[0]?.value ?? "—", hint: view.headline[0]?.hint ?? "" };
  });

  const customRows = customReports.map((r) => {
    const view = buildCustomReport(r, playbooks, evaluations, trades, sessions);
    return { id: r.id, name: r.name, value: view.headline[0]?.value ?? "—", hint: view.kicker };
  });

  return (
    <div>
      <PageHead kicker="Analytics" title="From reports & playbooks">
        <div className="flex flex-col items-end gap-2">
          <DeskChain current="/app/analytics" />
          <div className="text-right">
            <PnlText value={perf.net} className="text-xl" />
            <div className="text-xs text-muted">
              {perf.trades} taken fills
              {evalPerf.trades ? ` · ${evalPerf.trades} evaluated (not in journal P&L)` : ""}
              {live ? " · Yahoo NQ sessions" : ""}
            </div>
          </div>
        </div>
      </PageHead>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <Stat
              label="Win rate"
              value={perf.trades ? `${Math.round(perf.winRate * 100)}%` : "—"}
              hint={perf.trades ? `${perf.wins}W / ${perf.losses}L` : "no taken fills"}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Profit factor"
              value={perf.trades ? perf.profitFactor.toFixed(2) : "—"}
              hint={perf.trades ? `expectancy ${perf.expectancy >= 0 ? "+" : ""}${Math.round(perf.expectancy)}` : "evaluate a book in replay"}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Avg R"
              value={perf.trades ? perf.avgR.toFixed(2) : "—"}
              hint={perf.trades ? `best ${Math.round(perf.best)}` : "empty ledger"}
            />
          </Panel>
          <Panel className="p-4">
            <Stat
              label="Evaluated books"
              value={evalPerf.trades ? <PnlText value={evalPerf.net} /> : "—"}
              hint={evalPerf.trades ? `${evalPerf.trades} backtest fills · not in journal` : "run Evaluate on a playbook"}
            />
          </Panel>
        </div>

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Equity of your fills</h2>
          {perf.trades ? (
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perf.equity}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#101114", border: "1px solid rgba(236,238,241,0.1)", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="v" stroke="#b8c0cc" fill="rgba(184,192,204,0.12)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Empty until you journal a fill or paper a replay. Evaluated backtests stay on the playbook, not this curve.
            </p>
          )}
        </Panel>

        {perf.trades ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <BucketTable title="By setup" rows={setupRows} />
            <BucketTable title="By weekday" rows={weekdayRows} />
            <BucketTable title="By hour (entry, ET)" rows={hourRows} />
            <BucketTable title="By source" rows={sourceRows} />
          </div>
        ) : null}

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Playbooks</h2>
            <Link to="/app/playbooks" className="text-xs text-muted hover:text-fg">
              Open books
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                <tr>
                  <th className="py-2 font-medium">Book</th>
                  <th className="py-2 font-medium">n</th>
                  <th className="py-2 font-medium">Win</th>
                  <th className="py-2 font-medium">Exp</th>
                  <th className="py-2 font-medium">PF</th>
                  <th className="py-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {bookRows.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2">
                      <Link to="/app/reports" search={{ report: `pb:${s.id}` }} className={cn("hover:underline", s.n === 0 && "text-muted")}>
                        {s.name}
                      </Link>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-subtle">
                        {s.kind}
                        {s.validated ? " · validated" : ""}
                      </div>
                    </td>
                    <td className="py-2 font-mono">{s.n}</td>
                    <td className="py-2 font-mono">{s.n ? `${Math.round(s.wr * 100)}%` : "—"}</td>
                    <td className="py-2">
                      {s.n ? <PnlText value={s.exp} /> : "—"}
                    </td>
                    <td className="py-2 font-mono">{s.n ? s.pf.toFixed(2) : "—"}</td>
                    <td className="py-2">{s.n ? <PnlText value={s.net} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div>
          <h2 className="px-1 text-sm font-medium">Session reports (NQ)</h2>
          <p className="mt-1 px-1 text-xs text-muted">
            Base rates from the live tape. Full tables and user-defined reports live in Reports.
          </p>
          {loading ? (
            <p className="mt-3 px-1 text-sm text-muted">Pulling NQ sessions…</p>
          ) : error ? (
            <p className="mt-3 px-1 text-sm text-short">{error}</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {sessionEdges.map((e) => (
                <Panel key={e.id} className="p-4">
                  <Stat label={e.title} value={e.value} hint={e.hint} />
                </Panel>
              ))}
            </div>
          )}
        </div>

        {customRows.length ? (
          <div>
            <h2 className="px-1 text-sm font-medium">Your reports</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {customRows.map((r) => (
                <Panel key={r.id} className="p-4">
                  <Stat label={r.name} value={r.value} hint={r.hint} />
                </Panel>
              ))}
            </div>
          </div>
        ) : null}

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Evaluated books</h2>
          <p className="mt-1 text-xs text-muted">Backtest fills — not your journal. Run Evaluate on a playbook to populate.</p>
          {bookRows.some((s) => s.n > 0) ? (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bookRows.filter((s) => s.n > 0)}>
                  <XAxis dataKey="name" tick={{ fill: "#8b909a", fontSize: 10 }} interval={0} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#101114", border: "1px solid rgba(236,238,241,0.1)", fontSize: 12 }} />
                  <Bar dataKey="net" fill="#b8c0cc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No evaluations yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: { label: string; n: number; winRate: number; net: number; avgR: number }[] }) {
  return (
    <Panel className="p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
              <tr>
                <th className="py-2 font-medium">Slice</th>
                <th className="py-2 font-medium">n</th>
                <th className="py-2 font-medium">Win</th>
                <th className="py-2 font-medium">Net</th>
                <th className="py-2 font-medium">Avg R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="py-2">{r.label}</td>
                  <td className="py-2 font-mono">{r.n}</td>
                  <td className="py-2 font-mono">{Math.round(r.winRate * 100)}%</td>
                  <td className="py-2">
                    <PnlText value={r.net} />
                  </td>
                  <td className="py-2 font-mono">{r.avgR.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No closed fills in this slice.</p>
      )}
    </Panel>
  );
}
