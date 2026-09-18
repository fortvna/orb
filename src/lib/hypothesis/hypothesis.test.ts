import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HypothesisSchema,
  hypothesisFromMetisMarkdown,
  playbookFromHypothesis,
  themisHandoffEnglish,
  needsHumanThemisMap,
} from "./index.ts";
import type { Hypothesis } from "./schema.ts";

function loadMetisMd(slug: string): string {
  const candidates = [
    join(process.cwd(), `_handoff/${slug}.md`),
    join(process.cwd(), `../orb-handoff/${slug}.md`),
    `/workspace/orb-handoff/${slug}.md`,
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      /* next */
    }
  }
  throw new Error(`${slug} Metis markdown fixture not found`);
}

function loadLonnyMd(): string {
  return loadMetisMd("strt-fortvna-lonny-ib");
}

describe("fortvna.hypothesis.v0", () => {
  it("parses LONNY Metis markdown and round-trips through zod", () => {
    const md = loadLonnyMd();
    const h = hypothesisFromMetisMarkdown(md);
    assert.equal(h.schema, "fortvna.hypothesis.v0");
    assert.equal(h.metis_slug, "strt-fortvna-lonny-ib");
    assert.equal(h.id, "hyp-fortvna-lonny-ib");
    assert.equal(h.status, "research");
    assert.equal(h.grounding_version, "v1");
    assert.equal(h.pointers.orb_playbook_id, "pb-ib");
    assert.equal(h.pointers.crucible_strategy_id, "lonny-ib");
    assert.match(h.setup, /London/i);
    assert.match(h.entry, /IB 25%/i);
    assert.match(h.exit, /IB 50%|15:00/i);
    assert.equal(h.instruments[0]?.symbol, "NQ");
    assert.equal(h.instruments[0]?.series_class, "yahoo");
    const again = HypothesisSchema.parse(JSON.parse(JSON.stringify(h)));
    assert.deepEqual(again, h);
  });

  it("playbookFromHypothesis stamps Metis origin and Grounding-v1 LONNY levels in rules", () => {
    const h = hypothesisFromMetisMarkdown(loadLonnyMd());
    const pb = playbookFromHypothesis(h);
    assert.equal(pb.id, "pb-ib");
    assert.equal(pb.kind, "ib");
    assert.equal(pb.origin, "imported");
    assert.equal(pb.validated, false);
    assert.equal(pb.metisSlug, "strt-fortvna-lonny-ib");
    assert.equal(pb.hypothesisId, "hyp-fortvna-lonny-ib");
    assert.equal(pb.groundingVersion, "v1");
    assert.equal(pb.windowStart, 10 * 60 + 30);
    assert.equal(pb.windowEnd, 15 * 60);
    assert.equal(pb.timeframe, "1m");
    assert.ok(pb.rules.some((r) => /IB 25%/.test(r)));
    assert.ok(pb.rules.some((r) => /IB 50%/.test(r)));
    assert.ok(pb.rules.some((r) => /15:00/.test(r)));
    assert.match(pb.mentorNotes, /strt-fortvna-lonny-ib/);
    assert.match(pb.mentorNotes, /execution_ready false/);
  });

  it("themis handoff is not execution-ready and flags yahoo/futures series mismatch", () => {
    const h = hypothesisFromMetisMarkdown(loadLonnyMd());
    assert.equal(needsHumanThemisMap(h), true);
    const english = themisHandoffEnglish(h);
    assert.match(english, /execution_ready: false/);
    assert.match(english, /Yahoo session tape ≠ Themis ask/);
    assert.match(english, /Uploaded 1m pack ≠ Themis ask/);
    assert.match(english, /needs_human/);
    assert.match(english, /series mismatch/);
    assert.match(english, /Do not relabel QQQ as NQ or SPY as ES/);
    assert.doesNotMatch(english, /QQQUSDT is NQ|QQQ = NQ|SPY = ES/i);
  });

  it("never relabels QQQ as NQ or SPY as ES", () => {
    const base = hypothesisFromMetisMarkdown(loadLonnyMd());
    const qqq: Hypothesis = {
      ...base,
      instruments: [{ series_class: "yahoo", symbol: "QQQ", timeframe: "1d", session: "RTH", note: "not NQ" }],
    };
    const spy: Hypothesis = {
      ...base,
      instruments: [{ series_class: "yahoo", symbol: "SPY", timeframe: "1d", note: "not ES" }],
    };
    const qText = themisHandoffEnglish(qqq);
    const sText = themisHandoffEnglish(spy);
    assert.match(qText, /\byahoo QQQ\b/);
    assert.doesNotMatch(qText, /yahoo NQ/);
    assert.match(sText, /\byahoo SPY\b/);
    assert.doesNotMatch(sText, /yahoo ES/);
    assert.match(qText, /Do not relabel QQQ as NQ/);
  });

  it("parses Herman Metis markdown onto the locked streak sleeve", () => {
    const md = loadMetisMd("strt-rherman-streak-failure-reversal");
    const h = hypothesisFromMetisMarkdown(md);
    assert.equal(h.metis_slug, "strt-rherman-streak-failure-reversal");
    assert.equal(h.id, "hyp-rherman-streak-failure-reversal");
    assert.equal(h.pointers.orb_playbook_id, "pb-streak-herman");
    assert.equal(h.pointers.crucible_strategy_id, "herman-streak-failure");
    assert.equal(h.instruments[0]?.symbol, "NQ");
    assert.equal(h.grounding_version, "v1");
    const pb = playbookFromHypothesis(h);
    assert.equal(pb.id, "pb-streak-herman");
    assert.equal(pb.kind, "streak");
    assert.equal(pb.origin, "imported");
    assert.equal(pb.validated, false);
    assert.equal(pb.metisSlug, "strt-rherman-streak-failure-reversal");
    assert.equal(pb.timeframe, "1m");
    assert.equal(pb.windowStart, 9 * 60 + 45);
    assert.equal(pb.windowEnd, 12 * 60);
    assert.equal(pb.targetR, 1);
    assert.match(pb.thesis, /marketing/i);
    assert.match(pb.thesis, /not measured edge/i);
    assert.match(pb.mentorNotes, /author defaults v1/);
    assert.match(pb.mentorNotes, /execution_ready false/);
    assert.ok(pb.rules.some((r) => /5 consecutive/i.test(r)));
    assert.ok(pb.rules.some((r) => /next 1m open/i.test(r)));
    assert.match(pb.thesis, /not a money printer/i);
  });
});
