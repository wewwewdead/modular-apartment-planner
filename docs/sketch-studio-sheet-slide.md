# Sketch Studio press brake: slide the sheet under the punch

Status: spec, 2026-11-21. Phase **PK-3** of
`docs/sketch-studio-piece-pick.md` (its §9 outline, now asked for). Built
after PK-1 and PK-2 of that spec, on their code: read that spec first, and
`docs/sketch-studio-brake-tool-length.md` (TL-1, TL-2) and
`docs/sketch-studio-brake-hands-on.md` (the grip, the finger drag). One
builder run, audited after.

## 1. What the user said

Asked whether the slide by hand was wanted on top of "click the piece, it
comes to the punch": "I also want slide by hand, it should make the UX more
intuitive."

## 2. What it is

The punch stays where it is in the machine; the operator takes the sheet and
slides it left or right along the bed, so the punch stands off the middle of
the pieces it bends. Two uses in the shop:

- a section longer than the piece (100 mm on an 82 mm lip) hung off the
  sheet's free end, so it does not press the flange beside the lip (PK-1's
  `tool-over-flat` refuses it centred);
- a punch shortened to clear a standing side at one end only: slid away from
  that end, the other end of the bend is still pressed (TL-1 §5 left "a
  different trim at each end, or sliding the tooling along the bed" out).

Picking a piece (PK-1, PK-2) stays the way to say _what_ bends. The slide
only says _where the punch stands_ on it.

## 3. The model

One number, `slide`, in mm along the punch line, a → b: how far the middle of
the punch's runs stands from the middle of the pieces in the hit. 0 or absent:
centred (today).

- **Session** key `slide: 0` (`brakeSessionDefaults`), along the session
  line's own a → b (`sessionLine`).
- **Record**: optional `slide` on a bend record, written only when not 0,
  shared by a stroke's members as `punchTrim` is (`TRIM_KEYS` in
  `sheetMetal.js`), validated by `foldSheet` by name ("Bend 3 slide"), carried
  on the resolved bend. A bend-on record carries its own. A model without the
  key is unchanged byte for byte when re-saved. `CAD_VERSION` stays.
- **The punch only.** The punch, its holders and its horn sections stand
  `slide` off the middle. The die stays where its own length puts it, under
  the bend: a die under flat sheet presses nothing, so moving it buys
  nothing, and the die is "set up where the hit bends" on every hit already.
