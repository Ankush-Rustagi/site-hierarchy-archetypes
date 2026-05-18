# Findings brief — complex tail hierarchy patterns

Generated locally from the new Hex pull and the rebuilt pipelines. Data
files live in `src/data/aggregate-patterns.json` and `src/data/sequencing.json`.

## Headline numbers

- 6,282 complex-tail orgs (top quintile by complexity score).
- $2,513M lifetime bookings = 74.5% of total active-paid bookings.
- 6.6% of complex orgs are genuinely mixed (dominant root shape < 60% of their depth-1 roots). The rest have a clear dominant shape.

## Why `hybrid_legacy` was misleading

The old classifier emitted `hybrid_legacy` whenever an org had ≥3 distinct root shapes OR ≥2 shapes that included lifecycle markers. With composition vectors instead of single labels, that "miscellaneous" bucket evaporates — 86.3% of complex orgs are actually `entity_name`-dominant, not "hybrid". The composition view also reveals that lifecycle markers (Z-, Demo, Staged) ride along with another shape; they aren't a primary axis. Recommendation already implemented: every org gets a composition vector, the headline archetype is just the mode of the vector.

## What the classifier was hiding

`inferRootShape` had no category for floor codes ("1st Floor", "Room 101"), cardinal directions ("Outside - Madison"), building letters ("Building A"), or device-type zones ("Cameras Only"). Those names defaulted to `entity_name`, inflating that category. The new `inferNodeShape` (used at depth 2+) adds those four categories. At depth 1 they show up too:

- entity_name: 73.6%
- floor_or_room: 12.2%
- geographic: 5.3%
- lifecycle_marker: 4.1%
- facility_code: 2.3%
- cardinal_direction: 1.6%
- building_letter: 0.3%
- corporate_tree: 0.3%
- device_zone: 0.1%
- function_word: 0.1%
- school_code: 0.0%

Roughly **14% of complex-tail roots are NOT entity_name once we resolve the depth-2-style patterns at depth 1**. That's the actual structural variety we can speak to.

## Top 10 sequencing paths across the complex tail

These are depth-1 → depth-2 → depth-3 shape transitions, counted once per (root, child, grandchild) triple in the materialized hierarchy.

```
entity_name        → entity_name        → entity_name           46.8%  (10,600 paths)
entity_name        → cardinal_direction → entity_name            4.3%     (967)
entity_name        → entity_name        → cardinal_direction     4.2%     (956)
entity_name        → entity_name        → floor_or_room          4.2%     (945)
corporate_tree     → entity_name        → entity_name            3.9%     (879)
entity_name        → geographic         → entity_name            3.0%     (672)
facility_code      → entity_name        → entity_name            2.7%     (617)
entity_name        → floor_or_room      → entity_name            2.7%     (606)
entity_name        → entity_name        → geographic             2.1%     (472)
geographic         → entity_name        → entity_name            1.9%     (436)
```

The dominant pure-entity path is half of all triples; the rest splits into a long tail where customers mix one structural shape (geographic / cardinal / floor / corporate) into an entity-name-heavy tree.

## Per-industry signal

19 industry buckets. Org counts inside the complex tail (top 6 by bookings):

| Industry | Orgs | Bookings | Mixed-comp | Top D1→D2→D3 path | Path % |
|---|--:|--:|--:|---|--:|
| K-12 | 1,641 | $894M | 8.3% | entity→entity→entity | 53.2% |
| Government | 774 | $252M | 4.3% | entity→entity→entity | 53.3% |
| Professional Services | 790 | $232M | 6.2% | entity→entity→entity | 64.2% |
| Manufacturing | 643 | $214M | 6.8% | entity→entity→entity | 27.9% |
| Retail | 329 | $191M | 6.1% | entity→entity→entity | 28.4% |
| Healthcare | 422 | $152M | 5.0% | entity→entity→entity | 39.4% |

Manufacturing and Retail stand out as the most structurally diverse (lowest "top path" concentration). Tech & Information has the highest mixed-composition rate (10.4%) — those orgs really do mix shapes. Utilities is the only industry whose top path is **not** all entity_name (entity → geographic → floor_or_room at 35%).

## Example complex-tail customers per top industry

K-12:
- Cherry Creek School District (CO): 425 sites, depth 5, $19.4M, 60% entity / 40% lifecycle (lots of staged / Z- nodes).
- Santa Clara USD: 32 sites, depth 1, $15.9M, 97% entity.
- San Antonio ISD: 367 sites, depth 3, $12.5M, 98% entity.

