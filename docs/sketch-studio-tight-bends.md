# Sketch Studio press brake: bends close together, and bending a bend on

Status: spec, 2026-11-15. Follows `docs/sketch-studio-fab-shop.md` (§5 the
fold, §9 SM-2 the brake), `docs/sketch-studio-shop-floor.md` (§6.1 strokes),
`docs/sketch-studio-brake-flip-tooling.md`, `…-brake-hands-on.md`,
`…-brake-tool-length.md`, `…-round-bend.md` (all built). Two phases, one
builder run each, audited between:

- **TB-1** — bend on: a bend made to 30° or 45° can be hit again later, to a
  larger angle, with other bends made in between (§4). **BUILT** 2026-11-15,
  uncommitted, awaiting audit (as built: §4.7).
- **TB-2** — the brake finds the way: a hit that collides is tried the other
  way round in the ORDER (this hit first) and with the bend in its way made
  part-way first; what passes is one click (§5). **BUILT** 2026-11-15,
  uncommitted, awaiting audit (as built: §5.4).

`CAD_VERSION` stays 1. One new, optional kind of record in `feature.bends`.

## 1. What the user said

"We have problems on bending: if I want to bend half of 90°, which is 45°,
then go back to bend it again with 45° to make it 90°, it won't allow me. And
in tight space like this image I can't bend it — that's why I need 45° first,
then I add 45° later, after I bend the other one. How can we make this tight
spacing be allowed to be bent? Do you have a robust solution, or is my
solution already robust?"

The screenshot: a 605.4 × 420.4 blank, t 1.2 SPCC, one hit made about 29 mm
from the right edge (90° up); the pending hit about 11 mm from the same edge
(a return lip). Refused: "Bend 2: the part hits the ram as the ram comes
down … Turning the sheet around, the tall straight punch, the gooseneck punch
either way round and the deep gooseneck punch either way round were tried:
none clears."

## 2. What happens today (code read and probed 2026-11-15)

- **One bend record is one line at one angle.** `cutBlank` (sheetMetal.js)
  refuses two bends whose zones overlap ("Bend 2 crosses bend 1"), so a second
  hit on a made bend's line cannot exist. That is the "it won't allow me".
