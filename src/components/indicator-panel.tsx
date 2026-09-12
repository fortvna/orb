import { X } from "lucide-react";
import { useEffect } from "react";
import { INDICATOR_CATALOG } from "@/lib/market/indicators";
import type { IndicatorId } from "@/lib/market/types";
import { cn } from "@/lib/utils";

export function IndicatorPanel({
  active,
  onToggle,
  onClose,
}: {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/80 p-4 backdrop-blur-sm sm:p-10">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-bg-elevated p-5 shadow-soft sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">Indicators</p>
            <h2 className="font-display mt-1 text-3xl tracking-tight">{active.length} active</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-8 space-y-8">
          {INDICATOR_CATALOG.map((group) => (
            <section key={group.group}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{group.group}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const on = active.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onToggle(item.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        on
                          ? "border-steel/40 bg-surface text-fg"
                          : "border-border bg-surface-2/40 text-muted hover:text-fg",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium text-fg">{item.name}</div>
                        <span
                          className={cn(
                            "mt-1 size-2 shrink-0 rounded-full",
                            on ? "bg-steel" : "bg-subtle/50",
                          )}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">{item.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">My scripts</h3>
            <p className="mt-3 rounded-xl border border-border bg-surface-2/40 p-4 text-sm text-muted">
              Custom indicator scripts are not available yet. Toggle the catalog above — periodic volume profile (PVP) paints a 4-hour profile on the tape.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
