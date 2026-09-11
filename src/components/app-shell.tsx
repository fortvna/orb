import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookMarked,
  LayoutDashboard,
  Library,
  Menu,
  MessagesSquare,
  PlayCircle,
  ShieldCheck,
  Table2,
  X,
  CandlestickChart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { LiveDot } from "@/components/live-dot";
import { Button } from "@/components/ui/button";
import { useQuotes } from "@/lib/market/use-feed";
import { useOrb } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Desk", icon: LayoutDashboard, hint: "What's in play" },
  { to: "/app/replay", label: "Replay", icon: PlayCircle, hint: "Backtest / eval" },
  { to: "/app/charts", label: "Charts", icon: CandlestickChart, hint: "Live tape & drawings" },
  { to: "/app/reports", label: "Reports", icon: Table2, hint: "Historical edge" },
  { to: "/app/journal", label: "Journal", icon: BookMarked, hint: "Calendar" },
  { to: "/app/analytics", label: "Analytics", icon: Activity, hint: "From reports" },
  { to: "/app/playbooks", label: "Playbooks", icon: Library, hint: "Rules to measure" },
  { to: "/app/prop", label: "Prop", icon: ShieldCheck, hint: "Challenge sim" },
  { to: "/app/mentor", label: "Mentor", icon: MessagesSquare, hint: "Ask the desk" },
] as const;

const MOBILE = ["/app", "/app/replay", "/app/charts", "/app/journal"] as const;

export function AppShell() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hydrate = useOrb((s) => s.hydrate);
  const watchlist = useOrb((s) => s.watchlist);
  const { live } = useQuotes(watchlist.slice(0, 6), 20000);

  useEffect(() => {
    void useOrb.persist.rehydrate();
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const cinema = pathname.startsWith("/app/replay");

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-bg-elevated lg:flex",
          cinema ? "w-14" : "w-56",
        )}
      >
        <div className={cn("flex h-14 items-center", cinema ? "justify-center px-0" : "px-4")}>
          <Link to="/" className="flex items-center">
            <Logo word={!cinema} />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} pathname={pathname} compact={cinema} />
          ))}
        </nav>
        <div className={cn("border-t border-border py-4", cinema ? "px-2" : "px-4")}>
          {cinema ? (
            <div className="flex justify-center">
              <span
                className={cn("size-1.5 rounded-full", live ? "bg-long" : "bg-subtle")}
                title={live ? "Live" : "Connecting"}
              />
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Desk</div>
              <div className="mt-2">
                <LiveDot live={live} label={live ? "NY session · live" : "Connecting feed"} />
              </div>
            </>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-3 backdrop-blur-sm lg:hidden">
        <Link to="/" className="flex items-center">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <LiveDot live={live} />
          <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-bg/70"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-[min(20rem,88vw)] border-l border-border bg-bg-elevated p-4 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-muted">Modules</span>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV.map((item) => (
                <NavLink key={item.to} item={item} pathname={pathname} />
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <div className={cn("min-w-0", cinema ? "lg:pl-14" : "lg:pl-56")}>
        <main className="min-h-dvh min-w-0 overflow-x-hidden pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-bg-elevated lg:hidden">
        {NAV.filter((n) => (MOBILE as readonly string[]).includes(n.to)).map((item) => {
          const active = item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]",
                active ? "text-fg" : "text-muted",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  compact = false,
}: {
  item: (typeof NAV)[number];
  pathname: string;
  compact?: boolean;
}) {
  const active = item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      title={item.label}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        compact && "justify-center px-0",
        active ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {compact ? null : <span className="flex-1">{item.label}</span>}
    </Link>
  );
}
