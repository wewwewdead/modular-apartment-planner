# Sketch Studio shop — every blank is bent on its own (OB-1), and stays fast (OB-2)

Status: **specced 2026-11-22; OB-1 and OB-2 to build (Opus 5.5 high), then audit.**

Related: `docs/sketch-studio-outline-edit-sheet-nest.md` (SN-1 Quantity §4.3, the batch §4.8,
BQ-1 the bend queue §7 — this spec replaces their "copies of one part" rule),
`docs/sketch-studio-cut-pick.md` (RC-1: a sheet-metal part goes with its last blank),
`docs/sketch-studio-fab-shop.md` (the flat blank is the truth), `docs/sketch-studio-shop-floor.md`
(the film, the job sheet), `docs/state-machines.md` and `docs/state-machines/cad-stations.md`,
`docs/state-machines/cad-workspace.md`.

## 1. What the user said (2026-11-22)

"i have a concern in bending shop, for example if i cut a 5 parts in laser, like quantity is 5
then why if i bend one of them then it bends all of the 5? can we fix it? i dont want that kind
of idea. I want if i bend if i cut 5 different parts or same parts then each bend should be
done not bend it in parallel."

## 2. What was read and found

### 2.1 The cause

- A bend is a record in the part's sheet-metal feature (`feature.bends`, model.js :266-276;
  the pedal's commit writes to `p.id === brake.part.id`, CadWorkspace.jsx :2534-2543).
- The laser's Quantity makes **instances of one part**: `cutFromSheet` (CadWorkspace.jsx
  :1493-1571, one `{ partId: m.part.id }` per copy, :1517-1524) and `changeLaserQuantity`
  (:2771-2862, copies of `lead.partId`, :2813-2820). The panel maker's corner pieces are one
  part with an instance per corner (:1528-1536, :3844-3871).
- The kernel builds a shape per part and places a clone per instance (kernel.js :541-800,
  :816), so every copy shows the part's bends. SN-1 and BQ-1 wrote this down as the rule ("a
  bend belongs to the part: its copies fold with it", shopRoute.js :254-263). It is the model
  the user rejects.
- Two more ways to the same state, neither guarded: **Duplicate instance** (CadWorkspace.jsx
  :4664-4679; `duplicateBody` → `duplicateNodes`, groups.js :259-300) and **Reusable
  definitions · + {part}** (CadWorkspace.jsx :5764-5787) put a second instance on any part,
  sheet metal included.

### 2.2 What already counts each blank by itself

`jobProducts`, the job board, the job sheet's rows and times, `routeProgress`, `partProgress`,
finishes and prints are all per instance (jobSheet.js :57-68, :132-260; a loose copy is its own
product and card today). Nothing there changes.

### 2.3 Where copies of one part are merged today (keyed by `partId`)

| Place                                                                          | Today                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `laserStation` (laserStation.js :604-789)                                      | the job with no named ids = the lead part's instances (:629-632); rows per part with `copies` (:651-667); `quantity` = the lead part's instances (:681) |
| `bendQueue`, `gatePerPart` (shopRoute.js :264-303; CadWorkspace :4472-4491)    | one row per part, "× copies"                                                                                                                            |
| `cutParts` (shopRoute.js :310-332)                                             | Already cut: one row per part, "× copies"                                                                                                               |
| `shopOrderBlock`, `finishedHere` (brakeStation.js :949-992)                    | any copy's paint keeps every copy off the brake                                                                                                         |
| `filmScenes` (shopFilm.js :171-180)                                            | copies in one product share a cut scene and bend scenes                                                                                                 |
| `buildCutList` (fabrication.js :13-65), `partsListRows` (partsList.js)         | one line per part, QTY = its instances                                                                                                                  |
| drawing sheets (`sheet.partId`; kernel.js :1120-1144; CadWorkspace :4908-4930) | one detail sheet per part                                                                                                                               |

### 2.4 Facts the design rests on

