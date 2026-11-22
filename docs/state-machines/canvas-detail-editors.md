# State machines: 2D canvases and the wall and ceiling detail editors

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The plan canvas (`SvgCanvas.jsx`), the sheet canvas, and the two assembly
editors with their hand-written canvas gestures.

Paths are relative to `src/`; bare names are under
`src/features/floorplan/components/`.

## Named definitions

Each is the one copy of a rule. Import it; never restate it.

- `CLICK_TRAVEL_PX`, `clickTravelUnits`, `travelledPastClick`
  (`wall-detail/detailCanvasRules.js`): When a press in a detail editor is a
  click and when it is a drag: 2 px on screen, never under 1 mm
  (`Math.max(1, unitPx * 2)`). A move, a Ctrl-copy, a measurement moved whole
  and a measurement's end grip all commit only past it, in both editors. The
  grip is the one that changed: it used to commit on a bare click, which
  re-acquired the end (snap, rounding, Shift level) and added an undo step.
  The grip gesture keeps its unsnapped `pressPoint` to be judged against.
- `MEASURE_CLICK_PX`, `isMeasureClick` (`wall-detail/detailCanvasRules.js`):
  A measuring press that travels under 5 px is the first of two clicks; more is
  a drag from one end to the other. Both editors' Measure tool.
- `isTypingTarget` (`utils/keyboard.js`): "This key belongs to a field." Both
  editors' shortcut handler and trace Escape use it in place of six inline
  copies, and so do the Space rules below.
- `isSpaceKey`, `spaceArmsPanLatch`, `spaceKeyUpTaken`
  (`wall-detail/detailCanvasRules.js`): The detail editors' Space pan latch.
  Space arms it, and is taken from the page, anywhere but in a field (where it
  types). Every Space key-up lets the latch go and is taken too.

`detailCanvasRules.test.js` keeps each editor's old inline expression frozen
and compares it with the rule over every combination of its inputs: none of
them differs. The one change in behaviour is the grip's travel test.
`lightRun.js` keeps its own 6 px (held equal to the 3D pane by
`lightRun.test.js`).

## Machines

### Plan pan and zoom

- **Where:** `features/floorplan/components/renderers/SvgCanvas.jsx`,
  `canvasGestures.js`
- **States:** idle → wheel pending (90 ms) → in flight → idle; idle → panning
  → in flight
- **Treatment:** Left
- **Notes:** `canvasGestures.test.js`, `canvasKeysAndRelease.dom.test.jsx`.
  Performance-tuned compositor path: do not restructure.

### Plan tool press

- **Where:** `SvgCanvas.jsx` (`toolPointerRef`, rAF coalescing,
  `handlePointerAbort`)
- **States:** up → pressed → released or aborted
- **Treatment:** Left
- **Notes:** A press ends on its release, on `pointercancel`, on
  `lostpointercapture` and on window blur, the last three through
  `handlePointerAbort`: the tool ends its drag where it last saw the pointer and
  the store's gesture is closed. The blur listener is bound once, ahead of
  `useDragGestureRelease`, so the tool's release lands inside the gesture as it
  does on pointer-cancel; before it, a press outlived the blur and every frame
  dragged after Alt-Tab was an undo step of its own. The canvas's key handler
  ignores an Escape whose `defaultPrevented` is set: `Modal` marks the Escape it
  closes on, and that press must not also cancel the tool flow behind the
  dialog. A refused wall edit (`lastRejection`) is toasted once per refusal (a
  module `WeakSet`), not again each time the canvas remounts. Pinned by
  `canvasDragCoalescing.dom.test.jsx` and `canvasKeysAndRelease.dom.test.jsx`
  (pointer-cancel, lost capture, blur, Escape behind a dialog, the toast).

### Detail-editor canvas gesture

- **Where:** `wall-detail/WallDetailEditor.jsx`,
  `ceiling-detail/CeilingDetailEditor.jsx` (`canvasTool`, `gesture`,
  `panelTrace`, `dimensionAcquisition`; ceiling also `lightPressRef`,
  `gestureRectRef`)
- **States:** idle → pressed → dragging → committed or dropped. Gesture kinds:
  `draw` (wall: board, accent, stud, noggin, measurement; ceiling: board,
  opening, framing, measurement, light run), `move` (wall with `copy`),
  `dimension_move` (wall with `copy`), `dimension_endpoint`. A measurement
  `draw` also waits as `awaitingSecondClick`; a trace holds n points; a ceiling
  light press waits in `lightPressRef` until it travels 6 px and becomes a
  live run. `dimensionAcquisition` is the pick-up marker a hover draws with
  Measure (and, in the wall, Screw); it is not a gesture.
- **Treatment:** Named (`detailCanvasRules.js`, above). The states stay in two
  files of several thousand lines each; only the rules are shared.
- **Notes:** How a gesture starts, in both: `beginCanvasGesture` on the
  drawing (a draw tool, a trace point, a screw placed on the press, Select on
  empty space clearing the selection; ceiling: a light press),
  `beginElementMove` on a piece, the wall's `beginDimensionMove` and the
  ceiling's `pressDimension` on a measurement, `beginDimensionEndpointMove` on
  a selected measurement's grip. Each captures the pointer on the drawing.
  The ceiling pins the canvas rect at the press (`pinCanvasRect`).
