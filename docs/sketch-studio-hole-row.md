# Phase K — Hole rows: a line of equally spaced holes

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-01 by Fable after reading the
code; built by Opus; audited by Fable against this document. It extends Phase H
(`docs/sketch-studio-direct-placement.md`) and Phase J
(`docs/sketch-studio-cut-placement.md`), whose engine, rules and vocabulary apply
unchanged unless this document says otherwise.

## 1. The problem, in the user's words

> Can you add a tool where I can add a line marking so it will be easy for me
> to put holes following the marking? Or a tool where users can add a line of
> holes, adjusting the distance between the holes, for example 4 holes in line
> with a fixed distance to each other. UX is better that way.

Today a bolt pattern is made one hole at a time: **Solid → Hole** → click →
Apply (or **Apply and place another**), or **Place holes** click by click, each
hole aimed by eye, by the snap grid or by typed _Exact placement_ values. There
is no notion of "these four holes belong together, 50 mm apart": nothing keeps
them collinear, nothing lets the spacing be changed afterwards, and nothing
tells the user how far the last hole is from the edge. The existing `pattern`
feature (`kernel.js` ~347) copies the **whole part solid** as a compound, so it
cannot repeat one hole.

Verified starting points in the code:

| Thing                                                                                                                                               | Where                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hole Place → Shape → Apply (Phase J)                                                                                                                | `placementCuts.js` (`startCutPlacement` ~114, `placeCut` ~297, `applyCutDrag` ~407, `cutPlacementView` ~488, `hoverCutShape` ~667, `cutSummary` ~727) |
| Stored hole = `positionedCut` → `{ position, direction, placement: undefined }`; side/member placements                                             | `cutPlacement.js` `resolveCutPlacement` ~85–130, `positionedCut` ~141                                                                                 |
| Kernel cut: one `makeCylinder` at the resolved cut, removed-volume check, `featureMetrics[f.id] = { cut, removedVolume }`                           | `kernel.js` ~277–319                                                                                                                                  |
| Multi-click Place already exists: Sweep path points (`pick === 'path'`, `placeSweepPoint`, the layer's `pathAt` with candidates, grid, Shift ortho) | `placementTool.js` ~665, `placementLayer.js` ~469–505                                                                                                 |
| Hole-centre snap candidates (`holeCentres`, rank between mark and edge; `holeAt` for hardware)                                                      | `placementCuts.js` ~254, `placementLayer.js` ~395–450                                                                                                 |
| Move holes: one orange handle per hole feature                                                                                                      | `CadViewport.jsx` ~1555–1600; `moveHole` `CadWorkspace.jsx` ~583                                                                                      |
| Concentric hardware reads the hole's resolved cut                                                                                                   | `kernel.js` `getAxis` ~450–480                                                                                                                        |
| Drawings: `sheetHoleFeatures` (one entry per hole feature), hole-chain / hole-callout by `featureIds`, callout text "N × Ø… THRU"                   | `engineeringSheet.js` ~25–65, ~186–262; auto detail sheets `kernel.js` ~628; `annotationText` `drawings.js` ~34–52                                    |
| Tree editor `CutFeatureForm` = `CutSizeFields` + `CutLocationFields` (labels tested by scripts)                                                     | `CadEditors.jsx` ~422, ~570, ~758                                                                                                                     |
| Keyboard: Esc/Enter for a draft in `CadWorkspace.jsx` ~1312–1340; drag typing in `placementLayer.js` `key` ~889                                     |                                                                                                                                                       |

### The line-marking question

The user's first idea (a construction line, then holes along it) is answered
inside the row tool rather than by a new persisted object: while the row is
being placed and shaped, the viewport draws the **row line** (a dashed
construction line through all centres with a tick at each hole and the pitch in
the readout) — that is the marking, and it disappears when the row is applied
because the holes themselves now carry the information. Existing dimension marks
already act as point markings (a hole placed within 8 px of a mark point lands
exactly there, Phase G). A persistent guide-line object (snap anywhere along a
measured line) is **out of scope** for this phase; do not build it.

## 2. Principles

1. One feature, many holes. A row is **one `hole` feature with a `row` record**
   (§4), cut N times by the kernel. The tree shows one entry, the drawing callout
   reads "4 × Ø6.6 THRU", changing the spacing later moves every hole, and the
   spacing can be a named parameter (`=pitch`). Independent features tagged as a
   group were considered and rejected: they would need a multi-feature draft,
   regeneration logic in the tree editor, and could not be parametric.
2. Cursor first, as in Phase H/J: **first hole by a click, last hole by a
   click**, then handles. Count and spacing are typed or keyed, never a dialog.
3. The second click means "the last hole goes here": a row fits exactly between
   two snapped points (mark to mark, midpoint to hole centre). With no feature
   snap the spacing is rounded to the Move grid so the row reads "pitch 50", not
   "pitch 50.33".
4. Count is fixed while dragging the end; spacing follows. Count changes by
   ↑/↓ or the panel field. (One lock rule, no mode switch.)
5. Everything a single Hole can do, a row can do: through all / depth arrow,
   diameter grip, thread presets, Exact placement, Edit with preview, Apply and
   place another, Move holes, hardware in any of its holes, drawing callouts
   and chains.
6. No `CAD_VERSION` bump. `row` is optional; files without it load unchanged;
   a file with `row` opened by older code cuts the first hole only (accepted).
   Nothing else new is persisted except the optional `holeIndex` on a
   concentric connection (§4.3).

## 3. The interaction model

Opened from **Solid → Hole row** (a new ribbon button directly after **Hole**;
command-palette entry "Hole row"; no key). It runs the Phase J Hole tool with a
row flag: `beginOperation('hole', null, { row: true })` → `startPlacement({…,
row: true })` → `startCutPlacement` returns `{ tool: 'hole', stage: 'place',
mode: 'cut', template, row: { count, pitch } }` where `count`/`pitch` come from
the template ("Apply and place another") or the defaults (count **4**, pitch
unset). The feature type stays `'hole'`; "hole row" is a behaviour of the Hole
tool, not a new tool id, so `GUIDED_OPERATIONS`, `CUT_TOOLS`, `TITLES` and the
tree's "Edit hole with preview" need no new entry.

| Stage                             | Hint (`.cad-viewport-hint`)                                                                                                                                                                                                                                                                                             | Click / keys                                                                                                 | Ghost                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Place** (first hole)            | "Hole row: click where the first hole goes · corners, midpoints, face centres, marks and hole centres snap · Esc cancels"                                                                                                                                                                                               | exactly Phase J Hole Place (flat face → `positionedCut` on the clicked part; round member → §3.5)            | red circle at the hovered point (unchanged)                                                                                                        |
| **Place, seed set** ("direction") | "Hole row: click where the last hole goes · Shift locks to the face axes · snap points snap · ↑ ↓ change the count (4) · Enter takes the default · Esc goes back to the first hole"                                                                                                                                     | the second click sets direction + spacing (§3.2); ↑/↓ count; Enter = default row (§3.3); Esc = drop the seed | the rubber row: circles at all `count` positions from the seed to the cursor, the row line and ticks; HUD "4 holes · pitch 50 mm · 150 mm · ortho" |
| **Shape**                         | "Hole row: drag the end square to set the spacing and direction (Shift locks to the face axes · type a value + Enter sets the spacing) · the first square moves the row · the arrow sets the depth (past the far face = through all) · the grip sets the diameter · ↑ ↓ change the count · Enter applies · Esc cancels" | handles §5; ↑/↓; Enter applies                                                                               | all circles as a red prism ghost into the material, the row line and ticks                                                                         |

Stage bookkeeping: the seed click keeps `placement.stage === 'place'` (the
viewport routes clicks to `onPlace` only in Place, and the host must not be
isolated yet) and records `placement.row.seed = true`, `frame` (the seed's cut
frame, world), `grid`, `target`, `label`, `hostInstanceId`. `draft.feature` is
the plain seed hole **without `row`** during this stage, so the preview shows
one hole. `pickOf(placement)` returns `'path'` in this stage, so the layer uses
`pathAt` (plane intersection on `view.path.frame`, candidates, grid, Shift ortho
with `from` = the seed) exactly as for Sweep corners; set `view.path = { frame,
points: [frame.origin], radius: 0 }` and `view.row = { count, pitch, … }` for
the ghost/HUD branch. The second click leaves Place → `changePlacement`
selects and isolates the host as it does for every tool. Re-place returns to
Place with the feature kept (its preview stays) and `row.seed` cleared.

### 3.1 First click

As Phase J §3.1/§4.1: `positionedCut(defaults, unmap(point), unmap(−normal))`,
`cutDefaults('hole', part, parameters, template)` (template may carry `row`
— strip it from the feature here; §4.4). `placement.frame = faceCutFrame(point,
normal, ops)` (origin = the seed centre, x = the kernel's width direction,
normal = into the material); `placement.grid = info.faceFrame`.

### 3.2 Second click — the pure rule `rowFromEnd`

Inputs: the seed frame (world), the end point `E` on the seed plane (the layer
already projected and snapped it; it also sends `snapKind`), `count n ≥ 2`, the
Move grid `step` (`ctx.snap`), the face grid frame (`placement.grid`), flags
`{ ortho (Shift), free (Alt) }`.

1. `v = E − origin` in the seed plane; `L = |v|`. `L < MIN_LENGTH` → ignore the
   click (a double click; keep the draft unchanged).
2. Direction `d = v / L`. **Axis snap:** unless `free` or the end came from a
   feature snap (`snapKind` ∈ vertex / midpoint / face centre / mark / hole
   centre), if `d` is within **3°** of ±grid.x or ±grid.y, replace it by that
   axis and set `snapKind = 'axis'` (Shift already locked it to an axis via
   `snapPoint`'s ortho; keep that kind). Judgment call allowed on the 3°.
3. Spacing `pitch = L / (n − 1)`. Unless the end came from a feature snap, round
   `pitch` to `step` (when `step > 0`; `snapValue`) and never below
   `MIN_LENGTH`. The last hole is then at `origin + d · pitch · (n − 1)`, which
   may differ from `E` by less than half a grid step: that is intended (rule 3).
4. Store on the feature: `row = { count: n, pitch: tidy(pitch, 1e-4),
direction: tidyDirection(unmapPlacement(d, ops, true)) }` (part coordinates;
   `ops = hostOperations`). `placement.stage = 'shape'`.

Typing digits + Enter in this stage (should): sets the pitch along the current
hovered direction (or +grid.x when nothing is hovered) and goes to Shape. May be
cut to Shape-stage typing only (the end handle, §5); report it.

### 3.3 Enter in the direction stage

`finishPlacement` (the workspace's Enter branch, `CadWorkspace.jsx` ~1323,
extended for `p.row?.seed`): the default row along `+grid.x` with
`pitch = defaultPitch(Ø)` = `max(10, 4 · Ø)` rounded **up** to a multiple of
5 mm (Ø 6.6 → 30, Ø 3 → 15, Ø 10 → 40). Count unchanged.

### 3.4 Count

`↑` / `↓` (`ArrowUp` / `ArrowDown`) in the direction and Shape stages, handled in
the workspace's draft keydown effect next to Esc/Enter (not while a drag is in
progress, not in an editable target): `count ± 1`, clamped to **2…100** (the
kernel's cap, as for `pattern`). In the direction stage this changes
`placement.row.count` (the rubber row redraws); in Shape it changes
`feature.row.count` **keeping the pitch** (the row grows or shrinks at its end).
The panel's _Holes in row_ field does the same. OrbitControls does not listen to
arrow keys (`listenToKeyEvents` is never called); verify and say so.

### 3.5 Round members (should — may be cut; report it)

A seed clicked on a round tube/bar (member placement, Phase J §4.3): the row
direction is **the member axis** in part coordinates (`memberFrame(...).axis`),
sign chosen toward the second click's projection on the axis; `pitch` from the
projected length. The kernel's translation along the axis is exact because the
radial direction is constant along a straight member. The end handle slides
along the axis only; the Shift/axis rules do not apply. If not built, the row
tool refuses curved faces with "Hole row: pick a flat face. Round tubes take a
single Hole, which drills radially."

## 4. Data

### 4.1 The `row` record (persisted, on a `hole` feature)

```js
feature.row = {
  count: 4, // integer 2…100; a number or an expression ("=n")
  pitch: 50, // mm > 0; a number or an expression ("=pitch")
  direction: [1, 0, 0], // unit vector, PART coordinates, in the face of the first hole
};
```

`length = pitch × (count − 1)` is derived, never stored. The first hole is the
seed: everything else about the feature (`position`/`direction` or `placement`,
`diameter`, `holeSpec`, `depth`, `throughAll`, `positionLocked`) is unchanged
and applies to every hole. `row` absent = a single hole, exactly as today.

### 4.2 `resolveRow(feature, cut, parameters)` — one pure helper, used everywhere

In `cutPlacement.js`, next to `resolveCutPlacement`:

- returns `null` when `feature.row` is absent;
- `count = numeric(row.count)`; not an integer or outside 1…100 → "Holes in a
  row must be a whole number from 1 to 100." (**1 is allowed and means a single
  hole**, so an expression that evaluates to 1 does not break the model; the UI
  deletes `row` when the user types 1);
- `pitch = positive(row.pitch, parameters, 'Row spacing')`;
- `d = vector(row.direction)` projected square to `cut.direction` and
  normalised; the projection shorter than 1e-6 → "Row direction must lie in the
  face of the first hole." (so a side- or member-placed seed whose side is
  changed later still gets a sane row or a clear message);
