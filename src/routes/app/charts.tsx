import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CandleChart, levelLines, type ChartOverlay } from "@/components/candle-chart";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/stat";
import { SymbolSelect } from "@/components/symbol-select";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/input";
import { CHART } from "@/lib/chart-theme";
import { fmtPx } from "@/lib/format";
import { AS_OF_DATE, listTradingDays } from "@/lib/market/calendar";
import { cumulativeDelta, getSession, volumeProfile } from "@/lib/market/generate";
import { getSymbol } from "@/lib/market/symbols";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/charts")({ component: ChartsPage });

const TOOLS: { id: ChartOverlay; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "vwap", label: "VWAP" },
  { id: "ema", label: "EMA 9/21" },
];

function ChartsPage() {
  const days = useMemo(() => listTradingDays(20), []);
  const [symbol, setSymbol] = useState("NQ");
  const [date, setDate] = useState(days[1] ?? AS_OF_DATE);
  const [on, setOn] = useState<ChartOverlay[]>(["volume", "vwap", "ema"]);
  const spec = getSymbol(symbol);
  const session = useMemo(() => getSession(symbol, date, 5), [symbol, date]);
  const profile = useMemo(
    () => volumeProfile(session.bars, spec.tick),
    [session, spec.tick],
  );
  const delta = useMemo(() => cumulativeDelta(session.bars), [session]);
  const lastDelta = delta.at(-1)?.value ?? 0;

  function toggle(id: ChartOverlay) {
    setOn((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-dvh">
      <PageHead kicker="Charts" title="Orderflow & levels">
        <div className="flex flex-wrap gap-2">
          <SymbolSelect value={symbol} onChange={setSymbol} />
          <NativeSelect value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </div>
      </PageHead>

      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              on.includes(t.id) ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
        <Badge tone="steel">ORB</Badge>
        <Badge>IB</Badge>
      </div>

      <div className="grid flex-1 lg:grid-cols-[1fr_18rem]">
        <div className="min-h-[380px] border-b border-border lg:border-b-0 lg:border-r">
          <CandleChart
            bars={session.bars}
            overlays={on}
            lines={levelLines(session.orb, session.ib)}
            className="h-full min-h-[380px] w-full"
          />
        </div>
        <aside className="space-y-4 p-4">
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Session</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Last" v={fmtPx(session.close, spec.digits)} />
              <Row k="VWAP" v={fmtPx(session.vwap, spec.digits)} />
              <Row k="POC" v={fmtPx(session.poc, spec.digits)} />
              <Row k="ORB" v={`${fmtPx(session.orb.low, spec.digits)}–${fmtPx(session.orb.high, spec.digits)}`} />
              <Row k="IB" v={`${fmtPx(session.ib.low, spec.digits)}–${fmtPx(session.ib.high, spec.digits)}`} />
            </dl>
          </Panel>
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Cumulative delta</h2>
              <span className={cn("font-mono text-xs", lastDelta >= 0 ? "text-long" : "text-short")}>
                {lastDelta >= 0 ? "+" : ""}
                {lastDelta}
              </span>
            </div>
            <div className="mt-2 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={delta.filter((_, i) => i % 3 === 0)}>
                  <XAxis hide dataKey="time" />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#101114", border: "1px solid rgba(236,238,241,0.1)", fontSize: 12 }} />
                  <Bar dataKey="value" fill={CHART.vwap} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="text-sm font-medium">Volume profile</h2>
            <div className="mt-3 space-y-0.5">
              {profile.rows.map((r) => {
                const max = Math.max(...profile.rows.map((x) => x.volume), 1);
                return (
                  <div key={r.price} className="flex items-center gap-2">
                    <div className="w-14 font-mono text-[10px] text-muted">
                      {fmtPx(r.price, spec.digits)}
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn("h-full rounded-full", r.price === profile.poc ? "bg-steel" : "bg-subtle")}
                        style={{ width: `${(r.volume / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono tabular-nums">{v}</dd>
    </div>
  );
}
