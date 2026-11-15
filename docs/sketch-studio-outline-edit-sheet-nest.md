# Sketch Studio shop: outlines you can go back into, and one sheet for many blanks

Status: spec, 2026-11-15. Follows `docs/sketch-studio-fab-shop.md` (§8.5 the
laser's numbers, §9 SM-4 the laser station), `docs/sketch-studio-shop-floor.md`
(§4.4 Draw, §4.5 Cut, §8 the replay) and `docs/sketch-studio-shop-trim.md`
(all built). Three phases, one builder run each, audited between:

- **OE-1** — outline edit: a drawn outline is never lost, can always be
  reopened, and several outlines in one sketch are several blanks. BUILT (§3.9).
- **SN-1** — sheet nest and batch cut: every blank of the same stock and
  thickness shares the stock sheet, Quantity makes real copies, and several
  outlines are cut in one go (§4; revised the same day, see §1). BUILT (§4.9).
- **BQ-1** — bend queue: the press brake goes through the cut parts one by
  one (§7). BUILT (§7.8).

No new model keys in any phase. `CAD_VERSION` stays 1.

## 1. What the user said

"Why when I start a sketch in 3D workshop for me to laser cut it, the bug is
when I finish the sketch I can't save the sketch so I can edit it when I have
made a mistake on the drawing. Then also in laser cut I can't cut on the extra
space on the huge sheet metal, for example I can cut 2 or more to utilize the
big sheet metal."

Later the same day (after OE-1): "Can we allow users to cut multiple cuts in
laser, also can I bend the multiple parts. The idea is I will draw multiple
sketches, then cut them on the laser, then on bending I can bend them one by
one."

What that adds, read from today's code (2026-11-15):

- It already works one outline at a time (Draw → Cut this → Cut on the laser,
  again for the next outline; then a job-board row while Bend is open moves
  the brake to that part). Nothing guides it, and three things get in the way:
  `stationEntry` refuses Cut with "Several outlines are ready to cut: choose
  one in Draw."; every new part lands with its blank's centre on the view's
  drop point (`cutFromSheet`), so parts cut one after another without moving
  the camera lie on top of each other; and every part is named "Sheet-metal
  part".
- A bend belongs to the part (`feature.bends`), so copies of one part fold
  together: the brake's queue is per part, not per instance.
- The brake session starts from `brakeSessionDefaults()` for every part: the
  punch and die chosen for one part are gone on the next.

## 2. What happens today (measured 2026-11-15, browser probes on today's code)

### 2.1 The outline

1. Shop → Draw → **Draw the outline** → a closed 300 × 200 rectangle →
   **Finish sketch**: the sketch IS saved (`model.sketches`), and Draw lists it
   under "Outlines ready to cut" with one button, **Cut this**. There is no
   Edit. The 3D view shows nothing of it (the origin planes on an empty
   grid), so it looks as if the drawing is gone.
2. An **open** outline (the mistake: two lines that do not close) → Finish →
   the generic "Sketch 1 finished" panel ("Make it solid: Extrude / Cut", both
   off), outside the shop route. Back on Draw: "None yet". The sketch is in
   the model but only Tree → "Part sketches" finds it.
3. **Two separate closed outlines in one sketch** (200 × 100 at 0,0 and at
   260,0; the status bar reads "2 items · closed profile") → Finish → Draw
   lists one 200 × 100 outline. The second is dropped without a word:
   `entitiesToProfile` (sketchProfile.js) keeps the largest outer loop and
   returns the problem "2 separate outlines: one extrusion uses one outer
   outline…", but `finishSketch` (CadWorkspace.jsx) goes straight back to
   `shop-draw` and never shows `created.problems`.
4. After the cut, the only way into the outline is Tree → select the part →
   "↳ Edit sketch" on its feature row. It works (a Ø20 hole added to a cut
   100 × 60 blank reached the part), and ends on the generic "Sheet blank
   updated" panel. Cut from sheet, the laser station and the job board have
   no entry.

### 2.2 The sheet

1. The laser station nests `session.quantity` copies of ONE part
   (`nestBlanks` → `planSheets`, a shelf packer, never rotated). Quantity is
   the session's: it starts at 1 every time, and "cutting 3" leaves the model
   with 1 part and 1 instance.
2. Every part gets a fresh sheet: a second part's station shows the sheet
   empty again. A 300 × 200 blank on 1219 × 2438 reads "Sheet use 2%".
3. The bed opens on **Close-up**, which frames the blank alone: the free
   sheet is not on screen until "Whole sheet" is pressed.

### 2.3 What the siblings do (read before this spec)

- `jobSheet.js` `productRoute`: one Cut row **per instance**. `shopFilm.js` /
  the film scene in CadWorkspace: `quantity: scene.instanceIds.length`.
  `shopRoute.js` `routeProgress`: blanks = instances that fold. Everywhere
  but the laser, **a blank is an instance**. The laser's session quantity is
  the odd one out.
- `ShopFloor.jsx` `drawingBlanks` → `sheetMetal.js` `nestProfiles`: the 2D
  drawing's route already turns several outer loops into several blanks
  ("A closed outline inside another becomes its cut-out"). The 3D sketcher's
  route is the one that keeps only the largest.
- `sketchOperations.js` `editableEntities` / `sketchEditProblem`: a stored
  profile reopens in the sketcher unless it uses expressions, splines or
  offsets. `sketchFromSession` with `existing` keeps the sketch's id and
  plane, so every consumer follows the edit.
- `ShopPanels.jsx` header: "nothing is committed that foldSheet refuses".

## 3. OE-1 — outline edit

### 3.1 The outlines of a model (shopRoute.js)

`shopOutlines(model, params)`: every sketch on the XY plane at the origin
(`(plane || 'XY') === 'XY'`, no `normal`) that no part is made from
(`sketchConsumer`), in model order:

`{ id, name, ready, width, height, problem, editProblem }`

- `ready`: `isClosedProfile` and `profilePolygon` makes a blank. Then
  `width`, `height` are the outline's bounds.
- not ready: `problem` says why in shop words — an open profile: "Not closed:
  connect the ends so the outline is one loop."; a profile that does not
  make a blank: the error's own message.
- `editProblem`: `sketchEditProblem(sketch)` ('' when the sketcher can open it).

`readyOutlines` stays (stationEntry, routeProgress, tests): the ready ones,
same fields as today.

### 3.2 Draw lists every outline, each with Edit

`DrawPanel` (ShopFloor.jsx):

- "Outlines ready to cut" (list name and `is-chosen` unchanged): each row
  gains **Edit** (`aria-label="Edit {name}"`, off with `editProblem` as its
  title) and **Delete** (`aria-label="Delete {name}"`; one commit removing
  the sketch; Undo brings it back). "Cut this" keeps its label and
  `aria-label="Cut {name}"`.
- Under it, when there are any: "Not ready to cut" (`aria-label` the same):
  the row's name, its `problem` (role note), Edit, Delete. No Cut button.
- The empty text of the first list stays.

### 3.3 Finishing always comes back to where the sketch was started

A sketch session's `returnTo` becomes a small record (today the string
`'shop-draw'`): `{ panel: 'shop-draw' }`, `{ panel: 'shop-cut', outline }`,
`{ panel: 'shop-laser', instanceId }`, `{ panel: 'part', instanceId,
featureId }`. `editSketch(id, { returnTo })` passes it through `beginSketch`.

