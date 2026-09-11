import { cn } from "@/lib/utils";

export function LiveDot({ live, label }: { live: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-long shadow-[0_0_8px_var(--color-long)]" : "bg-subtle",
        )}
      />
      <span className={live ? "text-long" : "text-muted"}>{label ?? (live ? "Live" : "Delayed")}</span>
    </span>
  );
}
