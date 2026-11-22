# Perf pass 3 — auditor findings (working notes, 2026-11-22)

Baseline before any change: vitest 639 files passed / 1 skipped, 7793 tests passed / 1 skipped
(182 s); eslint 0 errors / 40 warnings. Logs: baseline-vitest.log, baseline-lint.log.

Status key: [V] = main loop re-read the cited lines and the claim holds; [ ] = not yet re-verified.

## A. Sketch Studio 2D drafting (auditor report 1)

Architecture: one `useReducer` in `hooks/useSketchStudio.js:61`; `pages/SketchStudio.jsx` spreads the
whole return into `SketchStudioLayout`. Pointer/cursor/hover/snap/draft/viewport all in that one state.
`React.memo` only on TopBar, RightPanel, StatusBar, CraftsmanSidebar, SelectionActions (first four
defeated per frame). Undo history = reference snapshots, cap 100 (`utils/historyUtils.js:23`) — fine, keep.

- A1 [V] Snap pair loop: `utils/snapUtils.js:467-505` `findIntersectionSnapPoint` is S²/2 per pointer
  move AND per wheel notch (`hooks/useSketchViewport.js:94-133`); `snapWorldPoint` (:593) rebuilds
  point + segment lists each call (:606-607). Arcs flatten to 24 segments (`arcUtils.js:3`).
  Fix: cull segments to those within tolerance of the cursor BEFORE the pair loop (an intersection within
  tolerance of the cursor lies on both segments), keep original relative order so the strict `<`
  tie-break is identical; WeakMap-cache collected points/segments per entities identity; skip snap for
  trim/extend/chamfer if unused. Guards: `snapUtils.test.js`, `orthoSnapOverride.dom.test.jsx`;
  priority point > intersection > perpendicular > nearest > iso grid; `secondaryEntityId`;
  `shouldSnapOverrideOrtho` reads `snap.snapType`.
- A2 [V partly: EntityRenderer :247-290 unmemoised, `selectedIds.includes` per entity] Every pointer move
  re-renders every entity. `store/sketchStudioReducer.js:331` SYNC_POINTER writes cursorScreen/World
  per move (read only by StatusBar + PrecisionHud: `DraftingCanvas.jsx:377`, `SketchStudioLayout.jsx:357`).
  `useSketchStudio.js:241-245, 290-296, 304` fresh arrow fns defeat RightPanel/CraftsmanSidebar memo;
  `SketchStudioLayout.jsx:232-246` JSX children defeat TopBar memo; ExportBar unmemoised.
  Fix: `EntityShape = memo(...)` (entity identity already stable for unchanged entities), selectedIds as
  Set, cursor via ref channel like planner (`CanvasStatusBar.jsx` `cursorChannelRef`, `SvgCanvas.jsx:57-71,
484-485`), skip SYNC_POINTER when hover id + snap unchanged, useCallback the hook's callbacks.
  Guards: `hoverEntity.dom.test.jsx`, `DraftingCanvas.test.jsx`, StatusBar X/Y text tests, PrecisionHud
  position; EntityRenderer reused for ghosts/joinery previews via `baseClassName`/`onEntityClick`.
- A3 [V] Persistence: `hooks/useSketchPersistence.js:41-85` — per `state.document` change:
  `buildSketchWorkspaceSnapshot` (normalize) + `serializeComparableSketchWorkspace` (normalize again +
  JSON.stringify whole doc incl. 3D `model`), in render. Runs per drag frame because
  `sketchStudioReducer.js:505-524` replaces the document per frame (`resolveSketchDocumentLightweight`,
  `_needsFullResolution`). Recovery save :125-137 = 400 ms debounce, deps include viewport (pan/zoom
  rewrites localStorage). Fix: during transform/handle-drag report dirty without stringifying; defer the
  string compare (final authority; undo-to-saved must read clean); build snapshot once.
  Guards: `docs/state-machines/sketch-2d.md` sketch-persistence machine (EDIT/CLEAN),
  `useSketchPersistence.dom.test.jsx`.
- A4 [V wheel path] Pan/zoom dispatch per event: pan `useSketchPointer.js:159-174` UPDATE_PAN; wheel
  `useSketchViewport.js:123-133` (setViewport + resolvePointerState → snap per notch); grid rebuilt per
  viewport change `DraftingCanvas.jsx:134-140`; `readCanvasPoint` getBoundingClientRect per event (:26).
  Wheel listener re-registered per viewport change (:155-171). Strokes already non-scaling-stroke.
  Fix: copy planner gesture model (`floorplan/components/renderers/canvasGestures.js`: panViewport,
  zoomViewportAbout, gestureTransform; pending absolute view in a ref, CSS transform, one absolute commit
  on release / 90 ms after last notch). Guards: `store/interactionEnd.js` INTERACTION_END,
  `suppressNextClick`, Space-pan `isSpacePanActiveRef`, `interactionEnd.dom.test.jsx`.
