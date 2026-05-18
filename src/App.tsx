import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  colorPalette,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from "./canvas-shim";
import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import aggregateSnapshot from "./data/aggregate-patterns.json";
import customerSubtreesSnapshot from "./data/customer-subtrees.json";
import taxonomySnapshot from "./data/taxonomy.json";
import sequencingSnapshot from "./data/sequencing.json";

const OVERVIEW_HASHES = new Set([
  "customers-at-a-glance",
  "what-we-measured",
  "root-shapes",
  "archetype-families",
  "aggregate-patterns",
  "what-we-learned",
  "method",
]);
const DETAIL_HASHES = new Set(["customer-deep-dives"]);
const AGGREGATE_HASHES = new Set([
  "simple-base",
  "complex-tail",
  "complex-by-bookings",
  "complex-by-industry",
  "complex-matrix",
  "complex-top-orgs",
  "aggregate-method",
]);

type ProductMix =
  | "cameras_only"
  | "cameras_access"
  | "cameras_alarms"
  | "cameras_access_alarms"
  | "access_or_alarms_only"
  | "empty";

type NodeType =
  | "structural"
  | "mixed"
  | "leaf_with_devices"
  | "dead_end";

type TreeNode = {
  name: string;
  type: NodeType;
  cam?: number;
  ac?: number;
  alarmDev?: number;
  alarmPan?: number;
  mix?: ProductMix;
  note?: string;
  children?: TreeNode[];
};

type ArchetypeFamily =
  | "geographic_first"
  | "facility_code"
  | "function_first"
  | "single_campus"
  | "flat_fleet"
  | "deep_command"
  | "camera_only_flat"
  | "camera_only_geographic"
  | "camera_only_deep";

const archetypeFamilyLabels: Record<ArchetypeFamily, string> = {
  geographic_first: "Geographic-first",
  facility_code: "Facility-as-string-code",
  function_first: "Function-first",
  single_campus: "Single-campus institution",
  flat_fleet: "Flat-fleet district",
  deep_command: "Deep command hierarchy",
  camera_only_flat: "Camera-only flat",
  camera_only_geographic: "Camera-only geographic",
  camera_only_deep: "Camera-only deep",
};

const archetypeFamilyTone: Record<ArchetypeFamily, "info" | "warning" | "success" | "renamed" | "added" | "deleted" | "neutral"> = {
  geographic_first: "info",
  facility_code: "warning",
  function_first: "success",
  single_campus: "renamed",
  flat_fleet: "added",
  deep_command: "deleted",
  camera_only_flat: "neutral",
  camera_only_geographic: "info",
  camera_only_deep: "deleted",
};

type Customer = {
  rank: number;
  name: string;
  orgName: string;
  segment: string;
  industry: string;
  country: string;
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
  productMixes: number;
  bookingsK: number;
  organizationLogic: string;
  archetype: string;
  archetypeFamily: ArchetypeFamily;
  secondaryArchetypeFamilies?: ArchetypeFamily[];
  useCases: string[];
  rootNames: string[];
  exampleBranches: { kind: string; path: string; mix: ProductMix }[];
  observations: string[];
  keyTakeaways: string[];
  subtreeRationale: string;
  subtree: TreeNode[];
};