- Feature, bend and mark ids need only be unique **inside their part** (`normalizeModel`,
  model.js :197-223, checks ids globally only for the model's top-level lists;
  `validateReferences` :748-751 and `validateShopRecords` :266-276 check per part / per
  feature). Hole-seat connections name `toFeatureId` and `holeIndex` (placementHardware.js
  :283-296; the kiosk has 24). So a part copied **with its feature, bend and mark ids kept**
  needs no remapping at all: connections, `again` and `stroke` references hold as they are.
- Several parts may share one `sketchId`: `isShopOutline` only asks whether a consumer exists
  (shopRoute.js :67), `outlineEditRefusal` already walks every part cut from the outline
  (:144-157), RC-1 removes a part with its last blank and gives the drawing back once no part
  is left on it. `sketchConsumer` (sketchPlane.js :137-148) returns the **first** part and its
  first instance: see §4.6.
- No helper copies a part today, and nothing numbers same-named parts (`nodeName`, groups.js
  :140-145: the instance's name, else the part's).
- The kernel rebuilds every part on every build (`model.parts.forEach(build)`, kernel.js :803;
  no cache across builds). A two- or six-bend part costs about 125 ms alone
  (kernel.sheetmetal.test.js :366-377). Ten separate parts therefore cost about ten builds
  where ten copies cost one: OB-2.
- Every commit goes through one function (`commit`, CadWorkspace.jsx :1130-1151, which runs
  `normalizeModel`), and every file load through one line (sketchDocumentUtils.js :141-143).

Siblings read for this: the laser (laserStation.js, LaserStation.jsx), the brake's queue and
shop order (shopRoute.js, brakeStation.js, ShopFloor.jsx), the cut panels (ShopPanels.jsx), the
film (shopFilm.js), the job sheet (jobSheet.js), the cut list (fabrication.js, partsList.js),
the model's removal and load repairs (model.js), groups (groups.js), the kernel (kernel.js),
corner gaps (`setFlangeGaps`), the examples (shopExamples.js). The contract they share after
this spec is §3.

## 3. The rule

**One piece of metal is one part.** A sheet-metal part (a part with a `sheetmetal` feature)
never has two instances. Cutting n blanks makes n parts with one instance each; each has its
own `bends`, so the brake folds the one on it and nothing else. The outline stays one drawing:
the n parts share the `sketchId`.

Words used below:

- **blank**: a sheet-metal part with its one instance.
- **lot**: the blanks cut from one outline in one stock and thickness — same `feature.sketchId`,
  same `stock || 'spcc'`, thickness equal within 1e-6 mm (as `sameThickness`, laserStation.js
  :462). The laser's Quantity is the size of the lead's lot.
- **twins**: parts whose features are the same but for ids (§4.1 `twinKey`). Twins are one line
  on the parts list and one build in the kernel.

Model code that reads a model keeps working on one that breaks the rule (a part with several
instances): unit tests build such models directly, and `shopExamples.js` still returns them.
The rule is kept where models enter the workspace (§4.2).

## 4. OB-1 — every blank is its own part

### 4.1 Helpers

In `sheetMetal.js` (pure, worker-safe; the kernel uses it in OB-2):

- `twinKey(part)`: null when the part has no sheet-metal feature, else a string equal for
  twins: `JSON.stringify` of the part's features where, in the sheet-metal feature, `marks` is
  left out and every string **value** that is exactly a bend's `id` of that feature is replaced
  by `#{its index in bends}` and every `stroke` tag by `~{index of its first appearance}`
  (a `JSON.stringify` replacer on exact values — never a substring replace: the kiosk's ids are
  `…-bend-1`, `…-bend-10`). This covers `again` (sheetMetal.js :479-486). Feature ids stay in
  the key (copies keep them, §4.1 `blankCopy`). Check while building that no other field of a
  bend record holds a bend id; if one does, the replacer already covers it — say so in the
  report.
