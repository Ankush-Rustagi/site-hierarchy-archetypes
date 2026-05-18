# Multi-product site hierarchy archetypes

Interactive dashboard for the Maps 2 research question: **how do complex,
multi-product Verkada customers actually structure their site hierarchies, and
what naming patterns and archetype families fall out of that?**

The dashboard has three VIEWs in the top-of-page switcher:

- **Overview.** Population-scoped TL;DR, glossary, then qualitative cross
  cutting cards from the 12 deep-dive sample (customer comparison table,
  root-shape coverage, archetype family cards, consolidated findings, method
  notes). The header surfaces the full active-paid denominator
  (~31K accounts deduped to one row per Salesforce account) and the
  complex-tail share of bookings.
- **Customer deep-dives (12).** One tab per hand-picked customer with their
  emblematic site subtree, scope and device stats, root-name pills colored by
  inferred shape, and representative branches from the full hierarchy.
  Customers whose tree mixes shapes show a primary archetype pill plus
  outline pills for each secondary archetype (e.g. Charter Schools USA =
  facility code + geographic; Southwire = flat fleet + facility code +
  function first). A single-click CSV download contains every hierarchy node
  across the 12 customers (rank, name, path, depth, node type, product mix,
  device counts). Each detail page also includes a **Representative subtrees
  from Athena** section: one card per root-shape the customer uses
  (geographic, facility-code, function-word, corporate-tree, school-code,
  entity-name, or lifecycle-marker), with the actual full subtree from
  `auth.directory_paths_latest` so the *sub-archetypes inside* a single
  customer are visible.
- **Aggregate patterns (complex tail).** The same classifier run against the
  full active-paid customer base. Simple-base vs complex-tail split,
  archetype family distribution across the tail, bookings-band breakdown, an
  industry x archetype matrix, and the method note. The Aggregate VIEW is
  where the population analysis lives. The earlier "Population analysis" and
  "Industry analysis" tabs were collapsed into this single Aggregate VIEW.
  Per-industry sub-segment data and per-customer example trees are in
  `src/data/taxonomy.json` and are not yet rendered as a separate VIEW.

The dashboard is a static React + Vite build deployed via GitHub Actions to
GitHub Pages. The source of truth for content is `src/App.tsx`, which is a
direct port of the underlying Cursor Canvas
(`canvases/multi-product-site-hierarchy-archetypes.canvas.tsx`) using a small
`src/canvas-shim.tsx` that re-implements the canvas SDK primitives.

## Data sources

- Athena via the Hex MCP (thread `019e2d6d-d87f-7001-bebe-43dc2dd4b14c`).
- `auth.directory_paths_latest` for site / device counts.
- Entity types: `camera`, `accessController`, `alarmsDevice`, `alarmSystem`.
- `dim_account_hierarchy` for `is_active_paid`, SFDC industry, segment,
  lifetime bookings.
- Twelve-customer narrative content is an embedded snapshot in `src/App.tsx`.
- Aggregate / population analysis imports pre-aggregated JSON from
  `src/data/aggregate-patterns.json`, `customer-subtrees.json`,
  `taxonomy.json`, and `sequencing.json`. Files are built by scripts in
  `scripts/` and committed. Nothing runs in the browser at runtime.

See [`data-sources.md`](./data-sources.md) for the full pipeline (queries,
row counts, filter logic, snapshot outputs).

## Local development

```bash
npm install
npm run dev              # vite dev server
npm run build            # type-check + production build to dist/
npm run preview          # serve dist on http://127.0.0.1:4173
npm run build:snapshots  # rebuild src/data/*.json from data/raw/*.csv
```

Population and industry snapshots live in `src/data/*.json` and are
checked in. To rebuild them from a fresh Athena pull, drop the four CSVs
into `data/raw/` (gitignored, see `data-sources.md` for the schemas) and
run `npm run build:snapshots`.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`npm ci && npm run build` and ships `dist/` to GitHub Pages. Pages must be
configured to deploy "From Actions" in the repo settings.

## Updating content

1. Update the canvas in
   `canvases/multi-product-site-hierarchy-archetypes.canvas.tsx`.
2. Copy the file into `src/App.tsx`, replacing the
   `from "cursor/canvas"` import with `from "./canvas-shim"`.
3. Replace the default export with the local `App` wrapper that mounts the
   canvas root inside the page container.
4. `npm run build` locally to confirm, then push.

If the canvas adds new SDK primitives, extend `src/canvas-shim.tsx` to match.
