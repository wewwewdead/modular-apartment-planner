# Phase H — Direct placement for solid operations

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-10-30 by Fable after reading the
code; built by Opus; audited by Fable against this document.

## 1. The problem, in the user's words

> If I use Sweep, I can't move the sweep on the object. I just need to manually
> adjust the X and Y coordinates on the Properties tab to be able to move it.
> That's tedious and awful. I want to select a part/object, click the tool,
> decide where to place it with the mouse, then resize it (in the Properties
> tab or directly). Placing must be done with the mouse, not with X/Y fields.

What the code does today (verified):

- `CadWorkspace.jsx` `addFeature(type)` → `beginOperation(type)` →
  `operations.js` `createOperationDraft(...)`. For Extrude it invents a
  rectangle on the **XY plane at the centre-top of the selected part's bounding
  box** (`[center[0], center[1], box[1][2]]`); Revolve a 10×40 rectangle on XZ at
  the origin; Sweep a straight 100 mm path on XY at the origin plus a Ø10 circle;
  Loft two circles at z = 0 and z = 100. None of this looks at the mouse.
- The only way to move any of these is `OperationPanel.jsx` → "Sketch plane"
  select + "origin (mm)" `VectorFields`, and for the sweep path the "Path end"
  fields. Booleans have a `position` JSON editor. Fillet/Chamfer/Shell have a
  plane/offset/expectedCount reference. Mirror/Trim have plane + origin fields.
- The viewport already knows how to do the right thing elsewhere: **Sketch on
  face** and **Mate** click a flat face (`pickedFace(hit)` in `CadViewport.jsx`
  ~1630 → `{instanceId, partId, point, normal, planar, frame, outline}`),
  **Place holes** clicks a face of the selected part with mark snapping,
  **Measure** snaps to corners/midpoints/edges/faces/marks
  (`marks.js` `measureCandidates`), and the move/rotate gizmo has a live HUD with
  typed values (`gizmoHud.js`, Phase E) and box snapping (`boxSnap.js`).
- Phase A's "Sketch on face → Extrude / Cut" (`sketchOperations.js`,
  `SketchPanels.jsx` `SketchOperationPanel`) is already the modern flow for a
  drawn profile, but its distance is a field only; there is no handle.

So the fix is not a new concept: it is giving every guided operation the same
cursor-first start that Sketch-on-face, Place holes and Measure already have,
plus one draggable handle for the dimension that matters.

## 2. What the good tools do (research summary → principles)

Fusion 360, Onshape, Shapr3D and SketchUp agree on the same loop for
extrude-like features:

1. **Start in the viewport.** Pick the tool, then the _first_ thing you do is
   point at geometry. Hovering shows what will happen; clicking commits the
   position. The dialog opens beside you, it is never the first stop.
2. **One manipulator for the one dimension that matters.** An arrow at the
   profile sets the extrude distance; you drag it or type a number while
   dragging. (Fusion: blue arrow + inline dimension; Onshape: arrow + flip;
   Shapr3D: push/pull directly on the face; SketchUp: push/pull then type.)
3. **The drag direction decides the operation.** Fusion switches Join ↔ Cut
   when the arrow crosses into the body; the preview turns red for a cut.
4. **Live preview, always.** The solid follows the handle; a kernel failure is
   reported but never blocks moving the handle.
5. **Exact values live in the panel, as the second step.** Width/height/
   radius/distance fields remain, prefilled from what the mouse did, and
   accept parameters (`=width`).
6. **Snap to meaningful geometry, with visible feedback.** Face centre,
   corners, edge midpoints, existing marks; the snap kind is named by the
   cursor.
7. **Esc walks back one step; Enter commits.** A hint in the viewport always
   says what the next click will do.

