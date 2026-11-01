# Floor plan canvas — no derived dimensions

Spec for the floor plan workspace (`src/features/floorplan/`). Written
2026-11-01 by Fable after reading the code and probing the running app; to be
built by Opus; audited by Fable against this document.

## 1. The problem, in the user's words

> In the apartment planner when I add a wall there's so many measurements
> showing in the 2D drawing. Can we remove it? It's just so annoying. Or can
> you make it clean?

## 2. What the code does today (verified)

The plan canvas already suppresses two of the three derived dimension classes
and forgot the third.

- `src/annotations/scene.js` `buildAnnotationScene(floor, settingsOverrides)`
  builds three **derived** dimension classes from the floor's
  `annotationSettings`: `showWallDimensions` → one figure per wall,
  `showRoomDimensions` → two per room, `showOverallDimensions` →
  `buildOverallDimensionFigures` in `src/annotations/dimensions.js`, which emits
  one horizontal chain segment between every pair of adjacent **distinct wall
  endpoint X values**, one vertical chain segment per adjacent distinct Y
  value, plus an overall width and an overall height. Manual dimensions
  (`floor.annotations`, placed with the Dimension tool, key M) are appended
  after the derived ones. Tags (`showObjectTags`) are built separately.
- `src/features/floorplan/components/renderers/FloorPlanLayer.jsx:34`
  defines `PLAN_CANVAS_ANNOTATIONS = { showWallDimensions: false,
showRoomDimensions: false }` and passes it as `settingsOverrides` to
  `AnnotationRenderer` (line 73). The comment above it (lines 25–33) records
  the 2026-08-20 decision: the working canvas never draws derived wall or room
  figures; sizes are read in the properties panel on selection; the settings
  checkboxes govern the sheets. **`showOverallDimensions` is not in that
  override**, so the overall chain and totals still draw on the canvas.
- `src/domain/models.js:106–116` `createAnnotationSettings()` defaults every
  switch to `true`, and `createFloor` (line 62) uses it, so every floor a user
  creates has `showOverallDimensions: true`. `migration_14_to_15.js:103`
  keeps whatever a saved project had, defaulting missing keys to `true`.
- The playground demo (`src/pages/playground-demo.json:576–584`, and the two
  other floors at 1453 and 1801) has `showOverallDimensions: false` baked in,
  which is why the problem is invisible on `/playground` and visible on every
  real project.
- Sheets take the un-overridden path:
  `SheetViewportContent.jsx:96` renders `<AnnotationRenderer floor={floor} />`
  with no override, and `src/domain/documentationRealization.js:127` counts
  `buildAnnotationScene(floor)` figures for the documentation snapshot. Neither
  may change.
- `WallPreview.jsx` draws ONE transient length label next to the wall being
  drawn (the rubber-band line). It disappears on the placing click. The status
  bar shows the live bearing (`liveWallBearing`, `SvgCanvas.jsx:646`).
- `SelectionOverlay.jsx` draws no text for a selected wall (handles only), and
  `WallRenderer.jsx` draws no text. `OverhangIndicatorLayer.jsx` draws an
  overhang depth figure only on cantilevered slabs. `StructuralGridOverlay.jsx`
  draws grid bubbles and a `N mm offset` note only for misaligned stacks.
  None of these is the complaint.

Measured on a fresh `/floorplan` (headless Chrome, default project, wall tool
only), counting `[data-dimension-source="derived"]` groups on the canvas:

| walls drawn                         | derived figures on canvas | what they say                                                     |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| 1                                   | 0                         | —                                                                 |
| 2 (an L)                            | 4                         | `3040 mm` twice, `4740 mm` twice (chain + overall are duplicates) |
| 4 (closed ring)                     | 4                         | same four, plus the auto-detected room tag                        |
| 6 (ring + partition + short return) | 7                         | `1520 / 730 / 790`, `2370 / 2370`, `3040`, `4740`                 |

