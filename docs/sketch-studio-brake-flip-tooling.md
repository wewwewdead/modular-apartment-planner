# Sketch Studio press brake: blades, flipping the sheet, back-to-back bends

Status: spec, 2026-11-14. Follows `docs/sketch-studio-fab-shop.md`,
`docs/sketch-studio-shop-floor.md` and `docs/sketch-studio-round-bend.md` (all
built). Two phases (§8): **BT-1** the blades, **BT-2** flip, turn and the
offset bend. One builder run each, audited between.

## 1. What the user asked for

They sent a diagram titled "two separate bending": a sheet with an offset
(a step of 0.250 in. made of two 45° bends), made in **two hits with the sheet
flipped between them** — the first bend hangs down in front of the die while
the second is made against the stops. "It should allow users to flip the
sheet metal so it can have back to back bending like this … and also please
allow users to change type of blades."

## 2. Feasibility (measured 2026-11-14, probes on today's code)

SPCC t 1.5, 100 mm wide blanks, 50 t × 2 m press, automatic tooling.

**Back-to-back bends already fold and already pass the machine's checks**
when the numbers are right:

- The diagram's case (45° up, then 45° down 8.797 mm away: a 6.35 mm step)
  folds to a 7.85 mm high part (step + t) and both hits clear, in either
  order.
- A 90° step of 20 mm on a 260 mm blank clears **only in the order that
  leaves the 60 mm side hanging down**; the other order hits the bed. On a
  300 mm blank (100 mm and 181 mm sides) it is refused in both orders: the
  side that hangs is longer than the die is high (80 mm) and the web
  (15.3 mm) keeps it over the bed (30 mm half-width). A 40 mm step clears in
  both orders (the web carries the hanging side past the bed). That is what
  the machine does.

What is missing is everything around it:

1. **Flipping is a checkbox** ("Flip sheet (bends down)"). Nothing shows the
   sheet being turned over, and nothing says the second bend of a step needs
   it.
2. **There is no way to turn the sheet around** (the other side to the
   backgauge). A collision card can say "Turned around … it clears" and
   offers no button; with a gauge edge picked, the only way is to pick the
   opposite edge and work out L again.
3. **The spacing is left to the user.** A 6.35 mm step at 45° needs the two
   lines 8.797 mm apart; nothing works that out, and nothing says the
   smallest step the tooling can make. Two things limit it: the web must
   reach the die's minimum leg (a 5.43 mm step with the V10 die, 3.44 mm
   with the V6), and the side already bent must hang clear of the die's body
   (measured: at 45° a 5.5 mm step hits the V10 die and 6.35 clears; with
   the V6 die 4 mm hits and 5 mm clears).
4. **The collision advice is wrong for this case.** A side hanging into the
   bed reads "Bend this one before bend 1 … Or flip the sheet": for a
   back-to-back pair neither is the remedy.
5. **The blades can be changed, but only inside a closed disclosure**
   (Machine and tooling → Punch / Die selects), as names with no picture.
6. **The gooseneck punch is unusable.** Every plain 90° bend with it is
   refused ("the part hits the punch at 69.8°"), either way round, on every
   blank tried: its schematic section's underside rises at 25° from the tip,
   under the 45° a wing reaches. A real gooseneck makes a plain 90° bend.

So both requests are feasible: no model change, no solver change.

## 3. What was read

All under `src/features/sketchstudio/cad/`, line numbers of 2026-11-14.

- `PressBrakePanel.jsx`: the angle row with the `Flip sheet` checkbox (~326),
  Bend shape Sharp · Round and Made by (RB-1, RB-2), the
  `<details className="cad-shop-tooling">` with selects labelled "Press brake
  machine", "Punch", "Die" (~336–390), `ProblemCard` with `fix` for refusals
  and warnings, the collision card without one (~508).
- `brakeStation.js`: session defaults (`flip`, `punch`, `die`, `shape`,
  `radius`, `steps`), `brakeStation` (the pending hit; `gaugePoint` from the
  gauge edge decides the back side), `collision()` (tests the other way round
  and returns `turnedClears`), `startStroke`, `sequenceChecks` (a stored step
  passes if either way round clears).