- A5 [ ] Drag frames normalise the whole document incl. 3D model: `utils/sketchDocumentResolver.js:38`
  → `normalizeSketchDocument` (`utils/sketchDocumentUtils.js:99-151`) → `cad/model.js:190,377,564,671,689`
  chain per frame; on commit `joinery/jointGeometryUtils.js:632` clones every entity even with 0 joints;
  `useSketchStudio.js:67-68` + `layerUtils.js:25-31` `layers.find` per entity; `useSketchSelection.js:12-15`
  O(N·S); `transformUtils.js:482-487` `Math.min(...array)`.
- A6 [ ] Hover-tool previews: trim `useSketchPointer.js:331-344` → `trimUtils.js:459-488`; extend
  :346-358; fillet/chamfer :301-327 → `filletUtils.js:195`, `findLineLineCorner` :27-62 E²/2 per move;
  `hitTest.js:308-318` linear, no bbox reject. Fix: cache endpoint groups per (entities identity,
  tolerance); cache cut points per (target id, entities identity); bbox reject.
- A7 [ ] Dimensions: `DimensionRenderer.jsx:4-11, 99-104`, `entityUtils.js:922-929`, `hitTest.js:121`
  O(D·R·N). Fix: id→entity Map per entities identity. NEVER filter sourceRefs slots.
- A8 [ ] CSS: `styles/sketchstudio.css:770-774` drop-shadow per selected entity, :872-877 per joinery
  entity, transition on every entity :744-751; snap marker :972.
- A9 [ ] Craftsman derivations keyed on `document.entities` recompute per drag frame:
  `SketchStudioLayout.jsx:115-119`, `craftsman/hooks/useSketchBOM.js`, `NestingPanel.jsx:447-463`,
  `WoodMovementNotices.jsx:16`. Fix: skip while transform/handle-drag or useDeferredValue.
- A10 [ ] `useSketchKeyboard.js:379-409` re-registers 3 window listeners per draft/document change.
- Fine: undo history; group index reuse; select tool does no snap work; gap healing uses a spatial grid.

## F. Shell / Electron / build (auditor report 6)

- F1 [V flags at electron/main.cjs:31-34] GPU switches already present (ignore-gpu-blocklist,
  enable-gpu-rasterization, enable-zero-copy, force_high_performance_gpu). Nothing GUARANTEES the dGPU;
  the certain mechanism is the Windows per-app graphics preference
  (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, value name = full exe path, data
  `GpuPreference=2;`). Daily exe = `node_modules\electron\dist\electron.exe` (update-app.cmd). The
  installer in `release/` (Aug 15) predates the switches. Proposal: GPU diagnostic under an env var
  (UNMASKED_RENDERER_WEBGL, app.getGPUFeatureStatus()); registry step is the USER's call (system setting).
  No vsync / frame-limit flags.
- F2 [V] backdrop-filter over the live WebGL canvas: `CompassOverlay.module.css:9` (8px, always on, needle
  rewritten from the render loop `ThreePreviewPanel.jsx:488`), `ThreePreviewPanel.module.css:432`
  ("Refining" chip 6px, with a spinning Spinner `ThreePreviewPanel.jsx:997`), `PanePlaceholder.module.css:132`.
  Also `SvgCanvas.module.css:304`, `PropertiesPanel.module.css:26,67`, `Sidebar.module.css:168` (check
  what sits behind each). Fix: drop the blur, raise background alpha.
- F3 = A3 (sketch persistence).
- F4 [ ] Floorplan autosave one main-thread task: `useAutosave.js:12-22` → `localStorageBackend.js:50-70`
  (stringify + setItem + index), `onSaved` runs `pruneDraftsQuietly` (`useFloorplan.js:137`) in the same
  task. 5 s debounce. Fix: prune via requestIdleCallback.
- F5 [ ] Sheet 3D preview image rendered synchronously: `SheetViewportContent.jsx:78` →
  `renderToImage.js:27-171` (new WebGL context, createEnvironment, 1600×1000 realistic, toDataURL,
  sync forceContextLoss :169) per edit-stamped project.
- F6 [ ] CAD renderer `CadViewport.jsx:406` `new THREE.WebGLRenderer({ antialias: true })` — no
  powerPreference; teardown `renderer.dispose()` :3015 without context release (preview uses
  `releaseContextWhenIdle`).
- F7 = A8. F8 minor: Modal/ShortcutOverlay full-viewport blur while open; save-dot WAAPI infinite while
  dirty (`Toolbar.jsx:110`); `HomePage.jsx:27` idle-imports the 1.86 MB Floorplan chunk; no
  `spellcheck: false`.
- Renderer table: preview `createPreviewViewport.js:337` antialias false (MSAA on composer targets),
  alpha true, powerPreference high-performance, pixel ratio min(dpr,2), shadow 4096 desktop (:79);
  CAD `CadViewport.jsx:406` antialias true, min(dpr,2); export `renderToImage.js:46` antialias true,
  preserveDrawingBuffer, ratio 1.
- Workers fine (transferables; kernel idle release 30 s). Routes all lazy. No hot-path console logging.

## C. CAD workshop viewport — `src/features/sketchstudio/cad/CadViewport.jsx` (auditor report 3)

