# Sketch Studio round bends (large-radius bends: bump hits or a radius punch)

Status: spec, 2026-11-14. Follows `docs/sketch-studio-fab-shop.md` (SM-1 … SM-4)
and `docs/sketch-studio-shop-floor.md` (SF-1 … SF-5), all built. Three phases
(§9): **RB-1** bump hits (built, §11), **RB-2** the radius punch (§12, built,
§12.8) and **RB-3** the kiosk example's rounded corners (§13, built, §13.6).

## 1. What the user asked for

"In our kiosk model sample there's a round bending in the corner, we need to
allow it to do round bending." A corner of their kiosk is not a sharp 90° bend
but a large-radius one (a rounded corner). The simulator must be able to make
it: draw → cut → **round bend** → weld → paint → print → assemble.

## 2. Feasibility (measured 2026-11-14, probe on today's code)

SPCC t 1.5, blank 600 × 400, one 90° bend across the middle.

- **The geometry already works.** A bend with `radius: 40` folds in 5 ms; the
  outside legs come out 309.495 mm, the hand value (300 − BA/2 + R + t, BA =
  π/2 · (40 + 0.5 · 1.5) = 64.01). The kernel revolves the zone about the
  bend's own centre, so the solid is a true arc of any radius. Only "Add bend
  by numbers" can set it (the brake always stores `radius: null`).
- **The machine does not know how it was made.** The brake accepts that R40
  bend as ONE hit of the R0.8 punch in the V10 die and reads "ram depth
  −13.45 mm". One hit in a V10 die forms about R1.6. No shop can do that.
- **Bump bending as N separate small bends half works.** Nine 10° bends
  7.1 mm apart fold and pass `sequenceChecks`; eighteen 5° bends 3.6 mm apart
  are refused 18 of 18 ("short-leg": the leg is measured to the next bump
  line, which is not how a bumped sheet sits on the die), and each corner
  would be 18 bend records, 19 pieces and 18 kernel revolves.

So the goal is feasible, and the cheap, truthful way is: **one bend record =
one round bend; the press brake makes it in N small hits** (bump bending, also
called step bending — how a brake with ordinary tooling makes a large radius).
The folded solid stays the true arc: with the default hit count the flats stand
0.08 mm off it at R40, the same order as the solver's 0.05 mm chord tolerance.

## 3. What was read (contracts this must match)

All under `src/features/sketchstudio/cad/`, line numbers of 2026-11-14.

- `sheetMetal.js`: `bendNumbers` (309) already takes a `radius` override;
  K comes from `kFactorFor` (0.5 above r/t = 3). `resolveBends` (405) reads
  the stored bend. **Every fold goes through two functions**: `bendTransform`
  (570; a part angle keeps the zone BA wide and bends it uniformly at
  r′ = BA/θ′ − k·t) and `bendArcPoint` (591). `poseFold(fold, angles)` (610)
  is the only pose entry. `finishFold` warnings (757–800) use `bend.angle`
  and `minLeg(die, angle)`; `hole-near-bend` measures from the bend line.
  `bendStrokes` (943) is THE definition of a stroke; `strokeBends` (984).
- `kernel.js` 291–414: replays `fold.bends[].transform` (`translate`,
  `origin`, `axis`, `angle`) on exact solids; one revolve per zone interval.
  It only ever sees the fold at its full angles.
- `pressBrake.js`: `assessBend` (258: tonnage, `ramDepth`, `springback`,
  `minLeg`, backgauge reach, per stroke), `brakeFrame` (425: both wings
  symmetric about the punch line, `back` side from `gaugePoint` / shorter
  leg / `turned`), `restHeight` (402), `strokeTimeline` / `strokeAt` (541,
  556), `sheetSection` (631: the side view draws two straight wings).
- `brakeCollisions.js`: `posedTriangles` (306: `ARC_STRIPS` = 8 quads per
  zone, the whole zone of the bend in the die is side `'zone'` and skipped),
  `brakeCollisions` (451: samples angle 0 → target, both ways round).
- `brakeStation.js`: session defaults (26), `brakeStation` (140: `base` hit
  data with `radius: null`), `stationView` (248), `startStroke` (304),
  `rerunStroke` (343), `sequenceChecks` (378).
- `shopLayer.js` 476–608: `poseStation(angle, tip)`, `strokeTick`,
  `startStroke(run)`; the gauge fingers stand at `view.gaugeDistance`.
- `sheetMetalPreview.js`: `ARC_STEPS` = 16 samples per zone, via `bendArcPoint`.
- `CadWorkspace.jsx` 1819–1872: `pressPedal` → `startStroke` → viewport runs
  the stroke → `brakeStrokeEnd` commits the bends. The `BRAKE` table
  (`toolSession.js`) goes setup → STROKE → DONE.
- Readers of a bend's numbers: `PressBrakePanel.jsx` (results 423–461,
  sequence 470–538), `ShopPanels.jsx` bend editor (250–290: "Automatic
  radius" checkbox + "Inside radius (mm)"), `FlatPatternMap.jsx` (107–213),
  `bendTable.js`, `drawings.js:184`, `exports.js` (flat DXF), `jobSheet.js`
  (`strokeSeconds` 115, bend rows 176), `shopFilm.js` (bend scenes 249–275),
  `printStation.js` and `blankHoles` (bend zones by `allowance`).
- `shopCatalog.js`: dies V6 … V25 at 88°; `defaultDie(t)` (V ≥ 6 t);
  `airBendRadius`; `minLeg`; `tonnage`; `springback`; `ramDepth`.

## 4. The model

A bend may carry **`steps`** (integer ≥ 2): it is then a **round bend**, made
in `steps` hits, and its `radius` (the finished inside radius, mm) is
required. Absent `steps` = an ordinary bend, exactly as today. `CAD_VERSION`
stays 1; `normalizeModel` keeps the key; old files load and fold unchanged.

Everything else about the record is unchanged: `a`–`b` is the **centre line of
the bend zone** on the flat, `angle` the finished angle, `direction`, `punch`,
`die`, `stroke`. The zone is `allowance` = θ · (R + k·t) wide, centred on the
line, as for every bend. A round bend may be a member of a gang stroke (§6.1 of
the shop-floor spec): the members share `radius` and `steps`.

## 5. The numbers

### 5.1 The hits (`sheetMetal.js`, pure)

For a round bend of angle A, inside radius R, allowance BA and N = `steps`:

- step angle a = A / N; **pitch** p = BA / N (flat distance between hits);
- hit lines: parallel to the bend line at v_j = −BA/2 + (j − ½) · p,
  j = 1 … N (the zone is tiled by N sub-zones p wide, a hit in the middle of
  each);
- **flat height** (how far a flat between two hits stands off the true curve,
  on the outside face) = (R + t) · (1 − cos(a / 2)).
- Automatic hit count: **pitch = half the die opening**, the die the sheet
  uses anyway: N = max(2, ⌈BA / (V / 2)⌉) with V of the bend's die
  (`defaultDie(t)` when none is chosen). This is the shop rule "die opening =
  2 × pitch" read backwards (sources, §10).

Export one function that returns these for a resolved bend (`steps`,
`stepAngle`, `pitch`, `flat`, the v_j list) and one for the automatic N; the
fold's bends carry `steps`, `stepAngle`, `pitch` and `flat` (absent on an
ordinary bend). `bendLabel`: an ordinary bend reads as today ("UP 90° R1.6");
a round one "UP 90° R40 · 13 hits".

`resolveBends` refuses, by name ("Bend 3: …"):

