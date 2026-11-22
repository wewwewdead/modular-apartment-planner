# State machines: floorplan editor tools and store

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The plan tools (`src/editor/`), the editor half of the store
(`src/features/floorplan/store/floorplanReducer.js`: tool, tool state,
selection, drag gesture, focus, phase view) and the focus-mode Escape guard.

Paths are relative to `src/`.

## Named definitions

Each is the one copy of a rule. Import it; never restate it.

- `ARMED_SETTING_KEYS`, `keepArmedSettings` (`src/editor/toolSession.js`):
  Which floorplan tool settings survive a reset that keeps the tool (floor,
  view or workspace change) and a paste preview started mid-flow: the
  furniture piece and its turn (`fixtureType`, `previewRotation`), the device,
  the beam level, the fillet radius and the door swing (`openDirection`).
  The truss type and material are left out with the truss target they are
  seeded from (the file's comment says why); `toolSession.test.js` pins both.
- `FLOW_MARKER_KEYS`, `isToolFlowInProgress` (`src/editor/toolSession.js`): "A
  floorplan tool is mid-flow." A marker may be listed only if every owner's
  Escape clears it; `toolSession.test.js` runs every owner's Escape to prove
  it, the elevation window drag's `dragging` and `pendingDrag` included.
- `enterTool` (`src/editor/toolSession.js`): Entering a tool with a selection,
  settings and a prompt: `SET_TOOL`, then `SELECT_OBJECT`, `UPDATE_TOOL_STATE`
  and `SET_STATUS_MESSAGE`, each only when given. A function over `dispatch`,
  not a reducer action, so each site sends the actions it always sent; the
  test compares it with the hand-written ritual over every combination. Used by
  `utils/addCeilingEntry.js` (both slab-anchored ceiling flows),
  `properties/SlabProperties.jsx` (`startCantilever`), `Toolbar.jsx`
  (`armFixture`), the T (truss target) and F keys in `SvgCanvas.jsx`, and the
  four ways back to select in `cantileverHandler.js`. Pinned per site:
  `addCeilingEntry.test.js`, `SlabProperties.dom.test.jsx`,
  `Toolbar.dom.test.jsx`, `canvasEnterToolKeys.dom.test.jsx`,
  `cantileverHandler.test.js`. Left by hand on purpose: the navigation
  sequences (`SET_MODEL_TARGET`, `SET_ACTIVE_FLOOR`, `SET_VIEW_MODE` before the
  tool) in `Sidebar.jsx`, `TrussProperties.jsx` and `RoofProperties.jsx`, the
  plain `SET_TOOL` letter keys, the toolbar's `setTool`, and the plain ceiling
  trace in `enterAddCeiling`.
- `clearSelectionState` (`floorplanReducer.js`): The one selection reset:
  `selectedId`, `selectedType`, the overhang run, the region and the paste
  preview. Every action that replaces the selection is built on it, the two
  detail-editor openers and `START_PASTE_PREVIEW` included.
- `leaveProject` (`floorplanReducer.js`): What `PROJECT_LOAD` and `PROJECT_NEW`
  do to the editor (see "Leaving a project").
- `IDLE_DRAG_STATE` (`src/editor/handlers/selectHandler.js`): The select
  tool's drag fields at rest. Every drag end, Escape, Delete mid-drag and every
  move press writes the whole set.
- `DRAG_THRESHOLD_PX` (`src/editor/handlers/selectHandler.js`): 4 px of travel
  before a press on an object is a drag. The select tool's move press and the
  elevation window press use it.
- `dropTrailingRepeatedPoints`, `settleOutlineDoubleClick`
  (`src/editor/handlers/handlerSnapUtils.js`): The corner a double-click's
  second press adds on top of the last one, and what an outline tool's
  double-click does with its corner list: commit three or more, keep fewer
  (the repeat dropped), clear a lone corner the second press put down.
- `resolveActiveRoof` (`src/domain/projectRoofs.js`): Which roof the roof
  workspace edits: `editor.activeRoofId` if it names a roof, else the first
  roof, else none. A stale id (the roof deleted, undone away) falls through,
  so nothing has to clean it up. The store's entity slices, the plan canvas,
  the properties panel, the sidebar and the lifecycle drainage form all ask it;
  the canvas and the document resolve it in the whole project, then look that
  roof up in the phase-filtered one, so a phase view can hide the active roof
  without switching to another. `projectRoofs.test.js`, `multiRoof.test.js`.
- `findContextRoofAt` (`src/editor/handlers/roofContextPick.js`): Which of the
  other roofs drawn in the roof plan a point lands in: inside its outline
  (openings included), the highest roof first, then the smallest. The roof
  select tool and the three roof place tools use it. `roofSelectHandler.test.js`.
- `filletRadiusPatch` (`src/editor/handlers/filletPlaceHandler.js`): A new
  fillet radius and the preview redrawn at it. The `[` and `]` keys and the
  store's `SET_FILLET_RADIUS` (the Radius field in `PropertiesPanel.jsx`) use
  it.

## Machines

### Tool session

- **Where:** `features/floorplan/store/floorplanReducer.js` (`activeTool`,
  `toolState`, selection, `statusMessage`; `SET_TOOL`, `SET_MODEL_TARGET`,
  `SET_VIEW_MODE`, `SET_WORKSPACE_MODE`, `SET_ACTIVE_FLOOR`,
  `SET_ACTIVE_SHEET`, `UPDATE_TOOL_STATE`, `SET_FILLET_RADIUS`); handler
  choice in `editor/useEditorTool.js`
- **States:** per tool: unarmed → armed (settings) → mid-flow → commit → armed
  or select
- **Treatment:** Named (`editor/toolSession.js`)
- **Notes:** `toolState` is one untyped bag of about 83 distinct keys. It
  mixes settings, flow markers and per-frame previews. `SET_TOOL` and
  `SET_MODEL_TARGET` empty it; a floor, view or workspace change keeps the
  tool and its armed settings and drops the rest; a sheet change keeps it
  whole. `SET_TOOL` also clears the selection and the status line, so entering
  a tool with any of those goes through `enterTool`. Escape differs per tool
  by design: wall, room and truss draw clear the flow and stay in the tool
  (truss draw says "Truss draw cancelled." even when idle); the select tool
  ends a drag, or else steps back out of an overhang run; the roof select and
  elevation tools end a drag; the cantilever gives the picked edge back first
  and leaves on the second press; the roof drain has no Escape at all; every
  other placement tool returns to select.

### Focus-mode Escape guard

- **Where:** `features/floorplan/FloorplanWorkspace.jsx` (`FocusEscapeGuard`)
- **States:** canvas focused: Escape cancels the flow first, leaves focus
  second; a detail editor open: Escape never leaves focus
- **Treatment:** Named (`isToolFlowInProgress`)
- **Notes:** `FocusEscapeGuard.dom.test.jsx`. A marker may only be listed if
  the withheld Escape clears it, or focus mode traps the user. While a wall or
  ceiling detail editor is open the guard stands aside whatever pane is
  focused: an Escape the idle editor lets through is not a request to leave
  the focus mode behind it. An Escape something else used
  (`defaultPrevented`) or one typed in a field is never acted on.

### Select-tool drag

- **Where:** `editor/handlers/selectHandler.js` (`pendingDrag`, `dragging`,
  `dragType`, `handle`, `startPos`, `originalPos`, `wallDragPreview`,
  `slabEditOrigin`, …)
- **States:** move: idle → pending (under 4 px) → dragging → commit or
  Escape; handle and marquee: idle → dragging → commit or Escape
- **Treatment:** Named (`IDLE_DRAG_STATE`)
- **Notes:** `selectHandler.test.js`, `selectHandlerIdleDrag.test.js`. Wall,
  section and grid drags preview then commit on release; the others (slab
  handles included) commit per frame and Escape reverts them through
  `CANCEL_DRAG_GESTURE`, which puts back the pre-drag project and takes its
  history entry off. Escape with the selection gone (Ctrl+Z is `UNDO` then
  `DESELECT`) only ends the drag: the undo already took the gesture's entry.
  Delete mid-drag deletes, deselects and writes the idle set, so the release
  commits nothing for the deleted object.
- **Open:** SUSPECTED, not reproduced: the handle press writes only part of
  the idle set (`dragging`, `dragType`, `handle`, `handleIndex`, `startPos`,
  `slabEditOrigin`, `slabEdgeDrag`), so a `wallDragPreview` left by a lost
  release would ride into a slab-handle drag and commit on its release.

### Store drag gesture

- **Where:** `floorplanReducer.js` (`gesture`;
  `BEGIN/END/CANCEL_DRAG_GESTURE`), `hooks/useDragGestureRelease.js`
- **States:** closed → open (history recorded? derived stale?) → ended or
  cancelled; closed may carry `deferredCoordination` (an assembly editor's
  edit waiting for that editor's own settle)
- **Treatment:** Left
- **Notes:** `dragGesture.test.js`, `cancelDragGesture.test.js`. Documented in
  place; performance-tuned. BEGIN writes a fresh three-field gesture, so a
  press while an assembly edit is deferred turns the deferral into a plain
  stale flag that the next END settles. Ctrl+Z mid-drag is `UNDO` then
  `DESELECT`, and the `DESELECT` is what stops a later Escape cancelling the
  wrong entry: every tool's Escape cancels only with a selection. Openers: the
  plan and sheet canvases (pointer drags) and, since 2026-11-10, the wall
  Finishes colour picker (`properties/WallFinishesSection.jsx` through
  `PanelKit` `ColourField` `onPickStart` / `onPickEnd`): BEGIN on the first
  picker `input` after the last end, END on the native `change` or on blur, at
  most once per BEGIN, and on unmount. Swatches and the hex box never open
  one; the roof's colour fields do not either. The window-level release
  (`useDragGestureRelease`: any `pointerup`, `pointercancel` or window `blur`)
  can close a pick early; the picker's later `input` events then commit one
  entry each until its own end, which is then a no-op. Since PP-1 (2026-11-11,
  `docs/paint-edit-performance.md` §2.4) `ColourField` coalesces the picker's
  colours: the latest at most once a frame and ~15 times a second, flushed on
  `change`, blur and unmount _before_ `onPickEnd`, so a pick is still one
  entry ending on its last colour; the roof's fields coalesce the same way,
  unbracketed.

### Roof select drag

- **Where:** `editor/handlers/roofSelectHandler.js` (`dragging`, `dragType`,
  `handle`, `handleIndex`, `startPos`; at rest `IDLE_ROOF_DRAG_STATE`)
- **States:** idle → dragging → release, Escape or Delete
- **Treatment:** Left
- **Notes:** `roofSelectHandler.test.js`. No pending threshold. Escape is
  handled ahead of the selection check, so it ends a drag whose selection has
  gone; it reverts through `CANCEL_DRAG_GESTURE` only while something is
  selected. Delete mid-drag deletes, deselects and ends the drag, so a later
  Escape cannot bring the deleted object back.

### Active roof

- **Where:** `floorplanReducer.js` (`activeRoofId`; `SET_ACTIVE_ROOF`,
  `SELECT_OBJECT`), read through `resolveActiveRoof`
- **States:** unset (the first roof is edited) / one roof id, possibly stale
- **Treatment:** Named (`resolveActiveRoof`)
- **Notes:** docs/multi-roof.md §5.1. Set by every `SELECT_OBJECT` of a
  `roofSystem` (in the editor reducer, so the sidebar card, a canvas click, a
  3D pick, the truss panel's Open roof and the sidebar's "Add roof to …" all
  activate the roof they select) and by `SET_ACTIVE_ROOF`, which the truss
  panel's Add roof sends (the panel stays on the truss) and a 3D pick of a
  parapet, drain or opening sends for the roof that holds it before selecting
  it. A selection change, a tool or target switch, Escape and Delete leave it
  alone: it is not part of the selection, which is why a place tool chosen from
  the roof panel (`SET_TOOL` clears the selection) still works on the same
  roof. Deleting the active roof leaves the id stale and the first roof takes
  over; undo brings the roof and its activity back. `leaveProject` resets it.
  In the roof plan the other phase-visible roofs are drawn as hairline
  outlines with their names (`RoofContextLayer.jsx`, no hit area). A roof
  select press that misses the active roof and lands in another selects that
  roof (and so activates it) and starts no drag; a miss on every roof
  deselects. The place tools stay on the active roof: a press that misses it
  inside another roof sets the status line to "That is <name>. Select it first
  to work on it." and places nothing. `multiRoof.test.js`,
  `roofSelectHandler.test.js`, `Sidebar.roofs.dom.test.jsx`,
  `ThreePreviewPanel.dom.test.jsx`.

### Truss draw target

- **Where:** `editor/handlers/trussDrawHandler.js` (`getTargetTrussSystem`;
  `toolState.targetTrussSystemId`)
- **States:** a new system / the target system / the selected system
- **Treatment:** Left
- **Notes:** docs/multi-roof.md §5.4. A drawn truss joins
  `targetTrussSystemId` when it is set; otherwise the selected truss system
  (or the system of the selected truss); otherwise it starts a new system.
  The handler selects each truss it draws, so a second draw in the same session
  joins the first one's system. A system carries one roof, so the entry points
  decide: the sidebar Trusses "+" always starts a new system (it takes the
  truss type and material from the selection, then `DESELECT`, then the tool
  with `targetTrussSystemId: null`); "Draw another truss" in the truss panel
  targets that system; the toolbar and the canvas T key still target the
  selection. The status line says which way it went: "Truss added to <system
  name>." or "New truss system created above the selected beams."
  `trussDrawHandler.test.js`, `Sidebar.roofs.dom.test.jsx`.

### Truss select drag

- **Where:** `editor/handlers/trussSelectHandler.js`
- **States:** idle → one of four drag kinds → commit
- **Treatment:** Left
- **Notes:** The clean template: one `clearInteractionState`, preview then
  commit. `truss-move` has its own 4 px pending stage.

### Elevation window drag

- **Where:** `editor/handlers/elevationSelectHandler.js` (`pendingDrag`,
  `dragging`, `dragType: 'elevation-window-move'`, `startPos`)
- **States:** idle → pending (under `DRAG_THRESHOLD_PX`) → dragging → release,
  Escape or Delete
- **Treatment:** Left
- **Notes:** `elevationSelectHandler.test.js`, `toolSession.test.js`. Live in
  every `elevation_*` view whatever the active tool. A click with a wobble
  selects and moves nothing. Every move rewrites offset and sill from the
  cursor and commits; Escape reverts through `CANCEL_DRAG_GESTURE` (only with
  a selection) and keeps the selection; Delete mid-drag ends the drag.

### Multi-click placement

- **Where:** `editor/handlers/*PlaceHandler.js`, `*DrawHandler.js`
- **States:** two-point (dimension, section, railing, stair, beam, truss draw,
  roof parapet), chain (wall), polygon (slab, ceiling, roof opening), toggle
  set (ceiling beam pick), pick then panel (cantilever)
- **Treatment:** Left
- **Notes:** `doubleClickSequences.test.js`, per-handler tests. Each flow's
  markers are in `isToolFlowInProgress`. Double-click rule 5 applies to every
  one. An outline's double-click goes through `settleOutlineDoubleClick`:
  finished on the double-clicked corner, kept without the repeat when fewer
  than three corners stand, and cleared when the first press closed the
  outline on its first corner and the second started a stray one. A beam pick
  finishes with the beam. A single-click placer refuses an identical object on
  the same spot (door, window, electrical, column, landing, fixture, roof
  drain); the roof parapet refuses a press on an edge that already carries the
  edge parapet the first press made, so a double-click starts no free one. The
  electrical tool's F holds the flipped face while the cursor stays on that
  wall (`sideHeld`); on another wall the cursor decides again. The fillet
  preview is redrawn at once by the `[` and `]` keys and by the Radius field
  (`SET_FILLET_RADIUS`), so a click applies the radius on screen.

### Cantilever

- **Where:** `editor/handlers/cantileverHandler.js` (`cantileverMode`,
  `cantileverPick`)
- **States:** pick → panel, two-level Escape
- **Treatment:** Left
- **Notes:** `cantileverHandler.test.js`. Every way back to select (apply,
  bay, the second Escape, standing down when the plate has gone) resets the
  tool state and then goes through `enterTool`, putting the plate back where
  there is one. With its plate deselected the tool stays armed until the next
  pointer move or press stands it down.

### Selection

- **Where:** `floorplanReducer.js` (`clearSelectionState`)
- **States:** none / object / overhang edge / region / paste preview
- **Treatment:** Named (`clearSelectionState`)
- **Notes:** `editorResets.test.js`. Opening a detail editor selects what it
  opened and nothing besides; starting a paste preview drops every selection,
  the overhang run included.

### Paste preview

- **Where:** `floorplanReducer.js` (`pastePreview`;
  `START/UPDATE/CANCEL_PASTE_PREVIEW`), `hooks/usePlanClipboardController.js`
- **States:** off → following the cursor → placed or cancelled
- **Treatment:** Left
- **Notes:** `editorResets.test.js`. While it is up the canvas sends presses
  to the paste and never to the tool, so starting one ends the tool's flow and
  keeps its armed settings (`keepArmedSettings`). Exits: placing, Escape on
  the canvas (handled ahead of the tool), and every selection reset.

### Leaving a project

- **Where:** `floorplanReducer.js` (`leaveProject`, from `PROJECT_LOAD` and
  `PROJECT_NEW`)
- **States:** one move: whatever the outgoing project left → select tool,
  empty
- **Treatment:** Named (`leaveProject`)
- **Notes:** `editorResets.test.js`, `exposedWallFrame.test.js`,
  `exposedCeilingBoards.test.js`. Goes: the tool (back to select) and its
  state, the selection and a paste preview, both detail editors, the section
  cut, the active roof, the two hidden-board maps. Stays: viewport, grid, snap, plan style,
  view mode, workspace mode, model target, focus, the study settings, the
  active floor and phase (the floor and phase effects in
  `hooks/useFloorplan.js` repair those).

### Focus mode

- **Where:** `floorplanReducer.js` (`focusedPanel`)
- **States:** none / one pane
- **Treatment:** Left
- **Open:** a workspace-mode change does not clear it, so focus returns with
  the model view; the reducer's comment on `TOGGLE_FOCUS_PANEL` says a
  workspace change leaves focus, and the code does not.

### Phase view

- **Where:** `floorplanReducer.js` (`activePhaseId` × `phaseViewMode`)
- **States:** all / single / cumulative
- **Treatment:** Left
- **Notes:** `phaseChangeRepro.test.js`. A null phase with `single` behaves as
  `all`.

### Detail editors open

- **Where:** `floorplanReducer.js` (`wallDetailEditor`, `ceilingDetailEditor`)
- **States:** closed / wall / ceiling
- **Treatment:** Left
- **Notes:** Both can be set at once in the reducer; no UI path opens one from
  under the other's overlay. Opening one selects what it opened through
  `clearSelectionState`; leaving the project closes both.

### Edit rejection

- **Where:** `floorplanReducer.js` (`lastRejection`, set by a refused
  `WALL_UPDATE`), shown by `SvgCanvas.jsx`
- **States:** none / the last refusal
- **Treatment:** Left
- **Notes:** Cleared only by the next edit that changes the project. The
  canvas turns it into a status toast in an effect keyed on the object, once
  per refusal: each refused edit is a new object, and `SvgCanvas.jsx` keeps
  the ones it has shown in a module-level `WeakSet`, so a canvas that
  remounts (focus on the preview and back, the sheet workspace and back)
  does not report an old refusal again. `canvasKeysAndRelease.dom.test.jsx`.

### Status line as a prompt

- **Where:** `floorplanReducer.js` (`statusMessage`), cleared after 2.5 s by
  `SvgCanvas.jsx`
- **States:** none / one message
- **Treatment:** Left
- **Notes:** Every placement flow says its next step here, and `SET_TOOL`
  clears it, which is why `enterTool` sends the prompt last. For some modes it
  is the only cue: the slab-anchored ceiling trace (`ceilingTargetFloorId`)
  and the cantilever before an edge is picked show nothing else once it has
  cleared.
