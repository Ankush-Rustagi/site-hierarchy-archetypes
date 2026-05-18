# Site naming taxonomy

This file documents the two-level taxonomy used to classify every site-name
node in the complex-tail dataset (6,282 customers, 151,713 sites). The classifier
lives in `scripts/classifier.ts` and is the source of truth.

## Why two levels

The original classifier had 7 top-level "root shapes" and used a coarse
`hybrid_legacy` bucket to label organizations that didn't fit any single
shape. The result: 88% of depth-1 node names landed in a black-box
`entity_name` bucket, and the `hybrid_legacy` archetype absorbed every
mixed-naming organization regardless of what was actually in their tree.

The new taxonomy fixes both problems:

1. **Top-level shape (8 categories)** describes the *kind* of naming
   convention. Coarse enough to render as a small set of color-coded
   buckets in the UI.
2. **Sub-code (35 categories)** describes the *specific pattern* inside a
   top-level shape. Granular enough to power per-industry drill-downs and
   per-org composition pills.

The classifier emits a `(topShape, subCode)` pair for every node. Each
sub-code maps to exactly one top-level shape (see `subCodeToTopShape` in
the classifier).

## Top-level shapes

| Shape | What it means | Example names |
|-------|---------------|---------------|
| `lifecycle` | Status tombstones baked into the name. Retired, staged, demo, temporary. Not real site structure. | `Z- Old Office`, `Staged - Newly Added`, `Demo Devices`, `Temp Trailer` |
| `code` | Short opaque codes, acronyms, IDs. The name means nothing without a lookup table. | `ALBIR`, `(DORNSC)`, `INTL_DE_Hamburg_PLT`, `HPH-Hernando` |
| `geo` | Real-world places: states, cities, addresses, country prefixes. | `CA-SF`, `Chicago, IL`, `Athens-Decatur`, `123 Main St`, `US - Houston` |
| `function` | Purpose-led names: stores, schools, plants, clinics, fire stations, churches. | `Lincoln Elementary`, `Store 12`, `Fire Station 5`, `Distribution Center` |
| `spatial` | Intra-building partitioning: floor, room, building letter, lobby, parking, dock. Almost always lives *inside* another node. | `1st Floor`, `Building A`, `Lobby`, `Parking Lot`, `Server Room`, `Cafeteria` |
| `device` | Names that describe device type rather than place. | `Cameras Only`, `Access Panel`, `Alarm Sensor` |
| `corporate` | Business-unit naming reflecting an org chart, not a building. | `Division East`, `Territory 3`, `Acme Holdings` |
| `entity` | Catch-all when no pattern matches. Real-world names with no detectable structure. | `Smith Hall`, `Main Campus`, `Burlington Stores` |

## Sub-codes by top-level shape

Sub-codes are listed in the order they appear in the regex ladder
(`scripts/classifier.ts → classifyNodeName`). First match wins. Anything
the ladder doesn't recognize falls through to `entity / named`.

### lifecycle

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `retired` | `Z-`, `Z_`, leading `!` | `Z- Old Office`, `!Decommissioned` |
| `staged` | Staged / Newly Added / To be Installed | `Newly Added Devices` |
| `demo_test` | Demo / Test | `Test Devices`, `Demo Cameras` |
| `temporary` | Temp / Temporary / Pop-up / Pilot | `Temp Trailer`, `Pilot Site` |

### code

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `school_district_code` | `XX - Name (1234)` | `FL - CLAY (1417)` |
| `parenthetical_code` | trailing `(ABCDE)` | `Main Office (DORNSC)` |
| `parenthetical_id` | trailing `(12345)` | `BLD 1 (2512)` |
| `snake_case_geo` | `XXX_YY_City_TYPE` | `INTL_DE_Hamburg_PLT` |
| `embedded_id` | trailing ` - 12345` | `Mobile - 717 Downtowner Loop` |
| `internal_prefix` | `ABC-Name` (acronym, not a state) | `HPH-Hernando Grief Center`, `COR-Orlando` |
| `all_caps_short` | bare 4-6 letter all-caps | `ALBIR`, `FLLAK` |
| `all_caps_long` | longer all-caps phrase | `USA OFFICE`, `CENTRAL OFFICE` |

