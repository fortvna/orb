import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/page-head";
import { DeskChain } from "@/components/desk-chain";
import { PnlText } from "@/components/pnl";
import { Panel, Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { downloadText } from "@/lib/format";
import { nyToday } from "@/lib/market/clock";
import { getSymbol, SYMBOLS } from "@/lib/market/symbols";
import { closedTrades, dailyPnl, takenTrades } from "@/lib/market/stats";
import { isSeedTrade } from "@/lib/market/seed";
import { parseTrades, serializeTradesCsv, TRADE_CSV_TEMPLATE } from "@/lib/market/trade-parse";
import type { Trade, TradeSide } from "@/lib/market/types";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";
import { weekdayName } from "@/lib/format";

export const Route = createFileRoute("/app/journal")({ component: JournalPage });

function JournalPage() {
  const trades = useOrb((s) => s.trades);
  const playbooks = useOrb((s) => s.playbooks);
  const addTrade = useOrb((s) => s.addTrade);
  const updateTrade = useOrb((s) => s.updateTrade);
  const importTrades = useOrb((s) => s.importTrades);
  const removeTrade = useOrb((s) => s.removeTrade);
  const mock = useOrb((s) => Boolean(s.useMockData && s.mockDay));
  const notes = useOrb((s) => s.notes);
  const setNote = useOrb((s) => s.setNote);
  const allTaken = takenTrades(trades, mock);
  const [sourceFilter, setSourceFilter] = useState<"all" | "journal" | "replay" | "prop">("all");
  const [symbolFilter, setSymbolFilter] = useState("");
  const taken = allTaken.filter((t) => {
    if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
    if (symbolFilter && t.symbol !== symbolFilter) return false;
    return true;
  });
  const closed = closedTrades(taken);
  const daily = dailyPnl(taken);
  const today = nyToday();
  const [month, setMonth] = useState(() => monthOf(daily.at(-1)?.date ?? today));
  const [selected, setSelected] = useState<string | null>(daily.at(-1)?.date ?? today);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => {
    const set = new Set(daily.map((d) => d.date.slice(0, 7)));
    set.add(today.slice(0, 7));
    return [...set].sort().reverse();
  }, [daily, today]);

  const cells = useMemo(() => buildMonth(month, daily), [month, daily]);
  const dayTrades = taken.filter((t) => t.date === selected);
  const dayNet = closedTrades(dayTrades).reduce((s, t) => s + t.pnl, 0);
  const monthDays = daily.filter((d) => d.date.startsWith(month));
  const monthNet = monthDays.reduce((s, d) => s + d.pnl, 0);
  const monthWins = monthDays.filter((d) => d.pnl > 0).length;
  const monthN = monthDays.filter((d) => d.n > 0).length;

  return (
    <div>
      <PageHead kicker="Journal" title="Calendar">
        <div className="flex flex-col items-end gap-2">
          <DeskChain current="/app/journal" />
          <p className="max-w-sm text-right text-[11px] leading-relaxed text-subtle">
            CSV / JSON you import — no broker connection. Futures fees $4.08 RT/contract estimate.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setAdding((v) => !v);
              }}
            >
              {adding ? "Close" : "Add fill"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const list = parseTrades(text);
                  if (!list.length) {
                    setImportNotice(
                      "Could not read fills. CSV columns: date, symbol, side, qty, entry, exit, stop, setup, notes, tags.",
                    );
                    return;
                  }
                  const n = importTrades(list);
                  setImportNotice(`Imported ${n} fill${n === 1 ? "" : "s"}.`);
                  if (list[0]) {
                    setSelected(list[0].date);
                    setMonth(list[0].date.slice(0, 7));
                  }
                });
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Import CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadText("orb-journal-template.csv", TRADE_CSV_TEMPLATE, "text/csv")}
            >
              Template
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!taken.length}
              onClick={() =>
                downloadText(`orb-journal-${month}.csv`, serializeTradesCsv(taken), "text/csv")
              }
            >
              Export
            </Button>
            <NativeSelect value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {labelMonth(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </PageHead>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <Stat label="Month net" value={<PnlText value={monthNet} />} hint={`${monthN} trading days`} />
            </Panel>
            <Panel className="p-4">
              <Stat
                label="Green days"
                value={monthN ? `${monthWins}/${monthN}` : "—"}
                hint={monthN ? `${Math.round((monthWins / monthN) * 100)}%` : "no fills this month"}
              />
            </Panel>
            <Panel className="p-4">
              <Stat label="Fills" value={`${closed.filter((t) => t.date.startsWith(month)).length}`} hint="this month" />
            </Panel>
          </div>

          {adding ? (
            <AddFillForm
              date={selected ?? today}
              playbooks={playbooks.map((p) => ({ id: p.id, name: p.name }))}
              onSave={(t) => {
                addTrade(t);
                setSelected(t.date);
                setMonth(t.date.slice(0, 7));
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : null}

          {importNotice ? <p className="text-sm text-muted">{importNotice}</p> : null}

          <div className="flex flex-wrap gap-2">
            <NativeSelect
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | "journal" | "replay" | "prop")}
              className="h-8 max-w-[9rem] text-xs"
            >
              <option value="all">All sources</option>
              <option value="journal">Journal</option>
              <option value="replay">Replay</option>
              <option value="prop">Prop</option>
            </NativeSelect>
            <NativeSelect
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="h-8 max-w-[9rem] text-xs"
            >
              <option value="">All symbols</option>
              {SYMBOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {taken.length === 0 && !adding ? (
            <Panel className="p-5">
              <p className="text-sm text-muted">
                No fills yet. Add one here, import a CSV, paper trade in Replay, or turn on Model tape for today in Settings.
              </p>
            </Panel>
          ) : null}

          <Panel className="p-4">
            <div className="grid grid-cols-7 gap-1">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={`${d}${i}`} className="pb-2 text-center text-[10px] uppercase tracking-[0.12em] text-subtle">
                  {d}
                </div>
              ))}
              {cells.map((c, i) => {
                if (!c.date) return <div key={i} />;
                const active = selected === c.date;
                return (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() => setSelected(c.date)}
                    className={cn(
                      "aspect-square rounded-md p-1 text-left",
                      c.n === 0 && !notes[c.date] && "bg-surface-2/40 text-subtle",
                      c.n === 0 && notes[c.date] && "bg-surface-2/70 text-fg",
                      c.n > 0 && c.pnl > 0 && "bg-long/25 text-fg",
                      c.n > 0 && c.pnl < 0 && "bg-short/25 text-fg",
                      c.n > 0 && c.pnl === 0 && "bg-surface text-fg",
                      active && "ring-1 ring-steel",
                    )}
                  >
                    <div className="text-[10px] text-muted">{Number(c.date.slice(8))}</div>
                    {c.n > 0 ? (
                      <div className="mt-1 font-mono text-[10px] tabular-nums">
                        {c.pnl >= 0 ? "+" : ""}
                        {Math.round(c.pnl)}
                      </div>
                    ) : notes[c.date] ? (
                      <div className="mt-1 text-[10px] text-muted">note</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel className="p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                    {weekdayName(new Date(`${selected}T12:00:00Z`).getUTCDay())}
                  </div>
                  <h2 className="font-mono text-sm">{selected}</h2>
                </div>
                <PnlText value={dayNet} className="text-lg" />
              </div>
              <p className="mt-1 text-xs text-muted">{dayTrades.length} fills</p>
              {selected ? (
                <label className="mt-3 block text-[11px] uppercase tracking-[0.12em] text-subtle">
                  Session note
                  <Textarea
                    className="mt-1 min-h-20"
                    value={notes[selected] ?? ""}
                    onChange={(e) => setNote(selected, e.target.value)}
                    placeholder="What you saw. What you skipped."
                  />
                </label>
              ) : null}
              <ul className="mt-4 space-y-2">
                {dayTrades.length === 0 ? (
                  <li className="text-sm text-muted">No fills this session.</li>
                ) : (
                  dayTrades.map((t) => (
                    <li key={t.id} className="border-b border-border/60 py-2 text-sm">
                      {editing?.id === t.id ? (
                        <AddFillForm
                          date={t.date}
                          initial={t}
                          playbooks={playbooks.map((p) => ({ id: p.id, name: p.name }))}
                          onSave={(next) => {
                            updateTrade(t.id, next);
                            setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" className="min-w-0 text-left" onClick={() => setEditing(t)}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{t.symbol}</span>
                              <Badge tone={t.side === "long" ? "long" : "short"}>{t.side}</Badge>
                              {isSeedTrade(t) ? <Badge tone="muted">mock</Badge> : null}
                              {t.source === "replay" ? <Badge tone="warn">replay</Badge> : null}
                              {t.open ? <Badge tone="warn">open</Badge> : null}
                            </div>
                            <div className="text-xs text-muted">
                              {t.setup}
                              {t.tags
                                .filter((tag) => tag !== "journal" && tag !== "imported" && tag !== "mock")
                                .map((tag) => ` · ${tag}`)
                                .join("")}
                            </div>
                            {t.notes ? <p className="mt-1 text-xs leading-relaxed text-muted">{t.notes}</p> : null}
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            {t.open ? <span className="text-xs text-muted">open</span> : <PnlText value={t.pnl} />}
                            {t.source === "journal" || t.source === "replay" ? (
                              <button
                                type="button"
                                className="text-[11px] text-muted hover:text-fg"
                                onClick={() => removeTrade(t.id)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Pick a day.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function AddFillForm({
  date,
  initial,
  playbooks,
  onSave,
  onCancel,
}: {
  date: string;
  initial?: Trade;
  playbooks: { id: string; name: string }[];
  onSave: (t: Trade) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? "NQ");
  const [side, setSide] = useState<TradeSide>(initial?.side ?? "long");
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [entry, setEntry] = useState(initial ? String(initial.entry) : "");
  const [exit, setExit] = useState(initial?.exit != null ? String(initial.exit) : "");
  const [stop, setStop] = useState(initial?.stop != null ? String(initial.stop) : "");
  const [setup, setSetup] = useState(initial?.setup ?? "Journal");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState(
    (initial?.tags ?? []).filter((t) => t !== "journal" && t !== "imported" && t !== "mock").join(", "),
  );
  const [playbookId, setPlaybookId] = useState(initial?.playbookId ?? "");
  const [day, setDay] = useState(initial?.date ?? date);
  const spec = getSymbol(symbol);

  function submit() {
    const en = Number(entry);
    const ex = exit.trim() === "" ? null : Number(exit);
    const st = stop.trim() === "" ? null : Number(stop);
    if (!Number.isFinite(en) || en <= 0) return;
    if (ex !== null && (!Number.isFinite(ex) || ex <= 0)) return;
    if (st !== null && !Number.isFinite(st)) return;
    const pnl = ex === null ? 0 : (side === "long" ? ex - en : en - ex) * qty * spec.pointValue;
    const risk =
      st != null && st !== en ? Math.abs(en - st) * qty * spec.pointValue : spec.tick * 8 * qty * spec.pointValue || 1;
    const noon = Math.floor(new Date(`${day}T16:00:00Z`).getTime() / 1000);
    const extraTags = tags
      .split(/[|,]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    onSave({
      id: initial?.id ?? `jn-${Date.now().toString(36)}`,
      symbol,
      side,
      qty,
      entry: en,
      exit: ex,
      entryTime: initial?.entryTime ?? noon,
      exitTime: ex === null ? null : (initial?.exitTime ?? noon + 3600),
      stop: st,
      target: initial?.target ?? null,
      pnl,
      fees: spec.kind === "futures" ? qty * 4.08 : 1,
      rMultiple: pnl / risk,
      setup: setup.trim() || "Journal",
      tags: [...new Set(["journal", ...extraTags])],
      notes: notes.trim(),
      source: initial?.source ?? "journal",
      playbookId: playbookId || null,
      date: day,
      open: ex === null,
    });
  }

  const body = (
      <>
      <h2 className="text-sm font-medium">{initial ? "Edit fill" : "Add fill"}</h2>
      <p className="mt-1 text-xs text-muted">
        Leave exit empty to keep it open. Notes and tags stay on the day. Fees:{" "}
        {spec.kind === "futures" ? "$4.08 RT/contract estimate" : "$1 estimate"} — not an exchange invoice.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Date
          <Input className="mt-1" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Symbol
          <NativeSelect className="mt-1 w-full" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Side
          <NativeSelect className="mt-1 w-full" value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Qty
          <Input className="mt-1" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Entry
          <Input className="mt-1" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Exit
          <Input className="mt-1" inputMode="decimal" value={exit} onChange={(e) => setExit(e.target.value)} placeholder="open" />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Stop
          <Input className="mt-1" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Setup
          <Input className="mt-1" value={setup} onChange={(e) => setSetup(e.target.value)} />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle">
          Playbook
          <NativeSelect className="mt-1 w-full" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
            <option value="">None</option>
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle sm:col-span-3">
          Tags
          <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="orb, nyam" />
        </label>
        <label className="text-[11px] uppercase tracking-[0.12em] text-subtle sm:col-span-3">
          Notes
          <Textarea className="mt-1 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={submit} disabled={!entry.trim()}>
          {initial ? "Save changes" : "Save fill"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      </>
  );
  if (initial) return <div className="space-y-3">{body}</div>;
  return <Panel className="p-5">{body}</Panel>;
}

function monthOf(date?: string) {
  return (date ?? nyToday()).slice(0, 7);
}

function labelMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMonth(ym: string, daily: { date: string; pnl: number; n: number }[]) {
  const map = new Map(daily.map((d) => [d.date, d]));
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  const pad = (start.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const cells: { date: string | null; pnl: number; n: number }[] = Array.from({ length: pad }, () => ({
    date: null,
    pnl: 0,
    n: 0,
  }));
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    const hit = map.get(date);
    cells.push({ date, pnl: hit?.pnl ?? 0, n: hit?.n ?? 0 });
  }
  return cells;
}
