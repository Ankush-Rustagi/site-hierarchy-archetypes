# Multi-product site hierarchy archetypes

Interactive dashboard for the Maps 2 research question: **how do complex,
multi-product Verkada customers actually structure their site hierarchies, and
what naming patterns and archetype families fall out of that?**

The dashboard has four VIEWs in the top-of-page switcher:

- **Overview** — cross-cutting cards: customer comparison table, root-shape
  coverage, archetype family cards, consolidated findings.
- **Customer deep-dives (12)** — one tab per hand-picked customer with their
  emblematic site subtree, scope and device stats, root-name pills colored by
  inferred shape, and representative branches from the full hierarchy. A
  single-click CSV download contains all 143 hierarchy nodes across the 12
  customers (rank, name, path, depth, node type, product mix, device counts)
  for feeding into Cursor / Claude to generate Maps 2 navigation mockups.
- **Population analysis (~35K orgs)** — the same classifier run against the
  full active-paid customer base. Headline frequencies, root-shape coverage,
  archetype-family distribution (all orgs vs the complex subset side by side),
  single-product cohort splits (camera-only, access-only, alarms-only,
  multi-product), and the comparison cohort the original 12 missed because of
  the 25–400 site cap.
- **Industry analysis** — Industry × size × bookings × device-count matrix,
  per-industry archetype entropy and modal share, cross-industry cosine
  similarity, and per-vertical deep-dive cards. Answers “does Healthcare at
  200 cameras look like K-12 at 200 cameras?”.

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
  Population and industry views import pre-aggregated JSON from `src/data/`
  built by `scripts/build-snapshots.ts`. Nothing runs in the browser at
  runtime.

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
