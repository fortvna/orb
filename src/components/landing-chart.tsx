import { CandleChart, levelLines } from "@/components/candle-chart";
import { listTradingDays } from "@/lib/market/calendar";
import { getSession } from "@/lib/market/generate";

export function LandingChart() {
  const date = listTradingDays(2)[1] ?? listTradingDays(1)[0]!;
  const session = getSession("ES", date, 5);
  return (
    <CandleChart
      bars={session.bars}
      overlays={["volume", "vwap"]}
      lines={levelLines(session.orb, session.ib)}
      className="h-full w-full"
    />
  );
}
