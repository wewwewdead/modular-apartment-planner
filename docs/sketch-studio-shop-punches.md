# Sketch Studio press brake: the shop's own punches, and taking a part off a gooseneck

Status: spec, 2026-11-16. Follows `docs/sketch-studio-tight-bends.md` (TB-1
bend on, TB-2 the brake finds the way; its §6 question 1 is answered here),
`…-brake-flip-tooling.md` (BT-1 blades, the return rule), `…-brake-tool-length.md`,
`…-fab-shop.md` §8 (all built). Two phases, one builder run each, audited
between:

- **SP-1** — the shop's four punches in the rack with their real sections;
  the part is taken off the punch along a slant when a straight lift would
  catch it; the card tries every punch in the rack; the punch stays in the
  machine (§5). **BUILT + audited** 2026-11-16, uncommitted (as built: §5.9;
  the audit: §5.10).
- **SP-2** — a hit that only goes in when an EARLIER bend is made with
  another punch is found and offered; 45° is the part-way angle tried first;
  the card's punch tries are quicker (§6, refined 2026-11-16 after SP-1's
  audit). **BUILT + audited** 2026-11-16, uncommitted (as built: §6.8; the
  audit: §6.9).

`CAD_VERSION` stays 1. No new model key.

## 1. What the user said

"Here's the blades or the punch we use in our company [photo]. How can we add
this into our bending shop so that we can bend multiple bends and achieve
tight spaces, given that we can bend 45° and add another one later to
complete 90°."

The photo: the tool chart taped to their press brake ("… SPECIAL KNIVES CO.,
LTD", sheet 27): four punch profiles **A 101, A 102, A 103, A 108**, each
dimensioned 125 and drawn against a 60 × 50 grid tilted 45° from the tip.

## 2. The chart, as read (2026-11-16)

- **The grid is the punch's room for a return flange.** At the bottom of a 90°
  bend both legs stand at 45° from the tip. One grid axis (0 – 60) runs along
  one leg: the WEB. The other (0 – 50) stands square to it: the RETURN flange
  already bent at the web's end. A grid cell (web `a`, return `b`) clear of
  the punch body means: that return on that web closes round this punch.
  In the section frame (y across, z up, tip at 0): the return's end is at
  y = ±(b − a)/√2, z = (a + b)/√2.
- **The numbers** (photo rectified with one homography fitted on all four
  grids, 303 lattice points, 0.05 – 0.09 mm rms on three drawings, 0.30 on
  A 102, which lies at the sheet's curled corner): total height 124.3 – 124.9
  (printed 125); clamp shoulder at 95.0; tang 13.0 wide, its face 6.8 – 7.0
  behind the tip line, 30 high; block face 7.0 – 7.1 in front of the tip
  line. These are the Promecam standard (13 / 7 / 30), so the scale holds.
  Outline accuracy: about ±0.3 mm in the grid's reach, ±1 mm above it.
- **The four tools** (`height` is tip to clamp shoulder, 125 − 30 = 95, as
  every punch in `shopCatalog.js`):
  - **A 101**: 88° gooseneck. Blade 12.1 thick, standing 2.8 – 14.9 behind
    the tip line; a nose 3.85 forward of the tip. Open in front up to the
    block (z 75).
  - **A 102**: the same body with a 10.3 blade (4.6 – 14.9) and a finer nose
    (2.3 forward).
  - **A 103**: 30° blade (flanks 15° – 16° each side), hollowed in front
    (to 0.3 behind the tip line at z 40 – 45), its back a straight 16° line
    out to 20 at z 74.
  - **A 108**: 88° swan neck, 20 deep behind the tip, hollowed in front on an
    arc of about R 62 (4.2 behind the tip line at z 35 – 40).
- Not readable on the photo, assumed (§8 asks): tip angle of the three
  goosenecks (flanks measure 42° – 46°, taken as the standard 88°), tip radii
  (0.8; A 103 0.6), load per metre (500 kN/m, what Tecnostamp gives its like
  tools). The fourth label is "A 108" (the user, §8).

## 3. What happens today (code read and probed 2026-11-16)

Probes ran the brake's own `brakeCollisions` (50 t × 2 m, automatic die,
SPCC t 1.2) with the four sections of §5.1 passed as punch entries, on a
scratch copy for the rule change of §5.3.

- **The rack.** `PUNCHES` (shopCatalog.js) holds two straight, a tall
  straight, two Tecnostamp goosenecks, an acute and five radius punches. A
  gooseneck is an `outline` (`flank`, `back`, `front`) that `punchSection`
  turns into the ring the 3D scene, the picker and the collision check all
  use. The four sections of §5.1 drop into that format unchanged: rings
  simple and counter-clockwise, and 240 plain 90° bends (t 1.2 / 2.0 / 3.2,
  lines 15 – 185 mm in, each punch, both ways round, either side back) all
  clear. The A 103 clears 120° – 150° in the V8 30° die, as the Acute 30°.
- **The return is a straight lift, and that is what refuses return flanges.**
  After the stroke the upper tools are swept 40 mm straight up
  (`STROKE_GAP`, brake blades §4.2) and anything they meet is "the part hits
  the punch as the ram goes back up". A return flange standing over a
  gooseneck's nose is always met. So today the brake passes a return only
  when it is SHORTER than its web, with every punch, and the chart's whole
  band (return = web, return = web + 5) is refused:

  | Lip made first, then the inner bend (A 101) | chart | today                | with §5.3 |
  | ------------------------------------------- | ----- | -------------------- | --------- |
  | web 15, return 10                           | fits  | clears               | clears    |
  | web 15, return 15                           | fits  | refused (the return) | clears    |
  | web 10, return 10                           | fits  | refused (the return) | clears    |
  | web 15, return 20                           | no    | refused              | refused   |

  With §5.3 the brake's verdict equals the chart cell for cell on an 8 × 7
  grid of webs and returns (56 cells each) for A 101, A 102 and A 108; on
  A 103 it differs in two cells that lie within 0.3 mm of the outline (§5.8
  table). The chart side of that comparison is the photo's own geometry: a
  thin return from (a, 0) to (a, b) in the grid, clear of the outline.

- **The advice knows one punch.** A punch or holder hit tries
  `ADVISED_PUNCH` (`gooseneck-88`, `straight-88-tall`) only; a ram hit tries
  the taller punches of the same angle (`tallerPunches`, brakeStation.js).
  `NO_WAY` then says "the shape cannot be closed with the tools in this
  rack", which the other punches were never asked.
- **A new station visit starts with `straight-88`** (`brakeSessionDefaults`);
  `brakeCarry` keeps the punch only between parts of one visit.
- **TB-2's "nothing passes" case passes.** Lip 15 / web 15 on the 605.4 ×
  420.4 blank (tight bends §5.3 step 3): with §5.3, the lip first and then
  the inner bend clears with A 101, A 102, A 108 and the catalogue gooseneck
  (the punch turned round, or the sheet). Lip 20 / web 10 is the case where
  nothing passes: every punch, both orders, every part-way angle.
- **The user's 45° + 45° on their screenshot part** (lip 11 / web 18, the
  576 mm body): inner 45°, the lip to 90°, inner on to 90° still meets the
  ram near 80° with every punch — the body swings upright 13 mm from the
  punch line as the lip closes. Inner 30° or 15° first passes, and so does
  the lip first, with A 101, A 102 and A 108 as with the straight punch. The
  punches change what returns close; they do not change that part.

## 4. The reasoning

The chart on the machine is the shop's own truth about what closes. Three
things keep the brake from agreeing with it, and each is fixed where it is
wrong, not papered over:

1. the tools are not in the rack (data);
2. the brake lifts the punch straight out of a part that, on the real
   machine, is drawn off the nose — the nose leans at 45° exactly so that it
   can be (physics);
3. the card recommends one catalogue punch and never tries the others
   (search).

Bending on (TB-1) and the order / part-way tries (TB-2) then work with the
real shapes with no change of their own.

## 5. SP-1

### 5.1 The four punches (`shopCatalog.js`)

Added to `PUNCHES`, each `{ key, name, angle, radius, height: 95, load: 500,
rack: 'shop', use, outline }`, in `punchSection`'s frame (mm from the tip,
+y the backgauge side: the body stands behind the tip, the room is in front).
The tang is left out, as for the catalogue goosenecks; the clamps stand
centred on the punch line (the Promecam shoulder bears over the tip).