- How it commits: `finishCanvasGesture` on the drawing's `pointerup`. Moves,
  copies, measurement moves and grips commit only past the click travel; a
  click selects and commits nothing. Draw tools have no pixel test: a factory
  minimum in millimetres (wall board 25 mm, accent 10 mm, ceiling
  `MIN_DRAWN_SIZE * 2.5`); a stud or noggin click is a full-height or
  full-width member on purpose. A measuring press within `isMeasureClick`
  waits for its second press. A trace closes on a double-click or a click near
  its first point. Every commit is one dispatch, so one undo step.
- How it is dropped, in both: Escape, by rungs — an open popover takes it,
  then an open trace (the trace effect, not in a field), then a gesture in
  flight is dropped with the tool kept, then the tool goes back to Select.
  The third rung is `gesture` in the wall and `gesture` or a light press in the
  ceiling; the wall's used to count the hover marker as well, so the first
  Escape after hovering with Measure or Screw cleared only the marker. Delete
  and Backspace drop a gesture in flight before deleting the selection (the
  release used to commit a move of the deleted piece, and a Ctrl-copy brought
  it back). Choosing a tool drops the gesture, the marker and a trace (unless
  the new tool is Trace; ceiling also the light press, the pin and the light
  ghost). `pointercancel` drops the gesture and the marker (ceiling also the
  light press and the pin). `pointerleave` clears the marker unless a gesture
  holds it (ceiling also the light ghost). Wall only: turning to the other
  face (`chooseSide`, or a 3D pick on the far face) drops the gesture, the
  marker and a trace; choosing an assembly preset drops the gesture.
- The ceiling releases its pinned rect wherever the drawing moves for real:
  zoom (`zoomViewportAt`) and Fit (`fitCeilingInViewport`, the `0` key), and at
  every commit and drop.
- The wall pins its canvas rect too, since 2026-11-22 (`gestureRectRef`,
  docs/perf-pass-3.md D2.4): at the press, for the moves made with a button
  held and for that release. A move with no button held drops the pin and
  measures afresh, as do zoom, Fit, a frame pan and `pointercancel`. A window
  resize mid-gesture is handled by neither editor.
- Differences that remain: the ceiling's pin is `pinCanvasRect` and is also
  released at every commit and drop; the wall's is keyed to the press. Wall
  only: Ctrl-copy, accents, the face
  change, tool availability, a preset change that leaves the marker and a
  trace alone. Ceiling only: the light run. Draw minimums
  differ as listed above.
- Pinned by `WallDetailEditor.dom.test.jsx` (click versus drag, the grip
  click, face change, Escape with a trace, a popover and after a hover, Delete
  mid-drag, Ctrl-copy) and `CeilingDetailEditor.dom.test.jsx` (pinned rect,
  click versus drag, the grip click, Delete mid-drag, Fit mid-press, the
  marker on `pointerleave`, Escape mid light press, trace, popovers).
- **Open:** neither editor ends a canvas gesture on window blur, on
  `lostpointercapture` or on a move with no button held (front-page rule 6);
  a lost release leaves the gesture set until the next release on the drawing.

### Editor frame pan

- **Where:** both detail editors (`panGesture`, `beginViewportPan`,
  `updateViewportPan`, `finishViewportPan` on the canvas frame)
- **States:** idle / panning
- **Treatment:** Left
- **Notes:** Starts on the frame with the middle button, or the left button
  with the Pan tool or the Space latch held; captures the pointer on the frame
  and pans from where it started. While it runs the drawing's own gesture
  handlers stand aside. Ends on the frame's `pointerup` or `pointercancel`.
  In the wall editor the pan is applied once per animation frame from the
  latest pointer position (`panFrameRef`), and the release lands the last
  move before it ends (docs/perf-pass-3.md D2.4).
- **Open:** no window blur or `lostpointercapture` exit (rule 6).

### Space-pan latch

- **Where:** `SvgCanvas.jsx` (`spaceHeld`, `isSpaceHeld`), both detail editors
  (`spacePanActive`)
- **States:** up / held
- **Treatment:** Named in the detail editors (`spaceArmsPanLatch`,
  `spaceKeyUpTaken`, `isSpaceKey`); Left in the plan canvas.
- **Notes:** Released on any Space key-up, wherever focus is, and on window
  blur, in all three. Space belongs to the pan even with a button focused, on
  purpose: a tool button keeps the focus after it is clicked, and "pick a tool,
  hold Space, drag" has to pan, not press the button again (which in a detail
  editor would also drop a measurement's first point). Enter presses a focused
  button. The plan canvas keeps its own copy: `key === ' '`, not in a field
  (`isTypingTarget`), not while a detail editor is open; it does not take the
  key-up. Pinned by `canvasKeysAndRelease.dom.test.jsx` (plan) and the two
  editors' "Space with a tool button focused" tests.

