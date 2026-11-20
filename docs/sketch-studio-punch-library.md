# Sketch Studio press brake: the punch library (horn sections and what else the rack needs)

Status: 2026-11-17. Research and the programme are in §2 – §3; **PL-1 (horn
sections)** is specified in §4 and goes to the builder first. PL-2 … PL-4 are
outlined in §5 and are refined one at a time, each after the audit of the one
before (the way TB-2 and SP-2 were).

## 1. What the user asked for

2026-11-17, with a photo of two short punch sections that carry a thin tip
strip past one end ("horn punch, or box punch with horn") and a screenshot of
a tray's corner: "I can't bend it using a normal punch because at the edge of
the tray it will hit, so I need a narrow edge of the punch." Then: research
every kind of punch needed "to bend all possible things", the horn among
them, "so I don't go back again and request a new punch when I meet another
blind spot."

## 2. Research

### 2.1 What a horn section is (sources: §2.4)

A sectioned punch set is one profile cut into lengths that are built up to
the bend: Tecnostamp's Amada-Promecam set is 805 mm as **100 L, 100, 50, 40,
20, 15, 10, 370, 100 R**; Amada's own is 100, 10, 15, 15, 20, 40, 50, 150,
300, 100 = 800. The two 100 mm end pieces are the **horns** (ears,
"scarpette"): the tip runs **20 mm past the body**, **10 mm high** at its end
(15 mm on some profiles), the body above it relieved on an **R 25** arc. The
horn tip reaches into a corner where something of the part stands over the
end of the bend line: an inward lip on the side wall, a hem, a wall bent past
90°, the returns of a closed box. **The horn sections carry 50 % of the
punch's load.** "Moving horns" (sections whose horns swing in) exist to let a
box with returns all round off the punch; a fixed horn's box is slid along
the punch or sprung off.

A plain tray (walls square, no lips) does not need horns: a punch built up a
little shorter than the inside width stands between the walls, and the last
millimetre at each corner is not pressed. That is what the simulator already
does (it fits the punch to the bend, brake tool length TL-1).

### 2.2 What the simulator does today (probed 2026-11-17, scratchpad `horn-probe.mjs`)

400 × 300 base, t 1.2, side walls 30 deep bent first, then the flange between
them (its line 396 mm long), straight punch:

| The sides                | The flange between them                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plain walls              | clear, punch fitted ±198: no horn needed                                                                                                                                                |
| walls with 10 mm lips in | the punch meets the lips coming down; gooseneck and A 101 too; the card offers "Shorten the punch to 376 mm" (10 mm of the bend unpressed at each end) or "Make this hit before bend 3" |
| walls with 15 mm lips in | the same; "Shorten the punch to 356 mm" (20 mm unpressed at each end)                                                                                                                   |

So the gap is real exactly where the shop reaches for the horn: something
over the ends of the bend. Today the only tool answer leaves the corners
unbent.

### 2.3 Every kind of upper tool, and where the simulator stands

What a part asks for → the tool that answers it → the simulator today.

| The part has…                                                            | The shop uses                                                            | Simulator today                                                      | Phase |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ----- |
| ordinary bends                                                           | straight punch 85 – 90°                                                  | Straight 88°, sharp, tall                                            | have  |
| a flange already standing that swings into the punch (channels, returns) | gooseneck / swan neck, shallow to deep                                   | Gooseneck, deep gooseneck, the shop's A 101 / A 102 / A 108          | have  |
| bends past 90°                                                           | acute punch 26 – 35° in an acute die                                     | Acute 30°, the shop's A 103                                          | have  |
| a large inside radius                                                    | radius punch, or bump hits                                               | Radius R10 – R30, bump bending                                       | have  |
| the punch too long between two walls                                     | sectioned punch built to length                                          | fitted automatically; Length field (TL-1)                            | have  |
| **something over the ends of the bend** (lips, hems, closed box)         | **horn (ear) end sections**                                              | only "shorten the punch", corners unpressed                          | PL-1  |
| **an edge folded flat on itself** (hem: safe edge, stiffener)            | acute pre-bend, then a **flattening (hemming) tool**                     | a bend stops at 150°; no flattening                                  | PL-3  |
| **walls deeper than the punch is tall** (deep boxes)                     | tall punch, **punch extender 100 – 200 mm** (punch height ≥ depth × 1.7) | tallest set-up 245 mm, sides to about 150 mm; the ram stops the rest | PL-4  |
| **a narrow channel** a gooseneck cannot enter                            | **sash / narrow punch** (thin offset blade)                              | none                                                                 | PL-2  |
| **a small step** (offset under the die's minimum leg)                    | **joggle (Z) tool**, one hit                                             | Offset bend in two hits: the web must carry on the die               | PL-5  |
| a return so deep it must pass through the punch                          | window punch (a cut-out in the body), made for the job                   | none: said so, not built (§6)                                        | —     |
| rolled edges, beads, ribs, louvres, embossing                            | forming tools, not bending tools                                         | none: said so, not built (§6)                                        | —     |
| marks kept off the sheet                                                 | urethane pads, rotary (wing) dies                                        | not modelled (no marking in the simulator)                           | —     |

The lower tool decides as much as the punch: the V's width (minimum leg, the
simulator has the family), a hemming die (PL-2), a tall or narrow die and
risers for long down-flanges (to look at with PL-3).

