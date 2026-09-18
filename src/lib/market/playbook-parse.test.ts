import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hydratePlaybook, parsePlaybooks } from "./playbook-parse.ts";
import { canMarkValidated } from "./types.ts";
import type { PlaybookEvalSummary } from "./types.ts";

function loadLonnyMd(): string {
  return readFileSync(join(process.cwd(), "_handoff/strt-fortvna-lonny-ib.md"), "utf8");
}

describe("Metis MD → Playbook", () => {
  it("parsePlaybooks reads the attached LONNY card", () => {
    const list = parsePlaybooks(loadLonnyMd(), "strt-fortvna-lonny-ib.md");
    assert.equal(list.length, 1);
    const pb = list[0]!;
    assert.equal(pb.metisSlug, "strt-fortvna-lonny-ib");
    assert.equal(pb.kind, "ib");
    assert.equal(pb.symbol, "NQ");
    assert.equal(pb.origin, "imported");
    assert.equal(pb.validated, false);
    assert.ok(pb.rules.some((r) => /25%/.test(r)));
    assert.ok(pb.mentorNotes.includes("Source") || pb.thesis.length > 0);
    assert.match(pb.mentorNotes, /strt-fortvna-lonny-ib/);
  });

  it("blocks validated when eval source is model or empty", () => {
    const model: PlaybookEvalSummary = {
      at: 1,
      symbol: "NQ",
      sessions: 8,
      trades: 4,
      wins: 2,
      winRate: 0.5,
      expectancy: 1,
      profitFactor: 1.2,
      net: 10,
      avgR: 0.1,
      source: "model",
    };
    const empty: PlaybookEvalSummary = { ...model, sessions: 0, trades: 0, source: "empty" };
    const live: PlaybookEvalSummary = { ...model, source: "live" };
    const pack: PlaybookEvalSummary = { ...model, source: "pack" };
    const packEmpty: PlaybookEvalSummary = { ...empty, source: "pack" };

    assert.equal(canMarkValidated(model), false);
    assert.equal(canMarkValidated(empty), false);
    assert.equal(canMarkValidated(live), true);
    assert.equal(canMarkValidated(pack), true);
    assert.equal(canMarkValidated(packEmpty), false);

    const blocked = hydratePlaybook({
      id: "pb-x",
      name: "X",
      evaluation: model,
      validated: true,
      status: "validated",
    });
    assert.equal(blocked.validated, false);
    assert.notEqual(blocked.status, "validated");

    const blockedEmpty = hydratePlaybook({
      id: "pb-y",
      name: "Y",
      evaluation: empty,
      validated: true,
      status: "validated",
    });
    assert.equal(blockedEmpty.validated, false);

    const ok = hydratePlaybook({
      id: "pb-z",
      name: "Z",
      evaluation: live,
      validated: true,
      status: "validated",
    });
    assert.equal(ok.validated, true);
    assert.equal(ok.status, "validated");

    const okPack = hydratePlaybook({
      id: "pb-pack",
      name: "Pack",
      evaluation: pack,
      validated: true,
      status: "validated",
    });
    assert.equal(okPack.validated, true);
    assert.equal(okPack.status, "validated");
  });
});
