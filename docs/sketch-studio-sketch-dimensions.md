# Sketch Studio 3D workshop: dimensions on a sketch

Status: spec, 2026-11-15. Follows `docs/sketch-studio-cad.md` (the in-viewport
sketcher, Phase A; Measure and dimension marks, Phase G) and
`docs/sketch-studio-outline-edit-sheet-nest.md` (OE-1, built: `returnTo`,
`splitOutlines`, the fold guard). One phase, **SD-1**, one builder run,
audited after.

One new optional key on a sketch entry (`dimensions`). `CAD_VERSION` stays 1.

## 1. What the user asked for

"In sketch in 3D workshop, can we allow to add measurements or dimension on
sketch? So I can measure things there?"

## 2. Feasibility (read 2026-11-15 on today's code)

Feasible, and contained: the sketcher is a pure reducer plus an overlay, and
the dimension maths already exists for drawing sheets.

**What the sketcher can tell you today**

- `sketchTools.js` `SKETCH_TOOLS`: Line, Rectangle, Center rectangle, Circle,
  3-point arc. Nothing measures.
- The only numbers on screen: the cursor's X · Y in the status line, the HUD
  fields while a shape is being drawn, and the note for a selected entity
  ("Line 120 mm · Delete removes it", `describeEntity`).
- A hole centre's distance to an edge, the gap between two cut-outs, a
  diagonal: none can be read. Nothing stays on the drawing.
- The 3D Measure tool (D, Phase G) cannot help: `measureBlocked`
  (CadWorkspace.jsx) is true while `sketchSession` is set, its ribbon button
  is off, and a mark's ends are anchored to a part instance
  (`{ instanceId, local }`, marks.js) — a sketch is not one.

**What is already there to build on (siblings read for this spec)**

- `sheetAnnotations.js`: manual drawing dimensions as plain 2D records —
  `{ type: 'linear', from, to, orientation, offset }` and
  `{ type: 'radial', mode, center, radius, at }` — with the pure functions
  `chooseOrientation`, `linearOffset`, `linearValue`, `linearLine`,
  `createLinearDimension`, `createRadialDimension`. They are handedness-free
  arithmetic (the offset and the line use the same sign rule), so they work
  unchanged in sketch-plane millimetres. **SD-1 reuses these functions and
  this record shape (without `view`)**: one dimension behaviour in the app —
  place the line beside the span for horizontal, beside its height for
  vertical, elsewhere for aligned.
- `marks.js` / CadViewport's mark layer: the look (purple `MARK_COLOR`, 45°
  ticks, a small label chip that follows every frame through `render()` →
  `placeLabels`, orange when selected), `formatMm`, the Esc rule (first Esc
  clears the pending point, the next ends the tool), the script probe
  (`element.cadMarks()`).
- `sketchSnap.js`: a click arrives snapped with a `kind` (`endpoint`,
  `midpoint`, `center`, `quadrant`, `origin`, `edge end`, `edge midpoint`,
  `mark`, then `on edge` / `on sketch`, then `grid` / `free`). Shift locks
  horizontal / vertical from the previous point.
- `sketchProfile.js`: entities are `line` / `rect` / `circle` / `arc` in
  sketch-plane mm; `entityKeyPoints`, `entitySegments`, `hitEntity`,
  `arcGeometry`. The sketcher only adds and deletes entities — nothing moves
  after it is drawn — so a dimension stored as plain points stays true.
- Everything that reads `sketch.entities` (`entitiesToProfile`,
  `splitOutlines`, `editableEntities`, `hitEntity`, the status count, "Undo
  last", `SketchSummary`, `shopRoute.js` `shopOutlineView`, `ShopFloor.jsx`
  `linesOf`) assumes every entry is geometry. **So dimensions live in their
  own list, never in `entities`**: the profile, the kernel, the shop and the
  thumbnails are untouched by construction.
- `model.js` `normalizeModel` keeps unknown sketch keys; `sketchOperationDraft`
  spreads the source sketch into its copies. A new sketch key survives save,
  load, extrude, join and cut without further work. A sketch moved to a
  part's XY plane keeps its 2D coordinates (only the plane fields change), so
  its dimensions stay right.