Every wall whose endpoint lands on a new X or Y splits the chain again, so the
row of figures along the top and left of the plan grows with every wall. That
is the "so many measurements". Screenshots of the probe are in the session
scratchpad (`probe/fresh-four-walls.png`, `probe/fresh-six-walls.png`), and
`probe/floorplan-fresh-probe.mjs` there is the driving skeleton for §4.4.

## 3. Decision

The plan canvas draws **no derived dimension figure of any class**. It keeps:

- manual dimensions (someone placed them on purpose),
- object tags (room name + area, column/beam/door/window tags — identity, not
  measurement; the user's 2026-08-20 choice),
- the single live length label on the wall being drawn (`WallPreview`),
- the overhang depth figure (it is a warning, not a dimension).

Sheets, elevations, section views and the documentation counts are untouched:
the three derived checkboxes keep meaning "draw this on the sheets".

No canvas toggle is added. The toolbar's Display group sits about 2385 px in
and is off-screen on a laptop (see the memory note on toolbar overflow); a
switch nobody can find is worse than none, and the Annotations panel already
governs the sheets. If the user later wants derived dims back on the canvas,
that is a new feature with its own home, not a flag.

## 4. Changes

### 4.1 `FloorPlanLayer.jsx` — the one-line fix

- `PLAN_CANVAS_ANNOTATIONS` becomes
  `Object.freeze({ showWallDimensions: false, showRoomDimensions: false, showOverallDimensions: false })`.
- Rewrite the comment above it so it describes all three classes: the canvas
  never draws derived dimensions; the overall chain in particular adds a
  segment for every distinct wall-endpoint coordinate, so it grows with every
  wall. Keep the sentence that manual dims and tags are untouched and that the
  settings still govern the sheets.
- Nothing else in the file changes. It is memoized and takes props only; do
  not add a context consumer (perf contract of 2026-08-20).

### 4.2 `properties/DimensionProperties.jsx` — the panel copy

`AnnotationSettingsPropertiesInner` (lines 119–150) currently puts the
"Sheets only" note between Room Dimensions and Overall Dimensions, so Overall
reads as if it applied to the canvas. Reorder to:

1. `Wall Dimensions`
2. `Room Dimensions`
3. `Overall Dimensions`
4. the note, now worded: `Sheets only — the plan never draws derived
dimensions. Select an object to read its size here.`
5. `Object Tags`, then the three `Elev.` switches and `Manual Dims` as today.

Keep the existing inline styles and the `checkbox()` helper; this is a reorder
and a copy change, not a conversion to the PanelKit.

### 4.3 Tests

- `FloorPlanLayer.test.jsx`, describe `FloorPlanLayer wall dimensions`:
  - Rename the existing test to say "derived wall, room or overall
    dimensions" and change its floor to **two** walls (an L: `0,0→4000,0` and
    `0,0→0,3000`) with `showWallDimensions`, `showRoomDimensions` **and**
    `showOverallDimensions` all `true`, `showObjectTags: false`. Keep the room.
    Assert `data-id="wall_1"` present, no `data-dimension-source="derived"`,
    no `mm`, no `<text`. (Two walls because `buildOverallDimensionFigures`
    returns nothing for one.)
  - Add a test that a manual dimension still draws: same floor plus one
    `createLinearDimensionAnnotation({x:0,y:0},{x:4000,y:0},{offset:300})`
    in `annotations`; assert exactly one `data-dimension-source="manual"`
    and that `4000 mm` appears.
  - Add a test that the room tag still draws when `showObjectTags: true`:
    assert the room name text appears and still no
    `data-dimension-source="derived"`.
- `src/annotations/scene.test.js`: add one case mirroring the wall override
  test — `showOverallDimensions: true` on the floor, override
  `{ showOverallDimensions: false }`, two walls, assert no figure with
  `sourceType` of `overall` or `overall-chain`, and that the floor's own
  setting is still `true`. The existing "draws derived wall dimensions by
  default (the sheets take this path)" test stays as the sheet guard.
