# Data sources

All Athena queries for this dashboard run through the **Hex MCP** against the
existing Hex thread `019e2d6d-d87f-7001-bebe-43dc2dd4b14c`.
[Open the thread in Hex](https://app.hex.tech/01994010-b1bc-7003-9f8a-14d990c51106/thread/019e2d6d-d87f-7001-bebe-43dc2dd4b14c).

The pipeline is one-way: Hex queries Athena, returns flat CSVs, and two local
scripts classify, aggregate, and write typed JSON into `src/data/`. The
dashboard imports the JSON at build time. **Nothing runs in the browser at
runtime.**

## Source tables

| Table | Purpose |
|-------|---------|
| `auth.directory_paths_latest` | Site hierarchy (ltree-style dot paths) |
| `auth.directory_entries_latest` | Entity type lookup (site / device / device group) |
| `vcamera.camera_groups_latest` | Site name + per-site metadata |
| Entity tables: `camera`, `accessController`, `alarmsDevice`, `alarmSystem` | Device counts per site, mapped via second-to-last path segment |
| `vlicensing.general_license_compliance_info` + `vnetsuite.co_terming_groups` | Active-paid filter |
| `dim_account_hierarchy` (semantic model) | SFDC industry, segment, lifetime bookings |

## Flat extracts (CSVs)

These land under `data/raw/` (gitignored). Pull them from Hex when you need to
rebuild the snapshots. Row counts as of the 2026-05-18 pull:

| File | Grain | Rows |
|------|-------|------|
| `org_metrics.csv` | One row per `organization_id` | 35,091 |
| `root_names.csv` | One row per (org, depth-1 site name) | 150,333 |
| `org_axes.csv` | One row per `sfdc_account_id` | 31,408 |
| `customer_subtrees.csv` | One row per (org, site) at every depth for the 12 deep-dive customers only | 1,708 |

`org_metrics.csv` returns one row per **organization**, but Salesforce accounts
can have many child organizations (Hilton Grand Vacations has 32, AMETEK 28,
The Picklr 27, etc.). The aggregate pipeline collapses 35,091 org rows down to
31,408 unique Salesforce accounts by picking the org with the highest total
device count per account (cameras + access panels + alarm devices + alarm
panels). Ties break on `total_sites` desc, then `organization_id` asc. The
picked primary org represents the customer's main production deployment;
the discarded orgs are typically dev / test / partner-owned / single-site
child accounts that don't reflect the customer's actual site hierarchy.

`comparison_cohort.csv` was used for an earlier "population + industry" view
that has since been collapsed into the single Aggregate patterns view; you can
drop it if you re-pull data.

## Filter applied at extraction time

- `dah.is_active_paid = TRUE` (active paid customer)
- Account name does NOT contain `verkada` or `personal` (case-insensitive)
- `record_type_name__c = 'End Customer'` (excludes partners)

That's it. **No** floor on `total_sites`, `max_depth`, `product_lines_count`, or
`distinct_product_mixes`. Single-product camera-only deployments are included
on purpose — 19,817 of the 35,091 orgs (56%) are pure camera-only and we want
their hierarchy patterns in the population view.

## Local pipeline

```
data/raw/*.csv
   │
   ▼
npm run build:aggregate   (tsx scripts/build-aggregate-patterns.ts)
   │
   ├─ pick primary org per Salesforce account (most devices wins)
   ├─ classify root names      (scripts/classifier.ts)
   ├─ classify archetype family
   ├─ compute composite complexity score per org
   │    (max_depth + product_lines_count + log10(lifetime_bookings))
   ├─ split base: camera-only-flat callout + complex tail (top quintile)
   ├─ within complex tail: archetype shares, root-shape coverage,
   │    bookings-band rollup, industry rollup, industry × band matrix
   └─ emit:
        src/data/aggregate-patterns.json

npm run build:subtrees    (tsx scripts/build-customer-subtrees.ts)
   │
   ├─ index customer_subtrees.csv by parent_site_id
   ├─ classify every depth-1 root by root shape (classifier.ts)
   ├─ score each candidate root on (node-type variety, depth,
   │    readable subtree size)
   ├─ pick the top-scoring root per shape per customer
   ├─ materialize the full subtree (cap 60 nodes; overflow tail
   │    collapsed into a single "[+N more sites]" placeholder)
   └─ emit:
        src/data/customer-subtrees.json
   │
   ▼
npm run build → Vite → GitHub Pages
```

## Customer subtree picker

`scripts/build-customer-subtrees.ts` consumes `customer_subtrees.csv` (the
1,708-row full hierarchy dump for the 12 deep-dive customers, including
depths 1–7) and emits one representative subtree per **root shape** present
at each customer.

The scoring rule per candidate root:

- `+1000` per distinct node-type the subtree contains (mixed / structural /
  leaf_with_devices / dead_end). Maxes out at 4.
- `+200` per depth level inside the subtree.
- `+500` if the subtree has 8–50 nodes (readable sweet spot).
- `+200` if it has 4–80 nodes.
- `-500` for 1–2 node subtrees (too trivial).
- `-250` for subtrees over 100 nodes (too noisy).

The picker emits up to 5 subtrees per customer. The React detail page renders
each subtree as its own card with the inferred root shape, an auto-generated
rationale, and the actual site names from Athena — so a customer with both a
"geographic-first" tree and a "function-word" tree (e.g. BC Legislative
Assembly) shows both side by side.

## Known limitations

1. `org_axes.current_arr` and `org_axes.account_age_days` are NULL — neither is
   materialized in the existing Hex `site_metrics` dataframe. The aggregate
   patterns view uses `lifetime_bookings` everywhere instead. If you need real
   ARR, the Hex agent can run a follow-up cell joining `dim_account_hierarchy`
   directly.
2. Partners are excluded by design (`record_type_name__c = 'End Customer'`).
3. Site → device mapping reuses the production cross-sell rule (parse the
   second-to-last segment of each entity's directory path, reformat to a
   hyphenated UUID, confirm parent `entity_type = 'site'`). Devices parented
   under `deviceGroup` are excluded. Cameras map through directory paths, NOT
   through `vcamera.camera_group_cameras_latest` (a dead table).