- `sheetTwinKey(feature)`: the same for the sheet-metal feature alone (OB-2's kernel key).

In `model.js`:

- `blankCopy(part, { name, flat = false })`: a new part — `id: uid('part')`, `name`, every
  other key deep-copied, **feature, bend and mark ids kept**. `flat: true` (a blank fresh off
  the laser): only the sheet-metal feature is kept, with `bends: []`; its `marks`, `base`,
  `kFactor`, `stock`, `thickness`, `sketchId` stay.
- `blankBaseName(name)`: the name without a trailing ` #{digits}`.
- `blankName(base, taken)`: `${base} #${k}`, k the smallest integer from 2 whose name is not in
  `taken` (a Set of part names).
- `separateSheetBlanks(model)`: for every part with a sheet-metal feature and more than one
  instance, the first instance (model order) keeps the part; each later one gets
  `blankCopy(part, { name })` (bends kept: it stands bent on the floor) placed right after the
  part (after its earlier copies) in `model.parts`, and its `partId` re-pointed. Name: the
  part's own name when the instance has a name of its own (the kiosk's "Front face frame" /
  "Rear face frame" tell them apart), else `blankName(blankBaseName(part.name), names in the
model and made so far)`. Sheet annotations that name a moved instance: on a sheet with no
  `partId` their `partId` becomes the new part's; on a part sheet (`sheet.partId` set) their
  `instanceId` becomes the kept instance's. Everything else is untouched (connections, groups,
  finishes, prints and marks name instances; part sheets and Boolean-tool references stay with
  the original part). **Returns the same object when there is nothing to separate**, and
  `validateReferences` reports nothing after it that it did not report before.

In `shopRoute.js`:

- `lotOf(model, instanceId, params)`: the instances of the lot of that instance's blank, in
  model order ([] when it is not sheet metal). `cutParts`, the laser's Quantity and tests use
  it; `laserStation` applies the same rule on its own `eligible` list (one stock and thickness
  already), i.e. same `feature.sketchId`.

### 4.2 Where the rule is kept

- `commit` (CadWorkspace.jsx :1130): `separateSheetBlanks(normalizeModel(next))` is what is
  stored and returned. This one line covers Duplicate instance, `duplicateBody`, Reusable
  definitions, the Model JSON editor and `loadExample` (the kiosk: 5 sheet-metal parts become
  11, names unchanged because every instance is named).
- Load (sketchDocumentUtils.js :141-143): `separateSheetBlanks` after `removeBlanklessParts`,
  before the outer `pruneGroups`. A file saved with a part × 5 opens as five blanks, each bent
  as it stood. Add the sentence to the load-repair comment there.
- The paths below make their parts explicitly (they choose flat or bent and the names); the
  keeper is the net under everything else.

### 4.3 Cut from sheet

`cutFromSheet` (CadWorkspace.jsx :1493):

