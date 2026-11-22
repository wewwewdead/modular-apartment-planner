# State machines: Sketch Studio CAD viewport and layers

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

Who gets a click in `CadViewport.jsx`, and every drag in the viewport and its
layers (gizmo, placement, press brake grip and fingers, the flat-blank card,
print, hole handles, unfold), the Measure tool's two clicks and the origin
plane hover.

Paths are under `src/features/sketchstudio/cad/`.

## Machines

### Direct placement

- **Where:** `placementTool.js`, `placementCuts.js`, `placementRows.js`,
  `placementHardware.js`, `operations.js` (`draft.placement`: `stage` × `mode`
  × `tool`)
- **States:** stages place → shape (→ axis for revolve; Change axis and back
  with `startAxisPick` / `stepBack`); a hole row adds place + `row.seed`
  before its shape. Modes: `placed`, `stored`, `tool`, `reference`, `plane`,
  `step`, `sketch`, `cut`. Extrude, Revolve, Sweep and Loft start (place,
  placed); Extrude from a chosen sketch or an edit starts (shape, stored),
  on a tube's end (shape, stored, `memberEnd`); booleans (shape, tool) and
  Transform (shape, tool, `self`); pattern (shape, step); the reference
  tools (shape, reference), the one stage where a click both grabs handles
  and places; plane tools (place, plane), editing (shape, plane); hole and
  pocket (place, cut), editing (shape, cut); hardware (place, placed),
  editing too; the sketch flow (shape, sketch).
- **Treatment:** Left
- **Notes:** Pure draft-to-draft functions with good coverage
  (`placement*.test.js`, `CadWorkspace.place.dom.test.jsx`). Legal stage ×
  mode × tool combinations are not declared anywhere; entry is split over
  five functions (`startPlacement`, `startCutPlacement`,
  `sketchFlowPlacement`, `createOperationDraft` in `operations.js`, which
  turns an Extrude on a tube's end into (shape, stored, `memberEnd`) and
  opens a placed-first tool in the place stage with no part yet) plus the
  row entry (`rowPlacement`, `seedRow`).
- **Open:** `startAxisPick` writes `stage: 'axis'` onto any placement, a
  null one too; only the Revolve panel's guard keeps it to revolve in the
  shape stage. `replacePlacement` refuses only a stored sketch; it would put
  a `tool`, `step`, `reference` or `sketch` placement back in the place
  stage with nothing to pick, and only the panel (Re-place for `placed`,
  `plane`, a tube's end and `cut` but a sketch pocket) keeps it from doing
  so.

### Viewport interaction mode

- **Where:** `CadViewport.jsx` (`pointerUp`; the press: `forgetDown`,
  `pointerDown` and `down`; `consumedPointer`, `pickClick`,
  `ctx.selectClick`, `selectDouble`; the modes `ctx.measureMode`,
  `ctx.placing`, `ctx.shopPick`, `ctx.sketchMode`, `ctx.holeMode`,
  `ctx.pivotPick`), `brakeHands.js` (`CLICK_PX`)
- **States:** who takes a click, by the order of checks in `pointerUp`:
  1. a gizmo drag just ended (`consumedPointer`): the release is the
     drag's, unless it was a ring click in Rotate about: Picked point
     (`pickClick`), which goes on as a click;
  2. not a click: no press recorded (`down` null), travel past `CLICK_PX`,
     or not the left button;
  3. measure;
  4. placement: `placementLayer.click` takes every click while any
     placement view is shown (with no pick it swallows the click);
  5. the press brake: owns every click while its station is open, a miss
     too (`brakeClick`: a piece of the line (with Ctrl, Shift or Meta: add,
     piece pick PK-2), an edge of the sheet, a blade);
  6. the paint / print station (`ctx.shopPick`, SM-3): its pick, if it has
     one; the click is its either way;
  7. sketch draw: the sketcher's (it listens on the canvas);
  8. origin-plane tiles, when shown and no sketch mode is on or a sketch is
     picking: a tile starts a sketch on its plane; while picking, a flat face
     is the sketch's face and a curved one only says so;
  9. sketch pick and a mate's face pick (`sketchMode` 'pick'): the face
     under the pointer;
  10. the hole tool: any `holeMode` takes the click, 'place' places on the
      selected part;
  11. Rotate about: Picked point: a click on the selection moves the pivot;
  12. a ring click that missed the part keeps the selection;
  13. Cut's picker (RC-2, docs/sketch-studio-cut-pick.md §4.2: with
      `onPickOutline` set, a click inside a ready outline's outer ring on
      z = 0 that no part hit nearer takes it, `onPickOutline(sketchId)`, the
      smallest outline holding the point; a miss of every part and outline
      does nothing, so the picker stays; the pick areas are built in the
      `shopOutlines` effect, `ctx.outlinePick`, and the hover cursor once per
      frame, putting back only the cursor it set);
  14. select (`ctx.selectClick` true; Shift / Ctrl / Cmd toggles).

  The laser (SM-4) never reaches it: its bed covers the view.

