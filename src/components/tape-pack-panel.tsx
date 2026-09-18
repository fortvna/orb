import { useRef, useState } from "react";
import { Panel } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  parseTapePack,
  TAPE_MAX_BARS,
  TAPE_MAX_FILE_BYTES,
  type TapePackMeta,
} from "@/lib/market/tape-pack";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

function statusLine(p: TapePackMeta): string {
  const range =
    p.dateStart && p.dateEnd
      ? p.dateStart === p.dateEnd
        ? p.dateStart
        : `${p.dateStart} → ${p.dateEnd}`
      : "no dates";
  const london =
    p.londonBars > 0
      ? `London 02:00–08:00 NY: ${p.londonBars.toLocaleString()} bars`
      : "London 02:00–08:00 NY: none — LONNY will skip";
  return `${p.symbol} · ${p.barCount.toLocaleString()}×1m · ${range} · ${london}`;
}

export function TapePackPanel({
  symbol,
  compact = false,
  className,
}: {
  symbol?: string;
  compact?: boolean;
  className?: string;
}) {
  const tapePacks = useOrb((s) => s.tapePacks);
  const upsertTapePack = useOrb((s) => s.upsertTapePack);
  const removeTapePack = useOrb((s) => s.removeTapePack);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = symbol ? tapePacks.filter((p) => p.symbol === symbol) : tapePacks;

  async function onFile(file: File) {
    setBusy(true);
    setNotice(null);
    try {
      if (file.size > TAPE_MAX_FILE_BYTES) {
        setNotice(`File is over ${Math.round(TAPE_MAX_FILE_BYTES / (1024 * 1024))}MB. Cap is ${TAPE_MAX_BARS.toLocaleString()} 1m bars.`);
        return;
      }
      const text = await file.text();
      const parsed = parseTapePack(text, { filename: file.name, fallbackSymbol: symbol });
      if (!parsed.ok) {
        setNotice(parsed.error);
        return;
      }
      const result = upsertTapePack(parsed.pack);
      const bits = [
        `Loaded ${parsed.pack.symbol} ${parsed.pack.bars.length.toLocaleString()}×1m (${parsed.pack.source}).`,
        ...parsed.warnings,
        result.warning,
        "Uploaded pack ≠ Yahoo ≠ Themis ask. execution_ready false.",
      ].filter(Boolean);
      setNotice(bits.join(" "));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  const uploadBtn = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.csv,.tsv,application/json,text/csv,text/tab-separated-values"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void onFile(file);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Reading…" : "Upload tape pack"}
      </Button>
    </>
  );

  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {uploadBtn}
        {shown.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <Badge tone="steel" title={statusLine(p)}>
              pack {p.symbol} {p.barCount.toLocaleString()}
            </Badge>
            <button
              type="button"
              className="text-[11px] text-muted hover:text-fg"
              onClick={() => {
                removeTapePack(p.id);
                setNotice(`Removed ${p.symbol} pack.`);
              }}
            >
              Remove
            </button>
          </span>
        ))}
        {notice ? <span className="text-[11px] text-muted">{notice}</span> : null}
      </div>
    );
  }

  return (
    <Panel className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">1m tape pack</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            JSON or CSV OHLC for Grounding clocks (London 02:00–08:00 NY). Yahoo RTH slices often have
            none. Pack is user tape, not model, not Themis. Cap {TAPE_MAX_BARS.toLocaleString()} bars.
          </p>
        </div>
        {uploadBtn}
      </div>
      {shown.length ? (
        <ul className="mt-3 space-y-2">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-sm">
              <div>
                <div className="text-fg">{statusLine(p)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  source {p.source}
                  {p.persisted ? "" : " · in-memory only (not saved in this browser)"}
                  {" · uploaded pack ≠ Yahoo ≠ Themis ask"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  removeTapePack(p.id);
                  setNotice(`Removed ${p.symbol} pack.`);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No pack loaded{symbol ? ` for ${symbol}` : ""}. Evaluate will use Yahoo 5m if it loads — London
          hours are often missing there.
        </p>
      )}
      {notice ? <p className="mt-2 text-xs text-muted">{notice}</p> : null}
    </Panel>
  );
}