- A lot of quantity n: the first blank is `lot.part` as handed over (its name untouched: a
  single cut stays "Sheet-metal part", a batch part its outline's name); blank k ≥ 2 is
  `blankCopy(lot.part, { name: blankName(lot.part.name, taken) })`, `taken` = the model's part
  names plus those made in this commit. Bends are kept (the panel maker's "Cut and bend it for
  me" hands over a bent part). One instance per part; positions, the one commit, the selection
  and `pendingStation` as today (`instanceIds` for a batch: every new instance).
- Companions (corner pieces): one part per **pose** — the first pose `c.part`, the others
  `blankCopy(c.part, { name: blankName(…) })` — grouped with the panel as today.
- The three cut panels (ShopPanels.jsx) keep their Quantity fields and texts.

### 4.4 The laser

`laserStation` (laserStation.js :604):

- `job` with no named `session.instanceIds`: every blank of the **lead's lot** (was: every
  instance of the lead's part). With named ids: as today.
- `parts`: one row per **lot** in the job, in job order (key: the feature's `sketchId`; stock
  and thickness are one for the station): `partId` and `instanceId` its first blank in the job,
  `name` = `blankBaseName` of that blank's part name, `copies` = its blanks in the job, `lead`
  = the lead's lot. `numbers`, `flat`, `profile` as today.
- `quantity`: the lead's lot in the model (its blanks, whatever the job names).
- `blanks[].lead`: the blank is of the lead's lot. `blanks[].name`, `others[].name`: the
  instance's name, else its own part's (so "Tray #2" on the bed's titles).
- The per-part `geometry` map is keyed by `sketchId` (one `profilePolygon` + `cutPlan` per
  outline, not per blank). `folds` stays per part.
- A model with several instances of one part still works (they are one lot).

`changeLaserQuantity` (CadWorkspace.jsx :2771), `mine` = the lead's lot:

- **More**: n − lot new blanks, each `blankCopy(leadPart, { flat: true, name })` with one
  instance — a blank fresh off the laser is flat, whatever has been bent since. `name`:
  `blankName(blankBaseName(the lot's first part's name), the model's part names + those made)`.
  Positions through `copyPositions` as today when the lead is flat (its built box, its turn and
  Z). When the lead has bends: the box is the flat blank's bounds at the lead's position, the
  new blanks lie flat (`rotation [0, 0, 0]`, Z 0), still clear of every standing box. An
  unbuilt blank of the lot counts as standing (today's `i.partId !== lead.partId` test becomes
  lot membership). One commit; a named job gains the new ids (`instanceIds`, `fresh`) as today.
- **Fewer**: the newest blanks of the lot go first (model order, last first), never the lead
  and never a blank with something of its own: **a bend, a feature after the sheet-metal one**,
  a finish, a print or a group. Through `removeInstances` (model.js :514: the part goes with its
  blank). The note when fewer can go than asked:
  "{k} blanks are bent, painted, printed or grouped: delete them in the view if you mean to."
  / "1 blank is bent, painted, printed or grouped: delete it in the view if you mean to."
- **Etch bend lines / Clear** stay the lead blank's own (its part's `marks`, from its bends).
- The Quantity field, its label and max (`MAX_LASER_QUANTITY`) do not change.

`LaserStation.jsx`: "This cut" shows per lot ("Small × 2") from the new rows; nothing else
changes. `leadLaser`, `jobRowClick`, the Sheet switch, the Cut notice: unchanged.

`cutParts` (shopRoute.js :310, Already cut): one row per **lot** in model order — `partId` and
`instanceId` its first blank, `name` the base name, `copies` the lot, `sheet`, `profile`.

### 4.5 The press brake

- `bendQueue` and `gatePerPart` keep their code: with one instance per part they are one row
  per blank. Rewrite the comments that say copies fold together (shopRoute.js :254-263,
  ShopFloor.jsx :558, CadWorkspace.jsx :4469-4471, brakeStation.js :944-947, :975-979). "×
  copies" stays for a model that still has copies (tests build them).
- `shopOrderBlock` / `finishedHere` are per part, so per blank: painting one blank no longer
  keeps its lot off the brake. No code change.
- `brakeCarry` (punch, die, reverse to the next part) is unchanged: five identical blanks are
  five visits to the brake, each bent by hand.
- The pedal's commit already writes one part. Nothing else in the brake changes.

### 4.6 One outline, several parts

- `editSketch` (CadWorkspace.jsx :1968): the frame and the way back are the **asked**
  instance's when the caller names one (`returnTo.instanceId`: the laser, the part's form, the
  Tree's ↳ Edit sketch on the selected part), not `sketchConsumer`'s first. `sketchWorldFrame`
  gains an optional instance for this; with none it behaves as today.
- `setFlangeGaps` (CadWorkspace.jsx :2028) moves the shared outline and re-seats the acting
  part's bends. The other blanks of the lot keep their bend records and are held by the guard
  it already calls (`outlineEditRefusal`). Unit test: two twins with the same four bends, Set
  gap on one → both still fold, with the same flat and folded bounds. If the twin is left
  different in anything but `punchTrim` / `dieTrim`, carry `result.bends` to every blank of the
  lot whose bends were twins of the acting part's before the change (by index, their own ids
  kept), and say so in the report.
- The ⚠ badge in the feature list (CadWorkspace.jsx :5717) compares `runtime.error.partId` as
  well as the feature id (copies share feature ids).
- `routeProgress` counts a lot's outline once ("1 outline"): correct, unchanged.

### 4.7 The film

`filmScenes` (shopFilm.js :161), inside one product:

- **Cut scenes**: one per lot (was: per part): its blanks together, `key: cut:${first
partId}`, `partId` the first blank's, `instanceIds` all of them, estimate × n. Titles and
  subjects as today, with each blank's name read through `blankBaseName` (so five blanks "Tray",
  "Tray #2" … read "Cut five tray blanks", "tray · 5 off"; the kiosk's "Cut two face frame
  blanks: front and rear" is unchanged).
- **Bend scenes**: blanks of one lot go through together only while their `bends` are the very
  same records (`JSON.stringify(feature.bends)` equal, ids included) — copies made together
  and never bent apart (the kiosk; "Cut and bend it for me" × n; a duplicate). Blanks bent by
  hand have their own bend ids, so each plays its own hits: the film shows what was done.
  `filmState` needs no change (a group shares its bend ids).
- A model with several instances of one part groups exactly as today (`shopFilm.test.js` and
  `kiosk.test.js` run on such models and must pass untouched).

### 4.8 The cut list and the parts list

`buildCutList` (fabrication.js :13): sheet-metal parts that are twins (`twinKey` equal) are one
row — the first part's `partId`, `name` (`blankBaseName`) and geometry, `quantity` the sum of
their instances. Every other part as today. So five identical trays are "Tray, QTY 5" and the
kiosk still lists 8 parts; a tray bent differently is its own line. Whatever iterates the rows
(the parts list and balloons, the cutting list panel, the CSV, `planSheets`, the workshop ZIP's
STEP / DXF files) then reads as before the split: check each and list in the report any that
iterates `model.parts` instead and now writes one file per blank.

### 4.9 Texts

New or changed: the two Quantity notes of §4.4 (they replace "… copies are painted, printed or
grouped …"). Names: " #2", " #3" … Everything in `docs/sketch-studio-outline-edit-sheet-nest.md`
§5 stays pinned.

### 4.10 Tests and scripts that hold the old model

Update these to the rule (each change listed in the report, old → new); tests on pure functions
fed a several-instance model stay as they are unless §4 changes what the function returns:

- `sheetNest.test.js` (:159-264 the job and rows: the default job and `quantity` are the lot's),
  `laserStation.test.js` (:270-291), `shopRoute.test.js` (:244-250 `cutParts`),
  `bendQueue.test.js` (rows stay; add the one-part-per-blank cases).
- `CadWorkspace.laser.dom.test.jsx` (:179-211: +9 **parts** and instances in one commit),
  `CadWorkspace.nest.dom.test.jsx` (:126-259: 4 parts for the batch, `Small × 2` kept in This
  cut, the note's new text), `CadWorkspace.queue.dom.test.jsx` (:78-96 fixture, :172, :198-201
  — the test that pins "both copies fold with it" becomes "only the blank on the brake folds",
  :253-298), `CadWorkspace.stationExits.dom.test.jsx` (:215-273), `CadWorkspace.film.dom.test.jsx`
  (:270-292: the front face frame's card names its own one paint finish; "Remove a paint finish
  and bend"), `CadWorkspace.kiosk.dom.test.jsx`, `ShopPanels.pick.dom.test.jsx` (:153-161),
  `CadWorkspace.cutPick.dom.test.jsx`.
- `scripts/verify-sheet-nest-sn1.mjs` (:159-222, :490-526), `scripts/verify-bend-queue-bq1.mjs`
  (:193-304: its step 3 now asserts that the second "Sketch 1 · 2" blank stays flat),
  `scripts/verify-cut-pick-rc.mjs` (:183, :198), and any other verify script that fails for
  this reason. Run every shop verify script (`verify-fab-shop-sm1…sm4`, `-shop-floor-sf1/sf3/
sf4/sf5`, `-shop-trim-st1`, `-outline-edit-oe1`, `-sheet-nest-sn1`, `-bend-queue-bq1`,
  `-cut-pick-rc`, `-corner-gaps-cg1…cg4`, `-round-bend-rb1…rb3`, `-tight-bends-tb1…tb3`,
  `-brake-hands-on`, `-piece-pick`, `-sheet-slide`, `-skin-gauge`); the dev server is on 5180
  (`npx vite --port 5180 --strictPort`).

New unit tests: `separateSheetBlanks` (same object when nothing to do; a part × 3 with bends →
3 parts, ids kept inside, names, order in `parts`; named instances keep the part's name;
annotations on both kinds of sheet; a Boolean-tool part; running it twice changes nothing; the
kiosk: 11 sheet-metal parts, every hole-seat connection still resolves), `blankCopy`,
`blankName` / `blankBaseName`, `twinKey` (ids, `again`, `stroke`, prefix ids, marks ignored, a
different angle is not a twin), `lotOf`, the laser's lot (job, rows, quantity), `cutParts`, the
film's two groupings (lot for cut; same records for bend; hand-bent twins play separately; a
several-instance part as before), `buildCutList` twins. DOM tests: Quantity more (flat new
blanks beside a bent lead) and fewer (a bent blank stays, the note); Duplicate instance on a
bent blank makes a second part, and a bend on the copy leaves the original.

### 4.11 Acceptance — `scripts/verify-own-bends-ob1.mjs`

Screenshots into `artifacts/sketch-cad/own-bends-ob1`, 1600 × 1000 and 1366 × 768:

1. Rectangle 300 × 200, Quantity 5 in Cut from sheet → Cut on the laser: 5 parts and 5
   instances named "Sheet-metal part", "Sheet-metal part #2" … "#5"; the laser's Quantity reads
   5, the bed has Blank 1 … 5, no This cut list; "Cut 5 blanks on the 1219 × 2438 mm sheet".
2. Next: Bend → the brake is on the first; "Parts to bend" has five rows, "0 of 5 bent". Pick
   an edge, L 20, pedal → row 1 "1 bend", "1 of 5 bent"; in the snapshot the first instance
   stands a flange high and **the other four are flat** (their Z extent is the thickness).
3. Next part → "#2" with the punch still in; L 30, pedal → #1 and #2 have different bounds,
   #3 … #5 flat.
4. Paint the first blank. Bend → row 3 opens the brake (no shop-order card); row 1 shows the
   Finished card for that blank alone ("a paint finish").
5. Cut → the laser on "#3": Quantity 5 → 3 removes "#5" and "#4" (flat, newest first) in one
   commit, one Undo brings both back; Quantity 1 → nothing goes, "2 blanks are bent, painted,
   printed or grouped: delete them in the view if you mean to."; Quantity 4 → a new flat blank
   beside the others, no overlap in the view (snapshot bounds).
6. Duplicate instance on the bent "#2" → one more part, bent like it; bend the copy again →
   "#2" is unchanged.
7. An old save (a fixture under `scripts/fixtures/`: one part, two bends, three instances)
   opens as three parts, each folded as before (the three snapshot bounds are what the old
   model built); a bend on one leaves the other two.
8. The kiosk example: 11 sheet-metal parts; the film has 25 scenes with the titles of
   `shopFilm.test.js`; the parts list has 8 rows; with the front face frame painted the rear one
   still opens on the brake.
9. The batch of SN-1 step 9 (three outlines, the second × 2): 4 parts, This cut three rows with
   "× 2" on the second, Already cut the same, the bend queue four rows.
10. Timing, reported (OB-2 is measured against it): commit → "Model current" for Quantity 10 of
    a blank, then with all ten bent twice the same way.
11. No page error, no `.cad-error`.

Then the full suite (`npx vitest run`), `npm run lint`, `npm run build`.

### 4.12 Docs

- `docs/sheet-metal-shop-guide.md`: "A blank: the laser station" (Quantity makes blanks, each
  its own part; raising it later adds flat blanks; lowering it never takes a bent or painted
  one), "Cutting a part again", "Choosing what to cut", "Several parts in one go", "Bending the
  parts one by one" (the "× 2 … both copies fold together — bend it once" sentence goes: every
  blank is a row and is bent by itself), the Shop order paragraph (paint on one blank holds
  only that blank), the Replay section (blanks made together are shown together; blanks bent
  one by one play one by one), the kiosk walk-through ("two face frames": two parts).
- `docs/state-machines/cad-stations.md` (`cad-laser`: the lot, Quantity, the session's
  `instanceIds` default; `cad-brake`: the queue per blank; `cad-film`),
  `docs/state-machines/cad-workspace.md` (:332-350, :396-397: the batch, the gate, Quantity's
  removal; `commit` keeps the rule). Prose only; no table in `docs/state-machines.md`.
- `docs/sketch-studio-outline-edit-sheet-nest.md`: one line under §4.3 and under §7.1 pointing
  here ("superseded by docs/sketch-studio-own-bends.md: a blank is its own part").
- This file: §4.13 "OB-1 as built" (differences, judgment calls, where this spec was wrong
  about the code, measurements, files).

## 5. OB-2 — twins cost one build

After OB-1's audit.

### 5.1 The kernel builds a twin once

In `createKernelSession` (kernel.js), `sheetMetal(f, partId)` keeps, per build, a map from
`sheetTwinKey(f)` to what it made (the flat blank solid and the folded shape, and whether the
fuse fell back to a compound). A part whose key is already there takes **clones** of those
(owned, so `dispose` frees them) and computes only its own `foldSheet` for `blanks.get(partId)`
and its metrics (which carry its own bend ids). Later features of the part work on its own
clone, as they do today on its own shape. Nothing outside the kernel changes; the snapshot of
a model of twins equals, part for part, the snapshot without the sharing (test: bounds, volume,
metrics).

### 5.2 One fold per blank per model

Several callers fold every part of the model on each render or call (`stockBlanks`,
`bendQueue`, `routeProgress`, the job sheet). Where §5.4's measurements ask for it, memoize
`foldSheet` by the identities of its three arguments (a `WeakMap` on the feature holding the
last profile, params and result; successes only), in one place the callers share. Features,
profiles and the resolved parameters are replaced, never mutated, so identity is safe: confirm
it for `sheetParameters` and say so.

### 5.3 Drawing sheets

- "Add missing part sheets" (CadWorkspace.jsx :4908-4930) and the automatic detail sheets
  (kernel.js :1120-1144, `includeParts`): one sheet per group of twins (its first part), not one
  per blank.
- The part pickers (SheetEditor.jsx :143-149, :396-402; SheetsPanel.jsx :226-234): two parts
  with the same name read `{part name} ({its instance's name})` when the instance has a name of
  its own, so the kiosk's two face frames can be told apart.

### 5.4 Acceptance

- Kernel test (node, beside kernel.sheetmetal.test.js, same best-of-runs timing): ten twins of
  the two-bend part build in at most 1.5 × the time of one part with ten instances; report both
  and the figure without §5.1.
- `sheetNest` for 100 one-instance parts in 10 lots: at most 5 ms warm (the SN-1 ceiling),
  `laserStation` on that model reported.
- `scripts/verify-own-bends-ob1.mjs` step 10 again: both figures before and after; the kiosk's
  load → "Model current" before OB-1 (git stash is not available: measure it on the builder
  output with the keeper bypassed in a node test), after OB-1, after OB-2.
- The pickers and "Add missing part sheets" in a DOM test; the PDF's automatic sheets for the
  kiosk are as many as before OB-1.
- Every script and test of §4.10 – §4.11 still passes; lint and build clean.
- This file: §5.5 "OB-2 as built".

## 6. Not in this spec — asked of the user after the build

1. Five identical blanks are bent five times by hand. Should the brake offer "Bend like the
   last one" (one click repeats the previous blank's bends on the blank on the brake, which
   stays its own)?
2. Going to the next blank keeps the punch and die. Should the angle and L stay too
   (outline-edit-sheet-nest §6 question 5)?
3. Etch bend lines marks the lead blank only. Should it mark every blank of the lot?
4. The film shows blanks made together (the kiosk's frames) bent together, and blanks bent by
   hand one after another. Should it always show each blank?
5. The names "Sheet-metal part #2": is that how the shop would number them?

## 7. Rules for the build

- The working tree holds a lot of uncommitted work from earlier features: do not commit, do not
  stash, do not revert or reformat files you are not changing.
- Read `docs/state-machines.md` and the two subsystem pages before touching `commit`, the laser
  session or the load path.
- Match the surrounding code's comment style (each rule states its spec section).
- The machine is short of memory: run the tests of the files you touch as you go, the full
  suite once at the end of the phase.
- Report: what was built per section, every judgment call, every place this spec was wrong
  about the code, each test or script changed (old → new), the measurements, the files.
