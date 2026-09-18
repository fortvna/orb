import { useOrb } from "@/lib/store";

export function TapeHonestyBanner() {
  const packs = useOrb((s) => s.tapePacks);
  const line = packs.length
    ? `Uploaded 1m pack (${packs.map((p) => `${p.symbol} ${p.barCount.toLocaleString()}×1m`).join(" · ")}) ≠ Themis ask · execution_ready false · not Yahoo`
    : "Yahoo session tape ≠ Themis ask · execution_ready false";
  return (
    <div className="border-b border-warn/25 bg-warn-dim px-4 py-1.5 text-center text-[11px] leading-snug text-warn">
      {line}
    </div>
  );
}
