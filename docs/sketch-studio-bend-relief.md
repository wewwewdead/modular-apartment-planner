# Sketch Studio — bend reliefs in one click (BR-1)

Status: **BR-1 built + audited 2026-11-19 (§8, §9), uncommitted; awaiting the user's verdict.**

Related: `docs/sketch-studio-fab-shop.md` (the fold, §5), `docs/sketch-studio-corner-gaps.md`
(§4.2 the crossing refusal and its relief hint), `docs/sketch-studio-sketch-dimensions.md`
(the last tool added to the sketcher; BR-1 follows its shape), `docs/state-machines.md`
(the "In-viewport sketcher tool" row).

## 1. What the user asked for

2026-11-19: "when i want to draw or sketch a bend relief for bending machine, i do it
manually. How can we automate it like click it then automatically add a bend relief like
Corner Relief, Obround / Round Relief." Source they gave:
protospacemfg.com/blog/post/bend-reliefs-in-sheet-metal-design.

## 2. What was read and found (2026-11-19)

### 2.1 The shop rules (the user's article, SendCutSend's guide, Fusion's sheet-metal rules)

- A relief is needed where a bend ends beside flat metal (a tab on an edge, a flange
  shorter than its edge) and where two bends meet at a corner (a tray, a box). Without it
  the metal tears, bulges or the flanges do not close.
- Shapes: rectangular, obround (a slot with a round end), round (a hole on the corner).
  A tear (zero width) is a CAD fiction: no laser cuts zero kerf. Not offered.
- Width: the thickness or a little more (Protospace); never under half the thickness
  (SendCutSend); the laser's own minimum is about 0.4 mm.
- Depth: "just beyond the bend radius" (Protospace); "at least as deep as the start of
  the bend", rule of thumb t + r + 0.5 mm from the bend line (SendCutSend).
- A corner relief is centred where the two bend lines meet (Fusion "Intersection").

### 2.2 What the fold really needs (plain-node probes, 1.2 mm SPCC, default tooling)

`foldSheet` (sheetMetal.js) cuts a strip of width BA over each interval of a punch line
and refuses two strips that share metal. Half the zone at 90°: 0.8 → 1.02, 1.2 → 1.41,
1.5 → 1.76, 2 → 2.11, 3 → 4.16 mm.

- A cross blank (base 200 × 100, flaps 20) with bends through the four inside corners:
  refused, "Bend 3 crosses bend 1 … The relief must reach 1.41 mm". A square relief
  centred on each corner folds from half side 1.412; a round one from R 1.431. So the
  model's rule is: **the relief reaches half the bend zone past each bend line.**
- A tab (20 wide on a 100 edge): with no relief a line on the edge bends the tab alone,
  but a line 0.5 inside the edge bends the whole 100 mm strip (the line finds one
  interval, edge to edge). With a 1.2 × 2 slot each side, a line 1 mm inside bends only
  the tab. So a bend relief is what lets a tab's line sit inside the edge.
- A round relief's edge is a curve: every bend ending on it gets the existing
  `outline-not-square` note (4 on the cross). Square and slot reliefs give none.

### 2.3 What the user draws by hand today

`scripts/fixtures/corner-gaps-sample-bending.json` (their tray): at each base corner the
two wall ends would meet at an inside corner, e.g. (285.970563, 82.029437); they drew a
2 × 2 square centred on it with five lines (x 284.970563 … 286.970563, y 81.029437 …
83.029437), and one came out skew (286.9855, 82.029325). That is BR-1's Square, size 2,
on that corner.

### 2.4 The sketcher today

- `sketchTools.js`: `SKETCH_TOOLS` (:17), a pure reducer (:308); `add` (:195) appends one
  entity; Undo last (:242) removes what the session added; `previewEntities` (:383).
- `CadSketcher.jsx`: `locate` (:111) snaps the cursor (`SNAP_PIXELS` 8); the toolbar maps
  `SKETCH_TOOLS` (:336); the Dimension tool has a readout by the cursor and no fields
  (:420); the HUD with fields follows the cursor, so nothing in it can be clicked.