### 2.4 Sources

- Tecnostamp "Red Line – Amada-Promecam Style" catalogue
  (pilses.com/image/catalog/catalogos-pdf/utillaje-amada-promecam.pdf),
  printed p. 13: the sectioned set and the horn drawing (20, R = 25, 10 / 15),
  "the max load of the horn extensions is 50% of the max load of the punch";
  p. 14 moving horns; hemming tools at the back. Read with PyMuPDF and by eye
  on the rendered page.
- Amada tooling catalogue 2023 (sectioned punch 100, 10, 15, 15, 20, 40, 50,
  150, 300, 100 = 800, the 100s the ears): from a search summary, not read.
- Mate, "Press brake forming insights: the return flange goes deep": reliefs,
  windows, the limit of horns beside deep returns.
- Wila, "9 strategies for winning the part collision battle" and "Box
  bending": punch height = part depth × 1.7, extenders 100 – 200 mm, 152 mm of
  working space for boxes.

## 3. The programme

PL-1 horn sections (§4) → PL-2 sash punch → PL-3 hems → PL-4 deep boxes →
PL-5 joggle tool (§5; reordered 2026-11-17 on the user's answers, §7). One builder run each, audited between.

## 4. PL-1 — horn sections

### 4.1 The model

- `HORN` (shopCatalog.js): `{ reach: 20, tip: 10, radius: 25, load: 0.5 }`,
  frozen, with the source. `hornProfile(s)`: the height of the horn's top
  above the punch tip at `s` mm in from the horn's end, 0 ≤ s ≤ reach:
  `hornRise − sqrt(radius² − (reach − s − radius)²)`, with
  `hornRise = tip + sqrt(radius² − (radius − reach)²)` = 34.49 mm (exported):
  the R 25 arc from the horn's end (10 high) to the body's end face, where it
  stands vertical. Checked: s = 0 → 10, s = 5 → 11.58, s = 15 → 19.49,
  s = 20 → 34.49.
- A punch takes horns unless it is a radius punch (`round`).
- Session `horns: false` (brakeSessionDefaults); on the bend record
  `horns: true` only when set (as `punchTrim` is: a hit without horns is saved
  as before; a bend-on record carries its own). Horns are tooling: a new line
  keeps them, `brakeCarry` carries them with the punch, choosing a radius
  punch clears them (`punchChoice`).
- Horns stand at **both ends of every run** of the punch (as a trim cuts both
  ends). A run shorter than `2 × reach + SHORTEST_SECTION` (50 mm) refuses:
  "Horn sections need a bend of at least 50 mm: this one is {l} mm." (code
  `horn-short`).

### 4.2 Geometry (`toolingSections`, brakeCollisions.js)

- New option `horns` (boolean). With it, over each punch run [x0, x1]: the
  **body** (the full section) and the **holders** stand over [x0 + reach,
  x1 − reach]; each end is a **horn**: the punch's section cut off above the
  horn's top, in `HORN_SLICES = 5` slices along the bed, each slice the
  section clipped at the height of its inner end (`hornProfile`, the taller
  one: the slices never stand lower than the real horn). Clip with the
  polygon-clipping library the fold already uses; every ring that comes back
  is a part.
- `tools.punch` gains `parts: [{ ring, ranges, horn: true }]` beside its own
  `ring` / `ranges` (the body). Without `horns` nothing changes: no `parts`
  key, the same object as today (a parity test).
- `brakeFrame` passes the bend's `horns` through; the die is untouched.

### 4.3 The checks

- A horn part is a part of the punch: a contact with it is a `punch` hit with
  `horn: true` on the result, and the message says "the punch's horn".
- **How a box goes on the horns.** A horn stands under what overhangs it, so
  it cannot come down from above the part or lift 40 mm off it. The shop
  slides the box onto the horns with the punch held just over the sheet. So a
  horn part is swept, on the approach and on the return, only between the
  stroke and `HORN_GAP = 5` mm above the sheet (the body, the holders and the
  ram are swept as today: from above, and back up `STROKE_GAP` with the
  take-off slants). During the stroke the horn is checked at every sample as
  every tool is.
- When the horn parts pass only because of that (swept as the body is, they
  would meet the part), the collision result carries `hooked: true` and the
  pending hit a warning (code `horn-hooked`): "The part stands over the
  horns: slide it onto them under the punch, and off again along the punch
  (or spring it off). The brake checks the stroke, not that."
- **Load.** With horns the punch's rating in `toolingLimit` and the
  `tooling-load` refusal is `HORN.load ×` its own; the refusal names it: "…
  the punch with horn sections is rated {n} kN/m (half the punch's) …".
- `sequenceChecks`, `rerunStroke`, the armed tries, the film: a stored step
  is checked and posed with its record's `horns`.

### 4.4 The station and the panel

- **Blades row** (PressBrakePanel.jsx, under the punch's Length): a checkbox
  **Horn sections at the ends** (`aria-label` the same; disabled with a
  radius punch, title "A radius punch has no horn sections"). On, a note
  (`role="note"`, `aria-label="Horn sections"`): "The tip runs 20 mm past the
  punch body at each end, 10 mm high: it reaches under a lip. Half the
  punch's load ({n} kN/m)."
- **The card.** When the punch meets the part at its ends (the condition
  `lengthFix` has) and the session has no horns, the station tries the hit
  with `horns: true` first; when it passes every check the collision carries
  `horn: { label: 'Use horn sections at the ends', session: { horns: true } }`
  and the card shows it before "Shorten the punch to …" (which stays: it is
  still true). Title: "Tried with horn sections, the hit clears: the corners
  are pressed".
- **Sequence row and job sheet**: the tooling line of a step made with horns
  reads "… · horn sections".
- **3D** (shopLayer.js `buildTooling`): the horn parts drawn as the body is
  (each part's ring over its ranges), so the scene shows the tip running
  under the lip and the body standing back. **Side view**: its caption gains
  "· horn sections".

### 4.5 Not in PL-1

A horn at one end only; the 15 mm horn; moving horns; checking how the box
comes off (§4.3 says so in words); a stored row's "make this step with horn
sections" try; building the punch from the catalogue's section lengths.

### 4.6 Acceptance — `scripts/verify-punch-library-pl1.mjs`

Screenshots into `artifacts/sketch-cad/punch-library-pl1`, 1600 × 1000 and
1366 × 768. The §2.2 tray (outline in `horn-probe.mjs`: base 400 × 300,
t 1.2, walls 30 deep, lips 15, relief 2 × 4 at the corners), lips and walls
made, the flange's line by two points (2, 300) → (398, 300):

1. Straight punch, no horns → the collision card; its first button "Use horn
   sections at the ends", then "Shorten the punch to 356 mm".
2. Click it → the checkbox on, the note of §4.4, "Clear through …", the
   `horn-hooked` warning; the 3D view shows the horn under the lip (a
   close-up screenshot from the end of the punch).
3. Pedal → the row's tooling line ends "· horn sections"; the folded part's
   flange is bent over its whole length (no "ends not pressed" note).
4. Lips 15 on walls 20 deep (a second part): with horns the punch still
   meets the lip (the horn is 10 mm high and rises); the card says so and
   offers no horn button. (My estimate, not measured: if the built check
   clears it, report the numbers and use walls 15 deep.)
5. The plain tray: no horn button, the fitted punch clears as before.
6. Horns on a 40 mm bend → the `horn-short` refusal. A radius punch chosen →
   the checkbox off and disabled.
7. A load case: the same hit on thick stock where the plain punch passes and
   horns do not → the `tooling-load` refusal with its words.
8. Save, reload → the row still reads "· horn sections"; Re-run the step:
   the horns are in the scene.
9. Job sheet: the step's line names the horn sections. No page error.

Unit tests (`brakeHorns.test.js`): `hornProfile` (10 at the end, 34.49 at the
body, the arc's mid values to 0.01); `toolingSections` with and without horns
(parity without; body and holders 20 mm shorter each end; five slices each
end, each no lower than the real horn); the §2.2 table through
`brakeCollisions` (lips 10 and 15: clear with horns, `hooked`; walls 20 deep:
the horn meets the lip); the load rule; `horn-short`; the record written only
when set; `brakeCarry` and `punchChoice`; a stored step with horns re-checked
by `sequenceChecks`. DOM tests: the checkbox and note, the card's button
order, the row's line. Every existing brake verify script still passes, and
no existing test's expected value changes: a session without horns must
behave bit for bit as today — if one does change, stop and report it.

### 4.7 PL-1 as built

Built 2026-11-17 as specified; the rule of §4.3 holds everywhere. Where the
code asked for a call the spec did not make:

- **Where the code is.** `HORN`, `hornRise`, `hornProfile` (shopCatalog.js);
  `HORN_GAP` beside `STROKE_GAP` (pressBrake.js); `HORN_SLICES` and the slices
  (brakeCollisions.js: the punch's section cut by `polygon-clipping` below
  each slice's top, worked out once per punch and way round). A run shorter
  than two horns (refused, `horn-short`) is drawn and checked with each horn
  over half of it and no body, as a refused hit is still checked.
- **The limited sweep in `meets`.** It fitted: a horn part is swept by
  `hornLift` = HORN_GAP + t − tipZ (the body by its own sweep), coming down
  and going back up; on the return it follows the take-off slant the body is
  tried along. The hooked test (`meets('punch', slant, full)`: the horn parts
  alone, swept as the body is, along the slant the part came off, 0 when
  straight) runs only in a sweep that passed every tool. `hooked` is kept
  when a later pose collides (the card then shows the collision and the
  warning both). Without horns `meets` makes the same tests in the same order.
- **Speed.** The ten slices per run cost +67 % on the plain tray's check when
  each was tested alone; each triangle is now tested first against the whole
  section over each horn's 20 mm (every slice is a part of it there, so
  nothing is missed) and only then slice by slice. Measured (node, the
  pending hit's check alone, `advise: false`, median of 25):

  | Tray                | Without horns                         | With horns                       |
  | ------------------- | ------------------------------------- | -------------------------------- |
  | plain walls 30      | 4.6 ms (26 poses, clear)              | 5.3 ms (26 poses, clear)         |
  | lips 15 (reference) | 0.08 ms (1 pose: met on the approach) | 6.7 ms (26 poses, clear, hooked) |

  The whole advised station on the reference tray without horns (the card's
  tries, the horn try among them) takes about 97 ms; with horns, clear, 8 ms.

- **`horn: true`** on a punch hit only when every contact is with a horn part
  (none with the body). A punch or holder hit with horns carries the punch's
  whole runs (`runs`), horns and all, so the length fix still sees its ends.
- **The card's try** uses the length fix's own test of "the contact is at the
  punch's ends" (now `contactAtEnds`, the same code), with the horn's reach
  (20 mm) as the end. The card's text is unchanged (only the button); the
  horn button counts as a remedy offered, so try 3 (the last resort, shop
  punches §6.2) is not searched when it is on the card.
- **The load refusal's remedy.** With horns the weaker tool's words end "Use
  a wider die, or bend it without horn sections." ("or the straight punch
  (1000 kN/m)" would be untrue: the straight punch with horns is 500). No fix
  button (none asked for).
- **`horn-short`**'s length is the shortest punch run (after any trim).
  `foldSheet` refuses horns on a radius punch's record by name ("Bend 3: a
  radius punch has no horn sections."); the station never writes one.
- **Records.** `horns: true` rides where the trims do: the pending `base`, a
  bend-on hit's record (its own), the resolved and posed fold bend, its
  `hits`, `hitSequence`'s step, `stepFold`, and the entry that finishes a
  step opened part-way (`finishOf`). `brakeFrame` returns `horns: true` only
  when set.
- **The view.** `buildTooling` draws the body and holders over their runs and
  each horn part over its own (`press-brake-punch-horn`, in the punch group,
  so a collision paints them red with it); `cadShop().station` gains
  `horns` and `hornParts` and the drawn punch key ends `:horns`. The side view
  caption ends "· horn sections". The film's titles are unchanged (it poses
  from the same records). The close-up of §4.6 item 2 is taken as the pedal's
  stroke starts its bend: the clear hit is shown parked 40 mm above the
  sheet.
- **Not wired:** the offset shape's pending pair carries horns on both hits
  and is checked with them, but gets neither the card's horn try nor the
  hooked warning (the offset's own card has no length fix either).
- **§4.6 item 4** (an estimate) holds as measured: with horns the horn meets
  15 mm lips on walls 20 deep as the ram comes down (and on walls 15).

The §2.2 table on the built code (straight punch; the pending check):

| The sides           | Without horns                                                          | With horns                                                     |
| ------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| plain walls 30      | clear                                                                  | clear, not hooked                                              |
| lips 10 on walls 30 | punch, approach (0°); card: horn button, "Shorten the punch to 376 mm" | clear, `hooked`                                                |
| lips 15 on walls 30 | punch, approach (0°); card: horn button, "Shorten the punch to 356 mm" | clear, `hooked`                                                |
| lips 15 on walls 20 | punch, approach (0°); no horn button                                   | the punch's horn (`horn: true`), approach (0°); no horn button |

**Audit (2026-11-17).** One builder run. Read against the source:
`HORN` / `hornProfile`, the horn parts in `toolingSections`, the load rule in
`assessBend`, `hornFix`, the station's warning. My own probe (scratchpad
`pl1-audit.mjs`): the profile 10 / 11.58 / 14.49 / 19.49 / 34.49 at 0 / 5 /
10 / 15 / 20; without horns no `parts` key; with them the body and holders
±178 of a ±198 run and five slices each end, tops 11.17, 13.14, 16.16, 20.93,
34.49 (never under the arc); plain walls clear either way; lips 10 and 15 on
walls 30 clear with horns, `hooked`; lips 19 meet the horn and lips 22 the
body (the horn reaches 20), each offered a shorter punch that clears; lips 15
on walls 20 meet the horn; a 40 mm bend `horn-short`; `brakeCarry` and
`punchChoice`. **One audit fix of mine:** the card offered the horn button
but its sentence did not name it; `triedAdvice` now says "… use horn
sections at the ends or shorten the punch to 356 mm." That changes one
pinned string of TL-1 (`brakeToolLength.test.js`, the return-lips case,
which is this very case). Rerun by me: the cad tests (148 files, 1728
passed), lint and prettier on `brakeStation.js`, `verify-punch-library-pl1`,
`verify-brake-tool-length`, `verify-shop-punches-sp2`,
`verify-tight-bends-tb3` (pass); the card and the close-up screenshots read
by eye. The builder's: the full suite (6926 passed; one load-sensitive
timing test in `shadowProjection.test.js` failed under load and passes
alone), the build, the other seven scripts. Known wart: the scene draws the
horn as its five check slices (a staircase), not the R 25 arc.

### 4.8 PL-1.1 — horn lengths (2026-11-17)

**What the user asked.** "Make the horn punch more length to choose … right
now it is fixed only to 20 mm. Is 20 mm the limit?" (They also dropped the
sash punch, §5.)

**What the catalogues draw** (each read from its PDF, the page rendered and
read by eye; a horn is a cantilever, so a longer one is made taller):

| Horn                                             | Past the body | High at its end                             | Top                                           | Section |
| ------------------------------------------------ | ------------- | ------------------------------------------- | --------------------------------------------- | ------- |
| Tecnostamp (p. 13), Selmach "milled horn" (p. 4) | 20            | 10 (Selmach 9; 15 on some Tecnostamp codes) | R 25 arc up to the body                       | 100     |
| Mate horns scheme (p. 24)                        | 20            | 15                                          | R 12.5                                        | —       |
| Selmach moving horn (p. 5)                       | 20            | 10                                          | R 25                                          | 150     |
| AccurTool Horn A (p. 4)                          | 25            | 10                                          | straight slope to 25 at the body, R 10 fillet | 100     |
| AccurTool Horn B (p. 4)                          | 30            | 10                                          | straight slope to 25 at the body, R 10 fillet | 100     |
| Selmach "special horn", on request (p. 6)        | 55            | 45                                          | flat, R 20 fillet to the body                 | 150     |

So 20 mm is the common standard, not the limit: stock horns run 20 – 30 mm
at about 10 mm high, and a longer horn is a special that is much taller (55
long is 45 high), which only goes under a lip standing more than 50 mm over
the sheet. No catalogue read states a maximum; none rates a horn above the
"50 % of the punch" Tecnostamp prints (taken for all four: assumed for the
other three). An Amada horn of about 35 × 10 came up in a search summary
only: not read, not built.

**The build.**

- `HORNS` (shopCatalog.js), keyed by the reach in mm, frozen, each with its
  source: `20` { reach 20, tip 10, radius 25, section 100, load 0.5, name
  'Standard 20 mm' } (today's `HORN`, which stays exported as `HORNS[20]`);
  `25` { reach 25, tip 10, top [[0, 10], [20, 22], [25, 35]], section 100,
  name '25 mm' }; `30` { reach 30, tip 10, top [[0, 10], [25, 22.5], [30,
35]], section 100, name '30 mm' }; `55` { reach 55, tip 45, radius 20,
  section 150, name 'Special 55 mm' }. `top`: the horn's top as points [mm in
  from its end, height], straight between them (the slope, then the fillet
  taken as a step up to its top: never under the drawing).
- `hornProfile(s, horn = HORN)`: with `top`, the height on that line; else
  the arc, generalised so the special's flat top holds: `d = reach − s`,
  `rise = tip + sqrt(radius² − max(0, radius − reach)²)`, height `tip` where
  `d ≥ radius`, else `rise − sqrt(radius² − (radius − d)²)`. For the standard
  horn it returns exactly what it returns today (a parity test). `hornRise`
  stays the standard's.
- `hornOf(value)`: `true` → `HORNS[20]` (records saved today), a key →
  its entry, anything else → null. Session `horns`: false, or a key (20, 25,
  30, 55); the record carries the key (`true` still read). Everything that
  took `horns` as a boolean takes it through `hornOf`: `toolingSections`
  (body and holders stand back by that horn's reach; slices no wider than
  4 mm, each as high as the profile's highest point over it), `assessBend`
  (the load; `horn-short` at `2 × reach + SHORTEST_SECTION`: 50, 60, 70,
  120 mm), `brakeFrame`, `brakeCarry`, `punchChoice`, the scene, the film.
- **Panel.** With the box on, a select **Horn length** beside it: "20 mm ·
  10 high (standard)", "25 mm · 10 high", "30 mm · 10 high", "55 mm · 45
  high (special)". The note reads the chosen horn: "The tip runs {reach} mm
  past the punch body at each end, {tip} mm high: it reaches under a lip.
  Half the punch's load ({n} kN/m)." Ticking the box chooses the standard.
- **The card.** `hornFix` tries the horns shortest first and offers the
  first that passes every check: "Use horn sections at the ends" for the
  standard (as today), "Use {reach} mm horn sections at the ends" for the
  others. With horns already on and the horn or the body met at the punch's
  ends, it tries the longer ones the same way: "Use {reach} mm horn sections
  at the ends". The card's sentence names what is offered, as it does now.
- **Words.** The standard horn reads as today everywhere ("· horn
  sections"); another reads "· {reach} mm horn sections" (row, job sheet,
  side view).
- **Scene.** The horn is drawn to its real profile in slices 1 mm wide (the
  check keeps its coarser, never-lower slices), so it reads as the arc or
  the slope, not as stairs.

**Acceptance** — the PL-1 script gains steps, the PL-1 unit file cases:
lips 19 on walls 30 (met by the standard horn, §4.7's audit): the card
offers "Use 25 mm horn sections at the ends" or the 30, whichever first
clears (measure and say which); lips 22: the 25 or 30 mm horn; lips 28:
the 30 mm horn or nothing; lips 40 on walls 60: "Use 55 mm horn sections
at the ends"; lips 40 on walls 30: no horn clears, the card says so by
offering none. `hornProfile` for each horn at its points; the slices never
under the profile; `horn-short` per horn; a record with `horns: true` still
folds, checks and reads "· horn sections"; a record with `horns: 30` saved,
reloaded and re-run. The standard horn's every PL-1 expectation unchanged:
if one changes, stop and report it.

**As built** (2026-11-17). As specified, with these calls:

- **The standard stays `true`.** The checkbox, the card's standard button
  and `brakeCarry` keep writing `horns: true` (PL-1 pins each of them), and
  choosing "20 mm" in the select writes `true` too (`hornSetting`); a record
  or session holding `20` reads as the standard. The other horns are their
  key, a number. `sheetMetal.js` keeps a record's value (true, or the
  reach) and refuses one the rack does not hold: "Bend 3: there are no 17 mm
  horn sections in the rack."
- **One PL-1 expectation changed, as §4.8 asks:** `HORNS[20]` carries
  `section` and `name`, and `HORN` is `HORNS[20]`, so `brakeHorns.test.js`
  line 118, `expect(HORN).toEqual({ reach: 20, tip: 10, radius: 25, load:
0.5 })`, fails (left as it was, reported). Every other PL-1 expectation
  holds; `hornProfile` for the standard is bit for bit PL-1's (a test over
  −1 … 21 mm), and its five check slices are the same.
- **Slices.** A horn is cut into ⌈reach / 4⌉ slices of equal width (25 mm:
  7 of 3.57; 30: 8 of 3.75; 55: 14 of 3.93), each as high as the profile's
  highest point over it (its ends and any corner of a sloped top between).
  The scene draws the same slices at most 1 mm wide (`HORN_DRAWN_SLICE`):
  40 meshes for the standard over one run, 110 for the special.
- **Words.** `hornWords`: "horn sections" for the standard, "30 mm horn
  sections" for the others, used by the row, the job sheet, the side view,
  the load refusal ("… the Straight 88° punch with 30 mm horn sections is
  rated …") and `horn-short` ("30 mm horn sections need a bend of at least
  70 mm: …"); the standard's words are unchanged.
- **The card.** Each horn is tried only where the contact lies within its
  reach of the punch's ends; with horns on, only the longer ones, for a
  punch or holder hit (the horn or the body). `triedAdvice` (the audit's
  change) names whichever horn is offered.
- **The film** poses from the same records, so it draws the record's horn;
  its titles are unchanged.

Measured (node, the card with no horns on; each horn's own check):

| Tray              | Card offers                         | 20 mm      | 25 mm         | 30 mm         | 55 mm         |
| ----------------- | ----------------------------------- | ---------- | ------------- | ------------- | ------------- |
| lips 19, walls 30 | Use 25 mm horn sections at the ends | horn meets | clear, hooked | clear, hooked | horn meets    |
| lips 22, walls 30 | Use 30 mm horn sections at the ends | body meets | horn meets    | clear, hooked | horn meets    |
| lips 28, walls 30 | none (Shorten the punch to 316 mm)  | body meets | body meets    | horn meets    | horn meets    |
| lips 40, walls 60 | Use 55 mm horn sections at the ends | body meets | body meets    | body meets    | clear, hooked |
| lips 40, walls 30 | none (Shorten the punch to 316 mm)  | body meets | body meets    | body meets    | horn meets    |
| lips 15, walls 20 | none                                | horn meets | horn meets    | horn meets    | horn meets    |

Every contact is the punch's, as the ram comes down (0°). The 55 mm horn's
check on lips 40 / walls 60 (clear, 26 poses): 5.5 ms median.

**Audit (2026-11-17).** One follow-up run of the PL-1 builder. My own probe
(scratchpad `pl11-audit.mjs`): `HORN === HORNS[20]`; each horn's profile at
its points (25: 10 → 22 at 20 → 35; 30: 10 → 22.5 at 25 → 35; 55: 45 flat to
35, 65 at the body); the check slices 5 / 7 / 8 / 14, none under the profile
at five samples each; the body ±178 / ±173 / ±168 / ±143 of a ±198 run; the
table above reproduced cell for cell (lips 19 → the card offers 25; lips 22
→ 30; lips 28 → none; lips 40 on walls 60 → 55; lips 40 on walls 30 → none;
lips 15 → the standard, as PL-1); with the standard on and lips 19 the card
offers the 25; a stored `horns: true` and `horns: 30` fold, `horns: 17` is
refused by name. **One audit change of mine:** the pinned
`expect(HORN).toEqual({ reach, tip, radius, load })` in `brakeHorns.test.js`
became `toMatchObject` (the standard horn now carries `section` and `name`:
this spec's own change, reported by the builder, not edited by it). Rerun by
me: the cad tests (148 files, 1743 passed), lint on the eight files touched,
`verify-punch-library-pl1` with its new steps and `verify-brake-tool-length`
(pass); the 30 and 55 mm close-ups read by eye (the slope and the tall block
under their lips; the 1 mm slices show as fine ribs). The builder's: the
full suite (6941 passed, the one pin above failing before my change), the
build, three more scripts.

## 5. The phases after (outlines, refined after each audit)

Order after the user's answers (§7): the sash punch first (the one tool of
these their shop owns), then hems, deep boxes, the joggle tool.
**2026-11-17, later:** the user said "forget the sash punch" and asked for
horn lengths instead (§4.8). PL-2 is dropped; PL-3 … PL-5 are parked until
the user asks for them (their shop owns none of those tools).

- **PL-2 sash punch.** A narrow offset punch for channels the goosenecks
  cannot enter, in "Your shop's punches". Its outline: the user's own if they
  send its chart or a photo with a scale (as A 101 … A 108 were digitised),
  else a catalogue sash profile read from the PDF, marked assumed. The card's
  punch tries already walk the rack, so a sash punch that clears is offered
  like any other.
- **PL-3 hems.** A hem is a bend taken to 180° on itself: an acute pre-bend
  (30° tools, to 150°) and a flattening hit. The bend-on hit (tight bends
  TB-1) already carries a bend "on to" a further angle; what is missing is a
  flattening tool (a flat punch on a flat die, or a hemming die), a hem's own
  allowance (closed, open by a set gap, teardrop), the fold drawing two
  thicknesses lying together, and the checks for it (force: flattening takes
  several times a bend's). To research first: `bendTransform` at 180°, the
  kernel at a zero inside radius, the catalogue's hemming tools (Tecnostamp
  pp. 27 – 31).
- **PL-4 deep boxes.** The user's 200 mm tray is stopped by the ram (brake
  tool length §3.6): a punch extender (100 / 150 / 200 mm under the clamps) as
  a holder choice, the machine's open height as its limit, the card's "needs
  about {n} mm" turned into a button when an extender clears.
- **PL-5 joggle tool.** A one-hit joggle set for steps smaller than two hits
  can carry.

Hems, extenders and the joggle tool are catalogue tools the user's shop does
not own: they go in "Catalogue punches", so the brake can say "this needs a
tool your shop does not have" instead of only refusing.

## 6. Not built, and why

- **Window punches**: a cut-out made in a punch body for one job's return;
  there is no catalogue shape to model. When a return passes through the
  punch body the brake will keep saying the punch is met.
- **Rolled edges, beads, ribs, louvres, embossing**: forming, not bending;
  the fold model has only straight bend lines.
- **Urethane and rotary dies**: they change marking, which the simulator does
  not model.

## 7. Questions for the user

1. Your horn sections: how far does the horn run past the body, and how high
   is it at its end? (Assumed 20 mm and 10 mm, the catalogue's.)
   **Answer (2026-11-17):** they do not know and asked for the standard.
   There is none: every maker sells 100 mm end sections, but the horn is
   Tecnostamp 20 long × 10 (15) high on R 25; AccurTool Horn A 25 and Horn B
   30 long × 10 high on R 10 (its catalogue p. 4, read from the PDF); Amada
   about 35 × 10 (a search summary, not read). Kept 20 × 10, the shortest: the
   brake never passes a lip a real horn could not reach. A longer horn is a
   second `HORN` entry when they measure theirs.
2. Do you have moving horns, or do you slide the box off?
   **Answer:** they slide the box off — what §4.3's `horn-hooked` note says.
3. Which of these does your shop have: a flattening (hemming) tool, punch
   extenders (which heights), a sash punch, a joggle tool?
   **Answer:** the sash punch only → §5's order.
4. Open: the sash punch's profile (its chart number, or a photo of its end
   with a ruler).
