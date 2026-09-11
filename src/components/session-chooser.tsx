import { Link } from "@tanstack/react-router";
import { Activity, CandlestickChart } from "lucide-react";

export function SessionChooser() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col justify-center px-5 py-12 lg:min-h-dvh">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Before you trade</p>
      <h1 className="font-display mt-3 text-4xl tracking-tight sm:text-5xl">Choose your session</h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
        Practice freely with the full replay engine, or test yourself against evaluation-style rules —
        on live historical tape. Load a playbook to evaluate, or go manual. No real accounts, no real
        money.
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
          <h2 className="font-display mt-6 text-3xl tracking-tight">Backtest sessions</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Full replay engine, every tool and indicator, unlimited paper trades. Load a playbook or
            start fresh.
          </p>
          <div className="mt-10 text-[11px] font-medium uppercase tracking-[0.16em] text-fg">
            Choose session →
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
    </div>
  );
}