- `sketchProfile.js`: entities are `line`, `rect`, `circle`, `arc`; `profileLoops` (:254)
  finds closed loops; an outline is a chain of lines and arcs joined end to end. A circle
  drawn over a corner is not a relief: it crosses the outline and is no loop inside it.
  A relief must be spliced into the outline's own lines.
- `outlineMove.js` `outlineEditor(profile).check()` (:405) throws when an outline crosses
  itself or a cut-out leaves the blank.
- `CadWorkspace.jsx`: `sketchSnap` (:589) is workspace state handed to the sketcher;
  `beginSketch` (:1707) builds the session; `editSketch` (:1797) knows the part cut from a
  sketch (`sketchConsumer`); `finishSketch` (:1904) already guards a cut part's outline
  (`outlineEditRefusal`). Cut from sheet starts at 1.5 mm (`ShopPanels.jsx` :299).

Nothing downstream needs changing: `profilePolygon` samples arcs, the laser path length
reads arcs exactly, `outlineMove` and `cornerGaps` leave arcs alone.

## 3. Design

A **Relief** tool in the sketch bar. Move to an inside corner (or, for a slot, to a
straight edge): the relief is previewed; click: it is cut into the outline. The relief is
ordinary lines and arcs afterwards (the flat blank is the truth; no relief record, no new
model key, `CAD_VERSION` untouched).

### 3.1 New pure module `sketchRelief.js`

No three, no DOM. Works on sketch entities; plain numbers.

