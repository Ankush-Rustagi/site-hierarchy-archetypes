# Multi-product site hierarchy archetypes

Interactive dashboard for the Maps 2 research question: **how do complex,
multi-product Verkada customers actually structure their site hierarchies, and
what naming patterns and archetype families fall out of that?**

Twelve paid Verkada customer orgs with deep multi-product trees were sampled.
The dashboard exposes:

- A cross-cutting overview with the customer comparison table, root-shape
  coverage, archetype family cards, and consolidated findings.
- One deep-dive tab per customer with their emblematic site subtree, scope and
  device stats, root-name pills colored by inferred shape, and representative
  branches from the full hierarchy.
- A single-click CSV download containing all 143 hierarchy nodes across the
  12 customers (rank, name, path, depth, node type, product mix, device counts)
  for feeding into Cursor / Claude to generate Maps 2 navigation mockups.

The dashboard is a static React + Vite build deployed via GitHub Actions to
GitHub Pages. The source of truth for content is `src/App.tsx`, which is a
direct port of the underlying Cursor Canvas
(`canvases/multi-product-site-hierarchy-archetypes.canvas.tsx`) using a small
`src/canvas-shim.tsx` that re-implements the canvas SDK primitives.

## Data sources

- Athena via Hex thread `019e2d6d-d87f-7001-bebe-43dc2dd4b14c`
- `auth.directory_paths_latest` for site / device counts
- Entity types: `camera`, `accessController`, `alarmsDevice`, `alarmSystem`
- Embedded snapshot in `src/App.tsx` (no live queries)

## Local development

```bash
npm install
npm run dev      # vite dev server
npm run build    # type-check + production build to dist/
npm run preview  # serve dist on http://127.0.0.1:4173
```

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
