# Performance pass 3 (2026-11-22)

Whole-app smoothness pass over the apartment planner, Sketch Studio's 2D drafting and the 3D workshop.
The owner's ask: a smooth experience in the heavy parts, 60 fps in the 3D preview and the 3D workshop at
the highest graphics quality, and nothing broken.

Earlier passes this one builds on, and whose contracts still hold: the August preview work (collision BVH,
refine profiles, `InstancedMesh` batching with the `SOURCE_ONLY_LAYER` split, suspended preview), the
August context split (seven layered contexts, entities identity reuse, light budgets, frozen matrices), the
November plan-canvas pass (pan / zoom as compositor gestures, document-signature and validation memos) and
`docs/perf-robustness-pass.md`.

## 1. Method

Six read-only auditors (Sonnet 5.5) each took one subsystem and reported ranked findings with
`path:line` evidence. The main loop re-read the cited lines for the headline claims before writing this
spec. The line-level evidence for every item below is in `artifacts/perf-pass-3/findings-notes.md`
(items are tagged A… / B… / C… / D… / E… / F… there); read the entries for your phase before you start.

Nothing in this pass was measured before it was specced: the auditors read source only. So every item
carries its own measurement, taken before and after, and an item whose measurement shows no win is
reverted rather than kept.

## 2. Baseline and gate

Baseline on 2026-11-22 before any change: `npx vitest run` 639 files passed / 1 skipped, 7793 tests passed /
1 skipped; `npx eslint src/` 0 errors / 40 warnings.

The gate after every wave, run by the main loop: full vitest (no new failures, no test deleted or skipped
to get there), eslint 0 errors and no new warnings, `npm run build` clean.

## 3. Rules for every phase

1. **Behaviour is frozen.** Same DOM, same pixels, same saved files, same undo steps, same tool flows
   (`docs/state-machines.md` and its pages are the registry of those flows). Where an item changes
   something a person could see, this spec says so explicitly; anything else visible is a bug.
2. **Skip rather than risk.** If an item cannot be made provably safe in your hands, leave the code as it
   was and say why in your report. A skipped item is a fine outcome; a subtle regression is not.
3. **Measure each item** before and after with a structural counter (calls, renders, builds, allocations,
   pixels, bytes) and, where it means something, milliseconds. Headless Chrome hides GPU-side cost, so
   counters are the load-bearing evidence. Write the numbers to `artifacts/perf-pass-3/<phase>.md`.
   Remove temporary probes afterwards; permanent ones go behind an existing dev / perf gate.
4. **Tests.** New pure logic gets unit tests. Each item gets a regression test where one is feasible
   (a render counter, an identity assertion, an equivalence fuzz against the old function kept in the
   test as the oracle). Never weaken an existing assertion to make a change pass: if a test pins behaviour
   you were about to change, the test is right.
5. **Run only your area's tests** (`npx vitest run <paths>` from the repo root, never from inside a
   subdirectory) and eslint on the files you touched. The full suite is the main loop's job; another
   builder may be working in a different area at the same time, and two full runs starve this machine.
6. **No git writes.** The working tree holds months of uncommitted work. No commit, stash, checkout,
   restore, reset or clean, ever.
7. **Stay in your files.** Each phase lists its files. If a fix needs a file outside the list, stop and
   report it instead.
8. **House style.** Plain JS, no new dependencies, comments in the density and voice of the file you are
   in, each file's existing line endings kept.

## 4. Phase A: the planner's 3D preview

Files: `src/features/floorplan/components/preview/*`, `ThreePreviewPanel.jsx` and its CSS module,
`CompassOverlay.module.css`, `src/ui/loading/PanePlaceholder.module.css`, `buildPreviewScene.js` and the
builders it calls. Findings B1 … B10, F2.

