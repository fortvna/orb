import { HypothesisSchema, type Hypothesis, type HypothesisInstrument, type HypothesisStatus } from "./schema";
import { SLEEVES, sleeveByMetisSlug } from "./id-map";

const SLUG_RE = /\b(?:slug:\s*)?(strt-[a-z0-9-]+)\b/i;

export function isMetisMarkdown(text: string, filename = ""): boolean {
  if (/strt-[a-z0-9-]+/i.test(filename)) return true;
  if (/\bslug:\s*strt-[a-z0-9-]+/i.test(text)) return true;
  if (/\bstrt-[a-z0-9-]+/i.test(text) && /^##\s*setup/im.test(text)) return true;
  if (/^##\s*setup/im.test(text) && /^##\s*(entry|trigger|exit|invalidation|stop)/im.test(text)) {
    return true;
  }
  return false;
}

function h1(md: string): string {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled";
}

function field(md: string, key: string): string | null {
  const re = new RegExp(`^[-*]\\s*${key}\\s*:\\s*(.+)$`, "im");
  return md.match(re)?.[1]?.trim() ?? null;
}

function stripDecor(s: string): string {
  return s.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function sectionKey(title: string): string {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (t.startsWith("setup")) return "setup";
  if (t.startsWith("idea") || t.startsWith("why")) return "idea";
  if (t.startsWith("entry") || t.startsWith("trigger")) return "entry";
  if (t.startsWith("invalid")) return "invalidation";
  if (t.startsWith("exit") || t.startsWith("stop") || t.startsWith("target")) return "exit";
  return t.split(" ")[0] ?? t;
}

function sections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^##\s+(.+?)\s*$/gm;
  const hits = [...md.matchAll(re)];
  for (let i = 0; i < hits.length; i++) {
    const key = sectionKey(hits[i]![1] ?? "");
    const start = hits[i]!.index! + hits[i]![0].length;
    const end = i + 1 < hits.length ? hits[i + 1]!.index! : md.length;
    const body = md.slice(start, end).trim();
    if (!key || !body) continue;
    out[key] = out[key] ? `${out[key]}\n\n${body}` : body;
  }
  return out;
}

function firstUrl(md: string): string {
  const urls = md.match(/https?:\/\/[^\s)\]>'"]+/g) ?? [];
  const yt = urls.find((u) => /youtube\.com|youtu\.be/i.test(u));
  return yt ?? urls[0] ?? "";
}

function slugOf(md: string): string {
  const fromField = field(md, "slug");
  if (fromField) {
    const m = fromField.match(/strt-[a-z0-9-]+/i);
    if (m) return m[0]!.toLowerCase();
  }
  const m = md.match(SLUG_RE);
  return (m?.[1] ?? "strt-unknown").toLowerCase();
}

function hypothesisIdFor(slug: string): string {
  const locked = sleeveByMetisSlug(slug);
  if (locked) return locked.hypothesisId;
  return `hyp-${slug.replace(/^strt-/, "")}`;
}

function statusOf(md: string): HypothesisStatus {
  const line = field(md, "status") ?? "";
  const blob = `${line}\n${md.slice(0, 900)}`.toLowerCase();
  if (/\brejected\b/.test(blob)) return "rejected";
  if (/\bask[_\s-]?measured\b/.test(blob)) return "ask_measured";
  if (/\brun[_\s-]?measured\b/.test(blob)) return "run_measured";
  return "research";
}

function groundingOf(md: string, slug: string): string {
  const locked = sleeveByMetisSlug(slug);
  const m = md.match(/Grounding-v(\d+)/i);
  if (m) return `v${m[1]}`;
  return locked?.groundingVersion ?? "unspecified";
}

/**
 * Read the Instrument line without ever mapping QQQ→NQ or SPY→ES.
 * US100 / Nasdaq on a futures card stays NQ, not QQQ.
 */
function instrumentsOf(md: string, slug: string): HypothesisInstrument[] {
  const locked = sleeveByMetisSlug(slug);
  const line = stripDecor(field(md, "instrument") ?? "");
  let symbol = locked?.symbol ?? "";
  let note: string | undefined;

  if (/\bQQQ\b/.test(line) && !/\bNQ\b/i.test(line)) {
    symbol = "QQQ";
    note = "QQQ is not NQ";
  } else if (/\bSPY\b/.test(line) && !/\bES\b/.test(line)) {
    symbol = "SPY";
    note = "SPY is not ES";
  } else if (/\bNQ\b|\bNasdaq\b|\bUS100\b/i.test(line)) {
    symbol = "NQ";
    if (/US100/i.test(line)) note = "author also said US100; cash/CFD cousin, not QQQ";
  } else if (/\bES\b/.test(line)) {
    symbol = "ES";
  } else if (/\bQQQ\b/.test(line)) {
    symbol = "QQQ";
    note = "QQQ is not NQ";
  }

  if (!symbol) {
    symbol = "NQ";
    note = "instrument line missing; NQ is a label, not a Yahoo→Themis map";
  }

  const tf = locked?.timeframe ?? "1m";
  return [
    {
      series_class: "yahoo",
      symbol,
      timeframe: tf,
      session: "RTH",
      ...(note ? { note } : {}),
    },
  ];
}

function conflictLine(md: string): string | null {
  const m = md.match(/conflict[^\n]*:\s*(.+)/i);
  return m?.[1]?.trim() ?? null;
}

function englishOf(md: string, sec: Record<string, string>, title: string): string {
  const idea = (sec.idea ?? "").replace(/\n+/g, " ").trim();
  const origin = stripDecor(field(md, "origin") ?? "");
  const parts = [title.replace(/\s+/g, " ").trim()];
  if (origin) parts.push(origin.slice(0, 240));
  if (idea) parts.push(idea.slice(0, 500));
  return parts.join(" — ").slice(0, 900);
}

export function hypothesisFromMetisMarkdown(md: string): Hypothesis {
  const text = md.trim();
  if (!text) throw new Error("Empty Metis markdown");
  const title = h1(text);
  const slug = slugOf(text);
  const locked = sleeveByMetisSlug(slug);
  const sec = sections(text);
  const setup = sec.setup ?? locked?.thesis ?? title;
  const entry = sec.entry ?? "";
  const exit = sec.exit ?? "";
  const invalidation =
    sec.invalidation ??
    conflictLine(text) ??
    locked?.invalidation ??
    "Rules not met — no trade.";

  const raw: Hypothesis = {
    schema: "fortvna.hypothesis.v0",
    id: hypothesisIdFor(slug),
    metis_slug: slug,
    english: englishOf(text, sec, title),
    setup,
    entry,
    exit,
    invalidation,
    source_url: firstUrl(text),
    grounding_version: groundingOf(text, slug),
    instruments: instrumentsOf(text, slug),
    status: statusOf(text),
    pointers: {
      orb_playbook_id: locked?.orbPlaybookId ?? null,
      themis_idea_slug: null,
      themis_spec_ids: [],
      crucible_strategy_id: locked?.crucibleStrategyId ?? null,
    },
  };
  return HypothesisSchema.parse(raw);
}

export function knownMetisSlugs(): string[] {
  return Object.keys(SLEEVES);
}