- `steps` not an integer from 2 to 200;
- no `radius`, or a radius not above what one hit of its tooling forms
  (`airBendRadius`): "…R1.2 is what one hit in the V10 die makes: make it an
  ordinary bend.";
- pitch below 1 mm: "…13 hits would stand 0.4 mm apart: use fewer hits."

### 5.2 The pose (the one real change to the solver)

A round bend bent part-way is **not** a uniform arc of a larger radius. After
k hits, k sub-zones are curved at R and the rest of the zone is still flat.

Rule: geometrically a round bend is **N ordinary mini-bends in a row**, each
with allowance p and angle a, whose zones tile the zone. At its own angle a
mini-bend has radius p / a − k·t = R, and the N arcs share one centre, so the
full bend is the single arc of today.

- `bendTransform(bend, thickness, angle, from = 'fixed')` for a round bend at
  a posed angle θ′ (0 … A): the mini-bends are filled in order starting at the
  `from` side (`'fixed'`: from the fixed foot; `'moving'`: from the moving
  side); mini-bend j (counted from that side) is posed at
  clamp(θ′ − (j − 1)·a, 0, a), each by today's uniform rule. The moving
  side's matrix is the product of the mini-bend matrices from the fixed side
  outward.
- `bendArcPoint` evaluates the same piecewise shape (the mini-bend holding
  `fraction`, carried through the mini-bends before it).
- `poseFold(fold, angles = null, from = null)`: `from` maps a bend id to
  `'fixed' | 'moving'` (default `'fixed'`); ordinary bends ignore it.
- **At the full angle the result is field for field today's**: `matrix`,
  `translate`, `origin`, `axis`, `angle`, `radius` equal to 1e-9. The kernel,
  the unposed fold and every file that has no round bend see no change.

Invariants to test (measured on sampled points, not on the implementation's
own formulas): the neutral fibre across the zone keeps length BA at every
pose; position and tangent are continuous across the zone; after k whole hits
the first k sub-zones lie on a circle of radius R and the rest are straight;
`from: 'moving'` is the mirror image; `posedAngle` is θ′.

Preview and collision sampling must put a sample on every sub-zone boundary
(`ARC_STEPS` and `ARC_STRIPS` become multiples of N for a round bend).

### 5.3 The hit in the machine (`pressBrake.js`)

- One helper says which side goes to the backgauge (the rule `brakeFrame` has
  today: the gauge point's side, else the shorter flat leg, swapped by
  `turned`). **The hits run from the front toward the backgauge**: the first
  hit is the one farthest from the gauge edge, so the part still to be bumped
  lies flat against the gauge and the formed curve comes out toward the
  operator. So `from` = the side that is NOT at the back, everywhere a round
  bend is posed in the machine (collisions, the 3D scene, the side view, the
  film).
- `brakeFrame(posed, bendId, { …, hit })`: for a round bend the frame is the
  frame of **mini-bend `hit` in the die** — its hit line over the V, its two
  wings symmetric, the outer surface on both shoulders (`restHeight`), the
  punch tip on the inside of the mini-arc. `hit` is 1-based in bump order;
  absent, it is the hit the posed angle is in (⌈θ′ / a⌉, at least 1). The
  hit must be passed explicitly while a hit is still flat (its approach).
- Backgauge reading: the station's L stays "punch line to gauge edge" for the
  record's centre line. Hit j gauges at L_j = L + BA/2 − (j − ½) · p (first
  hit farthest, each next one p nearer).

### 5.4 The checks (`assessBend`, per round bend)

A round bend is still one entry of `bendStrokes` (one row of the sequence),
with a hit count. `bendStrokes` entries gain `hits` (the bend's `steps`, else
1). Per-hit rules:

- **Angle**: the die's limit applies to the step angle a, not to A (a 180°
  round bend is allowed; collisions decide).
- **Legs**: the sheet is carried by everything beside the hit, bumped or
  not: each side's flat leg + p/2 must reach `minLeg(die, a)`. The
  `short-leg` fold warning uses the same rule.
- **Force**: `tonnage` per hit, unchanged (it does not depend on the angle).
- **Backgauge reach**: L_1 and L_N both inside the reach; the message names
  the one that is out.
- **Die and pitch** (warning `bump-die`, with a fix button where a die
  exists): when V > 2.5 · p, "The V16 die is 16 mm wide and the hits are
  4.1 mm apart: the part already bumped sinks into the die. Use the V8 die
  or fewer hits." Fix = the widest catalogue die of that angle with V ≤ 2 p.
- `hole-near-bend` for a round bend measures from the zone: a cut-out nearer
  the bend line than BA/2 + 2.5 t.
- An ordinary bend whose radius override is three times what its tooling
  forms gets the warning `radius-needs-hits`: "One hit in the V10 die forms
  about R1.6, not R40: make it a round bend (several hits)."
- Readouts add `hits`, `stepAngle`, `pitch`, `flat`, `gaugeFirst`,
  `gaugeLast`; `ramDepth` is one hit's (`ramDepth` with angle a, radius R and
  the springback shared equally); `springback` is the whole bend's and
  `bendTo` the per-hit angle. Both stay display-only rules of thumb.

### 5.5 Collisions (`brakeCollisions.js`, `sequenceChecks`)

For a round bend the check walks the hits in order: hit j from angle
(j − 1)·a to j·a in hit j's frame, the punch coming down and going up for
each. Only the sub-zone of the hit in the die is the working zone; the
curve already formed and the flat still to come are ordinary sheet and are
tested against the punch, holders, ram, die and bed. Both ways round, as
today. The message names the hit: "Bend 2, hit 9 of 13: the part hits the
ram at 62.3°. …". Keep the sample count reasonable: at least 2 poses per hit
and no more than about twice today's total per bend; report the measured
time for a 13-hit and a 26-hit bend.

## 6. The press brake station

- Session gains `shape: 'sharp' | 'round'` (default `'sharp'`), `radius`
  (default 20) and `steps` (null = automatic). `changeBrake` treats them like
  the angle.
- Panel, under "Bend angle": a Segmented **Bend shape** — Sharp · Round.
  Round shows **Inside radius (mm)** and **Hits** (empty = automatic, the
  automatic count shown as the placeholder). Nothing else moves; Sharp is
  today's panel, pixel for pixel.
- Hit results for a round bend add: **Hits** "13 hits · 6.92° each · every
  4.92 mm" and **Flats** "0.08 mm high" (title: "How far each flat between
  two hits stands off the true curve. More hits make it smoother."). Flange
  and Other leg are the outside sizes, as today. Machine numbers add the
  backgauge "329.54 → 270.46 mm" and name ram depth and bend-to as per hit.
- **One press of Bend makes the whole round bend**: the ram cycles N times,
  the backgauge fingers step p nearer between hits, the curve grows hit by
  hit in the 3D scene and in the side view, then ONE bend record is committed
  (the `BRAKE` table is unchanged: STROKE → DONE once). Between hits the ram
  lifts only 10 mm (`BUMP_GAP`), so a 13-hit bend takes about 8 – 10 s.
- The side view draws the true posed cross-section for a round bend: the
  formed curve, the hit in the die, the flat still to come.
- Sequence row: "3 · UP 90° R40 · 13 hits". Before / After, Re-run (all N
  hits), Earlier, Later, Remove work on the round bend as one step.
- `FlatPatternMap`: a round bend shows its zone (the two tangent lines and a
  light band) and its N hit lines, faint; the numbered dot stays on the
  centre line.
- "Add bend by numbers" (`ShopPanels.jsx`): the same Sharp · Round choice,
  radius and hits; the `radius-needs-hits` warning shows there too.

