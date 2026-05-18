/**
 * Build the per-customer "representative subtrees" snapshot for the 12 deep-dive
 * accounts from data/raw/customer_subtrees.csv.
 *
 * For each customer we:
 *   1. Read every row (1,708 rows across 12 accounts, depths 1 to 7).
 *   2. Classify each depth-1 root by root shape using scripts/classifier.ts
 *      (geographic / facility_code / function_word / entity_name /
 *       corporate_tree / school_code / lifecycle_marker).
 *   3. Group roots by root shape and score each candidate root on:
 *        - distinct node-type count in its full subtree (more variety = better
 *          illustration of the sub-archetype)
 *        - max depth in the subtree (deeper = more interesting)
 *        - subtree size, preferring 8 to 50 nodes so the tree is readable
 *          but not trivial; very tiny (1 to 3 nodes) and very large (>60)
 *          are penalised
 *   4. For every shape present at the customer, emit the top-scoring root and
 *      its full descendant subtree (capped at 60 nodes; nodes past the cap are
 *      replaced with a single "[N more] (more nodes)" placeholder at the right
 *      depth so the tree still parses).
 *   5. Also emit a short auto-generated rationale per pick
 *      ("Geographic root showing state -> city -> building" etc.).
 *
 * Output: src/data/customer-subtrees.json. The Customer detail VIEW reads this
 * and renders a "Representative subtrees (real Athena data)" section per
 * customer with one subtree per sub-archetype.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RootShape,
  inferRootShape,
  rootShapeLabels,
} from "./classifier.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const RAW = join(REPO_ROOT, "data", "raw", "customer_subtrees.csv");
const OUT = join(REPO_ROOT, "src", "data", "customer-subtrees.json");

if (!existsSync(RAW)) {
  console.error(`Missing ${RAW}. Pull it from Hex first.`);
  process.exit(1);
}

// CSV parser. Quoted fields, escaped quotes, embedded commas + newlines.
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        out.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  const headers = out[0] ?? [];
  const rows = out.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
      return o;
    });
  return { headers, rows };
}

function n(s: string | undefined): number {
  if (!s || s === "null" || s === "NULL") return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

type RawRow = {
  sfdcAccountName: string;
  siteId: string;
  siteName: string;
  depth: number;
  parentSiteId: string | null;
  rootSiteId: string;
  rootSiteName: string;
  fullPath: string;
  nodeType: string;
  productMix: string;
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
};

type TreeNode = {
  name: string;
  type: "structural" | "mixed" | "leaf_with_devices" | "dead_end";
  cam?: number;
  ac?: number;
  alarmDev?: number;
  alarmPan?: number;
  mix?: string;
  note?: string;
  children?: TreeNode[];
};

type RepresentativeSubtree = {
  rootShape: RootShape;
  rootShapeLabel: string;
  rootName: string;
  rationale: string;
  totalNodes: number;
  maxDepth: number;
  distinctNodeTypes: number;
  subtree: TreeNode[];
};

type CustomerSubtreePayload = {
  sfdcAccountName: string;
  totalSitesInExtract: number;
  rootCount: number;
  rootShapeCoverage: { shape: RootShape; shapeLabel: string; rootCount: number }[];
  representativeSubtrees: RepresentativeSubtree[];
};

// Map Athena node_type -> our compact taxonomy. Athena emits two taxonomies in
// the customer_subtrees CSV: the production names (mixed / leaf_device_site /
// empty_organizational_site / dead_end_empty_leaf) and, for some legacy rows,
// the existing site_metrics names (structural / leaf_with_devices / dead_end).
// Normalize both.
function normalizeNodeType(t: string): "structural" | "mixed" | "leaf_with_devices" | "dead_end" {
  switch (t) {
    case "empty_organizational_site":
    case "structural":
      return "structural";
    case "leaf_device_site":
    case "leaf_with_devices":
      return "leaf_with_devices";
    case "dead_end_empty_leaf":
    case "dead_end":
      return "dead_end";
    case "mixed":
    default:
      return "mixed";
  }
}

// Some account names in the CSV differ slightly from how they appear in the
// 12-customer table inside src/App.tsx. Map CSV name -> Customer.name so the
// React side can join cleanly. Keep this list short and explicit.
const NAME_MAP: Record<string, string> = {
  "Caterpillar Inc": "Caterpillar Inc",
  "Saddle Creek Logistics Services": "Saddle Creek Logistics",
  "Tacoma Public Schools": "Tacoma Public Schools",
  "Legislative Assembly of British Columbia": "Legislative Assembly of British Columbia",
  "SGS (US)": "SGS (US)",
  "Hanna Boys Center": "Hanna Boys Center",
  "Mount Pisgah Christian School (GA)": "Mount Pisgah Christian School",
  "The Salvation Army - Western Territory": "Salvation Army - Western Territory",
  "Charter Schools USA": "Charter Schools USA",
  "Southwire Company LLC": "Southwire Company LLC",
  "Dairy Farmers of America , Inc.": "Dairy Farmers of America",
  "Hanger, Inc.": "Hanger, Inc.",
};

function loadRows(): RawRow[] {
  const text = readFileSync(RAW, "utf8");
  const { rows } = parseCsv(text);
  return rows.map((r) => ({
    sfdcAccountName: r.sfdc_account_name,
    siteId: r.site_id,
    siteName: r.site_name,
    depth: n(r.depth),
    parentSiteId: r.parent_site_id && r.parent_site_id !== "" ? r.parent_site_id : null,
    rootSiteId: r.root_site_id,
    rootSiteName: r.root_site_name,
    fullPath: r.full_path,
    nodeType: r.node_type,
    productMix: r.product_mix,
    cameras: n(r.camera_count),
    acPanels: n(r.ac_panel_count),
    alarmDevices: n(r.alarm_device_count),
    alarmPanels: n(r.alarm_panel_count),
  }));
}

// Build an in-memory tree by parent_site_id; root entries have parent === null.
type Indexed = {
  byId: Map<string, RawRow>;
  childrenById: Map<string, RawRow[]>;
  rootsByAccount: Map<string, RawRow[]>;
};

function indexRows(rows: RawRow[]): Indexed {
  const byId = new Map<string, RawRow>();
  const childrenById = new Map<string, RawRow[]>();
  const rootsByAccount = new Map<string, RawRow[]>();
  for (const r of rows) {
    byId.set(r.siteId, r);
  }
  for (const r of rows) {
    if (r.parentSiteId) {
      const list = childrenById.get(r.parentSiteId) ?? [];
      list.push(r);
      childrenById.set(r.parentSiteId, list);
    } else {
      const list = rootsByAccount.get(r.sfdcAccountName) ?? [];
      list.push(r);
      rootsByAccount.set(r.sfdcAccountName, list);
    }
  }
  return { byId, childrenById, rootsByAccount };
}

// Walk the subtree from a starting root, materializing a TreeNode graph.
// If the subtree exceeds maxNodes, depth-first nodes past the cap are pruned
// and replaced with a single "[+N more] (dead_end)" placeholder at the depth
// where pruning starts. This keeps the rendered tree readable.
function materializeSubtree(rootId: string, idx: Indexed, maxNodes: number): {
  tree: TreeNode[];
  totalNodes: number;
  maxDepth: number;
  distinctNodeTypes: number;
} {
  const all: RawRow[] = [];
  const queue: RawRow[] = [];
  const root = idx.byId.get(rootId);
  if (!root) return { tree: [], totalNodes: 0, maxDepth: 0, distinctNodeTypes: 0 };
  queue.push(root);
  while (queue.length > 0) {
    const r = queue.shift() as RawRow;
    all.push(r);
    const kids = idx.childrenById.get(r.siteId) ?? [];
    for (const k of kids) queue.push(k);
  }
  const totalNodes = all.length;
  let maxDepth = 0;
  const typeSet = new Set<string>();
  for (const a of all) {
    const rel = a.depth - root.depth + 1;
    if (rel > maxDepth) maxDepth = rel;
    typeSet.add(normalizeNodeType(a.nodeType));
  }

  // Build the tree. We track the running total of nodes already emitted and
  // stop expanding children once the cap is reached, attaching a single
  // overflow placeholder to the parent so the caller sees how many were
  // hidden.
  let emitted = 0;
  let overflowed = false;
  function build(node: RawRow): TreeNode | null {
    if (emitted >= maxNodes) {
      return null;
    }
    emitted += 1;
    const t: TreeNode = {
      name: node.siteName,
      type: normalizeNodeType(node.nodeType),
      mix: node.productMix,
    };
    if (node.cameras > 0) t.cam = node.cameras;
    if (node.acPanels > 0) t.ac = node.acPanels;
    if (node.alarmDevices > 0) t.alarmDev = node.alarmDevices;
    if (node.alarmPanels > 0) t.alarmPan = node.alarmPanels;
    const kids = idx.childrenById.get(node.siteId) ?? [];
    if (kids.length === 0) return t;
    const childNodes: TreeNode[] = [];
    let hiddenAtThisParent = 0;
    for (const k of kids) {
      if (emitted >= maxNodes) {
        hiddenAtThisParent += 1 + countAllDescendants(k.siteId, idx);
        continue;
      }
      const built = build(k);
      if (built) {
        childNodes.push(built);
      }
    }
    if (hiddenAtThisParent > 0) {
      overflowed = true;
      childNodes.push({
        name: `[+${hiddenAtThisParent} more sites]`,
        type: "dead_end",
        note: "Truncated to keep tree readable",
      });
    }
    if (childNodes.length > 0) t.children = childNodes;
    return t;
  }

  const tree = build(root);
  const out: TreeNode[] = tree ? [tree] : [];
  return {
    tree: out,
    totalNodes: overflowed ? maxNodes : totalNodes,
    maxDepth,
    distinctNodeTypes: typeSet.size,
  };
}

function countAllDescendants(id: string, idx: Indexed): number {
  const kids = idx.childrenById.get(id) ?? [];
  let total = kids.length;
  for (const k of kids) {
    total += countAllDescendants(k.siteId, idx);
  }
  return total;
}

function subtreeMetrics(rootId: string, idx: Indexed) {
  const queue: string[] = [rootId];
  let total = 0;
  let maxDepth = 0;
  const types = new Set<string>();
  const startDepth = idx.byId.get(rootId)?.depth ?? 1;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const row = idx.byId.get(id);
    if (!row) continue;
    total += 1;
    const rel = row.depth - startDepth + 1;
    if (rel > maxDepth) maxDepth = rel;
    types.add(normalizeNodeType(row.nodeType));
    const kids = idx.childrenById.get(id) ?? [];
    for (const k of kids) queue.push(k.siteId);
  }
  return { total, maxDepth, distinctNodeTypes: types.size };
}

// Score a candidate root: prefer 4 distinct node types > 3 > 2; prefer deeper
// trees; prefer subtree size 8 to 50, hard penalise size 1 to 3 and >60.
function scoreRoot(rootId: string, idx: Indexed): number {
  const m = subtreeMetrics(rootId, idx);
  let score = 0;
  score += m.distinctNodeTypes * 1000;
  score += m.maxDepth * 200;
  if (m.total >= 8 && m.total <= 50) score += 500;
  else if (m.total >= 4 && m.total <= 80) score += 200;
  else if (m.total <= 2) score -= 500;
  else if (m.total > 100) score -= 250;
  return score;
}

const RATIONALE_BY_SHAPE: Record<RootShape, string> = {
  geographic:
    "Geographic root (state/region/city pattern). Shows how the customer scales by location and what lives under each place.",
  facility_code:
    "Facility-code root (short opaque ID or building code). Internal naming standard, often signals a centralized rollout.",
  function_word:
    "Function-word root (role or purpose, not place). Bucket structure organized by what happens at the site, not where it is.",
  entity_name:
    "Entity-name root (real-world building, school, or clinic name). Single-site or single-campus institution.",
  corporate_tree:
    "Corporate-tree root (business unit, division, or brand). Reflects org-chart structure mapped onto sites.",
  school_code:
    "School-code root (school name plus embedded ID). District naming convention with parallel coding system.",
  lifecycle_marker:
    "Lifecycle-marker root (\"Z-\", \"Staged\", \"Demo\", lifecycle prefix). Retired, holding, or test bucket distinct from active sites.",
};

function buildCustomer(accountName: string, idx: Indexed): CustomerSubtreePayload | null {
  const roots = idx.rootsByAccount.get(accountName) ?? [];
  if (roots.length === 0) return null;

  // Group roots by shape.
  const shapeMap = new Map<RootShape, RawRow[]>();
  for (const r of roots) {
    const shape = inferRootShape(r.siteName);
    const list = shapeMap.get(shape) ?? [];
    list.push(r);
    shapeMap.set(shape, list);
  }

  const totalSites = (() => {
    let n = 0;
    for (const r of roots) {
      n += subtreeMetrics(r.siteId, idx).total;
    }
    return n;
  })();

  // Build the coverage summary first.
  const coverage = Array.from(shapeMap.entries())
    .map(([shape, list]) => ({
      shape,
      shapeLabel: rootShapeLabels[shape],
      rootCount: list.length,
    }))
    .sort((a, b) => b.rootCount - a.rootCount);

  // For every shape present pick the highest-scoring root.
  const reps: RepresentativeSubtree[] = [];
  for (const { shape } of coverage) {
    const candidates = shapeMap.get(shape) ?? [];
    if (candidates.length === 0) continue;
    let bestId: string | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const c of candidates) {
      const s = scoreRoot(c.siteId, idx);
      if (s > bestScore) {
        bestScore = s;
        bestId = c.siteId;
      }
    }
    if (!bestId) continue;
    const m = materializeSubtree(bestId, idx, 60);
    if (m.tree.length === 0) continue;
    const rootRow = idx.byId.get(bestId);
    reps.push({
      rootShape: shape,
      rootShapeLabel: rootShapeLabels[shape],
      rootName: rootRow?.siteName ?? "(unknown)",
      rationale: `${RATIONALE_BY_SHAPE[shape]} ${candidates.length === 1 ? "Only" : candidates.length} root${candidates.length === 1 ? "" : "s"} of this shape across the account; \"${rootRow?.siteName ?? ""}\" is the best illustration of the pattern.`,
      totalNodes: m.totalNodes,
      maxDepth: m.maxDepth,
      distinctNodeTypes: m.distinctNodeTypes,
      subtree: m.tree,
    });
  }

  // Cap at 5 representative subtrees per customer (we have at most 7 shapes
  // but most customers exhibit 2 to 4).
  reps.sort((a, b) => {
    const av = a.distinctNodeTypes * 1000 + a.maxDepth * 100 + (coverage.find((c) => c.shape === a.rootShape)?.rootCount ?? 0);
    const bv = b.distinctNodeTypes * 1000 + b.maxDepth * 100 + (coverage.find((c) => c.shape === b.rootShape)?.rootCount ?? 0);
    return bv - av;
  });
  const capped = reps.slice(0, 5);

  return {
    sfdcAccountName: NAME_MAP[accountName] ?? accountName,
    totalSitesInExtract: totalSites,
    rootCount: roots.length,
    rootShapeCoverage: coverage,
    representativeSubtrees: capped,
  };
}

function main() {
  console.log(`Reading ${RAW}`);
  const rows = loadRows();
  console.log(`  ${rows.length} site rows`);
  const idx = indexRows(rows);
  const accounts = Array.from(idx.rootsByAccount.keys()).sort();
  console.log(`  ${accounts.length} customers`);
  const payload: { customers: CustomerSubtreePayload[]; pulledAt: string } = {
    customers: [],
    pulledAt: new Date().toISOString().slice(0, 10),
  };
  for (const a of accounts) {
    const c = buildCustomer(a, idx);
    if (!c) continue;
    payload.customers.push(c);
    console.log(
      `  ${c.sfdcAccountName}: ${c.rootCount} roots, ${c.rootShapeCoverage.length} shapes, ${c.representativeSubtrees.length} representative subtrees`,
    );
  }
  writeFileSync(OUT, JSON.stringify(payload) + "\n");
  console.log(`Wrote ${OUT}`);
}

main();