Facts: loop is ON-DEMAND (no render rAF; OrbitControls damping off :433); `render()` :738 runs on controls
'change' (:764) + explicit `ctx.render()` (30 call sites in the file). Idle = zero cost. Renderer :406
`antialias:true`, pixel ratio min(DPR,2) :412, NO shadows / post / environment / tone mapping. Hemisphere +
one directional light, MeshStandardMaterial bodies. Edges tessellated in the worker (`meshEdges`
kernel.js:1092). Materials shared via `createMaterialCache` (viewMode.js:150-192). 2 draw calls per visible
part (body + edges); hardware = ordinary instances with unique world-space geometry, no instancing.
X-ray/selection/isolate = cached material swaps. Setup effect deps `[]` (:3028). `lastRenderMs`,
`element.cadViewMode()`, `renderer.info.programs` exist for measurement.

- C1 [V: hole :3077, snapshot :3121, pose :3203 each call ctx.render()] 7–9 synchronous
  `renderer.render` per React commit (snapshot arrival with a selection): hole :3077, snapshot :3121,
  pose :3203, records :3314, marks :3338, clearPlaneHover :3348 (via :1485), gizmo effect :3394-3464
  (3 on its own: `transform.detach()` :3404 and `attach` :3443 each dispatch 'change' → render listener
  :1284, plus `ctx.render()` :3450). Translate drag: TransformControls fires `change` then `objectChange`
  → 2 renders per pointermove, the first one stale (before snap + moveGroups). Orbit with placement
  handles: placementLayer.js:1292-1294 `redraw()` → `ctx.render()` (:332) after the viewport's own → 2/step.
  Fix: `ctx.requestRender()` dirty flag + ONE trailing deps-less `useEffect` declared after the last effect
  that flushes once (same commit → DOM tests stay synchronous under act); `ctx.beforeRender` hooks so
  placement redraw / layoutGrip draw without rendering; translate drag renders only from `objectChange`;
  dial and drag moves keep direct render. Guards: `CadViewport.dom.test.jsx:21-33, :201` record
  `frames.at(-1)`; `lastRenderMs` must keep updating.
- C2 [V :3087-3120] Every snapshot disposes and rebuilds ALL part geometry; `Float32BufferAttribute(typed)`
  / `Uint32BufferAttribute` COPY their input; bounds recomputed lazily O(V) though `item.bounds` (world
  box) is already shipped. Fix: adopt typed arrays (`new THREE.BufferAttribute(arr, 3)`), set
  boundingBox/Sphere from `item.bounds` (CHECK: bounds are world-space vs geometry space — verify before
  using), reuse an instance's group/geometry when buffers unchanged (needs a per-instance version/hash from
  the kernel side). Keep positional `[Mesh, LineSegments]` child order, mid-drag replacement :3185-3199,
  deferred disposal :3086-3091. Guards: `CadViewport.dom.test.jsx:280-295` (`index.isBufferAttribute`,
  count), X-ray test pins material disposal.
- C3 [ ] Unthrottled pointer scans: `measureMove` :1024 → `measureAt` :901 (full intersectObjects) +
  `measureCandidates` (marks.js:295-318, every edge segment of near parts, ~5 project() each) +
  `refreshMeasure` (clearLayer dispose + rebuild + innerHTML + render) per pointermove; placement hover
  `placementLayer.move` :1114 → updateHover/hoverAt :593/candidateAt :496 same scan. Plane/shop/outline/
  grip hovers already rAF-throttled (`hoverFrame` pattern :1543). Fix: rAF-coalesce; prefilter segments by
  a pointer ±8 px box. Guards: CadViewport.measure.dom / .snap.dom, verify-measure-marks.mjs expect a
  synchronous snap result after a move — keep sync path for click; keep `RANK`, `DEPTH_EPS` order.
- C4 [ ] `pickedFace` :3919 copies every vertex to world space; `faceOutline` (sketchPlane.js:215-231)
  builds vertex→triangles Map over all triangles per newly hovered face; `shopTarget` → `faceTarget` →
  `pickedFace` (:1757-1783) uncached → O(mesh) per hover frame in paint/print face pick. Fix: per-geometry
  adjacency WeakMap; face-only world transform; `hoverFace` triangle-set cache in shopTarget.
  Guards: sketchOnFace.test.js, CadViewport.planes.dom.test.
- C5 [V :3963-3994] `drawSnapHighlights` disposes + recreates a LineBasicMaterial per objectChange while
  snapping → sole user of its program → relink per move (same bug placementLayer.js:76-90 documents).
  Fix: cached material per SNAP_COLORS kind owned by the viewport (dispose on unmount). Names
  `snap-flush`/`snap-aligned` read by CadViewport.snap.dom.test.
- C6 [ ] No pixel budget / dynamic resolution. Governor design: measure interval between successive renders
  during a gesture (lastRenderMs is CPU submit only); EMA > ~20 ms → step ratio ×0.85 (floor 1 or 0.75) via
  `renderer.setPixelRatio`; gesture end + ~150 ms → restore full ratio + render once. Caveats: MSAA fixed at
  context creation; `viewKey()` includes `domElement.width` → would fire view watchers per step (use
  clientWidth); DOM test mocks lack `getPixelRatio`/`info` → guard with typeof.