- returns `{ count, pitch, direction, centres }` with
  `centres[k] = cut.position + direction · pitch · k`, `k = 0 … count − 1`.

The kernel, the ghost, the hole-centre candidates, Move holes and the drawings
all take centres from this function (directly or via the kernel's metrics),
so they agree by construction.

### 4.3 Kernel (`kernel.js` hole/pocket case, ~277–319)

After `cut = resolveCutPlacement(...)`: `const row = resolveRow(f, cut, params)`;
loop over `row ? row.centres : [cut.position]`, building the same tool at each
centre (`start = centre − direction · clearance`) and cutting **one hole at a
time**, measuring the volume before and after each cut. A hole that removes
nothing throws `Hole ${k + 1} of ${count} removes no material. Shorten the
spacing or move the row; the tool may miss the part or overlap an existing
cut.` (the single-hole message stays as it is). Metrics:

```js
featureMetrics[f.id] = { cut, removedVolume /* sum */, ...(row ? { row: { count, pitch, direction, centres } } : {}) };
```

`cut` stays the first hole so every existing consumer keeps working. The loop
is generic (a `row` on a `pocket` would also work); the UI exposes rows for
holes only. `CAD_VERSION` stays 1.

Concentric connections (`getAxis`, ~453): an optional `connection.holeIndex`
(integer, default 0) picks `metrics.row?.centres[holeIndex]` as the axis origin
when present, else today's `resolvedCut.position`. Direction unchanged.

### 4.4 Draft and template

`placement.row = { count, pitch, seed }` is draft-only. `cutTemplate(feature)`
("Apply and place another") adds `row: { count, pitch }` when the feature has a
row (never `direction`); `cutDefaults` strips `row` from the feature and hands it
to `placement.row`. `applyOperation(again)` must reopen with the row flag:
`setReopen({ type: 'hole', row: Boolean(feature.row), template })` →
`beginOperation(type, null, { template, row })`.

## 5. Handles (Phase H §3.4 / Phase J §5 rules apply)

| Handle                          | id         | kind                                                                     | Drives                                                 | Maths                                                                                                                                                       |
| ------------------------------- | ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depth arrow (red)               | `distance` | arrow                                                                    | `depth`, `throughAll` of all holes                     | unchanged (Phase J)                                                                                                                                         |
| Slide square at the first hole  | `slide`    | square                                                                   | the whole row (`position`; member `distance`/`offset`) | unchanged; `row` untouched                                                                                                                                  |
| Radius grip at the first hole   | `radius`   | grip circle                                                              | `diameter` of all holes                                | unchanged                                                                                                                                                   |
| **End square** at the last hole | `row-end`  | square, `typing: true`, `orthoFrom: seed origin`, `grid: placement.grid` | `row.direction` + `row.pitch` (count fixed)            | the dragged point through `rowFromEnd` (§3.2) with the drag's `snapKind`; typed digits + Enter → `{ along: value }` = the pitch along the current direction |

Layer changes for the end square, kept minimal: (a) the square's Shift branch
(`placementLayer.js` ~583) measures from `handle.orthoFrom || handle.at`; (b) a
square with `typing: true` accepts digits and on Enter finishes the drag with
`{ along: Number(typed) }` instead of a point (the Phase H typing HUD already
renders `drag.typed`); (c) `dragView` for `row-end` moves the last circle and
the row line with the pointer (recompute all circles from the live end so the
ghost shows the real spacing); (d) `dragReadout` for `row-end`:
"pitch 50 mm · 4 holes · 150 mm" plus `· 12 mm to the edge` when §7's margin is
built. HUD texts otherwise as Phase J ("Ø 6.6 mm", "Depth 5 mm", "Through all").

Ghost in Shape: `view.shape = { kind: 'prism', frame, loops: [circle at each
centre, in frame coordinates], value: depth }` (the prism shape already takes
several loops); row line = `view.extras.push({ kind: 'axis', a: firstCentre,
b: lastCentre })` (the existing dashed axis overshoots both ends, which reads as
a construction line) plus `{ kind: 'outline', segments: ticks }` — a short tick
square to the row through each centre (length ≈ 1.2 × Ø). No new extra kinds.
The direction-stage rubber row uses the same pieces built from the hovered end.

A `positionLocked` seed keeps the end square (direction and spacing do not move
the first hole) and loses only the slide square, as today. A feature followed by
transform / mirror / pattern gets no handles (existing rule).

## 6. Panel (`OperationPanel.jsx`) and tree editor (`CadEditors.jsx`)

Operation panel, when `f.type === 'hole'` and (`f.row` or `p.row`):

1. Heading "Place hole row" / "Edit hole row"; help text `OPERATION_HELP.holeRow`
   ("Drill a straight row of identical holes: click the first and the last
   hole, then set the count and spacing. One feature; every hole follows the
   spacing, and the spacing can be a parameter."); Apply reads **Apply hole
   row** (and _Apply and place another_ keeps its label).
2. Placement line (`.cad-placement-line`): direction stage "First hole on Part 2
   · top face at (10, 10) · click where the last hole goes"; Shape "Row of 4
   holes on Part 2 · top face · from (10, 10) along +X · pitch 50 mm · 150 mm ·
   Ø 6.6 mm · through all" ("along +X" = the row direction named against the
   face grid: +X / −X / +Y / −Y when within 1e-6, else the angle "at 30°"); with
   **Re-place** and **Apply and place another**.
3. New fieldset **Row** (legend "Row", before the existing Hole fieldset), the
   exported component `RowFields` shared with the tree editor:
   - _Holes in row_ — integer field (step 1, min 2 here, min 1 in the tree editor
     where 1 removes the row), expressions allowed through `ValueField`;
   - _Spacing (mm)_ — `ValueField`, expressions allowed (`=pitch`);
   - _Row length (mm)_ — `ValueField` showing `pitch × (count − 1)`; editing it
     sets `pitch = value / (count − 1)` (count fixed), rounded 1e-4;
   - _Direction_ — engraved readout ("+X of face · 0°" / "at 30°") with a
     **Flip direction** button (`direction = −direction`: the row runs the other
     way from the first hole);
   - a warning line (`cad-help`, not blocking) when `pitch < diameter`: "Spacing
     5 mm is less than the hole diameter 6.6 mm: the holes overlap into a slot."
4. The existing **Hole** fieldset (`CutSizeFields`) and the collapsed **Exact
   placement (mm)** (`CutLocationFields`) plus, inside it, _Row direction (part
   mm)_ as `VectorFields` (plain numbers; a typed vector is projected into the
   face by the kernel).

Tree editor (`CutFeatureForm`, holes only): the same `RowFields` under a
`<fieldset>` **Row of holes** placed after the _Lock hole position_ / _Move hole
on surface_ block and before the "Cut applied ·" result line. On a single hole
it shows _Holes in row_ = 1 and the help "2 or more makes a straight row from
this hole." Setting ≥ 2 creates `row = { count, pitch: defaultPitch(Ø),
direction: metrics.cut.widthDirection }` (part coordinates; fallback
`cutWidthDirection(feature.direction)`). Setting 1 deletes `row`. **Existing
labels, order and DOM of `CutFeatureForm` otherwise unchanged** (scripts type
through them; grep `scripts/verify-sketch-cad-editing.mjs` and
`verify-hole-hardware.mjs` first). The tree's feature heading
(`CadWorkspace.jsx` ~2760, "hole · feature N") reads "hole ×4 · feature N" for a
row — check no script matches the exact old text before changing it.

## 7. Snapping, feedback, hints

- Direction stage and the end square: candidates (vertex > midpoint > face
  centre > mark > hole centre > edge), the Move grid, Shift = ortho from the
  **seed**, Alt = free, plus the 3° axis snap of §3.2. Hidden marks never snap.
- Edge margin (should — may be cut; report it): the distance from the last
  centre to the face outline along the row direction, computed in the face
  grid frame from `info.outline` (a polygon in `faceFrame` coordinates; the
  seed hover carried it — keep it on `placement.outline`): HUD "· 12 mm to the
  edge"; when the last centre lies outside the outline, "· past the edge". A
  pure function `edgeMargin(outline2, from2, dir2)` with tests.
- Colours: `PLACEMENT_RED` for everything of a row (it is a cut).
- One `.cad-placement-hud`, one `.cad-viewport-hint` (strict locators in the
  scripts).

## 8. Keyboard and cancel

Phase H §6 / Phase J §8 unchanged, plus: ↑/↓ = count (§3.4); Enter in the
direction stage = default row (§3.3); Esc in the direction stage = back to the
first click (`stepBack`: `feature: null`, `row.seed` cleared, hint back to
"click where the first hole goes"); Esc in Place without a seed or in Shape =
cancel; digits + Enter during the end-square drag = pitch; Shift / Alt as §7.

## 9. Downstream consumers (every one is touched; report each)

| Consumer                                                                 | Change                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `placementCuts.js` `holeCentres`                                         | one candidate per centre (`metrics.row.centres` mapped to world, else `cut.position`); each carries `featureId` **and `index`**; `holeAt` in the layer returns both                                                                        |
| Hardware Place on a row centre (`placeHardware`)                         | the concentric connection gains `holeIndex` when `index > 0` (omit for 0 so old shapes stay byte-identical)                                                                                                                                |
| `kernel.js` `getAxis`                                                    | `holeIndex` → §4.3                                                                                                                                                                                                                         |
| Move holes (`CadViewport.jsx` ~1569, `moveHole` ~583)                    | one orange handle per centre, `userData.index`; dragging any of them moves the **whole row**: `position = seedPosition + (snapped − centre[index])`; locked = grey as today                                                                |
| `engineeringSheet.js` `sheetHoleFeatures`                                | one entry per centre, all with the feature's `id` (chains and callouts key by id, so a callout over a row reads "4 × Ø6.6 THRU" and a chain across it yields the pitch dimensions **with no annotation schema change** — verify in a test) |
| `kernel.js` auto detail sheets (~628) and `drawings.js` `annotationText` | one `hole` annotation per feature as today; its text gains `${count} × ` in front and `; ${count} holes, pitch ${pitch}` after the XYZ of the first hole                                                                                   |
| `fabrication.js` drilling notes (~36)                                    | `${count} × ` prefix                                                                                                                                                                                                                       |
| `SheetEditor.jsx` holes list (~354)                                      | "Hole 2 · Ø6.6 · row of 4"                                                                                                                                                                                                                 |
| `kernel.js` `planarProfiles` (~747)                                      | no change needed: the check reads only the cut's z-extent, identical for every hole of a row — say so                                                                                                                                      |
| `ConnectionEditor.jsx`, `HardwarePanel.jsx`, examples, starter models    | unchanged (examples keep their individual holes and their hole-chain annotations by id)                                                                                                                                                    |
| `validateReferences` (`model.js`)                                        | optional: a diagnostic for a malformed `row`; the kernel's messages are sufficient                                                                                                                                                         |

## 10. Architecture (Opus may deviate; flag it)

- New pure module **`placementRows.js`** (~350–500 lines): `rowDefaults`,
  `defaultPitch`, `rowFromEnd`, `placeRowEnd(draft, info, ctx)`, `rowView(draft,
ctx, view)` (circles, extras, the `row-end` handle), `rowHover(view, pathHover)`
  (the rubber row), `applyRowDrag`, `changeRowCount`, `flipRow`, `rowSummary`,
  `edgeMargin`, `rowDirectionLabel`. `placementCuts.js` dispatches to it in
  `startCutPlacement`, `placeCut`, `cutPlacementView`, `applyCutDrag`,
  `cutSummary`, `hoverCutShape`, `cutTemplate`/`cutDefaults` — dispatch lines
  only; `placementTool.js` changes only `pickOf` (direction stage → `'path'`),
  `finishPlacement`, `stepBack`, `replacePlacement` (row cases), `dragView`/
  `dragReadout` (`row-end`). Keep the module cycle-safe (import at use, as
  Phase J notes).
- `cutPlacement.js`: `resolveRow` (§4.2); `resolveCutPlacement` unchanged.
- `kernel.js`: the loop (§4.3), `getAxis` `holeIndex`, the detail-sheet text.
- `placementLayer.js`: `orthoFrom`, typing squares → `{ along }`, `view.row`
  ghost/HUD in the `'path'` hover branch, `holeAt` index. No new HUD element.
- `operations.js`: `OPERATION_HELP.holeRow`; `startPlacement` passes `row`
  through its options bag; nothing else (`PLACED_FIRST` already has `hole`).
- `CadWorkspace.jsx`: the ribbon button, the command, `beginOperation` option
  `row`, ↑/↓ and the Enter default, `setReopen` with `row`, `moveHole(id,
point, index)`, the tree heading. Wiring only.
- `OperationPanel.jsx` / `CadEditors.jsx`: `RowFields` (§6).
- `CadViewport.jsx`: Move holes handles per centre.
- `engineeringSheet.js`, `drawings.js`, `fabrication.js`, `SheetEditor.jsx`:
  one small change each (§9).
- `rotateKeys.js`: nothing (arrows are handled in the workspace's draft effect).

## 11. Edge cases to handle (and test)

- Row running off the part: kernel error names the hole ("Hole 4 of 4 …"); the
  HUD margin (if built) reads "past the edge"; Apply stays disabled, handles
  keep working (Phase J rule for preview failures).
- `pitch < diameter`: warning, not blocking; the kernel still cuts (a slot).
- `count` expression evaluating to 1 → single hole, no error; 0, 1.5, 101 →
  the §4.2 message; `pitch` ≤ 0 → "Row spacing must be greater than zero."
- Parametric pitch: `row.pitch = '=pitch'` with parameter `pitch = 40` →
  centres 40 apart; changing the parameter to 60 moves holes 2–4 and the
  hardware seated in hole 3 (`holeIndex: 2`).
- Direction out of plane after the seed's side changes (side placement front →
  top): projected when possible, else the §4.2 message.
- Underside, 37°-turned and 15°-tilted faces: `row.direction` stored in part
  coordinates; the end square's drag goes through `unmapPlacement(·, ops,
true)`; the applied centres lie in the face (compare with the unmapped
  normal within 1e-6).
- The second click exactly on the seed (double click) is ignored; a second
  click on a feature snap keeps the exact length (pitch 33.3333 allowed); a
  grid click rounds the pitch; Shift + a 10°-off drag locks to the axis; a
  2°-off free drag snaps to the axis; a 10°-off free drag stays at 10°.
- ↑ at 100 and ↓ at 2 do nothing; Flip direction twice restores the vector.
- Re-place keeps the committed-looking preview until the new first click;
  Apply and place another reopens as a row with the same count/pitch.
- Edit hole with preview on a row created in the tree editor (no `placement.
frame`) builds the frame from the resolved cut (`resolvedCut`), as Phase J
  §3.5 does.
- Move holes: dragging the third handle moves the first hole by the same delta;
  one Undo restores all.
- Drawings: hole-callout on a row → "4 × Ø6.6 THRU"; hole-chain across it →
  three equal dimensions (plus the from-edge one); auto detail sheet text
  contains "4 ×" and "pitch 50".
- Old saves (no `row`) produce identical snapshots (volume, metrics) — assert on
  an existing kernel fixture.
- Perspective and orthographic cameras (`mmPerPixelAt`); Esc during the end
  drag restores the value and re-enables orbit.

## 12. Delivery, tests and verification

Order of work (report each as **done / partial / not done**, never silently
drop one):

1. `resolveRow` + kernel loop + `holeIndex` + unit/kernel tests.
2. The tool: Place → direction → Shape, `rowFromEnd`, end square, ghost, HUD,
   ↑/↓, Enter default, Esc back, Re-place, panel `RowFields`, placement line,
   Apply hole row.
3. Tree editor row block, Edit with preview on rows, Move holes per centre,
   hole-centre candidates with index, Apply and place another with `row`.
4. Drawings / fabrication / sheet editor / hardware index (§9).
5. Round members (§3.5, should). 6. Edge margin (§7, should). 7. Direction-stage
   typing (§3.2, should).
6. Docs + browser script.

Tests (Vitest, run from the **repo root**, never from inside `cad/`; measure and
report the baseline file/test counts for `src/features/sketchstudio/cad` and for
`npm test` **before** changing anything, then the final counts):

- Unit: `cutPlacement.test.js` (`resolveRow`: centres for +X/+Y/oblique
  directions, projection of an out-of-plane direction, the three error
  messages, expression count/pitch, count 1); new `placementRows.test.js`
  (`rowFromEnd` rounding and snap rules of §3.2 incl. the 3° axis snap and the
  feature-snap exception, `defaultPitch` table, `changeRowCount` clamps,
  `flipRow`, `applyRowDrag` for a point and for `{ along }`, `rowSummary`
  texts, `edgeMargin` inside/outside, the rubber-row hover on a 37°-turned
  board: every circle centre lies in the face plane); `placementCuts.test.js`
  additions (`startCutPlacement` with `row`, `placeCut` seed keeps Place with
  `row.seed`, the second click produces `feature.row` in part coordinates on a
  turned and a tilted board, `cutTemplate` carries `row`, `holeCentres`
  indexes).
- Kernel (`kernel.test.js`): a 100 × 80 × 10 plate with `4 × Ø6` through holes
  from (20, 40, 10) along +X, pitch 20: `removedVolume` = 4 · π · 9 · 10 within
  1 %, `row.centres` as expected, the solid's bounds unchanged; a row whose
  fourth hole misses → the error names "Hole 4 of 4"; `=pitch` parameter change
  moves the centres; concentric hardware with `holeIndex: 2` sits on the third
  centre (extend "attaches cylindrical axes concentrically"); an existing
  single-hole fixture's snapshot unchanged.
- Drawings: `engineeringSheet` / `annotationText` tests for the callout count,
  the chain across a row and the auto-sheet text.
- DOM: `CadWorkspace.place.dom.test.jsx` (Hole row button → Place; first click
  keeps Place with the "last hole" hint and no isolation; second click → Shape
  with `feature.row`; ↑ → count 5 (pitch kept); Enter in the direction stage →
  the default row; Esc in the direction stage → Place without a feature; Apply
  → one feature with `row`, `fitKey` unchanged; Apply and place another reopens
  with `placement.row`; the tree editor row block creates/deletes `row`);
  `CadViewport.place.dom.test.jsx` (direction-stage hover exposes
  `cadPlacement().row` and `pick === 'path'`; the `row-end` handle has
  `orthoFrom`; typed `50` + Enter on it → `onPlacementDrag({ id: 'row-end',
value: { along: 50 } })`; one `.cad-placement-hud`).
- Existing suites stay green: `kernel.test.js`, `operations.test.js`,
  `placementTool.test.js`, `placementCuts.test.js`, `marks.test.js`,
  `CadViewport.measure.dom.test.jsx`, the Phase I/J/drop-point suites.
- Browser (Playwright, Chrome, `CAD_VERIFY_URL=http://localhost:5180/sketch`,
  reuse `scripts/sketch-cad-steps.mjs`; recipe in
  `scripts/verify-cut-placement.mjs` — read the saved board position, never
  assume the origin): new **`scripts/verify-hole-row.mjs`** — board → Hole row
  → top view → first click near a corner (vertex snap, then a grid point 20 mm
  in) → move along +X: HUD contains "4 holes" → ↑ then ↓ (HUD 5 → 4) → second
  click 150 mm along +X → Shape: `cadPlacement()` has handles `distance`,
  `slide`, `radius`, `row-end` → drag the end square while typing `50` Enter →
  Apply → the saved feature has `row: { count: 4, pitch: 50, direction: [1, 0,
0] }` (the board is not turned), `position`/`direction`, no `placement`;
  camera held (`cadProject` of an off-centre probe moved ≤ 0.5 px); Move holes
  shows 4 handles; Drawings → Generate views → the detail sheet text contains
  "4 ×"; screenshots to `artifacts/sketch-cad/hole-row/`. Re-run **all** of:
  `verify-cut-placement`, `verify-hole-hardware`, `verify-direct-placement`,
  `verify-measure-marks`, `verify-start-sketch`, `verify-sketch-cad-editing`,
  `verify-sketch-cad`, `verify-sketch-cad-offline` (Chrome half; its Electron
  half fails from Phase H — report, do not chase). Note: the New confirm is an
  in-app dialog. The dev server may listen on `[::1]` only — use
  `localhost`, not `127.0.0.1`.