- From Draw (new or Edit): Finish → Draw, the row chosen — in "Outlines ready
  to cut" when it closed, in "Not ready to cut" with its reason when it did
  not. Never the "Make it solid" panel. Cancel → Draw (as today).
- From Cut from sheet (§3.6): Finish → Cut from sheet on the same outline; if
  it is no longer closed → Draw, the row chosen under "Not ready to cut".
- From the laser station (§3.6): Finish → the laser station on that part,
  ready (not cutting, `cut: false`), with the notice "Outline updated: blank
  {w} × {h} mm." Cancel → the laser station.
- From a sheet-metal part's feature form (§3.6) or the Tree's "↳ Edit sketch"
  on a sheet-metal feature: Finish → the part selected with that feature
  open. Other sketches (extrudes, face sketches) keep today's "… updated"
  panel.

### 3.4 Several outlines in one sketch are several blanks

Only for sketches finished with a shop `returnTo` (the Sketch tab keeps
today's rule and its warning).

`splitOutlines(entities)` in sketchProfile.js: the entities grouped by outer
loop — each group holds the loop's own entities and those of the loops
directly inside it (its cut-outs); groups ordered largest first. Entities in
no closed outer loop (open chains, construction lines, a loop inside a
cut-out) stay with the first group. One group or none → `[entities]`.

`finishSketch`: with more than one group, the first group is the sketch
itself (a new sketch, or the edited one: its id, name and plane); each other
group becomes a new sketch on the same plane fields, named "{name} · 2",
"{name} · 3"… (the first free names). One commit. Back on Draw the first is
chosen and a status line says: "{name} held {n} separate outlines: each is
its own blank." When the edited sketch is a cut part's blank, the extra
outlines are new outlines ready to cut and the same line shows in the
station the edit came from.

### 3.5 The view shows the outlines while Draw is open

While `panel === 'shop-draw'` and no sketch session, film or laser bed is on:
every `shopOutlines` row is drawn in the 3D view on the XY plane at z = 0 as
plain lines (its outline and cut-outs; an open one its drawn lines) — ready
ones in the accent colour, not-ready ones in the warning colour, the chosen
one heavier. Not pickable, no camera move, nothing drawn or computed on any
other panel. Built once per (model.sketches, chosen), not per frame. The
viewport's browser probe (`cadViewMode()` or its neighbour) reports how many
outlines are on show (`shopOutlines`), for the verify script.

### 3.6 Edit outline after the outline is chosen or cut

- `CutFromSheetPanel`, outline kind `sketch`: a secondary button **Edit
  outline** beside the outline's name (off with the edit problem as title).
- `LaserPanel`: **Edit outline** (off while cutting; off with the edit
  problem as its title), under the blank's results. `LaserError` gets it too
  (a blank the fold refuses must still be fixable from there).
- The sheet-metal feature form (ShopPanels.jsx): **Edit outline** at the top.
- The job board row needs nothing: a click selects the part; Cut → Edit
  outline is one more click.

**The guard.** Before `finishSketch` commits an edit of a sketch that
sheet-metal features are made from, each of them is folded on the new
profile (`foldSheet(feature, profile, params)`). If one refuses, nothing is
committed and the sketcher stays open with the message in the sketch status
line (and the workspace error line): "This outline no longer takes the
bends of {part}: {fold message} Fix the outline, or remove that bend first."
An outline that is no longer closed is refused the same way for a cut part:
"{part} is cut from this outline: close it before finishing." Etched marks
are kept as they are (Clear marks exists).

### 3.7 Not in OE-1

Dimension editing of sketch entities by field; moving an outline on the
plane; anything in the Sketch tab's own flow; the 2D drafting route.

### 3.8 Acceptance — `scripts/verify-outline-edit-oe1.mjs`

On an empty workspace, Shop tab, 1600 × 1000 and 1366 × 768 screenshots of
each state into `artifacts/sketch-cad/outline-edit-oe1`:

1. Draw the outline: two lines that do not close → Finish → Draw is open,
   "Not ready to cut" holds "Sketch 1" with "Not closed…", the view probe
   reports 1 outline on show; no "Make it solid".
2. Edit Sketch 1 → the sketcher opens with the two lines → close it with a
   third → Finish → Draw, the row chosen under "Outlines ready to cut".
3. Draw the outline: rectangles 200 × 100 at (0, 0) and at (260, 0) → Finish
   → two ready rows ("Sketch 2", "Sketch 2 · 2"), the status line of §3.4.
4. Edit a ready row: make it larger → its size in the row follows.
5. Delete "Sketch 2 · 2" → gone; Undo → back.
6. Cut this (Sketch 1) → Cut from sheet → Edit outline → add a circle →
   Finish → Cut from sheet reads 2 pierces → Cut on the laser → cut done.
7. Laser → Edit outline → add a second circle → Finish → the laser station
   is open on the part, 3 pierces, the notice of §3.3.
8. Bend one flange on the press brake, then Edit outline (from the laser)
   and shrink the blank so the bend line is off it → Finish is refused with
   §3.6's message, the sketcher still open with the drawing; Cancel leaves
   the part as it was.
9. No page error, no `.cad-error` except step 8's.

Every existing verify script that touches the Shop still passes
(`verify-shop-floor-sf1/sf3/sf4/sf5`, `verify-fab-shop-sm1…sm4`,
`verify-shop-trim-st1`, `verify-start-sketch`, `verify-sketch-on-face`).
Unit tests: `shopOutlines`, `splitOutlines` (two rectangles; a rectangle
with a circle inside and a second rectangle beside it; an open chain plus a
closed loop; one loop → unchanged), the fold guard. DOM tests: `DrawPanel`
rows and buttons, the `returnTo` routes in a `CadWorkspace.*.dom.test.jsx`.

### 3.9 OE-1 as built (2026-11-15)

Built as §3.1–3.8 say, with these differences and choices where the spec
was silent:

- **What counts as a shop finish (§3.4).** Every `returnTo` record splits,
  `{ panel: 'part' }` included: it is only ever made for a sheet-metal blank.
  `returnTo: null` (the Sketch tab) keeps one outline per sketch and the
  "N separate outlines" warning.
- **An edited sketch stays the outline it was (audit, §3.4).** When an edit
  ends with several outlines, the group holding most of the entities the
  sketch was opened with keeps its id — not the largest — so a larger shape
  drawn beside a cut part's blank becomes a new outline, never that part
  (`outlineSketches`).
- **Which edits go back to the part (§3.3).** `editSketch(id)` with no
  `returnTo` sends a sketch a sheet-metal part is cut from back to that part
  (its feature open) — so the Sketch tab's sketch panel and the "… finished"
  panel's Edit behave like the Tree's ↳ Edit sketch for a blank. Extrude and
  face sketches keep the "… updated" panel.
- **The guard runs on every finish of an edited sketch** sheet-metal features
  are made from, whatever started it (`shopRoute.js` `outlineEditRefusal`).
  The refusal stays in the sketch status line only while the drawing is the
  one refused (`session.refusal.entities`), and the status line moves up
  clear of the error line meanwhile (`.cad-sketch-status.has-refusal`).
  Cancel clears that error line.
- **Cancel** goes back to where the sketch was started for every record (the
  spec named Draw and the laser).
- **Cut from sheet keeps its stock across Edit outline**: the `shop-cut`
  record's outline carries `stock` and `thickness`, and the panel starts from
  them (it unmounts while the sketcher is open).
- **The split line** shows in Draw, in Cut from sheet and in the sheet-metal
  form (`outlineNotice`, kept while the model is the one it describes); on the
  laser it follows the "Outline updated…" notice in the one notice line.
- **The laser's Edit outline is off while the kernel is not current** (the
  sketcher draws a cut part's outline where the part stands, which needs its
  placement), with that reason as its title; the feature form's Edit outline
  is not turned off, and a click during a rebuild gets `editSketch`'s own
  "Wait for the model to rebuild…" on the error line (as the Tree does).