- C7 [ ] Sketcher pointer path: `CadSketcher` :443-447 per move = locate (2 planePoint, each new Raycaster +
  rect read) + dispatch + `setHud` setState; overlay effect :689-730 has NO deps → full
  `drawSketchOverlay` per render; null-keyed pieces ('box','preview','dimensions','cursor' :4321-4448)
  rebuild geometry + materials per call; then full render.
- C8 [ ] Hidden viewport still renders: cad.css:573-575 `display:none` leaves CadViewport mounted;
  `resize()` skips zero size (:1406) but `render()` has no visibility guard.
- C9 [ ] viewMode.js:188 DoubleSide on every opaque body (small, scene-dependent; winding risk) — LOW, skip
  unless measured.
- C10 [ ] Brake/shop: per stroke frame `poseStation` (shopLayer.js:679) reallocates the punch-line
  BufferGeometry (:504-505); documented frame work 1.4 ms mean (docs/sketch-studio-round-bend.md:414) → low.
  First press-brake open adds two lights → relinks every lit program (~50 ms, docs/sketch-studio-shop-
  floor.md:866-872); `prepareStation` only called from the film path (:3247). `solid()` (shopLayer.js:
  332-344) EdgesGeometry per tooling prism; horn punches drawn as 1 mm slices (`HORN_DRAWN_SLICE`
  brakeCollisions.js:413) = dozens of meshes. Finger/slide drags patch the session once per frame
  (:2324-2337, :2458-2471) → CadWorkspace re-render per frame.
- C11 [ ] `placeHud` :796 reads offsetWidth after innerHTML each gizmo move; `rayAt` :1424 new Raycaster +
  rect read per call; pose effect :3123-3216 does `model.instances.find` per group (O(N²)) and recomputes
  `pendingDelta` on every selection/mode change.
- Missing: no `webglcontextlost` handler (preview has one, createPreviewViewport.js:1223); no
  `powerPreference`.
- Fine: idle cost zero; edge raycast disabled :3110; plane/shop/outline/grip hover rAF-throttled; rotate
  dial in-place; placement overlay materials cached; unmount cleanup symmetrical.
- Verify scripts: verify-sketch-xray.mjs, verify-measure-marks.mjs, verify-round-bend-rb1.mjs,
  verify-shop-floor-sf5.mjs, verify-brake-hands-on.mjs.

## E. Planner 2D: store, canvas, panels, derived models (auditor report 5)

Regression check: `useEditor()` still one consumer (SvgCanvas.jsx:97); `useToolState()` two cheap leaves
(PropertiesPanel.jsx:119 LiveWallDrawingInput, FloorplanWorkspace.jsx:89 FocusEscapeGuard); `useViewport()`
only SheetCanvas. Gesture protocol / cursor channel / cached rect / compositor pan-zoom / WeakMap derived
cache on undo-redo all intact. Hover with select tool dispatches nothing (selectHandler.js:402-422).

- E1 [V call sites: deriveGeometry quantityTakeoff.js:275 called from deriveQuantityTakeoff :548 uncached;
  deriveProfessionalHandoff 4 call sites uncached] Settled edit repeats whole-project derivations:
  `floorplanReducer.js:146-185` computeDerivedModels (memo per whole project only) + call :2157.
  `deriveGeometry(project)` is scenario-independent but re-run per `deriveQuantityTakeoff` call (reducer,
  documentPackage.js:639/:865, feasibilityEconomics.js:27 ×~9 call sites + once per scenario :136,
  costRealization.js:63-66 per scenario) ≈ 6 + 2×scenarios times per edit. `professionalHandoff.js:96-107,
221-258, 287-317` `deriveRevisionEntityRecords` JSON.stringify + FNV per entity, 4 call sites (reducer
  :173, :317 validateProfessionalHandoff, documentPackage.js:712, documentationRealization.js:268).
  deriveCostRealization 8 call sites, deriveDocumentationRealization 5.
  Fix: WeakMap memo keyed on the project object for no-options calls (pattern: `validationCache` in
  buildingGraph.js:231): deriveGeometry, deriveProfessionalHandoff, WeakMap<entity,fingerprint> in
  `record()`, deriveDocumentationRealization / deriveCostRealization / deriveFeasibilityEconomics(project,
  scenarioId) (inner Map per scenario). Calls with options / skipValidation
  (documentationRealization.js:198,319) stay uncached. MUST CHECK: no consumer mutates the results.