Principles for this app: keep the existing idioms (viewport hint bar,
`.cad-gizmo-hud`, orange/blue/purple snap colours, "Apply … / Cancel
operation" buttons, `perform()` error reporting), change no stored schema, and
make the panel the _second_ way to do everything the mouse can do.

## 3. The interaction model

Every guided operation now runs in three stages:

| Stage     | Where            | What the user does                                                                                                                              | Exit                                 |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Place** | viewport         | Points at a face/edge/point; a ghost of the profile or plane follows the cursor; click fixes it                                                 | click → Shape; Esc → cancel          |
| **Shape** | viewport + panel | Drags the handle(s) (distance arrow, slide square, radius, plane arrow); types a value during a drag; edits fields in the panel; can "Re-place" | Apply / Enter → commit; Esc → cancel |
| **Apply** | panel            | As today: `applyOperation` commits the draft model                                                                                              | —                                    |

One shared engine drives all tools (`placement.js`-style pure module + a
viewport layer + a workspace state slice); the per-tool differences are the
ghost shape, which handles exist and how a click maps to feature/sketch fields.

### 3.1 Starting a tool

`addFeature(type)` for any `GUIDED_OPERATIONS` entry:

- If a **sketch is selected in the tree** (`sketchId`) and the tool is a
  profile operation, keep today's behaviour (use that sketch) but open directly
  in **Shape** stage with the handle(s) shown.
- Otherwise open in **Place** stage. A part selection is _not_ required for
  profile operations (today it is not either); it _is_ required for
  booleans/fillet/chamfer/shell/mirror/trim/pattern/transform (today's
  "Select a part to modify first." stays).
- "Edit … with preview" on an existing feature opens in **Shape** stage with
  the handles on the existing geometry (this is how the user resizes later).
- The operation draft (`operationDraft`) gains a draft-only `placement`
  record (never persisted): `{ stage: 'place'|'shape', tool, hover, picked,
inferOperation: true, ... }`. Nothing in `model` changes shape.
- **Isolation**: `beginOperation` currently calls `setIsolated(true)`. During
  Place the user must be able to click _any_ part, so isolate only after the
  target is known (Shape stage), and never hide the clicked part. Restore the
  previous isolation on cancel/apply as today.

### 3.2 Place stage: what the cursor does

- Raycast the displayed meshes (as `pointerUp` in `CadViewport.jsx` does
  today). Snap the hit through `measureCandidates` (8 px, same occlusion rule)
  extended with one new candidate kind **`'face centre'`** (centroid of the
  picked face's outline polygon, priority between `midpoint` and `mark`). The
  face under the cursor (not the snapped point's face) supplies the plane.
- Hover feedback at frame rate (no React render per move, like the gizmo
  HUD): the **ghost** drawn in a new overlay layer (`placementLayer`, sibling
  of `measureLayer`/`rotateLayer`, `depthTest:false`), the snapped point marker
  (same marker as Measure) and the snap kind + coordinates in a
  `.cad-gizmo-hud`-style box by the cursor ("face centre · Part 2 top").
- The viewport hint bar (`.cad-viewport-hint`) names the stage:
  "Extrude: click a flat face to place the profile · corners, midpoints, face
  centres and marks snap · click empty space for a new part on the ground ·
  Esc cancels".
- **Clicking empty space** (no mesh hit): intersect the view ray with the
  world XY plane (z = 0) → place there as a **new part** (profile operations
  only). This is also how the very first part of an empty model is placed.
- **Curved face**: refuse with the existing message style ("Pick a flat
  face…") via `perform()`; stay in Place.
- Orbit/pan/zoom keep working (as in Measure); clicks never change the
  selection while placing.

### 3.3 Frames and coordinates (the rule that keeps the kernel untouched)

- A placement produces a **world frame** `{origin, x, y, normal}` with
  `origin` = snapped point, `normal` = face normal (or +Z for the ground) and
  axes from `sketchPlane.js` `uprightAxes(normal)` — the same convention as
  Sketch on face, so profile `[u, v]` reads the same way everywhere.
- Existing-part target: the sketch is stored in **part coordinates**:
  `frameToSketchFields(unmapFrame(frame, placement))` where `placement` is the
  target instance's kernel placement from `runtime.snapshot` (exactly what
  `sketchOperationDraft` does for `target !== 'new'`). Named planes stay named
  (`plane: 'XY'`), anything else becomes `plane: 'custom'` + `normal` +
  `xDirection`, which `kernel.js` `sketch(id)` already builds.
- New-part target: part sketch on `XY` at `[0,0,0]`, instance pose =
  `frameToInstance(frame)` (Phase A rule) so the profile lands exactly where it
  was clicked and the part definition stays a clean board.
- Handles are drawn from the draft (frame + fields), **not** from the preview
  mesh, so they are stable while "Building preview…" and when the preview
  fails.
- Directions typed or dragged are converted with `mapPlacement`/`unmapPlacement`
  (`placement.js`) — never hand-rolled rotation math.

### 3.4 Shape stage: handles

All handles live in `placementLayer`, are picked with a generous invisible
picker (≥ 12 px on screen, like TransformControls' pickers), suspend
`OrbitControls` while dragging (`controls.enabled = false`, restore on up/Esc),
honour `moveSnap` (mm; 0 = free; Alt = free, as the gizmo does), show the
`.cad-gizmo-hud` readout by the cursor, accept **typed digits + Enter during a
drag** for an absolute value (reuse `gizmoHud.js` `typeKey`/`typedHtml`), and
**Esc during a drag cancels the drag** (value restored). A completed drag
updates the draft once (the kernel preview debounces at 50 ms through
`useCadModel`); the ghost follows the cursor every frame regardless.

| Handle                        | Looks like                                                                                        | Drives                                                                                 | Maths                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Distance arrow**            | line + cone from the profile centre along the frame normal, length = current value; label "18 mm" | extrude `length` (+ `reverse`, see 4.1); trim plane offset; shell thickness (optional) | closest point on the axis line to the pointer ray (pure function `axisDragValue(ray, origin, dir)`)                 |
| **Slide square**              | small square at the profile centre in the plane (like the gizmo's plane handle)                   | sketch `origin` within the plane (profile moves on the face)                           | ray ∩ plane, snapped to candidates projected into the plane + grid                                                  |
| **Radius grip**               | dot on the circle/rectangle outline                                                               | profile `radius` (circle) or `width`/`height` (rectangle corner grip)                  | ray ∩ plane, distance/offsets from the centre                                                                       |
| **Plane arrow** (trim/mirror) | arrow on the plane's centre along its normal                                                      | trim `origin` along `normal`; mirror plane offset                                      | as the distance arrow                                                                                               |
| **Tool gizmo** (booleans)     | the normal move/rotate gizmo attached to the tool ghost                                           | `position` / `rotation` of the tool part                                               | TransformControls as for parts; world delta → target-part coordinates with `unmapPlacement(delta, placement, true)` |

Colours: the arrow uses the sketch "preview" blue `#2f9be6`; a cut preview
turns the arrow and ghost **red** (`#d2403c`); snapped states reuse the existing
flush orange / mark purple.

## 4. Per-tool behaviour

### 4.1 Extrude (highest priority — the user's main case)

Place: click a flat face (or empty ground). Ghost = rectangle, default
`min(40, faceSpan/2)` square, centred on the snapped point, drawn in the face
plane; on a face the ghost is clipped visually to nothing (just the outline).

Target rule, one sentence: **the part you click is the part you shape.** A face
of part A → feature added to A's definition (`operation:'add'`), regardless of
what was selected before; empty ground → new part named by
`nextPartName(model)`. (Shaping the definition means every instance of A
changes — say so in the panel, as `SketchOperationPanel` already does.)

Shape: distance arrow + slide square + rectangle corner grip.

- Drag **outward** (along the face normal): `reverse:false`, `operation:'add'`.
- Drag **into the material** (against the normal) while the target is an
  existing part and the user has not touched the Operation select in this
  draft: `reverse:true`, `operation:'cut'`, ghost/arrow red, badge "Cut
  preview — Apply to save". Dragging back out returns to add. Picking any
  Operation in the panel sets `inferOperation:false` for this draft. New-part
  target: negative drag is just `reverse:true` (nothing to cut).
- While cutting, dragging past the part's far side (the part's extent along the
  normal from the face, from `getInstanceBounds`/snapshot bounds) sets
  `throughAll:true` and the HUD reads "Through all"; dragging back clears it.
- Minimum length 0.1 mm (the kernel rejects 0); the HUD shows the clamped
  value.
- Typed `=param` values are entered in the panel field, numbers in the HUD.

Apply: unchanged (`applyOperation`), then select the part and the new feature.

**The camera moves only when the user asks** (Fit, the Standard view list,
leaving a sketch, loading an example or a preset build, opening another
document). Apply never refits; neither does creating a part with **Board /
plate** or **Tube / member** — the new part lands on the ground under the
centre of the current view instead (`CadViewport` `viewDropPoint()`, used
by `addPart`). The one-time first-geometry fit belongs to a model opened
with parts; on a model that mounts empty it is spent at once, so neither an
operation preview nor the first part added in the session moves the camera.
The **Phase A sketch flow** (`SketchOperationPanel`) gets the same distance
arrow and the same drag-direction inference (its Operation select is
Extrude/Cut) — one handle implementation, two panels.

"Edit extrude with preview" on an existing extrude: arrow at the stored
sketch's frame (`sketchWorldFrame`), slide square moves the sketch origin by
adding the modified sketch to `draft.sketches` (which `operationModel` already
overlays by id) unless the sketch is consumed by another feature (then the
square is hidden with a hint).

### 4.2 Sweep

A sweep needs a path and a cross section. The section is always centred on the
path by the kernel (`sweepSketch`), so **placing a sweep means drawing its
path in 3D**; the section needs only a size.

Place (path): hint "Sweep: click where the path starts · then click each
corner · double-click, Enter or Finish path ends it". The first click fixes the
start **and the path plane**: normal = the normal of the face under the cursor
(ground → +Z), origin = snapped point, axes = `uprightAxes`. Later clicks are
projected onto that plane (ray ∩ plane), snapped to the sketcher's targets
(`sketchSnap.js` `snapPoint`: 3D candidates projected into the plane, grid =
`moveSnap`, **Shift = ortho** like the sketcher). A rubber band shows the next
segment with its length in the HUD; the ghost shows the swept tube outline at
the current radius along the placed segments. At least one segment; Esc removes
the last point, Esc with no points cancels the operation.

The path sketch: `profile: { type:'path', start, segments:[{type:'line',end}…],
closed:false }` with plane fields from `frameToSketchFields` (part coordinates
for an existing target, XY-at-origin + instance pose for a new part, as 3.3).

**Bend radius** (panel field, default = 2 × section radius, 0 = sharp): corners
become tangent arcs — trim both adjacent segments by `r / tan(θ/2)` and insert
`{type:'arc', mid, end}` (`threePointsArcTo`); refuse (error text, not a crash)
when a segment is too short for the radius. This is what makes a tube sweep
actually succeed: sharp 90° corners self-intersect for any real section.

Shape: **radius grip** at the path start (drag outward = section radius, HUD
"Ø 10 mm"); panel: section type (circle/rectangle), radius or width/height,
wall thickness optional (a hollow section = `profile.holes` circle/rectangle as
`memberEndSketch` already builds), bend radius, operation (add/cut), "Re-place
path". Target = the part under the first click (add) or new part on ground.

### 4.3 Revolve

Place: click a flat face → ghost rectangle (10 × 40 default) at the snapped
point, placed as for Extrude. **Default axis = the outline edge of the clicked
face nearest to the click**, so "click near an edge of a plate" revolves around
that edge (the common bracket/lip case). The axis is drawn as a dashed line
with a small "axis" label; a second optional stage **"click an edge to change
the axis"** (edge candidates from `measureCandidates`, must lie in the profile
plane within 0.05 mm, else the hint says "Edge must lie in the profile plane").
Stored as `axis` (direction) + `origin` (point) in part coordinates, as the
kernel expects (`closedSketch(...).revolve(v(f.axis), {origin, angle})`).

Shape: slide square + rectangle grips; `angle` via panel field and typed HUD
value during a square drag is **not** required — a dial is a stretch goal; the
field is fine for v1.

### 4.4 Loft

Place: click a face → section 1 (circle r = 20) at the point; hint "click
another face for the next section · Enter finishes (2 or more)". Each click adds
a section on that face's plane at that point (all in the target part's
coordinates, target = part of the first click). Sections keep click order; the
existing "Add section"/order controls in `CadEditors.jsx` remain for reorder.
Shape: panel sizes; radius grip on the last-placed section is a nice-to-have.

### 4.5 Union / Subtract / Intersect

The tool part is drawn as a translucent ghost (its displayed mesh cloned with a
0.35-opacity material, `depthTest` on) at `feature.position/rotation` **in the
target part's frame**; the normal move/rotate gizmo is attached to it (M/R keys
as for parts). Default `position` = the target's centre (so the volumes
overlap and the preview is non-empty). Dragging converts the world delta into
target-part coordinates. Box snap against the target's faces applies. The
`position`/`rotation` JSON editor stays under "Exact placement".

