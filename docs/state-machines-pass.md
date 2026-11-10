# State machines pass — build spec

2026-11-09. Source: a whole-app audit for implicit state machines (seven
read-only auditors, one per subsystem; the main session re-verified the
hazards cited below against the source). The registry of every machine found
is `docs/state-machines.md` (written by the main session, not by a builder).

## 1. The decision

The app has about 45 implicit state machines and no explicit ones. They are
not all worth the same treatment, so each gets one of three:

- **Explicit** — a transition table declared with `defineMachine`
  (`src/shared/machine.js`, already written and tested: read it first). Only
  for small, self-contained lifecycles where a verified bug was a missing or
  drifted transition: project open (floorplan), document persistence (Sketch
  Studio), the mate session and the PDF run (CAD).
- **Named** — the states stay where they are, but the thing every copy
  re-derived gets ONE definition: a constant, a predicate or a decision table
  in a small pure module with its own test. For the big machines (floorplan
  tool session, CAD tool session, Sketch Studio interaction mode, study
  worker), where a rewrite would risk more than it buys.
- **Left** — already clear, already tested, or too small to matter. Listed in
  the registry only.

No state-machine library, no rewrite of a large file, no change to a
performance-tuned path (plan canvas pan/zoom, progressive renderer, drag
gesture protocol in the store).

Every verified hazard that comes from a missing or drifted transition is fixed
in this pass. Hazards that need a product decision, a real GPU, or that only
have a suspected trigger are listed in §8 and NOT touched.

## 2. Rules for every builder

1. **Re-verify before changing.** Each item cites the code as it was read on
   2026-11-09. Read it yourself first. If the hazard is not as described, do
   not change anything for that item: report what you found instead.
2. **Red first.** For each fix, write the test that proves the hazard, run it,
   see it fail for the stated reason, then fix. If a red test cannot be written
   (it needs a real browser, GPU or pointer lock), say so in the report and
   make the change only when the code path is unambiguous from reading.
3. **Nothing else changes.** No refactor beyond the item, no reformatting, no
   renames, no dead-code removal, no dependency. An existing test that fails
   after your change is a finding: stop and work out whether the test pinned
   the bug (then correct the test and say so in the report, with the reason)
   or you broke something (then fix your change).
4. **Stay in your package.** Other builders are editing other folders of this
   same working tree at the same time. Touch only the files your package
   lists. Never run a git command that changes the tree or the index (no
   stash, checkout, restore, reset, add, commit). The tree has ~120
   uncommitted files from earlier work; that is expected.
5. **Run only your tests.** `npx vitest run <files>` for the files your
   package lists plus the ones you add; `npx eslint <touched files>`;
   `npx prettier --check <touched files>` (run `--write` on files YOU created;
   for existing files format only if your edit made the check fail). Do not run
   the whole suite: five builders at once make it time out. The main session
   runs the full gate afterwards.
6. **Write like the file you are in.** Plain JavaScript, no TypeScript. Match
   the surrounding comment density and voice: comments here explain why a rule
   exists in plain prose. Do not put audit labels (H1, P3, "WP-A") in code or
   test names.
7. **Do not edit `docs/state-machines.md` or `src/shared/machine.js`.** Report
   the final table of any machine you declare; the main session writes the
   registry and the registry test.
8. **Report** per item: done / not done and why; files and lines changed; the
   names of the tests added and that each was seen red then green; every
   judgment call you made; anything in the code that contradicts this spec;
   the exact commands you ran and their pass/fail counts.

## 3. Package A — floorplan editor tools and store

Files: `src/editor/**`, `src/features/floorplan/store/floorplanReducer.js`,
`src/features/floorplan/FloorplanWorkspace.jsx` (the `FocusEscapeGuard`
component only), and their tests. Not `useFloorplan.js` (package E).

Context: every tool handler is a stateless closure; all tool state lives in
`editor.toolState`, one untyped bag merged by `UPDATE_TOOL_STATE`. It holds
three different kinds of thing: what a tool is armed with (settings), how far
a multi-click flow has got (flow markers), and per-frame previews.

