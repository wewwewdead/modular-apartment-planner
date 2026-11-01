# Phase M — Hardware in chosen holes: pick the holes, seat them all at once

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-01 by Fable after reading the
code; to be built by Opus; audited by Fable against this document. It extends
Phase J (`docs/sketch-studio-cut-placement.md`, §3.4 Hardware) and Phase K
(`docs/sketch-studio-hole-row.md`, `holeIndex`), whose engine, rules and
vocabulary apply unchanged unless this document says otherwise.

## 1. The problem, in the user's words

> Can we make it so that if I want to add a bolt in a hole then I should select
> which holes I want to add it to?

Today one round of **Hardware library → Add hardware** produces exactly **one**
hardware part. Verified in the code:

| Path                                                                      | What happens                                                                                                                                                                                                                                                                    | Where                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Attach to selected hole_ checked + a `hole` feature selected in the tree | immediate commit of one part, one instance, one `concentric` connection to the selected feature — **no `holeIndex`**, so on a hole row it always lands in the first hole                                                                                                        | `CadWorkspace.jsx` ~2091–2125 (`onAdd`), `HardwarePanel.jsx` ~96–104                                                                                                                                                                                      |
| otherwise (attach off, or no hole selected)                               | `beginOperation('hardware', null, { hardware })` → Place; **one** click on a face, on empty ground or on a _hole centre_ snap → Shape at once; Apply commits one part + one instance (+ one connection when the click hit an attachable hole centre, with `holeIndex` when > 0) | `placementCuts.js` `startCutPlacement` ~128–137, `placeCut` ~335, `placeHardware` ~400–449, `hardwareView` ~658–689, `cutSummary` ~800–806; `operations.js` `operationModel` ~272–297 (appends `draft.newPart`, `draft.newInstance`, `draft.connections`) |
| hole-centre snap candidates                                               | `holeCentres(ctx)` → one candidate per resolved centre (rows: one per `metrics.row.centres[i]`) with `{ instanceId, featureId, index, type, attachable, point, normal }`; the layer's `holeAt` hands the click `holeFeatureId / holeAttachable / holeIndex`                     | `placementCuts.js` ~286–325; `placementLayer.js` ~402–419, ~460–471                                                                                                                                                                                       |
| kernel                                                                    | a `concentric` connection rotates the hardware's axis onto the hole's axis and translates it to the hole centre (`row.centres[holeIndex]` for rows) + `offset`; **one non-weld attachment per instance** ("Conflicting attachments")                                            | `kernel.js` ~455–513                                                                                                                                                                                                                                      |
| BOM                                                                       | quantity = number of instances per `partId`                                                                                                                                                                                                                                     | `fabrication.js` `buildCutList` ~11–16                                                                                                                                                                                                                    |

So a four-bolt pattern is four rounds of Add → click → Apply, and the
_Attach to selected hole_ shortcut cannot reach holes 2…N of a row. The user
wants to **choose the holes first, then seat the bolt in all of them**.

## 2. Principles

1. **The holes are chosen in the viewport, by clicking them.** No list of
   checkboxes to hunt through; the existing hole-centre snap already knows
   every hole on the hovered face. Clicking a chosen hole again removes it.
2. **One part, N instances, N connections.** Apply adds exactly one hardware
   part definition (so editing its sizes later changes every bolt, and the BOM
   says "Hex bolt M6 × 4"), one instance per chosen hole, each with its own
   `concentric` connection (`holeIndex` for rows). Nothing new is persisted:
   the saved model after Apply is what N rounds of today's tool would have
   produced. No `CAD_VERSION` bump.
3. **The Phase H/J stage machine is kept.** Place accumulates holes (as Loft
   accumulates sections and Sweep accumulates points); Enter / the panel button
   finishes into Shape; Apply commits. One `.cad-placement-hud`, one hint, the
   camera never moves (Phase H rule).
4. **Today's single-seat paths survive.** A click on a plain face or on empty
   ground with **no** hole chosen still seats one movable part as in Phase J
   (slide square, Apply). _Attach to selected hole_ on a single hole still
   commits at once (`scripts/verify-hole-hardware.mjs` depends on it).
5. **Draft-only state.** `placement.holes` and `draft.extraInstances` live in
   the operation draft; the feature and the connections carry nothing new.

Rejected alternatives (do not build):