```js
// A 101 — angle 88, radius 0.8
flank: { back: 5.4, front: 3.85 },
back:  [[5.4, 7.0], [14.9, 18.2], [14.9, 79.7], [20.0, 84.8], [20.0, 95]],
front: [[-6.5, 95], [-7.1, 94.4], [-7.1, 81.0], [2.8, 75.6], [2.8, 15.0], [-3.85, 5.0]],

// A 102 — angle 88, radius 0.8
flank: { back: 5.6, front: 2.3 },
back:  [[5.6, 7.0], [14.9, 18.0], [14.9, 79.7], [20.0, 84.8], [20.0, 95]],
front: [[-6.5, 95], [-7.1, 94.4], [-7.1, 81.0], [4.6, 74.6], [4.6, 14.4], [-2.3, 4.2]],

// A 103 — angle 30, radius 0.6
flank: { back: 5.8, front: 5.3 },
back:  [[5.6, 23.2], [20.0, 73.9], [20.0, 95]],
front: [[-6.5, 95], [-7.1, 94.4], [-7.1, 68.5], [-6.1, 65], [-3.9, 60], [-2.15, 55],
        [-1.0, 50], [-0.35, 45], [-0.3, 40], [-0.9, 35], [-1.95, 30], [-2.85, 26],
        [-3.6, 24], [-4.5, 22], [-5.3, 20.2]],

// A 108 — angle 88, radius 0.8
flank: { back: 7.5, front: 4.5 },
back:  [[7.4, 9.5], [20.0, 25.6], [20.0, 95]],
front: [[-6.5, 95], [-7.0, 94.4], [-7.0, 73.5], [-5.3, 70], [-2.4, 65], [-0.1, 60],
        [1.6, 55], [3.0, 50], [3.8, 45], [4.2, 40], [4.2, 35], [3.9, 30], [3.3, 26],
        [2.3, 22], [1.2, 18], [-0.4, 14], [-2.0, 10], [-3.2, 8], [-4.5, 5.6]],
```

Keys `a101`, `a102`, `a103`, `a108`; names `A 101` … `A 108`. `use`:

- A 101: "Channels and return flanges: a return as long as its web, from a
  10 mm web."
- A 102: "Tighter returns: a return up to 5 mm longer than its web, from a
  10 mm web. A thinner blade than the A 101."
- A 103: "A slim 30° blade: bends past 90° in a 30° die, and narrow parts
  with a return shorter than the web."
- A 108: "A heavy swan neck: a return up to 5 mm longer than its web, from a
  20 mm web."

A comment block over them gives the source (the shop's chart, read from a
photo, §2) and what is assumed (angle, radii, load). `rack: 'shop'` marks
the shop's own tools; every other punch is the catalogue's. Export the rack
order once (`RACK_ORDER` or the like): the shop's four as listed, then the
catalogue punches in today's order; §5.2 and §5.4 read it.

### 5.2 The picker and the selects

- The blade picker (`BladePicker`, PressBrakePanel.jsx) and the Punch select
  list the punches in two groups, **Your shop's punches** first, then
  **Catalogue punches** (headings in the picker, `optgroup`s in the select).
  Everything else on a card is as today (silhouette at the common scale,
  numbers, `use`, the pending hit's verdict).
- `PUNCH_LABELS` gains the four ("Use the A 101 punch", …).
- The job sheet, the bend table and the rows name them by `name`, as any
  punch (no change expected: check).

### 5.3 Taking the part off the punch (`brakeCollisions.js`)

Today's return sweep (`check(goal, 'up')`): each section of the part swept
`lift` mm straight down relative to the punch, the holders and the ram.

New: when that straight sweep meets the punch, the holders or the ram, the
same sweep is tried along a slant, the part travelling `lift × (tan s, −1)`
in (y, z) relative to the upper tools, for `s` in `TAKE_OFF_SLANTS = [−15,
15, −30, 30, −45, 45]` degrees (negative: toward the operator), in that
order. The first slant that is free clears the return. The pose itself, the
approach (the ram comes straight down on a gauged part) and the die and bed
are checked exactly as today. A round bend's hits before the last keep the
straight lift (`BUMP_GAP`: the part is not taken off between them).

- `brakeCollisions` returns `takeOff`: the slant used (degrees), or null
  when the straight lift was free or there is a hit.
- Only when no slant is free is the hit "as the ram goes back up" (words
  unchanged).
- Why this and not more: after the stroke the part is free in the operator's
  hands and the ram is rising, so any straight line down-and-away from the
  punch is a motion the shop really makes; the web lies at 45° at a 90°
  bend, the limit of the fan. Sliding the part off the punch's end is not
  modelled (§5.7).
- Cost: at most six more poses, only on a return the straight lift fails.
  Probe: 7 – 20 ms per hit checked, as today.

The view. A hit that clears on a slant shows a note on the card where
"clears" is said: **"Comes off the punch toward you: the part is drawn off
along the nose as the ram lifts."** ("… toward the backgauge …" for a
positive slant). The stroke carries `takeOff`; during the return phase the
3D stage (`shopLayer.js`, the `at.phase === 'return'` branch) and the side
view (`BrakeSideView.jsx`) slide the part along machine Y by `tan s ×` the
ram's lift so far, so the drawn punch never passes through the drawn part.
View only; the committed pose is today's.

### 5.4 The card tries the rack (`brakeStation.js` `punchFix`)

- **Punch and holder hits**: the candidates are every other sharp punch (not
  round) that is not blunter than the hit's die, in rack order (§5.1), each
  with the room toward the operator first, then turned round (asymmetric
  ones), tried by running the station (`advise: false`), as today. The first
  that passes is the card's button, labelled from `PUNCH_LABELS` ("Use the
  A 102 punch", "Use the A 102 punch, reversed"). The punch's own turning
  round ("Turn the punch round") is still tried first.
- **Ram hits**: unchanged rule (`tallerPunches`: same angle, taller), which
  now holds the shop's three 88° punches too.
- **What was tried, in words.** One or two punches tried: named, as today.
  More: one item, "every other punch in the rack" (ram: "every taller punch
  in the rack"), with ", either way round" when any of them is asymmetric —
  e.g. "Turning the sheet around and every other punch in the rack, either
  way round, were tried: neither clears."
- `ADVISED_PUNCH` no longer limits what is tried. The raw `brakeCollisions`
  advice strings (`ADVICE`, `ONWARD_ADVICE`: a stored step's general words)
  stay as they are; SP-2 gives stored rows their tries.
- **`NO_WAY`** stops claiming what was not tried: "No order and no part-way
  bend clears it with this punch either. Make the web wider or the flange
  shorter, or make the earlier bends with another punch." (SP-2 then tries
  that last remedy itself.)
- Cost: one station run per candidate and way round, under `advise` only
  (the settle or the pedal), never while a line is dragged. Report the worst
  case measured on §5.8's parts; if the whole advice passes 250 ms on them,
  say so and propose the cut (do not drop candidates silently).

### 5.5 The punch stays in the machine

A station visit that starts without a carried session starts with the punch
of the last hit made on this computer, and the way round it was clamped: a
small module (`brakeMemory.js` or the like) over `localStorage`, key
`sketchstudio.brake.punch`, value `{ punch, reverse }`, written when a hit is
committed, read where the session is created (`CadWorkspace.jsx`, the
`brakeSessionDefaults()` spread). Sharp punches only (a radius punch belongs
to its bend); an unknown key, a parse error or a storage that throws falls
back to today's default. Tests that start a session clear the key first, so
none depends on another's hit.

### 5.6 Words that name the acute punch

`assessBend`'s `angle` and `punch-angle` refusals (pressBrake.js) name "the
acute punch" / "the Acute 30° punch". They now name both 30° punches: "… fit
an acute 30° die (V8, V12 or V16) and a 30° punch (the A 103 or the Acute
30°)." / "… Use a 30° punch: the A 103 or the Acute 30°."

### 5.7 Not in SP-1

Hiding the catalogue punches (§8 asks); a chart drawn on the picker card;
sliding a closed section off the punch's end; a slanted approach (hooking a
part onto the punch before the stroke); the earlier bends with another punch
(SP-2); the shop's dies, holders and ram (§8 asks).

### 5.8 Acceptance

**Unit tests** (`shopPunches.test.js`, plus the pinned ones below):

1. The four rows: angle, radius, height 95, load 500, `rack: 'shop'`; each
   ring simple, counter-clockwise, z from 0 to 95, not its own mirror; at
   z 40 the A 101 stands 2.8 – 14.9 behind the tip line, the A 102 4.6 – 14.9.
2. 90° bends across a 200 × 100 blank (t 1.2, 2.0, 3.2; lines 15, 30, 100,
   170, 185 mm in): clear with each of the four, both ways round, either
   side back. The A 103 clears 120°, 135°, 150° in the V8 30° die.
