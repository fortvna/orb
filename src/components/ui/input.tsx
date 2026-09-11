import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-subtle outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-steel/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-steel/20",
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg outline-none transition-colors focus:border-border-strong focus:ring-2 focus:ring-steel/20",
        className,
      )}
      {...props}
    />
  );
}