### 4.6 Fillet / Chamfer / Shell

Place = **pick in the viewport**: hovering a flat face of the selected part
highlights it (outline from `pickedFace`); clicking it selects the reference
whose plane contains that face: the kernel's `references` list is the six
bounding planes `{plane:'XY'|'XZ'|'YZ', offset, edges, faces, label}`; match by
the clicked point's part-local coordinate on the plane's axis (XY→z, XZ→y,
YZ→x) within 0.05 mm **and** the face normal parallel to that axis. For
fillet/chamfer the result is "all edges of that face" (what `inPlane` selects);
for shell it is "remove that face". A face that matches no option → hint "This
face is not one of the part's six boundary planes; choose a reference below".
Multiple faces: v1 = single pick replaces the previous (the stored schema has
one reference). Radius/distance/thickness: panel field; dragging a distance
arrow from the face is a stretch goal.

### 4.7 Mirror and Trim

Place: click a flat face of the selected part → the plane. Mirror stores a
named plane only (`shape.mirror(f.plane, origin)`), so a face whose normal is
not an axis → error "Mirror needs a face square to X, Y or Z". The plane ghost
is a translucent square filling the part's extent; the **plane arrow** moves
it along its normal (trim `origin`; for mirror the origin on the plane's axis).
Trim: default `side` keeps the half containing the part's centre; a "Keep
other side" toggle (and the panel's Retain side select) flips it; a hint warns
when the plane misses the part. Mirror: default origin = clicked face.

### 4.8 Pattern / Transform (reduced scope)

Pattern: `step` gets a distance arrow along the current step direction (drag =
spacing), count stays a field; circular pattern unchanged. Transform: the
tool gizmo of 4.5 attached to the part's own ghost. If time is short, these two
may ship as fields-only **but the report must say so** (see §11).

Transform: built in Phase J, see sketch-studio-cut-placement.md.

## 5. Snapping, feedback and hints (shared)

- Candidate kinds and priority: vertex > midpoint (segments ≥ 24 px on screen)
  > **face centre** > mark > edge > face, 8 px, occlusion rule from `marks.js`.
  > Hidden marks (Show marks off) never snap. The cursor HUD names the kind.
- Grid snapping on plane drags uses `moveSnap` (mm) — the same "Snap" field
  as Move part; 0 or Alt = free.
- Ghost geometry is lines only (`lineObject`-style, `depthTest:false`), rebuilt
  per move without React renders; dispose geometries/materials when cleared
  (`clearLayer`).
- Hint bar text per stage per tool; the panel `role="status"` keeps
  "Building preview… / Preview ready / Preview failed".
- The preview badge reads "Operation preview — Apply to save" or "Cut preview —
  Apply to save".

## 6. Keyboard and cancel rules

- **Esc**: during a handle drag → cancel the drag; in Sweep path drawing with
  points → remove the last point; otherwise → **Cancel operation** (restores
  previous selection and isolation, as `cancelOperation` does). Register it
  like the existing `pickingFace`/`measureSession` effects in `CadWorkspace.jsx`
  (~1141–1167), skipping editable targets (`editableTarget`).
- **Enter** (focus not in an input, no drag): Apply when the Apply button is
  enabled; in Sweep path drawing: finish the path (≥ 1 segment).
- **Digits/`.`/`-` + Enter during a drag**: absolute value (gizmo HUD rule).
- **Shift** during a plane drag/path click: ortho lock (sketcher rule).
- **Alt**: free (no snap), as for the gizmo.
- **D / R / M / [ ]**: stay blocked while a draft is open (`busy` already
  includes `operationDraft` in `placementKeyAction`) except R/M for the boolean
  tool gizmo (4.5).

## 7. Panel changes (`OperationPanel.jsx`, `SketchOperationPanel`)

Keep Apply/Cancel + status at the top. Then, in order:

1. **Placement line** — read-only, e.g. "On Part 2 · top face · profile 40 × 40
   mm at (120, 60) · along +Z" with a **Re-place** button (back to Place stage,
   handles hidden) — for sweep "Path: 3 segments, 240 mm · on Part 1 front face
   · Redraw path".
