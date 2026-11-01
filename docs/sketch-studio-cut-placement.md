# Phase J — Direct placement for cuts, transforms and hardware

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-10-31 by Fable after reading the
code; built by Opus; audited by Fable against this document. It extends Phase H
(`docs/sketch-studio-direct-placement.md`), whose engine, rules and vocabulary
apply unchanged unless this document says otherwise.

## 1. The problem, in the user's words

> Why are other tools like add hole or pocket still using X and Y coordinates
> when placing? I already said: apply it to all tools, like the extrude type,
> where users can place where they want to put it.

Phase H gave the guided solid operations (Extrude, Sweep, Revolve, Loft,
booleans, fillet/chamfer/shell, mirror/trim, pattern) a cursor-first
Place → Shape → Apply flow. Four commands were left out and still start from
typed coordinates. Verified against the code:

| Command                                                | What happens today                                                                                                                                                                                                                                                                                                                                                        | Where                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solid → Hole**                                       | `addFeature('hole')` appends a feature at `placement:{type:'side', side:'top', u:50, v:50}` (or `member … along:50`) and the tree editor opens with the **Hole / pocket location** fieldset: _Cut placement_ select, _First/Second face axis (%)_ or _From minimum X/Y edge (mm)_, or _Cut start (part mm)_ + _Cut direction_ `VectorFields`. Nothing looks at the mouse. | `CadWorkspace.jsx` `addFeature` (~489–508) → `cutPlacement.js` `createCutFeature` (~148–165); `CadEditors.jsx` `CutFeatureForm` (~405–760, fieldset from ~585) |
| **Solid → Pocket**                                     | Same path, a 12 × 20 rectangle at the centre of the top side.                                                                                                                                                                                                                                                                                                             | same                                                                                                                                                           |
| **Solid → Transform**                                  | Phase H §4.8 allowed "fields-only"; it shipped that way: `startPlacement` returns `null` for `transform`, so the panel shows _Position (part mm)_ / _Rotation (degrees)_ `VectorFields` only.                                                                                                                                                                             | `placementTool.js` `startPlacement` (~372–401); `operations.js` `createOperationDraft` (~302)                                                                  |
| **Hardware library → Add hardware** (no hole attached) | `createHardware` poses the new instance at `[0,0,0]`; the panel says "Adds a movable part at the origin. Use Move part or exact Position fields to assemble it."                                                                                                                                                                                                          | `hardware.js` `createHardware` (~89–100); `HardwarePanel.jsx` (~104); `CadWorkspace.jsx` `onAdd` (~1989–2012)                                                  |

Two cursor tools already exist for holes and stay as they are: **Place holes**
(rapid repeated clicks with a preset template, `startHoleTool('place')`,
`placeHole` ~523–538) and **Move holes** (drag an orange centre, `moveHole`
~540–551). They prove the data model: a picked hole is stored as
`positionedCut(feature, position, direction)` → `{ placement: undefined,
position (part mm), direction (unit, into the material) }`
(`cutPlacement.js` ~141–144), which `resolveCutPlacement`'s coordinates branch
(~106–111) and the kernel (`kernel.js` ~277–319) already build. Phase J stores
exactly that, so nothing new is persisted.

Not in scope, and why (tell the user if they ask): **Board / plate** and
**Tube / member** land on the ground under the centre of the current view
without moving the camera (a board centred on that point, a tube's axis
through it; see "Where a new Board or Tube lands" in `sketch-studio-cad.md`)
and the Move part gizmo already moves them with the mouse; **Place holes / Move holes** are already
cursor tools; the tree editor's location fieldset stays as the exact-value
path. If the user wants board/tube to be dropped with a click, that is a
separate phase.

## 2. Principles (Phase H §2 plus the cut-specific ones)

1. Start in the viewport; the panel is the second stop.
2. One manipulator per dimension that matters: for a cut that is the **depth
   arrow into the material**, the **slide square** on the face and a **size
   grip** (radius or corner).
3. A cut is always a cut: the ghost and arrow are **red** (`PLACEMENT_RED`),
   there is no add/cut inference and no Operation select.
4. **Through all is a position of the arrow**, not only a checkbox: dragging
   the depth past the far face of the part sets `throughAll:true` and the HUD
   reads "Through all"; dragging back inside clears it.
