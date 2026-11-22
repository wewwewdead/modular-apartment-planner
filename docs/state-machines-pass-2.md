# State machines, second pass — build spec

2026-11-21. Source: a second whole-app audit for implicit state machines,
twelve days and about 88,000 lines after the first (`docs/state-machines-pass.md`).
Nine read-only auditors, one per subsystem; the main session re-verified the
hazards it cites as decided below against the source. The registry is
`docs/state-machines.md` (front page) and one page per subsystem under
`docs/state-machines/`.

The auditors' full reports (inventories, line-by-line paths, tables) were
written to the session scratchpad and are named in each builder's prompt.
They are working notes, not part of the repo: everything a later reader needs
is in this spec and on the registry pages.

## 1. The decision

Same three treatments as the first pass (Explicit, Named, Left), still no
state-machine library and no rewrite of a large file. What this pass adds:

1. **The registry is split and guarded.** One 349 KB page of padded tables
   became a front page and nine pages of at most 36 KB, with no tables.
   `src/shared/machineRegistry.test.js` now also fails when a page grows past
   64 KB, carries a line over 400 characters or a table row, or names a file
   that does not exist. Done by the main session before the build.
2. **Every verified hazard that is a missing or drifted transition is
   fixed**, with a test seen red first. About sixty, listed per package below.
3. **The first pass's open items are decided**, not carried again. The owner
   asked twice for "the best decision"; §11 lists each one and what was
   chosen. The largest: a floorplan project opened from a file now knows when
   that file is behind, and says so (§4, B1).
4. **Six new Named definitions** where a rule had three or more hand copies:
   the CAD workspace's "which tools are open" (14 hand-written lists), the
   sketcher's "no mode" (six hand-copied resets), the detail editors' canvas
   rules, the floorplan's "enter a tool with a selection" ritual, "leave the
   outgoing project", and one click threshold for the CAD viewport.
5. **One new Explicit machine**: the 3D preview's load phase, which gains a
   terminal `lost` state for a lost WebGL context.
6. **A sixth rule** on the front page: a lost release ends the drag.

Not changed, on purpose: the plan canvas pan/zoom path, the progressive
renderer and its frame policy, the store's drag-gesture protocol, the kernel
worker's keep-alive contract, and the geometry of any tool.

## 2. Rules for every builder

1. **Re-verify before changing.** Each item cites the code as an auditor read
   it on 2026-11-21. Read it yourself first. If the hazard is not as
   described, change nothing for that item and report what you found.
2. **Red first.** For each fix write the test that proves the hazard, run it,
   see it fail for the stated reason, then fix. If a red test cannot be
   written (it needs a real browser, a GPU, pointer lock or Electron), say so
   and make the change only when the code path is unambiguous from reading.
   An item marked SUSPECTED is fixed only if you can write its red test.
3. **Nothing else changes.** No refactor beyond the item, no reformatting, no
   renames, no dependency. An existing test that fails after your change is a
   finding: work out whether the test pinned the bug (then correct the test
   and say so in the report, with the reason) or you broke something (then
   fix your change).
4. **A Named definition must be behaviour-neutral where it replaces a copy.**
   When a hand-written expression becomes a call to the one definition, add a
   test that compares the old expression (kept in the test as a frozen
   function) with the new one over every combination of its inputs. The only
   differences allowed are the ones this spec lists as fixes.
5. **Stay in your package.** Other builders are editing other folders of this
   working tree at the same time. Touch only the files your package lists.
   Never run a git command that changes the tree or the index (no stash,
   checkout, restore, reset, add, commit).
6. **Run only your tests.** `npx vitest run <files>` for the files your
   package lists plus the ones you add; `npx eslint <touched files>`;
   `npx prettier --check <touched files>` (`--write` on files you created or
   whose check your edit broke). Never the whole suite: the machine is short
   of memory and two other builders are running. The main session runs the
   full gate afterwards.
7. **Write like the file you are in.** Plain JavaScript. Match the
   surrounding comment density and voice: comments here say why a rule exists,
   in plain prose. No audit labels (H1, "package C", "pass 2") in code or test
   names.
8. **Update your registry page.** Each package owns one page under
   `docs/state-machines/`. For every machine you changed, rewrite its entry so
   it is true; fix the drift your auditor listed for that page (§2 of their
   report); add an entry for each machine the page lacks. Keep the entry
   fields (**Where**, **States**, **Treatment**, **Notes**, **Open**). No
   tables, lines under 400 characters, wrap prose at about 80. Close an
   **Open** note you fixed by deleting it. Do not edit the front page,
   another package's page, or `src/shared/machine.js`. Run
   `npx vitest run src/shared/machineRegistry.test.js` before you report.
9. **Report** per item: done / not done and why; files and lines changed; the
   tests added and that each was seen red then green; every judgment call;
   anything in the code that contradicts this spec; the exact commands you ran
   with pass and fail counts.

## 3. Package A — floorplan editor tools and store

Files: `src/editor/**`, `src/features/floorplan/store/floorplanReducer.js`,
`src/features/floorplan/FloorplanWorkspace.jsx` (`FocusEscapeGuard` only),
the sites of the enter-tool ritual (A9), the fillet radius field in
`src/ui/PropertiesPanel.jsx` or wherever it lives (A8), and their tests.
Page: `docs/state-machines/floorplan-editor.md`.