## 7. Everything downstream

- Job sheet: a round bend's time = N strokes (short lift) + the 20 s
  handling once + 3 s per further hit (`BUMP_HANDLING_S`, an estimate, said
  so like the others). The detail line reads "… R40 · 13 hits …". "Hits
  made" counts hits.
- Replay (`shopFilm.js`): one scene per round bend, its hits played inside
  it; the scene may run up to twice the bend scene's maximum length.
- Drawing sheets (`flat` view) and the flat DXF: a round bend adds its two
  tangent lines; the bend table's INSIDE R cell reads "R40 · 13 HITS".
- Print (no artwork over a bend zone) and `blankHoles` already use
  `allowance`; add one test each proving a round bend's wide zone is honoured.
- `docs/sheet-metal-shop-guide.md`: a "Round bends" section (what it is, how
  the hit count is chosen, limits). `docs/sketch-studio-fab-shop.md` §12:
  the sources of §10 below. `docs/state-machines.md`: one line that a round
  bend's stroke is N hits inside one STROKE.

## 8. Acceptance (unit tests; the verify script drives the same case)

SPCC t 1.5, blank 600 × 400, round bend up 90°, R40, centre line x = 300,
gauge edge the right side, 50 t × 2 m press, straight 88° punch, automatic
die. All values from `bendNumbers` / `shopCatalog.js` as they stand:

|                                    |                                                    |
| ---------------------------------- | -------------------------------------------------- |
| K, allowance, deduction            | 0.5 · 64.00995 mm · 18.99005 mm                    |
| Outside legs, folded size          | 309.49502 each · 309.495 × 400 × 309.495           |
| Die, automatic hits                | V10 · 13 (⌈64.00995 / 5⌉)                          |
| Step angle, pitch, flat height     | 6.92308° · 4.92384 mm · 0.07571 mm                 |
| Backgauge, first → last hit        | 329.54305 → 270.45695 mm                           |
| Force per hit, min leg per hit     | 42.174 kN · 6.20914 mm                             |
| Ram depth per hit, bend-to per hit | 0.26072 mm · 7.14065°                              |
| Folded solid volume (kernel)       | = blank volume, 600 · 400 · 1.5 (K = 0.5) to 0.1 % |

Also: R15 → 5 hits of 18°, pitch 4.94801, flat 0.20314; R10 → 4 hits of
22.5°; R40 at 180° → 26 hits, allowance 128.0199.

Behaviour to prove:

1. The R40 bend passes `sequenceChecks` (13 hits clear, either way round).
2. Eighteen-hit version of the same bend (pitch 3.56) is NOT refused for
   short legs (today's N-separate-bends probe was).
3. A file with the round bend saved, reloaded, folds to the same bounds.
4. Every existing sheet-metal test passes unchanged except label / readout
   expectations this spec changes, each listed in the report.
5. Probe and report (do not pin until understood): the same blank with R15
   (5 hits) — reasoning says the 300 mm leg standing 15 mm in front of the
   punch line meets the ram (30 mm half-width, 166.5 mm above the tip) on
   the last hits, both ways round, and a 300-wide blank (150 mm legs) clears.
   Say what the check reports and why.

Verify script `scripts/verify-round-bend-rb1.mjs` (pattern of
`verify-shop-floor-sf3.mjs`): cut the 600 × 400 blank, open Bend, pick the
right edge, L 300, Round, R 40, read the results line, press Bend, wait for
the 13 hits, assert one sequence row "1 · UP 90° R40 · 13 hits", the folded
size, the job sheet's hit count; screenshots (mid-bump 3D + side view, the
flat blank card, the finished part) to `artifacts/sketch-cad/round-bend-rb1`.
Frame time while the bump runs: report mean and worst.

## 9. Phases and builder rules

- **RB-1 (built, §11)**: §4 – §8.
- **RB-2 (§12, built, §12.8)**: the radius punch, the shop's second way to make a round
  bend. Re-planned 2026-11-14 after the user's answer (§12.1); the panel
  maker's round flanges of the first plan are dropped (the kiosk's round
  corner is not a flange).
