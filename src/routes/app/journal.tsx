import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/page-head";
import { PnlText } from "@/components/pnl";
import { Panel } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { fmtPx, fmtDateNy } from "@/lib/format";
import { getSymbol } from "@/lib/market/symbols";
import { SYMBOLS } from "@/lib/market/symbols";
import { closedTrades } from "@/lib/market/stats";
import { useOrb } from "@/lib/store";
import type { Trade } from "@/lib/market/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/journal")({ component: JournalPage });

function JournalPage() {
  const trades = useOrb((s) => s.trades);
  const updateTrade = useOrb((s) => s.updateTrade);
  const addTrade = useOrb((s) => s.addTrade);
  const [setup, setSetup] = useState("all");
  const [symbol, setSymbol] = useState("all");
  const [selected, setSelected] = useState<string | null>(trades[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);

  const rows = useMemo(() => {
    return closedTrades(trades).filter((t) => {
      if (setup !== "all" && t.setup !== setup) return false;
      if (symbol !== "all" && t.symbol !== symbol) return false;
      return true;
    });
  }, [trades, setup, symbol]);

  const active = trades.find((t) => t.id === selected) ?? rows[0];

  return (
    <div>
      <PageHead kicker="Journal" title="Fills">
        <div className="flex flex-wrap gap-2">
          <NativeSelect value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="all">All symbols</option>
            {SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={setup} onChange={(e) => setSetup(e.target.value)}>
            {["all", "ORB", "IB", "Gap", "VWAP", "FVG"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All setups" : s}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Close" : "Add fill"}
          </Button>
        </div>
      </PageHead>

      <div className="p-4 sm:p-6">
        {showAdd ? <AddTrade onDone={() => setShowAdd(false)} add={addTrade} /> : null}

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Sym</th>
                    <th className="px-2 py-2 font-medium">Side</th>
                    <th className="px-2 py-2 font-medium">Setup</th>
                    <th className="px-2 py-2 font-medium">Entry</th>
                    <th className="px-2 py-2 font-medium">R</th>
                    <th className="px-4 py-2 font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        "cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface/60",
                        selected === t.id && "bg-surface",
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">{t.date}</td>
                      <td className="px-2 py-2.5 font-mono">{t.symbol}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone={t.side === "long" ? "long" : "short"}>{t.side}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-muted">{t.setup}</td>
                      <td className="px-2 py-2.5 font-mono tabular-nums">
                        {fmtPx(t.entry, getSymbol(t.symbol).digits)}
                      </td>
                      <td className="px-2 py-2.5">
                        <PnlText value={t.rMultiple} as="r" />
                      </td>
                      <td className="px-4 py-2.5">
                        <PnlText value={t.pnl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-4">
            {active ? (
              <TradeDetail trade={active} onNote={(notes) => updateTrade(active.id, { notes })} />
            ) : (
              <p className="text-sm text-muted">Select a fill.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TradeDetail({ trade, onNote }: { trade: Trade; onNote: (n: string) => void }) {
  const spec = getSymbol(trade.symbol);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm">
          {trade.symbol} {trade.side}
        </h2>
        <PnlText value={trade.pnl} />
      </div>
      <div className="mt-1 text-xs text-muted">{fmtDateNy(trade.date)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Entry</dt>
          <dd className="font-mono">{fmtPx(trade.entry, spec.digits)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Exit</dt>
          <dd className="font-mono">{trade.exit ? fmtPx(trade.exit, spec.digits) : "open"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">Qty</dt>
          <dd className="font-mono">{trade.qty}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-subtle">R</dt>
          <dd>
            <PnlText value={trade.rMultiple} as="r" />
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1">
        {trade.tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      <label className="mt-4 block text-[11px] uppercase tracking-[0.12em] text-subtle">
        Notes
        <Textarea
          className="mt-1"
          value={trade.notes}
          onChange={(e) => onNote(e.target.value)}
        />
      </label>
    </div>
  );
}

function AddTrade({
  onDone,
  add,
}: {
  onDone: () => void;
  add: (t: Trade) => void;
}) {
  const [symbol, setSymbol] = useState("ES");
  const [side, setSide] = useState<"long" | "short">("long");
  const [setup, setSetup] = useState("ORB");
  const [qty, setQty] = useState(1);
  const [pnl, setPnl] = useState(120);
  const spec = getSymbol(symbol);

  return (
    <Panel className="mb-4 p-4">
      <h2 className="text-sm font-medium">Manual fill</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        <NativeSelect value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          {SYMBOLS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={side} onChange={(e) => setSide(e.target.value as "long" | "short")}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </NativeSelect>
        <NativeSelect value={setup} onChange={(e) => setSetup(e.target.value)}>
          {["ORB", "IB", "Gap", "VWAP", "FVG"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </NativeSelect>
        <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
        <Input type="number" value={pnl} onChange={(e) => setPnl(Number(e.target.value) || 0)} />
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          onClick={() => {
            const now = Math.floor(Date.now() / 1000);
            add({
              id: `m-${now}`,
              symbol,
              side,
              qty,
              entry: lastRough(spec.typical),
              exit: lastRough(spec.typical),
              entryTime: now,
              exitTime: now,
              stop: null,
              target: null,
              pnl,
              fees: 2,
              rMultiple: pnl >= 0 ? 1 : -1,
              setup,
              tags: [setup, "manual"],
              notes: "Manual fill",
              source: "journal",
              playbookId: null,
              date: new Date().toISOString().slice(0, 10),
              open: false,
            });
            onDone();
          }}
        >
          Save fill
        </Button>
      </div>
    </Panel>
  );
}

function lastRough(n: number) {
  return n;
}
