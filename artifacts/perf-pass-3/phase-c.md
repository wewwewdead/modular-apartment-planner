# Phase C: Sketch Studio 2D drafting — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §7 (C1 … C6). Findings A1 … A10 in `findings-notes.md`.
Files changed: all under `src/features/sketchstudio/{components,hooks,store,utils,craftsman,styles}`;
nothing under `cad/`, `src/pages` or `src/shared`.

## How it was measured

- **jsdom counters** (`phase-c-probes/jsdomProbe.test.jsx.txt`, run as a temporary test, deleted
  afterwards): the real `useSketchStudio` + `SketchStudioLayout`, documents built by script (5,000
  random lines in a 20 m square at zoom 0.05; 3,000 / 10,000 lines at zoom 1 for the snap; 5,000 arcs;
  2,000 rects with a material), pointer handlers called directly. Counters by `vi.mock` wrappers:
  `getSegmentIntersectionPoint` (snap pair tests), `calculateDistance` (fillet grouping),
  `normalizeSketchDocument`, `normalizeModel`, `JSON.stringify`, renders of the entity / dimension
  layers and, through `getArcPath`, of individual arc shapes. "Before" = the code as it was when this
  phase started, except C1 (see C1). jsdom milliseconds include jsdom's DOM cost and are relative only.
- **Browser** (`phase-c-probes/browserMeasure.cjs`, Playwright + installed Chrome headless, Vite dev
  server on 5185, 1600 × 1000, documents seeded through the recovery slot): synthetic `pointermove`s on
  the canvas, timing the synchronous handler, the time to the next macrotask (React's render) and to
  the second animation frame; real mouse for pan / drag / wheel with frame intervals recorded in the
  page; component renders counted from a stub DevTools hook (fibers cloned in a commit with
  PerformedWork). Dev build, **after only**: the pre-phase code was not run in a browser, so browser
  milliseconds have no before.

## C1. Snapping

| Counter                                                                      | Before                 | After                           |
| ---------------------------------------------------------------------------- | ---------------------- | ------------------------------- |
| Segment-pair tests per move, 3,000 lines, cursor near a line (no point snap) | 4,498,500 (= S(S−1)/2) | 2,994                           |
| same, 10,000 lines                                                           | 49,995,000             | 9,994                           |
| same, cursor over empty space (3,000 / 10,000)                               | 4,498,500 / 49,995,000 | 0 / 0                           |
| Raw `findIntersectionSnapPoint`, 3,000 segments, cursor in a dense spot      | 78.7 ms                | 0.8–1.4 ms (4,011 pairs)        |
| Snap point / segment collection                                              | every snap             | once per visible-entities array |

The C1 code went in before the probe existed, so the pair counts "before" are the all-pairs count
(the old loop tests every pair whenever no point snap wins) and the raw timing ran the old function,
kept in the probe, against the same segments.

## C2. Rendering only what changed

| Counter (5,000 lines unless noted)                       | Before | After                                            |
| -------------------------------------------------------- | ------ | ------------------------------------------------ |
| Entity elements built per move over empty space (select) | 5,000  | 0                                                |
| Entity layer renders per move over empty space           | 1      | 0                                                |
| Arc shapes rendered per hover change (5,000 arcs)        | 5,000  | 1.9 (the two that changed)                       |
| Entity elements built per pan frame                      | 5,000  | 0                                                |
| jsdom ms per move over empty space                       | 91.8   | 1.5                                              |
| jsdom ms per pan frame                                   | 68.5   | 4.3                                              |
| jsdom ms per hover change                                | 83.5   | 51–55 (the layer still maps 5,000 memo elements) |

Browser, after (5,000 lines, dev build): synchronous handler 0.2–0.9 ms per move; time to React's
task 6–8 ms (calibration with an unhandled event: 1.5 ms); per hover change the components that ran
were the layout chrome, the entity layer once and 83 entity shapes over 42 hover changes; the status
bar no longer re-renders on a hover change. Mixed document (4,000 lines, 800 arcs, 200 dimensions):
84 dimension shapes over 42 hover changes.

## C3. Dirty detection

| Per drag frame (5,000 lines, jsdom)               | Before                           | After                                                                |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Whole-workspace `JSON.stringify`                  | 1                                | 0                                                                    |
| `normalizeSketchDocument` (reducer + persistence) | 3                                | 2                                                                    |
| `normalizeModel`                                  | 3                                | 0                                                                    |
| Other `JSON.stringify` calls                      | 3.3 (empty arrays, pre-existing) | 3.3 + 1.1 (ui key) + 2.2 (the moved entity, compared with its start) |

At drag end: `normalizeSketchDocument` 3 → 3, `normalizeModel` 3 → 1. jsdom ms per drag frame
95.0 → 55.2 (C2 + C3 + C4 together).

## C4. Drag frames

Counted above: the lightweight resolver no longer normalises the 3D model, layers, variables,
metadata or object definition on a frame (`normalizeModel` per frame 3 → 0 across C3 + C4; the
reducer's share was 1 → 0, asserted in `dragFrames.oracle.test.js`). Selection lookups, the layer
lookup and the selection bounds fold are O(n); not separately timed.

## C5. Hover-tool previews and dimensions

| Counter                                                                                     | Before                             | After                                                         |
| ------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `calculateDistance` per fillet hover move, 2,000 lines (merge distance 400 mm at zoom 0.05) | 1,799,559                          | 225 (first move after a change: one grouping, 228 ms jsdom)   |
| jsdom ms per fillet hover move                                                              | 272.5                              | 4.0                                                           |
| jsdom ms per trim hover move, 5,000 lines                                                   | 106.5 (23.1 after C2 alone)        | 11.4                                                          |
| jsdom ms per select move over empty space, 5,000 arcs (bbox reject)                         | 8.4 after C2                       | 0.85                                                          |
| Dimension reference resolution                                                              | scan of all entities per reference | one id lookup per entities array (render) / per hit-test call |

## C6. Smaller items

| Counter                                                                               | Before    | After                                                          |
| ------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| `getBoundingClientRect` per pointer event                                             | 1         | 0 (re-read after press / enter / resize / scroll / new canvas) |
| Wheel listener unbind + bind per viewport change                                      | 1 + 1     | 0                                                              |
| jsdom ms per drag frame, craftsman mode, 2,000 rects with materials (~2,000 BOM rows) | 269.6     | 46.5                                                           |
| Cutting-list rows rendered per drag frame (same)                                      | every row | 0 (held until the drag ends)                                   |

Browser, after (5,000 lines): pan 40 frames mean 15.8 ms, p95 20.8 ms; transform drag mean 14.1 ms,
p95 41.5 ms; ten wheel notches mean frame 11.2 ms. Mixed document: pan mean 26.8 ms (rasterising
4,800 SVG shapes per frame: the compositor pan stays deferred, §10), drag mean 21.8 ms, wheel 12.4 ms.

Skipped in C6 (reasons in the hand-off report): rAF coalescing of pan and wheel, the window key
listeners' latest-handler ref, wood-movement notices during a drag.
