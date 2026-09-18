import type { Hypothesis, HypothesisInstrument } from "./schema";

function isBinance(i: HypothesisInstrument): boolean {
  return i.series_class === "binanceusdm";
}

function isYahooOrFutures(i: HypothesisInstrument): boolean {
  return i.series_class === "yahoo" || i.series_class === "futures";
}

export function needsHumanThemisMap(h: Hypothesis): boolean {
  const hasBinance = h.instruments.some(isBinance);
  const onlyYahooFutures = h.instruments.length > 0 && h.instruments.every(isYahooOrFutures);
  return onlyYahooFutures && !hasBinance;
}

function instrumentLine(i: HypothesisInstrument): string {
  const bits = [`${i.series_class} ${i.symbol} ${i.timeframe}`];
  if (i.session) bits.push(i.session);
  if (i.note) bits.push(`(${i.note})`);
  return `- ${bits.join(" ")}`;
}

/**
 * English handoff for Themis. Always `execution_ready: false` on Orb —
 * Yahoo session tape is not the Themis ask.
 *
 * If instruments are only yahoo/futures (no binanceusdm mapping), include
 * `needs_human` and a series-mismatch note. Never relabel QQQ as NQ or SPY as ES.
 */
export function themisHandoffEnglish(h: Hypothesis): string {
  const needsHuman = needsHumanThemisMap(h);
  const lines = [
    `Fortvna hypothesis ${h.id} (${h.metis_slug})`,
    `schema: ${h.schema}`,
    `status: ${h.status}`,
    `grounding: ${h.grounding_version}`,
    "",
    h.english.trim(),
    "",
    "Setup:",
    h.setup.trim(),
    "",
    "Entry:",
    h.entry.trim() || "(none on card)",
    "",
    "Exit:",
    h.exit.trim() || "(none on card)",
    "",
    "Invalidation:",
    h.invalidation.trim(),
    "",
    "Instruments (labels as written — do not relabel):",
    ...h.instruments.map(instrumentLine),
    "",
    "execution_ready: false",
    "Yahoo session tape ≠ Themis ask.",
  ];

  if (needsHuman) {
    lines.push(
      "needs_human: series mismatch — instruments are yahoo/futures only; no binanceusdm mapping.",
      "Do not relabel QQQ as NQ or SPY as ES. A human must map the series before Themis can run it.",
    );
  } else if (h.instruments.some(isBinance)) {
    lines.push(
      "binanceusdm mapping is present on the card; still execution_ready false until Themis measures it.",
      "Do not relabel QQQ as NQ or SPY as ES.",
    );
  }

  const pointers = [
    h.pointers.orb_playbook_id ? `orb_playbook_id=${h.pointers.orb_playbook_id}` : null,
    h.pointers.crucible_strategy_id ? `crucible=${h.pointers.crucible_strategy_id}` : null,
    h.pointers.themis_idea_slug ? `themis_idea=${h.pointers.themis_idea_slug}` : null,
  ].filter(Boolean);
  if (pointers.length) {
    lines.push("", `pointers: ${pointers.join(" · ")}`);
  }
  if (h.source_url) lines.push(`source_url: ${h.source_url}`);

  return lines.join("\n");
}
