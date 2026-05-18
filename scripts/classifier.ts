/**
 * Site-hierarchy classifier ported from src/App.tsx.
 *
 * Two layers:
 *   1. inferRootShape(name)         -- regex/heuristic ladder over a depth-1 site name
 *   2. inferArchetypeFamily(input)  -- deterministic rules over per-org root shapes
 *                                      and the org's metric counts.
 *
 * Kept deterministic and free of external dependencies so the build pipeline
 * can run in CI / a fresh Node install without Athena access.
 */

export type RootShape =
  | "geographic"
  | "facility_code"
  | "function_word"
  | "entity_name"
  | "corporate_tree"
  | "school_code"
  | "lifecycle_marker";

export const ROOT_SHAPES: RootShape[] = [
  "geographic",
  "facility_code",
  "function_word",
  "entity_name",
  "corporate_tree",
  "school_code",
  "lifecycle_marker",
];

export const rootShapeLabels: Record<RootShape, string> = {
  geographic: "geographic",
  facility_code: "facility-code",
  function_word: "function-word",
  entity_name: "entity-name",
  corporate_tree: "corporate-tree",
  school_code: "school-code",
  lifecycle_marker: "lifecycle-marker",
};

export const rootShapeDescriptions: Record<RootShape, string> = {
  geographic: "States, regions, or cities as the top-level groups (e.g. CA-SF, IL-Chicago).",
  facility_code: "Short opaque codes or building IDs as the root name (e.g. ALBIR, FLLAK).",
  function_word: "Role or function as the root name instead of place (e.g. PRECINCT, CAUCUS).",
  entity_name: "Real-world names of buildings, schools, or sites as the root (e.g. Smith Hall, Main Campus).",
  corporate_tree: "Business units or divisions as the root (e.g. Region > Division > Brand).",
  school_code: "School name with an embedded ID code as the root (e.g. FL - Lincoln (04500)).",
  lifecycle_marker: "Status hints baked into the root name (e.g. 'Z-' for retired, 'Staged', 'Demo').",
};

/**
 * Port of inferRootShape from src/App.tsx. Order matters: each regex acts as a
 * gate, and the first match wins. Kept byte-for-byte equivalent so the new
 * population numbers stay comparable with the existing 12-customer classification.
 */
export function inferRootShape(name: string): RootShape {
  const trimmed = name.trim();
  if (
    /^Z[-_ ]/i.test(trimmed) ||
    /^!\s/.test(trimmed) ||
    /\b(Staged|Newly Added|To be Installed|Demo|Test\b)/i.test(trimmed)
  ) {
    return "lifecycle_marker";
  }
  if (/^[A-Z]{2}\s*[-–]\s*[A-Z]/.test(trimmed) && /\(\d{4}\)/.test(trimmed)) {
    return "school_code";
  }
  if (/^[A-Z]{2}[-_ ]/.test(trimmed) || /^[A-Z]{2}$/.test(trimmed)) {
    return "geographic";
  }
  if (
    /^[A-Z]{4,6}$/.test(trimmed) ||
    /\(\d{3,5}\)/.test(trimmed) ||
    /US_[A-Z]{2}_/i.test(trimmed) ||
    /-\d{3,5}\b/.test(trimmed)
  ) {
    return "facility_code";
  }
  if (
    /\b(PRECINCT|CAUCUS|CONSTITUENCY|RESIDENCES|HQ|HEADQUARTERS|RETAIL|WAREHOUSE|OFFICE)\b/i.test(trimmed) &&
    trimmed === trimmed.toUpperCase()
  ) {
    return "function_word";
  }
  if (/\b(Red Apple|Division|Command|Territory|Region|Corporation|Holdings|Group)\b/i.test(trimmed)) {
    return "corporate_tree";
  }
  return "entity_name";
}

// ---------------------------------------------------------------------------
// Archetype family

export type ArchetypeFamily =
  | "geographic_first"
  | "facility_code"
  | "function_first"
  | "single_campus"
  | "flat_fleet"
  | "deep_command"
  | "hybrid_legacy"
  | "camera_only_flat"
  | "camera_only_geographic"
  | "camera_only_deep";

