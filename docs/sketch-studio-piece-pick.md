# Sketch Studio press brake: bend one piece of the line

Status: spec, 2026-11-21. Follows `docs/sketch-studio-shop-floor.md` (§6.1
strokes, §6.2 segments), `docs/sketch-studio-brake-tool-length.md` (TL-1,
TL-2), `docs/sketch-studio-brake-hands-on.md` (HO-1, HO-2) and
`docs/sketch-studio-tight-bends.md` (Bend on), all built. Two phases, **PK-1**
(the rules, the panel, the flat blank) and **PK-2** (the 3D view), one builder
run each, audited after each. **PK-3** (slide the sheet by hand) is an outline
only, not built.

## 1. What the user asked

A screenshot of a tray blank at the Bend station: a wide flange with a small
lip beside it at each end, all on one punch line. The punch is set to 82 mm
(the lip's length) and stands in the middle of the line, "296.1 mm short at
each end"; the lip to bend is at the end of the line.

"I need to bend that small part … if I use a huge length of punch it will
bend all the sheet metal all the way through. What do you think is the best
UX here? Should we move the part left to right manually? Or if we click the
side part then it will be on the centre focus to be bent on the punch?"

## 2. The answer, and why

**Click the piece: it comes to the punch.** A hit bends the pieces of
material on the punch line that are under the punch, so the only thing the
brake needs to know is _which pieces_. A free left-right drag says the same
thing slowly and passes through positions that mean nothing (the punch half
over the lip, half over the flange beside it). So the piece is picked by a
click on the sheet, the sheet slides along the bed until that piece is centred
under the punch, and the punch keeps the length the operator gave it.

A slide by hand is still worth having for one case (a punch longer than the
piece, hung off the sheet's free end). It is a different, smaller thing:
§9, not built here.

## 3. What happens today (probed 2026-11-21 on today's code)

The fixture, called **the lip tray** below (flat mm, SPCC t 1.2, 50 t × 2 m
press): a column 400 × 744; on its right side a lip 25 × 82 (y 25 – 107), a
notch 4 wide cut 3 mm into the column, a flange 128 × 522 (y 111 – 633), a
notch, a lip (y 637 – 719). Outline:

`[0,0] [400,0] [400,25] [425,25] [425,107] [397,107] [397,111] [528,111]
[528,633] [397,633] [397,637] [425,637] [425,719] [400,719] [400,744] [0,744]`

Gauge edge 3 (the first lip's own edge, `[425,25] → [425,107]`), L 15: the
line is x = 410 and `lineSegments` gives three pieces, s = 26 – 108,
112 – 634, 638 – 720.

1. **The capability exists, hidden and backwards.** The pieces can be left
   out one by one (`session.skip`), but only on the small flat-blank card, by
   clicking the pieces _not_ wanted; the hint is a paragraph in a panel that
   scrolls. With the flange and the far lip left out, the frame already
   centres the lip on the bed (frame translation x = 66, the lip's middle;
   372 for the flange, 678 for the far lip) and the tooling is fitted to it
   (±41). Nothing on the 3D sheet says any of this.
2. **The order the user took is a dead end.** All three pieces in: one
   tooling run, ±347 (694 mm; a gap does not break a run). Length 82 typed:
   `punchTrim` 306, `punchHold` 82, refusal "The punch stands over none of
   tab 1, 3: it is not pressed." with only "Fit the punch to the bend".
3. **A bug: leaving pieces out after typing a length destroys the punch.**
   From (2), `skip: [1, 2]`: `holdTools` keeps the trim (306) and re-reads
   the hold from it on the new 82 mm run: `punchHold` −530, punch runs `[]`,
   refusals "The punch would be 0 mm long: the shortest section is 10 mm" and
   a tooling-load line over "0 mm". That is TL-2 §9.4's own rule ("a patch
   naming `skip`: the trim stays, the hold is re-read from it"); it is wrong.
4. **A punch over a piece left flat is passed.** The lip alone, punch 100
   (`punchTrim` −9): punch ±50, no refusal, no warning, although 5 mm of it
   (9 − the 4 mm notch) stands on the flange this hit leaves flat.
5. **The second lip starts refused.** After the first lip is bent, the same
   line picked again (any of its edges) has every piece in and is refused:
   "This line is bend 1's line, but the pieces in this hit are not the ones
   bend 1 bends: a made bend is bent on whole, and nothing else with it.
   Click a piece on the flat blank to leave it out of this hit." With the
   made lip left out, the flange and the far lip bend clear (run ±304).
6. **A new L throws the pick away.** `brakePatch` resets `skip` to `[]` on
   every new line, so typing L or dragging the fingers after picking the lip
   puts every piece back.
7. **The fingers stand where the bend is, not where the edge is.**
   `shopLayer.js` spreads the two fingers about the bend's middle
   (`max(FINGER.width, min(width × 0.3, bed × 0.35))`), so with a lip's edge
   on the gauge a finger is drawn through the flange beside it (the user's
   screenshot shows exactly that).
8. **One piece cannot be split.** The same tray with notches that stop
   3 mm short of the line (x = 413): one piece, s 26 – 720. Length 82:
   "The punch stands over 82 mm of the 694 mm bend: less than half of it is
   pressed. Make it longer, or fit it to the bend." True, and no word on
   what would let the lip bend alone (a relief across the line).

Checked and left alone: a flat piece left out that reaches past the line
(the flange, up to 400 mm deep in the probe) is already swept against the
die and the bed with the rest of the fixed side; it clears at 90° because the
bed is narrower than the die is tall, and a die held longer than the bend
meets it and gets TL-1's "Fit the die to the bend".

Siblings read for this: `sheetMetal.js` (`lineSegments`, `strokeBends`,
`cutBlank`), `pressBrake.js` (`brakeFrame`, `toolingRuns`, `trimRuns`,
`strokeTooling`, `toolingCover`, `assessBend`), `brakeStation.js`
(`brakePatch`, `holdTools`, `madeLine`, `brakeStation`), `brakeHands.js`
(`HAND_ORDER`, `edgeSegments`, `nearestEdge`, `brakeHint`, `reachChip`),
`shopLayer.js` (the reach, the fingers, the turn), `brakeCollisions.js`
(`toolingSections`, `posedTriangles`), `FlatPatternMap.jsx`,
`PressBrakePanel.jsx`. The contract they share and this spec keeps: the
session's `skip` (indexes into `lineSegments`) is the one statement of which
pieces a hit bends; the frame, the tooling, the checks, the record and the
film all follow from it. **No new session key for the pick, no new record
key, no file-format change.**

## 4. Words

"Piece" everywhere (the panel already says "pieces of material"): piece _n_
is `lineSegments`' index _n_ − 1, numbered along the line. A piece is **in
the hit** or **left flat**. The old "Segment _n_ of _m_" accessible names
become "Piece _n_ of _m_".

## 5. PK-1: the rules, the panel, the flat blank

### 5.1 The pick (pure, `brakeStation.js`)

`pieceChoice(count, skip, index, { add = false })` → the next `skip`, or null
when nothing changes:

- plain: only piece `index` is in the hit (`skip` = every other index);
- `add` (Ctrl, Shift or Meta held; a panel chip): piece `index` goes into the
  hit or out of it; the last piece in the hit cannot be taken out (null).

`pieceDefault(station, line)` → the `skip` a line starts with (§5.3).

### 5.2 The lengths stay (replaces TL-2 §9.4's `skip` rule)

A patch naming `skip` is the same to the tools as a new line: the punch stays
in the machine. In `holdTools`:

- a patch naming a trim: as today;
- a new line **or a patch naming `skip`**, with a hold, the station and one
  run under the kept pieces: the trim is derived, `(span − hold) / 2` (null
  within 1e-6);
- a patch naming `skip` with no hold and a set trim (several runs before):
  the trim stays; the hold is read from it only when that gives a length
  above 0;
- a hold is never written at 0 or below.

On the lip tray: 82 typed with every piece in (trim 306, hold 82) → only the
lip: trim null, hold 82, punch ±41, clear → every piece again: trim 306.

### 5.3 What a line starts with, and what a new L keeps

In `brakePatch`, with the station (without one: `skip: []`, as today):

- **A new edge, the mode or the points**: `pieceDefault` — every piece in,
  except the pieces already bent on this line when the line also crosses
  pieces not bent yet (they start left flat). Every piece made already: every
  piece in, as today (the hit is Bend on). Whether a piece is made is
  `madeLine`'s own test asked per piece, not a second rule. The seat runs
  first, the arrival rule after, both unchanged.
- **Only L moved** (a patch naming `distance` or `stop` and none of `edge`,
  `mode`, `points`, `skip`): the pick stays when the moved line crosses the
  same number of pieces and each overlaps its old self along the line by more
  than half of the shorter of the two; otherwise `pieceDefault`. The finger
  drag and the card's line drag are such patches; Esc restores as today
  (`fingerRestore` names `skip`).
- Bend on's own patch, the etched marks and Turn sheet around name what they
  name today.

### 5.4 Honest words (`assessBend`, `toolingCover`, `strokeTooling`)

- **`tool-over-flat`, new refusal.** `strokeTooling` also returns `flat`:
  the stretches of material on the line this stroke leaves flat (what
  `toolingRuns` already reads to break a run). When the punch's runs overlap
  them by more than 1e-6 mm: "The punch stands over 5 mm of a piece this hit
  leaves flat: it would bend that too. Make the punch shorter, or fit it to
  the bend." with the fix "Fit the punch to the bend". The punch only (a die
  under flat sheet presses nothing). The fitted punch can never trip it.
- **`tool-cover` with several pieces in the hit** (today's "stands over none
  of tab 1, 3"): "The punch is 82 mm long and does not reach every piece this
  hit bends (3 pieces, 694 mm end to end). Click the piece to bend: it comes
  under the punch. Or fit the punch to the bend." Same code, same fix.
- **`tool-cover` on one piece** (under half pressed): today's sentence, then
  "A piece of sheet bends whole. To bend a part of it alone, cut a relief
  across the bend line between that part and the rest (Relief, in the
  sketcher)." Same code, same fix.
- The refusal of §3 item 5 ends "Click a piece to bend only it." (the default
  of §5.3 means it is now reached only by adding a made piece back).
- The offset shape's "Click the others on the flat blank to leave them out."
  becomes "Click the one to offset: the others are left flat."

### 5.5 The panel (`PressBrakePanel.jsx`)

The "Segments on the line" paragraph becomes a row, shown only when the line
crosses more than one piece, region name "Pieces on the line":

- one chip per piece, a toggle button (`aria-pressed` = in the hit):
  `1 · 82 mm`, a made piece `1 · 82 mm · bent 90°`; a click is
  `pieceChoice(…, { add: true })` (a chip is a checkbox: no modifier needed,
  the keyboard and touch path);
- a button **Every piece** when a piece is left flat that `pieceDefault`
  would have in;
- one line of help: "Click a piece on the sheet to bend only it. The sheet
  comes to the punch; the punch and die keep their lengths."
- pointing at or focusing a chip names that piece to the workspace
  (`onPieceHover(index | null)`, the pattern of the flange-gap rows): the
  flat blank lights it here, the 3D sheet in PK-2.

No sideways scroll at 1366 × 768 with five pieces (the chips wrap; measure as
the BT scripts do), no shift of the Blades row when the row appears.

### 5.6 The flat blank (`FlatPatternMap.jsx`)

A piece is clicked to bend **only it**; with Ctrl, Shift or Meta it is added
or left out (`onSkip` becomes `onPiece(index, { add })`). Left-flat pieces
keep their `is-skipped` look; the hovered piece (from the panel) is drawn
lit. The drag of the punch line from a piece is unchanged.

### 5.7 PK-1 acceptance

Unit tests (new `piecePick.test.js`; the lip tray as a shared fixture):

1. §3's numbers as they stand before the change that moves them: three
   pieces at 26 – 108 / 112 – 634 / 638 – 720, run ±347, frame x 66 / 372 /
   678 for each piece alone.
2. `pieceChoice`: plain, add, take out, the last one kept, out-of-range.
3. §5.2 on the lip tray, both orders (length then pick, pick then length),
   the die the same, and the comb of `brakeToolLength.test.js` (a trim with
   several runs, then one piece: trim kept, hold read; a hold never ≤ 0).
4. §5.3: the first lip bent, the same line by edge 11, edge 3 and edge 7
   (L 118): the made lip starts left flat and the hit is clear; every piece
   made: all in, Bend on. L 15 → 14 → 20 by `distance` patches and by the
   finger-drag patches with only the lip in: still only the lip; an L that
   changes the piece count (L 30 on the lip tray: the line is in the column,
   past the notches, one piece): the default; a new edge: the default.
5. §5.4: the lip alone with punch 100 → `tool-over-flat` naming 5 mm, the
   fix clears it; punch 90 (4 mm past each end, over the notch only): no
   refusal; the three sentences, pinned; the one-piece tray (notches to
   x = 413) gets the relief sentence.
6. Every existing expectation that pinned the old rules is updated and
   listed in the report with old and new outcome (the TL-2 `skip` cases in
   `brakeToolLength.test.js`, the parity tests in `brakeHands.test.js`, the
   map's toggle in `FlatPatternMap.dom.test.jsx` and
   `CadWorkspace.brake.dom.test.jsx`, others as found).

DOM tests: the row (chips, Every piece, the made tag, hover names the
piece), the card (click = only it, Ctrl+click adds, a drag from a piece is
not a click).

### 5.8 PK-1 as built (2026-11-21)

Built as §5.1 – §5.6 have it; §3's numbers reproduced exactly on the code
before the change (`piecePick.test.js`, the lip tray in
`piecePick.fixtures.js`).

- `brakeStation.js`: `pieceChoice`, `pieceDefault` (with `line` omitted it
  reads the station's own `segments`), `keptPick` and `linePieces` (each
  piece's `made`: madeLine asked with that piece alone kept, its `from`
  angle). The station's `segments` carry `made`. `brakePatch`: the stop, the
  kept pick (only L moved), the seat, then `pieceDefault` for a line neither
  kept nor seated, then `holdTools`, then the arrival. A patch naming the
  same edge or the same mode as the session is not a new edge (the pick
  can stay). A kept pick of every piece is no pick: the new line takes its
  default, so an L moved onto a made lip's line leaves that lip flat.
- `holdTools`: §5.2, plus a patch naming `punchHold` / `dieHold` takes it as
  given. `fingerRestore` names the holds (Esc after a drag with the lip
  alone and its trim fitted would otherwise lose the 82). The Length box
  given the bend's own length sends `{ punchTrim: null, punchHold }`, so
  "pick then length" holds the punch as "length then pick" does; Fit to bend
  and an empty box hold none, as before.
- `pressBrake.js`: `strokeTooling().flat` (the material `toolingRuns` reads,
  one shared walk, the fitted runs unchanged); `toolingCover` adds
  `pieces`, `extent` and per tool `overFlat`; `assessBend` the three
  sentences and `tool-over-flat` (the punch only). "The punch is N mm long"
  is the sum of its runs. `strokeInLine`'s "click a segment … to leave it
  out" became "click a piece on the flat blank to bend only it"; madeLine's
  different-angles error "Click one on the flat blank to bend only it."; the
  crossing refusal "Ctrl+click that piece … to leave it out of this hit."
- The collision card's turn trial and the grip's outcomes pass the station
  to `brakePatch` (their pieces are then the applied patch's).
- Panel: `PiecesRow`; Every piece stays in the row hidden when idle (no
  growth under the pointer). The help line ships as "Click a piece on the
  flat blank to bend only it. …" until PK-2 makes the 3D sheet take the
  click; PK-2 puts "on the sheet" back.
- Card: `onPiece(index, { add })`, "Piece n of m", `litPiece` drawn
  `is-lit`. Workspace: `pieceChoice` on the card's click, `brakePieceHover`
  kept with the line's pieces.
- Measured at 1366 × 768 (a 300 × 600 blank with five 30 × 80 tabs, dev
  server): no sideways scroll in the page or the pane, nothing of the row
  past the pane; the row is 122 px and keeps its height with Every piece
  shown or idle; the Blades row stands 126 px lower than on a one-piece line
  (the row sits above it, where the old paragraph did).
- Scripts: `verify-shop-floor-sf3.mjs` clicked a segment to leave it out and
  to put it back: both are now Ctrl+clicks on "Piece n of 2".

After the PK-1 audit (built with PK-2):

- A piece is made when a made bend owns it (`pieceOwner`: madeLine's own
  first test, factored out and used by both); `segments` carry its `bend`.
  A made bend over several pieces (the slotted plate) now starts left flat
  as a whole, and its pieces go into the hit and out of it together
  (`pieceChoice`'s `together`, `piecesTogether`): a plain click on one is
  Bend on of the whole bend.
- Turn sheet around keeps the pick and the length (superseding §5.3's "names
  what it names today"): its patch (a new `edge` with `turned`) is matched
  piece by piece by overlap on the flat blank, the order along the line may
  reverse. The existing turn animation runs; no slide.
- A drag (the fingers, the card's line) names `dragFrom` (patch-only, the
  drag's `fingerRestore`): the pick is matched against the line the drag
  started from, so L 16, 18, 30, 19 from the lip alone has the lip again at 19. Esc as before.
- An angle past the die's widest: the leg check says nothing (no
  `short-leg` beside the `angle` refusal).
- PK-2 puts the sheet's words back: the panel's "Click a piece on the sheet
  to bend only it. …", `strokeInLine`'s "click a piece to bend only it",
  madeLine's "Click one to bend only it.", the crossing refusal's "Ctrl+click
  that piece to leave it out of this hit."

## 6. PK-2: on the sheet

### 6.1 The pieces in reach (`brakeHands.js`, `shopLayer.js`)

- The workspace offers `pieces` in the `brakeGrip` prop, beside `edges` and
  `fingers`, only in setup and only when the line crosses more than one:
  `[{ index, a, b, skipped, made }]` (flat mm). The layer never guesses.
- Each piece's stretch is drawn on the sheet: in the hit, the punch line as
  today; left flat, a quieter line of the same weight (no red: red is a
  refusal). A made piece's stretch lies along its bend.
- `HAND_ORDER` becomes grip, fingers, blade, **piece**, edge. A piece is in
  reach within `PIECE_PICK_PX` (12) of its stretch on the canvas; when an
  edge is nearer the pointer than any piece, the edge wins (one nearest test
  over both, so a lip's own edge 15 mm from the line stays clickable).
- In reach it lights (a ribbon, `brakeLights.js`, the shop accent) and the
  chip by the cursor reads `Piece 1 of 3 · 82 mm · click to bend only this`;
  in the hit alone: `… · in this hit · Ctrl+click another to add it`; left
  flat: `… · left flat · click to bend only this · Ctrl+click adds it`.
- A click is `pieceChoice` with `add` from the event's Ctrl / Shift / Meta
  (`onBrakePiece(index, { add })`), through `changeBrake` like every pick.
- The piece the panel names (§5.5) is lit the same way.
- Screen-space only, no station work per pointer move (HO-2's contract and
  budget: on `vite preview`, at most 2 ms per position over the card).

### 6.2 The sheet slides

When a patch changes which pieces are in the hit, the part's place in the
machine changes by a move along the bed. The sheet glides there in
`SLIDE_MS` (300), eased as the turn is; the punch, holders and die are set to
their new runs at once (with a held punch they do not change at all: only the
sheet moves, which is the shop's picture). A second pick during a slide
starts from where the sheet is. The checks and the card follow the settle as
they do now. Where the existing turn honours reduced motion, the slide does
too. The camera does not move. A change of L with the pick kept does not
slide (nothing moved along the bed).

### 6.3 The fingers stand behind the edge (view only)

The two fingers are placed within the gauge edge's own run on the sheet
(`edgeSegments` in the machine frame, its extent along X), about that run's
middle, with today's spread capped so both stay inside it; an edge too short
for two fingers side by side gets one finger at its middle and the other is
not drawn. The finger drag's targets (`fingerRects`) follow what is drawn.
The reading rule (skin gauge §4.2) is untouched: read that spec first and
change nothing it pins. With no gauge edge (two points, turned): as today.

### 6.4 The hint line

With more than one piece on the line, `brakeHint` reads "Click a piece of
the line to bend only it · Ctrl+click adds or leaves out · F flip · T turn
around · Enter bends · Esc clears the line" (the ring sentence gives way).
One line at 1366 × 768 with the orbit / pan / zoom hint after it; if it does
not fit, shorten the words, do not wrap.

### 6.5 PK-2 acceptance

Unit / DOM: the nearest test (a piece, an edge nearer than the piece, none);
the chip's three sentences; `brakeHint`; the finger placement rule on the lip
tray's edge 3 (one finger, at the lip) and edge 7 (two, inside the flange's
run); `CadViewport` routes a piece click and its modifiers.

`scripts/verify-piece-pick.mjs`, in the style of
`scripts/verify-brake-hands-on.mjs` (1366 × 768, screenshots to
`artifacts/sketch-cad/piece-pick`), on the lip tray (made the way an existing
script makes a blank that is not a rectangle, or opened as a saved model):

1. Bend station, click the first lip's edge on the 3D sheet, L 15: the row
   shows three chips, the hint line is §6.4's, three stretches on the sheet.
2. Type punch Length 82: the card's sentence is §5.4's (screenshot).
3. Hover the lip's stretch: lit, the chip reads `Piece 1 of 3 · 82 mm · …`.
   Click it: the sheet slides (two frames mid-slide differ in X and in
   nothing else), ends with the lip under the punch (screenshot), the Length
   field still reads 82 and "fitted", one finger behind the lip, Bend enabled.
4. Drag the fingers to L 14 and back: still only the lip.
5. Ctrl+click the flange: two chips pressed, the §5.4 sentence again; click
   the lip: only the lip. Bend.
6. Click the far lip's edge, L 15: the made lip starts left flat (its chip
   reads "bent 90°"); click the far lip's stretch: slides, Length 82, Bend.
7. The flange's edge, L 118: the flange alone in the hit, both lips left
   flat and tagged bent; the punch held at 82 gives the under-half sentence
   and "Fit the punch to the bend" clears it. Bend. Reload: three steps, the
   sequence list names the 82 mm punch on the first two.
8. Pointer cost over the sheet with pieces offered, on a production preview.
   No page errors.

Rerun and pass: `verify-brake-hands-on`, `verify-brake-tool-length`,
`verify-tight-bends-tb1` … `tb3`, `verify-punch-library-pl1`,
`verify-skin-gauge`, `verify-bend-queue-bq1`. Where one of them clicked a
piece on the card to leave it out, it now Ctrl+clicks, and the report says so.

### 6.6 PK-2 as built (2026-11-21)

- `brakeHands.js`: `PIECE_PICK_PX`, `pieceSegments` (a piece's stretch on
  the pose: along its owning bend's zone, the hit's or a made one's, else on
  the flat piece of the pose it lies in, on the face that looks up),
  `nearestPiece` (one nearest test over pieces and edges), `pieceChip`,
  `pieceOffer`, `fingerPlacement`; `HAND_ORDER` grip, fingers, blade,
  piece, edge; `brakeHint(lined, mode, pieces)`; `reachChip` names a piece.
- `shopLayer.js`: the pieces' stretches cached per pose and offer; the left
  flat ones one grey `LineSegments` (`press-brake-flat-pieces`, the punch
  line's weight, shown with it); a piece in reach lit by the edge's ribbon
  (`brakeLights.js` unchanged: one ribbon, one thing lit); the panel's piece
  (`litPiece`) lit when nothing is under the pointer, with no chip and no
  cursor. The fingers: `placeFingers` from the gauge edge's run as posed.
- The slide (`SLIDE_MS` 300, `pressBrake.js`): `slideFrom` in setStation —
  a line in the die before and after, no scrub or replay, the drawn matrix
  (rebased onto the new pieces) and the new pose equal but for X — runs on
  `startTurn` with `slide` (straight: not drawn out, not lifted; the side
  view reads no turn). A new view mid-slide starts a new slide from where
  the sheet is drawn, or lands it (a move that is not along X). Reduced
  motion lands at once, as a turn does. For PK-3: any move along the bed
  glides by this one rule, whichever way the frame is re-centred.
- `CadViewport.jsx`: `onBrakePiece(index, { add })` from `brakeClick`;
  the hint gets the pieces' count. `CadWorkspace.jsx`: `pickBrakePiece`
  (the card's and the sheet's one path), the grip's `pieces`, `litPiece`,
  `gaugeEdge`.
- Judgment calls: an edge too short for two fingers is one shorter than
  four finger widths (96 mm: each finger half its width clear of the run's
  ends), so the 82 mm lip has one; the 3D chip names no "bent" tag (the
  panel's chip does); the grip, the pieces and the edges wait while the
  sheet slides, as they do while it turns.
- The spec was wrong here (accepted at the PK-2 audit): §6.5 item 7's "the sequence list names the 82 mm punch on
  the first two". The lips' punch is the lips' own length, so each record is
  fitted (no `punchTrim`, the one record key for a length) and the list names
  no custom length. The script checks that instead.

## 7. Both phases

All tests pass, lint 0 errors on `src/`, build green. Docs: this file gains
"as built" notes under each phase; `docs/state-machines/cad-stations.md`
(read `docs/state-machines.md` first; the `cad-brake` session rules for
`skip` and the holds), `docs/sketch-studio-brake-tool-length.md` §9.4 (the
`skip` rule marked superseded by §5.2 here), `docs/sheet-metal-shop-guide.md`
(a short part: bend one piece of a line).

Files expected: `brakeStation.js`, `pressBrake.js`, `brakeHands.js`,
`brakeLights.js`, `shopLayer.js`, `FlatPatternMap.jsx`,
`PressBrakePanel.jsx`, `CadViewport.jsx`, `CadWorkspace.jsx`, `cad.css`,
their tests, the script.

## 8. Builder's report

Each judgment call named; each existing expectation that changed, with old
and new outcome and why; the numbers of §5.7 and §6.5 as measured, any that
differ from §3 said plainly; tests, lint, build and scripts as run, failures
included.

## 9. Not built

- **PK-3, slide the sheet by hand**: specified and built in
  `docs/sketch-studio-sheet-slide.md` (the outline that stood here is
  replaced by that file).
- Bending a part of one piece: that is the outline's job (a relief), said by
  §5.4's sentence.
- The backgauge beam and fingers in the collision check.
- Die sections placed by hand.

## 10. Open, for the user

1. A line starts with every piece in the hit (as before), less the ones
   already bent. The other choice: start with only the piece in front of the
   edge that was clicked. One click either way; say which reads better at
   the machine.
2. Whether the slide by hand (PK-3) is wanted, and what section lengths the
   shop actually reaches for on a lip like this (82 exactly, or 80 / 100).
