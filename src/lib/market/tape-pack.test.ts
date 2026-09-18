import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canMarkValidated, evaluatePlaybook } from "./evaluate.ts";
import { PLAYBOOKS } from "./seed.ts";
import { globexDate, nyParts } from "./session.ts";
import {
  LONDON_END_MIN,
  LONDON_START_MIN,
  parseBarTime,
  parseTapePack,
  parseTapePackCsv,
  parseTapePackJson,
  resolveTapeSymbol,
  sessionsFromTapePack,
  tapePackCoverage,
  type TapePack,
  type TapePackBar,
} from "./tape-pack.ts";

function loadFixture(): string {
  return readFileSync(join(process.cwd(), "src/lib/market/fixtures/lonny-nq-1m.json"), "utf8");
}

function lonnyBook() {
  const pb = PLAYBOOKS.find((p) => p.id === "pb-ib");
  assert.ok(pb);
  return pb!;
}

function packFromFixture(): TapePack {
  const parsed = parseTapePackJson(loadFixture());
  assert.equal(parsed.ok, true);
  return (parsed as { ok: true; pack: TapePack }).pack;
}

function withoutLondon(pack: TapePack): TapePack {
  return {
    ...pack,
    bars: pack.bars.filter((b) => {
      const m = nyParts(b.time).minutes;
      return m < LONDON_START_MIN || m >= LONDON_END_MIN;
    }),
  };
}

function londonDown(pack: TapePack): TapePack {
  const london = pack.bars.filter((b) => {
    const m = nyParts(b.time).minutes;
    return m >= LONDON_START_MIN && m < LONDON_END_MIN;
  });
  assert.ok(london.length >= 2);
  const first = london[0]!;
  const last = london[london.length - 1]!;
  const flipped: TapePackBar = {
    ...last,
    open: first.open,
    close: first.open - 40,
    low: Math.min(last.low, first.open - 40),
    high: last.high,
  };
  return {
    ...pack,
    bars: pack.bars.map((b) => (b.time === last.time ? flipped : b)),
  };
}

describe("fortvna.tape.v0 parsers", () => {
  it("parses JSON fixture with ISO times and NQ", () => {
    const pack = packFromFixture();
    assert.equal(pack.schema, "fortvna.tape.v0");
    assert.equal(pack.symbol, "NQ");
    assert.equal(pack.interval, "1m");
    assert.ok(pack.bars.length >= 12);
    const openNy = parseBarTime("2026-09-11T13:30:00Z");
    assert.ok(openNy);
    assert.ok(pack.bars.some((b) => b.time === openNy));
  });

  it("treats naive timestamps as America/New_York", () => {
    const z = parseBarTime("2026-09-11T13:30:00Z");
    const naive = parseBarTime("2026-09-11T09:30:00");
    assert.equal(naive, z);
  });

  it("parses Databento-ish CSV (ts_event ns string, NQ.v.0)", () => {
    const rth = parseBarTime("2026-09-11T13:30:00Z")!;
    const ns = `${rth}000000000`;
    const csv = [
      "ts_event,open,high,low,close,volume,symbol",
      `${ns},24020,24040,24010,24024,100,NQ.v.0`,
      `${rth + 60}000000000,24024,24030,24020,24028,90,NQ.v.0`,
    ].join("\n");
    const parsed = parseTapePackCsv(csv);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.pack.symbol, "NQ");
    assert.equal(parsed.pack.source, "csv");
    assert.equal(parsed.pack.bars[0]!.time, rth);
    assert.equal(parsed.pack.bars[0]!.open, 24020);
  });

  it("reads hash-meta CSV and does not map QQQ to NQ", () => {
    const csv = `# schema: fortvna.tape.v0
# symbol: QQQ
# interval: 1m
# source: databento
time,open,high,low,close
2026-09-11T13:30:00Z,100,101,99,100.5
2026-09-11T13:31:00Z,100.5,101,100,100.8
`;
    const parsed = parseTapePackCsv(csv);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.pack.symbol, "QQQ");
    assert.equal(parsed.pack.source, "databento");
    assert.notEqual(parsed.pack.symbol, "NQ");
  });

  it("resolves Databento roots without relabeling cash ETFs", () => {
    assert.equal(resolveTapeSymbol("NQ.v.0"), "NQ");
    assert.equal(resolveTapeSymbol("GLBX.MDP3:NQ.v.0"), "NQ");
    assert.equal(resolveTapeSymbol("MNQ"), "NQ");
    assert.equal(resolveTapeSymbol("QQQ"), "QQQ");
    assert.equal(resolveTapeSymbol("SPY"), "SPY");
  });

  it("refuses an empty pack instead of inventing bars", () => {
    const parsed = parseTapePackJson(JSON.stringify({ schema: "fortvna.tape.v0", symbol: "NQ", interval: "1m", bars: [] }));
    assert.equal(parsed.ok, false);
  });
});

