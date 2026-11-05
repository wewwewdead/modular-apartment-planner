# Ceiling light placement — fast and legible

Spec for the reflected-ceiling-plan (RCP) editor's Light tool
(`src/features/floorplan/components/ceiling-detail/CeilingDetailEditor.jsx`)
and the 3D pane it drives. Written 2026-11-04 by Fable after reading the code
and measuring it; built by Opus; audited by Fable against this document.

## 1. The problem, in the user's words

> Can we optimize and enhance the light placing on the ceiling? It's too laggy
> and also it is not UX friendly. When I tried to place a light on the ceiling,
> it is hard for me to distinguish what part of the ceiling I'm placing.

Two complaints, two causes. The lag is real and measured (section 2.2): one
click freezes the page for 1.5–2.7 s, and it gets worse with every light. The
legibility problem is that the RCP draws boards and screws in an abstract U/V
frame with nothing underneath — no rooms, no walls, no furniture — and the
Light tool gives no feedback at all before the click: no ghost, no snap, not
even a crosshair cursor.

## 2. What the code does today (verified)

### 2.1 The placement path

1. `CeilingDetailEditor.jsx` `beginCanvasGesture` → `addLightFixture(point)`
   (~line 1555) → `createCeilingLightFixture` → `updateLighting` →
   `updateDetailing` → `commitDetailing` → `dispatch({ type: 'CEILING_UPDATE',
ceiling: { id, detailing: createCeilingDetailing(next) } })`. The whole
   detailing object is rebuilt through the factory on every edit, so every
   sub-object (`face`, `framing`, `openings`, …) gets a new identity even when
   nothing in it changed.
2. `floorplanReducer.js` root reducer: a settled project mutation runs
   `computeDerivedModels(project)` — all 22 whole-project coordination models
   (`buildDerivedModels`, ~line 152). Nothing in that pass reads
   `detailing.lighting`: the only readers of `project.ceilings` are
   `documentSignature.js` (hashes the array), `professionalHandoff.js` and
   `phaseAssignments.js` (ids/phase). It is paid anyway.
3. The editor re-renders: `detail = useMemo(() => deriveCeilingDetail(ceiling,
project), [ceiling, project])` (~line 1081). `deriveCeilingDetail`
   (`ceilingModels.js` 1964) calls `ceilingContext` (boundary + obstruction
   collection + polygon subtraction) and re-derives the same things many times
   over: `deriveCeilingFasteners` re-runs `deriveCeilingFramingMembers` and
   `deriveCeilingPanels`; `deriveCeilingTakeoff` re-runs panels, members,
   fasteners (which re-runs panels and members again), hangers and fixtures.
   Panels are derived ~4×, framing ~5×, the context ~12× per call.
4. `CeilingPlanLayers` (memo, ~line 652) receives new `panels`, `frameMembers`,
   `hangers`, `fasteners`, `lightFixtures`, `openings`, `regions`, `selection`
   props every commit, so the memo never holds and React reconciles the whole
   plan: on the bench ceiling that is 7,678 SVG nodes (2,233 screws × a `<g>`,
   a `<title>` and a `<circle>`).
5. `previewProject = useMemo(() => createCeilingDetailPreviewProject(project,
ceiling.id), …)` → `ThreePreviewPanel` → `buildPreviewScene(…, {
assemblyDetail: true })` → `buildCeilingPreviewObjects` → **a second
   `deriveCeilingDetail`** → 2,415 descriptors (boards, framing, hangers,
   openings, 2,233 screw heads, fixtures, bounce lights). The floor's
   `sourceKey.ceilings` changes, so `previewSceneCache.build` rebuilds the
   floor group, deep-comparing all 2,415 descriptors to carry over what did
   not change (`descriptorsEqual`, `buildPreviewObjects.js` 1698), refills the
   instanced batch group, then `applySceneLightBudgets`.
6. The new fixture adds a `ceilingLightSource` (SpotLight for any lamp with a
   beam angle — every BR/PAR/MR lamp and the panels; PointLight for omni
   lamps) plus, for a new 6 m cell, a bounce PointLight
   (`ceilingGeometry.js` 441). **three.js r0.183 keys every lit material's
   shader program on the light counts** (`WebGLLights.js` 442–451:
   `pointLength`, `spotLength`, `numPointShadows`, `numSpotShadows`, …; a
   changed hash bumps `lights.state.version`, and `WebGLRenderer.getProgram`
   2163 then acquires a new program for every material). Every placement
   therefore recompiles the entire material set.
7. `setWorld` (`createPreviewViewport.js` 1398) invalidates the walk collision
   index, rebuilds the grid helper and ground, resets the progressive
   accumulation; the first frame after it compiles the new programs
   synchronously and renders the new shadow maps.

### 2.2 Measurements

Bench project: the playground demo's first floor (10 walls, 6 beams, 0 rooms)
with one beam-hung ceiling from `createCeilingForProject` — 12.1 × 10.1 m, 38
boards, 129 framing members, 44 hangers, 2,233 screws, 5 regions. The vitest
helper that builds it and times the pure-JS stages lives at
`C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\96a28e6d-4840-4751-91b9-ca872b9a42d7\scratchpad\ceilingLightBench.test.js`
(copy it into `src/` to run; it is not part of the repo).

Pure JS, Node, median of 15 (ms):

| Stage                                                                                                |        ms |
| ---------------------------------------------------------------------------------------------------- | --------: |
| `deriveCeilingPanels`                                                                                |       4.5 |
| `deriveCeilingFramingMembers`                                                                        |       8.0 |
| `deriveCeilingFasteners` (re-derives panels + framing)                                               |      13.1 |
| `deriveCeilingTakeoff` (re-derives everything)                                                       |      26.1 |
| `deriveCeilingDetail` (all of the above, again)                                                      |      51.3 |
| `buildCeilingPreviewObjects` with screws (2,415 descriptors; includes another `deriveCeilingDetail`) |      68.4 |
| `buildPreviewScene` for the editor pane                                                              |      64.9 |
| `previewSceneCache.build` after adding one light (incremental)                                       |     18–24 |
| reducer `CEILING_UPDATE`, settled (coordination pass)                                                |     103.4 |
| reducer `CEILING_UPDATE` inside an open drag gesture                                                 |       2.1 |
| **One click, JS only** (reducer + RCP derive + 3D descriptors)                                       | **145.5** |