- **Treatment:** Left; the click threshold is Named: `CLICK_PX` in
  `brakeHands.js`, 4 px, a click at or under it.
- **Notes:** The press has its own order: capture-phase listeners in the
  order they are registered (`forgetDown`, `printDown`, `gripDown`,
  `placementDown`, `holeDown`, then `trackPointer`), then TransformControls,
  OrbitControls and the bubble `pointerDown`. Each of the four drags takes a
  press with `stopImmediatePropagation`, so `pointerDown` records `down` only
  for a press nobody took, and every press first forgets the last one: the
  release of a press a drag took (after its Esc, or after the layer ended
  the drag) is never measured against an older press as a click
  (`CadViewport.stations.dom.test.jsx`). A double-click opens a group only
  when `ctx.selectClick` says its second click reached the selection: it
  keeps no list of modes of its own (`CadViewport.groups.dom.test.jsx`
  compares the list it had, frozen, with the click order; the one difference
  is Rotate about: Picked point, where a click that missed the selection
  selects and its double-click now opens too). `CLICK_PX` is the one
  threshold of `pointerUp`, the ring click, the print drag, the fingers and
  the grip's dead zone (`brakeHands.js` `gripDrag`; `brakeHands.test.js`).
  The workspace keeps the modes apart through its one `panel` and its
  hand-copied "another tool is active" lists (`cad-workspace.md`); nothing
  in the viewport enforces one at a time.
- **Open:** Hover has no order, where the click has one: the plane hover,
  the shop hover, Cut's picker hover, the grip and reach hover, the
  placement hover and the Measure hover each gate themselves and write the
  one `style.cursor` without knowing the others (Cut's picker hover checks
  none of measure, placement, station, shop pick, sketch or hole). A mate's
  face pick: `sketchPicking()` needs the planes shown, which a mate never
  has, so no face outline or hint shows while the click still picks (any
  face, a curved one too). A double-click in Hole place mode is two clicks
  and places twice; the workspace refuses the second ("Wait for the current
  model to rebuild") and says so; whether a double-click should place once
  is the workspace's to decide.

### Placement layer drag

- **Where:** `placementLayer.js` (`drag`, `toolDrag`, `live`, `pending`,
  `rowTyped`), `CadViewport.jsx` (capture-phase `placementDown` /
  `placementMove` / `placementUp`, `placementCancel`; the transform's
  `mouseDown` / `objectChange` / `mouseUp` while `ctx.toolGizmo`)
- **States:** idle / hover / handle drag / tool drag / awaiting drop / row
  typing
- **Treatment:** Left
- **Notes:** `CadViewport.place.dom.test.jsx`. A release commits once
  (`finishDrag`, `toolUp`) and the dragged ghost waits up to 400 ms for the
  workspace's new view (awaiting drop), going back if none arrives (the
  change was refused): a handle's ghost and the tool gizmo's ghost and pivot
  alike. Esc (`key`), `pointercancel` and window blur cancel: `cancelDrag`
  puts the value back, gives the orbit back and, for a tool drag, sets
  `transform.dragging` false, so TransformControls reports no `mouseUp` and
  `isDragging()` is false again. A new view that no longer has the dragged
  handle, or no view at all (the operation closed, its draft went stale),
  cancels a handle drag; a view without a tool gizmo, or none, cancels a tool
  drag. The workspace passes no `onPlacementCancelDrag`.
