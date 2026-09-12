import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { PageHead } from "@/components/page-head";
import { DeskChain } from "@/components/desk-chain";
import { Panel, Stat } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import {
  buildCustomReport,
  buildPlaybookReport,
  buildReport,
  REPORT_LIST,
  type ReportView,
} from "@/lib/market/reports";
import { useSessions } from "@/lib/market/use-feed";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { CustomReport, ReportId } from "@/lib/market/types";

type Search = { report?: string };

export const Route = createFileRoute("/app/reports")({
  component: ReportsPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    report: typeof s.report === "string" ? s.report : undefined,
  }),
});

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [symbol, setSymbol] = useState("NQ");
  const [lookback, setLookback] = useState(20);
  const [selected, setSelected] = useState(search.report ?? "orb");
  const [showCustom, setShowCustom] = useState(false);
  const { sessions, daily, available, live, loading, error } = useSessions(symbol, lookback);

  useEffect(() => {
    if (search.report) setSelected(search.report);
  }, [search.report]);
  const playbooks = useOrb((s) => s.playbooks);
  const evaluations = useOrb((s) => s.evaluations);
  const customReports = useOrb((s) => s.customReports);
  const addCustomReport = useOrb((s) => s.addCustomReport);
  const removeCustomReport = useOrb((s) => s.removeCustomReport);
  const trades = useOrb((s) => s.trades);

  const view = useMemo<ReportView>(() => {
    if (selected === "custom:replay-fills") {
      return buildCustomReport(
        {
          id: "replay-fills",
          name: "Replay fills",
          blurb: "Manual tickets from replay sessions",
          source: "replay",
          playbookId: null,
          metric: "net",
        },
        playbooks,
        evaluations,
        trades,
      );
    }
    if (selected.startsWith("pb:")) {
      const id = selected.slice(3);
      const pb = playbooks.find((p) => p.id === id);
      const ev = evaluations.find((e) => e.playbookId === id);
      if (pb) return buildPlaybookReport(pb, ev);
    }
    if (selected.startsWith("custom:")) {
      const id = selected.slice(7);
      const cr = customReports.find((r) => r.id === id);
      if (cr) return buildCustomReport(cr, playbooks, evaluations, trades, sessions);
    }
    return buildReport(symbol, selected as ReportId, lookback, sessions, daily);
  }, [selected, symbol, lookback, sessions, daily, playbooks, evaluations, customReports, trades]);

  function pick(id: string) {
    setSelected(id);
    void navigate({ search: { report: id } });
  }

  return (
    <div>
      <PageHead kicker="Reports" title={view.title}>
        <div className="flex flex-col items-end gap-2">
          <DeskChain current="/app/reports" />
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">
            {live
              ? `${sessions.length}×5m${available > sessions.length ? ` of ${available}` : ""}${daily.length ? ` · ${daily.length} daily` : ""} · Yahoo ~60d cap`
              : loading
                ? "Loading tape"
                : "Waiting on tape"}
          </span>
          <SymbolSelect value={symbol} onChange={setSymbol} />
          <NativeSelect value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
            <option value={10}>10 sessions</option>
            <option value={20}>20 sessions</option>
            <option value={40}>40 sessions</option>
            <option value={60}>60 sessions</option>
          </NativeSelect>
          <Button size="sm" variant="secondary" onClick={() => setShowCustom((v) => !v)}>
            New report
          </Button>
          </div>
        </div>
      </PageHead>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-4">
          <Panel className="h-fit p-2">
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.14em] text-subtle">Session</p>
            {REPORT_LIST.map((r) => (
              <NavBtn key={r.id} active={selected === r.id} onClick={() => pick(r.id)} title={r.title} blurb={r.blurb} />
            ))}
          </Panel>
          <Panel className="h-fit p-2">
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.14em] text-subtle">Playbooks</p>
            {playbooks.map((p) => (
              <NavBtn
                key={p.id}
                active={selected === `pb:${p.id}`}
                onClick={() => pick(`pb:${p.id}`)}
                title={p.name}
                blurb={p.evaluation ? `${Math.round(p.evaluation.winRate * 100)}% WR · ${p.evaluation.trades} fills${p.evaluation.source === "model" ? " · model" : ""}` : "Evaluate in replay"}
              />
            ))}
          </Panel>
          <Panel className="h-fit p-2">
              <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.14em] text-subtle">Yours</p>
              <NavBtn
                active={selected === "custom:replay-fills"}
                onClick={() => pick("custom:replay-fills")}
                title="Replay fills"
                blurb="Manual tickets from replay sessions"
              />
              {customReports.map((r) => (
                <div key={r.id} className="flex items-start">
                  <NavBtn
                    active={selected === `custom:${r.id}`}
                    onClick={() => pick(`custom:${r.id}`)}
                    title={r.name}
                    blurb={r.blurb}
                  />
                </div>
              ))}
            </Panel>
        </div>

        <div className="space-y-4">
          {showCustom ? (
            <CustomForm
              playbooks={playbooks}
              onSave={(r) => {
                addCustomReport(r);
                pick(`custom:${r.id}`);
                setShowCustom(false);
              }}
              onCancel={() => setShowCustom(false)}
            />
          ) : null}

          <p className="max-w-2xl text-sm leading-relaxed text-muted">{view.summary}</p>
          {error && view.source === "session" ? (
            <p className="text-sm text-short">Tape error: {error}</p>
          ) : null}
          {!loading && !sessions.length && view.source === "session" ? (
            <p className="text-sm text-muted">
              No live 5m sessions in this window. Wait for the tape, or turn on Model tape for today in Settings.
            </p>
          ) : null}
          {!loading && sessions.length > 0 && sessions.length < lookback && view.source === "session" ? (
            <p className="text-sm text-muted">
              Yahoo 5m history returned {sessions.length} of {lookback} sessions
              {available ? ` (${available} packed on the tape; cap is ~60 Globex days)` : " (tape is thinner than the lookback)"}.
            </p>
          ) : null}
          {view.source === "playbook" && !playbooks.find((p) => `pb:${p.id}` === selected)?.evaluation ? (
            <Link to="/app/replay" search={{ mode: "free", playbook: selected.slice(3) }} className="text-sm text-fg underline-offset-2 hover:underline">
              Run this playbook in replay →
            </Link>
          ) : null}

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
                        style={{ width: `${Math.round(d.value * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="p-4">
              <h2 className="text-sm font-medium">By weekday</h2>
              <div className="mt-4 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={view.byWeekday}>
                    <XAxis dataKey="label" tick={{ fill: "#8b909a", fontSize: 11 }} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: "#101114",
                        border: "1px solid rgba(236,238,241,0.1)",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="rate" fill={CHART.vwap} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Notes</h2>
              {selected.startsWith("custom:") && selected !== "custom:replay-fills" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    removeCustomReport(selected.slice(7));
                    pick("orb");
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {view.extras.map((e) => (
                <div key={e.label} className="flex justify-between gap-3 text-sm">
                  <dt className="text-muted">{e.label}</dt>
                  <dd>{e.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  title,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-md px-3 py-2.5 text-left",
        active ? "bg-surface text-fg" : "text-muted hover:text-fg",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-subtle">{blurb}</div>
    </button>
  );
}

function CustomForm({
  playbooks,
  onSave,
  onCancel,
}: {
  playbooks: { id: string; name: string }[];
  onSave: (r: CustomReport) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [source, setSource] = useState<CustomReport["source"]>("playbook");
  const [playbookId, setPlaybookId] = useState(playbooks[0]?.id ?? "");
  const [metric, setMetric] = useState<CustomReport["metric"]>("winRate");

  return (
    <Panel className="p-5">
      <h2 className="text-sm font-medium">User-defined report</h2>
      <p className="mt-1 text-xs text-muted">Counted from a playbook evaluation, replay fills, or session tape.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Name
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Metric
          <NativeSelect className="mt-1 w-full" value={metric} onChange={(e) => setMetric(e.target.value as CustomReport["metric"])}>
            <option value="winRate">Win rate</option>
            <option value="expectancy">Expectancy</option>
            <option value="net">Net</option>
            <option value="fillRate">Fill rate</option>
            <option value="breakRate">Break rate</option>
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Source
          <NativeSelect className="mt-1 w-full" value={source} onChange={(e) => setSource(e.target.value as CustomReport["source"])}>
            <option value="playbook">Playbook evaluation</option>
            <option value="replay">Replay fills</option>
            <option value="session">Session tape</option>
          </NativeSelect>
        </label>
        {source === "playbook" ? (
          <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
            Playbook
            <NativeSelect className="mt-1 w-full" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : (
          <div />
        )}
      </div>
      <label className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-subtle">
        Blurb
        <Input className="mt-1" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
      </label>
      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              id: `cr-${Date.now().toString(36)}`,
              name: name.trim(),
              blurb: blurb.trim(),
              source,
              playbookId: source === "playbook" ? playbookId : null,
              metric,
            })
          }
        >
          Save report
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}