### A1. `src/editor/toolSession.js` (new, pure) — Named

- `ARMED_SETTING_KEYS` and `keepArmedSettings(toolState)`: the settings that
  must survive a reset that keeps the tool. Start from `fixtureType`,
  `deviceType`, `beamPlacementMode`, `radius`. Truss keys
  (`trussTypeId`, `trussMaterial`, `targetTrussSystemId`), `cantileverMode`,
  `cantileverPick` and `ceilingTargetFloorId` are deliberately excluded: they
  are bound to a floor or are flow state. Before keeping a key, read the
  handler that consumes it and confirm it behaves with the rest of `toolState`
  empty (`fixturePlaceHandler.js:36`, `electricalPlaceHandler.js`,
  `beamPlaceHandler.js:61`, `filletPlaceHandler.js`). Drop a key from the list
  if it does not, and say so.
- In `floorplanReducer.js`, `SET_ACTIVE_FLOOR` (~1777), `SET_VIEW_MODE`
  (~1550) and `SET_WORKSPACE_MODE` (~1561) keep `activeTool` but set
  `toolState: {}`. Hazard: arm Furniture → Bed, click another floor; the tool
  is still Fixture but `fixturePlaceHandler.js:36` falls back to
  `KITCHEN_TOP` and the menu shows nothing checked. Change those three to
  `toolState: keepArmedSettings(editorState.toolState)`. `SET_TOOL` and
  `SET_MODEL_TARGET` keep `{}`.
- `isToolFlowInProgress(toolState)`: the one predicate for "a tool is in the
  middle of something that Escape would cancel". Today
  `FocusEscapeGuard` (`FloorplanWorkspace.jsx:86-122`) carries its own list of
  five markers (`dragging`, `pendingDrag`, `start`, `chainStart`,
  `startColumnId`) and misses the rest, so one Escape mid-flow in those tools
  both cancels the flow and leaves focus mode, against the "press Escape
  twice" contract in the comment above the component. Candidates to add:
  `dimensionStartPoint`, `sectionStartPoint`, `stairStartPoint`,
  `railingStartPoint`, `slabPoints`, `ceilingPoints`, `ceilingPickBeamIds`,
  `cantileverPick`, `startTrussBeamId`, `roofParapetStart`,
  `roofOpeningPoints`. An empty array is not in progress.
  **The invariant from that comment is load-bearing: a marker may only be in
  the list if the Escape that focus mode withholds clears it** — otherwise
  focus mode traps the user. For every marker, read the owning handler's
  Escape branch and confirm; leave out any marker it does not clear and report
  it. Add a table test that, for each marker, runs the owning handler's
  Escape against the real reducer and asserts the predicate is false after.
- `FocusEscapeGuard` uses the predicate (plus `pastePreview?.active`). Its
  ref-based reading and listener lifetime stay exactly as they are.

### A2. One idle drag state in `selectHandler.js` — Named

The reset payload exists four times and they disagree: general reset
(~1003-1018) and Escape reset (~1053-1068) are identical 11-key copies;
marquee mouse-up (~956-967) omits `pendingDrag`, `originalPos`,
`slabEditOrigin`, `slabEdgeDrag`; the `move` mouse-down (~349-359) does not
clear `handle`, `handleIndex`, `slabEditOrigin`. Declare one frozen
`IDLE_DRAG_STATE` and build all four payloads from it (a site that sets extra
keys keeps them on top). Keep every key each site clears today. No behaviour
change is expected for a normal drag; `selectHandler.test.js`,
`dragGesture.test.js` and `cancelDragGesture.test.js` must stay green
untouched.

### A3. Roof drags revert on Escape

