# Performance & robustness pass (2026-11-08)

Whole-app audit of the web app and the Electron shell. Six read-only auditors
covered: floorplan store + persistence, 2D canvas + editor tools, 3D preview +
analysis workers, Sketch Studio CAD, app shell / Electron / build / big UI, and
domain + geometry + exports. The main loop re-checked every finding listed
below against source before it went into this spec.

**Baseline (before any change):** `npx eslint src/` 0 errors / 42 warnings.
`npx vitest run` 5440 pass, 1 fail: `CadWorkspace.place.dom.test.jsx` › "Hardware:
Flip side…" times out at 5 s under full-suite load and passes alone in ~2 s, so
it's a timing flake, not a logic failure.

## Ground rules for the builder

1. **No behaviour change beyond the defect.** Every step lists what must stay
   the same. If a fix can't hold that, stop and report it; don't widen scope.
2. **Read the contract first.** The memory notes at
   `C:\Users\johnm\.claude\projects\C--Users-johnm-modular-apartment-planner\memory\`
   record deliberate designs. Read the ones each phase names before you edit.
3. **Reproduce, then fix, then pin.** Every step gets a regression test
   (vitest unit or `.dom.test.jsx`) that fails before the change and passes
   after. Where a test genuinely can't express it (GPU, Electron main process),
   say so and give the manual check instead.
4. **Gate per phase:** targeted tests + `npx eslint src/` (no new warnings)
   before you start the next phase.
5. Steps marked **(verify first)** are "likely" findings. Prove the failure
   first. If you can't reproduce it, skip the step and report why.
6. Don't commit. Leave the tree uncommitted for audit.

---

## Phase A: floorplan store & persistence

Read first: `project_perf_overhaul.md`, `drag-performance-gestures.md`,
`numeric-input-typing.md`.

**A1. Building commands compute the coordination pass twice when settled and
once per drag frame.**

- Where: `src/features/floorplan/store/floorplanReducer.js:517-528`. The
  `EXECUTE_BUILDING_COMMAND` success branch returns
  `derived: { ...computeDerivedModels(result.project, result.validation.issues), lastCommand }`.
- Why it costs: mid-drag, `deferValidation` makes `issues` null, so the full
  pass runs on every frame. The root reducer's gesture branch (`:1935-1937`)
  keeps it anyway. Settled, the root reducer (`:1940-1949`) recomputes against
  the synced project, which is a different object, so the cache misses.
- Measured: column drag 50–58 ms/frame vs wall drag ~2 ms; settled column move
  ~100 ms.
- Fix: return `derived: { ...state.derived, lastCommand: {…} }` and let the root
  reducer own the computation (or the defer). Also make `commandError`
  (`src/domain/buildingCommands.js:~183`) skip `validateBuildingCoordination`
  when validation is deferred.
- Keep: `lastCommand` contents (the root path preserves it for this action
  type), `validationIssues`, `siteFeasibility`, `derivedStale` → settled on
  `END_DRAG_GESTURE`, and `buildingCommandReducer.test.js` green.
- Test: a column drag inside BEGIN/END_DRAG_GESTURE leaves `state.derived`
  identity unchanged per frame; a settled command calls the derived builder
  once (spy).

**A2. `FLOOR_DUPLICATE` leaves manual ceilings and truss `baseElevation` behind.**

- Where: `floorplanReducer.js:870-893`. It only calls `shiftFloorElevationData`,
  whereas `FLOOR_UPDATE` (`:845-858`) also shifts `trussSystems.baseElevation`
  and manual ceilings.
- Failure: a ceiling at 5700 ends up inside the storey below once Floor 2 moves
  from 3000 to 6000.
- Fix: apply the same truss and manual-ceiling shift to every floor at or above
  `insertionLevelIndex`. Factor the shared helper out of FLOOR_UPDATE; don't
  duplicate it.
- Test: duplicate below a floor that has a manual ceiling and a truss system,
  and assert both moved by the inserted height.

**A3. No-op edits create phantom undo steps and run the full pass.**

- Where: `src/hooks/useNumericDraft.js:75-78`. Enter commits even when the field
  is untouched (`draft === null`). Blur already checks this.
- Failure: Enter on an untouched field adds an undo step, so Ctrl+Z appears to
  do nothing; `isDirty` flips on; ~70 ms pass.
- Fix: on Enter, call `commit` only when `draft !== null`. Keep `setDraft(null)`.
- Keep: `PanelKit.jsx:111-116` relies on Enter running `onChange` before
  `onSubmit`. Confirm `onSubmit` still fires on Enter with an untouched value,
  and don't break the spinner-immediate path.
- Test: Enter on an untouched field doesn't call `onCommit`; Enter after typing
  does.

**A4. Edits made during an async Ctrl+S are marked saved.**

- Where: `MARK_SAVED` at `floorplanReducer.js:1432-1438` uses
  `state.changeVersion` at dispatch time; `handleSave` in
  `src/features/floorplan/hooks/useFloorplan.js:108-124` awaits the file write
  first.
- Fix: capture `changeVersion` before the save starts and dispatch
  `{ type: 'MARK_SAVED', version }`. The reducer sets `savedVersion = version`
  and `isDirty = state.changeVersion !== version`. With no `version`, fall back
  to the old behaviour, so autosave stays unchanged.
- Test: reducer: MARK_SAVED with an older version leaves `isDirty` true.

**A5. Autosave and draft-load failures are silent.**

- Where: `useAutosave` is called without `onError` (`useFloorplan.js:56`);
  `handleLoadDraft` (`:253-256`) only calls `console.warn`.
- Fix: route both through the existing user-visible status/notification path,
  the one file import uses (`failProjectOpen` or the status bar).
- Also: in `src/persistence/localStorageBackend.js:20-31`, write the index entry
  so a quota failure can't leave an orphaned, unlistable draft. Either write the
  index first and roll back on project-write failure, or catch, remove the
  orphan and rethrow.
- Don't add draft pruning; that needs a product decision.
- Test: a backend whose `setItem` throws `QuotaExceededError` surfaces an error
  and leaves no orphan key.

**A6. Project name, Address and Drawn By dispatch per keystroke.**

- Where: `src/features/floorplan/components/Sidebar.jsx:393-397` and
  `properties/ProjectSummary.jsx:13,18,22`.
- Failure: each character pushes an undo step (HISTORY_LIMIT 100) and runs the
  coordination pass.
- Fix: a local text draft that commits on blur/Enter and reverts on Escape,
  following the `useNumericDraft` pattern. A small `useTextDraft` next to it in
  `src/hooks/` is fine. The visible value must update live while typing.
- Test: typing 10 characters then blurring gives exactly one dispatch.

## Phase B: 2D canvas & editor tools

Read first: `canvas-2d-performance.md`, `drag-performance-gestures.md`,
`floorplan-focus-mode.md`.

**B1. A tool's own keys are hijacked by global tool shortcuts.**

- Where: the shortcut switch in
  `src/features/floorplan/components/renderers/SvgCanvas.jsx:~733-792`. `'f'`
  switches to FIXTURE and `'r'` to ROOM, and both `return` before
  `tool.onKeyDown(e)` (`:796`).
- Dead handler keys:
  - Door "F flips swing" (`src/editor/handlers/doorPlaceHandler.js:91`)
  - Electrical "F flips side" (`electricalPlaceHandler.js:113`)
  - Fixture "R rotates 90°" (`fixturePlaceHandler.js:43`)
- Fix: an optional handler method `claimsKey(e, toolState) → boolean`.
  SvgCanvas checks it before the shortcut switch and, when it's true, calls
  `tool.onKeyDown(e)` and returns. Implement it on those three handlers only,
  for the unmodified key.
- Test: dom test with the DOOR tool active: pressing F keeps the DOOR tool and
  flips the preview.

**B2. A double-click places two stacked doors, windows or outlets.**

- Where: `doorPlaceHandler.js` `onMouseDown` trusts `toolState.previewBlocked`
  from the last move; `windowPlaceHandler` and `electricalPlaceHandler`
  (`isBlocked`) do the same.
- Fix: in `onMouseDown`, re-run the existing overlap/blocked check against the
  current floor (`getFloor(activeFloorId)`) before dispatching. Reuse the move
  path's function; don't fork it.
- Test: two mousedowns with no move between them add one door.

**B3. A tool drag released outside the `<svg>` never ends.**

- Where: pointer capture is taken only for panning (`SvgCanvas.jsx:~408`); there
  is no `onPointerCancel` or `onLostPointerCapture`. The marquee payload
  (`selectHandler.js:~349`) and its mouseup reset (`~945`) omit
  `wallDragPreview: null`.
- Fix:
  - Take `setPointerCapture` for tool drags too, in try/catch (jsdom has none;
    see `canvasDragCoalescing.dom.test.jsx:159-161`).
  - Route `lostpointercapture` and `pointercancel` to the same mouse-up path, so
    drag gestures end normally.
  - Add `wallDragPreview: null` to both marquee payloads.
- Keep: the pan path's capture, and handlers reading `e.target` only on
  mousedown.
- Test: a pointercancel mid column-drag ends the gesture (one history entry),
  and later moves don't move the column.

**B4. The Space-pan latch survives losing focus.**

- Where: `spaceHeld` is cleared only on keyup (`SvgCanvas.jsx:~799-804`), and
  that keyup is skipped for typing targets.
- Fix: reset on window `blur`, and don't gate the Space keyup on
  `isTypingTarget`. `WallDetailEditor.jsx:~846` already does it this way.

**B5. Plan shortcuts fire behind an open wall or ceiling detail editor.**

- Fix: SvgCanvas's keydown (and its paste handling) returns early while
  `wallDetailEditor || ceilingDetailEditor` is open.
- Keep: the editors' own capture listeners are untouched.

**B6 (verify first). Delta-advancing drags drop movement.**

- Where: column, fixture, stair, landing, railing and service drags read the
  floor through `getFloorRef`, which `src/editor/useEditorTool.js:63-70` syncs
  in a passive `useEffect`.
- Fix: switch the `getFloorRef`/`projectRef` sync to `useLayoutEffect`. Don't
  rewrite the drags to cumulative.

**B7 (verify first). The hover position lags the screen for ≤90 ms after a
wheel zoom.**

- Where: `getModelPos` (`SvgCanvas.jsx:~374-378`) uses the committed `viewport`
  while the pending gesture transform is on screen.
- Fix: use the gesture base when a zoom is pending, then confirm clicks are
  still exact. `scripts/verify-plan-canvas-gestures.mjs` must still pass.

## Phase C: 3D preview & analysis workers

Read first: `preview3d-performance.md`, `project_walk_physics.md`,
`project_loading_states.md`, `project_ceiling_light_placement.md`.

**C1. Walk mode swallows Ctrl+S, Ctrl+C, Ctrl+F, Ctrl+R and the plan's W/D keys.**

- Where:
  `src/features/floorplan/components/preview/createWalkNavigation.js:79-88`. It
  calls preventDefault and stops propagation on every movement-key code
  _before_ checking modifiers or `controls.isLocked`.
- Fix:
  - Return early on `ctrlKey || metaKey || altKey`.
  - Only prevent and stop when `controls.isLocked || event.code === 'Escape'`.
  - Disable walk input while the viewport is `setSuspended(true)`
    (`createPreviewViewport.js:~1937`).
- Keep: locked walking unchanged; Escape still exits walk.
- Test: a new unit test with a fake `controls`: unlocked + Ctrl+S isn't
  prevented, and a locked W is.

**C2. A disposed viewport renders again from pending gate/warm-up promises.**

- Where: `holdFramesUntil` `release` (`createPreviewViewport.js:897-911`),
  `scheduleShaderWarmup` (`~930`), the `startLightCompileGate` `.then`
  (`~881`), and the `requestViewMode` gate (`~1580`). None check `disposed`;
  `dispose()` (`~2310-2370`) doesn't clear `lightCompileGate.timeout`.
- Fix:
  - Add an `if (disposed) return;` guard at the top of `startRenderLoop`,
    `renderFrame`, `release` and each compile `.then`.
  - In `dispose()`, clear the gate timeout and null `lightCompileGate`.
- Keep: suspend/wake (no dispose) unchanged.

**C3 (verify first). WebGL contexts are never released.**

- Where: `renderer.dispose()` at `createPreviewViewport.js:~2369` and
  `renderToImage.js:~158`, with no `forceContextLoss()`.
- Fix:
  - Call `renderer.forceContextLoss()` after dispose in both places.
  - Wrap `renderToImage` in try/finally.
  - Cap `sheetPreviewCache` (`SheetViewportContent.jsx:~41-49`) to the latest
    entry per project+floor+view.
- Verify: open and close a wall editor ~20× and check the console for "Too many
  active WebGL contexts" before and after.

**C4. A study worker that fails to load or crashes leaves the study "running"
forever.**

- Where: `src/features/floorplan/hooks/useStudyWorker.js:~111` listens only for
  `message`.
- Fix: also handle `error` and `messageerror`, and record
  `{ key: pendingRef.current.key, error }` so the UI leaves `running`.
- Test: update `studyWorkerLifecycle.dom.test.jsx:152-161` (it asserts one
  listener; filter by type) and add a crash case.

**C5. The sun effect re-renders the 4096² shadow pass on every project change.**

- Where: `ThreePreviewPanel.jsx:527-532`. `computeSunVector` reads only
  `project.building.site` but is memoised on `filteredProject`, and `setSun`
  always runs `applySun` → traverse + `markShadowsDirty` + `invalidate`.
- Fix: in `setSun`, compare the incoming vector by value
  (altitude/azimuth/direction/intensity, whatever `applySun` actually reads)
  with the last applied one and return early when equal. This is safer than
  re-keying the memo.
- Keep: scrubbing the sun study still updates on every step.

**C6. Superseded study requests are all computed in full.**

- Where: the synchronous `onmessage` in `src/analysis/solarAccess.worker.js`,
  `daylight.worker.js` and `sunStudy.worker.js`; the comment at
  `useStudyWorker.js:~170` claims otherwise.
- Fix: in each worker, record the latest id, defer the solve with
  `setTimeout(…, 0)`, and skip it if a newer id arrived. Correct the hook
  comment so it describes the real behaviour.

## Phase D: Sketch Studio CAD

Read first: `project_cad_workstation.md` (keep-worker-alive and optimistic-pose
contracts), `project_sketch_xray_mode.md` (the program-destroy trap),
`project_cad_part_groups.md`.

**D1. A failed export, drawing or inspect request puts the whole workspace in
the error state.**

- Where: `src/features/sketchstudio/cad/useCadModel.js:76-79`.
- Fix: set `status: 'error'` only when the worker itself died (check the
  client's worker after the rejection, matching how `workerClient.js` marks a
  dead worker); otherwise just rethrow.
- Keep: the `useCadModel.dom.test.jsx:41-67` crash case (`ready` false after a
  worker crash).

**D2. Disabling the preview terminates its kernel worker, so OpenCascade cold
boots on every operation.**

- Where: `useCadModel.js:36-40`. `kernel.cancel()` terminates the worker.
  `CadWorkspace.jsx:205-212` disables the preview whenever `draftProblem` is
  set, which includes the whole Place stage and every invalid keystroke.
- Fix: when disabled and nothing is in flight, `supersede()` instead of
  `cancel()`. Terminate only if a build is actually running, or after a 30 s
  idle timeout so the second wasm heap is still freed.
- Also: reset `kernelAwake` on any worker restart, not only `cancel()`.
- Update the test at `useCadModel.dom.test.jsx:13-40` to the new contract.

**D3. Cheaper snapshot transfer.**

- Where: `kernel.js:~689-696` and `kernel.worker.js:~45`.
- Fix: convert `mesh.vertices/normals/triangles` and `edges.lines` to
  `Float32Array`/`Uint32Array` and post them in a transfer list.
- Drop `faceGroups`/`edgeGroups` only after grepping `src/` and `scripts/` to
  prove they have no consumer. If anything reads them, keep them.
- Don't change per-instance meshing.
- Keep: the only consumers, `CadViewport.jsx:~1743-1750`, accept typed arrays.
  Check `scripts/verify-sketch-cad*.mjs` doesn't read those fields as plain
  arrays.

**D4. Pick raycasts walk every edge segment.**

- Fix: set `raycast = () => {}` on the edge `LineSegments` when building part
  groups (`CadViewport.jsx:~1751`), or raycast only the visible meshes.
- Check: grep every `intersectObjects` caller in `CadViewport.jsx` and
  `placementLayer.js` first. If any caller _wants_ edge hits (measure, edge
  snap), keep edges raycastable for that caller only.

**D5 (verify first). A rebuild landing mid-drag cancels the gizmo drag.**

- Where: the gizmo effect `CadViewport.jsx:1864-1869` calls `ctx.cancelDrag()`
  whenever `snapshot`/`model` change. The snapshot effect (`~1739`) disposes the
  dragged groups.
- Repro first (dom test or `scripts/verify-*` style): drag part A and release,
  then grab part B before the rebuild lands.
- Fix only if reproduced:
  - Return early from the gizmo effect while `ctx.drag` is set.
  - In the snapshot effect, rebind `drag.groups[i].group` to the new group with
    the same `instanceId`, re-apply the current delta, and defer disposing old
    edge geometry the rotate ghost shares until the drag ends.

**D6 (verify first). Overlay redraws dispose materials before creating new ones,
so programs recompile.**

- Where: `placementLayer.js:64-72, 225-235`; `CadViewport.jsx:~2102-2109,
2313-2319`.
- Verify: watch `renderer.info.programs` identity/length across a Shape-stage
  handle drag.
- Fix only if programs churn: a layer-owned material cache keyed by
  colour/opacity/side, like the X-ray cache.

## Phase E: exports & domain

Read first: `project_fabrication_accuracy.md` (DXF Y-mirror and bulge
conventions), `project_all_day_shadow_freeze.md`.

**E1. `computeStyle` gets colour and opacity wrong.**

- Where: `src/export/sheetExport.js:294-314`. `parseColor` drops `rgba` alpha,
  so `transparent` becomes black and framed-wall outlines
  (`WallRenderer.jsx:226-234`) export as black slabs. `parseFloat(x) || 1`
  turns opacity 0 into 1.
- Fix:
  - Return alpha from `parseColor`.
  - Treat alpha 0 as no paint, and fold alpha into fill/stroke opacity.
  - Use a `Number.isFinite` check instead of `|| 1`.

**E2. Missing SVG elements in sheet PDF/PNG.**

- Where: `walkElement` (`~1001-1037`) and `drawElementToCanvas` (`~826-862`).
- Fix:
  - Add `circle` and `ellipse`.
  - Skip `defs`, `clipPath`, `pattern`, `marker`, `linearGradient`,
    `radialGradient` and `filter` subtrees.
  - Honour `clip-path` (PDF `W n` / canvas `clip()`) if it fits cleanly; if not,
    skip the clip and report.
- Affected today: grid bubbles, section markers, tag bubbles, and section and
  elevation clip paths.

**E3. Path parser.**

- Where: `parsePathData` (`~394-477`) stops at C/Q/S/T. `buildArcPoints`
  (`~352`) straight-lines elliptical, rotated and undersized-radius arcs.
- Fix:
  - Flatten C/Q/S/T into points.
  - Implement the SVG spec's endpoint-to-centre arc conversion, including
    radius scale-up.

**E4. Non-ASCII text in PDFs becomes "?".**

- Where: `escapePdfText` (`~169-175`) and the font object (`~592`).
- Fix:
  - Add `/Encoding /WinAnsiEncoding`.
  - Emit WinAnsi-mappable characters (², °, ±, é, …) as `\ooo` octal escapes;
    only unmappable ones become `?`.
- Test: `m²` round-trips as `\262`.

Tests for E1–E4: `sheetExport` has none today. Add unit tests on the pure
helpers (`parseColor`, `parsePathData`, `buildArcPoints`, `escapePdfText`);
export them only if needed, as named exports.

**E5. Professional-exchange DXF is mirrored top to bottom.**

- Where: `src/export/professionalExchangeExport.jsx`. `transformedPoint`
  (`227-231`) and `floorEntities` write y-down coordinates into y-up DXF.
- First read how `src/export/sheetDxf*.js` and the Sketch Studio DXF
  (`toDxfPoint`) orient Y, and match them.
- Fix:
  - Sheets: `y' = sheetHeight − y`. Model: `y' = −y`.
  - Exclude geometry under `defs`/`clipPath` in `buildRenderedSheetDxf`
    (`~305`).
- Keep: `coordinatedBuildingNu.test.js:380-383`.
- Add a test: a door near plan top-left lands at a DXF y greater than one near
  the bottom.

**E6. The opening-vs-column check misclassifies contact.**

- Where: `src/domain/structuralCoordination.js:180-210`. It builds a fake
  0.1 mm sliver by offsetting (+0.1, +0.1), which collapses on 45° walls.
- Failure: a flush door is reported as an ERROR intersect; a door through a
  45°-aligned column is only a warning.
- Fix:
  - Exact test: the segment crosses the column interior means intersect.
  - Clearance is the minimum segment-to-polygon distance.
  - Flush contact is clearance 0 and a warning, not an intersect.
- Add a bounding-box prefilter, expanded by `minOpeningClearanceFromColumn`, in
  `validateOpeningsNearColumns` (`~486-542`). Measured: 200 doors × 121 columns
  takes ~93 ms per call, run on every commit.
- Keep: `structuralCoordination.test.js:108`. Add flush, 1 mm, 45° and
  pass-through cases.

**E7. Load-path column stacks are ordered by array index, not storey order.**

- Where: `structuralCoordination.js:1074-1077`.
- Fix: order by `getOrderedFloors`.

## Phase F: Electron shell & app shell

Read first: `project_electron_desktop_app.md`, `route-loading-state.md`.

**F1. The Electron close button does nothing while the project is dirty.**

- Where: `src/app/useUnsavedChangesGuard.js:19-25` cancels `beforeunload`;
  Electron cancels the close silently.
- Fix: in `electron/main.cjs` `createWindow`, handle
  `win.webContents.on('will-prevent-unload', …)` with a
  `dialog.showMessageBoxSync` Leave/Stay prompt (default Stay); Leave calls
  `event.preventDefault()`.
- Keep: the web build unchanged.

**F2.** The error screen's "Go Home" link (`src/app/ErrorBoundary.jsx:81`,
`href="/"`) leaves the app under `file://`. Use `'#/'` when
`location.protocol === 'file:'`, otherwise `'./'`.