Real app (dev server, headless Chrome with GPU, Playwright probe at
`…\scratchpad\probe-light-placement.mjs`, output `probe-light-placement.json`):

| Light #                                                 | click → symbol on RCP | long tasks after click | three.js programs before → after |
| ------------------------------------------------------- | --------------------: | ---------------------- | -------------------------------- |
| 1                                                       |              1,474 ms | 395 + 964 + 90         | 24 → 41                          |
| 2                                                       |              1,813 ms | 414 + 1,256 + 115      | 41 → 58                          |
| 3                                                       |              1,815 ms | 376 + 1,310 + 101      | 58 → 75                          |
| 4                                                       |              2,391 ms | 398 + 1,835 + 130      | 75 → 92                          |
| 5                                                       |              2,540 ms | 2,381 + 134 + 71       | 92 → 109                         |
| 6                                                       |              2,709 ms | 313 + 2,151 + 182 + 80 | 109 → 126                        |
| drag an existing light (Select tool, commit on release) |                     — | 91                     | unchanged                        |

Reading: **17 new shader programs per light**, growing with scene size — that
is the 1–2 s task. The ~400 ms task in front of it is the reducer's
coordination pass + two `deriveCeilingDetail`s + the scene descriptors + React
reconciling 7.7 k SVG nodes. The drag proves the floor: a light _move_ keeps
the light count, compiles nothing, and still costs ~90 ms of pure JS. The
cursor with the Light tool active is `auto`.

### 2.3 Root causes, ranked

Performance:

1. Light-count change → full shader recompile (≈1–2 s per click, grows).
2. Coordination pass on an edit no coordination model reads (≈100 ms).
3. `deriveCeilingDetail` fan-out (~12 context builds) run twice per commit
   (RCP + 3D) (≈120 ms).
4. Wholesale RCP memo invalidation → ~7.7 k SVG nodes reconciled.
5. 2,415 descriptors rebuilt and deep-compared per commit (≈85 ms).

Experience:

6. No hover ghost; no crosshair (the shared stylesheet
   `WallDetailEditor.module.css` 935–941 lists `add_fastener` etc. but not
   `add_light`, `draw_opening`, `draw_furring`, `draw_carrier`).
7. The RCP has no plan context: rooms, walls, doors, windows and furniture are
   stripped (`ceilingDetailPreviewProject.js` strips the floor; the plan draws
   boards/structure only). Walls crossing the ceiling appear only as holes.
8. Snapping for lights is the board-edge/50 mm grid of the drawing tools
   (`eventToLocal(event, true)` → `snapWallLocalPoint` with
   `collectWallSnapCandidates`). Lights want board centres, room centres and
   alignment/equal spacing with the lights already placed.
9. The fixture type is chosen only in the Lighting section of the aside
   ("Pick a fixture, then press L"); the tool has no options of its own.
10. The move preview for a dragged light is a 6 px yellow dot, not the symbol
    (`gesturePreviewType === 'fixture'` branch, ~line 3200).

## 3. Goals and non-goals

Goals (all measurable, section 7):

- Placing a light never blocks the RCP: click → symbol in ≤ 150 ms on the
  bench project in the dev build, with ≤ 150 ms of main-thread long tasks in
  the 3 s after the click (today: 1.5–2.7 s).
- Shader recompiles happen at most at step boundaries (section 4.7), never
  per light; in the ceiling editor the first few lights compile nothing.
- Before the click, the plan says where the light will go: ghost symbol at
  true size, snapped, with a readout naming the room, the board and the
  spacing to the neighbouring lights, plus alignment guides.
- The RCP shows the plan under it (rooms with names, walls, openings,
  furniture) as a non-interactive underlay, toggleable, on by default.
- No schema change. Stored fixtures keep their shape
  (`createCeilingLightFixture`). Sheets, PDF, `renderToImage.js` untouched.
  The main 3D preview behaves as before except faster.

Non-goals: new fixtures or lamps, lux analysis, RectAreaLight, wiring, a new
fixture glyph in `WallDetailUiKit`, the wall editor's own placement tools
(the deferral flag of 4.3 is reusable there; do not wire it now).

## 4. Design

Work is ordered P0 (performance) → P1 (placement UX) → P2 (optional). Build
P0 first and measure before P1; the probe script is the yardstick.

### 4.1 Interaction model (P1)