What the audit found: an interactive frame with ambient occlusion is eight passes at canvas resolution,
the scene is drawn twice (colour, then GTAO's normal prepass), both composer targets carry 8× MSAA at
half-float, and every governor in the pipeline times JavaScript submission, which says nothing about a
GPU-bound frame. So when the GPU cannot hold 60 fps nothing reacts, and after every camera stop the refine
runs its full 128 samples at four times the pixels.

### A1. A render-scale governor that reads the real frame rate

Add a pure policy module beside `refineSchedule.js` (same reasons: the loop needs WebGL, the policy must
be testable without it). Suggested name `renderScaleGovernor.js`.

- **Signal.** The gap between consecutive `requestAnimationFrame` timestamps while the loop is drawing
  camera-motion frames. Chrome holds back the next frame when the GPU is behind, so a GPU-bound preview
  shows up as a longer gap. A frame qualifies when it and the frame before it were both INTERACTIVE, the
  loop ran continuously between them, and neither was a scene-dirty frame (a plan-drag rebuild is
  main-thread work, not GPU load). Use a windowed mean over at least 20 qualifying frames or 0.5 s,
  whichever is longer; never a single frame.
- **Target.** 60 fps. Over budget means a windowed mean above 18.5 ms. This is deliberately independent
  of the display's refresh rate: a 144 Hz panel running at 72 fps is within budget.
- **Ladder.** `interactiveScale` ∈ {1, 0.85, 0.7, 0.58, 0.5}, replacing the constant `INTERACTIVE_SCALE`.
  Step down far enough that `mean × (next² / current²) ≤ 16 ms`, at least one rung.
- **When it may change.** At the first interactive frame of a gesture (from the previous gesture's
  window), and mid-gesture only after a full window over budget. That keeps `applyRenderScale`'s rule that
  a reallocation lands once per gesture, with the one exception that a sustained miss is worth one hitch.
- **Stepping back up** is by trial, because a vsynced display cannot show headroom: after three
  consecutive gestures within budget at the current rung, try one rung higher at the next gesture start;
  if that gesture goes over budget, step back down and double the wait (cap 24 gestures). A canvas resize
  or a new world resets the wait.
- **Occlusion.** Resolution goes first, features last. The existing JS-time hysteresis that drops
  interactive GTAO stays as it is (it answers a CPU-bound frame). In addition, GTAO drops on interactive
  frames only when the governor is at 0.5 and still over budget, and returns when the governor steps up.
- **The settled image is untouched.** Refinement still renders at the full refine resolution, so the
  picture a person looks at when the camera stops is exactly as sharp as today.
- **Walk mode.** Its refine profile renders at supersample 1 so that stopping costs no reallocation. With
  a governed scale below 1 that would reallocate on every stop, which is the freeze the profile exists to
  remove. So the walk profile's refine follows the governed scale.

Edits this needs in `createProgressiveRenderer.js` / `createPreviewViewport.js`: the accumulation filter
rule becomes "linear whenever the render size differs from the canvas, nearest when equal"; `setSize`
keeps the governed scale; `captureImage` forces scale 1 (a saved image never comes out at reduced
resolution); `getStats()` reports the governed scale.

**Keep:** on a machine that holds 60 fps the governor never engages and every frame is identical to
today's. `refineProfiles.test.js`, `refineSchedule.test.js`, `previewResolution.test.js` pass unchanged.
The wheel-burst quiet period, sample-zero-equals-interactive and the presize lead are untouched.

**Measure:** add gap percentiles (p50 / p95, fraction over 20 ms) and the governed scale to
`window.__previewPerf.snapshot()`. Unit-test the policy with synthetic gap traces: steady 60, steady 30,
a long task in the middle of a 60 fps run (must not step down), a 60 Hz and a 144 Hz display, walk mode.

### A2. Refine sample budget from the same signal

`renderSample` sizes the run as `REFINE_BUDGET_MS / lastFrameMs`, where `lastFrameMs` is submit time, so a
desktop GPU always gets the 128-sample cap however long each sample really takes. Feed the measured gap
between the first refine frames into that division (`max(lastFrameMs, gapMs)`), so the documented budget
is what is actually spent. On a GPU that keeps up, the count is unchanged.

**Keep:** `MIN_SAMPLES`, the style and profile caps, `budgetSample = 2` after a projection switch.

### A3. Composer memory

- **Plain write buffer.** `EffectComposer` clones its target, so the second target inherits 8× MSAA and
  GTAO's copy and multiply passes each write multisampled and resolve. Give the composer a non-MSAA
  half-float write buffer, set `gtaoPass.needsSwap = false`, and read the result from the write buffer
  when the pass is enabled and from the read buffer when it is not. The scene target
  (`getSceneRenderTarget()`) stays the MSAA read buffer, so program compilation is unaffected.
- **MSAA during refine.** The first refine sample is shown on its own, so it must not look worse than the
  interactive frame before it: keep roughly eight coverage samples per canvas pixel. Refine supersample
  ≥ 2 → 2× MSAA; between 1 and 2 → 4×; exactly 1 (browser build, walk profile) → 8× as today, with no
  reallocation. Change `samples` only at the gear shift, where the chain is reallocated anyway.
- **Pixel cap.** Cap the refine at 16 megapixels (`supersample = min(ss, sqrt(cap / canvasPixels))`). A
  2560×1440 window at its usual ratio is 14.7 MP and is unaffected; a 4K window stops asking for 33 MP.
- Add an estimated `vramMB` for the offscreen chain to `getStats()`.

**Keep:** tone mapping still applied once, in `OutputPass`; the transparent Shaded backdrop still
survives accumulation; AO on / off parity (toggle it and compare).

**Verify by pixels:** render a fixed scene before and after at interactive and at converged refine and
diff. The plain write buffer must be bit-identical or within 1/255; the MSAA rule may differ only on
silhouette pixels, and the converged image must not be measurably softer (use the edge-residual method in
`preview3d-realistic-renderer.md`).

### A4. The rebuild path during a plan drag

- `useMemo(buildPreviewScene)` regenerates every floor's descriptors on every project commit, and the
  scene cache then discards the untouched floors by `sourceKey`. Memoise each floor's (and each truss,
  ceiling and roof system's) descriptor on the identities of the inputs its `sourceKey` is made from, so
  an untouched floor returns the same descriptor object and the cache's equality checks short-circuit.
- Reuse the ground and grid when the bounds are unchanged instead of building new geometry each rebuild.
- Skip the selection-overlay rebuild when the selected descriptors are equal to the last build's.
- Optional, only if your measurement shows more than ~1 ms left: freeze matrices and apply outlines /
  interior lighting on rebuilt floors only, with a per-floor applied flag like `viewModeApplied`.

**Keep:** "a mesh is carried over if and only if its descriptor is equal" (tested), the frozen-matrices
contract (any post-build transform write updates its matrix), the light budgets applied after all floors.

**Measure:** time `buildPreviewScene` and `cache.build + setWorld` per rebuild under the `previewPerf`
gate during a fixture drag on a two-floor project; count descriptor objects regenerated per rebuild.

### A5. Resize

A splitter or sidebar drag fires the `ResizeObserver` every frame, and each callback reallocates the
whole MSAA chain. Coalesce: the canvas stretches by CSS while the size is changing, and one real resize
lands about 120 ms after the last callback (and immediately on the first, so opening a pane is not
delayed). **Visible change:** the picture is stretched for a few frames during a splitter drag instead
of re-rendering each frame.

### A6. Chrome over the canvas

- Remove `backdrop-filter` from the compass (`CompassOverlay.module.css`), the "Refining" chip
  (`ThreePreviewPanel.module.css`) and `PanePlaceholder.module.css`, and raise each background's alpha so
  it reads the same. A backdrop blur over a canvas that changes every frame is re-blurred every frame.
  **Visible change:** those three chips lose their frosted look.
- `emitCompassHeading` writes a CSS variable every frame; write it only when the heading changed.

### Not in this phase (see §10)

`scene.matrixWorldAutoUpdate = false`, the damping tail, front-side culling, the ground material, keeping
the preview mounted in focus mode, and the stale fixture shadow maps.

## 5. Phase B1: the 3D workshop viewport

Files: `src/features/sketchstudio/cad/CadViewport.jsx`, `placementLayer.js`, `marks.js`, `sketchPlane.js`,
`shopLayer.js`, `CadSketcher.jsx`, `viewMode.js`. Findings C1 … C11, F6.

What the audit found: the viewport renders on demand and costs nothing when idle, which is right. The
waste is in how many times it draws and rebuilds: one React commit triggers seven to nine full renders,
a translate drag draws twice per pointer move (the first one stale), every kernel snapshot rebuilds and
re-uploads every part, and a few pointer paths scan whole meshes on every move.

### B1.1 One render per commit

Add `ctx.requestRender()` (a dirty flag) and one trailing effect with no dependency array, declared after
the last effect, that flushes a single `render()` when the flag is set. Effects that today end in
`ctx.render()` call `requestRender()` instead. The flush runs in the same commit, so tests stay
synchronous under `act`.

- The gizmo effect's `detach()` / `attach()` each dispatch `change`, which renders; suppress the listener
  around them and request one render.
- A translate drag gets `change` then `objectChange` from `TransformControls`; render from `objectChange`
  only, after snapping and `moveGroups`.
- The placement layer's `redraw()` renders after the viewport's own camera-change render; give `render()`
  a `beforeRender` hook list so the layer draws its handles without a second render. `layoutGrip` moves
  to the same list.

**Keep:** direct `render()` for the rotate dial, gizmo drags and animation frames; `ctx.lastRenderMs`
still updates; `CadViewport.*.dom.test.jsx` (they read `frames.at(-1)` after a rerender, and one asserts
"every rendered frame at the dropped position").

**Measure:** `renderer.render` calls per commit for (a) a snapshot arriving with a part selected, (b) a
selection click, (c) one translate-drag move, (d) one orbit step in a placement view. Pin (a) and (c) in a
DOM test.

### B1.2 Snapshot upload without copies

`new THREE.Float32BufferAttribute(typedArray, 3)` copies its input; the kernel already transfers typed
arrays. Adopt them directly (`new THREE.BufferAttribute(array, 3)`) for positions, normals, indices and
edge lines when the input is a typed array, and keep the existing path for the plain arrays test fixtures
pass. Set each geometry's bounding box and sphere from `item.bounds` **after confirming** in `kernel.js`
that those bounds are in the same space as the vertices and are tight; if they are not, leave three to
compute them.

**Keep:** the `[Mesh, LineSegments]` child order, the mid-drag group replacement, the deferred disposal
of a dragged part's edge geometry, `CadViewport.dom.test.jsx:280-295`.

### B1.3 Snap-highlight material

`drawSnapHighlights` disposes and recreates a `LineBasicMaterial` on every drag step, which makes three
destroy and relink its program each time (the placement layer's own comment documents the same bug).
Keep one material per snap kind for the viewport's lifetime and dispose it on unmount. The line names
(`snap-flush`, `snap-aligned`, …) and `userData.snap` are read by tests.

### B1.4 Pointer scans once per frame

Measure-tool and placement hover run a full raycast plus an edge-segment scan on every pointer move.
Coalesce both to one per animation frame with the existing `hoverFrame` pattern, and in
`measureCandidates` reject a segment by its projected bounding box against the pointer ± snap radius
before the expensive calls.

**Keep:** a click resolves synchronously from the event's own position (never from a stale hover); the
snap rank order and depth rule (`RANK`, `DEPTH_EPS`); `CadViewport.measure.dom` / `.snap.dom` tests and
`scripts/verify-measure-marks.mjs` (if they dispatch a move and read the result at once, flush the
pending frame on read rather than changing the tests).

### B1.5 Face outline cache

`faceOutline` builds a vertex-to-triangle map over the whole mesh for each newly hovered face, and
`pickedFace` transforms every vertex. Cache the adjacency per geometry in a `WeakMap`, transform only the
face's own vertices, and give `shopTarget` the same per-face cache `planeTarget` already has. Output must
be identical (`sketchOnFace.test.js`, `CadViewport.planes.dom.test.jsx`).

### B1.6 Smaller items

- A viewport hidden by `display: none` (drawing focus) still renders on every effect. Skip the draw when
  the element has no size, keep the dirty flag, and flush from the `ResizeObserver` when it is back.
- The pose effect looks up each group's instance and part with `find` inside a loop over groups; build
  the two maps once per run.
- `placeHud` reads `offsetWidth` after an `innerHTML` write on every gizmo move; cache the size as the
  grip chip does. `rayAt` and `trackPointer` read the canvas rect per call; cache it from the
  `ResizeObserver` and invalidate on scroll / resize.
- Pass `powerPreference: 'high-performance'` to the renderer.
- Optional: the sketcher's pointer path (coalesce moves per frame, HUD through a ref instead of state)
  and the punch-line geometry reallocated per stroke frame. Only with the `CadSketcher` DOM tests green
  and a measurement that shows it matters.

## 6. Phase B2: the 3D workshop's React side and kernel pipeline

Files: `CadWorkspace.jsx`, `useCadModel.js`, `kernel.worker.js`, `model.js`, `sheetMetal.js` and its
callers, the panels under `cad/`. Findings D1 … D10. Runs after B1 is audited.

### B2.1 The worker's stale-build skip

`kernel.worker.js` means to skip a queued build when a newer one has arrived, but each message's queued
function runs before the next message event is delivered, so once the kernel is awake the check never
fires: K edits made during one build run K full builds, and the newest result arrives last. For `build`
requests only, yield one macrotask before the staleness check so pending messages can raise
`latestBuild`. Drawings, references, inspection and exports keep strict order.

**Keep:** edits supersede, never cancel; the 50 ms debounce; the main thread ignoring stale replies.
**Measure:** a builds-run counter in the worker; fire six edits during one build; before 6, after 2.
Add a test that drives the worker's handler with a fake `postMessage`.

### B2.2 Edits the kernel never sees

Adding a Measure mark, hiding or showing a part, and renaming an instance each rebuild every solid,
though the kernel reads none of them (main loop grepped the worker's import closure: `kernel.js` never
reads `model.marks`, `instance.visible` or `instance.name`). Add `marks` to `KERNEL_INERT_KEYS` and let
the instance comparison in `sameKernelInput` also allow `visible` and `name`.

**Before changing anything,** re-verify that grep yourself, including what the worker validates on the
payload (`model.js` validates marks: if the worker runs that validator, an invalid mark surfaced as a
build error before and must still surface somewhere). `sheets`, `connections` and part / sketch names
are **not** inert. Update `shopModel.test.js:126` (it pins the list) and add cases.

### B2.3 Derivations that run when nothing needs them

- The drawing preview (`layoutParts`, `sheetSvg`, `sheetFit`) is rebuilt on every workspace render once a
  sheet exists, even with the drawing pane closed. Memoise it on its real inputs and compute it only when
  the pane or the sheet panel is showing. Same for `sheetScales()`.
- `rows` (cut list, with a fold per sheet part), `shopRows` (mesh area over every mesh) and `markPoses`
  are computed on every model change but shown only in their panels. Compute them only when shown.
- `treeRows(model)` runs unmemoised on every render and is quadratic in instances; memoise it on the
  instance and group lists.
- `JsonEditor` keys stringify the model, sketch and instance on every render, one of them inside a closed
  `<details>`; derive the key lazily or from identity.

**Keep:** `CadWorkspace.drawings.dom` / `.pdf.dom` tests, `SheetEditor`'s `previewReady`, what
`SheetScaleControl` reads, the CSV export (it computes its own rows), `cadFilm().builds`.

### B2.4 `foldSheet`

It does polygon-clipping booleans and is called from about fifteen places, several of them per render on
the Shop tab, so one commit refolds each sheet part many times. Memoise it for calls without `angles`,
keyed on the identities of its inputs. **First** prove no caller mutates a fold result (grep every
caller; `brakeStation.js` already keys a `WeakMap` on fold identity, which suggests they do not). If any
caller mutates, skip this item.

**Measure:** `foldSheet` executions per commit on the kiosk example, Shop tab open.

### B2.5 Kernel timing probes only

Add `performance.now()` timing around build, mesh, edge mesh and transfer in the worker, reported in the
snapshot under a debug key the UI ignores. Tessellating once per part instead of once per instance is the
real win here and is deliberately **not** in this pass (§10): it needs these numbers first.

## 7. Phase C: Sketch Studio 2D drafting

Files: `src/features/sketchstudio/{components,hooks,store,utils,craftsman,joinery,styles}`,
`src/pages/SketchStudio.jsx`. Not `cad/`. Findings A1 … A10. The positional `sourceRefs` rule is
absolute: never filter or reorder the slots.

### C1. Snapping

`findIntersectionSnapPoint` tests every pair of segments on every pointer move and every wheel notch.
An intersection within tolerance of the cursor lies on two segments that are each within tolerance of the
cursor, so first keep only those segments, in their original order (the strict `<` tie-break then gives
the same answer). Cache the collected snap points and segments per entities-array identity. Drop the
snap from the wheel path, and from tools that only show the marker and never use the result.

**Keep:** the priority order (point, intersection, perpendicular, nearest, isometric grid),
`secondaryEntityId`, what `shouldSnapOverrideOrtho` reads. **Test:** a fuzz that runs the old function
(kept in the test file as the oracle) and the new one over random scenes and cursors and requires equal
results.

### C2. Rendering only what changed

- Split `EntityRenderer` into a memoised per-entity component (entity identity is already stable for
  unchanged entities), pass selection as a `Set`, and memoise the entity and dimension layers so a
  viewport or cursor change does not reconcile them at all.
- Cursor position goes through a ref channel written straight to the status bar and the precision HUD,
  the pattern `CanvasStatusBar` / `cursorChannelRef` uses in the planner. `SYNC_POINTER` is dispatched
  only when the hovered entity or the snap result changed.
- Make the callbacks `useSketchStudio` returns stable, and stop passing fresh JSX children to `TopBar`,
  so the existing `memo` on the panels works.

**Keep:** `hoverEntity.dom.test.jsx`, `DraftingCanvas.test.jsx`, the status bar's X / Y text, the HUD's
position, `EntityRenderer`'s reuse for ghosts and joinery previews.

### C3. Dirty detection

Every document change normalises the document twice and stringifies all of it, in render, and a drag
changes the document every frame. During a `transform` or `handle-drag` interaction the document is known
to differ from the saved one: report dirty without building the string, and compute the comparison once
when the interaction ends. Build the snapshot once per change, not twice. Viewport-only changes do not
restart the recovery write.

**Keep:** the string comparison is the final authority, so undoing back to the saved state reads clean;
the persistence machine's EDIT / CLEAN events (`docs/state-machines/sketch-2d.md`);
`useSketchPersistence.dom.test.jsx`.

### C4. Drag frames

The lightweight resolver still normalises layers, variables, joints and the whole 3D model on every drag
frame, though a 2D drag cannot change them: reuse them by identity when unchanged. `resolveJointGeometry`
clones every entity even with no joints: return early. Replace the per-entity `layers.find` and the
`selectedIds.includes` scans with a map and a set, and the spread `Math.min(...array)` with a loop.

**Keep:** the drag-end full resolve (`_needsFullResolution`), the resolver's single-entry undo cache.

### C5. Hover-tool previews and dimensions

Cache fillet / chamfer endpoint groups per (entities identity, tolerance) and trim / extend cut points
per (target, entities identity); add a bounding-box reject to the hit test; resolve dimension source
references through an id map built once per entities identity. Previews must still show exactly what the
click commits.

### C6. Smaller items

- Pan and wheel dispatch at most once per animation frame; cache the canvas rect; stop re-subscribing the
  wheel and window key listeners on every viewport or draft change (latest-handler ref).
- Craftsman derivations (BOM, nesting, wood movement) skip recomputation during a drag and catch up at
  its end.
- Selected entities each carry a `drop-shadow` filter and every entity a `transition`. Keep the glow for
  selections up to 50 entities and use the stroke-only highlight beyond that; limit the transition to
  hover. **Visible change:** a very large selection loses its glow.

The compositor-transform pan / zoom the planner canvas has is **not** ported in this pass (§10): with the
layers memoised a pan frame no longer reconciles entities, which removes most of its cost at far less
risk.

## 8. Phase D1: planner domain and store

Files: `src/domain/*`, `src/features/floorplan/store/floorplanReducer.js`, `src/persistence/useAutosave.js`,
`src/features/floorplan/hooks/useFloorplan.js`. Findings E1, E2, E7.

### D1.1 Derivations repeated within one edit

One settled edit runs the same whole-project derivations many times because only the outer pass is
memoised: `deriveGeometry` (scenario-independent, re-run for every takeoff call, about six plus two per
scenario), `deriveProfessionalHandoff` (stringifies and hashes every entity, four call sites),
`deriveCostRealization`, `deriveDocumentationRealization`, `deriveFeasibilityEconomics`. Give each a
`WeakMap` memo keyed on the project object for calls without options (the pattern `validationCache` in
`buildingGraph.js` already uses), with an inner map per scenario where one applies, and cache the
per-entity fingerprint in `record()` on the entity object.

**First** prove no consumer mutates a result (grep each call site). Calls that pass options or
`skipValidation` stay uncached. **Test:** call counts per edit, and deep equality of the memoised result
against a fresh computation on the test fixtures.

### D1.2 `syncCanonicalBuilding` keeps identity

It returns a brand-new `building` with every sub-slice rebuilt on every edit and every drag frame, which
defeats each identity-keyed memo downstream (the plan overlays, the signature memo, the lifecycle panel's
seed keys). After computing the next building, reuse each sub-slice of the input that is deep-equal to
the recomputed one (the roof and truss syncs have a `reuseIfEqual` helper), and return the input
`building` when every slice was reused.

Also: `commandSuccess` syncs and the reducer then syncs again: drop one only if you can show the second
is a no-op on the first's output. `deriveAreaLedger` runs per frame on the command path: skip it while
validation is deferred, if the ledger is recomputed at gesture end.

**Keep:** serialisation byte-identical (same keys, same order: a save must not look like an edit); the
history comment in `projectStateHelpers.js` (never mutate a project in place).
**Check and report:** whether the lifecycle panel's stage forms were remounting on every edit before this
change (count mounts during a fixture drag before and after). If they were, this fixes lost focus and
draft state too, and the seed keys now change only when their slice really changes; confirm forms still
reseed on undo and on load.

### D1.3 Autosave

The draft prune runs in the same task as the save. Move the prune to idle time. Leave the save itself
alone (order and `MARK_SAVED` version semantics).

## 9. Phase D2: planner canvas, panels, sheets, wall editor

Files: `src/features/floorplan/components/**` except `preview/`, `src/sheets/*`. Findings E3 … E6, E8, F5.
Runs after D1 is audited.

### D2.1 Per-item renderers

`WallRenderer` re-derives every wall (openings filter, assembly layers, stud layout, all polygons)
whenever any wall, column, door or window changes. Group openings by wall once per doors / windows
arrays, keep each wall's opening array identity when its openings did not change, memoise the framing
layout on (wall, openings), and render each wall through a memoised item component. Do the same per-item
memo for the fixture, column, door, room and stair renderers.

**Keep:** identical DOM (`data-*` attributes, order, keys); presentation mode's union path.

### D2.2 Panels during a drag

- The Sidebar's heavy children that do not need the live drag (the lifecycle panel, the three study
  panels) take `useDeferredValue(project)`. The documented contract already lets panels lag a drag.
  They must tolerate a selected id whose entity is missing from the lagging project, as after a delete.
- `filterProjectByPhase` runs three times per frame on the 2D side: use `selectors.filteredProject`, and
  make the filter return the input arrays when a floor has nothing filtered out.
- `useFloorOverhangs` is keyed on the whole floors array; key it on the slab arrays.

### D2.3 Sheets

`SheetRenderer` builds the sheet scene inside render, twice (the visible sheet and the hidden PDF export
root), on top of the canvas's own memoised build; panning dispatches per pointer move. Build the scene
once and pass it down, memoise `SheetRenderer`, memoise `deriveConceptualLoadPath` per project, coalesce
pan moves per animation frame, cache the container rect, and stop re-subscribing the wheel listener.

**Keep:** `data-sheet-export-root` and PDF export output; viewport move / resize / rotate drags on the
gesture protocol; `SheetCanvas.dom.test.jsx`.

### D2.4 Wall detail editor

Mirror what the ceiling editor already does: commits defer coordination (`useDeferredCoordination`), the
static plan layers move into a memoised component like `CeilingPlanLayers`, the pan is coalesced per
frame, and the canvas rect is pinned while a button is held (**only** while held: pinning it otherwise is
what forged edits in the ceiling editor's history). Memoise the per-render derivations.
**Visible change:** Design Engineer numbers lag a wall-detail edit by the same ~1.5 s they already lag a
ceiling edit.

### D2.5 Optional

Hold the main-thread study input (instant sun, analytic daylight) while a drag is mutating; debounce the
sheet's 3D preview image so it never renders during a drag.

## 10. Deferred, with reasons

Raised with the owner at the end rather than done unasked.

- **Kernel: tessellate once per part, not once per instance** (D8). The largest remaining win for models
  with many identical fasteners, and the riskiest: optimistic placement and marks depend on world-space
  meshes. Needs B2.5's numbers first.
- **Dynamic resolution in the workshop viewport** (C6). That renderer has no post-processing, shadows or
  environment; nothing suggests it is pixel-bound, and its cost scales with parts, not pixels.
- **Compositor pan / zoom for the drafting canvas and SheetCanvas** (A4, E5). The planner needed a rewrite
  to get this right; memoised layers remove most of the cost first.
- **`scene.matrixWorldAutoUpdate = false`** in the preview (B6): about a millisecond of CPU per frame for
  a class of bug (a stale matrix) that shows up anywhere.
- **Orbit damping tail** (B7): changes how the camera feels.
- **Front-side culling, ground shadow-catcher, procedural-detail early-out** (B8, C9): inferred fill-rate
  wins that change pixels; need a GPU profile on the owner's machine.
- **Keeping the preview mounted in focus mode** (B5b): removes the recompile on return, holds GPU memory
  while hidden.
- **Per-fixture drop shadows on the plan** (E8): a visual choice.
- **Not a performance item:** fixture shadow maps never refresh after a wall moves (B9). A correctness bug
  found on the way.
- **Windows GPU preference.** The Electron shell already asks for the discrete GPU; the only guaranteed
  mechanism is the per-app graphics setting in Windows, which is the owner's to set.

## 12. Outcome (2026-11-22, built by Opus 5.5, audited by the main loop, uncommitted)

Gate after all six phases: vitest 676 files passed / 1 skipped, 7996 tests passed / 1 skipped (baseline
639 / 7793); eslint 0 errors / 39 warnings (baseline 40); `npm run build` clean. Per-phase numbers and
probe scripts: `artifacts/perf-pass-3/phase-*.md`.

What shipped differently from the sections above:

- **A3:** the refine MSAA rule is 4× at a refine of 2× or more and 8× elsewhere. The spec's 2× / 4× rule
  measured the first refine sample worse than the interactive frame before it.
- **A1:** two guards the spec did not have, both of which only make the governor engage less: a display
  (or browser cap) slower than 60 Hz moves the budget to its own interval, and a frame bound by
  main-thread submission gets no verdict. The windowed mean sets aside its slowest tenth.
- **A4:** ground / grid reuse skipped (0.06 ms per rebuild, and a reused grid keeps its old draw-order id).
- **B1.2:** bounds are not taken from `item.bounds` (OpenCascade's box is enlarged by tolerance, not tight).
- **B1.4:** pointer scans are prefiltered, not rAF-coalesced: Chrome already delivers one pointer move per
  frame. Same reasoning skipped C6's pan / wheel coalescing.
- **B1.6:** `placeHud` size cache and the canvas-rect cache skipped (under 0.2 ms per move, stale-rect risk).
- **C3:** a drag from a clean document computes dirty exactly (a zero-length drag must stay "saved");
  only a drag from an already dirty document uses the shortcut. Viewport-only recovery writes unchanged.
- **C4:** `resolveJointGeometry`'s early return skipped (its clones gain `meta: {}`, so not identical).
- **D1.2:** uses a new order-aware `reuseUnchanged`, not `reuseIfEqual`: without the key-order check saved
  bytes changed. `deriveAreaLedger` left alone (0.006 ms). This item also stopped every Design Engineer
  stage form remounting on every commit (56 remounts per 60-move drag, typed drafts lost).
- **D2.2:** the phase filter's "return the input arrays" half and the wall-detail cache keys need
  `src/domain` and were not done. **D2.5** skipped.

Found on the way and not fixed (none is a performance item):

- Fixture shadow maps never refresh after a wall moves (`buildPreviewObjects.js`).
- The truss sync is not idempotent on a freshly loaded project (`endClosures.colour.solarAbsorptance`
  null → 0 on the second pass): one extra roof rebuild after a load, possibly a different save.
- Joint normalisation is not idempotent (`joinery/jointDefaults.js:232-237`, `clearanceMm` null → 0).
- The preview scene cache's `sourceKey` has no input for other floors' elevations, which stair contexts
  read (the new descriptor memo adds them to its own key).
- `useSketchViewport`'s `ResizeObserver` binds only at mount (suspected: a studio opened in the 3D
  workspace never observes the 2D canvas mounted later).
- Three verify scripts fail identically on old and new code: `verify-engineering-drawings.mjs`,
  `verify-assemble-and-draw.mjs`, `verify-shop-floor-sf4.mjs`.

Not verified anywhere: a real slow GPU, the Electron build, a production-build timing. The governor was
exercised with unit traces and a simulated GPU-bound frame rate in headless Chrome.

## 11. Order

Two builders at a time, on areas whose tests do not import each other, with the full gate between waves:

1. Phase A ‖ Phase B1
2. Phase B2 ‖ Phase D1
3. Phase C ‖ Phase D2