**F3. Dropping a file replaces the app.**

- Fix: a `will-navigate` guard that allows only same-document (pre-`#`) URLs.
- Also handle `render-process-gone` with `win.reload()` unless the reason is
  `clean-exit`, and restrict `shell.openExternal` to `http:`/`https:`/`mailto:`.

**F4. The service worker registers under `file://` and rejects on every desktop
launch.**

- Fix: `injectRegister: false` in `vite.config.js`, and in `src/main.jsx`
  register through `virtual:pwa-register` only when
  `location.protocol.startsWith('http')`.
- Keep: the web PWA auto-update unchanged. Check `vitest` doesn't import
  `main.jsx`.

**F5.** `main.cjs:~93` references `npm run app:dev`, which doesn't exist. Fix the
comment to the real usage (set `ELECTRON_START_URL`, then `npm run app`). No new
dependency.

**F6. Modal doesn't isolate the keyboard.**

- Failure: with "Delete 'Floor 2'?" open, Delete deletes the selection behind
  it and Ctrl+Z undoes.
- Fix: `src/ui/Modal.jsx` adds a capture-phase window keydown that
  `stopPropagation()`s keys whose target is outside the modal (Escape keeps its
  current behaviour), plus `role="dialog" aria-modal="true"`.
- Check: every ConfirmDialog/Modal use inside the wall and ceiling detail
  editors (their capture listeners register earlier and must keep working).

