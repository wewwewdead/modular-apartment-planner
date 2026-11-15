# Sketch Studio shop floor (guided route, assemble, kiosk-class parts, replay)

Status: spec, 2026-11-13. Follows `docs/sketch-studio-fab-shop.md` (SM-1 … SM-4,
built). Build in phases SF-1 … SF-5 (§9). Each phase is one builder run and is
audited before the next starts.

> **2026-11-14: the Assembly station (SF-2) and the Weld station were removed**
> by `docs/sketch-studio-shop-trim.md` (ST-1). The route is Draw → Cut → Bend →
> Paint → Print, numbered 1–5; parts are put together with Move part, Rotate
> part, Mate faces and Group, and Shop → More → Add bought-in item… replaces
> the station's bought-in form. `model.assembly` is gone (an old file drops it
> on load), the replay has no weld or assembly scenes, and the job sheet has
> no Weld or Assemble step. What follows is the history as specified and
> built; read the assembly station's parts of it as such.

## 1. What the user asked for

They sent a photo of a kiosk their shop makes (a welded sheet-metal A-frame:
tall face frames with return flanges, two windows and a crease, inner shelves,
rows of fastener holes) and its design proposal (screens, white covers, a
printed logo). They want that kind of product to go through the simulation:
**draw → laser cut → bend → paint → print → assemble**, and they want the
interface "more intuitive and easy to use".

Three things are missing today:

1. **The interface is a tool list, not a shop.** The Shop tab is eleven equal
   buttons; most refuse with an error line unless the right part is selected
   first; the panels lead with engineering readouts; nothing shows where a
   part is on its route.
2. **There is no assemble step.** The route ends at Print.
3. **A kiosk-class part does not get through the press brake.** Measured
   2026-11-13 with a probe (face frame 600 × 1400, t 1.5 SPCC, 40 mm return
   flanges on four sides, two windows, a 12° crease, the side flanges notched
   at the crease): `foldSheet` folds it (8 pieces, 7 bends, 13 ms), but
   `sequenceChecks` refuses 4 to 6 of the 7 hits in every order tried (die
   collisions on the approach, the ram at 68.5°), and a notched flange made in
   one stroke followed by the crease is refused by the solver with a wrong
   "Bends 1 and 2 close a loop" (§6.1).

## 2. Principles

- **The route is the interface.** One line of stations in shop order; the
  open station is the only thing asking for input; every station ends with
  one primary button and a way to the next station.
- **No dead ends.** A station never answers with only an error line. If it
  cannot start it says what is missing and offers the button that fixes it.
- **Results before numbers.** What a station made (sizes, time) is always on
  show; the machine's numbers are one click away, not gone.
- The process-first model of the fab-shop spec stands: the flat blank is the
  part, bends are machine hits, weld / paint / print / assembly are records.
  Nothing here unfolds a 3D shape.
- `CAD_VERSION` stays 1; every new key is optional.

## 3. What was read (contracts this must match)

Line numbers are of 2026-11-13; bare numbers are `cad/CadWorkspace.jsx`.

- Ribbon: `tabs` (175); the flat `commands` list (2645–3022), Shop entries
  2789–2881; rendered at 3540–3564, filtered by `search` or `c.tab === tab`,
  **all disabled while `brakeSession` or `shopSession` is set** (3549–3557).
  Search finds commands by label across tabs.
- Station state: `brakeSession` (503), `brakeBlocked` (505), `shopSession`
  (511, weld / paint / print / laser), `sheetFlat` (520). Openers
  `openPressBrake` (1565), `openShopStation` (1721), `startWeld` (1742),
  `startPaint` (1753), `startPrint` (1762), `openLaser` (1772),
  `toggleUnfold` (780); closers `leavePressBrake` (1604), `leaveShopStation`
  (1850), `resetSelectionTools` (892, run by every `select`).
  `openLaser` / `openPressBrake` / Add bend read the render-derived
  `sheetFeature` (610) and throw "Select a sheet-metal part first (Shop → Cut
  from sheet makes one)." when the selection is not one sheet-metal part; a
  selected group (the state right after an example loads) refuses too.
- Right pane: one ternary on `panel` (4416–5719); shop branches 4858–4967.
  A laser session whose `laserStation` returns `error` has **no branch**: the
  pane falls through to the part form with the ribbon still disabled and no
  Leave button (only Esc).
- Left pane: `.cad-tree` (3566), body a `<fieldset>` disabled while a tool
  runs (3574); rows from `treeRows(model)`; no per-part status slot.
- Overlays: `FlatPatternMap` (4183) and `LaserBed` (4193) are children of
  `.cad-model-view`; `BrakeSideView` is inside `CadViewport` (2512).
- "Is another tool active" is hand-listed in twelve places
  (`docs/state-machines.md:413` names eight; also the tree fieldset 3576, the
  reopen effect 1163, `runningTool` 747, `resetSelectionTools` 892).
- `cad.css` (LF) has no tokens beyond `--cad-border`; accent `#287fb3`,
  selected `#dcecf5` / `#185d89`, panels `#f8fafb`; disabled = opacity 0.4.
- Pinned by tests: the exact eleven Shop ribbon labels in
  `CadWorkspace.shop.dom.test.jsx:89–107` and in
  `scripts/verify-fab-shop-sm1.mjs:72`, `sm2:78`, `sm3:190`, `sm4:102`; the
  ribbon button being disabled while a station is open
  (`CadWorkspace.stations/laser/brake.dom.test.jsx`); the `.cad-status`
  strings of `SHOP_STATUS` (246); every "Leave …" button label; panel region
  names ('Press brake', 'Weld station', 'Paint booth', 'Print station',
  'Laser station', 'Job sheet', 'Cut from sheet').
- Solver `cad/sheetMetal.js`: `foldSheet` (603) — a bend folds every interval
  its segment touches (620); `joinPieces` (449) lumps all pieces beside one
  bend into one hinge, so a bend whose intervals join **different** piece
  pairs makes any later bend between those pieces a "loop" (485–490).
- Brake: `brakeStation` (brakeStation.js:79) builds one pending bend from the
  gauge edge (`gaugeBendLine`, pressBrake.js:124, always the whole line) or
  two points; `assessBend` (pressBrake.js:205) returns `refusals: [{ code,
message }]`; `sequenceChecks` (brakeStation.js:263) checks bend by bend.
  `toolingSections` (brakeCollisions.js:331): the punch spans the bend, the
  **ram, die and bed span the whole bed**, the ram starts at the punch's top
  (`tipZ + punch.height`, 66.5 mm for the straight punch).
