/**
 * Build src/data/sequencing.json.
 *
 * Reads data/raw/complex_tail_subtrees.csv (every site at every depth for
 * the 6,282-org complex tail) and produces:
 *
 *   - cross-tail funnel: at each depth, how complex orgs' shape distribution
 *     looks, plus the most common shape-to-shape transitions
 *     (depth-1 -> depth-2 -> depth-3 -> depth-4).
 *
 *   - per-industry funnel: same thing but split by the 20 industry buckets
 *     used elsewhere in the dashboard, so the UI can render an industry
 *     deep-dive with its own funnel.
 *
 *   - depth-1 node-type distribution: how many complex orgs start with
 *     structural / mixed / leaf_with_devices / dead_end roots, which is
 *     the question "where does usage actually start?".
 *
 * Method note (for the UI footnote): pure counts over the materialised
 * CSV. No statistical model, no sampling, no machine learning. The
 * depth-1 classifier reuses inferRootShape (regex ladder); depth-2+ uses
 * inferNodeShape which adds floor / cardinal / building-letter /
 * device-zone categories on top of the root vocabulary.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeShape,
  NODE_SHAPES,
  inferNodeShape,
  nodeShapeLabels,
} from "./classifier.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const RAW = join(REPO_ROOT, "data", "raw");
const OUT = join(REPO_ROOT, "src", "data", "sequencing.json");

// --- CSV parser (minimal; same shape as build-aggregate-patterns) ---
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
  const headers = out[0] ?? [];
  const rows = out.slice(1).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== "")).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ""; });
    return o;
  });
  return { headers, rows };
}

// --- Industry bucketing (kept in sync with build-aggregate-patterns.ts) ---
const INDUSTRY_BUCKETS: { match: RegExp; bucket: string }[] = [
  { match: /Education - Elementary|6111/i, bucket: "K-12" },
  { match: /Education - Colleges|Higher|6112|6113|6114/i, bucket: "Higher Ed" },
  { match: /Health Care|62/i, bucket: "Healthcare" },
  { match: /Manufacturing|31-33|31\/33/i, bucket: "Manufacturing" },
  { match: /Retail|44-45/i, bucket: "Retail" },
  { match: /Transportation|48-49/i, bucket: "Transportation & Logistics" },
  { match: /Utilities|^22\b/i, bucket: "Utilities" },
  { match: /Public Administration|Police|92\b/i, bucket: "Government" },
  { match: /Construction|^23\b/i, bucket: "Construction" },
  { match: /Agriculture|Forestry|Fishing|Hunting|11\b/i, bucket: "Agriculture" },
  { match: /Real Estate|Rental|Leasing|53\b/i, bucket: "Real Estate" },
  { match: /Finance|Insurance|52\b/i, bucket: "Financial Services" },
  { match: /Professional|Scientific|Technical|54\b/i, bucket: "Professional Services" },
  { match: /Information|51\b/i, bucket: "Tech & Information" },
  { match: /Religious|Grantmaking|Civic|813|Non[-\s]?profit/i, bucket: "Nonprofit & Civic" },
  { match: /Accommodation|Food Services|72\b/i, bucket: "Hospitality" },
  { match: /Wholesale|42\b/i, bucket: "Wholesale" },
  { match: /Arts|Entertainment|Recreation|71\b/i, bucket: "Arts & Entertainment" },
  { match: /Mining|Oil|Gas|21\b/i, bucket: "Energy & Mining" },
  { match: /Administrative|Support|Waste|56\b/i, bucket: "Admin & Support" },
];
function bucketIndustry(s: string): string {
  if (!s) return "Unknown / Other";
  for (const { match, bucket } of INDUSTRY_BUCKETS) if (match.test(s)) return bucket;
  return "Other";
}

// --- Load complex_tail_subtrees + org_axes ---
type Row = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  depth: number;
  parentSiteId: string;
  nodeType: string; // empty_organizational_site / mixed / leaf_device_site / dead_end_empty_leaf
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
};

function num(s: string): number {
  if (!s || s === "null" || s === "NULL") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function loadRows(): Row[] {
  const p = join(RAW, "complex_tail_subtrees.csv");
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  const { rows } = parseCsv(readFileSync(p, "utf8"));
  return rows.map((r) => ({
    sfdcAccountId: r.sfdc_account_id,
    sfdcAccountName: r.sfdc_account_name,
    organizationId: r.organization_id,
    siteId: r.site_id,
    siteName: r.site_name,
    depth: num(r.depth),
    parentSiteId: r.parent_site_id,
    nodeType: r.node_type,
    cameras: num(r.camera_count),
    acPanels: num(r.ac_panel_count),
    alarmDevices: num(r.alarm_device_count),
    alarmPanels: num(r.alarm_panel_count),
  }));
}

function loadIndustryByAccount(): Map<string, string> {
  const p = join(RAW, "org_axes.csv");
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  const { rows } = parseCsv(readFileSync(p, "utf8"));
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.sfdc_account_id, bucketIndustry(r.industry));
  return m;
}

// --- Build org-keyed indexes ---
type OrgIndex = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  industry: string;
  byId: Map<string, Row>;
  childrenById: Map<string, Row[]>;
  rootSites: Row[]; // depth=1 only
};

function indexByOrg(rows: Row[], industryByAccount: Map<string, string>): OrgIndex[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.organizationId;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const orgs: OrgIndex[] = [];
  for (const [, members] of groups) {
    if (members.length === 0) continue;
    const byId = new Map<string, Row>();
    const childrenById = new Map<string, Row[]>();
    const rootSites: Row[] = [];
    for (const r of members) {
      byId.set(r.siteId, r);
      if (r.depth === 1) rootSites.push(r);
      if (r.parentSiteId) {
        const list = childrenById.get(r.parentSiteId) ?? [];
        list.push(r);
        childrenById.set(r.parentSiteId, list);
      }
    }
    const first = members[0];
    orgs.push({
      sfdcAccountId: first.sfdcAccountId,
      sfdcAccountName: first.sfdcAccountName,
      industry: industryByAccount.get(first.sfdcAccountId) ?? "Unknown / Other",
      byId,
      childrenById,
      rootSites,
    });
  }
  return orgs;
}

// --- Sequencing counts ---
type ShapeTransitions = {
  // shape at depth-1
  d1: Record<NodeShape, number>;
  // shape transitions (d1 -> d2)
  d1d2: Map<NodeShape, Map<NodeShape, number>>;
  // (d1 -> d2 -> d3)
  d1d2d3: Map<string, number>; // key = `${s1}|${s2}|${s3}`
};

function emptyShapeCounts(): Record<NodeShape, number> {
  const o = {} as Record<NodeShape, number>;
  for (const s of NODE_SHAPES) o[s] = 0;
  return o;
}

function buildTransitions(orgs: OrgIndex[]): ShapeTransitions {
  const d1 = emptyShapeCounts();
  const d1d2 = new Map<NodeShape, Map<NodeShape, number>>();
  const d1d2d3 = new Map<string, number>();

  for (const org of orgs) {
    // For each depth-1 root, walk to its depth-2 and depth-3 children.
    // We count one transition per (root, child) pair, not weighted by
    // subtree size. That keeps a single huge subtree from dominating.
    for (const r1 of org.rootSites) {
      const s1 = inferNodeShape(r1.siteName);
      d1[s1] += 1;
      const d2 = org.childrenById.get(r1.siteId) ?? [];
      if (d2.length === 0) continue;
      let m = d1d2.get(s1);
      if (!m) { m = new Map(); d1d2.set(s1, m); }
      for (const r2 of d2) {
        const s2 = inferNodeShape(r2.siteName);
        m.set(s2, (m.get(s2) ?? 0) + 1);
        const d3 = org.childrenById.get(r2.siteId) ?? [];
        for (const r3 of d3) {
          const s3 = inferNodeShape(r3.siteName);
          const k = `${s1}|${s2}|${s3}`;
          d1d2d3.set(k, (d1d2d3.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return { d1, d1d2, d1d2d3 };
}

// --- Depth-1 node-type distribution ("where does usage start?") ---
function depthOneNodeTypeDistribution(orgs: OrgIndex[]): Record<string, number> {
  const out: Record<string, number> = {
    empty_organizational_site: 0,
    mixed: 0,
    leaf_device_site: 0,
    dead_end_empty_leaf: 0,
  };
  let total = 0;
  for (const org of orgs) {
    for (const r of org.rootSites) {
      out[r.nodeType] = (out[r.nodeType] ?? 0) + 1;
      total += 1;
    }
  }
  // turn into fractions
  for (const k of Object.keys(out)) out[k] = total > 0 ? out[k] / total : 0;
  return out;
}

// --- Per-industry slicing ---
function buildByIndustry(orgs: OrgIndex[]): Record<string, ShapeTransitions> {
  const groups = new Map<string, OrgIndex[]>();
  for (const o of orgs) {
    const list = groups.get(o.industry) ?? [];
    list.push(o);
    groups.set(o.industry, list);
  }
  const out: Record<string, ShapeTransitions> = {};
  for (const [industry, members] of groups) {
    out[industry] = buildTransitions(members);
  }
  return out;
}

// --- Serialise transitions to JSON-friendly shape ---
type SerializedTransitions = {
  d1Counts: Record<NodeShape, number>;
  d1Shares: Record<NodeShape, number>;
  // For each depth-1 shape, top depth-2 shapes by count
  d1d2: { from: NodeShape; to: NodeShape; count: number; share: number }[];
  // Top depth-1 -> depth-2 -> depth-3 paths overall
  topPaths: { d1: NodeShape; d2: NodeShape; d3: NodeShape; count: number; share: number }[];
  totalRoots: number;
  totalD2Transitions: number;
  totalD3Paths: number;
};

function serialize(t: ShapeTransitions, opts?: { topPathsLimit?: number }): SerializedTransitions {
  const totalRoots = Object.values(t.d1).reduce((s, n) => s + n, 0);
  const shares = {} as Record<NodeShape, number>;
  for (const s of NODE_SHAPES) shares[s] = totalRoots > 0 ? t.d1[s] / totalRoots : 0;

  let totalD2 = 0;
  for (const [, m] of t.d1d2) for (const [, c] of m) totalD2 += c;
  const d1d2Rows: SerializedTransitions["d1d2"] = [];
  for (const [from, m] of t.d1d2) {
    const fromTotal = [...m.values()].reduce((s, n) => s + n, 0);
    for (const [to, c] of m) {
      d1d2Rows.push({
        from,
        to,
        count: c,
        share: fromTotal > 0 ? c / fromTotal : 0,
      });
    }
  }
  d1d2Rows.sort((a, b) => b.count - a.count);

  const totalD3 = [...t.d1d2d3.values()].reduce((s, n) => s + n, 0);
  const topPaths: SerializedTransitions["topPaths"] = [];
  for (const [k, c] of t.d1d2d3) {
    const [s1, s2, s3] = k.split("|") as [NodeShape, NodeShape, NodeShape];
    topPaths.push({
      d1: s1,
      d2: s2,
      d3: s3,
      count: c,
      share: totalD3 > 0 ? c / totalD3 : 0,
    });
  }
  topPaths.sort((a, b) => b.count - a.count);
  const limit = opts?.topPathsLimit ?? 15;

  return {
    d1Counts: t.d1,
    d1Shares: shares,
    d1d2: d1d2Rows.slice(0, 25),
    topPaths: topPaths.slice(0, limit),
    totalRoots,
    totalD2Transitions: totalD2,
    totalD3Paths: totalD3,
  };
}

// --- Main ---
function main() {
  console.log("Loading complex_tail_subtrees.csv...");
  const rows = loadRows();
  const industryByAccount = loadIndustryByAccount();
  console.log(`  ${rows.length.toLocaleString()} site rows, ${industryByAccount.size} accounts with industry`);

  console.log("Indexing by org...");
  const orgs = indexByOrg(rows, industryByAccount);
  console.log(`  ${orgs.length} orgs indexed (expected ~6,282)`);

  console.log("Building cross-tail transitions...");
  const overall = buildTransitions(orgs);
  const overallSer = serialize(overall, { topPathsLimit: 20 });

  console.log("Depth-1 node-type distribution...");
  const d1NodeTypes = depthOneNodeTypeDistribution(orgs);

  console.log("Per-industry transitions...");
  const byInd = buildByIndustry(orgs);
  const industries: Record<string, SerializedTransitions & { orgCount: number }> = {};
  for (const [name, t] of Object.entries(byInd)) {
    const orgCount = orgs.filter((o) => o.industry === name).length;
    industries[name] = {
      ...serialize(t, { topPathsLimit: 12 }),
      orgCount,
    };
  }

  const payload = {
    pulledAt: new Date().toISOString().slice(0, 10),
    totalOrgs: orgs.length,
    totalSites: rows.length,
    methodNote:
      "Pure counts over the complex-tail full-hierarchy dump. Depth-1 nodes classified with inferRootShape; depth-2+ classified with inferNodeShape which adds floor / cardinal / building-letter / device-zone categories. No model, no sampling.",
    nodeShapeLabels,
    overall: overallSer,
    overallDepthOneNodeTypes: d1NodeTypes,
    byIndustry: industries,
  };

  writeFileSync(OUT, JSON.stringify(payload) + "\n");
  console.log(`Wrote ${OUT}`);

  // Console summary so we can sanity-check before wiring the UI.
  console.log("\nDepth-1 shape distribution (complex tail):");
  for (const s of NODE_SHAPES) {
    const c = overall.d1[s];
    if (c > 0) console.log(`  ${s.padEnd(22)}  ${c.toLocaleString().padStart(7)}  (${((c / overallSer.totalRoots) * 100).toFixed(1)}%)`);
  }
  console.log("\nTop 10 depth-1 -> depth-2 -> depth-3 paths:");
  for (const p of overallSer.topPaths.slice(0, 10)) {
    console.log(
      `  ${p.d1} -> ${p.d2} -> ${p.d3}`.padEnd(80) +
        `  ${p.count.toLocaleString().padStart(6)}  (${(p.share * 100).toFixed(1)}%)`,
    );
  }
}

main();