- **A1. A double-click on an outline writes back what it trimmed.**
  `slabPlaceHandler.js:105-106`, `ceilingPlaceHandler.js:164-166`,
  `roofOpeningPlaceHandler.js:79-81`: `onDoubleClick` drops the repeated last
  corner, then returns when fewer than three remain without storing the
  trimmed list, so the duplicate stays and later commits as a zero-length
  edge. Store the trimmed list. And when one point or none remains, clear the
  flow: that is the double-click on the first corner, whose first press has
  already closed the outline and whose second has started a stray new one.
  The three bodies are identical: one shared function in
  `handlers/handlerSnapUtils.js` beside `dropTrailingRepeatedPoints`.
- **A2. Roof parapet and drain double-clicks.**
  `roofParapetPlaceHandler.js:27-55`: a double-click on a roof edge creates
  the parapet and the second press starts a stray free one.
  `roofDrainPlaceHandler.js:6-17`: a double-click stacks two drains. Apply
  the rule the first pass gave the single-click placers (an identical object
  already exactly there is not placed again) and extend
  `doubleClickSequences.test.js` with the real press, press, double-click
  sequence for both.
- **A3. Delete during a drag ends the drag.** `selectHandler.js:1070-1103`:
  Delete runs the delete and `DESELECT` but not the idle reset, so the release
  commits an update for the deleted object ("Edit blocked: it would break the
  wall model"). `roofSelectHandler.js:327`: `if (!selectedId) return` sits
  before the Escape branch at `:348`, so after a Delete mid-drag `dragging`
  stays set and Escape is dead until the release. Delete mid-drag writes
  `IDLE_DRAG_STATE` (select) and clears the roof drag fields; the roof
  handler's Escape branch runs whenever a drag is live.
- **A4. Elevation window drag: a click is not a move, Escape reverts.**
  `elevationSelectHandler.js` has no pending threshold and no Escape branch.
  Port the select tool's pending rule (the same pixel threshold) and Escape →
  `CANCEL_DRAG_GESTURE`. Add its drag marker to `FLOW_MARKER_KEYS` only if
  the new Escape clears it (the invariant in `toolSession.js`).
- **A5. Escape on a slab edge drag leaves no undo step.**
  `selectHandler.js:1031-1044` restores the boundary with a second
  `SLAB_UPDATE`, which records a no-op history entry (rule 4). Revert through
  the gesture cancel instead, as the other drags do.
- **A6. One selection reset.** `START_PASTE_PREVIEW`
  (`floorplanReducer.js:1823-1833`) and `OPEN_WALL_DETAIL_EDITOR` /
  `OPEN_CEILING_DETAIL_EDITOR` (`:1531-1554`) hand-write part of
  `clearSelectionState`; `selectedOverhangEdge` survives and stays
  highlighted. Build all three on `clearSelectionState`. A paste started
  mid-flow also drops the tool's flow markers (keep armed settings:
  `keepArmedSettings`).
- **A7. Leaving a project — Named.** `PROJECT_LOAD` and `PROJECT_NEW`
  (`floorplanReducer.js:484-516`) spread the outgoing `editor` and reset two
  fields. A half-drawn wall, the selection, a paste preview, an open wall or
  ceiling detail editor and the active section cut survive into a project
  where their ids mean nothing (today a floor-id effect in `useFloorplan.js`
  clears some of it by accident, and not when the floor ids match). One pure
  `leaveProject(editor)` used by both cases: tool back to select, tool state
  empty, `clearSelectionState`, paste preview off, both detail editors
  closed, section cut cleared, the two hidden-board maps emptied. Everything
  that is a view preference (viewport, grid, snap, plan style, view mode,
  panel layout, study settings) stays as it is today.
- **A8. Small ones.** Electrical tool: F writes `previewSide`
  (`electricalPlaceHandler.js:121-131`) and the next pointer move overwrites
  it from the cursor (`:77`); the flipped side must hold until the cursor
  crosses to another wall. The fillet radius field in the properties panel
  changes the radius without redrawing the preview (the keys do, since the
  first pass): same recompute. `ARMED_SETTING_KEYS` (`toolSession.js:23`):
  the door's `openDirection` and the fixture's `previewRotation` are armed
  values that a floor or view change resets; add each only after reading its
  handler with the rest of `toolState` empty, and correct the file's comment
  about the truss keys if it is wrong. `FocusEscapeGuard`
  (`FloorplanWorkspace.jsx:98-106`): an Escape pressed while a wall or
  ceiling detail editor is open does not also leave focus mode behind it.
- **A9. `enterTool` — Named.** The ritual `SET_TOOL → SELECT_OBJECT →
UPDATE_TOOL_STATE → SET_STATUS_MESSAGE` is hand-written at about ten sites
  (`addCeilingEntry.js:33/64`, `SlabProperties.jsx:147`, `Toolbar.jsx:160`,
  `SvgCanvas.jsx:779/843`, the four return-to-select sites in
  `cantileverHandler.js`). One function in `src/editor/toolSession.js`,
  `enterTool(dispatch, { tool, selection, toolState, statusMessage })`, that
  sends the same actions in the same order and skips the ones a site does not
  send today. It is a function over `dispatch`, not a new reducer action: the
  sequence of actions each site produces must be identical before and after
  (pin it per site with a recording dispatch). Leave the navigation sequences
  in `Sidebar.jsx`, `TrussProperties.jsx` and `RoofProperties.jsx` alone.
  Because other packages own `Toolbar.jsx` and `SvgCanvas.jsx` later, touch in
  them only the ritual lines.

