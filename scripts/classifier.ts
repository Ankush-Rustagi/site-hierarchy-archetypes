/**
 * Site-hierarchy classifier.
 *
 * Two-level taxonomy:
 *
 *   TopShape (8 buckets) -- what kind of naming convention the node uses.
 *     lifecycle, code, geo, function, spatial, device, corporate, entity
 *
 *   SubCode (~25 sub-categories) -- the specific sub-pattern inside a
 *   top-level shape. Each TopShape has one or more SubCodes, ordered most
 *   specific to most general. First-match-wins.
 *
 * The classifier runs the same ladder regardless of depth. Sub-codes that
 * are uncommon at depth 1 (floors, rooms, gates, docks) are still resolved
 * at depth 1 -- they just won't fire often.
 *
 * Backwards-compatible shims at the bottom of the file expose the older
 * RootShape / NodeShape / ArchetypeFamily APIs by mapping from the new
 * (TopShape, SubCode) classification. Older pipelines keep working while
 * new pipelines opt into the richer model.
 *
 * No external dependencies; safe to run in CI / fresh Node.
 */

// ---------------------------------------------------------------------------
// New two-level taxonomy

export type TopShape =
  | "lifecycle"
  | "code"
  | "geo"
  | "function"
  | "spatial"
  | "device"
  | "corporate"
  | "entity";

export const TOP_SHAPES: TopShape[] = [
  "lifecycle",
  "code",
  "geo",
  "function",
  "spatial",
  "device",
  "corporate",
  "entity",
];

export const topShapeLabels: Record<TopShape, string> = {
  lifecycle: "lifecycle",
  code: "code / opaque",
  geo: "geographic",
  function: "function",
  spatial: "spatial / intra-building",
  device: "device-type",
  corporate: "corporate / org unit",
  entity: "entity-name (fallback)",
};

export const topShapeDescriptions: Record<TopShape, string> = {
  lifecycle:
    "Status hints baked into the name: retired (Z-prefix), staged, demo, temporary. These are operational tombstones, not real site organization.",
  code:
    "Short opaque codes, all-caps acronyms, ID-style suffixes, snake_case geographic codes. The name doesn't communicate anything until you know the lookup table.",
  geo:
    "Real-world places: states, cities, hyphenated city pairs, street addresses, comma-state pairs, country prefixes. Whoever made these sites thinks geographically first.",
  function:
    "Purpose-led names: stores, schools, plants, clinics, fire stations, churches, warehouses, HQs. The name tells you what the site is used for.",
  spatial:
    "Intra-building partitioning: floor, room, building letter, cardinal direction, inside/outside, lobby, parking, dock, kitchen, IT closet. Lives inside another node.",
  device:
    "Device-type label: 'Cameras Only', 'Access Panel', 'Alarm Sensor'. The site is named for the hardware that lives there, not the place or purpose.",
  corporate:
    "Business-unit naming: Division / Command / Territory / Region / Group / Holdings. Reflects an org chart, not a building.",
  entity:
    "Real-world entity name with no detectable structure: 'Smith Hall', 'Main Campus', 'Burlington Stores'. Catch-all for everything the ladder doesn't recognize.",
};

export type SubCode =
  // lifecycle
  | "retired"
  | "staged"
  | "demo_test"
  | "temporary"
  // code
  | "school_district_code"
  | "parenthetical_code"
  | "parenthetical_id"
  | "snake_case_geo"
  | "all_caps_short"
  | "all_caps_long"
  | "embedded_id"
  | "internal_prefix"
  // geo
  | "state_two_letter"
  | "state_bare"
  | "country_prefix"
  | "city_comma_state"
  | "city_hyphen"
  | "street_address"
  // function
  | "police_fire"
  | "justice"
  | "religious"
  | "clinic_health"
  | "school_named"
  | "school_short"
  | "warehouse_dc"
  | "manufacturing"
  | "office_hq"
  | "retail_format"
  | "purpose_center"
  | "hotel_hospitality"
  | "numbered_store"
  | "numeric_prefix"
  | "named_function"
  | "internal_function"
  // spatial
  | "floor_ordinal"
  | "floor_named"
  | "room_numbered"
  | "classroom"
  | "building_letter"
  | "cardinal"
  | "inside_outside"
  | "lobby_entry"
  | "parking"
  | "dock_gate"
  | "cafe_kitchen"
  | "it_data_room"
  | "lab_research"
  | "zone_area"
  | "elevator_stair"
  // device
  | "device_zone"
  | "alarm_subpanel"
  // corporate
  | "org_unit"
  // entity
  | "named";

