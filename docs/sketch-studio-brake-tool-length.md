# Sketch Studio press brake: punch and die length

Status: spec, 2026-11-15. Follows `docs/sketch-studio-fab-shop.md`,
`docs/sketch-studio-shop-floor.md` (§6.2 tooling set-up) and
`docs/sketch-studio-brake-flip-tooling.md` (all built). One phase, **TL-1**,
one builder run, audited after.

## 1. What the user asked for

"Can we allow users to change the punch and die length? I want to bend the
top and bottom edge with 200 mm width but the left and the right edge also
has 200 mm width and I can't bend it because the blade or the punch will hit
the bent bottom and top edges. Maybe if I can adjust the blade length
slightly so it won't hit the other edges. That's the technique we use in our
shop if we have a constraint in bending the sheet metal: we change the blade
length."

("Blade" is their word for punch / die.)

## 2. Feasibility (measured 2026-11-15, probes on today's code)

SPCC t 1.5, a 600 × 400 face with a flange on all four edges
(`flangedPanel`, closed corners), 50 t × 2 m press. Hits 1 – 2 are the 600
edges, hits 3 – 4 the 400 edges with the two long flanges already standing.

**The punch is already set to the bend's length, silently.** `brakeFrame`
returns `ranges` from `toolingRuns` (pressBrake.js): one run per stretch of
material the stroke bends. For hits 3 – 4 the run is ±195.9 (391.8 mm long)
and the standing flanges' mid-surfaces are at ±199.25, so the punch, its
holders and the die stand between them with 3.35 mm to spare at each end. The
user cannot see that length, cannot change it, and the model can never show
the thing they describe (a punch too long for the box).

**What stops the 200 mm tray is the ram, not the punch.** The ram runs the
whole bed above the punch and its holders:

| flange depth | straight 88° (66.5 + 100 holder) | tall straight (105 + 100) | gooseneck (104.5 + 100) | deep gooseneck (145 + 100) |
| ------------ | -------------------------------- | ------------------------- | ----------------------- | -------------------------- |
| 50           | clear                            | clear                     | clear                   | clear                      |
| 100          | ram at 88.8°                     | clear                     | clear                   | clear                      |
| 150          | ram at 37.2°                     | ram at 72.1°              | ram at 71.8°            | clear                      |
| 200          | ram coming down                  | ram at 16.9°              | ram at 15.9°            | ram at 59.3°               |
| 250          | ram coming down                  | ram coming down           | ram coming down         | ram coming down            |

