import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sessionFromBars } from "./session.ts";
import type { Bar } from "./types.ts";

/** 2026-09-11 09:30 ET = 13:30 UTC (EDT). */
const OPEN = Date.parse("2026-09-11T13:30:00Z") / 1000;

function bar(offsetMin: number, open: number, high: number, low: number, close: number): Bar {
  return {
    time: OPEN + offsetMin * 60,
    open,
    high,
    low,
    close,
    volume: 100,
    buyVolume: 50,
    sellVolume: 50,
  };
}

function minutes(n: number): Bar[] {
  const out: Bar[] = [];
  let px = 24000;
  for (let i = 0; i < n; i++) {
    const o = px;
    const c = px + ((i % 5) - 2);
    out.push(bar(i, o, Math.max(o, c) + 4, Math.min(o, c) - 4, c));
    px = c;
  }
  return out;
}

describe("sessionFromBars OR/IB", () => {
  it("maps OR to 09:30–09:45 on 1m tape, not three 5m bars", () => {
    const bars = minutes(90);
    const session = sessionFromBars({
      symbol: "NQ",
      date: "2026-09-11",
      bars,
      prevClose: 23990,
      barMinutes: 1,
    });
    assert.equal(session.barMinutes, 1);
    const orbHigh = Math.max(...bars.slice(0, 15).map((b) => b.high));
    const orbLow = Math.min(...bars.slice(0, 15).map((b) => b.low));
    assert.equal(session.orb.high, orbHigh);
    assert.equal(session.orb.low, orbLow);
    const ibHigh = Math.max(...bars.slice(0, 60).map((b) => b.high));
    const ibLow = Math.min(...bars.slice(0, 60).map((b) => b.low));
    assert.equal(session.ib.high, ibHigh);
    assert.equal(session.ib.low, ibLow);
  });

  it("maps OR to the 09:30 15m bar on 15m tape", () => {
    const raw = minutes(90);
    const fifteen: Bar[] = [];
    for (let i = 0; i < raw.length; i += 15) {
      const chunk = raw.slice(i, i + 15);
      fifteen.push({
        time: chunk[0]!.time,
        open: chunk[0]!.open,
        high: Math.max(...chunk.map((b) => b.high)),
        low: Math.min(...chunk.map((b) => b.low)),
        close: chunk.at(-1)!.close,
        volume: 100,
        buyVolume: 50,
        sellVolume: 50,
      });
    }
    const session = sessionFromBars({
      symbol: "NQ",
      date: "2026-09-11",
      bars: fifteen,
      prevClose: 23990,
      barMinutes: 15,
    });
    assert.equal(session.orb.high, fifteen[0]!.high);
    assert.equal(session.orb.low, fifteen[0]!.low);
    assert.equal(session.ib.high, Math.max(fifteen[0]!.high, fifteen[1]!.high, fifteen[2]!.high, fifteen[3]!.high));
  });
});
