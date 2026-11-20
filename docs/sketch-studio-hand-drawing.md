# Sketch Studio — drawing an enclosure-level part by hand (HD-1 … HD-5)

Status: **researched + specced 2026-11-20. HD-0 (capacity) built + audited the same day
(`docs/sketch-studio-drawing-table.md` §9 and its status line). HD-1 built + audited
2026-11-20 (§14; the audit reran its tests, its browser script and three sibling scripts,
and the suite: 7222 passed), uncommitted. HD-2 built + audited 2026-11-20 (§15; the
audit reran its tests and scripts, probed `sketchIntersect.js` against brute force on 3 998
random pairs, and found two things on screen that §7.0 fixes), uncommitted. HD-3 built +
audited 2026-11-21 (§16; the audit reran its tests and all nine browser scripts, probed
the shapes' areas, every transform against the mapped outline, the patterns and a mirror
/ undo walk in the reducer, and read the screenshots: the suite 7331 passed and one
load-flaky brake timing test that passes alone; what it left is §8.0), uncommitted. HD-4
built + audited 2026-11-21 (§17; the audit reran its tests and all ten browser scripts,
read the screenshots, and probed the keyhole in all 24 orders with its own clicks, 1 496
random trims against independently found crossings, 2 792 chained trims for the meet rule,
525 random fillets, the offsets, Extend and Check's new rows: the suite 7392 passed, lint
0 errors; the build was not rerun by the audit, the machine ran short of memory; what it
left is §9.0), uncommitted. HD-5 refined (§9.0 – §9.6), not started.** Each phase appends its
"as built" section here; the audit follows it. The later phases (§6 – §9) are firm in what
they do and are refined with probes before each is launched.

Related: `docs/sketch-studio-sketch-shortcuts.md` (SK-1 keys), `docs/sketch-studio-bend-relief.md`
(BR-1: a tool that rewrites entities, and `rect` → four lines), `docs/sketch-studio-sketch-dimensions.md`
(SD-1), `docs/sketch-studio-outline-edit-sheet-nest.md` (OE-1: outlines reopen),
`docs/sketch-studio-drawing-table.md` (the withdrawn import; its capacity fixes and its
fixtures stay), `docs/state-machines.md` (the "In-viewport sketcher tool" row).

## 1. What the user asked (2026-11-20)

They showed `VW-400_DIMENSIONS.pdf` (a 400 × 500 × 120 distribution panel: a body with
walls, lips, corner tabs and reliefs, 68 cut-outs; a cover with two rounded windows and
360 hexagons; a mounting plate) as an EXAMPLE: "i want to draw my own model with that kind
of level or difficulty … is it feasible to draw that kind of drawing in this software?"
They do not want it imported. Then: "i dunno what is the tool list to achieve that kind of
level of drawing, can you do research … make sure the system you are building is robust
and UX friendly".

## 2. Research

### 2.1 What the example is made of, and how a drafter draws each

| In the example                                                                                   | A drafter's moves                                                                                                        | Needs                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Outline, 68 corners, symmetric left-right and top-bottom, every corner dimensioned from one zero | type corners as X, Y from the zero; or rectangles + trim; draw a quarter, mirror twice                                   | X, Y on every point, a movable zero, Mirror, Trim |
| Corner reliefs 5 × 5, tab reliefs 1.5 × 2.5, 45° mitres                                          | relief tool; small rectangles + trim; chamfer                                                                            | Relief (there), Trim, Chamfer                     |
| 38 round holes, most in mirrored sets                                                            | circle by centre and DIAMETER; mirror; copy by a distance                                                                | Ø entry, Mirror, Copy                             |
| 28 vent slots 46 × 4 at ±18°, 7 per group stepping −2.2 / +11                                    | one slot (centre, length, width, angle); pattern by a step; copy; mirror                                                 | Slot, Pattern, Copy, Mirror                       |
| 18 cable-tie slots in pairs, 3 × 3 grid of pairs                                                 | one slot; copy 12; grid pattern                                                                                          | Slot, Pattern                                     |
| Keyhole Ø10 + 5 wide slot                                                                        | circle + slot + trim the overlap                                                                                         | Slot, Trim                                        |
| Rounded windows 326 × 46 R1                                                                      | rectangle with a corner radius, or fillet                                                                                | Rounded rectangle / Fillet                        |
| 360 hexagons, staggered rows, sizes following a wave                                             | one hexagon, a staggered fill of an area with a margin (uniform size; the wave is generative art, no hand tool makes it) | Polygon, Fill                                     |
| A wrong number found later                                                                       | select it, change the number                                                                                             | editing what is drawn, Undo / Redo                |
| "Why is it not closed?"                                                                          | the program shows where                                                                                                  | a drawing check with markers                      |

### 2.2 What established tools give (sources at the end)

- **Mechanical sketchers** (Fusion, FreeCAD Sketcher): create Line, Rectangle, Circle, Arc,
  **Slot** (centre-to-centre, overall, centre point), **Polygon**, Point, Text; modify
  **Fillet, Chamfer, Trim, Extend, Break, Offset, Scale, Move / Copy, Mirror, Rectangular
  and Circular pattern**; a construction toggle. They lean on constraints, which this app
  removed at the user's request (2026-08-15): so the model here is the drafting one.
- **Drafting (AutoCAD)**: precision comes from typed coordinates, not constraints. The
  first point is absolute; the next defaults to distance + angle from the last; a prefix
  switches (`#` absolute, `@` relative). Object snaps. Selection by a box: dragged left to
  right takes what is wholly inside, right to left what it touches.
- **Panel and enclosure tools for non-CAD users** (Front Panel Designer, Protocase
  Designer): every object is placed by NUMBERS from a reference point the user can move
  (an edge centre, a corner), and is edited afterwards in a properties box; a snap point
  plus an offset ("DY = −15") is the everyday move; a library of ready cut-outs; elements
  that are "not produced" serve as markers. This is the friendliest model found, and the
  closest to how the user's own drawing is dimensioned (one zero, X / Y per feature).
- **Perforation** (SolidWorks Fill Pattern): a seed shape, a boundary, a layout
  (perforation = staggered), spacing, stagger angle, margins.
- **Making rules** fabricators publish: hole Ø and slot width not under the thickness
  (lasers manage about half), web between cut-outs and to the edge about 1 – 2 t, a hole no
  nearer a bend than about 2 t + r (the fold already notes `hole-near-bend`). Numbers
  differ per shop: they are notes, never refusals.

### 2.3 What the sketcher has (read 2026-11-20)

