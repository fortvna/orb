import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { PageHead } from "@/components/page-head";
import { Panel, Stat } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { NativeSelect } from "@/components/ui/input";
import { buildReport, REPORT_LIST } from "@/lib/market/reports";
import { cn } from "@/lib/utils";
import type { ReportId } from "@/lib/market/types";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const [symbol, setSymbol] = useState("ES");
  const [report, setReport] = useState<ReportId>("orb");
  const [lookback, setLookback] = useState(60);
  const view = useMemo(
    () => buildReport(symbol, report, lookback),
    [symbol, report, lookback],
  );

  return (
    <div>
      <PageHead kicker="Reports" title={view.title}>
        <div className="flex flex-wrap gap-2">
          <SymbolSelect value={symbol} onChange={setSymbol} />
          <NativeSelect value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
            <option value={20}>20 sessions</option>
            <option value={40}>40 sessions</option>
            <option value={60}>60 sessions</option>
            <option value={90}>90 sessions</option>
          </NativeSelect>
        </div>
      </PageHead>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[16rem_1fr]">
        <Panel className="h-fit p-2">
          {REPORT_LIST.map((r) => (
            <button
              key={r.id}
              onClick={() => setReport(r.id)}
              className={cn(
                "block w-full rounded-md px-3 py-2.5 text-left",
                report === r.id ? "bg-surface text-fg" : "text-muted hover:text-fg",
              )}
            >
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-subtle">{r.blurb}</div>
            </button>
          ))}
        </Panel>

        <div className="space-y-4">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{view.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {view.headline.map((h) => (
              <Panel key={h.label} className="p-4">
                <Stat label={h.label} value={h.value} hint={h.hint} />
              </Panel>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className="p-4">
              <h2 className="text-sm font-medium">Distribution</h2>
              <div className="mt-4 space-y-3">
                {view.distribution.map((d) => (
                  <div key={d.label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{d.label}</span>
                      <span className="font-mono tabular-nums">{Math.round(d.value * 100)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          d.tone === "long" && "bg-long",
                          d.tone === "short" && "bg-short",
                          d.tone === "warn" && "bg-warn",
                          d.tone === "muted" && "bg-subtle",
                        )}
                        style={{ width: `${Math.max(2, d.value * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="p-4">
              <h2 className="text-sm font-medium">By weekday</h2>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={view.byWeekday.map((w) => ({ ...w, pct: Math.round(w.rate * 100) }))}>
                    <XAxis dataKey="label" tick={{ fill: "#8b909a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "rgba(236,238,241,0.04)" }}
                      contentStyle={{
                        background: "#101114",
                        border: "1px solid rgba(236,238,241,0.1)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="pct" fill="#b8c0cc" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            {view.extras.map((e) => (
              <div key={e.label}>
                <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">{e.label}</div>
                <div className="mt-1 text-fg">{e.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