- E2 [V: buildingModels.js:201-357 always returns a fresh `building` with every sub-slice re-created;
  projectStateHelpers.js:12-17 runs four syncs per applyProjectUpdate] `syncProjectStructures` per edit AND
  per drag frame with no identity reuse for `building` → defeats identity memos (StructuralGridOverlay,
  WetCoreOverlay, ApartmentDesignOverlay, SitePlanOverlay in FloorScene.jsx; signature memo;
  ProjectLifecyclePanel seedKey :5987-6016 — INFERRED: stage forms may REMOUNT per edit / drag frame —
  verify by counting SystemsStage mounts during a fixture drag). `commandSuccess`
  (buildingCommands.js:217-218) syncs, then the reducer syncs again; `deriveAreaLedger` every frame (:243).
  wallFit.js:643-663 `settledFloors` memo keyed on floor identity → any edit on a floor re-runs `applyFit`
  for every wall on it (when a beam pool exists). trussModels.js:851-885 / roofModels.js:751-770
  re-normalise + deep-compare every edit.
  Fix: structural sharing in syncCanonicalBuilding — reuse each sub-slice of `project.building` when the
  recomputed one is deep-equal (existing `reuseIfEqual` helper in roof/truss models), return the input
  `building` when nothing changed. Serialization must stay byte-identical (key order unchanged). Drop the
  redundant sync in commandSuccess only if provably redundant. Skip deriveAreaLedger while deferValidation.
  wallFit memo per wall on (wall, pool, floor.columns, elevation fields).
- E3 [V WallRenderer.jsx:165-185] WallRenderer re-derives every wall (doors.filter + windows.filter per
  wall, deriveWallAssemblyLayers, deriveWallFramingLayout (wallAssemblies.js:541, uncached), all stud
  polygons) on any change to walls/columns/doors/windows. Fix: `WallItem = memo` per wall with per-wall
  openings array of stable identity (group openings by wallId once per doors/windows arrays via WeakMap);
  WeakMap memo for framing layout; same per-item memo for Fixture/Column/Door/Room/Stair renderers.
  DOM must stay identical (data-\* hooks).
- E4 [ ] Panels per project-mutating drag frame (column, fixture, door, window, railing, shafts, risers,
  panel zones, roof/truss handles; wall handle drags are preview-then-commit): Toolbar.jsx:151, Sidebar,
  PropertiesPanel, ProjectLifecyclePanel all run. Sidebar.jsx:440-492 passes `project` to SunStudyPanel /
  DaylightPanel / SolarAccessPanel (unmemoised) + lifecycle panel. `useFloorOverhangs(project.floors)`
  called twice (PropertiesPanel.jsx:187, SvgCanvas.jsx:152), keyed on the whole floors array though only
  slabs matter. `filterProjectByPhase` runs 3× (useFloorplan.js:420, SvgCanvas.jsx:166,
  PropertiesPanel.jsx:161) — `selectors.filteredProject` exists; with an active phase filter it filters
  ALL floors and makes new arrays per frame (phaseFilter.js:80-104). Column/beam labels O(n²).
  Fix order: (1) E2; (2) Sidebar gives heavy children `useDeferredValue(project)`; (3) share
  selectors.filteredProject, per-floor reuse of unchanged arrays in the phase filter; (4) key
  useFloorOverhangs on slab arrays.
- E5 [V: SheetRenderer.jsx:99-100 unmemoised and calls buildSheetScene in render; SheetCanvas.jsx:33 memo]
  SheetCanvas: delta `PAN` per pointermove (SheetCanvas.jsx:230, no rAF); buildSheetScene ×3 per render
  (canvas memo + visible SheetRenderer + hidden PDF export root SheetRenderer ~:404, queried by
  sheetExport.js:175 via `data-sheet-export-root`); SheetViewportContent.jsx:140
  `deriveConceptualLoadPath(source.project)` in render per structural-plan viewport ×2; section/elevation
  scene caches keyed on the project object miss when a viewport phase mode ≠ 'all' (filterProjectByPhase
  returns a new object each call); wheel listener re-subscribed per viewport change (~:365); live
  getBoundingClientRect (:37, :353). Fix: reuse canvasGestures.js (pending/inFlight/committed refs, CSS
  transform, absolute SET_VIEWPORT commit), cache rect, memo SheetRenderer + pass `scene` in.
  Guards: SheetCanvas.dom.test.jsx, PDF export, viewport move/resize/rotate drags on BEGIN/END_DRAG_GESTURE.
- E6 [ ] Wall detail editor: commits are plain WALL_UPDATE (WallDetailEditor.jsx:1155-1176) with no
  `coordination: 'defer'` (ceiling editor defers: useDeferredCoordination.js, CeilingDetailEditor.jsx:
  933-945); cache keys `(wall, floor)` (wallDetailing.js:547-564) → any edit on the floor invalidates all
  walls' detail; WallDetailEditorBody ~4,900 lines unmemoised derivations (deriveWallAssemblyLayers ×2,
  fastenerGuideLayouts, sidingCoursePathData, screwMeasurementTargets); pan setViewport per pointermove
  (:1820-1830), static layers not memoised (only WallLivePreview :174); live getBoundingClientRect
  (:1728, 1741, 1771). Fix: mirror the ceiling editor (defer coordination, memo'd WallPlanLayers like
  CeilingPlanLayers, rAF pan, pin rect while a button is held — ONLY for held drags).
