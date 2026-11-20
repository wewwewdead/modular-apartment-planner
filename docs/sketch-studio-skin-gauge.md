# Sketch Studio — gauging off a flange (SG)

Status

- SG-1 (L is what the backgauge reads; a made flange is a stop): SPEC 2026-11-18, BUILT + audited 2026-11-18, uncommitted (as built: §8; audit: §8.7).

All lengths in mm. "Flat distance" is a distance on the flat blank. "Skin" is
the user's word for the outside face of a flange that is already bent.

## 1 · The request

2026-11-18, the user: "When i want to bend 20mm back gauge then bend again on
that side with for example 30mm then it should start from the skin of the
sheet 30mm from there instead of typing 50mm because 20mm plus 30mm is 50. In
that case we are really simulating the real job on that part."

On a real brake the second hit is made with the first flange standing against
the backgauge fingers: the operator sets 30 and the bend lands 30 from the
flange's outside face. The simulator asks for the flat distance from the cut
edge instead, and shows no reading at all for that hit.

## 2 · What happens today (read in the code, 2026-11-18)

- `session.distance` is the flat distance from the picked gauge edge to the
  punch line: `brakeStation.js` `sessionLine` → `pressBrake.js`
  `gaugeBendLine(outer, edge, distance)`. Nothing knows about made bends.
- `pressBrake.js` `gaugeReading(fold, bendId, edge)` gives the flat distance
  only when the edge's own face lies beside the bend. With a made bend between
  the edge and the line it returns `{ distance: null, reason: 'The gauge edge
is on a face another bend separates from this one.' }`. So for the user's
  second hit the panel's "Backgauge L" readout says "no straight gauge", the
  3D fingers are hidden (`shopLayer.js`: `station.gauge.visible =
gaugeDistance != null`), `fingerOffer` offers no handle, and the backgauge's
  reach is not checked (`brakeStation.js` ~2395: `gauge.distance != null ?
assessBend(…gauge…) : folded`).
- After a committed hit the session keeps `distance` and drops `edge`
  (`CadWorkspace.jsx` `brakeStrokeEnd`). Clicking the same edge again puts the
  line on the made bend (bend on, tight bends §4.4, `arrived`).
- A line within half the die's V of a made bend seats on it (`seatOf`, tight
  bends §7). The V8 die the brake picks for t 1.2 gives a reach of 4.
- The fingers' stop face is `shopLayer.js` `FINGER`: 8 below the die top to 12
  above it.
- Writers of `distance`: the panel field (`PressBrakePanel.jsx` ~814), the
  finger drag and typed L (`CadViewport.jsx` ~2108 → `CadWorkspace.jsx`
  `brakeFingers`), Esc on a drag (`brakeHands.js` `fingerRestore`),
  `lineOnBends` (bend on, the seat), `turnAround` / `oppositeEdge`, the
  "move the line" remedy (`brakeStation.js` ~1284), the offset's own
  `turnAround` (~2490). An edge pick keeps the last `distance`.
- Every pick goes through `brakeStation.js` `brakePatch` (the one session
  patch rule; `docs/state-machines.md` has its entries: read them first).

## 3 · Probe (plain node on `sheetMetal.js` + `pressBrake.js`, not kept)

Blank 300 × 100, t 1.2 SPCC, straight 88° punch, automatic die (V8 88°), the
gauge edge at x = 0, bends parallel to it. Every 90° bend: r 1.28, BA 2.8212,
r + t = 2.48. "Reads" is the largest machine Y (toward the backgauge) of any
material behind the punch line whose Z is within the finger's stop face
(−8 … +12 from the die top), the pending bend flat, the made bends as they
stand, the part posed by `brakeFrame`.

