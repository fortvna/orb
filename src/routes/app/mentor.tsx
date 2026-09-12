import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DeskChain } from "@/components/desk-chain";
import { PageHead } from "@/components/page-head";
import { Panel } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { askMentor } from "@/lib/mentor";
import { evaluateLive } from "@/lib/market/use-feed";
import { hydratePlaybook, inferKind } from "@/lib/market/playbook-parse";
import { fmtClock } from "@/lib/market/clock";
import { closedTrades, computePerformance, takenTrades } from "@/lib/market/stats";
import type { Playbook, Trade } from "@/lib/market/types";
import { useOrb } from "@/lib/store";

export const Route = createFileRoute("/app/mentor")({ component: MentorPage });

function MentorPage() {
  const trades = useOrb((s) => s.trades);
  const playbooks = useOrb((s) => s.playbooks);
  const addPlaybook = useOrb((s) => s.addPlaybook);
  const updatePlaybook = useOrb((s) => s.updatePlaybook);
  const saveEvaluation = useOrb((s) => s.saveEvaluation);
  const mock = useOrb((s) => Boolean(s.useMockData && s.mockDay));
  const navigate = Route.useNavigate();
  const taken = takenTrades(trades, mock);
  const perf = computePerformance(taken);
  const [q, setQ] = useState("Draft an NQ opening-range continuation playbook I can validate.");
  const [answer, setAnswer] = useState<string | null>(null);
  const [draft, setDraft] = useState<Playbook | null>(null);
  const [busy, setBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState(playbooks[0]?.id ?? "new");
  const revising = playbooks.find((p) => p.id === target) ?? null;

  const insights = useMemo(() => localInsights(playbooks), [playbooks]);

  async function ask() {
    setBusy(true);
    setErr(null);
    const context = mentorContext({ playbooks, taken, perf, revising });
    const res = await askMentor({ data: { question: q, context } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      const fallback = fallbackDraft(q, revising);
      setDraft(fallback);
      setAnswer(
        "Mentor needs an xAI key here. This is a local mechanical draft from the selected book and your fills — validate the rules, then evaluate in replay.",
      );
      return;
    }
    setAnswer(res.text);
    const parsed = parseDraft(res.text, revising);
    if (parsed) setDraft(parsed);
  }

  function persistDraft(): string | null {
    if (!draft) return null;
    const revisingId = target !== "new" && playbooks.some((p) => p.id === target) ? target : null;
    const next = hydratePlaybook({
      ...draft,
      id: revisingId ?? draft.id,
      origin: "mentor",
      status: "draft",
      validated: false,
    });
    if (revisingId) updatePlaybook(revisingId, next);
    else addPlaybook(next);
    setDraft(next);
    return next.id;
  }

  function saveDraft() {
    persistDraft();
  }

  async function validate() {
    const id = persistDraft();
    if (!id || !draft) return;
    const next = hydratePlaybook({ ...draft, id, status: "active", validated: false, origin: "mentor" });
    updatePlaybook(id, next);
    setDraft(next);
    setEvalBusy(true);
    setErr(null);
    try {
      const { evaluation } = await evaluateLive(next, 40);
      saveEvaluation(evaluation);
      if (evaluation.summary.source === "live" && evaluation.summary.sessions > 0) {
        updatePlaybook(next.id, { status: "validated", validated: true, evaluation: evaluation.summary });
        setDraft({ ...next, status: "validated", validated: true, evaluation: evaluation.summary });
      } else if (evaluation.summary.sessions > 0) {
        setErr("That run used model tape — book stays unvalidated until a live window prints.");
      } else {
        setErr("No sessions in this window. Wait for the live tape, or turn on Model tape for today.");
      }
    } catch {
      setErr("Could not evaluate on the live tape.");
    } finally {
      setEvalBusy(false);
    }
  }

  return (
    <div>
      <PageHead kicker="Mentor" title="Write the book">
        <DeskChain current="/app/mentor" />
      </PageHead>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel className="p-5">
            <h2 className="text-sm font-medium">The chain</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted">
              <li>Describe a setup. Mentor drafts a mechanical playbook.</li>
              <li>You validate the rules — or send it back.</li>
              <li>
                Replay evaluates the book across sessions.{" "}
                <Link to="/app/replay" search={{ mode: "free" }} className="text-fg hover:underline">
                  Open replay
                </Link>
                .
              </li>
              <li>Reports and analytics are generated from those evaluations.</li>
            </ol>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-sm font-medium">What the books already say</h2>
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
            <p className="mt-1 text-xs text-subtle">
              User-initiated. Not advice. Needs an xAI key for a live draft; otherwise a local mechanical book you still
              evaluate in replay.
            </p>
            <Textarea className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">New playbook</option>
                {playbooks.map((p) => (
                  <option key={p.id} value={p.id}>
                    Revise {p.name}
                  </option>
                ))}
              </NativeSelect>
              <Button disabled={busy || !q.trim()} onClick={() => void ask()}>
                {busy ? "Drafting…" : "Draft playbook"}
              </Button>
            </div>
            {err ? <p className="mt-3 text-sm text-short">{err}</p> : null}
            {answer ? (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-fg">{answer}</div>
            ) : null}
          </Panel>

          {draft ? (
            <Panel className="p-5">
              <h2 className="font-display text-2xl tracking-tight">{draft.name}</h2>
              <p className="mt-1 text-xs text-muted">
                {draft.symbol} · {draft.kind} · {draft.session}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{draft.thesis}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm">
                {draft.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              {draft.invalidation ? (
                <p className="mt-3 text-xs text-subtle">Invalidation: {draft.invalidation}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={saveDraft}>
                  Save as draft
                </Button>
                <Button size="sm" variant="secondary" disabled={evalBusy} onClick={() => void validate()}>
                  {evalBusy ? "Evaluating live tape…" : "Evaluate on tape"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const id = persistDraft();
                    if (id) void navigate({ to: "/app/replay", search: { mode: "free", playbook: id } });
                  }}
                >
                  Save & load in replay
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
        <Panel className="h-fit p-5">
          <h2 className="text-sm font-medium">Guardrails</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>One book, one trigger. Do not weld ORB and FVG on the same print.</li>
            <li>Validate before you activate.</li>
            <li>Evaluate in replay — stats come from fills, not from the thesis.</li>
            <li>Skip double-break opening-range days.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function parseDraft(text: string, base?: Playbook | null): Playbook | null {
  const json = extractJsonObject(text);
  if (!json) return fallbackDraft(text, base);
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const name = String(raw.name ?? "").trim();
    if (!name) return null;
    const rules = Array.isArray(raw.rules) ? raw.rules.map((r) => String(r)) : [];
    return hydratePlaybook({
      id: base?.id ?? `pb-mentor-${Date.now().toString(36)}`,
      name,
      setup: String(raw.setup ?? name),
      thesis: String(raw.thesis ?? ""),
      rules,
      invalidation: String(raw.invalidation ?? ""),
      session: String(raw.session ?? base?.session ?? "NY RTH"),
      kind: inferKind(String(raw.kind ?? raw.setup ?? name)),
      symbol: String(raw.symbol ?? base?.symbol ?? "NQ"),
      targetR: Number(raw.targetR ?? base?.targetR ?? 1) || 1,
      windowStart: Number(raw.windowStart ?? base?.windowStart ?? 9 * 60 + 30),
      windowEnd: Number(raw.windowEnd ?? base?.windowEnd ?? 16 * 60),
      origin: "mentor",
      status: "draft",
    });
  } catch {
    return fallbackDraft(text, base);
  }
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function fallbackDraft(prompt: string, base?: Playbook | null): Playbook {
  if (base) {
    return hydratePlaybook({
      ...base,
      thesis: prompt.slice(0, 280) || base.thesis,
      origin: "mentor",
      status: "draft",
      validated: false,
      mentorNotes: "Local draft — no xAI key. Rules copied from the selected book; you still evaluate in replay.",
    });
  }
  const kind = inferKind(prompt);
  const name =
    kind === "ib"
      ? "IB extension draft"
      : kind === "gap"
        ? "Gap fade draft"
        : kind === "vwap"
          ? "VWAP reclaim draft"
          : kind === "fvg"
            ? "FVG invert draft"
            : "Opening range draft";
  return hydratePlaybook({
    id: `pb-mentor-${Date.now().toString(36)}`,
    name,
    setup: name,
    kind,
    symbol: "NQ",
    thesis: prompt.slice(0, 280),
    rules: [
      "Map the range before any order.",
      "First valid trigger only.",
      "Stop beyond the invalidation level.",
      "Target 1R unless the book says otherwise.",
    ],
    invalidation: "Double break or news inside the window.",
    session: "NY RTH",
    origin: "mentor",
    status: "draft",
  });
}

function fillLine(t: Trade): string {
  const r = t.rMultiple ? `${t.rMultiple.toFixed(2)}R` : "";
  return `${t.date} ${t.symbol} ${t.side} ${Math.round(t.pnl)} ${r} ${t.setup}`.trim();
}

function mentorContext({
  playbooks,
  taken,
  perf,
  revising,
}: {
  playbooks: Playbook[];
  taken: Trade[];
  perf: ReturnType<typeof computePerformance>;
  revising: Playbook | null;
}): string {
  const recent = [...closedTrades(taken)].sort((a, b) => b.entryTime - a.entryTime).slice(0, 10);
  const bookFills = revising
    ? closedTrades(taken.filter((t) => t.playbookId === revising.id))
        .sort((a, b) => b.entryTime - a.entryTime)
        .slice(0, 10)
    : [];
  const lines = [
    `Desk fills (taken, not engine): Net ${Math.round(perf.net)}, WR ${(perf.winRate * 100).toFixed(1)}%, PF ${perf.profitFactor.toFixed(2)}, n=${perf.trades}.`,
    "Playbooks: " +
      playbooks
        .map(
          (p) =>
            `${p.name} [${p.kind}/${p.status}${p.validated ? "/validated" : ""}] ${p.evaluation ? `WR ${Math.round(p.evaluation.winRate * 100)}% n=${p.evaluation.trades}` : "unevaluated"}`,
        )
        .join("; "),
  ];
  if (revising) {
    lines.push(
      `Revising ${revising.name} (${revising.id}): kind=${revising.kind} symbol=${revising.symbol} tf=${revising.timeframe} window ${fmtClock(revising.windowStart)}–${fmtClock(revising.windowEnd)} targetR=${revising.targetR}`,
      `Thesis: ${revising.thesis}`,
      `Rules: ${revising.rules.join(" | ")}`,
      `Invalidation: ${revising.invalidation}`,
    );
    if (bookFills.length) lines.push("Fills on this book: " + bookFills.map(fillLine).join("; "));
    else lines.push("Fills on this book: none yet.");
  }
  if (recent.length) lines.push("Last 10 taken fills: " + recent.map(fillLine).join("; "));
  else lines.push("Last 10 taken fills: none.");
  return lines.join("\n");
}

function localInsights(playbooks: Playbook[]): string[] {
  const out: string[] = [];
  const uneval = playbooks.filter((p) => !p.evaluation);
  if (uneval.length) out.push(`${uneval.length} books have no replay evaluation yet — stats are empty until you run them.`);
  const weak = playbooks
    .filter((p) => p.evaluation && p.evaluation.winRate < 0.45)
    .sort((a, b) => (a.evaluation?.winRate ?? 1) - (b.evaluation?.winRate ?? 1))[0];
  if (weak?.evaluation) {
    out.push(`${weak.name} is the soft book at ${Math.round(weak.evaluation.winRate * 100)}% over ${weak.evaluation.trades} fills.`);
  }
  const best = playbooks
    .filter((p) => p.evaluation && p.evaluation.trades >= 8)
    .sort((a, b) => (b.evaluation?.expectancy ?? 0) - (a.evaluation?.expectancy ?? 0))[0];
  if (best?.evaluation) {
    out.push(`${best.name} leads expectancy at ${Math.round(best.evaluation.expectancy)} per fill.`);
  }
  out.push("Mentor drafts. You validate. Replay measures. Reports publish. Analytics rolls it up.");
  return out;
}
