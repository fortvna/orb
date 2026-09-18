import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseDeskSnapshot } from "@/lib/desk-io";
import { downloadText } from "@/lib/format";
import { nyToday } from "@/lib/market/clock";
import { useOrb } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DeskSettings({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const useMockData = useOrb((s) => s.useMockData);
  const mockDay = useOrb((s) => s.mockDay);
  const setMockData = useOrb((s) => s.setMockData);
  const clearLedger = useOrb((s) => s.clearLedger);
  const resetDemo = useOrb((s) => s.resetDemo);
  const importDesk = useOrb((s) => s.importDesk);
  const today = nyToday();
  const on = useMockData && mockDay === today;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function exportDesk() {
    const s = useOrb.getState();
    const snap = {
      v: 1 as const,
      at: new Date().toISOString(),
      trades: s.trades.filter((t) => t.source !== "evaluated" && !t.id.startsWith("sd-")),
      playbooks: s.playbooks,
      evaluations: s.evaluations,
      customReports: s.customReports,
      watchlist: s.watchlist,
      propId: s.propId,
      propStartedAt: s.propStartedAt,
      notes: s.notes,
      drawings: s.drawings,
      indicators: s.indicators,
    };
    downloadText(`orb-desk-${today}.json`, JSON.stringify(snap, null, 2), "application/json");
    setNotice("Desk exported.");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted hover:bg-surface hover:text-fg",
          compact && "justify-center px-0",
        )}
        aria-label="Desk settings"
        title="Desk settings"
      >
        <Settings className="size-4 shrink-0" />
        {compact ? null : <span>Settings</span>}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "absolute z-50 w-80 rounded-lg border border-border bg-bg-elevated p-4 shadow-soft",
              compact
                ? "fixed bottom-4 left-16 z-50 max-h-[min(70vh,32rem)] overflow-y-auto"
                : "left-0 top-full mt-2 max-h-[70vh] overflow-y-auto",
            )}
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Tape</p>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-fg">Model tape for today</div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  If Yahoo is thin, generate today’s Globex and a few demo fills. Turns off at the next NY session.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => setMockData(!on)}
                className={cn(
                  "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
                  on ? "bg-steel" : "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-fg transition-transform",
                    on ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
            {on ? <p className="mt-2 font-mono text-[11px] text-muted">Active · {today}</p> : null}

            <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-subtle">Backup</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Fills, playbooks, evals, and drawings live in this browser. Export before you clear it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={exportDesk}>
                Export desk
              </Button>
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                Import desk
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const snap = parseDeskSnapshot(text);
                  if (!snap) {
                    setNotice("Could not read that desk file.");
                    return;
                  }
                  importDesk(snap);
                  setNotice(`Imported ${snap.playbooks.length} books · ${snap.trades.length} fills.`);
                });
                e.target.value = "";
              }}
            />
            {notice ? <p className="mt-2 text-xs text-muted">{notice}</p> : null}

            <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-subtle">Limits</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>Tape is Yahoo Finance — delayed quotes. 5m history ~60 Globex days; 1m ~5 days. No broker, no tick tape.</li>
              <li>Upload a 1m JSON/CSV pack on Playbooks / Replay / Reports for London hours Yahoo often lacks. Cap 80k bars. Pack ≠ Yahoo ≠ Themis.</li>
              <li>Volume / delta is a close-in-bar split from OHLC — not order flow.</li>
              <li>Futures fees $4.08 round-turn per contract (estimate). $1 other.</li>
              <li>Journal is CSV/JSON you import. No Tradovate, Rithmic, or TT.</li>
              <li>Prop board uses public Apex / Topstep-style rule templates. Local sim.</li>
              <li>Calendar is scheduled US prints only — no actuals or forecasts.</li>
              <li>Mentor needs an xAI key; otherwise you get a local mechanical draft.</li>
              <li>Everything lives in this browser. Export the desk to keep it.</li>
            </ul>

            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearLedger();
                  setNotice("Fills and evals cleared.");
                }}
              >
                Clear fills & evals
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!window.confirm("Reset the desk to factory playbooks and an empty ledger?")) return;
                  resetDemo();
                  setNotice("Desk reset.");
                }}
              >
                Reset desk
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