export const subCodeLabels: Record<SubCode, string> = {
  retired: "retired (Z-prefix)",
  staged: "staged / newly added",
  demo_test: "demo / test",
  temporary: "temporary / pilot",
  school_district_code: "school district code (e.g. FL - CLAY (1417))",
  parenthetical_code: "parenthetical code suffix (e.g. (DORNSC))",
  parenthetical_id: "parenthetical numeric id (e.g. (2512))",
  snake_case_geo: "snake_case geo code (e.g. INTL_DE_Hamburg_PLT)",
  all_caps_short: "all-caps 4-6 letter acronym (e.g. ALBIR)",
  all_caps_long: "all-caps phrase (e.g. CENTRAL OFFICE)",
  embedded_id: "embedded numeric id (e.g. - 717)",
  internal_prefix: "internal acronym prefix (e.g. COR-Orlando, HPH-Hernando)",
  state_two_letter: "two-letter state code prefix (e.g. CA-)",
  state_bare: "bare two-letter state code",
  country_prefix: "country prefix (e.g. US-, INTL-)",
  city_comma_state: "city, state (e.g. Chicago, IL)",
  city_hyphen: "hyphenated city pair (e.g. Athens-Decatur)",
  street_address: "street address (e.g. 123 Main St)",
  police_fire: "police / fire / public safety",
  justice: "courthouse / jail / detention",
  religious: "church / chapel / temple / synagogue",
  clinic_health: "clinic / hospital / pharmacy",
  school_named: "school (Elementary / Middle / High / Academy / University)",
  school_short: "school short-form (ES / MS / HS)",
  warehouse_dc: "warehouse / distribution / logistics",
  manufacturing: "plant / factory / mill / production",
  office_hq: "HQ / headquarters / admin building",
  retail_format: "mall / plaza / outlet",
  purpose_center: "training / community / resource center",
  hotel_hospitality: "hotel / inn / resort",
  numbered_store: "numbered store (e.g. Store 12)",
  numeric_prefix: "numeric-prefix label (e.g. 4633 Downey)",
  named_function: "place + function (e.g. Bangkok Office, Saratoga Office)",
  internal_function: "internal function word (Office, Service, Sales, Maintenance)",
  floor_ordinal: "ordinal floor (e.g. 1st Floor)",
  floor_named: "named floor (Basement / Lobby / Roof)",
  room_numbered: "numbered room or suite (e.g. Room 101, Suite 200)",
  classroom: "classroom (e.g. Class Rm 207)",
  building_letter: "building letter / wing (e.g. Building A, G-Wing)",
  cardinal: "cardinal direction (North / South / East / West)",
  inside_outside: "indoor / outdoor / perimeter",
  lobby_entry: "lobby / entrance / vestibule",
  parking: "parking / garage",
  dock_gate: "loading dock / shipping gate",
  cafe_kitchen: "cafeteria / kitchen / dining",
  it_data_room: "MDF / IDF / server room",
  lab_research: "lab / research",
  zone_area: "zone / area / sector",
  elevator_stair: "elevator / stairwell",
  device_zone: "device-type zone",
  alarm_subpanel: "alarm sub-panel",
  org_unit: "division / territory / region / group",
  named: "named entity (no detected pattern)",
};