describe("sessionsFromTapePack", () => {
  it("groups Globex 18:00 ET onto the next session date", () => {
    const pack = packFromFixture();
    const globexOpen = parseBarTime("2026-09-10T22:00:00Z")!;
    assert.equal(globexDate(globexOpen), "2026-09-11");
    const sessions = sessionsFromTapePack(pack);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.date, "2026-09-11");
    assert.ok(sessions[0]!.bars.some((b) => b.time === globexOpen));
    const cov = tapePackCoverage(pack);
    assert.equal(cov.hasLondon, true);
    assert.ok(cov.londonBars >= 2);
  });
});

describe("LONNY on uploaded 1m pack", () => {
  it("fills next-open at IB 25% with stop at IB 50% when London + IB + break are on the pack", () => {
    const pack = packFromFixture();
    const sessions = sessionsFromTapePack(pack);
    assert.equal(sessions.length, 1);
    const ib = sessions[0]!.ib;
    assert.equal(ib.high, 24100);
    assert.equal(ib.low, 24000);
    const ev = evaluatePlaybook(lonnyBook(), 1, sessions, false, "pack");
    assert.equal(ev.summary.source, "pack");
    assert.equal(ev.summary.sessions, 1);
    assert.equal(ev.summary.trades, 1);
    assert.equal(canMarkValidated(ev.summary), true);
    const t = ev.trades[0]!;
    assert.equal(t.side, "long");
    assert.equal(t.entry, 24070);
    assert.equal(t.stop, 24050);
    assert.equal(t.target, 24150);
    assert.equal(t.exit, 24150);
  });

  it("skips the day when London 02:00–08:00 NY bars are missing", () => {
    const pack = withoutLondon(packFromFixture());
    assert.equal(tapePackCoverage(pack).hasLondon, false);
    const ev = evaluatePlaybook(lonnyBook(), 1, sessionsFromTapePack(pack), false, "pack");
    assert.equal(ev.summary.source, "pack");
    assert.equal(ev.summary.trades, 0);
  });

  it("skips when London color conflicts with OCC", () => {
    const pack = londonDown(packFromFixture());
    const ev = evaluatePlaybook(lonnyBook(), 1, sessionsFromTapePack(pack), false, "pack");
    assert.equal(ev.summary.trades, 0);
  });

  it("empty sessions stay empty even if mock is allowed — no invented bars", () => {
    const ev = evaluatePlaybook(lonnyBook(), 8, [], true, "pack");
    assert.equal(ev.summary.source, "empty");
    assert.equal(ev.summary.sessions, 0);
    assert.equal(ev.summary.trades, 0);
    assert.equal(canMarkValidated(ev.summary), false);
  });
});

describe("parseTapePack sniff", () => {
  it("routes CSV by filename", () => {
    const rth = parseBarTime("2026-09-11T13:30:00Z")!;
    const text = `ts_event,open,high,low,close,symbol\n${rth},1,2,0.5,1.5,NQ\n${rth + 60},1.5,2,1,1.6,NQ\n`;
    const parsed = parseTapePack(text, { filename: "nq-ohlcv-1m.csv" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.pack.symbol, "NQ");
    assert.equal(parsed.pack.bars.length, 2);
  });
});