**F7.** `src/features/sketchstudio/craftsman/export/workshopExport.js:6` imports
JSZip statically and drags 97 KB into `/sketch`. Make it a dynamic import inside
the already-async `generateWorkshopZip`.

## Phase G: low-risk UI clarity

- `src/ui/InputField.jsx:31`: link the `<label>` to the input with `useId()`
  (`htmlFor`/`id`).
- `Sidebar.jsx:393`: add `aria-label="Project name"`.
- `Toolbar.jsx:~362-405`: Floor/Roof/Truss/Sheets segmented buttons get
  `aria-pressed`, like the view-mode buttons beside them.
- No layout or visual changes.

## Phase H: test flake

- `CadWorkspace.place.dom.test.jsx:992`: give this test an explicit timeout
  (e.g. 15000) as its last argument. Don't touch production code for it.

---

## Phase I: user-approved additions (decided 2026-11-08)

The user answered the deferred questions: 1 yes, 2 no, 3 yes, 4 no, 5 yes,
6 no. So I1–I3 are in scope; the rest stays deferred.

**I1. Escape cancels every drag that commits per frame.**

- Where: `selectHandler.js:~1005-1040` restores only slabs on Escape. Wall,
  section, grid and slab drags already cancel cleanly; column, fixture, stair,
  landing, railing, service, door and window drags stay where they were
  dragged.
