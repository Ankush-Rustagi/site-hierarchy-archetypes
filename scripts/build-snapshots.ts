/**
 * Build population + industry JSON snapshots from the four flat CSV extracts
 * under data/raw/. Reads:
 *   - data/raw/org_metrics.csv
 *   - data/raw/root_names.csv
 *   - data/raw/org_axes.csv
 *   - data/raw/comparison_cohort.csv
 *
 * Emits:
 *   - src/data/population.json
 *   - src/data/industry-matrix.json
 *   - src/data/comparison-cohort.json
 *   - src/data/method-numbers.json
 *
 * Run:  npm run build:snapshots
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArchetypeFamily,
  ARCHETYPE_FAMILIES,
  OrgClassificationInput,
  RootShape,
  ROOT_SHAPES,
  SingleProductCohort,
  hasLifecycleMarkers,
  inferArchetypeFamily,
  inferRootShape,
  isMultiArchetype,
  rootShapeLabels,
  singleProductCohort,
} from "./classifier.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const RAW_DIR = join(REPO_ROOT, "data", "raw");
const OUT_DIR = join(REPO_ROOT, "src", "data");

// -----------------------------------------------------------------------------
// Minimal CSV parser. Handles quoted fields, embedded commas/newlines, "" escapes.

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
      headers.forEach((h, idx) => {
        o[h] = r[idx] ?? "";
      });
      return o;
    });
  return { headers, rows };
}

function readCsv(name: string): Record<string, string>[] {
  const path = join(RAW_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Missing CSV: ${path}. Pull it from Hex first.`);
  }
  const text = readFileSync(path, "utf8");
  return parseCsv(text).rows;
}

function toNum(s: string | undefined): number {
  if (s == null || s === "" || s === "null" || s === "NULL") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function toIntOrNull(s: string | undefined): number | null {
  if (s == null || s === "" || s === "null" || s === "NULL") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function toBool(s: string | undefined): boolean {
  const v = (s ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "t";
}

// -----------------------------------------------------------------------------
// Data shapes

type OrgMetric = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  organizationId: string;
  orgName: string;
  totalSites: number;
  maxDepth: number;
  topLevelNodes: number;
  structural: number;
  mixed: number;
  leafWithDevices: number;
  deadEnd: number;
  productLinesCount: number;
  distinctProductMixes: number;
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
};

type RootNameRow = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  rootName: string;
  siteId: string;
  cameraCount: number;
  acPanelCount: number;
  alarmDeviceCount: number;
  alarmPanelCount: number;
  productMix: string;
};

type OrgAxes = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  industry: string;
  accountSegment: string;
  hqCountry: string;
  lifetimeBookings: number;
  currentArr: number | null;
  accountAgeDays: number | null;
  isEndCustomer: boolean;
  isPartner: boolean;
};

type ComparisonRow = {
  sfdcAccountName: string;
  accountSegment: string;
  industry: string;
  hqCountry: string;
  totalSites: number;
  maxDepth: number;
  productLinesCount: number;
  distinctProductMixes: number;
  lifetimeBookings: number;
  inOriginalTop12: boolean;
};

// -----------------------------------------------------------------------------
// Classified org (org + root shapes + archetype + cohort)

type ClassifiedOrg = OrgMetric & {
  rootShapes: RootShape[];
  archetypeFamily: ArchetypeFamily;
  multiArchetype: boolean;
  lifecycleMarkers: boolean;
  cohort: SingleProductCohort;
  industry: string;
  industryBucket: string;
  accountSegment: string;
  lifetimeBookings: number;
};

// Industry text from SFDC looks like "05 - Manufacturing (31-33)". Roll up
// to coarser buckets that line up with how Verkada GTM talks about verticals.
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

function bucketIndustry(industry: string): string {
  if (!industry) return "Unknown / Other";
  for (const { match, bucket } of INDUSTRY_BUCKETS) {
    if (match.test(industry)) return bucket;
  }
  return "Other";
}

// -----------------------------------------------------------------------------
// Bands

const SIZE_BANDS = [
  { id: "1-2", label: "1-2 sites", min: 1, max: 2 },
  { id: "3-9", label: "3-9 sites", min: 3, max: 9 },
  { id: "10-24", label: "10-24 sites", min: 10, max: 24 },
  { id: "25-100", label: "25-100 sites", min: 25, max: 100 },
  { id: "101-400", label: "101-400 sites", min: 101, max: 400 },
  { id: "401-1K", label: "401-1K sites", min: 401, max: 1000 },
  { id: "1K+", label: "1K+ sites", min: 1001, max: Number.POSITIVE_INFINITY },
];
const BOOKINGS_BANDS = [
  { id: "<10K", label: "Under 10K", min: 0, max: 9_999 },
  { id: "10-50K", label: "10K-50K", min: 10_000, max: 49_999 },
  { id: "50-250K", label: "50K-250K", min: 50_000, max: 249_999 },
  { id: "250K-1M", label: "250K-1M", min: 250_000, max: 999_999 },
  { id: "1M-5M", label: "1M-5M", min: 1_000_000, max: 4_999_999 },
  { id: "5M+", label: "5M+", min: 5_000_000, max: Number.POSITIVE_INFINITY },
];
const DEVICE_BANDS = [
  { id: "1-10", label: "1-10", min: 1, max: 10 },
  { id: "11-50", label: "11-50", min: 11, max: 50 },
  { id: "51-250", label: "51-250", min: 51, max: 250 },
  { id: "251-1K", label: "251-1K", min: 251, max: 1_000 },
  { id: "1K-5K", label: "1K-5K", min: 1_001, max: 5_000 },
  { id: "5K+", label: "5K+", min: 5_001, max: Number.POSITIVE_INFINITY },
  { id: "0", label: "0", min: 0, max: 0 },
];

function bandOf<T extends { id: string; min: number; max: number }>(bands: T[], n: number): string {
  for (const b of bands) {
    if (n >= b.min && n <= b.max) return b.id;
  }
  return bands[bands.length - 1].id;
}

// -----------------------------------------------------------------------------
// Load + classify

function loadOrgMetrics(): OrgMetric[] {
  return readCsv("org_metrics.csv").map((r) => ({
    sfdcAccountId: r.sfdc_account_id,
    sfdcAccountName: r.sfdc_account_name,
    organizationId: r.organization_id,
    orgName: r.org_name,
    totalSites: toNum(r.total_sites),
    maxDepth: toNum(r.max_depth),
    topLevelNodes: toNum(r.top_level_nodes),
    structural: toNum(r.structural),
    mixed: toNum(r.mixed),
    leafWithDevices: toNum(r.leaf_with_devices),
    deadEnd: toNum(r.dead_end),
    productLinesCount: toNum(r.product_lines_count),
    distinctProductMixes: toNum(r.distinct_product_mixes),
    cameras: toNum(r.cameras),
    acPanels: toNum(r.ac_panels),
    alarmDevices: toNum(r.alarm_devices),
    alarmPanels: toNum(r.alarm_panels),
  }));
}

function loadRootNames(): RootNameRow[] {
  return readCsv("root_names.csv").map((r) => ({
    sfdcAccountId: r.sfdc_account_id,
    sfdcAccountName: r.sfdc_account_name,
    rootName: r.root_name,
    siteId: r.site_id,
    cameraCount: toNum(r.camera_count),
    acPanelCount: toNum(r.ac_panel_count),
    alarmDeviceCount: toNum(r.alarm_device_count),
    alarmPanelCount: toNum(r.alarm_panel_count),
    productMix: r.product_mix,
  }));
}

function loadOrgAxes(): Map<string, OrgAxes> {
  const m = new Map<string, OrgAxes>();
  for (const r of readCsv("org_axes.csv")) {
    m.set(r.sfdc_account_id, {
      sfdcAccountId: r.sfdc_account_id,
      sfdcAccountName: r.sfdc_account_name,
      industry: r.industry,
      accountSegment: r.account_segment,
      hqCountry: r.hq_country,
      lifetimeBookings: toNum(r.lifetime_bookings),
      currentArr: toIntOrNull(r.current_arr),
      accountAgeDays: toIntOrNull(r.account_age_days),
      isEndCustomer: toBool(r.is_end_customer),
      isPartner: toBool(r.is_partner),
    });
  }
  return m;
}

function loadComparison(): ComparisonRow[] {
  return readCsv("comparison_cohort.csv").map((r) => ({
    sfdcAccountName: r.sfdc_account_name,
    accountSegment: r.account_segment,
    industry: r.industry,
    hqCountry: r.hq_country,
    totalSites: toNum(r.total_sites),
    maxDepth: toNum(r.max_depth),
    productLinesCount: toNum(r.product_lines_count),
    distinctProductMixes: toNum(r.distinct_product_mixes),
    lifetimeBookings: toNum(r.lifetime_bookings),
    inOriginalTop12: toBool(r.in_original_top12),
  }));
}

function classifyAll(
  metrics: OrgMetric[],
  roots: RootNameRow[],
  axes: Map<string, OrgAxes>,
): ClassifiedOrg[] {
  const rootsByAccount = new Map<string, RootNameRow[]>();
  for (const r of roots) {
    const list = rootsByAccount.get(r.sfdcAccountId) ?? [];
    list.push(r);
    rootsByAccount.set(r.sfdcAccountId, list);
  }
  return metrics.map((m) => {
    const ax = axes.get(m.sfdcAccountId);
    const accountRoots = rootsByAccount.get(m.sfdcAccountId) ?? [];
    const shapes = accountRoots.map((r) => inferRootShape(r.rootName));
    const distinct = Array.from(new Set(shapes));
    const input: OrgClassificationInput = {
      totalSites: m.totalSites,
      maxDepth: m.maxDepth,
      topLevelNodes: m.topLevelNodes,
      structural: m.structural,
      mixed: m.mixed,
      leafWithDevices: m.leafWithDevices,
      deadEnd: m.deadEnd,
      cameras: m.cameras,
      acPanels: m.acPanels,
      alarmDevices: m.alarmDevices,
      alarmPanels: m.alarmPanels,
      productLinesCount: m.productLinesCount,
      distinctProductMixes: m.distinctProductMixes,
      rootShapes: shapes,
    };
    const family = inferArchetypeFamily(input);
    const cohort = singleProductCohort({
      cameras: m.cameras,
      acPanels: m.acPanels,
      alarmDevices: m.alarmDevices,
      alarmPanels: m.alarmPanels,
    });
    const industry = ax?.industry ?? "";
    return {
      ...m,
      rootShapes: shapes,
      archetypeFamily: family,
      multiArchetype: isMultiArchetype(shapes),
      lifecycleMarkers: hasLifecycleMarkers(shapes),
      cohort,
      industry,
      industryBucket: bucketIndustry(industry),
      accountSegment: ax?.accountSegment ?? "",
      lifetimeBookings: ax?.lifetimeBookings ?? 0,
    };
  });
}

// -----------------------------------------------------------------------------
// Aggregations

type ArchetypeShares = Record<ArchetypeFamily, { count: number; share: number }>;

function emptyShares(): ArchetypeShares {
  const o: Partial<ArchetypeShares> = {};
  for (const f of ARCHETYPE_FAMILIES) o[f] = { count: 0, share: 0 };
  return o as ArchetypeShares;
}

function archetypeFrequencies(orgs: ClassifiedOrg[]): {
  total: number;
  shares: ArchetypeShares;
  multiArchetypeRate: number;
  lifecycleMarkerRate: number;
  cohortCounts: Record<SingleProductCohort, number>;
} {
  const total = orgs.length;
  const shares = emptyShares();
  let multi = 0;
  let lifecycle = 0;
  const cohortCounts: Record<SingleProductCohort, number> = {
    cameras_only: 0,
    access_only: 0,
    alarms_only: 0,
    multi_product: 0,
  };
  for (const o of orgs) {
    shares[o.archetypeFamily].count += 1;
    if (o.multiArchetype) multi++;
    if (o.lifecycleMarkers) lifecycle++;
    cohortCounts[o.cohort] += 1;
  }
  for (const f of ARCHETYPE_FAMILIES) {
    shares[f].share = total > 0 ? shares[f].count / total : 0;
  }
  return {
    total,
    shares,
    multiArchetypeRate: total > 0 ? multi / total : 0,
    lifecycleMarkerRate: total > 0 ? lifecycle / total : 0,
    cohortCounts,
  };
}

function rootShapeCoverage(orgs: ClassifiedOrg[]): { shape: RootShape; orgs: number; share: number; label: string }[] {
  const total = orgs.length;
  return ROOT_SHAPES.map((shape) => {
    const count = orgs.filter((o) => o.rootShapes.includes(shape)).length;
    return { shape, orgs: count, share: total > 0 ? count / total : 0, label: rootShapeLabels[shape] };
  }).sort((a, b) => b.orgs - a.orgs);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type MatrixCell = {
  industry: string;
  sizeBand: string;
  bookingsBand: string;
  deviceBand: string;
  orgCount: number;
  archetypeShares: Record<ArchetypeFamily, number>;
  multiArchetypeRate: number;
  medianMaxDepth: number;
  medianProductMixes: number;
  medianCameras: number;
  medianBookings: number;
};

function totalDevices(o: ClassifiedOrg): number {
  return o.cameras + o.acPanels + o.alarmDevices + o.alarmPanels;
}

function buildMatrix(orgs: ClassifiedOrg[]): MatrixCell[] {
  const cells = new Map<string, ClassifiedOrg[]>();
  for (const o of orgs) {
    const key = [
      o.industryBucket,
      bandOf(SIZE_BANDS, o.totalSites),
      bandOf(BOOKINGS_BANDS, o.lifetimeBookings),
      bandOf(DEVICE_BANDS, totalDevices(o)),
    ].join("|");
    const list = cells.get(key) ?? [];
    list.push(o);
    cells.set(key, list);
  }
  const out: MatrixCell[] = [];
  for (const [key, members] of cells) {
    const [industry, sizeBand, bookingsBand, deviceBand] = key.split("|");
    const counts = emptyShares();
    for (const m of members) counts[m.archetypeFamily].count += 1;
    const shares: Record<ArchetypeFamily, number> = {} as Record<ArchetypeFamily, number>;
    for (const f of ARCHETYPE_FAMILIES) shares[f] = members.length > 0 ? counts[f].count / members.length : 0;
    const multi = members.filter((m) => m.multiArchetype).length;
    out.push({
      industry,
      sizeBand,
      bookingsBand,
      deviceBand,
      orgCount: members.length,
      archetypeShares: shares,
      multiArchetypeRate: members.length > 0 ? multi / members.length : 0,
      medianMaxDepth: median(members.map((m) => m.maxDepth)),
      medianProductMixes: median(members.map((m) => m.distinctProductMixes)),
      medianCameras: median(members.map((m) => m.cameras)),
      medianBookings: median(members.map((m) => m.lifetimeBookings)),
    });
  }
  return out.sort((a, b) => b.orgCount - a.orgCount);
}

function industryRollup(orgs: ClassifiedOrg[]): {
  industry: string;
  orgCount: number;
  archetypeShares: Record<ArchetypeFamily, number>;
  modalArchetype: ArchetypeFamily;
  modalShare: number;
  entropy: number;
  multiArchetypeRate: number;
  medianSites: number;
  medianCameras: number;
  medianBookings: number;
  examples: { archetype: ArchetypeFamily; orgName: string; totalSites: number; cameras: number }[];
}[] {
  const byInd = new Map<string, ClassifiedOrg[]>();
  for (const o of orgs) {
    const list = byInd.get(o.industryBucket) ?? [];
    list.push(o);
    byInd.set(o.industryBucket, list);
  }
  const out: ReturnType<typeof industryRollup> = [];
  for (const [industry, members] of byInd) {
    const counts = emptyShares();
    for (const m of members) counts[m.archetypeFamily].count += 1;
    const shares: Record<ArchetypeFamily, number> = {} as Record<ArchetypeFamily, number>;
    for (const f of ARCHETYPE_FAMILIES) shares[f] = members.length > 0 ? counts[f].count / members.length : 0;
    let modal: ArchetypeFamily = ARCHETYPE_FAMILIES[0];
    let modalShare = -1;
    for (const f of ARCHETYPE_FAMILIES) {
      if (shares[f] > modalShare) {
        modalShare = shares[f];
        modal = f;
      }
    }
    let entropy = 0;
    for (const f of ARCHETYPE_FAMILIES) {
      const p = shares[f];
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const multi = members.filter((m) => m.multiArchetype).length;
    const examples: ReturnType<typeof industryRollup>[number]["examples"] = [];
    const seen = new Set<ArchetypeFamily>();
    const sortedByBookings = members.slice().sort((a, b) => b.lifetimeBookings - a.lifetimeBookings);
    for (const m of sortedByBookings) {
      if (seen.has(m.archetypeFamily)) continue;
      seen.add(m.archetypeFamily);
      examples.push({
        archetype: m.archetypeFamily,
        orgName: m.sfdcAccountName,
        totalSites: m.totalSites,
        cameras: m.cameras,
      });
      if (examples.length >= 6) break;
    }
    out.push({
      industry,
      orgCount: members.length,
      archetypeShares: shares,
      modalArchetype: modal,
      modalShare,
      entropy,
      multiArchetypeRate: members.length > 0 ? multi / members.length : 0,
      medianSites: median(members.map((m) => m.totalSites)),
      medianCameras: median(members.map((m) => m.cameras)),
      medianBookings: median(members.map((m) => m.lifetimeBookings)),
      examples,
    });
  }
  return out.sort((a, b) => b.orgCount - a.orgCount);
}

function crossIndustrySimilarity(rollup: ReturnType<typeof industryRollup>): {
  a: string;
  aSizeBand: string;
  b: string;
  bSizeBand: string;
  similarity: number;
  sharedModal: ArchetypeFamily;
}[] {
  // Use industry-level archetype share vectors (size-band cuts kept separately
  // in the matrix). Surface top cross-pairs by cosine similarity.
  function vec(r: typeof rollup[number]): number[] {
    return ARCHETYPE_FAMILIES.map((f) => r.archetypeShares[f]);
  }
  function cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  const candidates = rollup.filter((r) => r.orgCount >= 50);
  const pairs: {
    a: string;
    aSizeBand: string;
    b: string;
    bSizeBand: string;
    similarity: number;
    sharedModal: ArchetypeFamily;
  }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const sim = cosine(vec(a), vec(b));
      pairs.push({
        a: a.industry,
        aSizeBand: "all",
        b: b.industry,
        bSizeBand: "all",
        similarity: sim,
        sharedModal: a.modalArchetype === b.modalArchetype ? a.modalArchetype : a.modalArchetype,
      });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, 15);
}

// -----------------------------------------------------------------------------
// Main

function main() {
  console.log("Loading CSVs from", RAW_DIR);
  const metrics = loadOrgMetrics();
  const roots = loadRootNames();
  const axes = loadOrgAxes();
  const comparison = loadComparison();
  console.log(`  org_metrics:        ${metrics.length} rows`);
  console.log(`  root_names:         ${roots.length} rows`);
  console.log(`  org_axes:           ${axes.size} rows`);
  console.log(`  comparison_cohort:  ${comparison.length} rows`);

  const classified = classifyAll(metrics, roots, axes);
  console.log(`Classified ${classified.length} orgs`);

  const complexSubset = classified.filter(
    (o) => o.maxDepth >= 3 && o.productLinesCount >= 3 && o.distinctProductMixes >= 3,
  );
  console.log(`Complex subset (max_depth≥3, product_lines≥3, mixes≥3): ${complexSubset.length} orgs`);

  // Method numbers — population at each gate.
  const methodNumbers = {
    totalActivePaid: classified.length,
    sitesGteOne: classified.filter((o) => o.totalSites >= 1).length,
    sitesGteThree: classified.filter((o) => o.totalSites >= 3).length,
    maxDepthGteThree: classified.filter((o) => o.maxDepth >= 3).length,
    productLinesGteThree: classified.filter((o) => o.productLinesCount >= 3).length,
    complexGate: complexSubset.length,
    cameraOnly: classified.filter((o) => o.cohort === "cameras_only").length,
    accessOnly: classified.filter((o) => o.cohort === "access_only").length,
    alarmsOnly: classified.filter((o) => o.cohort === "alarms_only").length,
    multiProduct: classified.filter((o) => o.cohort === "multi_product").length,
    pulledAt: new Date().toISOString().slice(0, 10),
  };

  const populationFreq = archetypeFrequencies(classified);
  const complexFreq = archetypeFrequencies(complexSubset);
  const rootCoveragePop = rootShapeCoverage(classified);
  const rootCoverageComplex = rootShapeCoverage(complexSubset);

  const cohortBreakdowns: Record<SingleProductCohort, ReturnType<typeof archetypeFrequencies>> = {
    cameras_only: archetypeFrequencies(classified.filter((o) => o.cohort === "cameras_only")),
    access_only: archetypeFrequencies(classified.filter((o) => o.cohort === "access_only")),
    alarms_only: archetypeFrequencies(classified.filter((o) => o.cohort === "alarms_only")),
    multi_product: archetypeFrequencies(classified.filter((o) => o.cohort === "multi_product")),
  };

  const population = {
    methodNumbers,
    population: {
      total: populationFreq.total,
      archetypeShares: populationFreq.shares,
      multiArchetypeRate: populationFreq.multiArchetypeRate,
      lifecycleMarkerRate: populationFreq.lifecycleMarkerRate,
      rootShapeCoverage: rootCoveragePop,
    },
    complexSubset: {
      total: complexFreq.total,
      archetypeShares: complexFreq.shares,
      multiArchetypeRate: complexFreq.multiArchetypeRate,
      lifecycleMarkerRate: complexFreq.lifecycleMarkerRate,
      rootShapeCoverage: rootCoverageComplex,
    },
    cohortBreakdowns,
  };

  const matrix = buildMatrix(classified);
  const rollup = industryRollup(classified);
  const crossSim = crossIndustrySimilarity(rollup);

  const industryMatrix = {
    industryRollup: rollup,
    matrix,
    crossIndustrySimilarity: crossSim,
  };

  const comparisonOut = {
    cohort: comparison,
    originalTop12: comparison.filter((c) => c.inOriginalTop12).length,
    enterpriseMissed: comparison.filter((c) => !c.inOriginalTop12 && c.totalSites > 400).length,
    total: comparison.length,
  };

  writeFileSync(join(OUT_DIR, "population.json"), JSON.stringify(population) + "\n");
  writeFileSync(join(OUT_DIR, "industry-matrix.json"), JSON.stringify(industryMatrix) + "\n");
  writeFileSync(join(OUT_DIR, "comparison-cohort.json"), JSON.stringify(comparisonOut) + "\n");
  writeFileSync(join(OUT_DIR, "method-numbers.json"), JSON.stringify(methodNumbers) + "\n");

  console.log("Wrote src/data/population.json");
  console.log("Wrote src/data/industry-matrix.json");
  console.log("Wrote src/data/comparison-cohort.json");
  console.log("Wrote src/data/method-numbers.json");
}

main();
