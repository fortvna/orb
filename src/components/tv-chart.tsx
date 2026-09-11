import { useEffect, useRef } from "react";
import { getSymbol } from "@/lib/market/symbols";
import type { FeedInterval } from "@/lib/market/types";
import { cn } from "@/lib/utils";

function tvInterval(interval: FeedInterval): string {
  if (interval === "1m") return "1";
  if (interval === "5m") return "5";
  if (interval === "15m") return "15";
  if (interval === "60m") return "60";
  return "D";
}

export function TradingViewChart({
  symbol,
  interval,
  className,
}: {
  symbol: string;
  interval: FeedInterval;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const spec = getSymbol(symbol);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.height = "100%";
    wrap.style.width = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    wrap.appendChild(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.text = JSON.stringify({
      autosize: true,
      symbol: spec.tv,
      interval: tvInterval(interval),
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(8,9,11,1)",
      gridColor: "rgba(236,238,241,0.06)",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: false,
      hide_volume: false,
      withdateranges: true,
      studies: ["STD;VWAP"],
      support_host: "https://www.tradingview.com",
    });
    wrap.appendChild(script);
    el.appendChild(wrap);
    return () => {
      el.innerHTML = "";
    };
  }, [spec.tv, interval]);

  return <div ref={host} className={cn("h-full min-h-[440px] w-full", className)} />;
}
