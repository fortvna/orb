import { cn } from "@/lib/utils";
import { fmtPct, fmtR, fmtSignedUsd } from "@/lib/format";

export function PnlText({
  value,
  className,
  as = "usd",
}: {
  value: number;
  className?: string;
  as?: "usd" | "pct" | "r";
}) {
  const tone = value > 0 ? "text-long" : value < 0 ? "text-short" : "text-muted";
  const text = as === "pct" ? fmtPct(value) : as === "r" ? fmtR(value) : fmtSignedUsd(value);
  return <span className={cn("font-mono tabular-nums", tone, className)}>{text}</span>;
}