// Map every SubCode to its TopShape. Source of truth for both directions
// (classification fills SubCode; UI / aggregation looks up TopShape).
export const subCodeToTopShape: Record<SubCode, TopShape> = {
  retired: "lifecycle",
  staged: "lifecycle",
  demo_test: "lifecycle",
  temporary: "lifecycle",
  school_district_code: "code",
  parenthetical_code: "code",
  parenthetical_id: "code",
  snake_case_geo: "code",
  all_caps_short: "code",
  all_caps_long: "code",
  embedded_id: "code",
  internal_prefix: "code",
  state_two_letter: "geo",
  state_bare: "geo",
  country_prefix: "geo",
  city_comma_state: "geo",
  city_hyphen: "geo",
  street_address: "geo",
  police_fire: "function",
  justice: "function",
  religious: "function",
  clinic_health: "function",
  school_named: "function",
  school_short: "function",
  warehouse_dc: "function",
  manufacturing: "function",
  office_hq: "function",
  retail_format: "function",
  purpose_center: "function",
  hotel_hospitality: "function",
  numbered_store: "function",
  numeric_prefix: "function",
  named_function: "function",
  internal_function: "function",
  floor_ordinal: "spatial",
  floor_named: "spatial",
  room_numbered: "spatial",
  classroom: "spatial",
  building_letter: "spatial",
  cardinal: "spatial",
  inside_outside: "spatial",
  lobby_entry: "spatial",
  parking: "spatial",
  dock_gate: "spatial",
  cafe_kitchen: "spatial",
  it_data_room: "spatial",
  lab_research: "spatial",
  zone_area: "spatial",
  elevator_stair: "spatial",
  device_zone: "device",
  alarm_subpanel: "device",
  org_unit: "corporate",
  named: "entity",
};

// US state codes; used to validate state_two_letter / state_bare so we
// don't mistakenly treat "HQ", "IE", "OK Cam" as states.
const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","VI","GU",
  // Canadian provinces / Mexican states get parked here too; consumers who
  // care can disambiguate downstream.
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK","YT","NT","NU",
]);

// Word-boundary helper. The "i" flag matters for function/spatial because
// customers write "Lobby" / "lobby" / "LOBBY" indistinguishably. The geo
// patterns intentionally avoid /i because they care about case.
function test(pat: RegExp, s: string): boolean {
  return pat.test(s);
}
function testI(pat: RegExp, s: string): boolean {
  return new RegExp(pat.source, pat.flags.includes("i") ? pat.flags : pat.flags + "i").test(s);
}

/**
 * Classify a site name into a (TopShape, SubCode) pair. The ladder is
 * ordered most-specific to most-general. First match wins. The final
 * fallback is ("entity", "named").
 *
 * The function does NOT vary by depth. A "Room 101" at depth 1 and a
 * "Room 101" at depth 4 both classify the same. Depth-aware aggregation
 * lives in the consumers (see build-sequencing.ts which computes
 * depth-1 → depth-2 → depth-3 transitions on top of this classifier).
 */
