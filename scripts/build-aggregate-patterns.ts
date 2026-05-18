/**
 * Build src/data/aggregate-patterns.json.
 *
 * This snapshot replaces the population.json + industry-matrix.json story.
 * The new framing: most active paid orgs are simple (camera-only flat); we
 * surface that as a single callout and then spend the rest of the view on
 * the complex tail (top quintile of (max_depth + product_lines_count +
 * log10(lifetime_bookings))). For the complex tail we slice by bookings
 * band, by industry, and as an industry x bookings matrix.
 *
 * Run:  npm run build:aggregate
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
const RAW = join(REPO_ROOT, "data", "raw");
const OUT = join(REPO_ROOT, "src", "data", "aggregate-patterns.json");

// --- CSV parser (same minimal one used elsewhere) ---
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

function readCsv(name: string): Record<string, string>[] {
  const p = join(RAW, name);
  if (!existsSync(p)) throw new Error(`Missing ${p}`);
  return parseCsv(readFileSync(p, "utf8")).rows;
}

function toNum(s: string | undefined): number {
  if (!s || s === "null" || s === "NULL") return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}
function toBool(s: string | undefined): boolean {
  const v = (s ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "t";
}

// --- Data shapes ---
type OrgRow = {
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

type RootRow = {
  sfdcAccountId: string;
  rootName: string;
};

type AxesRow = {
  sfdcAccountId: string;
  industry: string;
  accountSegment: string;
  hqCountry: string;
  lifetimeBookings: number;
};

type ClassifiedOrg = OrgRow & {
  rootShapes: RootShape[];
  archetypeFamily: ArchetypeFamily;
  multiArchetype: boolean;
  lifecycleMarkers: boolean;
  cohort: SingleProductCohort;
  industry: string;
  industryBucket: string;
  accountSegment: string;
  lifetimeBookings: number;
  complexityScore: number;
};

// --- Industry bucketing (same as build-snapshots) ---
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

// --- Bookings bands ---
const BOOKINGS_BANDS = [
  { id: "<10K", label: "Under $10K", min: 0, max: 9_999 },
  { id: "10-50K", label: "$10K-50K", min: 10_000, max: 49_999 },
  { id: "50-250K", label: "$50K-250K", min: 50_000, max: 249_999 },
  { id: "250K-1M", label: "$250K-1M", min: 250_000, max: 999_999 },
  { id: "1M-5M", label: "$1M-5M", min: 1_000_000, max: 4_999_999 },
  { id: "5M+", label: "$5M+", min: 5_000_000, max: Number.POSITIVE_INFINITY },
];
function bandOf(n: number): string {
  for (const b of BOOKINGS_BANDS) if (n >= b.min && n <= b.max) return b.id;
  return BOOKINGS_BANDS[BOOKINGS_BANDS.length - 1].id;
}

// --- Loaders ---
function loadOrgs(): OrgRow[] {
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
function loadRoots(): RootRow[] {
  return readCsv("root_names.csv").map((r) => ({
    sfdcAccountId: r.sfdc_account_id,
    rootName: r.root_name,
  }));
}
function loadAxes(): Map<string, AxesRow> {
  const m = new Map<string, AxesRow>();
  for (const r of readCsv("org_axes.csv")) {
    m.set(r.sfdc_account_id, {
      sfdcAccountId: r.sfdc_account_id,
      industry: r.industry,
      accountSegment: r.account_segment,
      hqCountry: r.hq_country,
      lifetimeBookings: toNum(r.lifetime_bookings),
    });
  }
  return m;
}

// --- Classification ---
function classifyAll(orgs: OrgRow[], roots: RootRow[], axes: Map<string, AxesRow>): ClassifiedOrg[] {
  const rootsByAccount = new Map<string, RootRow[]>();
  for (const r of roots) {
    const list = rootsByAccount.get(r.sfdcAccountId) ?? [];
    list.push(r);
    rootsByAccount.set(r.sfdcAccountId, list);
  }
  return orgs.map((m) => {
    const ax = axes.get(m.sfdcAccountId);
    const accountRoots = rootsByAccount.get(m.sfdcAccountId) ?? [];
    const shapes = accountRoots.map((r) => inferRootShape(r.rootName));
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
    const lifetimeBookings = ax?.lifetimeBookings ?? 0;
    const complexityScore =
      m.maxDepth + m.productLinesCount + (lifetimeBookings > 1 ? Math.log10(lifetimeBookings) : 0);
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
      lifetimeBookings,
      complexityScore,
    };
  });
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function median(nums: number[]): number {
  return quantile(nums, 0.5);
}

type ArchetypeShares = Record<ArchetypeFamily, { count: number; share: number; bookings: number; bookingsShare: number }>;
function emptyShares(): ArchetypeShares {
  const o: Partial<ArchetypeShares> = {};
  for (const f of ARCHETYPE_FAMILIES) o[f] = { count: 0, share: 0, bookings: 0, bookingsShare: 0 };
  return o as ArchetypeShares;
}
function archetypeShares(orgs: ClassifiedOrg[]): ArchetypeShares {
  const total = orgs.length;
  const totalBookings = orgs.reduce((s, o) => s + o.lifetimeBookings, 0);
  const out = emptyShares();
  for (const o of orgs) {
    out[o.archetypeFamily].count += 1;
    out[o.archetypeFamily].bookings += o.lifetimeBookings;
  }
  for (const f of ARCHETYPE_FAMILIES) {
    out[f].share = total > 0 ? out[f].count / total : 0;
    out[f].bookingsShare = totalBookings > 0 ? out[f].bookings / totalBookings : 0;
  }
  return out;
}

function rootShapeCoverage(orgs: ClassifiedOrg[]) {
  const total = orgs.length;
  return ROOT_SHAPES.map((shape) => {
    const matched = orgs.filter((o) => o.rootShapes.includes(shape));
    const bookings = matched.reduce((s, o) => s + o.lifetimeBookings, 0);
    return {
      shape,
      shapeLabel: rootShapeLabels[shape],
      orgs: matched.length,
      orgShare: total > 0 ? matched.length / total : 0,
      bookings,
    };
  }).sort((a, b) => b.orgs - a.orgs);
}

// --- Main aggregation ---
function main() {
  console.log("Loading...");
  const orgs = loadOrgs();
  const roots = loadRoots();
  const axes = loadAxes();
  console.log(`  ${orgs.length} orgs, ${roots.length} root rows, ${axes.size} axes rows`);

  const classified = classifyAll(orgs, roots, axes);
  const totalOrgs = classified.length;
  const totalBookings = classified.reduce((s, o) => s + o.lifetimeBookings, 0);

  // --- Complexity cutoff (top quintile) ---
  const cutoff = quantile(classified.map((o) => o.complexityScore), 0.8);
  const complex = classified.filter((o) => o.complexityScore >= cutoff);
  const complexBookings = complex.reduce((s, o) => s + o.lifetimeBookings, 0);

  // --- Simple base callout: camera-only flat archetype family ---
  const cameraFlat = classified.filter((o) => o.archetypeFamily === "camera_only_flat");
  const cameraFlatBookings = cameraFlat.reduce((s, o) => s + o.lifetimeBookings, 0);

  // Camera-only flat broken out by bookings band: for each band give the
  // count and bookings of camera-only-flat orgs and the share within that
  // band so the reader sees that even at the small-bookings end, this is
  // overwhelmingly the dominant pattern.
  const cameraFlatByBand = BOOKINGS_BANDS.map((b) => {
    const inBand = classified.filter((o) => bandOf(o.lifetimeBookings) === b.id);
    const cf = inBand.filter((o) => o.archetypeFamily === "camera_only_flat");
    const bandBookings = inBand.reduce((s, o) => s + o.lifetimeBookings, 0);
    const cfBookings = cf.reduce((s, o) => s + o.lifetimeBookings, 0);
    return {
      band: b.id,
      bandLabel: b.label,
      totalOrgsInBand: inBand.length,
      cameraFlatOrgs: cf.length,
      cameraFlatOrgShareOfBand: inBand.length > 0 ? cf.length / inBand.length : 0,
      cameraFlatBookings: cfBookings,
      cameraFlatBookingsShareOfBand: bandBookings > 0 ? cfBookings / bandBookings : 0,
    };
  });

  // Also collapse all "simple" patterns (camera-only-flat + flat-fleet with
  // 1 product line) for a fuller "low-complexity" callout. Score < median is
  // what we treat as "simple by composite score" for the secondary callout.
  const median50 = quantile(classified.map((o) => o.complexityScore), 0.5);
  const simpleByScore = classified.filter((o) => o.complexityScore < median50);
  const simpleByScoreBookings = simpleByScore.reduce((s, o) => s + o.lifetimeBookings, 0);

  // --- Complex tail composition ---
  const complexArchetypeShares = archetypeShares(complex);
  const complexRootCoverage = rootShapeCoverage(complex);

  const complexByBand = BOOKINGS_BANDS.map((b) => {
    const inBand = complex.filter((o) => bandOf(o.lifetimeBookings) === b.id);
    const bandBookings = inBand.reduce((s, o) => s + o.lifetimeBookings, 0);
    return {
      band: b.id,
      bandLabel: b.label,
      orgs: inBand.length,
      bookings: bandBookings,
      bookingsShareOfComplex: complexBookings > 0 ? bandBookings / complexBookings : 0,
      orgShareOfComplex: complex.length > 0 ? inBand.length / complex.length : 0,
      archetypeShares: archetypeShares(inBand),
      medianMaxDepth: median(inBand.map((o) => o.maxDepth)),
      medianProductMixes: median(inBand.map((o) => o.distinctProductMixes)),
      medianTotalSites: median(inBand.map((o) => o.totalSites)),
      medianCameras: median(inBand.map((o) => o.cameras)),
    };
  }).filter((b) => b.orgs > 0);

  // Industry rollup scoped to complex tail.
  type Example = { archetype: ArchetypeFamily; orgName: string; totalSites: number; cameras: number; bookings: number };
  type IndustryRollupRow = {
    industry: string;
    orgs: number;
    bookings: number;
    bookingsShareOfComplex: number;
    archetypeShares: ArchetypeShares;
    modalArchetype: ArchetypeFamily;
    modalShare: number;
    entropy: number;
    multiArchetypeRate: number;
    medianSites: number;
    medianMaxDepth: number;
    medianBookings: number;
    examples: Example[];
  };

  const byInd = new Map<string, ClassifiedOrg[]>();
  for (const o of complex) {
    const list = byInd.get(o.industryBucket) ?? [];
    list.push(o);
    byInd.set(o.industryBucket, list);
  }
  const industryRollup: IndustryRollupRow[] = [];
  for (const [industry, members] of byInd) {
    const shares = archetypeShares(members);
    let modal: ArchetypeFamily = ARCHETYPE_FAMILIES[0];
    let modalShare = -1;
    for (const f of ARCHETYPE_FAMILIES) {
      if (shares[f].share > modalShare) {
        modalShare = shares[f].share;
        modal = f;
      }
    }
    let entropy = 0;
    for (const f of ARCHETYPE_FAMILIES) {
      const p = shares[f].share;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const multi = members.filter((m) => m.multiArchetype).length;
    const examples: Example[] = [];
    const seen = new Set<ArchetypeFamily>();
    const ranked = members.slice().sort((a, b) => b.lifetimeBookings - a.lifetimeBookings);
    for (const m of ranked) {
      if (seen.has(m.archetypeFamily)) continue;
      seen.add(m.archetypeFamily);
      examples.push({
        archetype: m.archetypeFamily,
        orgName: m.sfdcAccountName,
        totalSites: m.totalSites,
        cameras: m.cameras,
        bookings: m.lifetimeBookings,
      });
      if (examples.length >= 6) break;
    }
    const bookings = members.reduce((s, m) => s + m.lifetimeBookings, 0);
    industryRollup.push({
      industry,
      orgs: members.length,
      bookings,
      bookingsShareOfComplex: complexBookings > 0 ? bookings / complexBookings : 0,
      archetypeShares: shares,
      modalArchetype: modal,
      modalShare,
      entropy,
      multiArchetypeRate: members.length > 0 ? multi / members.length : 0,
      medianSites: median(members.map((m) => m.totalSites)),
      medianMaxDepth: median(members.map((m) => m.maxDepth)),
      medianBookings: median(members.map((m) => m.lifetimeBookings)),
      examples,
    });
  }
  industryRollup.sort((a, b) => b.bookings - a.bookings);

  // Industry x bookings band matrix (complex tail only). Cell < 5 orgs is
  // dropped for sample-size reasons but we still emit the cell so the view
  // can show "sample too small" where useful.
  type MatrixCell = {
    industry: string;
    band: string;
    bandLabel: string;
    orgs: number;
    bookings: number;
    modalArchetype: ArchetypeFamily | null;
    modalShare: number;
    multiArchetypeRate: number;
    medianMaxDepth: number;
  };
  const matrix: MatrixCell[] = [];
  for (const r of industryRollup) {
    const indMembers = byInd.get(r.industry) ?? [];
    for (const b of BOOKINGS_BANDS) {
      const cellMembers = indMembers.filter((m) => bandOf(m.lifetimeBookings) === b.id);
      if (cellMembers.length === 0) continue;
      const shares = archetypeShares(cellMembers);
      let modal: ArchetypeFamily | null = null;
      let modalShare = -1;
      for (const f of ARCHETYPE_FAMILIES) {
        if (shares[f].share > modalShare) {
          modalShare = shares[f].share;
          modal = f;
        }
      }
      const multi = cellMembers.filter((m) => m.multiArchetype).length;
      matrix.push({
        industry: r.industry,
        band: b.id,
        bandLabel: b.label,
        orgs: cellMembers.length,
        bookings: cellMembers.reduce((s, m) => s + m.lifetimeBookings, 0),
        modalArchetype: modal,
        modalShare,
        multiArchetypeRate: cellMembers.length > 0 ? multi / cellMembers.length : 0,
        medianMaxDepth: median(cellMembers.map((m) => m.maxDepth)),
      });
    }
  }

  // Top-N highest-bookings complex orgs as a teaser table (anonymise? no -
  // these are SFDC names already used in the 12-customer deep dives).
  const topComplexOrgs = complex
    .slice()
    .sort((a, b) => b.lifetimeBookings - a.lifetimeBookings)
    .slice(0, 20)
    .map((o) => ({
      sfdcAccountName: o.sfdcAccountName,
      industry: o.industryBucket,
      bookings: o.lifetimeBookings,
      totalSites: o.totalSites,
      maxDepth: o.maxDepth,
      productLines: o.productLinesCount,
      distinctProductMixes: o.distinctProductMixes,
      archetype: o.archetypeFamily,
      complexityScore: Number(o.complexityScore.toFixed(2)),
    }));

  const payload = {
    pulledAt: new Date().toISOString().slice(0, 10),
    totals: {
      totalOrgs,
      totalBookings,
      complexityCutoffScore: Number(cutoff.toFixed(2)),
      complexTailSize: complex.length,
      complexTailBookings: complexBookings,
      complexTailOrgShare: totalOrgs > 0 ? complex.length / totalOrgs : 0,
      complexTailBookingsShare: totalBookings > 0 ? complexBookings / totalBookings : 0,
    },
    simpleBase: {
      cameraOnlyFlat: {
        orgs: cameraFlat.length,
        orgShare: totalOrgs > 0 ? cameraFlat.length / totalOrgs : 0,
        bookings: cameraFlatBookings,
        bookingsShare: totalBookings > 0 ? cameraFlatBookings / totalBookings : 0,
        medianBookings: median(cameraFlat.map((o) => o.lifetimeBookings)),
        byBookingBand: cameraFlatByBand,
      },
      simpleByScore: {
        orgs: simpleByScore.length,
        orgShare: totalOrgs > 0 ? simpleByScore.length / totalOrgs : 0,
        bookings: simpleByScoreBookings,
        bookingsShare: totalBookings > 0 ? simpleByScoreBookings / totalBookings : 0,
        scoreThreshold: Number(median50.toFixed(2)),
      },
    },
    complexTail: {
      size: complex.length,
      bookings: complexBookings,
      medianBookings: median(complex.map((o) => o.lifetimeBookings)),
      medianTotalSites: median(complex.map((o) => o.totalSites)),
      medianMaxDepth: median(complex.map((o) => o.maxDepth)),
      archetypeShares: complexArchetypeShares,
      rootShapeCoverage: complexRootCoverage,
      multiArchetypeRate: complex.length > 0 ? complex.filter((o) => o.multiArchetype).length / complex.length : 0,
      byBookingBand: complexByBand,
      industryRollup,
      industryByBookingBand: matrix,
      topComplexOrgs,
    },
  };

  writeFileSync(OUT, JSON.stringify(payload) + "\n");
  console.log(`Wrote ${OUT}`);
  console.log(
    `  total orgs: ${totalOrgs.toLocaleString()} | total bookings: $${Math.round(totalBookings / 1_000_000).toLocaleString()}M`,
  );
  console.log(
    `  complexity cutoff (top-quintile): ${cutoff.toFixed(2)} -> ${complex.length.toLocaleString()} complex orgs (${((complex.length / totalOrgs) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  complex-tail bookings: $${Math.round(complexBookings / 1_000_000).toLocaleString()}M (${((complexBookings / totalBookings) * 100).toFixed(1)}% of population)`,
  );
  console.log(
    `  camera-only-flat: ${cameraFlat.length.toLocaleString()} orgs (${((cameraFlat.length / totalOrgs) * 100).toFixed(1)}%), $${Math.round(cameraFlatBookings / 1_000_000).toLocaleString()}M bookings (${((cameraFlatBookings / totalBookings) * 100).toFixed(1)}%)`,
  );
}

main();
