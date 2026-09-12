import { Link } from "@tanstack/react-router";
import { Activity, BookOpen, CandlestickChart } from "lucide-react";
import { kitLabel, kitOf } from "@/lib/market/playbook-kit";
import { fmtClock } from "@/lib/market/clock";
import { useOrb } from "@/lib/store";

export function SessionChooser() {
  const playbooks = useOrb((s) => s.playbooks);
  const active = playbooks.filter((p) => p.status !== "paused");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col overflow-y-auto px-5 py-12 lg:min-h-dvh">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Before you trade</p>
      <h1 className="font-display mt-3 text-4xl tracking-tight sm:text-5xl">Choose your session</h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
        Load a playbook and replay runs its rules: timeframe, indicators, mapping window, then entry /
        stop / target on the first valid trigger. Or go manual.
      </p>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Link
          to="/app/replay"
          search={{ mode: "free" }}
          className="group rounded-xl border border-border bg-bg-elevated p-6 transition-colors hover:border-border-strong sm:p-8"
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">01 / Free play</p>
            <CandlestickChart className="size-6 text-subtle" />
          </div>
          <h2 className="font-display mt-6 text-3xl tracking-tight">Manual tape</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Full replay engine, every tool and indicator, unlimited paper trades. No playbook loaded —
            pick one from the strip below or the dropdown.
          </p>
          <div className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-fg">
            Open session →
          </div>
        </Link>

        <Link
          to="/app/replay"
          search={{ mode: "eval" }}
          className="group rounded-xl border border-border bg-bg-elevated p-6 transition-colors hover:border-border-strong sm:p-8"
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">02 / Evaluation</p>
            <Activity className="size-6 text-subtle" />
          </div>
          <h2 className="font-display mt-6 text-3xl tracking-tight">Evaluation simulator</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Chase the profit target without breaching the drawdown or daily-loss rules. Pure
            simulation — no real money.
          </p>
          <div className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-fg">
            Set your rules →
          </div>
        </Link>
      </div>

      {active.length ? (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-subtle" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              Load a playbook
            </h2>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Click one and replay turns on its kit, seats you at the window, and marks range / entry /
            SL / TP when the trigger prints.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {active.map((pb) => (
              <Link
                key={pb.id}
                to="/app/replay"
                search={{ mode: "free", playbook: pb.id }}
                className="rounded-xl border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong"
              >
                <div className="font-medium text-fg">{pb.name}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  {pb.symbol} · {pb.timeframe} · {fmtClock(pb.windowStart)}–{fmtClock(pb.windowEnd)} ·{" "}
                  {pb.targetR}R
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {kitOf(pb).map((id) => (
                    <span
                      key={id}
                      className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] uppercase text-muted"
                    >
                      {kitLabel(id)}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