- `pressBrake.js`: `backSide` (gauge point's side, else the shorter flat leg,
  swapped by `turned`), `brakeFrame`, `assessBend` refusals with `fix:
{ label, session }`.
- `brakeCollisions.js`: `ADVICE` and `report()` (the "bend this one before
  bend N" logic and its `breaks` guard), tools punch / holder / ram / die /
  bed; the bed's half-width is `machine.beam / 2`, the die's height `die.height`.
- `shopCatalog.js`: `PUNCHES` (straight 88°, sharp, gooseneck, acute 30°,
  tall, five radius punches), `DIES`, `punchSection` (the gooseneck's ring:
  tip, (3, 10), (45, 30), (45, 80), clamp, (27, 80), (27, 35), (−3, 20)),
  `dieSection`.
- `shopLayer.js`: `poseStation`, the stroke loop (RB-1's bump run plays
  several hits inside one stroke), `buildTooling` from the sections.
- `BrakeSideView.jsx`, `FlatPatternMap.jsx` (bends coloured by direction).
- `docs/state-machines.md`: `BRAKE` setup → STROKE → DONE.

## 4. BT-1: the blades

### 4.1 Choosing them

- A **Blades** row in the panel, always in view, above Machine and tooling:
  two buttons, **Top: punch** and **Bottom: die**, each with the tool's
  silhouette (drawn from `punchSection` / `dieSection`, the same shape the
  scene and the collision check use), its name and one fact (tip radius;
  V opening). The die's says "(automatic)" when it is.
- Clicking one opens a picker in the panel: every punch (or die) as a card
  with its silhouette at one common scale, name, the numbers that matter
  (angle, tip radius, height, load; V, angle, shoulder radius, load) and one
  plain line on what it is for — straight: everyday bends; sharp: thin sheet,
  tight inside radius; tall: deep boxes; gooseneck: a flange already standing
  that would hit a straight punch; acute 30°: bends past 90°; radius R..:
  round bends in one hit. A tool that the current hit refuses says why on its
  card (the existing refusal), and stays choosable.
- One source of truth: the picker sets `session.punch` / `session.die`
  exactly as the selects do; the selects stay in Machine and tooling (tests
  and scripts use them). Radius punches keep RB-2's rules (Round · Radius
  punch).
- `PUNCHES` / `DIES` entries gain `use` (that plain line). No new tools
  unless a catalogue row is read for them (the round-bend spec §12.8 says how
  the Amada PDF was read); a sash punch and a deep gooseneck are welcome if
  their rows are found, each with its source.

### 4.2 The gooseneck

- Its section is redrawn so that **a plain bend clears it**: on both sides of
  the tip the body stays clear of a wing at half the die's bend limit (46°
  for an 88° die) with a few degrees to spare, and the throat on the open
  side keeps a relief worth having. Research a real 88° gooseneck's key sizes
  (throat depth and height, body offset) and use them; whatever is not found
  stays schematic and says so in the comment.
- **Reverse punch** (a checkbox shown for a punch whose section is not
  symmetric): the throat faces the backgauge instead of the operator. Session
  state, drawn and collision-checked mirrored; a stored step is already
  accepted either way round, so nothing new is saved.

### 4.3 Advice that can be clicked

A collision whose advice names another punch offers it as a fix button, but
only when the hit really clears with it (run the check): "Use the gooseneck
punch", "Use the tall straight punch". The collision card's "Turned around …
it clears" stays text in BT-1 (its button is BT-2's).

### 4.4 Acceptance

1. With the gooseneck, a 90° bend clears either way round on: 300 × 100 with
   the line at 150, 300 × 100 at 40, 120 × 100 at 60, 100 × 100 at 50 (all
   refused today).
2. A channel whose standing flange hits the straight punch clears with the
   gooseneck (the case `verify-fab-shop-sm2.mjs` already drives); its card
   now carries the fix button, and one click makes the hit pass. If the new
   section changes which existing cases collide, each one is listed with old
   and new outcome and why the new one is what a shop sees.
3. Each punch and die can be chosen from the picker; the panel, the side view
   and the 3D scene show it; the selects and the picker never disagree.
4. Every existing test passes unchanged except gooseneck expectations and
   panel snapshots this section changes, each listed.
5. `scripts/verify-brake-blades-bt1.mjs`: open Bend on a 300 × 100 blank,
   open the punch picker (screenshot), choose the gooseneck, make a 90° bend,
   then the channel case and its fix button. Screenshots to
   `artifacts/sketch-cad/brake-blades-bt1`.

## 5. BT-2: flip, turn, and the offset bend

### 5.1 Flip sheet over

- `session.flip` stays the fact (and the control stays reachable by the label
  "Flip sheet"); it is shown as a clear two-state control beside the angle:
  **This side up · Flipped over**.
- When the side that is up changes — the control is toggled, or a stroke
  starts on a sheet lying the other way up — the 3D sheet visibly **turns
  over** on the die (about half a second, view only), and the side view says
  which side is up. Earlier bends then show hanging down, as they are.

### 5.2 Turn sheet around

- A **Turn sheet around** button: the other side goes to the backgauge.
  With a gauge edge picked it picks the opposite parallel edge and sets L to
  the same punch line from there (same hit, other way round); with no such
  edge, or a two-point line, it sets `session.turned`, which the pending
  check, the pose and the stroke use.
- The collision card's "Turned around (the other side to the backgauge) it
  clears." becomes its fix button.

### 5.3 The offset bend (two hits, flipped between)

Bend shape gains a third choice: **Sharp · Round · Offset**.

- Fields: **Offset (mm)** — the step between the two faces — and the bend
  angle (each of the two bends; the existing field). Flip sheet says which
  way the step goes.
- The two lines: line A is the punch line the station has (gauge edge and L,
  or two points). Line B lies `spacing` nearer the backgauge side. For bend
  numbers r, K, BA at angle A (radians a), sheet t, ρ = r + t / 2:
  web w = (offset − 2 ρ (1 − cos a)) / sin a; spacing = w + BA. The step is
  measured between the two faces on the same side of the sheet (outside to
  outside it is offset + t).