- Catalogue `cad/shopCatalog.js`: `PUNCHES` (110), `DIES` (141), machines
  (`brake`, 226; `beam: 60`).
- Mates, hardware, groups, job sheet, model lists, exploded view: §5.1.

## 4. SF-1 — The shop floor (no model change)

### 4.1 Route bar

On the Shop tab, with the search box empty, the ribbon row shows the route
instead of the command buttons: `<nav class="cad-route" aria-label="Shop
route">`, an ordered list of station buttons joined by chevrons, then a
**More** menu at the right end.

| #   | Station | Opens                             | Chip status for the current product |
| --- | ------- | --------------------------------- | ----------------------------------- |
| 1   | Draw    | the Draw panel (§4.4)             | "3 outlines" / "—"                  |
| 2   | Cut     | the Cut panel or the laser (§4.5) | "2 blanks"                          |
| 3   | Bend    | the press brake                   | "6 hits" / "flat"                   |
| 4   | Weld    | the weld station                  | "4 seams" / "—"                     |
| 5   | Paint   | the paint booth                   | "RAL 7035" / "1 of 2"               |
| 6   | Print   | the print station                 | "2 prints" / "—"                    |

(SF-2 appends 7 Assembly.) Each button: number, icon (the existing `Shop*`
icons), name, and under it the status with a mark: done (filled, green),
part done (half), not yet (hollow). The open station has
`aria-current="step"` and the accent underline of the tabs. Accessible name =
the station name alone ("Bend"), status in `aria-description`.

More: Add bend by numbers, Unfold / Fold, Job sheet, Flat pattern sheet,
Example: pump bracket, Example: control box. They run the existing commands.
The eleven `commands` entries stay in the list (search still finds them by
their present labels).

Enabled rules: station buttons are disabled only while a non-shop tool is
open (`operationDraft`, `sketchSession`, `mateSession`), while `busy`, or
while a stroke (`brakeSession.stage === 'stroke'`) or a laser cut
(`stage === 'cutting'`) runs. **With a shop station open the other stations
stay enabled**: clicking one leaves the open station and opens that one.
Clicking the open station's own button does nothing.

Progress comes from a new pure module `cad/shopRoute.js`:

- `ROUTE` — the ordered station list (key, name, icon, panel region name).
- `routeProgress(model, productId)` → per station `{ status: 'done' |
'partial' | 'todo', text }`, by the job sheet's rules
  (`docs/sheet-metal-shop-guide.md` §8, since SF-4 "More · Job sheet": Cut — every part is a cut blank;
  Bend — at least one hit; Weld — at least one seam; Paint — every part has a
  finish; Print — at least one print). Test: for both shop examples it equals
  the step statuses of `jobSheet(model)`.
- `partProgress(model, instanceId)` → the same per part, plus `next` (the
  first station in route order not yet done that applies to a single part;
  Weld and Print are never `next`).
- `stationEntry(model, { station, subject })` → `{ open: { instanceId } }` |
  `{ pick: [instanceId…] }` | `{ blocked: { message, go } }` (§4.3).

The **current product / part** (`shopSubject = { productId, instanceId }`,
workspace state) follows the selection whenever it is not empty, survives the
selection being cleared by a station (weld, paint and print clear it,
1734–1737), and is dropped when its nodes are gone. With no subject and
exactly one product, that product is the subject.

### 4.2 Job board