- **Open:** A right press is no exit (`down` takes the left button only,
  and a chorded press is a move). A second pointer (touch, pen) on a handle
  starts a new drag over the live one: no "already dragging" guard.

### Gizmo drag

- **Where:** `CadViewport.jsx` (`drag`, `ctx.drag`, `consumedPointer`,
  `pickClick`, `typed`; TransformControls `dragging`), `rotateDial.js`
- **States:** idle → dragging (move / rotate; dial none / edge / dial) →
  commit or cancel
- **Treatment:** Left
- **Notes:** `CadViewport.rotate.dom.test.jsx`,
  `CadViewport.snap.dom.test.jsx`, `CadViewport.hud.dom.test.jsx`,
  `CadViewport.dom.test.jsx`. Release commits; Esc, `pointercancel` and
  window blur run `cancelDrag` (the parts and pivot back, no history, the
  selection kept); typed digits + Enter commit the exact value.
- **Open:** The attach effect skips while `ctx.drag` is on, so a change of
  `moveEnabled`, the selection or `exploded` during a drag is not applied
  when the drag ends without a commit (an Esc, no travel, a refused move):
  the gizmo stays on the old selection until the next dependency change.
  Shortcuts wait for `isDragging()`, so the trigger is a rebuild or an undo
  chord landing mid-drag.

### Press brake grip drag

- **Where:** `CadViewport.jsx` (`gripPress`: capture-phase `gripDown` /
  `gripMove` / `gripUp`, `ctx.gripKey`, `ctx.dropGrip`), `shopLayer.js`
  (`gripDrag`, `handover`, `onGripEnd`), `brakeGrip.js`, `brakeHands.js`
- **States:** idle → pressed (no travel: a click acts) → dragging (the dial,
  past `CLICK_PX`) → settling (eases back, or carries on over the act's new
  view) → idle
- **Treatment:** Left
- **Notes:** `CadViewport.grip.dom.test.jsx`,
  `CadWorkspace.hands.dom.test.jsx`, `brakeHands.test.js`
  (docs/sketch-studio-brake-hands-on.md §5.2). Three plain variables, one
  owner each: the viewport's press, the layer's drag and its hand-over.
  Release, Esc, `pointercancel` and window blur end all three, and Escape
  reverts (rule 4). The layer also ends its drag by itself: a new view under
  the drag (`setStation` re-runs on every rebuild, view mode or selection
  change), the grip prop's `shown` false (the sheet eases back) and the
  station closing; each time it calls `onGripEnd`, and the viewport's
  `ctx.dropGrip` ends the press with it (the chip hidden, the orbit back,
  its release does nothing). The workspace's brake keys wait while
  `isDragging()` is true. Not promoted to a table: it changes no stage of
  `cad-brake` and commits nothing of its own (the act is the workspace's
  one session patch).
- **Open:** `gripDown` puts the sheet back on a press of another button
  mid-drag, but a mouse sends a second button as a `pointermove` (chorded
  buttons), so only synthetic events reach that exit; no drag here ends on
  a move with no button held. The pointer capture of a press the layer
  ended stays until the release.

### Press brake finger drag