Tests to run: everything under `src/editor/`,
`src/features/floorplan/store/*.test.js`,
`src/features/floorplan/context/*.test.*`,
`src/features/floorplan/components/renderers/canvasKeysAndRelease.dom.test.jsx`,
`canvasDragCoalescing.dom.test.jsx`, `Toolbar.dom.test.jsx`, and the tests of
every ritual site you touch.

## 4. Package B — floorplan shell: save, open, dialogs

Files: `src/features/floorplan/hooks/useFloorplan.js`,
`src/persistence/useAutosave.js`, `src/persistence/fileTransfer.js` (read),
`src/features/floorplan/context/FloorplanContext.jsx` (publish one value),
`src/features/floorplan/components/Toolbar.jsx` (the Save control only),
`src/ui/Modal.jsx`, `src/app/ErrorBoundary.jsx`, `electron/main.cjs`,
`src/features/floorplan/components/ProjectLifecyclePanel.jsx`
(`deriveLifecycleStatus` only), and their tests.
Page: `docs/state-machines/floorplan-shell.md`.

- **B1. The file knows when it is behind.** Today "saved" means the browser
  draft. Open `plan.json` from disk, edit, wait five seconds: autosave sends
  `MARK_SAVED`, `isDirty` goes false, and the close guard
  (`useFloorplan.js:130`), the four "Unsaved changes will be lost" prompts
  (`:177, 287, 314, 334`), the Save dot (`Toolbar.jsx:150, 364`) and
  Electron's close dialog all go quiet while the file on disk is stale. The
  work survives only as a browser draft that reloads with no file binding.
  Decision: a project bound to a file handle tracks the version that file
  holds.
  - In `useFloorplan`, the handle and the version it holds are ONE state
    object (`{ handle, version }` or `null`), so no path can set one without
    the other: adopted with the loaded project's version at
    `commitLoadedProject` (a load from the picker), replaced with the written
    version when `handleSave` succeeds, `null` for a new project, a draft, an
    import without a handle and an archive.
  - `fileBehind` is derived, never stored: a file is bound and its version is
    not the store's `changeVersion`.
  - The close guard and the four prompts read `isDirty || fileBehind` (still
    never in the demo, see B5). Autosave keeps reading `isDirty` alone: it
    still targets the draft, and the reducer does not change.
  - The Save control shows the unsaved state while `isDirty || fileBehind`,
    and its title says which: not saved at all, or "saved as a browser draft,
    not yet in <file name>". Publish `fileBehind` (and the file name) through
    `FloorplanContext` next to `isDirty`.
  - A project with no file bound behaves exactly as today.
- **B2. A crash or a leave does not drop the last five seconds.**
  `useAutosave.js:23`: the cleanup only clears the timer, so a render crash
  (the boundary is above the provider) or leaving the route inside the five
  seconds loses the edits made since the last autosave. When the hook
  unmounts while dirty, write the draft once, best effort (a ref holds the
  latest project and dirty flag; the unmount-only effect reads them). Not on
  an ordinary re-run of the timer effect.