- A separate "Select holes" mode before Add hardware — two modes to learn, and
  the operation-draft machinery already provides pick/finish/cancel.
- One instance with a "hardware pattern" — the kernel allows one attachment
  per instance, the BOM counts instances, and deleting one bolt later must be
  an ordinary Delete.
- A persisted "bolt group" record — N instances + N connections already say
  everything; nothing downstream needs a group.

## 3. The interaction model

**Hardware library → Add hardware** (attach off or no hole selected) opens
Place as today, heading _Place hardware_, hint:

> Hardware: click the holes it goes in (click one again to remove it · Shift+click picks a whole row) · Enter seats it in the chosen holes · a flat face or empty ground seats a single one · Esc cancels

### 3.1 Picking holes (stage Place)

A click whose `info.snapKind === 'hole centre'` with `holeAttachable: true`
**toggles** that hole in `placement.holes` (ordered by first click; a click on
a chosen hole removes it) and **stays in Place** — no feature, no instance, no
preview rebuild yet. Feedback:

- a blue ring (`PLACEMENT_BLUE`, radius = the hardware's head/body radius as
  `hardwareView` computes it) at every chosen centre, in the hole's face plane
  (§5);
- the hover ghost circle at the cursor as today;
- the HUD over a hole centre reads `hole centre · Hex bolt M6 · Board top ·
click to add` or `… · chosen · click to remove`, followed by the coordinates
  line as today; over anything else, as today;
- once ≥ 1 hole is chosen the hint becomes
  > Hardware: 3 holes chosen · click more holes, or a chosen one to remove it · Enter seats it in them · Esc removes the last one
- the placement line in the panel: `Hex bolt M6 · 3 holes chosen on Board ·
Enter seats it` (`on Board and Bracket` when the holes span two instances;
  `on 2 × Bracket` when two instances of one part).

Rules while ≥ 1 hole is chosen:

- a click on a plain face, on empty ground, on a pocket centre or on a hole
  that is not attachable → throw the error _Click another hole centre to add
  it, or press Enter to seat the hardware in the chosen holes._ (the draft is
  unchanged; the workspace shows it in `.cad-error` as every placement error);
- a click on a hole of the draft's own new part cannot happen (it has none).