- **Where:** `CadViewport.jsx` (`fingerPress`: taken by the same capture-phase
  `gripDown` / `gripMove` / `gripUp` when the shop layer's `handPick` finds
  the fingers offered, `fingerFrame`, `ctx.gripKey`, `ctx.dropFingers`),
  `shopLayer.js` (`fingerHeld`, `reach`), `CadWorkspace.jsx`
  (`fingersFrom`), `brakeHands.js` (`fingerL`, `fingerOffer`,
  `fingerRestore`)
- **States:** idle → pressed (no travel: a click opens the L field) → dragging
  (past `CLICK_PX`; each new L sent at most once a frame) → released (the last
  L) or cancelled (the line put back) → idle
- **Treatment:** Left
- **Notes:** `CadViewport.reach.dom.test.jsx`,
  `CadWorkspace.reach.dom.test.jsx`, `brakeHands.test.js`
  (docs/sketch-studio-brake-hands-on.md §6.2). Its own row, not the grip's: it
  commits as it goes (each L is the card's `onDistance` patch), where the grip
  drag is view only until its one act. Three plain variables, one owner each
  (the viewport's press, the layer's hold, the workspace's line before the
  drag). Release keeps the last L; Esc, `pointercancel`, window blur, the
  grip prop's `shown` false and the station closing (both through
  `dropFingers`) put the line back with one patch (rule 4). The brake keys
  wait while `isDragging()` is true; Enter after typed digits is the drag's
  (`preventDefault`), never the pedal.
- **Open:** A press of another button mid-drag is the same synthetic-only
  exit as the grip's. Unmounting the viewport mid-drag sends no `{ cancel }`:
  the workspace keeps `fingersFrom` (the viewport is mounted for the
  workspace's life, so it takes the workspace going).

### Flat-blank punch-line drag

- **Where:** `FlatPatternMap.jsx` (`drag`: `{ moved, from }`, `dragged`),
  `CadWorkspace.jsx` (its `onDistance` is `brakeDistance`), `brakeHands.js`
  (`fingerRestore`)
- **States:** idle → pressed on the punch line or a segment → dragging (each
  new L sent once: `onDistance(L, { stop: null })`) → ended (the L kept) or
  cancelled (the line put back) → idle
- **Treatment:** Left
- **Notes:** `FlatPatternMap.dom.test.jsx`. The same gesture as the
  fingers' drag, on the card. It ends, keeping the L sent, on release,
  `pointercancel`, lost capture, window blur, a move with no button held
  (rule 6) and a move while the card is disabled or has no gauge edge. Esc
  puts the line back as it was at the press (`fingerRestore`, one
  `onDistance` patch; none if nothing moved): a capture-phase window
  listener with `preventDefault`, so the brake's own Esc (which clears the
  line) waits. A drag that started on a segment is not a click on it
  (`dragged`).
- **Open:** On `pointercancel` and blur the fingers put the line back and
  the card keeps it; one rule for both is not decided.

### Print drag

- **Where:** `CadViewport.jsx` (`printDrag`; capture-phase `printDown` /
  `printMove` / `printUp`, `printCancel` as `ctx.cancelPrintDrag`),
  `shopLayer.js` (`pickPrint`, `previewPrint`, `resetPrint`)
- **States:** idle → pressed (no travel past `CLICK_PX`: a click selects the
  print) → dragging (the decal follows on its face) → committed
  (`onShopPrintMove`, once) or put back
