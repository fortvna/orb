import type { IndicatorId, Playbook, PlaybookKind } from "./types";
import { canMarkValidated } from "./types";
import { parseClock } from "./clock";
import { kitForKind } from "./playbook-kit";
import { hypothesisFromMetisMarkdown, isMetisMarkdown, playbookFromHypothesis } from "../hypothesis";

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return s || "playbook";
}

function makeId(name: string): string {
  return `pb-${slug(name)}-${Date.now().toString(36).slice(-4)}`;
}

const PLAYBOOK_KINDS = ["orb", "ib", "gap", "vwap", "fvg", "streak", "custom"] as const;

export function inferKind(setup: string): PlaybookKind {
  const s = setup.toLowerCase();
  if (s.includes("streak") || s.includes("herman")) return "streak";
  if (s.includes("ib") || s.includes("balance") || s.includes("lonny")) return "ib";
  if (s.includes("gap")) return "gap";
  if (s.includes("vwap")) return "vwap";
  if (s.includes("fvg") || s.includes("fair")) return "fvg";
  if (s.includes("orb") || s.includes("open")) return "orb";
  return "custom";
}

function parseTimeframe(raw: unknown): Playbook["timeframe"] {
  const s = String(raw ?? "5m").toLowerCase().replace(/\s/g, "");
  if (s === "1" || s === "1m" || s === "1min") return "1m";
  if (s === "15" || s === "15m" || s === "15min") return "15m";
  return "5m";
}

function numOrNull(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const INDICATOR_IDS = new Set<string>([
  "volume",
  "sessionHL",
  "keyTimes",
  "killzones",
  "openPrice",
  "vwap",
  "stdev",
  "ema",
  "rsi",
  "vrvp",
  "hvn",
  "pvp",
  "htf",
  "po3",
  "quarterly",
  "stopHunt",
  "eqHL",
  "fvg",
  "pivots",
  "smt",
  "orH",
  "orL",
  "ibH",
  "ibL",
]);

function parseIndicators(raw: unknown): IndicatorId[] | undefined {
  const ids = Array.isArray(raw)
    ? raw.map((x) => String(x).trim())
    : typeof raw === "string"
      ? raw.split(/[|,]/).map((s) => s.trim())
      : [];
  const out = ids.filter((id): id is IndicatorId => INDICATOR_IDS.has(id));
  return out.length ? out : undefined;
}

export function hydratePlaybook(p: Partial<Playbook> & { id: string; name: string }): Playbook {
  const setup = (p.setup || p.name).trim();
  const kind = p.kind ?? inferKind(setup);
  const liveOk = canMarkValidated(p.evaluation);
  const wantedValidated = Boolean(p.validated ?? p.status === "validated");
  const validated = liveOk && wantedValidated;
  const status = p.status === "validated" && !validated ? "active" : (p.status ?? "active");
  return {
    id: p.id,
    name: p.name,
    setup,
    thesis: p.thesis ?? "",
    rules: p.rules ?? [],
    invalidation: p.invalidation ?? "",
    session: p.session ?? "NY RTH",
    status,
    origin: p.origin ?? "custom",
    kind,
    symbol: p.symbol ?? "NQ",
    timeframe: p.timeframe ?? "5m",
    windowStart: p.windowStart ?? 9 * 60 + 30,
    windowEnd: p.windowEnd ?? 16 * 60,
    targetR: p.targetR ?? 1,
    stopTicks: p.stopTicks ?? null,
    validated,
    mentorNotes: p.mentorNotes ?? "",
    indicators: p.indicators?.length ? p.indicators : kitForKind(kind),
    evaluation: p.evaluation,
    metisSlug: p.metisSlug,
    hypothesisId: p.hypothesisId,
    groundingVersion: p.groundingVersion,
  };
}

function asPlaybook(raw: Record<string, unknown>, index = 0): Playbook | null {
  const name = String(raw.name ?? raw.title ?? raw.playbook ?? "").trim();
  if (!name) return null;
  const rulesRaw = raw.rules ?? raw.rule ?? raw.checklist;
  let rules: string[] = [];
  if (Array.isArray(rulesRaw)) rules = rulesRaw.map((r) => String(r)).map((r) => r.trim()).filter(Boolean);
  else if (typeof rulesRaw === "string") {
    rules = rulesRaw
      .split(/\s*\|\s*|\n|;/g)
      .map((r) => r.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  const kindRaw = String(raw.kind ?? "").toLowerCase();
  const kind = (PLAYBOOK_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as PlaybookKind)
    : undefined;
  const statusRaw = String(raw.status ?? "").toLowerCase();
  const status =
    statusRaw === "paused"
      ? "paused"
      : statusRaw === "validated"
        ? "validated"
        : statusRaw === "draft"
          ? "draft"
          : "active";
  return hydratePlaybook({
    id: String(raw.id ?? makeId(name + index)),
    name,
    setup: String(raw.setup ?? raw.tag ?? raw.edge ?? name).trim() || name,
    thesis: String(raw.thesis ?? raw.why ?? raw.description ?? raw.summary ?? "").trim(),
    rules,
    invalidation: String(raw.invalidation ?? raw.invalidate ?? raw.stop ?? "").trim(),
    session: String(raw.session ?? raw.when ?? "Any").trim() || "Any",
    status,
    origin: "imported",
    kind,
    symbol: String(raw.symbol ?? "NQ"),
    timeframe: parseTimeframe(raw.timeframe ?? raw.tf),
    windowStart: parseClock(raw.windowStart ?? raw.windowstart ?? raw.window_start ?? raw.from) ?? 9 * 60 + 30,
    windowEnd: parseClock(raw.windowEnd ?? raw.windowend ?? raw.window_end ?? raw.to) ?? 16 * 60,
    targetR: Number(raw.targetR ?? raw.target ?? 1) || 1,
    stopTicks: numOrNull(raw.stopTicks ?? raw.stop_ticks ?? raw.stopticks),
    indicators: parseIndicators(raw.indicators ?? raw.kit),
    metisSlug: raw.metisSlug || raw.metis_slug ? String(raw.metisSlug ?? raw.metis_slug) : undefined,
    hypothesisId: raw.hypothesisId || raw.hypothesis_id ? String(raw.hypothesisId ?? raw.hypothesis_id) : undefined,
    groundingVersion: raw.groundingVersion || raw.grounding_version ? String(raw.groundingVersion ?? raw.grounding_version) : undefined,
  });
}

function parseJson(text: string): Playbook[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { playbooks?: unknown }).playbooks)
      ? (data as { playbooks: unknown[] }).playbooks
      : [data];
  return list
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x, i) => asPlaybook(x, i))
    .filter((x): x is Playbook => x !== null);
}

