/**
 * Diagnostic script: classify every node in complex_tail_subtrees.csv with
 * the new two-level taxonomy and print depth-by-shape and sub-code shares.
 * Useful as a sanity check before regenerating any JSON snapshots.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyNodeName, TopShape, SubCode } from "./classifier.ts";

const __filename = fileURLToPath(import.meta.url);
const REPO = join(dirname(__filename), "..");

function parseCsv(text: string): Record<string, string>[] {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
      else if (c === "\r") {}
      else field += c;
    }
  }
  if (field || row.length) { row.push(field); out.push(row); }
  const h = out[0];
  return out
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

const csv = readFileSync(join(REPO, "data", "raw", "complex_tail_subtrees.csv"), "utf8");
const rows = parseCsv(csv);

type Counter = Map<string, number>;
const bump = (m: Counter, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

const byDepthShape = new Map<number, Counter>();
const byDepthSub = new Map<number, Counter>();
const subShape = new Map<SubCode, TopShape>();
let total = 0;

for (const r of rows) {
  const d = Number(r.depth);
  if (!Number.isFinite(d)) continue;
  const c = classifyNodeName(r.site_name);
  if (!byDepthShape.has(d)) byDepthShape.set(d, new Map());
  if (!byDepthSub.has(d)) byDepthSub.set(d, new Map());
  bump(byDepthShape.get(d)!, c.shape);
  bump(byDepthSub.get(d)!, c.sub);
  subShape.set(c.sub, c.shape);
  total++;
}

console.log(`\nTOTAL CLASSIFIED: ${total.toLocaleString()}`);

const shapes: TopShape[] = ["lifecycle", "code", "geo", "function", "spatial", "device", "corporate", "entity"];
console.log("\n=== TOP-LEVEL SHAPE DISTRIBUTION BY DEPTH ===");
console.log(`${"shape".padEnd(12)} ${"d1".padStart(7)} ${"d2".padStart(7)} ${"d3".padStart(7)} ${"d4".padStart(7)}`);
for (const sh of shapes) {
  const cells = [sh];
  for (const d of [1, 2, 3, 4]) {
    const dc = byDepthShape.get(d) ?? new Map();
    const tot = [...dc.values()].reduce((s, n) => s + n, 0);
    const n = dc.get(sh) ?? 0;
    cells.push(`${(100 * n / Math.max(tot, 1)).toFixed(1)}%`);
  }
  console.log(`${cells[0].padEnd(12)} ${cells[1].padStart(7)} ${cells[2].padStart(7)} ${cells[3].padStart(7)} ${cells[4].padStart(7)}`);
}

console.log("\n=== TOP SUB-CODES (>= 0.3% share overall) ===");
const allSub = new Map<string, number>();
for (const dc of byDepthSub.values()) for (const [k, v] of dc) allSub.set(k, (allSub.get(k) ?? 0) + v);
const ranked = [...allSub.entries()].sort((a, b) => b[1] - a[1]);
for (const [sub, n] of ranked) {
  const pct = (100 * n) / total;
  if (pct < 0.3) break;
  const sh = subShape.get(sub as SubCode) ?? "?";
  console.log(`  ${sh.padEnd(10)} ${sub.padEnd(22)} ${n.toLocaleString().padStart(8)}  ${pct.toFixed(2)}%`);
}

console.log("\n=== entity/named coverage by depth ===");
for (const d of [1, 2, 3, 4]) {
  const dc = byDepthShape.get(d) ?? new Map();
  const tot = [...dc.values()].reduce((s, n) => s + n, 0);
  const n = dc.get("entity") ?? 0;
  console.log(`  depth ${d}: entity = ${(100 * n / Math.max(tot, 1)).toFixed(1)}%`);
}
