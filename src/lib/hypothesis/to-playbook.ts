import { kitForKind } from "../market/playbook-kit";
import type { Playbook } from "../market/types";
import { sleeveByMetisSlug } from "./id-map";
import type { Hypothesis } from "./schema";

function rulesFromHypothesis(h: Hypothesis): string[] {
  const locked = sleeveByMetisSlug(h.metis_slug);
  if (locked?.rules.length) return locked.rules;
  const blob = [h.setup, h.entry, h.exit].join("\n");
  const lines = blob
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter((l) => l.length > 8 && !/^#{1,6}\s/.test(l));
  const uniq: string[] = [];
  for (const l of lines) {
    if (!uniq.includes(l)) uniq.push(l);
    if (uniq.length >= 12) break;
  }
  return uniq.length ? uniq : [h.entry || h.setup];
}

function inferKind(h: Hypothesis): Playbook["kind"] {
  const locked = sleeveByMetisSlug(h.metis_slug);
  if (locked) return locked.kind;
  const blob = `${h.metis_slug} ${h.setup} ${h.entry}`.toLowerCase();
  if (blob.includes("ib") || blob.includes("lonny")) return "ib";
  if (blob.includes("gap")) return "gap";
  if (blob.includes("vwap")) return "vwap";
  if (blob.includes("fvg") || blob.includes("fair")) return "fvg";
  if (blob.includes("orb") || blob.includes("open")) return "orb";
  return "custom";
}

function symbolOf(h: Hypothesis): string {
  const locked = sleeveByMetisSlug(h.metis_slug);
  if (locked) return locked.symbol;
  const inst = h.instruments.find((i) => i.series_class === "yahoo" || i.series_class === "futures");
  return inst?.symbol ?? "NQ";
}

function timeframeOf(h: Hypothesis): Playbook["timeframe"] {
  const locked = sleeveByMetisSlug(h.metis_slug);
  if (locked) return locked.timeframe;
  const raw = (h.instruments[0]?.timeframe ?? "1m").toLowerCase();
  if (raw === "1m" || raw === "1") return "1m";
  if (raw === "15m" || raw === "15") return "15m";
  return "5m";
}

export function playbookFromHypothesis(h: Hypothesis): Playbook {
  const locked = sleeveByMetisSlug(h.metis_slug);
  const kind = inferKind(h);
  const sourceLine = h.source_url ? `Source: ${h.source_url}` : "Source URL: none on card.";
  const mentorNotes = [
    `Imported from Metis ${h.metis_slug}.`,
    sourceLine,
    `Grounding ${h.grounding_version}.`,
    "Yahoo session tape ≠ uploaded 1m pack ≠ Themis ask; execution_ready false.",
    locked?.mentorNotes ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const name = locked?.playbookName ?? h.english.split("—")[0]?.trim() ?? h.metis_slug;
  const id = locked?.orbPlaybookId ?? `pb-${h.id.replace(/^hyp-/, "")}`;

  return {
    id,
    name,
    setup: locked?.setup ?? name,
    thesis: locked?.thesis || h.english,
    rules: rulesFromHypothesis(h),
    invalidation: locked?.invalidation || h.invalidation,
    session: locked?.session ?? "NY RTH",
    status: "draft",
    origin: "imported",
    kind,
    symbol: symbolOf(h),
    timeframe: timeframeOf(h),
    windowStart: locked?.windowStart ?? 9 * 60 + 30,
    windowEnd: locked?.windowEnd ?? 16 * 60,
    targetR: locked?.targetR ?? 1,
    stopTicks: null,
    validated: false,
    mentorNotes,
    indicators: kitForKind(kind),
    metisSlug: h.metis_slug,
    hypothesisId: h.id,
    groundingVersion: h.grounding_version,
  };
}