- **B3. A dead file handle is not a trap.** `useFloorplan.js:198-202`: a save
  that fails for any reason but a closed picker keeps the bound handle, and
  there is no Save As, so every later Ctrl+S fails the same way. On such a
  failure drop the binding (B1's object goes `null`) and say in the status
  message that the next save will ask where to put the file.
- **B4. Escape closes the top dialog only.** `Modal.jsx:7-13` adds a window
  listener per instance, so Escape on the "discard changes?" confirm also
  closes the Open Project dialog under it. A module-level stack (push on
  mount, pop on unmount); only the top modal acts, and it calls
  `preventDefault()` so `FocusEscapeGuard` (which honours
  `defaultPrevented`) stands down. `Modal.dom.test.jsx:40-54` pins that the
  event still propagates: keep that.
- **B5. The playground guards real work.** `useFloorplan.js:110, 130`
  switch autosave and the close guard off for the whole playground, but Open
  Project there loads a real draft. Autosave and the guard are off only while
  the project on screen is still the demo the playground started with.
- **B6. Small ones.** Share reports a failure the way Save does
  (`useFloorplan.js:206-213` only logs it). Ctrl+S ignores key repeat
  (`:227`). A save that lands after the project was replaced does not bind
  its file to the new project or mark it saved (`:185-197`: compare the
  project id captured at the start). `deriveLifecycleStatus`
  (`ProjectLifecyclePanel.jsx:196-237`) reads `outOfDate` for structure,
  systems and spaces the way it already does for quantities and documents
  (`:244-248`), so a stale stage reads "attention", not "ready".
  `electron/main.cjs:116-123`: after the crash limit the window stays blank
  with no message; ask (Reload / Quit) with the `dialog` the file already
  uses, and make the comment and the limit agree. There are no tests for
  `main.cjs`: `node --check electron/main.cjs` is the gate, and say so.

Tests to run: `src/features/floorplan/hooks/*.test.*`,
`src/persistence/**/*.test.*`, `src/ui/*.test.*`, `src/app/*.test.*`,
`src/features/floorplan/components/Toolbar*.test.*`,
`src/features/floorplan/components/ProjectLifecyclePanel*.test.*`,
`src/features/floorplan/context/*.test.*`, `src/routes.dom.test.jsx`.

## 5. Package C — 2D canvases and the detail editors

Files: `src/features/floorplan/components/renderers/SvgCanvas.jsx`,
`SheetCanvas.jsx`, `src/features/floorplan/components/wall-detail/**`,
`ceiling-detail/**`, `src/features/floorplan/hooks/useSectionDrawables.js`,
and their tests. Page: `docs/state-machines/canvas-detail-editors.md`.

- **C1. Sheet viewport drag.** `SheetCanvas.jsx:99-289`: Escape does nothing
  during a move, resize or rotate (rule 4: dispatch `CANCEL_DRAG_GESTURE` and
  drop the drag); there is no `lostpointercapture` or blur exit, and
  `handlePointerMove` never checks `event.buttons`, so a lost release leaves
  the viewport following the mouse (rule 6).
- **C2. Plan tool press ends on blur.** `SvgCanvas.jsx:365-371, 442`: window
  blur ends a pan and the store gesture but not `toolPointerRef`. Alt-Tab
  with the button held, come back, keep dragging: one drag records an undo
  entry per frame. Blur ends the tool press the way pointer-cancel does.
  Do not touch the pan/zoom path.
- **C3. `detailCanvasRules.js` — Named.** New pure module in `wall-detail/`,
  imported by both editors: the click-versus-drag threshold in pixels (the
  `Math.max(1, unitPx * 2)` rule both carry), the same rule for a
  dimension-endpoint grip (today a bare click on a grip commits with no
  travel test: `WallDetailEditor.jsx:2165-2187`,
  `CeilingDetailEditor.jsx:1621-1641, 1674-1682`), the typing-target check
  (six inline copies; `src/utils/keyboard.js` already has `isTypingTarget`),
  and the Space latch decision. (As first written this item also made Space
  press a focused button instead of panning. That was taken back during the
  build: see §13.)
- **C4. The two editors agree.** Escape: the wall editor's first Escape can
  be eaten by the hover marker (`WallDetailEditor.jsx:2640`); the ceiling's
  order is right (`CeilingDetailEditor.jsx:2082`). Delete or Backspace during
  a gesture cancels the gesture first (both: `:2653-2657`, `:2096-2100`). The
  Fit key during a gesture releases the ceiling's pinned rect
  (`:2111-2114`) as zoom does (`:1176`). `pointerleave` clears the ceiling's
  measure marker as the wall's does. A wall tool that becomes unavailable
  after a face or material change (Accent: `:1957, 2676-2700`) falls back to
  Select instead of staying armed and dead.
- **C5. Small ones.** `SvgCanvas.jsx:692-695` replays an old
  `lastRejection` toast every time the canvas remounts: show a rejection
  once. `useSectionDrawables.js:140` has no `.catch`: a throwing job must
  end in the hook's failed or stale state, not leave "loading" up forever.

Tests to run: `src/features/floorplan/components/renderers/*.test.*`,
`wall-detail/*.test.*`, `ceiling-detail/*.test.*`,
`src/features/floorplan/hooks/*Section*.test.*`,
`DeferredSectionDrawing.dom.test.jsx`.

## 6. Package D — 3D preview and studies

Files: `src/features/floorplan/components/preview/**`,
`src/features/floorplan/components/SunStudyPanel.jsx`, their tests, and one
line of `MACHINES` in `src/shared/machineRegistry.test.js`.
Page: `docs/state-machines/preview-studies.md`.

- **D1. Walk mode gives Space back.** `createWalkNavigation.js:136-142`: the
  key-up handler swallows movement keys with no lock check, while key-down
  (`:91`) lets them through when the pointer is not locked. Walk on, pointer
  unlocked, Space over the plan: the plan canvas sets its pan latch on
  key-down and never sees the key-up, so every plan click pans until walk is
  left. Key-up passes through whenever key-down would have.
- **D2. `preview-load` — Explicit, with a `lost` state.** The viewport's
  `loadPhase` (building → compiling → ready → waking → …) becomes a
  `defineMachine` table in a new `preview/loadPhase.js`; every write of the
  phase goes through it. Derive the table from the code (the auditor found
  `building → ready` and `waking → compiling` missing from the registry) and
  pin each move. Add `lost`: on the canvas's `webglcontextlost` the viewport
  stops its loop, reports `lost`, and nothing but a remount leaves it (a
  compile that resolves afterwards must not flip it back to `ready`: that is
  what the table is for). The panel shows `lost` through its existing failure
  state with the existing "Try again" (`ThreePreviewPanel.jsx:1008-1012`,
  which remounts); Save image is off while lost. No in-place restore. Do not
  touch the progressive renderer, the frame policy or the compile gate.
  A jsdom test can dispatch `webglcontextlost` on the canvas; the main
  session checks the real thing in Chrome with `WEBGL_lose_context`.
- **D3. Save image names what is on screen.** `ThreePreviewPanel.jsx:419`
  names the file after the requested view mode; during a first see-through
  compile the picture is still Solid. Use the viewport's `getViewMode()`.
- **D4. A rejected target is not adopted.** `SunStudyPanel.jsx:340-348`:
  `addTarget` patches `targetId` and clears the form even when the command is
  rejected (a bow-tie polygon), erasing what was typed and pointing at a mask
  that does not exist. Patch and clear only when the command was accepted.

Tests to run: `src/features/floorplan/components/preview/*.test.*`,
`src/features/floorplan/components/SunStudyPanel*.test.*`,
`src/features/floorplan/hooks/*.test.*`,
`src/shared/machineRegistry.test.js`.

## 7. Package E — Sketch Studio 2D

Files: `src/features/sketchstudio/hooks/**`, `store/**`, `components/**`,
and their tests. Not `cad/`. Page: `docs/state-machines/sketch-2d.md`.

- **E1. Escape works from the precision HUD.** The HUD input takes focus when
  a draft starts (`components/PrecisionHud.jsx:6-11`) and handles only Enter;
  `useSketchKeyboard.js:77` returns for editable targets before its Escape
  branch. Escape in the HUD does what Escape on the canvas does.
- **E2. Handles belong to the Select tool.** The selection overlay and
  endpoint handles are live under every tool (`DraftingCanvas.jsx:351-362`,
  `TransformOverlay.jsx:29-37`, `useSketchTransform.js:10-31, 67-74`). A
  commit leaves the new entity selected with the tool still armed, so a
  click on the end of the line just drawn, to start the next one there,
  starts a handle drag instead. With a tool other than Select armed the
  handles and the move frame take no presses.
- **E3. Mirror about a line, fasteners on a part.**
  `useSketchViewport.js:91` resolves the hovered entity only for select,
  offset and fillet, so `useSketchToolClick.js:168` (mirror about a clicked
  line) never fires and a fastener's `targetPartId` is always null. One
  `HOVER_ENTITY_TOOLS` set in `hooks/sketchConstants.js`; and the mirror
  branch's `!snap.point` guard (always false with snapping on) becomes the
  ortho-override test the file already uses. `modifyToolClick.dom.test.jsx:192`
  injects the hovered entity, which hid this: add a test that goes through
  the pointer move.
- **E4. Recovered work is not replaced without asking.**
  `useSketchPersistence.js:101, 171-174`: recovery sets the dirty baseline to
  the recovered document, so New, Open and Import replace it unprompted and
  autosave then overwrites the one recovery slot. Confirm when the status is
  `recovered` as well as when dirty.
- **E5. Undo keeps the fillet radius.** Radius and chamfer distance live in
  `draft.precisionInput`; `restoreUndoableSnapshot`
  (`store/sketchStudioReducer.js:187`) wipes the draft. For the hover-draft
  tools the typed value survives an undo or redo.
- **E6. Keys wait for a drag.** Delete, the arrow nudges and group keys act
  during a move drag (`useSketchKeyboard.js:211-215`); the next mouse move
  re-translates the drag's start entities and brings the deleted ones back.
  They are ignored while `isInteractionInFlight`, as tool shortcuts already
  are. Redo mid-gesture ends the gesture through the `undo` column of
  `INTERACTION_END` (`useSketchHistory.js:33-39`).
- **E7. Commit paths.** Three paths commit a draft (canvas click, Enter,
  the HUD) and have drifted. Not unified in this pass (three hooks, forty
  cells). Fix only: after `[` or `]` the fillet and chamfer preview is
  recomputed with the new value, so Enter and click agree; Enter in the HUD's
  radius or distance box applies at the hovered corner instead of doing
  nothing; Enter on a polyline closes it only under the rule a click uses
  (three points and the cursor on the first), otherwise it commits it open;
  delete the dead mirror branch in `useSketchDraftCommit.js:184-197`. Write
  the per-tool table of the three paths into the registry page as a list.
- **E8. A lost release ends the gesture.** Window blur, and a pointer move
  with no button held, end an in-flight gesture through the `abort` column
  (`useSketchPointer.js`, `useSketchKeyboard.js:348-350`).
- **E9. Dead states go.** `anchor-drag` is unreachable (`startAnchorDrag` is
  never dispatched) and `isPointerDown` is written in fourteen places and
  read nowhere. Remove both, with their rows in `INTERACTION_END` and its
  tests. Nothing is persisted. `drawing` IS reached and read: keep it and
  correct the registry sentence.

Tests to run: `src/features/sketchstudio/hooks/*.test.*`,
`store/*.test.*`, `components/*.test.*`.

## 8. Package F — Sketch Studio CAD workspace

Files: `src/features/sketchstudio/cad/CadWorkspace.jsx`, `toolSession.js`,
and their tests. Not the station code inside `CadWorkspace.jsx` that reads
or writes `brakeSession` / `shopSession` stages (package I, afterwards), not
`CadViewport.jsx`, not the sketcher.
Page: `docs/state-machines/cad-workspace.md`.

- **F1. `openTools` — Named.** "Is another tool active" is hand-written at
  fourteen sites with different members, and every station added since the
  first pass had to be added to each by hand. In `toolSession.js`:
  `openTools(state)` returns the ordered list of every open tool, and
  `activeTool` becomes its first element (so `toolSession.test.js` stands).
  Name the sets the sites need (the tools that leave Measure and the hole
  tool usable; the tools that lock the selection). Convert each site to
  `openTools` plus a named set. Rule 2.4 applies: for each converted site a
  truth-table test proves the new expression equals the old over every
  combination of sessions. Two sites change on purpose, as fixes: the
  Delete-mark key guard (`:1149`) names only the sketcher and must wait for
  every tool; `openSketchDraft` (`:2028`) clears the hole tool as the other
  two operation entries do. Sites the auditor marked as deliberately their
  own rule (the empty-model start screen, the document-level film rule, the
  priority chain) stay as they are, each with a one-line comment saying why
  it is not `openTools`.
- **F2. A new document ends every session.** New, Open and Import swap the
  document under a workspace that only refits (`:583-587`): a sketch in
  progress finishes into the new document, and a mate, a measure, the hole
  tool, a PDF run, the selection and the panel carry over. One effect on the
  document id ends them all (cancel, never commit). Not a `key` on the
  component: the kernel worker must stay alive.
- **F3. "Apply and place another" forgets an undone apply.** The reopen
  effect (`:1589-1599`) returns when `model === reopen.before` and never
  clears `reopen`; Undo restores that same object, so the Hole tool opens by
  itself on some later commit. Seeing the pre-apply model again drops the
  pending reopen.
- **F4. Fit to page, then Undo.** Same shape (`:3534`): the refit never
  fires and the preflight spinner stays. Seeing `pdfRun.before` again ends
  the refit (`refit --CANCEL--> idle`).
- **F5. `busy` has one owner at a time.** Flows A and B (`beginOperation`'s
  references fetch, `requestDrawings`) clear `busy` in an unguarded
  `finally` (`:3132`), which can clear it under a working PDF run; a later
  export then orphans `pdfRun` at `working` with no Cancel on screen. Every
  `finally` checks it still owns the flag (the generation the guarded flows
  already use).
- **F6. Stations and other tools do not open over each other.** A
  `pendingStation` (Paint waiting on the kernel, effect at `:4122`) opens
  over a sketch pick started meanwhile: it is dropped when a tool has opened.
  `startFilm` (`:3756`) leaves Measure and the hole tool live, so
  `activeTool` reads `measure` and Escape removes the film panel: starting
  the replay ends them. The More menu (`:4762-4765`) leaves the open station
  before running a command that may refuse (Ungroup with nothing grouped),
  losing the operator's picks for nothing: the station is left only when the
  command went through. A brake session closed from under its panel (`:811`)
  leaves `panel === 'press-brake'` and a dead Bend button: closing the
  session closes its panel.
- **F7. SUSPECTED, fix only with a red test.** `beginOperation`
  (`:1479-1510`) checks the model after its await but not the selection.

Tests to run: `src/features/sketchstudio/cad/CadWorkspace*.test.*`,
`toolSession.test.js`, `shopRoute.test.js`, `useCadModel.dom.test.jsx`.
Run the `CadWorkspace.*.dom.test.jsx` files a few at a time, not all in one
command; `CadWorkspace.place.dom.test.jsx` has a case that times out at 5 s
under load and passes alone.

## 9. Packages G, H, I — the rest of Sketch Studio CAD

### G. Viewport and layers

Files: `src/features/sketchstudio/cad/CadViewport.jsx`, `shopLayer.js`,
`placementLayer.js`, `placementTool.js`, `FlatPatternMap.jsx`, `brakeHands.js`
(the constant only), and their tests.
Page: `docs/state-machines/cad-viewport.md`.

- **G1. A placement drag ends when its view goes.** `placementLayer.js:1085`:
  `next?.handles?.every(...)` is undefined for a null view, so `cancelDrag`
  is not called; the next move throws in `dragView(null)`
  (`placementTool.js:1601`) and `transform.dragging` stays true, blocking
  shortcuts. A null view cancels the drag.
- **G2. The flat-pattern punch-line drag.** `FlatPatternMap.jsx:100-121` has
  no pointer-cancel, lost-capture, buttons check, blur or Escape exit, and
  its Escape keeps the sent L where the viewport's finger drag reverts.
  Rules 4 and 6.
- **G3. The viewport's press ends with the layer's drag.** `gripPress` is
  not cleared when the shop layer ends the grip drag itself
  (`shopLayer.js:1557, 1677, 1758`; the effect at `CadViewport.jsx:3021-3041`
  re-runs `setStation` on a snapshot or view-mode change): the chip and the
  disabled orbit stay until a release that then does nothing.
- **G4. A swallowed press is not a click.** `pointerDown` (`:2543`) is not
  reached when a capture handler takes the press, so `down` keeps the last
  press; print drag, Escape, then a release within the threshold of the old
  point passes `pointerUp:2557` and commits the selected print there.
- **G5. One orbit hold.** `cancelHoleDrag` (`:1290`) writes
  `controls.enabled = true` on every snapshot change (`:2786`), also in the
  middle of a finger or placement drag. It gives the orbit back only when a
  hole drag was live.
- **G6. One click threshold — Named.** The 4 px rule exists three times
  (`:3484`, a literal at `:2557`, `brakeHands.js:156`). One exported
  constant. And `selectDouble` (`:2462`) is a second copy of the click order
  that lacks the station and outline-picker steps: it defers to the same
  checks.
- **G7.** The `tellView` frame request (`:717-724`) is cancelled on dispose.
  SUSPECTED items H6 to H10 of the report: only with a red test.

### H. Sketcher

Files: `src/features/sketchstudio/cad/sketchTools.js`, `CadSketcher.jsx`,
new `sketchMode.js`, and their tests.
Page: `docs/state-machines/cad-sketcher.md` (one 12 KB sentence today:
rewrite it as modes, the fields each owns, and every way out).

- **H1. `sketchMode.js` — Named.** `NO_MODE` (every mode field at rest,
  `reliefCut` included), `sketchMode(state)` (the one answer to which mode
  this is) and `modeViolations(state)` (a tool with a selection, a box or a
  drag under a tool or an action, an action with nothing selected, a
  selected dimension that no longer exists, a relief readout outside Relief).
  The six hand-copied "leave every mode" lists (`tool`, `select-all`,
  `select-ids`, `startOp`, `stepHistory`'s `transient`, the tool rung of
  `escape`) spread `NO_MODE`; `stepHistory` keeps the tool. A seeded
  random-walk test dispatches every action type and asserts no violation
  after each step; it must fail on today's code for H2 to H5.
- **H2. A press dies with its mode.** A tool key, Ctrl+A or Ctrl+Z during a
  box drag or a selection drag clears `box` / `drag` in the reducer but not
  the component's `press` ref (`CadSketcher.jsx:451-453`), so the next move
  re-arms it and the release selects with a tool armed, or commits a move
  after the undo. `select`, `box` and `box-end` take the guard `drag` already
  has (no tool, no action), and the component drops `press` when the state's
  box or drag goes null.
- **H3. A fix leaves a sound selection.** `fixProblem`
  (`sketchTools.js:926-935`) filters `selectedIds` but keeps a
  `selectedDimensionId` its fix pruned (the next render calls
  `describeDimension(undefined)` and throws) and keeps an action running with
  nothing selected.
- **H4. Copy then another action.** `startOp` for a different action skips
  `endOp`'s hand-off (`:1012-1023`), so the originals stay selected instead
  of the copies. Starting another action ends the running one first.
- **H5. Words.** The idle status line says "Esc exits the sketch"
  (`CadSketcher.jsx:780`) where the code finishes it and `sketchHelp.js:179`
  says "finishes". One wording. Correct the title of
  `sketchActions.test.js:256` to what `sketchHistory.test.js:134` pins.

### I. Shop stations (after package F)

Files: the station code in `CadWorkspace.jsx` (what reads and writes
`brakeSession`, `shopSession`, the laser, the replay, `uploadPrintImage`),
`toolSession.js` (the five station tables), `LaserStation.jsx`,
`ShopStationPanels.jsx`, `CadEditors.jsx`, `PressBrakePanel.jsx`, and their
tests. Page: `docs/state-machines/cad-stations.md`.

- **I1. "Cut done" belongs to the sheet that was cut.** `cut: true` survives
  the bed's Sheet switch and a stock-sheet change (`CadWorkspace.jsx:6072,
2728`; `LaserStation.jsx:379, 569`), so a sheet never cut draws as cut, and
  the cut notice itself tells the user to switch sheets (`:2610`).
- **I2. An uploaded image lands only where it was asked for.**
  `uploadPrintImage` (`:2895-2927`) reads the session it closed over after
  its await: a slow decode commits onto a print after the station closed, or
  into a reopened session's draft. Check the session is still the one that
  asked.
- **I3. The tables describe the code.** Every move the code makes is in its
  table (`endFilm` restoring a stored session, the paint booth's double
  Back, the laser's auto cut `idle → cutting`), and every stage write goes
  through `next`. `laserCutEnd` (`:2607`) sets its notice only for the live
  token, as its stage write already does.
- **I4. Leaving the press brake — Named.** What a brake session leaves
  behind is listed in six places with different coverage (`:811, 1227,
2285, 2766, 3708, 3776`); `brakePicker` and `brakeFocus` are cleared in
  one. One function that every exit calls.
- **I5. Unreadable numbers.** A `useNumber` field (paint film thickness, the
  print size fields: `CadEditors.jsx:40, 118`, `ShopStationPanels.jsx:32-43`)
  keeps text it could not parse on screen with no message, ignores it, and
  carries it onto another part with the same value. On commit, text that is
  not a number goes back to the value in force.
- **I6. SUSPECTED, fix only with a red test.** The paint booth at `confirm`
  losing some targets (`:399-403`) and then running `runPaint(null, true)`
  (`:6887`); Undo during a laser cut; a brake view that vanishes mid-stroke;
  a replay ended by `liveShopSession` (`:382`) not restoring `before`.

Tests to run (G, H, I): the `CadViewport*`, `CadSketcher*` and `sketch*`,
or `CadWorkspace*` and station test files of your package under
`src/features/sketchstudio/cad/`, a few files per command.

## 10. Order

Three at a time, so no two builders share a file and the machine keeps up:
A, E, F; then B, G, H; then C, D, I.

## 11. The first pass's open items, decided

- Floorplan "saved" means the draft, not the file: **fixed** (B1).
- WebGL context loss: **fixed** as a terminal `lost` phase and a remount
  (D2). No in-place restore.
- Save image naming during a first compile: **fixed** (D3).
- Elevation window drag threshold and Escape: **fixed** (A4).
- Sketch Studio mirror and fastener hover: **fixed** (E3). `recovered`
  counting as clean: **fixed** (E4). The three commit paths: the cells that
  hurt are **fixed** (E7); the paths stay three, tabulated on the page.
- Lifecycle overview reading "ready" when stale: **fixed** (B6).
  `SunStudyPanel.addTarget` on a rejected command: **fixed** (D4).
- The CAD "another tool is active" lists: **Named** (F1). Fit to page then
  Undo: **fixed** (F4).
- `ENTER_TOOL`: **Named** as a function over `dispatch` (A9), not a compound
  reducer action, so no site's actions change.
- Shared canvas-gesture hook for the detail editors: **not built**. A shared
  pure rules module instead (C3); the two components keep their own state.
- `SheetCanvas` lost pointer: **fixed** (C1). `ErrorBoundary` retry on an
  empty project: the draft now holds the last edits (B2); the retry itself is
  unchanged. Electron crash loop: **fixed** (B6).
- **Still open, on purpose:** an accepted lifecycle command remounts its
  stage and wipes sibling drafts (about 45 drafts in a 6,000-line file: its
  own piece of work); Ctrl+S inside a field with an uncommitted draft; the
  plan's first Escape being swallowed while Walk is on and unlocked (may be
  intended); the review-item and markup status setters that disagree
  (domain, not UI state).

## 12. Gate (main session)

`npx eslint src/` 0 errors, warnings ≤ 40. `npx vitest run` all green
(baseline 609 files, 7392 passed, 1 skipped, plus the new tests).
`npx vite build` succeeds. Each fix's test seen red on the old code. In
Chrome on `/playground`: the file-behind indicator, a lost WebGL context,
and Escape on stacked dialogs.

## 13. What changed while building

The builders re-verified every item before changing it. Where the code
disagreed with this spec, the code won; these are the places.

- **C3, Space with a button focused: taken back.** A tool button keeps focus
  after a mouse click, so "Space presses the focused button" would have broken
  the commonest flow in both detail editors (click a tool, hold Space, drag to
  pan) and could drop a measurement's first point. Space arms the pan latch on
  every target that is not a field, exactly as before; Enter presses a
  focused button. `detailCanvasRules.js` holds the rule unchanged.
- **A masonry wall crashed the wall detail editor (found by C, fixed).** The
  editor's own System picker offers "CHB masonry", a masonry assembly has
  `framing: null`, and the render and the board-snap threshold read
  `assembly.framing.studWidth` unguarded. Older than this pass; a state the
  UI could reach that no code path expected.
- **A1:** the flow is cleared when the corner list holds one point or none
  BEFORE the repeat is dropped, not after, so a double-click used to put down
  a first corner keeps it.
- **A3, A4, A5:** Escape cancels the store gesture only while the dragged
  object is still selected. After Ctrl+Z mid-drag (which undoes and
  deselects) a cancel would take the history entry before the drag, an
  unrelated edit.
- **A8:** the fillet radius field dispatches a new `SET_FILLET_RADIUS`, which
  redraws the preview in the store (the panel does not know the hovered
  corner).
- **B4:** the top dialog marks its Escape in the capture phase, because focus
  mode's listener is registered before a dialog opens and would otherwise run
  first. The plan canvas ignores an Escape so marked (C5).
- **E7:** HUD Enter for fillet and chamfer reads the size from the box, not
  from the preview, which is not rebuilt as a value is typed.
- **F1:** the Delete-mark key waits for every tool except Measure and the hole
  tool (`CadWorkspace.keys.dom.test.jsx` pins deleting a mark with Measure
  open). **F3, F4:** a pending reopen or refit is dropped only after the
  model has been seen to leave `before` and come back. **F5:** a flow also
  notes whether `busy` was already set when it started. **F6:** the More
  menu still leaves the station first and puts it back when the command
  refuses (one list, shared with `leaveStations`, since I4).
- **G6:** `selectDouble` defers to `pointerUp`'s checks, so with Rotate about
  a picked point on, a double-click whose second click selects now opens the
  group too.
- **D2:** the lost-context words live in `ThreePreviewPanel.jsx`. **D:** the
  SUSPECTED location-editor and failed-start leaks had red tests and were
  fixed; the see-through hold overwriting the world hold was not (it is the
  compile gate).
- **I3:** a replay puts a station back through one `RESUME_<STAGE>` event per
  stage; the paint booth's double Back became `GONE`; the laser's auto cut is
  `AUTOCUT`. **I5:** `useNumber` lived in `ShopStationPanels.jsx` with a
  third copy in `PressBrakePanel.jsx`; all three are `numberFor` in
  `CadEditors.jsx` now. **I6:** all four SUSPECTED items had red tests and
  were fixed. A laser cut now stops on any model change under it, not only an
  Undo.
- **E9:** `isPointerDown` had fourteen writes in the reducer; `drawing` stays.

Left open by the builders, each recorded on its page: the suspected CAD
viewport items that need a real browser or a design choice (a second touch
pointer, a chorded right press, a double-click in Hole place mode, the gizmo
re-attach after a prop change mid-drag); neither detail editor's gesture
ending on blur or a lost capture; Share and Save having no busy state; the
sidebar width drag having no lost-release ending.
