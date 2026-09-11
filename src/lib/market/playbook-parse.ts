import type { Playbook, PlaybookKind } from "./types";

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

export function inferKind(setup: string): PlaybookKind {
  const s = setup.toLowerCase();
  if (s.includes("ib") || s.includes("balance") || s.includes("lonny")) return "ib";
  if (s.includes("gap")) return "gap";
  if (s.includes("vwap")) return "vwap";
  if (s.includes("fvg") || s.includes("fair")) return "fvg";
  if (s.includes("orb") || s.includes("open")) return "orb";
  return "custom";
}

export function hydratePlaybook(p: Partial<Playbook> & { id: string; name: string }): Playbook {
  const setup = (p.setup || p.name).trim();
  return {
    id: p.id,
    name: p.name,
    setup,
    thesis: p.thesis ?? "",
    rules: p.rules ?? [],
    invalidation: p.invalidation ?? "",
    session: p.session ?? "NY RTH",
    status: p.status ?? "active",
    origin: p.origin ?? "custom",
    kind: p.kind ?? inferKind(setup),
    symbol: p.symbol ?? "NQ",
    timeframe: p.timeframe ?? "5m",
    windowStart: p.windowStart ?? 9 * 60 + 30,
    windowEnd: p.windowEnd ?? 16 * 60,
    targetR: p.targetR ?? 1,
    stopTicks: p.stopTicks ?? null,
    validated: p.validated ?? p.status === "validated",
    mentorNotes: p.mentorNotes ?? "",
    evaluation: p.evaluation,
  };
}

function asPlaybook(raw: Record<string, unknown>, index = 0): Playbook | null {
  const name = String(raw.name ?? raw.title ?? raw.playbook ?? "").trim();
  if (!name) return null;
  const rulesRaw = raw.rules ?? raw.rule ?? raw.checklist;
  let rules: string[] = [];
  if (Array.isArray(rulesRaw)) rules = rulesRaw.map((r) => String(r).trim()).filter(Boolean);
  else if (typeof rulesRaw === "string") {
    rules = rulesRaw
      .split(/\s*\|\s*|\n|;/g)
      .map((r) => r.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  const kindRaw = String(raw.kind ?? "").toLowerCase();
  const kind = (["orb", "ib", "gap", "vwap", "fvg", "custom"] as const).includes(
    kindRaw as PlaybookKind,
  )
    ? (kindRaw as PlaybookKind)
    : undefined;
  return hydratePlaybook({
    id: String(raw.id ?? makeId(name + index)),
    name,
    setup: String(raw.setup ?? raw.tag ?? raw.edge ?? name).trim() || name,
    thesis: String(raw.thesis ?? raw.why ?? raw.description ?? raw.summary ?? "").trim(),
    rules,
    invalidation: String(raw.invalidation ?? raw.invalidate ?? raw.stop ?? "").trim(),
    session: String(raw.session ?? raw.when ?? "Any").trim() || "Any",
    status: raw.status === "paused" ? "paused" : raw.status === "validated" ? "validated" : "active",
    origin: "imported",
    kind,
    symbol: String(raw.symbol ?? "NQ"),
    targetR: Number(raw.targetR ?? raw.target ?? 1) || 1,
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
      "session": "NY RTH",
      "thesis": "After a morning sweep, a reclaim of session VWAP with delta confirmation is a continuation.",
      "rules": [
        "Sweep of the initial-balance extreme first.",
        "Reclaim VWAP on a 5-minute close.",
        "Delta flips in the same direction.",
        "Stop: other side of VWAP."
      ],
      "invalidation": "Immediate loss of VWAP with expanding opposing delta."
    }
  ]
}
`;
