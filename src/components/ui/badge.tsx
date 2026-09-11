import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  ...props
}: ComponentProps<"span"> & {
  tone?: "muted" | "long" | "short" | "warn" | "steel";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide",
        tone === "muted" && "bg-surface-2 text-muted",
        tone === "long" && "bg-long-dim text-long",
        tone === "short" && "bg-short-dim text-short",
        tone === "warn" && "bg-warn-dim text-warn",
        tone === "steel" && "bg-steel/15 text-steel",
        className,
      )}
      {...props}
    />
  );
}