- **One flat stretch, whoever asks.** The stored step, re-checked or replayed
  (`sequenceChecks`, `rerunStroke`, the film, the job sheet), must put the
  punch on the same stretch of the flat blank the pending hit showed. Three
  things can turn the line end for end between the session and the fold and
  each must carry the sign: `flipBend` (a bend whose fixed side is its plus
  side is turned in `finishFold`: negate `slide` there), the frame's own
  `sign` (flat s → machine X), and Bend on (the session's line may run
  against the made bend's recorded a → b: the station writes the record's
  `slide` along the made bend's). §7 item 3 is the test of this.

Left and right in every word below are the operator's, standing in front of
the machine (the station's home view). One helper says which end of the line
is which for a given frame; nothing else decides it.

## 4. Geometry and checks

- `brakeFrame` and `strokeTooling`: the punch's runs are today's
  (`trimRuns(fitted, punchTrim)`) moved by `slide`; `dieRanges` unchanged.
  With `slide` 0 the output is bit for bit today's (existing tests
  unchanged).
- **On screen and in the collision check the machine does not move**: the
  ram, the bed, the frame and the punch stay; the sheet moves, the die's
  sections with it. In the frame's bend-centred coordinates that is the
  punch, the ram and the bed standing `slide` off; whether the frame is
  re-centred or the station is drawn shifted is the builder's choice, one
  place, said in the report. The ram and bed prisms of `toolingSections`
  stand where they are drawn. The camera does not move.
- The bend must still stand on the bed: `assessBend`'s `bed` refusal reads
  the bend's extent where the slide puts it ("The bend would stand 40 mm past
  the right end of the bed: slide the sheet back." with the fix "Centre the
  sheet").
- `assessBend` builds `cover` when a trim **or a slide** is set. Everything
  that reads it follows: `tool-cover` (bare, under half), `tool-short`,
  `tooling-load` (the length of punch under the bend), PK-1's
  `tool-over-flat`, the horn rule.
- **`tool-short-ends` per end** (`toolingCover.short` is per end already):
  equal ends, today's sentence, unchanged; otherwise "The punch stops 20 mm
  short of the left end of the bend: that end is not pressed and comes out a
  little open." (both ends short and unequal: both lengths named).
- **Fixes, only ones that work** (pure arithmetic on the runs and PK-1's
  `flat` stretches, so they are exact):
  - `tool-over-flat`: the smallest slide that takes the punch off every
    left-flat piece while it still covers the whole hit, when there is one:
    "Slide the sheet 5 mm to the left" (`session: { slide }`); else, with a
    slide set and the centred punch clear, "Centre the sheet"; else "Fit the
    punch to the bend".
  - `tool-cover` / `tool-short-ends` with a slide set: "Centre the sheet"
    when the same punch centred has no such finding; else as today.
- The collision card (`lengthFix`): with a slide set, the centred sheet is
  tried first ("Centre the sheet under the punch"), a button only when that
  trial passes; its other trials keep the session's slide. It does not search
  for slides (§9).
- The Length note (`BladeLength`): equal ends as today; otherwise
  `Length [100] mm · 18 mm past the left, flush at the right` (as built: an
  end a line, §11).
- `toolLengths` (sequence list, job sheet): a slid punch adds
  "9 mm off centre" (no left or right: a stored step does not say which way
  round the sheet went).

## 5. The session's rules (`brakePatch`)

- `slide` goes back to 0 on: a new edge, the mode, the points; a patch naming
  `skip` (a piece picked comes to the punch, centred); Turn sheet around;
  PK-1's fall-back to `pieceDefault` when a new L changes the pieces.
- It stays on: L moved with the pick kept (PK-1 §5.3), the angle, Flip sheet,
  the punch, the die, the lengths, the horns.
- A patch naming `slide` is not a new line; it disarms an armed try as a
  segment toggle does.
- `fingerRestore` names `slide` (Esc puts the line and the sheet back).
- `brakeCarry` does not carry it: the next part is placed afresh.

## 6. In the hand

### 6.1 The grip's third handle (`brakeGrip.js`, `brakeHands.js`, `shopLayer.js`)

Beside the hoop (Flip) and the ring (Turn): a straight arrow with a head at
each end, lying along the bed at the grip, same stroke, casing, rest strength
and 24 px reach as the other two, placed so the three read apart at the
station's view and at TOP / FRONT (judge on screenshots, as HO-1 did). Shown
whenever a line is picked. Name: **Slide sheet**.

- On approach the chip reads `Slide sheet · drag along the bed · centred`,
  or `… · 9 mm to the right`.
- **Drag**: the pointer's travel along the bed's axis on the canvas
  (`axisTravel`, the fingers' rule) is the slide: whole mm, 0.1 with Alt. The
  sheet follows the pointer at once (the layer moves it; the session patch
  goes once per frame, as the fingers' `onBrakeFingers({ distance })` does):
  `onBrakeSlide({ start } | { slide } | { end } | { cancel })`.
- **Detents**, within 6 px: centred; an end of the punch flush with an end of
  the pieces in the hit; an end of the punch at the near end of a left-flat
  piece (as far as it can hang toward it). Alt passes through them.
- The readout by the cursor: `Slide 9 mm right · punch 18 mm past the left
end, flush at the right` (the sheet 9 mm to the right puts the punch
  further left on it; this example first had the ends the wrong way round,
  §11); on centre `Slide 0 · centred`.
- The drag stops where less than `SHORTEST_SECTION` of the punch would stand
  over the pieces in the hit.
- Digits (with a leading minus: left) + Enter type the slide while the handle
  is in the hand; a click without a drag takes it in the hand to type, as the
  fingers do. Esc restores the slide the drag started from. A lost release
  ends the drag (state-machines rule 6). The checks and the card follow the
  settle; nothing of the station is worked out per pointer move.
- A slide set from the panel, a fix button or Esc glides in PK-2's
  `SLIDE_MS`.

### 6.2 The panel

Under the punch's Length line: `Slide [9] mm · to the right`, a number field
(`useNumericDraft`, spinner step 1, positive to the right, accessible name
"Sheet slide (mm)") and a **Centre** button when it is not 0. Disabled with
no line. No shift of the Blades row when the note changes; no sideways scroll
at 1366 × 768.

### 6.3 The flat blank

When the punch is not the fitted one centred (a trim or a slide is set), the
card draws where the punch stands: a bar beside the punch line over each of
its runs (`cad-map-punch`, the tooling's grey, never in a click's way). It
makes a length and a slide readable in plan at a glance.

### 6.4 The hint line

The grip's sentence becomes "Drag a ring to flip or turn the sheet, the
arrow to slide it" where it is shown; one line at 1366 × 768.

## 7. Acceptance

Unit tests (new `sheetSlide.test.js`; the lip tray of piece pick §3, the lip
alone in the hit unless said):

1. Punch 100 (trim −9), centred: `tool-over-flat` 5 mm with the fix "Slide
   the sheet 5 mm to the …"; applied: the punch's flat stretch is y 11 – 111
   on x = 410, clear, no warning. 9 mm further the same way (y 2 – 102):
   5 mm of the lip's inner end bare, the per-end sentence.
2. Punch fitted (82), slide 20 toward the free end: 20 mm bare at the inner
   end, the per-end sentence, "Centre the sheet" clears it; slide 45: under
   half, refused, "Centre the sheet".
3. One flat stretch: the pending hit's punch stretch (points on the blank)
   equals the stored step's after the commit, within 1e-6, for: the lip
   tray's edge 3; the same bent down (`flip`); a line whose bend `finishFold`
   turns (`flipBend`); a two-point line drawn b → a; Bend on with the
   session's line running against the made bend's record.
4. §5's rules, each: what resets, what keeps, Esc after a finger drag, no
   `slide` in `brakeCarry`.
5. TL-1's 600 × 400 tray, flanges 50, hit 3, punch 380: clear centred; slide
   12: the punch or its holder meets the standing side; the card's "Centre
   the sheet under the punch" clears it. Punch 380 slid 5: clear, 10.9 short
   at one end and 0.9 at the other, said per end.
6. The bed: a slide that takes the bend past the bed's end is refused with
   its fix.
7. Save → load keeps `slide`; a model without it is byte for byte the same;
   a `slide` that is not a number is refused by name.
8. With `slide` 0 every existing brake test passes unchanged.

DOM: the field, Centre, the Length note per end, the three fix buttons, the
card's punch bar. The grip: the third handle's pick, the chip, the readout,
the detents (pure, in `brakeHands.test.js`).

`scripts/verify-sheet-slide.mjs` (the style and blank of
`scripts/verify-piece-pick.mjs`, screenshots to
`artifacts/sketch-cad/sheet-slide`): pick the first lip; Length 100: the
card's sentence and "Slide the sheet 5 mm …" (screenshot); click it: the
sheet glides, the punch hangs off the free end, Bend enabled (screenshot);
drag the arrow 10 mm: the sheet's edge moves on the canvas and the punch
does not, the readout shows; Esc: back; type −3 in the hand; the panel
field and Centre; slide 5 again, Bend; reload: the sequence list reads
"100 mm, 5 mm off centre", the step re-checks clear, the replay shows the
sheet off centre under the punch. Pointer cost of the drag on a production
preview: within the fingers' budget. No page errors.

Rerun and pass: `verify-piece-pick`, `verify-brake-hands-on`,
`verify-brake-tool-length`, `verify-punch-library-pl1`,
`verify-tight-bends-tb1` … `tb3`, `verify-skin-gauge`.

All tests pass, lint 0 errors on `src/`, build green. Docs: "as built" notes
here; `docs/state-machines/cad-stations.md` (the `cad-brake` session key and
the drag, after reading `docs/state-machines.md`);
`docs/sheet-metal-shop-guide.md`; piece pick §9's outline replaced by a
pointer to this file.

## 8. Builder's report

Each judgment call named (where the slide enters the frame; the handle's
place and look, with screenshots; the left / right helper); each existing
expectation that changed, with old and new outcome; §7's numbers as
measured; tests, lint, build and scripts as run, failures included.

## 9. Not built

- The die sliding on its own, or a different length at each end of a tool.
- The collision card searching for a slide that clears a standing side
  (it tries only the centred sheet).
- Several punch stations along the bed (stage bending).
- The backgauge beam and fingers in the collision check.

## 10. Open, for the user

The die's sections move with the sheet on screen (the die is always set up
under the bend). If the shop's picture is a long die rail that stays put
while only the sheet moves, say so: it is a drawing change, not a model one.

## 11. As built (2026-11-21)

Built on PK-2's code; where this spec named a mechanism PK-2 already had,
PK-2's was kept and the behaviour here made to hold.

- **The model.** `slide` in the session (`brakeSessionDefaults`), on records
  only when not 0 (`sheetMetal.js` `slideOf`, "Bend 3 slide" / "Step 2
  slide" by name), in `TRIM_KEYS` (a stroke's members and `stepFold` carry
  it), turned with the line by `flipBend` (the bend and its hits). The
  station writes each record's slide along its own a → b
  (`brakeStation.js` `slideAlong`; a bend-on record along its made bend's
  record, `madeSlide`). §7 item 3 is `sheetSlide.test.js`: points on the
  blank, pending against stored, 1e-6.
- **Where the slide enters the frame: the frame is re-centred** on the punch
  (`brakeFrame`: the translation moves the part −sign × slide along X; the
  punch's `ranges` are today's numbers, the die's `dieRanges` and `span` go
  with the sheet). So the ram, the bed, the punch and its holders stand where
  they always do, on screen and in the collision check (which poses through
  the same frame), and PK-2's glide (a pose that differs only along X)
  carries every slide from the panel, a fix or Esc. `strokeTooling` reads the
  same in flat s (the punch shifted by `slide`, the die under the bend, on a
  bed centred on the punch) and returns `slide` and `line`.
- **Left and right: one helper**, `pressBrake.js` `endSide(sign, along)`:
  machine +X is the operator's right (X along the bed, Y to the backgauge, Z
  up). `sign` is the frame's own (`brakeFrame` returns it; `frameSign` gives
  it without posing, from the side to the back and the bend's direction,
  checked equal to the frame's for up, down, turned and both gauge sides).
  Confirmed on screen: the script projects machine +X rightwards on the
  canvas, and on the lip tray the flange is to the left of the lip, where
  "Slide the sheet 5 mm to the left" moves the punch away from it.
- **What the operator types and reads is the sheet's move** (positive to the
  right): the Sheet slide field, the arrow's chip and readout, the fixes'
  words. The station's `tooling.right` (±1) turns it into the session's
  slide along its line. **This spec disagrees with itself here**: §6.1's
  readout example "Slide 9 mm right · punch 18 mm past the right end, flush
  at the left" reads "right" as the punch's offset, while §6.1 also says the
  sheet follows the pointer; with the sheet's move, a sheet 9 mm right puts
  a 100 mm punch on an 82 mm lip 18 mm past the **left** end, and that is
  what the readout says.
