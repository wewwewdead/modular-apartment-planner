# Phase D2: planner canvas, panels, sheets, wall editor — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §9. Browser numbers: headless Chrome (`channel: 'chrome'`), dev server on port
5186, `/playground` (3 storeys, a truss, a roof), 1600×1000, dev build (StrictMode, React dev overhead
included). Render counts come from a DevTools-hook stand-in that walks each committed fiber tree and counts a
component when it mounted or carries `PerformedWork` (memo bail-outs do not count) — `phase-d2-probes/`.
Node / jsdom numbers come from the permanent tests named below and from temporary benches (deleted). The
machine was shared with another builder, so milliseconds are noisy; the counters are the evidence.

Probe scripts (`phase-d2-probes/`): `probe-commits.mjs` (fixture drag, per-component renders per frame, CPU
per move, move-to-commit latency), `probe-wall-editor.mjs` (wall detail editor, middle-button pan),
`probe-sheet.mjs` (sheet workspace: pan, viewport drag, PDF root), `plan-markup-capture.probe.jsx` and
`wall-elevation-capture.probe.jsx` (before/after markup captures, run as vitest files when copied beside the
code), `make-before.cjs` (rebuilds the pre-D2.3 sheet canvas as a sibling for the before numbers).

## D2.1 Per-item renderers — DONE

Wall, door, window, fixture, column, room and stair renderers draw each entity through a memoised item.
Measured in jsdom by `PlanItemRenderers.test.jsx` (the old `WallRenderer` kept as the oracle; one
`resolveWallAssembly` call = one wall item render), on its rich test floor (9 walls: masonry with column-held
ends, fibre cement, mixed boards with finishes and a lap, plywood outboard, siding, double frame, offset
masonry, arc, partition).

| Counter (drafting style)                                           | Before     | After     |
| ------------------------------------------------------------------ | ---------- | --------- |
| Wall items re-rendered, one door moved along its wall              | 9          | 1         |
| Wall items re-rendered, one door moved to another wall             | 9          | 2         |
| `deriveWallFramingLayout` calls, door moved between walls          | 9          | 2         |
| Wall items re-rendered, the column a partition dies into moved     | 9          | 1         |
| Wall items re-rendered, a column a wall is held at rotated         | 9          | 1         |
| Wall items re-rendered, one wall moved                             | 9          | 1         |
| Wall items / framing layouts, same objects in fresh arrays         | 9 / 9      | 0 / 0     |
| Presentation: wall items re-rendered by a door edit                | 9          | 0         |
| Door items re-rendered, one door moved (of 5 drawn)                | 5          | 1         |
| Window items, one window's type changed (of 6)                     | 6          | 1         |
| Fixture / column / stair items, one changed (of 10 / 3 / 2)        | 10 / 3 / 2 | 1 / 1 / 1 |
| Room items, selection moved between two rooms (presentation, of 3) | 3          | 2         |

Browser, fixture drag on the playground (presentation, 30 moves): only the dragged fixture's item renders
(`PresentationFixtureItem` 0.93 / frame); wall, door, window, room and stair items 0 / frame; column items 10
once at the drag's first frame (the presentation columns paint themselves while walls are per-wall — the
existing union rule, not a regression).

Markup: identical. `plan-markup-capture.probe.jsx` captured 12 scenarios (rich floor + both playground storeys ×
drafting, drafting at zoom, presentation, presentation mid-drag with fresh walls) before the change and compared
after: 0 differences. The permanent test compares the new `WallRenderer` with the oracle (static markup, three
styles, all floors) and, edit by edit through 16 edits, the live DOM after each rerender with a fresh render.

## D2.3 Sheets — DONE

jsdom, `SheetCanvas.perf.dom.test.jsx` harness with the pre-D2.3 canvas rebuilt as a sibling for the before
column (temporary, deleted). Sheet with a plan and a structural-plan viewport.