5. Exact values stay in the panel, prefilled by the mouse, and the full
   existing location fieldset stays available under a collapsed
   **Exact placement (mm)** block — the user never loses a capability.
6. No `CAD_VERSION` bump; `kernel.js` untouched except error text. The
   draft-only `placement` record never reaches `model`.

## 3. The interaction model

Every command in §1 becomes a `GUIDED_OPERATIONS` member and runs the Phase H
stage machine. `addFeature(type)` → `beginOperation(type)` →
`createOperationDraft(...)` → `operationDraft.placement`.

| Tool                                | Opens in                                                        | Place click does                                                                                                                        | Shape handles                                                | Apply                                                                    |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Hole**                            | Place                                                           | flat face → `positionedCut` on **the part you click** (selection not required); curved face of a round member → member placement (§4.3) | slide, radius grip, depth arrow                              | `applyOperation` (unchanged)                                             |
| **Pocket**                          | Place                                                           | as Hole; rectangle oriented by the kernel's own rule (§4.2)                                                                             | slide, corner grip, depth arrow                              | unchanged                                                                |
| **Transform**                       | Shape (part selected)                                           | —                                                                                                                                       | the move/rotate **tool gizmo** on a ghost of the part itself | unchanged                                                                |
| **Hardware**                        | Place (from _Add hardware_ with attach off or no hole selected) | flat face or ground → new part posed by `frameToInstance` so its seating plane (part Z = 0) lies on the face                            | slide                                                        | commits the new part + instance, as `applyOperation` does for a new part |
| **Edit hole / pocket with preview** | Shape                                                           | —                                                                                                                                       | the same handles at the resolved cut                         | unchanged                                                                |

Isolation follows Phase H §3.1: never isolate during Place; isolate the host
once the target is known; restore on cancel/apply. Orbit, pan and zoom keep
working; a Place click never changes the selection by itself (the host is
selected when the stage leaves Place, as `changePlacement` does today,
`CadWorkspace.jsx` ~439–449).

### 3.1 Hole

Place: hint "Hole: click a flat face to drill there · corners, midpoints, face
centres, marks and existing hole centres snap · round tubes drill radially ·
Esc cancels". Hover ghost = red circle of the current diameter in the hovered
face's plane at the snapped point, plus the snap HUD ("face centre · Part 2
top"). Defaults from `createCutFeature(type, part, parameters)` (so a member
host still gets Ø `min(6, span/4)` and `depth = wall`): Hole starts
`throughAll:true`.

Click → Shape: feature = `positionedCut({...defaults}, position, direction)`
with `position = unmapPlacement(point, hostPlacement)`, `direction =
unmapPlacement(-normal, hostPlacement, true)`, both tidied (§5). Grid: the
click snaps to candidates first (vertex > midpoint > face centre > mark >
hole centre > edge > face, Phase H §5) and otherwise to the `moveSnap` grid in
the face plane (`gridPoint`), Alt = free. (`holeSnap`, the "Hole snap (mm)"
field, remains the rapid tool's setting; the guided tools share `moveSnap`
like every Phase H handle. Judgment call: one snap setting for all guided
tools.)

Shape: hint "Hole: drag the arrow for the depth (past the far face = through
all) · the square moves it on the face · the grip sets the diameter · type a
value + Enter while dragging · Enter applies · Esc cancels". HUD readouts:
"Ø 6 mm", "Depth 5 mm", "Through all".

Panel (§6): _Hole purpose_, _Thread size_ (the existing `holePreset`
controls), _Diameter (mm)_, _Cut extent_, _Depth (mm)_, then the collapsed
Exact placement block with the whole location fieldset.

"Apply and place another" — a second primary button beside Apply for Hole and
Pocket: commits the draft and reopens the same tool in Place with the same
size/depth/thread settings carried in the new placement record. Implement by
queuing a reopen that runs once `runtime.ready` is true again (the commit
triggers a rebuild; `beginOperation` throws while it is not ready). Nice to
have: **may be cut, but the report must say so.**

### 3.2 Pocket