`roofSelectHandler.js:348-359`: Escape during a drag clears the drag fields
but the drag committed on every frame (`PARAPET_UPDATE`, `DRAIN_UPDATE`,
`ROOF_*_UPDATE`), so the object stays moved. The plan select tool reverts
(`selectHandler.js:1037`, `CANCEL_DRAG_GESTURE`), and the owner chose
"Escape reverts drags" on 2026-11-08. Dispatch `CANCEL_DRAG_GESTURE` there
too. Read the reducer's `BEGIN/END/CANCEL_DRAG_GESTURE` (~1915-1951) and
`cancelDragGesture.test.js` first; confirm `SvgCanvas` opens the gesture on
every pointer-down for the roof tool as well, and that a cancel with nothing
recorded is a no-op.

### A4. Double-click sequences

A real double-click reaches a handler as press, press, then `onDoubleClick`.

- `ceilingBeamPickHandler.js:247-265`: the second press toggles the beam back
  off, then the double-click commits without it (the existing test at
  `ceilingBeamPickHandler.test.js:~207` calls `onDoubleClick` without the
  second press). New rule: a double-click on a beam finishes WITH that beam —
  `onDoubleClick` hit-tests the same way `onMouseDown` does and makes sure a
  valid support beam under the cursor is in the set before committing. Correct
  the existing test to send the real sequence.
- `slabPlaceHandler.js:78-106`, `ceilingPlaceHandler.js` (~137-148) and
  `roofOpeningPlaceHandler.js` (~52-63): the second press appends a second
  point on top of the last, so the committed polygon has a zero-length edge.
  Before the `< 3` check and the commit, `onDoubleClick` drops trailing points
  that coincide with their predecessor (within the handler's own close
  distance). One shared helper in `handlers/handlerSnapUtils.js`.
- `fixturePlaceHandler.js:28-41`, `columnPlaceHandler.js`,
  `landingPlaceHandler.js`: a second press with no move stacks an identical
  object on the first. Port the rule `doorPlaceHandler.js:81-88` already has:
  the press checks the floor as it is now and does nothing if an identical
  object (same type, position and rotation, as applicable) is already exactly
  there.

### A5. Fillet radius keys

`filletPlaceHandler.js:103-118`: `[` and `]` change `radius` but leave the
`previewGeometry` computed for the old radius, and a click without moving
applies the old one (`:59-64`). Recompute the preview for `hoveredCorner` with
the new radius, the same way `onMouseMove` does.

Tests to run: everything under `src/editor/`, plus
`src/features/floorplan/store/*.test.js`,
`src/features/floorplan/components/renderers/canvasKeysAndRelease.dom.test.jsx`,
`canvasDragCoalescing.dom.test.jsx`, `Toolbar.dom.test.jsx`,
`src/features/floorplan/context/FloorplanContext.dom.test.jsx`, and any test
that mounts `FloorplanWorkspace`.

## 4. Package E — floorplan shell: save, open, panels

Files: `src/features/floorplan/hooks/useFloorplan.js`,
`src/persistence/useAutosave.js`,
`src/features/floorplan/hooks/projectOpenMachine.js` (new),
`src/features/floorplan/components/ProjectLifecyclePanel.jsx` (the stair
headroom sub-form only), `src/features/floorplan/components/properties/WallProperties.jsx`
(`intendedSide` only), and their tests. Not `FloorplanWorkspace.jsx`, not the
reducer (package A).

### E1. Autosave names the version it wrote

`useAutosave.js:10-19` dispatches `MARK_SAVED` with no version after
`await saveProject(project)`, so the reducer (`floorplanReducer.js:1451-1462`)
marks whatever version is current when the await returns. An edit that lands
in between (most reachable through edits dispatched inside a transition, such
as the preliminary package generation) is marked saved, the timer it scheduled
is cleared, and the close guard is disarmed. `handleSave`
(`useFloorplan.js:141-161`) already passes `version`. Give `useAutosave` the
version that belongs to the `project` it saves and dispatch it. The reducer
does not change; its test for a version-less `MARK_SAVED` stays as it is.

### E2. A failed Ctrl+S says so

`useFloorplan.js:157-160`: a save error other than a closed picker only
reaches `console.warn`. Report it the way autosave errors are reported
(`SET_STATUS_MESSAGE`, see `handleAutosaveError` at `:70-72`), keeping the
`console.warn`.