- Docs: `docs/sketch-studio-cad.md` "Holes and pockets" (~297): a new
  sub-section **Hole rows** (the two clicks, count/spacing rules, ↑/↓, Flip,
  the end square, what a row is in the tree, drawings "4 × Ø", parametric
  pitch, Move holes moving the row); one sentence in the step-by-step guide's
  §4 ("Add the other three holes", `docs/sketch-studio-step-by-step.md` ~108)
  noting that **Hole row** places the two holes of one edge at once. Plain
  prose, no marketing.

Process rules (from earlier phases):

- Do **not** commit; the tree holds uncommitted Phase G–J and drop-point work
  the user will commit. Stay inside `src/features/sketchstudio/cad/`,
  `scripts/`, `docs/` unless wiring requires it; say so if you leave them.
- Match each existing file's line endings (the files named here are LF; some
  older cad files are CRLF — check before editing); new files LF.
- `utils/` imports are extensionless and Node cannot load them; keep any new
  Node-run script importing only `.js`-suffixed paths.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  Stop any Vite server you start and confirm nothing listens on 5180.
- Flag every judgment call beyond this spec in the final report, with
  file:line anchors for each claim so the audit can verify them.

## 13. Acceptance checklist (used for the audit)

- [ ] Solid → Hole row: first click on a board top places the seed and keeps
      Place (hint "click where the last hole goes", host not isolated, preview =
      one hole); the rubber row follows the cursor with the right count.