3. **The brake agrees with the chart.** Blank (200 + a + b) × 100, t 1.2
   SPCC, lines at 200 and 200 + a, both up 90°; the lip made, the inner bend
   checked, automatic die; "clears" = some way round (`turned` × `reverse`).
   Rows a = 10, 15, 20, 25, 30, 40, 50, 60; columns b = 10, 15, 20, 25, 30,
   40, 50; 1 = clears:

   ```
        A 101            A 102            A 103            A 108
   10   1000000          1100000          0000000          0000000
   15   1100000          1110000          0000000          1100000
   20   1110000          1111000          1100000          1111000
   25   1111000          1111100          1110000          1111100
   30   1111100          1111100          1111100          1111100
   40   1111110          1111110          1111100          1111110
   50   1111111          1111111          1111110          1111110
   60   1111111          1111111          1111111          1111111
   ```

   (The spec's probe. A 103's cells (30, 30) and (60, 50) lie within 0.3 mm
   of its outline; pin them as measured and say so if they differ.) The
   cells today's straight lift refuses and the slant passes carry a
   `takeOff`: for the A 101, (10, 10), (15, 15), (20, 20), (25, 25) and
   (30, 30).

4. Lip 15 / web 15 on the 605.4 × 420.4 blank, the lip made, the inner bend
   with the A 101: the room toward the lip → clear, `takeOff` ∓15 (toward
   the operator with the lip in front); the body toward the lip → the punch
   near 14°. A 108: `takeOff` ∓30.
5. Brake blades' deep channel (60 | 50 | 20, `brakeBlades.test.js` "lifts the
   ram back only as far as the stroke goes"): the deep gooseneck now clears
   with a `takeOff`; rewrite that test to say so.
6. The station on the 115 × 60 channel of `brakeBlades.test.js`: the
   straight punch's hit offers the first rack punch that clears, as a button
   (name it in the test as measured).
7. Lip 15 / web 15, the lip made with the straight punch, the inner bend
   pending: a button with a shop punch; one click and it clears.
8. Lip 20 / web 10 (lines 20 and 30 mm from the edge), either order: no
   button, the card ends with the new `NO_WAY`. This replaces lip 15 / web 15
   as the "nothing passes" case in `tightBendsWay.test.js` and
   `scripts/verify-tight-bends-tb2.mjs` step 3.
9. Lip 15 / web 15 with the A 101 in from the start, inner first, the lip
   pending: "Make this hit before bend 1" (TB-2) → both rows ok.
10. `brakeMemory`: nothing stored → `straight-88`; a committed hit with the
    A 101 reversed → the next visit starts with it; a radius punch is not
    remembered; a bad value falls back.

**Pinned tests and scripts that this spec changes on purpose** (update them
to the new behaviour, each change explained in the report; anything else
that moves is a finding, not a fix): the return-phase test and the fix
button's punch in `brakeBlades.test.js`; "the gooseneck punch either way
round were tried" lists (`brakeFlip.test.js`, `tightBends*.test.js`,
`brakeToolLength.test.js` where a list grows past two); `NO_WAY`'s text and
its lip 15 / web 15 case; counts of punches in picker / select tests; the
acute punch's words; the verify scripts' matching regexes.

**`scripts/verify-shop-punches-sp1.mjs`**, screenshots into
`artifacts/sketch-cad/shop-punches-sp1`, 1600 × 1000 and 1366 × 768, a
605.4 × 420.4 rectangle, 1.2 mm SPCC:

1. The punch picker: "Your shop's punches" with four cards (screenshot), the
   catalogue below. Choose A 101: the Blades row shows it, Reverse punch is
   offered.
2. Right edge, L 15, 90° → hit. Right edge, L 30, 90°: clears, at once or
   after one click on the card's own button; the take-off note shows.
   Pedal: mid-return the part has moved along Y (read from the stage's test
   state), the punch is clear of it in the screenshot; folded size equals
   the same two bends made with the catalogue gooseneck.
3. A fresh part, Straight 88° in: L 15 → hit; L 30 → the card's button names
   a shop punch → click → clears → pedal.
4. A fresh part: L 20 → hit; L 30 → the new `NO_WAY`, no button. Undo; L 30
   → hit; L 20 → the same.
5. A fresh part, A 101 in: L 30 → hit; L 15 → "Make this hit before bend 1"
   → pedal → two rows, both ok.
6. Reload the page, open the brake on any part: the punch is the A 101.
7. Timing: the advice for steps 2 – 5 (worst), and the frames while the
   punch line is dragged on step 4's blank (no frame over 50 ms from it).
8. No page error; no `.cad-error` but the refusals asked for.

Every brake, round-bend and shop verify script still passes (run them with
`CAD_VERIFY_URL` set to the dev server in use), the full suite, lint and the
build.