- Optional, only if cheap: a DOM test for `AnnotationSettingsProperties`
  asserting the three dimension checkboxes come before the note and the note
  before `Object Tags`. The panel has no test today; if you add one, follow
  the pattern of `properties/WallProperties.dom.test.jsx`. Skip and say so if
  it costs more than a few minutes.

### 4.4 Verification script — `scripts/verify-plan-canvas-dimensions.mjs`

Pattern it on `scripts/verify-sidebar-fit.mjs` (Playwright `@playwright/test`,
`chromium.launch({ channel: 'chrome', headless: true })`, env
`FLOORPLAN_VERIFY_URL`, screenshots under
`artifacts/floorplan/plan-canvas-dimensions/`). Default URL
`http://localhost:5199/floorplan` — a fresh profile gets `createProject()`,
i.e. one empty floor with every annotation switch on, which is exactly the
user's situation. Steps:

1. Wait for `svg[class*="_svg"]`, read its `boundingBox()`.
2. Press `w`, then click a four-corner ring at 25 %/75 % of the canvas box
   (closing on the first corner), Escape; then a partition from the top
   midpoint to the bottom midpoint, Escape; then a short return from the
   partition's middle 12 % to the right, Escape. Move the mouse in 4 paced
   steps (~100 ms) before each click, and `mouse.down()`/`mouse.up()` with a
   ~200 ms wait after — the canvas coalesces pointer events through rAF.
3. While the rubber band is out (after the first click of the ring, before the
   second), assert one `.wall-preview text` whose text ends in `mm`: the live
   label is kept on purpose.
4. After every placed wall and at the end: assert
   `svg [data-dimension-source="derived"]` count is **0**, and that no
   `.annotations text` content contains `mm`. Assert at least one wall
   polygon `[data-type="wall"]` exists (the walls did get placed).
5. Press `m` (Dimension tool; read `src/editor/handlers/dimensionPlaceHandler.js`
   for the click flow first) and place one manual dimension across the ring's
   top edge, Escape. Assert exactly one `[data-dimension-source="manual"]` and
   that its text ends in `mm`.
6. Screenshot after step 2 and after step 5.
7. Print `checks`/`failures` like the sidebar script and exit non-zero on any
   failure.

`git ls-files artifacts` shows nothing tracked, and `.gitignore` ignores only
`/artifacts/sketch-cad/`. Add a `/artifacts/floorplan/` line to `.gitignore`
so the screenshots stay out of `git status`.

## 5. Out of scope — do not do

- Changing `createAnnotationSettings` defaults, the demo JSON, migrations,
  serialization, or anything under `src/sheets/`, `src/elevations/`,
  `documentationRealization.js`.
- Removing or restyling object tags (room area tags are measurements in a
  loose sense; if the user wants those gone too, that is a separate ask).
- The wall-preview label's fixed 140-unit font (it shrinks when zoomed out).
- The "Room 2" tag colliding with the short return wall in the probe
  screenshot — tag collision handling is `tags.js` `applyCollisionOffsets`,
  a different problem.
- Any toolbar / Display-group control.
- Committing. Leave the working tree uncommitted; 112 files are already
  modified by other work — touch only the files named in §4.

## 6. Acceptance

- `npx vitest run src/features/floorplan/components/renderers/FloorPlanLayer.test.jsx src/annotations` green.
- `npm test` green (whole suite; report the file/test counts).
- `npm run lint` clean.
- With Vite on 5199 (`npx vite --port 5199 --strictPort`),
  `node scripts/verify-plan-canvas-dimensions.mjs` passes and leaves its
  screenshots; the final screenshot shows walls, room tags and the one manual
  dimension, and nothing else with a number on it.
- Report every judgment call you made that this document did not decide.
