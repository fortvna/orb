import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { DeskChain } from "@/components/desk-chain";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { TapePackPanel } from "@/components/tape-pack-panel";
import { evaluateLive } from "@/lib/market/use-feed";
import { hydratePlaybook, parsePlaybooks, PLAYBOOK_TEMPLATE } from "@/lib/market/playbook-parse";
import { KIT_CHOICES, kitForKind, kitLabel } from "@/lib/market/playbook-kit";
import { fmtClock, parseClock } from "@/lib/market/clock";
import { SYMBOLS } from "@/lib/market/symbols";
import type { IndicatorId, Playbook, PlaybookKind } from "@/lib/market/types";
import { evalSourceLabel } from "@/lib/market/types";
import { isMetisMarkdown } from "@/lib/hypothesis";
import { useOrb } from "@/lib/store";

export const Route = createFileRoute("/app/playbooks")({ component: PlaybooksPage });

function emptyDraft(): Playbook {
  return hydratePlaybook({
    id: `pb-${Date.now().toString(36)}`,
    name: "",
    setup: "",
    thesis: "",
    rules: [""],
    invalidation: "",
    session: "NY RTH",
    status: "draft",
    origin: "custom",
    kind: "orb",
    symbol: "NQ",
  });
}

function PlaybooksPage() {
  const playbooks = useOrb((s) => s.playbooks);
  const setStatus = useOrb((s) => s.setPlaybookStatus);
  const addPlaybook = useOrb((s) => s.addPlaybook);
  const updatePlaybook = useOrb((s) => s.updatePlaybook);
  const removePlaybook = useOrb((s) => s.removePlaybook);
  const importPlaybooks = useOrb((s) => s.importPlaybooks);
  const saveEvaluation = useOrb((s) => s.saveEvaluation);
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [draft, setDraft] = useState<Playbook | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [evalBusy, setEvalBusy] = useState<string | null>(null);

  function applyImport(text: string, filename = "") {
    const list = parsePlaybooks(text, filename);
    if (!list.length) {
      setNotice("Could not read a playbook from that file. Use JSON, CSV, or Markdown.");
      return;
    }
    const n = importPlaybooks(list);
    const slugs = list.map((p) => p.metisSlug).filter(Boolean);
    setNotice(
      slugs.length
        ? `Imported ${n} Metis card${n === 1 ? "" : "s"} (${slugs.join(", ")}). Origin stamped imported; source URL in mentor notes.`
        : `Imported ${n} playbook${n === 1 ? "" : "s"}.`,
    );
    setPaste("");
    setShowImport(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ playbooks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orb-playbooks.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runEval(pb: Playbook) {
    setEvalBusy(pb.id);
    try {
      const { evaluation, live } = await evaluateLive(pb, 40);
      saveEvaluation(evaluation);
      const src = evaluation.summary.source ?? (live ? "live" : "model");
      setNotice(
        evaluation.summary.source === "empty" || !evaluation.summary.sessions
          ? `${pb.name}: no sessions (source: empty). Upload a 1m pack for ${pb.symbol}, wait for Yahoo, or turn on Model tape for today — model cannot validate.`
          : `${pb.name}: ${evaluation.summary.trades} fills / ${evaluation.summary.sessions} ${src} sessions · WR ${Math.round(evaluation.summary.winRate * 100)}% · PF ${evaluation.summary.profitFactor.toFixed(2)}`,
      );
    } catch {
      setNotice("Could not evaluate on the live tape.");
    } finally {
      setEvalBusy(null);
    }
  }

  return (
    <div>
      <PageHead kicker="Playbooks" title="Your rules">
        <div className="flex flex-col items-end gap-2">
          <DeskChain current="/app/playbooks" />
          <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowImport((v) => !v)}>
            Import
          </Button>
          <Button size="sm" variant="secondary" onClick={exportJson}>
            Export
          </Button>
          <Button size="sm" asChild variant="secondary">
            <Link to="/app/mentor">Ask mentor</Link>
          </Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft())}>
            New playbook
          </Button>
          </div>
        </div>
      </PageHead>

      <div className="space-y-4 p-4 sm:p-6">
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        <TapePackPanel />

        {showImport ? (
          <Panel className="p-5">
            <h2 className="text-sm font-medium">Import playbooks</h2>
            <p className="mt-1 text-sm text-muted">
              Drop JSON, CSV, Markdown, or a Metis <span className="font-mono">strt-*.md</span> card
              (## Idea / Setup / Entry / Exit / Invalidation, or Setup / Trigger / Stop). Origin is
              stamped imported; source URL lands in mentor notes. Yahoo tape ≠ uploaded pack ≠ Themis ask.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.md,.txt,application/json,text/csv,text/markdown"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((t) => applyImport(t, file.name));
                e.target.value = "";
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPaste(PLAYBOOK_TEMPLATE)}>
                Load template
              </Button>
            </div>
            <Textarea
              className="mt-3 min-h-40 font-mono text-xs"
              placeholder="Paste JSON, CSV, Markdown, or a Metis strt-*.md card…"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!paste.trim()}
                onClick={() => applyImport(paste, isMetisMarkdown(paste) ? "strt-paste.md" : "")}
              >
                {isMetisMarkdown(paste) ? "Import Metis card" : "Import pasted"}
              </Button>
            </div>
          </Panel>
        ) : null}

        {draft ? (
          <PlaybookForm
            value={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => {
              if (!draft.name.trim()) return;
              const rules = draft.rules.map((r) => r.trim()).filter(Boolean);
              const existing = playbooks.some((p) => p.id === draft.id);
              const next = hydratePlaybook({ ...draft, rules, setup: draft.setup || draft.name });
              if (existing) updatePlaybook(draft.id, next);
              else addPlaybook(next);
              setDraft(null);
            }}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {playbooks.map((pb) => {
            const ev = pb.evaluation;
            return (
              <Panel key={pb.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl tracking-tight">
                      <Link
                        to="/app/replay"
                        search={{ mode: "free", playbook: pb.id }}
                        className="hover:underline"
                      >
                        {pb.name}
                      </Link>
                    </h2>
                    <div className="mt-1 text-xs text-muted">
                      {pb.symbol} · {pb.kind} · {pb.timeframe} · {fmtClock(pb.windowStart)}–
                      {fmtClock(pb.windowEnd)} · {pb.targetR}R
                      {pb.origin === "imported" ? " · imported" : pb.origin === "mentor" ? " · mentor" : ""}
                      {pb.metisSlug ? ` · ${pb.metisSlug}` : ""}
                      {pb.groundingVersion ? ` · grounding ${pb.groundingVersion}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(pb.indicators ?? []).map((id) => (
                        <span key={id} className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
                          {kitLabel(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Badge tone={pb.validated ? "long" : pb.status === "paused" ? "muted" : pb.status === "draft" ? "muted" : "warn"}>
                    {pb.validated ? "validated" : pb.status}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{pb.thesis}</p>
                <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-fg">
                  {pb.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                {pb.invalidation ? (
                  <p className="mt-4 text-xs text-subtle">Invalidation: {pb.invalidation}</p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Replay eval</div>
                    {ev ? (
                      <>
                        <PnlText value={ev.net} className="text-lg" />
                        <div className="text-xs text-muted">
                          {ev.trades} fills · {Math.round(ev.winRate * 100)}% win · PF {ev.profitFactor.toFixed(2)}
                          {" · "}
                          {evalSourceLabel(ev.source)}
                          {ev.source === "model" || ev.source === "empty" ? " · not validated" : ""}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted">Not evaluated</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={evalBusy === pb.id} onClick={() => void runEval(pb)}>
                      {evalBusy === pb.id ? "Evaluating…" : "Evaluate"}
                    </Button>
                    <Button size="sm" asChild>
                      <Link to="/app/replay" search={{ mode: "free", playbook: pb.id }}>
                        Run in replay
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...pb, rules: pb.rules.length ? pb.rules : [""] })}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setStatus(
                          pb.id,
                          pb.status === "paused" ? (pb.validated ? "validated" : "active") : "paused",
                        )
                      }
                    >
                      {pb.status === "paused" ? "Activate" : "Pause"}
                    </Button>
                    {pb.origin !== "desk" ? (
                      <Button size="sm" variant="ghost" onClick={() => removePlaybook(pb.id)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlaybookForm({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: Playbook;
  onChange: (p: Playbook) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Panel className="p-5">
      <h2 className="text-sm font-medium">Playbook</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Name
          <Input className="mt-1" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Kind
          <NativeSelect
            className="mt-1 w-full"
            value={value.kind}
            onChange={(e) => {
              const kind = e.target.value as PlaybookKind;
              onChange({ ...value, kind, indicators: kitForKind(kind) });
            }}
          >
            <option value="orb">Opening range</option>
            <option value="ib">IB</option>
            <option value="gap">Gap</option>
            <option value="vwap">VWAP</option>
            <option value="fvg">FVG</option>
            <option value="custom">Custom</option>
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Symbol
          <NativeSelect className="mt-1 w-full" value={value.symbol} onChange={(e) => onChange({ ...value, symbol: e.target.value })}>
            {SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Timeframe
          <NativeSelect
            className="mt-1 w-full"
            value={value.timeframe}
            onChange={(e) => onChange({ ...value, timeframe: e.target.value as Playbook["timeframe"] })}
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Window start
          <Input
            className="mt-1"
            defaultValue={fmtClock(value.windowStart)}
            key={`ws-${value.id}-${value.windowStart}`}
            onBlur={(e) => {
              const n = parseClock(e.target.value);
              if (n != null) onChange({ ...value, windowStart: n });
            }}
            placeholder="09:45"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Window end
          <Input
            className="mt-1"
            defaultValue={fmtClock(value.windowEnd)}
            key={`we-${value.id}-${value.windowEnd}`}
            onBlur={(e) => {
              const n = parseClock(e.target.value);
              if (n != null) onChange({ ...value, windowEnd: n });
            }}
            placeholder="11:00"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Stop ticks
          <Input
            className="mt-1"
            type="number"
            min={0}
            value={value.stopTicks ?? ""}
            onChange={(e) =>
              onChange({ ...value, stopTicks: e.target.value === "" ? null : Number(e.target.value) || null })
            }
            placeholder="range stop"
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Session
          <Input
            className="mt-1"
            value={value.session}
            onChange={(e) => onChange({ ...value, session: e.target.value })}
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Target R
          <Input
            className="mt-1"
            type="number"
            step="0.1"
            value={value.targetR}
            onChange={(e) => onChange({ ...value, targetR: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Status
          <NativeSelect
            className="mt-1 w-full"
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value as Playbook["status"] })}
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="validated">validated</option>
            <option value="paused">paused</option>
          </NativeSelect>
        </label>
      </div>
      <div className="mt-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">Replay kit</p>
        <p className="mt-1 text-xs text-muted">
          Replay loads this kit, the timeframe, and the window. Range high/low, then entry / SL / TP, mark on the tape.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {KIT_CHOICES.map((c) => {
            const on = value.indicators.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const next = on
                    ? value.indicators.filter((id) => id !== c.id)
                    : [...value.indicators, c.id as IndicatorId];
                  onChange({ ...value, indicators: next });
                }}
                className={
                  on
                    ? "rounded-full bg-fg px-2.5 py-1 font-mono text-[10px] uppercase text-bg"
                    : "rounded-full bg-surface px-2.5 py-1 font-mono text-[10px] uppercase text-muted"
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-subtle">
        Thesis
        <Textarea className="mt-1" value={value.thesis} onChange={(e) => onChange({ ...value, thesis: e.target.value })} />
      </label>
      <label className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-subtle">
        Rules (one per line)
        <Textarea
          className="mt-1"
          value={value.rules.join("\n")}
          onChange={(e) => onChange({ ...value, rules: e.target.value.split("\n") })}
        />
      </label>
      <label className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-subtle">
        Invalidation
        <Input
          className="mt-1"
          value={value.invalidation}
          onChange={(e) => onChange({ ...value, invalidation: e.target.value })}
        />
      </label>
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={onSave} disabled={!value.name.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}
