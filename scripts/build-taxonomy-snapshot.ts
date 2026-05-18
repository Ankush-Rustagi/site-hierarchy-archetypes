/**
 * Build src/data/taxonomy.json from data/raw/complex_tail_subtrees.csv.
 *
 * Output schema (designed for direct UI consumption):
 *
 *   {
 *     pulledAt: "YYYY-MM-DD",
 *     totalNodes: 151713,
 *     totalOrgs: 6282,
 *     topShapes: TopShape[],
 *     subCodes: { subCode: { label, topShape } }[],
 *
 *     overall: {
 *       byDepth: {                       // depth -> distributions
 *         "1": { totalNodes, topShape: {<shape>: share}, subCode: {<sub>: share} },
 *         "2": { ... }, ...
 *       },
 *       allDepths: { topShape, subCode }, // aggregated across all depths
 *     },
 *
 *     byIndustry: {
 *       "K-12": {
 *         orgs: 1641,
 *         totalNodes: 14982,
 *         allDepths: { topShape, subCode },
 *         byDepth: { ... },              // same structure as overall.byDepth
 *         distinctiveSubCodes: [          // sub-codes that over-index vs
 *           { sub, share, vsOverallRatio } // overall (descending)
 *         ],
 *       },
 *       ...
 *     },
 *
 *     perOrgComposition: [                // top complex orgs by bookings
 *       {
 *         sfdcAccountId, sfdcAccountName, industry, bookings, totalSites, maxDepth,
 *         depth1Composition: { topShape: {<shape>: share}, subCode: {<sub>: share} },
 *         allDepthsComposition: { topShape, subCode },
 *       },
 *       ...
 *     ],
 *   }
 *
 * No model, no sampling: pure counts over the materialised hierarchy CSV.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyNodeName,
  detectCompoundPattern,
  qualifierFamilyLabels,
  TopShape,
  TOP_SHAPES,
  SubCode,
  topShapeLabels,
  subCodeLabels,
  subCodeToTopShape,
  type CompoundPattern,
  type QualifierFamily,
} from "./classifier.ts";
import { classifySubSegment, segmentsFor, SUB_SEGMENTERS } from "./subsegments.ts";

const __filename = fileURLToPath(import.meta.url);
const REPO = join(dirname(__filename), "..");
const RAW = join(REPO, "data", "raw");
const OUT = join(REPO, "src", "data", "taxonomy.json");

function parseCsv(text: string): Record<string, string>[] {
  const out: string[][] = [];
  let f = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else inQ = false; }
      else f += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); out.push(row); row = []; f = ""; }
      else if (c === "\r") {}
      else f += c;
    }
  }
  if (f.length > 0 || row.length > 0) { row.push(f); out.push(row); }
  const h = out[0] ?? [];
  return out
    .slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
}

// Industry bucketing. SFDC industry strings have the form
// "NN - Label (SIC code)" where NN is the leading sequence number. The
// trailing (SIC code) is the canonical anchor; the previous version of
// this list used loose `\b<digit><digit>\b` regexes that matched inside
// other industries' SIC codes (e.g. `11\b` matched the "(11)" trailing
// the Agriculture string but ALSO matched the "(6111)" inside K-12 if
// the iteration order was different).  We now anchor on the parenthesised
// SIC code at the end of the string, which is unique.
const INDUSTRY_BUCKETS: { match: RegExp; bucket: string }[] = [
  { match: /\(6111\)/i, bucket: "K-12" },
  // Higher Ed SFDC string is "(6112, 6113, 6114)" -- a comma-separated SIC
  // list. Match any of the three codes anywhere inside parens.
  { match: /\(6112,? ?6113,? ?6114\)/i, bucket: "Higher Ed" },
  { match: /\(61 except 6111[^)]*\)/i, bucket: "Trade Schools & Other Ed" },
  { match: /\(62\)/i, bucket: "Healthcare" },
  { match: /\(31-33\)/i, bucket: "Manufacturing" },
  { match: /\(44-45\)/i, bucket: "Retail" },
  { match: /\(48-49\)/i, bucket: "Transportation & Logistics" },
  { match: /\(22\)/i, bucket: "Utilities" },
  { match: /\(92\)/i, bucket: "Government" },
  { match: /\(23\)/i, bucket: "Construction" },
  { match: /\(11\)/i, bucket: "Agriculture" },
  { match: /\(53\)/i, bucket: "Real Estate" },
  { match: /\(52\)/i, bucket: "Financial Services" },
  { match: /\(54\)/i, bucket: "Professional Services" },
  { match: /\(51\)/i, bucket: "Tech & Information" },
  { match: /\(813\)/i, bucket: "Nonprofit & Civic" },
  { match: /\(72\)/i, bucket: "Hospitality" },
  { match: /\(42\)/i, bucket: "Wholesale" },
  { match: /\(71\)/i, bucket: "Arts & Entertainment" },
  { match: /\(21\)/i, bucket: "Energy & Mining" },
  // "21 - Other (55, 56, 81 except 813)" -- catch the multi-SIC pattern
  { match: /\(55, 56, 81[^)]*\)/i, bucket: "Admin & Support" },
];
function bucketIndustry(s: string): string {
  if (!s) return "Unknown / Other";
  for (const { match, bucket } of INDUSTRY_BUCKETS) if (match.test(s)) return bucket;
  return "Other";
}

// Vertical groups: composites that GTM teams talk about as a unit. Each
// industry can belong to at most one group. Industries without a group
// are surfaced as standalone cards.
const VERTICAL_GROUPS: { group: string; members: string[]; description: string }[] = [
  {
    group: "Education",
    members: ["K-12", "Higher Ed", "Trade Schools & Other Ed"],
    description:
      "Combined education vertical. K-12 and Higher Ed have distinct naming fingerprints (K-12 is function-heavy because every site is named for the school it is; Higher Ed is spatial-heavy with building letters, floors, and parking taking over), but they share a GTM motion and benefit from being read together.",
  },
  {
    group: "Industrial",
    members: [
      "Manufacturing",
      "Construction",
      "Utilities",
      "Energy & Mining",
      "Transportation & Logistics",
      "Wholesale",
    ],
    description:
      "Combined industrial vertical. Manufacturing plants, construction sites, utility yards, mining operations, logistics hubs, and wholesale distribution share a vocabulary anchored in plants, docks, gates, warehouses, and snake_case facility codes.",
  },
];
function groupFor(industry: string): string | undefined {
  for (const g of VERTICAL_GROUPS) if (g.members.includes(industry)) return g.group;
  return undefined;
}

type Node = {
  sfdcAccountId: string;
  organizationId: string;
  depth: number;
  siteName: string;
  topShape: TopShape;
  subCode: SubCode;
  compoundPattern: CompoundPattern;
  qualifierFamily: QualifierFamily | null;
  qualifierLabel: string | null;
  hasEmbeddedId: boolean;
};

function num(s: string): number {
  if (!s || s === "null") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// --- Load + classify everything once ---
console.log("Loading complex_tail_subtrees.csv...");
const csvPath = join(RAW, "complex_tail_subtrees.csv");
if (!existsSync(csvPath)) throw new Error(`Missing ${csvPath}`);
const rows = parseCsv(readFileSync(csvPath, "utf8"));
console.log(`  ${rows.length.toLocaleString()} site rows loaded`);

const nodes: Node[] = rows.map((r) => {
  const c = classifyNodeName(r.site_name);
  const cp = detectCompoundPattern(r.site_name);
  return {
    sfdcAccountId: r.sfdc_account_id,
    organizationId: r.organization_id,
    depth: num(r.depth),
    siteName: r.site_name,
    topShape: c.shape,
    subCode: c.sub,
    compoundPattern: cp.compoundPattern,
    qualifierFamily: cp.qualifierFamily,
    qualifierLabel: cp.qualifierLabel,
    hasEmbeddedId: cp.embeddedId !== null,
  };
});

// --- Load axes (industry + bookings per account, full population) ---
console.log("Loading org_axes.csv...");
const axesRows = parseCsv(readFileSync(join(RAW, "org_axes.csv"), "utf8"));
type Axes = { industry: string; bookings: number; name: string };
const axesByAccount = new Map<string, Axes>();
for (const r of axesRows) {
  axesByAccount.set(r.sfdc_account_id, {
    industry: bucketIndustry(r.industry ?? ""),
    bookings: num(r.lifetime_bookings),
    name: r.sfdc_account_name ?? "",
  });
}

// --- Load pipeline (open opportunity value) per account (OPTIONAL) ---
// If data/raw/account_pipeline.csv exists, attach open pipeline totals to
// each industry rollup. The CSV is produced by the Hex pull triggered in
// the parent chat; if it isn't there yet, we still emit the snapshot but
// without the pipeline column.
type Pipeline = { openCount: number; openValue: number };
const pipelineByAccount = new Map<string, Pipeline>();
const pipelinePath = join(RAW, "account_pipeline.csv");
const hasPipeline = existsSync(pipelinePath);
if (hasPipeline) {
  console.log("Loading account_pipeline.csv...");
  const prows = parseCsv(readFileSync(pipelinePath, "utf8"));
  for (const r of prows) {
    pipelineByAccount.set(r.sfdc_account_id, {
      openCount: num(r.open_opportunity_count),
      openValue: num(r.open_opportunity_value_usd),
    });
  }
  console.log(`  ${prows.length.toLocaleString()} accounts with pipeline data`);
} else {
  console.log("(account_pipeline.csv not found; emitting snapshot without pipeline)");
}

// Per-account / per-org totals for the perOrgComposition section.
type OrgRollup = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  organizationId: string;
  industry: string;
  bookings: number;
  totalSites: number;
  maxDepth: number;
  nodes: Node[];
};
const orgKey = (n: Node) => `${n.sfdcAccountId}::${n.organizationId}`;
const orgMap = new Map<string, OrgRollup>();
for (const n of nodes) {
  const k = orgKey(n);
  let o = orgMap.get(k);
  if (!o) {
    const ax = axesByAccount.get(n.sfdcAccountId);
    o = {
      sfdcAccountId: n.sfdcAccountId,
      sfdcAccountName: ax?.name ?? "",
      organizationId: n.organizationId,
      industry: ax?.industry ?? "Unknown / Other",
      bookings: ax?.bookings ?? 0,
      totalSites: 0,
      maxDepth: 0,
      nodes: [],
    };
    orgMap.set(k, o);
  }
  o.nodes.push(n);
  o.totalSites += 1;
  if (n.depth > o.maxDepth) o.maxDepth = n.depth;
}

// --- Distribution helpers ---
type Distribution = {
  totalNodes: number;
  topShape: Record<string, number>;
  subCode: Record<string, number>;
};

function dist(items: Node[]): Distribution {
  const topShape: Record<string, number> = {};
  const subCode: Record<string, number> = {};
  for (const t of TOP_SHAPES) topShape[t] = 0;
  for (const n of items) {
    topShape[n.topShape] = (topShape[n.topShape] ?? 0) + 1;
    subCode[n.subCode] = (subCode[n.subCode] ?? 0) + 1;
  }
  const total = items.length;
  if (total > 0) {
    for (const k of Object.keys(topShape)) topShape[k] = topShape[k] / total;
    for (const k of Object.keys(subCode)) subCode[k] = subCode[k] / total;
  }
  return { totalNodes: total, topShape, subCode };
}

function distByDepth(items: Node[]): Record<string, Distribution> {
  const out: Record<string, Distribution> = {};
  const buckets = new Map<number, Node[]>();
  for (const n of items) {
    const list = buckets.get(n.depth) ?? [];
    list.push(n);
    buckets.set(n.depth, list);
  }
  for (const [d, items2] of buckets) out[String(d)] = dist(items2);
  return out;
}

// --- Overall + per-industry distributions ---
console.log("Computing overall + per-industry distributions...");
const overall = {
  byDepth: distByDepth(nodes),
  allDepths: dist(nodes),
};

const byIndustryNodes = new Map<string, Node[]>();
const byIndustryOrgs = new Map<string, Set<string>>();
for (const n of nodes) {
  const ax = axesByAccount.get(n.sfdcAccountId);
  const ind = ax?.industry ?? "Unknown / Other";
  const list = byIndustryNodes.get(ind) ?? [];
  list.push(n);
  byIndustryNodes.set(ind, list);
  const orgs = byIndustryOrgs.get(ind) ?? new Set();
  orgs.add(orgKey(n));
  byIndustryOrgs.set(ind, orgs);
}

// --- Population-wide industry totals (all 31,408 active paid accounts,
//     not just the 6,282 complex-tail orgs). Used for the headline metrics
//     and for selecting the top-N cards. ---
type IndustryPopulation = {
  industry: string;
  orgs: number;            // total active-paid accounts in this industry
  bookings: number;        // sum of lifetime_bookings across those accounts
  openPipelineCount: number;
  openPipelineValue: number;
  complexOrgs: number;     // accounts that also appear in the complex tail
};

const populationByIndustry = new Map<string, IndustryPopulation>();
function getOrInitPop(ind: string): IndustryPopulation {
  let p = populationByIndustry.get(ind);
  if (!p) {
    p = {
      industry: ind,
      orgs: 0,
      bookings: 0,
      openPipelineCount: 0,
      openPipelineValue: 0,
      complexOrgs: 0,
    };
    populationByIndustry.set(ind, p);
  }
  return p;
}
for (const [accountId, ax] of axesByAccount) {
  const p = getOrInitPop(ax.industry);
  p.orgs += 1;
  p.bookings += ax.bookings;
  const pl = pipelineByAccount.get(accountId);
  if (pl) {
    p.openPipelineCount += pl.openCount;
    p.openPipelineValue += pl.openValue;
  }
}
// Mark which of those accounts is in the complex tail (one row per
// complex-tail org, but we only want each ACCOUNT counted once).
const complexAccountSet = new Set<string>();
for (const o of orgMap.values()) complexAccountSet.add(o.sfdcAccountId);
for (const accountId of complexAccountSet) {
  const ax = axesByAccount.get(accountId);
  if (!ax) continue;
  const p = getOrInitPop(ax.industry);
  p.complexOrgs += 1;
}

const populationTotals = {
  orgs: [...populationByIndustry.values()].reduce((s, p) => s + p.orgs, 0),
  bookings: [...populationByIndustry.values()].reduce((s, p) => s + p.bookings, 0),
  openPipelineValue: [...populationByIndustry.values()].reduce((s, p) => s + p.openPipelineValue, 0),
};

// --- Card-level rollup: each card is either a vertical group (Education,
//     Industrial) or a standalone industry. Cards are what gets ranked. ---
type Card = {
  cardId: string;             // group name OR industry name
  cardKind: "group" | "industry";
  members: string[];          // industries in this card (length 1 for standalone)
  description?: string;       // present for group cards only
  orgs: number;
  bookings: number;
  openPipelineCount: number;
  openPipelineValue: number;
  complexOrgs: number;
};

const cards = new Map<string, Card>();
function addCard(c: Card) { cards.set(c.cardId, c); }

// Group cards first.
for (const g of VERTICAL_GROUPS) {
  const members = g.members.filter((m) => populationByIndustry.has(m));
  const card: Card = {
    cardId: g.group,
    cardKind: "group",
    members,
    description: g.description,
    orgs: 0,
    bookings: 0,
    openPipelineCount: 0,
    openPipelineValue: 0,
    complexOrgs: 0,
  };
  for (const m of members) {
    const p = populationByIndustry.get(m)!;
    card.orgs += p.orgs;
    card.bookings += p.bookings;
    card.openPipelineCount += p.openPipelineCount;
    card.openPipelineValue += p.openPipelineValue;
    card.complexOrgs += p.complexOrgs;
  }
  addCard(card);
}

// Standalone industry cards for everything not absorbed into a group.
for (const [ind, p] of populationByIndustry) {
  if (groupFor(ind) !== undefined) continue;
  addCard({
    cardId: ind,
    cardKind: "industry",
    members: [ind],
    orgs: p.orgs,
    bookings: p.bookings,
    openPipelineCount: p.openPipelineCount,
    openPipelineValue: p.openPipelineValue,
    complexOrgs: p.complexOrgs,
  });
}

// --- Combined-rank scoring at the CARD level ---
// Exclude pseudo-cards from ranking and from the rendered output: cards
// with no real industry tag don't belong on the dashboard. We surface
// their totals separately as a footnote ("unclassifiedTotals" in the
// payload).
const UNCLASSIFIED_CARDS = new Set(["Unknown / Other", "Other"]);
const unclassifiedCards = [...cards.values()].filter((c) => UNCLASSIFIED_CARDS.has(c.cardId));
const cardList = [...cards.values()].filter((c) => !UNCLASSIFIED_CARDS.has(c.cardId));
const byOrgsRank = new Map<string, number>();
const byBookingsRank = new Map<string, number>();
[...cardList].sort((a, b) => b.orgs - a.orgs).forEach((c, i) => byOrgsRank.set(c.cardId, i + 1));
[...cardList].sort((a, b) => b.bookings - a.bookings).forEach((c, i) => byBookingsRank.set(c.cardId, i + 1));
type RankedCard = Card & { rankByOrgs: number; rankByBookings: number; combinedRank: number };
const rankedCards: RankedCard[] = cardList
  .map((c) => ({
    ...c,
    rankByOrgs: byOrgsRank.get(c.cardId)!,
    rankByBookings: byBookingsRank.get(c.cardId)!,
    combinedRank: byOrgsRank.get(c.cardId)! + byBookingsRank.get(c.cardId)!,
  }))
  .sort((a, b) => a.combinedRank - b.combinedRank || b.orgs - a.orgs);

const TOP_N_CARDS = 8;
const featuredCards = rankedCards.slice(0, TOP_N_CARDS);
const restCards = rankedCards.slice(TOP_N_CARDS);

console.log(`\nCard ranking (combined rank = rank-by-orgs + rank-by-bookings; ${cardList.length} total cards):`);
for (const c of rankedCards) {
  const mark = featuredCards.includes(c) ? "FEATURED" : "        ";
  const kind = c.cardKind === "group" ? "[GRP]" : "     ";
  console.log(
    `  ${mark} ${kind} ${c.cardId.padEnd(28)} rank=${String(c.combinedRank).padStart(3)} ` +
      `(orgs=${String(c.rankByOrgs).padStart(2)}, books=${String(c.rankByBookings).padStart(2)})  ` +
      `orgs=${c.orgs.toLocaleString().padStart(6)}  books=$${(c.bookings / 1e6).toFixed(1).padStart(7)}M`,
  );
}

// --- Per-industry classification rollup. Always emitted per industry
//     (even when the industry is part of a group card) so the UI can
//     render the inner sub-industry sections under a group. ---
type IndustryRollup = {
  industry: string;
  // Group membership (if any)
  group?: string;
  // Population (all active-paid accounts in this industry)
  populationOrgs: number;
  populationBookings: number;
  populationOpenPipelineCount: number;
  populationOpenPipelineValue: number;
  populationShare: { orgs: number; bookings: number; pipeline: number };
  // Complex-tail (orgs we have full hierarchy data for)
  complexOrgs: number;
  complexShareOfPopulation: number;
  totalNodes: number;
  // Naming taxonomy distributions (from complex-tail nodes)
  allDepths: Distribution;
  byDepth: Record<string, Distribution>;
  distinctiveSubCodes: { sub: string; share: number; vsOverallRatio: number }[];
};

const overallSubShares = overall.allDepths.subCode;
const byIndustry: Record<string, IndustryRollup> = {};
for (const [ind, p] of populationByIndustry) {
  // Skip pseudo-industries from the per-industry rollup. Their totals
  // are surfaced as a single line via `unclassifiedTotals`.
  if (ind === "Unknown / Other" || ind === "Other") continue;
  const items = byIndustryNodes.get(ind) ?? [];
  const all = dist(items);
  const distinctive: { sub: string; share: number; vsOverallRatio: number }[] = [];
  for (const sub of Object.keys(all.subCode)) {
    const indShare = all.subCode[sub];
    const overallShare = overallSubShares[sub] ?? 0;
    if (indShare < 0.01) continue;
    const ratio = overallShare > 0 ? indShare / overallShare : 0;
    if (ratio < 1.5) continue;
    distinctive.push({
      sub,
      share: Number(indShare.toFixed(4)),
      vsOverallRatio: Number(ratio.toFixed(2)),
    });
  }
  distinctive.sort((a, b) => b.vsOverallRatio - a.vsOverallRatio);
  byIndustry[ind] = {
    industry: ind,
    group: groupFor(ind),
    populationOrgs: p.orgs,
    populationBookings: p.bookings,
    populationOpenPipelineCount: p.openPipelineCount,
    populationOpenPipelineValue: p.openPipelineValue,
    populationShare: {
      orgs: populationTotals.orgs > 0 ? Number((p.orgs / populationTotals.orgs).toFixed(4)) : 0,
      bookings: populationTotals.bookings > 0 ? Number((p.bookings / populationTotals.bookings).toFixed(4)) : 0,
      pipeline:
        populationTotals.openPipelineValue > 0
          ? Number((p.openPipelineValue / populationTotals.openPipelineValue).toFixed(4))
          : 0,
    },
    complexOrgs: p.complexOrgs,
    complexShareOfPopulation: p.orgs > 0 ? Number((p.complexOrgs / p.orgs).toFixed(4)) : 0,
    totalNodes: items.length,
    allDepths: all,
    byDepth: distByDepth(items),
    distinctiveSubCodes: distinctive.slice(0, 8),
  };
}

// --- Group-level rollups: pool the complex-tail nodes across all member
//     industries and produce a single fingerprint for the group card. ---
type GroupRollup = {
  group: string;
  members: string[];
  description: string;
  populationOrgs: number;
  populationBookings: number;
  populationOpenPipelineValue: number;
  complexOrgs: number;
  totalNodes: number;
  allDepths: Distribution;
  byDepth: Record<string, Distribution>;
  distinctiveSubCodes: { sub: string; share: number; vsOverallRatio: number }[];
};
const groupRollups: Record<string, GroupRollup> = {};
for (const g of VERTICAL_GROUPS) {
  const members = g.members.filter((m) => populationByIndustry.has(m));
  const items: Node[] = [];
  for (const m of members) {
    const ms = byIndustryNodes.get(m) ?? [];
    items.push(...ms);
  }
  const card = cards.get(g.group)!;
  const all = dist(items);
  const distinctive: { sub: string; share: number; vsOverallRatio: number }[] = [];
  for (const sub of Object.keys(all.subCode)) {
    const indShare = all.subCode[sub];
    const overallShare = overallSubShares[sub] ?? 0;
    if (indShare < 0.01) continue;
    const ratio = overallShare > 0 ? indShare / overallShare : 0;
    if (ratio < 1.5) continue;
    distinctive.push({
      sub,
      share: Number(indShare.toFixed(4)),
      vsOverallRatio: Number(ratio.toFixed(2)),
    });
  }
  distinctive.sort((a, b) => b.vsOverallRatio - a.vsOverallRatio);
  groupRollups[g.group] = {
    group: g.group,
    members,
    description: g.description,
    populationOrgs: card.orgs,
    populationBookings: card.bookings,
    populationOpenPipelineValue: card.openPipelineValue,
    complexOrgs: card.complexOrgs,
    totalNodes: items.length,
    allDepths: all,
    byDepth: distByDepth(items),
    distinctiveSubCodes: distinctive.slice(0, 8),
  };
}

// --- Per-industry sub-segmentation ---
// Each industry's complex-tail orgs are bucketed into 2-5 named
// sub-segments (e.g. K-12 districts vs charter networks vs faith-based).
// We compute a fingerprint per sub-segment so the UI can show internal
// variation inside each card.
console.log("Computing per-industry sub-segment rollups...");

type SubSegmentRollup = {
  segmentId: string;
  label: string;
  description: string;
  populationOrgs: number;
  populationBookings: number;
  populationOpenPipelineValue: number;
  // share of the industry the sub-segment represents
  shareOfIndustryOrgs: number;
  shareOfIndustryBookings: number;
  // complex-tail sample
  complexOrgs: number;
  totalNodes: number;
  allDepths: Distribution;
  distinctiveSubCodes: { sub: string; share: number; vsOverallRatio: number }[];
};

// (industry, sub-segment id) -> rollup data
const subSegmentRollups: Record<string, SubSegmentRollup[]> = {};

// We need per-account sub-segment assignments to (a) bucket complex-tail
// orgs and (b) bucket the entire population for population totals per
// sub-segment.
const subSegByAccount = new Map<string, { industry: string; segmentId: string }>();
for (const [accountId, ax] of axesByAccount) {
  const seg = classifySubSegment(ax.industry, { name: ax.name, bookings: ax.bookings });
  if (seg !== null) subSegByAccount.set(accountId, { industry: ax.industry, segmentId: seg });
}

for (const seg of SUB_SEGMENTERS) {
  const ind = seg.industry;
  const indPop = populationByIndustry.get(ind);
  if (!indPop) continue;
  // Skip pseudo-industries entirely. Their totals roll up under
  // `unclassifiedTotals` instead of a rendered card.
  if (UNCLASSIFIED_CARDS.has(ind)) continue;

  // Aggregate population totals per sub-segment.
  type Agg = { orgs: number; bookings: number; pipeline: number; complexOrgs: number; nodes: Node[] };
  const agg = new Map<string, Agg>();
  for (const s of seg.segments) {
    agg.set(s.id, { orgs: 0, bookings: 0, pipeline: 0, complexOrgs: 0, nodes: [] });
  }
  for (const [accountId, ax] of axesByAccount) {
    if (ax.industry !== ind) continue;
    const seg2 = subSegByAccount.get(accountId);
    if (!seg2) continue;
    const a = agg.get(seg2.segmentId);
    if (!a) continue;
    a.orgs += 1;
    a.bookings += ax.bookings;
    const pl = pipelineByAccount.get(accountId);
    if (pl) a.pipeline += pl.openValue;
  }
  // Mark complex-tail accounts and collect their nodes for the fingerprint.
  for (const o of orgMap.values()) {
    if (o.industry !== ind) continue;
    const seg2 = subSegByAccount.get(o.sfdcAccountId);
    if (!seg2) continue;
    const a = agg.get(seg2.segmentId);
    if (!a) continue;
    a.complexOrgs += 1;
    a.nodes.push(...o.nodes);
  }

  // Build rollups.
  const rolls: SubSegmentRollup[] = [];
  for (const s of seg.segments) {
    const a = agg.get(s.id)!;
    // Skip empty sub-segments. If nothing fell into a defined slot we
    // simply don't surface it; the UI never needs to render an empty
    // bucket.
    if (a.orgs === 0) continue;
    const all = dist(a.nodes);
    const distinctive: { sub: string; share: number; vsOverallRatio: number }[] = [];
    for (const sub of Object.keys(all.subCode)) {
      const sh = all.subCode[sub];
      const overallShare = overallSubShares[sub] ?? 0;
      if (sh < 0.01) continue;
      const ratio = overallShare > 0 ? sh / overallShare : 0;
      if (ratio < 1.5) continue;
      distinctive.push({ sub, share: Number(sh.toFixed(4)), vsOverallRatio: Number(ratio.toFixed(2)) });
    }
    distinctive.sort((a, b) => b.vsOverallRatio - a.vsOverallRatio);
    rolls.push({
      segmentId: s.id,
      label: s.label,
      description: s.description,
      populationOrgs: a.orgs,
      populationBookings: a.bookings,
      populationOpenPipelineValue: a.pipeline,
      shareOfIndustryOrgs: indPop.orgs > 0 ? Number((a.orgs / indPop.orgs).toFixed(4)) : 0,
      shareOfIndustryBookings: indPop.bookings > 0 ? Number((a.bookings / indPop.bookings).toFixed(4)) : 0,
      complexOrgs: a.complexOrgs,
      totalNodes: a.nodes.length,
      allDepths: all,
      distinctiveSubCodes: distinctive.slice(0, 6),
    });
  }
  rolls.sort((a, b) => b.populationOrgs - a.populationOrgs);
  subSegmentRollups[ind] = rolls;
}

// --- Example customer extraction ---
// Pick 5 illustrative complex-tail orgs per industry. Prefer one per
// distinctive sub-code where possible (so example coverage maps to the
// taxonomy story), then fill the rest by complexity ranking.
console.log("Picking example customers per industry...");

type ExampleSiteNode = {
  name: string;
  depth: number;
  parentId: string | null;
  nodeType: string;
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
  topShape: TopShape;
  subCode: SubCode;
};
type ExampleCustomer = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  industry: string;
  subSegment?: string;
  bookings: number;
  totalSites: number;
  maxDepth: number;
  // Top-level fingerprint (depth-1 composition)
  depth1Composition: Distribution;
  // Distinctive sub-codes for this org (>= 1.5x baseline + share >= 0.01)
  distinctiveSubCodes: { sub: string; share: number; vsOverallRatio: number }[];
  // 3-5 representative root subtrees: pick the top 5 depth-1 sites by
  // total device count, then include those sites' immediate children
  // (depth 2 and 3).
  representativeRoots: {
    rootName: string;
    rootDepth: number;
    rootDeviceTotal: number;
    children: ExampleSiteNode[];
  }[];
};

// Need parent_site_id and node_type from the original rows for the
// representative-roots tree, so reload them and tag each node.
type RawNode = {
  siteId: string;
  parentSiteId: string;
  siteName: string;
  depth: number;
  nodeType: string;
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
  deviceTotal: number;
  topShape: TopShape;
  subCode: SubCode;
};
const orgNodes = new Map<string, { aid: string; nodes: RawNode[] }>(); // org key -> raw nodes
for (const r of rows) {
  const key = `${r.sfdc_account_id}::${r.organization_id}`;
  let g = orgNodes.get(key);
  if (!g) { g = { aid: r.sfdc_account_id, nodes: [] }; orgNodes.set(key, g); }
  const cls = classifyNodeName(r.site_name);
  g.nodes.push({
    siteId: r.site_id,
    parentSiteId: r.parent_site_id,
    siteName: r.site_name,
    depth: num(r.depth),
    nodeType: r.node_type,
    cameras: num(r.camera_count),
    acPanels: num(r.ac_panel_count),
    alarmDevices: num(r.alarm_device_count),
    alarmPanels: num(r.alarm_panel_count),
    deviceTotal: num(r.device_count_total),
    topShape: cls.shape,
    subCode: cls.sub,
  });
}

function pickExamples(industry: string, count = 5): ExampleCustomer[] {
  // All complex-tail orgs for this industry.
  const candidates = [...orgMap.values()].filter((o) => o.industry === industry);
  if (candidates.length === 0) return [];
  // Build a complexity score: max_depth + log10(sites) + log10(bookings).
  function score(o: OrgRollup): number {
    return o.maxDepth + Math.log10(Math.max(o.totalSites, 1)) + Math.log10(Math.max(o.bookings, 1));
  }
  const sorted = [...candidates].sort((a, b) => score(b) - score(a));

  // First pass: pick one customer per distinct sub-code that this industry
  // has as "distinctive" (provided we still have qualified candidates).
  const indRoll = byIndustry[industry];
  const wanted = (indRoll?.distinctiveSubCodes ?? []).map((d) => d.sub).slice(0, count);
  const picked = new Set<string>();
  const result: OrgRollup[] = [];

  for (const sub of wanted) {
    // Find the highest-scoring org that has this sub-code in its tree.
    for (const o of sorted) {
      const k = orgKey({ sfdcAccountId: o.sfdcAccountId, organizationId: o.organizationId } as Node);
      if (picked.has(k)) continue;
      const hits = o.nodes.filter((n) => n.subCode === sub).length;
      if (hits >= 2) {
        picked.add(k);
        result.push(o);
        break;
      }
    }
    if (result.length >= count) break;
  }
  // Fill the rest by complexity ranking.
  for (const o of sorted) {
    if (result.length >= count) break;
    const k = orgKey({ sfdcAccountId: o.sfdcAccountId, organizationId: o.organizationId } as Node);
    if (picked.has(k)) continue;
    picked.add(k);
    result.push(o);
  }

  return result.map((o) => {
    const key = `${o.sfdcAccountId}::${o.organizationId}`;
    const raw = orgNodes.get(key)?.nodes ?? [];
    const d1Items = o.nodes.filter((n) => n.depth === 1);
    const d1Dist = dist(d1Items);
    // Distinctive sub-codes for this org (>= 1.5x baseline + share >= 1%).
    const orgDist = dist(o.nodes);
    const distinct: { sub: string; share: number; vsOverallRatio: number }[] = [];
    for (const sub of Object.keys(orgDist.subCode)) {
      const sh = orgDist.subCode[sub];
      const overallShare = overallSubShares[sub] ?? 0;
      if (sh < 0.01) continue;
      const ratio = overallShare > 0 ? sh / overallShare : 0;
      if (ratio < 1.5) continue;
      distinct.push({ sub, share: Number(sh.toFixed(4)), vsOverallRatio: Number(ratio.toFixed(2)) });
    }
    distinct.sort((a, b) => b.vsOverallRatio - a.vsOverallRatio);

    // Representative roots: 3-5 depth-1 sites with the highest device
    // counts. For each root, include its direct children (depth 2 + 3).
    const roots = raw.filter((n) => n.depth === 1).sort((a, b) => b.deviceTotal - a.deviceTotal);
    const reps = roots.slice(0, 5).map((root) => {
      // BFS to grab direct depth-2 and depth-3 children of this root.
      const children: ExampleSiteNode[] = [];
      const visited = new Set<string>([root.siteId]);
      // Depth-2 children
      const depth2 = raw.filter((n) => n.parentSiteId === root.siteId);
      // Top 6 depth-2 children by device count
      const top2 = [...depth2].sort((a, b) => b.deviceTotal - a.deviceTotal).slice(0, 6);
      for (const n of top2) {
        visited.add(n.siteId);
        children.push({
          name: n.siteName,
          depth: n.depth,
          parentId: n.parentSiteId,
          nodeType: n.nodeType,
          cameras: n.cameras,
          acPanels: n.acPanels,
          alarmDevices: n.alarmDevices,
          alarmPanels: n.alarmPanels,
          topShape: n.topShape,
          subCode: n.subCode,
        });
        // For each depth-2 child, include top 3 depth-3 grandchildren
        const gc = raw
          .filter((g) => g.parentSiteId === n.siteId)
          .sort((a, b) => b.deviceTotal - a.deviceTotal)
          .slice(0, 3);
        for (const g of gc) {
          if (visited.has(g.siteId)) continue;
          visited.add(g.siteId);
          children.push({
            name: g.siteName,
            depth: g.depth,
            parentId: g.parentSiteId,
            nodeType: g.nodeType,
            cameras: g.cameras,
            acPanels: g.acPanels,
            alarmDevices: g.alarmDevices,
            alarmPanels: g.alarmPanels,
            topShape: g.topShape,
            subCode: g.subCode,
          });
        }
      }
      return {
        rootName: root.siteName,
        rootDepth: root.depth,
        rootDeviceTotal: root.deviceTotal,
        children,
      };
    });

    const subSeg = subSegByAccount.get(o.sfdcAccountId)?.segmentId;
    const ex: ExampleCustomer = {
      sfdcAccountId: o.sfdcAccountId,
      sfdcAccountName: o.sfdcAccountName,
      industry: o.industry,
      bookings: o.bookings,
      totalSites: o.totalSites,
      maxDepth: o.maxDepth,
      depth1Composition: d1Dist,
      distinctiveSubCodes: distinct.slice(0, 5),
      representativeRoots: reps,
    };
    if (subSeg) ex.subSegment = subSeg;
    return ex;
  });
}

const examplesByIndustry: Record<string, ExampleCustomer[]> = {};
for (const ind of Object.keys(byIndustry)) {
  examplesByIndustry[ind] = pickExamples(ind, 5);
}

// --- Per-org composition for the top complex orgs by bookings ---
console.log("Computing per-org composition for top 50 orgs by bookings...");
const orgList = [...orgMap.values()].sort((a, b) => b.bookings - a.bookings);
const perOrgComposition = orgList.slice(0, 50).map((o) => {
  const depth1 = o.nodes.filter((n) => n.depth === 1);
  return {
    sfdcAccountId: o.sfdcAccountId,
    sfdcAccountName: o.sfdcAccountName,
    organizationId: o.organizationId,
    industry: o.industry,
    bookings: o.bookings,
    totalSites: o.totalSites,
    maxDepth: o.maxDepth,
    depth1Composition: dist(depth1),
    allDepthsComposition: dist(o.nodes),
  };
});

// --- Round shares to 4 decimals to keep the JSON small ---
function roundDist(d: Distribution): Distribution {
  const ts: Record<string, number> = {};
  const sc: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.topShape)) ts[k] = Number(v.toFixed(4));
  for (const [k, v] of Object.entries(d.subCode)) sc[k] = Number(v.toFixed(4));
  return { totalNodes: d.totalNodes, topShape: ts, subCode: sc };
}

function roundByDepth(by: Record<string, Distribution>): Record<string, Distribution> {
  const out: Record<string, Distribution> = {};
  for (const [k, v] of Object.entries(by)) out[k] = roundDist(v);
  return out;
}

// --- Featured + not-covered packaging for the UI ---
const featuredCardIds = featuredCards.map((c) => c.cardId);
const notCoveredCards = restCards.map((c) => ({
  cardId: c.cardId,
  cardKind: c.cardKind,
  members: c.members,
  orgs: c.orgs,
  bookings: c.bookings,
  openPipelineValue: c.openPipelineValue,
  shareOfOrgs: populationTotals.orgs > 0 ? Number((c.orgs / populationTotals.orgs).toFixed(4)) : 0,
  shareOfBookings:
    populationTotals.bookings > 0 ? Number((c.bookings / populationTotals.bookings).toFixed(4)) : 0,
  shareOfPipeline:
    populationTotals.openPipelineValue > 0
      ? Number((c.openPipelineValue / populationTotals.openPipelineValue).toFixed(4))
      : 0,
  rankByOrgs: c.rankByOrgs,
  rankByBookings: c.rankByBookings,
  combinedRank: c.combinedRank,
  complexOrgs: c.complexOrgs,
}));
const notCoveredTotals = {
  cards: notCoveredCards.length,
  orgs: notCoveredCards.reduce((s, c) => s + c.orgs, 0),
  bookings: notCoveredCards.reduce((s, c) => s + c.bookings, 0),
  openPipelineValue: notCoveredCards.reduce((s, c) => s + c.openPipelineValue, 0),
  shareOfOrgs:
    populationTotals.orgs > 0
      ? Number((notCoveredCards.reduce((s, c) => s + c.orgs, 0) / populationTotals.orgs).toFixed(4))
      : 0,
  shareOfBookings:
    populationTotals.bookings > 0
      ? Number(
          (notCoveredCards.reduce((s, c) => s + c.bookings, 0) / populationTotals.bookings).toFixed(4),
        )
      : 0,
};

// Aggregate the unclassified pseudo-cards (Unknown / Other, Other) into
// a single footnote-style total. Surfaced separately so the UI can show
// it as a one-line caveat rather than a full card.
const unclassifiedTotals = {
  orgs: unclassifiedCards.reduce((s, c) => s + c.orgs, 0),
  bookings: unclassifiedCards.reduce((s, c) => s + c.bookings, 0),
  openPipelineValue: unclassifiedCards.reduce((s, c) => s + c.openPipelineValue, 0),
  complexOrgs: unclassifiedCards.reduce((s, c) => s + c.complexOrgs, 0),
  shareOfOrgs:
    populationTotals.orgs > 0
      ? Number((unclassifiedCards.reduce((s, c) => s + c.orgs, 0) / populationTotals.orgs).toFixed(4))
      : 0,
  shareOfBookings:
    populationTotals.bookings > 0
      ? Number(
          (unclassifiedCards.reduce((s, c) => s + c.bookings, 0) / populationTotals.bookings).toFixed(4),
        )
      : 0,
};

// Build the featured cards array: each entry carries either the group
// rollup + its inner industry rollups, OR a single industry rollup.
const featuredCardData = featuredCards.map((c) => {
  if (c.cardKind === "group") {
    const g = groupRollups[c.cardId];
    return {
      cardId: c.cardId,
      cardKind: "group" as const,
      members: c.members,
      description: c.description,
      rankByOrgs: c.rankByOrgs,
      rankByBookings: c.rankByBookings,
      combinedRank: c.combinedRank,
      populationOrgs: g.populationOrgs,
      populationBookings: g.populationBookings,
      populationOpenPipelineValue: g.populationOpenPipelineValue,
      populationShare: {
        orgs: populationTotals.orgs > 0 ? Number((g.populationOrgs / populationTotals.orgs).toFixed(4)) : 0,
        bookings:
          populationTotals.bookings > 0 ? Number((g.populationBookings / populationTotals.bookings).toFixed(4)) : 0,
        pipeline:
          populationTotals.openPipelineValue > 0
            ? Number((g.populationOpenPipelineValue / populationTotals.openPipelineValue).toFixed(4))
            : 0,
      },
      complexOrgs: g.complexOrgs,
      totalNodes: g.totalNodes,
      allDepths: roundDist(g.allDepths),
      byDepth: roundByDepth(g.byDepth),
      distinctiveSubCodes: g.distinctiveSubCodes,
      subIndustries: c.members.map((m) => {
        const r = byIndustry[m];
        return {
          industry: r.industry,
          populationOrgs: r.populationOrgs,
          populationBookings: r.populationBookings,
          populationOpenPipelineValue: r.populationOpenPipelineValue,
          populationShare: r.populationShare,
          complexOrgs: r.complexOrgs,
          complexShareOfPopulation: r.complexShareOfPopulation,
          totalNodes: r.totalNodes,
          allDepths: roundDist(r.allDepths),
          byDepth: roundByDepth(r.byDepth),
          distinctiveSubCodes: r.distinctiveSubCodes,
          // Each sub-industry inside a group card gets its own sub-segments
          // and examples so the UI can drill down all the way.
          subSegments: (subSegmentRollups[m] ?? []).map((s) => ({
            segmentId: s.segmentId,
            label: s.label,
            description: s.description,
            populationOrgs: s.populationOrgs,
            populationBookings: s.populationBookings,
            populationOpenPipelineValue: s.populationOpenPipelineValue,
            shareOfIndustryOrgs: s.shareOfIndustryOrgs,
            shareOfIndustryBookings: s.shareOfIndustryBookings,
            complexOrgs: s.complexOrgs,
            totalNodes: s.totalNodes,
            allDepths: roundDist(s.allDepths),
            distinctiveSubCodes: s.distinctiveSubCodes,
          })),
          examples: (examplesByIndustry[m] ?? []).map((e) => ({
            sfdcAccountName: e.sfdcAccountName,
            subSegment: e.subSegment,
            bookings: e.bookings,
            totalSites: e.totalSites,
            maxDepth: e.maxDepth,
            depth1Composition: roundDist(e.depth1Composition),
            distinctiveSubCodes: e.distinctiveSubCodes,
            representativeRoots: e.representativeRoots,
          })),
        };
      }),
    };
  }
  // Industry card
  const r = byIndustry[c.cardId];
  return {
    cardId: c.cardId,
    cardKind: "industry" as const,
    members: c.members,
    rankByOrgs: c.rankByOrgs,
    rankByBookings: c.rankByBookings,
    combinedRank: c.combinedRank,
    populationOrgs: r.populationOrgs,
    populationBookings: r.populationBookings,
    populationOpenPipelineCount: r.populationOpenPipelineCount,
    populationOpenPipelineValue: r.populationOpenPipelineValue,
    populationShare: r.populationShare,
    complexOrgs: r.complexOrgs,
    complexShareOfPopulation: r.complexShareOfPopulation,
    totalNodes: r.totalNodes,
    allDepths: roundDist(r.allDepths),
    byDepth: roundByDepth(r.byDepth),
    distinctiveSubCodes: r.distinctiveSubCodes,
    subSegments: (subSegmentRollups[c.cardId] ?? []).map((s) => ({
      segmentId: s.segmentId,
      label: s.label,
      description: s.description,
      populationOrgs: s.populationOrgs,
      populationBookings: s.populationBookings,
      populationOpenPipelineValue: s.populationOpenPipelineValue,
      shareOfIndustryOrgs: s.shareOfIndustryOrgs,
      shareOfIndustryBookings: s.shareOfIndustryBookings,
      complexOrgs: s.complexOrgs,
      totalNodes: s.totalNodes,
      allDepths: roundDist(s.allDepths),
      distinctiveSubCodes: s.distinctiveSubCodes,
    })),
    examples: (examplesByIndustry[c.cardId] ?? []).map((e) => ({
      sfdcAccountName: e.sfdcAccountName,
      subSegment: e.subSegment,
      bookings: e.bookings,
      totalSites: e.totalSites,
      maxDepth: e.maxDepth,
      depth1Composition: roundDist(e.depth1Composition),
      distinctiveSubCodes: e.distinctiveSubCodes,
      representativeRoots: e.representativeRoots,
    })),
  };
});

// ---------------------------------------------------------------------------
// Spatial vocabulary: how do customers describe property schematics?
// Rollup of compound-pattern fields and qualifier-family shares across:
//   1. The full complex-tail population
//   2. Per industry
//   3. Per deep-dive customer (12 hand-picked)
//
// Only nodes at depth >= 2 are counted, since the "schematic" pattern is
// about sub-roots inside a building/site, not the top-level facility name.
// ---------------------------------------------------------------------------

type SpatialRollup = {
  totalEligibleNodes: number;
  compoundPatternShares: Record<CompoundPattern, number>;
  qualifierFamilyShares: Record<QualifierFamily | "none", number>;
  topQualifierLabels: { label: string; share: number; count: number }[];
  embeddedIdShare: number;
};

const ALL_COMPOUND_PATTERNS: CompoundPattern[] = [
  "entity_only",
  "entity_plus_qualifier",
  "entity_plus_qualifier_plus_id",
  "qualifier_only",
  "id_only",
];

function spatialRollup(items: Node[]): SpatialRollup {
  const eligible = items.filter((n) => n.depth >= 2);
  const total = eligible.length;
  const cp: Record<CompoundPattern, number> = {
    entity_only: 0,
    entity_plus_qualifier: 0,
    entity_plus_qualifier_plus_id: 0,
    qualifier_only: 0,
    id_only: 0,
  };
  const qf: Record<string, number> = { none: 0 };
  const labelCounts = new Map<string, number>();
  let embeddedIdNodes = 0;
  for (const n of eligible) {
    cp[n.compoundPattern] = (cp[n.compoundPattern] ?? 0) + 1;
    const fam = n.qualifierFamily ?? "none";
    qf[fam] = (qf[fam] ?? 0) + 1;
    if (n.qualifierLabel) {
      labelCounts.set(
        n.qualifierLabel,
        (labelCounts.get(n.qualifierLabel) ?? 0) + 1,
      );
    }
    if (n.hasEmbeddedId) embeddedIdNodes++;
  }
  const cpShares: Record<CompoundPattern, number> = {
    entity_only: 0,
    entity_plus_qualifier: 0,
    entity_plus_qualifier_plus_id: 0,
    qualifier_only: 0,
    id_only: 0,
  };
  for (const p of ALL_COMPOUND_PATTERNS) {
    cpShares[p] = total > 0 ? +(cp[p] / total).toFixed(4) : 0;
  }
  const qfShares: Record<string, number> = {};
  for (const k of Object.keys(qf)) {
    qfShares[k] = total > 0 ? +(qf[k] / total).toFixed(4) : 0;
  }
  const topLabels = Array.from(labelCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({
      label,
      count,
      share: total > 0 ? +(count / total).toFixed(4) : 0,
    }));
  return {
    totalEligibleNodes: total,
    compoundPatternShares: cpShares,
    qualifierFamilyShares: qfShares as Record<QualifierFamily | "none", number>,
    topQualifierLabels: topLabels,
    embeddedIdShare: total > 0 ? +(embeddedIdNodes / total).toFixed(4) : 0,
  };
}

const spatialOverall = spatialRollup(nodes);
const spatialByIndustry: Record<string, SpatialRollup> = {};
for (const [ind, items] of byIndustryNodes.entries()) {
  if (ind === "Unknown / Other") continue;
  const roll = spatialRollup(items);
  if (roll.totalEligibleNodes < 200) continue; // sample-size guard
  spatialByIndustry[ind] = roll;
}

// Per deep-dive customer (12 hand-picked accounts). Index by sfdc_account_name
// since the App.tsx lookup uses the canonical name.
const DEEP_DIVE_NAMES = [
  "Caterpillar Inc",
  "Saddle Creek Logistics Services",
  "Tacoma Public Schools",
  "Legislative Assembly of British Columbia",
  "SGS (US)",
  "Hanna Boys Center",
  "Mount Pisgah Christian School (GA)",
  "The Salvation Army - Western Territory",
  "Charter Schools USA",
  "Southwire Company LLC",
  "Dairy Farmers of America , Inc.",
  "Hanger, Inc.",
];

const nodesByAccountName = new Map<string, Node[]>();
for (const n of nodes) {
  const ax = axesByAccount.get(n.sfdcAccountId);
  if (!ax) continue;
  const list = nodesByAccountName.get(ax.name) ?? [];
  list.push(n);
  nodesByAccountName.set(ax.name, list);
}
const spatialByDeepDive: Record<string, SpatialRollup> = {};
for (const name of DEEP_DIVE_NAMES) {
  const items = nodesByAccountName.get(name) ?? [];
  if (items.length === 0) continue;
  spatialByDeepDive[name] = spatialRollup(items);
}

const payload = {
  pulledAt: new Date().toISOString().slice(0, 10),
  totalNodes: nodes.length,
  totalComplexOrgs: orgMap.size,
  populationTotals,
  hasPipelineData: hasPipeline,
  topShapes: TOP_SHAPES,
  topShapeLabels,
  subCodeLabels,
  subCodeToTopShape,
  verticalGroups: VERTICAL_GROUPS,
  methodNote:
    "Two data layers: (1) per-card headline metrics (org count, lifetime " +
    "bookings, open pipeline) come from the FULL active-paid population " +
    "(~31K accounts). (2) Naming-convention distributions (topShape and " +
    "subCode shares) come from the complex-tail subset (~6,282 orgs) where " +
    "we have full site hierarchies materialised. Cards are either vertical " +
    "groups (Education = K-12 + Higher Ed + Trade Schools; Industrial = " +
    "Manufacturing + Construction + Utilities + Energy & Mining + " +
    "Transportation & Logistics + Wholesale) or standalone industries. " +
    "Cards are ranked by combined rank: rank-by-org-count + rank-by-bookings, " +
    "lower is better; the top 8 are featured. No model, no sampling. " +
    "subSegmentsByIndustry: each industry is further split into 2-7 named " +
    "sub-segments (e.g. K-12 districts vs charter networks). Sub-segment " +
    "assignment is regex over the SFDC account name. examplesByIndustry: " +
    "five representative complex-tail customers per industry, each with a " +
    "depth-1 fingerprint and 3-5 representative root subtrees showing the " +
    "actual site hierarchy (depth-2 children + top depth-3 grandchildren).",
  featuredCards: featuredCardData,
  notCoveredCards,
  notCoveredTotals,
  unclassifiedTotals,
  overall: {
    byDepth: roundByDepth(overall.byDepth),
    allDepths: roundDist(overall.allDepths),
  },
  // All industries (including those inside group cards) for callers that
  // want to render their own grouping or get a per-industry fingerprint
  // outside the featured set.
  byIndustry: Object.fromEntries(
    Object.entries(byIndustry).map(([ind, r]) => [
      ind,
      {
        industry: r.industry,
        group: r.group,
        populationOrgs: r.populationOrgs,
        populationBookings: r.populationBookings,
        populationOpenPipelineCount: r.populationOpenPipelineCount,
        populationOpenPipelineValue: r.populationOpenPipelineValue,
        populationShare: r.populationShare,
        complexOrgs: r.complexOrgs,
        complexShareOfPopulation: r.complexShareOfPopulation,
        totalNodes: r.totalNodes,
        allDepths: roundDist(r.allDepths),
        byDepth: roundByDepth(r.byDepth),
        distinctiveSubCodes: r.distinctiveSubCodes,
      },
    ]),
  ),
  perOrgComposition: perOrgComposition.map((o) => ({
    ...o,
    depth1Composition: roundDist(o.depth1Composition),
    allDepthsComposition: roundDist(o.allDepthsComposition),
  })),
  // Per-industry sub-segmentation: each card carries internal variation.
  subSegmentsByIndustry: Object.fromEntries(
    Object.entries(subSegmentRollups).map(([ind, rolls]) => [
      ind,
      rolls.map((r) => ({
        segmentId: r.segmentId,
        label: r.label,
        description: r.description,
        populationOrgs: r.populationOrgs,
        populationBookings: r.populationBookings,
        populationOpenPipelineValue: r.populationOpenPipelineValue,
        shareOfIndustryOrgs: r.shareOfIndustryOrgs,
        shareOfIndustryBookings: r.shareOfIndustryBookings,
        complexOrgs: r.complexOrgs,
        totalNodes: r.totalNodes,
        allDepths: roundDist(r.allDepths),
        distinctiveSubCodes: r.distinctiveSubCodes,
      })),
    ]),
  ),
  // Real customer site-structure examples per industry (5 each).
  examplesByIndustry: Object.fromEntries(
    Object.entries(examplesByIndustry).map(([ind, exs]) => [
      ind,
      exs.map((e) => ({
        sfdcAccountId: e.sfdcAccountId,
        sfdcAccountName: e.sfdcAccountName,
        industry: e.industry,
        subSegment: e.subSegment,
        bookings: e.bookings,
        totalSites: e.totalSites,
        maxDepth: e.maxDepth,
        depth1Composition: roundDist(e.depth1Composition),
        distinctiveSubCodes: e.distinctiveSubCodes,
        representativeRoots: e.representativeRoots,
      })),
    ]),
  ),
  // Per-industry sub-segment vocab so the UI can render unknown industries
  // (e.g. those in not-covered cards) consistently.
  subSegmentDefinitions: Object.fromEntries(
    SUB_SEGMENTERS.map((s) => [s.industry, s.segments]),
  ),
  // Spatial vocabulary: how customers compose property-schematics names
  // (entity + qualifier pattern, qualifier-family shares, top labels).
  // Sourced from depth-2+ nodes only (top-level facility roots excluded).
  spatialVocabulary: {
    qualifierFamilyLabels,
    methodNote:
      "Pattern detector splits each non-root node name (depth >= 2) into " +
      "an entity prefix and an optional spatial-qualifier tail. The " +
      "qualifier family rolls up to one of 17 named buckets (inside / " +
      "outside, direction relative or cardinal, entry / exit, dock, " +
      "gate / yard, parking, etc.). Pure regex over node names; no model. " +
      "Industries with under 200 eligible nodes are omitted for sample " +
      "size.",
    overall: spatialOverall,
    byIndustry: spatialByIndustry,
    byDeepDiveCustomer: spatialByDeepDive,
  },
};

writeFileSync(OUT, JSON.stringify(payload) + "\n");
console.log(`Wrote ${OUT}`);

// --- Console summary ---
console.log("\nTop-shape distribution (all depths):");
const ts = overall.allDepths.topShape;
for (const sh of TOP_SHAPES) {
  console.log(`  ${sh.padEnd(12)}  ${(ts[sh] * 100).toFixed(1)}%`);
}
console.log(`\nFeatured cards (top ${TOP_N_CARDS} by combined rank):`);
for (const c of featuredCardData) {
  const kind = c.cardKind === "group" ? "[GROUP]" : "       ";
  const pipelineCol = hasPipeline ? `  pipe=$${(c.populationOpenPipelineValue / 1e6).toFixed(1)}M` : "";
  console.log(
    `  ${kind} ${c.cardId.padEnd(26)} ` +
      `orgs=${c.populationOrgs.toLocaleString().padStart(6)} (${(c.populationShare.orgs * 100).toFixed(1)}%)  ` +
      `books=$${(c.populationBookings / 1e6).toFixed(1).padStart(7)}M (${(c.populationShare.bookings * 100).toFixed(1)}%)${pipelineCol}`,
  );
  if (c.cardKind === "group") {
    for (const s of c.subIndustries) {
      const top3 = s.distinctiveSubCodes.slice(0, 3).map((d) => `${d.sub}(${d.vsOverallRatio}x)`).join(" ");
      console.log(
        `    - ${s.industry.padEnd(24)} orgs=${s.populationOrgs.toLocaleString().padStart(6)}  ` +
          `books=$${(s.populationBookings / 1e6).toFixed(1).padStart(7)}M  ${top3}`,
      );
    }
  } else {
    const top3 = c.distinctiveSubCodes.slice(0, 3).map((d) => `${d.sub}(${d.vsOverallRatio}x)`).join(" ");
    if (top3) console.log(`    distinctive: ${top3}`);
  }
}

console.log(`\nNot-covered cards (${notCoveredCards.length}):`);
for (const c of notCoveredCards) {
  console.log(
    `  ${c.cardId.padEnd(26)} ` +
      `orgs=${c.orgs.toLocaleString().padStart(6)} (${(c.shareOfOrgs * 100).toFixed(1)}%)  ` +
      `books=$${(c.bookings / 1e6).toFixed(1).padStart(7)}M (${(c.shareOfBookings * 100).toFixed(1)}%)`,
  );
}
console.log(
  `\nNot-covered totals: ${notCoveredTotals.cards} cards, ` +
    `${notCoveredTotals.orgs.toLocaleString()} orgs (${(notCoveredTotals.shareOfOrgs * 100).toFixed(1)}% of population), ` +
    `$${(notCoveredTotals.bookings / 1e6).toFixed(1)}M bookings (${(notCoveredTotals.shareOfBookings * 100).toFixed(1)}% of total)`,
);
