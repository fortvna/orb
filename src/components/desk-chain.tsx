import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const STEPS = [
  { to: "/app/mentor", label: "Mentor" },
  { to: "/app/playbooks", label: "Playbook" },
  { to: "/app/replay", label: "Replay" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/analytics", label: "Analytics" },
] as const;

export function DeskChain({ current }: { current?: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
      {STEPS.map((s, i) => (
        <li key={s.to} className="flex items-center gap-1">
          {i > 0 ? <span className="px-1 text-subtle/60">→</span> : null}
          <Link
            to={s.to}
            className={cn(
              "hover:text-fg",
              current === s.to ? "text-fg" : "text-muted",
            )}
          >
            {s.label}
          </Link>
        </li>
      ))}
    </ol>
  );
}