As Hole with a rectangle (defaults `width: min(12, span/3)`, `height: 20`,
`depth: min(5, wall/2)`, blind). The corner grip drives width and height
(`gripValue` 'rect'). _Pocket profile → Existing closed sketch_ stays in the
panel: choosing it removes `shape`/`placement`-driven handles (the sketch
fixes the position; `view.shape = null`, `view.handles = []`) and the
placement line reads "Placed by sketch ‹name›"; choosing _Rectangle_ again
restores the handles at the last placed frame (keep `placement.frame` while in
sketch mode).

Orientation rule — the ghost must match what the kernel will cut. The kernel
builds the rectangle on `new cad.Plane(start, cut.widthDirection,
cut.direction)` (`kernel.js` ~303) where, for coordinates placement,
`widthDirection` comes from `resolveCutPlacement`'s else branch
(`cutPlacement.js` ~106–111: reference `[1,0,0]` when `|d.x| < 0.9` else
`[0,1,0]`, projected square to `direction`). **Extract that into an exported
pure helper `cutWidthDirection(direction)` in `cutPlacement.js`, use it in
`resolveCutPlacement` and in the ghost/handles**, so both agree by
construction. Width runs along `widthDirection`, height along
`direction × widthDirection` (replicad's plane y = normal × x). Test it (§10).

### 3.3 Transform

`startPlacement('transform')` → `{ stage:'shape', mode:'tool', self:true }`.
The viewport draws a translucent ghost of the **host part's own displayed
mesh** at `hostPlacement ∘ (feature.position, feature.rotation)` and attaches
the move/rotate gizmo to it exactly as the boolean tool ghost does
(`placementLayer` `toolDown/toolChange/toolUp`, M/R keys, box snap). Drags
patch `feature.position/rotation` through the existing `'tool'` handle path
(`applyPlacementDrag`, `toolPoseAfterMove/Turn` with `hostOperations`).
Placement line: "Drag the ghost in the viewport (M move, R rotate)". Fields
stay in the panel. A drag replaces an expression with a number (Phase H §8
rule, say so in the HUD). The preview shows the transformed solid at the same
pose as the ghost; that overlap is acceptable (ghost 0.35 opacity).
Judgment calls here are expected — flag them.

### 3.4 Hardware

In `HardwarePanel` _Add hardware_:

- attach checked **and** a hole selected → today's connection path, unchanged
  (`verify-hole-hardware.mjs` depends on it).
- otherwise → `beginOperation('hardware', null, { hardware: feature })` opens
  a draft whose `newPart`/`newInstance` come from `createHardware(feature)`
  (`newPart.features = []`, `draft.feature` = the hardware feature so
  `operationModel` appends it), `placement: { tool:'hardware', stage:'place',
mode:'placed' }`. Hint "Hardware: click a flat face to seat it there (bolts
  and studs point into the face) · click empty ground to stand it on the
  ground · Esc cancels". Hover ghost = circle of the head/body diameter
  (`hardwareDimensions`) in the face plane. Click → `newInstance =
{...newInstance, ...frameToInstance(placeFrame(point, normal))}` — the
  seating plane is part Z = 0 and bolts/studs point into −Z
  (`hardwareGeometry.js` ~17), so this seats them correctly on any face,
  including undersides and turned parts. Shape: slide square moves it on the
  face; sizes are the `HardwareFields` in the panel (`FeatureForm` already
  routes `type:'hardware'` there, `CadEditors.jsx` ~86). Apply = the new-part
  commit `applyOperation` already does (select the instance, no `setMoveMode`).
- Should: a **hole centre** snap candidate during Place (centres from the
  snapshot's `features[id].cut.position` of the hovered part, mapped to world,
  rank between mark and edge) and, when the click lands on one, create the
  concentric connection to that hole instead of a free pose (the same
  connection object `onAdd` builds today). **May be cut; report it.**
- `HardwarePanel` help text (~104) changes to describe the click.

### 3.5 Editing an existing hole or pocket