### E3. Project open — Explicit

State today: `projectOpening` (`{stage:'draft',draftId}` or
`{stage:'reading'|'unpacking',name}`), `projectOpenError`, `showLoadModal`
(+ mirror ref), `projectFileHandle`; transitions at `useFloorplan.js:195-296`
and `closeLoadModal` (~445).

Hazard: closing the Open Project dialog (Cancel or Escape) while a draft or
file is loading only hides the dialog. The load still commits
`PROJECT_LOAD` (`commitLoadedProject`, `:207-215`) and replaces whatever the
user did in the meantime; a failure after the close pops an alert.

Build `projectOpenMachine.js` with `defineMachine`: the stages a load moves
through and a `CANCEL` out of each. Suggested table — adjust to what the code
needs and report the final one:

    idle      --OPEN_DRAFT--> draft
    idle      --READ-->       reading
    draft     --COMMIT/FAIL/CANCEL--> idle
    reading   --READ--> reading, --UNPACK--> unpacking, --COMMIT/FAIL/CANCEL--> idle
    unpacking --UNPACK--> unpacking, --COMMIT/FAIL/CANCEL--> idle

In `useFloorplan`, each open attempt gets a run id (a ref counter).
`closeLoadModal` cancels the live run. Progress, commit and failure are
dropped when their run is no longer the live one or the table says the event
does not apply — a cancelled load must not dispatch `PROJECT_LOAD`, must not
adopt a file handle, and must not show an error. The `projectOpening` object
keeps its exact shape: `FloorplanWorkspace.jsx` reads `stage`, `draftId` and
`name` from it (~447-449, 473-474, 495-546) and is not yours to edit. A load
that is not cancelled behaves exactly as today, including the commit inside
`startTransition` after `afterPaint()`.

### E4. Stair headroom sub-form reseeds with the stair

`ProjectLifecyclePanel.jsx:2850-2865, 2946-2957, 3977-4016`: choosing another
stair leaves `selectedOpeningId` and `headroomDraft` seeded from the first
stair, so "link" writes the first stair's headroom onto the second, or
silently does nothing when the opening is not on the new stair's floor while
the button stays enabled. When the stair changes, reseed both from the new
stair with the same expressions the `useState` initialisers use; validate the
selection against the current options the way `RoofProperties.jsx:93-96`
does. Touch nothing else in this 6,000-line file.

### E5. `intendedSide` does not leak between walls

`WallProperties.jsx:266, 310`: `intendedSide` is component state and
`PropertiesPanel` renders the properties body without a key, so a side chosen
on wall A at zero offset is still there when wall B is selected. Tie the
state to the wall it was chosen for (store the wall id beside the side and
read it only when the id matches); no effect, no key on the whole panel.

Tests to run: `src/features/floorplan/hooks/*.test.*`,
`src/persistence/**/*.test.*`,
`src/features/floorplan/components/ProjectLifecyclePanel*.test.*`,
`src/features/floorplan/components/properties/*.test.*`,
`src/features/floorplan/store/floorplanReducer.test.js`.

## 5. Package B — 3D preview, study workers, wall and ceiling detail editors

Files: `src/features/floorplan/components/preview/createWalkNavigation.js`,
`createPreviewViewport.js` (the view-mode request and frame gate only),
`src/features/floorplan/hooks/useStudyWorker.js`,
`src/features/floorplan/components/wall-detail/WallDetailEditor.jsx`,
`src/features/floorplan/components/ceiling-detail/CeilingDetailEditor.jsx`
(B5 only), and their tests.

### B1. Walk keys do not stick

`createWalkNavigation.js`: movement flags are cleared by Escape, `setEnabled`,
`setInputSuspended` and `dispose` only. Holding W and Alt-Tabbing away drops
pointer lock and the key-up never arrives; on return, clicking back in walks
forward by itself. Clear the movement flags when pointer lock is lost
(`controls` `unlock` event, which today only re-emits state at `:182-183`)
and on window `blur`; remove the listener in `dispose`.
`createWalkNavigation.test.js` has the harness.