## 3. Design

### 3.1 The model

```
sketch.dimensions?: [
  { id: 'd1', type: 'linear', from: [u, v], to: [u, v],
    orientation: 'horizontal' | 'vertical' | 'aligned', offset },
  { id: 'd2', type: 'radial', mode: 'diameter' | 'radius',
    center: [u, v], radius, at: [u, v] },
]
```

- Sketch-plane millimetres, the frame `entities` use. `horizontal` measures
  along the sketch's X, `vertical` along its Y.
- Reference dimensions: they report, they never drive geometry.
- Ids are unique within their sketch (`d1`, `d2`…; the next id is one past
  the highest number in the list, as `createSketchState` does for entities).
- **The key is absent when a sketch has no dimensions** — a file without
  them saves byte for byte as it does today, and an edit that removes the
  last dimension removes the key.
- `normalizeModel`: when present, `dimensions` must be a list of records with
  an id, one of the two types, finite numbers in every coordinate, a valid
  `orientation` / `mode`; otherwise `Invalid sketch dimension: {sketch.id}`
  (as `Invalid mark` does — the Advanced JSON editor reports through it).
- The kernel, the solver, drawings, the cut list and the shop never read it.

### 3.2 New pure module `sketchDimensions.js`

Plain arrays in and out, no three.js, no React. It imports the linear /
radial arithmetic from `sheetAnnotations.js` rather than restating it.

- **`dimensionPick`** — what a click with the Dimension tool takes. Inputs:
  the snapped point and its `kind`, the raw plane point, the tolerance (mm),
  the entities, the boundary segments, the first point if there is one,
  whether Shift is held.
  - First click:
    - a key-point snap (any kind but `on sketch`, `on edge`, `grid`, `free`)
      → that point;
    - otherwise, a sketch entity within the tolerance of the raw point →
      the whole entity: a line → the span of its two ends; a rectangle → the
      span of the side under the cursor; a circle → a diameter; an arc → a
      radius (centre and radius from `arcGeometry`);
    - otherwise → the snapped point (a model edge, the grid, free space).
  - Second click (one point held):
    - a key-point snap → that point;
    - otherwise, without Shift, a **straight** segment within the tolerance
      (a line entity, a rectangle side, a boundary segment — not a circle or
      an arc) → the foot of the perpendicular from the first point onto it,
      when that foot lies on the segment: **point to edge reads square to
      the edge**, which is the hole-to-edge distance a sheet-metal drawing
      wants. Foot off the segment → the snapped point;
    - otherwise → the snapped point.
    - the same point as the first → refused: "Pick a different point."