Manufacturing:
- Caterpillar: 193 sites, depth 5, $5.4M, 78% geographic / 17% entity.
- Precision Castparts Corp: 68 sites, depth 4, $3.7M, 77% entity / 13% facility-code / 9% lifecycle.

Retail (most interesting because it's where shape diversity actually lives):
- Burlington Stores: 420 sites, depth 4, $27.1M, 49% corporate-tree / 41% entity / 10% lifecycle.
- FEMSA / OXXO: 1,052 sites, depth 5, $17.6M, 95% entity.

Government:
- Fort Lauderdale-Hollywood Airport: 44 sites, depth 3, $7.0M, 100% entity.
- GA-Municipality-Columbus: 417 sites, depth 5, $6.1M, 95% entity.
- Dallas Police Department: 19 sites, depth 1, $5.3M, 87% entity / 9% lifecycle.

## Proposed UI structure (Aggregate view)

```
0. Page intro (existing, keep)
   - "Aggregate patterns of the complex tail" headline
   - composite score explanation + dedup footnote

1. Simple base (existing, keep, collapsed)

2. Complex tail headline (existing, keep)
   - org count, bookings share, median depth, mixed-comp rate

3. Cross-industry sequencing funnel (NEW)
   - Header: "How site trees actually grow in the complex tail"
   - Depth-1 shape distribution (one row of % numbers, plain text:
     "entity_name: 74%, floor_or_room: 12%, geographic: 5%, ...")
   - Top 10 sequencing paths as a table:
       D1 shape | D2 shape | D3 shape | Paths | Share
   - Method footnote: counts over 6,282 orgs / 151,713 sites, classified
     by inferNodeShape; no model or sampling.

4. By bookings band (existing, keep)

5. Industry deep-dives (REPLACES existing #4 + #5)
   - Top: cross-industry themes paragraph
     - "Across the complex tail, entity-name naming dominates (74% of
       depth-1 roots), with floor-and-room codes the second-largest
       category at 12%. Industries with the most structural diversity
       are Manufacturing and Retail; Utilities is the only industry
       whose typical sequence starts entity → geographic → floor_or_room."
   - Then 19 industry tabs / accordions, each:
     - one-line summary (orgs, bookings, mixed-comp rate)
     - composition bar (% per shape across this industry)
     - sequencing funnel for this industry (top 5-8 paths)
     - 6 example customers in a table with composition pills

6. Top 20 complex orgs (existing, keep but replace label with
   composition pill: "60% entity / 25% geographic / 15% facility-code"
   instead of one archetype label)

7. Method & caveats (existing, extend with sequencing methodology and
   the new NodeShape categories)
```

Each "composition pill" is just colored bar segments labelled by shape with % numbers — no SVG, plain divs with widths, very lightweight.

The sequencing funnel renders as a Sankey-style list (per your choice): one row per path with "From → Mid → To" shape names and percentage. No SVG diagram; just typography. That keeps the UI fast and readable.

## What I need from you before building

1. **Are the entity_name shares too dominant to make for an interesting story?** If yes, two options:
   a. Re-introduce a richer depth-1 classifier (split entity_name into building-name vs. address vs. tenant-name sub-categories).
   b. Skip the depth-1 funnel and emphasize the depth-2 / depth-3 funnel, where the variety is higher.

2. **Industry coverage.** All 19 buckets, or just the top 8 with ≥ 200 complex orgs (K-12, Government, Professional Services, Manufacturing, Retail, Healthcare, Higher Ed, Financial Services)? Below 200 orgs the sequencing signal gets noisy.

3. **What's the narrative arc?** Right now the data says "most orgs use entity-name naming end-to-end; only Manufacturing and Retail are genuinely heterogeneous; mixed-composition orgs are a 6.6% minority." Is that the story you want to land, or would you rather emphasize what the heterogeneous orgs (Caterpillar, Burlington, Salvation Army, Charter) all share in common?

4. ~~**The deployed dashboard is broken.** AggregateSlide doesn't exist; the Aggregate tab on the live site renders blank.~~ Resolved 2026-05-18: AggregateSlide and the supporting components were implemented; the dashboard now ships green via GitHub Actions to `https://reimagined-adventure-7pye1ok.pages.github.io/`.