| Made already (flat distance from the edge) | Pending line, flat | Reads       | Take-up (flat − reads) |
| ------------------------------------------ | ------------------ | ----------- | ---------------------- |
| nothing                                    | 50                 | 50          | 0                      |
| 20, 90° up                                 | 50                 | **31.0694** | 18.9306                |
| 20, 90° up                                 | **48.9306**        | **30**      | 18.9306                |
| 20, 90° down                               | 50                 | 31.0694     | 18.9306                |
| 20, 135° up                                | 50                 | 30.3641     | 19.6359                |
| 20, 45° up (leaning back)                  | 50                 | 42.3220     | 7.6780                 |
| 10 and 40, both 90° up (a lipped wall)     | 100                | 61.0694     | 38.9306                |
| 150, 90° up; pending bend down (a tight Z) | 165                | 16.0694     | 148.9306               |

- For a 90° flange the take-up is d + BA/2 − (r + t): 20 + 1.4106 − 2.48.
  So the user's "50" lands 1.07 off the part they would make at the machine.
- The 45° row is where the finger's height matters: the flange leans back
  over the finger, whose top corner (12 above the die) meets it at 42.3220 (corrected at the audit: the probe sampled the edge in 0.5 steps and read 42.3042, §8.6);
  the flange's tip is at 44.6918, 14.37 above the die, over the finger.
- The take-up does not depend on where in the face the line is: within one
  face, a millimetre of L is a millimetre of flat distance.

## 4 · SG-1 · L is what the backgauge reads

### 4.1 The rule in one sentence

**"Backgauge L" is always the number the real backgauge would be set to: the
distance from the punch line to whatever of the part the fingers stop.** With
nothing bent between the gauge edge and the line that is the edge (today's
number, unchanged). With made bends between them it is the skin of the formed
part, and the flat position of the line follows from it.

Stored bends do not change: a bend record keeps its flat `a`, `b`. No schema
change, no file migration. Only the session, the reading and what is shown.

### 4.2 The reading