export const ARCHETYPE_FAMILIES: ArchetypeFamily[] = [
  "geographic_first",
  "facility_code",
  "function_first",
  "single_campus",
  "flat_fleet",
  "deep_command",
  "hybrid_legacy",
  "camera_only_flat",
  "camera_only_geographic",
  "camera_only_deep",
];

export const archetypeFamilyLabels: Record<ArchetypeFamily, string> = {
  geographic_first: "Geographic-first",
  facility_code: "Facility-as-string-code",
  function_first: "Function-first",
  single_campus: "Single-campus institution",
  flat_fleet: "Flat-fleet district",
  deep_command: "Deep command hierarchy",
  hybrid_legacy: "Hybrid legacy + corporate",
  camera_only_flat: "Camera-only flat",
  camera_only_geographic: "Camera-only geographic",
  camera_only_deep: "Camera-only deep",
};

export type OrgClassificationInput = {
  totalSites: number;
  maxDepth: number;
  topLevelNodes: number;
  structural: number;
  mixed: number;
  leafWithDevices: number;
  deadEnd: number;
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
  productLinesCount: number;
  distinctProductMixes: number;
  rootShapes: RootShape[];
};

export type SingleProductCohort =
  | "cameras_only"
  | "access_only"
  | "alarms_only"
  | "multi_product";

export function singleProductCohort(o: {
  cameras: number;
  acPanels: number;
  alarmDevices: number;
  alarmPanels: number;
}): SingleProductCohort {
  const camera = o.cameras > 0;
  const access = o.acPanels > 0;
  const alarms = o.alarmDevices > 0 || o.alarmPanels > 0;
  const linesActive = [camera, access, alarms].filter(Boolean).length;
  if (linesActive === 1) {
    if (camera) return "cameras_only";
    if (access) return "access_only";
    if (alarms) return "alarms_only";
  }
  return "multi_product";
}

/**
 * Multi-archetype = the org has 2+ distinct root shapes serving sibling-purpose
 * roots at depth 1. The simple proxy is "distinct root shape count >= 2", which
 * matches multiArchetypeStrict in the existing classification for 5 of 5
 * positive cases (Caterpillar, Salvation Army, Charter, Southwire, Hanger).
 */
export function isMultiArchetype(rootShapes: RootShape[]): boolean {
  return new Set(rootShapes).size >= 2;
}

export function hasLifecycleMarkers(rootShapes: RootShape[]): boolean {
  return rootShapes.includes("lifecycle_marker");
}

/**
 * Archetype-family decision tree. Single-product (camera-only) orgs get their
 * own three families; multi-product orgs are bucketed by their dominant root
 * shape and depth.
 */
export function inferArchetypeFamily(input: OrgClassificationInput): ArchetypeFamily {
  const cohort = singleProductCohort(input);
  const distinctShapes = new Set(input.rootShapes);

  if (cohort === "cameras_only") {
    if (input.totalSites <= 3 || input.maxDepth <= 1) return "camera_only_flat";
    if (distinctShapes.has("geographic")) return "camera_only_geographic";
    if (input.maxDepth >= 4) return "camera_only_deep";
    return "camera_only_flat";
  }

  const dominantShape = pickDominantShape(input.rootShapes);

  if (input.maxDepth >= 5 && (dominantShape === "corporate_tree" || distinctShapes.has("corporate_tree"))) {
    return "deep_command";
  }

  if (
    distinctShapes.size >= 3 ||
    (distinctShapes.size >= 2 && distinctShapes.has("lifecycle_marker"))
  ) {
    return "hybrid_legacy";
  }

  if (dominantShape === "function_word") return "function_first";

  if (dominantShape === "geographic") return "geographic_first";

  if (dominantShape === "facility_code") return "facility_code";

  if (dominantShape === "school_code") return "facility_code";

  // entity_name dominant
  if (input.topLevelNodes <= 3 && input.totalSites <= 50) return "single_campus";
  if (input.topLevelNodes >= 20 && input.maxDepth <= 3) return "flat_fleet";

  // corporate_tree without enough depth to be deep_command
  if (dominantShape === "corporate_tree") return "deep_command";

  return "flat_fleet";
}

function pickDominantShape(shapes: RootShape[]): RootShape | undefined {
  if (shapes.length === 0) return undefined;
  const counts = new Map<RootShape, number>();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: RootShape | undefined = undefined;
  let bestCount = -1;
  for (const [s, c] of counts) {
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}
