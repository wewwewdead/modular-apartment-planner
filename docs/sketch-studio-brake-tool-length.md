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
reset to null wherever `skip` is reset (the line changed). They ride in the
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
