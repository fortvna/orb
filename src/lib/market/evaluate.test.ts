import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstExit } from "./evaluate.ts";
import type { Bar } from "./types.ts";

function bar(i: number, high: number, low: number): Bar {
  return {
    time: 1_000_000 + i * 60,
    open: 100,
    high,
    low,
    close: 100,
    volume: 1,
    buyVolume: 1,
    sellVolume: 0,
  };
}

describe("firstExit", () => {
  it("stop wins when stop and target print on the same bar", () => {
    const bars = [bar(0, 101, 99), bar(1, 110, 90)];
    const hit = firstExit(bars, 0, "long", 95, 108);
    assert.ok(hit);
    assert.equal(hit!.hit, "stop");
    assert.equal(hit!.exit, 95);
  });

  it("does not flatten at the last visible bar without a stop or target", () => {
    const bars = [bar(0, 101, 99), bar(1, 102, 99)];
    assert.equal(firstExit(bars, 0, "long", 90, 120), null);
  });
});