2. **Primary values** — Length (mm) / Radius / Angle / Thickness / Count /
   Bend radius, as `ValueField`s (expressions allowed) prefilled by the mouse.
3. Operation select (with "(auto)" suffix on the label while inference is
   active), Flip direction, Through all (cut), Part name (new part), Tool part
   (booleans), Retain side (trim).
4. `<details>` **Exact placement (mm)** — collapsed — the current plane select,
   origin `VectorFields`, path end fields, section orientation, position JSON.
5. `<details>` **Advanced profile** — unchanged `JsonEditor`.

Labels used by tests/scripts: "Length (mm)", "Distance (mm)" (sketch flow),
"Radius (mm)", "Bend radius (mm)", "Re-place", "Finish path", buttons
"Apply extrude" etc. unchanged.

## 8. Data rules

- **No `CAD_VERSION` bump.** Nothing new is persisted: the draft-only
  `placement` record never reaches `model`. Sketches use existing fields
  (`plane`, `origin`, `normal`, `xDirection`, `profile`, optional `support`).
  The kernel (`kernel.js`) is not modified except, if needed, better error text.
- Sketch frames for existing-part targets are in part coordinates; for new
  parts XY-at-origin with the instance posed by `frameToInstance`.
- Tidy numbers before storing (`tidyPoint`, 1e-6) so the JSON stays readable.
- Parameters: a placed value is a number; the user may replace it with an
  expression in the panel — the handle then shows the resolved value and a
  drag replaces the expression with a number (say so in the HUD, like the
  "adds an explicit offset" rule for moves).

