import { useMemo } from "react";
import { CandleChart, levelLines } from "@/components/candle-chart";
import { CHART } from "@/lib/chart-theme";
import { listTradingDays } from "@/lib/market/calendar";
import { getSession } from "@/lib/market/generate";
import { lastSessionBars, nyParts, sessionFromBars } from "@/lib/market/session";
import { useChart } from "@/lib/market/use-feed";

export function LandingChart() {
  const { chart, live, loading } = useChart("NQ", "5m", "5d", 20000);
  const fallback = useMemo(() => {
    const day = listTradingDays(2)[0] ?? listTradingDays(1)[0]!;
    return getSession("NQ", day, 5);
  }, []);
  const bars = useMemo(() => {
    if (chart?.bars && chart.bars.length > 8) return lastSessionBars(chart.bars, "NQ");
    return fallback.bars;
  }, [chart, fallback]);
  const session = useMemo(() => {
    if (!bars.length) return fallback;
    if (chart?.bars && chart.bars.length > 8) {
      return sessionFromBars({
        symbol: "NQ",
        date: nyParts(bars[bars.length - 1]!.time).date,
        bars,
        prevClose: chart.prevClose,
        barMinutes: 5,
      });
    }
    return fallback;
  }, [chart, bars, fallback]);

  return (
    <div className="relative h-full w-full" style={{ background: CHART.bg, minHeight: 280 }}>
      <CandleChart
        bars={bars}
        indicators={["volume", "killzones", "htf", "po3", "vwap", "keyTimes"]}
        session={session}
        lines={levelLines(session.orb, session.ib)}
        watermark="5m"
        className="h-full w-full"
      />
      {loading && !live ? (
        <div className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6a645a]">
          Connecting NQ…
        </div>
      ) : null}
    </div>
  );
}