With **no** hole chosen, a click on a plain face / ground / a non-attachable
hole centre behaves exactly as Phase J (one free seat → Shape with the slide
square; `placementCuts.test.js` "seats on a top face…", "stands on the
ground…" keep passing unchanged). A click on an attachable hole centre no
longer jumps to Shape: it picks the hole (the Phase J test "a click on a hole
centre seats it…" becomes pick + Enter, §9).

**Shift+click** on a centre that belongs to a hole **row** (`index` is defined
and the feature has `row`) toggles **every** centre of that row on that
instance: all on if any is off, else all off. Shift+click on a single hole =
a plain click. The layer passes `shift: event.shiftKey` in the click info for
the hardware tool (verify Shift is unused in the `'face'` pick; it is the
ortho modifier only in `'path'` picks).

**Double-click** on a hole centre (the viewport already wires `dblclick` →
`placementDouble`, `CadViewport.jsx` ~1325) = pick it (if not chosen) and
finish — one gesture for the single-bolt case. _Should; may be cut, report._

### 3.2 Finishing (Enter, the panel button, double-click)

`finishPlacement(draft, ctx)` for a hardware draft in Place with ≥ 1 chosen
hole (0 chosen → throw _Click the holes the hardware goes in first._) builds
the whole result in one pure step, **`finishHardware(draft, ctx)`**:

- `feature = draft.feature || { ...p.hardware, id: uid('hardware') }`;
- `newPart = draft.newPart || { ...createHardware(feature).part, features: [] }`
  (`operationModel` appends the feature, Phase J rule);
- one instance per chosen hole, in order: `{ id, partId: newPart.id,
position, rotation, visible: true }` with pose
  `frameToInstance(placeFrame(hole.point, hole.normal))` (seating plane on the
  face, bolts/studs into −Z — identical to today's single seat, so the pose is
  right even before the connection resolves). The first one **reuses
  `draft.newInstance.id`** when the draft already has one (Re-place keeps the
  selection); the others get fresh `uid('instance')`;
- `draft.newInstance` = the first, **`draft.extraInstances`** = the rest
  (`[]` for one hole) — every existing consumer of `newInstance`
  (`hostOperations`, `hostInstanceId`, selection in `changePlacement`,
  `applyOperation`'s `select`) keeps working untouched;
- `draft.connections` = one per hole, in the same order:
  `{ id: uid('connection'), type: 'concentric', from: instance.id, to:
hole.instanceId, fromFeatureId: feature.id, toFeatureId: hole.featureId,
...(hole.index > 0 ? { holeIndex: hole.index } : {}), offset: 0 }` (the
  Phase K rule: `holeIndex` omitted for 0 so a single hole's connection is
  byte-identical to today's);
- `placement = { ...p, stage: 'shape', frame: placeFrame(first.point,
first.normal), seat: { instanceId, partId, name } of the first hole, label:
faceLabel(first.normal), grid: first.faceFrame || frame, snapKind: 'hole
centre', hostInstanceId: newInstance.id, holes: p.holes, problem: '' }`.

`operationModel` appends `...(draft.extraInstances || [])` after
`draft.newInstance` (`operations.js` ~290). The worker then rebuilds once and
the preview shows every bolt seated.

### 3.3 Stage Shape (seated)

No handles (today's rule for a seated part: the slide square is only for a
free seat). Hint:

> Hardware: seated in 3 holes (concentric) · Re-place chooses the holes again · Enter applies · Esc cancels

(`seated in the hole you clicked (concentric)` is kept verbatim for one
hole — `placementCuts.test.js` and the Phase J hint text.) Blue rings stay at
the chosen centres (§5); the free single seat keeps today's prism ghost.

Placement line: `Hex bolt M6 in 3 holes on Board · holes 1, 2 and 4 of the
row` (`of the row` only when every chosen hole is in one row feature; plain
`in 3 holes on Board` otherwise; two instances → `on Board and Bracket`). One
hole keeps today's text exactly (`… · concentric with the hole`).

Panel (`OperationPanel.jsx`, hardware branch), in Shape **and** in Place:

- the `HardwareFields` sizes as today;
- a **Chosen holes** list (`<ul aria-label="Chosen holes">`): one row per
  hole — `Hole 2 of 4 · Board` for a row centre, `Hole · Board · Ø 6.6` for a
  single hole (diameter via `numeric(feature.diameter, parameters)`, 2 dp) —
  each with a `Remove` button (`aria-label="Remove hole 2 of 4 on Board"`).
  In Place, Remove = the toggle of §3.1. In Shape, Remove rebuilds the result
  (`finishHardware` again with the shorter list); removing the last one goes
  back to Place with `holes: []` and no feature (as Re-place);
- in Place: a primary button **Seat in N holes** (`N holes` → `1 hole`;
  disabled at 0) calling `onFinishPlacement` — the Loft "Finish sections"
  pattern (~157–165);
- in Shape, seated: **Axial offset (mm)** — one `ValueField` (object key
  `${draft.newPart.id}-offset`, Phase L live rules, `meta.live` respected)
  that writes the same `offset` into every draft connection. _Should._

Re-place (`replacePlacement`) → Place with `holes: []`. Two options for the
old result (feature, part, instances, connections): keep it so the preview
stays until the first new pick, then drop it on that first pick (the Phase H
rule for other tools), or drop it at Re-place. **Pick one, state which in the
report, and test it**; either way a half-chosen set must never preview stale
bolts after the first new pick.

Apply = `applyOperation` unchanged: `commit(draftModel)`, select
`newInstance.id`, no camera move, one history entry. Undo removes the part,
every instance and every connection in one step.

### 3.4 _Attach to selected hole_ (HardwarePanel)

- Selected feature is a single `hole` (no `row`): unchanged — immediate commit
  of one part/instance/connection, `setMoveMode(false)`, select it.
- Selected feature is a hole **row**: `beginOperation('hardware', null, {
hardware, preselect: { instanceId: selectedId, featureId: feature.id } })`
  opens Place with **every centre of that row on that instance already
  chosen** (`pickRowHoles(draft, preselect, ctx)` — a pure helper that reads
  `holeCentres(ctx)`; wired right after `createOperationDraft` in
  `beginOperation`, before `setOperationDraft`). The user removes any they
  don't want and presses Enter. Help text under the checkbox when the selected
  hole is a row: _Opens Place with every hole of this row chosen; remove any
  you don't want, then press Enter._ Keep the checkbox label **Attach to
  selected hole** (scripts locate it).

### 3.5 Keyboard and cancel

Place: Enter = finish (§3.2; the workspace key effect ~1393–1399 adds
`p.tool === 'hardware' && p.holes?.length` to the finish condition, next to
sweep/loft/row-seed); Esc = remove the last chosen hole (`stepBack`), Esc with
none chosen = cancel the operation (restoring selection/isolation as today).
Shape: Enter = Apply when `canApply`; Esc = cancel. Shift / Alt as Phase H §5
(Alt = no snapping, so Alt-click never picks a hole).

## 4. Data

### 4.1 Draft-only (never persisted)

```js
placement.holes = [
  // ordered by first click; identity key = `${instanceId}/${featureId}/${index}`
  { instanceId, partId, name, featureId, index, point, normal, faceFrame },
];
draft.extraInstances = [
  /* instances for holes[1..] */
]; // [] when none
```

`point`/`normal`/`faceFrame` come from the click info (world mm; `normal` =
the clicked face normal, outward). `name` as `seatOf` resolves it. `index` is
`info.holeIndex || 0`.

### 4.2 Persisted result of Apply (unchanged shapes)

```js
parts:       [..., { id, name: 'Hex bolt M6', material, features: [hardwareFeature] }]
instances:   [..., { id: i1, partId, position, rotation, visible: true }, { id: i2, … }, …]
connections: [..., { id, type: 'concentric', from: i1, to: 'plate-instance', fromFeatureId, toFeatureId: 'r', offset: 0 },
                   { …, from: i2, holeIndex: 1 }, { …, from: i3, holeIndex: 3 }]
```

Existing kernel, BOM, tree, drawings and `removeInstance` (drops the
connection with the instance, `model.js` ~112–117) handle this today — verify
each with a test, change nothing there unless a test fails (report it).

## 5. View and ghost

`hardwareView` (or its replacement in the new module, §8) adds for the
layer:

- `view.place.chosen` = `{ [key]: true }` and `view.place.chosenCount`, so
  the HUD can say _chosen · click to remove_; the layer builds the key from
  `holeAt()`'s candidate (`instanceId/featureId/index`);
- rings: `view.shape = { kind: 'rings', circles: [{ frame, radius }] }` — a
  new `ghostSegments` kind drawing circles only (the existing `'sections'`
  kind links consecutive circles with a line, which would read as a path).
  Drawn as `placement-ghost` in the tool colour (blue for hardware), in Place
  and in Shape when seated; the free single seat keeps the `'prism'`;
- the hover circle (`hoverCutShape`) unchanged.

The viewport test hook `cadPlacement()` (`placementLayer.js` `state()` ~1040)
gains `chosen: view.place?.chosenCount || 0` so scripts can assert the count.

## 6. Errors and edge cases (handle and test)

- Holes on two different instances (or two instances of one part): allowed;
  each connection targets its own instance; summary names both.
- A hole that already has hardware seated (an existing `concentric` connection
  to that `toFeatureId` + `holeIndex`): allowed (washers and nuts stack); the
  Chosen-holes row appends `· has Hex nut M6`. _Should._
- A chosen hole on an instance whose snapshot placement is missing →
  `seatOf`'s "Rebuild the model before placing on this part." at pick time.
- The saved model changes while picking → the existing `draftStale` guard
  ("Cancel and reopen").
- The hardware sizes change in the panel while holes are chosen (Place) →
  rings re-radius; in Shape → the existing field path (feature replaced,
  preview rebuilt), the connections untouched.
- Esc in Place with chosen holes never cancels; Esc at zero does.
- Double-click: the first click of the pair toggles; the `dblclick` finish
  must not toggle again (read the key off the hover, only add if absent).
- Preselect (§3.4) on a row whose instance has no snapshot yet → open Place
  with nothing chosen and the ordinary hint (no error).
- Apply with the camera zoomed off the fit: no camera move (Phase H rule; the
  browser script asserts it as `verify-cut-placement.mjs` ~210–231 does).
- Undo once after Apply: the part, every instance and every connection gone;
  Redo brings them all back.
- Kernel: N instances of one part reuse `build(partId)` (`kernel.js` ~200) —
  confirm in the kernel test that three concentric instances of one hardware
  part place at three different centres and no "Conflicting attachments"
  error is raised.

## 7. Downstream consumers (every one is touched or confirmed; report each)

| Consumer                                                                               | Change                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `operations.js` `operationModel`                                                       | appends `draft.extraInstances`                                                                                |
| `placementCuts.js` `placeHardware`                                                     | with chosen holes: toggle (§3.1); the single free seat path unchanged                                         |
| `placementTool.js` `finishPlacement` / `stepBack` / `replacePlacement`                 | hardware cases dispatch to the new module (one line each)                                                     |
| `placementCuts.js` `cutPlacementView` → `hardwareView`, `cutSummary`, `HINTS.hardware` | chosen rings, hints, placement line (§3, §5)                                                                  |
| `placementTool.js` `ghostSegments`                                                     | `'rings'` kind                                                                                                |
| `placementLayer.js`                                                                    | HUD "chosen · click to remove"; `shift` in the click info; `state().chosen`; double-click finish for hardware |
| `OperationPanel.jsx`                                                                   | Chosen holes list, Seat in N holes, Axial offset (§3.3)                                                       |
| `CadWorkspace.jsx`                                                                     | Enter-finish condition; `beginOperation` `preselect` option; `onAdd` row branch (§3.4) — wiring only          |
| `HardwarePanel.jsx`                                                                    | help texts (§3, §3.4); label unchanged                                                                        |
| `kernel.js`, `fabrication.js`, tree, drawings, `ConnectionEditor.jsx`                  | no change expected — confirm by test                                                                          |
| `docs/sketch-studio-cad.md` "Hardware and metric threads" (~422–447)                   | rewrite the Place paragraph (§9)                                                                              |

## 8. Architecture (Opus may deviate; flag it)

- New pure module **`placementHardware.js`** (~250–400 lines, LF):
  `HARDWARE_HINTS`, `holeKey`, `toggleHole(draft, info, ctx)`,
  `toggleRowHoles(draft, info, ctx)`, `pickRowHoles(draft, preselect, ctx)`,
  `finishHardware(draft, ctx)`, `removeChosenHole(draft, key, ctx)`,
  `hardwareStepBack(draft)`, `setHardwareOffset(draft, offset)`,
  `hardwareRings(draft, ctx)`, `hardwareSummary(draft, ctx)`, `holeLabel(hole,
ctx)`. `placementCuts.js` keeps `placeHardware`/`hardwareView` as thin
  dispatchers (or moves them in — your call; keep `placementCuts.js` under
  ~950 lines). Keep the module cycle-safe (import at use, as `placementRows.js`
  notes at its top).
- `placementTool.js`: `finishPlacement`, `stepBack`, `replacePlacement`
  (hardware branches), `ghostSegments` `'rings'`. Nothing else.
- `operations.js`: `operationModel` only; `OPERATION_HELP.hardware` text
  updated to mention choosing holes.
- `CadWorkspace.jsx`, `OperationPanel.jsx`, `HardwarePanel.jsx`: wiring and
  UI only (§7).
- `placementLayer.js`: HUD text, `shift`, `state().chosen`, dblclick.
- No new HUD element (one `.cad-placement-hud`, strict locators in
  `verify-measure-marks.mjs`). No camera refit anywhere.

## 9. Delivery, tests and verification

Order of work (report each as **done / partial / not done**, never silently
drop one):

1. `placementHardware.js` rules + `operationModel` + unit tests.
2. The tool: toggle, rings, HUD, hints, Enter/Esc, Seat button, Chosen list,
   Re-place, Apply; DOM tests.
3. Shift+click row, preselect from _Attach to selected hole_ on a row, Axial
   offset (should), double-click (should).
4. Kernel/BOM/undo confirmation tests. 5. Docs + browser script. 6. Re-run
   every browser script.

Tests (Vitest, run from the **repo root**, never from inside `cad/`; measure
and report the baseline file/test counts for `src/features/sketchstudio/cad`
and for `npm test` **before** changing anything, then the final counts; last
known baseline 2026-11-01: cad 44 files / 472 tests, full 378 / 4612):

- Unit — new `placementHardware.test.js`: toggle adds / removes / keeps order;
  a plain-face click with chosen holes throws the §3.1 message; with none
  chosen it seats as Phase J; `finishHardware` on 3 holes of a 4-row on the
  `world()` fixture of `placementCuts.test.js` (reuse its `placeDraft`,
  `face`, `world` helpers — export them from a small `placementCuts.fixtures.js`
  or duplicate; your call) → 1 part, `newInstance` + 2 `extraInstances`,
  poses at the three centres (`position` within 1e-6, rotation `[0,0,0]` on a
  top face), 3 connections with `holeIndex` 1 and 3 and none for 0, `from` ids
  distinct, `operationModel` has 3 new instances; `finishHardware` with one
  hole equals today's single-click output (`connections[0]` shape, hint text
  "seated in the hole you clicked"); `hardwareStepBack` removes the last and
  returns null at zero; `replacePlacement` → Place with `holes: []`;
  `removeChosenHole` in Shape rebuilds with N−1, last removal → Place with no
  feature; `toggleRowHoles` all-on / all-off; `pickRowHoles` chooses the four
  centres; `setHardwareOffset` writes every connection; `hardwareSummary`
  texts for 1 / 3 holes / two instances; rings = N circles in the face plane
  (compare the ring frame normal with the face normal within 1e-6) on a
  37°-turned board.
- `placementCuts.test.js`: the Phase J test "a click on a hole centre seats
  it…" becomes pick (Place, `holes.length === 1`, no feature) + `finishPlacement`
  → the same assertions; "seated in a hole of a row… holeIndex" likewise.
- `operations.test.js`: `operationModel` appends `extraInstances`.
- `kernel.test.js`: a 100 × 80 × 10 plate with a 3-hole row (pitch 30, +X) and
  **one** M6 bolt part with three instances, connections `holeIndex` 0/1/2 →
  each instance's resolved placement origin at its centre (extend "attaches
  cylindrical axes concentrically"); `buildCutList` quantity 3 for the bolt.
- DOM — `CadWorkspace.place.dom.test.jsx` (the `setup()` stand-in needs a
  board with a 4-hole row in its snapshot `features` as the viewport test
  ~735–755 builds): Add hardware → Place; `place(holeCentre(1))`,
  `place(holeCentre(3))` → still Place, `viewport.props.isolated === false`,
  panel lists "Hole 2 of 4 · Board" and "Hole 4 of 4 · Board", button "Seat in
  2 holes"; `place(topFace())` now shows the §3.1 error; Enter → Shape, status
  "Preview ready" (stand-in), hint seated-in-2; Remove hole 4 → 1 hole; Apply
  → `setCadModel` once, +1 part, +1 instance (after the removal) with
  `partId` of that part, +1 connection, `fitKey` unchanged, `selectedId` = the
  first instance; a second test: Esc in Place removes the last chosen, Esc at
  zero cancels (selection/isolation restored); a third: _Attach to selected
  hole_ with the row feature selected opens Place with 4 chosen; the existing
  "Add hardware without a hole to attach…" test keeps passing unchanged.
- `CadViewport.place.dom.test.jsx`: the Phase K row test still hands over
  `holeIndex: 2`; the HUD over a chosen centre contains "chosen"; `state().
chosen === 1`; `onPlace` info carries `shift: true` on a Shift+click; one
  `.cad-placement-hud`.
- Existing suites stay green: `kernel.test.js`, `operations.test.js`,
  `placementTool.test.js`, `placementCuts.test.js`, `placementRows.test.js`,
  the Phase I/J/K/L suites, `CadWorkspace.live.dom.test.jsx`.
- Browser (Playwright, Chrome, `CAD_VERIFY_URL=http://localhost:5180/sketch`,
  reuse `scripts/sketch-cad-steps.mjs`; recipe in
  `scripts/verify-cut-placement.mjs` — read saved positions, never assume the
  origin; the dev server may listen on `[::1]` only — use `localhost`):
  new **`scripts/verify-hardware-holes.mjs`** — board → Hole row (4 holes,
  pitch 50, as `verify-hole-row.mjs` places it) → Apply → Hardware library →
  type bolt, size M6, attach unchecked → Add hardware → top view → click the
  centres of holes 1, 2 and 4 (`cadProject` of `position + k·pitch·direction`
  read from the saved feature) → `cadPlacement().chosen === 3`, HUD contains
  "chosen" over hole 2 → click hole 2 again → `chosen === 2` → click it once
  more → 3 → Enter → "Preview ready" → placement line contains "in 3 holes"
  → zoom off the fit → Apply → saved model: parts +1, instances +3 sharing
  one `partId`, connections 3 with `holeIndex` 1 and 3 and none on the first,
  camera held (probe moved ≤ 0.5 px) → Undo → parts/instances/connections
  back to the pre-Apply counts → screenshots to
  `artifacts/sketch-cad/hardware-holes/`. Then re-run **all** of:
  `verify-hole-row`, `verify-cut-placement`, `verify-hole-hardware`,
  `verify-direct-placement`, `verify-measure-marks`, `verify-start-sketch`,
  `verify-sketch-cad-editing`, `verify-sketch-cad`, `verify-sketch-cad-offline`
  (Chrome half; its Electron half fails from Phase H — report, do not chase).
  The New confirm is an in-app dialog.
- Docs: `docs/sketch-studio-cad.md` "Hardware and metric threads" — replace
  the "Without a selected hole…" paragraph (~440–446) with the pick flow
  (click the holes, click again to remove, Shift+click a row, Enter / Seat in
  N holes, one part with N instances and N connections, the Chosen holes list,
  Axial offset, the single free seat on a face or the ground); note that
  _Attach to selected hole_ on a row pre-chooses the whole row. One sentence in
  `docs/sketch-studio-step-by-step.md` where hardware is first added (grep
  "Add hardware"; if the guide never adds hardware, say so and skip). Plain
  prose, no marketing.

Process rules (from earlier phases):

- Do **not** commit; the tree holds uncommitted Phase G–L work the user will
  commit. Stay inside `src/features/sketchstudio/cad/`, `scripts/`, `docs/`
  unless wiring requires it; say so if you leave them.
- Match each existing file's line endings: `CadViewport.jsx` and `kernel.js`
  are CRLF in the working tree; `CadWorkspace.jsx`, `OperationPanel.jsx`,
  `HardwarePanel.jsx`, `operations.js`, `hardware.js`, `CadEditors.jsx`,
  `kernel.test.js`, the docs and the untracked `placement*.js` /
  `*.place.dom.test.jsx` files are LF (check with `git ls-files --eol` for
  tracked files and a byte check for untracked ones; do not trust
  `grep -c $'\r$'` in Git Bash). New files LF.
- `utils/` imports are extensionless and Node cannot load them; keep any new
  Node-run script importing only `.js`-suffixed paths.
- Run `npm run lint` and the full `npm test` at the end; report exact counts.
  Stop any Vite server you start and confirm nothing listens on 5180.
- Flag every judgment call beyond this spec in the final report, with
  file:line anchors for each claim so the audit can verify them.

## 10. Acceptance checklist (used for the audit)

- [ ] Add hardware → Place: clicking three hole centres keeps Place, draws
      three blue rings, HUD says "chosen · click to remove" over one, the
      panel lists them and offers "Seat in 3 holes"; a plain-face click shows
      the §3.1 error; clicking a chosen hole removes it.
- [ ] Enter → Shape with one new part, `newInstance` + 2 `extraInstances`,
      3 concentric connections (`holeIndex` 1 and 3, none for 0); preview shows
      three bolts seated; no handles; hint "seated in 3 holes".
- [ ] Apply → saved model +1 part, +3 instances (one `partId`), +3
      connections; camera held; BOM quantity 3; one Undo removes all.
- [ ] One hole: pick + Enter yields exactly today's single-seat result and
      texts; the free single seat on a face / ground is unchanged (slide
      square, Phase J tests green).
- [ ] Shift+click on a row centre toggles the whole row; _Attach to selected
      hole_ on a row opens Place with the row pre-chosen; on a single hole it
      commits at once as before.
- [ ] Esc removes the last chosen hole, then cancels; Re-place chooses again;
      Remove in Shape rebuilds; Axial offset (if built) writes every
      connection.
- [ ] No `CAD_VERSION` change; one `.cad-placement-hud`; `npm run lint` 0
      errors; all 10 browser scripts pass (Electron half of the offline script
      excepted).

## 11. Out of scope (do not build unasked)

Choosing holes before opening the Hardware library (tree multi-select);
automatic nut/washer stacks on the far side; matching the hole diameter to the
thread size (warnings only if trivially available — report, don't design);
editing an existing bolt group as a group after Apply (each instance is an
ordinary part instance); hardware on pockets; patterning hardware without
holes.