- **`dimensionGeometry(dimension, size)`** → `{ value, text, segments, labelAt }`
  in sketch-plane mm. `size` is the overlay's marker size (mm for about
  4 px), so the drawing keeps its size on screen.
  - linear: the dimension line (`linearLine`); an extension line from each
    measured point (starting `0.5 × size` off the point, overshooting the
    dimension line by `size`; none when the point is on the line); a 45° tick
    of half-length `size` at each end (the marks' look); `labelAt` = the
    middle of the dimension line; `value` = `linearValue`; `text` =
    `formatMm(value)`.
  - radial: one leader from the label point `at` to the nearest point of the
    circle, a small cross at the centre (two strokes of half-length `size`);
    `labelAt` = `at`; `text` = `Ø` + diameter or `R` + radius.
- **`hitDimension(dimensions, point, tolerance, size)`** → the id of the
  nearest dimension with a segment within `tolerance` of the point or its
  `labelAt` within `3 × tolerance` (the chip is wider than a line), or null.
- **`pruneDimensions(dimensions, removed, remaining)`** — a dimension goes
  when the geometry it measured goes. An end is _attached_ to an entity when
  it coincides with one of its key points or lies on it (1e-3 mm). After an
  entity is removed: a linear dimension is dropped when an end that was
  attached to the removed entity is attached to none of the remaining ones;
  a radial dimension when the removed circle / arc had its centre and radius
  and none of the remaining ones has. An end that was never on the removed
  entity (a model edge, the origin, free space, another entity sharing the
  corner) does not drop anything.
- **`splitDimensions(groups, dimensions)`** — for a shop finish that splits
  outlines (§3.5): one list per entity group; a dimension goes to the first
  group one of its ends (linear: `from`, then `to`; radial: its circle) is
  attached to, else to the first group.
- **`describeDimension(dimension)`** → "Horizontal 120 mm", "Vertical 65 mm",
  "Aligned 86.6 mm", "Ø20", "R12.5" (`formatMm`).
- **`dimensionPoints(dimension, size)`** — the points Look at should frame
  (the segments' ends and the label point).

### 3.3 The Dimension tool (sketchTools.js)

`SKETCH_TOOLS` gains `['dimension', 'Dimension']` as its last entry, so the
sketch toolbar shows **Dimension** after "3-point arc". The reducer stays a
pure state machine; `createSketchState` takes the sketch's dimensions.

State added: `dimensions`, the next dimension id, `selectedDimensionId`,
`pending` (null, or the span / circle waiting for its place click), and the
order things were added in this session (for Undo last).

The flow, tool on:

| step   | what a click does                                                                                                                      | Esc                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| first  | `dimensionPick`: a point → **second**; a line / rectangle side → **place** with that span; a circle / arc → **place** with that circle | ends the tool                                   |
| second | `dimensionPick` → **place** with the span first → this point                                                                           | clears the first point (back to **first**)      |
| place  | keeps the dimension where the cursor is, then back to **first** with the tool still on                                                 | drops the pending dimension (back to **first**) |

- **Place, linear**: the cursor decides the kind and the offset exactly as on
  a drawing sheet (`chooseOrientation`, `linearOffset`,
  `createLinearDimension`). Its refusal ("Those points have no extent in that
  direction. Place the line elsewhere.") shows as the sketch message and the
  step stays.
- **Place, radial**: the click is the label point (`createRadialDimension`).
- The place click and the place preview follow the cursor rounded to the
  grid step only — never snapped to geometry (a dimension line snapped onto
  an endpoint would sit on the drawing).
- **Measuring without keeping**: from the second step on, the readout by the
  cursor shows the value. Read it, press Esc: nothing is added. That is the
  "just measure" use; the third click is what keeps it.
- Esc with no tool still finishes the sketch (unchanged). So a full exit from
  a half-made dimension is Esc, Esc, Esc — each one visible in the hint.
- Enter does nothing in this tool. Double-click does nothing.
- Shift on the second point is the existing horizontal / vertical lock.

Select and delete (no tool active): a click tests dimensions first
(`hitDimension`), then entities; one thing is selected at a time
(`selectedId` or `selectedDimensionId`). Delete / Backspace and "Delete
selected" remove the selected dimension.

Deleting an entity (the key, the button) and undoing one run
`pruneDimensions`.

**Undo last** removes the last thing added in this session, entity or
dimension; with nothing recorded (a sketch just reopened) it removes the
last entity as today, and the last dimension when there are no entities.
Enabled when there is either. For a session that never adds a dimension it
behaves exactly as it does now (OE-1's tests and script use it).

### 3.4 The sketcher (CadSketcher.jsx) and the view (CadViewport.jsx)

**Readout.** While the Dimension tool is on, the box by the cursor is a
readout, not fields: `.cad-sketch-hud.is-readout`,
`aria-label="Dimension readout"`, `pointer-events: none`, no inputs, none of
the "Tab switches…" line.

- first: nothing (the box is hidden), or the entity under the cursor in
  words: "Line 120 mm", "Ø20", "R12.5" — what a click would dimension.
- second: `{distance} mm · ΔX {dx} · ΔY {dy}` to the snapped cursor.
- place: the kind and value it will keep — "Horizontal 100 mm", "Aligned
  86.6 mm", "Ø20" — then "click to keep · Esc drops it".

**Hints** (the status line, `HINTS.dimension`, one per step):

1. "Click a point, or a line, circle or arc to dimension it."
2. "Click the second point · an edge reads square to it · Shift locks
   horizontal or vertical · Esc clears the first point."
3. "Move beside the span for horizontal or vertical, elsewhere for aligned ·
   click to keep it · Esc drops it."
   (radial: "Click where the label goes · Esc drops it.")

**Status line.** The count gains the dimensions when there are any:
"3 items · closed profile · 2 dimensions" (the text before it is unchanged,
tests match it).

**Selection note.** `.cad-sketch-selection`: `describeDimension` +
" · Delete removes it".

**Keys.** `D` (no Ctrl / Meta / Alt, not a repeat, focus not in an input)
toggles the Dimension tool — it works whenever no drawing tool's HUD field
has the focus. (The workspace's own D is Measure and is already off while a
sketch is open: `placementKeyAction` with `busy`.) After clicking the
Dimension button the keys must work at once: Esc, D, Delete reach the
sketcher, and Space / Enter must not re-press a focused toolbar button.

**Finish.** `onFinish(entities, dimensions)`. Dimensions with no geometry
are not finished: the sketcher stays open with the message "Dimensions are
kept with a drawing: draw the outline first, or Cancel sketch to leave."
(never a silent loss).

**Look at.** Frames the dimensions as well as the entities
(`dimensionPoints`).

**The overlay.** The sketcher computes each dimension's geometry and hands
the viewport plain data; the viewport stays dumb:

```
setSketchOverlay({ …, dimensions: [{ id, segments, labelAt, text, selected, preview }] })
```

- `drawSketchOverlay`: one `LineSegments` per dimension named
  `sketch-dimension` (`userData.dimensionId`), `MARK_COLOR`, the selected
  colour when selected, 60 % opacity for the preview, no depth test, drawn
  above the entities.
- Labels: a new container beside the mark labels —
  `<div className="cad-sketch-dim-labels" aria-label="Sketch dimensions" />`
  — one `.cad-sketch-dim-label` span per dimension (`is-selected`,
  `is-preview`), the mark chip's look, **`pointer-events: none`** (clicks go
  through to the canvas; selection is the sketcher's hit test). Nodes are
  rebuilt only when the id list changes, text updated in place; positions are
  written in `render()` (beside `placeLabels` / `placePlaneLabels`) so they
  follow pan, zoom and resize without a React render; hidden when off the
  canvas or behind the camera; cleared with the overlay.
- Probe for scripts and tests: `element.cadSketchDimensions()` →
  `[{ id, text, value, x, y, hidden, selected, preview }]` (client px, as
  `cadMarks` reports its labels).
- A rubber band from the first point to the cursor on the second step (the
  existing `sketch-preview` line).

### 3.5 The workspace (CadWorkspace.jsx, sketchOperations.js, SketchPanels.jsx)

- `beginSketch({ …, dimensions })` puts them on the session; `editSketch`
  passes `target.dimensions || []` (kept as stored even when the entities
  are rebuilt from an edited profile — see §4).
- `finishSketch(entities, dimensions = [])` → `sketchFromSession` /
  `outlineSketches` take `dimensions`: a new sketch gets the key when there
  are any; an edited one gets the new list or loses the key; a shop finish
  that splits outlines gives each sketch its own (`splitDimensions`, after
  the existing "the edited sketch keeps its id" reorder).
- `lookAtSketch` takes the extra points.
- `SketchSummary`: under Primitives, "Dimensions · N" with one
  `describeDimension` line each, when there are any.
- The "Sketching" help panel gains one paragraph: "Dimension (D): click two
  points, or a line, circle or arc, then click where the dimension goes. Esc
  before the last click only measures. Dimensions are kept with the sketch
  and never change the part."
- `docs/state-machines.md`: a row for the in-viewport sketcher's tool
  (`sketchTools.js` `sketchReducer`, owned by `CadSketcher.jsx`) with the
  Dimension steps of §3.3, and a note on the workspace tool session row that
  a sketch session carries `dimensions`.
- `docs/sketch-studio-cad.md`: a short phase entry in the style of the ones
  there.

## 4. Not in SD-1

- Driving dimensions (typing a value that changes the geometry), constraints
  of any kind.
- Angle dimensions, chain / baseline dimensions.
- Dragging a placed dimension (delete it and place it again).
- Showing a sketch's dimensions outside the sketcher: Draw's outlines in the
  3D view, the laser bed, the job sheet, DXF / PDF.
- "Save as parameter" for a sketch dimension.
- Known limit, accepted: a profile edited outside the sketcher (the profile
  fields, a placement drag) leaves the stored dimensions where they were;
  each still shows the true distance between its two points.

## 5. Acceptance

### 5.1 Unit and DOM tests

- `sketchDimensions.test.js`: every `dimensionPick` rule of §3.2 (key point;
  line body → span; rectangle side under the cursor; circle → diameter; arc →
  radius; free point; the perpendicular foot on an axis-aligned and on a
  slanted edge, the foot off the segment, Shift, a circle body as second
  click; the same point refused); `dimensionGeometry` (value, text, label
  point, segment count for horizontal / vertical / aligned / zero offset /
  both radial modes, sizes scale with `size`); `hitDimension`;
  `pruneDimensions` (the entity a dimension hangs on; a corner shared with
  another entity survives; an end on a model edge; radial); `splitDimensions`;
  `describeDimension`.
- Reducer tests (beside the existing sketcher tests): the three-click linear
  dimension; the two-click entity dimension; the radial one; each Esc of the
  table; the tool stays on after a dimension; the zero-extent refusal;
  select / delete a dimension; deleting an entity prunes; Undo last in mixed
  order and on a reopened sketch.
- `sketchOperations`: `sketchFromSession` with and without dimensions (no key
  when none; an edit that removes the last one drops the key);
  `outlineSketches` splits them.
- `model.js`: `normalizeModel` keeps valid `dimensions`, refuses malformed
  ones, and a model without the key is unchanged.
- `CadSketcher.dom.test.jsx`: Dimension between two snapped points and a
  third click → `sketch-dimension` in the scene, the probe reports the value,
  Finish calls `onFinish(entities, dimensions)`; Esc on the place step adds
  nothing; D toggles the tool; a dimension with no geometry is not finished.
- A `CadWorkspace.*.dom.test.jsx`: finish with a dimension →
  `model.sketches[…].dimensions`; Edit sketch → it is back; a shop finish
  with two outlines → each sketch has its own.
- The one existing assertion that changes: `onFinish` is now called with two
  arguments (`CadSketcher.dom.test.jsx`). No other existing test is edited.

### 5.2 Browser — `scripts/verify-sketch-dimensions-sd1.mjs`

In the style of `scripts/verify-outline-edit-oe1.mjs` (shared steps in
`scripts/sketch-cad-steps.mjs`), screenshots at 1600 × 1000 and 1366 × 768
into `artifacts/sketch-cad/sketch-dimensions-sd1`:

1. New sketch on the Top plane: a 300 × 200 rectangle at the origin and a
   Ø20 circle centred (50, 50), typed.
2. Dimension: click the circle's centre, click the body of the left side →
   the readout reads 50; click to the lower left → a label "50".
3. Click the circle's body → "Ø20" → click outside it → the label.
4. Click the body of the top side → 300 → click above → the label "300".
5. Click two opposite corners → the readout reads 360.56 → Esc → still three
   dimensions.
6. Add a fourth (the right side, "200"), select it by its label, Delete →
   three.
7. Finish sketch → the panel lists "Dimensions · 3".
8. Edit sketch → three labels, the same texts.
9. Select the circle, Delete → "50" and "Ø20" go, "300" stays → Finish →
   "Dimensions · 1".
10. Extrude that sketch to a new part, then the Tree's "↳ Edit sketch" → the
    "300" is there.
11. Shop → Draw the outline: two rectangles side by side, one dimension on
    each → Finish → two outlines; Edit each → each shows its own dimension.
12. No page error, no `.cad-error`.

Still passing: `verify-sketch-on-face`, `verify-start-sketch`,
`verify-outline-edit-oe1`, `verify-measure-marks`, `verify-sketch-cad`, the
whole unit suite, lint with 0 errors.

## 6. Strings and names tests pin

New: the toolbar button **Dimension**; `aria-label="Dimension readout"`;
`aria-label="Sketch dimensions"`; `.cad-sketch-dim-labels`,
`.cad-sketch-dim-label`; the scene object name `sketch-dimension`;
`element.cadSketchDimensions()`; "Dimensions · N".

Unchanged (scripts and tests type through them): every existing sketch
toolbar label, the HUD field labels (`Sketch x`, `Sketch width`…), the
existing hints, "N item(s) · closed profile / open outline / no profile yet",
"Finish sketch", "Cancel sketch", "Undo last", "Delete selected", "Look at".

## 7. Questions for the user (after the build)

1. Should a sketch's dimensions also show on Draw's outlines in the 3D view
   and on the laser bed / job sheet, or only while the sketch is open?
2. Do you want to type into a dimension to change the drawing (a 50 becomes
   60 and the hole moves)? That is a bigger step — it was left out on purpose.
3. Angle dimensions?

## 8. SD-1 as built (2026-11-15)

Built as §3 says, with these differences and choices where the spec was
silent:

- **One refusal the spec names cannot happen.** "Those points have no extent
  in that direction" comes from `createLinearDimension` only for an explicit
  orientation: `chooseOrientation` picks horizontal / vertical only inside a
  span that has extent on that axis, and its fallbacks pick the axis the two
  points differ on, so with the cursor choosing, every linear dimension has
  extent (the same point is refused one click earlier, "Pick a different
  point."). The place step still handles any refusal the creator throws (the
  message shows, the step stays, the readout says it with "Esc drops it");
  the reducer test drives it with a degenerate pending span.
- **The model edges reach the reducer through its state.** `dimensionPick`
  needs the boundary segments; `createSketchState(entities, parameters,
dimensions, boundary)` takes them (the session's, fixed for its life), so
  a click action carries only the snapped point and kind, the raw point, the
  tolerance and Shift. `move` stores the last three too, so the readout and
  the rubber band can say what a click would take.
- **The second-step readout and rubber band go to the point a click would
  take**, not the bare snapped cursor: over the body of a straight edge that
  is the perpendicular foot, so the box reads the true distance square to
  the edge before the click (hovering the left side from the hole centre
  reads "50 mm · ΔX -50 · ΔY 0", wherever along the side the cursor is).
  ΔX / ΔY are signed, as the 3D Measure readout's are.
- **First-step words.** A line reads "Line 120 mm"; a rectangle side
  "Side 300 mm" (it is not a line entity); a circle "Ø20", an arc "R12.5";
  over a point or empty space the box is hidden.
- **Snap kinds.** "A key-point snap" is every kind but `on sketch`, `on
edge`, `grid`, `free` and the `ortho…` kinds; with Shift the second click
  takes the locked point, so the ortho kinds never reach the edge rule.
- **The drawing.** Ticks follow the marks' rule exactly (45° between the
  line's direction and the side it stands off to, fallback the left normal);
  an extension line starts `min(0.5 × size, its length)` off the point, so it
  never starts past the dimension line. The pending dimension is drawn at 60 %
  and its chip at 75 % opacity (`is-preview`); it carries the id it will be
  kept under.
- **Hit test.** The nearest by the smaller of its segment distance and its
  label distance; the tolerance is the snap radius (8 px), so the label
  catches clicks within 24 px of its centre.
- **Labels sit under the sketch chrome.** `.cad-sketch-dim-labels` has
  z-index 1 (the mark labels' container has 3): a label that pans under the
  sketch bar, the status line or the readout passes beneath them. The script
  checks every label clear of the bar and the status line at both sizes.
- **The selection note follows the sketch bar.** The Dimension button wraps
  the bar to a second row at 1600 × 1000 (it already wrapped at 1366 × 768),
  and the note's fixed `top: 58px` then covered "Cancel sketch". The bar and
  the note now share one column (`.cad-sketch-top`), so the note sits under
  the bar whatever its height; the bar's look and every label are unchanged.
- **Keys.** D toggles with or without Shift (the key is compared lower-cased),
  never with Ctrl / Meta / Alt or on a repeat. Turning the tool on by the
  button or by D gives up a focus held in the sketch bar (`blur`), so Esc,
  D, Delete reach the sketcher and Space / Enter cannot re-press a button.
- **Undo last** skips a recorded item that is already gone (deleted since),
  and undoing an entity prunes its dimensions as Delete does. A reopened
  sketch (nothing recorded) undoes its entities last-first, then its
  dimensions.
- **Look at** frames each dimension's line ends, extension ends and label
  point (`dimensionPoints` at size 0: ticks and gaps are a few pixels); the
  workspace adds them to `sketchView` as zero-length segments. The automatic
  refit (an entity outside the view) passes them too.
- **The model rule (§3.1)** also refuses a radius ≤ 0 and an id repeated in
  one sketch. A sketch entry writes `dimensions` right after `entities`; an
  edited sketch drops its stored list and writes the new one (or none), so a
  sketch that never had dimensions saves exactly as before.
- **`formatMm` comes from `marks.js`**, which imports three.js: the pure
  module uses none itself, but importing it loads three.js transitively.
- **Status and panel.** "1 dimension" / "N dimensions"; the panel's
  "Dimensions · N" list is open up to 8 entries, like Primitives.
- **The verify script** types the shapes in the HUD with the pointer off the
  canvas and clicks the dimension points through `cadProject`. It picks body
  points clear of key points by more than the snap radius (the hole's body at
  45° and 135°; the sides 20–50 mm from the nearest corner or midpoint) and places
  step 11's two rectangles at x 400 and 660, clear of step 10's plate, whose
  edges are in the Draw plane. Step 6 also checks the selection note sits
  under the two-row sketch bar at both sizes.
- **The readout near an edge (audit).** Anchored by `left` beside a cursor
  at the right edge of the view, the readout was squeezed to a few words a
  line (step 5 at 1366 × 768). It now stands left of the cursor when there
  is no room on the right, and above it near the bottom
  (`CadSketcher.jsx` `READOUT_ROOM`, `readoutStyle`). The typed HUD of the
  drawing tools is as it was.

Audit (2026-11-15): 555 test files / 6742 tests pass, the SD-1 script and
`verify-outline-edit-oe1`, `verify-sketch-on-face`, `verify-start-sketch`,
`verify-measure-marks` rerun and pass.

Files: `sketchDimensions.js` (new: `dimensionPick`, `linearDimension`,
`radialDimension`, `dimensionGeometry`, `hitDimension`, `pruneDimensions`,
`splitDimensions`, `describeDimension`, `describePick`, `dimensionPoints`,
`nextDimensionNumber`), `sketchTools.js` (the Dimension tool, `dimensionStep`,
`pendingDimension`, `dimensionReadout`, `finishRefusal`, Undo last's record,
pruning on delete / undo), `CadSketcher.jsx` (the readout, hints, status
count, selection note, D, the hit test, Finish's refusal, the overlay data,
Look at, `.cad-sketch-top`), `CadViewport.jsx` (`sketch-dimension` lines in
`drawSketchOverlay`, the `.cad-sketch-dim-labels` chips, their placing in
`render()`, `cadSketchDimensions()`), `CadWorkspace.jsx` (`beginSketch`,
`editSketch`, `lookAtSketch`, `finishSketch`, the help paragraph),
`sketchOperations.js` (`sketchFromSession`, `outlineSketches`),
`SketchPanels.jsx` (`SketchSummary`), `model.js` (`normalizeModel`),
`cad.css`; tests `sketchDimensions.test.js`, `sketchDimensionTool.test.js`,
`CadSketcher.dom.test.jsx` (four new tests; the one `onFinish` assertion),
`CadWorkspace.sketchDimensions.dom.test.jsx`;
`scripts/verify-sketch-dimensions-sd1.mjs`; `docs/state-machines.md` (the
in-viewport sketcher row, the workspace tool session note),
`docs/sketch-studio-cad.md` ("Dimensions on a sketch (SD-1)").