- [ ] Second click 150 mm along +X at count 4 → `row.pitch = 50`,
      `row.direction = [1, 0, 0]` (part coordinates), stage Shape, host selected
      and isolated; a second click on a mark keeps the exact length.
- [ ] ↑/↓ change the count in both stages (2…100); Enter in the direction stage
      makes the default row; Esc there returns to the first click.
- [ ] Shape: end square changes pitch and direction (Shift = axis, 3° auto axis
      snap, grid rounding, typed `50` Enter = pitch 50); slide/arrow/grip behave
      as for a single hole and affect all holes.
- [ ] Apply adds **one** feature with `row`; the kernel cuts 4 holes (volume
      test); the camera does not move; Apply and place another reopens as a row.
- [ ] Tree editor: Row of holes block creates/edits/deletes `row`; Edit hole
      with preview shows the row handles; Move holes shows 4 handles and drags
      the whole row.
- [ ] Hardware seated on the third centre stores `holeIndex: 2` and follows a
      pitch change; hole-callout "4 × Ø6.6 THRU"; chain across the row; auto
      detail sheet text "4 ×" + "pitch".
- [ ] `=pitch` parameter drives the spacing.
- [ ] Errors: off-edge row names the hole; count/pitch/direction messages as
      §4.2; overlap warning shown, not blocking.
- [ ] No `CAD_VERSION` change; old saves load and rebuild identically;
      `resolveCutPlacement` outputs unchanged for existing fixtures; one
      `.cad-placement-hud`; all 9 browser scripts pass (Electron half of the
      offline script excepted).

## 14. Out of scope (do not build unasked)

Persistent guide lines / snapping along a mark's segment; rectangular (two-axis)
and circular hole patterns; patterning pockets from the UI; chains between
holes of different rows on the drawing beyond what `featureIds` already allows;
per-hole exceptions inside a row (skip the third hole); converting existing
independent holes into a row.