- **RB-3 (§13)**: the kiosk example gets its rounded top corners: folded
  flanges with welded corner pieces, R30 (the user's answer, §13.1).

Rules: those of `docs/sketch-studio-shop-floor.md` §9 and
`docs/sketch-studio-fab-shop.md` §11 (no `CAD_VERSION` bump, worker-safe pure
modules, match the surrounding code, vitest from the repository root, stop the
dev server and confirm the port is free). The working tree holds a large
uncommitted body of work: do not commit, stash, reset or check out anything.
Do not rename a pinned label, region name or status string; list every test
expectation changed and why. Full `npm test`, `npm run lint`, `npm run build`
green; the four `verify-fab-shop-sm*.mjs` and five `verify-shop-floor-sf*.mjs`
scripts still pass. Append "§11 RB-1 as built" to this file. Report: files
touched, measured numbers, every judgment call, anything here found wrong or
not done.

## 10. Sources and confidence

- Pitch = arc length / number of hits; ideal die opening = 2 × pitch; a wider
  die lets the bumped part sink into the opening: Steve Benson, The
  Fabricator, "Bumping up large-radius bends" and "Bump bending and air
  forming sheet metal on the press brake"
  (thefabricator.com/thefabricator/article/bending/bumping-up-large-radius-bends,
  …/bump-bending-and-air-forming-sheet-metal-on-the-press-brake). Read as
  search summaries on 2026-11-14 (the pages refused a direct fetch): a rule
  of thumb, medium confidence. Benson also notes very large radii are better
  rolled.
- The 2.5 · p warning threshold, the 1 mm minimum pitch, the 10 mm bump lift
  and the 3 s per further hit are this spec's own choices, not sourced.
- Springback of a large radius is much greater than the catalogue's
  `springback` rule shows (it caps at r/t = 8). Display only; say so in the
  guide.

## 11. RB-1 as built (2026-11-14)

All under `src/features/sketchstudio/cad/` unless named. `kernel.js` changes only in
its flat-view drawing data (see "Drawings and the flat DXF" below).

**The record and the numbers.** `sheetMetal.js`: `MAX_HITS` (200),
`MIN_PITCH` (1), `autoHits({ allowance, die, thickness })`,
`bumpHits(bend, thickness)` → { steps, stepAngle, pitch, flat, lines },
`zoneSamples(bend, base)` (the next multiple of N), `bumpPose(bend,
thickness, angle, from)` (the mini-bends in order from the fixed side, each
with its bump-order `hit`, posed angle, uniform transform and the product
`before` it). `bendTransform(bend, t, angle, from = 'fixed')`: an ordinary
bend runs the same arithmetic as before (moved into a private
`zoneTransform`); a round one returns the single arc's six fields at the full
angle (tested to 1e-9) plus `from` and `hits`; part-way its `matrix` is the
mini-bends' product and `origin` / `radius` are the hit being formed's (for
readouts only). `bendArcPoint` is piecewise when the transform carries `hits`.
`poseFold(fold, angles, from)`. `resolveBends` refuses by name (whole number
of hits 2–200, no radius, a radius not above `airBendRadius` of the bend's
tooling, pitch below 1 mm); fold bends carry `steps`, `stepAngle`, `pitch`,
`flat`; `bendLabel` adds "· 13 hits". Fold warnings: `short-leg` per hit,
`hole-near-bend` within BA/2 + 2.5 t, new `radius-needs-hits` (an ordinary
bend whose radius override ≥ 3 × what one hit forms). `foldedBounds` samples
every hit boundary.

**The machine.** `pressBrake.js`: `BUMP_GAP` (10), `backSide(bend, {
gaugePoint, turned })` (the rule `brakeFrame` had inline),
`machineFrom(fold, bendIds, options)` (poseFold's `from`: the side not at the
back), `brakeFrame(..., { hit })` (mini-bend `hit` in the die; the frame adds
`hit`, `hits`, `s`), `hitGauges(L, allowance, bump)` (L_j), `bumpTimeline(
machine, depth, steps)` and `strokeAt` on it (adds `hit`, `hits`, `gap`),
`sheetSection` → a private `roundSection` (the true posed section through
the zone, sampled on every hit boundary, the two straight wings tangent at
the zone's ends). `assessBend`: angle and min leg at one hit's angle, legs
from the outermost hit (flat leg − BA/2 + p/2: the ordinary rule when N = 1),
ram depth and bend-to per hit with the springback shared equally, backgauge
refusal naming the first or the last hit, `bump-die` warning with a `fix`;
readouts add `hits`, `stepAngle`, `pitch`, `flat`, `gaugeFirst`, `gaugeLast`
(round bends only: an ordinary hit's readouts are unchanged).
`brakeCollisions.js`: round bends walk the hits (per hit: the approach
sweep, ⌈24 / N⌉ poses, the last one the return sweep; the working zone is
that hit's strip only; arc items carry `bendId`); a collision carries `bump`
and `bumps` and reads "Bend 1, hit 14 of 26: …". `brakeStation.js`: session
`shape` / `radius` / `steps`, `station.autoSteps`, `hitTimeline`, the view
carries a round collision's `hit`. `shopLayer.js`: every station pose passes
`machineFrom` and the hit; the stroke loop cycles the hits; the fingers stand
at L_j (`state().station.fingerDistance`); `hit`, `hits` and `lastStroke` (per
frame work) in `state()`. `sheetMetalPreview.js` and the collision strips use
`zoneSamples`.

**Panels.** `PressBrakePanel.jsx`: Bend shape (Sharp · Round) under the
angle, Inside radius (mm), Hits (empty: automatic, the count as the
placeholder); results Hits and Flats; machine numbers Backgauge per hit, Ram
depth per hit, "bends to … per hit"; warnings show their fix; Hits made and
the finished card count hits. `BrakeSideView.jsx`: "Bending · hit 6 of 13".
`FlatPatternMap.jsx`: band, tangent lines, faint hit lines. `ShopPanels.jsx`:
Add bend's Sharp · Round, radius and hits; a round bend's row shows Inside
radius and Hits (no automatic radius). `jobSheet.js`: `strokeHits`,
`BUMP_HANDLING_S` (3); `shopRoute.js` counts hits; `shopFilm.js` doubles a
round bend's scene (cap 6.4 s).

**Measured.** The §8 table reproduces. Its backgauge row was first printed
329.54303 → 270.45697, a slip of the spec's (corrected in the audit): the
measured values are 329.543054 → 270.456946 (L + BA/2 − (j − ½)·p; the panel
reads 329.54 → 270.46), and the test pins those.
Kernel: 309.495 × 400 × 309.495, volume within 0.1 % of the blank. Collision
check, best of 10 runs (median): ordinary bend 26 poses 3.2 ms; 13 hits 39
poses 7.6 ms (13.9); 26 hits 52 poses 15.5 ms (25.2); `sequenceChecks` of the
acceptance part 8.8 – 15.2 ms. A 13-hit stroke runs 7.8 s (spec: "about 8 –
10 s"); frame work during the bump (pose, side view, render) mean ≈ 1.4 ms,
worst ≈ 3.8 ms over ≈ 1100 frames (headless Chrome). Tests: 6504 pass (42
new: `roundBend.test.js` 34, `PressBrakePanel.round.dom.test.jsx` 6, two
kernel tests in `kernel.sheetmetal.test.js`); no existing expectation changed.
`scripts/verify-round-bend-rb1.mjs` passes; the nine SM / SF scripts still pass.

**Probe 5 (R15, 5 hits).** Reported clear, both ways round, on the 600 wide
blank and on the 300 wide one. The reasoning in §8 assumed the 300 mm leg
stands vertical 15 mm in front of the punch line; in the last hit's frame
(the mini-bend in the die with its two wings symmetric, §5.3) the part has
turned through 72° + the hit, so the leg leans 9° (half a hit) toward the
operator: its top edge stands at Y −60.6 at Z 297 at the end of the stroke
(−83.7 at 81°), and at the ram's height it is about 40 mm in front, past the
ram's 30 mm half-width. Not pinned in a test.

**Drawings and the flat DXF** (added after the audit, when the kernel's flat
view data was cleared for change). `sheetMetal.js` `roundTangents(bend)` →
[[s0, s1, v]] (v = −BA/2 then +BA/2, the centre line's intervals).
`kernel.js` (drawing data only; the fold and the solid replay are untouched):
the flat view's `bendLines` add, after a round bend's centre line(s), its
tangent lines `{ a, b, bend, direction, tangent: true }` (no `label`); its
`bendTable` row adds `steps`; the `planarProfiles` `bendLines` add `{ a, b,
angle, direction, radius, tangent: true }`. An ordinary bend's data is
unchanged: the control box's and the pump bracket's profiles and flat
drawings were compared as JSON with a copy of the kernel as it was
(identical), and a test pins the old keys. `bendTable.js`: the INSIDE R cell
reads "R40 · 13 HITS" (on a sheet, in its units: "R40.00 · 13 HITS"); a table
holding a round bend widens INSIDE R by 8 mm and narrows TOOLING by 8
(`BEND_TABLE_WIDTH` stays 145; a table of ordinary bends is drawn as before);
`bendLinesSvg` draws tangent lines 0.13 thick, continuous, unlabelled, never
the "longest interval". `drawings.js` `profileSvg`: tangent lines solid,
titled "… TANGENT". `exports.js` `drawingDxf`: code unchanged, the tangent
lines go out on BEND with the centre line. Nothing else reads `bendLines`
(the laser's etch marks, the job sheet and the sheet layout do not count
them).

## 12. RB-2: the radius punch

### 12.1 What the user said (2026-11-14)

They sent the kiosk's design picture with the round corner circled: **the top
corner of the screen housing**, where its side wall turns into its top wall
(seen from the front, the housing's outline has rounded top corners; the wall
that wraps round them is bent round). And: "our shop does use the bump it on
and also the radius punch so both."

So a round bend has two ways of being made, and the operator picks:
**bump hits** (RB-1) or **one hit of a radius punch** (this phase).

### 12.2 What already holds (read 2026-11-14)

- `airBendRadius` (`shopCatalog.js`): r = max(punch tip radius, `radiusOfV` ×
  V). A punch with a 30 mm nose in a die whose natural radius is smaller
  forms R30. **A radius-punch bend is therefore an ordinary one-hit bend
  whose punch has a large nose: `radius: null`, no `steps`, no new model
  key.** The fold, the kernel, the stroke, the job sheet and the film need
  nothing new for it.
- What stops it today: the catalogue has no radius punch and no die wider
  than V25; `punchSection` draws every punch as a blade; `assessBend` refuses
  a punch blunter than its die (`punch-angle`); `defaultDie` picks by
  thickness only; the RB-1 "round" displays (zone band, tangent lines, the
  hole rule) key on `steps`.

### 12.3 The catalogue (`shopCatalog.js`)

- **Radius punches** R10, R15, R20, R25, R30: `round: true`, `radius` the
  nose radius, body `width` = 2 R, `height` and `load` from the Amada High
  Tonnage catalogue's radius rulers on their holder: R15 125.1 high, R20
  135.9, R25 146.7, R30 157.4, 1300 kN/m (the rows are on one line, 2.16 mm
  per mm of radius; R10 by the same line 114.3, which a Dutch edition also
  prints). Names "Radius R30". These came from a search summary of
  cdn.amada.eu `HighTonnage_Catalog.pdf` (the PDF's text could not be
  extracted here): confirm the rows if you can read the PDF, else keep them
  and say so in the comment.
- **Wide dies** V32, V40, V50, V63, V80 (and V100 if a catalogue lists it):
  research a real series for the angle, shoulder radius, body width, height
  and load (the same catalogue lists 60° 1-V dies V32 – V63). Record the
  source in the fab-shop spec §12 style. A dimension no catalogue gives is
  an assumption: mark it "assumed" where it is defined, as `PUNCH_HOLDER`'s
  width is. A die's `height` becomes per die (a wide V is deeper than 80 mm
  allows at 60°).
- `punchSection` for a `round` punch: a full round nose of radius R on a body
  2 R wide up to the clamp shoulder. It is drawn and collision-checked as
  that shape.
- The die for a radius punch (`defaultDie` gains the punch, or a sibling
  function; `bendNumbers` uses it when the bend names no die): the narrowest
  catalogue die with **V ≥ 2.2 × (R + t)**. Ordinary punches pick as today.

### 12.4 The checks (`assessBend`)

- `punch-angle` does not apply to a `round` punch.
- New refusal `radius-die`: a radius punch in a die with V < 2.2 × (R + t):
  "The Radius R30 punch with 1.5 mm sheet needs a die at least 69.3 mm wide;
  the V25 88° die is 25 mm. Use the V80 … die." Fix = that die.
- A warning, not a refusal, when the die is so wide that its natural radius
  exceeds the punch's (the bend comes out rounder than the punch): name both
  radii.
- `short-leg`: unchanged rule, but a wide die needs long legs (V80 at 90°:
  about 57 mm + the shoulder). When the punch is a radius punch the refusal
  adds the other way and offers it as the fix: "… or make it with bump hits:
  they need only about 6 mm." Fix = the session switched to bump hits at the
  same radius.
- The other way round: the `bump-die` and `radius-needs-hits` messages
  mention the radius punch when the catalogue has one of that radius.
- Force, tooling load, bed, backgauge, collisions: unchanged code, the
  punch's real section.

### 12.5 "Round" means either way

One predicate (a bend is round when it has `steps` or its punch is `round`)
replaces the `steps` tests in: the flat blank card's zone band and tangent
lines (hit lines only for bump hits), `roundTangents` (drawing sheets, DXF),
the `hole-near-bend` zone rule, and the bend table (a radius-punch row's
INSIDE R reads "R30", its tooling column names the punch). Bump-only logic
(the pose, the hit walk, the hit count) stays on `steps`.

### 12.6 The station

- Round shows **Made by**: Bump hits · Radius punch.
  - Bump hits: Inside radius and Hits, as RB-1.
  - Radius punch: one select, **Radius punch** (R10 … R30), in place of the
    two fields; the inside radius is the punch's; the die is automatic by
    §12.3 and can still be chosen under Machine and tooling.
- One source of truth: choosing a radius punch in the Machine and tooling
  select is the same as Round · Radius punch, and switching to Sharp or to
  Bump hits puts the straight punch back.
- Results read like a sharp bend's (one hit) with the inside radius. The
  sequence row is the label, "2 · UP 90° R30"; its tooling line names the
  punch.
- "Add bend by numbers" gets the same Made by choice.

### 12.7 Acceptance

SPCC t 1.5, a strip 1000 × 40, two bends up 90° across it, centre lines at
x = 300 and x = 700, Radius R30 punch, automatic die:

|                                        |                                                           |
| -------------------------------------- | --------------------------------------------------------- |
| Inside radius, K, allowance, deduction | R30 · 0.5 · 48.30199 mm · 14.69801 mm                     |
| Automatic die                          | the narrowest with V ≥ 69.3 (V80 if the catalogue has it) |
| Outside legs                           | 307.34901 (each end) · 414.69801 (between the bends)      |
| Folded size                            | 414.698 × 40 × 307.349                                    |
| Hits                                   | 2 (one per bend), both clear on the 50 t × 2 m press      |

1. A 600 × 400 blank with the line 40 mm from an edge and the R30 punch is
   refused for the short leg, the card offers bump hits, and after the fix
   the same bend passes (10 hits, ⌈48.30199 / 5⌉).
2. The R30 punch in the V25 die is refused with `radius-die` and its fix.
3. Every RB-1 test and the §8 table still pass; a model with no radius punch
   gives the same results as before.
4. Verify script `scripts/verify-round-bend-rb2.mjs`: the strip above through
   the station (Round · Radius punch · R30, two hits), the folded size, a
   screenshot of the side view with the round punch in the die, then the
   short-leg refusal and its bump fix. Screenshots to
   `artifacts/sketch-cad/round-bend-rb2`.

The guide's "Round bends" section gains the two ways and when each fits
(short legs → bump; a punch of that radius and long legs → one hit). Append
"§12.8 RB-2 as built". Rules: §9.

### 12.8 RB-2 as built (2026-11-14)

All under `src/features/sketchstudio/cad/`. No model key, no solver or kernel
change: a radius-punch bend is an ordinary one-hit bend whose `punch` is a
radius punch (`radius: null`, no `steps`).

**The catalogue** (`shopCatalog.js`). The Amada High Tonnage PDF's text was
read after all (`pdftotext`, which this machine has under Git's mingw64): the
§12.3 punch heights are confirmed, and the wide dies come from the same PDF
(sources: `docs/sketch-studio-fab-shop.md` §12). `PUNCHES` gains `radius-10`
… `radius-30` ("Radius R10" …): `round: true`, `angle: null`, `radius`,
`width` 2 R, `height` 114.3 / 125.1 / 135.9 / 146.7 / 157.4, `load` 1300, and
`holder` { height 100 or 103.5, width 41 } (the catalogue's radius punch
holders HH-015 / HH-016; the R15 and R20 on the HH-015 is assumed). `DIES`
gains the 1-V 60° dies V32, V40, V50, V63, V80, V100 (shoulder R5 – R12,
width 60 – 135, 1300 kN/m) and `height` becomes per die (80, 80, 85, 95, 100,
125 for those; 80 for the others). New exports: `RADIUS_PUNCHES`,
`radiusPunchFor(radius)`, `nearestRadiusPunch(radius)`, `RADIUS_DIE_FACTOR`
(2.2), `radiusDieOpening(punch, t)`. `defaultDie(t, punch = null)` and
`suggestedDie(t, punch = null)`: for a radius punch the narrowest die (any
angle) with V ≥ 2.2 × (R + t), else the widest (`fits: false`); any other
punch exactly as before (tested for every thickness and punch).
`punchSection` of a round punch: a 16-segment half circle of radius R about
(0, R), sides at ± R up to the holder (z = height − holder height), then the
41 mm holder to the top. Judgment call: §12.3 said "a body 2 R wide up to the
clamp shoulder"; the PDF gives the holder's real width, so the section has
it (an R10's 20 mm ruler under a 41 mm holder is what a flange would meet).

**The rules** (`sheetMetal.js`, `pressBrake.js`). `bendNumbers` takes the
punch-aware default die. `isRoundBend(bend)` (steps, or a round punch)
replaces `steps` in `roundTangents` (so the kernel's flat view, the drawing
sheets and the flat DXF draw a radius-punch bend's tangent lines with no
kernel change), the `hole-near-bend` zone rule and the flat-blank card's band
(`FlatPatternMap.jsx`; hit lines only with `steps`). The bend table needed no
change: the row reads "R30" and the tooling cell already names the punch
("Radius R30 / V80 60°"). `assessBend`: `punch-angle` skips a round punch;
new refusal `radius-die` with the fitting die as `fix`; new warning
`radius-die-wide` (the die's natural radius above the nose's, naming both,
the narrowest fitting die as `fix`); a short leg with a radius punch only
offers a smaller die the punch still fits (`dieForLeg` gains the minimum V),
else "Cut the blank larger, so the … is at least … mm from the punch line",
and, when bump hits would carry that leg, adds "or make it with bump hits:
they need only about N mm" with the fix `{ shape: 'round', radius, steps:
null, punch: 'straight-88', die: null }`. N is measured from the punch line
(the bump way's per-hit minimum leg + BA/2 − p/2, 27.95 mm for R30): judgment
call, the refusal's own figure is from the punch line, so §12.4's "about 6
mm" (the per-hit minimum leg beside the outermost hit) would not compare. The
fix is offered only when bump hits fit. `die-range` is not raised for a
radius punch (its own refusal covers it). `bump-die` and `radius-needs-hits`
add "Or make it in one hit with the Radius R30 punch." / ", or make it in one
hit with the Radius R30 punch" when `radiusPunchFor` finds that radius.

**The station.** `brakeStation.js`: a session whose `punch` is round makes an
ordinary hit with it (no radius, no hits, `autoSteps` null) whatever `shape`
says: the punch is the one source of truth. `PressBrakePanel.jsx`: Bend shape
reads Round whenever the punch is round; Round shows **Made by** (Bump hits ·
Radius punch); Radius punch shows one **Radius punch** select in place of
Inside radius and Hits. Radius punch picks `nearestRadiusPunch(session.radius)`
with the die automatic; Bump hits puts the straight punch back with the
punch's radius and automatic hits; Sharp puts the straight punch back. The
Machine and tooling punch select: a radius punch also sets `shape: 'round'`;
a change between a radius punch and a straight one resets the die to
automatic; a radius punch → a straight punch leaves `shape` as it was (so
Round · Radius punch → Straight 88° reads Round · Bump hits; judgment call).
The tooling summary and the die select's "Automatic (…)" use the punch. The
sequence rows (and the finished card's) add the punch to their tooling line
for a radius punch: "Radius R30 punch · v80-60". `ShopPanels.jsx` Add bend:
the same Made by and a **New bend radius punch** select. `shopLayer.js`: its
three automatic-die fallbacks pass the view's punch.

**Measured** (vitest and the verify script). The §12.7 table reproduces: R30,
K 0.5, allowance 48.30199, deduction 14.69801, die V80 60°, legs 307.34901 /
414.69801, folded 414.698 × 40 × 307.349, 2 hits, `sequenceChecks` clear and
each hit clear both ways round (26 poses, 6 – 8 ms per run; the whole
`sequenceChecks` 42 ms); kernel solid the same size, volume within 0.1 % of
the blank. Item 1: refused "The flange is 40 mm from the punch line in the
flat; the V80 60° die needs 66.57 mm to carry it on both shoulders. Cut the
blank larger, so the flange is at least 66.57 mm from the punch line, or make
it with bump hits: they need only about 27.95 mm."; after the fix 10 hits
(9° every 4.83 mm, V10), clear, made. Item 2: "The Radius R30 punch with 1.5
mm sheet needs a die at least 69.3 mm wide; the V25 88° die is 25 mm. Use the
V80 60° die." with that fix. Item 3: every RB-1 test passes unchanged. The
station's hit: ram depth 29.4 mm (display only), one stroke ≈ 4 s. Tests:
`radiusPunch.test.js` (17), `PressBrakePanel.radius.dom.test.jsx` (8), one
kernel test in `kernel.sheetmetal.test.js`; three `shopCatalog.test.js`
expectations changed (the die count 10 → 16; the punch-section loop skips
round punches; the die-section loop's −80 → −die.height).
Full suite 6530 pass (1 skipped, with the thin-strip tests below); lint 0 errors; build green.
`scripts/verify-round-bend-rb2.mjs` passes, and the four SM, five SF and the
RB-1 scripts still pass.

**The flat-blank card on a thin strip** (after the audit). On a blank only 40
mm tall (the strip here, the kiosk's wrap band) the card's click areas, each
± 1.6 dot for an edge and ± 1.4 dot for an etched line or a segment (dot =
the longer view-box side / 90, 12.9 mm on the 1000 × 40 strip), overlap: the
two long edges' strips cover the whole strip, both short ends and every
etched line across it, and the one drawn last took the click.
`pressBrake.js` gains `segmentDistance(point, a, b)` and `nearestLine(lines,
point, prefer)`; `FlatPatternMap.jsx` keeps every element (role, label,
`aria-pressed`, handlers) and routes a pointer click (`detail` ≥ 1) to the
line nearest the pointer among those whose own area holds it (the reach is
each line's own half-width: nothing becomes clickable that was not, only who
wins an overlap changes; on the card about 5 – 6 screen pixels either side
of an edge); a tie goes to the element clicked, and a click with no pointer
(keyboard, a synthetic test click) picks the element clicked, as before. The
etched lines and segments go through the same rule (they were covered too).
`verify-round-bend-rb2.mjs` clicks the right edge's centre, which lands on
the top edge's strip, and picks the right edge. Tests: one unit test of the
rule on the 1000 × 40 edges (each edge, the ends from just outside, ties,
out of reach) and one dom test on the card. Also hardened
`verify-fab-shop-sm4.mjs` §13: after Example: control box it read the
recovery copy right after "Model current" (which can still be the last
model's) and once saw no Control box group; it now waits (`savedWhen`) for
the example's group.

### 12.9 Sources and confidence (RB-2)

- Radius punch rows: Amada High Tonnage catalogue, read from the PDF's text
  (2026-11-14): confirmed. Wide dies from the same PDF; their heights from the
  drawings, medium confidence. Details in `docs/sketch-studio-fab-shop.md` §12.
- V between 2.2 and 2.5 × (t + inside radius) for radius air bending: Harsle's
  radius air bending calculator (harsle.com), a vendor rule of thumb; low to
  medium confidence. The lower bound is used as the minimum.
- A large radius air-formed in one hit springs back far more than the
  catalogue's `springback` rule shows, and can lift off the punch nose
  ("multi-breakage"). Neither is modelled; the guide says so.

## 13. RB-3: the kiosk's rounded top corners

### 13.1 What the user said (2026-11-14)

Asked whether the rounded wall is one strip wrapped round the housing or
flanges with corner pieces: "it is welded flanges folded and welded in the
corner", and of the radius "maybe you are right 30".

Read as (the builder's reading to keep, the user's to correct): the face
frame keeps its **folded flanges** on the sides and the top; each top corner
of the face is **rounded, R30 outside**; the two flanges stop short of the
corner; a small **corner piece** — a strip as wide as the flange is deep, with
one 90° round bend — closes the gap and is **welded** to the two flange ends.
Sized by eye like the rest of the example.

### 13.2 What was read

- `panelMaker.js` `layoutPanel`: corners are `closed` (a square corner, two
  90° flanges the same way: the longer edge covers) or open with a relief
  (198–224); a flange's tab runs corner to corner, ended per corner style
  (283–318); the blank is the union of the face core, tabs and reliefs.
  `validate` wants a convex straight-edged face.
- `shopExamples.js` `kioskFaceFrame` (574): flanges on edges 0, 2 (the long
  sides) and 1 (the top), all 40 up; `buildKiosk` welds each frame's two top
  corners as closed corners (843–867): 4 of the kiosk's 10 seams.
- `weldStation.js` `weldSeam` (129): a seam is a **straight** edge against a
  parallel edge or a flat face. A seam round an arc cannot be recorded.
- Pinned counts: 33 instances (`verify-shop-floor-sf4.mjs:95`,
  `sf5.mjs:152`), 31 film scenes and welds / finishes / prints 10 / 7 / 2
  (`sf5.mjs:167`, `237`), the guide's walk-through, `kiosk.test.js`,
  `kiosk.kernel.test.js`.

### 13.3 The panel maker: a round corner

`flangedPanel` input gains `rounds: [{ corner, radius, leg = 15 }]` (corner k
is face[k], between edge k − 1 and edge k).

- Allowed where a closed corner is today: a 90° corner whose two edges carry
  90° flanges the same way and the same depth. Anything else is refused by
  name.
- The finished corner: the wall's **outside** follows radius `radius` about
  the corner's centre, flush with the two flanges' outsides. Each flange ends
  square, `leg` before its tangent point (so `radius + leg` from the sharp
  corner). The face plate is cut back by the thickness along that stretch and
  round the arc (radius − t), so the corner piece's inside lies against the
  face's cut edge. The bend zones end clear of the cut-back with the usual
  relief.
- `report.corners[k]` says `style: 'round'` with its radius and leg; the
  result carries, per round corner, the corner piece's own layout
  (`cornerPiece({ radius, leg, depth, thickness, stock })`, exported): a
  rectangle blank `depth` wide and leg + BA + leg long with **one round bend
  by bump hits** across its middle, inside radius = radius − t, automatic
  hits, and where it stands on the panel (a pose in the panel's folded frame)
  so a caller can place it.
- The Flanged panel form gets, per square flanged corner, a **Round corner**
  toggle with its radius (and the leg under an "advanced" disclosure if the
  form has one, else beside it); the preview draws the rounded face and the
  shortened flanges, and the form says how many corner pieces it will cut.
  Both endings (Cut the blank / Cut and bend it for me) also make the corner
  pieces as their own parts (one part, as many instances as corners of that
  size), placed in their corners.

### 13.4 The kiosk example

- `KIOSK` gains `corner: { radius: 30, leg: 15 }`. Each face frame's two top
  corners are round. New part "Kiosk corner piece — sheet metal", four
  instances, in the "Kiosk frame" weldment, painted with it.
- Welds: the four closed-corner seams go; each corner piece is butt-welded to
  the end of the side flange and to the end of the top flange (two straight
  40 mm seams each, eight in all) → 14 seams. The seam round the arc against
  the face plate cannot be recorded (§13.2): say so in the guide's limits.
- Everything else of the kiosk stays where it is. Update every pinned count
  that changes (instances 33 → 37, seams 10 → 14, painted parts 7 → 11, the
  film's scenes, the job sheet, the guide's walk-through and its sizes table),
  each listed in the report with old and new value.

### 13.5 Acceptance

Hand values for the kiosk's corner piece (SPCC t 1.5, depth 40, radius 30,
leg 15; inside radius 28.5, K 0.5):

|                      |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| Allowance, blank     | 45.94579 mm · 75.94579 × 40                                                  |
| Automatic hits (V10) | 10 hits of 9°, every 4.59458 mm                                              |
| Folded               | two 15 mm straight legs at 90°, outside radius 30; outside size 45 × 45 × 40 |

1. The corner piece passes `sequenceChecks` on the 50 t × 2 m press.
2. The face frame with two round corners folds, passes `sequenceChecks`, and
   its flanges end 45 mm from the sharp corners (measured on the fold).
3. Each corner piece in place: its two end edges lie on the flange ends
   within the weld fit-up gap, its outside is flush with the flanges'
   outsides (within 0.05 mm), and the kernel finds no interference between it
   and the face frame.
4. A panel with no `rounds` lays out byte for byte as before (the control
   box, the tray, the channels, the covers and the SF-3 panel tests
   unchanged).
5. `verify-shop-floor-sf4.mjs` and `sf5.mjs` pass with the new counts; a new
   `scripts/verify-round-bend-rb3.mjs` loads Example: kiosk, checks the
   corner pieces (4 instances, each "UP 90° R28.5 · 10 hits"), opens Bend on
   one and plays Watch the bends, and takes close-up screenshots of a top
   corner (3D) to `artifacts/sketch-cad/round-bend-rb3`.

Append "§13.6 RB-3 as built". Rules: §9.

### 13.6 RB-3 as built (2026-11-14)

All under `src/features/sketchstudio/cad/` unless named. No model key and no
solver, kernel or station change: a round corner is a layout in the panel
maker, and the corner piece is an ordinary sheet-metal part with one RB-1
round bend.

**The panel maker** (`panelMaker.js`). Input `rounds: [{ corner, radius, leg
= 15 }]` (new export `ROUND_CORNER` { leg 15, radius 30 }: the leg default and
the form's starting radius). Refused by name: no corner of that number, a
corner rounded twice, a radius not above t ("it is the outside radius"), a
radius whose inside (radius − t) is not rounder than one ordinary hit of the
default V die forms (R ≤ 3.1 on 1.5 mm: "…leave the corner square"), legs ≤ 0,
and where a closed corner could not be: no flange on one edge, not 90°, a
flange not at 90°, the two bent different ways, different depths; a flange left
shorter than 2 (c + h + relief) between its round corners; a window inside the
arc (closer than 2 t to it); a crease within radius + leg + relief + its own
notch of the corner (the notch check with the round corner's reach). Layout:
each flange's tab ends square at `radius + leg` from the sharp corner; its bend
zone ends there too, with a relief `relief` (1 mm) wide beyond the flange end,
cut in to the inner relief line (c + h + relief, 4.1 mm on 1.5 SPCC) — the
open corner's relief rule, "the usual relief" of §13.3; the face is cut back
to w = −t along both legs and round the arc (radius − t about the corner's
centre). The arc is a polygon: its vertices on that circle, one on each
tangent line, chords within `CHORD_ERROR` (0.05 mm; 14 per quarter at R28.5),
so the face never enters the corner piece. The corner relief and the ears of a
closed corner are not made at a round corner. Output: `report.corners` (every
face corner: { index, angle, style 'closed' | 'open' | 'round' | null, radius
and leg when round }) and `cornerPieces` ([{ corner, radius, leg, depth, piece,
pose }]: one `cornerPiece()` per size, shared; `pose` a column-major 4 × 4 from
the piece's frame into the panel's folded part frame, through the matrix of the
face piece holding the corner). A corner piece's sequence problems are added to
`report.problems` ("Corner piece: …", index `corner-N`). New export
`cornerPiece({ radius, leg, depth, thickness, stock }, { machine, idPrefix })`:
the strip (leg + BA + leg) × depth, one bend UP 90° across its middle, radius
− t inside, automatic hits (`autoHits`, the sheet's default die), the punch line
0.5 mm inside the strip's edges as the panel's own lines, `base` on the first
leg (so the root is that leg whatever the rounding), one etched line whose
`bend` also carries `radius` and `steps`; returns { profile, bends, marks,
feature, fold, strokes, numbers, report }. Its frame: the first leg flat, its
outside on z = 0, the bend up about x = leg, z = radius; the pose stands it with
its first leg on the corner's second edge for up flanges (strip up from z = 0),
on the first edge for down flanges (strip down from z = t). Judgment calls:
the corner piece is always bent UP in its own frame (the pose turns it), and
its ends meet the flange ends with no gap (§13.3 puts the flange end at radius

- leg and the piece is 45 outside: the fit-up gap is not taken out of either).

**A panel with no rounds is unchanged**: every `flangedPanel` output of the
91 inputs of `panelMaker.test.js`'s grid plus the §1 face frame, the kiosk's
face frame, tray, channels and covers was compared as JSON with a copy taken
before the change (identical; the only new keys are `report.corners` and
`cornerPieces`); `rounds: []` lays out the same JSON as no `rounds`
(`roundCorner.test.js`).

**The form** (`PanelMakerForm.jsx`). The draft gains `rounds` (corner →
{ radius, leg }); `roundableCorners(face, flanges)` and `draftRounds(draft,
face)` (exported) offer and apply a round corner only on a square corner with a
flange on both edges (taking a flange off hides it; changing the face shape or
No flanges clears them); the maker refuses the rest by name. Under the edges a
**Corners** list: per corner a **Round corner N** checkbox ("Corner 3 · round,
R30 outside" / "square") and, when on, **Radius** and **Leg** fields beside it
(the form has no advanced disclosure). Results add **Corner pieces** ("2 pieces
· blank 75.9 × 40 mm · R30 outside in 10 hits", one clause per size). The
preview rounds the face's outline (SVG arcs), stops each flanged edge's line
radius + leg short, and draws each corner piece (`.cad-panel-corner-piece`).
Both endings (`CadWorkspace.jsx createPanel` → `cutFromSheet`'s new
`companions`) add one part per size ("<name> corner piece", with its own
blank sketch, `base`, etched line and — Cut and bend it for me — its round
bend) and an instance per corner placed by its pose (new `movement.js`
`matrixPose(matrix)` → { position, rotation }). At the press brake a click on
an etched line whose `bend` has `steps` also sets Round, the radius and the
hits.

**The kiosk** (`shopExamples.js`). `KIOSK.corner` { radius 30, leg 15 };
`kioskFaceFrame` rounds face corners 1 and 2 (the top edge's ends; the face is
drawn lying down). New part `shop-kiosk-corner` "Kiosk corner piece — sheet
metal" (sketch "Kiosk corner piece blank", ids `shop-kiosk-face-corner-1-…`
from the panel's layout), instances `shop-kiosk-corner-{front,rear}-{left,right}`
"Front left corner piece" … (left/right as seen from that side; corner 1 is
the left), appended after the covers, posed by face instance × pose. Welds:
the four closed-corner fillets are gone; each corner piece is butt-welded
(TIG, 1.5) to the end of its side flange, then its top flange: first pick the
outside edge of the leg's free end, second the outside edge of the flange end
nearest it → 8 seams of 36.9 mm (the flange's straight run: 40 less the
bend's 3.1 mm outside setback; the curved part of the flange's bend is no
straight edge), gap 0. 14 seams; the weldment (now 9 parts) is painted with
the frame. Everything else is where it was (the face frames' placement, the
shelf, channels, covers, displays, fasteners, prints, steps).

**Measured.** The §13.5 table reproduces: allowance 45.94579, blank 75.94579 ×
40 (75.945793 after the 1e-6 rounding of the outline), K 0.5, V10, 10 hits of
9° every 4.59458 mm; folded two 15 mm straight legs at 90°, outside R30 /
inside R28.5 about x = 15, z = 30 (to 1e-7), outside size 45 × 40 × 45 (Y the
strip). Item 1: clear on the 50 t × 2 m press (8.6 ms). Item 2: the kiosk face
frame folds with no warning, its four strokes clear (152 ms), each flange ends
45.000000 mm from its sharp corner (both corners, side and top). Item 3: each
leg's free end on its flange's end within 7.2e-7 mm (the fit-up gap 0.1),
one leg per flange; the legs' outsides in the flanges' outside planes within
4e-7 mm (0.05 asked), their insides t in; the arc's outside on R30 and inside
on R28.5 within 3e-7; the face's arc vertices on R28.5 (to 1e-6), the chords
at most 0.0448 mm inside. The kernel's inspect over the kiosk's 37 instances
finds no interference (4.0 s in node, 3.5 s with 33), and finds the front left
corner piece pushed 0.5 mm along +X (`kiosk.kernel.test.js`). Item 4: above.
Item 5: `verify-shop-floor-sf4.mjs` and `sf5.mjs` pass with the new counts and
`scripts/verify-round-bend-rb3.mjs` passes (Example: kiosk, the corner piece
part ×4 in the weldment, "1 · UP 90° R28.5 · 10 hits" on each, Watch the bends
playing the ten hits, close-ups of the front right top corner, isometric,
front and X-ray, in `artifacts/sketch-cad/round-bend-rb3`). Kiosk build (node,
`sheetMetalKiosk` for a fresh set of sizes; built once and cached): first build
in a fresh process ≈ 410 ms before → 475 – 500 ms after, later builds 160 –
200 ms → 260 – 320 ms (the face frame's layout 135 → 165 ms, its brake check
meshing the arcs; the corner piece's own layout and checks 5 ms). Example:
kiosk click → Model current in the browser (dev server, headless Chrome):
1430 ms (rebuild 1115) before → 1557 – 1849 ms (rebuild 1202 – 1465) over four
runs after. The film: 36 scenes, 102.4 s at 1× (86.3 s before), frames mean
7.0 ms; its first frames (the film's start) 97 – 125 ms against 56 – 70 ms
before, the rest as before (not investigated further: `filmScenes` itself is
10 – 20 ms).

**Counts changed** (each pinned): instances 33 → 37; parts 7 → 8; outlines
4 → 5; blanks 7 → 11; hits 24 → 64 (route bar and the job sheet's summary:
each corner piece's 10; the job sheet's Bend quantity counts rows, one per
stroke, 24 → 28); seams 10 → 14 (8 butt + 6 fillet); finishes / painted parts
7 → 11; the face frame's seams 5 → 7 and "every copy's" 10 → 14 welds on the
brake's finished card; film scenes 31 → 36 (five blanks, fifteen bend scenes,
seven weld groups: one per corner piece, the seams being grouped by the part
welded on); the film-length test bound 95 → 105 s (97.7 s without the
kernel's seam lengths); a round bend's scene may run to twice a bend scene's
maximum (RB-1's rule) in the scene-length test.

**Not done / limits.** The seam round the arc against the face plate is not
recorded (weldSeam is straight-only; the guide's Limits say so, and the job
sheet's weld time leaves it out). The 1 mm relief beyond each flange end goes
through the face plate (a 1 × 2.6 mm notch beside the corner piece, seen from
the front at close range); the weld would close it in the shop. The flange's
own bend radius leaves a small triangle of the corner piece's lower edge
standing proud of the rounded flange heel at each butt joint (the shop grinds
it). A radius punch cannot make this corner piece (its V80 die needs ≈ 66 mm
legs), as §13.5 expected. Changing the hit count or die of the corner piece is
done at the press brake, not in the form.

## 14. Not in scope

A urethane die; plate rolling; cones and bends whose radius changes along the
line; hems; springback compensation; round flanges (a flange that is itself a
round bend) in the panel maker; curved weld seams; a wrapped one-piece wall.