| Stage | What the user does               | What the plan shows                                                                                                                                                                                                                                          |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arm   | `L` or the Light button          | crosshair cursor; a tool-options strip in the canvas toolbar (`styles.toolGroup`, next to Snap) with the **New light type** select bound to the existing `lightDraftType` state (the Lighting section's select stays and shares the state) and the hint text |
| Hover | moves the pointer                | a **ghost** of the chosen type at true size (`fixtureSymbolNodes`, dashed stroke, 0.6 opacity, `data-light-ghost`), snapped per 4.2; guide lines for alignment snaps; a `CanvasReadoutChip` at the cursor                                                    |
| Click | left click                       | commits one fixture (today's `addLightFixture`), selects it, tool stays armed; the ghost continues from the new pointer position                                                                                                                             |
| Shift | held during hover/click          | constrains to the last placed (or selected) fixture's U or V line, whichever is nearer                                                                                                                                                                       |
| Esc   | —                                | first cancels nothing-in-flight, then returns to Select (today's behaviour)                                                                                                                                                                                  |
| Move  | Select tool, drag a placed light | the same ghost + guides + chip replace the 6 px dot; commit on release as today                                                                                                                                                                              |

The chip lines, in order, omitting lines that do not apply:

1. the room under the cursor (`roomAt(planPoint)` over `ceilingFloor.rooms`,
   plan point = `space.toPlan({u, v})`); when the ceiling spans no room,
   nothing;
2. what the point snapped to: `Board P7 · centre`, `Room centre`, `In line
with Light 2`, `Midway Light 2 – Light 3`, `Next in run · 1,500 mm`, or
   `Grid`;
3. `U 1,500 · V 2,400` (existing `formatMm`).

Hover state lives in editor state (`hoverPoint`) updated from
`updateCanvasGesture` when `canvasTool === ADD_LIGHT` (and during a fixture
move gesture). It must not re-render the memoised layers: the ghost, guides
and chip are drawn in the editor body like today's draw previews.

### 4.2 Light snapping (P1)

New pure module `ceiling-detail/lightSnap.js` (unit-tested, no React):

- `collectLightSnapTargets({ panels, regions, fixtures, length, depth })`
  returns targets of kinds `fixture_line` (every placed fixture's U and V),
  `midpoint` (between each pair of fixtures sharing a U or V line within
  1 mm), `run` (the last two fixtures' spacing repeated past either end),
  `board_centre` (each panel's rect centre: `(u0+u1)/2, (v0+v1)/2`),
  `region_centre` (each region outline's centroid), with a `label` for the
  chip.
- `snapLightPoint(point, targets, { pixelsPerU, pixelsPerV, radiusPx: 12,
shiftAnchor, grid: { enabled, step } })` returns `{ point, snap, guides }`
  where `guides` is a list of `{ axis: 'u'|'v', value }` lines to draw.
  Priority when several are in range: fixture lines and midpoints/run
  (points) first — a point target within radius beats a line; two lines
  (one U, one V) combine into their intersection; then board centre, then
  region centre, then the drawing grid (`snapWallLocalPoint`) when snap is
  on, else the raw point. Shift replaces the line candidates with the anchor
  fixture's U or V line.

The Light tool stops using `eventToLocal(event, true)`; it uses
`screenPointToWallLocal` + `snapLightPoint`. With the Snap toggle off,
nothing snaps except an explicit Shift constraint.

Guides: dashed amber `#ffb85c` lines across the full ceiling in the flipped
group, `pointer-events: none`, `vector-effect: non-scaling-stroke`,
`data-light-guide`.

### 4.3 Store: coordination deferral for assembly edits (P0)

`CEILING_UPDATE` gains an optional field `coordination: 'defer'`. In the root
reducer (`floorplanReducer.js` ~1905), when a project mutation arrives with
that field and **no drag gesture is active**, record history exactly as today
but skip `computeDerivedModels`: return `{ ...withClearedRejection, gesture:
createDragGesture(true) }` (derived stale, as a mid-drag edit does). The
existing `END_DRAG_GESTURE` branch already recomputes when
`derivedStale` is set without an active gesture; the next settled edit of any
other kind also recomputes from its own project. With an active gesture the
flag changes nothing.

`commitDetailing` in the ceiling editor always passes `coordination:
'defer'`. The editor dispatches `END_DRAG_GESTURE` from an effect cleanup on
unmount/close and from a 1.5 s trailing timer after the last deferred commit,
so the lifecycle panels under the overlay catch up while it is open.
`routeStructuralActionToCommand` and `reduceProjectState` pass the extra
field through untouched (verified: they only read `type` and the payload).

Tests in `floorplanReducer.test.js`/`dragGesture.test.js`: deferred update
records one history entry, leaves `derived` identical by reference, sets the
stale flag; `END_DRAG_GESTURE` then recomputes; a deferred update inside an
active gesture behaves as before; undo after deferred edits still works.

### 4.4 Ceiling derivation cache (P0)

In `ceilingModels.js`, add a per-ceiling assembly cache so a lighting-only
edit re-derives nothing heavy and returns **identity-stable** arrays:

- Key: `ceiling.id`. Validator: `{ floor: getProjectFloor(project,
ceiling.floorId) (identity), coverageFloor: resolveCeilingCoverageSlabs
floor (identity), signature }` where `signature` is `JSON.stringify` of the
  ceiling minus `detailing.lighting` and `detailing.dimensions` — i.e.
  `{ attachment, boundaryPolygon, boundarySource, baseElevation, detailing:
{ enabled, jurisdictionProfileId, face, framing, suspension, openings } }`.
  (Identity on the stored sub-objects cannot work: `createCeilingDetailing`
  rebuilds them every commit.) Keep the last 8 ceilings (Map, insertion
  order).
- Cached: the `ceilingContext` result, `panels`, `framing`, `hangers`,
  `fasteners`. On a hit, `deriveCeilingPanels` etc. return the cached arrays
  (same references). `deriveCeilingLightFixtures` and dimensions stay live
  (cheap, and they depend on lighting).
- Fix the fan-out regardless of the cache: `deriveCeilingDetail` and
  `deriveCeilingTakeoff` derive each part once and pass it along
  (`deriveCeilingTakeoff(ceiling, project, parts?)`), so a miss costs one
  panels + one framing + one fasteners + one hangers derivation.
- `CeilingProperties.jsx` and anything else calling the `resolve*` helpers is
  unaffected.

Targets: `deriveCeilingDetail` hit ≤ 2 ms, miss ≤ 30 ms on the bench ceiling.
Tests: identity reuse across a lighting-only change; invalidation on a
changed face/openings/boundary/attachment/floor; results deep-equal the
uncached ones (run the existing `ceilingModels.test.js` unchanged).

### 4.5 RCP render: split memos (P0)

Split `CeilingPlanLayers` into one memo per collection with only its own
props: `CeilingBoardLayer` (opening voids + boards), `CeilingStructureLayer`,
`CeilingHangerLayer`, `CeilingScrewLayer`, `CeilingFixtureLayer`,
`CeilingOpeningProfileLayer`, `CeilingBoundaryLayer`, in today's z-order
(grid, voids, boards, structure, hangers, screws, **plan underlay (4.6)**,
fixtures, opening profiles, boundary rings). Each takes `selectedId` for its
own entity type instead of the whole `selection` object, and the same stable
handler refs as today. With 4.4 a light placement re-renders only the fixture
layer; the screws are untouched.

Target: React commit of a placement ≤ 30 ms in dev on the bench ceiling.

### 4.6 Plan underlay (P1)

New memo component `ceiling-detail/CeilingPlanUnderlay.jsx` drawn inside the
flipped group, above screws, below fixtures; `pointer-events: none`,
`aria-hidden`, root `<g data-plan-underlay>`. It maps plan millimetres into
the ceiling's UV frame with one SVG transform derived from
`getCeilingLocalSpace(resolveCeilingBoundary(project, ceiling))`:

```
origin = space.toLocal({ x: 0, y: 0 })
transform = matrix(axisU.x, axisU.y, axisU.y, -axisU.x, origin.u, origin.v)
```

(`u = x·axisU.x + y·axisU.y − minU`, `v = x·axisV.x + y·axisV.y − minV`,
`axisV = (axisU.y, −axisU.x)`; the matrix has determinant −1 and the outer
`translate(0 depth) scale(1 −1)` flips it back, so the plan reads with the
same handedness as the floor plan.) Verify in a test that a wall endpoint
mapped through the transform lands on `space.toLocal(endpoint)`.

Content, all from `ceilingFloor` (already in the editor), muted so it never
competes with the boards:

- walls: `getWallRenderData(wall, columns).outline` polygons, fill `#33414f`
  opacity 0.55; columns: `columnOutline` likewise;
- doors / windows: the opening extent as a bar across the wall thickness at
  `offset`…`offset + width` along the wall (resolve endpoints with
  `resolveWallEndpoints`), doors `#ffd48a` 0.5, windows `#8fd0f0` 0.5;
- rooms: outline dashed `#8fa3b8` 0.6, no fill; the room **name** drawn
  outside the flipped group in drawing coordinates (`x = u`, `y = depth − v`
  of `space.toLocal(room.labelPosition)`), font `12.5 × unitPx` like the
  dimension text, fill `#cfd8e3` with a dark `paint-order: stroke` halo so it
  stays legible over pale boards;
- furniture (`floor.fixtures`): `fixtureOutline(fixture)` polygons, stroke
  `#5b6b7a` 0.7, no fill.

Layer toggle `plan` (label `Plan`), first in `layerVisibility`, default on.
It also renders in the "No boards on this ceiling yet" state. Memo on
(`ceilingFloor`, the space's axis/origin values, `unitPx`).

### 4.7 3D pane: stable light counts, non-blocking compiles (P0)

(a) **Fixture light pool** — new module `preview/fixtureLightPool.js`,
`syncFixtureLightPool(root, counts, policy) → { changed }`. It owns a group
named `fixture-light-pool` under the world root holding dummy lights so that
the visible counts of point lights, spot lights, point shadow casters and spot
shadow casters each equal `step(count)`:

```
step(n, size, min) = max(min, ceil(n / size) * size)
policy = { lightStep: 4, shadowStep: 2, minSpots, minPoints, minSpotShadows, minPointShadows }
```

capped at `MAX_ACTIVE_FIXTURE_LIGHTS` (24) for lights and
`MAX_FIXTURE_SHADOW_LIGHTS` (8) for casters. A dummy is a `PointLight` /
`SpotLight` with `intensity 0`, `color 0x000000`, `distance 1`, placed at
`y = −1e6`, `userData.lightPoolSlot = true` and **not** `isFixtureLight`
(so `applyInteriorLighting` and the budget pass ignore it); a shadow slot has
`castShadow = true`, `shadow.mapSize 16 × 16`, `shadow.autoUpdate = false`,
`shadow.needsUpdate = true` (one 16² pass, then held). The pool shrinks only
to the step, never below it, and survives across builds; `dispose()` disposes
it.

`applySceneLightBudgets(meshMap)` returns the counts it left visible and
casting (`{ point, spot, pointShadows, spotShadows }`; bounce lights are
points). `previewSceneCache.build` calls the pool sync right after the
budgets, before `freezeStaticMatrices`. `createPreviewSceneCache({ batch,
lightPool })` takes the policy; `ThreePreviewPanel` passes `{ minSpots: 4,
minPoints: 2, minSpotShadows: 2, minPointShadows: 0 }` when `assemblyDriven`
(pre-warm: the first four spots and two casters in the ceiling editor compile
nothing) and all-zero minima otherwise (the main preview pays nothing until
it has lights, then recompiles at most every fourth light).

The Lights toggle must stop changing light counts: in `applyInteriorLighting`
(`createPreviewViewport.js` 1047) keep `node.visible =
!node.userData.budgetSuppressed` and drive the switch through intensity
(`lightsOn ? baseIntensity × scale : 0`). Lens emissive handling unchanged.
Night mode already only changes the rig, not the counts.

Guard the per-frame cost: dummies still run in the fragment loop. Measure the
pane's refine ms per sample (`window.__previewPerf.snapshot()`) on the bench
project with the pool at its minimum versus the pool disabled and report it;
if it exceeds +10 %, lower the assembly minima to `{ minSpots: 2,
minPoints: 1, minSpotShadows: 1 }` and say so.

(b) **Non-blocking compile** — three r0.183 has `renderer.compileAsync(scene,
camera)` (`WebGLRenderer.js` 1473, uses `KHR_parallel_shader_compile`, which
ANGLE/D3D11 exposes). In `setWorld`, when the pool sync reported `changed`
(the light hash moved), start `compileAsync` and, while it is pending in
inspect mode, have `renderFrame` skip drawing (the canvas keeps the last
presented frame; navigation and timers still update); on resolve clear the
flag, `markShadowsDirty()`, `invalidate()`. Ignore a resolve for a world that
has since been replaced; any rejection clears the flag and continues. Walk
mode never gates. Expose `changed` from `build` so the panel can pass it to
`setWorld` (`{ batchRoot, lightsChanged }`).

Targets (probe, bench project, dev build): long tasks ≤ 150 ms per click;
`window.__previewPerf.programs().length` unchanged across the first four
placements in the ceiling editor and growing at most once across six.

### 4.8 3D descriptor cache (P0)

`buildCeilingPreviewObjects` memoises its non-lighting descriptors (boards,
framing, hangers, openings, fasteners) in a `WeakMap` keyed on the `panels`
array identity from 4.4 (plus an options key for `fasteners`/`hideBoards`),
returning the same descriptor objects. `descriptorsEqual` then short-circuits
on `a === b`; `buildPreviewScene` for the editor pane drops from ~65 ms to a
few ms on a lighting-only change. Lighting and bounce descriptors are rebuilt
each call (they are tiny). The one-shot `buildPreviewObjectRoot` path keeps
working unchanged.

### 4.9 Cursor (P1, trivial)

`WallDetailEditor.module.css` 935–941: add `add_light`, `draw_opening`,
`draw_furring`, `draw_carrier` to the crosshair rule (check the wall editor's
tool ids so its opening tool is covered too).

## 5. P2 — row / grid placement and placing from the Live 3D pane

Written 2026-11-04 after P0/P1 shipped (see section 10). Both items build on
what is there: `lightSnap.js`, `CeilingLightPlacement.jsx`, the `draw` gesture
protocol in `CeilingDetailEditor.jsx` (`beginCanvasGesture` →
`updateCanvasGesture` → `finishCanvasGesture` → `commitDrawnEntity`, Escape
cancelling an in-flight gesture in `shortcutHandlerRef`), `addLightFixture`,
and the 3D pane's pick path (`createPreviewViewport.pickObjectAt` →
`ThreePreviewPanel.handlePreviewPick` → `onAssemblyPick(part)` →
`CeilingDetailEditor.handlePreviewPick`).

### 5.1 Row / grid placement (Light tool drag)

Today the Light tool places on pointer **down**. It moves to pointer **up**,
so a press can become a drag:

| Gesture                                                                                                                           | Result                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| press and release within `CLICK_DISTANCE_THRESHOLD` px (6, `previewConfig.js`) of screen travel                                   | one light at the snapped press point, exactly today's behaviour                                                                                                        |
| drag A → B                                                                                                                        | a **row**: `count` lights evenly spaced from A to B inclusive, `count` 2 by default                                                                                    |
| `↑` / `↓` while dragging                                                                                                          | `count` + 1 / − 1, clamped to 2…24                                                                                                                                     |
| **Shift** held (read from `event.shiftKey` on every pointer move and on release, and from Shift keydown/keyup during the gesture) | a **grid** filling the rectangle A → B: `columns` along U, `rows` along V, 2 × 2 by default; `←` / `→` change `columns`, `↑` / `↓` change `rows`, each clamped to 2…24 |
| Escape mid-drag                                                                                                                   | places nothing, tool stays armed (the existing Escape branch already clears `gesture`)                                                                                 |

The wheel is **not** used for the count (it zooms the canvas).

Snapping: the press point A is the snapped `placeLight(lightHoverAt(event))`
point as today. The release point B is snapped the same way but with
`shift: false` (Shift now means grid, not the line constraint). Intermediate
lights do not snap individually: even spacing is the point. A side of the
rectangle shorter than 1 mm gets a single light along it whatever its count,
so a Shift-drag along one axis is a row and A = B is one light.

Pure module `ceiling-detail/lightRun.js`, unit-tested:

```
layoutLightRun(start, end, count) → [{u, v}]          // inclusive, count ≥ 1
layoutLightGrid(start, end, columns, rows) → [{u, v}] // row-major from `start`; 1 light along a side < 1 mm
clampLightCount(value) → 2…24
describeLightRun(points, { grid, columns, rows }) → '3 × 1,500 mm' | '3 × 2 · 1,500 × 1,200 mm'
```

(spacing = distance between neighbours; the two grid spacings are along U
then along V; `mm()` formatting as in `lightSnap.js`, with thousands commas.)

Editor:

- `beginCanvasGesture`, Light tool: keep the canvas rect pinned (other draw
  tools do), capture the pointer, and set
  `{ kind: 'draw', tool: ADD_LIGHT, start: placement.point, current: raw point,
hover: lightHoverAt(event), count: 2, columns: 2, rows: 2, grid: event.shiftKey,
pointerId, screenX, screenY }`.
- `updateCanvasGesture`: with a Light-tool gesture live, update `current`,
  `hover` (so the end point can be snapped at release), `grid`, and still set
  `lightHover`. The early `return` for the Light tool must not skip this.
- `finishCanvasGesture`, Light-tool `draw` gesture: travel <
  `CLICK_DISTANCE_THRESHOLD` px → `addLightFixtures([gesture.start])`;
  otherwise `end = placeLight({ ...gesture.hover, point: raw release point,
shift: false }).point`, `points = grid ? layoutLightGrid(start, end,
columns, rows) : layoutLightRun(start, end, count)`, then
  `addLightFixtures(points)`.
- `addLightFixtures(points)`: creates every fixture with
  `createCeilingLightFixture(point, { fixtureType: lightDraftType })`, commits
  them in **one** `updateLighting` call (one `CEILING_UPDATE`, one undo step)
  and selects the last one. `addLightFixture(point)` becomes
  `addLightFixtures([point])`; the 3D-pane path (5.2) uses it too.
- `shortcutHandlerRef`: before the Escape branch, when `gesture?.kind ===
'draw' && gesture.tool === ADD_LIGHT`, claim `ArrowUp/ArrowDown/ArrowLeft/
ArrowRight` (`claimShortcut`) and adjust the counts as in the table; a
  `Shift` keydown/keyup sets `gesture.grid`. Nothing else changes.
- `drawnGestureEntity` for the Light tool returns `{ points, grid, columns,
rows, count, end }` (end = the snapped release placement, with its `snap`
  and `guides`). The render branch for it draws a new `CeilingLightRunGhost`
  (in `CeilingLightPlacement.jsx`): `<g data-light-run="row"|"grid"
data-light-count={points.length}>` holding a dashed `#ffb85c` line A → B
  (row) or rectangle (grid), the end point's guides via `CeilingLightGuides`,
  and one `CeilingLightGhost` per point (so `[data-light-ghost]` counts the
  lights about to be placed). The single hover ghost is not drawn while a run
  gesture is live.
- `gestureReadout` for the run: line 1 the room under the END point (as
  `lightPlacementReadout` finds it), line 2 `describeLightRun(...)`, line 3
  what the end snapped to (`end.snap.label`) when there is one. Chip at the
  end point.
- Hints: `TOOL_HINTS[ADD_LIGHT]` and the `LightToolOptions` caption say
  "Click to place · drag for a row (↑/↓ count) · hold Shift for a grid
  (←/→ columns, ↑/↓ rows)".

### 5.2 Placing from the Live 3D pane

With the Light tool armed, a click on one of **this ceiling's boards** in the
pane places a light at the hit point. Everything else the pane does today is
unchanged: a click on a fixture housing selects that light, a click on a
hanger does nothing, empty space clears the selection, and with any other tool
the pane keeps selecting.

The hit point travels up the existing path as a second argument, which keeps
every current caller working:

- `createPreviewViewport.pickObjectAt`: remember the first `hit` for the
  target chosen and call `pickHandler(target, { point: worldRoot.worldToLocal(hit.point.clone()) })`
  (`worldToLocal` is the identity while the root sits at the origin, which it
  does today — `setWorld` never translates it — but the root is the frame the
  descriptors were built in, so convert anyway). `pickHandler(null)` stays
  as it is for a miss.
- `ThreePreviewPanel.handlePreviewPick(target, hit)`: in an assembly pane call
  `onAssemblyPick(target?.part || null, hit ? { plan: { x: hit.point.x, y: hit.point.z }, elevation: hit.point.y, kind: target.kind, sourceId: target.sourceId } : null)`.
  The world frame is `planPointToWorld(point, elevation) = (point.x, elevation, point.y)`
  (`buildPreviewObjects.js` 33), so plan x is world x and plan y is world z.
  Put that inverse in a tiny exported helper (`previewPickHit(target, hit)`
  in a new `preview/previewPick.js`) with a unit test, so the mapping is not
  only tested through the DOM. `part` for a ceiling board is
  `{ kind: 'panel', id: panel.localId, side: null }` (`readAssemblyPart`,
  `buildPreviewObjects.js` 1677); for a luminaire housing `kind: 'fixture'`.
- `CeilingDetailEditor.handlePreviewPick(part, hit)`: when `canvasTool ===
ADD_LIGHT`, `hit?.kind === 'ceiling'`, `hit.sourceId === ceiling.id` and
  `part?.kind === 'panel'`: `uv = ceilingSpace.toLocal(hit.plan)`, snap with
  `placeLight({ point: uv, shift: false, pixelsPerU: PANE_SNAP_SCALE,
pixelsPerV: PANE_SNAP_SCALE })` where `PANE_SNAP_SCALE =
LIGHT_SNAP_RADIUS_PX / 150` (a reach of 150 mm, since the pane has no
  plan pixels to judge by), then `addLightFixtures([placement.point])` and
  return. Otherwise today's selection logic. `handlePreviewPick` is a stable
  `useCallback([])`; read the live tool, space, `placeLight` and
  `addLightFixtures` through a ref updated each render (the pattern
  `canvasHandlersRef` already uses) rather than widening its deps.
- Affordance: the pane wrapper `<div className={styles.previewPane}
aria-label="Live ceiling assembly 3D preview">` gets
  `data-light-armed="true"` while the Light tool is armed; CSS
  `.previewPane[data-light-armed='true'] canvas { cursor: crosshair; }`; the
  badge's `<small>` reads "Light tool armed: click a board here to place a
  light" while armed, today's text otherwise.

### 5.3 Tests and verification

- `lightRun.test.js`: inclusive even spacing; grid row-major; a side under
  1 mm collapses to one light; count clamping; the two labels.
- `previewPick` helper test: world `(x, y, z)` → plan `{x, y: z}`, elevation `y`.
- `CeilingDetailEditor.dom.test.jsx`, in the existing `placing a light` block
  (its harness: `mountForLights`, `toScreen`, `pressKey`, `chipText`,
  `commitLastUpdate`, `previewProps.pick`):
  - a drag with `ArrowUp` pressed once mid-drag shows three ghosts inside
    `[data-light-run="row"]`, the chip reads `3 × 1,500 mm` (pick points that
    make it so), and release sends ONE `CEILING_UPDATE` with three new
    fixtures evenly spaced, `coordination: 'defer'`;
  - the same drag with Shift held shows `[data-light-run="grid"]` and commits
    2 × 2 in one update; `ArrowRight` makes it 3 × 2;
  - a press and release without travel still places one light;
  - Escape mid-drag commits nothing;
  - with the Light tool armed, `previewProps.pick({ kind: 'panel', id },
{ plan, elevation, kind: 'ceiling', sourceId: ceiling.id })` places one
    fixture at `resolveCeilingLocalSpace(ceiling, project).toLocal(plan)`
    (snapped); with the Select tool the same pick selects the board (the
    existing test must still pass); a pick on a fixture with the Light tool
    armed selects it; a pick with no hit clears the selection.
- `scripts/verify-ceiling-light-placement.mjs`, after the six placements:
  - a Light-tool drag between two free spots with one `ArrowUp` mid-drag →
    fixture count + 3, symbol within 150 ms, long tasks ≤ 150 ms; one click
    on the Undo button (`title` starts with "Undo") removes all three;
  - 3D pane: with the Light tool armed, click the pane's canvas
    (`[aria-label="Live ceiling assembly 3D preview"] canvas`) at a 5 × 3
    grid of points, stopping at the first that raises the fixture count;
    FAIL if none does. Record which point hit. Before this, press the pane's
    "Reset View" so the camera is in its known state.
  - keep every existing check; the table and the JSON gain the new rows.
- Whole suite green; `npm run lint` 0 errors.

### 5.4 Judgment calls to report

The 6 px click/drag threshold; what a grid does when A → B is not
axis-aligned (the rectangle is still spanned by A and B in UV); whether
intermediate lights should snap (spec: no); the 150 mm pane snap reach; the
badge wording.

## 6. Files

| File                                                                                | Change                                                                                                          |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/features/floorplan/store/floorplanReducer.js`                                  | `coordination: 'defer'` handling (4.3)                                                                          |
| `src/features/floorplan/store/*.test.js`                                            | deferral tests                                                                                                  |
| `src/domain/ceilingModels.js` (+ test)                                              | assembly cache, fan-out fix (4.4)                                                                               |
| `src/geometry/ceilingGeometry.js` (+ test)                                          | descriptor cache (4.8)                                                                                          |
| `src/features/floorplan/components/preview/buildPreviewObjects.js`                  | `applySceneLightBudgets` returns counts                                                                         |
| `src/features/floorplan/components/preview/fixtureLightPool.js` (+ test)            | new (4.7a)                                                                                                      |
| `src/features/floorplan/components/preview/previewSceneCache.js` (+ test)           | pool sync, `lightsChanged`                                                                                      |
| `src/features/floorplan/components/preview/createPreviewViewport.js`                | intensity-based Lights switch, `compileAsync` gate (4.7b)                                                       |
| `src/features/floorplan/components/preview/ThreePreviewPanel.jsx`                   | pool policy, pass `lightsChanged`                                                                               |
| `src/features/floorplan/components/ceiling-detail/CeilingDetailEditor.jsx`          | tool strip, ghost, guides, chip, split layers, underlay mount, deferred commits, END_DRAG_GESTURE on close/idle |
| `src/features/floorplan/components/ceiling-detail/CeilingPlanUnderlay.jsx` (+ test) | new (4.6)                                                                                                       |
| `src/features/floorplan/components/ceiling-detail/lightSnap.js` (+ test)            | new (4.2)                                                                                                       |
| `src/features/floorplan/components/ceiling-detail/CeilingDetailEditor.dom.test.jsx` | ghost/snap/chip/underlay/deferral tests                                                                         |
| `src/features/floorplan/components/wall-detail/WallDetailEditor.module.css`         | crosshair rule (4.9)                                                                                            |
| `scripts/verify-ceiling-light-placement.mjs`                                        | new (section 7)                                                                                                 |

Keep `CeilingDetailEditor.jsx` from growing: the new pieces are separate
files; the editor only mounts them.

## 7. Acceptance and verification

Unit / DOM (vitest, jsdom for the editor):

- reducer deferral (4.3); cache identity + invalidation (4.4, 4.8); pool
  counts/steps/caps, dummy flags, shrink-to-step, dispose (4.7a); the
  budgets' returned counts; `lightSnap` priorities, Shift, guides (4.2);
  underlay transform (4.6); editor DOM: crosshair `data-tool`, ghost appears
  on pointer move with the chosen type's symbol and vanishes on tool change,
  chip text names the room/board/spacing, a click commits one fixture with
  `coordination: 'defer'`, split layers (placing a light does not re-render
  the screw layer — assert via a render counter or by DOM node identity),
  underlay present with room labels and hidden by its toggle.
- The whole suite stays green (`npx vitest run`); run `npm run lint` if the
  project has it.

Browser (`scripts/verify-ceiling-light-placement.mjs`, Playwright
`channel: 'chrome'` headless, dev server on 5199 — one is running now; start
your own with `npx vite --port 5199 --strictPort` if it is gone). Build on
the probe script in the scratchpad: it seeds `localStorage`
(`apartment-planner-projects` index + `apartment-planner-project-<id>`) with
the demo project plus a ceiling, opens `/floorplan` → Load Project → the
draft → Sidebar Ceilings (collapsed by default; click its header) → Edit, then
presses `L` and clicks. The script cannot import the domain through Vite's
`@/` alias, so commit the fixture project as
`scripts/fixtures/bench-ceiling-project.json`, generated once by a vitest
helper (the scratchpad `ceilingLightBench.test.js` shows how: demo project →
`createCeilingForProject` → `serializeProject`); add one room polygon
covering the ceiling, named, so the underlay has a label to assert. Assert:

- cursor over the canvas with the Light tool is `crosshair`;
- hovering shows `[data-light-ghost]`; `[data-plan-underlay]` exists with
  the room's name text; toggling Plan removes it;
- six placements: each click → new `g[data-fixture-id]` within 150 ms;
  long tasks in the 3 s after each click total ≤ 150 ms; programs count
  unchanged over the first four, ≤ 1 growth over six; no page errors;
- a drag of a placed light: long tasks ≤ 60 ms;
- toggling the Lights switch in the pane does not change the programs count.

Print the table and write `artifacts/floorplan/perf/ceiling-light-placement.json`.
Numbers are from a dev build; the thresholds above are dev-build thresholds.

## 8. Judgment calls to flag in the report

Step sizes and assembly minima; the Lights toggle moving from `visible` to
intensity; the `compileAsync` gate (which frames to hold); the chip wording;
underlay colours and whether doors/windows read; the cache's JSON signature
cost on custom board layouts with hundreds of boards (measure, note); whether
the wall editor should get `coordination: 'defer'` now (default: no); anything
in P2.

## 9. Repro commands

```
# pure-JS bench (copy the scratchpad test into src/ first, delete after)
npx vitest run src/__ceilingLightBench.test.js
# in-app probe (dev server on 5199)
MSYS_NO_PATHCONV=1 node "<scratchpad>/probe-light-placement.mjs"
```

Scratchpad: `C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\96a28e6d-4840-4751-91b9-ca872b9a42d7\scratchpad\`
(`ceilingLightBench.test.js`, `probe-light-placement.mjs`,
`bench-project.json`, `probe-light-placement.json`).

## 10. Implementation notes (2026-11-04)

Shipped, uncommitted: P0 (4.3, 4.4, 4.5, 4.7, 4.8), P1 (4.1, 4.2, 4.6, 4.9),
the verify script and its fixture. P2 (section 5) is not built. Opus built it;
Fable audited every claim against the source and re-ran the suite, lint, the
verify script and the original probe.

Measured after (dev build, headless Chrome with GPU, bench fixture):

| Metric                                          | Before                      | After                                                |
| ----------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| click → symbol on the plan                      | 1,388–2,175 ms              | 32–86 ms                                             |
| long tasks in the 3 s after a click             | 1,360–2,100 ms              | 0–62 ms                                              |
| shader programs over six lights                 | +17 per light (25 → 127)    | unchanged over the first four, +12 once at the fifth |
| drag of a placed light                          | 91 ms                       | 51–55 ms                                             |
| Lights switch                                   | recompiled the material set | no program change                                    |
| one click's JS (reducer + derive + descriptors) | 146 ms                      | 2 ms                                                 |

Where the build departs from the sections above, and why:

- **4.3** Deferred staleness carries its own flag (`gesture.deferredCoordination`)
  and only `{ type: 'END_DRAG_GESTURE', settleDeferred: true }` or an ordinary
  settled edit runs the pass. The floor plan under the overlay fires a plain
  `END_DRAG_GESTURE` from its window pointer-up on the very click that placed
  the light, which would have run the pass straight away.
  `useDeferredCoordination` sends the settle 1.5 s after the last deferred
  commit and on close/unmount.
- **4.4** The cache is keyed by ceiling id with two variants per ceiling: the
  model project and the editor's stripped preview project ask about the same
  ceiling on every commit and would otherwise evict each other.
  `createCeilingDetailPreviewProject` hands back identity-stable stripped
  floors for the same reason. `resolveCeilingLocalSpace` exposes the cached
  frame for the underlay.
- **4.7a** `shadowStep` is 4, not 2: lamps cast by default, so a caster step
  of two would recompile every second lamp. The assembly minima are 4 / 4 / 4.
  Measured at zero lights they cost +14 % CPU per refine sample (0.96 → 1.10
  ms) against +7.5 % for the 2 / 1 / 1 fallback, but the first lamp lifts
  both policies onto the same step, so the fallback saved per-frame cost only
  on an unlit ceiling and paid for it with a recompile on the first lamp. The
  +10 % rule above is withdrawn in favour of that reasoning.
  `localStorage.previewLightPool = 'off'` disables the pool for measurement.
- **4.7b** `renderer.compileAsync` is not used. `preview/compileScenePrograms.js`
  compiles against the progressive renderer's offscreen target (a program's
  identity includes output colour space and tone mapping, which differ between
  the canvas and that target, so `compileAsync` warmed variants that were never
  drawn with) and treats a material disposed mid-poll as done (three's own poll
  throws `isReady` of undefined and never resolves). The gate also opens for a
  world carrying a material with no program yet, holds at most 4 s, and only in
  inspect mode.
- **Editor** Commits run as React transitions with `useOptimistic` detailing,
  so the plan shows the light at once while the rest of the app re-renders in
  slices; the editor body is memoised so the settle does not re-render it.
  With the store and derivations fixed, about 120 ms of a click was React
  re-rendering the whole app under the overlay.
- **4.1** The chip's third line uses the existing `formatMm` (no thousands
  separators); the board reads as `on P18`. Fixture symbols take
  `pointer-events: bounding-box`, so pressing a can's hollow centre picks the
  light rather than the board under it.
- **4.6** A door's or window's `offset` is the opening's centre, and the bars
  are drawn about it.
- **Verify script** It selects a board once before placing, so the 3D
  selection overlay's own program is not counted against the first light; the
  drag check measures the 1.2 s after release, and the deferred pass that
  follows is checked separately against the per-click budget (≤ 150 ms).

Still open: P2; undo inside the editor still runs the full coordination pass;
the ~50 ms release commit of a drag is the editor body's render; the wall
editor does not send `coordination: 'defer'`.

### 10.1 P2 (section 5), built later the same day

Shipped, uncommitted, audited the same way (claims against source, suite,
lint, verify script). Measured on the bench fixture after the six placements:

| Check                    | Fixtures            | Click → symbol | Long tasks (3 s after) |
| ------------------------ | ------------------- | -------------: | ---------------------: |
| row drag, `↑` once       | 6 → 9, one Undo → 6 |          83 ms |                  62 ms |
| 3D pane click on a board | 6 → 7               |          94 ms |                  73 ms |

The pane click landed on board P17 of the plan, and a Select-tool click on the
same pane pixel picked that board, which holds the light: the world → plan
mapping is right in the real app.

Where the build departs from section 5, and why:

- **The press is held in a ref until it travels past 6 px** (`lightPressRef`),
  not put in `gesture` state on pointer down. Measured: state on the press
  rendered the editor body twice per plain click and raised its long tasks
  from 0–60 ms to 85–101 ms; the ref keeps a click at one render, on release.
  So arrow keys and Shift do nothing until the pointer has moved 6 px; Escape
  still cancels an unmoved press.
- **`grid` is read from `shiftKey` on release**: letting go of Shift before
  the mouse makes the run a row. A `keyup` listener
  (`useLightRunShiftRelease`) also turns a live grid back into a row.
- **`←`/`→` during a row are claimed and ignored** so the page cannot scroll
  under the drag.
- `LIGHT_RUN_CLICK_PX` is a copy of `CLICK_DISTANCE_THRESHOLD` (6), pinned
  equal by a test, because `previewConfig.js` imports three.js. "A drag" is
  more than 6 px, matching the pane.
- `describeLightRun` reads `1 light` for a single point, and a grid that
  collapsed to a line reads as the row it became.
- Shift held at the **press** still applies the hover constraint to A (in
  line with the last light); Shift during the **drag** means grid.
- The verify script also checks the pane attribute and cursor, the pane
  click's long tasks, and the Select-tool re-pick described above.

Still open after P2: the row or grid is not drawn in the 3D pane while
dragging; arrow-key counts need 6 px of travel first; the pane is only
128 px tall in Split view at 1600 × 1000, so a pane click has to find a board
(the verify script tries a 5 × 3 grid of points and reports which hit).