| Counter                                                                | Before       | After                                        |
| ---------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| `buildSheetScene` calls over a 30-move pan                             | 60           | 0                                            |
| `buildSheetScene` calls over a 20-move viewport drag                   | 64           | 20 (the canvas's one memo, once per project) |
| Store viewport commits over a 30-move pan (a frame every 3 moves)      | 30           | 10                                           |
| `getBoundingClientRect` on the sheet svg over a 20-move viewport drag  | 21           | 1                                            |
| Wheel listener re-subscriptions over 10 wheel notches                  | 40           | 0                                            |
| `deriveConceptualLoadPath` for one structural viewport, both renderers | 2 per render | 1 per project object                         |

Browser (`probe-sheet.mjs`, playground Sheet 4, three viewports): the PDF root is present with 3 viewports
and its markup equals the visible sheet's; a 20-move middle-button pan moves the view by exactly the pointer's
travel (translate 120,80 → 220,140) and leaves the root untouched; the same script against the pre-D2.3 canvas
gives identical output, and no page errors either way.

## D2.2 Panels during a drag — DONE

Fixture drag on the playground (`probe-commits.mjs`, 30 moves, 3 runs each, renders per frame):

| Component                                             | Before | After                                                           |
| ----------------------------------------------------- | ------ | --------------------------------------------------------------- |
| Sidebar                                               | 0.93   | 0.93                                                            |
| SunStudyPanel, DaylightPanel, SolarAccessPanel (each) | 0.93   | 0.30–0.50                                                       |
| ProjectLifecyclePanel                                 | 0.93   | 0.30–0.43                                                       |
| Toolbar, PropertiesPanel                              | 0.93   | 0.93 (not deferred, see report)                                 |
| React commits over the drag                           | 29–33  | 39–52 (the catch-up renders are their own low-priority commits) |

Move-to-commit latency and CPU per move (median of the run; lifecycle panel on the stage named):

| Lifecycle stage   | Before: latency median / p90, TaskDuration | After                                  |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| 1 Brief (default) | 21–22 / 52–57 ms, 39–42 ms                 | 20–22 / 55–57 ms, 41–43 ms (no change) |
| 4 Structure       | 27.2 / 72.3 ms, 48.6 ms                    | 21.5 / 58.8 ms, 42.5 ms                |
| 5 Systems         | 24.8 / 70.6 ms, 45.6 ms                    | 26.0 / 62.1 ms, 45.0 ms                |
| 7 Quantities      | 31.1 / 90.5 ms, 52.4 ms                    | 21.3 / 59.2 ms, 45.2 ms                |
| 8 Documents       | 27.2 / 75.3 ms, 47.8 ms                    | 24.4 / 59.7 ms, 44.6 ms                |

The win is on the heavier stages; on the default Brief stage the panels are cheap and the change is neutral.

Phase filter (jsdom, `phaseFilterShared.dom.test.jsx`, Single view on a phase, one fixture edit):
`filterProjectByPhase` calls per edit 3 → 1. Overhangs (`useFloorOverhangs.test.js`): a fixture edit on a
3-storey stack with overhangs re-measures 0 times (before: `computeFloorOverhangs` ran once per consumer —
canvas and properties panel — on every edit and drag frame of a multi-storey project, because both keyed on
`project.floors`).

## D2.4 Wall detail editor — DONE

Pan (`probe-wall-editor.mjs`: a playground wall turned fibre cement, outside face, 1058 SVG nodes, 247 screws;
30 middle-button moves, 2 runs each):

| Counter                                                     | Before                      | After                       |
| ----------------------------------------------------------- | --------------------------- | --------------------------- |
| `FastenerGraphic` renders per pan frame                     | 246                         | 0                           |
| `DimensionGraphic` / `WallCanvasGrid` renders per pan frame | 2 / 1                       | 0 / 0                       |
| `WallDetailEditorBody` renders per pan frame                | 1                           | 1                           |
| Move-to-commit latency, median / p90                        | 22.3 / 77.6, 20.6 / 83.1 ms | 12.1 / 54.3, 12.2 / 55.4 ms |
| TaskDuration per move                                       | 47.4, 46.3 ms               | 28.7, 28.3 ms               |
| ScriptDuration per move                                     | 40.6, 39.9 ms               | 21.7, 21.6 ms               |

Commit (temporary reducer bench, playground, one wall-detail `WALL_UPDATE`, 12 interleaved runs, twice):

|                                               | Before (settled edit)     | After (`coordination: 'defer'`) |
| --------------------------------------------- | ------------------------- | ------------------------------- |
| Reducer time per commit, min / median         | 8.3 / 12.2, 8.3 / 11.2 ms | 0.46 / 0.68, 0.46 / 0.67 ms     |
| The settle, once after 1.5 s idle or on close | —                         | 7.7 / 11.2, 7.2 / 11.0 ms       |

Drawing box (jsdom, `WallDetailEditor.perf.dom.test.jsx`): `getBoundingClientRect` on the drawing over a
two-move board drag: 4 → 1.

Markup: identical. `wall-elevation-capture.probe.jsx` captured 8 states (a framed fibre-cement face with a
measurement, and a siding face with an accent: initial, a board selected, a stud mid-drag, Measure hovering)
before the change and compared after: 0 differences.

## D2.5 Optional — SKIPPED

See the report: the study-input hold lives in `DaylightStudyContext.jsx` (outside this phase's files), and the
sheet preview debounce changes what a drag shows and widens the window in which a PDF export picks up the
placeholder. Not measured.

## Tests (last runs)

- `npx vitest run src/features/floorplan src/sheets src/editor` → 160 files, 1877 tests passed.
- `npx vitest run src/export/sheetExport.test.js src/export/professionalExchangeExport.test.js` → 2 files,
  16 tests passed.
- `FLOORPLAN_VERIFY_URL=http://localhost:5186/playground node scripts/verify-plan-canvas-gestures.mjs` →
  passed.
- eslint on every touched file → clean; prettier → clean.
