import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LiveDot } from "@/components/live-dot";
import { Button } from "@/components/ui/button";
import { LandingChart } from "@/components/landing-chart";
import { useChart } from "@/lib/market/use-feed";
import { fmtPct, fmtPx } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { chart, live } = useChart("NQ", "5m", "1d", 20000);
  const last = chart?.last && chart.last > 0 ? chart.last : null;
  const ch = chart?.changePct ?? 0;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#desk" className="hover:text-fg">
            Desk
          </a>
          <a href="#replay" className="hover:text-fg">
            Replay
          </a>
          <a href="#reports" className="hover:text-fg">
            Reports
          </a>
          <a href="#journal" className="hover:text-fg">
            Journal
          </a>
        </nav>
        <Button asChild size="sm">
          <Link to="/app">Open desk</Link>
        </Button>
      </header>

      <section className="mx-auto grid max-w-6xl items-end gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-10">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">
            Trading desk
          </p>
          <h1 className="font-display mt-4 max-w-xl text-5xl leading-[1.05] tracking-tight text-fg md:text-6xl">
            Yahoo tape.
            <br />
            Your playbooks.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Mentor writes the book. Replay measures it on Yahoo 5m. Reports and analytics come from those fills —
            not from a canned template.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/app">
                Open the desk <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/app/replay">
                <Play /> Replay
              </Link>
            </Button>
          </div>
          <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-border pt-6">
            <HeroStat k="Feed" v={live ? "Yahoo" : "Connecting"} />
            <HeroStat k="Draw" v="TV + tape" />
            <HeroStat k="Playbooks" v="Import" />
          </dl>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="font-mono text-sm">NQ · 5m</div>
              <div className="text-xs text-muted">E-mini Nasdaq · NY</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm tabular-nums">{last != null ? fmtPx(last, 2) : "—"}</div>
              <div className="mt-1 flex items-center justify-end gap-2">
                <span className={ch >= 0 ? "font-mono text-xs text-long" : "font-mono text-xs text-short"}>
                  {last != null ? fmtPct(ch) : "waiting"}
                </span>
                <LiveDot live={live} label={live ? "Live" : "Connecting"} />
              </div>
            </div>
          </div>
          <div className="h-[300px] md:h-[380px]">
            <LandingChart />
          </div>
        </div>
      </section>

      <section id="desk" className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
          <Pillar
            kicker="Charts"
            title="TradingView, plus the tape."
            body="Live NQ, ES, crude, gold — drawings, killzones, HTF candles, and PO3 on the same session."
          />
          <Pillar
            kicker="Replay"
            title="Sit a real session again."
            body="Scrub last month of 5-minute bars. Draw. Place the order you would have placed. It lands in the journal."
          />
          <Pillar
            kicker="Playbooks"
            title="Mentor writes. Replay measures."
            body="Validate a book, evaluate it on historical tape, then publish the report. Analytics rolls those reports up."
          />
          <Pillar
            kicker="Reports"
            title="What usually happens."
            body="Session base rates plus playbook evaluations and user-defined reports — counted, not argued."
          />
        </div>
      </section>

      <section id="replay" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Replay</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight">A year of screen time, compressed.</h2>
            <p className="mt-4 max-w-md text-muted leading-relaxed">
              Pick ES, NQ, crude, gold, or a name. Scrub the open. Mark the level. Size the ticket.
              Load a playbook or go manual. Orb records it so the practice counts.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted">
              <li>— Bar-by-bar historical tape, not a random walk</li>
              <li>— Drawings and indicators that persist on the session</li>
              <li>— Evaluate a playbook; the report writes itself</li>
            </ul>
          </div>
          <Quote
            quote="The edge isn’t the pattern. It’s how often the pattern pays after you size it."
            by="Desk note"
          />
        </div>
      </section>

      <section id="reports" className="border-y border-border bg-bg-elevated">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Reports</p>
          <h2 className="font-display mt-3 max-w-xl text-4xl tracking-tight">
            Stop arguing with the tape. Count it.
          </h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Opening range", "First 15 minutes. Break, double break, or hold."],
              ["Initial balance", "First hour as the day’s container and extension map."],
              ["Gap fill", "Overnight gaps as magnets, split by weekday and size."],
              ["Playbook evals", "Generated when you run a book in replay."],
              ["Custom reports", "Your metric, your source — playbook or replay fills."],
              ["Analytics", "The roll-up of those reports. Nothing else."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-lg border border-border bg-bg p-5">
                <div className="font-medium">{t}</div>
                <p className="mt-2 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="journal" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Journal</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight">A calendar that talks back.</h2>
            <p className="mt-4 text-muted leading-relaxed">
              Month net, green days, fills. Click a date. Analytics reads the same book: reports and
              playbooks, not a second ledger.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini k="Win rate" v="from you" />
            <Mini k="Playbooks" v="evaluated" />
            <Mini k="Tape" v="live" />
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Open the desk.</h2>
            <p className="mt-2 text-muted">Live markets. No account required.</p>
          </div>
          <Button asChild size="lg">
            <Link to="/app">
              Enter Orb <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8 text-xs text-subtle">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span>Orb · live market data for practice. Not a broker. Not advice.</span>
          <span>Futures, stocks, FX, crypto — charts, replay, reports, journal.</span>
        </div>
      </footer>
    </div>
  );
}

function HeroStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">{k}</dt>
      <dd className="mt-1 font-mono text-xl tabular-nums">{v}</dd>
    </div>
  );
}

function Pillar({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="bg-bg px-6 py-10">
      <div className="text-[11px] uppercase tracking-[0.18em] text-subtle">{kicker}</div>
      <h3 className="font-display mt-3 text-2xl tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Quote({ quote, by }: { quote: string; by: string }) {
  return (
    <blockquote className="rounded-xl border border-border bg-bg-elevated p-8">
      <p className="font-display text-2xl leading-snug tracking-tight">{quote}</p>
      <footer className="mt-6 text-xs uppercase tracking-[0.16em] text-subtle">{by}</footer>
    </blockquote>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-6">
      <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">{k}</div>
      <div className="mt-2 font-mono text-2xl tabular-nums">{v}</div>
    </div>
  );
}