### B2. An abandoned see-through request stops holding frames

`createPreviewViewport.js`: `requestViewMode` (~1589-1629) holds frames
through `holdFramesUntil` (~943-959) while a mode's programs compile. A later
request that needs no compile commits at once (`:1602-1606`) but the earlier
request's gate is still set, so the picture stays frozen until that compile
resolves or 4 s pass. A newer view-mode request must release a gate that an
earlier view-mode request set — and only that one: the world gate set by
`setWorld` goes through the same `lightCompileGate` and must not be released
by a view-mode request. There is no unit harness for the render loop; if you
cannot build a red test without restructuring the viewport, make the smallest
change, explain why it is safe, and say it is covered only by reading.

### B3. Study worker — Named, three fixes

`useStudyWorker.js`. Its header explains why status is derived rather than
stored (a stored status would have to be written from an effect on every
input change); keep that design.

- Export a pure `deriveStudyStatus(...)` holding the expression at `:204-223`
  and test it as a table. States: `idle`, `running`, `ready`, `error`,
  `unavailable`, plus the `stale` flag.
- Wrong result sticks after A → B → A: result A is on screen; inputs change to
  B and B is posted; inputs change back to A before B replies. The run effect
  returns early at `:174` (A is answered) but B is still the pending request,
  so B's reply passes the id check at `:114` and overwrites the result with
  key B. Status then reads `running` and the overlay shows B's study, until
  the next edit. Adopting an answer that is already on screen must drop the
  pending request so its reply is ignored.
- An error hides staleness: the error paths (`:122`, `:135`) keep the previous
  `study` and set `key`, so `stale` is false and the panels show an error
  beside undimmed numbers from another run. Track which key the stored study
  is for separately from which key was last answered; `stale` is true
  whenever the study on screen is not for the current key.
- Progress from a superseded run lingers: posting a new request (`:184-199`)
  leaves the old `progress` in place. Clear it at the post (inside the timer
  callback — state is only ever written from a callback in this hook).
- A worker that cannot be built flickers: once `workerFactory` has returned
  null, every new key reads `running` for the settle period and then
  `unavailable` again, which makes the sun study swap its envelope out and
  back on every edit (`useSunDayStudy.js:96-106`). Once unavailable, stay
  `unavailable` across keys; the timer still retries the factory, and a retry
  that succeeds clears it at the post.

`studyWorkerLifecycle.dom.test.jsx` has a fake `Worker`; extend it to deliver
`result`, `error` and `progress` messages. Also run
`useSunDayStudy.dom.test.jsx`, `src/analysis/*.test.js` (the request-identity
and latest-request tests) and the DaylightPanel / SolarAccessPanel /
SunStudyPanel tests.

### B4. Wall detail editor: a click is not a move, a face change is a reset

`WallDetailEditor.jsx`:

- `:2004` commits a "move" when press and release differ by 1 mm of model
  distance — about one pixel at fit zoom — and the commit rewrites a generated
  board, stud or screw layout as CUSTOM, freezing the whole pattern. The
  ceiling editor fixed exactly this with a pixel rule,
  `Math.max(1, unitPx * 2)` (`CeilingDetailEditor.jsx:1528-1532`, and `:1607`
  for dimension moves), pinned by `CeilingDetailEditor.dom.test.jsx` (~447,
  ~462). Port the rule and those two tests to the wall editor, using the wall
  editor's own model-units-per-pixel measure; check the wall's dimension-move
  commit for the same millimetre threshold.
- `chooseSide` (`:1046-1051`) clears `selection` and `gesture` but not
  `panelTrace` or `dimensionAcquisition`; the 3D-pane pick (`:1060-1071`)
  turns the elevation around without clearing `gesture` or `panelTrace`. A
  half-drawn trace or a measurement waiting for its second click then lands
  on the other face. Both must clear everything `chooseCanvasTool`
  (`:1039-1044`) clears for an in-flight gesture.

### B5. Escape in a field does not cancel a trace