export function classifyNodeName(name: string): { shape: TopShape; sub: SubCode } {
  const t = name.trim();
  if (t.length === 0) return { shape: "entity", sub: "named" };

  // ---- lifecycle (always wins; tombstoning trumps everything) ----
  if (test(/^Z[-_ ]/i, t)) return { shape: "lifecycle", sub: "retired" };
  if (test(/^!\s/, t)) return { shape: "lifecycle", sub: "retired" };
  if (testI(/\b(Staged|Newly Added|To be Installed)\b/, t)) return { shape: "lifecycle", sub: "staged" };
  if (testI(/\b(Demo|Test)\b/, t)) return { shape: "lifecycle", sub: "demo_test" };
  if (testI(/\b(Temp|Temporary|Pop[-\s]?up|Pilot)\b/, t)) return { shape: "lifecycle", sub: "temporary" };

  // ---- spatial: inside_outside before geo so "Outside - Madison" lands here ----
  // Only when it's the LEADING token (or follows a dash that starts a token).
  if (testI(/^(Inside|Outside|Interior|Exterior|Indoor|Outdoor|Perimeter)\b/, t)) {
    return { shape: "spatial", sub: "inside_outside" };
  }

  // ---- code / opaque ----
  // School district code wins before any state-prefix check.
  if (test(/^[A-Z]{2}\s*[-–]\s*[A-Z]/, t) && test(/\(\d{4}\)/, t)) {
    return { shape: "code", sub: "school_district_code" };
  }
  if (test(/\([A-Z][A-Z0-9_]{2,12}\)\s*$/, t)) return { shape: "code", sub: "parenthetical_code" };
  if (test(/\(\d{3,6}\)\s*$/, t)) return { shape: "code", sub: "parenthetical_id" };
  if (test(/^[A-Z]+_[A-Z]{2}_/, t)) return { shape: "code", sub: "snake_case_geo" };
  if (test(/-\s*\d{3,5}\b/, t) && !testI(/\b(Floor|Suite|Room|Rm)\b/, t)) {
    return { shape: "code", sub: "embedded_id" };
  }
  // Internal acronym prefix: "COR-Orlando", "HPH-Hernando Grief Center",
  // "GSH-Auburndale". 2-5 char all-caps, then dash, then a real word.
  // Excludes US state codes (those get caught by geo/state_two_letter
  // further down).
  {
    const m = t.match(/^([A-Z]{2,5})-([A-Z][\w'\.\s]+)$/);
    if (m && !US_STATE_CODES.has(m[1])) {
      return { shape: "code", sub: "internal_prefix" };
    }
  }

  // ---- geo ----
  // Country prefix before plain state, otherwise "US - Chicago" lands in code.
  if (testI(/^(USA|UK|MEX|INTL|EUR|CAN)\s*[-_]\s*/, t)) return { shape: "geo", sub: "country_prefix" };
  // Comma-state: city followed by ", XX" where XX is a real state.
  {
    const m = t.match(/^[A-Z][A-Za-z\'\.\-]*(?:\s+[A-Z][A-Za-z\'\.\-]+)*,\s*([A-Z]{2})\b/);
    if (m && US_STATE_CODES.has(m[1])) return { shape: "geo", sub: "city_comma_state" };
  }
  // City hyphen: "Athens-Decatur", "Mid-Wilshire". Both halves must be
  // proper-case words (>= 2 chars each) to avoid false matches on
  // "X - Y" generic separators.
  if (test(/^[A-Z][a-z]{2,}\s*-\s*[A-Z][a-z]{2,}\b/, t)) {
    return { shape: "geo", sub: "city_hyphen" };
  }
  // Street address.
  if (
    testI(
      /^\d{1,5}\s+[A-Z][\w\.\']*(?:\s+[A-Z][\w\.\']+)*\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Ct|Court|Pl|Place|Hwy|Highway|Cir|Circle|Trl|Trail|Plz|Plaza)\b/,
      t,
    )
  ) {
    return { shape: "geo", sub: "street_address" };
  }
  // State two-letter prefix: "CA - SF", "TX_Austin". Validate against
  // US_STATE_CODES so "IE Cam" / "HQ" don't qualify.
  {
    const m = t.match(/^([A-Z]{2})[-_\s]/);
    if (m && US_STATE_CODES.has(m[1])) return { shape: "geo", sub: "state_two_letter" };
  }
  if (test(/^[A-Z]{2}$/, t) && US_STATE_CODES.has(t)) return { shape: "geo", sub: "state_bare" };

  // ---- function (purpose-led; ordered so specific function beats generic) ----
  // Office / HQ before all-caps so "USA OFFICE" reads as office, not code.
  if (testI(/\b(HQ|Headquarters|Corporate Office|Admin Building|Administration Building)\b/, t)) {
    return { shape: "function", sub: "office_hq" };
  }
  if (testI(/\b(Precinct|Sheriff|Police\s+Department|Fire\s+Station|Firehouse|Fire\s+Dept|Fire\s+Hall|Marshal)\b/, t)) {
    return { shape: "function", sub: "police_fire" };
  }
  if (testI(/\b(Courthouse|Courtroom|Jail|Detention|Corrections|Probation)\b/, t)) {
    return { shape: "function", sub: "justice" };
  }
  if (testI(/\b(Church|Chapel|Mosque|Temple|Synagogue|Cathedral|Parish|Shrine)\b/, t)) {
    return { shape: "function", sub: "religious" };
  }
  if (testI(/\b(Hospital|Urgent\s+Care|Pharmacy|Medical\s+Center|Clinic|Health\s+Center|Healthcare\s+Center|ER|Practice)\b/, t)) {
    return { shape: "function", sub: "clinic_health" };
  }
  if (testI(/\b(Elementary|Middle\s+School|High\s+School|Academy|Institute|University|College|Charter\s+School)\b/, t)) {
    return { shape: "function", sub: "school_named" };
  }
  // school_short: standalone ES / MS / HS / JHS as a whole word followed
  // by space or end. Don't match inside "Ms." or "Smith".
  if (test(/(?:^|\s)(?:ES|MS|HS|JHS|EMS)(?:\s|$)/, t)) {
    return { shape: "function", sub: "school_short" };
  }
  if (testI(/\b(Warehouse|Distribution\s+Center|DC\s+\d|Fulfillment\s+Center|Logistics\s+Hub)\b/, t)) {
    return { shape: "function", sub: "warehouse_dc" };
  }
  if (testI(/\b(Plant|Factory|Mill|Refinery|Foundry|Assembly|Production)\b/, t)) {
    return { shape: "function", sub: "manufacturing" };
  }
  if (testI(/\b(Mall|Plaza|Outlet|Marketplace)\b/, t)) {
    return { shape: "function", sub: "retail_format" };
  }
  if (testI(/\b(Training\s+Center|Community\s+Center|Resource\s+Center|Conference\s+Center|Wellness\s+Center|Welcome\s+Center|Service\s+Center|Operations?\s+Center|Command\s+Center|Student\s+Center|Activity\s+Center|Recreation\s+Center|Rec\s+Center|Day\s*Care|Daycare)\b/, t)) {
    return { shape: "function", sub: "purpose_center" };
  }
  if (testI(/\b(Hotel|Inn|Resort|Lodge|Motel)\b/, t)) {
    return { shape: "function", sub: "hotel_hospitality" };
  }
  // Numbered store: "Store 12" / "Unit #15" / "Branch-7".
  if (testI(/^(Store|Unit|Shop|Branch)\s*[#\-]?\s*\d/, t)) {
    return { shape: "function", sub: "numbered_store" };
  }
  // Numeric-prefix label: "0639 Englewood - Grand Ave". Long enough to
  // distinguish from a bare facility code.
  if (test(/^\d{2,6}\s+[A-Z]/, t)) return { shape: "function", sub: "numeric_prefix" };
  // Place + function word: "Bangkok Office", "Saratoga Office",
  // "MidAtlantic Office", "Dallas Intercom", "MFG Area", "ISS Alarm".
  // Two-token name where the second token is a recognized function word.
  if (testI(/^[A-Z][\w\.]+\s+(Office|Branch|Site|Facility|Intercom|Service|Sales|Operations|Production|Maintenance|Storage|Yard|Gym|Stadium|Library|Hospital|Clinic|Pharmacy|Bank)\b/, t)) {
    return { shape: "function", sub: "named_function" };
  }
  // Bare internal function word: a single word (or two-token compound)
  // that names a use. Matches "Office", "Service", "Sales",
  // "Maintenance", "Library", "Hallway", "Storage", "Reception".
  if (testI(/^(Office|Branch|Sub[-\s]?site|Service|Sales|Operations|Production|Maintenance|Storage|Library|Hallway|Reception|Security|Admin|Administration|Facilities|Engineering|Finance|Marketing|HR|Legal|Lounge)\b/, t) && t.split(/\s+/).length <= 3) {
    return { shape: "function", sub: "internal_function" };
  }

  // ---- spatial (intra-building) ----
  if (testI(/^\d{1,2}(st|nd|rd|th)?\s*(Floor|Fl\.?|F)\b/, t) || testI(/^Floor\s+\d/, t) || testI(/^\d{1,4}F\b/, t)) {
    return { shape: "spatial", sub: "floor_ordinal" };
  }
  if (testI(/^(Basement|Mezzanine|Lobby|Penthouse|Ground|Rooftop|Roof)\b/, t)) {
    return { shape: "spatial", sub: "floor_named" };
  }
  if (testI(/^(Room|Rm\.?)\s+\d/, t) || testI(/^Suite\s+\d/, t)) {
    return { shape: "spatial", sub: "room_numbered" };
  }
  if (testI(/\b(Classroom|Class\s+Rm|Class\s+Room)\b/, t)) {
    return { shape: "spatial", sub: "classroom" };
  }
  if (testI(/^Building\s+[A-Z0-9]{1,3}\b/, t) || testI(/^Bldg\.?\s+[A-Z0-9]{1,3}\b/, t) || testI(/^[A-Z]-(Building|Bldg|Wing|Block)\b/, t) || testI(/^(Wing|Block)\s+[A-Z0-9]{1,3}\b/, t)) {
    return { shape: "spatial", sub: "building_letter" };
  }
  if (testI(/^(North|South|East|West|NE|NW|SE|SW)\b/, t)) {
    return { shape: "spatial", sub: "cardinal" };
  }
  if (testI(/\b(Lobby|Reception|Entrance|Entry|Vestibule|Foyer)\b/, t)) {
    return { shape: "spatial", sub: "lobby_entry" };
  }
  if (testI(/\b(Parking\s+Lot|Parking\s+Garage|Parking\s+Structure|Parking|Garage|Carport)\b/, t)) {
    return { shape: "spatial", sub: "parking" };
  }
  if (testI(/\b(Loading\s+Dock|Dock\s+\d|Gate\s+\d|Shipping|Receiving)\b/, t)) {
    return { shape: "spatial", sub: "dock_gate" };
  }
  if (testI(/\b(Cafeteria|Cafe|Kitchen|Dining|Galley|Break\s+Room)\b/, t)) {
    return { shape: "spatial", sub: "cafe_kitchen" };
  }
  if (testI(/\b(MDF|IDF|Server\s+Room|Data\s+Center|Network\s+Closet|IT\s+Closet|Telco\s+Room)\b/, t)) {
    return { shape: "spatial", sub: "it_data_room" };
  }
  if (testI(/\b(Laboratory|Research\s+Lab)\b/, t) || test(/\b[A-Z][a-z]+\s+Lab\b/, t)) {
    return { shape: "spatial", sub: "lab_research" };
  }
  if (testI(/\b(Zone\s+[A-Z0-9]|Area\s+[A-Z0-9]|Sector\s+[A-Z0-9]|Quadrant|Bay\s+\d)\b/, t)) {
    return { shape: "spatial", sub: "zone_area" };
  }
  if (testI(/\b(Elevator|Stairwell|Stairway|Stairs)\b/, t)) {
    return { shape: "spatial", sub: "elevator_stair" };
  }
  // Bare room number "101 - Suite 101", "316 - Facilities".
  if (test(/^\d{2,5}\s*-\s*[A-Z]/, t) || test(/^\d{3,5}\b/, t)) {
    return { shape: "spatial", sub: "room_numbered" };
  }

  // ---- device ----
  if (testI(/^(Cameras?|Access|Alarms?|Sensors?|AC|AP|Panel)\b/, t) && t.split(/\s+/).length <= 4) {
    return { shape: "device", sub: "device_zone" };
  }
  if (testI(/\b(Alarm\s+Panel|Door\s+Contact|Motion\s+Sensor)\b/, t)) {
    return { shape: "device", sub: "alarm_subpanel" };
  }

  // ---- corporate ----
  if (testI(/\b(Division|Command|Territory|Region|Holdings|Corporation|Subsidiary|Bureau|Conglomerate|Red\s+Apple)\b/, t)) {
    return { shape: "corporate", sub: "org_unit" };
  }
  // Plain "Group" is too ambiguous to fire on its own; require it next to
  // a proper-case prefix to count as corporate.
  if (test(/^[A-Z][\w\-]+\s+(Group|Holdings|Division|Region)\b/, t)) {
    return { shape: "corporate", sub: "org_unit" };
  }

  // ---- code fallbacks (short / long all-caps) ----
  if (test(/^[A-Z]{4,6}$/, t)) return { shape: "code", sub: "all_caps_short" };
  if (test(/^[A-Z][A-Z\s\.\-]{6,}[A-Z]$/, t)) return { shape: "code", sub: "all_caps_long" };

  // ---- entity (catch-all) ----
  return { shape: "entity", sub: "named" };
}

// ---------------------------------------------------------------------------
// Backwards-compatible shims. Existing pipelines (build-customer-subtrees.ts,
// build-aggregate-patterns.ts before the next pass) call these.
// ---------------------------------------------------------------------------

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

// Map new TopShape -> old RootShape (best-fit). Used by the legacy callers.
function topShapeToRootShape(top: TopShape, sub: SubCode): RootShape {
  if (top === "lifecycle") return "lifecycle_marker";
  if (top === "code") {
    if (sub === "school_district_code") return "school_code";
    return "facility_code";
  }
  if (top === "geo") return "geographic";
  if (top === "function") {
    // Function-word in the old vocabulary was ONLY all-caps PRECINCT /
    // CAUCUS-style. Map office_hq / all_caps_long to that; everything
    // else in function lands in entity_name in the old vocabulary, which
    // is the same place it would have landed before the taxonomy expansion.
    if (sub === "office_hq" || sub === "school_short") return "function_word";
    return "entity_name";
  }
  if (top === "spatial") return "entity_name"; // old root-shape didn't have spatial
  if (top === "device") return "entity_name";
  if (top === "corporate") return "corporate_tree";
  return "entity_name";
}

/**
 * Legacy depth-1 classifier. Re-derived from the new ladder.
 */
export function inferRootShape(name: string): RootShape {
  const { shape, sub } = classifyNodeName(name);
  return topShapeToRootShape(shape, sub);
}

// ---- NodeShape (legacy depth-2+ classifier) ----

export type NodeShape =
  | RootShape
  | "floor_or_room"
  | "cardinal_direction"
  | "building_letter"
  | "device_zone";

export const NODE_SHAPES: NodeShape[] = [
  "geographic",
  "facility_code",
  "function_word",
  "entity_name",
  "corporate_tree",
  "school_code",
  "lifecycle_marker",
  "floor_or_room",
  "cardinal_direction",
  "building_letter",
  "device_zone",
];

export const nodeShapeLabels: Record<NodeShape, string> = {
  geographic: "geographic",
  facility_code: "facility-code",
  function_word: "function-word",
  entity_name: "entity-name",
  corporate_tree: "corporate-tree",
  school_code: "school-code",
  lifecycle_marker: "lifecycle-marker",
  floor_or_room: "floor / room",
  cardinal_direction: "cardinal / interior-exterior",
  building_letter: "building-letter",
  device_zone: "device-type zone",
};

/**
 * Legacy depth-2+ classifier. Re-derived from the new ladder.
 */
export function inferNodeShape(name: string): NodeShape {
  const { shape, sub } = classifyNodeName(name);
  if (shape === "spatial") {
    if (sub === "floor_ordinal" || sub === "floor_named" || sub === "room_numbered" || sub === "classroom") {
      return "floor_or_room";
    }
    if (sub === "cardinal" || sub === "inside_outside") return "cardinal_direction";
    if (sub === "building_letter") return "building_letter";
    // Everything else (lobby, parking, dock, cafe, IT room, lab, zone,
    // elevator) collapses to entity_name in the old NodeShape vocabulary.
    return "entity_name";
  }
  if (shape === "device") return "device_zone";
  return topShapeToRootShape(shape, sub);
}

// ---- Archetype family + composition (unchanged surface) ----

export type ArchetypeFamily =
  | "geographic_first"
  | "facility_code"
  | "function_first"
  | "single_campus"
  | "flat_fleet"
  | "deep_command"
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

export function isMultiArchetype(rootShapes: RootShape[]): boolean {
  return new Set(rootShapes).size >= 2;
}

export function hasLifecycleMarkers(rootShapes: RootShape[]): boolean {
  return rootShapes.includes("lifecycle_marker");
}

export type CompositionVector = Record<RootShape, number>;

export function composeRootShapes(shapes: RootShape[]): CompositionVector {
  const out: CompositionVector = {
    geographic: 0,
    facility_code: 0,
    function_word: 0,
    entity_name: 0,
    corporate_tree: 0,
    school_code: 0,
    lifecycle_marker: 0,
  };
  if (shapes.length === 0) return out;
  for (const s of shapes) out[s] += 1;
  for (const k of Object.keys(out) as RootShape[]) out[k] = out[k] / shapes.length;
  return out;
}

export function pickDominantShape(shapes: RootShape[]): RootShape | undefined {
  if (shapes.length === 0) return undefined;
  const counts = new Map<RootShape, number>();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: RootShape | undefined = undefined;
  let bestCount = -1;
  for (const s of ROOT_SHAPES) {
    const c = counts.get(s) ?? 0;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

export function dominantShare(shapes: RootShape[]): number {
  if (shapes.length === 0) return 0;
  const dom = pickDominantShape(shapes);
  if (!dom) return 0;
  let c = 0;
  for (const s of shapes) if (s === dom) c += 1;
  return c / shapes.length;
}

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
  if (dominantShape === "function_word") return "function_first";
  if (dominantShape === "geographic") return "geographic_first";
  if (dominantShape === "facility_code") return "facility_code";
  if (dominantShape === "school_code") return "facility_code";
  if (input.topLevelNodes <= 3 && input.totalSites <= 50) return "single_campus";
  if (input.topLevelNodes >= 20 && input.maxDepth <= 3) return "flat_fleet";
  if (dominantShape === "corporate_tree") return "deep_command";
  return "flat_fleet";
}
