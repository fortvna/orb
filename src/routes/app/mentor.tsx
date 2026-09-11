import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { askMentor } from "@/lib/mentor";
import { computePerformance, groupBy, hourOfNy } from "@/lib/market/stats";
import { useOrb } from "@/lib/store";

export const Route = createFileRoute("/app/mentor")({ component: MentorPage });

function MentorPage() {
  const trades = useOrb((s) => s.trades);
  const perf = computePerformance(trades);
  const insights = useMemo(() => localInsights(trades, perf), [trades, perf]);
  const [q, setQ] = useState("Where am I leaking money?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setErr(null);
    const context = [
      `Net ${Math.round(perf.net)}, WR ${(perf.winRate * 100).toFixed(1)}%, PF ${perf.profitFactor.toFixed(2)}, DD ${Math.round(perf.maxDrawdown)}, n=${perf.trades}.`,
      insights.join(" "),
      "Recent fills: " +
        trades
          .slice(0, 12)
          .map(
            (t) =>
              `${t.date} ${t.symbol} ${t.side} ${t.setup} pnl=${Math.round(t.pnl)} R=${t.rMultiple.toFixed(1)}`,
          )
          .join("; "),
    ].join("\n");
    const res = await askMentor({ data: { question: q, context } });
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else setAnswer(res.text);
  }

  return (
    <div>
      <PageHead kicker="Mentor" title="Ask the desk" />
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel className="p-5">
            <h2 className="text-sm font-medium">Leaks already visible</h2>
            <ul className="mt-3 space-y-3">
              {insights.map((i) => (
                <li key={i} className="border-l border-border pl-3 text-sm leading-relaxed text-muted">
                  {i}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel className="p-5">
            <h2 className="text-sm font-medium">Ask Mentor</h2>
            <p className="mt-1 text-xs text-subtle">Uses your journal snapshot. User-initiated. Not advice.</p>
            <Textarea className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button className="mt-3" disabled={busy || !q.trim()} onClick={() => void ask()}>
              {busy ? "Reading the book…" : "Ask"}
            </Button>
            {err ? <p className="mt-3 text-sm text-short">{err}</p> : null}
            {answer ? (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fg">{answer}</div>
            ) : null}
          </Panel>
        </div>
        <Panel className="h-fit p-5">
          <h2 className="text-sm font-medium">Guardrails</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>Stop after two consecutive losers.</li>
            <li>No size-up on a red day.</li>
            <li>Skip double-break ORB days.</li>
            <li>First hour is for mapping, not forcing.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function localInsights(
  trades: ReturnType<typeof useOrb.getState>["trades"],
  perf: ReturnType<typeof computePerformance>,
): string[] {
  const closed = trades.filter((t) => !t.open);
  const out: string[] = [];
  const bySetup = groupBy(closed, (t) => t.setup);
  let worst = { k: "", v: 0 };
  for (const [k, list] of Object.entries(bySetup)) {
    const v = list.reduce((s, t) => s + t.pnl, 0);
    if (v < worst.v) worst = { k, v };
  }
  if (worst.k) out.push(`${worst.k} is the weakest book at ${Math.round(worst.v)} over ${bySetup[worst.k]?.length} fills.`);

  const hours = Array.from({ length: 8 }, (_, i) => 9 + i).map((h) => {
    const list = closed.filter((t) => hourOfNy(t.entryTime) === h);
    return { h, pnl: list.reduce((s, t) => s + t.pnl, 0), n: list.length };
  });
  const leakH = [...hours].sort((a, b) => a.pnl - b.pnl)[0];
  if (leakH && leakH.pnl < 0) {
    out.push(`${leakH.h}:00 ET is underwater (${Math.round(leakH.pnl)} across ${leakH.n} trades).`);
  }

  const shorts = closed.filter((t) => t.side === "short");
  const longs = closed.filter((t) => t.side === "long");
  const sP = shorts.reduce((s, t) => s + t.pnl, 0);
  const lP = longs.reduce((s, t) => s + t.pnl, 0);
  if (sP < lP) out.push(`Shorts lag longs (${Math.round(sP)} vs ${Math.round(lP)}).`);
  else out.push(`Longs lag shorts (${Math.round(lP)} vs ${Math.round(sP)}).`);

  out.push(
    `Expectancy is ${perf.expectancy >= 0 ? "+" : ""}${Math.round(perf.expectancy)} per fill with a ${Math.round(perf.winRate * 100)}% win rate — the issue is not luck, it is selection.`,
  );
  return out;
}