The trace-Escape listeners (`WallDetailEditor.jsx:~773`,
`CeilingDetailEditor.jsx:~721`) skip the typing-target check the shortcut
handlers beside them have, so Escape inside a number field also cancels an
open trace. Add the same check.

Tests to run: `src/features/floorplan/components/preview/*.test.*`,
`src/features/floorplan/hooks/*.test.*`,
`src/features/floorplan/components/wall-detail/*.test.*`,
`src/features/floorplan/components/ceiling-detail/*.test.*`.

## 6. Package C — Sketch Studio CAD workstation

Files: `src/features/sketchstudio/cad/CadWorkspace.jsx`,
`src/features/sketchstudio/cad/toolSession.js` (new), and their tests. Do not
touch `CadViewport.jsx`, `placement*.js` or `useCadModel.js`.

Context: `CadWorkspace.jsx` (4,300 lines) encodes "which tool is active" in
`operationDraft` (:231), `sketchSession` (:342), `mateSession` (:349),
`measureSession` (:352), `holeMode` (:373), `panel` (:376) and `busy` (:378).
Each `start*` clears a different subset of the others, and "is another tool
active" is re-listed by hand in eight places that disagree (`:508`, `:512`,
`:574`, `:587`, `:2053`, `:2350`, `:2695/2702`, `:2881`). Those eight lists
are NOT to be unified in this pass — some differences may be deliberate —
they go in the registry.

### C1. `toolSession.js` (new, pure)

- `MATE` (`defineMachine`): `idle --START--> moving`,
  `moving --PICK--> target`, `target --PICK--> placed`, and `END` from every
  non-idle state back to `idle`. `mateSession === null` is `idle`. The three
  places that write a mate `stage` (`startMate` :1097, `pickMateFace`
  :1117/:1144/:1156) take the next stage from the table.
- `PDF_RUN` (`defineMachine`) for `pdfRun.stage` (:400; `null` is `idle`):
  `idle --START--> working`, `working --REPORT--> report`,
  `working --DONE--> idle`, `working --CANCEL--> idle`,
  `report --SKIP--> working`, `report --FIT--> refit`,
  `report --DISMISS--> idle`, `refit --START--> working`,
  `refit --CANCEL--> idle`. Adjust to the code (`runSheetsPdf` :1633-1751,
  `fitPdfSheet` :1753, `pdfActions` :1757, refit effect :1768) and report the
  final table. Wire the stage writes through it only where that needs no
  restructuring of `runSheetsPdf`.
- `activeTool({ operationDraft, sketchSession, mateSession, measureSession,
holeMode })` → `'operation' | 'sketch' | 'mate' | 'measure' | 'hole' | null`,
  with a test. Used by C4 below.

### C2. A placed mate no longer locks the workspace

Trigger: Assemble → Mate faces → pick a face → pick a face on another part
(stage `placed`, the move is committed at :1157) → click any part, empty
space or tree row. That runs `pickInstance` → `select` →
`resetSelectionTools` (:614-621), which closes the panel but leaves
`mateSession` set. The Escape handler is only wired while a face is being
picked (`pickingFace`, :2050-2066), the ribbon is disabled while
`mateSession` is set (:2354), and Done/Cancel were on the panel that is gone.
Nothing on screen can end the session.

`resetSelectionTools` ends a mate session. From `placed` that keeps the
committed move (the same result as Done without the gizmo change); from
`moving`/`target` nothing had been committed. Check every caller of `select`
and `selectNodes` first — `pickMateFace` itself must keep using
`setSelectedId`/`setSelection` directly so it does not end its own session.

### C3. Selecting during an operation restores isolation

`resetSelectionTools` drops `operationDraft` (:616) without what
`cancelOperation` (:862-867) does: `changePlacement` (:789-799) may have set
`isolated = true`, and it stays on for the newly selected part. When
`resetSelectionTools` drops an open draft it restores
`operationDraft.previousIsolation`. `applyOperation` (:834-853) sets the same
value before it calls `select`, so it must stay correct there.

### C4. "Apply and place another" does not open over another tool