- **Treatment:** Left
- **Notes:** `CadViewport.stations.dom.test.jsx`. The print station only,
  left button. Esc (the viewport's key handler), `pointercancel`, window
  blur and the station's pick going null put it back (rule 4); a release
  after an Esc is no click (the press was the drag's).
- **Open:** A press of another button is no exit (it is a move); a second
  pointer replaces the drag (no "already dragging" guard).

### Hole handle drag

- **Where:** `CadViewport.jsx` (`holeDrag`; capture-phase `holeDown` /
  `holeMove` / `holeUp`, `cancelHoleDrag` as `ctx.cancelHoleDrag`)
- **States:** idle → dragging (the handle on its face's plane) → committed
  (`onMoveHole`) or put back
- **Treatment:** Left
- **Notes:** `CadViewport.place.dom.test.jsx`. Move holes only
  (`holeMode` 'move'), an unlocked handle, left button. Esc puts it back and
  leaves the hole tool (`onCancelHole`); `pointercancel` and window blur put
  it back; the hole effect rebuilds the handles on every change of the hole
  mode, readiness, selection, snapshot or model and puts a live drag back
  first. `cancelHoleDrag` gives the orbit back only when a hole drag was
  live: a rebuild landing in another owner's drag (the fingers', a
  placement handle's) leaves that owner's hold on the orbit.
- **Open:** `controls.enabled` is one boolean with six writers (the
  transform, print, grip, fingers, hole, placement layer); each writes
  `true` at its own end, and none checks another still holds it. A second
  pointer replaces the drag.

### Measure two-click

- **Where:** `CadViewport.jsx` (`ctx.measureFirst`, `ctx.measureHover`,
  `ctx.measureMissed` and the React `measureMissed`, `measureStage`,
  `measureClick`, `ctx.cancelMeasure`), `CadWorkspace.jsx` (its Esc)
- **States:** first → second (a first point picked) → first (the mark made,
  `onMeasure`)
- **Treatment:** Left
- **Notes:** `CadViewport.measure.dom.test.jsx`. A click on nothing is
  ignored and says "Point at a part"; a second click on the first point is
  ignored. Esc with a first point (the workspace calls `cancelMeasure`) and
  the tool turning on or off (the `measureMode` effect) start over. The
  missed flag is held twice, on `ctx` and in React state, kept equal by
  `showMissed`.

### Origin plane hover and tile pick

- **Where:** `CadViewport.jsx` (`ctx.planes`, `planeMove`, `runPlaneHover`,
  `hoverFrame`, `planeLeave`, `clearPlaneHover`, `planeTarget`, `pickPlane`,
  `sketchPicking()`)
- **States:** nothing lit → a tile or (picking) a face lit → nothing lit
- **Treatment:** Left
- **Notes:** `CadViewport.planes.dom.test.jsx`. Hover only with no button
  held, and only while the tiles show or a sketch is picking; one frame per
  burst of moves, the latest pointer, gates checked again when the frame
  runs. Cleared on leaving the canvas, on a new snapshot and on a sketch mode
  change; the frame is cancelled on unmount. The click is step 8 of the
  click order.

### View watchers

- **Where:** `CadViewport.jsx` (`ctx.viewWatchers`, `watchView`,
  `tellView`, `viewTelling`, `stopTelling`)
- **States:** quiet → telling (a frame asked) → quiet
- **Treatment:** Left
- **Notes:** `CadViewport.dom.test.jsx`. A render that finds the camera or
  canvas changed (`viewKey`) while someone watches (the sketcher's overlay)
  asks one frame, and tells every watcher then; the frame is cancelled on
  unmount, so nobody is told after the viewport is gone.

### Sheet-metal unfold view

- **Where:** `CadWorkspace.jsx` (`sheetFlat`, derived `sheetView`),
  `shopLayer.js` (`flatness`, `animation`)
- **States:** folded → unfolding → flat → folding → folded (the preview exists
  from unfolding to the end of folding)
- **Treatment:** Left
- **Notes:** `CadViewport.shop.dom.test.jsx`,
  `CadWorkspace.shop.dom.test.jsx`. View state, not a tool: it never claims
  the viewport's clicks and is not in `activeTool`. A running tool
  (`activeTool` non-null, the press brake included) or another selection drops
  it at once (reset during render), so it blocks nothing; while it shows it
  turns the move gizmo off (`moveEnabled`). The shop layer runs its own
  requestAnimationFrame loop only while animating and stops on idle and
  dispose. A click on the unfolded stand-in keeps its part selected
  (`shopLayer.pick`).
