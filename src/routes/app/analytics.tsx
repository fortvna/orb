import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { computePerformance, dailyPnl, groupBy, hourOfNy } from "@/lib/market/stats";
import { weekdayName } from "@/lib/format";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/analytics")({ component: AnalyticsPage });

function AnalyticsPage() {
  const trades = useOrb((s) => s.trades);
  const perf = computePerformance(trades);
  const daily = dailyPnl(trades);
  const bySetup = Object.entries(groupBy(trades.filter((t) => !t.open), (t) => t.setup)).map(
    ([setup, list]) => ({
      setup,
      n: list.length,
      pnl: list.reduce((s, t) => s + t.pnl, 0),
      wr: list.filter((t) => t.pnl > 0).length / list.length,
    }),
  );
  const byHour = Array.from({ length: 8 }, (_, i) => {
    const hour = 9 + i;
    const list = trades.filter((t) => !t.open && hourOfNy(t.entryTime) === hour);
    return {
      hour: `${hour}:00`,
      pnl: list.reduce((s, t) => s + t.pnl, 0),
      n: list.length,
    };
  });
  const byWd = [1, 2, 3, 4, 5].map((wd) => {
    const list = trades.filter((t) => !t.open && new Date(`${t.date}T12:00:00`).getUTCDay() === wd);
    return { label: weekdayName(wd), pnl: list.reduce((s, t) => s + t.pnl, 0), n: list.length };
  });

  const cal = buildCalendar(daily);

  return (
    <div>
      <PageHead kicker="Analytics" title="Performance">
        <div className="text-right">
          <PnlText value={perf.net} className="text-xl" />
          <div className="text-xs text-muted">{perf.trades} closed trades</div>
        </div>
      </PageHead>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Panel className="p-4">
            <Stat label="Win rate" value={`${Math.round(perf.winRate * 100)}%`} hint={`${perf.wins}W / ${perf.losses}L`} />
          </Panel>
          <Panel className="p-4">
            <Stat label="Profit factor" value={perf.profitFactor.toFixed(2)} hint={`expectancy ${perf.expectancy >= 0 ? "+" : ""}${Math.round(perf.expectancy)}`} />
          </Panel>
          <Panel className="p-4">
            <Stat label="Avg R" value={perf.avgR.toFixed(2)} hint={`best ${Math.round(perf.best)}`} />
          </Panel>
          <Panel className="p-4">
            <Stat label="Max DD" value={<PnlText value={-perf.maxDrawdown} />} hint="peak to trough" />
          </Panel>
        </div>

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Equity</h2>
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
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Time of day</h2>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byHour}>
                  <XAxis dataKey="hour" tick={{ fill: "#8b909a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#101114", border: "1px solid rgba(236,238,241,0.1)", fontSize: 12 }} />
                  <Bar dataKey="pnl" fill="#b8c0cc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Weekday</h2>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byWd}>
                  <XAxis dataKey="label" tick={{ fill: "#8b909a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#101114", border: "1px solid rgba(236,238,241,0.1)", fontSize: 12 }} />
                  <Bar dataKey="pnl" fill="#8aa0c8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Setups</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                <tr>
                  <th className="py-2 font-medium">Setup</th>
                  <th className="py-2 font-medium">n</th>
                  <th className="py-2 font-medium">Win</th>
                  <th className="py-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {bySetup.map((s) => (
                  <tr key={s.setup} className="border-t border-border">
                    <td className="py-2">{s.setup}</td>
                    <td className="py-2 font-mono">{s.n}</td>
                    <td className="py-2 font-mono">{Math.round(s.wr * 100)}%</td>
                    <td className="py-2">
                      <PnlText value={s.pnl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-sm font-medium">Calendar</h2>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={`${d}${i}`} className="text-center text-[10px] uppercase text-subtle">
                {d}
              </div>
            ))}
            {cal.map((c, i) => (
              <div
                key={i}
                title={c.date ? `${c.date} ${Math.round(c.pnl)}` : ""}
                className={cn(
                  "aspect-square rounded-sm",
                  !c.date && "bg-transparent",
                  c.date && c.pnl === 0 && "bg-surface-2",
                  c.date && c.pnl > 0 && "bg-long/70",
                  c.date && c.pnl < 0 && "bg-short/70",
                )}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function buildCalendar(daily: { date: string; pnl: number }[]) {
  const map = new Map(daily.map((d) => [d.date, d.pnl]));
  const dates = daily.map((d) => d.date).sort();
  if (!dates.length) return [];
  const start = new Date(`${dates[0]}T12:00:00Z`);
  const end = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  const pad = (start.getUTCDay() + 6) % 7;
  const cells: { date: string | null; pnl: number }[] = Array.from({ length: pad }, () => ({
    date: null,
    pnl: 0,
  }));
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    cells.push({ date: d, pnl: map.get(d) ?? 0 });
  }
  return cells;
}