### geo

Validated against the US-state + Canadian-province code list so that
"HQ" / "IE" / "AA" don't masquerade as state codes.

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `country_prefix` | `USA-`, `INTL-`, `MEX-` | `INTL - Frankfurt`, `USA - Denver` |
| `city_comma_state` | `City, ST` where ST is a real state | `Chicago, IL`, `Houston, TX` |
| `city_hyphen` | two proper-case words joined by `-` | `Athens-Decatur`, `Mid-Wilshire` |
| `street_address` | `123 Main St` | `198 Geneva Ave`, `1731 Petit Road` |
| `state_two_letter` | leading `XX-` where XX is a real state | `CA - SF`, `TX_Austin` |
| `state_bare` | exactly `XX` and XX is a real state | `OK`, `WA` |

### function

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `office_hq` | HQ / Headquarters / Admin Building | `Kiln Creek HQ`, `Admin Building` |
| `police_fire` | Precinct / Sheriff / Police Dept / Fire Station | `Fire Station 5`, `Sheriff's Office` |
| `justice` | Courthouse / Jail / Detention / Probation | `Anchorage Courthouse`, `Jail - Laundry` |
| `religious` | Church / Chapel / Temple / Mosque / Synagogue / Cathedral | `Cleveland Ohio Temple`, `St. Mary Chapel` |
| `clinic_health` | Hospital / Clinic / Pharmacy / Urgent Care / Medical Center | `Whittier Hospital`, `Pharmacy` |
| `school_named` | Elementary / Middle School / High School / Academy / Charter | `Lincoln Elementary`, `Bowman Middle School` |
| `school_short` | ES / MS / HS / JHS (whole word) | `LaCumbre JHS`, `Buckeye Union HS` |
| `warehouse_dc` | Warehouse / Distribution Center / Fulfillment | `Edith Warehouse`, `SLC Distribution Center` |
| `manufacturing` | Plant / Factory / Mill / Refinery / Foundry / Assembly | `Plant 7`, `Treatment Plant` |
| `retail_format` | Mall / Plaza / Outlet | `Fashion Square`, `Mid Rivers Mall` |
| `purpose_center` | Training / Community / Resource / Conference Center | `MCSO Training Center`, `Student Center` |
| `hotel_hospitality` | Hotel / Inn / Resort / Lodge / Motel | `Marriott Inn` |
| `numbered_store` | `Store 12`, `Unit #5`, `Branch-7` | `Store #0667 - The Venetian, NV` |
| `numeric_prefix` | `0639 Englewood - Grand Ave` | `4633 Downey Distribution` |
| `named_function` | `Bangkok Office`, `Saratoga Office` | `MidAtlantic Office`, `Dallas Intercom` |
| `internal_function` | bare `Office`, `Service`, `Sales`, `Maintenance` | `Service`, `Reception` |