- **The checks.** `assessBend` builds `cover` with a slide; `tool-over-flat`'s
  fix is `clearSlide` (the smallest slide off every piece left flat that
  still covers every piece in the hit), "Slide the sheet 5 mm to the left",
  or "to 5 mm left of centre" when already slid; `tool-cover`,
  `tool-short-ends` (per end, `endSide`) and the new bed refusal ("The bend
  would stand 96 mm past the left end of the bed: slide the sheet back.")
  offer "Centre the sheet"; `lengthFix` tries the centred sheet first ("Centre
  the sheet under the punch"). Stored steps (no side known) say "one end".
  `toolLengths`: "100 mm, 5 mm off centre" (a fitted punch slid: its length).
- **Panel**: `SheetSlide` under the punch's Length (its own Centre button,
  kept in place when idle); the Length note per end when the ends differ
  ("4 mm past the left, 14 mm past the right", §11.1). **Card**: the punch
  bar (`cad-map-punch`) when a trim or a slide is set.
- **The handle** (`brakeGrip.js`): a straight arrow, a head at each end, the
  rings' stroke, casing and rest strength, coloured as the bed's X, lying flat
  80 px along the bed from the rings' centre and 10 px toward the operator,
  60 px end to end. Screenshots: `artifacts/sketch-cad/sheet-slide/`
  02-slid-punch-off-the-free-end.png, 03-arrow-in-the-hand.png. The drag
  (`CadViewport.jsx` `slidePress`) is the fingers' pattern; a click opens the
  panel's field. In the hand the sheet is drawn under the pointer every
  move (`shopLayer.js` `slideTo`), the punch line and the left-flat stretches
  stay drawn, nothing glides; the release glides it onto its pose.
- **Detents** (`brakeHands.js` `slideOffer`, `slideSnap`): centred, the
  punch's ends flush with the pieces' ends, the punch's end at the near end
  of a piece left flat, within 6 px (Alt passes); the drag stops where less
  than 10 mm of the punch stands over the pieces.
- **The hint line** reads "Drag a ring to flip or turn the sheet, the arrow
  to slide it · …" where the rings' sentence was; with several pieces the
  pieces' sentence (piece pick §6.4) still takes its place.
- **§7's numbers as measured.** Item 1: fix −5 (to the left), punch y 11 –
  111 on x = 410, clear, no warning; 9 mm further, 5 mm bare at the left end
  (the per-end warning carries "Centre the sheet": the centred punch runs
  past both ends). Item 2: slid 20, 20 mm short at the left end + Centre;
  slid 45, "stands over 37 mm of the 82 mm bend", refused, Centre. Item 5:
  slid 12, the punch or its holder meets the side, "Centre the sheet under
  the punch"; slid 5, 10.9 and 0.9 short, per end. Item 6: the 50 t press's
  bed is 2090 mm (not 2000): slid 1100 to the left, 96 mm past the left end.
- **Pointer cost** (vite preview, 1366 × 768, the lip alone): the arrow 7.91 ms a
  position (mean of 16), the fingers 6.69 (20), the card's punch line 5.33 (30):
  within 2 ms of the fingers. A render of its own per pointer move cost about
  3 ms more; the held sheet is drawn with the pose each patch brings (one a
  frame), and a slide alone rebuilds no tooling (the die is built centred and
  moved along the bed).
- **Not judged on screenshots at TOP / FRONT**: only the station's view was
  shot (`artifacts/sketch-cad/sheet-slide-preview/02-slid-punch-off-the-free-end.png`).
- **Not built**: a slide on an offset's pair (Bend shape Offset makes its
  two hits centred); the collision card does not name the centred sheet
  among what was tried when it does not clear.