- Fix:
  - Snapshot each dragged object at drag start, the way `slabEditOrigin` does
    (or reuse that mechanism).
  - On Escape, restore the snapshot and end the gesture exactly as the slab
    path does.
  - After Escape: the object is back at its origin, no net undo entry remains
    (match what slab cancel leaves in history), `isDirty` matches the slab
    behaviour, and `derived` is settled.
- Keep: the drag-gesture protocol (`drag-performance-gestures.md`), and the
  existing wall/section/grid/slab cancel paths untouched.
- Tests: one per drag family. Drag, Escape, then assert position restored and
  history length unchanged from before the drag.

**I2. Load the wall and ceiling detail editors on demand.**

- Where: `FloorplanWorkspace.jsx:16-17` imports `WallDetailEditor` (~191 KB
  source) and `CeilingDetailEditor` (~162 KB) statically, but they mount only
  when opened (`~475/477`).
- Read first: `route-loading-state.md` (the dead-click trap),
  `project_loading_states.md` (`DetailEditorShell`, shell-first mount,
  first-WORLD compile gate), `detail-editor-canvas-fit.md`,
  `preview3d-performance.md` (suspended prop / batched assembly panes).
- Fix:
  - Keep the shell (`DetailEditorShell`/`mountShellFirst`, `lastBoardCounts`,
    anything the shell paints in the first frame) in a small eager module.
  - Lazy-load only the editor body, so a click paints the shell immediately
    and never looks dead.
  - Prefetch the body chunk on idle after the floorplan mounts
    (`requestIdleCallback` with a timeout fallback, swallowing errors), so the
    first open is usually instant.
  - A chunk-load failure shows the existing error screen with a retry and
    doesn't break the workspace.