### spatial

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `floor_ordinal` | `1st Floor`, `2F`, `Floor 3` | `1st Floor - Bank` |
| `floor_named` | `Basement`, `Lobby`, `Rooftop`, `Penthouse` | `Basement`, `Rooftop` |
| `room_numbered` | `Room 101`, `Suite 200`, `316 - Lab` | `101 - Suite 101` |
| `classroom` | `Classroom`, `Class Rm 207` | `Special Education Class Rm 207` |
| `building_letter` | `Building A`, `G-Wing`, `Bldg 4`, `Block 2` | `Bus Garage Building H` |
| `cardinal` | `North`, `South`, `East`, `West`, `NE`, etc. | `South Independence Branch` |
| `inside_outside` | leading `Inside` / `Outside` / `Interior` / `Exterior` / `Perimeter` | `Outside - Madison`, `Perimeter` |
| `lobby_entry` | Lobby / Reception / Entrance / Entry / Vestibule | `Front Vestibule`, `Main Lobby` |
| `parking` | Parking / Garage / Carport | `Parking Lot`, `Police Garage` |
| `dock_gate` | Loading Dock / Gate 4 / Shipping / Receiving | `Loading Dock`, `Gate 5` |
| `cafe_kitchen` | Cafeteria / Cafe / Kitchen / Dining / Break Room | `ACES Cafeteria`, `Eastro Kitchen` |
| `it_data_room` | MDF / IDF / Server Room / Data Center / Network Closet | `MDF`, `CH - 3rd Flr IDF Room` |
| `lab_research` | Laboratory / Research / `[Word] Lab` | `Quality Lab`, `Bio Lab` |
| `zone_area` | Zone 1 / Area 3 / Sector A / Quadrant / Bay 4 | `Zone 1`, `Mammals Area 3` |
| `elevator_stair` | Elevator / Stairwell / Stairs | `Elevator`, `Stairwell A` |

### device

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `device_zone` | leading `Cameras`, `Access`, `Alarms`, `Panel` (short name) | `Cameras Only`, `Access Control` |
| `alarm_subpanel` | Alarm Panel / Motion Sensor / Door Contact | `Alarm Panel - Door Contact` |

### corporate

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `org_unit` | Division / Command / Territory / Region / Group / Holdings / Bureau | `AEG Presents - Finance Department` |

### entity

| Sub-code | Pattern | Examples |
|----------|---------|----------|
| `named` | catch-all (nothing else matched) | `Smith Hall`, `Main Campus`, `Burlington Stores` |

## Distribution across all 151,713 nodes

Top sub-codes by share (≥ 0.3%). All others are smaller; full list in
`src/data/taxonomy.json`.

| Sub-code | Shape | Count | Share |
|----------|-------|------:|------:|
| named | entity | 82,067 | 54.1% |
| school_named | function | 5,485 | 3.6% |
| numeric_prefix | function | 5,435 | 3.6% |
| room_numbered | spatial | 4,808 | 3.2% |
| inside_outside | spatial | 3,913 | 2.6% |
| city_hyphen | geo | 3,763 | 2.5% |
| embedded_id | code | 3,639 | 2.4% |
| floor_ordinal | spatial | 2,936 | 1.9% |
| state_two_letter | geo | 2,930 | 1.9% |
| named_function | function | 2,878 | 1.9% |
| internal_function | function | 2,347 | 1.5% |
| staged | lifecycle | 2,086 | 1.4% |
| cardinal | spatial | 1,701 | 1.1% |
| internal_prefix | code | 1,676 | 1.1% |
| city_comma_state | geo | 1,656 | 1.1% |
| all_caps_short | code | 1,641 | 1.1% |
| school_short | function | 1,636 | 1.1% |

## Distinctive sub-codes per industry

These are sub-codes that over-index ≥ 1.5x vs the cross-tail baseline.
Anchored on real signal in the complex-tail data.

| Industry | Top distinctive sub-codes |
|----------|---------------------------|
| K-12 | `school_named` (3.8x), `school_short` (3.6x), `cafe_kitchen` (2.7x) |
| Higher Ed | `building_letter` (4.2x), `floor_ordinal` (2.7x), `purpose_center` (2.7x) |
| Government | `justice` (8.6x), `police_fire` (8.5x), `purpose_center` (3.2x) |
| Healthcare | `clinic_health` (9.0x), `embedded_id` (3.1x), `street_address` (2.5x) |
| Manufacturing | `snake_case_geo` (11.8x), `manufacturing` (5.9x), `dock_gate` (4.3x) |
| Retail | `numbered_store` (10.9x), `retail_format` (4.2x), `room_numbered` (3.2x) |
| Transportation & Logistics | `org_unit` (14.6x), `city_hyphen` (9.3x), `city_comma_state` (4.8x) |
| Wholesale | `parenthetical_id` (11.4x), `warehouse_dc` (6.3x), `city_comma_state` (4.3x) |
| Financial Services | `room_numbered` (4.2x), `it_data_room` (3.7x), `floor_named` (2.9x) |
| Tech & Information | `embedded_id` (6.3x), `city_comma_state` (4.2x), `retail_format` (3.3x) |
| Agriculture | `numeric_prefix` (9.9x), `parenthetical_code` (4.0x), `retail_format` (3.3x) |
| Construction | `city_comma_state` (5.2x), `room_numbered` (3.3x), `state_two_letter` (3.1x) |
| Professional Services | `religious` (6.3x), `lobby_entry` (2.4x), `state_two_letter` (2.2x) |
| Arts & Entertainment | `hotel_hospitality` (8.6x), `all_caps_long` (3.3x), `cafe_kitchen` (1.7x) |