- E7 = F4 autosave (5 s debounce, sync stringify + localStorage).
- E8 [ ] Per-fixture `filter="url(#fixture-shadow)"` (FixtureRenderer.jsx:~447, FixtureDefs.jsx:34,:85) —
  visual change, owner's call. Main-thread analysis (sun instant, analytic daylight, instant shadow) re-runs
  per project change incl. drag frames (DaylightStudyContext.jsx:55-60) → hold study input while
  `dragGestureMutating`. History × derived WeakMap memory (inferred).

## D. CAD workspace React + kernel pipeline (auditor report 4)

- D1 [V kernel.worker.js:9-15; reasoning checked: each message's chained fn runs as a microtask right after
  its own onmessage, before the next queued message event is dispatched, and `createKernelSession` is
  synchronous → `data.revision < latestBuild` can only be true while awaiting WASM init] The worker's
  stale-build skip never fires once the kernel is awake: K edits during one build of length B run K full
  builds + tessellations; the newest snapshot lands after the backlog. (useCadModel.js:89-108: edits
  `supersede()` and post a new build after a 50 ms debounce; main thread ignores stale replies
  workerClient.js:23-27.) Triggers: held spinner/arrow, held undo/redo, repeated rotate keys.
  Fix: for `build` only, yield one macrotask (MessageChannel self-post or setTimeout 0) before the
  staleness check so queued messages update `latestBuild`; drawings/export keep FIFO.
  Guards: useCadModel.dom.test.jsx, reliability.test.js (fake workers). Measure: builds-run counter.
- D2 [V model.js:22-57] `KERNEL_INERT_KEYS = ['finishes','prints','fabrication']`; `marks` is never read by
  the kernel but is not inert → adding/editing a Measure mark rebuilds every part. Hide/Show
  (CadWorkspace.jsx:1410, instance `visible`) and tree rename (:3169-3183, instance `name`) rebuild too
  (`onlyGroupsMoved` allows only `groupId`). NOT safely inert: sheets, connections, part/sketch names.
  Fix: add `marks`; allow `visible` + `name` on instances. MUST VERIFY by grep that kernel.js and the
  worker-side modules never read instance.visible / instance.name / model.marks (drawings? partsList?
  balloons? error text?). Guards: shopModel.test.js:126 asserts the exact inert-key list.
- D3 [V CadWorkspace.jsx:5428-5444] Drawing SVG (`layoutParts`, `sheetSvg`, `sheetFit`) rebuilt on EVERY
  workspace render once a sheet is generated, even with the split pane closed; `sheetScales()` (:5451,
  :7515) calls layoutParts per sheet per render while the Sheets panel is open. Fix: useMemo on
  [previewSheet inputs, model, runtime.snapshot], only when `split || panel === 'sheet'`.
  Guards: CadWorkspace.drawings.dom / .pdf.dom tests, SheetEditor `previewReady={Boolean(svg)}`,
  SheetScaleControl reads drawingParts + views.
- D4 [ ] `foldSheet` (sheetMetal.js:982, polygon-clipping booleans) unmemoised, called from
  CadWorkspace.jsx:833, :908, :5264 (every render at the print artwork stage), shopRoute.js:73/:292,
  fabrication.js:92, jobSheet.js:279/:332, laserStation.js:517/:644, brakeStation.js:2657 (+ trial folds
  :1795, :2099, :2255), ShopPanels.jsx:1471-1481. `jobBoard` (:4488), `shopProgress` (:3941),
  `replayReason` (:3988), `bendQueue` keyed on whole `model`; `jobProducts` O(I²) via `treeRows`.
  Fix: WeakMap memo keyed on (feature, profile, params) when `angles` is null — MUST audit that no caller
  mutates a fold result (brakeStation.js:484 already keys a WeakMap on fold identity).
- D5 [ ] Derivations for hidden panels: `rows` (:5354, buildCutList incl. folds; used only at :7574 under
  panel==='cuts'), `shopRows` (:5347, meshArea over every mesh), `markPoses` (:5217, used at :6735 under
  panel==='marks'). Fix: guard the memos on the panel.
- D6 [ ] 3 full renders of the 8000-line component per edit (commit, status 'building' useCadModel.js:93,
  'ready' :103); zero React.memo in cad/; 91 useState / 3 useCallback. Render-phase `setShopSubject`
  (:3797) doubles each selection render. `treeRows(model)` (:5641) unmemoised O(I²) per render.
  `commands` (:4654), `shopMore` (:5043) per render. Fix: memo treeRows on [model.instances, model.groups];
  extract tree as a memo leaf; `cadFilm().builds` (CadWorkspace.jsx:521, :4291) semantics must hold.
- D7 [ ] `<CadViewport>` at CadWorkspace.jsx:6199: ~24 inline callbacks (viewport stores them in refs
  :326-380 so no effect re-fires); effects keyed on `model` (:3204-3347) re-pose every group per commit
  with O(I²) finds.