- **One press of Bend makes both hits**: hit one, the sheet turns over, hit
  two; then two ordinary bend records are committed, in the order made (no
  new model key; the `BRAKE` table stays STROKE → DONE once, as a round
  bend's hits do).
- **The order is chosen for the user**: A then B (A's side hangs in front for
  the second hit, as in the user's diagram); when that order is refused and B
  then A clears, B then A is used and the panel says so ("Made the other way
  round: the shorter side hangs down."). When neither clears, nothing is
  made and the card says which hit, why, and what would work (§5.4).
- Before the pedal the panel shows: Spacing, Web, the backgauge reading of
  each hit, the force, both hits' checks. An offset too small (the web too
  short for the die, or the bent side meeting the die's body) says the
  smallest offset this die makes at this angle — found by trying, since both
  limits count — and, when another catalogue die makes the offset asked for
  (checked), offers that die as the fix.
- The flat-blank card draws both lines (the pending pair).

### 5.4 Advice for a side that hangs down

When the part that hits the bed or the die hangs from a neighbouring bend
made the other way (a back-to-back pair), the message gives the facts and
only remedies that were checked:

"Bend 2: the 100 mm side hangs down beside the die and meets the bed (the
V10 88° die stands 80 mm above it). Bend the other one first, so the 60 mm
side hangs instead." — offered when that order clears; else "Neither order
clears: shorten the side that hangs to under 80 mm, or make the step at
least N mm so it hangs clear of the bed." (N found by trying.)

### 5.5 Acceptance

SPCC t 1.5, automatic tooling, 50 t × 2 m press, blanks 100 mm wide.

| Case                                                                             | Expected                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 300 long, gauge edge the right end, L 200, Offset 6.35, 45°, up                  | spacing 8.79667, web 7.03345, second hit at L 191.20333; two records (up 45°, down 45°); folded height 7.85; both hits clear; made A then B                                     |
| 260 long, line A 60 from the left end (gauged off the right end), Offset 20, 90° | spacing 18.82646; A then B clears                                                                                                                                               |
| 260 long, gauged off the LEFT end with line B 60 from it, Offset 20, 90°         | A then B is refused, B then A clears: made B then A, and the panel says so                                                                                                      |
| 300 long, line A 100 from the left end, Offset 20, 90°                           | refused both ways with the §5.4 message; Offset 40 clears                                                                                                                       |
| 260 long, line A 60 from the left end, Offset 5, 45°, automatic die              | refused (the web is short of the V10 die's 6.61 mm leg); fix "Use the V6 88° die" → both hits clear                                                                             |
| the same, Offset 4                                                               | refused, and no die is offered: with the V6 die the bent side meets the die's body; the card says the smallest offset that works at 45° (probe: between 4 and 5 mm with the V6) |

Also: Flip and Turn work on ordinary hits as described; a model made before
this loads and behaves the same; every earlier test passes unchanged except
expectations this section changes, each listed.
`scripts/verify-brake-flip-bt2.mjs`: the first row through the station with
screenshots of the flip mid-turn, the second hit with the first bend hanging
down (3D and side view) and the finished step; then the Turn sheet around
button on a collision card. Screenshots to `artifacts/sketch-cad/brake-flip-bt2`.

### 5.6 Carried over from the BT-1 audit

- **The R10 radius punch cannot make a 90° bend.** Measured 2026-11-14: SPCC
  t 1.5, 300 × 100, line at 150, `radius-10` in its automatic V32 60° die:
  "hits the punch at 86.3°" (R15 – R30 clear at 90° and 92°). Cause: its
  section (`punchSection`, round-bend spec §12.8) puts the 41 mm wide holder
  as a square block 14.3 mm above the tip, and a wing at 43° meets its
  corner. Read the HH-015 / HH-016 holders' real outline from the Amada High
  Tonnage PDF's drawing (the way BT-1 read the gooseneck from its catalogue's
  vector drawing, §10) and draw it; every radius punch must then clear a
  plain bend up to its die's limit, either way round. Whatever cannot be read
  stays schematic and says so.
- **The picker's verdict on a card** then reads "Clears this hit" for R10 on
  that bend.

## 6. Guide

`docs/sheet-metal-shop-guide.md`, section 3 · Bend: a "Blades" part (BT-1)
and "Flipping, turning and offset bends" (BT-2), each short, with the limits
(the bed and the die height decide what can hang down; a tight joggle needs
offset tooling, which the shop does not have here).

## 7. Sources and confidence

- The two-hit offset with the sheet flipped is the user's own diagram.
- The bed's 30 mm half-width and the 80 mm die height are the simulator's
  existing schematic values (`shopCatalog.js`), not a particular machine's.
- Gooseneck sizes: to be recorded by BT-1's builder with their source.

## 8. Phases and builder rules

BT-1 → BT-2, one run each. Rules: those of `docs/sketch-studio-round-bend.md`
§9 (no `CAD_VERSION` bump, worker-safe pure modules, match the surrounding
code, vitest from the repository root, the dev server on port 5180 stopped
and the port confirmed free, no git state changes, pinned labels kept, every
changed expectation listed). Full `npm test`, `npm run lint`, `npm run build`
green and all twelve existing verify scripts passing. Each phase appends its
"as built" section here.

## 9. Not in scope

Offset (joggle) tooling that makes both bends in one stroke; hemming and
flattening tools; a die riser or die holder; a punch catalogue beyond what a
read catalogue row supports; storing which way round a hit was made.

## 10. BT-1 as built (2026-11-14)

All under `src/features/sketchstudio/cad/` unless named. No model key, no
`CAD_VERSION` change, no solver or kernel change.

**The catalogue** (`shopCatalog.js`). Every `PUNCHES` and `DIES` entry gains
`use` (the picker's plain line; the dies by family: 88°, 30°, 60°). The
gooseneck is now a catalogue row, read from the Tecnostamp "Red Line –
Amada-Promecam Style" PDF (the SF-3 source, pilses.com …
utillaje-amada-promecam.pdf, p. 15): `gooseneck-88` = code 11.147 (88°, R0.80,
H 104.50, 50 t/m: `radius` 0.6 → 0.8, `height` 95 → 104.5, `load` 500 kept),
and a new `gooseneck-88-deep` ("Gooseneck 88° deep") = code 11.148 (88°,
R0.80, H 145.00, 70 t/m). The PDF's text gives only the table rows; the
shapes were read from the PDF's own vector drawings (PyMuPDF in a scratch
virtualenv; each drawing scaled by its printed H and head width, which agree
to 0.1 %) and stored as `outline: { flank, back, front }` in the section
frame (mm from the tip, +y the backgauge side, the throat to the operator).
`punchSection(punch, reverse = false)` draws an `outline` punch as the tip
arc, the back flank to `flank.back`, the back of the body to the shoulder,
the front of the head down round the throat to `flank.front`; `reverse`
mirrors any section (kept counter-clockwise). New `punchSymmetric(punch)`.

|                       | 11.147 (`gooseneck-88`)                            | 11.148 (`gooseneck-88-deep`)                |
| --------------------- | -------------------------------------------------- | ------------------------------------------- |
| back flank ends at    | y 6.95                                             | y 7.4 (then 8.6, 9.5)                       |
| back of the body      | (49.0, 53.4) → (49.0, 92.5) → (37.0, 104.5)        | (68.0, 74.3) → (68.0, 125.1) → (48.0, 145)  |
| head, front           | (−6.0, 104.5), (−7.0, 103.5), (−7.0, 94.8)         | (−6.0, 145), (−7.0, 144.1), (−7.0, 132.1)   |
| throat (top → bottom) | (14.5, 73.3) … deepest (20.3, 59.2) … (17.6, 49.2) | (23.5, 101.6) … (29.3, 88.4) … (27.3, 78.7) |
| neck front to flank   | (−6.0, 8.2)                                        | (−7.0, 8.4)                                 |

The throat curves are the drawing's Bézier sampled at fifths. The back rises
at 47.5° from the tip (1.5° above a 46° wing), the front flank is the 44°
tip flank, so both clear a wing at the 88° die's limit. **Schematic**: the
13 mm tang (it sits 13.5 mm behind the tip in the catalogue; the
simulator's holders stay centred on the punch line, as for every punch) and
a 0.35 mm step at the foot of the back flank. Also read on the same page,
not acted on: the tall punch 11.228 is drawn with a front relief, not the
straight blade SF-3 assumed; no row is labelled a sash punch, so none was
added.

**The collision check** (`brakeCollisions.js`). `toolingSections` and
`brakeCollisions` take `reverse`. The return sweep now lifts the punch,
holders and ram only as far as the stroke does (`t + STROKE_GAP` above the
die, `BUMP_GAP` between a round bend's hits) instead of out of sight: with
the throat's neck under a flange standing in it, the unlimited sweep refused
every return flange ("as the ram goes back up"), which is not what a shop
sees (the part is taken off forward at the top of the return). No existing
test or verify outcome changed with it. New export `ADVISED_PUNCH` (tool →
the punch its advice names: punch and ram → gooseneck, holder → tall
straight, with the button label).

**The station** (`brakeStation.js`). Session `reverse: false`; exports
`punchChoice(session, key)` (the Punch select's rule, now shared with the
picker), `punchReversed(session)`, `bladeOptions({ model, session, params,
kind })` (the pending hit tried with every punch or die: `{ key, patch,
error, refusals, collision }`). `brakeStation(…, advise = true)`: the pending
collision is checked with the punch reversed when the session says so, and
carries `fix: { label, session }` when its advice names a punch and the hit
made with it passes every check (tried with a second `brakeStation`, the
throat to the operator first, then reversed — "Use the gooseneck punch,
reversed"; a reversed punch is first tried turned back, "Turn the punch
round"). The view carries `reverse`; `shopLayer.js` draws the mirrored punch
in the 3D scene and the side view ("Gooseneck 88° punch (reversed) · …"),
and `cadShop().station` adds `reverse`, `punchDrawn`, `dieDrawn`.
`sequenceChecks` is unchanged: a stored step already passes either way
round, and the sheet turned round with the punch as it was is the mirror of
the punch reversed.

**The panel** (`PressBrakePanel.jsx`, `cad.css`). The **Blades** row (group
"Blades") sits after the angle and Bend shape, before Machine and tooling:
buttons "Top: punch" and "Bottom: die" with the silhouette, the name and
"tip R0.8" / "nose R30" or "V 10 mm (automatic)". A click opens the picker
(region "Punches" / "Dies", Close): cards named by the tool, one common view
box per kind, the numbers, `use`, "· in use", and with a hit pending "Clears
this hit" or "Refused: …" (the first refusal's fact); a refused tool stays
choosable; choosing closes the picker. **Reverse punch** (checkbox) shows for
a punch that is not its own mirror; the summary then reads "… punch
(reversed)". The Punch select applies `punchChoice` (same patches as
before). The collision card shows the fix button. `ShopFloor.jsx` exports
`splitMessage`. `CadWorkspace.jsx` passes `bladeOptions` (a `useCallback`,
computed only while a picker is open).

**Measured.** §4.4 item 1: all four cases clear with either gooseneck, gauged
off either end, normal and reversed (8 checks per case; 3 – 9 ms each).
Item 2: the U channel (115 × 60, 45 flange, line 20 in from the right end)
hits the straight, sharp and tall punches ("Bend 2: the part hits the punch
at 74.5°" on the straight), clears both goosenecks, is refused with the
gooseneck reversed; the card's "Use the gooseneck punch" passes it. The
`verify-fab-shop-sm2` collision (a web bent between two standing flanges)
is not that case: it hits the gooseneck too (at 23.6°, reversed 11.2°) —
one flange swings in from each side — so it has no button. The holder
advice: a 48 flange on a 60 web hits the straight punch's holders; "Use the
tall straight punch" clears it. U channels with a 50 web: the gooseneck
clears flanges up to 60 mm (80: the punch at 57.2°; 100 and 130: the
holders), the deep one up to 45 (60, 80: lifted by its neck on the return;
100: the punch at 68.7°). `bladeOptions` costs 0.2 s for the punches and
0.27 s for the dies on the channel (jsdom, cold). At 1366 × 768 (the verify
script): the pane is 260 px wide; the Blades row is 70 px tall, two 117 px
buttons; with the angle scrolled to the top of the pane the angle (165–193),
Bend shape (215–243) and Blades (255–325) sit above the pinned footer (from
593, the pedal 602–642); the open picker starts below the row (331) and
moves nothing above it; punch cards 93 px tall, 11 of them. The pane already
scrolled 22 px sideways before BT-1 (the shell footer's −10 px margins); the
Blades row and the picker stay inside it.

**Tests.** `brakeBlades.test.js` (19), `PressBrakePanel.blades.dom.test.jsx`
(8), one test in `CadWorkspace.brake.dom.test.jsx`. Changed expectations:
`shopCatalog.test.js` the gooseneck's height 95 → 104.5 and its relief points
([−3, 20], [27, 35] → the throat (20.3, 59.2), the back (49, 53.4) and the
mirrored section); `pressBrake.test.js` its height 95 → 104.5 and the side
view window for it 57 → 61 (reach 45 → 49). `scripts/verify-brake-blades-bt1.mjs`,
screenshots in `artifacts/sketch-cad/brake-blades-bt1`. The guide's Bend
section gains **Blades**; its Limits line on the gooseneck is corrected.

## 11. BT-2 as built (2026-11-14)

All under `src/features/sketchstudio/cad/` unless named. No model key, no
`CAD_VERSION` change, no solver or kernel change: an offset commits two
ordinary bend records.

**Flip sheet** (§5.1). `session.flip` is still the fact. `PressBrakePanel.jsx`
`FlipControl`: one `<input type="checkbox" role="switch" aria-label="Flip
sheet">` under a label drawn as two states, **This side up · Flipped over**
(the one on, highlighted), on the angle's row (`.cad-brake-angle`: the angle
field gives up width, 93 px, for the 142 px control in the 260 px pane). The
view (`brakeStation.js` `stationView`) carries `flipped` (the session's flip)
and `turned`. `shopLayer.js`: every pose records which side is up (the bend
in the die's direction, else the view's `flipped`; `pressBrake.js`
`flatFrame(fold, { flipped })` lays a blank with no line the other way up);
when it changes between two poses of one station the part **turns over**
(`TURN_MS` 500, `pressBrake.js`): the rotation slerped about the part's own
centre while the centre is drawn out toward the operator (its bounding
radius + max(30, half the die's width) + 15 mm) and lifted (0.35 × radius +
20 mm), clear of the punch and the die, then set down on the new pose; the
punch line and a shown collision wait for it to land; a pick mid-turn
retargets it. A re-run of a step lying the other way up turns over first
(not on a replay's clock). `BrakeSideView.jsx`: a badge in the caption,
"This side up" / "Flipped over" (`aria-label` "Side up"), and the Ram readout
"Turning the sheet over". `state().station` adds `flipped`, `turned`,
`turning`, `part` (the offset's hit under way) and `lastTurn` (frames, mean,
worst, ms); `lastStroke` adds `turn` for an offset.

**Turn sheet around** (§5.2). `brakeStation.js` exports `oppositeEdge(edges,
edge, point)` (parallel, facing the other way, the line inside it; the
farthest of several) and `turnAround(station, session)`: with a gauge edge,
`{ edge, distance (to 1e-6), turned: false }` to the same line; with none
opposite, or a two-point line, `{ turned: !turned }`. Session `turned`
(default false): the pending collision, the pose (`machineFrom`,
`brakeFrame`) and the stroke use it; with a gauge edge and `turned` the hit
is not gauged ("Turned around: the gauge edge faces the operator, and no
straight edge opposite it can go to the backgauge."). `CadWorkspace.jsx`
`changeBrake`: a new line (edge, L, points, mode) resets `turned` as it
resets `skip`. The panel's **Turn sheet around** button sits under the line
fields (disabled with no line), with the note "Turned around: the other side
to the backgauge." while `turned`. The collision card no longer appends
"Turned around … it clears.": when `turnedClears`, the station tries the
whole hit with `turnAround`'s patch (every refusal and the collision) and
only then gives the card a second button, **Turn the sheet around**
(`pending.collision.turn`), beside any punch fix.

**The offset bend** (§5.3). Bend shape **Sharp · Round · Offset** (Offset
puts the straight punch back from a radius punch, as Sharp does); session
`shape: 'offset'`, `offset` (default 10). `offsetSpacing({ offset, angle,
radius, allowance, thickness })` → { web, spacing, rho } (the §5.3 formula,
ρ = r + t/2, with the bend's own r and BA as folded). The station
(`offsetPair`, `offsetPending`, `offsetProblem`, private): line A is the
station's line (one tab: a line over several tabs is refused, "an offset is
made on one at a time"), its numbers from A folded alone; line B is
`spacing` toward the side of A that `backSide` sends to the backgauge (the
gauge point and `turned`); A is up (down with Flip sheet), B the other way.
Each order is tried as the machine would make it: hit one folded alone, hit
two folded after it (the first at its angle), each with `assessBend` (gauged
as below) and `brakeCollisions` (facts only). Gauging: the session's edge
when it bounds a face beside the line, else the opposite edge (the sheet
turned around for that hit, shown "(turned)"), else none. A then B is made
when it clears; else B then A when that clears, with the note "Made the
other way round: the shorter side hangs down." ("… line B first." when the
side that hangs is not the shorter); else nothing is made (`pending.pair`
null) and the card says why: a step too small (the web short of the die's
leg, the side bent first meeting the die's body, or the two zones
overlapping) gets "Offset N mm at A° is too small for the D die: why. The
smallest it makes at A° is M mm." plus the nearest catalogue die (same angle
first, then by V) that makes it, tried, as the fix, else the smallest offset
a smaller die of that angle makes; a side hanging into the bed gets the §5.4
message with the shorter side and the larger step; anything else its fact
and "Neither order clears.". A refusal's own fix stays a button only when
the offset made with it clears. `pending` for an offset: hit one's readouts
(the force), both hits' warnings, `offset` { offset, angle, spacing, web,
order, note, hits: [{ label, line, direction, distance, reason, around, ok,
problem }], lines: [A, B with their segments] }, `pair` (the two hits to
make), `view` (hit one flat on the die, or the hit a collision is in, at its
angle). The searches (smallest offset, dies, step) run only with `advise`:
a blade card or a remedy being tried gets the facts. The panel shows
**Offset results** (Spacing, Web, Hit 1, Hit 2 — "Line A UP · L 200 ·
clear" — and Force) in place of the flange and other leg, the order note,
and "Both hits clear: …". `FlatPatternMap.jsx` draws line B ("Second line",
dotted) beside the punch line. `startStroke` (private `startOffset`): two
records with fresh ids, in the order made, no `stroke` key; `run.hits` (each
hit's pose: bend ids, the second flat during the first, gauge point,
`turned`, L) and `pressBrake.js` `pairTimeline(first, second, turn =
TURN_MS)`, which `strokeAt` plays as hit one, phase `'turn'` (`turn` 0 … 1,
the ram parked), hit two (`part` 0 / 1). `shopLayer.js` poses each hit from
its own view, plans the turn once (the first hit made → the second line on
the die) and counts the turn's frames apart. The commit is one model commit
of both records; the last-hit view is the second.

**Advice for a side that hangs** (§5.4). `brakeCollisions.js`: a bed or die
collision whose culprit bend is parallel to the one being made, made the
other way, the two sharing a piece (the web), is a back-to-back pair. The
hit carries `hanging` { prefix, tool, side (the flat length of the side
that hangs, beyond the culprit), other (this bend's far side), bendId, die,
otherFirst, broken, shorten, advised } and `hangingMessage(hanging, { step })`
words it: "Bend 2: the 100 mm side hangs down beside the die and meets the
bed (the V10 88° die stands 80 mm above it)." (the die: "… hangs down and
meets the die's body (the V10 88° die is 18 mm wide).") then "Bend the other
one first, so the 60 mm side hangs instead." only when tried (this hit with
the other flat, then the other with this made, each passing `assessBend` and
clearing either way round, and not breaking a stroke of several tabs), else
"Neither order clears: shorten the side that hangs to S mm or less, or make
the step at least N mm so it hangs clear of the bed." with each clause only
when found by trying: S by halving the side's length between the shortest
leg its die carries and its length, on the part's surface cut there
(`shortenedSurface`); N by the station (for two bends of one angle, this
line moved away from the other; for an offset, a larger offset).
`brakeCollisions({ advise })`: false gives the facts only (the blade cards,
the turned-around check, remedies being tried); 'shorten' skips the other
order (an offset has tried it itself). "Flip the sheet" and "bend this one
before" are not said for a pair; every other collision's advice is as
before.

**The radius punch holders** (§5.6). Read from the Amada High Tonnage PDF
(2021, p. 4: HH-015 and HH-016), from its own vector drawings with PyMuPDF
(the same copy RB-2 read the text of). `shopCatalog.js` `RADIUS_HOLDERS` {
key, height, width, outline } and each radius punch's `holderOutline`. Each
drawing is scaled across by its printed 41 mm and up by its printed height:
the HH-015's two scales agree to 0.4 %; the HH-016 drawing is 5 % wider
than its 41 mm, so its axes are scaled apart (medium confidence). Right
half, mm, z up from the foot's tips (the ruler hangs below them):

|                                         | HH-015 (100 high)                              | HH-016 (103.5 high)                                 |
| --------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| foot, outer bottom corner               | (12.86, 0)                                     | (20.0, 0), (20.5, 0.55)                             |
| foot, outer chamfer                     | (19.52, 12.33), (19.52, 20.33), (12.38, 27.96) | (20.5, 23.56), (13.05, 31.02)                       |
| neck                                    | (13.0, 27.96) to (13.0, 72.67)                 | (13.05, 31.02) to (13.05, 76.03)                    |
| head                                    | (20.5, 80.13) to (20.5, 100)                   | (20.5, 83.49) to (20.5, 103.5)                      |
| V cradle (filled: the ruler sits in it) | (11.9, 0), (0, 7.34)                           | (18.59, 0), (12.53, 3.64), (4.47, 8.19), (0, 10.73) |

`punchSection` of a radius punch: the ruler's circle (radius R about (0, R))
from where it crosses the foot's level (z = height − holder height) on one
side, round the bottom, to the other, then the holder's outline up and down
its mirror. Checks of the reading: the HH-015 drawing carries five circles
in its cradle, 19.9, 24.9, 29.9, 34.9 and 39.9 mm across (R10, R12.5, R15,
R17.5, R20), which confirms the R15 and R20 on the HH-015 (RB-2's
assumption); the R10's centre is drawn 4.0 mm below the foot's tips (the
catalogue's heights give 4.33) and the R20's 15.6 (15.9); the cradle's sides
lie 9.9, 14.8 and 19.8 mm from the R10, R15 and R20 centres, the HH-016's
25.2 and 30.2 from the R25 and R30 (tangent within 0.25 mm). **Schematic**:
the 1 mm chamfer each drawing puts on one shoulder corner only (the section
stays its own mirror, so Reverse punch does not show for it); the tang above
the shoulder (in no section). Outcome: the R10 in its automatic V32 60° die,
300 × 100 at 150, clears at 90° (was "hits the punch at 86.3°"), and every
radius punch clears 90° and its die's limit (120° for the 60° dies) either
way round; its picker card reads "Clears this hit".

**Measured** (vitest and the verify script). §5.5, SPCC t 1.5, automatic
tooling, 50 t × 2 m press:

| Case                                                  | As built                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 300, right end, L 200, 6.35, 45°, up                  | spacing 8.79667, web 7.03345; hit 1 L 200, hit 2 L 191.20333; made A then B; records up 45°, down 45° (no shared stroke); folded 297.737 × 100 × 7.85; sequence clear                                                                                                                                                                     |
| 260, A 60 from the left (right end, L 200), 20, 90°   | spacing **18.82644** (§5.5 prints 18.82646: BA = 2.245 · π/2 = 3.526438); hit 2 L 181.17356; made A then B                                                                                                                                                                                                                                |
| 260, left end, B 60 from it (L 60 + spacing), 20, 90° | A then B refused (the 181 mm side in the bed, tried again as two ordinary hits); made B then A, "Made the other way round: the shorter side hangs down."; hit 1 (B) L 60; hit 2 (A) gauged off the right end, L 181.17354 "(turned)"                                                                                                      |
| 300, A 100 from the left, 20, 90°                     | refused both ways: "Bend 2: the 100 mm side hangs down beside the die and meets the bed (the V10 88° die stands 80 mm above it). Neither order clears: shorten the side that hangs to 79.9 mm or less, or make the step at least 30.6 mm so it hangs clear of the bed."; 30.6 and 40 clear, 30 does not; a 279.9 blank (side 79.9) clears |
| 260, A 60 from the left, 5, 45°                       | refused: "Offset 5 mm at 45° is too small for the V10 88° die: the web leaves 6.01 mm beside the punch line; the die needs 6.61 mm to carry it. The smallest it makes at 45° is 5.9 mm. The V8 88° die makes 5 mm."; fix **Use the V8 88° die** → both hits clear (the V6 clears too)                                                     |
| the same, 4                                           | refused, no die offered: "… the web leaves 4.59 mm … The smallest it makes at 45° is 5.9 mm. The V6 88° die makes 4.5 mm and up."; with the V6 at 4: "… too small for the V6 88° die: the side bent first meets the die's body."; 4.5 clears, 4.4 does not                                                                                |

The same pairs made by hand as ordinary hits give the same §5.4 numbers
(79.9, 30.6), and B made first, then A off the left end, reads "Bend 2: the
181.2 mm side hangs down … Bend the other one first, so the 60 mm side hangs
instead." (tried: that order clears). Station time (node, cold): a clearing
offset 9 – 60 ms; refused, with the searches, 110 – 280 ms (row 6 the
slowest: three dies searched). Headless Chrome at 1366 × 768: a Flip sheet
turn 503 – 506 ms, 73 – 74 frames, frame work mean 0.78 – 0.94 ms, worst 1.2
– 2.0 ms; the offset's stroke 2.84 s, 407 – 409 frames, mean 1.25 – 1.41
ms, worst 2.2 – 3.1 ms, its turn 71 – 72 frames, mean 0.78 – 0.90 ms, worst
1.6 – 2.5 ms. Layout: angle 1117 – 1210, Flip sheet 1214 – 1356 on the same
row inside the 260 px pane, Bend shape below; the pedal stays in the pinned
footer.

**Tests.** `brakeFlip.test.js` (27), `PressBrakePanel.flip.dom.test.jsx` (10),
one test in `CadWorkspace.brake.dom.test.jsx`. Changed expectation:
`radiusPunch.test.js` "draws a radius punch …": the ring held `[R, height −
holder height]` (the ruler's side meeting a square holder); it now holds
`[holderOutline[0][0], height − holder height]` (the foot's corner as
drawn). No collision outcome of an existing test or verify script changed
(the face frame's crease-first steps keep their advice: its side flanges are
not parallel to the crease, its top and bottom flanges clear).
`scripts/verify-brake-flip-bt2.mjs`, screenshots in
`artifacts/sketch-cad/brake-flip-bt2`. The guide's Bend section gains
**Flipping, turning and offset bends**; `docs/state-machines.md` notes the
offset's two hits inside one `STROKE`.

**BT-2 follow-up (after the audit).** Two fixes.

_The advice waits for the line to be still._ The punch-line drag sets L per
0.1 mm, and a refused offset ran its searches on every move (smallest
offset, dies, step, shorter side). `CadWorkspace.jsx` now keeps two
stations: the facts, `brakeStation({ advise: false })`, on every pick (the
lines, the spacing and web, each hit's clear or refused state, the pose and
the collision's fact alone), and the advice, `brakeStation()` with every
trial and search, worked out once the session has been still for
`LIVE_DEBOUNCE_MS` (150 ms, the live fields' settle) and shown only for the
very session, model and parameters it was worked out on (so a card never
shows a remedy for another position). New export `needsAdvice(station)`:
only a collision or a refused offset can differ, so anything else is the
facts at once. The viewport always poses from the facts (the advice
arriving moves nothing). Bend pressed before the advice has settled works it
out then, says the refusal with it and shows it on the card. With `advise`
false a collision's message is its fact alone (`brakeCollisions`), and an
offset's refusals carry no searched figure or fix. Measured in headless
Chrome (verify script step 6: line A dragged from L 250 to L 50 on 300 ×
100, 100 moves, pointer move → flat blank redrawn): Offset 20 at 90°
(mostly refused) before mean 93.7 ms, median 127, worst 161; after (two
runs) mean 24.0 – 29.7, median 16.9 – 34.0, worst 44.2 – 48.9; a clearing
offset (6.35 at 45°) in the same runs mean 21.6 – 25.0, median 13.8 – 17.2,
worst 40.8 – 44.2. The §5.5 rows
4 – 6 advice is unchanged once settled (unit tests; row 4 also in the
verify script after the drag).

_The collision advice says what was tried._ For the pending hit, a
collision with the punch, its holders or the ram is reworded from what the
station tried (`triedAdvice`, `punchFix` now returns { fix, tried }): "Bend
this one earlier (…)" (general, not tried), then only the remedies that
pass, as their buttons say ("turn the sheet around", "use the gooseneck
punch", "turn the punch round", "use the tall straight punch: it holds the
clamps higher"), then what was tried and does not pass: "Turning the sheet
around and the gooseneck punch either way round were tried: neither
clears." The general advice a stored step gets (`brakeCollisions` ADVICE,
shown by `sequenceChecks`, which refuses a step only when both ways round
collide) no longer says "turn the sheet around": "Bend this one earlier
(before the flange in the way), or use the gooseneck punch." New export
`EARLIER`. The die, bed and self advice and the §5.4 pair wording are
unchanged. Changed expectations: `brakeBlades.test.js` (the U channel's
punch message), `brakeCollisions.test.js` (the holder and ram messages: ",
turn the sheet around," dropped), `PressBrakePanel.blades.dom.test.jsx`
(the card: "…, or use the gooseneck punch. Turning the sheet around was
tried: it does not clear."), `CadWorkspace.brake.dom.test.jsx` (the punch
fix and Turn the punch round buttons arrive after the 150 ms settle: the
test waits for it, and now checks the fact first, the advice after, and the
pedal's refusal before the settle). Tests added: six in `brakeFlip.test.js`.
The guide's Bend section says what the card tries and that the advice
follows the line.