The cross-industry takeaway is that **vocabulary maps to vertical**. K-12
talks in school terms. Government talks in courts and precincts.
Manufacturing talks in plants and docks. Retail talks in numbered stores.
The taxonomy makes those vocabularies visible at a glance.

## Per-industry sub-segments

Every industry card on the dashboard is partitioned into 2-13 named
sub-segments plus 4-5 **bookings-tier fallback buckets** for customers
whose account name doesn't match any named regex. Sub-segment
definitions live in `scripts/subsegments.ts`.

The named regex ladder covers brand families, function keywords,
government naming conventions, and known industry leaders. Whatever
falls through gets classified by lifetime-bookings tier:

| Fallback bucket | Bookings range |
|-----------------|----------------|
| `other_strategic` | $5M+ |
| `other_enterprise` | $500k - $5M |
| `other_midmarket` | $100k - $500k |
| `other_commercial` | $25k - $100k |
| `other_smb` | <$25k |

This is a deliberate two-axis design. The named regex catches industry
substructure when the customer name signals it; the bookings tier
catches scale when the name doesn't. A Retail customer named
"Burlington Stores Inc" matches the `department_store` named segment,
but "Yandy.com" falls through to `other_enterprise` because the brand
name carries no industry signal. Both end up in meaningful buckets.

The dashboard renders each sub-segment with:
- population org count, lifetime bookings, open pipeline value
- share of the parent industry
- the top distinctive sub-codes for the sub-segment's complex-tail orgs

### Named segments per industry

| Industry | Named segments |
|----------|----------------|
| K-12 | districts / charter networks / standalone HS / faith-based |
| Higher Ed | research universities / liberal arts / community colleges / polytechnics |
| Trade Schools & Other Ed | trade schools / specialty ed |
| Government | federal / state / county / municipal / public safety / housing authority / transit airport / tribal / education admin / special district |
| Healthcare | hospital systems / clinic networks / specialty providers / pharmacies / senior living / payers & insurers |
| Retail | auto dealers / grocery & food / apparel & fashion / home & furnishings / specialty retail / department stores |
| Real Estate | multi-family / self storage / commercial property / property services / developers & builders / marinas & recreation |
| Financial Services | banks / credit unions / insurance / asset management / mortgage & lending / specialty finance |
| Nonprofit & Civic | religious / social services / youth education / foundations / advocacy & civic / health nonprofit / animal welfare / legal aid / labor unions |
| Professional Services | legal & accounting / consulting / marketing / engineering & arch / veterinary / staffing & HR / automotive services / R&D testing |
| Manufacturing | food & beverage / chemical & pharma / industrial equipment / automotive / building materials / consumer products |
| Construction | general contractor / specialty trades / infrastructure / residential / aggregates & materials / industrial engineering |
| Utilities | renewable / electric / gas & oil distribution / water & waste |
| Energy & Mining | oil & gas / mining / energy services |
| Transportation & Logistics | trucking / 3PL / intermodal / aviation / transit & rail / vehicle rental |
| Wholesale | food distribution / industrial distribution / building supply / specialty wholesale / packaging / ag commodities |
| Arts & Entertainment | casinos & gaming / museums & cultural / stadiums & venues / fitness & recreation / theme parks / media production |
| Hospitality | hotels & resorts / restaurant chains / bars & nightlife / catering & events |
| Admin & Support | facilities / security / waste & environmental / personal services |
| Tech & Information | software & SaaS / telecom / data center / media & publishing / hardware & devices |
| Agriculture | crop production / livestock & dairy / forestry & fishing / ag services |
| Unknown / Other | (bookings-tier only) |