## 9. Architecture recommendation (Opus may deviate; flag it)

- `placementTool.js` (pure): stage machine + per-tool rules — ghost outline
  for a tool/frame/fields, handle set, click → draft patch (`placeExtrude`,
  `placeSweepPoint`, `placeRevolveAxis`, `pickReferenceFace`, …), drag →
  patch (`dragDistance`, `dragSlide`, `dragRadius`), operation inference,
  through-all detection, sweep bend arcs (`polylineWithBends`), face centre
  candidate. 100 % unit-testable without three.js.
- `placementHandles.js` (pure maths on arrays/`three` vectors): `axisDragValue`,
  `planeDragPoint`, handle picker geometry sizes in px → mm via `mmPerPixelAt`.
- `CadViewport.jsx`: new props `placement` (the draft record + frame + fields),
  `onPlacementHover`? — **no**: hover stays inside the viewport (ref-held
  callbacks like `holeCallbacks`), only clicks and completed drags call back:
  `onPlace(info)`, `onPlacementDrag(patch)`, `onPlacementCancelDrag`. A
  `placementLayer` next to `measureLayer`; `element.cadPlacement()` for scripts
  (like `cadGizmo()`/`cadMarks()`).
- `CadWorkspace.jsx`: `operationDraft.placement`; `beginOperation` opens in
  the right stage; Esc/Enter effect; isolation timing (3.1); `OperationPanel`
  and `SketchOperationPanel` get the placement line + Re-place.