The tree editor's feature view (`CadWorkspace.jsx` ~2723–2760) offers
"Edit {type} with preview" for guided features and falls through to
`FeatureForm` for cuts. Add the button for `hole`/`pocket` (keep the inline
form and _Move hole on surface_ below it; they are tested). `beginOperation
(type, feature)` → `startPlacement` returns `{ stage:'shape', mode:'cut' }`;
the handles are drawn at the **resolved** cut — `ctx.snapshot.parts[].features
[id].cut` (`position`, `direction`, `widthDirection`, `depth`, `throughAll`)
when present, else `feature.position/direction` — so side- and member-placed
cuts get handles too. Any slide/grip/arrow drag stores `positionedCut`
coordinates (what _Move holes_ already does for such features). A feature with
`positionLocked` shows no slide square and the hint says why. A feature
followed by transform/mirror/pattern in the same part gets no handles (today's
_Move holes_ rule) and the hint says so.

## 4. Frames, coordinates and data

### 4.1 Coordinates cuts (flat faces)

- World frame from the click: `placeFrame(point, normal)` (uprightAxes), the
  face under the cursor supplies the plane, the snapped point the origin.
- Stored on the feature (part coordinates through the host's kernel
  placement, as `placeHole` does): `position = tidyPoint(unmapPlacement(point,
ops), 1e-4)`, `direction = tidyDirection(unmapPlacement(-normal, ops,
true))`, `placement: undefined`. Never touch `holeSpec`, `diameter`,
  `width/height`, `depth`, `throughAll` on a move.
- Depth of material under the face (part coords): `depthInto(hostLocalBounds,
positionLocal, outwardNormalLocal)` (`placementTool.js` ~173). The arrow's
  `value` is the depth; `throughAll = value ≥ depth − 0.01`; min depth
  `MIN_LENGTH` (0.1). Dragging the arrow "out of" the material clamps at the
  minimum (a cut has no outward direction). The through-all arrow is drawn to
  the far face.

### 4.2 Pocket rectangle

`cutWidthDirection(direction)` (§3.2) in part coords, mapped to world with
`mapPlacement(·, ops, true)` for the ghost and corner grip. The grip returns
`{width, height}` measured along those two axes (`gripValue` 'rect' with a
frame whose x = widthDirection, y = direction × widthDirection, normal =
−direction). Width/height are tidied to 1e-6 and clamped ≥ 0.1.

### 4.3 Round members (curved face → member placement)

A click on a **non-planar** face is accepted when the clicked part's first
enabled feature is a `member` with a pipe section (`section.diameter`) and no
later enabled `transform`/`mirror`/`pattern` exists (the `supported` rule of
`createCutFeature`). Otherwise refuse with `CURVED_FACE`-style text:
"Pick a flat face, or a round tube to drill radially."

Pure function `memberPlacementFromPoint(member, pointLocal, parameters)` in
`cutPlacement.js` (next to `resolveCutPlacement`, sharing an extracted
`memberFrame(member, parameters)` → `{ start, axis, rotation, metrics }` so
the inline rotation maths in `resolveCutPlacement` ~44–57 is not duplicated):