- **The pieces for part-way bends are there.** `bendTransform` / `poseFold`
  pose any bend at any angle (the allowance stays the final angle's);
  `brakeCollisions` takes the other bends' `angles` and a `target`. It always
  starts the stroke from flat (approach at 0°).
- **The order made is `bendStrokes(fold.bends)`** everywhere: `sequenceChecks`
  (later strokes flat, earlier ones at their full angle), the sequence list,
  the job sheet's hits, the replay, the route's "n hits".
- **The advice on the screenshot is about tooling only.** For the ram, the
  punch and its holders the card tries Turn around, taller and gooseneck
  punches and tool lengths; "bend this one earlier" is general words
  (`EARLIER`), never tried, and only a collision with the die or the bed
  names the earlier bend to swap with (`culprit`, brakeCollisions.js).

The probe (the brake's own `brakeCollisions`, 50 t × 2 m press, automatic
die, the screenshot's blank; lines 11 and 29 mm from the edge, both 90° up):

| What is done                                      | Straight 88° punch                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| inner bend first, then the lip (the user's order) | hits the ram as it comes down: the 576 mm body stands upright beside the punch. No punch clears |
| the lip first, then the inner bend                | **both hits clear**                                                                             |
| inner to 30°, the lip to 90°                      | clear                                                                                           |
| inner to 45°, the lip to 90°                      | hits the ram at 79°: the body swings upright as the lip closes                                  |
| inner to 60°, the lip to 90°                      | hits the ram at 50°                                                                             |

Wider and tighter spacings behave alike (lip 11 / web 30, lip 20 / web 40:
lip-first clears with the straight punch). Lip 15 / web 15: lip-first hits
the straight punch at 70° on the inner bend, and no punch in the catalogue
closes it — the lip stands inside the punch's own room at 90°, so neither a
different order nor a part-way bend can help there.

## 3. The reasoning

A bend that will not go in is cured, in a shop, in this order:

1. **The order.** Outer bends first: a lip is bent while the body still lies
   flat. It costs nothing and is what clears the screenshot's part.
2. **A part-way bend** (the user's way): the bend in the way is made to a
   small angle, the tight hit goes in, then the first bend is finished. It
   helps when the thing in the way stands in the punch's or the ram's path at
   the START of the tight hit. It cannot help when the two flanges foul the
   tool in the FINISHED shape: the last hit ends in the same pose whatever
   came before. And the part-way angle matters: 45° is too much for the
   screenshot's part, 30° clears.
3. **The tooling**: a gooseneck or a narrower punch, a taller set-up. Already
   tried by the card.

So the user's way is real and must be allowed (TB-1), but by itself it leaves
the operator guessing the angle and the order. The robust part is the brake
trying remedies 1 and 2 on its own collision check and offering what passes
(TB-2), and saying plainly when nothing in the tool rack does.

## 4. TB-1 — bend on

### 4.1 The record

`feature.bends` stays the sequence, in the order made. A new kind of entry:

`{ id, again: '<bend id>', angle, punch, die, stroke?, punchTrim?, dieTrim? }`

"Hit bend `again` again, on to `angle`" (the bend's angle after this hit, as
a brake's angle setting reads; not the amount added). No line, direction,
radius or steps of its own: they are the bend's.

`resolveBends` refuses, in shop words, naming the step by its place in the
sequence:

- `again` is not an ordinary bend made earlier in the list;
- the bend is round (`steps`, or a radius punch): "A round bend is made in
  its own hits: it cannot be bent on.";
- `angle` is not more than the bend stands at before this hit, or is over
  180°: "Bend {n} is already at {a}°: a hit only bends it further.";
- (an edited first angle that passes a later step is refused by the same rule).

### 4.2 The fold

- `fold.bends` holds the **bends**, one per line, exactly as today: `angle`
  is the FINAL angle (the last hit's), the numbers (radius, allowance,
  setback, legs) are the final angle's with the last hit's punch and die, and
  each gains `hits: [{ id (the record's), angle, punch, die }]` (one entry for
  an ordinary bend). Every reader of the folded part — the kernel, the flat
  pattern, the bend table, drawings, the collision surface — needs no change.
- A feature with no `again` entry folds bit for bit as before (a parity test
  over the examples: pump bracket, control box, kiosk).
- `hitSequence(fold)` (sheetMetal.js; beside `bendStrokes`, which stays the
  definition of a stroke): the steps in the order made — `[{ index, key (its
first record's id), recordIds, bendIds, again (bool), from, to ({ bendId →
angle } before and after), punch, die }]`. Entries sharing a `stroke` and
  standing together are one step, as strokes are; `again` entries of one
  step name different bends.
- `anglesBefore(fold, index)`: every bend's angle as the step `index` starts
  (0: not yet hit).
- With no `again` entry `hitSequence` is `bendStrokes` step for step.

### 4.3 The checks

- `brakeCollisions` gains `start` (degrees, default 0): the approach is
  checked at `start`, the samples run `start → target`, the return at
  `target`. `brakeFrame` already sets a part-bent sheet in the V.
- `sequenceChecks` walks `hitSequence`: each step from its `from` to its
  `to`, the other bends at `anglesBefore`. `assessBend` for a step uses the
  step's target angle (force, ram depth, shortest leg as for a bend to that
  angle).
- Everything else that walks the order made walks `hitSequence`:
  `rerunStroke`, the sequence list and its scrub, `strokeHits` (the route's
  and the job sheet's hits; a bend-on step is one hit, timed as a hit),
  `filmScenes` (one scene per step; a bend-on scene is titled "Bend {n} on to
  {a}°" and the film's angle state follows `to`), `brakeCollisions`' hit
  numbers.

### 4.4 The station

- **Choosing it.** (a) A pending punch line that lies on a made bend's line
  (the same segments within 0.05 mm — the same gauge edge and L do it) IS
  that bend's next hit: the station says so (role note): "This is bend {n}'s
  line: it stands at {a}°. This hit bends it on." (b) Each row of the
  sequence list whose bend is sharp and under 180° has **Bend on**
  (`aria-label="Bend {n} on"`), which sets the line to that bend's. A stroke
  of several tabs is bent on as one hit.
- **The fields.** The angle field reads **Bend on to (°)**: the angle after
  the hit, with a note "now {a}° · this hit adds {d}°". Arriving on a made
  line with an angle not above the bend's, it is set to 90° (to 180° for a
  bend at 90° or more). Up / Down and Sharp / Round / Offset are off (the
  bend's own); the punch, the die and their lengths are chosen as for any hit.
- **The pedal.** The stroke runs from the bend's angle to the target; its end
  commits the `again` entry (one per tab, sharing a fresh `stroke`).
- **The sequence list.** A bend-on step is its own row: "{k} · bend {n} on:
  {from}° → {to}°" with the same Scrub, Run again, Earlier, Later and Remove.
  Remove takes that hit away (the bend is back at the angle before it);
  removing a bend's first step removes its bend-on steps too. A move that
  puts a bend-on step before its bend, or its angles out of order, is refused
  with §4.1's words (`changeBrakeBends` already folds before committing).
- **The part form** (`SheetMetalForm`): a bend-on entry is a row "Bend {n}
  on to" with its angle and Remove; the bend's own row shows its first angle.
- **The finished card / hits made** read steps, not bends.

### 4.5 Not in TB-1

Opening a bend back (a smaller angle); bending a round bend on; a hem
(flattening); any advice — a colliding bend-on hit gets the plain fact and
the existing tooling remedies only.

### 4.6 Acceptance — `scripts/verify-tight-bends-tb1.mjs`

Screenshots into `artifacts/sketch-cad/tight-bends-tb1`, 1600 × 1000 and
1366 × 768. A 605.4 × 420.4 rectangle, 1.2 mm SPCC:

1. Control: right edge, L 29, 90° → hit; right edge, L 11, 90° → refused
   (the ram, as the screenshot). Undo the first hit.
2. Right edge, L 29, **30°** → hit. Right edge, L 11, 90° → clear → hit.
3. Right edge, L 29 again → the note of §4.4, "Bend on to (°)" reads 90,
   "now 30° · this hit adds 60°" → pedal: the stroke starts at 30° (side
   view), ends at 90°. Three rows; the third a bend-on row. Folded bounds
   equal (0.01 mm) those of the same blank with the two bends made at 90° in
   lip-first order; the kernel's solid bounds equal the fold's.
4. Bend on to 20° on a bend at 30° → §4.1's refusal, nothing committed.
5. Remove row 3 → two rows, bend 1 at 30°; Undo → three. Earlier on row 3
   twice → refused with §4.1's words.
6. Scrub row 3 before / after; Run again on row 3.
7. A second part: inner **45°**, then the lip to 90° → refused, the ram at
   about 79° (the fact, TB-1 gives no advice).
8. Job sheet: "3 hits on the press brake"; Replay: three bend scenes, the
   third "Bend 1 on to 90°"; Save, reload: the same three rows.
9. No page error; no `.cad-error` except the refusals asked for.

Unit tests: `resolveBends`' refusals; `hitSequence` / `anglesBefore`
(ordinary, bend-on, a stroke of tabs bent on); parity with `bendStrokes`;
`brakeCollisions` with `start` (the table of §2 as assertions: 30° clears,
45° meets the ram near 79°); `sequenceChecks` on the three-step part; the
job sheet and the film. Every existing brake, round-bend and shop verify
script still passes.

### 4.7 TB-1 as built (2026-11-15)

**The record and the fold (§4.1, §4.2).** `sheetMetal.js`: `isBendOn`,
`madeBends`; `bendOnHits` checks the bend-on entries in the order made;
`resolveBends` resolves only the ordinary records, each at its last hit's
angle, punch, die and lengths, and gives it `hits` (its own record first,
then its bend-on entries, each `{ id, index (place in feature.bends), angle,
punch, die, punchTrim?, dieTrim?, stroke? }`); `finishFold` passes `hits`
through. `hitSequence`, `stepOf`, `anglesBefore`, `bendNumber`, `stepFold`
(the fold at a step's angle and tooling, the zone the final angle's; the very
fold object when no bend has two hits) and `stepPose` (a step's pose as
poseFold takes it: only the angles that differ from that fold's own).
A feature with no bend-on entry resolves through the old path untouched, so
its errors come in the same order; parity is asserted on the pump bracket, the
control box and the kiosk (`tightBends.test.js`: `hitSequence` equals
`bendStrokes` field for field, `stepFold` returns the same object, and the
old `sequenceChecks`, re-run and hit-count code, kept in the test as written
before TB-1, gives the same results as the new).

**The checks (§4.3).** `brakeCollisions` and `ramClearance` take `start`. A
hit with `start > 0` is named "Bend {n} on to {a}°" and gets the fact and the
tooling remedies only (`ONWARD_ADVICE`: no "bend this one earlier", no flip,
no culprit, no back-to-back pair search). `sequenceChecks` walks
`hitSequence` with `stepPose` / `stepFold`; `rerunStroke`, the scrub and the
last-hit view (`stationView`), the job sheet (`strokeHits`, `strokeSeconds`,
the Bend rows), the film (`filmScenes`, `strokeTitles`, `filmState`) and the
flat-blank card's bend numbers walk it too. `strokeAt` takes `from`; the shop
layer starts the stroke (`run.from`) and its approach there.

**Measured (§2 table, `tightBends.test.js`, straight 88° punch, automatic
V8 die, 50 t × 2 m):** inner at 90° then the lip: the ram as it comes down;
lip first: both clear; inner 30° → lip clear; inner 45° → the ram at 78.5°;
inner 60° → the ram at 50.4°; the bend on from 30°, 45° or 60° to 90° with the
lip made clears in every case. In the station (no bend-on entry yet, so the
inner bend's zone is its own 45° allowance) the lip after inner 45° meets the
ram at 78.5° too.

**The station (§4.4).** `brakeStation.js`: `sessionLine` (the line a session
picks, shared with `brakePatch`), `madeLine` (§4.4 (a): every kept segment of
the line equals a made bend's interval end for end within
`MADE_LINE_TOLERANCE` = 0.05 mm, and each bend so found is covered whole;
anything else, crossing, beside, slanted, is an ordinary new line and the fold
says what it says), `againHit`, the bend-on branch of `brakeStation`
(`pending.again` { bendIds, from, to, number, lines }), `startAgain` (the
pedal: `run.from`, the entries with fresh ids, a shared fresh `stroke` when
several tabs), `bendOnPatch` (§4.4 (b)). `brakePatch(session, patch,
station)`: the arrival rule. `PressBrakePanel.jsx`: the note, "Bend on to
(°)", "now {a}° · this hit adds {d}°", Flip sheet and Bend shape off, the
rows from `hitSequence` ("{k} · bend {n} on: {from}° → {to}°"), **Bend on**.
`CadWorkspace.jsx`: `moveBrakeStep` / `removeBrakeStep` by step key,
`bendOnBrakeStep`, `changeBrake` passes the station to `brakePatch`.
`ShopPanels.jsx`: `BendOnRow`; ordinary rows numbered among the bends; the
bend count in the form and the feature list counts bends, not entries.

**Choices where the spec is silent (judgment calls).**

- Numbering. The fold names bends by their place among the bends (the old
  "Bend {index + 1}", bend-on entries are none), so §4.1's angle refusal from
  the fold reads "Bend {that place}"; the brake (rows, "bend {n} on", the
  film, collision messages) numbers a bend by the step that first made it
  ("bend number" = its first row). They agree unless a stroke of several tabs
  comes before; a refusal of the entry itself names the step: "Step {k} …"
  (k = the row number).
- Refusal words beyond §4.1: "Step {k} bends a bend on before it is made: a
  bend is made first, then bent on.", "Step {k} bends on a bend that is not on
  this part.", "Step {k}: a bend goes at most to 180°.", "Step {k}: a round
  bend is made in its own hits: it cannot be bent on.", "Step {k}: a radius
  punch makes a round bend: a bend is bent on with a straight punch.", "Step
  {k} makes new bends and bends made ones on in one hit …", "Step {k} bends
  bend {n} on twice in one hit." At the station: "Bend {n} on: a bend goes at
  most to 180°.", "Bend {n} is already at 180°: it cannot be bent further.",
  and for tabs standing at different angles "These flanges stand at different
  angles: bend them on one at a time …".
- An entry's punch and die are its own (absent: the straight punch and the
  automatic die, as any record), not inherited from the bend.
- Arriving (§4.4): applied in `brakePatch` only when the line changes onto a
  made bend's line and the patch does not set the angle. When the line then
  moves on before the angle is touched, the angle it had is put back
  (`session.arrived` { from, set }): clicking the gauge edge lands at the last
  L, which may be another made bend's line on the way to the one meant (the
  verify run hit exactly that: the lip's line, 90° → 180°, then L 29).
- **Bend on** shows on a bend's LAST row only (one button per bend, so "Bend
  {n} on" is unique), while it is sharp and under 180°. It gauges off the
  nearest straight edge parallel to the line (the smallest L), else two points
  along it, with the line's other segments left out.
- A bend-on hit is timed as one ordinary stroke with the hit's full ram depth
  (the readout's), not the depth from its starting angle.
- `brakeCollisions`' `number` still names an ordinary step; a bend-on step's
  name comes from the fold (`hitSequence`), whatever `number` is passed.
- The side view says "Parked above the sheet" (not "the bend is made") while
  the bend in the die stands short of its target.
- The film's `filmState`: a bend-on scene not yet played leaves its bend as
  the scenes before left it; the scene carries `again`, `stepKey` and `from`.

**Where the spec is wrong about the code (followed the code).**

- §4.6 step 5 "Earlier on row 3 twice → refused with §4.1's words": the first
  Earlier makes [inner 30°, inner on to 90°, lip], which folds; it is refused
  by the sequence check (the lip then meets the ram: "That order is refused:
  step 3 could not be made then. Bend 3: the part hits the ram …"), so nothing
  moves and the second Earlier is the same refusal. The verify script asserts
  that, then shows §4.1's words the one way a button can reach them: Later on
  row 1 (the lip first, a good order), then Earlier on the bend-on row →
  "Step 2 bends a bend on before it is made …"; Undo.
- §4.6 step 4 is run before step 3's pedal (only then does bend 1 stand at
  30°), and step 8 before step 7 (step 7 starts a fresh model).
- A two-point line covering only part of a bend's material still presses the
  whole interval it touches (`lineSegments`, as for any hit), so it IS that
  bend's line.
- The station's own gauge reading off the right edge after the lip is made is
  "The gauge edge is on a face another bend separates from this one" (the
  existing `gaugeReading` rule): the bend-on hit is checked without a
  backgauge reading there (the readout says why), not refused.

**Verified.** `tightBends.test.js` (20 tests), `tightBends.dom.test.jsx` (8),
`scripts/verify-tight-bends-tb1.mjs` (screenshots in
`artifacts/sketch-cad/tight-bends-tb1`, 1600 × 1000 and 1366 × 768): the
stroke starts at 30.00° in the approach and ends at 90°; folded 577.47 ×
420.4 × 20.14 mm = the lip-first part; the kernel's part size 577.469 ×
420.4 × 20.139 mm.

**Files.** `sheetMetal.js`, `brakeCollisions.js`, `pressBrake.js`
(`strokeAt`, `brakeHit`'s count), `brakeStation.js`, `shopLayer.js`,
`BrakeSideView.jsx`, `PressBrakePanel.jsx`, `FlatPatternMap.jsx`,
`ShopPanels.jsx`, `CadWorkspace.jsx`, `jobSheet.js`, `shopFilm.js`, `cad.css`;
tests `tightBends.test.js`, `tightBends.dom.test.jsx`; script
`scripts/verify-tight-bends-tb1.mjs`; docs `state-machines.md` (`cad-brake`),
`sheet-metal-shop-guide.md`.

**For TB-2.** `brakeCollisions`' `breaks()` / `culprit` still reason about
strokes as if each bend had one step (they use the step of the bend's first
hit); "this hit first" (§5.1) must move entries in `feature.bends` and keep
every bend-on entry after its bend — `changeBrakeBends` + `foldProblem` already
refuse the rest. A part-way remedy (§5.2) can be built from `stepPose` and
`brakeCollisions({ start })` directly; the record it commits is an ordinary
bend at the part-way angle plus a bend-on entry, so the allowance of the zone
changes with the final angle (§4.2's simplification) — the remedy's trial fold
must include the bend-on entry, as `tightBends.test.js` does, or the zone's
allowance is the part-way angle's.

## 5. TB-2 — the brake finds the way (refined after TB-1's audit)

### 5.1 What the probe found (2026-11-15, TB-1's `brakeCollisions({ start })`)

A strip a | web | b with two parallel 90° bends, t 1.2 SPCC, 200 mm long,
every punch either way round and the sheet either way round (8 386 checks,
3.4 ms each):

- **Both bends up** (a lip, a channel): wherever a part-way bend passes, an
  order passes too. Remedy 1 covers these — the screenshot's part among them.
- **One up, one down, a narrow web** (a tight Z: web 10 – 20 mm between two
  sides of 150 mm or more): neither order clears, with the straight punch or
  the deep gooseneck. The first bend to 60°, the second to 90°, the first on
  to 90° clears, whichever of the two is first. Remedy 2 is real: the
  reference case is **150 | 15 | 150, up then down**.

### 5.2 The tries

For a pending hit that collides with the ram, the punch, its holders, the
die or the bed (a new bend or a bend-on hit), after the existing remedies
(Turn around, punch, lengths; a hanging side's other order, shorter side and
step), the station tries — on `brakeCollisions` and the machine's refusals,
tried, never assumed:

1. **This hit first.** The latest place in the sequence, before a step
   already made, where (i) this hit passes with that step and the later ones
   not yet made (`anglesBefore` of that place), and (ii) every step after it
   still passes with this bend made (`sequenceChecks` of the trial sequence
   is no worse than today's from that place on). Bend-on entries stay after
   their bends. Offered as a button on the card: **Make this hit before bend
   {k}**. One click arms it (the card then reads "This hit goes in before
   bend {k}: the view shows the sheet as it is then", the 3D and side view
   pose the later steps flat); the pedal makes the hit and commits its record
   at that place. Esc or a new line disarms it.
2. **A part-way bend.** When no place passes: for the step in the way (the
   made steps tried from the latest back), its angle at 60°, 45°, 30° or 15°
   (the largest below its own angle that passes): that step still passes to
   the smaller angle, the steps between pass with it there, this hit passes,
   and a bend-on step taking it back to its angle passes after this hit (the
   trial fold holds the bend-on entry: §4.7's note on the allowance).
   Offered as **Bend {k} to {a}° first, finish it after this hit**: one
   click arms it (the view shows bend {k} at {a}°); the pedal makes this hit
   and, in the same commit, sets step {k}'s angle to {a}° and appends the
   bend-on entry (its punch and die the step's own). The card then says:
   "Bend {k} now stands at {a}° and is finished in step {n}." Round bends and
   steps of several tabs are not opened part-way.
3. **Nothing passes.** The card keeps the fact and what was tried, in the
   existing wording's style, ending: "No order and no part-way bend clears
   it with this punch either: the shape cannot be closed with the tools in
   this rack. Make the web wider or the flange shorter, or use tooling this
   rack does not hold." (Reworded in the audit: the first wording blamed two
   flanges standing in the tool's room, which the station does not test and
   which is wrong for a deep tray stopped by the ram's height.) Since SP-1
   (docs/sketch-studio-shop-punches.md §5.4, §5.8 item 8) `NO_WAY` reads "… with
   this punch either. Make the web wider or the flange shorter, or make the
   earlier bends with another punch.", and the "nothing passes" reference case
   is lip 20 / web 10 (lip 15 / web 15 now passes with the shop's punches).
   Since SP-2 (docs/sketch-studio-shop-punches.md §6.2, §6.4) the earlier bends
   with another punch are a try of their own, `NO_WAY` reads "No order, no
   part-way bend and no other punch for the earlier bends clears it. …", and
   `PART_WAY` is `[45, 60, 30, 15]` (45° first: the tight Z's button is "Bend 1
   to 45° first, finish it after this hit").

The words "bend this one earlier" (`EARLIER`, and `ONWARD_ADVICE`'s fact
for a bend-on hit) are said only when try 1 found the place; otherwise the
card says the order was tried.

The stored sequence (`sequenceChecks`, the row's refusal and the finished
card): a step that collides gets the same two tries as a move of the made
steps — **Move step {n} before step {k}** / **Bend {k} to {a}° first** — as a
button on its row's card, committing through `changeBrakeBends`.

`culprit` / `breaks()` in brakeCollisions.js read a bend's first step
(TB-1's note): with a bend-on entry in the sequence they must read steps.

Cost: the tries run only when the advice is asked for (`needsAdvice`, as the
punch and length tries do), never per frame; report the worst case measured.

### 5.3 Acceptance — `scripts/verify-tight-bends-tb2.mjs`

Screenshots into `artifacts/sketch-cad/tight-bends-tb2`, both sizes:

1. The screenshot's part in the user's order: 605.4 × 420.4, t 1.2; right
   edge L 29, 90° → hit; right edge L 11, 90° → the card offers "Make this
   hit before bend 1" → click: the view shows the sheet flat at the inner
   line → pedal → two rows (the lip first), both ok, folded 577.47 × 420.4 ×
   20.14 mm (TB-1's lip-first size).
2. The tight Z: a 315 × 200 rectangle, t 1.2; a line 150 from the left edge
   up 90° → hit; a line 150 from the right edge DOWN 90° → the card offers
   "Bend 1 to 60° first, finish it after this hit" (no "Make this hit
   before") → click → pedal → three rows: 1 at 60°, 2, "bend 1 on: 60° →
   90°", all ok; Undo takes the three changes back in one step.
3. Lip 15 / web 15 on the first blank (lines 15 and 30 from the edge), inner
   first → try 3's words, no button; lip first, then the inner → the same.
4. A stored sequence that collides (step 1's file made by data: inner then
   lip): the row's card offers "Move step 2 before step 1" → click → ok.
5. Timing: the tries for step 1's and step 2's cards, worst case; no frame
   over 50 ms from them while a line is dragged on the flat blank.
6. No page error; no `.cad-error` but the refusals asked for.

Unit tests: the tries as pure functions on the three reference parts (this
hit first; part-way; nothing), bend-on entries kept after their bends on a
move, `culprit` with a bend-on entry in the sequence. Every brake,
round-bend and shop verify script still passes, TB-1's among them.

### 5.4 TB-2 as built (2026-11-15)

**The tries (§5.2), `brakeStation.js`.** `wayTries` runs inside
`brakeStation` under `advise` only (the settle, or the pedal), for a pending
hit (a new bend or a bend-on hit) whose collision is with the ram, the punch,
its holder, the die or the bed, after the existing remedies, never while a try
is armed, never for an offset pair. Each candidate is tried by running the
station itself with the try armed (`advise: false`): the very check the pedal
makes. Try 1 walks the places from the latest back (a bend-on hit only after
its bend's last step) and stops at the first that passes; try 2, when no place
passes, walks the made steps from the latest back and each step's `PART_WAY`
angles (60°, 45°, 30°, 15°) below its angle, largest first, and stops at the
first that passes. The result rides on `pending.collision.ways` ({ first,
partway }, each `{ label, session: { armed } }`), a button on the collision
card (`PressBrakePanel.jsx`).

**The armed try.** `session.armed` (`brakeSessionDefaults`: null) is `{ kind:
'before', key }` or `{ kind: 'partway', key, angle }`; no model key is new.
`armedOf` resolves it against the part as made (the step still there, a
bend-on hit after its bend, a part-way step a sharp single-tab bend made in
one hit and not this hit's own) or ignores it. `placedBends` is the one rule
for the bends the hit leaves: the records put in before the step `key`; or
the step's angle set to `angle`, the records appended, and a TB-1 bend-on
entry (`finishOf`: the step's own angle, punch, die and lengths) after them.
`armedHit` folds that trial — with the finishing entry, so the zone's
allowance is the final angle's (§4.7's note) — and checks the hit as its step
starts (`stepPose`): the other bends' angles (`others`) go to `assessBend`,
`brakeCollisions`, `ramClearance` and the view (`pending.others`; the 3D and
the side view pose the later lines flat, or the step part-way). (ii) is part
of the armed station's facts (`worseFrom`: the steps from the place on — try
2: from the step opened on, with the finishing entry — walked one by one
against the part as made, stopping at the first step too many), so the pedal
re-checks it; a worse order is the refusal `order`, "That order is refused:
step {n} could not be made then. {fact}". `startStroke` / `startAgain` (via
`armedStroke`) give the stroke `placed` and, for a part-way try, `notice`
("Bend {k} now stands at {a}° and is finished in step {n}."); the workspace's
stroke end commits `stroke.placed` in the one commit (one Undo) and clears
`armed`. The card while armed (role status "Bend order"): "This hit goes in
before bend {k}: the view shows the sheet as it is then." / "Bend {k} goes to
{a}° first and is finished after this hit: the view shows bend {k} at {a}°.",
with **Cancel**.

**The words.** `triedAdvice` and `ramAdvice` take `ways`: `EARLIER`'s "Bend
this one earlier" only where try 1 found the place (then the card's words are
today's, with the button added); otherwise "bending this one earlier" (and,
when nothing passes, "a part-way bend first") joins the list of what was
tried, and a part-way bend found is offered in the list of remedies. Try 3:
nothing passes and nothing else is offered (no turn, punch or length fix) →
the card ends with `NO_WAY`, the spec's words, and the order is not repeated
in the tried list. A die or bed collision (`dieWays`): its culprit advice kept
where try 1 found the place; else "Flip the sheet (bend the other way up).
Bending this one earlier was tried: it does not clear."; a side that hangs
(brake flip tooling §5.4) keeps its message ("Bend the other one first" is
said once: the button only) and gains "Or bend 1 to 60° first, finish it
after this hit." where try 2 found it.

**The stored sequence.** `sequenceTries` (a colliding row: the step moved
before an earlier step, latest first; else an earlier step part-way, its
bend-on entry right after the refused step), each tried on the folded new
order (`foldProblem`, then `sequenceChecks`: this step passes and fewer steps
fail than now). The workspace works them out `LIVE_DEBOUNCE_MS` after the
checks settle (`brakeRowTries`, used only for the checks they were made for),
the panel shows **Move step {n} before step {k}** / **Bend {k} to {a}° first**
under the row's refusal, committing through `changeBrakeBends` ("That
order is" refused as any move).

**`culprit` / `breaks()` read steps (brakeCollisions.js).** `culprit` names
the bend by its first step and labels it at the angle that step made ("before
bend 1 (DOWN 6° R1.6)" for a crease made to 6° and bent on to 12°, as row 1
reads); `breaks()` poses each stroke it jumps over with every bend at its
angle when that stroke starts (a bend made earlier and bent on among them at
its part-way angle, not flat).

**Measured.** The reference parts (§5.3, unit tests and the verify script):
the screenshot's part → "Make this hit before bend 1", armed it passes with
the inner line flat, the pedal commits the lip first, folded 577.47 × 420.4 ×
20.14 mm, both rows ok; the tight Z 150 | 15 | 150 up then down → no place
passes (the order really is refused, armed), "Bend 1 to 60° first, finish it
after this hit", committed as bend 1 at 60°, the down bend, "bend 1 on: 60° →
90°", all ok, the same folded size as the two bends made at 90°; lip 15 / web
15 either order → no button, `NO_WAY`. Cost of the tries alone
(`wayTries`, node, the app's modules, worst of five with the first run's JIT):
step 1's card 37 ms, step 2's 57 ms, step 3's (every try made) 50 ms; the
whole advice (the punch, length, turn and the tries) at most 84 ms, run once
per settle. In the page (dev build) the punch line dragged 48 moves on the
flat blank: frames median 7 ms, worst 21 ms, no long task during the drag or
in the settle after the release, no button on the card mid-drag (the tries
wait for the settle). The cost grows with the steps made: about one station
run per place and up to four per step opened, so the worst case is a part
where nothing passes. On the tray with n more 45° bends before the inner bend
(node, worst of three): 1 step made, nothing passes, 58 ms; 5 made 282 ms; 7
made **420 ms** (the worst measured: one task, once per settle, never during a
drag); where try 1 finds the latest place it stays at 27–58 ms whatever n. The
stored rows' tries (`sequenceTries`, whole sequences re-checked per candidate):
2 steps 9 ms, 6 steps 97 ms, 8 steps 290 ms, once per change of the sequence.

**Choices where the spec is silent (judgment calls).**

- The trial is the whole part with the hit placed and posed as its step
  starts (`stepPose`), as the stored row is checked after the commit, not a
  fold of the bends made by then: the check before the pedal and the row's
  check after it agree. So, as for any stored step, the later lines (still
  flat) cut the pieces: the hit's leg readouts read to the next line, and a
  gauge edge on a face a later flat line separates gets no backgauge reading
  (checked without it, the readout says why).
- What disarms: a new line (edge, L, points, mode), a segment toggled, Flip
  sheet, another bend shape, Cancel, Esc (the first Esc only disarms, the line
  stays; then Esc clears the line as before), a sequence edit and the commit.
  The punch, the die, their lengths and the angle keep it armed, re-checked.
  Turn sheet around with a gauge edge is an edge change and disarms (the spec:
  "a new line"). An armed try whose step is gone (Undo) is ignored.
- Button and card words beyond the spec: "Make this hit before step {k}" when
  that step is a bend-on hit; the armed card and its Cancel; the part-way
  note after the commit is a status line on the panel, gone with the next pick.
- Try 2 opens only a sharp single-tab step that is its bend's only hit (not a
  bend-on step, not a bend hit again later, not this hit's own bend); `{k}` is
  then the step's number and the bend's.
- The pedal animates this hit only; the finishing bend-on step is committed
  in the same commit (as the spec says) and shown by its row's Re-run.
- "No worse" (ii): the failing steps from the place on may not outnumber the
  part as made's from there; the hit itself is checked by the station (its
  gauge, side and punch way round), not either way round as a stored step.
- Try 3's words only for the punch, its holder and the ram, and only when
  nothing else is offered: a die or bed card always offers "Flip the sheet",
  so there the order and the part-way bend are listed as tried instead.
- A hit with nothing made before it has nothing to reorder: no tries, and no
  "Bend this one earlier" either (said only where found).
- A stored row's words are today's (sequenceChecks' general advice, pinned by
  tests); only the buttons are added. The finished card (a painted or printed
  part) gets no tries: it is past bending.
- A self collision (the part into itself) is not tried (the spec's list is
  the ram, punch, holder, die and bed).

**Where the spec is wrong about the code (followed the code).**

- §5.2's try 3 sentence first asserted a cause ("the two flanges stand in
  the tool's room in the finished shape") that the station does not test;
  the audit reworded it (`NO_WAY`, §5.2 item 3) to say only what was tried
  and what would change the result.
- Existing tests pinned the untried "Bend this one earlier" where the order
  now tried fails, and two ram cards' tried lists: updated to the spec's words
  (`brakeFlip.test.js` three assertions, `brakeToolLength.test.js` two), and
  `scripts/verify-brake-tool-length.mjs`'s 200 mm tray ram card (step 6: it
  now ends with try 3's words, and no try button). Every other verify
  script's card regexes match unchanged.

**Files.** `brakeStation.js`, `brakeCollisions.js`, `PressBrakePanel.jsx`,
`CadWorkspace.jsx` (the commit, Esc, `brakeRowTries`, `onReorder`),
`shopLayer.js` (the state's `angles`, for the verify), `cad.css`; tests
`tightBendsWay.test.js`, `tightBendsWay.dom.test.jsx`, `strokes.test.js` (the
culprit with a bend-on entry), `brakeFlip.test.js`, `brakeToolLength.test.js`;
script `scripts/verify-tight-bends-tb2.mjs` (screenshots in
`artifacts/sketch-cad/tight-bends-tb2`), `verify-brake-tool-length.mjs` (one
regex); docs `state-machines.md`
(`cad-brake`), `sheet-metal-shop-guide.md` ("When a bend will not go in").

## 6. Questions for the user (after the build)

1. Your punches: the simulator's rack has a straight, a tall straight, a
   gooseneck and a deep gooseneck (88°). Which narrow or special punches does
   your shop use for tight returns? They decide what "cannot be bent" means.
2. Should a bend be allowed to open back (a smaller angle), or only on?
3. Do you want "Find the bend order for me" for a whole part (the brake
   searching every order), once TB-2 is in?

## 7. TB-3 — the line finds the bend (2026-11-17)

### 7.1 What the user said

After TB-1, TB-2 and the shop punches: "why it still wont allow me to bend
the bended part? it still says: this hit crosses bend 1. I already told you
we bend 45 degrees first then later bend it with more 45 degrees." They
called it bad UX. They are right: the bend-on hit exists, but the station
only recognises it when the punch line is set on the made bend's line to
0.05 mm (§4.4). Anything else near the bend dead-ends.

### 7.2 What happens today (probed 2026-11-17 on the built code)

605.4 × 420.4 blank, t 1.2, bend 1 made at L 29 from the right edge, 45°,
straight punch, automatic die (V8 88°, bend 1's allowance 1.41 mm). The
pending line, same edge unless said:

| The line                           | The station says                                                     |
| ---------------------------------- | -------------------------------------------------------------------- |
| L 29, L 29.04                      | bend 1 on, 45° → 90°, clear                                          |
| L 29.1, 29.4, 30, 31               | "This hit crosses bend 1."                                           |
| L 32, 33, 34                       | "The flange is 2.29 mm from the punch line … cut the blank larger …" |
| L 37                               | a new bend                                                           |
| left edge, L 576.4                 | bend 1 on (gauged 576.4)                                             |
| left edge, L 576                   | "This hit crosses bend 1."                                           |
| two points 0.2–0.3 mm off the line | "This hit crosses bend 1."                                           |
| two points across the bend         | "This hit crosses bend 1."                                           |

The ways an operator lands beside the line without meaning to: the backgauge
fingers are dragged in whole millimetres (`FINGER_STEP`), the flat blank's
punch line in tenths, two points are clicked by hand, and gauging from the
opposite edge of a 605.4 mm blank needs 576.4 typed. The refusal names no
way forward, and for a part with tab strokes it names the wrong bend (the
fold's index, not the step number the panel shows). The sequence row's
**Bend on** button is the only sure path, and nothing points to it.

### 7.3 The rule: a bent line seats itself in the die

A sheet with a bend in it, put back in the V, sits with that bend on the
punch line: the operator cannot hit a second line a millimetre beside it,
and does not try to. So:

- **Seat.** A punch line that lies along a made bend within half the V of
  the hit's die IS that bend's line. The session's line moves onto it, and
  §4.4 takes over unchanged (the note, "Bend on to (°)", the angle on
  arriving, the pedal).
- **No makeable bend is lost.** A new bend needs its leg to reach the die's
  shoulder: `minLeg(die, angle) = V / (2 cos(angle / 2)) + shoulder radius`
  is at least V / 2 at every angle, and the leg is measured to the made
  bend's zone, so every line within V / 2 of a made bend is refused today
  whatever is typed. That holds only for the material the made bend bends:
  a line that also crosses a piece no such bend bends (a tab made, its twin
  on the same line still flat) can make that piece a new bend once the made
  one is left out. So a line seats only when the **whole** line is the made
  bends' line: every kept segment of it overlaps their material (amended
  2026-11-17 on the TB-3 audit; see §7.7).
- **Past the seat, never a dead end.** Where the fold or the die still
  refuses a line because of a made bend it lies along, the refusal says so
  with the step number and carries a one-click "Bend {n} on instead".
- A line that really runs across a made bend stays refused, in words that
  say what is wrong.

### 7.4 The build

**(a) `sheetMetal.js` — the crossing refusal carries data.** `cutBlank`'s
"Bend {j} crosses bend {i}." keeps its text (pinned in `sheetMetal.test.js`
and `kernel.sheetmetal.test.js`) and gains
`error.crossing = { bend: j, other: i, along }` (0-based places in the
resolved bends): `along` is true when every interval end of bend `i` lies
within `(allowance_i + allowance_j) / 2 + 1e-6` of bend `j`'s infinite line
(the lines run together; false: they cross).

**(b) `brakeStation.js` — the seat.**

- `seatReach(fold, session)`: `die.v / 2`, the die being
  `session.die ? DIES[session.die] : suggestedDie(fold.thickness, session.punch).die`;
  0 (no seat) when the session's punch is a radius punch or
  `session.shape === 'round'` (a round bend's die and zone are another
  size; its lines go to (c)).
- `bendAlong(fold, polygon, line, skip, reach)`: the made bends the line
  lies along. A bend counts when every end of every run of it (`runsOf`) is
  within `reach` (a number, or a function of the bend) of the infinite line
  through `line.a`, `line.b`, and one of its runs overlaps a kept segment of
  the line (`lineSegments` less `skip`) along the line by more than 1e-6.
  The nearest wins (largest end distance smallest; ties in fold order); its
  members are the candidates collinear with it (every run end within
  `MADE_LINE_TOLERANCE` of its line). Returns null or
  `{ bendIds, number (bendNumber of the nearest), off (mm, the nearest's
largest end distance) }`.
- `bendOnPatch` is split so the seat shares it: the body that puts a line on
  a list of member bends takes `{ edge, mode }` — in gauge mode the
  session's own edge is kept when it is parallel to the bend (cross product
  under 1e-6) and the distance is positive (the operator chose that edge;
  the nearest edge may be on a face another bend cuts off from the gauge);
  in points mode the two points along the bend; otherwise the search it has
  today. `bendOnPatch(station, key)` behaves exactly as before.
- `seatOf(station, session)`: null when there is no line, when
  `madeLine(...)` already answers (non-null, with or without an error: the
  line is on a made bend, nothing to move), when `seatReach` is 0, when
  `bendAlong` finds nothing, or (amended on the audit, §7.3) when some kept
  segment of the asked line overlaps no run of the member bends along the
  line (`bendAlong`'s `whole` false: the line also crosses material they do
  not bend; it goes to the net with its segment toggles); else `{ number,
off, patch }`, the patch
  `{ mode, edge, distance }` or `{ mode, points }`, plus `skip` — and only
  when `madeLine` on the patched line answers non-null.
- `brakePatch`: on a new line with a station, before the `arrived` block
  (and also when the patch names `angle`, as an etched mark's does), a seat
  is applied: its patch is merged and
  `next.seated = { number, off, from }` (`from`: the L asked for in gauge
  mode, else null). No seat: `if (next.seated) next.seated = null`, as
  `arrived` is cleared (a session that never seated gains no key: the
  `toEqual` parity tests in `brakeHands.test.js` hold). The `arrived` rule
  then runs on the seated line as it does on an exact one.

**(c) `brakeStation()` — the net.** For a session that reaches the station
unseated (the model changed under a pending line, a round shape, a zone
wider than V / 2):

- The `strokeBends` catch reads `error.crossing`. `other` is a made bend
  (`fold.bends[other]`), `n = bendNumber(fold, its id)`, `off` its largest
  run-end distance from the pending line, `can` = it is sharp and under 180°.
  - `along`, `off > MADE_LINE_TOLERANCE`: "This line is {off} mm from bend
    {n}'s line: too close for a new bend." and, when `can`, " To bend bend
    {n} further, bend it on."
  - `along`, `off` within the tolerance (the line is the bend's, but the
    kept pieces are not its pieces): "This line is bend {n}'s line, but the
    pieces in this hit are not the ones bend {n} bends: a made bend is bent
    on whole, and nothing else with it." and, with more than one segment on
    the line (amended on the audit), " Click a piece on the flat blank to
    leave it out of this hit."
  - not `along`: "This line runs across bend {n}, which is already made: the
    brake cannot bend across a formed bend." and, with more than one
    segment on the line, " Click that piece on the flat blank to leave it
    out of this hit."
  - With `along` and `can`: `pending.seat = { key, number, off, label:
'Bend {n} on instead' }`, `key` the key of the bend's last step (the row
    button's rule; export `bendOnKey(fold, bendId)`: that key, or null when
    the bend is round or at 180°).
  - Any other fold error keeps today's "This hit" replacement.
- A pending new bend refused `short-leg` whose line lies along a made bend
  within `minLeg(hit.die, angle) + bend.allowance / 2` (`bendAlong` with
  that reach) and `bendOnKey` answers: the same `pending.seat`. The
  refusal's own message and fix stay.
- `{off}` is `fmt` to two decimals.

**(d) `PressBrakePanel.jsx`.**

- With `again` and `session.seated?.number === again.number`, a second note
  under "This is bend {n}'s line …" (`role="note"`,
  `aria-label="Seated on the bend"`): gauge mode "L {from} is {off} mm from
  bend {n}'s line. A bent line seats itself in the die, so the line is on
  bend {n}."; points mode "The line you set is {off} mm from bend {n}'s
  line. A bent line seats itself in the die, so the line is on bend {n}."
- `pending.seat` renders its button (`className="cad-problem-fix"`, text
  and accessible name `pending.seat.label`, title "Set the punch line on
  bend {n}, to bend it further") in the error card, or in the `short-leg`
  refusal's card beside its own fix; click → `onBendOn(pending.seat.key)`.
  Not rendered without `onBendOn`.

**(e) `FlatPatternMap.jsx` — point at the bend.** In gauge mode, with
`onBendOn` given and the map not disabled, each made bend with a
`bendOnKey`, other than the bends the pending hit is already on
(`pending.again.bendIds`), is a button like an etched line (a band
`bandReach` either side, in `targets`, so the nearest line in reach of the
pointer wins): `aria-label="Bend {n}'s line: bend it on"`, click →
`onBendOn(key)`. Drawn under the gauge edges and the pending line (their
clicks and the line's drag are unchanged). `CadWorkspace.jsx` passes
`onBendOn={bendOnBrakeStep}`.

**(f) Hands on the sheet.** `fingerOffer` gains `on` (the bend number while
the pending hit is a bend-on, else null). While the fingers are dragged and
the session's L is not the dragged L because the line seated, the chip
reads the L the fingers stand at and the bend: `fingerReadout(L, flange,
on)` → "L 29 mm · on bend 1" (two-argument calls read as before).
`fingerRestore` carries `seated`, so Esc puts the note back with the line.
The hit's commit clears `seated` with `arrived` (`CadWorkspace.jsx`).

### 7.5 Not in TB-3

A made bend and unbent tabs of the same line in one hit; clicking a bend on
the 3D sheet; the short-leg refusal's own words when the leg ends at a bend
("cut the blank larger" stays); anything about which hits collide.

### 7.6 Acceptance — `scripts/verify-tight-bends-tb3.mjs`

Screenshots into `artifacts/sketch-cad/tight-bends-tb3`, 1600 × 1000 and
1366 × 768. The 605.4 × 420.4 rectangle, 1.2 mm SPCC, straight punch:

1. Right edge, L 29, 45° → hit.
2. Right edge, type L 30 → no problem card; the note "This is bend 1's
   line: it stands at 45°. This hit bends it on."; the seated note "L 30 is
   1 mm from bend 1's line. …"; "Bend on to (°)" reads 90; after blur the L
   field reads 29.
3. Type L 34 → the short-leg card with "Bend 1 on instead"; click → L 29,
   the note of §4.4.
4. Left edge, L 576 → the L field reads 576.4, the backgauge readout 576.4,
   the bend-on note; pedal → two rows, "2 · bend 1 on: 45° → 90°". Undo.
5. The fingers dragged from L 20 past the bend (the hands-on script's drag):
   between 26 and 33 the chip reads "L 29 mm · on bend 1" and the fingers
   stand at 29; let go at 31 → the bend-on note. (If the headless drag
   cannot hold a position, cover the chip in `CadViewport`'s DOM test and
   say so.)
6. Two points typed A (576.7, 5), B (576.6, 415) → the bend-on note and the
   seated note's points wording.
7. Line cleared; click bend 1's line on the flat blank → L 29, the note.
8. Two points (0, 200) → (605.4, 200) → "This line runs across bend 1, which
   is already made: the brake cannot bend across a formed bend."; no button.
9. The technique, a second part: L 29 at 30° → hit; L 11 at 90° → hit; right
   edge is now on the lip's face, so left edge, L 576 → seated on bend 1,
   "Bend on to (°)" 90 → pedal: three rows; folded bounds equal (0.01 mm)
   the lip-first part's.
10. No page error; no `.cad-error` except step 8's.

Unit tests (`tightBendsSeat.test.js`): §7.2's table as assertions through
`brakePatch` with the station (L 29.1 … 32.9 and the left edge's 576 seat;
L 34 does not; a V6 die seats to 3 mm only; a radius punch and Round do not
seat); the session's edge kept; `seated` set, cleared by the next line, and
absent from a session that never seated; the `arrived` angle on a seated
line and put back when the line moves on; `error.crossing` (`along` for a
parallel line, not for a line across); the station's four messages and
`pending.seat` on a session set without `brakePatch`; the step number, not
the fold index, on a part whose first stroke bends two tabs; `bendOnKey`;
`bendOnPatch` unchanged (its pinned test). DOM tests: the seated note, the
card's button calling `onBendOn`, the flat blank's bend button (gauge mode
only, not for the bend being bent on, nearest-line pick against a gauge
edge 11 mm away). Every existing brake, round-bend and shop verify script
still passes; if an existing test pins a refusal for a line set through
`brakePatch` with a station within V / 2 of a made bend, report it rather
than change either side quietly.

### 7.7 TB-3 as built (2026-11-17)

**(a) `sheetMetal.js`.** `cutBlank`'s crossing check throws through
`crossingError(bends, j, i)`: the text "Bend {j + 1} crosses bend {i + 1}." as
before, plus `error.crossing = { bend: j, other: i, along }`, `along` true when
every interval end of bend `i` lies within `(allowance_i + allowance_j) / 2 +
1e-6` of bend `j`'s infinite line (measured on `j`'s normal `n`).

**(b) `brakeStation.js`, the seat.** `seatReach(fold, session)`,
`bendAlong(fold, polygon, line, skip, reach)`, `seatOf(station, session)`,
`bendOnKey(fold, bendId)`; `bendOnPatch`'s body is `lineOnBends(station,
members, { edge, mode, start })` (not exported), `bendOnPatch(station, key)`
returning what it did (its pinned test and a copy in `tightBendsSeat.test.js`
pass). `brakePatch`: on a new line, unless the patch names `seated`, `seatOf`
on the patched session; a seat merges its patch and sets `seated { number,
off, from }`; no seat clears a `seated` that is there. The arrival rule runs
after it, on the seated line. A patch that names `angle` (an etched mark's)
seats too.

**(c) The net.** `crossingRefusal(error, { fold, line, segments })` in the
`strokeBends` catch (only for a crossing whose `bend` is the probe, the last
resolved bend): the three messages and `seat`, carried on to
`pending.seat`; any other fold error keeps "This hit". The short-leg seat
after `pending` is built: a new bend (not a bend-on hit) with a `short-leg`
refusal, `bendAlong` with reach `minLeg(hit.die, session angle) +
allowance / 2`, `bendOnKey` of its nearest bend.

**(d) `PressBrakePanel.jsx`.** The seated note under the bend-on note (gauge
wording when `seated.from` is a number, else the two-point wording);
`seatButton` (`cad-problem-fix`, title "Set the punch line on bend {n}, to
bend it further", disabled while a stroke runs) as the error card's child,
and on the first `short-leg` card before its own fix.

**(e) `FlatPatternMap.jsx`.** `onBendOn` prop; in gauge mode, given
`onBendOn` and not disabled, every made bend with a `bendOnKey`, but those in
`pending.again.bendIds`, is a `<g role="button" class="cad-map-bend-on">`
with a `bandReach` band per run, one target per run (`bend-{id}-{k}`) in
`targets`; drawn after the bend numbers (a click on the number is a click on
the bend) and before the gauge edges and the pending line. `cad.css`: the
hover line. `CadWorkspace.jsx` passes `onBendOn={bendOnBrakeStep}`.

**(f) Hands.** `brakeHands.js`: `fingerOffer` adds `on` (and `from`, the L
asked for, when the session seated on that bend); `fingerReadout(L, flange,
on)`; `fingerRestore` names `seated`. `CadViewport.jsx`'s chip reads `L
{offer.L} mm · on bend {on}` while the dragged L is the offer's L or its
`from`, else as before. `CadWorkspace.jsx`'s commit clears `seated` with
`arrived`.

**Judgment calls.**

- `bendAlong` also returns `bendId` (the nearest bend's id): the short-leg
  seat needs it for `bendOnKey`.
- `fingerOffer`'s `on` and `from` are absent, not null, when there is no
  bend-on hit (or no seat): `brakeHands.test.js`'s `toEqual` on the offer
  holds, the same reason `seated` is absent. `from` is not in §7.4 (f): the
  chip needs it to tell "seated from the L the fingers are at" from an offer
  not yet caught up with the drag (one render behind). At the bend's own L the
  chip says "L 29 mm · on bend 1" too (§7.6 step 5 reads it from 26 to 33,
  29 included).
- `fingerRestore` returns `seated: session.seated` (undefined for a session
  that never seated, which `toEqual` treats as absent); `brakePatch` leaves
  `seated` alone when the patch names it.
- Gauge mode seats only off the session's own edge. Where that edge cannot
  carry the line onto the bend (not parallel, or behind it) there is no seat
  and the net speaks, rather than a search moving the line to another edge.
- Two points seat with point A at the end of the bend nearer the A typed (the
  bend's own direction can run the other way).
- `bendOnKey` is the row button's whole rule: the bend's last step, every bend
  of that step sharp and under 180°, none of them hit in a later step. `can`
  in (c) is `bendOnKey` answering.
- The seat's reach is inclusive (`≤ V / 2 + 1e-6`): L 25 and L 33 seat on a
  bend at L 29 with the V8. `minLeg > V / 2` at every angle, so no makeable
  bend is lost at the boundary.
- The seated note shows only while `seated.number` is the pending bend-on's
  number. The seat button is drawn on the first short-leg card only (a stroke
  of tabs can have two), and not at all without `onBendOn`.

**Where the spec meets the code differently.**

- §7.6 step 5: the drag from L 20 seats from **L 25** (4 mm short of the
  bend, exactly V / 2) to L 33, both measured. Past the seat, at L 34, the
  right edge is on the flange bend 1 separates from the line, so the station
  has no backgauge reading (`gaugeReading`'s rule, §4.7): the fingers stand
  nowhere and the chip reads "L 34 mm". Not a TB-3 change.
- §7.6 step 6: the four point fields commit one at a time, and the line
  seats as soon as it comes near the bend. Typed A X, A Y, B X, B Y it seats at
  B X; B Y then edits the seated point B, the line is exactly on the bend and
  there is no seat to tell (the bend-on note, no seated note). The verify
  types A X, A Y, B Y, B X.
- **Found on the build, decided on the audit: a made tab and an unbent one
  on the same line** (`CadWorkspace.strokes.dom.test.jsx` l.176–195, "A new
  line puts every segment back"). The plate has two tabs on x = 30; tab 1 is
  made alone (tab 2 left out); clicking the etched line again is a line along
  tab 1 (0 mm) that also crosses unbent tab 2. As first built (the rule as
  §7.4 (b) first read) it seated on tab 1 (two points along tab 1 only, one
  segment, the mark's 90° → "Bend 1 is already at 90°: a hit only bends it
  further."), so tab 2 could no longer be reached from the etched line and
  the test failed. The spec author's decision: the spec was wrong there, not
  the test. Built: `bendAlong` reports `whole` (every kept segment of the
  line overlaps, along it, a run of the member bends) and `seatOf` seats only
  when it holds (§7.3, §7.4 (b) amended); the short-leg net's use of
  `bendAlong` is unchanged. Such a line goes to the net with its segment
  toggles: "This line is bend 1's line, but the pieces in this hit are not
  the ones bend 1 bends: a made bend is bent on whole, and nothing else with
  it. Click a piece on the flat blank to leave it out of this hit." (the tail
  only with more than one segment; §7.4 (c) amended), with **Bend 1 on
  instead**. The strokes test passes again, untouched.

**Measured (§7.2's table, `brakePatch` with the station, then the station;
`tightBendsSeat.test.js` and the probe).** Right edge, session angle 90°:
L 29, 29.04 → bend 1 on 45° → 90°, clear, nothing seated; L 29.1, 29.4, 30,
31, 32, 32.9, 33 → L 29, seated (off 0.1 … 4), bend 1 on, clear; L 25 → L 29
seated; L 24.9 → a new bend, short-leg ("The other leg is 3.39 mm …") with
Bend 1 on instead; L 33.1 → short-leg (flange 3.39 mm) with the button; L 34
→ short-leg ("The flange is 4.29 mm from the punch line in the flat; the V8
88° die needs 6.66 mm …") with the button; L 37 → a new bend, clear. Left
edge: L 576.4 → bend 1 on; L 576 → L 576.4 seated (off 0.4); L 573 → seated
(off 3.4). Two points (576.7, 5) → (576.6, 415) → (576.4, 0) → (576.4,
420.4), seated (off 0.3), bend 1 on. Two points across → "This line runs
across bend 1, which is already made: the brake cannot bend across a formed
bend." Unseated sessions straight into the station: L 29.1 / 30 / 31 → "This
line is 0.1 / 1 / 2 mm from bend 1's line: too close for a new bend. To bend
bend 1 further, bend it on." with Bend 1 on instead. The technique part
(verify step 9): folded 577.47 × 420.4 × 20.14 mm, the lip-first part's.
The two-tab plate (`tightBendsSeat.test.js`, t 1.5, points mode): tab 1 made
alone, the full line on it or 0.4 mm off it → no seat, both segments kept,
the 0-off message with the new tail / "This line is 0.4 mm from bend 1's
line: too close for a new bend. To bend bend 1 further, bend it on.", each
with Bend 1 on instead; tab 1's segment then left out → tab 2 a new bend, no
refusal; both tabs made in one stroke, the line 0.4 mm off → seated on both
(bend 1 on, `bendIds` t1, t2).

**Files.** `sheetMetal.js`, `brakeStation.js`, `brakeHands.js`,
`PressBrakePanel.jsx`, `FlatPatternMap.jsx`, `CadViewport.jsx`,
`CadWorkspace.jsx`, `cad.css`; tests `tightBendsSeat.test.js` (20),
`tightBendsSeat.dom.test.jsx` (5), `CadViewport.reach.dom.test.jsx` (+1, the
chip); script `scripts/verify-tight-bends-tb3.mjs` (screenshots in
`artifacts/sketch-cad/tight-bends-tb3`); docs `sheet-metal-shop-guide.md`
("Bending a bend on"), `state-machines.md` (`cad-brake`).

**Audit (2026-11-17).** One builder run and one follow-up (the whole-line
rule above). Read against the source: `crossingError`, `seatReach`,
`bendAlong`, `seatOf`, `lineOnBends`, `bendOnKey`, `crossingRefusal`,
`brakePatch`'s seat. My own probe through `brakePatch` with the station
reproduced the table: L 29.1 … 33 and L 25 seat on L 29 (angle to 90°), L
33.5 and L 24.5 are short-leg with the button, L 37 a new bend; the left
edge's 576 → 576.4; the clicked points; the line across; a V6 die seats
2.5 mm off and not 3.5; Round does not seat and gets the net's message;
moving on to L 60 puts the angle back and clears `seated`; the technique
part folds to 577.47 × 420.4 × 20.14 either way. Rerun by me: the cad tests
(146 files, 1701 passed), lint on the nine files touched (clean),
`verify-tight-bends-tb3`, `-tb1`, `verify-shop-floor-sf3` (pass), and the
L 30 and L 34 screenshots read by eye. The builder's: the full suite (6900
passed, 1 skipped), the build, `-tb2`, `-sp1`, `-sp2`, hands-on, `-bt2`,
tool length, `-bq1`.