- D8 [ ] Kernel: every build disposes the session, rebuilds every part (kernel.js:541), clones + transforms
  each instance (:816), meshes every instance separately at fixed tolerance 0.15 (kernel.js:1079-1096) —
  identical fasteners tessellated N times; replicad mesh() copies heap via Array.from, `typedMesh` copies
  again (kernel.js:43-53). Staged fix: timing probes first; tessellate once per part + apply the instance's
  rigid matrix to typed arrays; later a per-part memo. Risk medium-high. Optional: strip
  sketch.entities/support/dimensions/marks/groups from kernelPayload (model.js:65).
- D9 = A3 (persistence per model commit; kiosk fixture ~51 KB so only matters with big 2D drawings/prints).
- D10 minor: window keydown re-subscribed per render (:1266, :5100, :5180, :5327; FlatPatternMap.jsx:137);
  JsonEditor keys JSON.stringify per render (:7666 advanced panel, :7422, :7865 inside closed <details>).
- Fine: shop film ref clock + rAF direct DOM (:4158-4199); laser bed direct DOM; ValueField local draft;
  transferables; supersede + 50 ms debounce; PressBrakePanel madeFold memo (:898).

D2 safety check (main loop, 2026-11-22): import closure of kernel.worker.js + solver.worker.js = solver.js,
model.js, draftingProfiles.js, utils/arcUtils.js, utils/canvasMath.js, utils/sketchExpressionUtils.js,
kernel.js, shopCatalog.js, sheetMetal.js, sketchProfile.js, sketchShapes.js, sketchZero.js,
stockSections.js, hardwareGeometry.js, screwGeometry.js, hardwareCatalog.js, hardware.js, rivetGeometry.js,
cutPlacement.js, placement.js, projection.js. grep over that closure: kernel.js never reads `model.marks`,
`instance.visible` or `instance.name` (its `.name` reads are part / config / punch / die names; `marks` at
kernel.js:1264 and sheetMetal.js:1613 are a FEATURE's `marks`, not `model.marks`). model.js:245 validates
`result.marks` inside a model.js function — builder must check whether the worker calls that validator on
the payload (if so an invalid mark would have surfaced as a build error before and would not after).

## B. Apartment planner 3D preview (auditor report 2)

No earlier contract regressed (batching + layer-1 split, collision BVH, refine profiles + presize, 250 ms
compile debounce, manual shadows `shadowMap.autoUpdate=false` createPreviewViewport.js:367, fixture maps
autoUpdate=false, 24/8 light budgets, frozen matrices, suspended pane, perf gate, sky repaint quantisation).

Frame facts: interactive frame with AO = 8 passes at canvas pixels: (1) scene → 8× MSAA half-float target +
resolve (createProgressiveRenderer.js:203-209), (2) GTAO normal prepass = whole scene again with
MeshNormalMaterial after a full scene.traverse to hide lines (GTAOPass.js:502-508, 656-665), (3) GTAO 32
taps desktop, (4) Poisson denoise, (5) copy scene → other composer target, (6) AO multiply, (7) copy →
accumulation (:570), (8) OutputPass. Without AO: 1, 7, 8. Loop on-demand, stops at IDLE
(refineSchedule.js:74-81); walk mode keeps rAF alive (createPreviewViewport.js:885). Key shadow map only on
markShadowsDirty (never camera-only), but every refine sample jitters the sun disc → dirty per sample
(:598, 635). Canvas ratio min(dpr,2) (previewResolution.js:29); `INTERACTIVE_SCALE = 1` constant
(createProgressiveRenderer.js:159) — no adaptive resolution; desktop refine 2×/axis at dpr 1–1.5, 1.5× at
dpr 2 (previewResolution.js:40-53), ratio read once at module load; desktop 4096 shadow map (:79), GTAO 32
taps, up to 128 samples; web 2048 / 16 / 48. MSAA 8 clamped to GPU.
Pixels: 2560×1440 dpr1 = 3.7 MP interactive / 14.7 MP refine; 4K dpr1 or 1440p dpr1.5 = 8.3 / 33 MP;
4K dpr2 = 8.3 / 18.7 MP.

- B1 [V createProgressiveRenderer.js:565-581, 627-653: `performance.now()` around composer.render() +
  blend + present = JS submit time] Every governor measures JS submit time, not GPU time: AO drop at 16/12
  ms never triggers on a GPU-bound frame; refine budget `REFINE_BUDGET_MS / lastFrameMs` always hits the
  128 cap on desktop → GPU saturated for seconds after each camera stop. No timer query anywhere in
  preview/. previewPerf.js:174-188 records the rAF gap but nothing feeds it back.
  Fix: GPU signal (EXT_disjoint_timer_query_webgl2 if exposed, else rAF-to-rAF gap during sustained
  gestures); `interactiveScale` quantised {1, .85, .7, .58, .5}, changes only at gesture start from the
  previous gesture's p90 or mid-gesture after ≥0.5 s over 25 ms, steps back up after dwell (one
  reallocation per gesture per `applyRenderScale` comment). Required edits: accumulation filter rule :314
  → `width !== canvasSize.x ? Linear : Nearest`; `captureImage` (createPreviewViewport.js:2392) forces
  scale 1; `setSize` (:541) keeps the governed scale. Walk profile refines at supersample 1 so the gear
  change is a no-op (refineProfiles.test.js) → walk refine must follow the governed scale or the paired
  reallocation freezes return. Measure: `__previewPerf.frames()` gapMs p95 (snapshot() only has
  maxFrameGapMs previewPerf.js:147 → add percentile).