**Docs.** `sheet-metal-shop-guide.md`: a section "Your shop's punches" (the
four, what each takes, the chart's meaning) and the "Limits" paragraph of
the blades section rewritten for §5.3; `sketch-studio-tight-bends.md` §5.2 a
one-line pointer here for `NO_WAY` and the reference case;
`state-machines.md` only if a flow changes. Then §5.9 below: SP-1 as built
(what, where, measured numbers, judgment calls, where this spec was wrong
about the code).

### 5.9 SP-1 as built (2026-11-16)

**The rack (§5.1), `shopCatalog.js`.** The four punches are rows of
`PUNCHES` (`a101`, `a102`, `a103`, `a108`, names `A 101` … `A 108`), built by
`shopPunch` with the outlines of §5.1 verbatim, `height: 95`, `load: 500`,
`rack: 'shop'` and the `use` lines of §5.1, under a comment block giving the
source (the chart, the photo, §2) and what is assumed. They lead the object,
so `Object.keys(PUNCHES)` is the rack's order. New exports: `RACK_ORDER`
(every key, the shop's first as listed, then the catalogue's in their order;
derived from `rack`, not from the object's order) and `PUNCH_GROUPS` (`{ rack,
name, keys }`: "Your shop's punches", "Catalogue punches"). `punchSection` is
unchanged (the rings are simple and counter-clockwise, as §3 says).

**The picker and the selects (§5.2), `PressBrakePanel.jsx`.** `BladePicker`
draws the punches as `PUNCH_GROUPS`, each under an `h5` heading with its own
card list (`aria-label` the group's name); the dies keep one list. The Punch
select holds two `optgroup`s. `bladeOptions` (brakeStation.js) walks
`RACK_ORDER`. `PUNCH_LABELS` (brakeCollisions.js) gains "Use the A 101 punch"
… "Use the A 108 punch". The job sheet and the rows name a punch by its
`name` as before (checked: `jobSheet.js` reads `punchOf(...).name`, a row
names a sharp punch only with a length). CSS: `.cad-blade-group`.

**The take-off (§5.3), `brakeCollisions.js`.** `check` poses the part once
and tests each tool with `meets(tool, slant)`: the moving tools' sweep is the
hull of each section and the section moved `(lift × tan s, −lift)`, so the
straight lift (s = 0) is today's sweep exactly. When the return's straight
sweep meets the punch, the holders or the ram (`UPPER_TOOLS`), the same three
are tried along `TAKE_OFF_SLANTS` (exported: −15, 15, −30, 30, −45, 45); the
first slant all three are free of is the take-off, and the die, the bed
(`LOWER_TOOLS`) and the part against itself are then checked as before. Not
between a round bend's hits (`hit < steps`, `BUMP_GAP`: the straight lift),
never on the approach. `brakeCollisions` returns `takeOff` (the slant, or
null when the straight lift was free or there is a hit); a round bend's is its
last hit's return. The slants reuse the pose: `samples` counts poses as before.
`takeOffOf(options)` (exported) is the return alone (`only: 'return'`, the
pose at the target), for a made step's re-run and the film.

**The view.** `startStroke` / `startAgain` put `takeOff` on the stroke's run
(an offset per hit in `run.hits`; `rerunStroke` from `takeOffOf`, the view's
punch way round). `shopLayer.js` `slidePart`: in the return phase (a round
bend's last hit only) the drawn part's matrix moves along machine Y by
`tan s × (tipZ − the stroke's bottom tip)`; `station.pose.slide` and
`station.section.slide` carry it; the stage's test state adds `takeOff` and
`slide`. `BrakeSideView.jsx` translates the sheet, the part section and the
break marks by `slide`. The panel (`takeOffNote`) adds a `role="note"`
"Take-off" line under "Clear through the stroke": "Comes off the punch toward
you: …" (negative) / "… toward the backgauge: …" (positive); an offset's
note is either hit's.

**The card tries the rack (§5.4), `brakeStation.js` `punchFix`.** A punch or
holder hit tries the punch in the machine turned round first, then
`rackPunches`: every sharp punch but the one in, not blunter than the hit's
die (`hit.die`, now passed), in `RACK_ORDER`, each the room toward the operator
first, then reversed (asymmetric ones). A ram hit keeps `tallerPunches`
(same angle, taller, the lowest first, now walked in `RACK_ORDER`, so the
three 95 mm shop punches come before the 104.5 gooseneck). Each try is a
station run with `advise: false`, as before; the first that passes is the
button, labelled from `PUNCH_LABELS` ("Use the A 102 punch, reversed").
`ADVISED_PUNCH` stays exported, used by nothing (its comment says so); `ADVICE`
and `ONWARD_ADVICE` are unchanged. What was tried (`summarised`): up to two
punches named as before ("the A 101 punch either way round"); more, one item:
"every other punch in the rack" (a ram hit: "every taller punch in the
rack"), with ", either way round" when one was tried reversed. The closing
sentence is one helper for both cards (`triedWords`): the way round set off
with commas, "Turning the sheet around and every other punch in the rack,
either way round, were tried: neither clears." `NO_WAY` is §5.4's text.

**The punch stays in the machine (§5.5), `brakeMemory.js`** (new):
`BRAKE_PUNCH_KEY` (`sketchstudio.brake.punch`), `rememberedPunch()` (`{ punch,
reverse }` or null), `rememberPunch({ punch, reverse })`, `forgetPunch()`.
`CadWorkspace.jsx`: `startPressBrake` spreads `carry || rememberedPunch() ||
{}` over `brakeSessionDefaults()`; `brakeStrokeEnd`'s commit writes the hit's
punch and `punchReversed(session)`. Sharp punches only, both ways; an unknown
key, a bad value, a missing or throwing storage fall back to the defaults.
The 17 workspace DOM test files that open the brake clear the key in a
`beforeEach` (node has no `localStorage`: the pure tests are unaffected).

**The words (§5.6), `pressBrake.js`.** The `angle` and `punch-angle` refusals
read "… and a 30° punch (the A 103 or the Acute 30°)." / "… Use a 30° punch:
the A 103 or the Acute 30°."

**Measured (the app's modules in node; the matrix and the probes in
`shopPunches.test.js`).**

- §5.8 item 1: at z 40 the A 101 stands 2.80 – 14.90 behind the tip line, the
  A 102 4.60 – 14.90; every ring simple, counter-clockwise, z 0 – 95, none its
  own mirror.
- Item 2: 240 plain 90° bends, all clear, none slanted; the A 103 and the
  Acute 30° clear 120°, 135°, 150° in the V8 30° die.
- Item 3: the matrix reproduces §5.8's cell for cell on all four punches,
  A 103's (30, 30) and (60, 50) included (both clear in the brake; the chart's
  thin return does not). The cells that clear only along a slant, A 101: (10,
  10), (15, 15), (20, 20), (25, 25), (30, 30), as §5.8 says.
- Item 4: lip 15 / web 15, the lip made, the inner bend with the A 101: turned
  (the lip in front), room toward it → clear, take-off −15; this side back,
  reversed → clear, +15; the body toward the lip → the punch at 13.9° either
  way. The A 102: ∓15, the punch at 13.2°; the A 108: ∓30, the punch at 16.4°;
  the catalogue gooseneck: ∓30 (the A 103 meets the punch at 60 – 63°).
- Item 5: the deep channel (60 | 50 | 20) with the deep gooseneck: clear,
  take-off −15; with the gooseneck: clear, straight.
- Item 6: the 115 × 60 channel's straight-punch hit offers **Use the A 101
  punch** (the 128 × 60 box's holder hit too).
- Item 7: lip made with the straight punch, the inner pending: **Use the A 101
  punch, reversed** → clear, take-off +15 (the stroke carries it).
- Item 8: lip 20 / web 10, either order: no button, "Turning the sheet around
  and every other punch in the rack, either way round, were tried: neither
  clears." then `NO_WAY`.
- Item 9: the A 101 from the start, inner first: "Make this hit before bend 1"
  → armed it passes → both rows ok.
- The verify script (`scripts/verify-shop-punches-sp1.mjs`, dev server,
  screenshots in `artifacts/sketch-cad/shop-punches-sp1`): the return of step
  2 slides the part 0 → 11.5 mm along +Y (take-off +15°: the Turn the punch
  round fix), folded 576.47 × 420.4 × 17.14 mm, the same as with the catalogue
  gooseneck.
- The whole advice (the punch tries, the turn, the lengths, the order tries;
  node, worst of three, the range over three runs of the verify script with
  the dev server beside it) on §5.8's parts: step 2 (the A 101 the wrong way
  round: the turn and Turn the punch round found) 139 – 207 ms; step 3 (the
  straight punch: the A 101 reversed found) 63 – 97 ms; step 4 lip first
  (nothing: every punch both ways, every order) 151 – 221 ms, inner first
  81 – 125 ms; step 5 (this hit first) 17 – 34 ms. Worst 221 ms: under 250 ms
  on them, step 4 within 30 ms of it. Off them, where every punch is tried
  both ways and every order too, it can pass 250 ms: the web between two
  standing flanges of `brakeBlades.test.js` (100 × 60, nothing clears) 264 ms
  median, 287 worst of five; the 715 mm channel of `brakeFlip.test.js` (only
  the turn clears) 179 median, 194 worst; its flange-45 card 81 median, 194
  worst (the first run's JIT). One task per settle, never during a drag. The
  cut, proposed, not made: try each candidate on `brakeCollisions` with the
  pending fold and die (a sharp punch changes neither), and run the full
  station only for the one that clears, so a failing try skips the fold and
  the machine's checks.
- The drag (step 4's blank, the dev build): 48 moves out and back over the
  made bend, frames median 7 ms, worst 14 – 35 ms over three runs, no long
  task during the drag, one of 61 – 63 ms in the settle after the release
  (the advice, once), no button on the card mid-drag.

**Choices where the spec is silent (judgment calls).**

- The slanted sweep tries only the upper tools; the first slant free of all
  three wins, then the die, the bed and the part itself are checked as on a
  straight lift (they do not move with the take-off). A slant never turns a
  pose's own collision into a clear one: only the sweep is slanted.
- The punch in the machine turned round is tried first for a punch or holder
  hit even when it is not reversed (today it was tried only when reversed, or
  when it was the advised gooseneck): the smallest change, and an A 101 in the
  wrong way round is the commonest case (verify step 2: **Turn the punch
  round**). A ram hit keeps today's rule (un-reversed only).
- A fix found after more than two punches failed says "{n} other punches in
  the rack" (a ram: "{n} taller punches"), never "every other …", which only
  ends a list where every candidate was tried; a punch tried both ways is
  "… either way round" in either case (it was only in the no-fix case).
- The summary item alone reads "none clears" ("Every other punch … was tried:
  none clears"), and ", either way round," takes its commas wherever it stands
  in the list.
- "Not blunter than the hit's die" admits the 30° punches into an 88° die (as
  `assessBend` does), so the A 103 and the Acute 30° are candidates there.
- `PUNCH_WHY`'s "it holds the clamps higher" stays on a holder hit's punch
  button whatever the punch (the A 101 is 28.5 mm taller than the straight).
- The remembered punch is written for every committed stroke (an offset, an
  armed try, a bend-on hit), never for a re-run; the way round stored is
  `punchReversed` (a symmetric punch is never "reversed"); the die is not
  remembered (automatic). A carry from the bend queue wins over it.
- The take-off note sits as its own line under "Clear through the stroke";
  an offset's is either hit's.
- A re-run of a made step and the film slide the part too (`takeOffOf`, the
  return alone, under 10 ms); their view's punch way round as drawn.
- At the stroke's end the part is drawn at rest in the die as today (the
  slide is view only and ends with the return), so a return standing over
  the nose shows the parked punch inside it as before SP-1.
- `DIE_USE[30]` ("Bends past 90°, with the acute punch.") and
  `PUNCH_LABELS['acute-30']` keep their words: §5.6 names the two refusals.

**Where the spec is wrong about the code (followed the code).**

- §5.4: "The punch's own turning round is still tried first": it was tried
  only for a reversed punch (or the advised gooseneck itself). Generalised as
  above.
- §5.8's list of pinned tests misses some that the same rules move: the fix
  button's punch in `CadWorkspace.brake.dom.test.jsx` (two tests) and
  `PressBrakePanel.blades.dom.test.jsx` (the same channel); the asymmetric
  punch list in `brakeBlades.test.js` and the holder fix there; the
  `brakeFlip.test.js` flange-45 card (a punch now clears it: the A 102) and
  its holder words; `brakeToolLength.test.js`'s ram fix and its 88° punch
  list, and its "no earlier" check, which the new `NO_WAY`'s "make the earlier
  bends" trips; `CadWorkspace.queue.dom.test.jsx`'s "Leave press brake, Bend
  again: the defaults", which §5.5 replaces (the outline-edit spec §7.3's
  "the next visit starts from the defaults"). Each updated to the new
  behaviour, said in its test.
- §5.8 item 3's slant cells and item 4's ∓15 / ∓30 reproduce; §3's "7 – 20
  ms per hit checked" too (plain bends: worst 20 ms).

**Files.** `shopCatalog.js`, `brakeCollisions.js`, `brakeStation.js`,
`brakeMemory.js` (new), `pressBrake.js`, `PressBrakePanel.jsx`,
`BrakeSideView.jsx`, `shopLayer.js`, `CadWorkspace.jsx`, `cad.css`; tests
`shopPunches.test.js` (new), `brakeBlades.test.js`, `brakeFlip.test.js`,
`brakeToolLength.test.js`, `tightBendsWay.test.js`, `pressBrake.test.js`,
`PressBrakePanel.blades.dom.test.jsx`, `CadViewport.brake.dom.test.jsx`,
`CadWorkspace.brake.dom.test.jsx`, `CadWorkspace.queue.dom.test.jsx` and the
`beforeEach` in 15 more workspace DOM files; scripts
`verify-shop-punches-sp1.mjs` (new), `verify-brake-blades-bt1.mjs`,
`verify-tight-bends-tb2.mjs`; docs `sheet-metal-shop-guide.md` ("Your shop's
punches", the Blades Limits, the tried words, "When nothing works"),
`sketch-studio-tight-bends.md` §5.2 (the pointer), `state-machines.md`
(`cad-brake`: the remembered punch and the stroke's take-off).

### 5.10 The audit (2026-11-16)

Checked against the source and re-run, not read from the report:

- §5.1's outlines in `shopCatalog.js` equal the spec's, number for number.
- A probe of my own on the built code (not the builder's test): the §5.8
  item 3 matrix equals the spec on all four punches (224 cells); item 4's
  take-offs (A 101 ∓15, A 108 ∓30; the punch at 13.9° / 16.4° the wrong way
  round); lip 20 / web 10 clears with no punch, either order.
- The suite: 6853 passed, 1 skipped, 1 failed — the load-sensitive 250 ms
  kernel budget in `kernel.sheetmetal.test.js`, which passes alone (as in
  earlier phases). Lint 0 errors. Build green.
- `verify-shop-punches-sp1`, `verify-tight-bends-tb2` and
  `verify-brake-blades-bt1` pass on my rerun; the other nineteen verify
  scripts are the builder's runs, not mine. The mid-return side view shows
  the lip beside the A 101's nose, not through it.
- The test changes outside §5.8's list (§5.9) are consequences of §5.4 and
  §5.5, read one by one and accepted.

Left open: the whole advice ran 231 ms on verify step 2 in my rerun (under
the 250 ms mark, once per settle, never in a drag) and passes it off the
reference parts (287 ms worst, §5.9). The builder's cut (a candidate punch
tried on `brakeCollisions` first, the full station only for the one that
clears) goes to SP-2, which adds tries of its own.

## 6. SP-2 — the earlier bends with another punch; 45° first; a quicker card

Refined 2026-11-16 after SP-1's audit, on the built code (a probe of
`brakeStation`, `sequenceChecks` and `brakeCollisions`, scratchpad, not kept).

### 6.1 What the probe found

- **The compound remedy is real.** Lip 15 / web 15 on the 605.4 × 420.4
  blank, the inner bend made first with the straight punch, the lip pending:
  the card has no button and ends with `NO_WAY` (120 ms). The lip first and
  the inner bend with the A 101, A 102, A 108 or the catalogue gooseneck
  passes both steps (`sequenceChecks`: ok / ok); with the straight, sharp,
  tall, acute, A 103 or deep gooseneck the inner bend meets the punch. With
  the A 101 in from the start the card already offers "Make this hit before
  bend 1" (26 ms): only the stored step's punch stands in the way.
- **45° first works.** The tight Z (150 | 15 | 150, up then down): the first
  bend to 60°, 45° or 30° all pass, with the straight punch and with the
  A 101, A 102 and A 108 (15° meets the bed on the finishing hit). So 45°,
  the shop's own habit (§8), can be the angle the brake proposes. A short
  body shows why the shop uses it: body 80 – 120, web 20, lip 15 with the
  A 101, inner first: 60° meets the punch at 57°, 45° passes. On the
  screenshot part (576 mm body) 45° still meets the ram near 79° and 30°
  passes; there the order (try 1) is found first anyway.
- **Where the card's time goes.** Lip 20 / web 10 (nothing clears): the
  whole advice 208 ms; one facts-only station run 9.4 ms (passing today's
  `checks` in does not shorten it), about twenty of them: every punch both
  ways, the turn, the order tries. A `brakeCollisions` call on the pending
  hit that fails ends at its first contact (0.2 ms when it is the approach).

### 6.2 Try 3: this hit first, and the bend after it with another punch (`wayTries`)

Only when try 1 and try 2 found nothing and the card offers nothing else
for this hit (no Turn the sheet around, no punch fix, no length fix): it is
the last resort, since it changes a bend already made. At one place: the
latest of try 1's range where the hit itself passes (step 1 below; refined
after SP-2's audit, §6.8):

1. The station run armed `{ kind: 'before', key }` must show the hit itself
   passing there: armed, no error, no collision, and no refusal but `order`.
   The `order` refusal now carries the step it names and why (`step`: its
   index in the trial, `tool`: its collision's tool, or null for a refusal).
2. That step is cured when it is a sharp step (not round) stopped by its
   punch or holder: the rack's sharp punches not blunter than its die, in
   `RACK_ORDER`, its own left out, each tried by the same armed station run
   with `armed.punches = { [the step's record ids]: key }`; the first run
   that passes, or whose `order` refusal names a different step, cures it.
   Then from 1 again with that punch kept (at most three steps changed).
   A step stopped by anything else ends the place.
3. A run that passes with `armed.punches` set is the try:
   `ways.compound = { label, session: { armed }, number, changes: [{ number,
punch }] }`, label **Make this hit before bend {k}, and bend {m} with the
   {name} punch** ("step" for a bend-on step, as try 1 says; several changed
   steps joined with "and": "…, and bends 1 and 3 with the A 101 punch" when
   one punch, else each named).

`armed.punches` (`{ [record id]: punch key }`, session only, no model key):
`placedBends` writes those punches on those records; `armedOf` keeps it only
for records after the place, of sharp steps, naming sharp punches in the
rack — anything else and the entry is dropped. The armed card reads: "This
hit goes in before bend {k}, and bend {m} is made with the {name} punch: the
view shows the sheet as it is then." The pedal commits the hit and the
changed punches in the one commit (one Undo), with the status line "Bend {m}
is now made with the {name} punch." What disarms is what disarms try 1.

The words. A compound found is offered with the remedies ("Make this hit
before bend 1 and make bend 1 with the A 101 punch."), and `NO_WAY` is not
said. `NO_WAY` itself becomes what was tried: "No order, no part-way bend
and no other punch for the earlier bends clears it. Make the web wider or
the flange shorter, or use tooling this rack does not hold."

### 6.3 A stored row (`sequenceTries`)

A row stopped by its punch or holder (a sharp step), with no move and no
part-way bend found, gets a third try: the first punch in `RACK_ORDER` (its
own left out, not blunter than its die) with which the list is `better`
(this step passes, fewer steps fail): **Make step {n} with the {name}
punch**, committed through `changeBrakeBends` as the other two. A move
together with a punch is not tried for a stored row (§6.6).

### 6.4 45° first (`PART_WAY`)

`PART_WAY` becomes `[45, 60, 30, 15]`: 45° first, then the others, each
still below the step's own angle. Try 2 and a row's part-way try read it, so
the tight Z's button is **Bend 1 to 45° first, finish it after this hit**.

### 6.5 A quicker card (`punchFix`)

A candidate punch (and way round) is first checked with `brakeCollisions`
on the pending hit exactly as the station checked it (the same fold, bends,
other angles, start and target, die, gauge side, turned, surface; only the
punch and `reverse` differ), `advise: false`. A hit there: the candidate
failed, with no station run. Clear: the station run decides, as today. The
shortcut is taken only when the candidate forms the same inside radius as
the punch in the machine with the hit's die (`airBendRadius`); otherwise the
station run, as today. Buttons and words must not change by it.

Budget: the whole advice at most 250 ms on every reference part of §5.8 and
§6.7 and on the 100 × 60 web of `brakeBlades.test.js` (287 ms worst in
SP-1), try 3 included. Report the numbers; if one passes 250 ms, say which
and why, and do not drop a try to meet it.

### 6.6 Not in SP-2

A part-way bend together with another punch; a move together with a punch
for a stored row; the generic words of a stored row's card (`ADVICE`:
"or use the gooseneck punch"); changing a made step's punch by hand in the
part form; opening a bend back.

### 6.7 Acceptance

**Unit tests** (`shopPunchesWay.test.js`, plus the pinned ones below), the
605.4 × 420.4 blank, t 1.2 SPCC, the right edge:

1. Lip 15 / web 15, the inner bend (L 30) made with the straight punch, the
   straight punch in, the lip (L 15) pending: no `first`, no `partway`,
   `compound` labelled "Make this hit before bend 1, and bend 1 with the
   A 101 punch"; the card names it and does not end with `NO_WAY`. Armed:
   the hit passes; `placedBends` gives the lip, then the inner bend with
   `punch: 'a101'`; the stroke carries them; after the commit both rows are
   ok and the folded size is the lip-first part's (576.47 × 420.4 × 17.14).
2. The same with the A 101 in from the start: try 1 alone ("Make this hit
   before bend 1"), no `compound`.
3. Lip 20 / web 10, either order: nothing, the new `NO_WAY`.
4. `armedOf`: `punches` naming a record before the place, a round step or
   an unknown or radius punch is dropped (the try is then plain try 1).
5. The tight Z (315 × 200, 150 up, then 150 from the right down):
   "Bend 1 to 45° first, finish it after this hit"; committed as 45°, the
   down bend, "bend 1 on: 45° → 90°", all ok, the same folded size as with
   60°. `PART_WAY` is `[45, 60, 30, 15]`.
6. A stored sequence, lip 15 / web 15, the lip then the inner bend, both with
   the straight punch: row 2 is stopped by the punch; `sequenceTries` gives
   it `punch`: "Make step 2 with the A 101 punch", whose list passes both.
7. `punchFix` with the shortcut: the buttons and words of SP-1's cases
   (§5.8 items 6, 7, 8; `brakeFlip.test.js`, `brakeToolLength.test.js`)
   unchanged; a test that the shortcut is skipped for a punch that forms
   another radius.

**Pinned on purpose** (update, and list each in the report; anything else
that moves is a finding): `PART_WAY`'s order and the tight Z's 60° (tests,
`verify-tight-bends-tb2.mjs` step 2, the guide, `sketch-studio-tight-bends.md`
by a pointer, not a rewrite); `NO_WAY`'s text wherever pinned; lip 15 / web
15 inner-first where a test pins "no button" for it.

**`scripts/verify-shop-punches-sp2.mjs`**, screenshots into
`artifacts/sketch-cad/shop-punches-sp2`, both sizes, the stored punch
cleared first:

1. Straight 88° in: right edge L 30, 90° → hit; L 15 → the card offers "Make
   this hit before bend 1, and bend 1 with the A 101 punch" → click: the
   armed card's words, the view with the inner line flat → pedal → two rows,
   both ok, the status line; the job sheet names the A 101 for the inner
   bend. Undo takes it all back in one step.
2. The tight Z → "Bend 1 to 45° first, finish it after this hit" → pedal →
   three rows, all ok.
3. Lip 20 / web 10 → the new `NO_WAY`, no button.
4. A stored sequence made by data (item 6): row 2's card offers "Make step 2
   with the A 101 punch" → click → both rows ok.
5. Timing: the whole advice on steps 1 – 3 and on SP-1's verify steps 2 – 5
   (worst of three), the 100 × 60 web in node; the drag frames on step 3's
   blank (no frame over 50 ms from it).
6. No page error; no `.cad-error` but the refusals asked for.

Every brake, round-bend, tight-bends and shop verify script still passes
(`verify-shop-punches-sp1.mjs` among them), the full suite, lint, the build.

**Docs.** `sheet-metal-shop-guide.md`: "When a bend will not go in" gains
the third try and 45° first, the stored row's punch button; `state-machines.md`
`cad-brake`: `armed.punches`; `sketch-studio-tight-bends.md` §5.2: a pointer
here for `PART_WAY` and `NO_WAY`. Then §6.8: SP-2 as built.

### 6.8 SP-2 as built (2026-11-16)

**Try 3 (§6.2), `brakeStation.js` `wayTries`.** After try 1 and try 2 found
nothing, and only when the card offers nothing else for this hit (`offered`:
Turn the sheet around, a punch fix or a length fix; the follow-up below), try
1's own armed runs are read again, latest first (no extra run for step 1 of
§6.2): the first that is armed, has no error and no collision, and whose
refusals are all `order` is the one place tried; the step the refusal names (`step` − 1 as made: the hit sits at
the place in the trial) must be stopped by its punch or holder (`tool`), be a
sharp step and not one already changed, and at most `MOST_CHANGED` (3) steps
are changed. Its candidates are `rackPunches` (the sharp punches in
`RACK_ORDER`, its own left out, not blunter than its die, `DIES[step.die]`),
each tried by the armed station run with `armed.punches` naming every record
of that step — each first checked on that step alone (below) — the first
that passes is the try, the first whose run is still the hit passing with an
`order` refusal naming another step is kept and that step tried next; none
and the place ends, and with it try 3. The result: `ways.compound = {
label, session: { armed: { kind: 'before', key, punches } }, number, changes:
[{ number, punch }] }`, on `pending.collision.ways` only when found (so `ways`
stays `{ first, partway }` everywhere else); `wayTries` also returns
`punchRuns` (the candidate runs made). The label and the words come from one
exported helper, `punchChangeWords(changes, mode)` ('with' for the button,
'is' for the armed card, 'now' for the line after the commit; one punch for
several steps "bends 1 and 3 with the A 101 punch", several punches each
named, "step" for a bend-on step).

**The refusal.** The armed station's `order` refusal now carries `step` (the
step's index in the trial) and `tool` (its collision's tool, null for a
machine refusal); its message is unchanged.

**`armed.punches`.** `armedOf` builds the armed try explicitly (no stray keys
pass through); for `kind: 'before'` an internal `armedPunches` keeps an entry
only for a record of a sharp step from the place on naming a sharp punch of
the rack, and adds `changes` ([{ key, number, again, punch }], as-made
numbers) for the words; with none left the try is plain try 1. A part-way try
never carries `punches` (§6.6). `placedBends` writes the kept punches on those
records after the place. `armedStroke` gives the stroke `placed` (the hit at
its place, the punches changed) and `notice`, "Bend 2 is now made with the
A 101 punch." — the workspace already commits `stroke.placed` in one commit
(no change in `CadWorkspace.jsx`). The panel (`PressBrakePanel.jsx`): the
compound is the third way button on the collision card; the armed card reads
"This hit goes in before bend 1, and bend 1 is made with the A 101 punch: the
view shows the sheet as it is then."; the status line after the commit is
named "Punch changed" (a part-way commit's stays "Part-way bend").

**The words.** `wayWords` gains `compound` (the button's label as a remedy:
"make this hit before bend 1 and make bend 1 with the A 101 punch"), offered
by `ramAdvice` and `triedAdvice` after the part-way bend, and by `dieWays` as
a part-way bend is ("Or …"). `nothing` (and so `NO_WAY`) needs no compound
either. `NO_WAY` is §6.2's text.

**A stored row (§6.3), `sequenceTries`.** A row whose collision is with its
punch or holder, a sharp step, with no move and no part-way bend found, gets
`punch: { label: 'Make step {n} with the {name} punch', bends }`: the first of
`rackPunches` (its own left out, not blunter than its die) with which the
list is `better` (this step passes, fewer steps fail), every record of the
step given the punch. The panel shows it with the other two under the row's
refusal (title "Tried with that punch: …"), committing through
`changeBrakeBends` as they do.

**45° first (§6.4).** `PART_WAY` is `[45, 60, 30, 15]`; try 2 and a row's
part-way try read it unchanged (each angle only below the step's own).

**A quicker card (§6.5), `punchFix`.** The station builds its collision
check's options once (`check`) and hands them to `punchFix`. For each try
(the punch in the machine turned round, a rack punch, a taller punch for the
ram, each way round) that forms the same inside radius as the punch in the
machine with the hit's die (`airBendRadius` on the fold's stock and
thickness), `brakeCollisions({ ...check, punch, reverse, advise: false })`
runs first; a hit there is the failure, with its tool for the ram's "none
holds it high enough" rule; clear, or another radius, the station run decides
as before. A stroke that is not in line has no `check`: the station run, as
before.

**Measured** (node, the app's modules; `shopPunchesWay.test.js`,
`shopPunchesWay.dom.test.jsx`, `scripts/verify-shop-punches-sp2.mjs`):

- §6.7 item 1: lip 15 / web 15, the inner bend made with the straight punch,
  the lip pending (a ram hit on the approach): `ways` = { first: null,
  partway: null, compound }, label **Make this hit before bend 1, and bend 1
  with the A 101 punch** (the first candidate, one run), as the spec says. The
  card: "Bend 2: the part hits the ram as the ram comes down. This punch and
  its holder stand the ram 166.5 mm above the tip. Make this hit before bend 1
  and make bend 1 with the A 101 punch. Turning the sheet around, a part-way
  bend first and every taller punch in the rack, either way round, were
  tried: none clears." The order alone: `{ code: 'order', step: 1, tool:
'punch' }`. Armed it passes, the inner line flat in the view; the armed
  card's words as above; `placed` the lip (straight) then the inner bend
  (`a101`); both rows ok; folded **576.47 × 420.4 × 17.14** (the lip-first
  part); the line "Bend 2 is now made with the A 101 punch."; the job sheet
  "bend 1 · … Straight 88° punch, V8 88° die", "bend 2 · … A 101 punch, V8 88°
  die"; one Undo takes both back.
- Item 2: the A 101 in from the start: try 1 alone, no `compound`.
- Item 3: lip 20 / web 10, either order: no button, the new `NO_WAY`.
- Item 5: the tight Z's button is **Bend 1 to 45° first, finish it after this
  hit**; committed as 45°, the down bend, "bend 1 on: 45° → 90°", all ok, the
  folded size the same as 60°'s.
- Item 6: the stored lip then inner, both straight: row 2 stopped by the punch
  (at 70.1°), no move, no part-way; **Make step 2 with the A 101 punch**, whose
  list passes both.
- Item 7: SP-1's cases (§5.8 items 6 – 8, `brakeFlip.test.js`,
  `brakeToolLength.test.js`) pass unchanged with the shortcut. A spy on
  `brakeCollisions` shows the shortcut taken for every rack punch on lip 20 /
  web 10 (no station run with any of them), and skipped for an A 102 given a
  2 mm nose (the station run made instead). With the catalogue's dies every
  sharp punch forms the same radius (the die's `radiusOfV × V` is above every
  sharp nose), so in the app the shortcut always applies.
- The whole advice, warm (7 runs in one process: worst after the first,
  median; ms), before §6.5 (with try 3) → after:

  | part                                                | before    | after     | try 3's runs |
  | --------------------------------------------------- | --------- | --------- | ------------ |
  | §6.7 1: the earlier bend with the A 101             | 100 / 86  | 94 / 86   | 1            |
  | §6.7 2: the tight Z                                 | 81 / 76   | 79 / 77   | 0            |
  | §6.7 3 = SP-1 step 4, inner first (nothing)         | 174 / 169 | 169 / 162 | 9            |
  | SP-1 step 4, lip first (nothing)                    | 196 / 190 | 152 / 144 | 9            |
  | SP-1 step 2 (the A 101 the wrong way round)         | 139 / 134 | 150 / 146 | 9            |
  | SP-1 step 3 (straight: the A 101 reversed found)    | 61 / 58   | 64 / 60   | 0            |
  | SP-1 step 5 (the A 101: this hit first)             | 18 / 15   | 14 / 13   | 0            |
  | the 100 × 60 web of `brakeBlades.test.js` (nothing) | 471 / 451 | 405 / 385 | 24           |

  The first call of a process (the modules' JIT) is slower: 165 – 186 ms for
  the first part measured. The verify scripts' "worst of three" include it and
  run beside the browser: SP-2's ran 18 – 217 ms on the reference parts (217
  the first case) and **423** on the web; SP-1's step 2, the first case of its
  process, 320. The shortcut saves 2 – 5 ms per failing candidate
  (a failing station run is cheap when the hit is on the approach): 7 ms on
  lip 20 / web 10 inner first, 46 on the lip first, 66 on the web.

- **The budget (as first built; the follow-up below brings the web to 161
  ms).** Every reference part of §5.8 and §6.7 stays under 250 ms
  warm. **The 100 × 60 web does not: 385 median, 405 – 423 worst.** Why:
  nothing clears, so try 3 runs at both places — before bend 2 (9 punches for
  bend 2), before bend 1 (6 punches until one cures bend 1, then 9 for bend
  2): 24 armed station runs of about 9.5 ms (the hit's own clear sweep about
  55 %, the later step's check both ways about 35 %, a CPU profile), 227 ms.
  Without try 3 the same card is 158 ms (SP-1 measured 264). No try was
  dropped. The cut, proposed, not made: within one place the candidates change
  only the punches of later steps, so with the same inside radius the trial's
  shape and the hit's own check are those of the place's first run; handing
  that check to the candidate runs would save about 4 ms each (about 100 ms
  here, to about 290 ms: still over), the rest being the later steps' own
  checks, which are the try.
- The drag (step 3's blank, the dev build): 48 moves out and back, frames
  median 7 ms, worst 34.8 ms, no long task during the drag, one of 96 – 99 ms
  in the settle after the release (the advice, once; 61 – 63 ms in SP-1), no
  button on the card mid-drag.
- The runs: the full suite 6871 passed, 1 skipped (the load-sensitive kernel
  budget passed this time); lint 0 errors; the build green;
  `verify-shop-punches-sp2` and the 22 brake, round-bend, tight-bends and shop
  verify scripts (`verify-shop-punches-sp1` among them) pass on the dev
  server.

**Choices where the spec is silent (judgment calls).**

- `ways.compound` is on the card's `ways` only when found, so every card
  without it keeps SP-1's `{ first, partway }` shape.
- With a compound offered, the tried list says "a part-way bend first" (when
  one was opened) but not "bending this one earlier" (the offer is that
  order, with the punch); `NO_WAY` is not said. So SP-1's "past two punches"
  ram card (the same part) now reads "Turning the sheet around, a part-way
  bend first and every taller punch in the rack, either way round, were tried:
  none clears."
- Numbers: the button and the armed card use the steps as made ("bend 1"),
  as try 1 does; the line after the commit uses the rows as they read after it
  ("Bend 2 is now made with the A 101 punch."), as the part-way line names its
  finishing step. Its status name is "Punch changed".
- A refusal that names a step already changed ends the place (no step is
  given a second punch); a step's every record (a stroke over several tabs)
  gets the punch.
- "Not blunter than its die" reads the step's resolved die; the 30° punches
  are candidates in an 88° die, as in SP-1.
- (Withdrawn by the follow-up below: try 3 now runs only when the card has
  nothing else for this hit.)
- The shortcut covers every try of `punchFix`: the punch turned round, the
  rack's punches and a ram hit's taller punches, each way round.
- A die or bed card offers the compound as it offers a part-way bend ("Or make
  this hit before …"); its "… was tried" sentence is left out when nothing
  tried remains to name.
- The punch remembered for the next visit (§5.5) is the hit's own, not the
  changed bend's.
- A stored row's punch button carries its own title ("Tried with that punch:
  this step clears and no other step is refused").

**Where the spec is wrong about the code (followed the code).**

- §6.5's "the same … surface": the station passes no surface
  (`brakeCollisions` derives it from the fold); the shortcut passes exactly
  the station's options, so it is the same check.
- §6.1's "one facts-only station run 9.4 ms … about twenty of them" for the
  card's time: a failing candidate's station run costs 2.3 ms on lip 20 /
  web 10 inner first (the hit is on the approach) and about 6.5 ms lip first,
  against 0.3 – 3 ms for its `brakeCollisions`; the card's time there is
  mostly the order tries, so §6.5 saves 7 – 66 ms, not most of it.
- §6.7's pinned list misses three that the same rules move: the hanging-side
  card of `brakeFlip.test.js` ("Or bend 1 to 60° first" → 45°: `PART_WAY`'s
  order on another part; 45° is tried there and clears), SP-1's "past two
  punches" ram card in `shopPunches.test.js` (lip 15 / web 15 inner first: the
  compound, as above) and `tightBendsWay.dom.test.jsx`'s "nothing passes
  (lip 15 / web 15)" (now the compound; a lip 20 / web 10 case is added for
  `NO_WAY`). Each updated, said in its test.

**The follow-up to SP-2's audit (2026-11-16): try 3 bounded.** The audit
measured try 3's cost growing with the steps made (lip 20 / web 10 with n 10°
creases before the lip: 145 ms for 1 step made, 3458 for 7): every place ×
up to nine candidates × a full armed station run. Three changes, all in
`wayTries` and its call:

1. **One place.** Try 3 looks only at the latest place where the hit itself
   passes with only the order refused. Why it is enough, checked against the
   code: a step f at or after that place k is checked (`stepCheck`, posed by
   `stepPose` from the steps made before it) with the same steps made before
   it whether the hit went in at k or earlier — the hit and every step before
   f — so its check, and every candidate punch's, is the same; earlier places
   only add steps after the hit. No counter-example in the code: a bend-on
   step's `from` and a stroke of several tabs being in line are read from that
   same pose, and a bend-on hit's places all lie after its own bend. The one
   exception is the order rule itself: `worseFrom` allows as many failing
   steps from the place on as the part as made has, so an earlier place with
   more of those may pass where k does not. Then (`spare`: the failing steps
   of the part as made from a place on) the earlier places are walked as
   before, without the step check; with none failing — every case measured —
   one place. (Also assumed: a candidate forms the same inside radius as the
   step's own punch, as every sharp punch does with the catalogue's dies;
   another radius would reshape the steps between.)
2. **A candidate checked on its step first.** Before the armed station run,
   the trial (`placedBends` with the punches) is folded and the refused step
   alone checked as `stepCheck` checks it (refusals, and the collision either
   way round, ending at first contact); a failure rules the candidate out. Only
   where it is the station's own verdict: no failing step allowed from the
   place (`spare` 0) and the candidate forms the step's own inside radius
   (else the station run, as before). A pass decides nothing: the armed
   station run decides.
3. **The last resort.** `offered` (Turn the sheet around, the punch fix or
   the length fix on the card) skips try 3; `NO_WAY` is unaffected (it is said
   only when nothing is offered anyway). §6.2's first sentence says so.

`wayTries` returns the counts `compoundPlaces`, `stepChecks`, `stepPassed`
and `punchRuns` (`shopPunchesWay.test.js` "try 3 is bounded" pins them: on
the 5-steps-made case one place, nine step checks, no station run — at most
the step checks passed — and none of it when `offered`; on lip 15 / web 15
one step check passed and one run). Every label, word and button of the
cases above is unchanged (the test files rerun; `CadWorkspace.jsx` and the
panel untouched).

Measured after it (node, 7 warm runs: worst after the first / median, ms;
the table above was before it):

| part                                                | before    | after     |
| --------------------------------------------------- | --------- | --------- |
| §6.7 1: the earlier bend with the A 101             | 94 / 86   | 92 / 86   |
| §6.7 2: the tight Z                                 | 79 / 77   | 73 / 68   |
| §6.7 3 = SP-1 step 4, inner first (nothing)         | 169 / 162 | 107 / 101 |
| SP-1 step 4, lip first (nothing)                    | 152 / 144 | 87 / 83   |
| SP-1 step 2 (the A 101 the wrong way round)         | 150 / 146 | 60 / 57   |
| SP-1 step 3 (straight: the A 101 reversed found)    | 64 / 60   | 58 / 51   |
| SP-1 step 5 (the A 101: this hit first)             | 14 / 13   | 19 / 12   |
| the 100 × 60 web of `brakeBlades.test.js` (nothing) | 405 / 385 | 172 / 161 |

SP-1's verify step 2 loses its try 3 (the card offers Turn the punch round
and Turn the sheet around), about 90 ms, and keeps its two buttons. The web is
back under 250 ms (the step check rules out all of its candidates).

The audit's scaling case (lip 20 / web 10, n 10° creases at x = 60 + 60 i
before the lip, the inner bend at L 30 pending; median / worst of five, ms):

| steps made | before (my run) | after     | try 1 + 2 | try 3 | the rest (punch, turn, length) |
| ---------- | --------------- | --------- | --------- | ----- | ------------------------------ |
| 1          | 148 / 256       | 98 / 187  | 44        | 7     | 40                             |
| 3          | 458 / 470       | 158 / 169 | 84        | 6     | 57                             |
| 5          | 1285 / 1319     | 277 / 279 | 184       | 9     | 93                             |
| 7          | 2929 / 2939     | 523 / 561 | 365       | 7     | 128                            |

(The audit's own before: 145 / 506 / 1518 / 3458 ms.) Try 3 is now 6 – 9 ms
whatever the steps (nine step checks, no station run). The 7-step case is
**523 ms, not near TB-2's 420** (TB-2's figure was another part: the tray
with 45° bends). Where it goes: tries 1 and 2 (TB-2's own: seven armed
places, each re-checking the steps after it in `worseFrom`, and one bend
opened at four angles) 365 ms; the rest of the advice (the punch tries with
their quick checks, Turn the sheet around, the lengths, the station's own
runs) 128; the facts run 15 and the sequence checks 47 outside the advice.
Not cut further.

In the verify scripts after it (worst of three, the first case cold, beside
the browser): SP-2's 12 – 159 ms on the reference parts and **158** on the
web (was 423); SP-1's step 2, its first case, **129** (was 320), its buttons
unchanged. The drag on step 3's blank (SP-1 step 4's): frames median 7 ms,
worst 20.9, no long task during the drag nor in the settle after it (was one
of 96 – 99 ms).

Runs after the follow-up: the full suite 6874 passed, 1 skipped; lint 0
errors; the build green; `verify-shop-punches-sp2`, `-sp1`,
`verify-tight-bends-tb2`, `verify-brake-tool-length` and
`verify-brake-flip-bt2` pass (the other 18 of the first run were not rerun).

**Files.** `brakeStation.js`, `PressBrakePanel.jsx`; tests
`shopPunchesWay.test.js` (new), `shopPunchesWay.dom.test.jsx` (new),
`tightBendsWay.test.js`, `tightBendsWay.dom.test.jsx`, `brakeFlip.test.js`,
`brakeToolLength.test.js`, `shopPunches.test.js`; scripts
`verify-shop-punches-sp2.mjs` (new, screenshots in
`artifacts/sketch-cad/shop-punches-sp2`), `verify-tight-bends-tb2.mjs` (step
2 at 45°), `verify-brake-tool-length.mjs` (the `NO_WAY` regex); docs
`sheet-metal-shop-guide.md` (When a bend will not go in, the stored row, Your
shop's punches, Limits), `state-machines.md` (`cad-brake`: `armed.punches`),
`sketch-studio-tight-bends.md` §5.2 (the pointer).

### 6.9 The audit (2026-11-16)

Checked on the built code with a probe of my own and re-run, not read from
the report:

- Lip 15 / web 15, the inner bend made with the straight punch, the lip
  pending: `ways.compound` "Make this hit before bend 1, and bend 1 with the
  A 101 punch"; armed `{ kind: 'before', key: 'inner', punches: { inner:
'a101' } }` passes with no refusal; `placedBends` gives the lip, then the
  inner bend with the A 101; both stored steps ok; folded 576.47 × 420.4 ×
  17.14. With the A 101 in from the start: try 1 alone.
- The tight Z: "Bend 1 to 45° first, finish it after this hit". The stored
  row: "Make step 2 with the A 101 punch", its list ok / ok. Lip 20 / web 10,
  either order: no button, the new `NO_WAY`.
- **One thing sent back.** As first built, try 3 walked every place with a
  full armed run per candidate: the whole advice on lip 20 / web 10 with n
  creases made before the lip took 145 / 506 / 1518 / 3458 ms for 1 / 3 / 5 /
  7 steps made, and 368 ms on the 100 × 60 web. The follow-up (§6.8: one
  place, the step checked alone first, try 3 only when the card offers
  nothing else) brings my re-measure to 92 / 162 / 300 / 534 ms and 158 ms
  on the web, the labels and buttons unchanged. What is left at 7 steps is
  TB-2's own tries 1 and 2 (the builder's split: 365 of 523 ms), once per
  settle, never in a drag: left as it is.
- The suite: 6874 passed, 1 skipped, none failed. Lint 0 errors. Build
  green. `verify-shop-punches-sp2`, `verify-shop-punches-sp1` and
  `verify-tight-bends-tb2` pass on my rerun after the follow-up; of the
  other verify scripts the builder reran `brake-tool-length` and
  `brake-flip-bt2` after it, the rest before it only.
- Not tested: the "no worse" exception path of try 3 (an earlier place with
  failing steps to spare), which the builder kept on the old walk and no
  measured case reaches.

## 7. Siblings read

`shopCatalog.js` (`PUNCHES`, `punchSection`, `punchSymmetric`, the die
rules), `brakeCollisions.js` (`toolingSections`, `check`'s sweeps,
`ADVICE` / `ADVISED_PUNCH`), `brakeStation.js` (`punchFix`, `tallerPunches`,
`triedAdvice`, `ramAdvice`, `bladeOptions`, `wayTries`, `NO_WAY`,
`brakeSessionDefaults`, `brakeCarry`), `pressBrake.js` (`assessBend`'s
punch / die rules, `strokeAt`, `STROKE_GAP`), `PressBrakePanel.jsx`
(`BladePicker`, the Punch select), `shopLayer.js` (the stroke's poses),
`model.js` (`fabrication.shop` is validated as three names: not used here),
and the tests that pin the return rule (`brakeBlades.test.js`) and the
"nothing passes" case (`tightBendsWay.test.js`). Shared contract: one
section per punch from `punchSection` for the scene, the picker and the
check; every remedy on a card is tried on the station's own checks before it
is offered.

## 8. Questions for the user (after the build)

1. The tips: are A 101, A 102 and A 108 88° (or 86° / 90°), and what tip
   radius and tonnes per metre does the maker give each? Is the fourth one
   "A 108"?
2. Which dies (V openings and angles) does your shop have? The brake picks
   from a catalogue list today.
3. Your punch holders and ram: the brake stands the ram 195 mm above the tip
   with these punches (95 + a 100 mm holder). Is that about right?
4. Should the brake list only your four punches, with the catalogue ones
   hidden?
5. On your screenshot part, 45° first / the lip / 45° more still meets the
   ram near 80° in the simulator, because the 576 mm body ends upright
   13 mm from the punch line; the lip first, or 30° first, passes. Does your
   machine really take 45° there?

**Answered 2026-11-16.** (1) Angle, radius and load: not known — the
assumptions of §2 stand. The fourth punch is "A 108". (2) Dies: all of the
catalogue's. (3) Holders and ram: not known — 95 + 100 stands. (4) Every
punch listed, the shop's and the catalogue's (as built). (5) 45° first, then
45° more, is the shop's technique for tight spaces in general; it was not
said that the screenshot part takes it.