- `t = dot(pointLocal − start, axis)`; `distance = t − metrics.gapStart`;
  reject when outside `[−0.5, centerline + 0.5]` mm ("Click on the finished
  length of the member"), else clamp.
- Member-local radial vector: `r = unmap(pointLocal − start − t·axis,
rotation)`; `side` = the largest of `{ front: −r.y, rear: +r.y, left: −r.x,
right: +r.x }`; `offset = dot(r, CUT_SIDES[side].width)` so the kernel's
  `local = side.width·offset; local[axis] = sign·√(R² − offset²)` lands on the
  clicked point.
- Result: `placement: { type:'member', featureId: member.id, side, distance:
tidy(distance), offset: tidy(offset) }` (distance in mm, not percent),
  `position`/`direction` deleted.
- Ghost on hover/Shape: circle in the tangent plane at the resolved cut
  (`resolveCutPlacement` gives `position`, `direction`, `widthDirection`);
  depth arrow radial inward; through all = both walls as today. The slide
  square moves along the member (changes `distance`) and around it (changes
  `offset`, clamped inside the radius); it does **not** convert to
  coordinates on a round member.
- Test: for a Ø40 pipe along +Z and a surface point at a known angle, the
  function's placement fed back through `resolveCutPlacement` reproduces the
  point within 1e-6 mm with a radial inward direction; also for a member along
  +X and one with a 15° tilt.

### 4.4 Hardware

New part + instance from `createHardware`; `newInstance` pose =
`frameToInstance(frame)`; nothing stored on the hardware feature. A ground
click uses `GROUND_FRAME` at the ray ∩ z = 0 point.

### 4.5 Transform

`feature.position/rotation` in part coordinates, as the kernel's `transform
(shape, f.position, f.rotation)` expects (`kernel.js` ~373). Convert gizmo
deltas with `unmapPlacement(delta, hostPlacement, true)` for translation and
the Phase H `toolPoseAfterTurn` for rotation.

## 5. Handles (Phase H §3.4 rules apply: pickers ≥ 12 px, OrbitControls

suspended during a drag, `moveSnap`/Alt, typed digits + Enter, Esc cancels the
drag, one draft update per completed drag, ghost every frame)

| Handle                | Tool                   | Drives                                                                             | Maths                                                                           |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Depth arrow** (red) | hole, pocket           | `depth`, `throughAll`                                                              | `axisDragValue` along `−normal` from the cut centre; through-all threshold §4.1 |
| **Slide square**      | hole, pocket, hardware | `position` (coordinates) / `distance`+`offset` (member) / instance pose (hardware) | `planeDragPoint` in the face plane, candidates then `gridPoint(moveSnap)`       |
| **Radius grip**       | hole                   | `diameter` (= 2 r, tidied)                                                         | `gripValue` 'circle'                                                            |
| **Corner grip**       | pocket                 | `width`, `height`                                                                  | `gripValue` 'rect' in the §4.2 frame                                            |
| **Tool gizmo**        | transform              | `position`, `rotation`                                                             | Phase H §4.5 mechanism on the host's own ghost                                  |

HUD texts: "Ø 6 mm", "Depth 5 mm", "Through all", "12 × 20 mm", hardware
"Standoff M3 · top face".

## 6. Panel (`OperationPanel.jsx`)

Keep Apply/Cancel + status at the top (Apply reads "Apply hole", "Apply
pocket", "Apply transform", "Apply hardware" through the existing
`Apply {f.type}` template). Then:

1. **Placement line** (`.cad-placement-line`): hole/pocket "On Part 2 · top
   face · Ø 6 mm at (120, 60) · through all" / "… · 12 × 20 mm · depth 5 mm";
   member "On Square tube · right side · 85 mm from the start · offset 0";
   hardware "Standoff M3 on Part 2 · top face at (120, 60)"; with **Re-place**
   (and **Apply and place another** for hole/pocket if built).
2. **Primary values**: hole — _Hole purpose_, _Thread size_, _Diameter (mm)_,
   _Cut extent_, _Depth (mm)_; pocket — _Pocket profile_, _Pocket width
   (mm)_, _Pocket length (mm)_, _Cut extent_, _Depth (mm)_; hardware — the
   `HardwareFields`; transform — the existing fields.
3. `<details>` **Exact placement (mm)** — collapsed — the entire existing
   **Hole / pocket location** fieldset (_Cut placement_, side, _Locate by_,
   u/v, member along/offset, _Cut start (part mm)_, _Cut direction_). Editing
   these while in Shape updates the handles from the preview's resolved cut.

Do this by splitting `CutFeatureForm` into two exported pieces,
`CutSizeFields` and `CutLocationFields`, and keeping `CutFeatureForm` (the
tree editor) as their composition — **its DOM, order and labels do not
change**: _Hole purpose_, _Thread size_, _Lock hole position_, _Move hole on
surface_, _Pocket profile_, _Diameter (mm)_, _Pocket width (mm)_, _Pocket
length (mm)_, _Cut extent_, _Depth (mm)_, _Cut placement_, _Cut side_,
_Position along member_, _Along member (%)_, _From finished start (mm)_,
_Across side offset (mm)_, _Locate by_, _First/Second face axis (%)_,
_Cut start (part mm)_, _Cut direction (into material)_. Browser scripts type
through them.

## 7. Snapping, feedback, hints

Phase H §5 rules. New candidate kind **`hole centre`** (rank between mark and
edge): the resolved cut centres of the hovered part's hole/pocket features
(from the snapshot `features[id].cut.position`, `mapPlacement` to world; only
those whose cut lies on the hovered face within 0.05 mm) — used by Hole
(align a new hole with an existing one), Pocket and Hardware. Reuse the
`extra` candidate list `measureCandidates` accepts. Hidden marks never snap.

Ghost and arrow colour for cuts: `PLACEMENT_RED` always. Hardware ghost:
`PLACEMENT_BLUE`. Transform ghost: the boolean tool ghost material.

The viewport hint (`.cad-viewport-hint`) and the cursor HUD
(`.cad-placement-hud`, **one element per HUD class** — `verify-measure-marks.mjs`
uses strict locators) are reused; do not add a second HUD element.

## 8. Keyboard and cancel

Phase H §6 unchanged: Esc in a drag cancels the drag; Esc otherwise cancels
the operation (`stepBack` returns `null` for these tools); Enter applies when
Apply is enabled; digits + Enter during a drag set an absolute value; Alt =
free; Shift has no role for these tools. `D/R/M/[ ]` stay blocked while a
draft is open except R/M for the transform gizmo (as for booleans).

## 9. Architecture (Opus may deviate; flag it)

- New pure module **`placementCuts.js`**: hole/pocket/hardware/transform rules
  — defaults, `placeCut(draft, info, ctx)`, `cutView(draft, ctx)` (shape,
  handles, cut flag, throughAll), `dragCut(draft, change, ctx)`, `cutSummary`,
  the hole-centre candidates, hardware pose. `placementTool.js` dispatches to
  it from `startPlacement`, `pickOf` ('face' for hole/pocket/hardware),
  `placeClick`, `applyPlacementDrag`, `placementView`, `placementSummary`,
  `replacePlacement`, `HINTS`. `placementTool.js` is already ~1,770 lines:
  it grows by dispatch lines only.
- `cutPlacement.js`: export `cutWidthDirection`, `memberFrame`,
  `memberPlacementFromPoint`; `resolveCutPlacement` uses the first two
  (behaviour unchanged — `kernel.test.js` and `operations.test.js` must pass
  untouched).
- `operations.js`: add `'hole'`, `'pocket'`, `'transform'` (already there),
  `'hardware'` to the guided set (`GUIDED_OPERATIONS`; keep `PROFILE_OPERATIONS`
  as is); `createOperationDraft` returns the "nothing placed yet" draft
  (`feature: null`, like the profile-operation Place start ~139–150) for
  hole/pocket/hardware in Place; `OPERATION_HELP` entries for the four;
  `operationProblem` unchanged.
- `CadWorkspace.jsx`: `addFeature` routes through `GUIDED_OPERATIONS` (no
  other change); `beginOperation` accepts an options bag for the hardware
  feature; the tree editor gains "Edit {type} with preview" for cuts; the
  `HardwarePanel` `onAdd` branches (§3.4); optional "Apply and place another".
  Wiring only.
- `CadViewport.jsx` / `placementLayer.js`: curved-face hover for the member
  rule (the layer today refuses non-planar hits before calling back — pass
  `planar:false` hits through to `placeClick` and let the pure rule decide),
  the transform ghost (host mesh clone), hole-centre candidates, red cut
  prism ghost (a `'prism'` shape with negative value along the frame normal
  already draws into the material — reuse `prismParts` with a fixed cut
  inference `{active:false, existing:true, operation:'cut', depth}` or write
  `cutParts`; either way the arrow starts at the face and points in).
- `CadEditors.jsx`: the `CutSizeFields`/`CutLocationFields` split (§6).
- `OperationPanel.jsx`: render the split for hole/pocket; hardware fields;
  placement line texts.
- `rotateKeys.js` `placementKeyAction`: nothing new (tools open via buttons).

## 10. Edge cases to handle (and test)

- Hole on the **underside** (−Z face) of a plate: arrow points up into the
  material; Apply cuts from the underside (`direction = +Z`).
- Hole on a face of a part **rotated 37° about Z** and one **tilted 15°**: the
  stored `direction` is the part-local inward normal; the kernel's cut is
  square to the face (compare `featureMetrics.cut.direction` to the unmapped
  normal within 1e-6).
- Pocket on a **right (+X) face**: `cutWidthDirection` picks the `[0,1,0]`
  reference; the ghost rectangle and the applied cut's bounding extents agree
  (kernel test: pocket 20 × 12 × 3 on a 100 × 80 × 10 box at a known point;
  removed volume = 720 mm³ ± 1 %, and the solid's bounds unchanged).
- Round pipe click (§4.3) at 0°, 90°, 45° and on a tilted member.
- Through all by dragging, then back to blind; typed `3` Enter during the
  depth drag → `depth: 3, throughAll: false`.
- Hole whose diameter grip is dragged to 0 → clamped at 0.1 mm.
- Click on a face of the draft's own new part (hardware) is refused as in
  `clickTarget`.
- `positionLocked` feature edit: no slide; the message appears in the hint.
- Model changes under an open draft (`draftStale`): handles hide (today's
  rule).
- Preview failure ("Cut removes no material" when the hole misses — e.g. a
  slide drag past the face edge): handles keep working, status shows the
  kernel text, Apply disabled.
- Perspective and orthographic cameras (`mmPerPixelAt` rule).
- Esc during a drag restores the value and re-enables orbit.

## 11. Delivery, tests and verification

Order of work (report each as **done / partial / not done**, never silently
drop one):

1. Engine dispatch + **Hole** (Place, slide, radius grip, depth arrow with
   through-all, panel split, placement line, Re-place, edit-with-preview).
2. **Pocket** (corner grip, `cutWidthDirection` contract, sketch-pocket
   toggle).
3. **Round member rule** (§4.3).
4. **Transform** gizmo (§3.3).
5. **Hardware** placement (§3.4) incl. hole-centre candidate if feasible.
6. "Apply and place another" (optional).

Tests (Vitest, run from the **repo root**, never from inside `cad/`; measure
and report the baseline file/test counts for `src/features/sketchstudio/cad`
and for `npm test` **before** changing anything, then the final counts):

- Unit: `placementCuts.test.js` (frames and stored fields for top/underside/
  rotated/tilted faces; through-all threshold; clamp rules; hole-centre
  candidates; hardware pose incl. underside; transform drag → part coords),
  `cutPlacement.test.js` additions (`cutWidthDirection` for all six axis
  directions and an oblique one; `memberPlacementFromPoint` round trips §4.3;
  `resolveCutPlacement` unchanged outputs for existing fixtures).
- Kernel: the pocket orientation case of §10 in `kernel.test.js` (or a new
  `kernel.cuts.test.js` if the worker harness is heavy).
- DOM: extend `CadViewport.place.dom.test.jsx` (hover ghost for hole, click
  → `onPlace` with `kind:'face'`, depth arrow drag → `onPlacementDrag`
  `{id:'distance'}`, red colour flag in `element.cadPlacement()`) and
  `CadWorkspace.place.dom.test.jsx` (Hole button opens Place with no feature;
  click → feature with `position`/`direction` and no `placement`; Apply adds
  it; Exact placement block collapsed; the tree editor's labels unchanged;
  Transform opens in Shape with a tool gizmo; Add hardware without attach
  opens Place).
- Existing suites stay green, including `kernel.test.js`, `operations.test.js`,
  `marks.test.js`, `placementTool.test.js`, `CadViewport.measure.dom.test.jsx`.
- Browser (Playwright, Chrome, `CAD_VERIFY_URL=http://localhost:5180/sketch`,
  reuse `scripts/sketch-cad-steps.mjs`; recipes in
  `scripts/verify-direct-placement.mjs`): new **`scripts/verify-cut-placement.mjs`**
  — add a board → Hole → top view → click near a corner (assert snap kind via
  `element.cadPlacement()`) → drag the depth arrow to the far face (HUD
  "Through all") → Apply → saved feature has `position`, `direction`
  `[0,0,-1]`, `throughAll:true`, no `placement`; Pocket → click → corner grip
  drag → typed depth `3` → Apply → `width/height` changed, `depth:3`; Transform
  → gizmo drag → `position` changed; Hardware library → attach off → Add
  hardware → click the board → Apply → new instance with `rotation` `[0,0,0]`
  and `position[2] = 10` (board top); screenshots to `artifacts/sketch-cad/`.
  **Update `scripts/verify-sketch-cad-editing.mjs`** (~174–206): _Hole_ and
  _Pocket_ now open Place — click the tube's face (Standard view → top, canvas
  centre, as `placeOnTarget` does), Apply, then select the feature in the tree
  to reach "Cut applied ·", _Cut extent_ and _View cut close up_; replace the
  "Across side offset 100 → Cut removes no material → Undo" step with the
  equivalent through the tree's _Cut placement → On tube / member_ then
  _Across side offset (mm)_ (the fieldset still exists), and keep every check
  string. Re-run **all** of: `verify-cut-placement`, `verify-sketch-cad-editing`,
  `verify-hole-hardware`, `verify-direct-placement`, `verify-measure-marks`,
  `verify-start-sketch`, `verify-sketch-cad`, `verify-sketch-cad-offline`
  (Chrome half; `vite preview --host 127.0.0.1`; its Electron half fails from
  Phase H — report, do not chase). Note: the New confirm is an in-app dialog
  (click its OK button), not a `page.on('dialog')` one.