On the Shop tab the left pane heading gains a two-way switch **Job | Tree**
(default Job on this tab; other tabs always show the tree). Job lists every
product (`jobProducts`) and under it its sheet-metal parts as rows: a flat
outline thumbnail (the blank's `profilePolygon`, 40 px, memoised per sketch),
the name, "t 1.5 SPCC · 205.7 × 145.7", six pips (one per station, the marks
of §4.1) and "Next: Bend". Other parts of the product are one line ("3 other
parts — see Tree").

Clicking a row makes that part the subject. With no station open it selects
the part. With Cut or Bend open it moves the station to that part. With Paint
open it becomes the paint target. With Weld or Print open the rows are inert
(those stations pick in the viewport) and say so in `title`. The board is
never disabled as a whole.

### 4.3 Entering a station

`goStation(key, { instanceId } = {})` is the one way in (route buttons, job
board, Next / Back, the gate's buttons):

1. Refuse while a stroke or a cut runs.
2. Leave the open station (keep `shopSubject`).
3. `stationEntry`:
   - **open** — start the station on that part / product.
   - **pick** (Cut, Bend with several candidate parts and none chosen) — the
     right pane shows the station's header and a list of the product's parts
     with their state ("flat · no bends yet", "4 bends"); one click chooses.
     A single candidate is chosen without asking.
   - **blocked** — the pane shows the reason and one button:
     Bend / Cut with no blank → "Nothing to bend yet: cut a blank first."
     [Go to Cut]; Weld / Paint / Print with no part → the same toward Draw;
     the model still rebuilding → the station opens when it is current (no
     "Wait for the model to rebuild first." line); the press brake's
     shop-order block keeps its present panel.

The messages the openers throw today for these cases must no longer reach
`.cad-error` from the route. Trap: `openLaser` and `openPressBrake` read
`sheetFeature` / `selectedId` of the current render, and `select()` closes
every station (`resetSelectionTools`). Give the openers an explicit instance
(derive part, feature and fold from `draftModel`), or queue
`{ station, instanceId }` and open after the selection has committed; never
call `select()` after opening. Add the missing laser error branch (§3) with a
Leave button.

Every new "is a tool active" check uses `runningTool` / `activeTool`; do not
add a thirteenth hand-written list.

### 4.4 Draw station (panel `shop-draw`, region "Draw")

"What are you making?" — tiles, each one sentence:

- **Rectangle** — W × H, straight to Cut.
- **Flanged panel** — SF-3 (§6.3); the tile is absent until then.
- **Draw the outline** — starts a sketch on the XY plane at the origin with
  the existing sketcher; saving it comes back here with that sketch chosen.
- **From the 2D drawing** — the closed profiles of the drafting view (the
  present "2D drawing" source of `CutFromSheetPanel`, with its nesting rule
  and its skipped-loop report).

Below: "Outlines ready to cut" — closed XY sketches no part is cut from yet,
each with its size and [Cut this]. Footer: Next: Cut →.

Switching to the Shop tab with an empty model opens Draw (the precedent is
the Drawings tab opening `sheets`, 3520–3526). The sketcher's finished panel
(4733) gains "Cut from sheet →" for a closed sketch on XY.

### 4.5 Cut station

- An outline with no part yet (from Draw): the panel (keep region name "Cut
  from sheet") shows the outline, stock and thickness (`StockFields`), blank
  size, and the primary button **Cut on the laser**. It creates the part
  (`cutFromSheet`, 1017) and goes straight into the laser on it with the cut
  animation already running; when the kernel is still rebuilding, the laser
  opens as soon as it can without a message. One click: the user sees the
  head cut the blank, then the blank on the floor.
- A blank that exists: the laser station as today (sheet, quantity, Cut to
  watch again, Etch bend lines).

`CutFromSheetPanel`'s source choice moves to Draw; its stock part stays here.
The search-only command "Cut from sheet" opens Draw.

### 4.6 Station shell

A `StationShell` component wraps every station panel (cut, laser, brake,
weld, paint, print; later assemble):

- **Header** — "3 · Bend" and the subject's name.
- **Body** — the station's present content, in this order: the stage steps
  (the existing lists, current one marked), the inputs, problem cards, the
  result readouts, the primary button (full width, 40 px), then a
  `<details class="cad-shop-numbers">` **Machine numbers** (closed by
  default; its open state per station is remembered in `localStorage`, read
  and written inside try/catch).
- **Footer** — ← Back: _previous station_ · the existing "Leave …" button
  (label unchanged) · Next: _next station_ →. Back / Next call `goStation`
  with the same subject.

On show vs. under Machine numbers:

| Station     | On show                                          | Machine numbers                                                                           |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Cut / laser | blank size, cut time, sheet use                  | cut length, pierces, speed, kerf, narrowest web                                           |
| Bend        | both flange (outside leg) lengths, the force bar | inside radius, allowance, deduction, backgauge L, ram depth, springback and bend-to angle |
| Weld        | seam length, weld time (or tack / spot count)    | gap against the process limit                                                             |
| Paint       | painted area, powder mass                        | coverage, cure schedule                                                                   |
| Print       | artwork size                                     | —                                                                                         |

A readout that carries a refusal or a warning is never hidden: refusals,
warnings and collisions render as **problem cards** above the primary button
(what is wrong, then the remedy sentence the station already writes). Where
the remedy is one field, the card has a button: `assessBend` adds an optional
`fix: { label, session }` to `short-leg` (the die `dieForLeg` finds) and
`tonnage` (`widerDie`); the card's button applies the session patch. Other
refusals keep text only.

### 4.7 Look

Add a small token block on `.cad-workspace` (`--shop-accent: #287fb3`,
`--shop-done`, `--shop-todo`, `--shop-warn`, `--shop-card`) and use it for
everything new; do not recolour existing rules. Route buttons ≥ 44 px tall,
13 px names, 11 px status; the bar scrolls horizontally below 1100 px without
wrapping. Panel instruction text 13 px; nothing new below 11 px. Marks carry
shape as well as colour (filled / half / hollow). Focus rings visible on
every new control. No animation on the route bar itself.

### 4.8 Tests and scripts

- `shopRoute.test.js` (progress, entry, both examples), dom tests for the
  route (order, names, `aria-current`, enabled rules, More), the job board,
  the gate (pick, blocked, no `.cad-error`), Draw → Cut → laser auto-run,
  Back / Next, the numbers disclosure, a `fix` button.
- The pinned eleven-label assertions become route assertions (six station
  names; seven after SF-2). Add `shopStation(name)` and `shopMore(name)` to
  `scripts/sketch-cad-steps.mjs` and move the four `verify-fab-shop-sm*.mjs`
  scripts onto them; **all four must still pass end to end** (they open
  Machine numbers where they read a hidden readout). Keep every other pinned
  label, region name and status string.
- `scripts/verify-shop-floor-sf1.mjs`: from an empty workspace, Shop tab →
  Draw opens by itself → Rectangle 120 × 80 → Cut on the laser (the head
  runs, the part appears) → Next → Bend twice → Next → Weld is reachable →
  Paint → Print; load Example: control box and open Bend with the group
  selected (the part list, no error line); Bend on an empty model (blocked
  card → Go to Cut). Screenshots of every station at 1600 × 1000 and 1366 ×
  768 into `artifacts/sketch-cad/shop-floor-sf1`.
- `docs/state-machines.md`: the route (which station may follow which, what
  leaves), `shopSubject`, the gate.

## 5. SF-2 — Assembly station

Route station 7, named **Assembly** (the ribbon already has an "Assemble"
tab of modelling tools; a second button of that name would be ambiguous).
Painted parts, bought-in items and fasteners come together in ordered steps.

### 5.1 What exists (read 2026-11-13)

- A mate (`mate.js`, `MATE` session) only moves an instance; nothing is
  stored. `pickedFace` (CadViewport.jsx:2850) gives a world face frame; the
  shop stations' `faceTarget` (:1535) adds the part-frame point.
- A fastener is an ordinary part (`createHardware`, hardware.js:1428: one
  `hardware` feature, seating plane Z = 0, shank into −Z) plus one instance
  per hole, each held by a `concentric` connection to **one** host hole
  (`finishHardware`, placementHardware.js:258–322; kernel.js:706–776). The
  kernel allows one non-weld attachment per instance (kernel.js:699). No
  record says what a fastener clamps.
- **Only `hole` features take hardware**: `holeCentres`
  (placementCuts.js:302) needs `metrics[feature].cut`, and `getAxis`
  (kernel.js:714) accepts `hardware / cylinder / hole / member`. A round
  cut-out of a sheet-metal blank — every hole of a kiosk — cannot take a
  screw today (the sheet-metal metrics are `{ sheet }`, kernel.js:463).
- Kinds on hand: 22 screws, nuts, washers, hex standoffs, self-clinching
  nut / standoff / stud, blind rivet nut and stud, 15 rivets. No weld studs,
  feet or plain spacers.
- No notion of a bought-in part. A `box` part gets a cutting profile and is
  nested as plate in the workshop ZIP (kernel.js:1131, exports.js:139).
- Every top-level node is a job-sheet product (`jobProducts`,
  jobSheet.js:45), a lone bolt included. Cut counts all parts (`status(
sheetParts.length, n)`), so one bolt or box in a product leaves Cut and
  Paint "partial" for good. `JOB_STEPS` has five entries; `productRoute`
  builds five `step()` calls (183–210); `done` = every step done (215);
  `JobSheetPanel.jsx:57` says "All five steps done".
- Exploded view is `group.position.z += index * 85` (CadViewport.jsx:2176).
  Hide / show writes `instance.visible` and so rebuilds the kernel; never
  use it for step visibility.
- A new kernel-inert list touches: `emptyModel`, the id loop
  (model.js:156–168), a validator beside `validateShopRecords` (223),
  `removeInstance` (388), `KERNEL_INERT_KEYS` (22), `kernelPayload` (64, both
  places).
- Shop order today: `shopOrderBlock` (brakeStation.js:35), `weldBlock`
  (weldStation.js:300), paint removes prints (paintStation.js:90).
- Shop layer: everything it draws is outside `ctx.group`; kernel group poses
  are rewritten by the viewport's pose effect (CadViewport.jsx:2140–2233) on
  every model / snapshot / selection change, skipping only `ctx.drag`.

### 5.2 Data (all optional, kernel-inert unless said)

```js
model.assembly = [
  // steps, in the order performed
  {
    id,
    name: 'Fit the lower cover',
    instanceIds: [], // the parts this step brings on
    fasteners: [], // hardware instance ids this step installs
    from: null | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom', // approach; null = automatic (§5.5)
    note: '',
  },
];
part.purchased = { colour: '#22262a', reference: '' }; // a bought-in item (kernel input like the rest of `parts`)
```

`removeInstance` takes the id out of every step and drops a step left with
neither parts nor fasteners.

### 5.3 Fasteners in laser-cut holes (kernel)

- `sheetMetal.js`: `blankHoles(fold, profile, params)` → for every circular
  cut-out lying wholly inside one rigid piece: `{ index (its place in the
profile's circle list, as `profileCircles` in laserStation.js:275 counts
them), diameter, centre, direction }` in the folded part frame — centre on
  the piece's top face (flat z = t), direction into the sheet. A circle in a
  bend zone is left out.
- Kernel: the sheet-metal feature's metrics gain `holes` (those rows) and
  `exits` (the thickness for each). `getAxis` accepts `sheetmetal` with
  `holeIndex`, `side: 'far'` seating on the bottom face. `holeCentres` lists
  them as attachable candidates with their radius. Nothing else about
  hardware changes: same connection row, `toFeatureId` = the sheet-metal
  feature.
- A blank whose circles change order moves its fasteners (positional index);
  say so in the guide.
- Test with real OpenCascade: a 100 × 60 blank, two Ø4.5 holes, one 90° bend
  between them; an M4 screw seats in each (entry and far side) within 0.01
  mm of the folded hole axis.

### 5.4 Bought-in items and what counts as fabricated

- Station command **Add bought-in item**: name, W × D × H, colour → a `box`
  part with `purchased`, dropped at the view centre. The viewport shows it in
  `purchased.colour`; no finish row.
- Fabricated = not bought-in and not hardware. Job sheet Cut and Paint count
  fabricated parts only (this also unsticks "partial" for products with
  bolts). `jobProducts` skips top-level nodes made only of hardware. The cut
  list notes "Bought in"; the workshop ZIP gives bought-in parts no cutting
  profile and does not nest them.

### 5.5 The station (session `assembly` in `shopSession`, table `ASSEMBLY`)

`idle → parts → place → fasten → parts`, Esc one stage back, then leave.
The panel shows the product's steps in order and, below, the step being
made:

1. **What goes on** — click parts in the viewport or the job board; or Add
   bought-in item. The first step of a product is its base (usually the
   weldment).
2. **Put it in place** — three aids; each commits an ordinary, undoable
   move of the step's parts:
   - _Sit on a face_: click a face of the part, then the face it sits
     against (`mateTransform`).
   - _Line up holes_: click a hole on the part, then the hole it lines up
     with on the product: axes made one, the two faces brought together. A
     second pair takes out the spin about the first axis. New pure function
     beside `mateTransform`, tested by numbers. Holes are the §5.3 candidates
     and `hole` features alike.
   - _Nudge_: the move / rotate gizmo on the step's parts.
     "It is already in place" skips the stage.
3. **Fasten** — choose a fastener (kind and size from the hardware
   catalogue, a small recent list first; default an M4 pan-head machine
   screw) and click holes; each click seats one (the pure part of
   `finishHardware` factored out and shared with Add hardware, not copied).
   "No fasteners" is a valid answer (it hooks on, tape, welded).
4. **Add step** writes the step, and puts its parts and fasteners in the
   product's group (creating a top-level group named by the user, default
   "Product N", when the base is a lone part or a weldment; a weldment stays
   a nested group). Group moves do not rebuild the kernel.

Step rows: number, name (click to rename), "2 parts · 4 × M4 × 10 pan head",
▲ ▼, Show, Remove (the record; a tick box also removes its fasteners).

View while the station is open:

- **Build-up**: a stepper "Show up to step k of n"; parts and fasteners of
  later steps are hidden through the shop layer (a view mask, not
  `instance.visible`).
- **Show** plays one step: its parts come in along `from` from a clear
  distance, then each fastener along its own axis, about 1 s in all. No
  kernel rebuild and no React render per frame.
- Automatic `from`: with fasteners, the side their heads face; otherwise the
  axis from the product's centre to the parts' centre, snapped to one of the
  six sides.

Checks, as problem cards (warnings unless said):

- a fabricated part without a finish → "not painted yet: the shop paints
  before assembly" [Go to Paint];
- a fastener whose axis meets a hole of only one part of the product
  (derived: every hole centre within 0.2 mm of the axis along the fastener's
  length) → "fastens nothing";
- **Check fit** runs the kernel's `inspect` and lists clashes between the
  product's parts by name, pairs with a fastener left out;
- shop order: `shopOrderBlock` and `weldBlock` also name assembly steps
  ("take it out of step 2 first", one click removes it from the step).

Job sheet: sixth step **Assemble** — one item per step with its parts and
fasteners; time = `ASSEMBLY_PART_S = 30` per part + `ASSEMBLY_FASTENER_S =
15` per fastener (estimates, said so like the other two). Status: `none`
("not needed") for a product that is one fabricated unit with nothing else;
`done` when it has a step and every bought-in item and fastener of the
product is in one; else partial / todo. A product is done when every step
that is not `none` is done; the panel says "All steps done". The control box
example gains one step (the lid onto the body, no fasteners). The route bar
and job board get the seventh station.

Script handle: `cadShop().assembly = { steps, shownTo, playing }`.

### 5.6 Tests and script

Unit: `blankHoles`, the hole line-up maths, step validation and cascade,
progress and job-sheet statuses (bolts no longer leave Cut partial), the
clamp derivation. Kernel test §5.3. Dom: the station's stages, Esc, the
steps list. `scripts/verify-shop-floor-sf2.mjs`: two 200 × 150 plates with
four laser-cut Ø4.5 holes, the second with two 20 mm flanges → paint both →
Assembly: base step; second step, Line up holes with two pairs, four M4
screws, Add step → the job sheet shows Assemble done with four fasteners →
Show plays → Build-up at step 1 hides the cover and screws → reload.

### 5.7 SF-2 as built (2026-11-13)

Where the build had to choose (each named in the builder's report):

- **Base.** Parts of a product in no step are "already there": the control
  box's one step brings the lid on and the body is its base without a step
  of its own. In the station a product's first step is its base and is added
  straight from What goes on (`ASSEMBLY` `parts --ADD--> parts`); the station
  opens with the base chosen when the product is one part or one weldment.
- **Grouping.** A group needs two children, so the product group is made by
  the second step (the base's top node, a weldment nested, plus the step's
  parts and fasteners), named in the Fasten stage (default "Product N").
- **Line up holes** seats the moving part by its opening that faces the
  target (a cover's underside onto a frame's top), so clicking the visible
  top opening never turns a part over. Each pair commits; the second pair is
  resolved again from the rebuilt model, so it only takes out the spin.
- **Sit on a face** with two faces already looking the same way rests the
  part on the target plane (its lowest point) instead of turning it over.
- **Fasten** commits each fastener when it is clicked (it is a part: one
  rebuild each); one hardware part per kind and size per station visit,
  many instances. A step may be fasteners only ("Only fasteners →").
- The job sheet's Weld and Print still have no `none`: a product that is not
  welded or printed keeps those steps "Not yet done", so "All steps done"
  needs them (as before SF-2); only Assemble is `none`. (Changed in SF-3:
  Weld and Print are `none` too, §6.5.)

## 6. SF-3 — Kiosk-class parts

### 6.1 One bend per hinge, one stroke may make several

Rule: **a bend record is one hinge** (one piece pair). A punch line that
crosses several separate tabs makes one bend per tab in a single stroke.

- `sheetMetal.js`: `strokeBends(feature, profile, params, line, { skip })` →
  `[{ a, b }]` or throws. It clips the line to the material, takes the
  intervals the segment touches minus `skip` (indexes along the line), cuts
  the blank by the existing bends' strips and this line's, and groups the
  intervals by the (minus piece, plus piece) pair they join. One line per
  group, running just inside the group's first and last interval. Intervals
  of another group lying inside a group's run → error "These tabs interleave
  on the line: bend them one at a time (two points)."
  A window crossing the line (same pair twice) stays one bend, as today.
- A bend may carry `stroke: '<id>'`, shared by the bends one stroke made
  (absent = its own stroke). Members are contiguous in `feature.bends`.
  `normalizeModel` keeps the key. Old files (a comb as one bend) load and
  fold unchanged; only new hits are split.
- Station (`brakeStation`): the pending hit is a list of bends
  (`PENDING_BEND`, `PENDING_BEND:2`, …). A stroke is refused unless its
  members' bend axes are collinear and their fixed faces coplanar **in the
  part's present folded state** (0.01 mm, 0.01°): "The sheet is already bent
  between these flanges, so they are no longer in line. Bend them one at a
  time: click a segment on the flat blank to leave it out."
  Force = the sum over members; span = the union; the legs are listed per
  member when they differ. The pedal commits all members with one new stroke
  id.
- `brakeCollisions` takes the stroke's bend ids: every member's zone is the
  working zone, all members move through the angle together, the moving side
  is every piece beyond any member. `sequenceChecks`, the sequence list
  (Re-run, Earlier, Later, Remove), the stroke animation and the job sheet's
  hit count and bend time work **per stroke**; a row reads "2 · UP 90° R1.6 ·
  2 flanges". The bend table of the part form, the flat drawing's bend table,
  the etched marks and the DXF stay per bend. Editing or moving one member in
  the part form drops its `stroke` key.
- Add bend by numbers uses `strokeBends` too.

Tests: the probe's four cases (one-stroke notched flange alone; then a
crease; crease first then the flange line → the "no longer in line" refusal
at the brake, two separate bends by two points accepted; split flanges then
crease) and a comb of three tabs (three bends, one stroke, same folded
bounds as the old single bend).

### 6.2 Tooling set-up

- **Segments on the flat blank.** With a line chosen, `FlatPatternMap` draws
  its intervals as segments; clicking one leaves it out of the hit
  (`session.skip`, reset when the line changes) — the punch and die sections
  are taken out there. The control-box front wall is then one gauge pick
  with the two flange ends clicked off, no typed points.
- **Etched lines are clickable.** Clicking an etched mark on the card sets
  the punch line on it. A mark may carry `bend: { angle, direction }`
  (optional keys, kept by validation); clicking such a mark also sets the
  angle and Flip sheet.
- **Sectional die.** In `toolingSections` the punch and the die become lists
  of X ranges: one per run of kept intervals (a gap with no material does not
  break a run; a skipped interval does). The bed stays the bed's length under
  the die height.
- **Punch holder.** A machine gets `holder: { height, width }`: sectional
  clamps between the punch and the ram, drawn and checked over the punch's
  ranges only; the full-length ram starts at `tipZ + punch.height +
holder.height`. Research the Amada-Promecam intermediate heights (believed
  100 mm standard, 150 mm tall; confirm from a tooling catalogue, record the
  source in the fab-shop spec §12 style) and use the standard one. Add one
  tall straight punch if the catalogue lists a common one (same sourcing
  rule); no invented dimensions.
- The 3D machine scene (`shopLayer.js`) and the collision triangles drawn red
  follow the ranges. `BrakeSideView` is unchanged.
- Existing collision expectations that change (the mid-plate tab that
  reported a die collision; the 25 mm box limit; the control box's stated
  reason for its depth) are updated one by one, each named in the report
  with the old and new outcome and why the new one is what a shop sees. Then
  correct the Limits section of `docs/sheet-metal-shop-guide.md`.

Acceptance (unit test + the verify script): the §1 face frame, flanges 40 mm,
made in this order — left flange stroke (two members), right flange stroke,
bottom, top, crease — passes `sequenceChecks` with no refusal and no
collision on the 50 t × 2 m press; the same with the crease first is refused
(the tilted half hits the bed or the ram), with advice that names bending
the flanges first. Report the deepest flange the standard set-up clears on a
600 mm wide panel.

### 6.3 Flanged panel maker — `cad/panelMaker.js` (pure) + a form in Draw

The user states the finished part; the maker returns the blank a programmer
would send to the laser. It does not unfold anything: it lays the blank out
from the same §5.2 numbers the brake uses, as `controlBoxBody`
(shopExamples.js:123) does by hand.

Input:

```js
{ face: [[x, y], …],   // finished OUTSIDE face outline, convex, counter-clockwise, mm
  thickness, stock,
  flanges: [{ edge, depth, angle: 90, direction: 'up' | 'down' }],  // edge i = face[i] → face[i+1]; depth = outside height
  creases: [{ a: [x, y], b: [x, y], angle, direction }],            // across the face, ends on its outline
  windows: [{ type: 'rect', x, y, width, height, radius } | { type: 'circle', x, y, diameter }],
  holes:   [{ x, y, diameter }],
  relief: 1, gap: 0.2 }
```

Form presets for `face`: Rectangle (W × H), Trapezoid (bottom width, top
width, height), or a closed straight-edged sketch. Flanges are set per edge
by clicking the edge in the form's preview (depth, up / down); "all edges"
shortcut. Creases by height on the preview (horizontal) or two edge points.

Output: `{ profile, bends (brake order, with stroke ids), marks (one etched
line per stroke, carrying bend angle and direction), report: { blank,
folded, sequence } }`. Windows with a corner radius use the line-and-arc loop
form `sketchProfile.js` produces, so the laser path and the DXF keep true
arcs.

Invariants (tests check these, not a formula sheet), for rectangle,
trapezoid (base angles down to 60°), each with 0 – 4 flanges, 0 – 2 creases,
up and down, t 1.0 – 3.2:

- `foldSheet` accepts the blank and the bends with no error;
- each flange's outside face lies in the plane through its face edge at the
  flange angle to the face, and its outside height is `depth`, to 0.01 mm;
- the folded face's outside size along and across each crease equals the
  input to 0.01 mm (the crease's bend deduction is in the blank);
- no bend zones overlap; flange ends at a corner and at a crease notch do
  not intersect when folded and stand at least `gap` apart;
- `sequenceChecks` on the returned order passes on the default press for
  depths the §6.2 set-up clears; otherwise `report.sequence` names the hit
  and the reason, and the form shows it before anything is created.

Face corners between two flanged edges outside 45° – 135° are refused by
name. Brake order: flange strokes, longest edge first, then creases.

Create offers two endings: **Cut and bend it for me** (part + bends) and
**Cut the blank — I will bend it** (part + etched lines; at the brake each
bend is one click on its etched line, §6.2).

### 6.4 Tests and script

Unit tests per §6.1 – §6.3; dom tests for the segment toggle, the etched-line
click, the panel form. `scripts/verify-shop-floor-sf3.mjs`: Draw → Flanged
panel 600 × 1400, flanges 40, a 12° crease at 600, two windows → Cut the
blank → at the brake click the five etched lines in order → the folded bounds
match the form's report; unfold; reload.

### 6.5 SF-3 as built (2026-11-14)

Where the build had to choose (each named in the builder's report):

- **One definition of a stroke**: `sheetMetal.js` `bendStrokes` (runs of
  neighbouring bends sharing `stroke`; an id that comes back later is a new
  stroke) and `strokeOf`; the station, the collision check, the sequence
  checks, the job sheet, the route and the panels all read it.
  `strokeBends` returns the line unchanged when it makes one bend and nothing
  is skipped, so ordinary hits are stored exactly as before.
- **Hits are numbered by stroke** ("Bend 3" in a message is the third hit,
  as the sequence list counts), and so are the brake's flat-map bend
  numbers; the part form's bend table stays per bend.
- **Tooling runs** are found on the flat blank (pressBrake.js `toolingRuns`):
  material the punch line crosses that the stroke leaves flat breaks a run,
  whether or not an earlier bend has since folded it away.
- **Collision advice names the earlier bend** when a piece that bend turned
  is what hits the bed or the die ("Bend this one before bend 1 (DOWN 12°
  R1.6) …"): the crease-first face frame's refusal.
- **Cut-outs are open in the collision mesh** (brakeCollisions.js
  `triangulateWithHoles`, falling back to the closed outline when a bridge
  fails). The sectional die alone did not clear the mid-plate tab: the
  window it bends up through was counted as sheet.
- **The side view draws the punch holder** (one more tool path, the only
  change to `BrakeSideView`): without it the ram would float 100 mm above
  the punch.
- **Panel maker corners**: square corners between two 90° flanges on the
  same side are closed (the longer edge covers, the other stops `gap` short,
  as `controlBoxBody`); every other flanged corner is open, its tabs cut
  square where tab and zone stand clear of the other's relief line, and
  widened (relief + 1.5 mm, up to four times) when the folded flanges still
  come within `gap`. Crease notches are `relief` wide beyond the crease
  zone, wider when the flange stands on the crease's inside. Creases must be
  parallel; windows must stay clear of every bend zone and crease band.
- **Measured outside sizes across a crease** are to the crease's virtual
  sharp on its own outside surface (the §5.2 leg convention).
- **A blank too large for the model's stock sheet** is cut from the smallest
  catalogue sheet that holds it (the laser never turns a blank): the 600 ×
  1400 face frame needs 1500 × 3000.
- **Weld and Print are `none`** without a seam / a print (the SF-2 audit), on
  the job sheet, its CSV, the route and the job board's pips.

## 7. SF-4 — The kiosk example

Shop → More → **Example: kiosk** builds a product modelled on the user's
photo, **sized by eye** (the guide says so and names the parameters to
change): two face frames from the panel maker (tall panel, 40 mm returns, a
screen window and a lower window, a crease), a shelf tray and two base
channels welded between them, two flanged lower covers, two bought-in
displays. Route: every blank cut and etched; bends as strokes; corner and
shelf welds (one weldment); weldment powder-coated black, covers white; a
text print on each cover; assembly steps for displays and covers with their
fasteners (SF-2). Every record is written by the stations' own functions,
as `sheetMetalControlBox` does. The kernel `inspect` request reports no
interference between its parts. Its job sheet shows every step done.

Append the kiosk walk-through to `docs/sheet-metal-shop-guide.md`
(restructured around the route bar) and `scripts/verify-shop-floor-sf4.mjs`
(load, job sheet complete, each station opens on it, reload).

### 7.1 SF-4 as built (2026-11-14)

Where the build had to choose (each named in the builder's report):

- **One function, named sizes.** `shopExamples.js` `KIOSK` (width 640,
  height 1700, depth 110 across the screen housing, t 1.5 SPCC, 40 mm
  flanges, crease 760 above the floor at 15°, the two windows, the display
  520 × 660 × 40, shelf, base, cover, Ø4.5 holes, fit-up gap 0.1, the print's
  text), `kioskFaceFrame(kiosk)` and `sheetMetalKiosk(kiosk)`. All sized by
  eye from the two photos; the guide says so and lists them. Built once per
  set of sizes and handed out as a copy (the build is ≈ 0.3 s in node, three
  quarters of it the press brake's sequence checks the panel maker runs on
  each panel).
- **Structure.** The upper faces stand vertical `depth` apart; the crease
  (down, the root piece is the upper face) leans each lower face out, so the
  base spreads to ≈ 490 mm. The face frames have no bottom flange (an inward
  one would point below the bottom edge at any lean): they stand on two base
  channels across the depth, welded along each bottom edge. The channel is
  80 wide: a 50 × 50 one is refused by the brake (its second flange hits the
  punch at 67°; the gooseneck does worse), so the width changed, not the
  check. The shelf tray's front and rear flanges are bent down 90° − 15° so
  they lie on the leaning faces (a lap seam at each tip). The covers are
  flanged trays behind the lower windows (their underside on the frame's
  inside), fixed by M4 pan heads from outside through the frame and the
  cover, with M4 nuts on the cover; the displays sit behind the screen
  windows, held by four M4 pan heads from outside into their inserts.
- **Faces drawn lying down** (x up the face): the laser never turns a blank
  and the 1712 × 715 blank fits the default 1219 × 2438 sheet only along
  its length. One face-frame part with two instances; one channel and one
  cover part with two each.
- **Records by the stations' functions**: the panel maker's profiles, bends
  (brake order, strokes) and etched lines (one per stroke, as "Cut and bend it
  for me"); `weldSeam` / `weldNumbers` / `weldRecord` on picks made from the
  folds (the face picks carry the piece's holes) and `joinWeldment`;
  `applyFinish`; `createPrint` with the station's upright axes; the displays
  from `boughtInItem`; displays and covers placed by `lineUpNodes` (two pairs)
  from where Add bought-in item and Cut drop them; every fastener by
  `seatHardware` (one hole per click) and `addSeated`; four `addStep`s (the
  weldment is the base, in no step, as the control box's body). Only ids are
  fixed. The display's M4 inserts are modelled as four Ø4.5 blind `hole`
  features on its box (a part definition, not a shop record): threads are not
  modelled, so a screw in them clears instead of interfering.
- **No interference** is the kernel's `inspect` over all 33 instances,
  fasteners included (`kiosk.kernel.test.js`, which also shows the same check
  finding a cover pushed 0.5 mm into its frame). Contacts are face to face
  (cover on frame, display on frame, shelf flanges on the faces) or edge on
  face (frames on channels); the nut bores and screw shanks are both
  nominal 4.0 and measure no overlap.
- **The press brake on a finished part** keeps its shop-order refusal (§4.3:
  it keeps its panel); the card now also lists the hits made and the folded
  size (read only), so Bend "opens on" the kiosk without hiding what was made.
- **Station defects the example found, fixed in the stations**: the loader
  (`loadExample`) did not rewrite a connection's `fromFeatureId` /
  `toFeatureId` (an example with fasteners would have loaded broken) and
  selected a nested weldment instead of the product; the brake's shop-order
  message read "2 paint finishs"; the Assembly station's automatic approach
  side summed the nuts' seats against the screws' heads and flew a screwed
  and nutted cover in from the top (it now goes by the headed fasteners).
- **The SF-3 audit's list, done first**: the brake's side view and flat-blank
  cards share the view's height (`--cad-brake-map-chart` / `-room` on
  `.cad-model-view`; the side view's chart shrinks first, the verify script
  checks the two apart at 1600 × 1000 and 1366 × 768); the panel preview's
  edge labels run along their edges; a collision's "bend this one before bend
  N" is offered only when no stroke of several tabs it would jump is then
  left out of line (else the die-clearing depth, the tabs one at a time, or
  the sheet the other way up); an old one-record bend whose intervals join
  different piece pairs, then a crease, is refused by name with the remedy
  (re-make it at the brake) instead of "close a loop". The topology was not
  made per interval pair: a bend has one fixed piece and one arc pose in the
  brake, the collision mesh, the kernel and the unfold, so a two-hinge bend
  would touch all of them; files that fold today fold the same. A crease may
  be given by two points in the form.
- **Not checked**: whether a step can physically be fitted in its order (as
  modelled the displays could not pass the welded shelf or the 30 mm gap
  between the top flanges); the face frames' side flanges end square to the
  leaning face and hang ≈ 10 mm below the bottom edge beside the channels.

## 8. SF-5 — Replay the build

A **Replay** button at the end of the route bar plays the current product's
route as a film, without changing the model: each blank cut on the laser bed
(the existing cut animation, compressed), each stroke on the press brake
(`rerunStroke`, view only), the seams appearing, the colour arriving, the
prints, the assembly steps flying in. Controls: play / pause, previous /
next step, speed, a step list to jump from; Esc ends it.

- Pure `cad/shopFilm.js`: `filmScenes(model, productId)` → ordered scenes
  `{ station, instanceId?, recordId?, title, seconds }`, and
  `filmState(scenes, index)` → what exists at that point (which blanks are
  cut, each bend's angle, which welds / finishes / prints / assembly steps
  are in).
- The viewport shows that state through the shop layer (a mask over the
  kernel-inert records and the sheet-metal preview group posed at the
  scene's angles); parts not yet cut are hidden. No kernel round trip.
- A `FILM` table in `toolSession.js`; while it plays, the route and the
  panes are read-only.

Script `verify-shop-floor-sf5.mjs`: replay the kiosk and the control box to
the end, stepping; the model is identical before and after.

### 8.1 SF-5 as built (2026-11-14)

Where the build had to choose (each named in the builder's report):

- **Scenes** (`shopFilm.js` `filmScenes`): all blanks are cut, then all
  bent, then the seams, the coats, the prints and the steps — the order the
  stations enforce, and the order a batch goes through a shop. **Copies of
  one part go through together**: one cut scene per blank definition (the
  copies nested on the bed, "Cut two face frame blanks: front and rear") and
  one bend scene per hit ("front and rear face frame · hit 1 of 4"), not one
  per instance — the kiosk would otherwise be 24 hits of ≈ 2 s. Seams are
  grouped by the part welded on (a part's own corner seams together), each
  seam appearing at its beat; coats by powder (the weldment named as one:
  "Powder-coat the kiosk frame (5 parts welded as one) RAL 9005 Jet black");
  one scene per print and per step; a last scene, the finished product. Hit
  titles name what is bent from the blank: a crease (under 45° across the
  face), a long-side or end flange (a narrow strip along that side), or a
  bend across the blank; "two tabs in one stroke" for a stroke of several.
- **Lengths**: each scene's job-sheet estimate pressed by
  `min + k · ln(1 + estimate / 10 s)` within a per-station minimum and maximum
  (`FILM_PACE`: a hit 1.9 – 3.2 s, a cut 2.6 – 5 s, a seam group 2.4 – 4.5 s,
  a coat 3 – 5 s, a print 2.4 – 4 s, a step 2.6 – 4.5 s, the finish 2.5 s),
  the last 0.8 s (or 30 %) held still. The kiosk plays in 86.3 s at 1× (82.9 s
  without the kernel's seam lengths), the control box in 36.8 s. A hit plays
  at the machine's own speed (≈ 1.2 s); a cut and a fly-in are stretched over
  the scene. Speeds 0.5×, 1×, 2×, 4×.
- **Display, no rebuild**: the viewport is handed `filmModel` (the model with
  only the welds, finishes and prints made so far — kernel-inert keys, so
  `sameKernelInput` holds), the build-up mask of `setAssembly` (what is not
  made or not fitted yet; a paint or print scene shows only the parts in the
  booth; the weld scenes the weldment's parts), the press brake through its
  ordinary `brakeView` (`rerunStroke`, `commit: false`) and the laser bed
  over the view. The bend angles of filmState are the press brake's: in the
  model view every part is already bent (all hits come before the first
  seam), so no sheet-metal preview is posed there.
- **One clock** (`createFilmClock`), read by the stations' own frame loops:
  the laser bed (`watch`, `clock`), the stroke and the fly-in (`run.clock`,
  `play.clock`); paused, each loop draws nothing. The workspace's frame loop
  moves the progress bars by transform and changes React state only at a
  scene's beats and its end.
- **Back as it was**: the session keeps the open station's session (shop
  session or press brake), the brake card, the gate, the panel, the unfold
  view and the panel lines, and puts them back at the end; the viewport keeps
  the camera and the press brake's saved camera and key, frames the product
  from the isometric side as the film starts, and puts them back. The
  selection, isolation, explode and section are never changed (the viewport
  is handed none of them while it plays); the view toolbar and cube are inert.
- **The first hit**: opening the press brake links new shader programs for
  every lit material (its two lights), ≈ 50 ms in one frame. The film asks
  the shop layer to link them ahead (`prepareStation`, `compileAsync` on a
  stand-in with the machine's material and the station's lights on), which
  took the first hit's frame from 90 ms to ≈ 40 ms.
- **Frames** (kiosk, 1600 × 1000, headless Chrome on the dev server, the
  scene shots' pauses left out): mean 7.0 ms (the 144 Hz refresh), p99 7.2 ms;
  the worst are the film's start (two frames of ≈ 70 – 90 ms: the panel, the
  step list and the laser bed mounting, the face frame's laser layout ≈ 14 ms,
  the scenes ≈ 10 ms) and a few scene changes of ≈ 28 – 42 ms (one render of
  the workspace each). The production build measures the same start.
- **Part A of the SF-4 audit**: a part whose hits are made and that has gone
  on down the route shows `PressBrakeFinished` (a neutral card, role status,
  with the instance's own seams, finish, prints and step, the hits made,
  **Watch the bends** — the film of that part's hits — and the remedy kept as
  **Bend it again?**, which says the records are every copy's of the part);
  a part welded or painted with no hits yet keeps the refusal. The job
  sheet's step quantity no longer counts the oven cure (`load: true`): the
  kiosk's Paint reads 7, the control box's 2.
- **Not done**: the film is not recorded to a video file; the laser bed shows
  the copies that fit the first sheet (the kiosk's two face frames need a
  sheet each, so one is cut on screen); the weld beads keep their station
  size, which is hard to see on the whole kiosk.

## 9. Phases and builder rules

SF-1 → SF-2 → SF-3 → SF-4 → SF-5, one run each. Every phase: pure logic in
its own module with unit tests; `*.dom.test.jsx` for panels; one Playwright
script (pattern of `verify-fab-shop-sm4.mjs`); `docs/state-machines.md` and
the user guide updated; full `npm test`, `npm run lint`, `npm run build`
green; the four `verify-fab-shop-sm*.mjs` scripts and every earlier
`verify-shop-floor-*.mjs` still pass.

The rules of `docs/sketch-studio-fab-shop.md` §11 apply (no `CAD_VERSION`
bump, worker-safe pure modules, match the surrounding code, vitest from the
repository root, stop the dev server and confirm the port is free). Also:

- The working tree holds a large uncommitted body of work. Do not commit,
  stash, reset or check out anything.
- Do not rename a pinned label, region name or status string unless this
  spec says so; list every test expectation you changed and why.
- Report: files touched, measured numbers, every judgment call, anything in
  this spec you found wrong or could not do.

## 10. Not in scope

Unfolding a 3D design into a blank; hems, rolling, louvres; weld distortion;
paint masking; nesting optimisation; currency costs; wiring and electronics
of the kiosk; importing the customer's design proposal image as geometry.