That is the shop rule for box depth (tool height ≥ depth / 0.7 + half the
ram's thickness): a 200 mm side through a 90° bend needs about 315 mm from
the punch tip to the ram; the tallest set-up in the catalogue gives 245 mm
(sides up to about 150 mm). No punch length changes this. Today's message for
it is misleading: "Bend 3: the part hits the ram as the ram comes down. Bend
this one earlier, or use the gooseneck punch: it holds the ram higher."

So the request is feasible and worth building (one source feeds everything:
`frame.ranges` → `toolingSections` → collision check, 3D scene, film), and
the build must also tell the truth about the ram, or the user's own example
will look like the new control is broken. A taller holder for deep trays is a
separate question for the user (§8).

## 3. Design

### 3.1 The model: a trim per end

Two optional numbers on a bend record, shared by a stroke's members exactly
as `punch` / `die` are:

- `punchTrim`: mm taken off **each end of every tooling run** of the punch
  and its holders. Negative = the punch runs past the bend. Absent / null =
  fitted to the bend (today's behaviour, 0).
- `dieTrim`: the same for the die.

A trim, not a length, because a stroke over separate tabs has several runs
and one "length" would be ambiguous; the panel shows and edits a length where
there is one run (§3.4).

Session keys `punchTrim: null`, `dieTrim: null` (`brakeSessionDefaults`),
reset to null wherever `skip` is reset (the line changed). **Superseded by
§9 (TL-2): a new line no longer resets them.** They ride in the
pending bend's `base` (brakeStation.js, beside `punch` / `die`) so the
pending hit, the stored record, `rerunStroke`, `sequenceChecks`, the job
sheet and the replay film all read one source. `foldSheet` validates them
(numbers, by name: "Bend 3 punch length") and carries them on its resolved
bends as it does `punch` / `die`. Both hits of an Offset pair and every hit of
a round bend share them. Check that a save → load keeps the keys (round-trip
test).

### 3.2 Geometry

- `brakeFrame` keeps `ranges` as the punch's (and holders') runs and adds
  `dieRanges`; each is `toolingRuns(...)` with every run moved in by the
  trim at both ends, clamped to the bed (`±machine.bed / 2`; `brakeFrame`
  has no machine today — pass what it needs, or clamp in `toolingSections`,
  builder's choice, one place). Runs that meet after being lengthened merge.
  With no trims the output must be bit-for-bit today's (existing tests
  unchanged).
- `toolingSections` takes `dieRanges`; the holder follows the punch; ram and
  bed unchanged. `shopLayer.js` and the collision triangles follow.
- A run trimmed shorter than the smallest section a sectional set has is
  refused by name ("The punch would be 4 mm long: the shortest section is
  10 mm"). 10 mm is believed to be the smallest standard segment
  (Amada-Promecam sectioned sets); confirm from a tooling catalogue and
  record the source in the catalogue comment, as the holders were. No
  invented dimensions.

### 3.3 What a shorter or longer tool means (honest rules)

- **Force** is over the bend's length, unchanged. **Tooling limit**: each
  tool's kN/m applies over the length of it under the bend
  (`toolingLimit` today uses the bend's length for both): a shorter punch
  carries the same force on less tool, and the existing over-limit refusal
  must be able to fire from it.
- **Ends not pressed.** A tool shorter than the bend leaves the ends to the
  sheet's own stiffness. The fold is unchanged (the whole line bends). The
  hit carries a note, not a refusal: "The punch stops 5.9 mm short of each
  end of the bend: the ends are not pressed and come out a little open."
  Refused only when a tab of the stroke has no tool over it at all, or the
  tool covers less than half the bend. (My call; there is no sourced limit.
  Name the constant.)
- **Longer than fitted** is allowed up to the bed: then the tool really can
  meet standing sides, which is the constraint the user describes.

### 3.4 Panel (PressBrakePanel.jsx, the Blades row)

Under each blade button, one line, always in view:

- one run: `Length [391.8] mm · fitted` — a number field (`useNumericDraft`,
  as every number box; spinner step 5 mm; commit on Enter / blur, live after
  the 150 ms settle like the other fields). Typing a length sets the trim
  (`(fitted − length) / 2`); emptying the field, or a "Fit to bend" button
  shown beside a custom length, goes back to fitted. Custom reads
  `Length [380] mm · 5.9 mm short at each end` (or `… past each end`).
- several runs: `3 sections · fitted` and a field `Shorter at each end
[0] mm` editing the same trim.

Labels "Punch length" / "Die length" for the fields' accessible names. No
new disclosure, no layout shift of the row when a note appears (measure at
1366 × 768 as the BT scripts do). The sequence list's tooling line and the
job sheet's bend line name a custom length ("straight 88° punch, 380 mm").

### 3.5 Collision advice: only what was tried

Same contract as `punchFix` (brakeStation.js): searched only under `advise`
(after the 150 ms settle or on the pedal, never per pointer move), a fix
button only when the trial hit really passes.

- Hit on the **punch or holder**: if the session's punch is longer than
  fitted, try fitted ("Fit the punch to the bend"). Otherwise try shorter
  ones (trims 5, 10, 20, 40 mm while the half-coverage rule holds): the
  first that clears is a button "Shorten the punch to 351.8 mm". Tried and
  none clears → the card says so in the existing "were tried: neither
  clears" wording.
- Hit on the **die**: the same with the die.
- Hit on the **ram**: a shorter punch is never offered (the ram runs the
  whole bed). See §3.6.

### 3.6 The ram and deep sides

For a ram hit the card states the facts and only remedies that were tried:

- facts: "the part reaches the ram: this punch and its holder stand it
  166.5 mm above the tip".
- every taller punch in the catalogue is tried (today only the gooseneck
  is named): the first that clears is the fix button, as now.
- none clears: "No punch in the list holds the ram high enough (the tallest
  gives 245 mm)." and, where the builder can measure it from the same poses
  the check already samples, the height the bend needs ("this bend needs
  about 315 mm").
- the generic `ADVICE.ram` used for stored steps stops promising the
  gooseneck: it names a taller punch in general terms and keeps "bend this
  one earlier" only as an untried suggestion, in the wording style of the
  BT-2 follow-up.

No new tooling is added here (§8).

## 4. Acceptance

Unit tests (the numbers are §2's; the builder may refine the last digit and
must report any that differ):

1. 600 × 400 panel, flanges 50, hit 3: fitted ranges ±195.9; no trim →
   output identical to today's; clear.
2. Same hit, punch length 400 (sides stand 398.5 apart): collides with the
   punch or its holder on the way down, both ways round; the card's "Fit the
   punch to the bend" clears it.
3. Same hit, punch length 380: clear, with the ends-not-pressed note
   (5.9 mm).
4. Flanges 100, straight 88° punch, hit 3: ram at about 88.8°; no "shorten"
   offer; a taller punch is offered and clears.
5. Flanges 200, hit 3: every punch hits the ram; the message carries the
   facts and no remedy that was not tried.
6. A case the builder constructs and reports with its numbers: a tray whose
   long flanges carry inward return lips (lips bent first), short flanges
   lower than the lips. Fitted punch → hits a lip coming down; the
   "Shorten the punch to …" button clears it; the stored step passes
   `sequenceChecks` with its trim and fails without it.
7. Die: a die lengthened past the bend into a side that hangs down collides;
   fitted clears. A die trim round-trips like the punch's.
8. Tooling limit: a hit near the punch's kN/m limit is refused once the
   punch is shortened enough.
9. Save → load keeps `punchTrim` / `dieTrim`; a model without them is
   unchanged byte for byte when re-saved.

Dom tests: the two length fields (type, clear, Fit to bend, several-runs
form), the fix buttons.

`scripts/verify-brake-tool-length.mjs`, in the style of
`scripts/verify-brake-flip-bt2.mjs` (1366 × 768, screenshots to
`artifacts/sketch-cad/brake-tool-length`): Draw → Flanged panel 600 × 400,
flanges 50, "Cut the blank — I will bend it" → bend the two long edges →
third line: the Length field reads 391.8 fitted → type 400: collision card,
3D shows the punch into the sides (screenshot) → Fit to bend → type 380: the
note, the punch visibly short in 3D (screenshot) → Bend → the sequence list
names the 380 mm punch → reload: still there. Then flanges 200: the ram card
with its facts (screenshot). No page errors.

All existing tests and all verify scripts still pass; lint 0 errors; build
green.

## 5. Out of scope

- A segment library ("made of 200 + 100 + 50 + 20 + 10"), horn / ear
  segments that reach under a return lip.
- A different trim at each end, or sliding the tooling along the bed.
- Dragging the punch's ends in the 3D view.
- A taller punch holder, a riser or new tall punches (§8).

## 6. Files (expected)

`pressBrake.js` (`brakeFrame`, `assessBend`), `brakeCollisions.js`
(`toolingSections`, advice), `brakeStation.js` (session, pending `base`,
fixes), `sheetMetal.js` (validation, resolved bends), `shopCatalog.js`
(`toolingLimit`, the smallest section), `shopLayer.js`, `PressBrakePanel.jsx`,
`jobSheet.js`, `CadWorkspace.jsx` (session resets), their tests,
`docs/state-machines.md` if a flow changes (read it first),
`docs/sheet-metal-shop-guide.md` Limits section if the file exists.

## 7. Builder's report

Each judgment call named; each existing expectation that changed, with old
and new outcome and why; the constructed cases' numbers (§4 items 6 – 8);
test, lint, build and verify-script results as run, failures included.

## 8. Open, for the user

Deep trays. A 200 mm side needs about 315 mm under the ram; the catalogue's
tallest set-up gives 245 mm. What does their shop put on the machine for
deep trays (punch height + holder / riser height)? With that answer a tall
holder can be added as its own small phase.

## 9. TL-2 — the lengths stay as set (2026-11-17)

### 9.1 What the user said

"When I try to change the backgauge it also resets the length of the punch
automatically, which is annoying … whenever I change the gauge length the
punch and die length should stay; it should depend on me when I want to
change it."

### 9.2 What happens today

§3.1 resets `punchTrim` / `dieTrim` to fitted wherever `skip` is reset: every
new line (`brakePatch`: an edge, L, points, the mode), **Bend on**
(`bendOnPatch`'s patch names both as null), and the next part
(`brakeCarry` leaves them behind). So a punch set to 356 mm is back at the
bend's own length as soon as L is typed, the fingers are dragged or the
other side's edge is picked. That was my reading of "a new line is a new
set-up"; in the shop the punch stays in the machine until someone changes it.

### 9.3 The rule

**A tool's length changes only when the operator changes it**: the Length
field, **Fit to bend**, or a fix button on a card. Nothing else touches it.

- One run under the line: the **length in mm** stays (356 mm on the next
  bend too, whatever that bend's own length: shorter than it, the ends are
  not pressed and the note says so; longer, it runs past the bend and the
  card says what it meets and offers **Fit the punch to the bend**, as for a
  length typed by hand).
- Several runs (tabs): there is no one length; the **trim** per end stays.
- **Fit to bend** means fitted from then on: the next bends are fitted too,
  until a length is set again.

### 9.4 The build

- `lineTooling(fold, polygon, line, skip)` (pressBrake.js): the fitted runs
  of a punch line before it is folded — `toolingRuns` on the line's own
  frame with the segments it keeps (`lineSegments` less `skip`). It must
  give the lengths `strokeTooling(...).fitted` gives once the hit is folded
  (a unit test over a rectangle, the two-tab plate, a tab skipped and a line
  on a made bend).
- Session keys `punchHold`, `dieHold` (absent until a length is set, so a
  session that never sets one is as today): the length in mm the tool is
  held at. `brakePatch(session, patch, station)`:
  - a patch naming `punchTrim` / `dieTrim`: the trim is taken as given; with
    the station and one run under the session's line, the hold becomes
    `span − 2 × trim`; a null trim removes the hold (fitted); several runs or
    no station: the hold is removed and the trim itself is what stays;
  - a new line: `punchTrim` / `dieTrim` are **not** reset. With a hold, the
    station and one run under the new line, the trim becomes
    `(span − hold) / 2` (null within 1e-6); otherwise (no hold, several runs,
    no line yet, no station) the trim stays as it is;
  - a patch naming `skip` changes the runs: the trim stays, the hold is
    re-read from it as for a patch naming the trim. **Superseded by
    `docs/sketch-studio-piece-pick.md` §5.2** (2026-11-21, PK-1): that rule
    destroyed a held punch when pieces were left out after a length was
    typed (hold −530 on the lip tray). A patch naming `skip` is now the same
    to the tools as a new line: with a hold and one run the trim is derived
    from the hold; with no hold the trim stays and the hold is read from it
    only when that gives a length above 0; no hold is written at 0 or below.
- `bendOnPatch` no longer names `punchTrim` / `dieTrim` (it is a new line
  like any other). `turnAround` already names neither. `fingerRestore` keeps
  naming both (Esc puts the line and its tools back).
- `brakeCarry` carries `punchHold` / `dieHold` and the trims when set: the
  tools stay in the machine for the next part. The next part's first line
  derives its trim from the hold as any new line does.
- The hit's commit (CadWorkspace.jsx) leaves the trims and holds alone (it
  does today).
- **Panel** (`BladeLength`): with no line picked and a hold, the disabled
  field shows the held length and the note reads "kept for the next bend";
  with a line, as today.
- The record is unchanged (`punchTrim` / `dieTrim` per bend).

### 9.5 Acceptance

Unit tests (`brakeToolLength.test.js`, new cases): the 605.4 × 420.4 blank,
right edge L 29, punch set to 380 → L 30, L 11, the left edge, two points
along another line of the same length: 380 each time; the fingers' drag
patches (distance after distance): 380 throughout, Esc restores; a line of
another length (the blank's short side, 605.4 → the trim re-derived, the
field still 380, the "past each end" note when the bend is shorter than
380); **Fit to bend** → fitted, and fitted on the next line too; a card's
"Shorten the punch to …" → that length kept on the next line; the two-tab
plate (several runs): the trim kept; `skip` toggled; Bend on a made bend:
the length kept; the die the same; a session that never set a length: every
`brakePatch` result equal to today's (the parity tests in
`brakeHands.test.js` keep passing for such sessions; where a parity test
pins a trim reset to null on a new line, that pin is this spec's change:
update it and list it); `brakeCarry` with and without a hold;
`lineTooling` against `strokeTooling`. DOM: type a Length, then type L: the
Length field keeps its value; no line and a hold: the field shows it with
"kept for the next bend". Script: `scripts/verify-brake-tool-length.mjs`
gains a step (set 380, change L, pick the opposite edge, the next part of a
two-part queue: 380 each time; Fit to bend, change L: fitted). Docs: the
guide's punch-length part, `state-machines.md` (`cad-brake` session keys),
§3.1 here marked superseded by §9.

### 9.6 TL-2 as built

Built 2026-11-17 as §9.4 has it.

- `lineTooling(fold, polygon, line, skip)` (pressBrake.js) is `toolingRuns`
  on `{ blank: fold.blank }` (the profile's polygon, what the fold reads) and
  `{ a: line.a, u }`, with the line's own segments (lineSegments less
  `skip`), measured from their middle as `strokeTooling` does. The check
  held: a bend's intervals are the whole material crossings its segment
  touches, so a stroke's bends made from `strokeBends` lines "just inside"
  their segments have the same intervals, and the lengths agree to 1e-6 mm
  (rectangle by gauge and by two points, the three-tab comb whole, with its
  middle tab and with an end tab left flat, a line on a made bend).
- (The `skip` half of this item is superseded by piece pick §5.2, above.)
  `brakePatch` calls `holdTools` once the seat has moved the line: a patch
  naming a trim or `skip` sets the hold from the trim (one run under the
  line, `exact(span − 2 × trim)`) or removes it (fitted, several runs, no
  station); a new line with a hold and one run derives the trim
  (`exact((span − hold) / 2)`, null within 1e-6). With several runs, no line
  or no station the trim stays and the hold is kept for when one run stands
  under the line again. A session that never sets a length gets no
  `punchHold` / `dieHold` key.
- Where a null trim was written, and what became of it: `brakePatch`'s new
  line (removed: `holdTools`); `bendOnPatch` (removed); the session defaults
  (kept: fitted at the start); `fingerRestore` (kept: Esc puts the line and
  its tools back); the card's fixes — `lengthFix`'s "Fit the punch/die to the
  bend" and "Shorten …", `assessBend`'s `tooling-load` / `tool-short` /
  `tool-cover` "Fit the … to the bend" — and the Blades row's Fit to bend and
  emptied box (kept: the operator's own changes, now through `brakePatch`
  with the station, so they set or clear the hold). None in CadWorkspace.jsx
  (the session is built from the defaults and `brakeCarry`; the commit leaves
  the tools), the armed tries, the offset shape, `turnAround` or the horn try.
  The station's own Turn the sheet around trial and the grip's outcomes call
  `brakePatch` without a station: the trim stays, and as they keep the line
  (the opposite edge at the same line) that is the trim a held length gives.
- `lengthFix` reads the session's trim, now the one derived for this line:
  its labels stay true (a punch held at 376 on the §4 item 6 tray, then a new
  line: trim 6, the card "Shorten the punch to 348 mm", which sets the hold to
  348).
- `brakeCarry` carries the holds and the set trims beside the punch, die,
  way round and horns.
- `BladeLength` takes `hold`: with no line, "Length [380] mm · kept for the
  next bend" (disabled). The 3D view with no line still draws the tooling
  over the die's extent, as before.
- Pinned expectations of "a new line resets the trim" changed to the new
  rule (listed in the builder's report): `brakeHands.test.js` (the shared
  session patch's two reference rules and the finger drag), `bendQueue.test.js`
  (`brakeCarry`), `tightBends.test.js` and `tightBendsSeat.test.js`
  (`bendOnPatch`), `CadWorkspace.brake.dom.test.jsx` (a new L keeps 50 mm),
  `CadWorkspace.reach.dom.test.jsx` (the fingers keep the length).

Measured (`verify-brake-tool-length` step 7, the Length field): right edge,
L 29: 420.4 (fitted) → 380 typed: 380 (20.2 mm short at each end) → L 30: 380
→ the left edge, L 29: 380 → the next part, no line: 380 (kept for the next
bend) → its right edge, L 29: 380 (90 mm past each end) → Fit to bend: 200
(fitted) → L 40: 200 (fitted).

**Audit (2026-11-18).** One follow-up run of the punch-library builder. Read
against the source: `holdTools`, `oneRun`, `brakePatch`'s call, `brakeCarry`.
My own probe (scratchpad `tl2-audit.mjs`, every pick through `brakePatch`
with the station, then the station's own tooling): punch 380 and die 400 set
on the right edge at L 29 stay 380 / 400 through L 30, L 11, three finger
moves, the left edge, the bottom edge (a 605.4 mm bend: trims re-derived to
112.7 / 102.7), back, two points, a hit's cleared line and the next line;
Fit the punch → 420.4 and fitted on the next lines (605.4 on the bottom edge)
while the die stays 400; Esc after a drag restores the session exactly;
`bendOnPatch` names no trim and Bend on keeps 380; `brakeCarry` carries the
trim and the hold, and nothing for a session that never set a length, which
also gains no hold key. Rerun by me: the cad tests (148 files, 1752 passed),
lint on the five files touched, `verify-brake-tool-length` with step 7,
`verify-brake-hands-on`, `verify-bend-queue-bq1` (pass). The builder's: the
full suite (6951 passed, 1 skipped), the build, four more scripts. Seven
pinned expectations of the old reset rule were updated by the builder
(listed in its report: `brakeHands.test.js`, `bendQueue.test.js`,
`tightBends.test.js`, `tightBendsSeat.test.js`,
`CadWorkspace.brake.dom.test.jsx`, `CadWorkspace.reach.dom.test.jsx`).
