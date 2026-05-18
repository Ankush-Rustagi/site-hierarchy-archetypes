/**
 * Diagnostic: run the per-industry sub-segmenters across the active-paid
 * population and report org / bookings split per sub-segment.
 *
 * Run: npx tsx scripts/check-subsegments.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySubSegment, SUB_SEGMENTERS } from "./subsegments.ts";

const __filename = fileURLToPath(import.meta.url);
const REPO = join(dirname(__filename), "..");
const RAW = join(REPO, "data", "raw");

function parseCsv(text: string): Record<string, string>[] {
  const out: string[][] = [];
  let f = ""; let r: string[] = []; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true;
      else if (c === ",") { r.push(f); f = ""; }
      else if (c === "\n") { r.push(f); out.push(r); r = []; f = ""; }
      else if (c === "\r") {} else f += c; }
  }
  if (f || r.length) { r.push(f); out.push(r); }
  const h = out[0] ?? [];
  return out.slice(1).filter((row) => row.length > 1).map((row) => Object.fromEntries(h.map((k, i) => [k, row[i] ?? ""])));
}

// Same buckets used in build-taxonomy-snapshot.
const BUCKETS: [RegExp, string][] = [
  [/\(6111\)/i, "K-12"],
  [/\(6112,? ?6113,? ?6114\)/i, "Higher Ed"],
  [/\(61 except 6111[^)]*\)/i, "Trade Schools & Other Ed"],
  [/\(62\)/i, "Healthcare"],
  [/\(31-33\)/i, "Manufacturing"],
  [/\(44-45\)/i, "Retail"],
  [/\(48-49\)/i, "Transportation & Logistics"],
  [/\(22\)/i, "Utilities"],
  [/\(92\)/i, "Government"],
  [/\(23\)/i, "Construction"],
  [/\(11\)/i, "Agriculture"],
  [/\(53\)/i, "Real Estate"],
  [/\(52\)/i, "Financial Services"],
  [/\(54\)/i, "Professional Services"],
  [/\(51\)/i, "Tech & Information"],
  [/\(813\)/i, "Nonprofit & Civic"],
  [/\(72\)/i, "Hospitality"],
  [/\(42\)/i, "Wholesale"],
  [/\(71\)/i, "Arts & Entertainment"],
  [/\(21\)/i, "Energy & Mining"],
  [/\(55, 56, 81[^)]*\)/i, "Admin & Support"],
];
function bucket(s: string): string {
  if (!s) return "Unknown / Other";
  for (const [p, b] of BUCKETS) if (p.test(s)) return b;
  return "Other";
}

const axes = parseCsv(readFileSync(join(RAW, "org_axes.csv"), "utf8"));

type Counts = { count: number; bookings: number };
const counts = new Map<string, Map<string, Counts>>();
function bump(ind: string, seg: string, b: number) {
  if (!counts.has(ind)) counts.set(ind, new Map());
  const m = counts.get(ind)!;
  const c = m.get(seg) ?? { count: 0, bookings: 0 };
  c.count += 1;
  c.bookings += b;
  m.set(seg, c);
}

for (const r of axes) {
  const ind = bucket(r.industry ?? "");
  const b = Number(r.lifetime_bookings || 0);
  const seg = classifySubSegment(ind, { name: r.sfdc_account_name ?? "", bookings: b }) ?? "n/a";
  bump(ind, seg, b);
}

for (const s of SUB_SEGMENTERS) {
  const m = counts.get(s.industry);
  if (!m) continue;
  const total = [...m.values()].reduce((a, c) => a + c.count, 0);
  const totalB = [...m.values()].reduce((a, c) => a + c.bookings, 0);
  if (total < 50) continue;
  console.log(`\n=== ${s.industry}  ${total.toLocaleString()} orgs, $${(totalB / 1e6).toFixed(1)}M ===`);
  for (const seg of s.segments) {
    const c = m.get(seg.id);
    if (!c || c.count < 1) continue;
    console.log(
      `  ${seg.id.padEnd(28)} ${c.count.toLocaleString().padStart(6)} (${((c.count / total) * 100).toFixed(1).padStart(4)}%)  $${(c.bookings / 1e6).toFixed(1).padStart(7)}M (${((c.bookings / totalB) * 100).toFixed(1).padStart(4)}%)`,
    );
  }
}