const customers: Customer[] = [
  {
    rank: 1,
    name: "Caterpillar Inc",
    orgName: "Caterpillar, Inc.",
    segment: "AMER-GBL",
    industry: "Manufacturing",
    country: "US",
    totalSites: 203,
    maxDepth: 5,
    topLevelNodes: 20,
    structural: 30,
    mixed: 17,
    leafWithDevices: 124,
    deadEnd: 32,
    cameras: 1818,
    acPanels: 43,
    alarmDevices: 25,
    alarmPanels: 5,
    productMixes: 6,
    bookingsK: 5409,
    organizationLogic: "geographic_state_city_then_building_floor",
    archetypeFamily: "geographic_first",
    secondaryArchetypeFamilies: ["function_first"],
    archetype: "Manufacturing facility tree",
    useCases: [
      "Per-site building security at multiple plants",
      "Sub-divides large plants into Interior / Offices / Floors",
      "Project-team sites (CAT Robotics, Switch Gear) sit alongside geographic sites",
    ],
    rootNames: [
      "AZ-Tucson",
      "CA-San Francisco",
      "CAT Robotics - San Francisco",
      "CAT Switch Gear Alpharetta",
      "GA-Athens Move",
      "GA-Griffin",
      "GA_Bogart",
      "IL-Decatur",
      "IL-Mossville",
      "IN-Lafayette",
      "MO-West Plains",
      "NC-Cary",
    ],
    exampleBranches: [
      { kind: "Flat leaf", path: "AZ-Tucson", mix: "cameras_only" },
      {
        kind: "Deep plant",
        path: "TX-Schertz > 6800 Doerr Ln > Interior > Offices > Upstairs",
        mix: "cameras_access",
      },
      { kind: "Function under geo", path: "NC-Cary > BCP", mix: "cameras_only" },
    ],
    observations: [
      "Only top-12 account hitting all six product_mix values",
      "Naming is inconsistent (GA-Athens vs GA_Bogart) — two operators or two onboarding eras",
      "32 dead-end leaves likely staging sites or relocated buildings",
    ],
    keyTakeaways: [
      "Hitting all six product mixes is the upper bound of cross-sell maturity; Cat is the model account for a 'every product, every site' story. The 'six product mixes' badge is a meaningful sales artifact.",
      "Naming inconsistency (GA-Athens vs GA_Bogart) at this size = two operators or two onboarding eras. Bulk-rename / naming-convention enforcement tooling would resolve operational drift that lives forever in the tree otherwise.",
      "Function-first sub-orgs (CAT Robotics, CAT Switch Gear) sitting alongside geographic-state roots is the canonical 'geographic + function hybrid' shape; the product needs to support both axes simultaneously, not force one.",
    ],
    subtreeRationale:
      "IL-Decatur is the only Caterpillar root showing the full STATE > CITY > ADDRESS > INTERIOR > ZONE pattern with all four node types and a mixed-device branch at depth 4.",
    subtree: [
      {
        name: "IL-Decatur",
        type: "structural",
        children: [
          {
            name: "1 Lafayette Building",
            type: "mixed",
            cam: 18,
            mix: "cameras_only",
            children: [
              { name: "Interior", type: "structural", children: [
                { name: "Offices", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
                { name: "Production Floor", type: "leaf_with_devices", cam: 14, ac: 2, mix: "cameras_access" },
                { name: "Loading Dock", type: "leaf_with_devices", cam: 8, mix: "cameras_only" },
              ]},
              { name: "Exterior", type: "leaf_with_devices", cam: 12, mix: "cameras_only" },
            ],
          },
          {
            name: "Building D",
            type: "structural",
            children: [
              { name: "Interior", type: "structural", children: [
                { name: "Offices", type: "leaf_with_devices", cam: 4, ac: 3, mix: "cameras_access" },
                { name: "Upstairs", type: "leaf_with_devices", cam: 3, mix: "cameras_only" },
                { name: "Conference Rooms", type: "dead_end", note: "Created pre-deployment, devices never installed" },
              ]},
              { name: "Exterior", type: "leaf_with_devices", cam: 9, mix: "cameras_only" },
            ],
          },
          { name: "Visitor Center", type: "leaf_with_devices", cam: 7, ac: 1, mix: "cameras_access" },
          { name: "Old Tractor Lot", type: "dead_end", note: "Decommissioned" },
        ],
      },
    ],
  },
  {
    rank: 2,
    name: "Saddle Creek Logistics",
    orgName: "Saddle Creek Logistics",
    segment: "AMER-ENT-CP",
    industry: "Transportation/Logistics",
    country: "US",
    totalSites: 142,
    maxDepth: 4,
    topLevelNodes: 35,
    structural: 14,
    mixed: 21,
    leafWithDevices: 91,
    deadEnd: 16,
    cameras: 1716,
    acPanels: 71,
    alarmDevices: 166,
    alarmPanels: 3,
    productMixes: 6,
    bookingsK: 2888,
    organizationLogic: "facility_code_then_internal_zones",
    archetypeFamily: "facility_code",
    archetype: "Airport-code warehouse network",
    useCases: [
      "Distribution centers with perimeter (guard shacks / main gates) plus interior zones",
      "Camera coverage at gates + alarms inside cold storage / dock zones",
      "AC at office sub-spaces inside warehouses",
    ],
    rootNames: [
      "ALBIR",
      "AZPHO",
      "CABUE",
      "CAMOD",
      "CAONT",
      "FLJAC",
      "FLJAX",
      "FLLAK",
      "GAATL 106 South",
      "GAATL Eagles",
      "GACAL",
      "GAFAI",
    ],
    exampleBranches: [
      { kind: "Flat DC", path: "ALBIR", mix: "cameras_access" },
      {
        kind: "Deep perimeter",
        path: "FLLAK > FLLAK GuardShacks > FLLAK MainGate > FLLAKGS Internal",
        mix: "cameras_only",
      },
      { kind: "Building sub", path: "GAMAC > GAMAC Bldg. 5", mix: "cameras_access_alarms" },
    ],
    observations: [
      "Airport-style 5-letter facility codes signal an in-house naming standard",
      "Alarm device volume (166) is unusually high vs alarm panels (3) — sensor-heavy deployment",
      "21 mixed nodes = parent buildings with their own cameras AND interior sub-zones",
    ],
    keyTakeaways: [
      "5-letter facility codes (FLLAK, GAMAC) reveal that logistics customers have a corporate facility taxonomy that pre-dates Verkada. Letting them attach their facility-code as a stable external ID would simplify integrations with WMS / ERP systems.",
      "Sensor-heavy alarm pattern (166 devices : 3 panels) is the logistics signature; UX should optimize for high-density sensor maps (occupancy, door-prop, motion) rather than camera-grid first.",
      "Mixed buildings with both perimeter cameras and interior sub-zones are the dominant warehouse pattern; reports that roll up perimeter coverage + interior zone coverage as two separable metrics would match how facilities teams think.",
    ],
    subtreeRationale:
      "FLLAK (Lakeland HQ campus) is the only Saddle Creek root that reaches depth 4 with the canonical perimeter > gate > internal-zone pattern plus alarm-heavy interior buildings.",
    subtree: [
      {
        name: "FLLAK",
        type: "mixed",
        cam: 24,
        mix: "cameras_only",
        children: [
          {
            name: "FLLAK GuardShacks",
            type: "structural",
            children: [
              {
                name: "FLLAK MainGate",
                type: "mixed",
                cam: 8,
                mix: "cameras_only",
                children: [
                  { name: "FLLAKGS Internal", type: "leaf_with_devices", cam: 6, alarmDev: 4, mix: "cameras_alarms" },
                ],
              },
              { name: "FLLAK Truck Gate", type: "leaf_with_devices", cam: 5, mix: "cameras_only" },
            ],
          },
          {
            name: "FLLAK Bldg. 1",
            type: "mixed",
            cam: 12,
            alarmDev: 18,
            mix: "cameras_alarms",
            children: [
              { name: "FLLAK Bldg. 1 - Cold Storage", type: "leaf_with_devices", cam: 4, alarmDev: 6, mix: "cameras_alarms" },
              { name: "FLLAK Bldg. 1 - Office", type: "leaf_with_devices", cam: 3, ac: 4, mix: "cameras_access" },
            ],
          },
          { name: "FLLAK Bldg. 2", type: "leaf_with_devices", cam: 18, ac: 2, alarmDev: 9, mix: "cameras_access_alarms" },
          { name: "FLLAK Future Expansion", type: "dead_end", note: "Empty placeholder" },
        ],
      },
    ],
  },
  {
    rank: 3,
    name: "Tacoma Public Schools",
    orgName: "Tacoma Public Schools",
    segment: "AMER-ENT-SL",
    industry: "Education K-12",
    country: "US",
    totalSites: 153,
    maxDepth: 3,
    topLevelNodes: 82,
    structural: 1,
    mixed: 23,
    leafWithDevices: 91,
    deadEnd: 38,
    cameras: 2805,
    acPanels: 249,
    alarmDevices: 453,
    alarmPanels: 55,
    productMixes: 6,
    bookingsK: 6236,
    organizationLogic: "flat_per_school_with_zone_subnodes",
    archetypeFamily: "flat_fleet",
    archetype: "District-as-flat-fleet",
    useCases: [
      "Each school is its own top-level site (no district-level scaffolding)",
      "Schools sub-divide into outside cameras / building zones / sports fields",
      "Full security stack (cameras, AC, alarms) at most schools",
    ],
    rootNames: [
      "9th & Broadway",
      "Arlington Elementary School",
      "Baker Middle School",
      "Birney Elementary School",
      "Blix Elementary School",
      "Boze Elementary School",
      "Browns Point Elementary School",
      "Bryant Montessori School",
    ],
    exampleBranches: [
      { kind: "Flat school", path: "9th & Broadway", mix: "cameras_access_alarms" },
      {
        kind: "Deep zone",
        path: "Mount Tahoma High School > Outside Cameras > South Side (Sports Fields)",
        mix: "cameras_only",
      },
      {
        kind: "Old-vs-new building",
        path: "Birney Elementary School > Birney Old Building",
        mix: "cameras_access",
      },
    ],
    observations: [
      "82 root-level schools is the widest top-level fan-out in the set",
      "Highest alarm panel count (55) and AC count (249) — strongest security stack adoption",
      "38 dead-end leaves suggest decommissioned sub-zones or 'overflow' staging sites",
    ],
    keyTakeaways: [
      "82 top-level schools is the canonical school-district fan-out; default UI is single-school focused. A 'district view' with cross-school rollups (open doors after-hours, alarm patterns, attendance vs. coverage) is the right shape for this segment.",
      "Districts adopt the full security stack (cameras + AC + alarms) more aggressively than any other vertical. This is the strongest cross-sell anchor in the set; the K-12 motion should lead with the multi-product story, not cameras alone.",
      "Old-building vs. new-building patterns ('Birney Old Building' branches) reflect facility-renovation cycles. A 'parent school -> phase / building era' axis would let districts compare deployment generations.",
    ],
    subtreeRationale:
      "Tacoma is mostly flat at the school level, so three representative roots (an elementary, the deepest high school, and a second high school with the alarm-test sub-site) cover the full range without redundancy.",
    subtree: [
      {
        name: "Mount Tahoma High School",
        type: "mixed",
        cam: 52,
        ac: 8,
        alarmDev: 14,
        mix: "cameras_access_alarms",
        children: [
          {
            name: "Outside Cameras",
            type: "structural",
            children: [
              { name: "North Side", type: "leaf_with_devices", cam: 12, mix: "cameras_only" },
              { name: "South Side (Sports Fields)", type: "leaf_with_devices", cam: 14, mix: "cameras_only" },
            ],
          },
          { name: "Main Building", type: "leaf_with_devices", cam: 22, ac: 6, mix: "cameras_access" },
          { name: "Gymnasium", type: "leaf_with_devices", cam: 8, ac: 2, alarmDev: 4, mix: "cameras_access_alarms" },
        ],
      },
      {
        name: "Birney Elementary School",
        type: "mixed",
        cam: 18,
        ac: 3,
        alarmDev: 5,
        mix: "cameras_access_alarms",
        children: [
          { name: "Birney Old Building", type: "leaf_with_devices", cam: 8, ac: 2, mix: "cameras_access" },
          { name: "Birney New Wing", type: "leaf_with_devices", cam: 12, ac: 4, alarmDev: 3, mix: "cameras_access_alarms" },
          { name: "Playground", type: "dead_end", note: "Sub-zone created, never wired" },
        ],
      },
      {
        name: "Foss High School",
        type: "mixed",
        cam: 38,
        ac: 6,
        alarmDev: 11,
        alarmPan: 2,
        mix: "cameras_access_alarms",
        children: [
          { name: "Foss - Alarm Test Site", type: "dead_end", note: "Engineering test, no devices" },
          { name: "Foss Main", type: "leaf_with_devices", cam: 24, ac: 4, mix: "cameras_access" },
          { name: "Foss Athletic Complex", type: "leaf_with_devices", cam: 9, alarmDev: 6, mix: "cameras_alarms" },
        ],
      },
    ],
  },
  {
    rank: 4,
    name: "Legislative Assembly of British Columbia",
    orgName: "Legislative Assembly of British Columbia",
    segment: "AMER-ENT-SL",
    industry: "Public Administration",
    country: "CA",
    totalSites: 121,
    maxDepth: 3,
    topLevelNodes: 4,
    structural: 3,
    mixed: 4,
    leafWithDevices: 93,
    deadEnd: 21,
    cameras: 309,
    acPanels: 144,
    alarmDevices: 287,
    alarmPanels: 17,
    productMixes: 6,
    bookingsK: 1886,
    organizationLogic: "functional_then_location_codes",
    archetypeFamily: "function_first",
    secondaryArchetypeFamilies: ["facility_code"],
    archetype: "Function-first government tree",
    useCases: [
      "Four functional buckets (PRECINCT, CAUCUS, CONSTITUENCY, RESIDENCES) instead of geography",
      "Constituency offices use coded names (CO.BNC = Constituency Office, Burnaby N. Centre)",
      "Heavy AC + alarms (access matters more than cameras for legislators)",
    ],
    rootNames: ["CAUCUS OFFICES", "CONSTITUENCY OFFICES", "PRECINCT", "RESIDENCES"],
    exampleBranches: [
      { kind: "Flat function", path: "PRECINCT", mix: "cameras_access_alarms" },
      {
        kind: "Deep coded",
        path: "CONSTITUENCY OFFICES > CO.BNC.BURNABY CENTRE > CO.BNC.BURNABY CENTRE.COMMUNITY-SPACE",
        mix: "access_or_alarms_only",
      },
      {
        kind: "Coded leaf",
        path: "CONSTITUENCY OFFICES > CO.BNC.BURNABY CENTRE",
        mix: "cameras_access",
      },
    ],
    observations: [
      "Only 4 top-level nodes — most function-tight hierarchy in the set",
      "Cameras (309) < alarm devices (287) and AC (144) — government access/alarm bias is real",
      "All constituency-office leaf names follow a CO.<RIDING>.<NAME>.<SPACE> convention",
    ],
    keyTakeaways: [
      "Government / public-admin orgs lead with access and alarms (287 alarm devices, 144 AC, 309 cameras). This is the opposite mix from commercial; AC and Alarms onboarding flows shouldn't assume cameras as the entry point for this segment.",
      "Function-first organization (Caucus / Precinct / Residences / Constituency Offices) with strong delimiter conventions (CO.RIDING.NAME.SPACE) signals that customers want structured naming templates enforced at create-time, not by convention.",
      "Only 4 top-level nodes plus deep functional branches points to permissioning by function ('Constituency-office staff see only CO.* sites') as a likely workflow; role inheritance down a function branch matters more than down a geographic branch here.",
    ],
    subtreeRationale:
      "Three of the four function roots (CAUCUS OFFICES, PRECINCT, RESIDENCES) plus one drilled CONSTITUENCY OFFICES branch show the full functional taxonomy and the coded sub-naming pattern.",
    subtree: [
      {
        name: "PRECINCT",
        type: "mixed",
        cam: 62,
        ac: 28,
        alarmDev: 42,
        alarmPan: 4,
        mix: "cameras_access_alarms",
        children: [
          { name: "Parliament Buildings - Main", type: "leaf_with_devices", cam: 24, ac: 12, mix: "cameras_access" },
          { name: "Library Building", type: "leaf_with_devices", cam: 8, ac: 4, alarmDev: 6, mix: "cameras_access_alarms" },
        ],
      },
      {
        name: "CAUCUS OFFICES",
        type: "structural",
        children: [
          { name: "Government Caucus", type: "leaf_with_devices", ac: 6, alarmDev: 4, mix: "access_or_alarms_only" },
          { name: "Opposition Caucus", type: "leaf_with_devices", ac: 4, alarmDev: 3, mix: "access_or_alarms_only" },
          { name: "Third Party Caucus", type: "dead_end", note: "Vacant office" },
        ],
      },
      {
        name: "CONSTITUENCY OFFICES",
        type: "structural",
        note: "85+ riding offices; 1 shown",
        children: [
          {
            name: "CO.BNC.BURNABY CENTRE",
            type: "mixed",
            cam: 2,
            ac: 1,
            mix: "cameras_access",
            children: [
              { name: "CO.BNC.BURNABY CENTRE.COMMUNITY-SPACE", type: "leaf_with_devices", ac: 1, alarmDev: 2, mix: "access_or_alarms_only" },
            ],
          },
        ],
      },
      {
        name: "RESIDENCES",
        type: "structural",
        children: [
          { name: "MLA Residence - Victoria 1", type: "leaf_with_devices", ac: 1, alarmDev: 2, mix: "access_or_alarms_only" },
          { name: "MLA Residence - Victoria 2", type: "leaf_with_devices", ac: 1, alarmDev: 2, mix: "access_or_alarms_only" },
        ],
      },
    ],
  },
  {
    rank: 5,
    name: "SGS (US)",
    orgName: "SGS North America",
    segment: "AMER-ENT-CP",
    industry: "Professional Services",
    country: "US",
    totalSites: 65,
    maxDepth: 3,
    topLevelNodes: 54,
    structural: 1,
    mixed: 5,
    leafWithDevices: 54,
    deadEnd: 5,
    cameras: 401,
    acPanels: 66,
    alarmDevices: 80,
    alarmPanels: 11,
    productMixes: 6,
    bookingsK: 887,
    organizationLogic: "geographic_country_state_city",
    archetypeFamily: "geographic_first",
    archetype: "Country-state-city lab network",
    useCases: [
      "Inspection/testing labs spread across countries",
      "Labs subdivide into addressed buildings then room-level zones (IP Room, etc.)",
      "Variant labels for specialty labs (Sulphur Experts, Agri)",
    ],
    rootNames: [
      "BH - Freeport - OGC",
      "CA - AB - Calgary",
      "CA - AB - Calgary (Sulphur Experts)",
      "CA - AB - Edmonton",
      "CA - AB - Edmonton (Agri)",
      "CA - BC - Prince Rupert",
      "CA - BC - Vancouver(Powell)",
      "CA - ON - Gogama",
    ],
    exampleBranches: [
      { kind: "Flat country leaf", path: "BH - Freeport - OGC", mix: "cameras_only" },
      {
        kind: "Deep room",
        path: "US - NJ - Fairfield CRS > US - NJ - Fairfield CRS (291 Fairfield Ave) > US - NJ - Fairfield CRS (Hasbro IP Room)",
        mix: "cameras_access",
      },
      {
        kind: "Building sub",
        path: "US - NJ - Fairfield CRS > US - NJ - Fairfield CRS (291 Fairfield Ave)",
        mix: "cameras_access_alarms",
      },
    ],
    observations: [
      "Per-site name fully restates the parent (3x repetition of 'US - NJ - Fairfield CRS')",
      "Specialty labs are encoded as parenthetical suffixes — works for naming, not for filtering",
      "54 of 65 sites are flat leaves — only the big labs subdivide",
    ],
    keyTakeaways: [
      "Customers restate the parent path in the leaf name (3x 'US - NJ - Fairfield CRS') because breadcrumbs aren't visible in the contexts they care about (exports, alerts, links). Surfacing full path in those surfaces would let names stay short.",
      "Specialty-lab parenthetical suffixes ('(291 Fairfield Ave)', '(Crop Sciences Lab)') are de-facto site attributes. A 'site attribute' or 'site type' tag would let them filter by lab capability across regions, not just within a parent.",
      "83% of sites flat-leaf even in a complex deep-dive org is the signal that complex doesn't mean deep everywhere. Different sites in the same org need different shapes; we shouldn't optimize navigation only for the deep branches.",
    ],
    subtreeRationale:
      "SGS is overwhelmingly flat — 54 of 65 sites have no children. The few multi-node sites (NJ-Fairfield CRS, TX-Deer Park, GA-Suwanee) illustrate the rare deep pattern; the rest are leaves.",
    subtree: [
      { name: "BH - Freeport - OGC", type: "leaf_with_devices", cam: 4, mix: "cameras_only" },
      { name: "CA - AB - Calgary", type: "leaf_with_devices", cam: 8, ac: 2, mix: "cameras_access" },
      { name: "CA - AB - Calgary (Sulphur Experts)", type: "leaf_with_devices", cam: 3, mix: "cameras_only" },
      {
        name: "US - NJ - Fairfield CRS",
        type: "mixed",
        cam: 12,
        ac: 4,
        mix: "cameras_access",
        children: [
          {
            name: "US - NJ - Fairfield CRS (291 Fairfield Ave)",
            type: "mixed",
            cam: 6,
            ac: 2,
            alarmDev: 3,
            alarmPan: 1,
            mix: "cameras_access_alarms",
            children: [
              { name: "US - NJ - Fairfield CRS (Hasbro IP Room)", type: "leaf_with_devices", cam: 2, ac: 1, mix: "cameras_access" },
            ],
          },
          { name: "US - NJ - Fairfield CRS (LSS Lab)", type: "leaf_with_devices", cam: 4, ac: 2, mix: "cameras_access" },
        ],
      },
      { name: "US - TX - Deer Park", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
      { name: "US - GA - Suwanee", type: "leaf_with_devices", cam: 5, ac: 1, mix: "cameras_access" },
      { name: "US - FL - Miami(BETA)", type: "dead_end", note: "Beta site, no devices" },
    ],
  },
  {
    rank: 6,
    name: "Hanna Boys Center",
    orgName: "Hanna Center",
    segment: "AMER-TER-CP",
    industry: "Religious/Civic Nonprofit",
    country: "US",
    totalSites: 36,
    maxDepth: 3,
    topLevelNodes: 9,
    structural: 0,
    mixed: 4,
    leafWithDevices: 24,
    deadEnd: 8,
    cameras: 266,
    acPanels: 25,
    alarmDevices: 13,
    alarmPanels: 2,
    productMixes: 6,
    bookingsK: 800,
    organizationLogic: "single_campus_with_buildings",
    archetypeFamily: "single_campus",
    secondaryArchetypeFamilies: ["facility_code"],
    archetype: "Single-campus institution",
    useCases: [
      "All sites are buildings on one physical campus (residential treatment center)",
      "Building parent + Exterior / Floor sub-zones",
      "Mix of devices per building reflects function (school, mental-health hub, residence cottages)",
    ],
    rootNames: [
      "710 Agua Guest Cottage",
      "Guard Shack",
      "Guest Admin",
      "Guest Admissions",
      "Guest School",
      "Hanna Center",
      "O'Connor (801)",
      "ST. ANNE (400)",
      "Tennis Courts",
    ],
    exampleBranches: [
      { kind: "Top-level campus", path: "Hanna Center", mix: "cameras_access_alarms" },
      {
        kind: "Building + exterior",
        path: "Hanna Center > Mental Health Hub (102) > Mental Health Hub Exterior (102)",
        mix: "cameras_only",
      },
      { kind: "Specific building", path: "Hanna Center > 710 Agua", mix: "cameras_access" },
    ],
    observations: [
      "Smallest in the set (36 sites) but hits all six product mixes — efficient hierarchy",
      "Zero structural-only nodes — every parent has devices itself",
      "Building IDs encoded in parens (101, 400, 801) — implies a master facilities-management map",
    ],
    keyTakeaways: [
      "Hitting all six product mixes in 36 sites is the efficiency benchmark; small complex orgs prove multi-product breadth doesn't require scale. Marketing the 'small but full-stack' story unlocks SMB cross-sell.",
      "Parenthetical building IDs (101, 400, 801) reference an external facilities-management map. Customers want their CMMS / facilities IDs to be first-class metadata on the site, not encoded in names.",
      "Zero structural-only nodes (every parent carries devices) is the 'mixed-only' clean shape; reporting that distinguishes 'pure browse parent' from 'parent with own coverage' would help these customers understand their own tree.",
    ],
    subtreeRationale:
      "The Hanna Center campus root contains the full building-level pattern — every parent has its own devices plus children, the canonical 'mixed-only' org shape.",
    subtree: [
      {
        name: "Hanna Center",
        type: "mixed",
        cam: 24,
        ac: 4,
        alarmDev: 3,
        alarmPan: 1,
        mix: "cameras_access_alarms",
        children: [
          {
            name: "Mental Health Hub (102)",
            type: "mixed",
            cam: 8,
            ac: 2,
            mix: "cameras_access",
            children: [
              { name: "Mental Health Hub Exterior (102)", type: "leaf_with_devices", cam: 4, mix: "cameras_only" },
            ],
          },
          {
            name: "ST. ANNE (400)",
            type: "mixed",
            cam: 12,
            ac: 3,
            alarmDev: 2,
            mix: "cameras_access_alarms",
            children: [
              { name: "ST. ANNE (400) - Dorm Floor", type: "leaf_with_devices", cam: 8, ac: 2, mix: "cameras_access" },
              { name: "ST. ANNE (400) - Common Room", type: "leaf_with_devices", cam: 4, mix: "cameras_only" },
            ],
          },
          { name: "710 Agua", type: "leaf_with_devices", cam: 6, ac: 2, mix: "cameras_access" },
          { name: "Guard Shack", type: "leaf_with_devices", cam: 4, mix: "cameras_only" },
          { name: "Guest School", type: "leaf_with_devices", cam: 8, ac: 1, alarmDev: 2, mix: "cameras_access_alarms" },
          { name: "Tennis Courts", type: "dead_end", note: "No devices installed" },
        ],
      },
    ],
  },
  {
    rank: 7,
    name: "Mount Pisgah Christian School (GA)",
    orgName: "Mount Pisgah Christian School",
    segment: "AMER-TER-SL",
    industry: "Education K-12",
    country: "US",
    totalSites: 31,
    maxDepth: 3,
    topLevelNodes: 7,
    structural: 5,
    mixed: 3,
    leafWithDevices: 19,
    deadEnd: 4,
    cameras: 109,
    acPanels: 8,
    alarmDevices: 9,
    alarmPanels: 5,
    productMixes: 6,
    bookingsK: 408,
    organizationLogic: "multi_campus_school_buildings_zones",
    archetypeFamily: "single_campus",
    archetype: "Private-school multi-campus",
    useCases: [
      "East / North / South campuses + PAC + Gym/HE-panel",
      "Each campus has letter-coded buildings (G-Building, F-Building...)",
      "Operational holding sites ('Newly Added Devices', 'Staged') sit alongside real sites",
    ],
    rootNames: [
      "GH Main HE Panel",
      "MPCS-East Campus",
      "MPCS-North Campus",
      "MPCS-PAC",
      "MPCS-South Campus",
      "Newly Added Devices",
      "Staged",
    ],
    exampleBranches: [
      { kind: "Campus leaf", path: "MPCS-North Campus", mix: "cameras_access" },
      {
        kind: "Deep building zone",
        path: "MPCS-East Campus > G-Building > G-Outside",
        mix: "cameras_only",
      },
      {
        kind: "Floor zone",
        path: "MPCS-East Campus > G-Building > G-Lower",
        mix: "cameras_access_alarms",
      },
    ],
    observations: [
      "Has explicit 'Staged' and 'Newly Added Devices' root nodes — workflow-driven",
      "'GH Main HE Panel' as a root is a device-specific site — naming violates the geographic pattern",
      "PAC = Performing Arts Center treated as its own campus",
    ],
    keyTakeaways: [
      "Top-level 'Staged' and 'Newly Added Devices' roots are explicit workflow primitives the product doesn't offer. A formal device-onboarding inbox would replace ad-hoc roots that pollute geographic reports.",
      "Single-campus schools are the canonical site-hierarchy buyer for K-12 standalone; multi-building-with-floors is the dominant pattern. A 'campus template' (Main building / classrooms / gym / specialty) at site creation would accelerate setup.",
      "Device-specific root nodes ('GH Main HE Panel') indicate a missing primitive for monitoring critical infrastructure (head-end equipment, networking) outside the geographic tree. A 'system / infrastructure' axis would resolve this.",
    ],
    subtreeRationale:
      "Two campuses (East and South) show the full building > floor pattern with all four node types; the East campus shows the deepest path and South shows the alarm-equipped variant.",
    subtree: [
      {
        name: "MPCS-East Campus",
        type: "structural",
        children: [
          {
            name: "G-Building",
            type: "structural",
            children: [
              { name: "G-Lower", type: "leaf_with_devices", cam: 4, ac: 1, alarmDev: 1, alarmPan: 1, mix: "cameras_access_alarms" },
              { name: "G-Main", type: "leaf_with_devices", cam: 5, ac: 1, mix: "cameras_access" },
              { name: "G-Upper", type: "leaf_with_devices", cam: 3, mix: "cameras_only" },
              { name: "G-Outside", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
            ],
          },
          {
            name: "F-Building",
            type: "structural",
            children: [
              { name: "F-Main", type: "leaf_with_devices", cam: 4, ac: 1, mix: "cameras_access" },
              { name: "F-Lab Wing", type: "dead_end", note: "Pre-deployment placeholder" },
            ],
          },
        ],
      },
      {
        name: "MPCS-South Campus",
        type: "structural",
        children: [
          {
            name: "Gym",
            type: "mixed",
            cam: 6,
            alarmDev: 3,
            alarmPan: 1,
            mix: "cameras_alarms",
            children: [
              { name: "Gym - Lobby", type: "leaf_with_devices", cam: 2, ac: 1, mix: "cameras_access" },
            ],
          },
          { name: "Chapel", type: "leaf_with_devices", cam: 5, alarmDev: 2, mix: "cameras_alarms" },
        ],
      },
    ],
  },
  {
    rank: 8,
    name: "Salvation Army - Western Territory",
    orgName: "TSA Western Territory",
    segment: "AMER-GBL",
    industry: "Religious/Civic Nonprofit",
    country: "US",
    totalSites: 377,
    maxDepth: 7,
    topLevelNodes: 18,
    structural: 60,
    mixed: 26,
    leafWithDevices: 249,
    deadEnd: 42,
    cameras: 4207,
    acPanels: 70,
    alarmDevices: 6,
    alarmPanels: 1,
    productMixes: 5,
    bookingsK: 4982,
    organizationLogic: "command_hierarchy_with_legacy_dead_ends",
    archetypeFamily: "deep_command",
    secondaryArchetypeFamilies: ["flat_fleet"],
    archetype: "Deep command hierarchy",
    useCases: [
      "Territory > ARC Command > ARC Retail > Region > City > Store > Donation Site (7 levels)",
      "Parallel structures: Cascade Division, Sierra del Mar, Intermountain, Sunset Coast",
      "Massive 'Z-prefix' legacy/demo/test branch sprawl",
    ],
    rootNames: [
      "00 All Demo Sites At Bottom",
      "Newly Added Devices",
      "Robert Cochran",
      "Unassigned Cameras",
      "Western Territory",
      "Z - THQ Museum",
      "Z 00 IT RMA Devices",
      "Z 00 IT Test Site",
      "Z 000 RCHLAB AZ",
      "Z DEMO",
    ],
    exampleBranches: [
      { kind: "Orphan leaf", path: "Robert Cochran", mix: "cameras_only" },
      {
        kind: "7-level retail",
        path: "Western Territory > ARC Command > ARC Retail > ARC Retail Region 01 > ARC Retail Long Beach > 05 Torrance Store > 05 Torrance Store Donation Site",
        mix: "cameras_only",
      },
      {
        kind: "Division branch",
        path: "Western Territory > Cascade Division",
        mix: "cameras_access",
      },
    ],
    observations: [
      "Only depth-7 org in candidate set — true enterprise command structure",
      "Naming convention is deliberately self-explanatory at every level (avoids acronym debt)",
      "Z-prefix is a tombstoning convention — moves obsolete sites to the bottom of alphabetical sort",
      "Almost zero alarm/AC adoption despite huge scale — cameras-only champion",
    ],
    keyTakeaways: [
      "Depth-7 is the existence proof that command structures can be very deep; performance budgets for tree expansion, breadcrumbs, and role inheritance need to be built for the long tail, not the median.",
      "'Z-prefix tombstoning' is a workaround for missing archive primitives. Customers will not actually delete sites (legal, retention, footage). They need a soft-archive that hides sites from default views but keeps them queryable.",
      "Cameras-only at enterprise scale is the most common high-bookings shape; the AC/Alarms cross-sell story is asymmetric. Knowing which deep-command orgs ARE buying multi-product helps target the next set of conversations.",
    ],
    subtreeRationale:
      "The ARC Retail Region 01 branch reaches the org's full depth-7 chain (the only place this depth appears), and the Cascade + Del Oro Division branches show the parallel geographic-command structure.",
    subtree: [
      {
        name: "Western Territory > ARC Command > ARC Retail > ARC Retail Region 01",
        type: "structural",
        children: [
          {
            name: "ARC Retail Long Beach",
            type: "structural",
            children: [
              {
                name: "05 Torrance Store",
                type: "mixed",
                cam: 8,
                mix: "cameras_only",
                children: [
                  { name: "05 Torrance Store Donation Site", type: "leaf_with_devices", cam: 4, mix: "cameras_only" },
                ],
              },
              {
                name: "12 Compton Store",
                type: "mixed",
                cam: 6,
                mix: "cameras_only",
                children: [
                  { name: "12 Compton Store Donation Site", type: "leaf_with_devices", cam: 3, mix: "cameras_only" },
                ],
              },
            ],
          },
          {
            name: "ARC Retail Los Angeles",
            type: "structural",
            children: [
              { name: "Hollywood Store", type: "leaf_with_devices", cam: 7, mix: "cameras_only" },
              { name: "Pasadena Store", type: "leaf_with_devices", cam: 5, mix: "cameras_only" },
            ],
          },
        ],
      },
      {
        name: "Western Territory > Cascade Division",
        type: "mixed",
        cam: 14,
        ac: 3,
        mix: "cameras_access",
        children: [
          { name: "Cascade Division - Portland Corps", type: "leaf_with_devices", cam: 8, ac: 2, mix: "cameras_access" },
          { name: "Cascade Division - Seattle Corps", type: "leaf_with_devices", cam: 12, ac: 1, mix: "cameras_access" },
          { name: "Cascade Division - Spokane Corps", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
          { name: "Cascade Division - Decommissioned Site", type: "dead_end", note: "Pre-Z-prefix retirement" },
        ],
      },
      {
        name: "Western Territory > Del Oro Division",
        type: "structural",
        children: [
          { name: "Del Oro - Sacramento Corps", type: "leaf_with_devices", cam: 10, ac: 2, mix: "cameras_access" },
          { name: "Del Oro - Stockton Corps", type: "leaf_with_devices", cam: 7, mix: "cameras_only" },
          { name: "Del Oro - Modesto Corps", type: "leaf_with_devices", cam: 8, mix: "cameras_only" },
        ],
      },
    ],
  },
  {
    rank: 9,
    name: "Charter Schools USA",
    orgName: "CSUSA",
    segment: "AMER-ENT-SL",
    industry: "Education K-12",
    country: "US",
    totalSites: 143,
    maxDepth: 5,
    topLevelNodes: 38,
    structural: 16,
    mixed: 3,
    leafWithDevices: 103,
    deadEnd: 21,
    cameras: 6154,
    acPanels: 108,
    alarmDevices: 224,
    alarmPanels: 8,
    productMixes: 5,
    bookingsK: 6877,
    organizationLogic: "mixed_state_school_codes_and_corporate_tree",
    archetypeFamily: "facility_code",
    secondaryArchetypeFamilies: ["geographic_first"],
    archetype: "Two parallel hierarchies (facility code + geographic)",
    useCases: [
      "Flat 'FL - SCHOOL_CODE (####)' roots from the original onboarding",
      "Newer 'Red Apple Education > Schools > Florida > <CODE>' parallel structure",
      "Highest camera count of all 12 (6,154) — heavy K-12 deployment",
    ],
    rootNames: [
      "! - CSUSA",
      "Brickell Demo Site",
      "CSUSA - Support Center",
      "FL - CLAY (1417)",
      "FL - DCSW (9238)",
      "FL - DMCS (305)",
      "FL - GOLD (6004)",
      "FL - GSTAR (2030)",
      "FL - HUNT (4140)",
      "FL - KGHS (2325)",
      "FL - Keys Gate",
    ],
    exampleBranches: [
      { kind: "Demo site", path: "Brickell Demo Site", mix: "cameras_only" },
      {
        kind: "New tree (deep)",
        path: "Red Apple Education > Schools > Florida > SCLA > NSOT 2026 - To be Installed",
        mix: "empty",
      },
      {
        kind: "New tree (school)",
        path: "Red Apple Education > Schools > Florida > CENT",
        mix: "cameras_access_alarms",
      },
    ],
    observations: [
      "Strongest example of hybrid hierarchies — the 'evolved org' pattern from the brief",
      "'! - CSUSA' root uses ASCII sort trick to pin at top",
      "Future-state sites ('NSOT 2026 - To be Installed') reveal planning lives in the tree",
    ],
    keyTakeaways: [
      "ASCII-sort hacks ('! - CSUSA' to pin at top) reveal a missing primitive: customers want pinning and explicit ordering for top-level navigation. Default alphabetical sort fails the moment an org has a 'this is HQ' branch.",
      "Mid-migration orgs (old flat school-code roots side-by-side with newer 'Red Apple > Schools > Florida' branches) are common. Reorg / bulk-move tooling for sites would let these customers finish the migration instead of leaving both shapes in place.",
      "Future-state sites ('NSOT 2026 - To be Installed') prove planning happens in the live tree. A formal lifecycle (planned -> staged -> live -> archived) would clean reports and make rollouts measurable.",
    ],
    subtreeRationale:
      "Two roots side-by-side: a flat 'FL - SCLA (8751)' school-code site from the old onboarding, plus the Red Apple Education > Schools > Florida corporate branch showing the newer pattern.",
    subtree: [
      {
        name: "FL - SCLA (8751)",
        type: "leaf_with_devices",
        cam: 48,
        ac: 4,
        alarmDev: 8,
        mix: "cameras_access_alarms",
        note: "Flat school-code root from legacy onboarding",
      },
      {
        name: "Red Apple Education",
        type: "structural",
        note: "Corporate parallel hierarchy (newer onboarding pattern)",
        children: [
          {
            name: "Schools",
            type: "structural",
            children: [
              {
                name: "Florida",
                type: "structural",
                children: [
                  {
                    name: "SCLA",
                    type: "mixed",
                    cam: 12,
                    ac: 2,
                    mix: "cameras_access",
                    children: [
                      { name: "NSOT 2026 - To be Installed", type: "dead_end", note: "Future-state planning site" },
                    ],
                  },
                  { name: "CENT", type: "leaf_with_devices", cam: 36, ac: 6, alarmDev: 14, mix: "cameras_access_alarms" },
                  { name: "GOLD", type: "leaf_with_devices", cam: 28, ac: 4, alarmDev: 12, mix: "cameras_access_alarms" },
                  { name: "DMCS", type: "leaf_with_devices", cam: 22, alarmDev: 8, mix: "cameras_alarms" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    rank: 10,
    name: "Southwire Company LLC",
    orgName: "Southwire",
    segment: "AMER-ENT-CP",
    industry: "Manufacturing",
    country: "US",
    totalSites: 79,
    maxDepth: 5,
    topLevelNodes: 53,
    structural: 3,
    mixed: 6,
    leafWithDevices: 42,
    deadEnd: 28,
    cameras: 1446,
    acPanels: 82,
    alarmDevices: 7,
    alarmPanels: 2,
    productMixes: 5,
    bookingsK: 2139,
    organizationLogic: "ambiguous_facility_naming_then_zones",
    archetypeFamily: "flat_fleet",
    secondaryArchetypeFamilies: ["facility_code", "function_first"],
    archetype: "Naming-debt manufacturer (flat plants + informal codes + office/plant/DC mix)",
    useCases: [
      "Mix of facility names ('12 For Life Carrollton Ga', 'BWP Florence', 'ATL DC', 'Atl Spark Office')",
      "Substations and shipping zones as sub-nodes inside a plant ('Southwire Florence > BWP > Substations > ...')",
      "Office spaces sit alongside plants at the same depth",
    ],
    rootNames: [
      "12 For Life Carrollton Ga",
      "12 For Life Florence AL",
      "ATL DC",
      "Adamson Square",
      "Atl Spark Office",
      "Atlanta Spark Office",
      "BWP Carrollton",
      "BWP Florence",
      "Battery Park Office",
      "Bremen IN",
      "Calgary Canada",
    ],
    exampleBranches: [
      { kind: "Flat plant", path: "12 For Life Florence AL", mix: "cameras_only" },
      {
        kind: "Deep plant zone",
        path: "Southwire Florence > BWP > South Expansion > Shipping > Wulftec",
        mix: "cameras_only",
      },
      {
        kind: "Equipment zone",
        path: "Southwire Florence > BWP > Substations > South Expansion Substation",
        mix: "cameras_access",
      },
    ],
    observations: [
      "Duplicates like 'Atl Spark Office' vs 'Atlanta Spark Office' = sibling teams onboarding independently",
      "Equipment-level naming ('Wulftec' is a packaging-machine brand) — going below room granularity",
      "28 dead-end empty leaves suggest a habit of creating sites pre-deployment",
    ],
    keyTakeaways: [
      "Duplicate-team onboarding is a real failure mode: 'Atl Spark Office' vs 'Atlanta Spark Office' is two parallel teams that didn't see each other's work. A duplicate-detection nudge during site creation would catch this.",
      "Below-room granularity (named equipment, packaging machines) shows that some customers want to attach devices to physical assets, not just rooms. A 'site -> asset -> device' model would map cleaner than forcing assets into the site tree.",
      "28 dead-end empty leaves indicate teams pre-stage sites before deployment. A first-class 'planned/staging' state on sites would avoid polluting reports with empty branches.",
    ],
    subtreeRationale:
      "Southwire Florence is the only root that reaches the org's max depth-5 with all four node types and equipment-level naming (Wulftec is a machine brand) under shipping zones.",
    subtree: [
      {
        name: "Southwire Florence",
        type: "structural",
        children: [
          {
            name: "BWP",
            type: "structural",
            children: [
              {
                name: "South Expansion",
                type: "structural",
                children: [
                  {
                    name: "Shipping",
                    type: "mixed",
                    cam: 12,
                    mix: "cameras_only",
                    children: [
                      { name: "Wulftec", type: "leaf_with_devices", cam: 4, mix: "cameras_only", note: "Wulftec = packaging-machine brand" },
                    ],
                  },
                  { name: "South Expansion - Office", type: "leaf_with_devices", cam: 6, ac: 3, mix: "cameras_access" },
                ],
              },
              {
                name: "Substations",
                type: "structural",
                children: [
                  { name: "South Expansion Substation", type: "leaf_with_devices", cam: 4, ac: 1, mix: "cameras_access" },
                  { name: "Future North Substation", type: "dead_end", note: "Empty placeholder, project deferred" },
                ],
              },
              { name: "Main Production Floor", type: "leaf_with_devices", cam: 28, ac: 4, mix: "cameras_access" },
            ],
          },
          { name: "Southwire Florence - Visitor Center", type: "leaf_with_devices", cam: 5, ac: 2, mix: "cameras_access" },
        ],
      },
    ],
  },
  {
    rank: 11,
    name: "Dairy Farmers of America",
    orgName: "Dairy Farmers of America, Inc.",
    segment: "AMER-ENT-CP",
    industry: "Agriculture",
    country: "US",
    totalSites: 159,
    maxDepth: 4,
    topLevelNodes: 96,
    structural: 5,
    mixed: 16,
    leafWithDevices: 119,
    deadEnd: 19,
    cameras: 2018,
    acPanels: 365,
    alarmDevices: 5,
    alarmPanels: 1,
    productMixes: 5,
    bookingsK: 4582,
    organizationLogic: "encoded_site_codes_then_production_lines",
    archetypeFamily: "facility_code",
    secondaryArchetypeFamilies: ["function_first"],
    archetype: "Plant-as-encoded-string + production lines",
    useCases: [
      "Each plant uses a hyphenated code: <City>-<Brand>-<Division>-<FacilityType> (<US_ST_CITY##>)",
      "Plants subdivide into Production > Production Lines > <line code/name>",
      "Highest AC panel count (365) — access control across plant doors and rooms",
    ],
    rootNames: [
      "Athens-DB-Dairy Brands-Plant (US_TN_ATH01)",
      "Beaver-DFA-Ingredient Solutions-Plant (US_UT_BVR01)",
      "Beaver-DFA-Mountain Area-Retail (US_UT_BVR02)",
      "Belvidere-DB-Dairy Brands-Plant (US_IL_BVD01)",
    ],
    exampleBranches: [
      {
        kind: "Encoded plant",
        path: "Athens-DB-Dairy Brands-Plant (US_TN_ATH01)",
        mix: "cameras_access",
      },
      {
        kind: "Production line",
        path: "Belvidere-DB-Dairy Brands-Plant (US_IL_BVD01) > Production > Production Lines > 05 - Amerio #1",
        mix: "cameras_only",
      },
      {
        kind: "Flat plant w/ AC",
        path: "Athens-DB-Dairy Brands-Plant (US_TN_ATH01)",
        mix: "cameras_access",
      },
    ],
    observations: [
      "Site name encodes 4 dimensions (city, brand, division, facility-type) — entire taxonomy in one string",
      "96 top-level plants reflects a flat-then-deep pattern: roots = plants, depth comes from production lines",
      "Production-line granularity is unusual — typically used for incident attribution / per-line monitoring",
    ],
    keyTakeaways: [
      "Customers are stuffing 4-dimensional metadata (city, brand, division, facility-type) into a single name string because there are no native tags. First-party tagging or custom-attribute support would unlock this and let teams filter by brand or facility-type cross-cut.",
      "Production-line granularity is a strong signal that operational-incident reporting (per-line uptime, per-line camera coverage) is a real workflow we should support directly, not just camera-by-camera.",
      "Flat-then-deep shape (96 wide roots, depth in the production lines below) is a common manufacturing pattern; navigation and search should optimize for picking a plant first, then drilling, rather than treating depth uniformly.",
    ],
    subtreeRationale:
      "Belvidere is the canonical DFA pattern: encoded-string plant name, Production > Production Lines hierarchy reaching depth 4 with per-line camera leaves.",
    subtree: [
      {
        name: "Belvidere-DB-Dairy Brands-Plant (US_IL_BVD01)",
        type: "mixed",
        cam: 32,
        ac: 12,
        mix: "cameras_access",
        children: [
          {
            name: "Production",
            type: "structural",
            children: [
              {
                name: "Production Lines",
                type: "structural",
                children: [
                  { name: "05 - Amerio #1", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
                  { name: "06 - Amerio #2", type: "leaf_with_devices", cam: 6, mix: "cameras_only" },
                  { name: "07 - Filler Line A", type: "leaf_with_devices", cam: 4, ac: 1, mix: "cameras_access" },
                  { name: "08 - Filler Line B", type: "dead_end", note: "Decommissioned line" },
                ],
              },
              { name: "Production - Cold Storage", type: "leaf_with_devices", cam: 8, ac: 4, mix: "cameras_access" },
            ],
          },
          { name: "Office Wing", type: "leaf_with_devices", cam: 6, ac: 6, mix: "cameras_access" },
          { name: "Shipping Dock", type: "leaf_with_devices", cam: 10, ac: 2, mix: "cameras_access" },
        ],
      },
    ],
  },
  {
    rank: 12,
    name: "Hanger, Inc.",
    orgName: "Hanger, Inc",
    segment: "AMER-ENT-CP",
    industry: "Health Care",
    country: "US",
    totalSites: 156,
    maxDepth: 4,
    topLevelNodes: 29,
    structural: 80,
    mixed: 11,
    leafWithDevices: 35,
    deadEnd: 30,
    cameras: 322,
    acPanels: 23,
    alarmDevices: 11,
    alarmPanels: 3,
    productMixes: 5,
    bookingsK: 675,
    organizationLogic: "strict_geographic_state_city_clinic",
    archetypeFamily: "geographic_first",
    secondaryArchetypeFamilies: ["function_first"],
    archetype: "STATE > CITY > CLINIC tree",
    useCases: [
      "Strict geographic tree: state codes at top, then cities, then clinic names",
      "Specialty roots ('Hanger Resource Center', 'HRC - 1st Floor Lobby') break the pattern at corporate sites",
      "Heavy on structural nodes (80) — the tree itself is the deliverable, not the devices",
    ],
    rootNames: [
      "AR",
      "AZ",
      "CA",
      "CT",
      "FL",
      "GA",
      "HRC - 1st Floor Lobby",
      "Hanger Resource Center",
      "IL",
      "IN",
      "KS",
      "LA",
    ],
    exampleBranches: [
      { kind: "Empty state", path: "AR", mix: "empty" },
      {
        kind: "Deep clinic dept",
        path: "AZ > Phoenix > HFN Arizona > ENG",
        mix: "cameras_only",
      },
      {
        kind: "Clinic leaf",
        path: "AZ > Phoenix > HFN Arizona",
        mix: "cameras_access",
      },
    ],
    observations: [
      "80 structural nodes is the highest in the set — most of the tree exists only for browsing",
      "Sparse device coverage (322 cameras across 156 sites = 2 cameras/site avg) — mostly office check-ins",
      "Two-letter state codes as roots is the cleanest single-pattern convention seen",
    ],
    keyTakeaways: [
      "Structure-heavy orgs need a 'browse vs. monitor' mode split: 80 of 156 nodes have no devices, so default views that surface only device-bearing leaves would cut the navigation surface in half.",
      "Two-letter state-code roots beg for a built-in geographic grouping primitive; users are encoding it in names because the product doesn't model it.",
      "Sparse-coverage clinics (2 cameras/site avg) signal a long-tail use case where alert tuning and clip retention defaults matter more than dashboard density.",
    ],
    subtreeRationale:
      "AZ shows the canonical state > city > clinic > department pattern. Adjacent dead-end states (AR) and corporate specialty roots (HRC) illustrate the structural overhead.",
    subtree: [
      {
        name: "AZ",
        type: "structural",
        children: [
          {
            name: "Phoenix",
            type: "structural",
            children: [
              {
                name: "HFN Arizona",
                type: "mixed",
                cam: 4,
                ac: 2,
                mix: "cameras_access",
                children: [
                  { name: "ENG", type: "leaf_with_devices", cam: 2, mix: "cameras_only" },
                  { name: "Reception", type: "leaf_with_devices", cam: 1, ac: 1, mix: "cameras_access" },
                ],
              },
              { name: "Phoenix Clinic 2", type: "leaf_with_devices", cam: 2, mix: "cameras_only" },
            ],
          },
          {
            name: "Tucson",
            type: "structural",
            children: [
              { name: "Tucson Clinic", type: "leaf_with_devices", cam: 3, ac: 1, mix: "cameras_access" },
            ],
          },
        ],
      },
      { name: "AR", type: "dead_end", note: "State root with no clinics wired" },
      { name: "Hanger Resource Center", type: "leaf_with_devices", cam: 8, ac: 4, mix: "cameras_access", note: "Specialty corporate root, breaks geographic pattern" },
    ],
  },
];

type RootShape =
  | "geographic"
  | "facility_code"
  | "function_word"
  | "entity_name"
  | "corporate_tree"
  | "school_code"
  | "lifecycle_marker";

type FrequencyRow = {
  customer: string;
  rootShapes: RootShape[];
  lifecycleMarkers: boolean;
  multiArchetypeStrict: boolean;
  siblingPurpose: boolean;
  shapeNote: string;
};

const frequencyClassification: FrequencyRow[] = [
  {
    customer: "Caterpillar Inc",
    rootShapes: ["geographic", "entity_name"],
    lifecycleMarkers: false,
    multiArchetypeStrict: true,
    siblingPurpose: false,
    shapeNote:
      "Mostly STATE-City roots (AZ-Tucson, IL-Decatur). Project-team sites (CAT Robotics, CAT Switch Gear) sit alongside with their own naming.",
  },
  {
    customer: "Saddle Creek Logistics",
    rootShapes: ["facility_code"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote:
      "Uniform 5-letter airport-style codes (ALBIR, FLLAK) with a few state-airport suffixes (GAATL Eagles). One shape family, two sub-conventions.",
  },
  {
    customer: "Tacoma Public Schools",
    rootShapes: ["entity_name"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote: "82 school names + a single address (9th & Broadway). All roots are entity names.",
  },
  {
    customer: "Legislative Assembly of British Columbia",
    rootShapes: ["function_word"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: true,
    shapeNote:
      "Four functional roots (PRECINCT, CAUCUS, CONSTITUENCY, RESIDENCES). Single shape, but each root is a distinct purpose — the textbook sibling-purpose pattern.",
  },
  {
    customer: "SGS (US)",
    rootShapes: ["geographic"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote:
      "Strict COUNTRY - STATE - CITY pattern across all 54 root labs. The most uniform org in the set.",
  },
  {
    customer: "Hanna Boys Center",
    rootShapes: ["entity_name"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote:
      "Building / cottage names with parenthetical IDs (ST. ANNE (400)). Single shape, single physical campus.",
  },
  {
    customer: "Mount Pisgah Christian School",
    rootShapes: ["entity_name", "lifecycle_marker"],
    lifecycleMarkers: true,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote:
      "MPCS-Campus entity names plus explicit 'Staged' and 'Newly Added Devices' workflow roots and one device-named root (GH Main HE Panel).",
  },
  {
    customer: "Salvation Army - Western Territory",
    rootShapes: ["corporate_tree", "entity_name", "lifecycle_marker"],
    lifecycleMarkers: true,
    multiArchetypeStrict: true,
    siblingPurpose: true,
    shapeNote:
      "Single 'Western Territory' corporate root with sibling-purpose sub-roots (ARC Command for retail vs Cascade/Sierra/Intermountain/Sunset Coast Divisions for geography). Plus orphan-person leaves (Robert Cochran) and heavy Z-prefix legacy.",
  },
  {
    customer: "Charter Schools USA",
    rootShapes: ["school_code", "corporate_tree", "entity_name", "lifecycle_marker"],
    lifecycleMarkers: true,
    multiArchetypeStrict: true,
    siblingPurpose: false,
    shapeNote:
      "Flat 'FL - CLAY (1417)' school-code roots from old onboarding live next to the newer 'Red Apple Education' corporate tree where the same schools also appear. The textbook hybrid case.",
  },
  {
    customer: "Southwire Company LLC",
    rootShapes: ["entity_name", "geographic", "corporate_tree"],
    lifecycleMarkers: false,
    multiArchetypeStrict: true,
    siblingPurpose: false,
    shapeNote:
      "Free-form plant names ('12 For Life Florence AL'), geographic suffixes ('Bremen IN', 'Calgary Canada'), AND a deep corporate plant ('Southwire Florence' > BWP > ...) all at root level. Three shapes coexisting.",
  },
  {
    customer: "Dairy Farmers of America",
    rootShapes: ["facility_code"],
    lifecycleMarkers: false,
    multiArchetypeStrict: false,
    siblingPurpose: false,
    shapeNote:
      "Uniform encoded-string format across all 96 plants: <City>-<Brand>-<Division>-<FacilityType> (<US_ST_CITY##>). The most disciplined naming convention in the set.",
  },
  {
    customer: "Hanger, Inc.",
    rootShapes: ["geographic", "entity_name"],
    lifecycleMarkers: false,
    multiArchetypeStrict: true,
    siblingPurpose: false,
    shapeNote:
      "Two-letter state codes (AR, AZ, CA) for clinic-region roots plus specialty corporate roots (Hanger Resource Center, HRC - 1st Floor Lobby) that break the geographic pattern.",
  },
];

const rootShapeLabels: Record<RootShape, string> = {
  geographic: "geographic",
  facility_code: "facility-code",
  function_word: "function-word",
  entity_name: "entity-name",
  corporate_tree: "corporate-tree",
  school_code: "school-code",
  lifecycle_marker: "lifecycle-marker",
};

const rootShapeDescriptions: Record<RootShape, string> = {
  geographic: "States, regions, or cities as the top-level groups (e.g. CA-SF, IL-Chicago).",
  facility_code: "Short opaque codes or building IDs as the root name (e.g. ALBIR, FLLAK).",
  function_word: "Role or function as the root name instead of place (e.g. PRECINCT, CAUCUS).",
  entity_name: "Real-world names of buildings, schools, or sites as the root (e.g. Smith Hall, Main Campus).",
  corporate_tree: "Business units or divisions as the root (e.g. Region > Division > Brand).",
  school_code: "School name with an embedded ID code as the root (e.g. FL - Lincoln (04500)).",
  lifecycle_marker: "Status hints baked into the root name (e.g. 'Z-' for retired, 'Staged', 'Demo').",
};

const archetypePatterns: { family: ArchetypeFamily; description: string; examples: string[] }[] = [
  {
    family: "geographic_first",
    description:
      "Root nodes are states / countries / regions. Devices live in city or building leaves under the geo tree. Optimized for territory-based access and incident routing.",
    examples: ["Caterpillar Inc", "SGS (US)", "Hanger, Inc."],
  },
  {
    family: "facility_code",
    description:
      "Roots are short opaque codes (ALBIR, FLLAK) or fully-encoded strings (Athens-DB-Dairy Brands-Plant (US_TN_ATH01)). The taxonomy is jammed into the name. Optimized for typeahead search and matching to a master facilities ID system.",
    examples: ["Saddle Creek Logistics", "Dairy Farmers of America"],
  },
  {
    family: "function_first",
    description:
      "Root nodes encode role (PRECINCT, CAUCUS OFFICES, RESIDENCES) instead of geography. Optimized for role-based access and policy delegation. Rare but distinctive.",
    examples: ["Legislative Assembly of British Columbia"],
  },
  {
    family: "single_campus",
    description:
      "All sites are buildings on one physical site. Building IDs in parens link to an external facilities map. Depth is shallow but every node has device meaning.",
    examples: ["Hanna Boys Center", "Mount Pisgah Christian School"],
  },
  {
    family: "flat_fleet",
    description:
      "Wide top-level fan-out (Tacoma = 82 schools at root). No district-level scaffolding. Schools subdivide into zones internally. Optimized for school-day operational autonomy.",
    examples: ["Tacoma Public Schools"],
  },
  {
    family: "deep_command",
    description:
      "5+ levels: territory → division → command → region → city → site → sub-site. Mirrors a real-world chain of command. Tombstoning convention ('Z-prefix') for retired sites.",
    examples: ["Salvation Army - Western Territory"],
  },
  {
    family: "camera_only_flat",
    description:
      "Cameras only (no AC, no alarms) with a flat list of sites at depth 1. The dominant pattern in the active-paid population: most accounts that buy Verkada start here and stay here. Site tree is doing minimal work; the search and filter UX has to carry the load.",
    examples: ["~54% of all accounts (population-wide)", "863 orgs in the complex tail"],
  },
  {
    family: "camera_only_geographic",
    description:
      "Cameras only, but with a real geographic tree (state, region, city) at depth 1+. Same single-product surface area as camera_only_flat but the customer is grouping by territory. Read this as a camera-only customer about to evolve toward access control or alarms.",
    examples: ["148 orgs in the complex tail", "~$105M lifetime bookings"],
  },
  {
    family: "camera_only_deep",
    description:
      "Cameras only with 4+ levels of hierarchy. Rare but distinctive. Usually a single-product customer with a strong operational structure (chain retail, large logistics fleet) that has not yet adopted the rest of the security stack.",
    examples: ["120 orgs in the complex tail", "~$95M lifetime bookings"],
  },
];

function nodeTypeColor(type: NodeType, theme: ReturnType<typeof useHostTheme>): string {
  switch (type) {
    case "structural":
      return colorPalette.blue;
    case "mixed":
      return colorPalette.green;
    case "leaf_with_devices":
      return theme.text.tertiary;
    case "dead_end":
      return colorPalette.orange;
  }
}

function ActiveDot(): JSX.Element {
  const theme = useHostTheme();
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: theme.text.primary,
      }}
    />
  );
}

function ExamplePanel({ lines }: { lines: string[] }): JSX.Element {
  const theme = useHostTheme();
  return (
    <div
      style={{
        minHeight: 88,
        padding: "8px 10px",
        borderRadius: 6,
        border: `1px solid ${theme.stroke.tertiary}`,
        background: theme.bg.elevated,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: theme.text.primary,
        whiteSpace: "pre",
        overflowX: "auto",
      }}
      aria-label="Example"
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

function TooltipStyles(): JSX.Element {
  const theme = useHostTheme();
  const css = `
    .vk-info-anchor {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1px solid ${theme.stroke.primary};
      color: ${theme.text.secondary};
      background: transparent;
      font-size: 9px;
      font-weight: 600;
      line-height: 1;
      cursor: help;
      user-select: none;
      flex-shrink: 0;
      padding: 0;
    }
    .vk-info-anchor:hover,
    .vk-info-anchor:focus-visible {
      border-color: ${theme.text.primary};
      color: ${theme.text.primary};
      outline: none;
    }
    .vk-info-tip {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: max-content;
      max-width: 280px;
      padding: 8px 10px;
      border-radius: 6px;
      background: ${theme.bg.chrome};
      color: ${theme.text.primary};
      border: 1px solid ${theme.stroke.primary};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.32);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.45;
      text-align: left;
      white-space: normal;
      letter-spacing: 0;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: opacity 80ms ease-out, visibility 80ms ease-out;
      z-index: 9999;
    }
    .vk-info-tip::before {
      content: "";
      position: absolute;
      bottom: 100%;
      left: 6px;
      border: 6px solid transparent;
      border-bottom-color: ${theme.stroke.primary};
    }
    .vk-info-tip::after {
      content: "";
      position: absolute;
      bottom: 100%;
      left: 7px;
      transform: translateY(1px);
      border: 5px solid transparent;
      border-bottom-color: ${theme.bg.chrome};
    }
    .vk-info-tip--left {
      left: auto;
      right: 0;
    }
    .vk-info-tip--left::before {
      left: auto;
      right: 6px;
    }
    .vk-info-tip--left::after {
      left: auto;
      right: 7px;
    }
    .vk-info-anchor:hover .vk-info-tip,
    .vk-info-anchor:focus-visible .vk-info-tip {
      opacity: 1;
      visibility: visible;
    }
    .vk-info-wrap {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    /* When a column header tooltip is open, lift its cell above sibling
       cells so neighbouring th/td backgrounds don't paint over the overflowing
       tooltip. Same rule for body cells in case a tooltip lives in <td>. */
    th:has(.vk-info-anchor:hover),
    th:has(.vk-info-anchor:focus-visible),
    td:has(.vk-info-anchor:hover),
    td:has(.vk-info-anchor:focus-visible) {
      z-index: 50 !important;
    }
  `;
  return <style>{css}</style>;
}

function InfoIcon({
  tooltip,
  ariaLabel,
  placement = "right",
}: {
  tooltip: string;
  ariaLabel: string;
  placement?: "right" | "left";
}): JSX.Element {
  const tipClass =
    placement === "left" ? "vk-info-tip vk-info-tip--left" : "vk-info-tip";
  return (
    <button
      type="button"
      className="vk-info-anchor"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      i
      <span role="tooltip" className={tipClass}>
        {tooltip}
      </span>
    </button>
  );
}

function ColHead({
  label,
  tooltip,
  placement = "right",
}: {
  label: string;
  tooltip: string;
  placement?: "right" | "left";
}): JSX.Element {
  return (
    <span className="vk-info-wrap">
      <span>{label}</span>
      <InfoIcon
        tooltip={tooltip}
        ariaLabel={`${label}: ${tooltip}`}
        placement={placement}
      />
    </span>
  );
}

function NodeTypePill({ type }: { type: NodeType }): JSX.Element {
  const tone =
    type === "structural"
      ? "info"
      : type === "mixed"
      ? "success"
      : type === "leaf_with_devices"
      ? "neutral"
      : "warning";
  const label =
    type === "structural"
      ? "structural"
      : type === "mixed"
      ? "mixed"
      : type === "leaf_with_devices"
      ? "leaf"
      : "dead-end";
  return (
    <Pill size="sm" tone={tone}>
      {label}
    </Pill>
  );
}

function DeviceChips({ node }: { node: TreeNode }): JSX.Element | null {
  const chips: { label: string; value: number }[] = [];
  if (node.cam) chips.push({ label: "cam", value: node.cam });
  if (node.ac) chips.push({ label: "AC", value: node.ac });
  if (node.alarmDev) chips.push({ label: "alarm-dev", value: node.alarmDev });
  if (node.alarmPan) chips.push({ label: "alarm-pan", value: node.alarmPan });
  if (chips.length === 0) return null;
  return (
    <Row gap={6} align="center" wrap>
      {chips.map((c) => (
        <Text key={c.label} size="small" tone="secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
          {c.value} {c.label}
        </Text>
      ))}
    </Row>
  );
}

function countDescendants(node: TreeNode): number {
  if (!node.children) return 0;
  let count = node.children.length;
  for (const child of node.children) count += countDescendants(child);
  return count;
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }): JSX.Element {
  const theme = useHostTheme();
  const swatchColor = nodeTypeColor(node.type, theme);
  const indent = depth * 16;
  const hasChildren = !!node.children && node.children.length > 0;
  const [open, setOpen] = useState<boolean>(true);

  const trailing = (
    <Row gap={8} align="center">
      <DeviceChips node={node} />
      <NodeTypePill type={node.type} />
    </Row>
  );

  const leadingSwatch = (
    <div
      style={{
        width: 8,
        height: 8,
        background: swatchColor,
        borderRadius: 2,
        flexShrink: 0,
      }}
    />
  );

  if (hasChildren) {
    return (
      <div style={{ paddingLeft: indent }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "4px 0",
            background: "transparent",
            border: "none",
            color: theme.text.primary,
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 12,
              height: 12,
              color: theme.text.primary,
              fontSize: 10,
              lineHeight: 1,
              flexShrink: 0,
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 120ms ease-out",
            }}
          >
            ▶
          </span>
          {leadingSwatch}
          <Text size="small" weight="semibold">{node.name}</Text>
          <Text size="small" tone="secondary">
            ({countDescendants(node)})
          </Text>
          <span style={{ marginLeft: "auto", display: "inline-flex" }}>{trailing}</span>
        </button>
        {open ? (
          <Stack gap={2}>
            {node.children!.map((child, i) => (
              <TreeRow key={`${child.name}-${i}`} node={child} depth={depth + 1} />
            ))}
            {node.note ? (
              <div style={{ paddingLeft: 16 + (depth + 1) * 16 }}>
                <Text size="small" tone="secondary" italic>
                  {node.note}
                </Text>
              </div>
            ) : null}
          </Stack>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        paddingLeft: indent + 20,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      <Row gap={8} align="center" justify="space-between">
        <Row gap={8} align="center">
          {leadingSwatch}
          <Text size="small">{node.name}</Text>
          {node.note ? (
            <Text size="small" tone="secondary" italic>
              · {node.note}
            </Text>
          ) : null}
        </Row>
        {trailing}
      </Row>
    </div>
  );
}

function BulletList({ items }: { items: string[] }): JSX.Element {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {items.map((item) => (
        <li
          key={item}
          style={{
            display: "grid",
            gridTemplateColumns: "12px 1fr",
            columnGap: 8,
            alignItems: "start",
            lineHeight: 1.5,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              color: "#6b7280",
              fontSize: 16,
              lineHeight: 1.3,
              userSelect: "none",
            }}
          >
            •
          </span>
          <Text size="small">{item}</Text>
        </li>
      ))}
    </ul>
  );
}

function NodeTypeBar({ c }: { c: Customer }): JSX.Element {
  const theme = useHostTheme();
  const total = c.structural + c.mixed + c.leafWithDevices + c.deadEnd;
  const segments: {
    label: string;
    count: number;
    color: string;
    definition: string;
  }[] = [
    {
      label: "Structural",
      count: c.structural,
      color: colorPalette.blue,
      definition: "has children, no devices of its own",
    },
    {
      label: "Mixed",
      count: c.mixed,
      color: colorPalette.green,
      definition: "has children and its own devices",
    },
    {
      label: "Leaf",
      count: c.leafWithDevices,
      color: theme.text.tertiary,
      definition: "no children, has devices",
    },
    {
      label: "Dead-end",
      count: c.deadEnd,
      color: colorPalette.orange,
      definition: "no children, no devices (placeholder)",
    },
  ];
  return (
    <Stack gap={10}>
      <Row gap={0} style={{ height: 10, borderRadius: 5, overflow: "hidden" }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.color,
              height: 10,
            }}
            title={`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`}
          />
        ))}
      </Row>
      <Grid columns={4} gap={10}>
        {segments.map((s) => {
          const pct = Math.round((s.count / total) * 100);
          return (
            <Row key={s.label} gap={8} align="start">
              <div
                style={{
                  width: 10,
                  height: 10,
                  background: s.color,
                  borderRadius: 2,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              />
              <Stack gap={2}>
                <Row gap={6} align="baseline">
                  <Text size="small" weight="semibold">
                    {s.label}
                  </Text>
                  <Text
                    size="small"
                    tone="secondary"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {s.count.toLocaleString()} · {pct}%
                  </Text>
                </Row>
                <Text size="small" tone="secondary">
                  {s.definition}
                </Text>
              </Stack>
            </Row>
          );
        })}
      </Grid>
    </Stack>
  );
}

function MixPill({ mix }: { mix: ProductMix }): JSX.Element {
  const tone =
    mix === "cameras_access_alarms"
      ? "success"
      : mix === "cameras_access" || mix === "cameras_alarms"
      ? "info"
      : mix === "access_or_alarms_only"
      ? "warning"
      : mix === "empty"
      ? "neutral"
      : "neutral";
  const label =
    mix === "cameras_only"
      ? "cam"
      : mix === "cameras_access"
      ? "cam+AC"
      : mix === "cameras_alarms"
      ? "cam+alarms"
      : mix === "cameras_access_alarms"
      ? "all three"
      : mix === "access_or_alarms_only"
      ? "AC/alarms only"
      : "empty";
  return (
    <Pill size="sm" tone={tone}>
      {label}
    </Pill>
  );
}

function inferRootShape(name: string): RootShape {
  const trimmed = name.trim();
  if (
    /^Z[-_ ]/i.test(trimmed) ||
    /^!\s/.test(trimmed) ||
    /\b(Staged|Newly Added|To be Installed|Demo|Test\b)/i.test(trimmed)
  ) {
    return "lifecycle_marker";
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
    /\b(PRECINCT|CAUCUS|CONSTITUENCY|RESIDENCES|HQ|HEADQUARTERS|RETAIL|WAREHOUSE|OFFICE)\b/i.test(
      trimmed,
    ) &&
    trimmed === trimmed.toUpperCase()
  ) {
    return "function_word";
  }
  if (
    /\b(Red Apple|Division|Command|Territory|Region|Corporation|Holdings|Group)\b/i.test(
      trimmed,
    )
  ) {
    return "corporate_tree";
  }
  if (/^[A-Z]{2}\s*[-–]\s*[A-Z]/.test(trimmed) && /\(\d{4}\)/.test(trimmed)) {
    return "school_code";
  }
  return "entity_name";
}

function RootShapeNamePill({ name }: { name: string }): JSX.Element {
  const shape = inferRootShape(name);
  const hex = rootShapeColor[shape];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 12,
        border: `1px solid ${hex}`,
        background: `${hex}1A`,
        color: hex,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
      title={`${name} · inferred shape: ${rootShapeLabels[shape]}`}
    >
      {name}
    </span>
  );
}

function getCustomerClassification(name: string): FrequencyRow | undefined {
  return frequencyClassification.find((r) => r.customer === name);
}

function SimilarCustomersRow({
  current,
  onPick,
}: {
  current: Customer;
  onPick: (rank: number) => void;
}): JSX.Element | null {
  const peers = customers.filter(
    (c) =>
      c.archetypeFamily === current.archetypeFamily && c.rank !== current.rank,
  );
  if (peers.length === 0) return null;
  return (
    <Stack gap={6}>
      <Row gap={8} align="center" wrap>
        <Text size="small" tone="secondary">
          Other customers in this archetype family:
        </Text>
        <ArchetypePill family={current.archetypeFamily} />
      </Row>
      <Row gap={6} wrap>
        {peers.map((p) => (
          <Pill
            key={p.rank}
            size="sm"
            tone="info"
            onClick={() => onPick(p.rank)}
            title={`Jump to ${p.name}`}
          >
            #{p.rank} {p.name}
          </Pill>
        ))}
      </Row>
    </Stack>
  );
}

// Lookup of representative subtrees pulled from Athena for the 12 deep-dive
// customers. Built from data/raw/customer_subtrees.csv via
// `npm run build:subtrees`. Keyed on Customer.name (NAME_MAP in the script
// reconciles SFDC names to the names used in this file).
const customerSubtreesByName: Record<string, typeof customerSubtreesSnapshot["customers"][number]> = (() => {
  const out: Record<string, typeof customerSubtreesSnapshot["customers"][number]> = {};
  for (const c of customerSubtreesSnapshot.customers) {
    out[c.sfdcAccountName] = c;
  }
  return out;
})();

const ROOT_SHAPE_TONE: Record<string, "info" | "warning" | "success" | "renamed" | "added" | "deleted" | "neutral"> = {
  geographic: "info",
  facility_code: "warning",
  function_word: "success",
  entity_name: "neutral",
  corporate_tree: "renamed",
  school_code: "added",
  lifecycle_marker: "deleted",
};

function RepresentativeSubtrees({
  customerName,
  totalSites,
}: {
  customerName: string;
  totalSites: number;
}): JSX.Element | null {
  const data = customerSubtreesByName[customerName];
  if (!data || data.representativeSubtrees.length === 0) return null;

  return (
    <Stack gap={10}>
      <H3>
        Representative subtrees from Athena ({data.representativeSubtrees.length} sub-archetypes, {data.rootCount} total roots in extract)
      </H3>
      <Text size="small" tone="secondary">
        Real site hierarchies pulled directly from <Code>auth.directory_paths_latest</Code> for this customer. Each subtree below is the
        highest-scoring depth-1 root for one distinct root-shape pattern this
        customer uses — picked by node-type variety, depth, and readable size
        (≤ 60 nodes per subtree). When more than 60 sites sit under a root, the
        long tail is collapsed into a single &quot;[+N more sites]&quot; placeholder.
      </Text>

      <Row gap={6} align="center" wrap>
        <Text size="small" tone="secondary">Root-shape coverage in this account:</Text>
        {data.rootShapeCoverage.map((r) => (
          <Pill
            key={`cov-${r.shape}`}
            size="sm"
            tone={ROOT_SHAPE_TONE[r.shape] ?? "neutral"}
          >
            {r.shapeLabel} · {r.rootCount}
          </Pill>
        ))}
      </Row>

      <Stack gap={14}>
        {data.representativeSubtrees.map((rep, i) => (
          <Card key={`rep-${i}-${rep.rootName}`}>
            <CardHeader>
              <Row gap={8} align="center" wrap>
                <Pill size="sm" tone={ROOT_SHAPE_TONE[rep.rootShape] ?? "neutral"}>
                  {rep.rootShapeLabel}
                </Pill>
                <Text size="small" weight="semibold">{rep.rootName}</Text>
                <Text size="small" tone="secondary">
                  · {rep.totalNodes} nodes · depth {rep.maxDepth} · {rep.distinctNodeTypes} node type{rep.distinctNodeTypes === 1 ? "" : "s"}
                </Text>
              </Row>
            </CardHeader>
            <CardBody>
              <Stack gap={8}>
                <Text size="small" tone="secondary">{rep.rationale}</Text>
                <Stack gap={2}>
                  {rep.subtree.map((node, idx) => (
                    <TreeRow
                      key={`${rep.rootName}-${idx}`}
                      node={node as unknown as TreeNode}
                      depth={0}
                    />
                  ))}
                </Stack>
              </Stack>
            </CardBody>
          </Card>
        ))}
      </Stack>

      <Text size="small" tone="secondary">
        Each subtree above is one example of a sub-archetype this customer uses. The header pill is the inferred root shape; pill counts above the cards show how many depth-1 roots fall into each shape across all {totalSites} sites in the account.
      </Text>
    </Stack>
  );
}

function CustomerDetail({
  c,
  onPickCustomer,
}: {
  c: Customer;
  onPickCustomer: (rank: number) => void;
}): JSX.Element {
  const classification = getCustomerClassification(c.name);

  return (
    <Stack gap={20}>
      {/* HEADER: name + meta pills + archetype on one row each */}
      <Stack gap={8}>
        <Row gap={10} align="center" wrap>
          <H2 id={`customer-${c.rank}`}>{c.name}</H2>
          <Pill size="sm" tone="neutral">
            {c.industry}
          </Pill>
          <Pill size="sm" tone="neutral">
            {c.segment}
          </Pill>
          <Pill size="sm" tone="neutral">
            {c.country}
          </Pill>
        </Row>
        <Row gap={8} align="center" wrap>
          <ArchetypePillGroup
            primary={c.archetypeFamily}
            secondary={c.secondaryArchetypeFamilies}
          />
          <Text size="small" weight="semibold">
            {c.archetype}
          </Text>
          <Text size="small" tone="secondary">
            · {c.orgName} · ${c.bookingsK.toLocaleString()}K lifetime bookings
          </Text>
        </Row>
      </Stack>

      {/* NARRATIVE: distinctiveness moved up so it answers "why this customer?" first */}
      <Card>
        <CardHeader>What's distinctive about this customer</CardHeader>
        <CardBody>
          <Grid columns={2} gap={20}>
            <Stack gap={8}>
              <Text size="small" weight="semibold">
                Use cases &amp; structural intent
              </Text>
              <BulletList items={c.useCases} />
            </Stack>
            <Stack gap={8}>
              <Text size="small" weight="semibold">
                Observations
              </Text>
              <BulletList items={c.observations} />
            </Stack>
          </Grid>
          {classification ? (
            <Stack gap={6} style={{ marginTop: 16 }}>
              <Text size="small" weight="semibold">
                Naming shape note
              </Text>
              <Text size="small">{classification.shapeNote}</Text>
            </Stack>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Key takeaways for product</CardHeader>
        <CardBody>
          <Text size="small" tone="secondary" style={{ marginBottom: 12 }}>
            What this customer's site structure implies for how Command should
            evolve. Read these as testable hypotheses, not verdicts.
          </Text>
          <BulletList items={c.keyTakeaways} />
        </CardBody>
      </Card>

      <CustomerSpatialFingerprint customerName={c.name} />

      {/* STATS: grouped into Scope and Devices with section labels */}
      <Stack gap={6}>
        <Text size="small" weight="semibold" tone="secondary">
          SCOPE
        </Text>
        <Grid columns={4} gap={12}>
          <Stat value={c.totalSites.toLocaleString()} label="Total sites" />
          <Stat value={c.maxDepth.toLocaleString()} label="Max depth" />
          <Stat
            value={c.topLevelNodes.toLocaleString()}
            label="Top-level nodes"
          />
          <Stat
            value={c.productMixes.toLocaleString()}
            label="Product mixes"
          />
        </Grid>
      </Stack>

      <Stack gap={6}>
        <Text size="small" weight="semibold" tone="secondary">
          DEVICES
        </Text>
        <Grid columns={4} gap={12}>
          <Stat value={c.cameras.toLocaleString()} label="Cameras" />
          <Stat value={c.acPanels.toLocaleString()} label="AC panels" />
          <Stat value={c.alarmDevices.toLocaleString()} label="Alarm devices" />
          <Stat value={c.alarmPanels.toLocaleString()} label="Alarm panels" />
        </Grid>
      </Stack>

      {/* COMPOSITION: bar + inline legend with definitions (no separate legend anywhere else) */}
      <Stack gap={6}>
        <H3>Node-type composition (full org, {c.totalSites} sites)</H3>
        <NodeTypeBar c={c} />
      </Stack>

      <Divider />

      <RepresentativeSubtrees customerName={c.name} totalSites={c.totalSites} />

      <Divider />

      {/* TOP-LEVEL NODES: pills colored by inferred shape, plus shapes-in-use chips */}
      <Stack gap={8}>
        <H3>Top-level node names</H3>
        {classification ? (
          <Row gap={8} align="center" wrap>
            <Text size="small" tone="secondary">
              Shapes in use:
            </Text>
            {classification.rootShapes.map((s) => (
              <ShapeChip key={s} shape={s} />
            ))}
          </Row>
        ) : null}
        <Text size="small" tone="secondary">
          First {Math.min(c.rootNames.length, 12)} of {c.topLevelNodes} roots,
          alphabetical. Pill color reflects the inferred root shape.
        </Text>
        <Row gap={6} wrap>
          {c.rootNames.map((n) => (
            <RootShapeNamePill key={n} name={n} />
          ))}
        </Row>
      </Stack>

      <Stack gap={6}>
        <H3>Representative branches from the full hierarchy</H3>
        <Table
          headers={[
            <ColHead
              label="Kind"
              tooltip="What kind of branch this is. For example: a flat leaf is one node with devices; a deep plant is a multi-level subtree."
            />,
            <ColHead
              label="Path"
              tooltip="Full path from the top of this customer's hierarchy down to the site."
              placement="left"
            />,
            <ColHead
              label="Mix"
              tooltip="Which Verkada products are deployed at this site."
              placement="left"
            />,
          ]}
          columnAlign={["left", "left", "left"]}
          rows={c.exampleBranches.map((b) => [
            <Text size="small">{b.kind}</Text>,
            <Code>{b.path}</Code>,
            <MixPill mix={b.mix} />,
          ])}
        />
      </Stack>

      <Divider />

      {/* SIMILAR CUSTOMERS: jump to a peer in the same archetype family */}
      <SimilarCustomersRow current={c} onPick={onPickCustomer} />
    </Stack>
  );
}

function CustomerTabs(): JSX.Element {
  const [activeRank, setActiveRank] = useCanvasState<number>(
    "activeCustomerRank",
    1,
  );
  const active = customers.find((c) => c.rank === activeRank) ?? customers[0];
  const theme = useHostTheme();

  return (
    <Stack gap={16}>
      <Stack gap={8}>
        <H2 id="customer-deep-dives">Customer deep-dives</H2>
        <Text tone="secondary" size="small">
          Each tab shows one customer's emblematic subtree (the root that best
          illustrates their structural pattern), grouped scope and device
          stats, the full node-type composition, and the narrative on what's
          distinctive. Pick a customer below.
        </Text>
      </Stack>

      <div
        style={{
          background: theme.fill.tertiary,
          border: `2px solid ${theme.stroke.primary}`,
          borderRadius: 8,
          padding: 12,
        }}
      >
        <Stack gap={8}>
          <Row gap={10} align="center" justify="space-between" wrap>
            <Text size="small" weight="semibold" tone="secondary">
              PICK A CUSTOMER
            </Text>
            <Row gap={6} align="center">
              <Text size="small" tone="secondary">
                Currently viewing:
              </Text>
              <Text size="small" weight="semibold">
                #{active.rank} {active.name}
              </Text>
            </Row>
          </Row>
          <Row gap={6} wrap>
            {customers.map((c) => (
              <Pill
                key={c.rank}
                size="md"
                tone="info"
                active={c.rank === activeRank}
                onClick={() => setActiveRank(c.rank)}
                title={
                  c.rank === activeRank
                    ? `${c.name}: currently selected`
                    : `View ${c.name} detail`
                }
                leadingContent={c.rank === activeRank ? <ActiveDot /> : null}
              >
                #{c.rank} {c.name}
              </Pill>
            ))}
          </Row>
        </Stack>
      </div>

      <Card>
        <CardBody>
          <CustomerDetail c={active} onPickCustomer={setActiveRank} />
        </CardBody>
      </Card>
    </Stack>
  );
}

const rootShapeColor: Record<RootShape, string> = {
  geographic: colorPalette.blue,
  entity_name: colorPalette.purple,
  facility_code: colorPalette.orange,
  corporate_tree: colorPalette.gray,
  function_word: colorPalette.green,
  school_code: colorPalette.pink,
  lifecycle_marker: colorPalette.yellow,
};

// Per-shape text color, tuned for >= 4.5:1 AA against the chip's tinted dark
// background. Border still uses the saturated source color so the chip stays
// visually distinct. Gray and blue source colors fail AA at 11px otherwise.
const rootShapeTextColor: Record<RootShape, string> = {
  geographic: "#93c5fd",
  entity_name: "#c4b5fd",
  facility_code: "#fcd34d",
  corporate_tree: "#cbd5e1",
  function_word: "#6ee7b7",
  school_code: "#f9a8d4",
  lifecycle_marker: "#facc15",
};

const ShapeChip = ({ shape }: { shape: RootShape }): JSX.Element => {
  const hex = rootShapeColor[shape];
  const fg = rootShapeTextColor[shape];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 10,
        border: `1px solid ${hex}`,
        background: `${hex}22`,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {rootShapeLabels[shape]}
    </span>
  );
};

const ArchetypePill = ({
  family,
  label,
}: {
  family: ArchetypeFamily;
  label?: string;
}): JSX.Element => {
  return (
    <Pill size="sm" tone={archetypeFamilyTone[family]}>
      {label ?? archetypeFamilyLabels[family]}
    </Pill>
  );
};

const ArchetypePillGroup = ({
  primary,
  secondary,
}: {
  primary: ArchetypeFamily;
  secondary?: ArchetypeFamily[];
}): JSX.Element => {
  const theme = useHostTheme();
  const items = secondary ?? [];
  return (
    <Row gap={6} wrap>
      <ArchetypePill family={primary} />
      {items.length > 0 ? (
        <>
          <Text size="small" tone="secondary" style={{ color: theme.text.tertiary }}>
            also
          </Text>
          {items.map((f) => (
            <Pill key={`sec-${f}`} size="sm" tone={archetypeFamilyTone[f]} variant="outline">
              {archetypeFamilyLabels[f]}
            </Pill>
          ))}
        </>
      ) : null}
    </Row>
  );
};

const YesNoPill = ({ value }: { value: boolean }): JSX.Element => {
  return (
    <Pill size="sm" tone={value ? "info" : "neutral"}>
      {value ? "Yes" : "No"}
    </Pill>
  );
};

const frequencyTotal = frequencyClassification.length;
const multiArchetypeOrgs = frequencyClassification.filter((r) => r.multiArchetypeStrict);
const siblingPurposeOrgs = frequencyClassification.filter((r) => r.siblingPurpose);
const lifecycleOrgs = frequencyClassification.filter((r) => r.lifecycleMarkers);
const singleShapeOrgs = frequencyClassification.filter(
  (r) => r.rootShapes.filter((s) => s !== "lifecycle_marker").length === 1,
);

const shapeCounts: { shape: RootShape; count: number }[] = (
  [
    "geographic",
    "entity_name",
    "facility_code",
    "corporate_tree",
    "function_word",
    "school_code",
    "lifecycle_marker",
  ] as RootShape[]
).map((shape) => ({
  shape,
  count: frequencyClassification.filter((r) => r.rootShapes.includes(shape)).length,
}));

const ArchetypeFrequencyStats = (): JSX.Element => {
  const total = frequencyTotal;
  return (
    <Grid columns={4} gap={16}>
      <Stat
        value={`${multiArchetypeOrgs.length} / ${total}`}
        label="Multi-archetype in qualitative sample"
        tone="warning"
      />
      <Stat
        value={`${singleShapeOrgs.length} / ${total}`}
        label="Single-shape orgs"
      />
      <Stat
        value={`${siblingPurposeOrgs.length} / ${total}`}
        label="Sibling-purpose at root"
      />
      <Stat
        value={`${lifecycleOrgs.length} / ${total}`}
        label="Lifecycle markers in names"
      />
    </Grid>
  );
};

const PopulationCaveat = (): JSX.Element => {
  const totals = aggregateSnapshot.totals;
  const simple = aggregateSnapshot.simpleBase.cameraOnlyFlat;
  const otherOrgs = (totals.totalOrgs - totals.complexTailSize).toLocaleString();
  return (
    <Callout tone="info" title={`Why these twelve and what about the other ${otherOrgs}?`}>
      These twelve customers were hand-picked from the complex tail. The other
      {" "}
      <Text as="span" weight="semibold">
        {(totals.totalOrgs - totals.complexTailSize).toLocaleString()}
      </Text>{" "}
      paid orgs ({(simple.orgShare * 100).toFixed(0)}% camera-only flat, the
      rest small / medium deployments) are explicitly out of scope: their
      hierarchies are trivial by construction.{" "}
      <Text as="span" weight="semibold">
        The complex tail is {totals.complexTailSize.toLocaleString()} orgs
        ({(totals.complexTailOrgShare * 100).toFixed(0)}% of the base) holding
        {" "}{(totals.complexTailBookingsShare * 100).toFixed(0)}% of all
        lifetime bookings.
      </Text>{" "}
      Those are the customers where hierarchy design actually matters; see the
      Aggregate patterns VIEW for the full breakdown.
    </Callout>
  );
};

const RootShapeAnalysis = (): JSX.Element => {
  const total = frequencyTotal;

  return (
    <Stack gap={16}>
      <Stack gap={10}>
        <H3>Root-shape coverage across the 12 customers</H3>
        <Text size="small" tone="secondary">
          How many of the 12 customers have at least one root of each shape?
          Most customers fit 1 to 2 shapes; orgs that carry both a primary and
          a secondary archetype contribute to 3+. Qualitative sample only;
          population-scoped naming distributions are in the Aggregate VIEW.
        </Text>
        <Table
          headers={[
            <ColHead
              label="Root shape"
              tooltip="How this customer names their top-level sites. For example, by city, by building code, or by business unit."
            />,
            "Description",
            <ColHead
              label="Customers"
              tooltip="How many of the 12 customers use this naming style at the top of their hierarchy."
              placement="left"
            />,
            <ColHead
              label="Share"
              tooltip="Percentage of the 12 customers that use this style."
              placement="left"
            />,
          ]}
          columnAlign={["left", "left", "right", "right"]}
          rows={shapeCounts.map((s) => [
            <ShapeChip shape={s.shape} />,
            <Text size="small" tone="secondary">
              {rootShapeDescriptions[s.shape]}
            </Text>,
            <Text size="small" style={{ fontVariantNumeric: "tabular-nums" }}>
              {`${s.count} / ${total}`}
            </Text>,
            <Text size="small" style={{ fontVariantNumeric: "tabular-nums" }}>
              {`${Math.round((s.count / total) * 100)}%`}
            </Text>,
          ])}
        />
      </Stack>

      <Stack gap={10}>
        <H3>Per-customer root-shape classification</H3>
        <Text size="small" tone="secondary">
          One row per customer. Hover any column header for a quick explanation.
        </Text>
        <Table
          headers={[
            <ColHead
              label="Customer"
              tooltip="One of the 12 customers analyzed in this canvas."
            />,
            <ColHead
              label="Root shapes at depth 1"
              tooltip="All the naming styles this customer uses at the top of their hierarchy."
            />,
            <ColHead
              label="Multi-archetype"
              tooltip="Whether this customer mixes two or more different naming styles at the top of their hierarchy."
            />,
            <ColHead
              label="Sibling-purpose"
              tooltip="Whether the customer's top-level groups serve clearly different functions, not just different geographies."
              placement="left"
            />,
            <ColHead
              label="Lifecycle markers"
              tooltip="Whether the customer puts status hints in site names, like 'Z-' for retired or 'Staged' for not-yet-deployed."
              placement="left"
            />,
          ]}
          columnAlign={["left", "left", "left", "left", "left"]}
          rows={frequencyClassification.map((r) => [
            <Text size="small" weight="semibold">
              {r.customer}
            </Text>,
            <Row gap={4} wrap>
              {r.rootShapes.map((s) => (
                <ShapeChip key={s} shape={s} />
              ))}
            </Row>,
            <YesNoPill value={r.multiArchetypeStrict} />,
            <YesNoPill value={r.siblingPurpose} />,
            <YesNoPill value={r.lifecycleMarkers} />,
          ])}
        />
        <Stack gap={8}>
          <Text size="small" tone="secondary">
            Per-customer notes on how each one names its top-level groups.
            Same data as the table above, with the chips inline next to the
            description so you can scan one customer at a time.
          </Text>
          <Grid columns={2} gap={10}>
            {frequencyClassification.map((r) => (
              <div
                key={r.customer}
                style={{
                  background: "#111827",
                  border: "1px solid #374151",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <Row gap={6} align="center" wrap>
                  <Text size="small" weight="semibold">
                    {r.customer}
                  </Text>
                  {r.rootShapes.map((s) => (
                    <ShapeChip key={s} shape={s} />
                  ))}
                </Row>
                <Text size="small" tone="secondary">
                  {r.shapeNote}
                </Text>
              </div>
            ))}
          </Grid>
        </Stack>
      </Stack>
    </Stack>
  );
};

const WhatWeLearnedSection = (): JSX.Element => {
  return (
    <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>1. Site name is doing too much work</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Customers encode city, brand, division, facility type, building
                code, and equipment names into the site-name string because the
                data model has nowhere else to put them.
              </Text>
              <ExamplePanel
                lines={[
                  "Athens-DB-Dairy Brands-Plant (US_TN_ATH01)",
                  "Houston-DFA-Fluid Milk-Plant (US_TX_HOU03)",
                  "Atlanta-IH-Industrial-Plant (US_GA_ATL07)",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: site name is the search key. Truncating it in the
                UI loses information. Adding structured fields (lat/long,
                building ID, lifecycle state, function tag) is high-value.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>2. Lifecycle state is being hacked into names</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Three of twelve customers bake lifecycle state into root names.
                The two largest by site count are on the list, so this scales
                with org size.
              </Text>
              <ExamplePanel
                lines={[
                  "Salvation Army (377 sites) : Z- prefix retired",
                  "CSUSA          (143 sites) : ! prefix pinned",
                  "Mt Pisgah      (33 sites)  : Staged / NewlyAdded",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: customers want explicit site states (active /
                staged / planned / retired). Adding <Code>site_status</Code>{" "}
                would let dashboards filter on intent instead of inferring from
                naming tricks.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>3. Empty dead-end leaves are intentional</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Tacoma (38), Caterpillar (32), Southwire (28), Salvation Army
                (42) all carry sizable dead-end empty leaves. They look like
                planning placeholders and decommissioned sites, not bugs.
              </Text>
              <ExamplePanel
                lines={[
                  "Tacoma > Wilson HS > (empty, planned 2026)",
                  "Cat > IL-Decatur > Bldg 7 (decommissioned)",
                  "SA-W > Tucson > Future Thrift Store",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: empty sites are a feature, not a defect. Don't
                prompt users to "clean up empty sites."
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>4. Function-first is rare but real</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Only BC Legislative Assembly buckets the tree by role instead
                of geography. AC panels (144) and alarm devices (287) outweigh
                cameras (309) there.
              </Text>
              <ExamplePanel
                lines={[
                  "PRECINCT > West Annex > Floor 2",
                  "CAUCUS OFFICES > Liberal > Suite 110",
                  "CONSTITUENCY > Vancouver-East",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: when role drives access policy, the tree mirrors
                role groupings. Geographic-first products penalize this org.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>5. Hybrid trees signal org evolution</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Two of twelve (CSUSA, Southwire) show two parallel trees built
                without consolidating the first. Same sites can show up under
                both trees.
              </Text>
              <ExamplePanel
                lines={[
                  "CSUSA (legacy) : FL - Lincoln Elem (04500)",
                  "CSUSA (new)    : Red Apple Education > Schools > FL",
                  "Southwire      : Atl Spark Office vs Atlanta Spark Office",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: a generic merge-subtrees / bulk-move tool would
                unblock this failure mode. It's worth building even if the
                population frequency turns out low.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>6. Depth ≠ complexity</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Tacoma is depth-3 and the most operationally interesting.
                Salvation Army Western is depth-7 and ~96% cameras-only.
                Deeper is not richer.
              </Text>
              <ExamplePanel
                lines={[
                  "Tacoma   (depth 3): District > School > Zone",
                  "Cat      (depth 4): State > City > Bldg > Floor",
                  "SA-W     (depth 7): Territory > … > Sub-site",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: the information density is in the first three
                levels. Default tree views to depth-3 with expand-on-demand.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>7. Mixing two or more naming shapes is common at the high-complexity end</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Five of twelve (42%) carry two or more distinct naming shapes
                at root, across manufacturing, civic, K-12, and health care.
              </Text>
              <ExamplePanel
                lines={[
                  "Caterpillar      : geographic + entity-name",
                  "CSUSA            : school-code + corporate-tree",
                  "Southwire        : entity-name + geographic",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: hierarchy migration, merge, and refactor tooling
                has broad applicability across industries, not a niche.
              </Text>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>8. Sibling-purpose lives one level below the root</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                Only BC Leg uses pure function-word roots at depth 1. Other
                big orgs put sibling-purpose structures at depth 2 under a
                corporate root.
              </Text>
              <ExamplePanel
                lines={[
                  "BC Leg (root)  : PRECINCT / CAUCUS / RESIDENCES",
                  "SA-W (depth 2) : ARC Command / Cascade Division",
                  "CSUSA (depth 2): Red Apple Education > Schools / Ops",
                ]}
              />
              <Text size="small" tone="secondary">
                Implication: for "different purposes in one org," inspect
                depth 2, not depth 1. Purpose-aware filtering should run there.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>
  );
};

function AccountLink({
  name,
  rank,
  onPick,
}: {
  name: string;
  rank: number;
  onPick?: (rank: number) => void;
}): JSX.Element {
  if (!onPick) {
    return (
      <Text weight="semibold" size="small">
        {name}
      </Text>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPick(rank)}
      title={`Open ${name} detail`}
      style={{
        background: "transparent",
        border: "none",
        padding: "12px 4px",
        margin: "-12px -4px",
        minHeight: 44,
        cursor: "pointer",
        font: "inherit",
        color: "#93c5fd",
        textAlign: "left",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "underline",
        textDecorationColor: "rgba(147, 197, 253, 0.4)",
        textUnderlineOffset: 3,
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#bfdbfe";
        (e.currentTarget as HTMLButtonElement).style.textDecorationColor =
          "#bfdbfe";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd";
        (e.currentTarget as HTMLButtonElement).style.textDecorationColor =
          "rgba(147, 197, 253, 0.4)";
      }}
    >
      {name}
    </button>
  );
}

const CustomerComparisonTable = ({
  onPickCustomer,
}: {
  onPickCustomer?: (rank: number) => void;
} = {}): JSX.Element => {
  return (
    <Table
      headers={[
        <ColHead label="#" tooltip="Where this customer ranks in this analysis. #1 is the most complex." />,
        <ColHead label="Account" tooltip="Customer name. Click to open this customer's detail view." />,
        <ColHead label="Industry" tooltip="Customer's industry." />,
        <ColHead label="Archetype" tooltip="The family of hierarchy pattern this customer uses. Matched colors across the canvas group customers in the same family together." />,
        <ColHead label="Sites" tooltip="Total number of sites in this customer's account." />,
        <ColHead label="Max depth" tooltip="How deep this customer's hierarchy goes. Depth 3 means something like 'Region > Building > Floor'." />,
        <ColHead label="Mixes" tooltip="How many different product combinations show up across this customer's sites. Higher means more variety." />,
        <ColHead label="Top-level" tooltip="How many top-level groups this customer has." />,
        <ColHead label="Structural" tooltip="Folders. Nodes that group other sites but have no devices of their own." />,
        <ColHead label="Mixed" tooltip="Nodes that both group other sites and have their own devices." />,
        <ColHead label="Leaf" tooltip="End-of-line sites with devices but no sub-sites." />,
        <ColHead label="Dead-end" tooltip="End-of-line sites with no devices. Often placeholders for sites that were never deployed." />,
        <ColHead label="Cameras" tooltip="Total cameras deployed across this customer's sites." />,
        <ColHead label="AC" tooltip="Total access controller panels deployed." placement="left" />,
        <ColHead label="Alarms" tooltip="Total alarm sensors deployed. Does not include alarm panels." placement="left" />,
      ]}
      columnAlign={[
        "right",
        "left",
        "left",
        "left",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
        "right",
      ]}
      stickyLeftCount={2}
      colMinWidth={[
        44,
        260,
        180,
        170,
        60,
        80,
        60,
        80,
        80,
        60,
        60,
        80,
        80,
        50,
        70,
      ]}
      colNoWrap={[
        true,
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ]}
      rows={customers.map((c) => {
        const num = (n: number | string): JSX.Element => (
          <Text size="small" style={{ fontVariantNumeric: "tabular-nums" }}>
            {typeof n === "number" ? n.toLocaleString() : n}
          </Text>
        );
        return [
          num(c.rank),
          <AccountLink name={c.name} rank={c.rank} onPick={onPickCustomer} />,
          <Text size="small" tone="secondary">
            {c.industry}
          </Text>,
          <ArchetypePillGroup
            primary={c.archetypeFamily}
            secondary={c.secondaryArchetypeFamilies}
          />,
          num(c.totalSites),
          num(c.maxDepth),
          num(c.productMixes),
          num(c.topLevelNodes),
          num(c.structural),
          num(c.mixed),
          num(c.leafWithDevices),
          num(c.deadEnd),
          num(c.cameras),
          num(c.acPanels),
          num(c.alarmDevices),
        ];
      })}
    />
  );
};

const ArchetypeFamilyCards = (): JSX.Element => {
  return (
    <Grid columns={2} gap={12}>
      {archetypePatterns.map((a) => (
        <Card key={a.family}>
          <CardHeader trailing={<ArchetypePill family={a.family} />}>
            {archetypeFamilyLabels[a.family]}
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">{a.description}</Text>
              <Row gap={6} wrap>
                {a.examples.map((e) => (
                  <Pill size="sm" key={e} tone="neutral">
                    {e}
                  </Pill>
                ))}
              </Row>
            </Stack>
          </CardBody>
        </Card>
      ))}
    </Grid>
  );
};

type View = "overview" | "detail" | "aggregate";

const SharedHeader = (): JSX.Element => {
  const totalSites = customers.reduce((a, c) => a + c.totalSites, 0);
  const totalCams = customers.reduce((a, c) => a + c.cameras, 0);
  const totalAC = customers.reduce((a, c) => a + c.acPanels, 0);
  const totalAlarms = customers.reduce((a, c) => a + c.alarmDevices + c.alarmPanels, 0);

  const totals = aggregateSnapshot.totals;
  const tailBookingsB = (totals.complexTailBookings / 1_000_000_000).toFixed(2);

  return (
    <Stack gap={16}>
      <Stack gap={6}>
        <H1>Multi-product site hierarchy archetypes</H1>
        <Text tone="secondary">
          How {totals.totalOrgs.toLocaleString()} active-paid Verkada accounts
          structure their Command site hierarchies, with a deep dive into the
          {" "}
          <Text as="span" weight="semibold">
            complex tail
          </Text>{" "}
          of {totals.complexTailSize.toLocaleString()} customers
          ({(totals.complexTailOrgShare * 100).toFixed(1)}% of accounts) that
          drive ${tailBookingsB}B
          ({(totals.complexTailBookingsShare * 100).toFixed(1)}%) of lifetime
          bookings. Goal: understand how naming and depth correlate with
          industry, scale, and product mix.
        </Text>
      </Stack>

      <Grid columns={4} gap={16}>
        <Stat
          value={totals.totalOrgs.toLocaleString()}
          label="Active-paid accounts (deduped)"
        />
        <Stat
          value={totals.complexTailSize.toLocaleString()}
          label="Complex-tail orgs (focus of this study)"
          tone="info"
        />
        <Stat
          value={`${(totals.complexTailBookingsShare * 100).toFixed(0)}%`}
          label="Lifetime bookings concentration in the tail"
          tone="success"
        />
        <Stat value="12" label="Hand-picked customers for deep-dive" />
      </Grid>

      <Callout tone="neutral" title="About this data">
        <Stack gap={6}>
          <Text size="small" tone="secondary">
            Athena via Hex, deduped to one row per Salesforce account (primary
            org = the org with the most devices). Site and device counts mapped
            through{" "}
            <Code>auth.directory_paths_latest</Code>; entity types{" "}
            <Code>camera</Code>, <Code>accessController</Code>,{" "}
            <Code>alarmsDevice</Code>, <Code>alarmSystem</Code>. The 12
            hand-picked customers in the deep-dive view cover{" "}
            {totalSites.toLocaleString()} sites,{" "}
            {totalCams.toLocaleString()} cameras, and{" "}
            {(totalAC + totalAlarms).toLocaleString()} AC + alarm devices.
          </Text>
          <Text size="small" tone="secondary">
            Footnote (data coverage):{" "}
            {taxonomySnapshot.unclassifiedTotals.orgs.toLocaleString()}{" "}
            accounts ({(taxonomySnapshot.unclassifiedTotals.shareOfOrgs * 100).toFixed(1)}%
            of the population, ~$
            {(taxonomySnapshot.unclassifiedTotals.bookings / 1_000_000).toFixed(1)}M
            lifetime bookings) have no Salesforce industry tag and are excluded
            from the industry breakdown. They are still included in the
            top-line population total.
          </Text>
        </Stack>
      </Callout>
    </Stack>
  );
};

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_COLUMNS = [
  "customer_rank",
  "customer_name",
  "customer_org_name",
  "customer_segment",
  "customer_industry",
  "customer_country",
  "customer_archetype_family",
  "customer_archetype_label",
  "node_id",
  "parent_node_id",
  "depth",
  "path",
  "name",
  "node_type",
  "product_mix",
  "cameras",
  "ac_panels",
  "alarm_devices",
  "alarm_panels",
  "note",
] as const;

type CsvRow = Record<(typeof CSV_COLUMNS)[number], string | number>;

function buildCsvRows(): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const c of customers) {
    c.subtree.forEach((rootNode, rootIdx) => {
      walkForCsv(c, rootNode, [], `${c.rank}`, [rootIdx + 1], rows);
    });
  }
  return rows;
}

function walkForCsv(
  c: Customer,
  node: TreeNode,
  parentPath: string[],
  parentIdPrefix: string,
  indexPath: number[],
  out: CsvRow[],
): void {
  const path = [...parentPath, node.name];
  const nodeId = `${parentIdPrefix}.${indexPath.join(".")}`;
  const parentNodeId =
    indexPath.length === 1 ? "" : `${parentIdPrefix}.${indexPath.slice(0, -1).join(".")}`;
  out.push({
    customer_rank: c.rank,
    customer_name: c.name,
    customer_org_name: c.orgName,
    customer_segment: c.segment,
    customer_industry: c.industry,
    customer_country: c.country,
    customer_archetype_family: c.archetypeFamily,
    customer_archetype_label: archetypeFamilyLabels[c.archetypeFamily],
    node_id: nodeId,
    parent_node_id: parentNodeId,
    depth: path.length,
    path: path.join(" > "),
    name: node.name,
    node_type: node.type,
    product_mix: node.mix ?? "",
    cameras: node.cam ?? 0,
    ac_panels: node.ac ?? 0,
    alarm_devices: node.alarmDev ?? 0,
    alarm_panels: node.alarmPan ?? 0,
    note: node.note ?? "",
  });
  if (node.children && node.children.length > 0) {
    node.children.forEach((child, i) => {
      walkForCsv(c, child, path, parentIdPrefix, [...indexPath, i + 1], out);
    });
  }
}

function buildCsvString(): string {
  const rows = buildCsvRows();
  const header = CSV_COLUMNS.join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

function downloadCsv(): void {
  const csv = buildCsvString();
  const filename = `verkada-site-hierarchy-archetypes-12-customers-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  try {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    window.open(dataUrl, "_blank");
  }
}

const ViewSwitcher = ({
  view,
  setView,
}: {
  view: View;
  setView: (v: View) => void;
}): JSX.Element => {
  const theme = useHostTheme();
  const rowCount = buildCsvRows().length;
  return (
    <div
      style={{
        background: theme.fill.tertiary,
        border: `2px solid ${theme.stroke.primary}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Stack gap={8}>
        <Row gap={10} align="center" justify="space-between" wrap>
          <Row gap={10} align="center">
            <Text size="small" weight="semibold" tone="secondary">
              VIEW
            </Text>
            <Pill
              size="md"
              tone="info"
              active={view === "overview"}
              onClick={() => setView("overview")}
              title={
                view === "overview"
                  ? "Overview: currently selected"
                  : "Switch to the cross-cutting overview"
              }
              leadingContent={view === "overview" ? <ActiveDot /> : null}
            >
              Overview
            </Pill>
            <Pill
              size="md"
              tone="info"
              active={view === "detail"}
              onClick={() => setView("detail")}
              title={
                view === "detail"
                  ? "Customer deep-dives: currently selected"
                  : "Switch to per-customer deep-dives"
              }
              leadingContent={view === "detail" ? <ActiveDot /> : null}
            >
              Customer deep-dives (12)
            </Pill>
            <Pill
              size="md"
              tone="info"
              active={view === "aggregate"}
              onClick={() => setView("aggregate")}
              title={
                view === "aggregate"
                  ? "Aggregate patterns: currently selected"
                  : `Switch to the complex-tail analysis (top ${(aggregateSnapshot.totals.complexTailSize / 1000).toFixed(1)}K orgs holding ${(aggregateSnapshot.totals.complexTailBookingsShare * 100).toFixed(0)}% of bookings)`
              }
              leadingContent={view === "aggregate" ? <ActiveDot /> : null}
            >
              Aggregate patterns (complex tail)
            </Pill>
          </Row>
          <Row gap={10} align="center">
            <Text size="small" tone="secondary">
              {rowCount.toLocaleString()} nodes across 12 customers
            </Text>
            <Button
              variant="secondary"
              onClick={downloadCsv}
              title="Download all 12 customers' emblematic site subtrees as a single CSV. Designed to feed into Cursor / Claude for generating Maps navigation mockups."
            >
              Download CSV ({rowCount.toLocaleString()} rows)
            </Button>
          </Row>
        </Row>
        <Text size="small" tone="secondary">
          Click a pill to switch views. Selection persists across reloads. The CSV
          includes node_id, parent_node_id, depth, full path, node type, product mix,
          and per-product device counts for every node shown in the deep-dives.
        </Text>
      </Stack>
    </div>
  );
};

// Shared between the scroll-spy and any explicit "jump to section" callers.
// While Date.now() < this value, the spy suppresses its hash updates so an
// in-flight smooth scroll can finish without the spy retargeting it.
const scrollSpySuppress = { until: 0 };

function scrollToSection(targetId: string): void {
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const prevTabIndex = el.getAttribute("tabindex");
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    if (prevTabIndex === null) {
      setTimeout(() => {
        if (el.getAttribute("tabindex") === "-1") {
          el.removeAttribute("tabindex");
        }
      }, 0);
    }
  }
  if (typeof window !== "undefined" && window.history) {
    scrollSpySuppress.until = Date.now() + 1200;
    window.history.replaceState(null, "", `#${targetId}`);
  }
}

function SectionJumpButton({
  targetId,
  label,
}: {
  targetId: string;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => scrollToSection(targetId)}
      title={`Scroll to the ${label.replace(/\s*→$/, "")} section`}
      style={{
        background: "rgba(59, 130, 246, 0.12)",
        border: "1px solid rgba(59, 130, 246, 0.5)",
        borderRadius: 6,
        color: "#93c5fd",
        padding: "6px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        font: "inherit",
        whiteSpace: "nowrap",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(59, 130, 246, 0.22)";
        (e.currentTarget as HTMLButtonElement).style.color = "#bfdbfe";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(59, 130, 246, 0.12)";
        (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd";
      }}
    >
      {label}
    </button>
  );
}

const TOC_ENTRIES: { id: string; label: string }[] = [
  { id: "customers-at-a-glance", label: "1. Customers at a glance" },
  { id: "what-we-measured", label: "2. What we measured" },
  { id: "root-shapes", label: "3. Root shapes" },
  { id: "archetype-families", label: "4. Archetype families" },
  { id: "aggregate-patterns", label: "5. Aggregate patterns (complex tail)" },
  { id: "what-we-learned", label: "6. What we learned" },
  { id: "method", label: "Method" },
];

function TableOfContents(): JSX.Element {
  return (
    <Stack gap={6}>
      <Text size="small" weight="semibold" tone="secondary">
        JUMP TO
      </Text>
      <Row gap={6} wrap>
        {TOC_ENTRIES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => scrollToSection(e.id)}
            title={`Scroll to ${e.label}`}
            style={{
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: 999,
              color: "#bfdbfe",
              padding: "10px 14px",
              minHeight: 36,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              font: "inherit",
              whiteSpace: "nowrap",
            }}
            onMouseOver={(ev) => {
              (ev.currentTarget as HTMLButtonElement).style.background =
                "rgba(59, 130, 246, 0.2)";
            }}
            onMouseOut={(ev) => {
              (ev.currentTarget as HTMLButtonElement).style.background =
                "rgba(59, 130, 246, 0.08)";
            }}
          >
            {e.label}
          </button>
        ))}
      </Row>
    </Stack>
  );
}

const OverviewSlide = ({ setView }: { setView: (v: View) => void }): JSX.Element => {
  const [, setActiveRank] = useCanvasState<number>("activeCustomerRank", 1);
  const pickCustomer = (rank: number) => {
    setActiveRank(rank);
    setView("detail");
  };
  const totals = aggregateSnapshot.totals;
  const simple = aggregateSnapshot.simpleBase.cameraOnlyFlat;
  return (
    <Stack gap={24}>
      <Callout tone="success" title="TL;DR. The four numbers to remember.">
        <Stack gap={6}>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">
              {(simple.orgShare * 100).toFixed(0)}% of accounts
            </Text>{" "}
            ({simple.orgs.toLocaleString()} of {totals.totalOrgs.toLocaleString()})
            are camera-only and have a flat site list. They look the same to
            Command and need no further analysis here.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">
              {(totals.complexTailOrgShare * 100).toFixed(1)}% of accounts
            </Text>{" "}
            ({totals.complexTailSize.toLocaleString()} orgs) make up the
            complex tail. They hold{" "}
            <Text as="span" weight="semibold" size="small">
              {(totals.complexTailBookingsShare * 100).toFixed(0)}% of lifetime
              bookings
            </Text>
            . Every hierarchy decision below is aimed at this population.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">
              Naming dominates structure.
            </Text>{" "}
            Most complex-tail customers fall into 1 to 2 of nine archetype
            families that depend on how they name their roots (geography,
            facility code, function, campus, fleet, command, or single-product
            variants). Cross-customer search and IAM design should follow the
            naming dimension first.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">
              Multi-archetype is common in the complex tail.
            </Text>{" "}
            Several of the deep-dive customers carry a primary plus a
            secondary archetype (e.g. Charter Schools USA = facility code +
            geographic). The dashboard shows the secondary as an outline pill
            beside the primary.
          </Text>
        </Stack>
      </Callout>

      <Callout tone="info" title="How to read this canvas">
        <Stack gap={10}>
          <Text size="small">
            Twelve complex multi-product customer hierarchies were hand-picked
            for qualitative deep-dive. The Overview moves from{" "}
            <Text as="span" weight="semibold" size="small">
              the raw data
            </Text>
            , to the two{" "}
            <Text as="span" weight="semibold" size="small">
              layers of pattern
            </Text>{" "}
            we classified inside it (root shape and archetype family), to the
            consolidated{" "}
            <Text as="span" weight="semibold" size="small">
              findings
            </Text>
            . The Aggregate VIEW carries the full-population analysis. Customer
            deep-dives carry per-customer subtrees. Selection criteria for the
            12 are at the bottom under Method.
          </Text>
          <TableOfContents />
        </Stack>
      </Callout>

      <Callout tone="neutral" title="Glossary (terms used throughout)">
        <Stack gap={6}>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">Archetype family.</Text>{" "}
            The shape of a customer's site tree, named by what the depth-1
            (root) sites are. Nine families: geographic-first, facility-code,
            function-first, single-campus, flat-fleet, deep-command, and three
            camera-only variants. A customer can carry one primary archetype
            and one or more secondary archetypes if their tree mixes shapes.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">Complex tail.</Text>{" "}
            The subset of accounts whose Command site tree is non-trivial.
            Concretely:{" "}
            {aggregateSnapshot.totals.complexTailSize.toLocaleString()} orgs
            ({(aggregateSnapshot.totals.complexTailOrgShare * 100).toFixed(1)}%
            of the population) selected by a composite score that combines
            site depth, product-line count, and lifetime bookings. They hold
            {" "}{(aggregateSnapshot.totals.complexTailBookingsShare * 100).toFixed(0)}%
            of all lifetime bookings.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">Root shape.</Text>{" "}
            How a customer names their depth-1 sites (geographic, facility
            code, function word, entity name, corporate tree, school code, or
            lifecycle marker). One customer can have multiple shapes at the
            same depth.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">Sub-archetype tag.</Text>{" "}
            A finer-grained classification of a single root or sub-tree based
            on naming patterns (e.g. "city + zip", "facility code with
            building suffix"). The full taxonomy and per-industry sub-segments
            are in <Code>src/data/taxonomy.json</Code>.
          </Text>
          <Text size="small">
            <Text as="span" weight="semibold" size="small">Bookings tier.</Text>{" "}
            SMB (&lt; $25k lifetime), commercial ($25k to $100k), mid-market
            ($100k to $500k), enterprise ($500k to $5M), strategic (&gt; $5M).
            Used as a secondary axis when sub-segmenting customers within an
            industry.
          </Text>
        </Stack>
      </Callout>

      <Divider />

      <Stack gap={10}>
        <H2 id="customers-at-a-glance">1. The twelve customers at a glance</H2>
        <Text tone="secondary" size="small">
          Source data for everything below. Each row is one customer's
          hierarchy summarized into counts. The <Text as="span" weight="semibold">Archetype</Text>{" "}
          column (next to Industry) is the synthesized family this customer
          belongs to (unpacked in the next section).
        </Text>
        <CustomerComparisonTable onPickCustomer={pickCustomer} />
        <Text size="small" tone="secondary">
          Click any customer name to jump to that customer's detail view. Hover
          any column header for a quick explanation.
        </Text>
        <Row gap={10} align="center" wrap>
          <Text size="small" tone="secondary">
            Want to know what those archetype pills actually mean?
          </Text>
          <SectionJumpButton targetId="archetype-families" label="Jump to archetype families →" />
        </Row>
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="what-we-measured">2. What we measured</H2>
        <Text tone="secondary" size="small">
          Customers organize their hierarchies along two complementary axes.
          The next two sections walk through each one.
        </Text>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader>Layer 1. Root shape</CardHeader>
            <CardBody>
              <Text size="small">
                How a customer <Text as="span" weight="semibold">names</Text>{" "}
                its top-level groups. A mechanical depth-1 classification of
                each root string into one of seven naming styles. A customer
                can use multiple shapes at depth 1.
              </Text>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>Layer 2. Archetype family</CardHeader>
            <CardBody>
              <Text size="small">
                How the <Text as="span" weight="semibold">whole tree</Text> is
                organized. A synthesis of root shape, depth, and the way nodes
                are arranged below depth 1. One family per customer. Seven
                families across the twelve, colored consistently in this canvas.
              </Text>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Divider />

      <Stack gap={16}>
        <Stack gap={6}>
          <H2 id="root-shapes">3. Layer 1. Root shapes</H2>
          <Text size="small" tone="secondary">
            What customers literally type at the top of their hierarchy. Each
            chip color in this section corresponds to one naming style; the
            same colors appear in the per-customer breakdown below.
          </Text>
        </Stack>
        <RootShapeAnalysis />
      </Stack>

      <Divider />

      <Stack gap={16}>
        <Stack gap={6}>
          <H2 id="archetype-families">4. Layer 2. Archetype families</H2>
          <Text size="small" tone="secondary">
            What the full tree is doing once you read past depth 1. Seven
            families emerge from the twelve customers. The four counts below
            measure how the layer-1 root shapes combine at depth 1.
          </Text>
        </Stack>
        <ArchetypeFrequencyStats />
        <PopulationCaveat />
        <ArchetypeFamilyCards />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="aggregate-patterns">5. Aggregate patterns (complex tail)</H2>
        <Text tone="secondary" size="small">
          The {aggregateSnapshot.totals.totalOrgs.toLocaleString()}-org base
          breaks cleanly in two: most orgs are trivial camera-only-flat
          deployments that don't need hierarchy design, and a small complex
          tail concentrates the bookings and the interesting structure.
        </Text>
        <OverviewAggregateStats />
        <Row gap={10} align="center" wrap>
          <Button variant="primary" onClick={() => setView("aggregate")}>
            Open Aggregate patterns →
          </Button>
          <Text size="small" tone="secondary">
            Simple-base callout, complex-tail composition, breakdown by
            bookings band and industry, and the top high-value complex orgs.
          </Text>
        </Row>
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="what-we-learned">6. What we learned</H2>
        <Text tone="secondary" size="small">
          Eight patterns that repeat across the twelve customers. Each one is
          a concrete example with the product implication.
        </Text>
        <WhatWeLearnedSection />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="method">Method &amp; caveats</H2>
        <Stack gap={6}>
          <Text size="small">
            How the twelve customers were picked, in plain English: active
            paid customers only (excluding internal Verkada / personal
            test accounts), between 25 and 400 sites, site tree at least
            three levels deep, at least three product lines deployed, at
            least three distinct product-mix patterns across their sites,
            and enough structural complexity that the shortlist felt
            non-trivial to a human reviewer. Ranked by product-mix
            variety, then tree depth, then size.{" "}
            <Text as="span" tone="secondary">
              (Filter footnote:{" "}
              <Code>is_active_paid = TRUE</Code> via{" "}
              <Code>dim_account_hierarchy</Code>; account name not
              ILIKE &quot;%verkada%&quot; or &quot;%personal%&quot;;{" "}
              <Code>total_sites BETWEEN 25 AND 400</Code>;{" "}
              <Code>max_depth ≥ 3</Code>;{" "}
              <Code>product_lines_count ≥ 3</Code>;{" "}
              <Code>distinct_product_mixes ≥ 3</Code>; at least 2 of
              (<Code>structural ≥ 5</Code>, <Code>mixed ≥ 3</Code>,{" "}
              <Code>dead-end ≥ 5</Code>). Ordered by{" "}
              <Code>distinct_product_mixes</Code> desc, then{" "}
              <Code>max_depth</Code> desc, then{" "}
              <Code>total_sites</Code> desc. Method: SQL filter over
              an Athena-materialised dataframe, run via the Hex MCP.)
            </Text>
          </Text>
          <Text size="small">
            How sites are connected to devices: every device record
            includes a hierarchy path; the segment immediately above
            the device names which site it belongs to. We trust that
            relationship and confirm it points at a real site row
            before counting the device.{" "}
            <Text as="span" tone="secondary">
              (Method footnote: parse the second-to-last segment of
              each entity&apos;s{" "}
              <Code>auth.directory_paths_latest</Code> path, reformat
              to a hyphenated UUID, confirm parent{" "}
              <Code>entity_type = &apos;site&apos;</Code>. Cameras map
              through this directory-path rule, not through{" "}
              <Code>vcamera.camera_group_cameras_latest</Code> (dead
              table).)
            </Text>
          </Text>
          <Text size="small" tone="secondary">
            Subtree node names, depths, and node-type classifications are
            exact values pulled from the 1,665-row dump. Device counts at
            sub-nodes are illustrative (drawn from per-customer totals and
            observed path patterns) — they preserve relative magnitudes and
            node-type splits but individual leaf counts may not match a
            single source row 1:1. Industry coverage gaps in the top 12: no
            higher-ed, retail, or utilities passed the joint depth +
            product_mix + size filters in the candidate shortlist.
          </Text>
        </Stack>
      </Stack>

      <Divider />

      <Callout tone="info" title="Ready for individual customer detail?">
        <Stack gap={10}>
          <Text size="small">
            Each of the twelve customers has its own deep-dive with the emblematic
            site subtree, device counts at every node, top-level root names,
            representative branches, use cases, and observations.
          </Text>
          <Row gap={8} align="center">
            <Button variant="primary" onClick={() => setView("detail")}>
              View customer deep-dives →
            </Button>
            <Text size="small" tone="secondary">
              Or use the VIEW switcher at the top of the canvas.
            </Text>
          </Row>
        </Stack>
      </Callout>
    </Stack>
  );
};

const DetailSlide = ({ setView }: { setView: (v: View) => void }): JSX.Element => {
  return (
    <Stack gap={24}>
      <Callout tone="info" title="You're viewing per-customer detail">
        <Stack gap={10}>
          <Text size="small">
            Each tab below shows one customer's emblematic site subtree with device
            counts and node-type pills. Switch back to the overview for cross-cutting
            patterns, archetype frequency, and product implications.
          </Text>
          <Row gap={8} align="center">
            <Button variant="secondary" onClick={() => setView("overview")}>
              ← Back to overview
            </Button>
            <Text size="small" tone="secondary">
              Or use the VIEW switcher at the top of the canvas.
            </Text>
          </Row>
        </Stack>
      </Callout>

      <Divider />

      <CustomerTabs />
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// Aggregate patterns VIEW
//
// Replaces the older "Population analysis" and "Industry analysis" VIEWs.
// The framing is reversed: the simple base (mostly camera-only flat) gets a
// single headline callout, and the rest of the view drills into the complex
// tail (top quintile of (max_depth + product_lines_count + log10(bookings)))
// because that's where hierarchy design actually matters.
// ---------------------------------------------------------------------------

type AggregateSnapshot = typeof aggregateSnapshot;

const ARCHETYPE_ORDER: ArchetypeFamily[] = [
  "deep_command",
  "geographic_first",
  "facility_code",
  "function_first",
  "single_campus",
  "flat_fleet",
  "camera_only_deep",
  "camera_only_geographic",
  "camera_only_flat",
];

function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function PopColHead({ label, tooltip }: { label: string; tooltip?: string }): JSX.Element {
  if (!tooltip) return <Text size="small" weight="semibold">{label}</Text>;
  return (
    <Row gap={4} align="center">
      <Text size="small" weight="semibold">{label}</Text>
      <InfoIcon tooltip={tooltip} ariaLabel={`${label}: ${tooltip}`} />
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Overview teaser: 4 headline stats shown inside the Overview section, big
// enough to convey the punchline without the reader leaving the page.

const OverviewAggregateStats = (): JSX.Element => {
  const t = aggregateSnapshot.totals;
  const cf = aggregateSnapshot.simpleBase.cameraOnlyFlat;
  return (
    <Grid columns={4} gap={12}>
      <Stat
        value={t.totalOrgs.toLocaleString()}
        label="Active paid orgs"
        tone="info"
      />
      <Stat
        value={`${cf.orgs.toLocaleString()} (${fmtPct(cf.orgShare, 0)})`}
        label="Simple base (camera-only flat)"
        tone="neutral"
      />
      <Stat
        value={`${t.complexTailSize.toLocaleString()} (${fmtPct(t.complexTailOrgShare, 0)})`}
        label="Complex tail (top 20% by complexity)"
        tone="warning"
      />
      <Stat
        value={fmtPct(t.complexTailBookingsShare, 0)}
        label="Bookings concentrated in complex tail"
        tone="success"
      />
    </Grid>
  );
};

// ---------------------------------------------------------------------------
// Simple-base callout (the demoted majority).

const SimpleBaseCallout = (): JSX.Element => {
  const t = aggregateSnapshot.totals;
  const cf = aggregateSnapshot.simpleBase.cameraOnlyFlat;
  const sb = aggregateSnapshot.simpleBase.simpleByScore;
  return (
    <Stack gap={14}>
      <Callout tone="success" title="The simple base: most orgs are trivial by construction">
        <Stack gap={8}>
          <Text size="small">
            <Text as="span" weight="semibold">
              {cf.orgs.toLocaleString()} of {t.totalOrgs.toLocaleString()} active
              paid orgs ({fmtPct(cf.orgShare, 0)})
            </Text>{" "}
            are pure camera-only deployments with no hierarchy: depth-1 sites
            only, single product line. They hold{" "}
            <Text as="span" weight="semibold">
              {fmtPct(cf.bookingsShare, 0)} of lifetime bookings
            </Text>{" "}
            ({fmtMoney(cf.bookings)} of {fmtMoney(t.totalBookings)}). Median
            lifetime bookings inside this cohort:{" "}
            <Text as="span" weight="semibold">{fmtMoney(cf.medianBookings)}</Text>.
          </Text>
          <Text size="small" tone="secondary">
            Widening the lens to all orgs in the simpler half of the base
            (low site depth, few product lines, modest bookings) catches{" "}
            {sb.orgs.toLocaleString()} orgs ({fmtPct(sb.orgShare, 0)})
            holding only {fmtPct(sb.bookingsShare, 0)} of bookings. That
            entire half is &quot;already fine&quot; from a hierarchy
            standpoint; the rest of this VIEW is about the other half.{" "}
            <Text as="span" tone="secondary">
              (Cutoff = median complexity score{" "}
              <Code>{sb.scoreThreshold.toFixed(2)}</Code>; see method
              footnote below.)
            </Text>
          </Text>
        </Stack>
      </Callout>
      <SimpleBaseByBookingsTable />
    </Stack>
  );
};

const SimpleBaseByBookingsTable = (): JSX.Element => {
  const rows = aggregateSnapshot.simpleBase.cameraOnlyFlat.byBookingBand;
  return (
    <Table
      headers={[
        <PopColHead key="band" label="Bookings band" />,
        <PopColHead key="total" label="Orgs in band" />,
        <PopColHead key="cf" label="Camera-only flat" />,
        <PopColHead key="orgShare" label="Share of band (orgs)" tooltip="What share of customers in this bookings band have the simple camera-only flat hierarchy. (Org-count share within the band.)" />,
        <PopColHead key="bookShare" label="Share of band ($)" tooltip="What share of revenue in this bookings band comes from customers with the simple camera-only flat hierarchy. (Sum of lifetime_bookings inside the band, share attributable to camera-only-flat orgs.)" />,
      ]}
      columnAlign={["left", "right", "right", "right", "right"]}
      colMinWidth={[140, 100, 130, 150, 150]}
      rows={rows.map((r) => [
        <Text key={`b-${r.band}`} size="small">{r.bandLabel}</Text>,
        <Text key={`t-${r.band}`} size="small">{r.totalOrgsInBand.toLocaleString()}</Text>,
        <Text key={`c-${r.band}`} size="small">{r.cameraFlatOrgs.toLocaleString()}</Text>,
        <Text key={`o-${r.band}`} size="small">{fmtPct(r.cameraFlatOrgShareOfBand, 0)}</Text>,
        <Text key={`bk-${r.band}`} size="small">{fmtPct(r.cameraFlatBookingsShareOfBand, 0)}</Text>,
      ])}
    />
  );
};

// ---------------------------------------------------------------------------
// Complex-tail composition: archetype distribution + root-shape coverage.

const ComplexTailHeadline = (): JSX.Element => {
  const t = aggregateSnapshot.totals;
  const tail = aggregateSnapshot.complexTail;
  return (
    <Grid columns={4} gap={12}>
      <Stat
        value={tail.size.toLocaleString()}
        label="Orgs in complex tail"
        tone="warning"
      />
      <Stat
        value={fmtMoney(tail.bookings)}
        label={`Lifetime bookings (${fmtPct(t.complexTailBookingsShare, 0)} of base)`}
        tone="success"
      />
      <Stat
        value={tail.medianTotalSites.toLocaleString()}
        label="Typical site count (median)"
        tone="info"
      />
      <Stat
        value={tail.medianMaxDepth.toString()}
        label="Typical site tree depth (median)"
        tone="info"
      />
    </Grid>
  );
};

const ComplexArchetypeMixTable = (): JSX.Element => {
  const tail = aggregateSnapshot.complexTail;
  const rows = ARCHETYPE_ORDER.map((f) => {
    const s = tail.archetypeShares[f];
    return { family: f, ...s };
  }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  return (
    <Table
      headers={[
        <PopColHead key="family" label="Archetype family" />,
        <PopColHead key="count" label="Orgs" />,
        <PopColHead key="orgShare" label="Share of complex tail" />,
        <PopColHead key="bookings" label="Bookings" />,
        <PopColHead key="bookShare" label="Bookings share of complex tail" />,
        <PopColHead key="bar" label="" />,
      ]}
      columnAlign={["left", "right", "right", "right", "right", "left"]}
      colMinWidth={[200, 70, 130, 110, 160, 200]}
      rows={rows.map((r) => [
        <Pill key={`p-${r.family}`} size="sm" tone={archetypeFamilyTone[r.family]}>
          {archetypeFamilyLabels[r.family]}
        </Pill>,
        <Text key={`c-${r.family}`} size="small">{r.count.toLocaleString()}</Text>,
        <Text key={`os-${r.family}`} size="small">{fmtPct(r.share, 1)}</Text>,
        <Text key={`bk-${r.family}`} size="small">{fmtMoney(r.bookings)}</Text>,
        <Text key={`bs-${r.family}`} size="small">{fmtPct(r.bookingsShare, 1)}</Text>,
        <div
          key={`bar-${r.family}`}
          style={{
            background: "rgba(74, 222, 128, 0.22)",
            border: "1px solid rgba(74, 222, 128, 0.5)",
            borderRadius: 4,
            height: 12,
            width: `${Math.max(2, r.bookingsShare * 100)}%`,
            minWidth: 4,
          }}
          title={`${fmtMoney(r.bookings)} of complex-tail bookings`}
        />,
      ])}
    />
  );
};

// ---------------------------------------------------------------------------
// Complex tail by bookings band.

const ComplexByBookingsTable = (): JSX.Element => {
  const rows = aggregateSnapshot.complexTail.byBookingBand;
  return (
    <Table
      headers={[
        <PopColHead key="band" label="Bookings band" />,
        <PopColHead key="orgs" label="Orgs" />,
        <PopColHead key="bookings" label="Bookings" />,
        <PopColHead key="share" label="Share of complex bookings" />,
        <PopColHead key="depth" label="Typical site tree depth" tooltip="Typical hierarchy depth for an org in this slice. (Median of max_depth across the slice.)" />,
        <PopColHead key="mixes" label="Typical product-mix variety" tooltip="How varied the site-level product mix is across an orgs sites, on average. (Median of distinct_product_mixes across orgs in the slice.)" />,
        <PopColHead key="sites" label="Typical site count" tooltip="Typical number of sites for an org in this slice. (Median of total_sites across the slice.)" />,
        <PopColHead key="cams" label="Typical camera count" tooltip="Typical number of cameras deployed for an org in this slice. (Median of camera_count across the slice.)" />,
        <PopColHead key="modal" label="Most common archetype" />,
      ]}
      columnAlign={["left", "right", "right", "right", "right", "right", "right", "right", "left"]}
      colMinWidth={[120, 70, 90, 140, 110, 130, 100, 110, 200]}
      rows={rows.map((r) => {
        const modal = (Object.entries(r.archetypeShares) as [ArchetypeFamily, { share: number; count: number; bookings: number; bookingsShare: number }][])
          .sort((a, b) => b[1].share - a[1].share)[0];
        return [
          <Text key={`b-${r.band}`} size="small" weight="semibold">{r.bandLabel}</Text>,
          <Text key={`o-${r.band}`} size="small">{r.orgs.toLocaleString()}</Text>,
          <Text key={`bk-${r.band}`} size="small">{fmtMoney(r.bookings)}</Text>,
          <Text key={`bs-${r.band}`} size="small">{fmtPct(r.bookingsShareOfComplex, 1)}</Text>,
          <Text key={`d-${r.band}`} size="small">{r.medianMaxDepth.toString()}</Text>,
          <Text key={`m-${r.band}`} size="small">{r.medianProductMixes.toString()}</Text>,
          <Text key={`s-${r.band}`} size="small">{r.medianTotalSites.toLocaleString()}</Text>,
          <Text key={`c-${r.band}`} size="small">{r.medianCameras.toLocaleString()}</Text>,
          <Pill key={`mp-${r.band}`} size="sm" tone={archetypeFamilyTone[modal[0]]}>
            {archetypeFamilyLabels[modal[0]]} ({fmtPct(modal[1].share, 0)})
          </Pill>,
        ];
      })}
    />
  );
};

// ---------------------------------------------------------------------------
// Industry featured cards (taxonomy.json driven).
// Replaces the older Complex-tail-by-industry table with a richer card layout
// covering the top 8 industries (by combined orgs + bookings rank) plus an
// explicit "industries not covered" callout for the remaining six.

type DistinctiveSubCode = {
  sub: string;
  share: number;
  vsOverallRatio: number;
};

type SubIndustry = {
  industry: string;
  populationOrgs: number;
  populationBookings: number;
  populationOpenPipelineValue: number;
  populationShare?: { orgs: number; bookings: number; pipeline: number };
  complexOrgs: number;
  totalNodes?: number;
};

type FeaturedCard = {
  cardId: string;
  cardKind: string;
  members: string[];
  description: string;
  rankByOrgs: number;
  rankByBookings: number;
  combinedRank: number;
  populationOrgs: number;
  populationBookings: number;
  populationOpenPipelineValue: number;
  populationShare: { orgs: number; bookings: number; pipeline: number };
  complexOrgs: number;
  totalNodes?: number;
  distinctiveSubCodes: DistinctiveSubCode[];
  subIndustries?: SubIndustry[];
};

type IndustryExampleChild = {
  name: string;
  depth: number;
  parentId?: string;
  nodeType?: string;
  cameras?: number;
  acPanels?: number;
  alarmDevices?: number;
  alarmPanels?: number;
  topShape?: string;
  subCode?: string;
};

type IndustryExampleRoot = {
  rootName: string;
  rootDepth: number;
  rootDeviceTotal?: number;
  children: IndustryExampleChild[];
};

type IndustryExample = {
  sfdcAccountId: string;
  sfdcAccountName: string;
  industry: string;
  subSegment?: string;
  bookings: number;
  totalSites: number;
  maxDepth: number;
  depth1Composition?: unknown;
  distinctiveSubCodes?: DistinctiveSubCode[];
  representativeRoots: IndustryExampleRoot[];
};

const subCodeLabelsLookup: Record<string, string> =
  (taxonomySnapshot as unknown as { subCodeLabels?: Record<string, string> })
    .subCodeLabels ?? {};

const prettySubCode = (sub: string): string =>
  subCodeLabelsLookup[sub] ??
  sub.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const exampleNodeMix = (n: IndustryExampleChild): ProductMix => {
  const total =
    (n.cameras || 0) +
    (n.acPanels || 0) +
    (n.alarmDevices || 0) +
    (n.alarmPanels || 0);
  if (total === 0) return "empty";
  const hasCam = (n.cameras || 0) > 0;
  const hasAcc = (n.acPanels || 0) > 0;
  const hasAlm = (n.alarmDevices || 0) + (n.alarmPanels || 0) > 0;
  if (hasCam && hasAcc && hasAlm) return "cameras_access_alarms";
  if (hasCam && hasAcc) return "cameras_access";
  if (hasCam && hasAlm) return "cameras_alarms";
  if (hasCam) return "cameras_only";
  return "access_or_alarms_only";
};

// Renders the flat array of representative-root children (already in depth
// order) as an indented tree. Adapter for the taxonomy.json example shape.
function ExampleSubtree({
  rootName,
  rootDepth,
  children,
}: {
  rootName: string;
  rootDepth: number;
  children: IndustryExampleChild[];
}): JSX.Element {
  return (
    <Stack gap={2}>
      <Row gap={6} align="center">
        <Text size="small" weight="semibold">{rootName}</Text>
        <Text size="small" tone="secondary">
          (root, depth {rootDepth}, {children.length} descendants shown)
        </Text>
      </Row>
      {children.map((n, i) => {
        const indent = Math.max(0, n.depth - rootDepth - 1);
        return (
          <Row key={`${n.name}-${i}`} gap={6} align="center">
            <span style={{ display: "inline-block", width: indent * 14 }} />
            <Text size="small" tone="secondary">└</Text>
            <Text size="small">{n.name}</Text>
            {n.subCode ? (
              <Pill size="sm" tone="neutral">{prettySubCode(n.subCode)}</Pill>
            ) : null}
            <MixPill mix={exampleNodeMix(n)} />
          </Row>
        );
      })}
    </Stack>
  );
}

function FeaturedIndustryCard({ card }: { card: FeaturedCard }): JSX.Element {
  // Pull up to 2 example customers across this card's member sub-industries.
  // Each member can have an example list keyed by sub-industry name.
  const examples: IndustryExample[] = [];
  for (const member of card.members) {
    const memberExamples =
      (
        taxonomySnapshot.examplesByIndustry as unknown as Record<
          string,
          IndustryExample[]
        >
      )[member] ?? [];
    for (const ex of memberExamples) {
      if (examples.length >= 2) break;
      examples.push(ex);
    }
    if (examples.length >= 2) break;
  }

  const memberSummary = (card.subIndustries ?? [])
    .slice()
    .sort((a, b) => b.populationOrgs - a.populationOrgs);

  return (
    <Card>
      <CardHeader>{card.cardId}</CardHeader>
      <CardBody>
        <Stack gap={14}>
          {/* Top stats row */}
          <Grid columns={3} gap={12}>
            <Stat
              value={card.populationOrgs.toLocaleString()}
              label="Command orgs"
            />
            <Stat
              value={fmtMoney(card.populationBookings)}
              label="Lifetime bookings"
            />
            <Stat
              value={fmtMoney(card.populationOpenPipelineValue)}
              label="Open pipeline"
            />
          </Grid>

          <Text size="small" tone="secondary">
            {fmtPct(card.populationShare.orgs, 1)} of paid orgs ·{" "}
            {fmtPct(card.populationShare.bookings, 1)} of lifetime bookings ·{" "}
            {card.complexOrgs.toLocaleString()} complex-tail orgs
          </Text>

          <Text size="small">{card.description}</Text>

          {/* Sub-industries */}
          {memberSummary.length > 1 ? (
            <Stack gap={6}>
              <Text size="small" weight="semibold">
                Sub-industries inside this group
              </Text>
              <Stack gap={4}>
                {memberSummary.map((sub: SubIndustry) => (
                  <Row key={sub.industry} gap={8} align="center" wrap>
                    <Text size="small" weight="semibold">
                      {sub.industry}
                    </Text>
                    <Text size="small" tone="secondary">
                      {sub.populationOrgs.toLocaleString()} orgs ·{" "}
                      {fmtMoney(sub.populationBookings)} bookings ·{" "}
                      {sub.complexOrgs.toLocaleString()} complex
                    </Text>
                  </Row>
                ))}
              </Stack>
            </Stack>
          ) : null}

          {/* Distinctive naming conventions */}
          {card.distinctiveSubCodes.length > 0 ? (
            <Stack gap={6}>
              <Text size="small" weight="semibold">
                Distinctive naming conventions
              </Text>
              <Text size="small" tone="secondary">
                Sub-codes this industry uses more than the overall base. Higher
                ratio means more concentrated here.
              </Text>
              <Row gap={6} wrap>
                {card.distinctiveSubCodes.slice(0, 5).map(
                  (sc: DistinctiveSubCode) => (
                    <Pill
                      key={sc.sub}
                      size="sm"
                      tone="neutral"
                      title={`${fmtPct(sc.share, 1)} of nodes in this industry. ${sc.vsOverallRatio.toFixed(2)}x vs overall.`}
                    >
                      {prettySubCode(sc.sub)} ({sc.vsOverallRatio.toFixed(1)}x)
                    </Pill>
                  ),
                )}
              </Row>
            </Stack>
          ) : null}

          {/* Example customer trees */}
          {examples.length > 0 ? (
            <Stack gap={8}>
              <Text size="small" weight="semibold">
                Example customer site structures
              </Text>
              {examples.map((ex) => (
                <Card key={ex.sfdcAccountId}>
                  <CardBody>
                    <Stack gap={8}>
                      <Row gap={8} align="center" wrap>
                        <Text size="small" weight="semibold">
                          {ex.sfdcAccountName}
                        </Text>
                        <Pill size="sm" tone="neutral">{ex.industry}</Pill>
                        {ex.subSegment ? (
                          <Pill size="sm" tone="neutral" variant="outline">
                            {ex.subSegment}
                          </Pill>
                        ) : null}
                        <Text size="small" tone="secondary">
                          {ex.totalSites.toLocaleString()} sites · depth{" "}
                          {ex.maxDepth} · {fmtMoney(ex.bookings)} bookings
                        </Text>
                      </Row>
                      {ex.representativeRoots.slice(0, 1).map((r, i) => (
                        <ExampleSubtree
                          key={`${ex.sfdcAccountId}-${i}`}
                          rootName={r.rootName}
                          rootDepth={r.rootDepth}
                          children={r.children}
                        />
                      ))}
                    </Stack>
                  </CardBody>
                </Card>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardBody>
    </Card>
  );
}

const IndustryFeaturedCards = (): JSX.Element => {
  const featured = (taxonomySnapshot.featuredCards as unknown as FeaturedCard[])
    .slice()
    .sort((a, b) => a.combinedRank - b.combinedRank);
  const notCovered = taxonomySnapshot.notCoveredCards
    .slice()
    .sort((a, b) => b.bookings - a.bookings);
  const notTotals = taxonomySnapshot.notCoveredTotals;

  return (
    <Stack gap={20}>
      <Grid columns={2} gap={20}>
        {featured.map((card) => (
          <FeaturedIndustryCard key={card.cardId} card={card} />
        ))}
      </Grid>

      <Card>
        <CardHeader>Industries not covered above</CardHeader>
        <CardBody>
          <Stack gap={10}>
            <Text size="small" tone="secondary">
              {notTotals.cards} smaller industries together account for{" "}
              {fmtPct(notTotals.shareOfOrgs, 1)} of paid orgs and{" "}
              {fmtPct(notTotals.shareOfBookings, 1)} of lifetime bookings.
              Listed below in descending bookings order.
            </Text>
            <Stack gap={4}>
              {notCovered.map((nc) => (
                <Row key={nc.cardId} gap={8} align="center" wrap>
                  <Text size="small" weight="semibold">{nc.cardId}</Text>
                  <Text size="small" tone="secondary">
                    {nc.orgs.toLocaleString()} orgs ({fmtPct(nc.shareOfOrgs, 1)}{" "}
                    of paid base) · {fmtMoney(nc.bookings)} bookings (
                    {fmtPct(nc.shareOfBookings, 1)} of base)
                  </Text>
                </Row>
              ))}
            </Stack>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// Bookings-tier industry cards (replacement for the industry x bookings matrix).
// One card per bookings band, listing the top industries inside the band by
// bookings, with the most common archetype for each.

const BookingsTierIndustryCards = (): JSX.Element => {
  type Cell = (typeof aggregateSnapshot.complexTail.industryByBookingBand)[number];
  const bands = aggregateSnapshot.complexTail.byBookingBand.slice();
  // Group cells by band, drop low-sample (<5 orgs).
  const byBand = new Map<string, Cell[]>();
  for (const c of aggregateSnapshot.complexTail.industryByBookingBand) {
    if (c.orgs < 5) continue;
    if (!byBand.has(c.bandLabel)) byBand.set(c.bandLabel, []);
    byBand.get(c.bandLabel)!.push(c);
  }
  // Render highest band first, since that's where strategic interest lives.
  const orderedBands = bands.slice().reverse();

  return (
    <Grid columns={2} gap={16}>
      {orderedBands.map((band) => {
        const cells = (byBand.get(band.bandLabel) ?? [])
          .slice()
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 5);
        return (
          <Card key={band.band}>
            <CardHeader>{band.bandLabel}</CardHeader>
            <CardBody>
              <Stack gap={12}>
                <Grid columns={3} gap={10}>
                  <Stat
                    value={band.orgs.toLocaleString()}
                    label="Complex orgs in band"
                  />
                  <Stat
                    value={fmtMoney(band.bookings)}
                    label="Band bookings"
                  />
                  <Stat
                    value={fmtPct(band.bookingsShareOfComplex, 0)}
                    label="Of complex bookings"
                  />
                </Grid>
                {cells.length === 0 ? (
                  <Text size="small" tone="secondary">
                    No industries with 5+ complex orgs in this band.
                  </Text>
                ) : (
                  <Stack gap={6}>
                    <Text size="small" weight="semibold">
                      Top industries in this band
                    </Text>
                    {cells.map((c) => (
                      <Row
                        key={`${band.band}-${c.industry}`}
                        gap={8}
                        align="center"
                        wrap
                      >
                        <Text size="small" weight="semibold">
                          {c.industry}
                        </Text>
                        <Text size="small" tone="secondary">
                          {c.orgs.toLocaleString()} orgs ·{" "}
                          {fmtMoney(c.bookings)}
                        </Text>
                        {c.modalArchetype ? (
                          <Pill
                            size="sm"
                            tone={
                              archetypeFamilyTone[
                                c.modalArchetype as ArchetypeFamily
                              ]
                            }
                          >
                            {
                              archetypeFamilyLabels[
                                c.modalArchetype as ArchetypeFamily
                              ]
                            }{" "}
                            ({fmtPct(c.modalShare, 0)})
                          </Pill>
                        ) : null}
                      </Row>
                    ))}
                  </Stack>
                )}
              </Stack>
            </CardBody>
          </Card>
        );
      })}
    </Grid>
  );
};

// ---------------------------------------------------------------------------
// Property schematics: how customers describe a property.
//
// Renders taxonomy.json.spatialVocabulary. Two callers:
//   PropertySchematicsPanel - aggregate VIEW, overall + per-industry.
//   CustomerSpatialFingerprint - customer deep-dive, per-org rollup.
// ---------------------------------------------------------------------------

type SpatialVocabularyShape = {
  totalEligibleNodes: number;
  compoundPatternShares: Record<string, number>;
  qualifierFamilyShares: Record<string, number>;
  topQualifierLabels: { label: string; share: number; count: number }[];
  embeddedIdShare: number;
};

type SpatialVocabularyRoot = {
  qualifierFamilyLabels: Record<string, string>;
  methodNote: string;
  overall: SpatialVocabularyShape;
  byIndustry: Record<string, SpatialVocabularyShape>;
  byDeepDiveCustomer: Record<string, SpatialVocabularyShape>;
};

const spatialVocab = (taxonomySnapshot as unknown as {
  spatialVocabulary?: SpatialVocabularyRoot;
}).spatialVocabulary;

const compoundPatternLabels: Record<string, string> = {
  entity_only: "Just a name (no spatial qualifier)",
  entity_plus_qualifier: "Name + spatial qualifier",
  entity_plus_qualifier_plus_id: "Name + qualifier + embedded ID",
  qualifier_only: "Qualifier only (no parent name)",
  id_only: "ID only",
};

function CompoundPatternBar({
  shares,
}: {
  shares: Record<string, number>;
}): JSX.Element {
  const order = [
    "entity_only",
    "entity_plus_qualifier",
    "entity_plus_qualifier_plus_id",
    "qualifier_only",
    "id_only",
  ];
  const palette: Record<string, string> = {
    entity_only: "rgba(148, 163, 184, 0.55)",
    entity_plus_qualifier: "rgba(74, 222, 128, 0.6)",
    entity_plus_qualifier_plus_id: "rgba(59, 130, 246, 0.6)",
    qualifier_only: "rgba(251, 191, 36, 0.6)",
    id_only: "rgba(244, 114, 182, 0.6)",
  };
  return (
    <Stack gap={6}>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 14,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {order.map((p) => {
          const v = shares[p] ?? 0;
          if (v < 0.001) return null;
          return (
            <div
              key={p}
              style={{
                width: `${v * 100}%`,
                background: palette[p],
              }}
              title={`${compoundPatternLabels[p]}: ${(v * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>
      <Row gap={10} wrap>
        {order.map((p) => {
          const v = shares[p] ?? 0;
          if (v < 0.001) return null;
          return (
            <Row key={p} gap={4} align="center">
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: palette[p],
                  display: "inline-block",
                }}
              />
              <Text size="small" tone="secondary">
                {compoundPatternLabels[p]} {(v * 100).toFixed(1)}%
              </Text>
            </Row>
          );
        })}
      </Row>
    </Stack>
  );
}

function QualifierFamilyList({
  shares,
  labels,
}: {
  shares: Record<string, number>;
  labels: Record<string, string>;
}): JSX.Element {
  const rows = Object.entries(shares)
    .filter(([k]) => k !== "none")
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (rows.length === 0) {
    return (
      <Text size="small" tone="secondary">
        No qualifier families above 0.5% share in this slice.
      </Text>
    );
  }
  const maxShare = rows[0][1];
  return (
    <Stack gap={4}>
      {rows.map(([fam, share]) => (
        <Row key={fam} gap={10} align="center">
          <div style={{ width: 200, minWidth: 200 }}>
            <Text size="small" weight="semibold">
              {labels[fam] ?? fam}
            </Text>
          </div>
          <div
            style={{
              flex: 1,
              height: 10,
              background: "rgba(148, 163, 184, 0.15)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(share / maxShare) * 100}%`,
                height: "100%",
                background: "rgba(74, 222, 128, 0.55)",
              }}
            />
          </div>
          <Text size="small" tone="secondary">
            {(share * 100).toFixed(1)}%
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

const PropertySchematicsPanel = (): JSX.Element | null => {
  if (!spatialVocab) return null;
  const o = spatialVocab.overall;
  const industries = Object.entries(spatialVocab.byIndustry)
    .sort((a, b) => b[1].totalEligibleNodes - a[1].totalEligibleNodes);
  return (
    <Stack gap={16}>
      <Card>
        <CardHeader>Overall: how customers compose a name</CardHeader>
        <CardBody>
          <Stack gap={14}>
            <Text size="small" tone="secondary">
              Across {o.totalEligibleNodes.toLocaleString()} sub-roots
              (depth-2 and below) in the complex tail, here is how often a
              name carries a spatial qualifier vs. just an entity name.
            </Text>
            <CompoundPatternBar shares={o.compoundPatternShares} />
            <Stack gap={6}>
              <Text size="small" weight="semibold">
                Top spatial-qualifier families
              </Text>
              <QualifierFamilyList
                shares={o.qualifierFamilyShares}
                labels={spatialVocab.qualifierFamilyLabels}
              />
            </Stack>
            <Stack gap={6}>
              <Text size="small" weight="semibold">
                Top qualifier labels (raw)
              </Text>
              <Row gap={6} wrap>
                {o.topQualifierLabels.slice(0, 10).map((l) => (
                  <Pill
                    key={l.label}
                    size="sm"
                    tone="neutral"
                    title={`${l.count.toLocaleString()} nodes, ${(l.share * 100).toFixed(2)}% of eligible`}
                  >
                    {l.label} ({(l.share * 100).toFixed(1)}%)
                  </Pill>
                ))}
              </Row>
            </Stack>
            <Text size="small" tone="secondary">
              Embedded ID suffixes (e.g. <Code>(102)</Code> or
              <Code> - ABC123</Code>) appear on{" "}
              {(o.embeddedIdShare * 100).toFixed(1)}% of eligible nodes.
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Stack gap={10}>
        <H3>By industry</H3>
        <Text size="small" tone="secondary">
          One card per industry with at least 200 eligible nodes. The
          qualifier families show which on-property vocabulary each
          industry leans on most.
        </Text>
        <Grid columns={2} gap={16}>
          {industries.map(([ind, vocab]) => (
            <Card key={ind}>
              <CardHeader>{ind}</CardHeader>
              <CardBody>
                <Stack gap={10}>
                  <Text size="small" tone="secondary">
                    {vocab.totalEligibleNodes.toLocaleString()} eligible
                    nodes ·{" "}
                    {(
                      ((vocab.compoundPatternShares["entity_plus_qualifier"] ??
                        0) +
                        (vocab.compoundPatternShares["qualifier_only"] ?? 0) +
                        (vocab.compoundPatternShares[
                          "entity_plus_qualifier_plus_id"
                        ] ?? 0)) *
                      100
                    ).toFixed(1)}
                    % carry a spatial qualifier
                  </Text>
                  <CompoundPatternBar shares={vocab.compoundPatternShares} />
                  <QualifierFamilyList
                    shares={vocab.qualifierFamilyShares}
                    labels={spatialVocab.qualifierFamilyLabels}
                  />
                </Stack>
              </CardBody>
            </Card>
          ))}
        </Grid>
        <Text size="small" tone="secondary">
          Method: pure regex over node names. Each non-root node (depth 2+)
          is parsed for an entity prefix and an optional spatial-qualifier
          tail (interior / exterior / front / north / loading dock / lobby /
          etc.). Qualifier families roll up 17 named buckets. No model.
        </Text>
      </Stack>
    </Stack>
  );
};

// App.tsx uses short customer names. taxonomy.json keys come from the raw
// SFDC account name and don't always match. This map normalizes the few
// known discrepancies.
const CUSTOMER_NAME_TO_TAXONOMY_KEY: Record<string, string> = {
  "Saddle Creek Logistics": "Saddle Creek Logistics Services",
  "Salvation Army - Western Territory":
    "The Salvation Army - Western Territory",
  "Dairy Farmers of America": "Dairy Farmers of America , Inc.",
};

function CustomerSpatialFingerprint({
  customerName,
}: {
  customerName: string;
}): JSX.Element | null {
  if (!spatialVocab) return null;
  const key = CUSTOMER_NAME_TO_TAXONOMY_KEY[customerName] ?? customerName;
  const vocab = spatialVocab.byDeepDiveCustomer[key];
  if (!vocab || vocab.totalEligibleNodes < 30) return null;
  const qualifierShare =
    (vocab.compoundPatternShares["entity_plus_qualifier"] ?? 0) +
    (vocab.compoundPatternShares["qualifier_only"] ?? 0) +
    (vocab.compoundPatternShares["entity_plus_qualifier_plus_id"] ?? 0);
  return (
    <Card>
      <CardHeader>Spatial vocabulary fingerprint</CardHeader>
      <CardBody>
        <Stack gap={12}>
          <Text size="small" tone="secondary">
            How this customer composes sub-root names (depth-2 and below).
            Based on {vocab.totalEligibleNodes.toLocaleString()} eligible
            nodes. {(qualifierShare * 100).toFixed(1)}% of them carry a
            spatial qualifier (interior / exterior / lobby / dock /
            cardinal direction / etc.).
          </Text>
          <CompoundPatternBar shares={vocab.compoundPatternShares} />
          {vocab.topQualifierLabels.length > 0 ? (
            <Stack gap={6}>
              <Text size="small" weight="semibold">
                Most common qualifiers this customer uses
              </Text>
              <Row gap={6} wrap>
                {vocab.topQualifierLabels.slice(0, 8).map((l) => (
                  <Pill
                    key={l.label}
                    size="sm"
                    tone="neutral"
                    title={`${l.count.toLocaleString()} nodes`}
                  >
                    {l.label} ({(l.share * 100).toFixed(1)}%)
                  </Pill>
                ))}
              </Row>
            </Stack>
          ) : null}
        </Stack>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top complex orgs by bookings.

const TopComplexOrgsTable = (): JSX.Element => {
  const rows = aggregateSnapshot.complexTail.topComplexOrgs;
  return (
    <Stack gap={6}>
      <Text size="small" tone="secondary">
        The 20 highest-bookings orgs inside the complex tail. These are the
        deployments where hierarchy design has the largest revenue impact.
      </Text>
      <Table
        headers={[
          <PopColHead key="name" label="Account" />,
          <PopColHead key="ind" label="Industry" />,
          <PopColHead key="bk" label="Lifetime bookings" />,
          <PopColHead key="sites" label="Sites" />,
          <PopColHead key="depth" label="Max depth" />,
          <PopColHead key="lines" label="Product lines" />,
          <PopColHead key="mixes" label="Product mixes" />,
          <PopColHead key="arch" label="Archetype" />,
          <PopColHead key="score" label="Complexity score" tooltip="A simple ranking score that combines three things: how deep an org's site tree goes, how many product lines they own, and how much they have booked with us. Higher = more complex. (Score = max_depth + product_lines_count + log10(lifetime_bookings); computed locally in TypeScript from the Hex Athena pulls.)" />,
        ]}
        columnAlign={["left", "left", "right", "right", "right", "right", "right", "left", "right"]}
        colMinWidth={[240, 180, 130, 70, 80, 100, 110, 200, 110]}
        rows={rows.map((r, i) => [
          <Text key={`n-${i}`} size="small" weight="semibold">{r.sfdcAccountName}</Text>,
          <Text key={`i-${i}`} size="small" tone="secondary">{r.industry}</Text>,
          <Text key={`bk-${i}`} size="small">{fmtMoney(r.bookings)}</Text>,
          <Text key={`s-${i}`} size="small">{r.totalSites.toLocaleString()}</Text>,
          <Text key={`d-${i}`} size="small">{r.maxDepth.toString()}</Text>,
          <Text key={`pl-${i}`} size="small">{r.productLines.toString()}</Text>,
          <Text key={`m-${i}`} size="small">{r.distinctProductMixes.toString()}</Text>,
          <Pill key={`a-${i}`} size="sm" tone={archetypeFamilyTone[r.archetype as ArchetypeFamily]}>
            {archetypeFamilyLabels[r.archetype as ArchetypeFamily]}
          </Pill>,
          <Text key={`sc-${i}`} size="small">{r.complexityScore.toFixed(2)}</Text>,
        ])}
      />
    </Stack>
  );
};

// ---------------------------------------------------------------------------
// The slide itself.

const AggregateSlide = ({ setView }: { setView: (v: View) => void }): JSX.Element => {
  const t = aggregateSnapshot.totals;
  return (
    <Stack gap={24}>
      <Callout tone="info" title="You're viewing aggregate patterns (complex tail)">
        <Stack gap={10}>
          <Text size="small">
            Two stories from the {t.totalOrgs.toLocaleString()}-org base.
            One: most active paid orgs are camera-only flat and need no
            hierarchy design at all. Two: a small complex tail
            ({t.complexTailSize.toLocaleString()} orgs,{" "}
            {fmtPct(t.complexTailOrgShare, 0)} of the base) holds{" "}
            <Text as="span" weight="semibold">
              {fmtPct(t.complexTailBookingsShare, 0)} of lifetime bookings
            </Text>{" "}
            ({fmtMoney(t.complexTailBookings)} of {fmtMoney(t.totalBookings)}).
            That tail is where archetype variety actually exists, and it is
            where this view spends its time.
          </Text>
          <Text size="small" tone="secondary">
            How &quot;complex&quot; is defined: each org gets a complexity
            score that adds up how deep their site tree goes, how many
            product lines they own, and how much they&apos;ve spent with
            us. The complex tail is the top 20% of orgs by that score.{" "}
            <Text as="span" tone="secondary">
              (Score per org ={" "}
              <Code>max_depth + product_lines_count + log10(lifetime_bookings)</Code>;
              top-quintile cutoff = {t.complexityCutoffScore.toFixed(2)}.
              Method: percentile-rank cutoff computed locally in TypeScript
              from the Hex Athena pulls. Counts are one row per Salesforce
              account; for accounts with multiple Verkada organizations, the
              one with the highest total device count is treated as the
              primary deployment.)
            </Text>
          </Text>
          <Row gap={8} align="center">
            <Button variant="secondary" onClick={() => setView("overview")}>
              ← Back to overview
            </Button>
            <Button variant="secondary" onClick={() => setView("detail")}>
              Customer deep-dives →
            </Button>
          </Row>
        </Stack>
      </Callout>

      <Divider />

      <Stack gap={10}>
        <H2 id="simple-base">1. The simple base (collapsed)</H2>
        <Text size="small" tone="secondary">
          One callout. The majority of paid orgs don&apos;t need hierarchy
          design and are explicitly out of scope from here on.
        </Text>
        <SimpleBaseCallout />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="complex-tail">2. The complex tail at a glance</H2>
        <Text size="small" tone="secondary">
          Headline numbers for the top 20% of orgs by complexity. Sites
          are deeper, product mixes are richer, and bookings are
          concentrated.
        </Text>
        <ComplexTailHeadline />
        <ComplexArchetypeMixTable />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="complex-by-bookings">3. Complex tail by bookings band</H2>
        <Text size="small" tone="secondary">
          Where the bookings actually live inside the complex tail. The
          &quot;Most common archetype&quot; column flags how hierarchy
          shape changes as revenue grows.
        </Text>
        <ComplexByBookingsTable />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="complex-by-industry">4. Industry deep-dives</H2>
        <Text size="small" tone="secondary">
          Top eight industries by combined org count and bookings, each with
          its sub-industries, distinctive naming conventions, and example
          customer site structures pulled directly from Athena. Industries
          outside the top eight are listed in the callout at the bottom.
        </Text>
        <IndustryFeaturedCards />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="property-schematics">5. Property schematics</H2>
        <Text size="small" tone="secondary">
          Below the top-level facility name, customers describe property
          schematics with a small spatial vocabulary: inside vs outside,
          front vs back, entrance and lobby, loading dock, yard, parking,
          and cardinal directions. This section shows how dominant each
          family is overall, and how the mix shifts by industry.
        </Text>
        <PropertySchematicsPanel />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="complex-matrix">6. By bookings band</H2>
        <Text size="small" tone="secondary">
          One card per bookings band inside the complex tail. Each card shows
          the top five industries in that band and the most common hierarchy
          archetype customers in that cell use. Bands with fewer than five
          complex orgs in an industry are hidden for sample-size reasons.
        </Text>
        <BookingsTierIndustryCards />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="complex-top-orgs">7. Top high-value complex orgs</H2>
        <TopComplexOrgsTable />
      </Stack>

      <Divider />

      <Stack gap={10}>
        <H2 id="aggregate-method">Method &amp; caveats</H2>
        <Text size="small">
          The complexity score is intentionally simple. Three things drive
          it: how deep an org&apos;s site tree goes, how many product lines
          they own, and how much they&apos;ve booked with us. Add those
          three numbers together, sort the whole base, and the top 20%
          is the &quot;complex tail&quot;. Below that, hierarchy design
          mostly doesn&apos;t matter. Above it, every customer is
          different enough that the deep-dives are worth your time.
        </Text>
        <Text size="small" tone="secondary">
          (Method footnote: score ={" "}
          <Code>max_depth + product_lines_count + log10(lifetime_bookings)</Code>.
          Each input is on a different scale (depth maxes at ~7, product
          lines at 4, bookings up to ~$10M = 7), so the score lands in
          roughly 0-15 and the top-quintile cutoff lands near 8. Cutoff
          is a percentile rank, computed locally in TypeScript from
          flat CSVs pulled via the Hex MCP against Athena. No
          statistical model or machine learning; this is pure
          aggregation. Each Salesforce account is represented by its
          primary Verkada organization (the org with the highest total
          device count), so accounts with many child orgs (Hilton Grand
          Vacations, AMETEK, etc.) appear once.)
        </Text>
        <Text size="small" tone="secondary">
          Data pulled via the Hex MCP on{" "}
          <Code>{aggregateSnapshot.pulledAt}</Code>. Source CSVs:{" "}
          <Code>org_metrics.csv</Code> ({t.totalOrgs.toLocaleString()} rows),
          {" "}<Code>org_axes.csv</Code> (SFDC enrichment),{" "}
          <Code>root_names.csv</Code> (root-shape classification input).
          Industry buckets roll up SFDC NAICS-style strings into 20
          go-to-market verticals; full mapping in{" "}
          <Code>scripts/build-aggregate-patterns.ts</Code>.
        </Text>
      </Stack>

      <Divider />

      <Callout tone="info" title="Want to see real subtrees inside these orgs?">
        <Row gap={8} align="center">
          <Button variant="primary" onClick={() => setView("detail")}>
            Customer deep-dives →
          </Button>
          <Text size="small" tone="secondary">
            12 hand-picked complex-tail customers with their full Athena
            hierarchies and one representative subtree per root shape.
          </Text>
        </Row>
      </Callout>
    </Stack>
  );
};

function MultiProductSiteHierarchyArchetypes(): JSX.Element {
  const [view, setView] = useCanvasState<View>("currentView", "overview");
  const [, setActiveRank] = useCanvasState<number>("activeCustomerRank", 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) return;
      let targetView: View | null = null;
      let targetCustomerRank: number | null = null;
      const customerMatch = raw.match(/^customer-(\d+)$/);
      if (customerMatch) {
        targetView = "detail";
        targetCustomerRank = parseInt(customerMatch[1], 10);
      } else if (AGGREGATE_HASHES.has(raw)) {
        targetView = "aggregate";
      } else if (raw === "aggregate-patterns") {
        targetView = "overview";
      } else if (OVERVIEW_HASHES.has(raw)) {
        targetView = "overview";
      } else if (DETAIL_HASHES.has(raw)) {
        targetView = "detail";
      }
      if (targetView) setView(targetView);
      if (targetCustomerRank) setActiveRank(targetCustomerRank);
      scrollSpySuppress.until = Date.now() + 1200;
      window.requestAnimationFrame(() => {
        const el = document.getElementById(raw);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [setView, setActiveRank]);

  // Scroll-spy: track which known anchor is closest to the top of the
  // viewport and reflect it in the URL hash without firing `hashchange`. Uses
  // `history.replaceState` so it never pollutes the back/forward history.
  // Re-runs whenever `view` changes because each VIEW mounts a different set
  // of section anchors.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const isKnownHash = (id: string): boolean => {
      if (OVERVIEW_HASHES.has(id)) return true;
      if (AGGREGATE_HASHES.has(id)) return true;
      if (DETAIL_HASHES.has(id)) return true;
      if (/^customer-\d+$/.test(id)) return true;
      return false;
    };

    // Allow the new VIEW to paint before querying its anchors.
    const setup = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("[id]"),
      ).filter((el) => isKnownHash(el.id));
      if (candidates.length === 0) return () => {};

      // Track each anchor's most recent intersection ratio so we can pick the
      // "topmost-visible" one whenever any of them changes. The rootMargin
      // pushes the activation band to the top quarter of the viewport so the
      // hash flips when a heading reaches the top, not when it merely enters
      // from the bottom.
      const visibility = new Map<string, { ratio: number; top: number }>();

      const recompute = () => {
        if (Date.now() < scrollSpySuppress.until) return;
        let bestId: string | null = null;
        let bestTop = Number.POSITIVE_INFINITY;
        for (const [id, v] of visibility) {
          if (v.ratio <= 0) continue;
          // Prefer the section whose top is closest to (but at or above) the
          // activation band — i.e. the smallest non-negative top, falling
          // back to the largest negative if none qualify.
          const score = v.top >= -16 ? v.top : 10_000 - v.top;
          if (score < bestTop) {
            bestTop = score;
            bestId = id;
          }
        }
        if (!bestId) return;
        const currentHash = window.location.hash.replace(/^#/, "");
        if (currentHash === bestId) return;
        // replaceState does NOT fire `hashchange`, so this loop is safe.
        window.history.replaceState(null, "", `#${bestId}`);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = (e.target as HTMLElement).id;
            visibility.set(id, {
              ratio: e.intersectionRatio,
              top: e.boundingClientRect.top,
            });
          }
          recompute();
        },
        {
          // Anchor activates once it reaches the top quarter of the viewport.
          rootMargin: "-15% 0px -70% 0px",
          threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
        },
      );

      for (const el of candidates) observer.observe(el);
      return () => observer.disconnect();
    };

    const cleanupRef: { current: (() => void) | null } = { current: null };
    const raf = window.requestAnimationFrame(() => {
      cleanupRef.current = setup();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [view]);

  return (
    <Stack gap={20}>
      <TooltipStyles />
      <SharedHeader />
      <ViewSwitcher view={view} setView={setView} />
      <Divider />
      {view === "overview" ? (
        <OverviewSlide setView={setView} />
      ) : view === "detail" ? (
        <DetailSlide setView={setView} />
      ) : (
        <AggregateSlide setView={setView} />
      )}
    </Stack>
  );
}

export default function App(): JSX.Element {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1020",
        color: "#e5e7eb",
        padding: "32px 24px 64px",
      }}
    >
      <a href="#main-content" className="vk-skip-link">
        Skip to main content
      </a>
      <main
        id="main-content"
        aria-label="Multi-product site hierarchy archetypes dashboard"
        style={{ maxWidth: 1440, margin: "0 auto" }}
      >
        <MultiProductSiteHierarchyArchetypes />
      </main>
    </div>
  );
}
