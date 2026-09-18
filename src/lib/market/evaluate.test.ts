import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { canMarkValidated, evaluatePlaybook, firstExit, lonnyLevels } from "./evaluate.ts";
import { PLAYBOOKS } from "./seed.ts";
import type { Bar, Playbook, RangeLevel, SessionDay } from "./types.ts";

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

describe("LONNY levels", () => {
  const ib: RangeLevel = { high: 100, low: 80, mid: 90, size: 20 };

  it("uses IB 25% entry, 50% mid stop, 0.5× IB target", () => {
    const long = lonnyLevels(ib, "long");
    assert.equal(long.entry, 95);
    assert.equal(long.stop, 90);
    assert.equal(long.target, 110);
    const short = lonnyLevels(ib, "short");
    assert.equal(short.entry, 85);
    assert.equal(short.stop, 90);
    assert.equal(short.target, 70);
  });
});

/** 2026-09-11 09:30 ET = 13:30 UTC (EDT). */
const RTH_OPEN = Date.parse("2026-09-11T13:30:00Z") / 1000;

function barAt(etMin: number, open: number, high: number, low: number, close: number): Bar {
  return {
    time: RTH_OPEN + (etMin - (9 * 60 + 30)) * 60,
    open,
    high,
    low,
    close,
    volume: 100,
    buyVolume: 50,
    sellVolume: 50,
  };
}

function lonnySession(opts?: { london?: "up" | "down" | "none"; sameBarStop?: boolean }): SessionDay {
  const london: Bar[] =
    opts?.london === "none"
      ? []
      : opts?.london === "down"
        ? [
            barAt(2 * 60, 23950, 23960, 23920, 23940),
            barAt(5 * 60, 23940, 23945, 23890, 23900),
            barAt(7 * 60 + 50, 23900, 23910, 23870, 23880),
          ]
        : [
            barAt(2 * 60, 23900, 23920, 23880, 23910),
            barAt(5 * 60, 23910, 23950, 23900, 23930),
            barAt(7 * 60 + 50, 23930, 23980, 23920, 23970),
          ];

  const ibBars: Bar[] = [];
  for (let i = 0; i < 12; i++) {
    const et = 9 * 60 + 30 + i * 5;
    if (i === 1) ibBars.push(barAt(et, 24040, 24100, 24020, 24050));
    else if (i === 2) ibBars.push(barAt(et, 24050, 24060, 24000, 24030));
    else ibBars.push(barAt(et, 24020 + i, 24040 + i, 24010, 24020 + i * 2));
  }
  const lastIb = ibBars[ibBars.length - 1]!;
  const occClose = Math.max(lastIb.close, 24080);
  ibBars[ibBars.length - 1] = { ...lastIb, close: occClose, high: Math.max(lastIb.high, occClose) };

  const breakBar = barAt(10 * 60 + 30, 24085, 24110, 24090, 24105);
  const fillBar = opts?.sameBarStop
    ? barAt(10 * 60 + 35, 24070, 24160, 24040, 24090)
    : barAt(10 * 60 + 35, 24070, 24090, 24065, 24080);
  const after = opts?.sameBarStop
    ? [barAt(10 * 60 + 40, 24090, 24100, 24080, 24095)]
    : [barAt(10 * 60 + 40, 24090, 24160, 24085, 24140)];
  const kill = barAt(15 * 60, 24120, 24130, 24110, 24125);

  const rth = [...ibBars, breakBar, fillBar, ...after, kill];
  const ib: RangeLevel = { high: 24100, low: 24000, mid: 24050, size: 100 };
  return {
    symbol: "NQ",
    date: "2026-09-11",
    weekday: 5,
    bars: [...london, ...rth],
    barMinutes: 5,
    prevClose: 23990,
    open: 24020,
    close: 24125,
    high: 24160,
    low: 24000,
    gap: 30,
    gapPct: 0,
    gapFilled: true,
    gapFillTime: rth[0]!.time,
    orb: ib,
    orbBreak: "up",
    orbBreakTime: breakBar.time,
    orbExtension: 0.1,
    ib,
    ibBreak: "up",
    ibBreakTime: breakBar.time,
    ibExtension: 0.1,
    ibFirstBreak: "up",
    occ: "up",
    occContinued: true,
    range: 160,
    vwap: 24050,
    poc: 24050,
  };
}

function lonnyBook(): Playbook {
  const pb = PLAYBOOKS.find((p) => p.id === "pb-ib");
  assert.ok(pb);
  return pb!;
}

describe("LONNY evaluate path", () => {
  it("fills next-open at IB 25%, stop IB 50% mid, TP 0.5× IB", () => {
    const ev = evaluatePlaybook(lonnyBook(), 1, [lonnySession()], false);
    assert.equal(ev.summary.trades, 1);
    const t = ev.trades[0]!;
    assert.equal(t.side, "long");
    assert.equal(t.entry, 24070);
    assert.equal(t.stop, 24050);
    assert.equal(t.target, 24150);
    assert.equal(t.exit, 24150);
  });

  it("stop-first on the fill bar when next-open is through the limit", () => {
    const ev = evaluatePlaybook(lonnyBook(), 1, [lonnySession({ sameBarStop: true })], false);
    assert.equal(ev.summary.trades, 1);
    const t = ev.trades[0]!;
    assert.equal(t.entry, 24070);
    assert.equal(t.stop, 24050);
    assert.equal(t.exit, 24050);
  });

  it("skips the day without London bars", () => {
    const ev = evaluatePlaybook(lonnyBook(), 1, [lonnySession({ london: "none" })], false);
    assert.equal(ev.summary.trades, 0);
  });

  it("skips when London color conflicts with OCC", () => {
    const ev = evaluatePlaybook(lonnyBook(), 1, [lonnySession({ london: "down" })], false);
    assert.equal(ev.summary.trades, 0);
  });
});

describe("validated-blocked-on-model", () => {
  it("never treats model or empty eval as validatable", () => {
    const empty = evaluatePlaybook(lonnyBook(), 8, [], false);
    assert.equal(empty.summary.source, "empty");
    assert.equal(canMarkValidated(empty.summary), false);

    const model = evaluatePlaybook(lonnyBook(), 3, undefined, true);
    assert.equal(model.summary.source, "model");
    assert.equal(canMarkValidated(model.summary), false);
  });
});