`gaugeReading` (or a function beside it; the builder's call) answers where it
answers today, with the same number and the same code path. Where today it
answers "another bend separates", it now answers:

- the part posed as it stands when the hit is made (`angles`: the other bends
  at their angle then, an armed try's `others` included), **the stroke's own
  bends flat** (also for a bend-on hit: the reading is nominal there, as
  today's flat reading for a bend-on is), in `brakeFrame`'s machine frame
  (the side holding `gaugePoint` to the back, `turned` respected);
- `distance` = the largest Y of the part's material with Y > 0 and Z within
  the finger's stop face. Material: every piece's outline at both skins
  (edges clipped to the band, not only their corners: the 45° row) and every
  made bend's zone at both skins (`bendArcPoint`; a 135° flange is stopped on
  its arc). Across the whole bed: the operator slides the fingers along the
  beam to where the part stops them;
- `stop`: `{ bendId, number }`, the made bend nearest the punch line on the
  gauge side (the bend whose flange is the stop; `number` is `bendNumber`).

The stop face's two heights move from `shopLayer.js` `FINGER` to
`shopCatalog.js` (beside `BACKGAUGE`), one source for the rule, the 3D
fingers and the side view.

`TURNED_GAUGE`, a two-point line and a non-parallel edge keep their "no
gauge" answers.

### 4.3 The session

- `distance`: the reading L, in gauge mode (was: the flat distance; the same
  number wherever `stop` is null).
- `stop`: null (L is from the gauge edge) or the id of a made bend (L is from
  the skin of that bend's flange). An id the fold no longer has reads as null.
- `stopHold`: null (automatic) | `'edge'` | a made bend's id: the operator's
  own choice of stop (§4.6). A new edge, the mode or points clear it.

`sessionLine` puts the line at flat distance `distance + takeUp(stop)` from
the edge, `takeUp` being flat − reads for a line in the face just beyond
`stop`, **the part as made (every step done)**, 0 for null. It depends on the
fold, the edge and the stop only (cache it by the fold's identity: the finger
drag budget of hands-on §6.2 stands). An armed try ("this hit before bend
k") therefore keeps the line where it is; its reading, worked out for the
order it is armed in, may differ from the field and the readout says so
(§4.5).

Invariant I-1 (tests pin it): for an ordinary pending hit (no offset, no
armed try, not turned) with a reading, `station.gauge.distance ===
session.distance` to 1e-6. The field never shows a number the fingers do not
read.

### 4.4 Which stop a typed L means (automatic)

Going in from the picked edge, the made bends parallel to it stand at flat
distances d1 < d2 < … < dK (those on the way from the edge's face inward).
Stop 0 is the edge (take-up 0), stop k the flange of bend k.

For k = 0 … K, in that order: x = L + takeUp(k). Stop k is taken when
x ≥ dk + BAk/2 (beyond its own bend zone; 0 for the edge) and
x ≤ d(k+1) + reach, where reach is `seatReach` (half the V; the next bend's
BA/2 when that is 0) and the last stop has no upper limit. None fits: the
edge, as today.

**The nearest stop that can make the line wins.** What that means for the
user's part (bend 1 made at 20, V8):

| Typed L | Means                                                              |
| ------- | ------------------------------------------------------------------ |
| 12      | flat 12 from the edge: a line inside the 20 flange (as today)      |
| 20      | bend 1's line: bend it on (as today, tight bends §4.4)             |
| 22      | within 4 of bend 1: seats on it (as today, tight bends §7)         |
| **30**  | **30 from bend 1's skin: flat 48.9306 (was: flat 30, no reading)** |
| 48.9306 | 48.9306 from bend 1's skin: flat 67.8612                           |

Then with bend 2 made at L 30 (flat 48.9306): L 30 is bend 2's line (bend it
on: "the same gauge edge and L do it" still holds), L 20 bend 1's, and L 60
is 60 from the skin of bend 2's flange.

Every behaviour that has a reading today keeps it. Only lines that today read
"no straight gauge" change meaning. What automatic cannot say, a reading
short enough to also be a flat distance inside the first flange (a 15 web
behind a 150 flange, a 20 web behind a 20 flange), is §4.6.

### 4.5 `brakePatch`

One place, as ever. For a new line in gauge mode:

1. A patch naming `stop` is taken as given. Writers that compute flat
   distances name `stop: null`: `lineOnBends` (bend on, the seat),
   `turnAround` / the offset's, any other the builder finds. The finger drag
   names the stop it started on (a millimetre of drag stays a millimetre of
   L on one stop; it does not change stop mid-drag) and `fingerRestore` puts
   `stop` back with the line. The "move the line" remedy keeps the session's.
2. A patch naming `distance` and / or `edge` without `stop`: `stopHold` when
   set, else §4.4 on the L and the edge the session then has.
3. The seat and the arrival rule run as today, on the line that results.
4. Last, the line is written in its canonical form: `stop` = the made bend
   nearest the line on the gauge side among those strictly between the edge
   and the line (null when there is none, so a line on bend 1 or inside the
   first face is as today), `distance` = flat − takeUp(stop). So Bend on from
   a row button, the seat and Turn sheet around all leave the field showing
   what the fingers read. Not under a `stopHold` whose stop the line has left
   (builder's call how that is refused or said; I-1 must hold or the hit must
   be refused in words).
5. `seated.from` stays the L that was asked for.

A patch that is not a new line leaves `stop` alone. `brakeSessionDefaults`
gains `stop: null`, `stopHold: null`; `brakeCarry` carries neither.

### 4.6 Choosing the stop

Shown in the panel under the Gauge edge readout only while the picked edge
has made bends in front of it: **Gauge off** — `Automatic` · `The edge` ·
`Bend n's flange` (one per stop, nearest the edge first). It sets
`stopHold` and re-reads the current L against that stop (the L stays, the
line moves). `Automatic` is the default and comes back with a new edge.

When automatic took the edge and the same L would also make a line off a
flange (§4.4's test passes for a later k), one line under the field says so
with the one click that does it, in the house pattern of "Bend 1 on
instead": "L 15 is from the edge, inside bend 1's flange." + button
`Gauge off bend 1's flange`.

### 4.7 What is shown

- Field "Backgauge L (mm)": `session.distance`, as now.
- Readout "Backgauge L": `30 mm · off bend 1's flange` (title: the fingers
  stop on the outside face of bend 1's flange, not on the blank's edge). With
  an armed try whose reading differs: the armed order's reading and why
  ("made before bend 1: the sheet is still flat there").
- New readout "Line on the flat blank": the flat distance from the gauge
  edge (`48.93 mm from edge 4`), only when `stop` is set.
- 3D and side view: the fingers at the reading (`view.gaugeDistance` already
  carries it), so the standing flange touches them. `fingerOffer` offers the
  handle; the drag chip adds the stop: `L 30 mm · off bend 1 · flange …`.
- Flat blank card: the punch line at its flat place, as now.
- The backgauge's reach (5 – 600) is checked against the reading for these
  hits too (it follows from `gauge.distance` being a number).

### 4.8 Tests, scripts, docs

- Unit: every row of §3 and §4.4 to 1e-3 (new file or `pressBrake.test.js` /
  the station's); I-1 over a sweep of L on one stop; an unknown `stop` id;
  `turnAround` and Bend on keep the same flat line and come out canonical;
  Esc on a finger drag restores `distance` and `stop`; an armed "before"
  try keeps the line.
- DOM: at the panel, bend at L 20, pick the edge again, type 30 → the
  readout, and the committed bend's `a` / `b` at flat 48.9306; Gauge off →
  Bend 1's flange with L 15 → flat 33.9306; the hint and its button.
- `scripts/verify-skin-gauge.mjs` in the pattern of
  `scripts/verify-tight-bends-tb3.mjs`: the user's two hits in the browser,
  the fingers on the flange's skin in the 3D view (shots under
  `artifacts/sketch-cad/skin-gauge/`), the finger drag on a stop.
- Existing tests and verify scripts that type an L past a made bend from the
  same edge pin the old meaning: change them to the new one and list each in
  §8 (old value → new value, why). Nothing else pinned may move.
- `docs/sheet-metal-shop-guide.md`: a short "Gauging off a flange" part in
  the brake chapter (the user's 20 then 30, Gauge off, why 50 was 1.07 out);
  `docs/state-machines.md`: `brakePatch`'s entries.
- Run and report: `npm test` (baseline 7055), `npm run lint`, `npm run
build`, the new script and `verify-tight-bends-tb1` / `-tb2` / `-tb3`,
  `verify-brake-hands-on` (on `vite preview`, its drag budget),
  `verify-brake-flip-bt2`, `verify-brake-tool-length`,
  `verify-shop-floor-sf3`.

### 4.9 Out

Fingers placed along the beam by the operator; a stop picked by clicking the
flange in 3D; gauging off anything but the part's rearmost material in the
stop face (finger steps, a second finger level); the springback of the made
flange (it stands at its made angle); round bends as stops beyond what §4.2
gives for free.

## 5 · Judgment calls in this spec (the user has not ruled)

1. Automatic prefers the nearest stop (§4.4), so everything that reads today
   keeps its meaning and short readings off a flange need Gauge off.
2. The finger's stop face is 8 below to 12 above the die top (the drawn
   finger); it decides what a leaning flange reads.
3. A bend-on hit's reading off a flange is nominal (its own bends flat).
4. The field keeps the name "Backgauge L (mm)".

## 6 · Questions for the user

- Your backgauge fingers: how tall is the stop face, and do they have a
  second step you gauge short flanges on?
- Do you ever gauge the second bend off the cut edge with the flange lying
  on the die (the flange under the punch side), or always off the skin?

## 7 · Rules for the builder

- The working tree holds many uncommitted phases: commit nothing, revert
  nothing, touch only what this spec needs.
- Read `docs/state-machines.md` (the brake's entries) and tight bends §4.4,
  §5.2, §7 before changing `brakePatch`.
- Code reads like its neighbours (comment density, names, the spec's §
  numbers in comments as the other brake specs do).
- Fill §8: what was built where, every pinned expectation changed, measured
  costs, every judgment call of your own, anything in this spec that proved
  wrong.

## 8 · As built

SG-1 built 2026-11-18 (uncommitted, as the phases before it).

### 8.1 Where

- `shopCatalog.js`: `FINGER_FACE` `{ below: 8, above: 12 }` beside
  `BACKGAUGE`; `shopLayer.js` `FINGER` reads its heights from it (the side
  view draws the finger from the shop layer's section, so all three agree).
- `pressBrake.js` (beside `gaugeReading`, which is unchanged):
  `flatLineFrame(matrix, point, back, up, t)` (the flat line's machine frame,
  equal to `brakeFrame`'s for a flat bend: a test pins it), `skinReach(posed,
toMachine, { face })` (§4.2's scan: every piece outline at both skins and
  its edge faces clipped to the band, every bend zone at both skins sampled
  24 ways with its band crossings bisected and its own extreme refined by a
  ternary search, 40 steps each), `gaugeStops(fold, edge, { exclude })` (the
  parallel made bends in front of the edge whose material runs across its
  span, nearest first), `brakeReading(fold, bendId, edge, { angles })`
  (gaugeReading's answer wherever it has one, the same code path; for "another
  bend separates" the skin: `{ distance, stop: { bendId }, flat }`, the stop
  being the nearest bend standing, posed angle > 0, between edge and line),
  `stopTakeUp(fold, edge, bendId, { up })` (flat − reads for a line just past
  the bend's zone, the part as made).
- `brakeStation.js`: `brakeSessionDefaults` `stop: null`, `stopHold: null`;
  `sessionLine(station, session)` (now reads `station.fold`) puts the line at
  `flatDistance(station, session, edge)`; `edgeStops(fold, edge)` (with bend
  numbers), `sessionStop`, `automaticStop(station, session, edge, L, first)`
  (§4.4), `lineStop(fold, edge, x)` (§4.5 step 4); take-ups and stops cached in
  a `WeakMap` per fold object. `brakePatch`: `stopOfPatch` before the seat,
  `canonicalStop` last (for a new line, or a patch naming `stop`, which Bend on
  is: it names its `skip`). `lineOnBends` and `turnAround` name `stop: null`;
  the "move the line" remedy names the session's stop and judges its sign on
  the flat blank; `offsetPair`'s `gaugeFor` reads the skin last (after the own
  and the opposite edge's flat readings), `offsetPending`'s line-A reading is
  `brakeReading`. The station returns `flat`, `stop`, `stops`, `gaugeHint`,
  and `gauge.stop` gains `number`; a held stop the line has left adds the
  refusal `gauge-stop`.
- `brakeHands.js`: `fingerRestore` names `stop`; `fingerOffer` gains `off`
  (the stop's number, absent otherwise); `fingerReadout(L, flange, on, off)`.
  `CadViewport.jsx`: the chip passes `off`. `CadWorkspace.jsx`: the finger
  drag's patches name `dragStop` (the stop it started on), `brakeDistance`
  takes extra keys (the flat-blank card's `stop: null`).
- `FlatPatternMap.jsx`: the punch-line drag sends the flat distance with
  `stop: null`, compares against `station.flat`; the L label sits half way to
  the line where it lies on the blank.
- `PressBrakePanel.jsx`: **Gauge off** select (Automatic · The edge · Bend n's
  flange) under the Gauge edge readout while the edge has stops; the hint
  (`role="note"`, `aria-label="Gauge off a flange"`) with its button under the
  L field; Backgauge L readout `30 mm · off bend 1's flange` (title the
  fingers stop on the outside face …), an armed try's own reading and why;
  **Line on the flat blank** while the session's stop is a bend.
- Tests: `skinGauge.test.js` (17), `skinGauge.dom.test.jsx` (4). Script:
  `scripts/verify-skin-gauge.mjs` (shots `artifacts/sketch-cad/skin-gauge/`).
- Docs: `docs/sheet-metal-shop-guide.md` "Gauging off a flange";
  `docs/state-machines.md` the SG-1 paragraph of `cad-brake`.

### 8.2 Measured (unit tests, to 1e-3)

§3: nothing / 50 → 50 (0); 20 up / 50 → 31.0694 (18.9306); 20 up / 48.9306
→ 30.0000; 20 down / 50 → 31.0694; 20 at 135° / 50 → 30.3641 (19.6359);
**20 at 45° / 50 → 42.3220 (7.6780), not §3's 42.3042 (7.6958)**; 10 and 40
up / 100 → 61.0694 (38.9306); 150 up, pending down / 165 → 16.0694
(148.9306). `stopTakeUp` gives the same take-up on every row.

§4.4 (bend 1 at 20): L 12 → flat 12, the edge; L 20 → bend 1 on; L 22 →
seated on bend 1 (`seated.from` 22); L 30 → off bend 1, flat 48.9306, the
reading 30 (to 1e-6), clear; L 48.9306 → flat 67.8612. With bend 2 at flat
48.9306: L 30 → bend 2 on (stop bend 1, reading 30); L 20 → bend 1 on; L 60 →
off bend 2, flat 107.8612, reading 60. Gauge off bend 1 with L 15 → flat
33.9306.

I-1: over L 25 … 200 (step 7.3) for 90° up, 135°, 45°, 90° down and the
lipped wall, either way up (Flip sheet), every hit with a reading: |reading −
L| < 1e-6 (over 200 hits checked).

Cost (node, 2026-11-18, with Playwright scripts running beside it): the skin
reading 0.27 ms, a take-up 0.15 ms uncached (cached per fold), a finger drag
position off bend 2's flange (brakePatch + brakeStation) 7.7 ms, of which the
station alone 6.1 ms (its collision checks of the standing flanges); off the
edge 1.9 ms. The finger drag budget of `verify-brake-hands-on` on `vite
preview`: see 8.4.

### 8.3 Pinned expectations changed (each is a typed L past a made bend from the same edge, or a flat-distance writer that now names `stop: null`)

- `brakeFlip.test.js` l.339 and l.561: the collision card's turn session
  `{ edge: LEFT, distance: 95, turned: false }` → `+ stop: null`: turned to
  the left edge the line (flat 95) is past the made bend at 45, and Turn sheet
  around names its flat distance (§4.5 step 1).
- `PressBrakePanel.flip.dom.test.jsx` l.211: the same patch through the panel,
  `+ stop: null`.
- `tightBends.test.js` l.452–467 (the arrival test): `{ distance: 29 }` →
  `{ distance: L29 }`, L29 = 19.0694 (asserted): bend 1's line lies behind the
  lip (bend 2, 11 from the right edge), so its L is read off the lip's skin.
- `tightBends.test.js` l.488 and `tightBendsSeat.test.js` l.428:
  `bendOnPatch` gains `stop: null` (a flat distance from an edge with stops).
- `tightBendsSeat.test.js` "L 34 does not seat" (l.107–): typed L 34 was
  `[34, no seat]` with the short-leg refusal → now `[34, stop 'b1']`, flat
  50.678, clear (off the 45° flange, take-up 16.678); the short-leg and "Bend
  1 on instead" assertions now on a session at flat 34 set without brakePatch
  (as the net meets one). L 37 unchanged in its assertions (now off the flange).
- `tightBendsSeat.test.js` V6 seat test (l.175–): typed L 32.1 with the V6 →
  now `stop 'b1'`; the short-leg + seat button on a session at flat 32.1 set
  directly.
- `tightBendsSeat.dom.test.jsx` l.177: `picked(model, { distance: 34 })` →
  `session({ distance: 34 })`; l.319–321: the workspace types L 34 after
  Gauge off → The edge (only so is the line 34 from the edge).
- `scripts/verify-tight-bends-tb1.mjs` step 3: L 29 → **L 19.07** (bend 1's
  line read off the lip's skin), plus the readouts "19.07 mm · off bend 2's
  flange" and "29 mm from edge 2".
- `scripts/verify-tight-bends-tb2.mjs` step 3, lip first: L 30 → Gauge off
  Bend 1's flange, **L 11.0694** (flat 30: a reading Automatic takes as a line
  inside the lip, §4.6).
- `scripts/verify-tight-bends-tb3.mjs` step 3: Gauge off → The edge before L
  34 (the short-leg card and Bend 1 on instead as before, beside the
  `gauge-stop` card); step 5: at L 34 the fingers stand at 34 off bend 1's
  flange, the chip "L 34 mm · off bend 1 · flange …" (was: no reading, the
  fingers nowhere, "L 34 mm").
- `scripts/verify-brake-flip-bt2.mjs` step 5: after Turn the sheet around the
  L field read 95 → now the reading off bend 1's flange (51.34 for that t 1.5
  channel), "Line on the flat blank" 95 mm from edge 4.
- `scripts/verify-brake-hands-on.mjs` (the channel turned by the grip's ring):
  the same as BT-2, L 95 → the reading off bend 1's flange, the line 95 from
  edge 4.

### 8.4 Results

- `npm test`: 581 files, 7078 passed, 1 skipped. (The run before the two new
  files counted 7057 + 1 skipped, so the 7055 baseline was two short; SG-1
  adds 21.)
- `npm run lint`: 0 errors (40 warnings, none in `src/features/sketchstudio/cad/`,
  all there before). `npm run build`: green.
- Verify scripts (headless Chrome): `verify-skin-gauge`, `verify-tight-bends-tb1`,
  `-tb2`, `-tb3`, `verify-brake-flip-bt2`, `verify-brake-tool-length`,
  `verify-shop-floor-sf3` pass on the dev server (sf3 needs
  `CAD_VERIFY_URL`, its default port is 5173); `verify-brake-hands-on` passes
  on `vite preview` of the build: per drag position, the card's punch line
  render mean 2.74 ms (worst 5.3), the fingers 3.93 ms (worst 5.1), within the
  2 ms the script allows; frames 7.06 / 7.07 ms.
- In the browser (`verify-skin-gauge`): the fingers drawn at 30 (the skin read
  again in node on the saved part: 30.0000), bend 2 committed at x 48.9306;
  dragged on bend 2's flange 59 … 62, "L 61 mm · off bend 2 · flange 62.07",
  the fingers at each L; Esc → L 60 off bend 2's flange.

### 8.5 Judgment calls (mine)

1. **The take-up depends on the side up.** §4.3 says the fold, the edge and
   the stop only; a flange off 90° reads differently with the sheet turned
   over (the band is −8 … +12, not symmetric), so I-1 would fail for a 45° or
   135° flange with Flip sheet. The take-up is keyed by the side up too: Flip
   sheet's, or where the line lands on a made bend's line (bent on), that
   bend's own (`flatDistance`, `upAt`). Flip is not a new line: the L stays,
   the line moves (as at the machine). For a 90° flange nothing moves.
2. **A finger drag** names the stop it started on (`dragStop`), tried first,
   and falls back to the automatic rule when that stop cannot make the line
   (§4.4's test). Named "as given" literally, a drag from L 20 off the edge
   past bend 1 would put the line 25 flat from the edge and canonicalise it to
   L 6.07 off the flange: the fingers would run toward the operator while the
   hand drags them back. As built the fingers follow the hand (34 → 34 off
   bend 1's flange), and a drag on bend 1's flange toward the operator stays
   on that flange (L 10 → flat 28.93, where automatic would take the edge).
3. **A held stop the line has left** keeps the held stop and the flat line,
   and the station refuses the hit (`gauge-stop`): "Gauged off the edge, L 30
   mm does not reach this line: here the fingers stop on bend 1's flange, at L
   11.07 mm. Gauge off bend 1's flange, or set L again." with that one click
   (the same line, held off what the fingers do stop on). Not under an armed
   try (its reading is the order's, §4.7).
4. **`stop: null` is named only where it can mean anything else**: always on
   the flat-blank card's drag; on `lineOnBends` (Bend on, the seat) and Turn
   sheet around where the edge has stops in front of it (or, for the turn, the
   session has a stop). Elsewhere automatic is null anyway, so a plain blank's
   patches stay as they were (the BT-2 `toEqual`s on plain blanks hold).
5. **"A new edge"** clearing the hold is an edge patch naming another edge
   than the session's (after a hit the edge is dropped, so picking it again is
   new); "the mode" is a mode patch naming another mode. The panel's own Gauge
   off and the hint send `{ stopHold, distance: L }` (a new line: the L stays,
   the line moves).
6. **Canonical writes only a changed stop.** Where the stop stays, L is left
   as typed (no 1e-6 rounding of a typed number); where it changes, L is the
   reading rounded to 1e-6 (the field may show "51.336781" after Turn sheet
   around).
7. **Stops** are the parallel made bends in front of the edge whose material
   runs across the edge's span (my reading of "on the way from the edge's face
   inward"); the reading's `stop` counts only bends standing in the pose (an
   armed "before" try: the later bend flat, so no stop, the flat distance).
8. **The hint** reads the L asked for (`seated.from` after a seat) and says
   "on bend 1's line" when the line is a bend-on; else "inside bend 1's
   flange".
9. **Offsets**: line A is placed from L and the stop like any line; its hits
   keep their flat readings first (own edge, then the opposite), the skin only
   where neither answers, so every reading an offset row had stays.
10. The reading's frame is built from the line's own face (`flatLineFrame`),
    not by calling `brakeFrame` (which also lays out the tooling runs, and puts
    a round pending bend's first hit at Y 0); a test pins that the two frames
    agree for a flat bend.

### 8.6 Where the spec proved wrong

- **§3's 45° row.** 42.3042 / 7.6958 cannot be right: the spec's own tip
  (44.6918, 14.37 above the die) puts the straight outer skin of the flange on
  Y − Z = 30.3218, so at the finger's top (12) it reads 42.3218. The code reads
  42.3220 (take-up 7.6780), and `brakeFrame`'s own pose gives the same
  (`skinGauge.test.js`). Every other row is reproduced to 1e-4.
- §2 calls the trial at ~2490 "the offset's own `turnAround`": it is the
  collision card's turn trial of any hit (it now passes the fold, so the trial
  is the same flat line).
- §4.5 step 4 ("Bend on from a row button … leave the field showing what the
  fingers read") needed the canonical step to run for Bend on too, which is
  not a "new line" in `brakePatch`'s terms (it names its `skip`): it runs for
  a patch naming `stop` as well.

### 8.7 Audit (2026-11-18)

- §3 and §4.4 re-derived through the station's public API with an independent reading (`brakeFrame`'s pose, 20 000 samples per edge): 20 → 30 → 60, lip 10 / wall 40 / base 100, a 45° first flange, either side up, Gauge off held at L 15. Field, reading and the independent number agree on every hit.
- The 45° row of §3 was the spec's error (coarse sampling); the builder's 42.3220 stands.
- Rerun here: the cad tests (159 files, 1879 pass), eslint on `cad/` clean, `verify-skin-gauge`, `verify-tight-bends-tb1` / `-tb2` / `-tb3`, `verify-brake-flip-bt2`. Not rerun here: the full suite, the build, `verify-brake-hands-on` on preview (the builder's results in §8.4).
- Accepted: all nine judgment calls of §8.5. Known wart: after Turn sheet around the field can show six decimals (51.336781).