Each industry's named segments are followed by the 4-5 bookings-tier
fallback buckets, so every customer in every industry is assigned to
exactly one sub-segment.

### Coverage notes

After the regex expansion + bookings-tier fallback, no industry has a
single opaque "Other" bucket anymore. Where named-segment coverage is
strong (K-12: 91% of orgs in named segments; Higher Ed: 86%; Government:
80%; Healthcare: 46% in named + the rest split by tier), the named
segments tell most of the story. Where named-segment coverage is weak
(Retail: 27% named; Manufacturing: 21% named; Professional Services:
13% named), the bookings tiers carry the weight. Both axes are visible
in the dashboard so you can compare scale even within "Other".

## Example customers per card

Every industry card carries 5 example customers, drawn from the
complex-tail subset (~6,282 orgs with full hierarchy data). Selection is
biased to surface different sub-codes: the first picks are the
highest-scoring orgs whose tree contains the industry's distinctive
sub-codes, the rest fill by composite complexity score
(`max_depth + log10(sites) + log10(bookings)`).

Each example carries:
- account name, sub-segment id, lifetime bookings, total site count,
  max depth
- depth-1 composition (top-shape + sub-code breakdown)
- the top 5 most distinctive sub-codes for the org
- up to 5 **representative root subtrees**: for each of the org's top
  depth-1 sites (ranked by total device count), the top 6 depth-2
  children by device count and, under each, the top 3 depth-3
  grandchildren

The tree fragment is enough to show the customer's site-construction
pattern without dumping every leaf. Example: Hoag Memorial Hospital's
"HOAG HOSPITAL NEWPORT BEACH" root expands into "WEST TOWER" / "EAST
TOWER" / "EMERGENCY DEPARTMENT (HHNB)" / "SOUTH PARKING STRUCTURE" /
"CANCER CENTER" — five depth-2 sites that immediately explain how a
multi-tower hospital site is organized.

## How to add a new sub-code

1. Open `scripts/classifier.ts`.
2. Add the new identifier to the `SubCode` union type.
3. Add a label entry to `subCodeLabels` and a top-shape mapping to
   `subCodeToTopShape`.
4. Insert the detection regex into `classifyNodeName` at the right
   position. Order matters: most-specific patterns first, generic
   fallbacks last. If your new sub-code shares vocabulary with an
   existing one, place it ahead of the more general one.
5. Run `npm run build:taxonomy` and inspect the new sub-code's share.
   If it's < 0.3%, consider whether it's worth a dedicated label or
   if it can be folded into a similar existing sub-code.
6. Re-run `npm run build:all-data` to regenerate every downstream JSON.

## Data products that use the taxonomy

| File | What it carries | Built by |
|------|-----------------|----------|
| `src/data/taxonomy.json` | per-industry distributions, per-sub-segment fingerprints, and 5 example customers per card with representative root subtrees | `scripts/build-taxonomy-snapshot.ts` |
| `src/data/aggregate-patterns.json` | population, archetype, and bookings rollups (uses legacy `RootShape` via back-compat shim) | `scripts/build-aggregate-patterns.ts` |
| `src/data/sequencing.json` | depth-1 → depth-2 → depth-3 transitions across the complex tail (uses legacy `NodeShape`) | `scripts/build-sequencing.ts` |
| `src/data/customer-subtrees.json` | full site hierarchies for the 12 deep-dive customers | `scripts/build-customer-subtrees.ts` |
