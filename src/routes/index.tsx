import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LandingChart } from "@/components/landing-chart";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
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
            See the range.
            <br />
            Trade the evidence.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Replay any session, journal every fill, and read the numbers behind opening range,
            initial balance, and gap fills. Four desks. One product.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/app">
                Open the desk <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/app/replay">
                <Play /> Watch a replay
              </Link>
            </Button>
          </div>
          <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-border pt-6">
            <HeroStat k="Sessions modeled" v="60d" />
            <HeroStat k="Reports" v="7" />
            <HeroStat k="Markets" v="12" />
          </dl>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="font-mono text-sm">ES · Sep 11</div>
              <div className="text-xs text-muted">NY RTH · 5m · simulated</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-long">ORB break · up</div>
              <div className="text-xs text-muted">First 15m mapped</div>
            </div>
          </div>
          <div className="h-[280px] md:h-[340px]">
            <LandingChart />
          </div>
        </div>
      </section>

      <section id="desk" className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
          <Pillar
            kicker="Replay"
            title="Sit the session again."
            body="Jump to any date. Play bar-by-bar with size, stops, and a live P&L. No broker. No adrenaline from a live account."
          />
          <Pillar
            kicker="Reports"
            title="What usually happens."
            body="Gap fill, opening range, initial balance, power hour. Filter by ticker, weekday, and lookback — then trade the base rate."
          />
          <Pillar
            kicker="Journal"
            title="Every fill, tagged."
            body="Setups, R-multiples, notes. The calendar, equity curve, and time-of-day leaks fall out of the same book."
          />
          <Pillar
            kicker="Charts"
            title="Levels that mean something."
            body="ORB and IB on the tape, VWAP, volume profile, cumulative delta. Indicators tied to the reports — not a junk drawer."
          />
        </div>
      </section>

      <section id="replay" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">Replay</p>
            <h2 className="font-display mt-3 text-4xl tracking-tight">A year of screen time, compressed.</h2>
            <p className="mt-4 max-w-md text-muted leading-relaxed">
              Pick ES, NQ, crude, gold, or a name. Scrub the open. Place the order you actually
              would have placed. Orb records it into the journal so the practice counts.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted">
              <li>— Variable speed, step, and jump-to-close</li>
              <li>— Paper ticket with stop and target</li>
              <li>— Prop-firm rules running in the background</li>
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
              ["Opening continuation", "Does the first hour’s direction survive the close?"],
              ["Average daily range", "Fuel gauge for targets and late-day risk."],
              ["Power hour", "Whether the last hour follows or fades the day."],
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
            <h2 className="font-display mt-3 text-4xl tracking-tight">A book that talks back.</h2>
            <p className="mt-4 text-muted leading-relaxed">
              Tag the setup. Keep the note short. Analytics reads the same fills: win rate, profit
              factor, drawdown, time-of-day, playbook P&L. Mentor can read the book with you.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini k="Win rate" v="54%" />
            <Mini k="Profit factor" v="1.62" />
            <Mini k="Expectancy" v="+$84" />
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Open the desk.</h2>
            <p className="mt-2 text-muted">Simulated sessions. No account required.</p>
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
          <span>Orb · simulated market data for practice. Not a broker. Not advice.</span>
          <span>Futures, stocks, FX, crypto — replay, reports, journal, charts.</span>
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