**Corners.** `reliefCorners(entities)` → `[{ point, edges: [{ id, away }, { id, away }],
square }]`: every point where exactly two straight edges of one closed loop meet (line
ends; a `rect`'s corners) and the metal takes more than 180° (an inside corner). Metal is
inside an outer loop and outside a loop directly inside it (a cut-out). `away` is the unit
direction along each edge away from the corner; `square` when they are perpendicular
(1e-6). No corners from open chains, construction entities, a corner with an arc for a
neighbour, or loops nested deeper.

**Shapes** (a₁, a₂ = the two `away` directions at corner V):

| Key       | Where                                                        | Fields           | Geometry                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `round`   | inside corner                                                | Diameter D       | Circle R = D/2 centred on V. Both edges are trimmed to V + R·a; one arc joins them through V − R·unit(a₁ + a₂).                                                                                                                                                                                                                                                                                                                                             |
| `square`  | inside corner, `square` only                                 | Size S           | Square of side S centred on V, sides along the edges. Trim to V + (S/2)·a; four lines of length S/2, S, S, S/2.                                                                                                                                                                                                                                                                                                                                             |
| `rect`    | inside corner (along one edge) or a point on a straight edge | Width w, Depth d | Corner: a slot continuing the **pointed** edge (the one of the two nearer the raw cursor) d past V, w wide on the other edge's side: the other edge is trimmed by w (w / sin of the corner angle when not square), then a line d long, a line w long, and the pointed edge runs on to the slot's bottom (it is extended, not a new entity). Edge point X: a slot w wide centred on X, d into the metal: the edge is split in two and three lines join them. |
| `obround` | as `rect`                                                    | Width w, Depth d | The same slot with a half-round bottom of radius w/2: straight sides d − w/2, one arc through the deepest point. d ≥ w/2 (equal: a half round, no straight side).                                                                                                                                                                                                                                                                                           |

Square on the corner of §2.3 with S = 2 must give the user's own points to 1e-6.

**Automatic sizes.** `reliefSizes({ thickness, stock })`: h = half the bend allowance of
a 90° bend in that sheet with its default tooling (`bendNumbers`); reach e = h + 0.5
rounded up to 0.1 (the 0.5 is SendCutSend's clearance; it is also how far a bend line may
sit off the corner). `{ reach: e, round: 2e, square: 2e, width: max(t, 0.5) to 0.1,
rectDepth: e, obroundDepth: e + width / 2 }`. For 1.2 SPCC: Ø4, 4 × 4, 1.2 × 2,
1.2 × 2.6. A typed size wins over the automatic one.

**Picking.** `reliefPick({ entities, raw, point, tolerance, shape })` → what a click
would do: `{ type: 'corner', corner, pointed }`, `{ type: 'edge', id, at }` or `{ type:
'none', message }`. Corners within `tolerance` of the raw cursor come first (nearest);
`rect` / `obround` with no corner near take the straight edge under the cursor at the
snapped `point`. Messages (shop words): no inside corner near; an outside corner needs no
relief; Round and Square go on an inside corner; Square needs a square corner (use
Round); close the outline first.

**Cutting.** `cutRelief({ entities, pick, shape, sizes, nextId })` → `{ entities, added:
[ids], replaced: [the entities as they were], nextId, text }` or throws in shop words.

- Ids: an edge that is only trimmed or extended keeps its id; new pieces take the next
  free `e` ids; a `rect` entity becomes four lines (new ids) first. New pieces go in the
  list right after the edge they follow. Points rounded with `roundPoint`.
- Refused, nothing changed: a size that is not a positive number; an edge too short ("The
  edge beside this corner is 1 mm long: the relief needs 2 mm of it." — at least 0.01 mm
  of every trimmed edge must stay); an obround with d < w/2; an edge slot within w/2 of
  an end; a result that is no longer one closed outline per loop or that
  `outlineEditor(…).check()` refuses ("This relief would cut through another edge: make it
  smaller.").
- `text`: "Round Ø4", "Square 4 × 4", "Rectangular 1.2 × 2", "Obround 1.2 × 2.6".

Reference dimensions are left as they are (they only report; a dimension to the sharp
corner still reads the sharp corner).

### 3.2 The reducer (`sketchTools.js`)

- `SKETCH_TOOLS` gains `['relief', 'Relief']` after Dimension.
- State gains `relief: { shape, sizes: { diameter, size, width, depth } (typed, null =
automatic), sheet: { thickness, stock } }`, set by a `relief` action and by
  `createSketchState`'s new last argument. Default shape `square`.
- `move` stores what it stores today; a `click` with the tool on cuts at the pick
  (`reliefPick` + `cutRelief` with the click's raw point, snapped point and tolerance);
  a refusal goes to `message` and nothing changes. The tool stays on.
- `added` gains `{ kind: 'relief', ids, replaced }`. Undo last on it removes `ids` and
  puts `replaced` back (an entity still there by id is replaced, one gone is added back).
  It counts as present while any of its ids is.
- `previewEntities` returns the relief's new pieces at the hover pick (ids `preview…`);
  none when the pick is refused.
- `reliefReadout(state)` → `{ value, note }` for the box by the cursor: "Square 4 × 4" /
  "click to cut · Esc ends the tool", or the refusal with no note; null without a cursor.
- `sketchFields` returns none for the tool; Enter does nothing; Esc drops the tool.

### 3.3 The sketcher (`CadSketcher.jsx`)

- While Relief is on, an options row under the sketch bar (in `.cad-sketch-top`,
  `role="group"`, `aria-label="Relief options"`): Shape select (`aria-label="Relief
shape"`: Square, Round, Obround, Rectangular); the shape's size fields (`Relief size
(mm)`; `Relief diameter (mm)`; `Relief width (mm)` + `Relief depth (mm)`), each empty =
  automatic with the automatic value as placeholder; the sheet: `Relief sheet thickness
(mm)`, or, when the outline belongs to a cut part, fixed text "1.2 mm SPCC (this
  part)". Number boxes use the app's numeric input (Enter / blur commit); focus in them
  never eats the sketcher's keys wrongly (Esc from a field returns focus to the canvas
  flow as the Snap box does today).
- The box by the cursor is a readout like Dimension's (`aria-label="Relief readout"`,
  `.cad-sketch-hud.is-readout`), clicks pass through it. No typed HUD for this tool; the
  toolbar button gives up focus as Dimension's does.
- Status hint: "Move to an inside corner and click to cut the relief · Obround and
  Rectangular also go on a straight edge · sizes in the bar above (empty: automatic for
  the sheet) · Esc ends the tool."
- Key R toggles the tool (as D toggles Dimension), only if nothing else in sketch mode
  uses R; otherwise no key.
- Changes to shape, typed sizes and sheet thickness are reported up
  (`onReliefChange`), so the next sketch starts with them.
- The row must fit at 1366 × 768 with the sketch bar wrapped (measure it; the bar already
  wraps).

### 3.4 The workspace (`CadWorkspace.jsx`)

- `sketchRelief` state beside `sketchSnap` (shape, typed sizes, sheet thickness + stock;
  start: square, all automatic, 1.5 mm, `DEFAULT_STOCK`), passed to `CadSketcher` with
  `onReliefChange`. Session-only, not saved in the file.
- `beginSketch` puts `sheet` on the session: the cut part's `{ thickness, stock, fixed:
true }` when a sheet-metal feature consumes the sketch (resolved numbers); else the
  thickness and stock Cut from sheet handed over with Edit outline when there are any;
  else the remembered ones.
- The "Sketching" help panel (:6529) gains one paragraph on Relief.
- `finishSketch` is untouched: a cut part's outline still goes through
  `outlineEditRefusal`, so a relief that breaks a made bend is refused in its words.

### 3.5 Words for the user

`docs/sheet-metal-shop-guide.md`, under "1 · Draw — the blank": a section **Bend
reliefs** — when one is needed (tab, corner), the four shapes and what each is for, the
automatic size and why (half the bend zone + 0.5), typing your own, that a round relief
leaves the `outline-not-square` note on the bends that end on it, Undo last, and that the
relief must be cut before the second bend of a corner is made (Edit outline brings you
back). Plain shop words, no file names.

`docs/state-machines.md`: extend the "In-viewport sketcher tool" row (Relief: one state,
hover → click cuts, the tool stays on; Esc → no tool; Undo last restores).

## 4. Not in BR-1 (parked; ask the user)

1. A warning at the brake when a bend ends against flat metal with no relief. Probed: a
   rule on the fixed side of the zone is clean on the user's tray and catches the bare
   tab, but a round relief's horns need invented thresholds.
2. Cutting the relief from the bend side ("Bend 5 crosses bend 1" → Cut relief here),
   centred on the bend lines' crossing rather than the outline's corner. Needs a general
   cut of a shape out of the outline.
3. A corner notch (a tray from a plain rectangle: click an outside corner, W × H).
4. "Every inside corner" in one click (a square relief's own corners are inside corners:
   a second press would relieve the reliefs).
5. Quieting `outline-not-square` on a round relief.
6. Remembering the sizes between app starts.

## 5. Acceptance

### 5.1 Unit and DOM tests (new files; no existing assertion edited except where named)

- `sketchRelief.test.js`: `reliefCorners` on the cross (4 of 12), a `rect` (none), a
  rectangular cut-out (4), an open chain (none), an arc neighbour (none), a 135° corner
  (`square` false). Each shape's exact points on the cross corner (0, 0); Square 2 on the
  §2.3 corner equals the user's points; `rect` / `obround` on the tab corner from each of
  its two edges, and on an edge point; a `rect` entity's side (it becomes four lines);
  every refusal of §3.1 with its words; ids kept and new ids in order;
  `reliefSizes` for 0.8 / 1.2 / 1.5 / 2 / 3 mm SPCC.
- Fold checks in the same file or beside it (through `entitiesToProfile` + `foldSheet`):
  the cross with automatic Square at four corners and four bends through the corners
  (segments within the base) folds with no warning, and without the reliefs is refused
  with "crosses"; automatic Round folds (the `outline-not-square` notes are expected);
  the tab with automatic Rectangular, then Obround, and a line 1 mm inside the edge bends
  one 20 mm interval.
- Reducer tests (`sketchReliefTool.test.js`): tool on → hover preview → click cuts and
  the tool stays; a refused click changes nothing and sets `message`; Undo last after a
  relief, after a relief then a line (two undos), and after a `rect` was split; Esc;
  typed size wins, cleared size is automatic again; the readout strings.
- `CadSketcher.dom.test.jsx` (added cases): the Relief button, the options row and its
  labels, a click on a corner of a drawn cross changes the item count and `onFinish`
  receives the arcs / lines; `onReliefChange` fires on a shape change; R toggles.
- A `CadWorkspace.*.dom.test.jsx` (new file): Draw → cross → Relief on a corner → Finish
  → `model.sketches[…].profile` is a closed path holding the relief; Edit outline of a
  cut 1.2 mm part shows "1.2 mm SPCC (this part)".

### 5.2 Browser — `scripts/verify-bend-relief-br1.mjs`

Style of `scripts/verify-sketch-dimensions-sd1.mjs` (steps from
`scripts/sketch-cad-steps.mjs`), screenshots at 1600 × 1000 and 1366 × 768 into
`artifacts/sketch-cad/bend-relief-br1`:

1. Shop → Draw: the cross blank (base 200 × 100, flaps 20) with the Line tool, typed.
2. Relief: the options row shows Square and "4" as the automatic size for 1.5 → set the
   sheet to 1.2 → still 4; the readout at an inside corner reads "Square 4 × 4".
3. Click the four inside corners → still "closed profile"; screenshot.
4. Undo last once → three reliefs; click the corner again → four.
5. Switch to Round on a second cross drawn beside it; cut its four corners.
6. A third outline: the tab blank; Obround from the tab's side at both corners;
   Rectangular on a straight edge point; a Square larger than the edge is refused with
   its words and nothing changes.
7. Finish → three outlines ready to cut. Cut the first from 1.2 mm SPCC; add the four
   bends through the corners (the way `verify-corner-gaps-cg2.mjs` or the sm scripts add
   bends) → the part folds, no `.cad-error`.
8. Edit outline of that part → the row reads "1.2 mm SPCC (this part)" → Finish
   unchanged → the part still folds.
9. No page error.

Still passing: `verify-sketch-dimensions-sd1`, `verify-outline-edit-oe1`,
`verify-start-sketch`, `verify-sketch-on-face`, `verify-sketch-cad`,
`verify-corner-gaps-cg1` … `cg4`, the whole unit suite (7078 before this), lint with 0
errors, `npm run build`.

## 6. Strings and names tests pin

New: the toolbar button **Relief**; `aria-label`s "Relief options", "Relief shape",
"Relief size (mm)", "Relief diameter (mm)", "Relief width (mm)", "Relief depth (mm)",
"Relief sheet thickness (mm)", "Relief readout"; the option labels Square, Round,
Obround, Rectangular; the readout texts of §3.1.

Unchanged: every existing sketch toolbar label, HUD field label, hint, status text and
`onFinish(entities, dimensions)`.

## 7. Design calls that are the spec's own (the user has not ruled)

- The relief is anchored on the outline's inside corner, not on bend lines (none exist
  while drawing).
- Square is the first shape (it is what the user draws; it leaves no note on the bends).
- Automatic reach = half the 90° bend zone + 0.5 mm, not t + r + 0.5 (3.0 mm at 1.2):
  the user closes corners to 0.2 mm, so the smallest relief the fold takes, plus a
  clearance.
- No tear relief.
- Reliefs are baked into the outline; removing one later is Undo last in the same
  session, or redrawing the corner.

## 8. BR-1 as built (2026-11-19)

Built as §3 says, with the differences below. No model key, no `CAD_VERSION`
change, nothing persisted; `sheetMetal.js` and the fold / brake / corner-gaps
code untouched.

**Files.** New: `sketchRelief.js` (`RELIEF_SHAPES`, `RELIEF_FIELDS`,
`reliefSizes`, `chosenSizes`, `describeRelief`, `reliefCorners`, `reliefPick`,
`cutRelief`). Changed: `sketchTools.js` (the Relief tool, `mergeRelief`,
`reliefNow`, `reliefReadout`, the `relief` action, Undo last's relief record),
`CadSketcher.jsx` (options row, readout, hint, R, `relief` / `onReliefChange`
props), `cad.css` (`.cad-sketch-options`), `CadWorkspace.jsx` (`sketchRelief`
state, the session's `sheet` in `beginSketch`, the help paragraph),
`sketchProfile.js` (`profileLoops` exported; nothing else). Tests:
`sketchRelief.test.js`, `sketchReliefTool.test.js`,
`CadWorkspace.relief.dom.test.jsx`, three cases added to
`CadSketcher.dom.test.jsx`. Script: `scripts/verify-bend-relief-br1.mjs`.
Docs: the guide's "Bend reliefs", the state-machines sketcher row and the
workspace session row.

SK-1 moved the key from R to B (`docs/sketch-studio-sketch-shortcuts.md`).

**Deviations and choices.**

1. `pointed` is the index (0 | 1) into `corner.edges`, not an id: a
   rectangle's two sides share one id. A rectangle's sides carry `side` (0–3,
   from its lowest corner round) in corners and edge picks; the cut turns the
   rectangle into four lines first, as §3.1 says.
2. A slot on a corner that is not square: the bottom sits `d` past the corner
   along the pointed edge, so the far side is `d + w·cot θ` long (`d` only on
   a square corner). Where that is negative (a very open corner) the cut is
   refused: "This corner is too open for a slot this shallow: make the relief
   deeper." (a refusal §3.1 does not list).
3. An obround's automatic depth is `reach + width / 2` with the width it is
   cut with (typed or automatic), so a typed wider slot still reaches; §3.1's
   `obroundDepth` is that value for the automatic width.
4. Words. Picks: "No inside corner here: move to the corner that needs the
   relief." (Round / Square), "No inside corner or straight edge here: move
   to one." (Obround / Rectangular), "An outside corner needs no relief: move
   to an inside corner.", "Round and Square go on an inside corner: move to
   one, or use Obround or Rectangular on an edge.", "Square needs a square
   corner: use Round here.", "Close the outline first: a relief is cut into a
   closed outline.", and one more: "Three or more lines meet at one point: fix
   the outline first." A corner beside an arc is no corner: the cursor there
   falls through to the edge rule. Cuts: "The relief size / diameter / width /
   depth must be a positive number.", "The edge beside this corner is 1 mm
   long: the relief needs 2 mm of it." (refused while less than the trim +
   0.01 mm would stay; an edge exactly the trim long reads "needs more than 2
   mm"), "An obround relief is at least half its width deep: 0.6 mm here.",
   "The slot needs 0.6 mm of the edge each side of its centre: move it away
   from the corner.", "This relief would cut through another edge: make it
   smaller." (also for a cut that changes the loop count). A sheet with no
   thickness: "Type the sheet thickness: the automatic sizes come from it."
5. Which edge a piece "follows": the corner's edges come in the loop's walking
   order (the chain walk of `profileLoops`), and the new pieces go right after
   the edge walked in on, oriented along the walk. An edge slot's pieces keep
   the split edge's own a → b direction: the kept piece is the one from its
   `a`, then the three joining pieces, then the far piece (a new id).
   `cutRelief` also returns `pieces` (the relief's own outline, the run a
   corner slot adds to its pointed edge included) for the preview.
6. The readout right after a cut reads "Square 4 × 4 cut" / "Undo last takes
   it back · Esc ends the tool" until the cursor moves or the drawing changes:
   without it the box at once said "No inside corner here" (or "outside
   corner", the relief's own corners being under the cursor).
7. Empty = automatic: the size boxes are `NumericInput` with `allowEmpty`
   (emptying a stored value and pressing Enter or leaving commits null). The
   sheet thickness box ignores a value ≤ 0.
8. Esc in a Relief box drops its draft (the box's own rule) and then gives up
   the focus (on the next tick: blurring at once would commit the draft), so
   the next Esc reaches the sketcher. §3.3 says "as the Snap box does today":
   the Snap box does not do this (it keeps the focus); the Relief row does.
9. The workspace remembers `{ shape, sizes, sheet }`; `onReliefChange`
   reports all three, the sheet only when it is not a cut part's own. The
   sheet handed over by Cut from sheet is `returnTo.outline.{ thickness, stock }`.
   A cut part's thickness is resolved with the model's parameters; one that
   does not resolve falls back to the remembered sheet.
10. Undo last on a relief also drops the dimensions that hung on the removed
    pieces, as Delete and Undo of an entity do. A restored entity goes back in
    place when its id is still there, else where the relief's first piece was.
11. The hover's pick and cut are worked out once per state for the preview and
    the readout (a one-slot cache in `sketchTools.js`), the outline's corners
    once per entities array (a `WeakMap` in `sketchRelief.js`: entity lists are
    never mutated in place). A cut on a 60-entity sketch measured 3.3 ms
    median in node (12 ms worst), on every pointer move over a corner.
12. One existing assertion changed: `sketchDimensionTool.test.js` "is the last
    sketch tool" now reads "is the sketch tool after 3-point arc" (Relief
    follows Dimension, §3.2).

**Wrong in §5.2.** Step 2: the automatic Square at 1.5 mm is 4.6 (reach 1.763 +
0.5 → 2.3), not 4; it is 4 at 1.2. The script checks 4.6, then 4. Step 6: the
Square refusal comes first (typed 50 on a tab corner whose side is 20: "The
edge beside this corner is 20 mm long: the relief needs 25 mm of it."): after
the obrounds the tab has no inside corner with a long edge left (the slots'
own inside corners have 1.2 and 2 mm edges).

**Measured (script).** The options row is 359 px wide (Square) and 384 px
(Round), 36 px tall, one row under the two-row sketch bar (70 px) at both
1600 × 1000 and 1366 × 768, inside the view and clear of the status line.

**Warts.**

- At a whole-sketch fit (about 1.3 px per mm for three outlines) a 4 mm relief
  is about 5 px: zoom in to see what was cut.
- A relief's own inside corners are corners like any other: a second click on
  them relieves the relief (§4.4).
- The pick radius is the snap radius (8 px); at a low zoom a small relief's
  corners lie within it of each other, and the nearest wins.
- The cut-through refusal does not say which edge it would cut.

## 9. Audit (2026-11-19)

Reran: the relief and sketcher test files, the whole suite alone (584 files, 7115
passed, 1 skipped), lint on the changed files (clean), `verify-bend-relief-br1` (10
checks, no page error). Own probes on `sketchRelief.js`: the sizes table, Square 2 on the
§2.3 corner (the user's five points), the cross with each shape folded, every refusal,
a `rect` side, a cut-out's corner, a 135° corner, Undo back to the first drawing.

Found and changed in the audit:

- **A relief that ran into a cut-out was accepted** (Round Ø12 on a corner with a Ø4 hole
  4 mm away): the hole was left outside the outline as a second outline, a blank of its
  own on Finish. `cutRelief` now also refuses when the count of outer outlines changes
  ("This relief would cut through another edge: make it smaller."); a case in
  `sketchRelief.test.js`.
- **A slot does not relieve a corner where two bends meet.** Automatic Obround or
  Rectangular on the cross's four corners: "Bend 3 crosses bend 1" as with no relief (a
  slot 1.2 wide clears one bend's zone, not the 2.82 square the two zones share). That is
  what a slot is (a tab's relief); the guide now says to use Square or Round there.
- The builder's dev server on port 5180 was still running; stopped.

Status line above stands: awaiting the user's verdict and the §4 questions.