function parseCsv(text: string): Playbook[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]!).map((h) => h.toLowerCase().trim());
  const rows: Playbook[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]!);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? "";
    });
    const pb = asPlaybook(rec, i);
    if (pb) rows.push(pb);
  }
  return rows;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else q = !q;
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseMarkdown(text: string): Playbook[] {
  const chunks = text.split(/\n(?=#\s+)/).map((c) => c.trim()).filter(Boolean);
  const out: Playbook[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    const name = (lines[0] ?? "").replace(/^#+\s*/, "").trim();
    if (!name) continue;
    const body = lines.slice(1).join("\n");
    const setup = matchField(body, "setup") ?? name;
    const session = matchField(body, "session") ?? "Any";
    const invalidation =
      matchSection(body, "invalidation") ?? matchField(body, "invalidation") ?? "";
    const rulesBlock = matchSection(body, "rules") ?? "";
    const rules = rulesBlock
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter(Boolean);
    const thesis =
      matchSection(body, "thesis") ??
      matchField(body, "thesis") ??
      body
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#") && !/^(setup|session|invalidation):/i.test(l))
        .join(" ")
        .trim()
        .slice(0, 600);
    out.push(
      hydratePlaybook({
        id: makeId(name),
        name,
        setup,
        thesis,
        rules,
        invalidation,
        session,
        status: "active",
        origin: "imported",
        timeframe: parseTimeframe(matchField(body, "timeframe")),
        windowStart: parseClock(matchField(body, "windowStart") ?? matchField(body, "window")) ?? 9 * 60 + 30,
        windowEnd: parseClock(matchField(body, "windowEnd")) ?? 16 * 60,
        stopTicks: numOrNull(matchField(body, "stopTicks")),
        symbol: matchField(body, "symbol") ?? "NQ",
        indicators: parseIndicators(matchField(body, "indicators") ?? matchField(body, "kit")),
      }),
    );
  }
  return out;
}

function matchField(body: string, key: string): string | null {
  const re = new RegExp(`^${key}\\s*:\\s*(.+)$`, "im");
  const m = body.match(re);
  return m?.[1]?.trim() ?? null;
}

function matchSection(body: string, key: string): string | null {
  const re = new RegExp(`^##\\s*${key}\\s*$([\\s\\S]*?)(?=^##\\s|$)`, "im");
  const m = body.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseMetis(text: string): Playbook[] {
  try {
    const h = hypothesisFromMetisMarkdown(text);
    return [playbookFromHypothesis(h)];
  } catch {
    return [];
  }
}

export function parsePlaybooks(text: string, filename = ""): Playbook[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseJson(trimmed);
    } catch {
      /* fall through */
    }
  }
  if (lower.endsWith(".csv") || /^name[,;]/i.test(trimmed)) {
    const rows = parseCsv(trimmed);
    if (rows.length) return rows;
  }
  if (isMetisMarkdown(trimmed, filename)) {
    const metis = parseMetis(trimmed);
    if (metis.length) return metis;
  }
  const md = parseMarkdown(trimmed);
  if (md.length) return md;
  try {
    return parseJson(trimmed);
  } catch {
    return [];
  }
}

export const PLAYBOOK_TEMPLATE = `{
  "playbooks": [
    {
      "name": "VWAP reclaim",
      "setup": "VWAP",
      "kind": "vwap",
      "symbol": "NQ",
      "timeframe": "5m",
      "windowStart": "10:30",
      "windowEnd": "14:00",
      "stopTicks": 16,
      "session": "NY RTH",
      "indicators": ["volume", "ibH", "ibL", "vwap", "ema"],
      "thesis": "After a morning sweep, a 5-minute close back through session VWAP is a continuation.",
      "rules": [
        "Sweep of the initial-balance extreme first.",
        "Reclaim VWAP on a 5-minute close.",
        "Stop: other side of VWAP."
      ],
      "invalidation": "Immediate loss of VWAP on the next 5-minute close."
    }
  ]
}
`;