- **Delete** refuses a sketch a part is cut from (Draw never lists one).
- **The view (§3.5).** WebGL draws every line one pixel wide, so "heavier"
  is: the chosen outline opaque, the others at 60 %, and a chosen blank's
  face lightly filled. Lines sit at z = 0 shifted by the sketch's origin X, Y;
  they are drawn with the depth test, so a part standing on them hides them.
  `cadViewMode().shopOutlines` is the probe.
- **Draw's rows.** Edit · Delete · Cut this wrap under the name before the
  name is squeezed; a not-ready row's thumbnail is its open lines in the
  warning colour; arriving at Draw brings the chosen row into view once (at
  1366 × 768 the lists are below the tiles), never on a re-render.
- **The verify script** types every shape in the HUD with the pointer off
  the canvas (a typed rectangle opens toward the cursor's quadrant); step 2's
  third line is typed as length and angle back to the start; step 8 bends the
  100 mm edge with L 20 and re-draws the shrunk blank as a 60 × 14 rectangle
  with the two circles (so they stay cut-outs, not new outlines); step 4 runs
  at 1366 × 768 and checks the chosen row is in view.

Files: `shopRoute.js` (`shopOutlines`, `shopOutlineView`,
`outlineEditRefusal`, `NOT_CLOSED`; `readyOutlines` on the same rows),
`sketchProfile.js` (`splitOutlines`, `profileLoops` shared with
`entitiesToProfile`), `sketchOperations.js` (`outlineSketches`),
`CadWorkspace.jsx` (`returnFromSketch`, `cancelSketch`, `editSketch`,
`editOutline`, `outlineEditProblem`, `editLaserOutline`, `deleteOutline`,
`finishSketch`, `drawOutline`, `outlineView`, `outlineNotice`; the panels'
props, the Tree's ↳ Edit sketch), `ShopFloor.jsx` (`DrawPanel`, open-line
`OutlineThumb`), `ShopPanels.jsx` (`CutFromSheetPanel`, `SheetMetalForm`),
`CadEditors.jsx` (`FeatureForm` passes Edit outline through),
`LaserStation.jsx` (`EditOutline` on `LaserPanel` and `LaserError`),
`CadSketcher.jsx` (the refusal in the status line), `CadViewport.jsx`
(`shopOutlines` prop, `drawShopOutlines`, the probe), `cad.css`; tests
`outlineEdit.test.js`, `CadWorkspace.outline.dom.test.jsx`,
`ShopPanels.dom.test.jsx`; `scripts/verify-outline-edit-oe1.mjs`;
`docs/state-machines.md` (the workspace tool session, `cad-laser`, the shop
floor route).

## 4. SN-1 — sheet nest

### 4.1 The sheet is derived, a blank is an instance

`sheetNest(model, { stock, thickness, sheetKey, params })` in
laserStation.js, pure:

- Its blanks: every instance in `model.instances` order whose part's
  sheet-metal feature has this `stock` and this thickness (equal within
  1e-6 mm after `numeric`) and whose blank folds. One `foldSheet` per part,
  not per instance.
- Packed first-fit on shelves, never rotated, `LASER_PART_GAP` between
  blanks and `LASER_SHEET_MARGIN` from the edge: for each blank in order,
  the first sheet and the first shelf on it with room (width left on the
  shelf, and the blank no taller than the shelf — the last shelf of a sheet
  may grow while the sheet has height left); else a new shelf; else the next
  sheet; else a new sheet. Placing a blank never moves an earlier one.
- A blank larger than the sheet is left out and listed.

Returns `{ sheets: [{ index, blanks: [{ instanceId, partId, offset: [dx,
dy], width, height, area }] }], use, oversize: [instanceId] }` (`use`: the
blanks' area over the sheets' area).

For one part alone the placements and "Sheet use" must equal today's
(`nestBlanks`): the existing tests' numbers do not change. `nestBlanks`
either wraps `sheetNest` or goes, with its tests moved.

### 4.2 The station: one cut is a job of blanks

`laserStation({ model, session, params })`, `session`: `{ instanceId,
instanceIds = null, sheetIndex = null, cutIds = null }`.

- The **lead** part is `session.instanceId`'s. Every field the station
  returns today keeps its meaning for the lead (`instance`, `part`,
  `feature`, `polygon`, `fold`, `flat`, `thickness`, `stock`, `contours`,
  `checks`, `marks`, `sheet`, `sheetKey`, `sheetKnown`): the panel's fields
  (Quantity, Edit outline, Etch bend lines) act on it.
- `job`: the instances this cut covers, in `model.instances` order —
  `session.instanceIds` when the session names them (a batch, §4.8; the
  replay's scene), kept to those still in the model whose part is sheet
  metal of the lead's stock and thickness with a blank that folds; without
  it, every instance of the lead's part. The lead's instance is always in it.
- `parts`: one row per part in the job, in job order: `{ partId, instanceId
(its first in the job), name, copies, flat, numbers (`laserNumbers`,
quantity = copies), lead }`.
- `quantity`: the lead part's instance count in the model (no longer the
  session's). `numbers`: the lead's row's. `time`: the job's machine time on
  every sheet (the sum of `parts[].numbers.time`).
- `refusals` / `warnings`: every job part's `laserChecks`, each `{ code,
message, partId }`, the message led by "{part name}: " when the job holds
  more than one part. `checks` stays the lead's (the readouts).
- `nest`: `sheetNest` for the lead's stock, thickness and the model's sheet.
- `sheetIndex`: `session.sheetIndex` when valid, else the sheet holding the
  lead's instance.
- `blanks`: the job's instances on the shown sheet, in nest order: `{ copy
(1…n), instanceId, partId, name, offset, marks (its part's etched lines),
lead }`.
- `plan`: for each of `blanks`, its part's contours (`cutPlan`, once per
  part) moved by its offset — today's fields plus `instanceId`.
- `timeline`: the plan on the machine clock, each contour timed at its own
  blank's share of the exact cut length (the speed and the pierce time are
  one for the job: one stock, one thickness).
- `others`: the other blanks on the shown sheet, each `{ instanceId, name,
rings (outline and cut-outs, on the sheet), cut }`. `cut` is true in the
  station (they exist as parts); the replay passes `session.cutIds`, and a
  blank not in it is drawn as a programmed path only.

The session loses `quantity`; it gains `instanceIds` (null = the lead part's
copies) and `sheetIndex` (null = follow the lead). `liveShopSession` drops
ids that are gone.

### 4.3 Quantity makes copies

The laser panel's **Quantity** field (label unchanged, max
`MAX_LASER_QUANTITY`, lowered to 100) shows the instance count. Committing n:

- more: n − count new instances of the same part in one commit, set down
  beside the station's instance in a row along +X, clear of it and of each
  other (the instance's built width from the snapshot when there is one,
  else the blank's width, plus 20 mm). The kernel must build the part once,
  not once per copy: measure commit → "Model current" for +9 copies of a
  two-bend part and report it.
- fewer: the newest copies go (last in `model.instances` first), never the
  station's own instance and never a copy with something of its own (a
  finish, a print, a group). If fewer can go than asked, those go and a
  warning card says: "{k} copies are painted, printed or grouped: delete
  them in the view if you mean to." Uses the model's own instance removal
  (`removeInstance`, model.js).

In a job of several parts the new copies join the job (`session.instanceIds`).

`CutFromSheetPanel` gains the same **Quantity** field (default 1): Cut on
the laser makes n instances and the laser cuts them all.

Cut animates the job's blanks on the shown sheet (§4.2 `plan`); its notice
is unchanged ("Cut {n} blank(s) on the {sheet} sheet: …") and, when the job
has blanks on another sheet, goes on: " {m} more on sheet {k}: switch the
sheet and cut again."

### 4.4 The bed and the readouts

- The bed draws the other blanks under this cut's (`cad-laser-other`,
  `aria-label="Blank of {name}"`, a `<title>` with the name), cut ones
  filled as cut metal with their cut-outs, uncut ones (replay) as the
  programmed path. Legend gains "Already cut".
- Bed view when the station opens: Close-up when the shown sheet holds this
  one blank and nothing else, else Whole sheet. The user's choice then
  stays for the session.
- More than one sheet: a segmented "Sheet" switch (`aria-label="Sheet"`,
  "Sheet 1", "Sheet 2"…) beside the view switch sets `session.sheetIndex`.
  A sheet with none of this cut's copies shows its blanks and no head; Cut
  is off there with the title "None of this part is on this sheet."
- Results: "Sheet use" keeps its format (`{use}% · {n} sheet(s)`, the share
  of all the nest's sheets). New result **On this sheet**: "{n} blank(s)" and,
  with others, " · {m} of other parts".
- A help line under the results while the shown sheet is under 60 % used:
  "There is room on this sheet: another part of {t} mm {stock} lands beside
  these." with a link-style button **Draw another part** (→ Draw).
- A job of several parts: a list **This cut** (`aria-label="This cut"`)
  above the results, one row per `parts` entry — thumbnail, name, "× {copies}"
  when more than one, blank size; the lead's row `aria-current="true"`. A
  click makes that part the lead (`session.instanceId` = the row's
  `instanceId`; the job, the sheet and a finished cut stay as they are), so
  Quantity, Edit outline and the etched marks follow it. "Cut time" then
  reads the job's: "{time} for {n} blanks". The bed marks the lead's blanks
  (`is-lead`) and each blank's `<title>` is its part's name; `aria-label=
"Blank {copy}"` stays. The shell's subject is the lead's name and, with
  more parts, " + {n} more".

### 4.5 The replay

The film's laser scene (CadWorkspace, `scene.station === 'cut'`) passes
`instanceIds: scene.instanceIds` and `cutIds`: the instances of the cut
scenes already played. The bed then shows the shared sheet filling up as
the film goes. The "only the first sheet" limit (shop-floor §8.1) goes: the
shown sheet is the one holding the scene's first copy. The scene's fallback
to a larger stock sheet (`sheetHolding`) keeps working. "Sheets to buy" on
the job sheet is BQ-1's (§7.5).

### 4.6 Not in SN-1 (asked of the user, §6)

Turning a blank 90° to fit; placing a blank on the sheet by hand; a
different sheet size per stock; remnants (a part-used sheet kept as stock);
one cut that runs on from sheet 1 to sheet 2 by itself.

### 4.7 Acceptance — `scripts/verify-sheet-nest-sn1.mjs`

Screenshots into `artifacts/sketch-cad/sheet-nest-sn1`, both sizes:

1. Rectangle 300 × 200, Quantity 3 in Cut from sheet → Cut on the laser →
   the bed is on Whole sheet with 3 blanks, the model has 1 part and 3
   instances, the job board 3 rows; "Cut 3 blanks on the 1219 × 2438 mm
   sheet".
2. Quantity 5 → 5 instances, none overlapping in the 3D view (snapshot
   bounds); Quantity 2 → 2 instances; Undo → 5.
3. Paint one copy, Quantity 1 → the painted copy stays, the warning card of
   §4.3.
4. Draw → Rectangle 500 × 400 → Cut on the laser (same stock, thickness):
   the bed shows the earlier blanks as "Blank of …" and the new one beside
   them; "On this sheet" counts them; "Sheet use" is all blanks over one
   sheet (hand-computed in the script).
5. The same rectangle in 2.0 mm: its own sheet (no others).
6. Enough copies to pass one sheet (Quantity so that sheets = 2): the Sheet
   switch, sheet 2's blanks, "Sheet use … 2 sheets".
7. Replay the product: in the laser scenes the earlier scenes' blanks are
   on the bed as cut.
8. Timing: `sheetNest` for 100 instances of 10 parts under 5 ms (unit
   test with a generous ceiling, the measured figure reported); station
   open → bed drawn with 50 blanks on the sheet, frames during a cut.
9. The batch (§4.8), on an empty workspace: draw a 300 × 200 rectangle and
   a 200 × 100 one beside it in one sketch, then a 150 × 150 with a Ø20
   circle in a second sketch → Draw lists three ready outlines and **Cut all
   3 outlines**. Click it → Cut from sheet lists the three; Quantity of the
   second → 2; Leave out the third, then Back to Draw and Cut all again (all
   three are back); Quantity of the second → 2 → Cut on the laser: one
   commit (one Undo empties the model, Redo brings all back), 3 parts and 4
   instances with three different names, the bed on Whole sheet with
   "Blank 1" … "Blank 4", the cut running through all four (the HUD's
   "blank k of 4"), the notice "Cut 4 blanks on the 1219 × 2438 mm sheet",
   the list This cut with three rows, 4 job-board rows, no two parts
   overlapping in the 3D view (snapshot bounds). A click on a This cut row
   moves Quantity and Edit outline to that part.
10. Route → Cut on an empty-of-parts model with two outlines ready opens Cut
    from sheet on both (no "Several outlines…" card). Next: Bend after the
    batch opens the press brake on the lead part.

Existing scripts as in §3.8; where one sets the laser's Quantity (sm4) it is
updated to the new meaning and the change listed in the report.

### 4.8 Several outlines in one cut (the batch)

**The outline kind.** `cutOutline` gains `{ kind: 'batch', items: [{ kind:
'sketch', sketchId } | { kind: 'drawing', blank }] }` (two or more items).

**Draw.** Under "Outlines ready to cut" with two or more rows: a primary
button **Cut all {n} outlines** (`aria-label="Cut all outlines"`) →
`onOutline` with the batch of every ready row, in list order. "Cut this"
stays on each row. Under "Drawing blanks" with two or more: **Cut all {n}**
(`aria-label="Cut all drawing blanks"`) likewise.

**The route.** `stationEntry`, Cut with no sheet-metal part: one outline
ready opens on it (as today); several open on the batch of all of them
(`{ open: { outline: { kind: 'batch', … } } }`) — the "Several outlines are
ready to cut: choose one in Draw." card goes. For Bend, Paint and Print with
no part, the maker is Cut whenever an outline is ready ("Nothing to bend
yet: cut a blank first.", go Cut); "…choose an outline to cut in Draw." goes.

**Cut from sheet on a batch** (`CutFromSheetPanel`):

- Lead: "Choose the sheet stock, then cut these blanks on the laser."
- A list **Outlines to cut** (`aria-label="Outlines to cut"`): per item its
  thumbnail, name, size, a **Quantity** field (`aria-label="Quantity of
{name}"`, 1 – 100, default 1) and **Leave out** (`aria-label="Leave out
{name}"`, off on the last row left). A row whose outline does not make a
  blank (`foldSheet` with no bends refuses it) shows why (role note) and
  keeps Cut on the laser off until it is left out.
- One Sheet stock and one Thickness for all, with the help line: "One sheet
  is one stock and thickness: every outline here is cut from it. Cut an
  outline of another thickness on its own (Cut this in Draw)."
- A summary (`aria-label="Batch"`): "{N} blanks from {n} outlines".
- No Edit outline here (Draw has it on every row).
- **Cut on the laser**: one commit makes, per item, the blank sketch (as a
  single cut does: an XY sketch at the origin is the blank itself, anything
  else is copied flat), the part and `quantity` instances; then the laser
  opens on the first item's first instance with `instanceIds` = every new
  instance, cutting at once unless a part has a refusal (`pendingStation`,
  as a single cut). Undo takes the whole batch back in one step.

**Names.** A batch part is named after its outline (the sketch's name; a
drawing blank's name), so the job board, This cut and the bend queue (§7)
tell them apart. A single cut keeps "Sheet-metal part" (tests pin it).

**Where the new parts land.** One helper lays new blanks out: a row along
+X, 20 mm apart (each its blank's width, as cut, flat), a new row along +Y
(20 mm clear of the row before, by its deepest blank) once a row would pass
2400 mm. For a single cut and a batch the lot's bounding box is centred on
the view's drop point — so one new part lands exactly where it does today.
Quantity's new copies (§4.3) use the same rows, started beside the station's
instance. No two new parts overlap each other.

**The 2D drawing's blanks** in a batch behave as a single one does
(`sourceEntityIds`, "{name} blank").

### 4.9 SN-1 as built (2026-11-15)

Built as §4.1–4.8 say, with these differences and choices where the spec
was silent:

- **The packer (§4.1).** `shelfPack` (laserStation.js) is the one packer;
  `nestBlanks` stays as a thin wrapper over it (its tests and numbers are
  unchanged) and `sheetNest` packs the model's blanks with it, so one part
  alone places exactly as before (a parity test runs five sizes against
  `nestBlanks`). It no longer goes through `planSheets`. A part's stock and
  thickness are read from its feature first (`stock || 'spcc'`, the
  thickness through `numeric`) and only matching parts are folded, then the
  fold's own values are compared. Sheet indices are 0-based in the data
  (`sheets[].index`, `session.sheetIndex`) and 1-based on screen. "Sheet
  use" sums copies × area per part, so one part reads exactly as before.
- **Oversize (§4.1).** The nest leaves a blank larger than the sheet out (and
  lists it); `nestError` stays on the station, always '' (the blank's
  `sheet` refusal says why). A lead on no sheet is drawn at offset [0, 0], as
  before, with its refusal keeping Cut off.
- **The clock (§4.2).** `laserTimeline` keeps its signature; a contour may
  carry its own `stretch` (its blank's exact cut length over its sampled
  one), which every plan contour now does.
- **The station's extra fields (§4.2).** Besides the spec's: `elsewhere`
  ([{ index, count }], the job's blanks on other sheets: the Cut notice's
  tail) and `shownUse` (the shown sheet's blanks over its area: the "room"
  help line). Each `parts` row also carries its `profile` (This cut's
  thumbnail). `others[].name` and `blanks[].name` are the instance's name,
  else its part's.
- **Bed view (§4.4).** The session's `view` starts null: the bed's own
  choice (`laserAutoView`: Close-up only while the shown sheet holds this one
  blank and nothing else) until the user presses Close-up or Whole sheet, then
  that stays. So the choice also follows a Quantity change made before the
  user picked one. The replay's bed starts null too, so its laser scenes show
  the shared sheet.
- **Sheet use** drops its " ({k} on the first)" tail: the Sheet switch now
  shows each sheet.
- **Quantity, more (§4.3).** `shopParts.js` `copyPositions`: the rows of
  `landingRows` from the instance's slot (its built XY box from the snapshot,
  else its blank's), each copy in the next slot clear of every instance's box
  (built, or for a copy not built yet the lead's box moved to it) and of the
  other new copies; a copy keeps the instance's turn and Z, and has no name
  and no group. The lead row's numbers count the copies in the job.
- **Quantity, fewer (§4.3).** k is the shortfall (asked minus removable);
  one copy reads "1 copy is painted, printed or grouped: delete it in the
  view if you mean to." (the plural as specified otherwise). The card is
  shown while the model is the one it describes (`copiesNote`).
- **New copies in a named job.** Quantity's copies are added to
  `session.instanceIds` with the commit; the session also lists them as
  `fresh` until the model shows them, so `liveShopSession` (which drops ids
  that are gone) does not drop them in the render between the session update
  and the commit reaching the workspace.
- **The Cut notice (§4.3)** names every other sheet holding the job: " {m}
  more on sheet {k}: …" for one, "… on sheets 2 and 3: …" for more.
- **This cut (§4.4).** A row is off while cutting; choosing a lead freezes
  `sheetIndex` at the sheet shown (so the job's sheet does not jump to the
  new lead's). The lead's blanks are outlined on the bed (`is-lead`).
- **Draw another part** is off while cutting; the help line shows below
  60 % of the shown sheet whatever the next part's size (a share, as
  specified).
- **Edit outline from a batch's laser** carries the job in the `returnTo`
  record (`{ panel: 'shop-laser', instanceId, instanceIds }`), so Finish or
  Cancel reopens the laser on the same job with the same lead (the spec's
  §3.3 record had no job).
- **Batch panel (§4.8).** Each row's field shows "× n" (its name, "Quantity
  of {name}", is for the screen reader); a row whose sketch is gone, is no
  longer closed or does not fold says why; the part is named after the
  outline. Leave out and the quantities are panel state: Back to Draw and
  Cut all again starts afresh. Draw's "Cut all {n} outlines" keeps the count
  in its text; its accessible name is the spec's "Cut all outlines".
- **A single cut with Quantity n** opens the laser with no named job (every
  instance of the new part is the job).
- **Where the parts land (§4.8).** `landingPositions` returns the lone
  blank's position by the old formula (drop − blank centre), so a single cut
  of one lands bit for bit where it did. A later single cut, with the camera
  not moved, still lands on the drop point and so can stand on an earlier
  part in the 3D view (the verify script records it: `singleCutOverlapsInView`);
  on the sheet it lies beside them. The batch and Quantity never overlap.
- **The replay (§4.5).** A blank on the shared sheet that is in no scene of
  the film (another product's) is drawn as its programmed path: it is not in
  `cutIds`.
- **The film's titles** for batch parts read oddly ("Cut two 1 · 2 blanks:
  sketch and sketch" for two copies of "Sketch 1 · 2"): `shopFilm.js`'s
  shared-noun wording meets names with a "·". Not changed here (shopFilm is
  not in SN-1); worth a look with BQ-1.
- **Where the brief was wrong about the code**: `liveShopSession` lives in
  `CadWorkspace.jsx`, not `shopRecords.js`.

Measured (2026-11-15, this machine): `sheetNest` for 100 instances of 10
parts 0.17 ms a call warm, 4.4 ms the first (cold) call, `laserStation` on
that model 0.39 ms (node); commit → "Model current" for +9 copies of a
two-bend part 262 – 274 ms, one kernel build; the station opened → the bed
drawn with 50 blanks 38 – 47 ms; the cut of 50 blanks: frames median 7 ms,
p95 7.1 ms, worst 14 – 21 ms (headless Chrome).

Strings retired (§5): "Several outlines are ready to cut: choose one in
Draw." and "Nothing to bend yet: choose an outline to cut in Draw." —
`shopRoute.js`; `shopRoute.test.js` updated (the only test that held their
behaviour; no script held the strings). `CadWorkspace.laser.dom.test.jsx`'s
"Ten copies: session only" now expects nine new instances in one commit;
`laserStation.test.js`'s station test gets its four blanks from four
instances. No existing verify script set the laser's Quantity.

Files: `laserStation.js` (`shelfPack`, `nestBlanks`, `stockBlanks`,
`nestOf`, `sheetNest`, `laserStation`, `laserTimeline`'s stretch,
`MAX_LASER_QUANTITY` 100), `LaserStation.jsx` (`LaserPanel`: This cut, On
this sheet, the room line, the warning card; `LaserBed`: other blanks, Sheet
switch, `laserAutoView`, per-blank marks and titles, `NONE_ON_SHEET`),
`shopParts.js` (`landingRows`, `landingPositions`, `copyPositions`),
`shopRoute.js` (`stationEntry`), `ShopFloor.jsx` (`DrawPanel` Cut all),
`ShopPanels.jsx` (`CutFromSheetPanel` → `SingleCutPanel` with Quantity,
`BatchCutPanel`), `CadWorkspace.jsx` (`liveShopSession`, the laser state,
`cutFromSheet`, `openLaser`, `laserCut`, `laserCutEnd`,
`changeLaserQuantity`, `leadLaser`, `editLaserOutline`, `returnFromSketch`,
`openStationOn`, the `pendingStation` effect, the film's laser scene, the
panel props), `cad.css`; tests `sheetNest.test.js`,
`CadWorkspace.nest.dom.test.jsx`, `ShopPanels.dom.test.jsx`,
`shopRoute.test.js`, `laserStation.test.js`,
`CadWorkspace.laser.dom.test.jsx`; `scripts/verify-sheet-nest-sn1.mjs`;
`docs/state-machines.md` (`cad-laser`, `cad-film`, the workspace tool
session, the laser station and shop floor route rows).

## 5. Strings and names tests pin (do not rename)

Regions "Draw", "Cut from sheet", "Laser station"; list "Outlines ready to
cut" and its `is-chosen` row; buttons "Cut this" / `Cut {name}`, "Cut on the
laser", "Cut", "Leave laser", "Draw the outline", "Finish sketch", "Cancel
sketch"; labels "Quantity", "Stock sheet", "Blank size", "Laser results",
"Sheet use", "Laser bed", "Bed view"; the Cut notice; `SHOP_STATUS` strings.
`docs/state-machines.md` gets the changed rows (`cad-laser`: the session's
fields; the workspace tool session: `returnTo`; `cad-brake`: the carry of
§7.3). The two gate messages §4.8 retires are the only pinned strings that
go; the tests and scripts holding them are updated and listed in the report.

## 6. Questions for the user (after the build)

1. Should the laser turn a blank 90° when that fits the sheet better (most
   shops do, except on brushed or grained stock)?
2. Do you want to drag blanks on the sheet yourself, or is the automatic
   layout enough?
3. Copies made by Quantity are loose parts on the job board (one card
   each) until grouped. Should copies of one part share a card?
4. A batch is one stock and one thickness (one sheet). Do you cut mixed
   thicknesses often enough to want them chosen per outline in one go?
5. Going to the next part keeps the punch and die in the press brake (§7.3).
   Should the angle and the backgauge distance stay too?

## 7. BQ-1 — bend queue

After SN-1's audit. The press brake goes through the cut parts one by one.

### 7.1 The queue (shopRoute.js)

`bendQueue(model, { params })`, pure: one row per sheet-metal **part** that
has an instance (a bend belongs to the part: its copies fold with it), in
job-board order (`jobProducts`, then each product's instances; a part's row
stands at its first instance):

`{ partId, instanceId (that first copy), name (nodeName of it), copies,
state, text, bends, profile }`

- `flat`: the blank folds, no bend yet — "flat · no bends yet".
- `bent`: it has bends — "{n} bend(s)".
- `finished`: `shopOrderBlock` holds it (painted or printed) — its bends,
  then " · painted" / " · printed".
- `problem`: the blank does not fold — "the blank does not fold".

### 7.2 The strip in the Bend station

`BendQueue` (ShopFloor.jsx), under the shell's head in every state of Bend
that has a part (`PressBrakePanel`, `PressBrakeFinished`,
`PressBrakeBlocked`, the brake's error card, "Nothing keeps this part off
the brake now."), when the queue has two or more rows:

- A heading "Parts to bend" and a count (`role="status"`, `aria-label="Bend
progress"`): "{k} of {n} bent" (bent and finished rows), or "Every part is
  bent." when k = n.
- **Previous part** / **Next part** (`aria-label`s the same; "‹" and "›"
  drawn, `aria-hidden`): the row before / after the part on the brake, off
  at the ends and during a stroke. Next part is the accent button
  (`is-ready`) once the part on the brake has a bend and the next row is
  flat.
- The list (`aria-label="Parts to bend"`): each row a button — thumbnail
  (`OutlineThumb`), name, "× {copies}" when more than one, `text`, a
  `RouteMark` (done for bent and finished, todo for flat); the part on the
  brake `aria-current="true"`. At most ~5 rows high, then it scrolls; the
  current row is brought into view when it changes. Off during a stroke.
- Previous, Next and a row all go through `goStation('bend', { instanceId:
row.instanceId })`: every existing rule of the station's entry holds (a
  painted part shows its Finished card, a blank that does not fold its gate).
- The part on the brake is the row of `brakeSession.instanceId`'s (or
  `brakeBlocked.instanceId`'s) part, whichever copy that is.

No new keys (F and T are the sheet's; Enter and Space the pedal).

### 7.3 The tooling stays in the machine

When Bend moves from one part to another without the station being left
(the strip, a job-board row, the gate's pick while a brake session is
open), the new session starts from `brakeSessionDefaults()` with the old
session's `punch`, `die` and `reverse` (`brakeCarry(session)` in
brakeStation.js). The picks — the edge, L, the points, the angle, the
shape, skips, trims, turned, scrub, the last hit — start fresh. A die that
does not suit the next part's thickness is told by the station's own checks,
as when it is chosen by hand. Leave press brake, Esc out, or another station
in between: the next visit starts from the defaults, as today.

### 7.4 The gate

Bend with several parts and none chosen keeps its "Which part goes on the
press brake?" list, but one row per queue row (per part, with "× {copies}"),
not one per instance. Cut's gate is unchanged.

### 7.5 Sheets to buy (moved from SN-1)

`jobSheet()` returns `stockSheets: [{ stock, thickness, sheet (name),
blanks, sheets, use }]`, one per stock and thickness in the model
(`sheetNest`), shown under the products in `JobSheetPanel` as "Sheets to
buy" and appended to the CSV as rows with Step "Sheet stock". The products'
own rows and totals do not change.

### 7.6 Acceptance — `scripts/verify-bend-queue-bq1.mjs`

Screenshots into `artifacts/sketch-cad/bend-queue-bq1`, 1600 × 1000 and
1366 × 768 (the strip, the primary button and the hit list all reachable at
the smaller size):

1. The batch of §4.7 step 9 (three parts, the second × 2) → Next: Bend →
   the press brake is on the first part; "Parts to bend" has three rows (the
   second "× 2"), "0 of 3 bent", Previous part off.
2. Choose another punch than the default; pick an edge, L 20, pedal → row 1
   reads "1 bend", "1 of 3 bent", Next part is the accent button.
3. Next part → the brake is on part 2 with the punch of step 2 still in;
   bend it → both copies are folded in the view (snapshot bounds of the two
   instances have the flange's height).
4. A click on row 3 → part 3 on the brake; bend it → "Every part is bent."
5. Paint part 1, Bend → row 1 → its Finished card with the strip above it;
   Next part still works from there.
6. Leave press brake, Bend again → the default punch (the carry ended).
7. One sheet-metal part in the model → no strip.
8. Job sheet: "Sheets to buy" matches the laser station's numbers.
9. No page error, no `.cad-error`.

10. The follow-ups of §7.7: two single cuts in a row with the camera not
    moved do not overlap in the view; a job-board row of a batch's part,
    clicked while the laser is open on the batch, moves the lead and keeps
    the job; the replay's cut scenes of the batch read as sentences.

### 7.7 SN-1 follow-ups (from its audit, built with BQ-1)

- **A new cut never lands on a part.** §4.8 kept "one new part lands
  exactly where it does today", so a second single cut with the camera not
  moved stands on the first (`singleCutOverlapsInView` in SN-1's script).
  Now: the lot (a single cut, a batch) lands centred on the drop point when
  its boxes are clear of every instance's XY box (built from the snapshot,
  else its blank's at its position); otherwise the whole lot moves along +X
  in steps to the first place that is clear (rows as `landingRows`, the way
  `copyPositions` already does for Quantity). An empty view, or a clear drop
  point, gives exactly today's position. SN-1's script then asserts no
  overlap instead of recording one.
- **The job board while the laser is on a batch.** A row whose instance is
  in the open job makes its part the lead (`leadLaser`), keeping the job; a
  row outside the job reopens the laser on that part, as today.
- **The replay's titles.** A part named after its outline ("Sketch 1 · 2")
  × 2 reads "Cut two 1 · 2 blanks: sketch and sketch" (`shopFilm.js`'s
  shared-noun wording). A name the wording cannot split is used whole: "Cut
  2 blanks of Sketch 1 · 2". The kiosk's and the control box's titles do not
  change.

Unit tests: `bendQueue` (order, copies, the four states), `brakeCarry`.
DOM tests: the strip's rows and buttons in a `CadWorkspace.*.dom.test.jsx`;
the gate per part. Every verify script of §3.8 and SN-1's still passes.

### 7.8 BQ-1 as built (2026-11-15)

Built as §7.1–7.7 say, with these differences and choices where the spec
was silent:

- **The queue (§7.1).** `copies` counts every instance of the part in the
  model. A part painted and printed reads "{bends} · painted and printed"; a
  finished part with no bend reads "flat · painted" and, as §7.2 says,
  counts as bent (it has gone on down the route). The `bends` figure is the
  bend records (`fold.bends.length`, as `partProgress` says "n bends"), not
  the hits.
- **Where the strip rides (§7.2).** The station shell renders `shell.strip`
  right under its head, so the five states of Bend get the strip from the
  workspace's one `bendShell(instanceId)` without a change to
  `PressBrakePanel`, `PressBrakeFinished` or `PressBrakeBlocked`. The strip is
  a region "Bend queue": the heading and count, Previous part / Next part
  (their text spelled out beside the chevrons), then the list. The list holds
  about five rows (196 px) and scrolls; the current row is brought into view
  by scrolling the list only, never the pane. A row whose blank does not fold
  has a hollow mark and its text in the warning colour. Off while the route
  waits (`routeBusy`: a stroke, a cut, the replay). At 1366 × 768 the strip
  takes about 200 px under the head; the Bend button stays in the pinned
  footer and the hit list is one scroll down (the verify script checks both).
- **The strip on Bend's gate (§7.2, spec silent).** A queue row whose blank
  does not fold opens Bend's gate on that part ("Open the part"); the route's
  own Bend does nothing while Bend shows, so without the strip there the
  operator would be stranded. The strip shows on that gate too.
- **The carry (§7.3)** is read in `goStation` when Bend moves to another part
  while Bend shows: from the open session (`brakeCarry`), or from what the
  brake shows meanwhile — the painted part's Finished card or the shop-order
  refusal (`brakeBlocked.carry`) and Bend's gate on a part that does not fold
  (`shopGate.carry`) — so the punch and die pass through a part that cannot be
  bent on to the next one. An automatic die stays automatic.
- **Where the spec was wrong about the code (§7.3):** "the gate's pick while a
  brake session is open" cannot happen — the pick gate only shows when Bend
  opens with no part chosen, which leaves any session first, and the route's
  Bend does nothing while Bend is open. The carry covers the strip, a job
  board row, and the cards and gate above.
- **The gate (§7.4)** keeps the gate's own order (the product's instances, or
  the model's), one row per part at its first copy there, with the bend
  queue's text as the row's state — so a painted part reads "… · painted"
  there too (`CadWorkspace.route.dom.test.jsx` updated: it pinned
  "Control box body4 bends", now "…4 bends · painted"). Add bend by numbers'
  gate (Bend's, `then: 'add-bend'`) is per part as well: a bend is the part's.
- **Sheets to buy (§7.5)** nests the batch: with Batch n every instance is made
  n times (`stockSheets(model, { batch })`, the panel says so); Batch 1 is the
  laser's own nest, so the row's "{use}% · {n} sheet(s)" is the laser's Sheet
  use word for word. Each row is named "t 1.5 SPCC · 1219 × 2438 mm" and also
  counts blanks larger than the sheet (`oversize`). In the CSV the rows come
  after every product, Product "Sheets to buy", Step "Sheet stock", the sheets
  as the quantity.
- **A new cut never lands on a part (§7.7).** `landingPositions(boxes, at, {
taken })`: the lot centred on the drop point as before; while one of its
  blanks would overlap a standing box, the whole lot moves on through
  `landingRows` slots of its own size (+X, 20 mm apart, a new row along +Y past
  2400 mm) to the first clear one. `taken` (`CadWorkspace.jsx`
  `standingBoxes`): each instance's built XY box from the snapshot, else its
  sheet-metal blank's box at its position (its turn ignored); an unbuilt part
  that is not sheet metal has no box yet. SN-1's script now asserts no
  overlap in its step 4.
- **The job board while the laser is on a job (§7.7)** — any job, not only a
  batch: a row whose instance is in the open job (not cutting) leads with that
  part and becomes the route's subject, the job, the sheet shown and a
  finished cut kept; a row outside it reopens the laser as before.
- **The replay's titles (§7.7).** A name with figures or marks in it
  ("Sketch 1 · 2") is a label: the shared-noun wording never splits labels or
  names whose heads would not tell them apart, labels are never lower-cased,
  and copies under one name are that name once. So: "Cut 2 blanks of Sketch 1
  · 2" (subject "Sketch 1 · 2 · 2 off"), "Cut the Sketch 1 blank"; copies of a
  plain-word name read "Cut two side panel blanks" (it read "Cut two panel
  blanks: side and side"). The kiosk's and the control box's titles are
  unchanged (`shopFilm.test.js` untouched).
- **A job board row makes its part the subject (found by the verify script).**
  With no station open, a row click also sets the route's subject, even when
  that part is already the selection: the queue moves the subject without
  selecting, so before this a row click on the selected part left Paint on
  the part last on the brake.
- **The rb2 stall** (`verify-round-bend-rb2.mjs` died once in nine runs on
  "object null is not iterable" at "hit 3 of 10"): `sheetMetal.js`
  `bendTransform` picked the round bend's hit being formed with a degree
  threshold (`h.angle > 1e-9`) while `zoneTransform` decides in radians
  (`theta > 1e-9`). A hit posed 1e-9° … 5.7e-8° past its start — the first
  frame of a bump hit's bend phase landing in its first ≈ 14 µs (smoothstep
  makes the angle grow as x²) — passed one and not the other, so its origin
  was null and `transformPoint(…, null)` threw inside the stroke's frame loop.
  The hit being formed is now the last one with an origin; a regression test
  (`roundBend.test.js`) fails on the old line with that exact message.

Files: `shopRoute.js` (`bendQueue`), `brakeStation.js` (`brakeCarry`),
`ShopFloor.jsx` (`BendQueue`, `StationShell`'s `shell.strip`, `StationGate`'s
"× copies"), `CadWorkspace.jsx` (`openPressBrake` / `startPressBrake` /
`clearShopOrder` carry, `openStationOn`, `goStation`, `brakeOn`, `brakeQueue`,
`bendShell`, `gatePerPart`, `gateView`, `jobRowClick`, `standingBoxes`,
`cutFromSheet`), `shopParts.js` (`landingPositions` `taken`), `shopFilm.js`
(`isLabel`, `partNames`, `sharedNoun`, the cut scene's title), `jobSheet.js`
(`stockSheets`, `stockSheetLabel`, `jobSheet`, `jobSheetCsv`),
`JobSheetPanel.jsx` (Sheets to buy), `sheetMetal.js` (`bendTransform`),
`cad.css`; tests `bendQueue.test.js`, `CadWorkspace.queue.dom.test.jsx`,
`roundBend.test.js` (the regression), `CadWorkspace.route.dom.test.jsx` (the
gate's rows, the strip in the Finished card's text);
`scripts/verify-bend-queue-bq1.mjs`, `scripts/verify-sheet-nest-sn1.mjs`
(step 4 asserts no overlap), `scripts/verify-fab-shop-sm3.mjs` (it relied on
its second cut landing on the first — the L "laid on the plate" — and now
sets the L there by hand, at the position the old landing gave it); `docs/state-machines.md` (`cad-brake`, the shop
floor route and job sheet rows); `docs/sheet-metal-shop-guide.md` (Several
parts in one go; Bending the parts one by one).