- B2 [ ] Refine chain memory: MSAA 8 on both composer targets at refine size, no pixel cap. ESTIMATE
  ~104 B/px per composer target (8×8 colour + 8×4 depth + 8 resolve), two targets + GTAO 36 B/px ≈ 244
  B/px → ~2 GB at 8.3 MP, ~3.6 GB at 14.7 MP, ~8 GB at 33 MP → OOM / context-loss risk. Fix: samples=0 on
  composer targets in refine (supersampling + jitter already antialias; set rt.samples + dispose at the
  gear shift where reallocation already happens); cap refine pixels `supersample = min(ss,
sqrt(cap/canvasPx))`. Pin previewResolution.test.js. Add `vramEstimateMB` to getStats().
- B3 [ ] Composer's second target inherits MSAA (RenderTarget.js:371 clone copies samples;
  EffectComposer.js:79-97, 239-256; GTAOPass.js:571-581): GTAO's copy + AO-multiply write 8× MSAA into the
  other target and resolve; targets alternate as scene target so both need MSAA. Fix: replace
  composer.renderTarget1/writeBuffer with a non-MSAA half-float target; `gtaoPass.needsSwap=false`;
  blendIntoAccumulation reads `gtaoPass.enabled ? composer.writeBuffer : composer.readBuffer`. Image
  identical; saves ~100 B/px and two MSAA resolves per frame. getSceneRenderTarget() stays the MSAA
  readBuffer.
- B4 [ ] Plan-drag rebuild: `useMemo(buildPreviewScene)` (ThreePreviewPanel.jsx:239-258,
  buildPreviewScene.js:106) regenerates descriptors for every floor/truss/ceiling/roof per project commit
  (unthrottled; the 66 ms throttle :521-552 only gates cache.build + setWorld). Per build ~10 whole-world
  traversals: freezeStaticMatrices both roots (previewSceneCache.js:217-218), applyOutlines ×2
  (createPreviewViewport.js:2197), applyInteriorLighting (:1922), hasUnpreparedMaterial (:2245), liveKeys
  (previewSceneCache.js:186-188), applySceneLightBudgets, new grid + ground geometry per build (:2190,
  2210), buildSelectionOverlay re-creates every selected object (ThreePreviewPanel.jsx:568-587,
  buildPreviewObjects.js:1868). ESTIMATE 3–10 ms per rebuild heavy scene. Fixes: (1) memoise each floor's
  descriptor by its sourceKey inputs; (2) freeze only fresh groups; (3) per-floor applied flags like
  `viewModeApplied`; (4) reuse grid + ground when bounds unchanged; (5) skip overlay rebuild when selected
  descriptors equal. Keep "mesh carried over iff descriptor equal" (tested).
- B5 [ ] Hitches: (a) ResizeObserver → resize() (ThreePreviewPanel.jsx:354-360) → renderer.setSize +
  progressive.setSize (createPreviewViewport.js:1033-1050) reallocates the MSAA chain per callback during
  a splitter drag; (b) focus mode unmounts/remounts the viewport (FloorplanWorkspace.jsx:371-405) → new
  context, PMREM, compile, camera lost; (c) first interactive frame after a refine re-aims the key light →
  one 4096 shadow pass per gesture; (d) ortho switch links the GTAO program synchronously (:483-487).
- B6 [ ] WebGLRenderer.js:1614 `scene.updateMatrixWorld()` per render() (×3 per AO frame) recurses all
  frozen nodes + GTAO line-hiding traverse. Fix `scene.matrixWorldAutoUpdate=false` + explicit updates
  (sunSky.object after followCamera :836, keyLight in aimKeyLight, ground/grid) — stale-matrix risk.
- B7 [ ] Damping tail: dampingFactor 0.08 (createInspectNavigation.js:13-14) ≈ 0.5–0.8 s of interactive
  frames after release (ESTIMATE).
- B8 [ ] INFERRED fill candidates: transparent lit PBR ground disc (createGroundPlane.js:60-70);
  DoubleSide on every opaque material (materials.js:136,146); two fbm per fragment even when dtFade = 0
  (proceduralDetail.js:152-171); up to 24 lights per fragment.
- B9 [ ] CORRECTNESS (not perf): fixture shadow maps never refresh (buildPreviewObjects.js:1351-1359) →
  moving a wall leaves lamp shadows stale.
- B10 minor: skip accumulation copy on interactive frames; `emitCompassHeading` writes a CSS variable
  every frame (:663-674, 833); PMREM target per sun step; dead `axisIndicatorInstance` (:65, 866, 2554).
- Fine: picks on click only; no per-frame React state; walk physics 0.1 ms; context-loss handling exists.
- Unknown: real GPU times; whether D3D11/ANGLE allocates full MSAA storage; whether
  EXT_disjoint_timer_query_webgl2 is exposed in Electron 43; devicePixelRatio read once at module load.
