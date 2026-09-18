#!/usr/bin/env node
/**
 * Pick a Node that supports --experimental-strip-types (Node 22+),
 * then run app-data/auth node:test suites and Vitest.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function supportsStripTypes(bin) {
  const r = spawnSync(bin, ["--experimental-strip-types", "-e", ""], {
    encoding: "utf8",
  });
  const err = `${r.stderr || ""}${r.stdout || ""}`;
  if (/bad option/i.test(err)) return false;
  return r.error == null;
}

const candidates = [
  process.env.ORB_NODE,
  path.join(homedir(), ".local/bin/node22"),
  "node22",
  process.execPath,
  "node",
].filter(Boolean);

let nodeBin = null;
for (const c of candidates) {
  if (c.includes("/") && !existsSync(c)) continue;
  if (supportsStripTypes(c)) {
    nodeBin = c;
    break;
  }
}

if (!nodeBin) {
  console.error(
    "Need Node 22+ for --experimental-strip-types (app-data/auth tests). Tried:",
    candidates.join(", "),
  );
  process.exit(9);
}

const files = [
  "src/lib/app-data/app-data.test.ts",
  "src/lib/app-data/readiness-schedule.test.ts",
  "src/lib/auth/gate-identity.test.ts",
  "src/lib/auth/sign-in-gate.test.ts",
];

console.error(`[run-unit-tests] using ${nodeBin} for strip-types suites`);
const t1 = spawnSync(
  nodeBin,
  ["--experimental-strip-types", "--test", ...files],
  { stdio: "inherit", cwd: process.cwd() },
);
if (t1.status) process.exit(t1.status ?? 1);

const vitestCli = path.join(process.cwd(), "node_modules/vitest/vitest.mjs");
let t2;
if (existsSync(vitestCli)) {
  t2 = spawnSync(process.execPath, [vitestCli, "run", "--config", "vitest.config.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
} else {
  t2 = spawnSync("npx", ["vitest", "run", "--config", "vitest.config.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
    shell: true,
  });
}
process.exit(t2.status ?? 1);