### Wall tool availability

- **Where:** `wall-detail/WallDetailEditor.jsx` (`canvasToolAvailable`,
  `framedOnly` and `accentsOnly` on `TOOL_DEFINITIONS`)
- **States:** each tool on offer or not
- **Treatment:** Left
- **Notes:** One rule: the framing tools on a framed wall, the Accent tool on a
  face that takes accents (`wallFaceAcceptsAccents`). The tool buttons'
  `disabled`, the shortcut keys and the press all ask `canvasToolAvailable`. A
  tool that stops being on offer while armed (the face turned to takes no
  accents, or the wall turned to CHB masonry) hands the canvas back to Select
  during the render that sees it, as `chooseCanvasTool` does; it used to stay
  armed, its button greyed out and every press doing nothing. A masonry
  assembly has `framing: null`: the editor reads the stud width through
  `studSupportWidth`, which is 0 there, as for a wall with no studs (no panel
  landing, the board snap at its 20 mm floor). Pinned by
  `WallDetailEditor.dom.test.jsx` (Accent on a face with no board; masonry:
  renders, Stud falls back, a board still draws).

### Wall copy modifier

- **Where:** `wall-detail/WallDetailEditor.jsx` (`copyModifierActive`)
- **States:** off / Ctrl (Cmd) held
- **Treatment:** Left
- **Notes:** Cursor only (`data-copy` on the drawing), from window key-down
  and key-up, cleared on blur. Whether a drag copies is read off the press
  itself (`gesture.copy`), the one reading that cannot go stale.

### Sheet viewport drag

- **Where:** `renderers/SheetCanvas.jsx` (`dragState`, `isPanning`,
  `activePointerId`)
- **States:** idle → move / resize / rotate; idle → pan
- **Treatment:** Left
- **Notes:** Every press opens a store drag gesture (`BEGIN_DRAG_GESTURE`), so
  a drag that rewrites the viewport each frame is one undo step. Ends on the
  canvas's `pointerup` (the window release closes the gesture through
  `useDragGestureRelease`) and `pointercancel`. A lost release ends it where it
  stands, closing the gesture itself (`abandonDrag`): `lostpointercapture`,
  window blur, a move with no button held. Escape during a move, resize or
  rotate puts the viewport back (`CANCEL_DRAG_GESTURE`), only while the drag's
  own viewport is still selected (an undo mid-drag deselects and has already
  taken the gesture's entry), drops the drag either way, and claims the key; an
  Escape a dialog already took is ignored. A pan has nothing to put back and
  has no Escape. Pan moves are summed and sent as one `PAN` per animation
  frame (`pendingPan`, `flushPan`, docs/perf-pass-3.md D2.3): release, cancel,
  a lost capture and blur send what is waiting first, and a wheel notch
  mid-pan folds the waiting pan into its zoom. Pinned by
  `SheetCanvas.dom.test.jsx` and `SheetCanvas.perf.dom.test.jsx`.

### Editor opening

- **Where:** `wall-detail/useShellFirst.js`, `*DetailEditorLazy.jsx`,
  `detailEditorChunk.jsx`
- **States:** shell → chunk loading → ready; failed → retry
- **Treatment:** Left
- **Notes:** `detailEditorLazy.dom.test.jsx`. A different wall or ceiling
  drops back to the shell, which unmounts the body: that is the reset.

### Detail-editor deferred coordination

- **Where:** `ceiling-detail/useDeferredCoordination.js`, used by the ceiling
  editor and, since 2026-11-22, the wall editor (docs/perf-pass-3.md D2.4)
- **States:** idle → pending (1.5 s) → settled
- **Treatment:** Left
- **Notes:** `CeilingDetailEditor.dom.test.jsx`,
  `WallDetailEditor.perf.dom.test.jsx`. Commits carry `coordination: 'defer'`;
  the coordination models (issues, Design Engineer numbers) settle when the
  editor goes idle or away. A rejection in the reducer is still immediate. A
  deferred commit does not clear `derived.lastCommand`, so a lifecycle message
  stays up across a detail edit in both editors.

### Deferred section drawing

- **Where:** `features/floorplan/hooks/useSectionDrawables.js`
- **States:** ready / stale / loading / failed, derived
- **Treatment:** Left
- **Notes:** Results carry their scene and `viewKey`; a cancelled effect
  drops its result. A job that throws ends in `failed` (the last drawing of the
  same view is still handed back) and is logged; the half-stepped job is
  forgotten, so the next reader of that scene starts it afresh. Pinned by
  `DeferredSectionDrawing.dom.test.jsx` and `useSectionDrawables.dom.test.jsx`.
- **Open:** `DeferredSceneDrawing.jsx` marks every status but `ready` as
  `aria-busy`, a failed drawing included.

### Sheet 3D preview image

- **Where:** `renderers/SheetViewportContent.jsx`
- **States:** empty / loading / ready / error
- **Treatment:** Left
- **Notes:** `sheetPreviewCache.test.js`. The result is keyed and checked on
  landing; a newer request for the same slot supersedes an older one.