- `cad/sketchTools.js` (the reducer): Line, Rectangle, Centre rectangle, Circle, 3-point
  arc, Dimension, Relief; ONE selected entity (`selectedId`), Delete; "Undo last" (removes
  the last thing ADDED: no redo, a delete or a relief's change of mind is not history);
  typed X, Y on a tool's first point only, then Length + Angle / Radius / Width + Height
  (`sketchFields` :239); `=expressions` with the model's parameters.
- `cad/sketchSnap.js`: origin, endpoints, midpoints, centres, quadrants, on an edge, grid;
  Shift = ortho. No intersection snap.
- `cad/sketchProfile.js`: entities `line`, `rect` (axis-aligned, one entity), `circle`,
  `arc` (3-point); `construction: true` entities already take no part in the profile, but
  nothing sets the flag and the overlay draws them like the rest.
- `CadViewport.jsx` :3054: while sketching the left button never orbits ("Left button
  draws while sketching; right-drag pans and the wheel zooms"): a left drag is free.
- BR-1's Relief is the precedent for a tool that rewrites entities (`cutRelief` returns
  the new list; a `rect` it touches becomes four lines).
- SD-1 dimensions are free records (`from`, `to` / `center`, `radius`) that "hang" on an
  entity by lying on it within 0.001 mm (`pruneDimensions`).
- The 2D drafting studio (`utils/trimUtils.js`, `mirrorUtils.js`, `arrayUtils.js`,
  `filletUtils.js`, `chamferUtils.js`, `offsetUtils.js`, `extendUtils.js`) has these tools
  on its own entity model (`{ x, y }` points, polylines, arcs as quadratic Béziers). Its
  behaviour is the sibling to match in feel (click the piece to trim, count 2 – 200,
  originals kept by a mirror); its maths is not reusable on true arcs.
- Capacity (measured): 68 cut-outs 3 – 4 s per solid rebuild, 368 out of memory; the
  overlay rebuilt per pointer move; `entitiesToProfile` 170 ms at 2 210 entities. HD-0.

### 2.4 The answer

The shop already folds parts of this level (the example's three blanks fold in
`foldSheet`, the body to 400 × 500 × 120). Drawing them by hand is not practical today:
about 700 typed numbers for the body, most worked out on a calculator, and no way to
change one afterwards. With the kit below the body is about 60 typed numbers and 25
operations, read straight off a drawing.

## 3. Design

### 3.1 Principles

1. **Numbers first.** Everything can be placed and changed by typing; the pointer is the
   fast way, never the only way. X and Y read from a zero the user can move.
2. **Select, then act.** With nothing selected the bar shows what can be drawn; with a
   selection it shows what can be done to it. No tool asks for a selection in a second
   mode.
3. **Nothing drawn is final.** Every action is one step of Undo / Redo; a drawn thing
   keeps its numbers and they can be edited.
4. **One thing stays one thing.** A slot, a polygon and a rectangle are single entities
   with their own numbers, as `rect` is today; a tool that has to cut into one turns it
   into its lines and arcs first, as Relief does.
5. **The drawing explains itself.** What a click would do is shown before the click
   (preview + a readout by the cursor); a refusal says why in the status line and changes
   nothing; a drawing that does not make a blank shows where.
6. **Same file, same kernel.** Entities stay sketch-plane millimetres; the profile is
   still `entitiesToProfile(entities)`; new entity keys are optional; `CAD_VERSION` is
   not bumped.

### 3.2 The system (all phases)

- **Pure core.** Every tool is a pure function on the entity list in its own small module
  under `cad/` (`sketchSelect.js`, `sketchHistory.js`, `sketchEdit.js`, `sketchShapes.js`,
  `sketchTransform.js`, `sketchPattern.js`, `sketchTrim.js`, `sketchCheck.js`), with its
  own test file; `sketchTools.js` stays the one reducer that calls them; `CadSketcher.jsx`
  stays the one owner of pointer and keys. No three, no DOM in the pure modules.
- **Entities.** `line { a, b }`, `rect { a, b, r? }`, `circle { c, r }`, `arc { a, b, m }`,
  and from HD-3 `slot { c, length, width, angle }` (overall length, degrees CCW from +X)
  and `polygon { c, sides, af, angle }` (regular, across flats; `angle` 0 = a flat at the
  bottom). Any entity may carry `construction: true`. `explode(entity)` (sketchProfile.js)
  gives the lines and arcs of any entity; every reader that needs primitives goes through
  it, every reader that needs a polyline through `entityPolyline`.
- **Selection** is a set of entity ids, or one dimension.
- **History** is a stack of `{ entities, dimensions }` snapshots (the arrays are never
  mutated, so a snapshot is two references), one per committed action, capped at 200.
- **Dimensions follow.** After any change, a dimension end that lay on a key point of a
  changed entity moves with that point; a radial one follows its circle; one whose entity
  is gone is pruned (today's rule).
- **Ids.** `e{n}` from `nextId`, never reused within a session; a transformed entity keeps
  its id, a copy gets a new one.

### 3.3 The bar

Groups, in this order, each with a small label; it wraps as today and nothing is hidden in
a menu: **Draw** (Line, Rectangle, Center rectangle, Circle, 3-point arc; HD-3 adds Slot,
Polygon) · **Edit** (HD-4: Trim, Extend, Fillet, Chamfer, Offset) · **Mark** (Dimension,
Relief, Construction) · **Undo last, Redo** · Snap · Zero · Look at · Check · **Finish
sketch, Cancel sketch**. Under the bar, ONE options row at a time: the tool's options
(Relief's today), or with a selection and no tool the selection's row: its numbers
(§5.3) and, from HD-3, Move, Copy, Rotate, Mirror, Pattern, then Delete selected.
Measured at 1366 × 768: the bar and its row never cover more than a fifth of the view.

Keys (SK-1's stay): L, R, Shift+R, C, A, D, B, Ctrl+Z; new **Ctrl+Y / Ctrl+Shift+Z** Redo,
**Ctrl+A** select all, **X** Construction, **Z** Set zero, **S** Slot, **P** Polygon,
**T** Trim, **E** Extend, **F** Fillet, **H** Chamfer, **O** Offset, **M** Move, **K**
Copy, **Q** Rotate, **I** Mirror, **G** Pattern. The rule of SK-1 §3 holds for every
letter: from a HUD field only while that field is empty.

## 4. HD-0 — capacity

`docs/sketch-studio-drawing-table.md` §3.2 items 2 – 4 and its §9: the kernel takes
cut-outs as one compound face, the overlay keeps the entity batch between pointer moves,
loops are found through a hash and box tests.

## 5. HD-1 — select, undo and redo, change what is drawn, construction

### 5.1 Selection (`sketchSelect.js`, reducer, `CadSketcher.jsx`)

- State: `selectedIds` (array, drawing order) replaces `selectedId`; `selectedDimensionId`
  stays, and a dimension is selected alone.
- With no tool: a click on an entity selects it alone; Shift or Ctrl + click adds or
  removes it; a click on nothing clears. A left drag (more than 4 px, started on nothing)
  is a box: dragged to the right it takes entities wholly inside (drawn solid), to the
  left every entity it touches (drawn dashed); with Shift the box adds. **Ctrl+A** selects
  every entity. Esc clears a selection before it leaves the sketch (today: Esc with no
  tool finishes; now Esc with a selection only clears it).
- `boxSelect(entities, [p, q], mode)` is pure: inside = every point of `entityPolyline`
  in the box; touching = any segment crosses or lies in it.
- Delete / Backspace and **Delete selected** remove the whole selection in one step.
- The overlay draws every selected entity in the selected colour (within HD-0's batch
  rule: the unselected batch is rebuilt only when the entities or the selection change).
- The selection note under the bar: one entity as today ("Line 46 mm · Delete removes
  it"); several: "5 selected: 3 lines, 2 circles · Delete removes them".

### 5.2 History (`sketchHistory.js`)

- `commit(state, next)` pushes the state's `{ entities, dimensions }` and clears the redo
  stack; every action that changes the drawing goes through it (an added entity, a
  dimension, a relief, a delete, an edit of §5.3, a construction toggle). A tool switch, a
  move of the cursor, a selection, a typed-but-not-entered value are not history.
- **Undo last** (the button keeps its name; Ctrl+Z, Meta+Z) steps back; **Redo** (Ctrl+Y,
  Ctrl+Shift+Z) forward. Both drop a half-drawn shape first (as Undo last does today),
  keep the tool, and keep of the selection what still exists. Disabled when there is
  nothing to step to.
- This replaces the `added` list. One behaviour changes and its tests change with it,
  named in the report: on a sketch just reopened, Undo last used to remove the last
  entity although nothing had been done; now it is disabled until something is.
- The capture-phase Ctrl+Z rule of SK-1 (never the model's undo while a sketch is open)
  holds for Redo as well.

### 5.3 The selection's numbers (`sketchEdit.js`, the options row)

With exactly one entity selected and no tool, the row shows its numbers in
`NumericInput` boxes (Enter or blur commits; the `useNumericDraft` rule), X and Y from
the zero point (HD-2; the sketch origin until then):

| Entity | Boxes                                                                                       |
| ------ | ------------------------------------------------------------------------------------------- |
| line   | X1, Y1, X2, Y2, Length, Angle (Length and Angle move end 2 about end 1)                     |
| rect   | X, Y (lower-left), Width, Height                                                            |
| circle | X, Y (centre), Diameter                                                                     |
| arc    | X1, Y1, X2, Y2, Radius (the same side and the same ends; refused when under half the chord) |

- `editEntity(entities, id, patch)` returns the new list or throws the refusal ("A
  rectangle needs a nonzero width and height."); a commit is one history step; dimensions
  follow (§3.2).
- A line end that other lines or arcs end on moves ALONE: the row says "This end joins 2
  others: they stay" when that opens the outline, and the check (HD-2) marks it. (Moving
  joined ends together is Move's job in HD-3.)

### 5.4 Construction

- **Construction** (X) is a toggle: with a selection it flips `construction` on the
  selected entities (one history step); with none it arms the Draw tools, and what is
  drawn while it is on is construction. Its button shows pressed in either case.
- Construction entities are drawn dashed in the boundary colour, snap like any other,
  are selected, edited and deleted like any other, and take no part in the profile
  (already so in `profileLoops`). The status line counts them apart: "12 items · 3
  construction · closed profile".
- Relief ignores them (already so); a dimension may hang on one.

### 5.5 Acceptance (HD-1)

- `sketchSelect.test.js`: `boxSelect` inside / touching for a line, a circle straddling
  the box, an arc, a rect; an empty box.
- `sketchHistory.test.js` and reducer tests: draw line, circle → undo ×2 → redo ×2 equals
  the drawn state by identity of the arrays; a new action after an undo clears redo; a
  delete of three entities is one step and undo brings back all three in place with their
  dimensions; a relief then undo then redo; the cap; a half-drawn line is dropped by undo
  without stepping back twice; undo on a reopened sketch is a no-op.
- `sketchEdit.test.js`: each box of §5.3 on each entity (the line's Length keeps end 1 and
  the direction; the circle's Diameter keeps the centre; the arc's Radius keeps both ends
  and the side); refusals with their words; a dimension on the edited circle shows the new
  diameter; a dimension between two line ends follows the moved end.
- Reducer: Shift-click adds and removes; Esc clears the selection, a second Esc with none
  and no tool is still "finish"; Ctrl+A; Delete on five; construction toggle on a
  selection and armed (a drawn line carries the flag) and `entitiesToProfile` ignores it.
- `CadSketcher.dom.test.jsx` (added cases): the box drag in both directions through the
  canvas's pointer events (down, moves, up: the real sequence); the row's boxes for a
  selected circle, a typed diameter and Enter change the entity and `onFinish` receives
  it; Redo's button and keys; X; the status counts; no assertion of the existing cases
  edited except the reopened-sketch undo.
- Existing sketcher tests (`sketchOnFace`, `sketchDimensionTool`, `sketchReliefTool`,
  `sketchKeys`, `CadSketcher.dom`, the `CadWorkspace.*` that open a sketch) pass.
- Browser, `scripts/verify-hand-drawing-hd1.mjs` (steps from `scripts/sketch-cad-steps.mjs`,
  vite on 5180 `--strictPort`, screenshots at 1600 × 1000 and 1366 × 768 into
  `artifacts/sketch-cad/hand-drawing-hd1`): Shop → Draw → Draw the outline; a 200 × 120
  rectangle and five circles; box-select three circles to the right, then all five with a
  box to the left (screenshots of both boxes); delete them; Ctrl+Z brings five back; Ctrl+Y
  removes them; Ctrl+Z; select one circle, type Diameter 12 and X 50 → the readouts and
  the drawing change; a construction centre line (X armed), status "… · 1 construction ·
  closed profile"; Finish → an outline ready to cut with five cut-outs; Edit → the
  construction line is still there, dashed. No page error. Then
  `verify-bend-relief-br1`, `verify-sketch-dimensions-sd1`, `verify-outline-edit-oe1`,
  `verify-sketch-shortcuts-sk1` (if present), `verify-start-sketch`,
  `verify-sketch-on-face` still pass; unit suite, lint 0 errors, `npm run build`.

## 6. HD-2 — numbers on every point, a zero you can move, a drawing that says what is wrong

- **X, Y on every point.** Line's next point: Length, Angle, X, Y. Typing in X or Y makes
  the point absolute (from the zero); a box left empty takes the cursor's live value shown
  in it, as today; of the two pairs the one typed last wins and the other greys. `@` before
  a number in X or Y measures from the last point (`@13.94`). Rectangle's second corner and
  the arc's points take X, Y the same way. Circle: **Diameter** beside Radius (the last
  typed wins).
- **Zero** (Z): click a point (any snap) and every X, Y shown or typed, in the HUD, the
  status line and the selection's row, is measured from it; a marker stands on it; "Reset
  zero" in its options row. Kept for the session and stored with the sketch (`sketch.zero`,
  optional) so an edit reopens with it. Entities stay in sketch coordinates.
- **Intersection snap**: where two entities cross (line / arc / circle, exact).
- **Check** (`sketchCheck.js`, pure; the bar's Check and a click on the status line's
  "open outline" open its list): open ends (with the gap to the nearest other end, and
  "Close it" when under 0.5 mm: moves one end onto the other), three or more lines at one
  point, duplicate or overlapping entities ("Remove the copy"), a cut-out crossing the
  outline or another cut-out, a cut-out outside the outline, an entity shorter than 0.01
  mm. Each row frames its place on a click; each problem has a red marker in the view
  while the list is open. ~~Finish with problems says the first and opens the list~~
  (withdrawn, §6.5; the shop's rule that only a closed outline is ready to cut is
  unchanged).

The bullets above are the scope. §6.1 – §6.7 refine them after HD-1 was audited and the
code read again (2026-11-20); where they differ, the numbered sections win.

### 6.1 The zero (`state.zero`, `sketch.zero`)

- `state.zero` is a sketch-plane point, `[0, 0]` unless moved. Entities, dimensions, snap
  and the profile stay in sketch coordinates: the zero only changes what is **shown** and
  what a **typed** X or Y means. One pair of pure helpers (`fromZero(point, zero)`,
  `toZero(point, zero)`, in `sketchTools.js` or a small `sketchZero.js`) is the only place
  the subtraction lives.
- Shown from the zero: the HUD's X, Y (live and typed), the status line's cursor readout,
  the selection row's X, Y, X1 … Y2 (`entityFields(entity, zero)` and the `edit` patch back),
  the selection note ("Circle Ø12 at (50, 60)": `describeEntity(entity, zero)`). Lengths,
  angles, ΔX / ΔY and dimension values never change with it.
- **Zero** is a tool (`tool: 'zero'`, key **Z**, a button "Zero" in the bar after Snap):
  one click on any snapped point (or X, Y typed in the HUD, measured from the zero as it
  is) sets the zero there and ends the tool (no tool on after it). Its options row while
  the tool is on: "Zero at X …, Y … from the sketch origin" and **Reset zero** (back to
  `[0, 0]`, ends the tool); with the zero at the origin the row says "The zero is the
  sketch origin · click a point to measure from it".
- While the zero is not the origin: a marker stands on it in the view (a small crossed
  circle in the snap colour, its own overlay piece keyed on the zero and the marker size
  bucket), the status readout ends "… mm from the zero", and the Zero button shows pressed
  (`aria-pressed`) with the title "Zero at (X, Y): Z to move or reset it".
- Not a history step (it changes no entity; Undo never moves it). Stored with the sketch
  as optional `sketch.zero: [u, v]`, the key absent at the origin: `onFinish(entities,
dimensions, { zero })` → `finishSketch` → `sketchFromSession` / `outlineSketches` (each
  outline of a split keeps the same zero); `beginSketch` gives a reopened sketch its
  `zero`. A sketch whose zero was never moved finishes byte-for-byte as before (test).
  A sketch whose only change is the zero is stored (one model step).

### 6.2 The HUD's boxes

| Tool, step                             | Boxes                | Rule                                             |
| -------------------------------------- | -------------------- | ------------------------------------------------ |
| any first point; every arc point; Zero | X, Y                 | from the zero; `@` from the last point           |
| Line, next point                       | Length, Angle · X, Y | two pairs                                        |
| Rectangle, second corner               | Width, Height · X, Y | two pairs (Center rectangle: X, Y is the corner) |
| Circle, size                           | Radius · Diameter    | one of the two                                   |

- **Pairs.** Typing in a box of one pair empties the other pair's typed text (reducer,
  `typed`); the other pair then shows, greyed (`is-derived`), what the typed pair gives
  (the resulting point's X, Y, or its Length and Angle / Width and Height). A box of the
  typed pair left empty takes the cursor's live value, as today. Radius and Diameter the
  same: the one typed empties the other, which shows the derived value. The HUD lays the
  pairs on two rows; Tab runs through all the boxes in the order of the table.
- **`@`.** In an X or Y box a leading `@` measures from the last point placed
  (`state.lastPoint`: the tool's own previous point, or with none the last point placed by
  any tool in this sketching session); the rest is an ordinary entry (`@13.94`, `@-5`,
  `@=pitch`). Each box on its own: `X @25`, `Y` empty is 25 to the right at the cursor's
  height. With no point placed yet: "@ measures from the last point: place one first."
  The resolved line under the box (as `=` has) says the absolute value from the zero.
- Existing words stay ("Length must be greater than zero."). A letter key still acts only
  from an empty box; `@` is typed, never a key.

### 6.3 Intersection snap (`sketchIntersect.js`, pure, LF, with its test file)

- `primitives(entity) → [{ type: 'segment', a, b } | { type: 'arc', center, radius, start,
sweep, a, b } | { type: 'circle', center, radius }]` (a rect is four segments; HD-3's
  entities will add theirs) and `intersect(p, q) → points` for every pair of the three
  kinds, exact (closed form, no sampling), tangency as one point, an arc's own range
  respected to 1e-9, overlapping collinear segments and coincident circles giving none.
  `entityIntersections(a, b)` on two entities. HD-4 (Trim, Extend, Fillet) is built on the
  same module: keep it general and exhaustively tested (each pair, tangent, miss, end-on).
- `snapTargets` also carries the entities (and the boundary segments) with their boxes;
  `snapPoint` looks for intersections **near the cursor only**: the entities and boundary
  edges whose box grown by the tolerance holds the raw point, pairwise. It is never an
  all-pairs pass over the drawing (2 210 entities on the example's cover). Kind
  `'intersection'`; among key points and intersections the nearest wins, a key point on a
  tie; both before on-edge and grid. Construction entities take part (a construction
  crossing is the main use). Ortho (Shift) is as today.
- Budget: `snapPoint` on the cover's 2 210 entities ≤ 1 ms median in node.

### 6.4 Check (`sketchCheck.js`, pure, LF, with its test file)

`checkDrawing(entities, { sheet } = {}) → { problems: [{ id, kind, text, at: [u, v],
points: [...], entityIds: [...], fix?: { label, kind } }], notes: [...] }` and
`applyFix(entities, dimensions, problem) → { entities, dimensions }` (one history step in
the reducer, action `fix`). Construction entities are never a problem. Kinds:

| Kind        | Found when                                                                                            | Words                                                                                    | Fix                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `open-end`  | a drawn line or arc end that no other drawn line or arc end meets (the tolerance `chains` joins with) | "Open end at (X, Y): 0.3 mm from the nearest other end" / "… : no other end within 5 mm" | under 0.5 mm: **Close it** (this end moves onto the other; the dimensions follow) |
| `branch`    | three or more drawn line / arc ends at one point                                                      | "3 lines meet at (X, Y): an outline corner joins two"                                    | none                                                                              |
| `duplicate` | two drawn entities with the same geometry (either direction, 1e-6)                                    | "Two circles on the same place at (X, Y)"                                                | **Remove the copy** (the later one)                                               |
| `overlap`   | two collinear drawn lines sharing more than a point                                                   | "Two lines overlap for 12 mm at (X, Y)"                                                  | none (HD-4's Trim)                                                                |
| `crossing`  | two closed loops whose edges cross (exact, `sketchIntersect.js`), or an open chain crossing a loop    | "A cut-out crosses the outline at (X, Y)" / "Two cut-outs cross at (X, Y)"               | none                                                                              |
| `tiny`      | a line or arc shorter than 0.01 mm, a circle under Ø0.01                                              | "A line 0.004 mm long at (X, Y)"                                                         | **Remove it**                                                                     |
| `nested`    | a closed shape inside a cut-out (`profileLoops`: more than one parent)                                | "A shape inside a cut-out at (X, Y) is left out of the blank"                            | none                                                                              |

- **Notes** (never problems): "2 separate outlines: Finish makes 2 sketches" (today's
  rule, `splitOutlines`); with nothing wrong "Nothing to fix: a closed outline with 68
  cut-outs." X, Y in the words are from the zero.
- It must agree with `entitiesToProfile`: whenever that says an outline is open or
  branching, Check has at least one located problem (a property test over random
  drawings and over the three fixture parts, which have none).
- Budget: the cover (2 210 entities) ≤ 150 ms in node, boxes and a grid before any exact
  test; it runs only while the list is open or to count for the status line, memoised on
  the entities array.

### 6.5 Check on screen

- A **Check** button in the bar (after Look at; no key). It opens a panel at the lower
  left of the view above the status line (`role="region"`, `aria-label="Check"`, at most
  40 % of the view's height, its list scrolls, a Close button, Esc closes it before
  anything else Esc does when the focus is in it): the header "Check · 3 to fix" or
  "Check · nothing to fix", one row per problem (the words; a click or Enter on the row
  frames its place through `onLookAt` with the problem's points and selects its entities;
  the fix as a button in the row), then the notes.
- While it is open each problem has a red ring marker in the view (one overlay piece
  keyed on the problems array and the marker size bucket); the row under the pointer or
  with the focus draws its marker larger.
- The status line's last part becomes a button when there is something to fix: "7 items ·
  open outline · 2 to fix" opens Check. A drawing with nothing to fix reads as today.
- **Finish is not changed.** (The bullet above said Finish with problems opens the list:
  withdrawn. An open outline is a valid stored sketch today, a sweep path, and tests pin
  it.) After a finish the workspace's own words stand as today.
- A fix is one Undo step; the list recomputes; the focus stays in the list on the next row.

### 6.6 Also in HD-2

- `followDimensions` is used by "Close it" (an end moved).
- The guide (`docs/sheet-metal-shop-guide.md` §1): "Typing where things go" (X, Y, `@`,
  the zero, Diameter) and "Checking the drawing"; the sketching help text in
  `CadWorkspace.jsx`; `docs/state-machines.md` row (the `zero` tool, the Check panel:
  every way out closes what it owns).
- The bar and its row stay within a fifth of the view at 1366 × 768 with Zero and Check
  added (measure; compact further if needed, names unchanged).

### 6.7 Acceptance (HD-2)

- `sketchIntersect.test.js`: every pair kind, tangent, miss, an arc's range at both ends,
  collinear overlap, a rect against a circle; numbers checked against hand-worked values.
- `sketchSnap` tests: an intersection of two construction lines snaps; a key point wins a
  tie; no all-pairs pass (a spy or a timing on the cover fixture).
- Reducer tests: the table of §6.2 step by step; the pair rule both ways; Radius vs
  Diameter; `@` on each box, on a first point after another tool's point, refused with no
  point; every X, Y with a moved zero (HUD, typed, row, note); the zero is no history
  step; Reset zero.
- `sketchCheck.test.js`: each kind found and worded, each fix applied and undone as one
  step, agreement with `entitiesToProfile` (property test), the three fixture parts
  clean and inside the budget.
- `CadSketcher.dom.test.jsx`: the four boxes of a line's next point and the greyed pair;
  Zero by click and by key, the marker piece, the status words; Check opened from the
  button and from the status line, a row's fix, Esc; a stored sketch with and without
  `zero` finishing unchanged. A `CadWorkspace` test: `sketch.zero` stored and given back
  on Edit.
- `scripts/verify-hand-drawing-hd2.mjs` (Playwright, as HD-1's): an L-shaped outline drawn
  with Line by typed absolute X, Y only; the zero moved to its inner corner and a hole
  placed by X, Y from it; a second hole by `@25` from the first; Diameter typed; two
  construction lines and a hole clicked on their crossing ("intersection" in the status
  line); a 0.3 mm gap left in the outline → "open outline · 1 to fix" → Check → Close it
  → "closed profile"; Finish → ready to cut; Edit → the zero where it was. Screenshots at
  1600 × 1000 and 1366 × 768, looked at; coverage measured.
- Everything of §5.5 still passes (HD-1's tests and script, the six scripts it names).

## 7. HD-3 — shapes, and moving, copying, mirroring, patterns

- **Slot** (S): centre, then the far end's centre (or typed Length, Width, Angle); options
  row: Width, "Length is: overall | centre to centre". **Polygon** (P): centre, then a
  flat's middle (or typed Across flats, Angle); options: Sides (3 – 12), "Size is: across
  flats | across corners". **Rectangle**: a Corner radius box in its options row
  (`rect.r`). Each is one entity with its row of numbers (§5.3 extended).
- With a selection: **Move** (M; base point → target, or typed ΔX, ΔY; joined ends of the
  selected entities move together), **Copy** (K; the same, the original stays; stays armed
  for more copies until Esc), **Rotate** (Q; centre, then angle, typed or clicked; "Keep
  the original"), **Mirror** (I; two points or a construction / drawn line as the axis;
  the original stays unless "Remove the original"), **Pattern** (G): Row (count, ΔX, ΔY or
  spacing + angle), Grid (columns, rows, column step, row step, "Stagger every other row"),
  Circle (centre, count, total angle), each with a live preview, the count of what it will
  add, and Apply. A left drag that starts on a selected entity is Move (Esc reverts it,
  no history step). A rotated or skew-mirrored `rect` becomes its lines; slots, polygons
  and circles stay themselves.
- Guards: a pattern over 2 000 new entities asks before it runs; copies that would land
  exactly on an existing entity are refused with the count.

The bullets above are the scope. §7.0 – §7.8 refine them after HD-2 was audited
(2026-11-20); where they differ, the numbered sections win.

### 7.0 Two things HD-2's audit found (fix first)

- **A Check row frames its place with its surroundings.** Today Enter on "Open end … 0.3
  mm" zooms until the 0.3 mm gap fills the view: nothing around it can be read. The frame
  is the problem's points grown to a span of at least four times their extent and never
  under 10 mm.
- **Marker sizes follow the view.** The zero marker, Check's rings, the snap marker and the
  dimension arrows are sized from the pointer's last move, so after a view change with no
  pointer move (a Check row framed from the keyboard, Look at, a wheel zoom) they keep the
  old size: a ring fills the whole view. The sketcher learns the view's millimetres per
  pixel on every camera change (throttled to a frame), not only on a pointer move.
  `verify-hand-drawing-hd2.mjs` gains a check that the ring's radius on screen after a row
  is framed is under 40 px.

### 7.1 Three shapes that stay one thing (`sketchShapes.js`, pure, LF)

- `slot { c, length, width, angle }`: `length` overall (tip to tip), `width` across,
  `angle` degrees counter-clockwise from +X; `length > width > 0`.
  `polygon { c, sides, af, angle }`: regular, `sides` 3 – 12, `af` across flats (twice the
  inradius, for odd counts too), `angle` 0 = one flat at the bottom, degrees CCW.
  `rect { a, b, r? }`: `r` a corner radius, `0 < r ≤ min(width, height) / 2`; the key is
  absent for a sharp rectangle (a rectangle stored before HD-3 is unchanged).
- `explode(entity) → [line | arc]` (in `sketchProfile.js`, built on `sketchShapes.js`):
  the lines and arcs of any entity in drawing order, counter-clockwise, no zero-length
  piece (a rectangle with `r` half its height has two lines and two arcs); a line or arc
  is itself. Ids `"{id}.{n}"` when a tool keeps the pieces (Relief, a rotated rectangle):
  the reducer then renumbers them from `nextId` as Relief does today.
- **Every reader goes through it or through `entityPolyline`.** Before writing a tool,
  sweep `src/features/sketchstudio/cad/` for every reader of sketch entities and of
  `entity.type` (at least: `sketchProfile.js` `entityPolyline`, `entityKeyPoints`,
  `entitySegments`, `profileLoops`, `loopProfile`, `describeEntity`, `hitEntity`;
  `sketchSnap.js`; `sketchIntersect.js` `primitives`; `sketchCheck.js`; `sketchEdit.js`;
  `sketchSelect.js`; `sketchDimensions.js`; `sketchRelief.js`; `outlineMove.js`;
  `sketchOperations.js`; `CadSketcher.jsx`; the overlay in `CadViewport.jsx`) and list
  each in the as-built with what it does for the three shapes. None may fall through to
  "unknown type" silently.
- **Profile.** A slot and a rounded rectangle are closed loops whose profile is a `path`
  of lines and arcs (start at the first line's start, exact 3-point arcs); a polygon is
  `{ type: 'polygon', points }`. Both forms are what the kernel and `foldSheet` already
  take (the capacity probes of HD-0 ran on exactly these). `editableEntities` must keep
  working: `entitiesToProfile` of the same entities gives the same JSON every time (test).
- **Key points** (snap, dimensions, `followDimensions` by index, so the order is fixed and
  documented): slot: centre, the two end centres, the two tips, the four ends of its
  straight sides, their two midpoints; polygon: centre, corners, flat midpoints; rounded
  rectangle: its four arc centres, the eight tangent points, the four side midpoints, the
  centre. A sharp rectangle's are as today.
- **Numbers** (the selection row, from the zero): slot X, Y, Length, Width, Angle;
  polygon X, Y, Sides, Across flats, Angle; rectangle X, Y, Width, Height, Radius (empty
  or 0: sharp). Refusals in words ("A slot's length must be more than its width.",
  "The corner radius can be at most half the shorter side: 12 mm here.").
- **Note words:** "Slot 22 × 5 at (60, 28)", "Hexagon 10 across flats at (…)" (Triangle,
  Square, Pentagon, Hexagon, Heptagon, Octagon, then "9-sided polygon"), "Rectangle 100 ×
  60, corners R5".
- The Dimension tool: a slot's or polygon's straight side is a side like a rectangle's; a
  slot's end and a rounded corner measure as arcs (radius). Relief on any of the three
  explodes it first, as it does a rectangle.

### 7.2 Drawing them

| Tool                        | Key        | Clicks                                         | HUD                                                       | Options row                                                                          |
| --------------------------- | ---------- | ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Slot                        | S          | the centre, then the far end's centre          | X, Y; then Length, Angle · X, Y                           | Width; "Length is" overall / centre to centre; "First click is" the centre / one end |
| Polygon                     | P          | the centre, then a flat's middle (or a corner) | X, Y; then Across flats (or Across corners), Angle · X, Y | Sides (3 – 12); "Size is" across flats / across corners                              |
| Rectangle, Center rectangle | R, Shift+R | as today                                       | as today                                                  | Corner radius (empty: sharp)                                                         |

- The options are kept for the sketching session and for the next sketch (as Relief's
  are: reported up through one `onShapeOptionsChange`), default Width 5, Sides 6.
- With "one end" the first click is one end's centre and the second the other's; the
  entity still stores `c`. The preview is the true shape; a refused size says why by the
  cursor and adds nothing.
- Construction armed marks them like the other Draw tools.

### 7.3 Acting on a selection (`sketchTransform.js`, pure, LF)

The selection row, after the numbers: **Move**, **Copy**, **Rotate**, **Mirror**,
**Pattern**, then Delete selected. Keys M, K, Q, I, G act when there is a selection and no
tool; with nothing selected they say "Select what to move first." in the status line.
An action is `state.op` (`{ kind, step, … }`, never `state.tool`): the selection stays,
the row shows the action's options instead of the numbers, the status line says the next
step, Esc ends the action first (the selection stays), a tool key or button ends it and
takes the tool, Undo during it drops it. One history step per applied action.

- **Move:** HUD ΔX, ΔY: typed and Enter moves at once. Or click a base point, then the
  target: HUD ΔX, ΔY · X, Y (the target, from the zero), a ghost of the selection
  following the cursor. Shift locks to horizontal / vertical from the base.
- **Copy:** the same; the original stays, the copies become the selection only when the
  action ends; it stays on for more copies from the same base until Esc (each copy one
  step).
- **Rotate:** click the centre (or type X, Y), then the angle: HUD Angle (degrees CCW),
  live from the cursor's direction about the centre, whole degrees while Snap is on, 15°
  steps with Shift. Options: "Keep the original".
- **Mirror:** options row: **Left ↔ right about the zero**, **Top ↔ bottom about the
  zero** (two buttons, each applies at once: the common case of a part drawn about its
  centre) and "Remove the original" (off). Or in the view: over the body of a line that
  is not selected (construction or drawn) the ghost shows the mirror about that line and
  a click applies it; a click on any other point is the axis's first point, the second
  click its other end.
- What a transform does to each type: lines, arcs, circles, slots and polygons stay
  themselves (a slot's and a polygon's `angle` turns or reflects; an arc keeps its three
  points, mirrored); a `rect` stays a `rect` when its sides stay along X and Y (a move, a
  turn by a multiple of 90°, a mirror about a horizontal or vertical axis), else it
  becomes its lines and arcs. A moved entity keeps its id; copies and exploded pieces take
  new ids from `nextId`.
- Only the selected entities move: what joined them stays, and Check then shows the open
  ends. The dimensions hanging on a moved entity follow it (`followDimensions`, per
  entity); copies carry none.
- **Drag:** a left press on a **selected** entity dragged past 4 px moves the selection:
  the grabbed point is the nearest key point of that entity within the snap tolerance,
  else the press point; it snaps to everything that is not moving; Shift locks the axis;
  the release is one history step; Esc, pointercancel, blur or a missed release put
  everything back and add no step. A press on an entity that is not selected stays a
  click (it selects), never a move.

### 7.4 Pattern (`sketchPattern.js`, pure, LF)

Options row "Pattern": kind **Row** | **Grid** | **Circle**, its numbers, the count it
will add, **Apply** (Enter applies; Esc ends).

- Row: Count (the original included), Step X, Step Y.
- Grid: Columns, Rows, Column step, Row step, "Stagger every other row" (odd rows shift
  half a column step).
- Circle: the centre (a click in the view or X, Y typed in the row, from the zero; the
  zero itself until set), Count, Total angle (360: evenly round, the last never on the
  first; less: spread from 0 to the angle, both ends included). The copies turn with the
  angle.
- A ghost of every copy while the numbers change (one batched overlay piece; over 2 000
  copies the ghost shows the first 2 000 and says so).
- Guards: copies that would lie exactly on a shape already there (the same geometry,
  `sketchCheck.js`'s rule) are left out and counted in the words ("adds 22 · 2 left out:
  already there"); over 2 000 new shapes Apply asks once ("Add 2 400 shapes?" as the
  button's own second press). A count under 1, a zero step with a count over 1: the words
  say why, Apply is disabled.
- The copies become one history step; the selection stays the original.

### 7.5 The bar

Slot and Polygon join Draw. To stay inside the view at 1366 × 768 the visible words of two
buttons shorten while their accessible names stay ("Center rectangle" shows "Center rect",
"3-point arc" shows "Arc": `aria-label` keeps the full name; tests and scripts find them
as before). The limit is restated for the phases to come: the bar and its one row cover at
most a **quarter** of the view at 1366 × 768 and a sixth at 1600 × 1000; measure both.

### 7.6 Budgets (node, in the tests)

- A 15 × 24 staggered grid of one hexagon (360 copies): `patternEntities` ≤ 20 ms; the
  resulting drawing (an outline + 360 polygons) `entitiesToProfile` ≤ 30 ms,
  `checkDrawing` ≤ 80 ms, `boxSelect` ≤ 2 ms.
- Moving 500 selected entities: ≤ 10 ms per step (a drag frame).
- The kernel builds that outline with 360 hexagons as one compound face
  (`separateCutOuts` takes polygons: `kernel.cutOuts.test.js` gains the case).

### 7.7 Docs

`docs/state-machines.md` (the row: `op` and the drag, every way out), the guide §1
("Slots, polygons and rounded corners", "Moving, copying, mirroring", "Patterns"), the
help text, "## 16. HD-3 as built" here.

### 7.8 Acceptance (HD-3)

- `sketchShapes.test.js`, `sketchTransform.test.js`, `sketchPattern.test.js`: geometry
  against hand-worked numbers (a 22 × 5 slot at 30°, a hexagon 10 across flats, a 100 × 60
  rectangle R5); `explode` round trips (area and bounds equal the shape's to 1e-6);
  every transform on every type, twice a mirror = the original, four quarter turns = the
  original; a rectangle staying a rectangle or not, as §7.3 says; pattern counts, stagger,
  circle spread at 360 and at 90, the guards.
- Profile: a slot, a polygon and a rounded rectangle each as an outline and as a cut-out;
  the same entities give the same profile JSON twice; a sketch stored before HD-3 opens
  and finishes unchanged; `foldSheet` folds a blank whose cut-outs are slots and
  polygons (one bend).
- Reducer: each tool step by step with typed and clicked points and each option; each
  action (typed, clicked, Esc at each step, Undo / Redo as one step); dimensions follow a
  move; Copy stays on; the drag with Esc; M with nothing selected.
- `CadSketcher.dom.test.jsx`: the two tools and their rows; the selection row's buttons;
  a drag-move through the real pointer sequence, and one reverted by Esc; Pattern's
  ghost count and Apply.
- `scripts/verify-hand-drawing-hd3.mjs`: a 240 × 160 rectangle with R8 corners about the
  zero at its centre; one Ø5 hole at (−100, −60) mirrored left ↔ right and top ↔ bottom
  (four holes); one 22 × 5 slot patterned in a 4 × 3 grid, then all twelve box-selected
  and moved by typed ΔX, ΔY; a hexagon patterned round a circle (six);
  one slot dragged with the pointer and put back with Esc; Check "nothing to fix";
  Finish → ready to cut with the right cut-out count; Cut it and bend once (the shop's
  own steps) to show the kernel takes it. Screenshots at both sizes, looked at; the bar's
  coverage measured.
- Everything of §5.5 and §6.7 still passes (HD-1's and HD-2's scripts and the six older
  ones).

## 8. HD-4 — trim, extend, fillet, chamfer, offset

- **Trim** (T): the piece under the cursor between its two nearest crossings is
  highlighted; a click removes it (lines, arcs, circles; a rect, slot or polygon becomes
  its lines and arcs first). **Extend** (E): the end nearest the click runs to the next
  entity it meets. **Fillet** (F): Radius in the options row; a click on a corner of two
  lines (or a rect corner) rounds it. **Chamfer** (H): Distance; the same corners.
  **Offset** (O): Distance; a click on a line, arc, circle, rect, slot or polygon, then the
  side. Exact intersections on true arcs (`sketchIntersect.js`); every tool previews, and
  stays on for the next click like Relief.

Refined 2026-11-21, after the HD-3 audit (§8.0 – §8.9 are the build's spec; the bullet
above is the scope they detail).

### 8.0 First: four things the HD-3 audit left

1. **A turned dimension keeps its reading.** `sketchTransform.js` `turnedLinear`: a level
   or plumb dimension whose two ends both turn or mirror by something that does not keep
   the axes (`keepsAxes(T)` false) becomes `aligned`, its offset read back from the turned
   line as the aligned branch already does. (Today it keeps its kind and reads the
   projected length: a 100 mm width turned 30° reads 86.6.)
2. **Check sees an outline that crosses or touches itself or another loop.** Today a
   crossing is reported only between two different owners and only at a point inside both
   pieces. Add: (a) two pieces of the **same** closed loop meeting anywhere but at the end
   they share ("The outline crosses itself at (x, y)", "A cut-out crosses itself at
   …"); (b) two different closed loops meeting at a point that is an end of a piece or
   where they only touch (a tangent): "A cut-out touches the outline at …", "Two
   cut-outs touch at …". Kind `crossing` for all; the entities' ids as today. The cover
   sample's `checkDrawing` stays ≤ 150 ms and the 360-hexagon drawing's ≤ 80 ms.
3. **The Sketching panel reads as help, not as a wall.** `CadWorkspace.jsx`'s Properties
   panel while sketching holds eight paragraphs and runs off the panel at 1600 × 1000;
   five more tools would make it ten. It becomes: the heading; **Now**: what is in hand (a
   tool, an action on the selection, a selection, or nothing) as a title and at most four
   short lines saying what its clicks, boxes and keys do; then three closed `<details>`:
   **Keys** (a two-column list read from `SKETCH_KEYS` and `SKETCH_COMMAND_KEYS`, so it
   cannot go stale), **Points and numbers** (snap, X, Y, `@`, the zero, Shift), **Selecting
   and changing**. The words come from a new pure module `cad/sketchHelp.js`
   (`sketchHelp(state) → { title, lines }`, `HELP_SECTIONS`), with a test that every tool,
   every action and the two idle states have words and no line is over 110 characters. The
   sketcher tells the workspace what is in hand through one callback (the builder's
   choice of name); nothing else in the panel changes. With the three closed the panel does
   not scroll at 1366 × 768. Tests that pin the old paragraphs change with it.
4. **What HD-3 left untested**: a DOM case each for a window blur and for a missed release
   during a drag-move (nothing moves, no step); a test that a focus on a zoomed
   orthographic camera frames the span asked for; Rotate and Copy are driven in this
   phase's browser script (§8.9).

### 8.1 What the five tools share

- They are tools (`state.tool`: `trim`, `extend`, `fillet`, `chamfer`, `offset`), in
  `SKETCH_TOOLS` / `SKETCH_KEYS` (T, E, F, H, O) after Polygon and before Dimension; a
  tool clears the selection as every tool does, stays on after each click like Relief, and
  every click that changes the drawing is one history step with the selection empty.
- **Pick, then cut**, as `sketchRelief.js` does: a pure `…Pick({ entities, raw, point,
tolerance, … })` says what a click here would take or why not (`{ type: 'none',
message }`), and a pure function applies it → `{ entities, added, replaced, nextId,
text, pieces, removed }` or throws in words with nothing changed. The reducer memoises
  the hover's answer on its inputs (as `reliefHover` does) and uses it for the preview, the
  readout by the cursor and the click, so the three can never disagree.
- **A shape taking part becomes its lines and arcs first** (`explode`, new ids from
  `nextId`, in the shape's place): a rect, a rounded rect, a slot, a polygon, and for Trim
  a circle becomes the arc that is left. An entity only shortened or lengthened keeps its
  id; new pieces go in the list right after the entity they came from; `construction`
  carries over.
- **The meet rule** (what makes trimmed drawings close). A cut or a landing point is first
  the exact crossing (`sketchIntersect.js`); then, if an end of any other line or arc lies
  within `MEET_MM` = 1e-3 mm of it (the distance `sketchProfile.js` `chains` joins at),
  it **is** that end, bit for bit. And the cut points of a piece are its crossings with
  every other piece **and** every other piece's end lying within `MEET_MM` of it: an arc
  stored as three points rounded to 1e-6 mm is not exactly the circle it was cut from, so
  a second trim must not depend on an exact crossing with the first one's result. All
  entities cut, construction ones too; the model's edges do not.
- A piece left shorter than `TINY_MM` (0.01 mm, `sketchCheck.js`) by a cut goes with the
  cut; no tool ever leaves a zero-length line or an arc on three points in a line.
- **Preview**: what would be removed is drawn in the problems' red, what would be added
  in the preview colour (one more batched overlay piece, `cut`, beside `ghost`); the
  readout by the cursor says what the click does or the refusal; the status line says what
  the tool wants. No HUD number boxes: sizes are in the options row (`NumericInput`, kept
  for the session and the next sketch in `shapes`: `fillet` 5, `chamfer` 2, `offset` 5).
- **Dimensions.** Fillet and Chamfer keep every dimension: an end on the corner stays at
  the sharp corner (the size over sharp corners, as drawings give it). Trim: a dimension
  with an end on the removed part that now lies on nothing goes with it (`Delete`'s rule,
  `pruneDimensions`); every other stays. Extend: an end on the moved end moves with it.
  Offset: the copy carries none.

### 8.2 Trim and Extend (`cad/sketchTrim.js`, pure, LF)

- **Trim.** The piece under the raw cursor (within the snap tolerance; the nearest) is cut
  at its cut points (§8.1); the span holding the cursor is what a click removes:
  - a span in the middle of a line or arc: two pieces (the first keeps the id);
  - a span at an end: the line or arc is shortened;
  - no cut point on it: the whole piece goes (the readout says so: "Nothing crosses it:
    click removes the whole line");
  - a circle with two or more cut points: the rest stays as one arc; with none or one, the
    whole circle goes;
  - a piece of a rect, rounded rect, slot or polygon: the shape becomes its lines and
    arcs, and the span goes from that piece (its own ends are its ends).
    A kept arc's middle point is the middle of what is kept (the best-conditioned three
    points). Readout: "click to trim · Esc ends the tool".
- **Extend.** The end of a line or arc nearer the cursor runs on, a line straight, an arc
  round its own circle, to the first piece it meets (the meet rule lands it on an end
  within `MEET_MM`); the preview shows the added run and the readout its length ("click to
  extend 7.5 mm"). Refusals: nothing ahead ("Nothing ahead of this end to extend to."), an
  arc that would only meet its own other end, a circle or a closed shape ("A circle has no
  end to extend.", "A rectangle is closed: there is no end to extend.").
- `trimPick`, `trimCut`, `extendPick`, `extendCut` (the builder's names may differ; the
  contract of §8.1 may not).

### 8.3 Fillet and Chamfer (`cad/sketchCorner.js`, pure, LF)

- **A corner** is a point where exactly two straight pieces end (lines, a sharp rect's or
  a polygon's sides; an open chain's corner counts as a closed loop's does), the nearest
  within the snap tolerance of the raw cursor.
- **Fillet** (options row "Fillet options": Radius): both lines are cut back by
  r / tan(θ / 2) and one arc tangent to both joins them (a new entity after the first
  line; construction only when both lines are). A line used up exactly goes (no
  zero-length piece). Readout: "Fillet R5 · click to round".
- **Chamfer** ("Chamfer options": Distance, the same on both lines): both cut back by the
  distance, one line joins them. Readout: "Chamfer 2 · click to cut the corner".
- Refusals, each with its number where there is one: no corner under the cursor ("Point
  at a corner where two lines meet."); an arc ends there ("Fillet rounds a corner between
  two straight lines."); more than two ends ("More than two lines meet here."); the lines
  run straight on ("These lines run straight on: there is no corner."); it does not fit
  ("R8 does not fit here: at most R5.2 (the shorter line is 6 mm)."; "A 5 mm chamfer does
  not fit here: the shorter line is 4 mm.").
- For all four corners of a rectangle the Rectangle's own Radius is the tool (the Fillet
  row says so in a short note when the corner is a rect's).

### 8.4 Offset (`cad/sketchOffset.js`, pure, LF)

- Options row "Offset options": Distance. Two clicks: the entity (it is highlighted), then
  the side; the preview shows the copy on the cursor's side before the second click. The
  copy is a new entity after the last one; the tool goes back to its first step.
- By type: a line → a parallel line of the same length; an arc → the arc on the same
  centre and angles, radius ± d; a circle → radius ± d; a rect → each side out or in by d,
  sharp corners staying sharp, a corner radius r ± d (inward to nothing or less: sharp);
  a slot → width and length ± 2d; a polygon → across flats ± 2d. Each stays one entity.
- Refusals with the numbers: "Offsetting inward by 5 leaves nothing of this Ø8 circle."
  (an arc's radius, a rect's or slot's width, a polygon's size the same way).
- A chain of separate lines is offset one line at a time; offsetting a whole loop stays
  parked (§10).

### 8.5 The reducer and the sketcher

- `sketchTools.js`: the five tools; Offset's chosen entity lives in one state key that
  every way out clears (Esc: the chosen entity first, then the tool; a tool key, Undo,
  Delete, select all, a Check row). Enter does nothing in them (as in Relief).
- `CadSketcher.jsx`: the Edit group in the bar; the three options rows; the readout box by
  the cursor (Relief's); the keys.
- `CadViewport.jsx`: the `cut` overlay piece (red, batched; the probe reports its count).

### 8.6 The bar

**Edit** (Trim, Extend, Fillet, Chamfer, Offset) sits between Draw and Mark. The bar stays
**two rows at 1366 × 768** and at 1600 × 1000, and the bar with any one row stays inside
§7.5's quarter and sixth (measure every row, Pattern's too). To make room the visible
words may shorten while the accessible names stay (`aria-label`, as §7.5 did): "Undo last"
→ "Undo", "Finish sketch" → "Finish", "Cancel sketch" → "Cancel", "Snap (mm)" → "Snap";
the group labels may go (the groups keep their names) and paddings may tighten. Nothing
goes into a menu.

### 8.7 Budgets (node, in the tests)

On the cover sample (`vw400Samples.testkit.js`): a Trim hover (pick + cut, not memoised) ≤
3 ms; a Fillet pick ≤ 3 ms; `checkDrawing` with §8.0's additions ≤ 150 ms.

### 8.8 Docs

`docs/state-machines.md` (the row: the five tools, Offset's two steps, every way out); the
guide §1 ("Trimming and extending", "Rounding and cutting corners", "Offsetting", and a
worked keyhole: a circle, a slot, four trims); `sketchHelp.js`'s words; "## 17. HD-4 as
built" here and the status line.

### 8.9 Acceptance (HD-4)

- `sketchTrim.test.js`: every pair of line, arc and circle; a span in the middle, at an
  end, none; a circle to an arc; each shape exploded; the meet rule (the trimmed end `===`
  the end it meets, coordinate by coordinate). **The keyhole**: a Ø12 circle and a 6 wide
  slot from its centre, the four trims in all 24 orders give the same closed profile, its
  area the closed form's to 1e-6 of itself, `checkDrawing` empty. **A property test**:
  300 seeded random drawings of lines, arcs, circles and shapes, a trim at a random point
  of a random piece: afterwards no piece under `TINY_MM`, every new end `===` another
  piece's end or within 1e-6 mm of another piece, the total length less by the removed
  span's to 1e-6, every untouched entity the same reference. Extend: line to line, to a
  circle, to an arc; an arc round its circle; onto an end exactly; each refusal.
- `sketchCorner.test.js`: a fillet at 90° in all four quadrants and at 30° and 150°: the
  arc's ends on both lines, tangent to 1e-9 in direction, its radius the typed one to
  1e-5; a rect and a polygon corner; a line used up exactly; each refusal with its number;
  all four corners of a 100 × 60 rectangle filleted R5 one by one give the profile of
  `rect { r: 5 }` (the same area to 1e-6 of itself). Chamfer the same way.
- `sketchOffset.test.js`: each type to both sides; each stays its type; each refusal.
- `sketchCheck.test.js`: §8.0's two additions, and that nothing they add fires on the
  three VW-400 samples or on HD-3's patterned drawing.
- `sketchTransform.test.js`: §8.0's turned dimension.
- Reducer (`sketchEditTools.test.js`): each tool: the hover's preview and readout, the
  click, the tool staying on, Esc at each step, Undo / Redo as one step, a tool key in the
  middle of Offset, the dimension rules of §8.1; a sketch stored before HD-4 opens and
  finishes byte for byte.
- `CadSketcher.dom.test.jsx`: the Edit group and the three rows; a Trim click through the
  real pointer sequence; the readout's refusal; §8.0's blur and missed release.
- `scripts/verify-hand-drawing-hd4.mjs` (vite on 5180, screenshots at both sizes, looked
  at, the bar's rows counted and its coverage measured): a 200 × 120 rectangle from (0,
  0); Fillet R10 on two corners, Chamfer 8 on the other two ("closed profile"); a keyhole
  (Ø12 circle at (50, 70), a 6 wide slot down from its centre, four trims) → Check clean
  with one cut-out; the keyhole box-selected and copied by typed ΔX 100; a notch in the
  top edge made with three lines, one Extend and two Trims (one of them on the outline's
  own edge); a 60 × 30 rectangle offset outward by 5 and the original made construction;
  a slot turned 90° by Rotate with a typed angle; Check "nothing to fix"; the Sketching
  panel's Now block read for a tool, an action and a selection; Finish → ready to cut with
  the right cut-out count; cut and bent once.
- Everything of §5.5, §6.7 and §7.8 still passes (the three HD scripts and the six older
  ones).

Not in HD-4: trimming by dragging across several pieces; a fillet between a line and an
arc or between two lines that do not meet; offsetting a whole loop.

## 9. HD-5 — fill, making notes, the guide, the benchmark

- **Fill** (in Pattern): a selected shape as the seed, a closed loop clicked as the area,
  Pitch, Margin, Square or Staggered, the count before Apply.
- **Making notes** in Check when the sheet is known (`session.sheet`): a hole or slot
  narrower than the thickness, a web under the thickness between two cut-outs or to the
  edge. Notes, never refusals; numbers and their sources in the spec.
- **Guide**: `docs/sheet-metal-shop-guide.md` §1 gains "Drawing a real part", following
  the example's body step by step.
- **Benchmark**, `scripts/verify-hand-drawing-benchmark.mjs`: the example's BODY -01 drawn
  with the tools only (a quarter of the outline by X, Y, mirrored twice; holes by Ø and
  mirror; one slot patterned, copied and mirrored; a keyhole from a circle, a slot and
  two trims, copied), then compared with `scripts/fixtures/vw-400-parts.expected.json`:
  same bounds, same cut-out count, area within 0.01 mm²; cut from 1.2 mm SPCC it folds on
  the twelve lines to 400.02 × 500.02 × 120.02. The script reports the typed numbers and
  the operations it took. The plate the same way; the cover with a uniform staggered
  hexagon fill.

Refined 2026-11-21 (§9.1 – §9.6 are the build's spec; the bullets above are the scope).
Read from the fixture first: all three outlines mirror left ↔ right and top ↔ bottom;
every one of the body's 68 cut-outs has a left ↔ right partner and 32 a top ↔ bottom one;
its slots are 46 × 4 at ±18° (a mirror flips the sign); its two keyholes are a Ø10 hole
with a 5 wide slot 12 long; the cover's 360 hexagons are two fields on a 60° staggered
lattice (8.6 across, 7.45 up), each field's rows 6, 12, 17, 19, 24, 24, 24, 19, 17, 12, 6
across, sized 2.94 – 6.4 by a wave (parked, §10): a uniform fill of a drawn area is not
the same count.

### 9.0 Left by HD-4's audit (first)

HD-4's own "Not verified" list (§17), closed here before anything new:

1. A DOM case pressing T, E, F, H and O from an empty HUD box (a Draw tool on, its first
   box focused and empty): each switches the tool; with a number typed in the box the
   letter does not.
2. A reducer case: a Check row's `fix` lets go of Offset's chosen entity (`offsetFrom`).
3. Extend and Chamfer through the DOM pointer sequence (hover → readout → click → one
   step), as Trim and Fillet have.
4. In the benchmark (§9.4), on the finished cover: the Trim tool hovered along twenty
   points of the outline, the time from each pointer move to the next frame read in the
   page; the median and the worst reported, and the worst under 50 ms.

### 9.1 Fill (`sketchPattern.js`, a fourth kind)

- Pattern's kind gains **Fill**. The selection is the seed (one shape or several: its
  middle is its box's centre). The row: Pitch, Layout (**Staggered** | Square), Margin,
  Start (**Centre of the area** | The seed), the area's name, the count, Apply.
- **The area** is a closed loop clicked in the view (the loop under the cursor is
  highlighted before the click): a rect, rounded rect, circle, slot or polygon, or a closed
  chain of lines and arcs; drawn or construction (a construction loop is the usual one: it
  never becomes part of the blank). No loop there: "Click a closed shape to fill."
- **The lattice.** Square: Pitch both ways. Staggered: Pitch across, rows Pitch × √3 / 2
  apart, every other row shifted half a Pitch (the 60° pattern of perforated sheet). One
  lattice point is the centre of the area's box, or with Start "The seed" the seed's
  middle.
- **What fits.** A copy is kept when all of it lies inside the area at least Margin from
  the area's edge **and** at least Margin from every other drawn shape (construction ones
  do not count; the seed and the field's own copies do not count against each other), and
  it is not exactly on a shape already there (HD-3's rule). Distances are exact: a new
  `primitiveGap(p, q)` in `sketchIntersect.js` (0 when they meet; else the least of each
  end to the other piece, and for a circle or arc the points on the line through the
  centres or the foot of the perpendicular, each only where it lies on both pieces),
  tested against brute force on 2 000 random pairs to 1e-6.
- The seed: when it lies inside the area and Start is the centre, it goes and the field
  takes its place (the same step); otherwise it stays.
- The words: "adds 212 · 14 left out: too close to an edge or another shape"; the ghost,
  the 2 000 ask and Apply as Pattern's; one history step.
- **While any action is on, the row is that action's alone**: the selection's note, the
  action's own controls and its pressed button; the selection's number boxes, the other
  four actions and Delete selected come back when it ends (their keys still switch). This
  keeps every action's row, Fill's too, on at most two lines at 1366 × 768.
- Budget: filling a 400 × 500 rectangle that holds 8 other cut-outs with a hexagon at
  Pitch 8.6 (about 2 700 places): the plan ≤ 150 ms in node.

### 9.2 Making notes (`sketchCheck.js`)

- `checkDrawing(entities, { sheet })` with `sheet.thickness` (the thickness the Relief
  tool sizes from, `state.relief.sheet`: the cut part's own, else the last one used)
  adds notes, never problems, only while the Check panel is open; the panel's notes get a
  heading "For 1.5 mm sheet" and each row frames its place and selects its shapes as a
  problem's does. They never count in "N to fix".
  - `small-hole`: a circle cut-out under the thickness across. "Ø1 hole: under the 1.5 mm
    thickness" and, under half of it, "…: under half the thickness, most lasers cannot
    cut it".
  - `narrow-slot`: a slot, rect or rounded-rect cut-out whose width is under the
    thickness, worded the same way.
  - `thin-web`: under the thickness of metal between two cut-outs, or between a cut-out
    and the outline (`primitiveGap`, boxes and a grid first): "0.8 mm of metal between two
    cut-outs at (X, Y): under the 1.5 mm thickness".
- Sources (§13): SendCutSend puts the laser's floor for holes and bridges at about half
  the thickness; holes under the thickness are "more likely to be out of tolerance". One
  threshold (the thickness), two wordings.
- None of the three samples at 1.2 mm gives a `small-hole` or `narrow-slot`; whatever
  `thin-web` notes the cover's hexagon fields give are reported in the as-built, with the
  smallest web. Budget: the cover with notes ≤ 300 ms in node.

### 9.3 The guide

`docs/sheet-metal-shop-guide.md` §1 gains "Drawing a real part": the sample's body from an
empty sketch to twelve bends, in the order the benchmark draws it, each step naming its
tool, its key and the numbers typed, with the count of numbers at the end; and "Filling an
area with holes". `sketchHelp.js` gains Fill's words.

### 9.4 The benchmark (`scripts/verify-hand-drawing-benchmark.mjs`)

Playwright against the real sketcher (vite on 5180), no reducer shortcuts: every entity
comes from a tool driven by keys, typed numbers and clicks. The numbers typed are read
from `scripts/fixtures/vw-400-parts.expected.json` (they are the drawing's numbers), but
only for what a person would type: the rest comes from Mirror, Copy, Pattern and Trim.

- **BODY -01.** The zero at the blank's centre. The upper-right quarter of the outline by
  Line with typed X, Y (from the fixture's vertices), mirrored left ↔ right, then both
  top ↔ bottom. Each cut-out that has partners is drawn once and mirrored (the ±18° slots
  in their rows by Pattern or Copy where the fixture's spacing is even, else one by one);
  each keyhole from a Ø10 circle, a 5 wide slot and four trims, then mirrored.
- **MOUNTING PLATE -03** the same way.
- **COVER -02.** The outline and its 8 cut-outs the same way; then two construction loops
  round the fields and a hexagon of 5 across flats filled Staggered at Pitch 8.6 (the
  count reported, not compared).
- **Compared, in node, with the fixture drawn by `vw400Samples.testkit.js`:** the
  finished sketch's bounds to 1e-6; the cut-out count (68, 35; the cover's 8 before the
  fill); the blank's area (outline less cut-outs) within 0.01 mm² (body and plate; the
  cover before the fill); `checkDrawing` empty. Folded in node on the fixture's bend lines
  (`foldSheet`, 1.2 mm SPCC, the shop's automatic radius): the body's box 400.02 × 500.02
  × 120.02 to 0.01, the plate's and the cover's the same as the fixture's own drawing
  folds to.
- **In the app:** the body finished, cut from 1.2 mm SPCC on the laser and bent on its
  twelve lines through the shop's own steps (as HD-3's script bends once); no `.cad-error`.
- **Reported** (`artifacts/sketch-cad/hand-drawing-benchmark/verification.json` and the
  as-built): per part, the numbers typed, the clicks, the tool and action uses, the wall
  time of the drawing, and how many entities came from Mirror / Copy / Pattern / Fill
  rather than from typing. Screenshots of each finished drawing and of the folded body at
  both sizes, looked at.
- If a step cannot be done with the tools as built, that is a finding: stop, say which
  step and why, and do not work round it through the reducer or the stored file.

### 9.5 Docs

`docs/state-machines.md` (Fill's steps and the row rule), the guide (§9.3), "## 18. HD-5
as built" here, the status line: all five phases built.

### 9.6 Acceptance (HD-5)

- `sketchIntersect.test.js`: `primitiveGap` for every pair kind against hand-worked
  numbers and against brute force.
- `sketchPattern.test.js`: Fill: both layouts, both starts, the margin to the edge and to
  another shape (a copy exactly at the margin is kept, 1e-6 inside it is not), a round and
  an L-shaped area, a construction area, a several-shape seed, the seed taken into the
  field, a second Apply adding nothing, the budget.
- `sketchCheck.test.js`: each note kind, both wordings, no note without a sheet, the
  samples' results, the budget.
- Reducer and DOM: Fill's steps (the area click, each option, Esc at each step, Undo /
  Redo as one step); the row rule while an action is on; the notes' heading and a note
  row's frame.
- `scripts/verify-hand-drawing-benchmark.mjs` passes as §9.4 says.
- Everything of §5.5, §6.7, §7.8 and §8.9 still passes (the four HD scripts and the six
  older ones), with the bar and every row inside §7.5's limits.

## 10. Not in this spec (parked)

- Constraints and driving dimensions (removed 2026-08-15 at the user's request).
- A library of ready cut-outs and "save this selection as a shape".
- Combining closed shapes into one outline (union / subtract), offsetting a whole loop,
  splines, ellipses, text (the Print station has text), scaling.
- A tray / box maker with lips and tabs laid out from outside sizes (the Flanged panel
  maker does single flanges).
- The 2D drafting studio: untouched.
- Hexagons whose size follows a curve.

## 11. Design calls that are the spec's own (the user has not ruled)

- The drafting model (typed coordinates, no constraints), with the panel designers' zero
  point and numbers row.
- Built in the 3D workshop's sketcher only.
- Select-then-act; the selection's actions live in the options row, not in the bar.
- Slot and polygon as entities with numbers; they become lines and arcs when cut into.
- Undo last becomes a real undo (a reopened sketch no longer loses its last entity to it).
- The keys of §3.3 (K for Copy, Q for Rotate, I for Mirror, G for Pattern, H for Chamfer).
- Making rules are notes with thickness-based defaults.

## 12. Builder rules

- Do not bump `CAD_VERSION`; new keys are optional; a sketch saved before this opens and
  finishes unchanged (a test per phase on a stored sketch).
- Pure modules: no three, no DOM. `sketchProfile.js` runs in the worker.
- Read `docs/state-machines.md` first and keep its "In-viewport sketcher tool" row true:
  every way out of a mode clears everything the mode owns; Esc reverts a drag; a
  double-click is press, press, double-click.
- Buttons are found by name by tests and scripts: existing accessible names do not change.
- Match the surrounding code (dense modules, short comments that state a constraint, each
  file's line endings; new files LF). Words on screen: plain, no brand.
- Vitest from the repository root. Stop the dev server you start; check the port is free.
- The working tree holds weeks of uncommitted work: no `git checkout`, `git stash`,
  `git clean`, `git reset`, no commit.
- Append "HD-n as built" to this file: files touched, exported names, measured numbers,
  every judgment call, anything in this spec found wrong or not done.

## 13. Sources (read 2026-11-20)

- Autodesk Fusion help, Sketch modification tools:
  https://help.autodesk.com/cloudhelp/ENU/Fusion-Sketch/files/SKT-SKETCH-MODIFY-TOOLS.htm
- Autodesk Fusion help, Sketch tools (slots, mirror):
  https://help.autodesk.com/cloudhelp/ENU/Fusion-GenerativeDesign/files/GD-SKETCH-TOOLS.htm
- FreeCAD wiki, Sketcher Workbench: https://wiki.freecad.org/Sketcher_Workbench
- Autodesk AutoCAD help, Coordinate Entry with Dynamic Input:
  https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DidYouKnow/files/GUID-683349C0-E5C2-4E16-8846-5523E71172A9.htm
- Autodesk AutoCAD help, SELECT (window and crossing):
  https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-LT/files/GUID-0DD5DA73-9DC5-4424-8FED-7BBE3BE52A4D.htm
- Schaeffer / Front Panel Express, Front Panel Designer documentation (reference points,
  rectangular cut-out by a snap point and an offset):
  https://docs.schaeffer-ag.de/en/elements/general.html ,
  https://docs.schaeffer-ag.de/en/introductory_example/cut_out.html
- Protocase Designer Quick Start and cut-out library:
  https://www.protocasedesigner.com/wiki/index.php/Quick_Start ,
  https://www.protocase.com/design/cutout-library
- SolidWorks help, Fill Patterns:
  https://help.solidworks.com/2017/english/solidworks/sldworks/c_fill_patterns_overview.htm
- SendCutSend, minimum geometry and bridge sizes:
  https://sendcutsend.com/blog/understanding-small-geometry-in-laser-cutting/ ,
  https://sendcutsend.com/faq/what-are-best-practices-for-minimum-geometry/
- Fabcon, sheet-metal DFM guidelines (hole to edge, hole to bend):
  https://fabcon.com/articles/sheet-metal-fabrication/sheet-metal-dfm-best-practices/

## 14. HD-1 as built (2026-11-20)

Built as §5 says, with the differences below. No model key, no `CAD_VERSION` change; the
only new thing a finished sketch can carry is `construction: true` on an entity, which
`profileLoops` already left out. A sketch stored before HD-1 opens and finishes with its
very arrays (`CadSketcher.dom.test.jsx` "finishes a stored sketch unchanged",
`sketchHandDrawing.test.js` "a sketch stored before HD-1"). Nothing of HD-2 … HD-5 is in
it (no Zero, no new entity type, no Move / Copy, no Trim, no Edit group in the bar).

**Files.** New (LF): `cad/sketchSelect.js`, `cad/sketchHistory.js`, `cad/sketchEdit.js`;
tests `cad/sketchSelect.test.js` (9), `cad/sketchHistory.test.js` (10),
`cad/sketchEdit.test.js` (13), `cad/sketchHandDrawing.test.js` (12, the reducer cases of
§5.5); script `scripts/verify-hand-drawing-hd1.mjs`. Changed: `cad/sketchTools.js` (CRLF
kept), `cad/CadSketcher.jsx`, `cad/CadViewport.jsx` (`drawSketchOverlay`, the
`cadSketchOverlay()` probe), `cad/cad.css`, `cad/CadWorkspace.jsx` (the sketching help
text only), six cases added to `cad/CadSketcher.dom.test.jsx`; existing assertions edited
as listed under "Existing tests changed"; `scripts/verify-outline-edit-oe1.mjs` (the
reopened-sketch undo). Docs: `docs/state-machines.md` (the sketcher row),
`docs/sheet-metal-shop-guide.md` §1 ("Changing what you drew", one sentence in "Bend
reliefs"), this section and the status line.

**Exported names.**

- `sketchSelect.js` (imports `sketchProfile.js` only): `boxSelect(entities, [p, q],
mode = 'inside' | 'touching') → ids` (drawing order; a box with no width or height takes
  nothing), `inDrawingOrder(entities, wanted) → ids`, `clickSelection(entities, selected,
id, toggle = false) → ids`, `boxSelection(entities, selected, ids, add = false) → ids`,
  `describeSelection(entities, ids) → "5 selected: 3 lines, 2 circles"`.
- `sketchHistory.js` (no imports): `HISTORY_LIMIT` (200), `emptyHistory() → { undo: [],
redo: [] }`, `commit(state, next) → next` with `state`'s `{ entities, dimensions }`
  pushed and redo cleared (a `next` with the same two arrays is returned untouched),
  `undo(state)` / `redo(state) → state | null`, `canUndo(state)`, `canRedo(state)`.
- `sketchEdit.js` (imports `sketchProfile.js` only): `EDIT_FIELDS`, `entityFields(entity)
→ [{ key, label, unit, value }]`, `editEntity(entities, id, patch) → entities` (throws
  the refusal; the same array when nothing changes), `followDimensions(dimensions, before,
after) → dimensions`, `joinsAt(entities, id, point) → count`, `setConstruction(entities,
ids, on = true) → entities`.
- `sketchTools.js`: new `SKETCH_COMMAND_KEYS`, `sketchCommand(event) → 'redo' |
'select-all' | 'construction' | null`, `DRAW_TOOLS`, `selectedEntities(state)`,
  `constructionPressed(state)`, `removeEntities(entities, dimensions, ids) → { entities,
dimensions }`, `canUndo` / `canRedo` (re-exported). State: `selectedIds` (replaces
  `selectedId`), `history` (replaces `added`), `construction`, `box`. Actions: `select`
  (`toggle`), `select-all`, `box`, `box-end`, `box-cancel`, `edit` `{ id, patch }`,
  `construction`, `redo`; `undo` and `delete` rewritten; every drawing change goes through
  `commit`. `SKETCH_KEYS` and `sketchKey` are unchanged.

**Measured.** Node, the sample parts of `scripts/fixtures/vw-400-parts.expected.json` drawn
as `sketchProfile.loops.test.js` draws them (226 / 2 210 / 117 entities). `boxSelect` on the
cover (a box over its lower-left quarter, 550 inside): the first call 9.1 ms (each
entity's polyline box worked out once, a `WeakMap` per entity object), then 0.36 ms median
(4.0 worst) inside and 0.50 ms (3.5) touching; a box round the whole cover 0.08 ms. An
`editEntity` of a line end on the cover ≤ 0.2 ms; a `commit` ≈ 0 ms (two references); 205
commits leave 200 steps. `entitiesToProfile` (run by an edit only when a joined end moved,
for the join note) 44 ms median on the cover. Browser (`verify-hand-drawing-hd1`): the bar
53 px (two rows at both sizes), the selection row 29 px; with the row up the two cover 95
px of 760 (0.124) at 1600 × 1000 and 95 of 494 (0.191) at 1366 × 768, a line's six boxes
included; the Relief row is the same height.

**Judgment calls.**

1. The new keys are a second table (`SKETCH_COMMAND_KEYS`, `sketchCommand`), not new
   entries in `SKETCH_KEYS`: that table stays the bar's tools and Undo last, as SK-1 and its
   tests read it. X, Ctrl+Y, Ctrl+Shift+Z, Ctrl+A follow SK-1's rules (Alt never; a held
   letter does not repeat, a held chord does).
2. Undo with nothing to step back to and a half-drawn shape drops the shape only; with
   neither it returns the same state. Undo last's button is disabled whenever the undo
   stack is empty (the key still drops a half-drawn shape).
3. A Shift / Ctrl + click on nothing keeps the selection; a plain click on nothing clears.
4. Ctrl+A ends the tool and its half-drawn shape, then selects every entity (construction
   ones too): select-then-act has no selection under a tool. In a box (the HUD included)
   Ctrl+A is the box's own.
5. The box's direction is read on screen (a drag to the right is 'inside'), and the box is
   the plane rectangle between the two plane points under the pointer, drawn in the plane
   (in a view at an angle it reads as a parallelogram: what is drawn is what is tested).
   Inside: solid `#1f6fd1`; touching: dashed `#2f8f3f` (the AutoCAD convention); both with
   an 8 % fill. While dragging the status line says what the release takes ("3 wholly
   inside · release to select", "5 touched …"); the entities are not highlighted live (the
   batch is not rebuilt per move).
6. A press that begins on an entity or a dimension is a click and never a box (HD-3 makes
   that drag Move). A box is dropped, never applied, by Esc (the selection stays: rule 4),
   `pointercancel`, window blur, and a move with no button held (a missed release).
7. The selection is drawn as one line (one entity, `userData.entityId`, as before) or one
   batch (several, `userData.entityIds`), keyed on the selection array; the reducer keeps
   that array when the selection does not change, so a click on nothing with nothing
   selected rebuilds nothing.
8. Construction: dashed `LineDashedMaterial` in the model-edge colour `#e0861a`, the
   selected ones dashed in the selected colour; one batch, its own overlay piece keyed on
   entities, selection, frame and the dash (twice the marker size rounded to a power of two,
   so a pointer move never rebuilds it, a zoom by two does).
9. X on a mixed selection makes all of it construction; on an all-construction selection
   takes the flag off (the key is deleted, never `false`). Armed, it marks only what Line,
   Rectangle, Center rectangle, Circle and 3-point arc add (never a relief's pieces); it
   stays armed across tools until X again. Pressed: armed, or with a selection and no tool,
   every selected entity construction. Clicked with no tool the button gives up the focus
   (Space / Enter cannot re-press it); with a drawing tool the HUD field takes the focus back.
10. The one-entity note keeps today's words ("Line 46 mm · Delete removes it") and does not
    add "construction": the pressed Construction button says it, and the words would push a
    line's row onto a second line at 1366 × 768.
11. "12 items" counts every entity; " · 3 construction" shows only when there is one.
12. The row's numbers show to three decimals, boxes 50 px with no spinner arrows; labels
    as §5.3, aria-labels "Selected X1 (mm)" … "Selected Angle (°)", a title on each box
    saying what stays. An edit's refusal or join note stands in the row while it is up
    (not in the status line); a refusal changes nothing and is no step.
13. The join note: when a line or arc end that one or more other drawn lines / arcs ended
    on moves alone and the drawing is not a closed profile after it: "This end joins 1
    other: it stays." / "… 2 others: they stay."
14. Dimensions follow an edit by key point index (ends, midpoints, rectangle corners and
    side midpoints, centres, quadrants); an end on an entity's body but not on a key point
    stays where it was; a radial one keeps its label's direction and distance off the
    circle. A dimension the edit leaves with no extent stays (it reads 0).
15. An arc's third point becomes the middle of the arc after an edit (same ends or radius
    typed again: no change, no step); an edited rectangle is stored lower-left to
    upper-right.
16. `removeEntities` lives in `sketchTools.js`, not `sketchEdit.js`: it needs
    `pruneDimensions`, and `sketchDimensions.js` reaches three through `marks.js`. A test
    (`sketchSelect.test.js`) checks the three pure modules and `sketchProfile.js` import
    `sketchProfile.js` only and touch no DOM global.
17. "Delete selected" moved from the bar to the selection row (§3.3); the row shows for a
    selected dimension too (its note and Delete selected). Esc in a row box drops its draft
    and leaves the box (the Relief row's rule), the next Esc clears the selection.
18. The bar is more compact (line height 1.2, 3 px button padding, the row 3 px, the block
    8 px from the top, 126 px clear of the view cube instead of 130): see "Wrong in the
    spec" 1. Group labels are 10 px grey text with a hairline before each group; the labels
    are `aria-hidden`, the groups `role="group"` named Draw, Mark, History.
19. The browser probe `cadSketchOverlay()` on `.cad-viewport` (selection, box, construction
    as drawn) is new, for the script.

**Existing tests changed.** The named one (§5.2, a just-reopened sketch's Undo last):
`sketchDimensionTool.test.js` "undoes on a reopened sketch" is now "does nothing on a
reopened sketch until something is done"; `CadWorkspace.outline.dom.test.jsx` (three
cases, five clicks) and `CadWorkspace.sketchDimensions.dom.test.jsx` (one) cleared the
reopened outline with Undo last and now use Ctrl+A + Delete selected (`clearDrawing`);
`verify-outline-edit-oe1.mjs` likewise (`undoLast(1)`, `undoLast(5)` → `clearDrawing()`).
Besides it, four assertions §5 itself changes: `sketchDimensionTool.test.js` "selects and
deletes a dimension" reads `selectedIds: ['e1']` / `[]` for `selectedId` (§5.1);
`sketchReliefTool.test.js` reads `state.history.undo` for `state.added` three times (§5.2:
history replaces `added`); `sketchOnFace.test.js` "draws centre rectangles…" expects the
undo after a delete to bring e1 back (a delete is a step, §5.2; it used to remove e2);
`CadSketcher.dom.test.jsx` "takes Ctrl+Z as Undo last…" expected Ctrl+Shift+Z to reach the
studio's handler and now expects it to be Redo, taken on the capture (§3.3, §5.2).

**Wrong in the spec, or not done.**

1. §3.3's fifth at 1366 × 768 was already broken before HD-1: the view there is 494 px
   tall, and the two-row bar (70 px) with BR-1's Relief row (36 px) covered 0.246 of it.
   Met by compacting the bar and the rows (judgment call 18), not by moving anything out of
   the bar.
2. §5.5's "no assertion of the existing cases edited except the reopened-sketch undo"
   cannot hold: the four assertions above pin `selectedId`, `added`, a delete outside
   history and Ctrl+Shift+Z reaching the studio, each of which §5 changes.
3. §3.2 "after any change … dimensions follow": done for an edit (§5.3); a relief cut
   still moves no dimension (as BR-1 left it) and a delete prunes as before.
4. "A half-drawn line is dropped by undo without stepping back twice" is read as: one
   press drops the half-drawn shape and steps back exactly one history step (today's
   Undo last did both in one press).
5. X, Y in the row are from the sketch origin (HD-2's zero is not built).

**Warts.**

- The status hint for a box is in the status line, not by the cursor.
- Values with more than about seven figures scroll inside a 50 px box.
- A line's Angle is shown and taken in degrees from +X, −180 … 180.

## 15. HD-2 as built (2026-11-20)

Built as §6.1 – §6.6 say, with the differences below; nothing of HD-3 … HD-5 (no Slot,
Polygon, Move, Copy, Mirror, Pattern, Trim, Fillet, Offset, Fill, no Edit group). No
`CAD_VERSION` change. The one new key a finished sketch can carry is `sketch.zero: [u, v]`,
present only when the zero is not the origin; a sketch stored before HD-2 opens with the
zero at the origin and finishes with its very arrays and no third argument to `onFinish`
(`CadSketcher.dom.test.jsx` "finishes a stored sketch with its zero unchanged, and one
without as before", the HD-1 case "finishes a stored sketch unchanged when nothing was
done"), and `sketchFromSession` / `outlineSketches` give it back JSON-identical
(`sketchZero.test.js` "finishes a sketch stored before HD-2 byte for byte as it was").

**Files.** New (LF): `cad/sketchZero.js`, `cad/sketchIntersect.js`, `cad/sketchCheck.js`;
tests `cad/sketchZero.test.js` (11), `cad/sketchIntersect.test.js` (9),
`cad/sketchCheck.test.js` (16), `cad/sketchTyping.test.js` (8, the reducer cases of §6.2),
`cad/CadWorkspace.sketchZero.dom.test.jsx` (2); a test helper `cad/vw400Samples.testkit.js`
(the fixture parts drawn as `sketchProfile.loops.test.js` draws them, and `timeRuns`; not a
test file, not imported by the app); script `scripts/verify-hand-drawing-hd2.mjs`. Changed:
`cad/sketchTools.js` (CRLF kept), `cad/sketchSnap.js`, `cad/sketchEdit.js`,
`cad/sketchProfile.js` (CRLF kept; `describeEntity` only), `cad/sketchOperations.js`,
`cad/CadSketcher.jsx`, `cad/CadViewport.jsx` (`drawSketchOverlay`: the `zero` and
`problems` pieces; the `cadSketchOverlay()` probe), `cad/CadWorkspace.jsx` (CRLF kept;
`beginSketch`, `lookAtSketch`, `finishSketch`, the sketching help text), `cad/cad.css`;
tests `cad/sketchSnap.test.js` (four cases added), `cad/CadSketcher.dom.test.jsx` (four
cases added, the `DimensionHarness` takes `zero` and `onLookAt`), and the three assertions
under "Existing tests changed". Docs: `docs/state-machines.md` (the sketcher row),
`docs/sheet-metal-shop-guide.md` §1 ("Typing where things go", "Checking the drawing", the
bar's groups, the row "from the zero"), this section and the status line.

**Exported names.**

- `sketchZero.js` (no imports): `ORIGIN`, `isOrigin(zero)`, `fromZero(point, zero)` (a
  sketch point as X, Y from the zero: what is shown), `toZero(values, zero)` (X, Y from the
  zero back to the sketch point: what is typed), `storedZero(value) → [u, v] | null` (a
  stored `sketch.zero` read back; the origin or anything malformed is none). These two are
  the only place the zero is subtracted or added.
- `sketchIntersect.js` (imports `sketchProfile.js`): `INTERSECT_EPS` (1e-9),
  `primitives(entity)`, `intersect(p, q)`, `entityIntersections(a, b)`, and for snap and
  Check `primitiveBox(p)`, `distanceToPrimitive(point, p)`, `directionAt(p, point)`.
- `sketchCheck.js` (imports `sketchProfile.js`, `sketchIntersect.js`, `sketchEdit.js`,
  `sketchZero.js`): `TINY_MM` (0.01), `CLOSE_MM` (0.5), `NEAR_MM` (5),
  `checkDrawing(entities, { zero, split = true }) → { problems, notes }`,
  `applyFix(entities, dimensions, problem, { remove }) → { entities, dimensions }`. A fix is
  `{ label, kind: 'close' | 'remove', id, end?, to? }`.
- `sketchSnap.js`: `snapTargets` also returns `shapes` (`[{ pieces, box, owner }]`, the
  entities and the boundary edges); new `nearestIntersection(raw, shapes, tolerance)`.
- `sketchEdit.js`: `entityFields(entity, zero)`, `editEntity(entities, id, patch, zero)`.
- `sketchProfile.js`: `describeEntity(entity, zero)`.
- `sketchOperations.js`: `sketchFromSession({ …, zero })`, `outlineSketches({ …, zero })`,
  new `placeFocus(frame, points, least = 40)`.
- `sketchTools.js`: `SKETCH_COMMAND_KEYS.zero` (`['Z']`, `sketchCommand` → `'zero'`),
  `createSketchState(…, relief, zero)`, `sketchPairs(state)`, `sketchFields` (now the pairs
  flattened), `typedPair(state)`, `derivedValues(state)`, `axisValue(state, field, text)`,
  `lastPointOf(state)`, `RELATIVE_REFUSAL`. State: `zero`, `lastPoint`. Actions: `zero-reset`,
  `select-ids` `{ ids }`, `fix` `{ problem }`; `tool: 'zero'`; `typed` empties the other
  pair; `liveValues` / `typedPoint` read the zero and the pairs. `SKETCH_KEYS`, `sketchKey`,
  `SKETCH_TOOLS` are unchanged.

**Measured.** Node 22, the fixture parts as `sketchProfile.loops.test.js` draws them
(226 / 2 210 / 117 entities), `timeRuns` (median of 201 snaps over raw points spread across
each part, tolerance 4 mm, grid 1). `snapPoint`: body 0.22, cover 0.25, plate
0.06 ms median (the worst single call 1.8 – 2.0 ms; inside vitest, 41 snaps, 0.47 – 0.63 ms median); of the cover's, the
intersection search is 0.02 ms; at most 28 exact `intersect` calls in any one snap on
the cover (`sketchSnap.test.js` counts them with a spy); `snapTargets` on the cover 2.8 ms
(once per drawing change). Budget ≤ 1 ms: met. `checkDrawing`: body 30, cover
53, plate 6 ms median (inside vitest 60 ms, worst 72); budget ≤ 150 ms on the cover: met
(`entitiesToProfile` alone is 19 ms there; Check runs `profileLoops` once). In the browser
(`verify-hand-drawing-hd2`): the bar 53 px (two rows at both sizes, Zero and Check added),
with the Zero row (21 px) 87 px of 760 (0.114) at 1600 × 1000 and of 494 (0.175) at 1366 ×
768; with the selection row (a line's six boxes, 29 px) 95 px (0.124 / 0.191), as HD-1
left it. The Check panel with one row 87 px (0.114 / 0.176 of the view's height), with none
56 px.

**Judgment calls.**

1. `sketchZero.js` rather than helpers in `sketchTools.js`: `sketchEdit.js` (the row) and
   `sketchProfile.js` (the note's `describeEntity`) need them and may not import
   `sketchTools.js` (it reaches three). `fromZero` subtracts (what is shown), `toZero` adds
   (what is typed); both round to 1e-6 and return the point itself at the origin.
2. Z is in `SKETCH_COMMAND_KEYS`, not `SKETCH_KEYS` (HD-1 call 1: that table is the Draw and
   Mark tools and Undo last). It acts like a tool's key: on, or off when Zero is the tool on;
   from the window handler and from an empty HUD field; never with Ctrl / Alt, never on a
   repeat; Shift+Z is no key.
3. Zero is a tool with a HUD (X, Y), so typed X, Y and `@` work in it. A click or Enter sets
   the zero and ends the tool; Esc ends it with the zero unchanged. Its button is pressed
   while the tool is on or the zero is moved; the title says where the zero is in sketch
   coordinates. Reset zero shows only once the zero is moved (at the origin the row is the
   sentence alone).
4. `onFinish` gets a third argument `{ zero }` only when the zero is moved or the session
   had a stored one (then `zero: null` when it was reset); otherwise it is called with two
   arguments exactly as before, so every existing `toHaveBeenCalledWith(entities, dims)`
   holds. `sketchFromSession` keeps an edited sketch's own zero when given none, drops the
   key on `null` or the origin, and puts `zero` after `dimensions` (a sketch with no zero has
   its keys in the old order).
5. `@`'s last point: the tool's own previous point (`points.at(-1)`), else `lastPoint`, set
   by every point a Draw tool places in this session: each line corner, both rectangle
   corners, every arc point, and a circle's centre (its size click places no point, so a row
   of holes is `@25`, `@0` from centre to centre). Dimension, Relief and Zero clicks do not
   set it. `@` alone is the last point's own coordinate; `@=expr` evaluates the rest.
6. The pair rule lives in the reducer's `typed`: typed text in a box deletes the other
   pair's typed keys; emptying a box deletes nothing. With neither pair typed nothing is
   greyed and Enter reads the first pair (all live, the cursor's point, as before). The
   greyed values are placeholders with the class `is-derived`; a refused typed value greys
   nothing. Radius / Diameter are a pair of one box each.
7. The HUD lays each pair on its own row (`.cad-sketch-hud-row`), its boxes 74 px; the HUD
   may be 320 px wide (two boxes and an "= 75" line); the readouts keep 260 px
   (`READOUT_ROOM`). The X and Y boxes carry the title "From the zero · @ before a number
   measures from the last point (@25)"; the HUD's own hint words are unchanged.
8. Intersection snap: the pieces tried are those of shapes whose box grown by the tolerance
   holds the cursor AND that pass within the tolerance of it (a crossing within reach lies on
   both), at most 64 (the nearest), pairwise, never two pieces of one shape (a rectangle's own
   corners are key points). A crossing must be nearer than the nearest key point by more than
   1e-9 to win, so two lines ending on one corner stay "endpoint". Construction entities and
   the model edges take part.
9. Check's open ends: two open ends that are each other's nearest within 5 mm are one problem
   (a gap is one thing to fix: the script's "1 to fix"); the end of the later-drawn entity is
   the one that moves. The nearest other end excludes the same entity's other end. "Close it"
   only under 0.5 mm; the row says the gap to three decimals.
10. `duplicate` is per type (a line on a rectangle side is not a copy); copies are left out of
    `overlap`, `crossing` and `nested` (a doubled rectangle would otherwise make every hole
    "inside a cut-out"). `overlap` is lines only. `crossing` needs a transversal crossing at
    an interior point of both pieces (|sin| > 1e-6, more than 1e-6 from either piece's ends):
    touching, tangency and a hole sharing a side with the outline are not crossings. A
    crossing exactly at a vertex of one loop is not found (see "Not done").
11. Crossing words: a pair that includes the largest outer loop is "A cut-out crosses the
    outline"; two other loops "Two cut-outs cross"; an open chain "An open line crosses the
    outline / a cut-out". One problem per pair of loops, framing all their crossing points.
12. Notes: "N separate outlines: Finish makes N sketches" in the shop's finish (`split`, the
    session has a `returnTo`), "N separate outlines: one extrusion uses the largest; sketch
    the others separately" in the Sketch tab's; left out while there are open ends or
    branches (the holes of an outline not yet closed are loops of their own then).
    "Nothing to fix: a closed outline with 68 cut-outs." / "… with 1 cut-out." / "… with no
    cut-outs." / "Nothing to fix: no outline drawn yet."
13. `applyFix`'s remove goes through the reducer's `removeEntities` (passed in as `remove`),
    so the dimensions on what it removes are pruned; `sketchCheck.js` cannot import
    `sketchDimensions.js` (three, through `marks.js`). A fix whose entity or end has moved is
    refused ("That problem is no longer in the drawing.") and changes nothing.
14. The status line: with something to fix its counts are a button "… · N to fix", the count
    last (after "· 2 dimensions"), so every existing `toContain('… open outline · 1
dimension')` holds. And it says "open outline" whenever Check finds an open end, even
    where `entitiesToProfile` calls the drawing closed because a closed loop stands beside an
    open chain (holes drawn in an L not yet closed made the circle "the profile" and the line
    read "closed profile"). With nothing to fix it reads exactly as before. See "Wrong in the
    spec" 2.
15. Check's panel state is the component's (`checkOpen`, not the reducer's): it is no part
    of the drawing. Opening it focuses its first row (so Esc closes it); a row is a button (a
    click or Enter); its fix is a button beside it. After a fix the focus goes to the row now
    in the fixed one's place, else the last row, else Close. Esc in the panel closes it and
    gives the focus to the bar's Check. The panel's foot is set after each render from the
    status line's top edge (it wraps to two lines at 1366 × 768).
16. A row's click selects its entities (`select-ids`, which ends a tool as Ctrl+A does) and
    frames its points through `onLookAt([], points, { place: true })`: `lookAtSketch` then
    moves the camera only (`placeFocus`, at least 40 mm across), leaving the session's
    `visible` and grid, because the sketcher's refit (a shape off the view refits to all)
    would undo a smaller view at once.
17. Markers: the zero is a ring of the dash's size step (2^round(log2(2 × marker size))) and
    a cross 1.6 times that, in the snap colour, `sketch-zero`; Check's are red (`#d22f27`)
    rings 1.5 steps, 2.6 for the row under the pointer or with the focus (both are tracked),
    `sketch-problem`, keyed on the problems array, the focus pair and the step. The probe
    `cadSketchOverlay()` adds `zero` and `problems`.
18. The selection row's X / Y titles say "X from the zero" while the zero is moved.
19. Enter in the Check panel is the focused button's own: the panel stops it before the
    sketcher's window handler, which takes Enter's default away (so a focused row could not
    be pressed with Enter otherwise). Delete there still deletes a row's selection.

**Checked.** Unit suite: 601 files (599 passed, 1 skipped, and each run one time-budget test
of the four named for a loaded machine failing: `skinGauge` sweep, `cornerGapsSet` eight
steps or `kernel.sheetmetal`, each passing when rerun alone), 7 277 tests (7 275 + that one
passed, 1 skipped; 54 new). Lint 0 errors, 40 warnings (as before). `npm run build` passes.
Browser (vite on 5180, `--strictPort`): `verify-hand-drawing-hd2`, `verify-hand-drawing-hd1`,
`verify-bend-relief-br1`, `verify-sketch-dimensions-sd1`, `verify-outline-edit-oe1`,
`verify-sketch-shortcuts-sk1`, `verify-start-sketch`, `verify-sketch-on-face` pass after the
last code change; the HD-2 screenshots (`artifacts/sketch-cad/hand-drawing-hd2`) were looked
at.

**Existing tests changed.** Three assertions §6 itself changes:
`sketchOnFace.test.js` "draws a typed rectangle…" reads `['Width', 'Height', 'X', 'Y']` for
the second corner's fields (§6.2 adds X, Y); `sketchHandDrawing.test.js` "the keys of HD-1"
reads `zero: ['Z']` in `SKETCH_COMMAND_KEYS` (§6.1's key); `sketchSelect.test.js` "the pure
modules of HD-1" lets `sketchProfile.js` and `sketchEdit.js` import `./sketchZero.js`
besides `./sketchProfile.js` (§6.1: `describeEntity(entity, zero)` and `entityFields(entity,
zero)` measure from the zero; `sketchZero.js` imports nothing and is checked in
`sketchZero.test.js`). `sketchSnap.test.js` keeps its case and gains four. No script was
changed.

**Wrong in the spec, or not done.**

1. §6's bullet "a cut-out outside the outline" has no kind in §6.4's table; the table wins:
   a closed shape beside the outline is a separate outline, which the note counts.
2. The spec's script line "a 0.3 mm gap left in the outline → 'open outline · 1 to fix'"
   could not hold with holes drawn first under the old status rule (`entitiesToProfile`
   says "closed" when any closed loop exists and nothing branches; the holes of an open L
   are such loops). Met by judgment call 14, not by changing `entitiesToProfile` (the
   worker's, and Finish's, rule is unchanged: such a drawing still finishes with its largest
   closed loop as the profile, as before).
3. A crossing that passes exactly through a corner of a loop (a vertex lying on the other
   loop's edge) is not reported: the interior test leaves out every point on a piece's end.
4. HD-5's `sheet` option of `checkDrawing` is not read (the making notes are HD-5).

**Warts.**

- The markers' size follows the cursor's last pointer move: right after a Check row frames
  its place (the camera closer) the rings stand at the old view's size until the pointer
  moves on the canvas.

- The HUD box stands where the pointer last was; after a window resize it can stand off the
  view until the pointer moves (as before HD-2).
- The status line's hint for a Line still says "type a length and angle" (its words are
  kept); the X, Y boxes' title and the guide say the rest.

## 16. HD-3 as built (2026-11-20)

Built as §7.0 – §7.7 say, with the differences below; nothing of HD-4 (no Trim, Extend,
Fillet, Chamfer, Offset, no Edit group in the bar) or HD-5 (no Fill, no making notes, no
benchmark). No `CAD_VERSION` change. The new keys a finished sketch can carry are optional:
`rect.r` (absent for a sharp rectangle), and the entity types `slot { c, length, width,
angle }` and `polygon { c, sides, af, angle }`. A sketch stored before HD-3 opens and finishes
byte for byte as it was (`sketchShapes.test.js` "opens and finishes a sketch stored before
HD-3 byte for byte as it was"; the HD-1 / HD-2 DOM cases "finishes a stored sketch unchanged
…" still pass).

**§7.0, first.** (a) `sketchOperations.js` `placeFocus(frame, points, least = 10, grow = 4)`:
the frame is the points' extent × 4, never under 10 mm (it was × 1.6, at least 40 mm).
(b) The marker sizes follow the view: `CadViewport.jsx` keeps a camera key (position,
quaternion, zoom, projection, canvas size) and tells the view's watchers once a frame
(`requestAnimationFrame`) after a render with a new one (`ctx.watchView`, the API's
`watchView(watcher) → unwatch`); `CadSketcher.jsx` measures the view's mm per pixel at its
centre on subscribe and on every notice (`viewScale`), and the marker size reads it before the
pointer's last move. Before / after (the HD-2 script's row framed from the keyboard,
`artifacts/sketch-cad/hand-drawing-hd2/04-check-open-1600.png`, looked at both times): the
focused ring was about 200 px across its radius and the frame showed nothing but the ring;
now the ring is 24.7 px (the script's new check: < 40 px) and the frame is 76 px a mm, the
gap's corner and both lines round it in view. Also: a focus on an orthographic camera puts its
wheel `zoom` back to 1 (judgment call 22).

**Files.** New (LF): `cad/sketchShapes.js`, `cad/sketchTransform.js`, `cad/sketchPattern.js`;
tests `cad/sketchShapes.test.js` (15), `cad/sketchTransform.test.js` (5),
`cad/sketchPattern.test.js` (6, the budgets), `cad/sketchActions.test.js` (24, the reducer
cases of §7.8 and §7.0's frame); script `scripts/verify-hand-drawing-hd3.mjs`. Changed:
`cad/sketchProfile.js` and `cad/sketchTools.js` (CRLF kept), `cad/sketchIntersect.js`,
`cad/sketchCheck.js`, `cad/sketchEdit.js`, `cad/sketchSelect.js`, `cad/sketchDimensions.js`,
`cad/sketchRelief.js`, `cad/outlineMove.js`, `cad/sketchOperations.js` (`placeFocus`),
`cad/CadSketcher.jsx`, `cad/CadViewport.jsx` (the `selected` and `ghost` overlay pieces,
`watchView`, the probe), `cad/CadWorkspace.jsx` (CRLF kept; the remembered shape options, the
help text), `cad/cad.css`; tests `cad/CadSketcher.dom.test.jsx` (CRLF kept; five cases added,
`DimensionHarness` takes `view` and `onShapeOptionsChange`), `cad/kernel.cutOuts.test.js` (one
case), and the assertions under "Existing tests and scripts changed". Docs:
`docs/state-machines.md` (the sketcher row), `docs/sheet-metal-shop-guide.md` §1 ("Slots,
polygons and rounded corners", "Moving, copying, mirroring", "Patterns", the bar, the row's
numbers, a line in "Checking the drawing"), this section and the status line.

**Exported names.**

- `sketchShapes.js` (no imports): `POLYGON_MIN` (3), `POLYGON_MAX` (12), `polygonName(sides)`,
  `rectBounds(rect)`, `isRounded(entity)` (a radius that fits: one over half the shorter side,
  which no tool stores, reads as sharp), `isShapeLoop(entity)` (slot, polygon, rounded
  rectangle), `slotRefusal`, `polygonRefusal`, `cornerRadiusMax`, `cornerRadiusRefusal(rect,
r)`, `slotPieces`, `polygonCorners`, `polygonPieces`, `acrossFlats(ac, sides)`,
  `roundedRectPieces`, `shapePieces(entity)`, `shapeKeyPoints(entity)`.
- `sketchProfile.js`: new `explode(entity, { ids })`; re-exports `cornerRadiusMax`,
  `cornerRadiusRefusal`, `isRounded`, `isShapeLoop`, `polygonName`, `polygonRefusal`,
  `slotRefusal` (so `sketchEdit.js` and `sketchCheck.js` keep their import lists).
- `sketchTransform.js` (imports `sketchProfile.js`, `sketchEdit.js`): `normalAngle`,
  `translation(dx, dy)`, `rotation(center, degrees)`, `reflection(p, q)`, `applyTo(T, p)`,
  `keepsAxes(T)`, `transformEntity(entity, T) → [entity] | its pieces "{id}.{n}"`,
  `transformEntities(entities, ids, T, { keep, nextId }) → { entities, nextId, ids, before }`,
  `transformDimensions(dimensions, moved, T)`.
- `sketchPattern.js` (imports `sketchTransform.js`, `sketchCheck.js`): `PATTERN_KINDS`,
  `PATTERN_LIMIT` (2 000), `defaultPattern()`, `patternRefusal`, `patternTransforms(pattern,
zero)`, `shapeIndex(entities) → { has, add }`, `withoutCopies(entities, candidates) → {
kept, leftOut }`, `planPattern(entities, ids, pattern, { zero }) → { copies, leftOut,
refusal }`, `patternEntities(…, { zero, nextId }) → { entities, nextId, added, leftOut,
refusal }`, `patternWords(plan)`, `groupedCount(n)`.
- `sketchCheck.js`: `sameGeometry(e, f)` and `anchorOf(e)` exported (the "already there" rule).
- `sketchEdit.js`: `circlesOf(entity)` exported; `EDIT_FIELDS` gains `rect.r` ('Radius'),
  `slot`, `polygon`.
- `sketchTools.js`: `SKETCH_TOOLS` and `SKETCH_KEYS` gain `slot` ('S') and `polygon` ('P');
  `DRAW_TOOLS` both; `SKETCH_COMMAND_KEYS` gains `move` M, `copy` K, `rotate` Q, `mirror` I,
  `pattern` G; new `SELECTION_ACTIONS`, `isSelectionAction`, `mergeShapes`, `orthoFrom`,
  `patternPlan`, `shapeRefusal`, `ghostEntities`; `createSketchState(…, zero, shapes)`. State:
  `shapes`, `op`, `drag`, `pattern`, `angleStep`. Actions: `shapes`, `op`, `op-option`,
  `mirror-zero`, `pattern`, `pattern-apply`, `drag`, `drag-end`, `drag-cancel`; `click`,
  `enter`, `escape`, `tool`, `select-all`, `select-ids`, `delete`, `undo`, `redo` and `move`
  (its `angleStep`) take the action and the drag into account.
- `CadSketcher.jsx`: props `shapes`, `onShapeOptionsChange`. `CadViewport.jsx`: API
  `watchView`; overlay keys `ghost`, `dragOffset`; the probe `cadSketchOverlay()` adds
  `ghost` (its count), `dragOffset`, `markerSize`.

**The reader sweep (§7.1).** Every reader of sketch entities under `cad/`, and what it does
for a slot, a polygon and a rounded rectangle:

| Reader                                                             | For the three shapes                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sketchProfile.js` `explode`                                       | their pieces (`sketchShapes.js`), counter-clockwise from the first side; a sharp rect its four sides from the lower-left corner (as before), a circle two half circles                                                                                                                                                                     |
| `entityPolyline`                                                   | the pieces as one closed polyline, each arc sampled by `steps`                                                                                                                                                                                                                                                                             |
| `entityKeyPoints`                                                  | `shapeKeyPoints`, in §7.1's order (slot 11, polygon 1 + 2n, rounded rectangle 17)                                                                                                                                                                                                                                                          |
| `entitySegments`, `hitEntity`                                      | through `entityPolyline`                                                                                                                                                                                                                                                                                                                   |
| `profileLoops`                                                     | a loop of `kind: 'shape'` (its polygon at 48 steps an arc); a refused size none                                                                                                                                                                                                                                                            |
| `loopProfile` (`shapeProfile`)                                     | a polygon `{ type: 'polygon', points }`; a slot or rounded rectangle a closed `path` from the first line's start, exact 3-point arcs                                                                                                                                                                                                       |
| `splitOutlines`, `entitiesToProfile`                               | through the loops (a shape loop owns its one entity)                                                                                                                                                                                                                                                                                       |
| `describeEntity`                                                   | "Slot 22 × 5 at (60, 28)", "Hexagon 10 across flats at (…)", "Rectangle 100 × 60, corners R5 at (0, 0)"                                                                                                                                                                                                                                    |
| `profileToEntities`                                                | unchanged: a stored profile has no shapes (a polygon profile opens as lines, as before, only when the stored entities are not in step)                                                                                                                                                                                                     |
| `sketchIntersect.js` `primitives`                                  | a circle itself, everything else through `explode` (segments and arcs)                                                                                                                                                                                                                                                                     |
| `sketchSnap.js` `snapTargets`                                      | through `entityKeyPoints`, `entitySegments`, `primitives` (no code change)                                                                                                                                                                                                                                                                 |
| `sketchCheck.js`                                                   | copies (`sameGeometry`: a slot turned half round, a polygon by a side's angle are the same; a sharp and a rounded rectangle are not), places, framed points, nouns, tiny (a slot's width, a polygon's size); open ends and branches only from lines and arcs (a shape is closed); crossings and nesting through the loops and `primitives` |
| `sketchEdit.js`                                                    | the row's numbers (`entityFields`) and their edit (`editEntity`, refusals in words); `followDimensions` maps key points by kind and ordinal when the layout changes (a rectangle given a radius) and follows a radial dimension on a slot's end or a rounded corner (`circlesOf`); `joinsAt` lines and arcs only (a shape has no ends)     |
| `sketchSelect.js`                                                  | `boxSelect` through `entityPolyline`; the nouns slot, polygon                                                                                                                                                                                                                                                                              |
| `sketchDimensions.js`                                              | square-to sides from `explode`'s lines; a click on a shape takes the nearest piece (a side's span, an arc's radius); `pruneDimensions` / `splitDimensions` see every round part (`circlesOf`) and the exact curve                                                                                                                          |
| `sketchRelief.js`                                                  | `walkOf` walks a rect or shape loop through `explode` (side k = piece k); `cutRelief` explodes any entity whose side takes part (a polygon cut-out's corner is an inside corner; a rounded corner is an arc: none)                                                                                                                         |
| `outlineMove.js` `carryEntities`                                   | a moved loop drawn by a shape is carried as its pieces with new ids when the profile comes back in step, else null and the caller's rebuild (as for any loop not in step); the sharp-rectangle branch never takes a rounded one                                                                                                            |
| `sketchOperations.js`                                              | through `entitiesToProfile` / `splitOutlines` (no change); `editableEntities` keeps the stored entities (the profile JSON is the same every time: tested)                                                                                                                                                                                  |
| `sketchTools.js`                                                   | the reducer: the tools, `transformEntities`, `planPattern`, `previewEntities`, `ghostEntities`                                                                                                                                                                                                                                             |
| `CadSketcher.jsx`                                                  | `hitEntity`, `entityKeyPoints` (the drag's grab), `entityPolyline` (the refit), `describeEntity`, `entityFields`                                                                                                                                                                                                                           |
| `CadViewport.jsx` overlay                                          | `entityPolyline` / `polylineSegments` for the batch, the selection, construction, the ghost, the preview                                                                                                                                                                                                                                   |
| `CadWorkspace.jsx` `lookAtSketch`, `ShopFloor.jsx`, `shopRoute.js` | `entityPolyline` (closed polylines)                                                                                                                                                                                                                                                                                                        |
| `SketchPanels.jsx`                                                 | `describeEntity`                                                                                                                                                                                                                                                                                                                           |
| `sketchHistory.js`, `sketchZero.js`, `kernel.js`                   | no entity reads (kernel: profiles only; `separateCutOuts` already took polygons: the new case shows it)                                                                                                                                                                                                                                    |

**Measured.** Node 22, inside vitest, `timeRuns` medians (§7.6's budgets): a 15 × 24
staggered grid of one hexagon 8 across flats (359 copies) `patternEntities` 1.35 ms (worst
3.2; budget 20); the drawing it makes (a rounded outline and 360 polygons)
`entitiesToProfile` 15.1 ms (30), `checkDrawing` 19.8 ms (80), `boxSelect` 0.025 ms after the
first call (2). Moving 500 selected entities: a drag frame (the reducer's `drag` step and the
selection's polyline at the offset, what the overlay draws) 0.77 ms (worst 1.4; budget 10),
the release (`transformEntities`) 0.30 ms. The kernel builds the outline with 360 hexagons as
one compound face (`separateCutOuts` frees all 360) in 1 190 ms, volume / (flat area × t)
within 0.1 %. Browser (`verify-hand-drawing-hd3`), the bar 53 px (two rows at both sizes):
with the Rectangle row (29 px) 95 px of 760 (0.124) at 1600 × 1000 and of 494 (0.191) at 1366
× 768; the Slot row (31 px) 0.127 / 0.195; a slot's numbers with the five actions (the row on
two lines, 54 px) 0.158 / 0.242; the Mirror row 0.158 / 0.242; Pattern's Grid and Circle rows
(56 px) 0.160 / 0.246. HD-2's line row with the actions 0.158 / 0.242. All inside §7.5's sixth
(0.167) and quarter (0.25).

**Judgment calls.**

1. Slot and Polygon are bar tools, so they are in `SKETCH_TOOLS` / `SKETCH_KEYS` (after
   3-point arc, before Dimension), not in a second table; M, K, Q, I, G act on a selection and
   go in `SKETCH_COMMAND_KEYS`. Each letter acts from a HUD box only while it is empty.
2. `explode` covers every entity: a circle is two half circles from its rightmost point (no
   reader needs it yet; `primitives` keeps a circle a circle).
3. A rounded rectangle whose radius is half one side has no straight sides there: the two
   quarter arcs beside it are one half round ("two lines and two arcs"), and a square with a
   radius of half its side is two half rounds. The key points keep their 17 places (some then
   coincide), so `followDimensions` reads them by index whatever the radius.
4. A polygon's HUD Angle is its own angle (0: a flat at the bottom), the same number as the
   row's: a click sets it from the direction of the flat's middle (or the corner), reduced into
   [0, 360 / sides); a typed one is kept as typed. A slot's Angle is the direction from the
   first click to the second, in (−180, 180]. Typed Length / Angle (or size / Angle) are taken
   exactly, not through the point they give (no 1e-6 drift).
5. The shape options (`shapes`) are kept for the session and the next sketch through
   `onShapeOptionsChange` → `CadWorkspace`'s `sketchShapes` (session-only, as Relief's); a
   Width or Sides committed in the row gives the focus back to the HUD.
6. The words: "Rectangle 100 × 60, corners R5 at (0, 0)" (the spec's words, then where it is,
   as the sharp one says); the refusal for an action with nothing selected says its own verb
   ("Select what to move first.", "… to copy", "… to turn", "… to mirror", "… to pattern").
7. An action's key or row button again ends it (as a tool's key does). After Move, Rotate and
   Mirror the action ends and the selection is what it made (the moved entities, or the
   copies / mirrored ones); Copy's copies become the selection when it ends; after Pattern's
   Apply the action ends and the selection stays the original.
8. Enter inside a row box is the box's (it commits the number, as in the Relief row); Esc
   leaves the box, and Enter then applies Pattern. Pattern's Apply and the actions' row buttons
   give up the focus so Enter and the keys reach the sketcher.
9. The drag moves nothing until the release: the overlay draws the selection at the offset in
   its own piece (`selected`), so the batch of everything else is kept every frame; snap leaves
   out what moves (for a drag, Move's and Copy's target and Rotate's angle; Mirror's axis may
   snap to the selection's own points). The grab is the nearest key point of the pressed entity
   within the snap tolerance.
10. The dimensions on a moved selection go through `transformDimensions` (each end on a key
    point of a moved entity is mapped through the transform, a radial one with its round part)
    rather than `followDimensions` entity by entity: a turned or mirrored rectangle's corners
    change order, so following by index would move an end to the wrong corner. For a move the
    two agree. A linear dimension whose both ends turn a quarter swaps level / plumb; turned by
    any other angle it keeps its kind (see Warts).
11. "A rect stays a rect when its sides stay along X and Y" is read as the transform keeping
    the axes: a move, a quarter turn, a mirror about a level, plumb or 45° line (that last one
    swaps width and height). Otherwise its pieces take new ids from `nextId` where it was.
12. Copy refuses a copy that lies exactly on a shape already there and counts it ("1 left out:
    already there"; all of them: "The copy would lie on shapes already there: nothing
    added."). Pattern does the same through `planPattern`.
13. Pattern's numbers are the session's (not kept for the next sketch); its circle's centre is
    the zero until a click or the row's Centre X / Y sets it; over 2 000 copies the ghost shows
    the first 2 000 and the row says so; the first Apply only turns the button into "Add 2 499
    shapes?", a number changed asks again.
14. Rotate's live angle is the cursor's direction from the centre (degrees from +X), in whole
    degrees with Snap on and 15° steps with Shift (Shift is not ortho there).
15. Mirror over a line: only when the cursor's snap is no key point (a click on a line's end
    is the axis's first point) and only an unselected line (construction or drawn).
16. The two shortened bar words carry `aria-label` with the full name ("Center rectangle",
    "3-point arc"); the title is unchanged.
17. `sketchProfile.js` re-exports the shape rules, so `sketchEdit.js` and `sketchCheck.js`
    import nothing new (their purity tests pin their import lists).
18. The selection row's active action button looks pressed as the bar's tools do; the
    rectangle's Radius box is empty with the placeholder "sharp".
19. What would change nothing is no step: a Move by nothing ("That moves nothing."), a Copy
    onto its original ("That puts the copy on the original."), a turn of 0 ("A turn of 0°
    moves nothing."), a drag released where it began (silently).
20. The watchers are told once a frame through `requestAnimationFrame` (a `setTimeout` where
    there is none); the first measure is on subscribe, so nothing waits for a camera move.
21. The ghost is one LineSegments batch (`sketch-ghost`) in the preview colour, keyed on its
    array: Pattern's (one per plan, `WeakMap`) is not rebuilt on a pointer move.
22. A focus (Look at, a Check row) on an orthographic camera puts its wheel `zoom` back to 1:
    the span asked for is then what is framed (before, a zoomed view framed span ÷ zoom).
23. The HUD box stands below the bar and its options row: with the pointer off the canvas it
    used to stand at (16, 60), which now covered the Rectangle row's Corner radius box (seen in
    the first 1366 × 768 shot); the row's foot is measured after each render and set on the box
    before it is painted. The same floor holds near the top of the view.

**Checked.** Unit suite before (the brief's baseline; my own baseline run overlapped my first
`sketchProfile.js` edit and read 7 274 passed, 1 skipped, 2 failed: the pure-module import list
this phase changes and the load-flaky `cornerGapsSet`): 601 files, 7 277 tests. After the last
code change: 605 files (604 run + 1 skipped), 7 332 tests: 7 329 passed, 1 skipped and 2
failing under load, `tightBends` "kiosk: hitSequence …" (one of the four named) and
`src/analysis/sunStudyRunner.test.js` "measures a target against the merged envelope …" (a 5 s
test timeout, a module this phase does not touch), both passing rerun alone. The run before
the last (CSS and HUD placement) change passed whole: 7 331 + 1 skipped. An earlier
sketch-studio-only run failed `CadWorkspace.reach.dom` "drags the backgauge …" once under load;
it passes alone and in both full runs. One reducer case was added after the last full run
(`sketchActions.test.js` "Esc at every step of an action", run with its file): 7 333 tests, 56
new. Lint 0 errors, 40 warnings (as before). `npm run build` passes. Browser (vite on 5180,
`--strictPort`, stopped after; nothing listens on 5180): `verify-hand-drawing-hd3`,
`verify-hand-drawing-hd2`, `verify-hand-drawing-hd1`, `verify-bend-relief-br1`,
`verify-sketch-dimensions-sd1`, `verify-outline-edit-oe1`, `verify-sketch-shortcuts-sk1`,
`verify-start-sketch`, `verify-sketch-on-face` pass after the last code change; the HD-3
screenshots (`artifacts/sketch-cad/hand-drawing-hd3`) and HD-2's Check frame were looked at.

**Existing tests and scripts changed.** Each because §7 changes what it pins:
`sketchKeys.test.js` reads `slot: 'S', polygon: 'P'` in `SKETCH_KEYS` (§7.2's keys);
`sketchDimensionTool.test.js` "is the sketch tool after …" finds Dimension after `polygon`, not
`arc` (§7.5: Slot and Polygon join Draw after 3-point arc); `sketchHandDrawing.test.js` "the
keys of HD-1" reads M, K, Q, I, G in `SKETCH_COMMAND_KEYS` (§7.3); `sketchEdit.test.js` "lists
the boxes of §5.3" reads the rectangle's `r: null` and the `slot` and `polygon` rows in
`EDIT_FIELDS` (§7.1's numbers); `sketchSelect.test.js` "the pure modules of HD-1" lets
`sketchProfile.js` import `./sketchShapes.js` (§7.1: `explode` is built on it; it imports
nothing, `sketchShapes.test.js` checks). Scripts: `verify-hand-drawing-hd1.mjs` and
`verify-hand-drawing-hd2.mjs` measured the bar and its row against a fifth of the view; §7.5
restates the limit as a sixth at 1600 × 1000 and a quarter at 1366 × 768, and the selection
row now carries the five actions (a line's row wraps to two lines at both sizes: 0.158 /
0.242), so both read §7.5's limits. `verify-hand-drawing-hd2.mjs` gains §7.0's check (the
ring's radius on screen after the row is framed: < 40 px; measured 24.7 px).

**Wrong in the spec, or not done.**

1. §7.8 "twice a mirror = the original": exactly so about a level, a plumb or a 45° axis;
   about any other axis each mirror rounds its points to 1e-6 mm, so the round trip is the
   original to 1e-6 mm (tested so), not bit for bit.
2. §7.8 "area and bounds equal the shape's to 1e-6": bounds to 1e-6 mm; the area to 1e-6 of
   itself (the drawn points are rounded to 1e-6 mm, which moves a 104.6 mm² slot's area by
   1.3e-5 mm²).
3. §7.3 says the dimensions follow through `followDimensions` per entity: done through
   `transformDimensions` (judgment call 10), which is what following means for a turn or a
   mirror.
4. The script's drag of a slot "with the pointer": the release lands on the 1 mm grid, so the
   script checks it went about 10 mm down (it measured −54.5 for −55) and that Undo last puts
   it back, rather than one exact number.
5. Nothing of HD-4 or HD-5 is built.

**Warts.**

- A linear dimension whose two ends turn with the selection by an angle that is not a quarter
  keeps its level or plumb kind (it then reads the projected length); an aligned one stays
  aligned and right.
- A loop drawn by a shape whose outline edge move does not come back in step (the bottom side
  of a rounded outline: the path starts there) is rebuilt from the profile by the caller as
  lines and arcs, every entity's id renumbered, as for any loop not in step before.
- Rotate turns by the cursor's direction from +X, not from where the cursor first was: to turn
  by 30° point at 30°, or type it.
- At 1366 × 768 Pattern's row (two lines) brings the bar and its row to 0.246 of the view, just
  inside the quarter.

## 17. HD-4 as built (2026-11-21)

Built as §8.0 – §8.8 say, with the differences below; nothing of §9 (no Fill, no making
notes, no benchmark, no "Drawing a real part"). No `CAD_VERSION` change and no new entity
key: what the five tools make is lines, arcs and the shapes there were. One new reducer key,
`offsetFrom`, is never stored. A sketch stored before HD-4 opens and finishes byte for byte
(`sketchEditTools.test.js` "opens and finishes byte for byte as it was, the Edit tools turned
on and off"; the HD-1 / HD-2 / HD-3 stored-sketch cases still pass).

**§8.0, first.** (1) `sketchTransform.js` `turnedLinear`: a level or plumb dimension whose
ends both go through a T that does not keep the axes becomes `aligned`, its offset read
back from the turned line (a 40 mm width turned 30° reads 40, 5 below it as before;
`sketchTransform.test.js` "turns a level or plumb dimension by 30° …"). (2)
`sketchCheck.js`'s crossing block: a closed loop's pieces are now tested against each
other too (a point is skipped only where both pieces end, at one node, within 1e-3 mm of
it), and two loops' meeting points count at a piece's end and at a tangent: "The outline
crosses itself at …", "A cut-out crosses itself at …" ("An outline crosses itself" for a
second outer loop), "A cut-out touches the outline at …", "Two cut-outs touch at …"; kind
`crossing`, the pair's first two pieces' ids. A pair with a transversal crossing inside
both pieces reads "crosses", else "touches". (3) The Sketching panel: `cad/sketchHelp.js`
(pure, no imports) and `CadWorkspace.jsx`'s panel: the heading, a `<section
aria-label="Now">` ("Now · Trim (T)" and its lines), then three closed `<details>`: Keys
(`helpKeys` over `SKETCH_TOOLS`, `SKETCH_KEYS`, `SKETCH_COMMAND_KEYS`), Points and numbers,
Selecting and changing (`HELP_SECTIONS`). The sketcher hands what is in hand up through
`onHandChange`. (4) `CadSketcher.dom.test.jsx` "puts a drag-move back on a window blur and
on a missed release …" and "frames the span asked for on a zoomed orthographic camera …";
Rotate (typed centre and angle) and Copy (typed ΔX) are driven in the HD-4 script.

**Files.** New (LF): `cad/sketchTrim.js`, `cad/sketchCorner.js`, `cad/sketchOffset.js`,
`cad/sketchHelp.js`; tests `cad/sketchTrim.test.js` (20), `cad/sketchCorner.test.js` (14),
`cad/sketchOffset.test.js` (5), `cad/sketchHelp.test.js` (4), `cad/sketchEditTools.test.js`
(11, the reducer cases of §8.9); script `scripts/verify-hand-drawing-hd4.mjs`. Changed:
`cad/sketchTools.js` (CRLF kept), `cad/sketchCheck.js`, `cad/sketchTransform.js`,
`cad/CadSketcher.jsx`, `cad/CadViewport.jsx` (the `cut` overlay piece, the probe),
`cad/CadWorkspace.jsx` (CRLF kept; the Sketching panel only), `cad/cad.css`,
`cad/vw400Samples.testkit.js` (`profileArea`, for the tests); tests
`cad/CadSketcher.dom.test.jsx` (CRLF kept; three cases added), `cad/sketchCheck.test.js`
(two cases added), `cad/sketchTransform.test.js` (one case added), and the assertions under
"Existing tests changed". Docs: `docs/state-machines.md` (the sketcher row),
`docs/sheet-metal-shop-guide.md` §1 (the bar and the panel in "Changing what you drew",
the touching and self-crossing rows in "Checking the drawing", new "Trimming and
extending" with the worked keyhole, "Rounding and cutting corners", "Offsetting"), this
section and the status line.

**Exported names.**

- `sketchTrim.js` (imports `sketchProfile.js`, `sketchIntersect.js`, `sketchCheck.js`):
  `MEET_MM` (1e-3), `fmtMm`, `primitiveOf(piece)`, `drawingPieces(entities) → [{ index, k,
piece, prim, box, ends }]`, `nearestPiece(all, raw, tolerance)`, `measureOf(prim) → {
length, at(p), point(s), closed?, dir? }`, `cutPoints(all, target) → [{ s, point, end }]`,
  `trimPick({ entities, raw, tolerance }) → { type: 'span', index, id, k, kind, shape, from,
to, whole, length } | none`, `trimCut({ entities, pick, nextId })`, `explodeAt(entities,
index, next)` (shared with Fillet / Chamfer), `extendPick(…) → { type: 'end', index, id,
end, from, to, run, turn? } | none`, `extendCut({ entities, pick, nextId })`.
- `sketchCorner.js` (imports `sketchProfile.js`, `sketchCheck.js`, `sketchTrim.js`):
  `cornerPick({ entities, raw, tolerance, tool }) → { type: 'corner', point, ends: [{ index,
id, k, end, length, away }] ×2, rect } | none`, `filletCut({ entities, pick, radius, nextId
})`, `chamferCut({ entities, pick, distance, nextId })`.
- `sketchOffset.js` (imports `sketchProfile.js`, `sketchIntersect.js`, `sketchTrim.js`):
  `offsetPick({ entities, raw, tolerance }) → { type: 'entity', index, id } | none`,
  `offsetCopy(entity, raw, distance) → { copy, outward }`, `offsetCut({ entities, id, raw,
distance, nextId })`.
- Every cut returns `{ entities, added, replaced, nextId, text, pieces, removed }` (§8.1):
  `pieces` what it adds (the preview), `removed` the geometry it takes away (the red piece,
  and what Trim's dimension rule reads); it throws in words with nothing changed.
- `sketchHelp.js` (no imports): `HELP_LINE_MAX` (110), `sketchHelp(state, { keys, commands })
→ { title, lines }`, `HELP_TOOLS`, `HELP_ACTIONS`, `COMMAND_WORDS`, `helpKeys({ tools,
keys, commands }) → [[key, words]]`, `HELP_SECTIONS`.
- `sketchTools.js`: `SKETCH_TOOLS` and `SKETCH_KEYS` gain `trim` T, `extend` E, `fillet` F,
  `chamfer` H, `offset` O (after Polygon, before Dimension); new `EDIT_TOOLS`, `editHover`,
  `editReadout`, `cutEntities`; `mergeShapes` gains `fillet` 5, `chamfer` 2, `offset` 5;
  state `offsetFrom`. `tool`, `escape`, `undo` / `redo`, `delete`, `select-all`,
  `select-ids`, `fix` and an action's start clear `offsetFrom`.
- `CadSketcher.jsx`: prop `onHandChange`. `CadViewport.jsx`: overlay key `cut`; the probe
  `cadSketchOverlay()` adds `cut` (its piece count), `cutColor` and `preview` (the preview
  lines' count).
- `vw400Samples.testkit.js`: `profileArea(profile)` (exact: 3-point arcs by their circles).

**Measured.** Node 22 inside vitest (`timeRuns`, medians; §8.7's budgets): a Trim hover on
the cover (pick + cut, 41 points along its pieces, not memoised) 0.56 ms (worst 2.4; 0.84 in a
four-file run; budget 3); a Fillet pick and its cut on the cover's corners 0.43 ms (worst 1.7;
budget 3); `checkDrawing` on the cover with §8.0's additions 62.3 ms (worst 64.3, alone; 65.1 in a four-file run) (budget 150; HD-2
measured 53 alone); the 360-hexagon drawing's `checkDrawing` 25.5 ms (budget 80; HD-3 19.8).
The fillet's tangency (the stored arc's radius to each end against its line's direction, R5
at 90° in all four quadrants, 30°, 150° and 114°) at worst 2.8e-7 rad, its radius within
5.0e-6 mm of the typed one. Browser (`verify-hand-drawing-hd4`, vite on 5180): the bar 53 px,
two rows at both sizes with the Edit group, the four shorter words and the group labels kept;
the bar alone 61 px of the view (0.081 at 1600 × 1000, 0.124 at 1366 × 768); with a 29 px row
(Rectangle, Fillet, Chamfer, Offset with its chosen entity named, Copy's) 95 px (0.124 /
0.191); Zero's 21 px (0.114 / 0.175); Slot, Polygon and Relief 31 px (0.127 / 0.195); a selection's row with the actions
and Mirror's 54 px (0.158 / 0.242); Pattern's Grid 56 px (0.160 / 0.246). All inside the sixth
(0.167) and the quarter (0.25). The Sketching panel with its sections closed does not scroll
at 1366 × 768 (Now holds up to four lines; with Keys open, 30 rows, it scrolls at 1366 × 768 as a panel
may).

**Judgment calls.**

1. `MEET_MM` = 1e-3 mm: a crossing landing within it of another piece's end is that end, bit
   for bit, and the ends lying within it of a piece are its cut points; so the join is exact
   whatever `chains`' own tolerance (see "Wrong in the spec" 1).
2. A piece's cut points come from the other entities only: a shape's own pieces meet at its
   corners, which are the piece's own ends. A cut point within 1e-6 mm (along the piece) of
   its own end is that end, no span; two within 1e-6 mm of each other are one, an end
   winning over a crossing. A crossing that lands on no end is rounded to 1e-6 mm, as every
   drawn point is.
3. The piece under the cursor is the nearest by its exact distance (arcs as arcs) within the
   snap tolerance of the raw cursor; a click takes what the hover took (one memoised answer
   for the preview, the red cut, the readout and the click).
4. A circle that becomes the arc that is left gets a new id (a shape giving way to its
   piece); a line or arc shortened keeps its id, its far part after a middle span is new and
   follows it. A kept arc's middle point is the middle of what is kept, on the circle of its
   three stored points.
5. `removed` is the geometry of the span and of any piece under 0.01 mm that went with it;
   Trim's dimension rule is `pruneDimensions` against each of them with the new list as what
   remains: a dimension end on the cut point (where the kept part still ends) stays.
6. The readouts: Trim "Trim 12.5 mm" · "click to trim · Esc ends the tool", the whole piece
   "Nothing crosses it: click removes the whole line" (arc, circle; a shape's side "the whole
   side") · "Esc ends the tool"; Extend "click to extend 8 mm" · "Esc ends the tool"; Fillet
   "Fillet R5" · "click to round · Esc ends the tool"; Chamfer "Chamfer 2" · "click to cut the
   corner · Esc ends the tool"; Offset "Offset 5 mm" · "click to choose it · Esc ends the
   tool", then "Offset 5 mm outward" (inward; a line's has no side word) · "click to place the
   copy · Esc lets go of it". The refusal stands alone. No "just cut" words after a click
   (Relief has them): the hover moves on to what is under the cursor now.
7. Extend takes the end nearer the raw cursor in a straight line; a landing that comes back
   to that very end (a neighbour joined there) is skipped; the ends of other pieces lying
   within 1e-3 mm of the ray (or the arc's circle) are landings too. An arc runs the way it
   sweeps from that end, short of its own other end; with nothing in that range: "This arc
   meets only its own other end: there is nothing to extend it to." The run is drawn in the
   preview colour; nothing is red.
8. A corner: the line ends within the tolerance of the raw cursor, the nearest point, every
   end on it within 1e-6 mm. Two lines folding back onto each other: "These lines lie on each
   other: no corner." (the spec had no words). Chamfer's "an arc ends there": "Chamfer cuts a
   corner between two straight lines."
9. The fillet fits when the cut-back is at most the shorter line plus 1e-6 mm; "at most R…" is
   floored to 0.01 (so the number shown fits). A line left under 0.01 mm goes and the arc or
   chamfer line ends on its far end, bit for bit. The join goes right after the first of its
   two lines in the list.
10. Over a rectangle's corner the Fillet row says "A rectangle’s own Corner radius rounds all
    four corners at once." (`editHover(state).pick.rect`).
11. Offset's side is the raw cursor's: a line by the side of its direction, an arc and a
    circle by the distance to the centre, a slot by the distance to its axis, a rectangle and
    a polygon inside or out; on it (1e-9): "Move off it, to the side the copy goes on." The
    copy keeps `construction`; a rectangle's copy is stored lower-left to upper-right. The
    refusals name the size: "this Ø8 circle", "this R10 arc", "this 22 × 5 slot", "this
    hexagon 10 across flats", "this 60 × 30 rectangle".
12. Offset's first step draws the entity under the cursor in the preview colour; once chosen
    it is drawn as the selection (the overlay is handed `[offsetFrom]` as its selected ids)
    and the row names it ("Rectangle 60 × 30 at (65, 60) chosen").
13. `delete` with nothing selected (a tool on) clears `offsetFrom`: §8.5 lists Delete among
    the ways out, though the Delete key does nothing while a tool is on (nothing can be
    selected then).
14. Construction armed marks only what the Draw tools add; Fillet's arc and Chamfer's line are
    construction when both their lines are.
15. Check: copies (the `duplicate` kind's later entities) now stay out of the crossing test on
    purpose: a doubled rectangle would touch itself at every corner.
16. A level dimension whose two ends differ in height, turned 30°, reads the full distance
    (the only kinds are level, plumb and aligned).
17. `sketchHelp(state, { keys, commands })` takes the key tables as an argument (and
    `helpKeys` its own): `sketchTools.js` reaches three through `marks.js`, so the pure module
    cannot import them; the workspace passes them. The sketcher reports `{ tool, op: { kind,
step }, selectedIds, selectedDimensionId, offsetFrom }` only when that changes, so the
    workspace does not render on pointer moves. The two idle states are "Nothing in hand" and
    "N selected" (and "A dimension selected"). The Now heading is "Now · Trim (T)"; the keys in
    the titles are read from the tables.
18. The bar keeps its group labels: with "Undo", "Snap", "Finish", "Cancel" shown (each
    `aria-label` the full name; the Snap label's title "Snap (mm)", the box's name unchanged)
    the Edit group fits and the bar stays two rows at both sizes.
19. The HINTS for the five tools are one line each (Offset two: choose, then side).
20. `profileArea` lives in the test kit, not the app: the keyhole's and the filleted
    rectangle's areas are measured on their arcs exactly.
21. A size committed in an Edit tool's row (Enter) gives the focus up, so T, E, F, H, O and
    Esc reach the sketcher at once (the Draw tools' rows give it to the HUD; these have none).

**Checked.** Unit suite before (the brief's baseline: 605 files, 7 333 tests; my own run before the
first edit read 7 329 passed, 1 skipped and three of the named load-flaky timing tests
failing: `kernel.sheetmetal`, `tightBends` kiosk, `cornerGapsSet`). After the last code
change: 610 files (609 run + 1 skipped), 7 393 tests (60 new): 7 391 passed, 1 skipped and
one failing under load, `sketchProfile.loops.test.js` "reads the cover's 2 210 entities
into its profile in under 40 ms" (41.4 ms; `sketchProfile.js` is not touched by this phase),
which passes rerun alone. An earlier sketch-only run failed `sketchPattern.test.js`'s
`entitiesToProfile` budget once (32.9 ms for 30) under load; it passes alone and in the full
run. `npm run lint`: 0 errors, 40 warnings (as before). `npm run build` passes. Browser (vite
on 5180, `--strictPort`): `verify-hand-drawing-hd4` and the nine older scripts
(`verify-hand-drawing-hd3`, `-hd2`, `-hd1`, `verify-bend-relief-br1`,
`verify-sketch-dimensions-sd1`, `verify-outline-edit-oe1`, `verify-sketch-shortcuts-sk1`,
`verify-start-sketch`, `verify-sketch-on-face`) pass after the last code change (a comment in
`sketchCorner.js`); the HD-4 screenshots (`artifacts/sketch-cad/hand-drawing-hd4`, eleven
states at both sizes) were looked at: the Edit group and the two rows, the fillet preview
(the arc blue, the two cut-back runs red), the keyhole's red span, the notch's red edge span
(at 1366 × 768 a one-pixel red run, checked by its pixels), the offset preview (the chosen
rectangle orange, the copy blue), the Now block for Trim, Copy and a selection, the Keys
list, Check clean with four cut-outs, the bent part.

**Existing tests and scripts changed.** Each because §8 changes what it pins:
`sketchKeys.test.js` reads T, E, F, H, O in `SKETCH_KEYS` and E as Extend (it read `e` as no
key; J now is none) (§8.1's keys); `sketchDimensionTool.test.js` finds Dimension after
`offset`, not `polygon` (§8.1: the Edit tools come after Polygon); `sketchActions.test.js`
"keeps the options …" reads `fillet: 5, chamfer: 2, offset: 5` in `mergeShapes()` (§8.1's
sizes kept in `shapes`); `sketchCheck.test.js` "finds a cut-out crossing the outline …" read
"touching is not crossing" as no problem at all, and now reads the two "touches" rows
(§8.0 item 2); `CadSketcher.dom.test.jsx` "has Redo by its button …" reads the groups Draw,
Edit, Mark, History (§8.6), and "moves the zero …" reads the bar's last buttons by their names
("Finish sketch", "Cancel sketch") and their words "Finish", "Cancel" (§8.6);
`CadWorkspace.relief.dom.test.jsx` "cuts a relief into a drawn outline …" read the old Relief
paragraph and now reads the Now block ("Now · Relief (B)", "Move to an inside corner and
click") (§8.0 item 3). No pure-module import list was widened (the four new modules have
their own, in `sketchTrim.test.js`). Script: `verify-hand-drawing-hd2.mjs` read the bar's
buttons after Redo by their words ("Finish sketch", "Cancel sketch") and now reads their
names (`aria-label`, else the words), as the DOM case does (§8.6).

**Wrong in the spec, or done differently.**

1. §8.1 calls 1e-3 mm "the distance `sketchProfile.js` `chains` joins at": `chains` joins ends
   within 1e-6 mm (`samePoint`); 1e-3 mm is the size of its grid's cells. `MEET_MM` is 1e-3 as
   specced; because a landing is the end itself, the joins are exact either way.
2. §8.9 "tangent to 1e-9 in direction": an arc stored as three points rounded to 1e-6 mm
   cannot be; measured 2.8e-7 rad at worst, and the test asserts 1e-6. The radius is within
   1e-5 as specced (5e-6 measured).
3. §8.3's example "at most R5.2": the number shown is floored to 0.01 so that typing it fits
   (6 mm at 60° reads "at most R3.46"; 6 mm at 90° "at most R6").
4. §8.0 item 2 changes an HD-2 assertion ("touching is not crossing"): listed above.
5. The keyhole's "6 wide slot from its centre" is drawn as a Slot whose first click is one
   end, at the circle's centre (overall 30, down): its near round end lies inside the circle
   and is one of the four trims.

**Not verified.** - The keys T, E, F, H, O from an empty HUD box: they go through the same `sketchKey` path as
every tool's key, but no test presses them there.

- Extend and Chamfer through the DOM pointer sequence (the DOM test drives Trim, Fillet's
  hover and Offset; the browser script clicks all five).
- `fix` (a Check row's fix) clearing `offsetFrom`: in the reducer, untested.
- Trimming construction lines in the browser, and Trim / Extend against the model's edges
  (they take no part by construction: only the drawing's entities are read).
- Frame times in the browser while hovering the Edit tools on a large drawing (only the node
  budgets of §8.7 are measured).
- The Electron build and the 2D drafting studio (untouched).
