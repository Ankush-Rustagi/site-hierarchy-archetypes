# Data sources

All Athena queries for this dashboard run through the **Hex MCP** against the
existing Hex thread `019e2d6d-d87f-7001-bebe-43dc2dd4b14c`.
[Open the thread in Hex](https://app.hex.tech/01994010-b1bc-7003-9f8a-14d990c51106/thread/019e2d6d-d87f-7001-bebe-43dc2dd4b14c).

The pipeline is one-way: Hex queries Athena, returns flat CSVs, and the local
`scripts/build-snapshots.ts` script classifies, aggregates, and writes typed
JSON into `src/data/`. The dashboard imports the JSON at build time. **Nothing
runs in the browser at runtime.**

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
| `comparison_cohort.csv` | One row per org passing the original complexity gate (no size cap) | 156 |

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
npm run build:snapshots   (tsx scripts/build-snapshots.ts)
   │
   ├─ classify root names      (scripts/classifier.ts)
   ├─ classify archetype family
   ├─ aggregate frequencies, root-shape coverage
   ├─ build industry × size × bookings × device matrix
   ├─ compute intra/cross-industry similarity
   └─ emit:
        src/data/population.json
        src/data/industry-matrix.json
        src/data/comparison-cohort.json
        src/data/method-numbers.json
   │
   ▼
npm run build → Vite → GitHub Pages
```

## Known limitations

1. `org_axes.current_arr` and `org_axes.account_age_days` are NULL — neither is
   materialized in the existing Hex `site_metrics` dataframe. ARR overlay in the
   industry matrix uses `lifetime_bookings` instead. If you need real ARR, the
   Hex agent can run a follow-up cell joining `dim_account_hierarchy` directly.
2. Partners are excluded by design (`record_type_name__c = 'End Customer'`).
3. Site → device mapping reuses the production cross-sell rule (parse the
   second-to-last segment of each entity's directory path, reformat to a
   hyphenated UUID, confirm parent `entity_type = 'site'`). Devices parented
   under `deviceGroup` are excluded. Cameras map through directory paths, NOT
   through `vcamera.camera_group_cameras_latest` (a dead table).