- Keep: open/close behaviour, focus, the editors' capture-key listeners, the
  suspended main 3D preview, the loading copy, `verify-loading-states.mjs`.
- Report the FloorplanWorkspace chunk size before and after.

**I3. Safe draft pruning.**

- Context: in the web app, the localStorage drafts _are_ the projects listed in
  Open Project, and for many users they're the only copy. Pruning must never
  silently delete user work.
- Prune automatically, on app start and after a successful save:
  - (a) orphan project keys (`apartment-planner-project-*` with no index entry)
    and index entries whose key is missing;
  - (b) drafts that hold no user edits: identical to a freshly created starter
    project apart from id, name, timestamps and metadata. Decide "no user
    edits" from content, not age.
  - Never prune the currently open project.
- On `QuotaExceededError`, don't evict anything with content. Surface the
  error (A5) with a message pointing to Open Project, where drafts can be
  deleted.
- Tests: orphans removed; a blank starter draft removed; an edited draft kept
  regardless of age; the current project kept.

## Deferred (product decisions, NOT in this pass)

- Removing `wasm` from PWA precache: the user said no.
- Removing PlaneGCS or the unused deps: the user said no.
- Moving the off-screen Display group: the user said no.

## Final gate (builder runs all, reports numbers)

1. `npx eslint src/`: 0 errors, ≤ 42 warnings.
2. `npx vitest run`: everything passes. Report counts against the 5440 baseline.
3. `npx vite build` succeeds. Report the FloorplanWorkspace, SketchStudio and
   index chunk sizes before and after.
4. Dev server, then `scripts/verify-plan-canvas-gestures.mjs`,
   `scripts/verify-xray-mode.mjs`, `scripts/verify-night-section-freezes.mjs`,
   `scripts/verify-sketch-cad.mjs`, `scripts/verify-hardware-seat-side.mjs`
   (see `playwright-app-driving.md` for the recipe). Report pass/fail.
5. `scripts/bench-plan-canvas.mjs` before and after, plus a column-drag frame
   time before and after A1.
6. A per-step table: done / skipped (why) / judgment calls made.