- Docs: `docs/sketch-studio-cad.md` "Holes and pockets" (~279–372): lead with
  Hole/Pocket Place → Shape → Apply, the depth arrow/through-all rule, the
  round-tube rule, keep the Place holes / Move holes paragraphs, rewrite the
  "Select a part, then choose Hole or Pocket…" and "default starts at the
  center of the top side" paragraphs; the hardware paragraph (~320–322,
  "hardware is an ordinary part at the origin"); a Transform sentence in
  "Guided solid operations". `docs/sketch-studio-step-by-step.md` ~79–81 and
  ~103 (the Hole steps). `docs/sketch-studio-direct-placement.md` §4.8: one
  line "Transform: built in Phase J, see sketch-studio-cut-placement.md".
  Plain prose, no marketing.

Process rules (from earlier phases):

- Do **not** commit; the tree holds uncommitted Phase G–I work the user will
  commit. Stay inside `src/features/sketchstudio/cad/`, `scripts/`, `docs/`
  unless wiring requires it; say so if you leave them.
- Match each existing file's line endings (several cad files are CRLF); new
  files LF.
- `utils/` imports are extensionless and Node cannot load them; keep any new
  Node-run script importing only `.js`-suffixed paths.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  Stop any Vite server you start and confirm nothing listens on 5180.