### 11.1 Audit (2026-11-21)

- **"One flat stretch" probed from the session alone** (the line's a → b, the
  pieces in the hit, the trim, the slide; no `strokeTooling`): 21 hits on the
  lip tray and a plain plate (each gauge edge, Flip sheet, `turned`, the real
  Turn sheet around, two points either way, lip + flange in one hit, Bend on
  either way with either sign). In each the pending hit and the stored step
  name that stretch, and the points of it sent through the posed fold and the
  frame's matrix land on the punch's `ranges` (and the bend's ends on
  `dieRanges`), for the pending view and for `rerunStroke`'s.
- **The builder's reading of "right" stands** (the sheet's move); §6.1's
  example is corrected above.
- **An offset bend and a slide** (found in the audit, fixed): the session
  kept its slide while the pair's records left it out, so the field and the
  arrow showed a slide nothing was drawn or checked with. Now the shape
  becoming an offset puts the slide back to 0 (`brakePatch`), and the pair's
  `tooling` has no `right`, which is what the field ("an offset stays
  centred", disabled), the arrow (`slideOffer`: not offered) and
  `brakeSlide` read.
- **The Length note per end was cut off** in the punch's column ("18 mm past
  the left end, fl…"; a kiosk has no hover for the title). Now an end a
  line, in the words of "short at each end" ("4 mm past the left," /
  "14 mm past the right"; "10.9 mm short at the left," / "0.9 mm short at
  the right"), and the punch's Length block always keeps the room for both
  lines, so nothing under it moves when the sheet is slid.