The `reopen` effect (:854-861) checks only `operationDraft` and
`runtime.ready`. Press S (New sketch) between the apply and the rebuild and it
opens a hole draft on top of a sketch pick. If another tool is active
(`activeTool(...)` is not null) when the effect would fire, the pending
reopen is dropped.

### C5. Place / Move holes are unavailable during a mate

The two buttons (~:2695, ~:2702) are disabled only for a draft or a sketch.
During a mate they open the hole panel while clicks keep driving the mate.
Disable them while `mateSession` or `busy` is set, as the ribbon already is.

### C6. The status-bar Cancel ends the export it cancels

Footer Cancel (:4312-4317) bumps `exportGeneration`, cancels the runtime and
clears `busy`, but resets neither `exportingType` nor `pdfRun`; the run's own
`finally` (:1744-1750) skips its reset because the generation moved on. The
Sheets panel then shows a "working" PDF run whose Cancel does nothing and the
ribbon's Export PDF button stays busy. Make that Cancel one owned function
that also aborts a working PDF run's controller and clears `exportingType`
and `pdfRun`. `CadWorkspace.pdf.dom.test.jsx` covers the panel Cancel; add
the footer case.

Tests to run: `src/features/sketchstudio/cad/CadWorkspace*.test.*`,
`rotateKeys.test.js`, and your new tests. `CadWorkspace.place.dom.test.jsx`
has one case ("Flip side" / "three holes") that is known to time out at 5 s
when the machine is loaded and passes alone: re-run it alone before calling
it a failure.

## 7. Package D — Sketch Studio 2D

Files: `src/features/sketchstudio/hooks/**`, `store/**`,
`components/SketchStudioLayout.jsx` and `components/TopBar.jsx` (D5 only),
and their tests. Not `cad/` (package C).

### D1. One table for how an interaction ends — Named

`interaction.mode` (`store/sketchStudioInitialState.js:53-66`) is ended in
four places that disagree: pointer-up (`useSketchPointer.js:446-504`),
pointer-cancel (`:518-540`), Escape (`useSketchKeyboard.js:152-166`) and undo
(`useSketchHistory.js:17-49`). New pure module `store/interactionEnd.js`: for
each mode and each cause (`release`, `abort`, `escape`, `undo`) the outcome
`commit`, `cancel` or `end`:

| mode          | release | abort  | escape | undo   |
| ------------- | ------- | ------ | ------ | ------ |
| panning       | end     | end    | end    | end    |
| selection-box | end     | end    | end    | end    |
| handle-drag   | commit  | commit | cancel | cancel |
| anchor-drag   | commit  | commit | cancel | cancel |
| transform     | commit  | commit | cancel | cancel |

All three call sites other than pointer-up take what to dispatch from the
table; pointer-up keeps its own extra work (selection, click suppression,
pointer capture) but must agree with the `release` column, pinned by a test.
What changes for the user is the `escape` column only: today Escape COMMITS a
transform (`endTransform`), and does nothing for a handle drag, a pan or a
marquee. After: Escape during a drag puts the geometry back, adds no history
entry, and keeps the selection the drag started with. Read
`restoreUndoableSnapshot` and the `CANCEL_*` cases in
`store/sketchStudioReducer.js` to see what a cancel restores; if a cancel
clears the selection today, Escape must still end with the pre-drag selection.
The button is still down when Escape cancels, so the release that follows
must not act as a click on whatever is under the cursor (`suppressNextClick`).

### D2. A middle-button pan does not eat the next click

`useSketchPointer.js:448-452` sets `suppressNextClick` on every pan release.
A middle-button release produces no `click`, so the flag stays and swallows
the next left click. Set it only when the release will be followed by a
click (the primary button).

### D3. Tool shortcuts wait for a drag to finish

`useSketchKeyboard.js:106-113` switches tool with no mode guard.
`SET_ACTIVE_TOOL` (`sketchStudioReducer.js:227-254`) then nulls `transform` /
`handleDrag` without finalising the undo entry, so the moved geometry stays
and the next undo reverts the drag together with the action before it. Tool
shortcuts are ignored while an interaction other than idle is in flight.