- `operations.js`: `createOperationDraft` accepts `placement` and builds the
  sketches from a world frame (3.3) instead of the bounding-box defaults; the
  defaults remain for the "sketch selected in the tree" path.
- Keep the file-size discipline of earlier phases: new logic in new modules,
  `CadWorkspace.jsx`/`CadViewport.jsx` grow by wiring only.

## 10. Edge cases to handle (and test)

- Model has no parts: Extrude/Sweep/Revolve/Loft place on the ground → new part.
- Clicking a face of an attached (non-weld connection) part: allowed — the
  feature goes into the definition, not the placement.
- Rotated/turned parts: frames unmap through the kernel placement, so a profile
  placed on a 37°-turned part's face extrudes square to that face (test with a
  rotated instance).
- Underside faces: `uprightAxes` gives x = −X as for Sketch on face; the ghost
  and handles must still read correctly (test a −Z face).
- Preview failure (e.g. sweep self-intersection): handles keep working, status
  shows the kernel message, Apply disabled.
- The model changes under an open draft (`draftStale`): handles hide, status
  says reopen (today's rule).
- Esc during a handle drag restores the previous value and re-enables orbit.
- Exploded view / section / Measure / holes / sketch are mutually exclusive
  with placement, as `beginOperation` already resets them.
- Perspective camera: all handle maths must work for both camera types
  (`mmPerPixelAt` divides by `camera.zoom` for orthographic — Phase G lesson).

## 11. Delivery, tests and verification

Order of work (ship in this order; report per item: **done / partial / not
done**, never silently drop one):

1. Engine + Extrude (Place, arrow, slide, grips, inference, through-all, panel,
   sketch-flow arrow, edit-with-preview handles).
2. Sweep (path drawing, bend arcs, radius grip).
3. Revolve + Loft placement (axis pick for revolve).
4. Boolean tool gizmo.
5. Fillet/Chamfer/Shell face pick; Mirror/Trim face pick + plane arrow.
6. Pattern step arrow; Transform gizmo (may be fields-only, see 4.8).

Tests (Vitest, run from the **repo root**, never from inside `cad/`):

- Unit: `placementTool.test.js`, `placementHandles.test.js` — frames for
  faces/ground/rotated parts, part-coordinate conversion round trips,
  inference table (outward/inward × existing/new × manual override),
  through-all threshold, sweep bend arcs (tangency: arc end tangents equal the
  trimmed segment directions; refusal when too short), face-centre candidate,
  reference matching for the six planes, axis/plane drag maths for ortho and
  perspective rays.
- DOM: `CadViewport.place.dom.test.jsx` following
  `CadViewport.measure.dom.test.jsx` (mocked WebGLRenderer/OrbitControls/
  TransformControls): hover ghost appears, click calls `onPlace` with a frame,
  arrow drag calls `onPlacementDrag` with a snapped length and shows the HUD,
  typed value during drag, Esc cancels the drag. `CadWorkspace.*.dom.test.jsx`:
  Esc rules, isolation timing, Re-place, panel labels.
- Existing suites must stay green: baseline today is **30 files / 265 tests**
  in `src/features/sketchstudio/cad` and the full repo per `npm test`.
- Browser: `scripts/verify-direct-placement.mjs` (Playwright, Chrome, against
  `CAD_VERIFY_URL=http://localhost:5180/sketch`, reuse `scripts/sketch-cad-steps.mjs`):
  add a board → Extrude → click its top face near a corner (assert snap kind
  via `element.cadPlacement()`) → drag the arrow out 30 mm (paced drag) → Apply
  → saved model has an extrude feature on that part whose sketch frame is on the
  top face; then Extrude again dragging **into** the board → the saved feature
  is `operation:'cut'`; Sweep: three clicks on the front face + Finish path →
  radius grip drag → Apply → part gains a sweep with an arc segment per corner;
  Subtract: tool gizmo drag changes `position`. Screenshots to
  `artifacts/sketch-cad/`.
- Docs: update `docs/sketch-studio-cad.md` "Guided solid operations" (replace
  the paragraph about setup panels with the Place → Shape → Apply flow, the
  handle, the drag-direction rule, Esc/Enter, bend radius) and the Verification
  list. Keep the file's prose style (plain, no marketing).

Process rules (from earlier phases):

- Do **not** commit; the tree already holds uncommitted Phase G work the user
  will commit. Do not touch files outside `src/features/sketchstudio/cad/`,
  `scripts/`, `docs/` unless wiring requires it; say so if you do.
- Match each existing file's line endings when editing (several cad files are
  CRLF); new files LF.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  If you start Vite for the browser script, stop it and confirm nothing
  listens on 5180 afterwards.