- Flag every judgment call beyond this spec in the final report, with
  file:line anchors for each claim so the audit can verify them.

## 12. Acceptance checklist (used for the audit)

- [ ] Solid → Hole with nothing selected: hovering a face shows a red circle +
      snap HUD; clicking places on **that** part; arrow, square and grip
      appear; drag past the far face reads "Through all"; typed `3` Enter
      during the drag gives `depth:3, throughAll:false`; Apply adds a hole with
      `position`/`direction` in part coordinates and no `placement`.
- [ ] The tree editor for that hole still shows the unchanged location
      fieldset and _Move hole on surface_; `verify-hole-hardware.mjs` passes.
- [ ] Pocket on a +X face: ghost rectangle matches the applied cut (kernel
      test) and the corner grip changes `width`/`height`.
- [ ] Click on a round pipe drills radially: stored `placement.type ===
    'member'` with `distance`/`side`/`offset`, cut lands at the click.
- [ ] Underside, 37°-rotated and 15°-tilted faces: cut square to the face.
- [ ] Transform opens with the gizmo on the part's ghost; drag changes
      `position` in part coordinates; R rotates.
- [ ] Add hardware with attach off: Place → click the board top → Apply → the
      standoff stands on the board (seat at z = board top); attach-on path
      unchanged.
- [ ] Edit hole with preview on a side-placed hole shows handles at the
      resolved cut; a drag stores coordinates.
- [ ] Exact placement block collapsed by default and fully functional.
- [ ] Esc/Enter rules; orbit re-enabled after any drag/cancel; one
      `.cad-placement-hud` element.
- [ ] No `CAD_VERSION` change; old saves load; `kernel.js` unchanged (or only
      error text); `resolveCutPlacement` outputs unchanged for existing
      fixtures.
- [ ] Lint clean; all tests green; the eight browser scripts of §11 pass
      (Electron half of offline excepted); docs updated.

## 13. Out of scope (do not build unasked)

Board/tube drop-by-click (§1), counterbore/countersink hole types, hole
patterns from one placement, slot pockets, sketch-pocket handles, placing
hardware by two clicks (seat + orientation), changing _Place holes_ / _Move
holes_, any kernel geometry change, persisted schema changes, sketch
constraints (removed at the user's request).