### D4. Hover tools: undo passes through, Escape leaves the tool

Fillet, chamfer, trim, extend and fastener keep a "hover draft" that pointer
move recreates (`useSketchPointer.js:~291-367`). Declare that set once
(`HOVER_DRAFT_TOOLS` in `hooks/sketchConstants.js`; confirm the members from
the move handler).

- `useSketchHistory.js:43` exempts only `fillet` from "undo cancels the
  draft", so with chamfer, trim, extend or fastener active every undo is
  swallowed. Exempt the whole set.
- `useSketchKeyboard.js:157-164`: Escape leaves fillet and chamfer for the
  select tool, but for trim, extend and fastener it only cancels a draft the
  next mouse move recreates, so it appears to do nothing. Same rule for the
  whole set.

### D5. Document persistence — Explicit

`hooks/useSketchPersistence.js`: `documentPersistenceMeta.status` is one of
`idle`, `recovered`, `opened`, `saving`, `saved`, `error`, `dirty`, written
from mount recovery (:87-114), the dirty effect (:139-152), `applyWorkspace`
(:154-179), import, open and save (~:220-333). New
`hooks/sketchPersistenceMachine.js` with `defineMachine`; every status write
goes through it. Derive the table from the code and report it.

- A save error sticks: the dirty effect spreads `current` and never clears
  `error`, the label checks `error` first (`components/TopBar.jsx:~10`), and
  the error toast's `onDismiss` is a no-op
  (`components/SketchStudioLayout.jsx:~373`). The error clears when the status
  next changes, and dismissing the toast clears it.
- Closing the save picker resets the status to `idle`/`dirty` (~:310-314),
  losing `opened`, `recovered` or `saved`. It returns to the status it had
  before the save started.
- The consumers' reads (`isDirty` first, then `status`/`error`) keep working
  unchanged: `useSketchStudio.js:~280`, `TopBar.jsx`, and
  `cad/CadWorkspace.jsx:~3133, ~4324` (read-only for you).

Tests to run: `src/features/sketchstudio/hooks/*.test.*`,
`src/features/sketchstudio/store/*.test.*`,
`src/features/sketchstudio/components/*.test.*`.

## 8. Found and deliberately not changed

These are in the registry. Each needs a product decision, a real GPU or
browser to verify, or has only a suspected trigger.

- Floorplan "saved" means "in the browser draft", not "in the file that was
  opened": five seconds after an edit the close guard is off while the .json
  on disk is stale.
- WebGL context loss in the 3D preview has no lost/restored handling.
- Save image can write an X-ray file name on a Solid picture during a first
  see-through compile.
- Elevation window drag has no click threshold.
- Sketch Studio: hovered entity is not resolved for the mirror and fastener
  tools, so "click a line to mirror about it" and fastener part targeting are
  unreachable; `recovered` counts as clean, so New/Open replace recovered work
  without a prompt; the three commit paths (click, Enter, precision HUD) have
  drifted.
- Lifecycle overview shows "ready" for structure, systems and spaces when
  they are stale; an accepted command remounts a stage and wipes sibling
  drafts; `SunStudyPanel.addTarget` patches even when its command is rejected.
- CAD: the eight "another tool is active" lists; "Fit to page" then Undo may
  wait on the preflight spinner.
- `ENTER_TOOL` compound action for the floorplan's hand-repeated
  `SET_TOOL → SELECT_OBJECT → UPDATE_TOOL_STATE → SET_STATUS_MESSAGE` ritual.
- Shared canvas gesture hook for the wall and ceiling detail editors;
  `SheetCanvas` lost-pointer reset; `ErrorBoundary` retry returning to an
  empty project; Electron crash-loop blank window.

## 9. Gate (main session)

`npx eslint src/` 0 errors, warnings ≤ 42. `npx vitest run` all green
(baseline 5616 passed, 1 skipped, 472 files, plus the new tests).
`npx vite build` succeeds. Each fix's test seen red on the old code.