- Flag every judgment call you made beyond this spec in the final report,
  with file:line anchors for each claim so the audit can verify them.

## 12. Acceptance checklist (used for the audit)

- [ ] Solid → Extrude with nothing selected: hovering a face shows a ghost
      square + snap HUD; clicking places; an arrow appears; dragging changes the
      length live; typing `25` Enter during the drag sets 25 mm; Apply adds an
      extrude to the clicked part whose sketch lies on that face (part coords).
- [ ] Dragging into the part turns the preview red and the applied feature is
      `operation:'cut', reverse:true`; choosing Operation manually stops the
      inference.
- [ ] Clicking empty ground with an empty model creates a new part at the click.
- [ ] A face of a part rotated 37° about Z: the extrusion is square to the face.
- [ ] Sketch-on-face → Extrude shows the same arrow.
- [ ] Edit extrude with preview shows the arrow on the existing feature; drag + Apply changes `length`.
- [ ] Sweep: path by clicks (Shift ortho), bend radius arcs, radius grip, Apply
      builds a tube on the clicked part.
- [ ] Revolve: default axis = nearest face edge; edge click changes it.
- [ ] Loft: two clicks on two faces → two sections → Apply builds.
- [ ] Subtract: tool ghost + gizmo drag updates `position` in target coords.
- [ ] Fillet: clicking the top face picks the "Top (XY)" reference.
- [ ] Trim: face click + plane arrow; Mirror: face click.
- [ ] Esc rules of §6; orbit re-enabled after any drag/cancel.
- [ ] No `CAD_VERSION` change; old saves load; `kernel.js` unchanged (or only
      error text).
- [ ] Lint clean; all tests green; browser script passes; docs updated.

## 13. Out of scope (do not build unasked)

Sketch constraints (removed at the user's request), true sheet-metal
(flanges/K-factor/flat pattern), multi-reference fillets, non-planar sweep
paths (the kernel path is a planar sketch), face-to-face measure, drag-editing
of applied features without the preview (true push/pull on arbitrary faces),
pattern previews beyond the step arrow.
