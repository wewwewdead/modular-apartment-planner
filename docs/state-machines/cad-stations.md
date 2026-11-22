# State machines: Sketch Studio CAD shop stations

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The sheet-metal shop: press brake, paint booth, print station, laser, and the
replay of the build.

Paths are under `src/features/sketchstudio/cad/`.

## Explicit machines

<!-- The indented lines in each block are checked against the code by
     src/shared/machineRegistry.test.js. -->

What the five station tables share:

- `END` is every write of `null`: the first pass's convention, kept. The
  tables declare it so a reader sees which stages can end, but no code sends
  it through `next`, so a table cannot catch a missing exit: each entry lists
  its exits.
- Every other stage write goes through the table's `next`. The only literal
  stage in the workspace is the display-only session the replay hands its
  laser bed (`{ stage: 'cutting', run: { token }, cut: false, view }`), which
  nothing writes back.
- Nobody asks `.can` of any of the five: each guard is a hand-written
  `stage === '…'` test that agrees with its table. `SHOP_STATIONS` (the shop
  session's tables by station) is read by `putBackFilm` and the tests.
- `RESUME_<STAGE>` (`toolSession.js` `resumeEvent`, `resumeSession`): the
  replay keeps the station it started over and puts it back as it ends, a move
  from `idle` straight back to the stage it was in. One event per stage a
  replay can start over; a press brake stroke and a laser cut keep the replay
  out (`routeBusy`), so `stroke` and `cutting` have none, and a stored session
  in a stage the table does not resume comes back as nothing.

### `cad-brake` — the press brake station

`src/features/sketchstudio/cad/toolSession.js` (`BRAKE`), owned by
`CadWorkspace.jsx` (`brakeSession.stage`; `null` is `idle`;
docs/sketch-studio-fab-shop.md §9 SM-2). Setup is the operator's picks (gauge
edge or two points, L, angle, Flip sheet, tooling), kept in the session and
never saved; `brakeStation.js` derives the pending hit, its refusals and its
collision from them on every render.

- **Entry (`START`).** The route's Bend (`goStation`, see "Shop floor route"
  on `docs/state-machines/cad-workspace.md`) starts it on the part the shop
  subject names, the search-only Press brake command on the selected
  sheet-metal part. A part with a finish or prints is refused with a
  one-click remedy (`brakeBlocked`, no session: the shop-order refusal, or the
  Finished card for a part whose hits are made). `startPressBrake` clears the
  card and the picker and ends Measure and the hole tool.
- **The pedal (`STROKE`, `DONE`).** The pedal (Bend, Enter or Space) is
  refused while the hit has a refusal or a collision; otherwise `STROKE` hands
  the viewport a stroke `{ token, ... }`, the shop layer animates it in its
  own requestAnimationFrame loop and reports the token at the end
  (`brakeStrokeEnd`: a stale token is ignored), and `DONE` commits the bend
  (one model commit) and returns to setup for the next hit. A re-run of a
  step is a stroke with `commit: false`. A stroke whose model moved under it
  (an Undo mid-stroke) commits nothing and says so. Keys never cut a stroke
  short: Esc is swallowed, Enter and Space wait.
- **A stroke whose station goes.** When the station can no longer be worked
  out mid-stroke (the blank or the named parameters can no longer be read:
  `brakeView` null, the part still there), the shop layer drops the stroke and
  its end never comes. The workspace sends `DONE` itself, at render, nothing
  committed, with the same "The model changed during the stroke: this hit was
  not saved." line, so Esc, the route and Leave answer again.
- **Ends (`END`).** Every write of `null`, all through `endBrake`: Leave press
  brake (its button, the error card's, the Finished and refusal cards'
  Cancel, and Esc with nothing picked: Esc first disarms a try, then clears a
  pick or a scrub); the part going away (at render; it takes `panel` with it,
  or the route would still read Bend as open); a new selection
  (`resetSelectionTools`, which a document swap runs too); `leaveStations`
  (another station through `goStation`, every More command, an outline edit
  with a `returnTo`, Draw the outline, Add bend by numbers' gate); and the
  replay starting (`startFilm`, which keeps the session in its `before`).
- **The replay's return (`RESUME_SETUP`).** End replay puts back the session
  it put away through `resumeSession(BRAKE, …)`: the very object, so advice
  worked out for it still holds.
- **What a visit leaves behind (Named: `CadWorkspace.jsx` `brakeLeft`,
  `endBrake`).** The session, `brakeBlocked`, `brakePicker` and `brakeFocus`:
  one list, cleared by every exit above. `endBrake` returns what puts the four
  back; `leaveStations` hands that on for the More menu, and the replay keeps
  them in `before`. The problem line and the panel are each exit's own: Leave
  press brake, `leaveStations`, the replay and a document swap clear
  `brakeProblem`; a new selection and the part going away leave it for the
  next `openPressBrake` to clear.
- **No stage for the views.** The side view (SM-2b) is a view of the shop
  layer's pose. The replay's own brake strokes (a re-run on the film's clock,
  token `{film key}:{take}`) report to the same `brakeStrokeEnd` and are
  ignored there only because the replay has put the brake session away
  (`brakeSession` is null while it plays).
- **SF-3** (docs/sketch-studio-shop-floor.md §6.1–6.2), no stage. A pending
  hit is a list of bends (`pendingIds`: `pending-hit`, `pending-hit:2`, …):
  the punch line through `sheetMetal.js` `strokeBends`, one bend per piece
  pair, less the pieces in the session's `skip` (indexes into
  `lineSegments`; since PK-1 a new line starts with `pieceDefault` and only
  an L move keeps it, below). An etched line clicked on the
  flat blank sets `mode: 'points'` on it, and its `bend` (angle, direction)
  the angle and Flip sheet. `STROKE` animates every member; `DONE` commits
  them all in one commit, with one fresh `stroke` id when there are several.
  The sequence list, its scrub, Re-run, Earlier, Later and Remove act on
  steps (`sheetMetal.js` `hitSequence`, since TB-1). A stroke whose tabs are
  not in line in the part's present state is a refusal (`not-in-line`), not a
  collision: it is never posed.
- **SF-4**, no stage. The shop-order refusal (`brakeBlocked`, no session)
  lists the part's hits made and its folded size, read only; a collision's
  "bend this one before bend N" is only offered when that order keeps every
  stroke of several tabs in line.
- **BT-2** (docs/sketch-studio-brake-flip-tooling.md §5), no stage. Turn sheet
  around and Flip sheet are setup picks (`turned`, which any new line resets,
  and `flip`); the sheet turning over on the die when the side up changes is a
  view of the shop layer (its own animation loop, `station.turn`). An offset
  bend (Bend shape Offset) is two hits inside one `STROKE`: the stroke carries
  `run.hits` (each hit's pose) and a `pairTimeline` (hit one, the sheet turned
  over for `TURN_MS`, hit two); the shop layer plays both in the same loop and
  reports the token once, and `DONE` commits the two ordinary bend records in
  the order made, in one model commit and with no shared `stroke` id. The
  pedal is refused while either hit, in the order chosen, has a refusal or a
  collision. A re-run of a step that lies the other way up from the pose shown
  turns the sheet over first, inside the same `STROKE`.
- **TL-1, TL-2** (docs/sketch-studio-brake-tool-length.md), no stage. The
  punch and die length are setup picks (`punchTrim`, `dieTrim`: mm off each
  end of every tooling run, null fitted). A new line keeps them; the session
  has `punchHold` / `dieHold` (absent until a length is set: the length in mm
  a tool is held at while one run stands under the line), kept in step by
  `brakePatch` (`holdTools`: a trim patch sets the hold, a new line or a
  `skip` patch derives the trim from it, PK-1 below) and carried by
  `brakeCarry`.
  Unlike `reverse` they ride in the pending bend's fields, so `DONE` commits
  them on the records and a stored step is rechecked, re-run and replayed
  with them. The length fix and the taller-punch trials run only under
  `advise` (after the settle, or on the pedal), like the punch fix.
- **HO-1** (docs/sketch-studio-brake-hands-on.md §5), no stage. Flip over and
  Turn around in the view toolbar, F / T and the grip's handles make the very
  patches the panel's Flip sheet and Turn sheet around make (`brakeHands.js`
  `brakeActPatch`), applied through the one rule `brakeStation.js`
  `brakePatch` (a new line resets `turned`, starts its pieces as PK-1 says
  and keeps the trims),
  which `changeBrake`, the collision card's turn trial and the grip's
  outcomes all call. A handle drag is view only until it commits that one
  patch: the shop layer moves the drawn sheet along the turn the act will
  make, and on the patch's new view carries that turn on from where the hand
  let go (`handover`); short of 90°, Esc, a right press or a lost pointer ease
  it back with no patch. The outcomes (`advise: false`) are worked out once
  the session is in `setup` with no scrub, kept with the session / model /
  params they were made for, or, where the pair would pass 50 ms, on the
  first approach of each handle. The sheet also turns (a view of the shop
  layer) when the edge facing the backgauge changes (`turnChanged`).
- **HO-2** (same spec §6), no stage. An edge clicked on the sheet is the
  flat-blank card's own `onPickEdge` (`pickBrakeEdge`); the backgauge fingers
  dragged send each new L, at most once a frame, through the card's own
  `onDistance` (`brakeDistance`): every L is an ordinary setup patch (a new
  line). Esc, a right press or a lost pointer put the line back with one
  patch (`brakeHands.js` `fingerRestore`: it names `skip`, so it is not a new
  line and restores exactly; since PK-1 it names the holds too). A click on
  the fingers or a blade opens the
  panel on the L field or that blade's picker: pane state only
  (`brakePicker`, lifted out of `Blades`; `brakeFocus`, a one-shot request
  the panel clears once it has focused), cleared by every way out of the
  brake (`endBrake`; `startPressBrake` also clears the picker). Nothing is in
  reach in a scrub, a stroke or the replay (the grip prop's `shown` / null).
- **BQ-1** (docs/sketch-studio-outline-edit-sheet-nest.md §7), no stage. The
  bend queue's Previous part, Next part and rows, and a job board row, move
  the brake through `goStation('bend', { instanceId })`: `END` on the old
  session, `START` on the new one. The carry (§7.3): when Bend moves to
  another part without the station being left, the new session starts from
  `brakeSessionDefaults()` with the old one's `punch`, `die` and `reverse`
  (`brakeStation.js` `brakeCarry`); `goStation` reads it from the open
  session, or from the card or gate holding it while the brake shows no
  session (`brakeBlocked.carry`; Bend's gate on a part whose blank does not
  fold, `shopGate.carry`). Every other way out drops the session and those
  holders, so the next visit starts from the defaults (with the remembered
  punch, SP-1). The picks never carry.
- **TB-1** (docs/sketch-studio-tight-bends.md §4), no stage. A pending line on
  a made bend's line (`brakeStation.js` `madeLine`: the same segments within
  0.05 mm) is that bend's next hit: `pending.again`, the stroke runs from the
  angle the bend stands at (`run.from`), and `DONE` commits the bend-on
  entries (`again`, no line; one per tab, a fresh `stroke` when several) in
  the one commit. Arriving on such a line is a setup patch like any
  (`brakePatch(session, patch, station)`: an angle not above the bend's
  becomes 90° or 180°, recorded as `session.arrived` and put back if the line
  moves on before the angle is touched; the commit clears it). Bend on on a
  sequence row is one patch (the line, `skip`, the sheet the right way round;
  the tools keep their lengths). The sequence acts on steps (`hitSequence`,
  keyed by a step's first record id); Remove of a bend's first step takes its
  bend-on entries too, and a move that puts a bend-on entry before its bend is
  refused by the fold (`foldProblem`) before the sequence check.
- **TB-2** (same spec §5), no stage. The tries (this hit earlier in the order;
  a made step part-way first) run only under `advise`, never per drag sample,
  and a try the card offers is a setup patch `{ armed }`: `session.armed` is
  `{ kind: 'before', key }` or `{ kind: 'partway', key, angle }`. While armed
  the station checks, poses and animates the hit as the sheet stands then
  (`pending.armed`, `pending.others`), including that every later step is no
  worse (a refusal `order` otherwise), so the pedal re-checks it. `DONE`
  commits `stroke.placed` in the one commit, clears `armed` and leaves
  `session.notice` for a part-way commit. Disarmed by Esc (the first Esc only
  disarms), Cancel, `brakePatch` of a new line, a piece pick (`skip`), `flip` or
  `shape`, a sequence edit (`changeBrakeBends`) and the commit; a stale
  `armed` (its step gone) is ignored by the station. A stored step that
  collides gets `sequenceTries` (worked out `LIVE_DEBOUNCE_MS` after the
  checks settle, kept with the checks they were made for) as row buttons
  committing through `changeBrakeBends`.
- **SP-1** (docs/sketch-studio-shop-punches.md §5), no stage. A visit that
  starts with nothing carried starts from `brakeSessionDefaults()` with the
  punch of the last hit committed on this computer and the way round it was
  clamped (`brakeMemory.js`: `rememberPunch` in `DONE`'s commit, sharp
  punches only; `rememberedPunch` where `START` builds the session;
  localStorage `sketchstudio.brake.punch`, an unknown key, a bad value or a
  storage that throws falling back to the defaults); a carry wins. The stroke
  carries `run.takeOff` (the slant the return takes the part off along, or
  null; an offset's per hit; a re-run's from `takeOffOf`): during `return`
  the shop layer slides the drawn part along Y. View only. The punch tries of
  the card run under `advise` only.
- **SP-2** (same spec §6), no stage. A third try (this hit before a made step,
  and that step, or up to three later steps, made with another punch of the
  rack; tried at one place, and only when the card offers nothing else) is
  armed as `{ kind: 'before', key, punches }` (`punches`:
  `{ [record id]: punch key }`, session only). `armedOf` keeps an entry
  only for a record of a sharp step after the place naming a sharp punch of
  the rack (else the entry is dropped and the try is plain try 1) and adds
  `changes` for the card's words. `DONE` commits `stroke.placed` (the hit at
  its place and the changed punches) in the one commit, clears `armed` and
  leaves `session.notice`
  "Bend {m} is now made with the {name} punch." What disarms is what disarms
  try 1. A stored row stopped by its punch or holder may get a third row
  button (`sequenceTries`' `punch`), committed through `changeBrakeBends`. The
  card's punch tries check a candidate on `brakeCollisions` first (§6.5), all
  under `advise` only.
- **TB-3** (docs/sketch-studio-tight-bends.md §7), no stage. A new line that
  lies along a made bend within half the V of the hit's die, but not on its
  line already, and crosses no material those bends do not bend, seats on it
  inside the same `brakePatch` (`seatOf`), before the arrival rule. The
  session records it next to `arrived`: `session.seated`
  `{ number, off, from }`, cleared by the next new line that does not seat
  and by `DONE`'s commit; a session that never seated has no key. A piece
  pick (`skip`) leaves it. Esc on a finger drag puts it back with the line
  (`fingerRestore` names `seated`).
  The refusals left carry `pending.seat` `{ key, number, off, label }`, a
  button calling the same Bend on as the sequence row (`bendOnBrakeStep`), as
  does a made bend's line clicked on the flat blank. All synchronous.
- **PL-1, PL-1.1** (docs/sketch-studio-punch-library.md §4), no stage. Horn
  sections are a tooling pick, `session.horns` (false by default): a new line
  keeps them, `brakeCarry` carries them with the punch (named only when on),
  and `punchChoice` clears them for a radius punch. They ride in the pending
  bend's fields (`horns` only when on), so `DONE` commits them on the records
  and a stored step is rechecked, re-run, replayed and drawn with them. `horns`
  is false, `true` (the standard) or a horn's key (25, 30, 55; 20 reads as the
  standard), read everywhere through `shopCatalog.js` `hornOf`; the card's
  horn try walks the horns shortest first, under `advise` only, before the
  length fix.
- **CG-3** (docs/sketch-studio-corner-gaps.md §5), no stage and no session
  field, but a collision kind: a hit whose stroke is otherwise clear is
  checked once more at its end at the sheet's true thickness
  (`brakeStation.js` `thicknessHit`, `cornerGaps.js` `foldOverlaps`) and,
  where one flange's metal ends inside another's, collides
  `{ tool: 'part', thickness: true, phase: 'end' }`. It refuses the pedal
  like any collision and shows on a stored step's row and an offset's hit.
  It is part of the facts (synchronous) and never of a search: every remedy
  trial leaves it out, and a hit or row refused for it gets no try.
- **SG-1** (docs/sketch-studio-skin-gauge.md §4), no stage. In gauge mode
  `session.distance` is what the backgauge reads, off `session.stop` (null:
  the gauge edge; a made bend's id: the outside face of its flange, an id the
  fold no longer has read as null); `sessionLine` puts the line L plus that
  stop's take-up from the edge (`flatDistance`). `session.stopHold` (null
  automatic, `'edge'` or a bend id: the panel's Gauge off) is the operator's
  own stop; a new edge, the mode or the points clear it. `brakePatch` on a new
  line: a patch naming `stop` is taken as given; else the held stop, else the
  automatic rule (`automaticStop`; a finger drag's `dragStop` tried first);
  then the seat and the arrival; last the line is written canonical
  (`lineStop`). Under a held stop the line has left, the station refuses the
  hit (`gauge-stop`, with the one click that gauges off what the fingers do
  stop on). Esc on a finger drag puts `stop` back with L. `brakeSessionDefaults`
  has `stop: null`, `stopHold: null`; `brakeCarry` carries neither. The
  reading (`pressBrake.js` `brakeReading`) is synchronous.
- **PK-1** (docs/sketch-studio-piece-pick.md §5), no stage, no new session
  key. `skip` stays the one statement of which pieces a hit bends; the rules
  are Named in `brakeStation.js`. `pieceChoice(count, skip, index, { add })`
  is every pick of a piece: a plain click on the flat blank bends only it,
  Ctrl / Shift / Meta + click or a panel chip puts it in or leaves it flat,
  the last piece in stays. `brakePatch` on a new line: the stop first; when
  only L moved (no new edge, mode or points; the finger drag, the card's line
  drag, a typed L) the pick is kept where the line crosses as many pieces,
  each overlapping its old self by more than half (`keptPick`; a pick of
  every piece is not kept); then the seat; a line not kept and not seated
  gets `pieceDefault` (every piece in, but pieces of made bends beside
  unbent ones start left flat; `madeLine` asked per piece); without a
  station every piece, as before; then the arrival. `holdTools`: a new line
  or a `skip` patch with a hold and one run derives the trim from the hold;
  a `skip` patch with no hold reads it from the trim; a patch naming a hold
  (`fingerRestore`, the Length box given the bend's own length) takes it as
  given; no hold is written at 0 or below. The collision card's turn trial
  and the grip's outcomes now pass the station to `brakePatch`, so their
  pieces are the applied patch's. The panel's chip hover
  (`brakePieceHover`) is pane state, kept with the line's pieces and the
  instance, never inside `brakeView`. After the PK-1 audit: a piece is made
  when a made bend owns it (`pieceOwner`, madeLine's own first test), and a
  made bend's pieces go into and out of the hit together (`pieceChoice`'s
  `together`, `piecesTogether`); Turn sheet around's patch (a new `edge`
  with `turned`) keeps the pick, matched by overlap on the flat blank; a
  drag's patches name `dragFrom` (patch-only, the drag's `fingerRestore`)
  and the pick is matched against the line the drag started from.
- **PK-2** (same spec §6), no stage, no session key. The grip prop gains
  `pieces` (setup only, more than one piece), `litPiece` (the panel's chip)
  and `gaugeEdge`. `HAND_ORDER` is grip, fingers, blade, piece, edge (one
  nearest test over pieces and edges, `nearestPiece`); a piece click is the
  card's `onPiece` (`pickBrakePiece`, through `changeBrake`). The slide
  (`SLIDE_MS`) is view only, in the shop layer: a new view whose pose
  differs from the drawn one by a move along X and nothing else glides
  there on the turn machinery (`station.turn.slide`, straight, not lifted);
  the grip waits for it as for a turn; a new view mid-slide starts from where
  the sheet is drawn; reduced motion lands at once. The fingers are placed
  behind the gauge edge's run as posed (`fingerPlacement`), view only.
- **PK-3** (docs/sketch-studio-sheet-slide.md), no stage. Session key
  `slide` (mm along the session line a → b, the punch off the middle of the
  pieces in the hit; 0 centred), written on the records only when not 0,
  along each record's own a → b (a bend-on record along its made bend's).
  `brakePatch`: a patch naming `slide` takes it (not a new line; it disarms
  an armed try); it goes back to 0 on a new edge, the mode, the points, a
  `skip` patch, Turn sheet around (either kind) and a new L whose pieces
  changed; it stays with the pick kept; a drag's `dragFrom` gives its start's
  slide back; `fingerRestore` names it; `brakeCarry` does not. The hand drag
  (`slidePress` in `CadViewport.jsx`, after the fingers' pattern): a click
  focuses the panel's Sheet slide field; past `CLICK_PX` the layer holds the
  sheet (`slideHold`, `slideTo`: drawn under the pointer at once, no glide,
  the other handles hidden) and `onBrakeSlide({ slide })` goes at most once a
  frame; Esc, a right press, a lost pointer or blur cancel (`{ cancel }`, the
  slide the drag started from); release lets go and the sheet glides
  (`SLIDE_MS`) onto its pose. `brakeSlide` in the workspace turns the
  sheet's move into the session's slide (`tooling.right`). Every way out of
  the brake drops the hold (`setGrip` with `shown` false, `closeStation`,
  `dropSlide`).

Tests: `toolSession.test.js`, `CadWorkspace.brake.dom.test.jsx`,
`CadWorkspace.stationExits.dom.test.jsx`, `CadWorkspace.queue.dom.test.jsx`,
`CadWorkspace.strokes.dom.test.jsx`, `CadWorkspace.hands.dom.test.jsx`,
`CadWorkspace.reach.dom.test.jsx`, `CadWorkspace.sessions.dom.test.jsx`,
`CadViewport.brake.dom.test.jsx`, `CadViewport.grip.dom.test.jsx`,
`CadViewport.reach.dom.test.jsx`, `skinGauge.test.js`,
`skinGauge.dom.test.jsx`, `cornerGapsBrake.test.js`, `brakeHorns.test.js`,
`PressBrakePanel.horns.dom.test.jsx`, `shopPunches.test.js`,
`tightBends.test.js`, `tightBends.dom.test.jsx`, `tightBendsSeat.test.js`,
`tightBendsSeat.dom.test.jsx`, `tightBendsWay.test.js`,
`tightBendsWay.dom.test.jsx`, `bendQueue.test.js`, `strokes.test.js`,
`brakeFlip.test.js`, `brakeToolLength.test.js`, `brakeHands.test.js`,
`piecePick.test.js`, `PressBrakePanel.pieces.dom.test.jsx`, `CadViewport.pieces.dom.test.jsx`,
`sheetSlide.test.js`, `PressBrakePanel.slide.dom.test.jsx`, `CadViewport.slide.dom.test.jsx`,
`FlatPatternMap.dom.test.jsx`.

    idle --START--> setup
    idle --RESUME_SETUP--> setup
    setup --STROKE--> stroke
    setup --END--> idle
    stroke --DONE--> setup
    stroke --END--> idle

### `cad-paint` — the paint booth

`src/features/sketchstudio/cad/toolSession.js` (`PAINT`), owned by
`CadWorkspace.jsx` (`shopSession.stage` while `shopSession.station` is
`'paint'`; `null` is `idle`; docs/sketch-studio-fab-shop.md §9 SM-3). The
finishing stations share one `shopSession` state, each with its own table,
and clear the selection as they open so the parts keep their own colours (the
shop subject is kept). The Weld station that shared it was removed by
docs/sketch-studio-shop-trim.md (ST-1).

- **Entry (`START`, `TARGET`).** The route's Paint starts at `pick`, or at
  `colour` on the shop subject's part (else its product's parts; the
  search-only Paint command: the selected part or group). A job board row
  while the booth is open is a `PICK` of that part.
- **Picks.** A click on a part (`PICK`) makes it the target (the panel offers
  the part's own group, its fabricated members: `paintStation.js`
  `paintPick`); the powder, gloss and film are session state.
- **Apply and confirm (`APPLY`, `CONFIRM`).** Paint and Strip paint are one
  model commit each, kernel-inert. A target with prints asks first, in the
  panel, never `window.confirm` (`CONFIRM`, with `pending` 'paint' or
  'strip'), because printing comes after paint and the commit drops them; the
  confirm card's words and its button follow `pending`.
- **Back and the ends (`BACK`, `END`).** Esc steps back (confirm → colour →
  pick) and leaves from `pick`; Leave paint booth, a new selection,
  `leaveStations` and the replay starting are `END`.
- **Targets that go (`GONE`, `liveShopSession`).** An Undo that removes some
  targets keeps the rest, with the stage and `pending` as they were (a Strip
  waiting on its confirm stays a Strip for the parts still there); with none
  left, `GONE` takes the booth back to `pick` from `colour` or `confirm` and
  drops `pending`.
- **The replay's return (`RESUME_PICK`, `RESUME_COLOUR`, `RESUME_CONFIRM`).**

Tests: `toolSession.test.js`, `CadWorkspace.stations.dom.test.jsx`,
`CadWorkspace.stationExits.dom.test.jsx`,
`CadWorkspace.together.dom.test.jsx`.

    idle --START--> pick
    idle --TARGET--> colour
    idle --RESUME_PICK--> pick
    idle --RESUME_COLOUR--> colour
    idle --RESUME_CONFIRM--> confirm
    pick --PICK--> colour
    pick --END--> idle
    colour --PICK--> colour
    colour --APPLY--> colour
    colour --CONFIRM--> confirm
    colour --BACK--> pick
    colour --GONE--> pick
    colour --END--> idle
    confirm --APPLY--> colour
    confirm --BACK--> colour
    confirm --GONE--> pick
    confirm --END--> idle

### `cad-print` — the print station

`src/features/sketchstudio/cad/toolSession.js` (`PRINT`), owned by
`CadWorkspace.jsx` (`shopSession` with `station: 'print'`).

- **At `face`.** The panel holds the draft artwork (text or a fitted image)
  and a click on a face places it (`PICK`: one commit; silk-screen and UV
  flatbed refuse a curved face).
- **At `artwork`.** The placed print is the one edited: its fields commit (a
  typing session is one undo step), a drag on its face in the viewport
  commits once on release, a click on another face moves it there (`PICK`), a
  print in the list or the viewport is chosen with `SELECT`, New print
  (`NEW`) goes back to the face pick. The `artwork` stage always names a
  print (`printId`).
- **The drag.** Viewport state (`CadViewport` `printDrag`, capture-phase
  pointer handlers like the hole handles); Esc, blur or pointer-cancel put
  the print back.
- **A print that goes (`liveShopSession`).** A print this session placed is
  only "gone" once it has been seen in the model (`printSeen`); gone, the
  station is `NEW`, back at `face`.
- **An uploaded image.** See "Print image upload" under Machines.
- **Ends.** Esc deselects (`NEW`), then leaves (`END`); Leave, a new
  selection, `leaveStations` and the replay starting are `END`.
- **The replay's return (`RESUME_FACE`, `RESUME_ARTWORK`).**

Tests: `toolSession.test.js`, `CadWorkspace.stations.dom.test.jsx`,
`CadWorkspace.stationExits.dom.test.jsx`,
`CadViewport.stations.dom.test.jsx`.

    idle --START--> face
    idle --RESUME_FACE--> face
    idle --RESUME_ARTWORK--> artwork
    face --PICK--> artwork
    face --SELECT--> artwork
    face --END--> idle
    artwork --PICK--> artwork
    artwork --SELECT--> artwork
    artwork --NEW--> face
    artwork --END--> idle

### `cad-laser` — the laser station

`src/features/sketchstudio/cad/toolSession.js` (`LASER`), owned by
`CadWorkspace.jsx` (`shopSession` with `station: 'laser'`; `null` is `idle`;
docs/sketch-studio-fab-shop.md §9 SM-4). A station of the shop's one session,
so every rule over the open tools that sees `shopSession` covers it.

- **Entry (`START`, `AUTOCUT`).** The route's Cut starts it on the shop
  subject's sheet-metal part, the search-only Laser command on the selected
  one (refused without one). Cut on the laser (the Cut panel, shop floor
  §4.5) opens it already cutting: `AUTOCUT`, once the commit that makes the
  part has reached the workspace (`pendingStation`), and only when the blank
  has no refusal. The laser opens while the solid is still rebuilding (it
  works from the blank alone); the selection is kept, because the laser bed
  (`LaserStation.jsx` `LaserBed`) covers the whole 3D view and takes its
  clicks (`shopPick` is `null` for the laser).
- **At `sheet`.** The stock sheet (a kernel-inert commit to
  `model.fabrication.shop.sheet`), the quantity and the bed's view (session
  state) are set, and Etch bend lines / Clear marks commit the feature's
  `marks` (a part edit: the kernel rebuilds once and builds the same solid;
  it never reads marks).
- **The cut (`CUT`, `DONE`, `STOP`).** `CUT` is refused while a blank of the
  job has a refusal or the sheet shown holds none of it ("None of this part is
  on this sheet."); it hands the bed a run `{ token, model }`, which animates
  in its own requestAnimationFrame loop (the SVG rewritten in place, no React
  render per frame) and reports the token at the end. `DONE` applies to the
  live token only, its notice with it (`laserCutEnd` reads the session on
  show, `latestShop`). `STOP` is the Stop button, Esc during a cut, and a
  model change under the cut (`liveShopSession`: `run.model` is not the model
  on show, an Undo mid-cut), which also says "The model changed during the
  cut: cut again." A cut writes nothing to the model.
- **A finished cut (`cut`).** `DONE` sets `cut: true` for the sheet shown. It
  goes back to false on Cut, on Quantity up or down, on Stop, on a Sheet
  switch to another sheet of the nest (`showLaserSheet`) and on another stock
  sheet (`changeLaserSheet`: a new nest), so a sheet never cut never draws as
  cut. A This cut row keeps it (`leadLaser`).
- **Ends (`END`).** Esc at `sheet` and Leave laser (`leaveShopStation`); a new
  selection (`resetSelectionTools`); the part going away or ceasing to be
  sheet metal (`liveShopSession` returns null); `leaveStations` (Edit
  outline, Cut another outline, another station, More); and the replay
  starting.
- **Edit outline** (OE-1, docs/sketch-studio-outline-edit-sheet-nest.md §3.6;
  on the panel and on `LaserError`, off while cutting or while the kernel is
  not current) is an `END` too: the shop session goes (`leaveStations`) and
  the sketcher opens on the blank's sketch with
  `returnTo: { panel: 'shop-laser', instanceId, instanceIds }`; its Finish
  (or Cancel) opens the laser again on that job, `START` (at `sheet`,
  `cut: false`), through `openStationOn('cut', …)` (a blank it cannot take
  opens the gate), with the notice "Outline updated: blank {w} × {h} mm."
- **The session's fields (SN-1,** same spec §4, §4.9).
  `{ station: 'laser', stage, key, instanceId, instanceIds, fresh, sheetIndex, view, run, cut, runKey }`:
  `instanceId` is the lead (Quantity, Edit outline and the etched marks act
  on its part); `instanceIds` the job when the session names one (a batch;
  null: every instance of the lead's part); `fresh` Quantity's new copies not
  yet seen in the model; `sheetIndex` the sheet shown (null: the one holding
  the lead); `view` null until the user picks Close-up / Whole sheet. The
  station (`laserStation.js`) is derived from the model: `sheetNest` puts
  every blank of the lead's stock and thickness on the shared sheet.
- **Quantity and the job (SN-1).** Quantity is a model commit at `sheet`
  (`changeLaserQuantity`: new instances of the lead's part in rows beside
  it, or the newest copies removed through `removeInstance`, never the lead
  nor a painted, printed or grouped copy — those that stay are said on a
  warning card, `copiesNote`); its new copies join a named job (`instanceIds`
  and `fresh`, so `liveShopSession` does not drop them before their commit is
  seen). A This cut row (`leadLaser`) changes `instanceId` and freezes
  `sheetIndex` at the sheet shown (the job, the sheet and `cut` stay); the
  bed's Sheet switch sets `sheetIndex`; neither is a transition. Cut on the
  laser on a batch opens with `instanceIds` = every new instance, cutting at
  once unless a part of the job has a refusal. `liveShopSession` keeps the
  job's instances still in the model. The replay's laser scenes (`cad-film`)
  hand the station the scene's `instanceIds` and `cutIds`.
- **RC-2** (docs/sketch-studio-cut-pick.md §4.3), no transition. At `sheet`,
  while outlines are ready to cut (`readyOutlines`, worked out only while the
  laser is on show), the panel says "{n} outline(s) waiting to be cut." with
  Cut another outline (off while cutting):
  `goStation('cut', { outline: { kind: 'pick', selected: [], stock, thickness } })`:
  `END` through `leaveStations`, then Cut's picker on the laser's stock and
  thickness. The route's own Cut, while the laser is open, still does nothing.
- **The replay's return (`RESUME_SHEET`).**

Tests: `toolSession.test.js`, `CadWorkspace.laser.dom.test.jsx`,
`CadWorkspace.stationExits.dom.test.jsx`,
`CadWorkspace.outline.dom.test.jsx`, `CadWorkspace.nest.dom.test.jsx`,
`CadWorkspace.cutPick.dom.test.jsx`, `sheetNest.test.js`.

    idle --START--> sheet
    idle --AUTOCUT--> cutting
    idle --RESUME_SHEET--> sheet
    sheet --CUT--> cutting
    sheet --END--> idle
    cutting --DONE--> sheet
    cutting --STOP--> sheet
    cutting --END--> idle

### `cad-film` — replay the build

`src/features/sketchstudio/cad/toolSession.js` (`FILM`), owned by
`CadWorkspace.jsx` (`shopSession` with `station: 'film'`; `null` is `idle`;
docs/sketch-studio-shop-floor.md §8, SF-5).

- **Start (`START`).** The route bar's Replay (or the press brake's Watch the
  bends on a finished part, which plays that part's hits only) starts it on
  the shop subject's product. The scenes (`shopFilm.js` `filmScenes`) are
  fixed at the start, together with `source`, the model it plays, and
  `before` (see "Replay `before` snapshot" under Machines). The open station
  is put away: the brake through `endBrake`, a shop station by the film
  taking the shop session's place; Measure and the hole tool end.
- **Who waits.** Being a station of the shop session it is covered by every
  rule over the open tools that sees `shopSession` (the ribbon, the tree,
  Measure, the hole tool, the gizmo, the group and placement keys); the
  route's `routeBusy` adds it (the station buttons, More, Back / Next and the
  job board rows wait) and `activeTool` reads `'film'`. New, Open, Undo, Redo
  and the undo / redo / Delete keys wait; the view toolbar and cube are
  inert.
- **What it shows.** It writes nothing: the viewport is handed the model with
  only the finishes and prints that exist at the scene (`filmModel`:
  kernel-inert keys, so `sameKernelInput` holds and no build starts), the
  mask of the parts not made yet (`filmHidden` → `shopLayer.setHidden`:
  bought-in items and fasteners come on in the finished scene), the press
  brake's view-only re-run of the hit (`brakeStation.js` `rerunStroke`, its
  stroke on the film's clock), the laser bed's cut (`LaserBed` with `watch`
  and `clock`; the scene's copies are the job on the shared sheet, `cutIds`
  the instances of the cut scenes already played; the bed's `view` starts
  null) and no selection, isolation, explode or section.
- **The clock (`PLAY`, `PAUSE`, `STEP`, `DONE`).** `PAUSE` / `PLAY` stop and
  run the clock (`shopFilm.js` `createFilmClock`, a ref the stations' frame
  loops read: no React render per frame); `STEP` (previous, next, a row of the
  step list) moves to a scene from its start without changing whether it
  plays; each scene entry bumps `take` (the stations' run tokens) and a layout
  effect puts the clock at 0 before any frame loop reads it. The workspace's
  frame loop draws the progress bars, sets `progress` at the scene's beats
  (the colour, a print appears: one render each) and at the scene's end moves
  to the next; the last scene's end is `DONE`, which waits on the finished
  product (`PLAY` there starts it again).
- **Ends (`END`).** Esc, End replay (the panel, or the route's button) and
  Back to the press brake run `endFilm`: `putBackFilm` puts `before` back as it
  was, the station it started over through its own table (`RESUME_*`). A
  model change under the film on the same document ends it the same way, at
  render (`putBackFilm` too). A new selection (`resetSelectionTools`) and
  another document drop it with nothing put back (a document swap ends every
  session as a cancel). The viewport puts back the camera it kept as the film
  started (and the press brake's saved camera and key with it, so a brake
  that was open comes back on its own camera).

Tests: `toolSession.test.js`, `shopFilm.test.js`,
`CadWorkspace.film.dom.test.jsx`, `CadWorkspace.stationExits.dom.test.jsx`,
`CadViewport.brake.dom.test.jsx`.

    idle --START--> playing
    playing --PAUSE--> paused
    playing --STEP--> playing
    playing --DONE--> ended
    playing --END--> idle
    paused --PLAY--> playing
    paused --STEP--> paused
    paused --END--> idle
    ended --PLAY--> playing
    ended --STEP--> paused
    ended --END--> idle

## Machines

### Press brake station

- **Where:** `CadWorkspace.jsx` (`brakeSession`, `brakeBlocked`,
  `brakePicker`, `brakeFocus`, `brakeLeft`, `endBrake`), `brakeStation.js`
  (derived hit), `shopLayer.js` (`station`, `stationLoop`)
- **States:** see `cad-brake`
- **Treatment:** Explicit (the stage); Named (`endBrake`: what a visit leaves
  behind)
- **Notes:** `CadWorkspace.brake.dom.test.jsx`,
  `CadWorkspace.stationExits.dom.test.jsx`, `CadViewport.brake.dom.test.jsx`.
  - The station owns the viewport: `pointerUp` returns before selection while
    `shopLayer.stationOpen()`, and every kernel group hides (`hides` is true
    for all).
  - The stroke runs in the shop layer's own requestAnimationFrame loop, once
    per token; its end is reported through `onBrakeStrokeEnd(token)` and a
    stale token is ignored.
  - The camera: opening frames it on the part in the machine from the
    operator's side (`STATION_VIEW`), a committed stroke's end frames it again
    (a re-run does not), and while it is open Fit and the standard views
    frame the station instead of the hidden parts (Fit keeps the operator's
    view until another standard view is picked; `ctx.brakeOpenedView`);
    closing restores the camera it saved.
  - Every pose (stroke frames, picks, a shown collision) is handed to the
    side view card (`BrakeSideView.jsx`) through `onStationPose` and a
    listener set in `CadViewport`, which rewrites its SVG in place: no React
    state, no workspace render per frame.
  - The floor grid is hidden while the station shows and put back as it was
    on closing (SM-2b).
  - The advice caches (`brakeAdvice`, `brakeRowTries`, `brakeHands`,
    `brakeGapHover`) are each kept with the session, model and parameters (or
    checks) they were made for and compared on use; their timers are cleared
    in effect cleanup.
  - `endBrake` replaces six hand-written lists of what an exit clears. Each
    site clears at least what it did; the picker and the focus are the only
    additions, and the card (`brakeBlocked`) at the part-gone line, where it
    is always null already (a session and the card never stand together:
    `startPressBrake` clears the card, and the card is only set by
    `openPressBrake` with no session open).

### Paint, print stations

- **Where:** `CadWorkspace.jsx` (`shopSession`, `shopProblem`, `shopNotice`;
  derived `paintView`, `printView`, `shopPick`), `CadViewport.jsx`
  (`ctx.shopPick`, `shopHover`, `printDrag`), `shopLayer.js` + `shopDecor.js`
  (decals)
- **States:** see `cad-paint`, `cad-print`
- **Treatment:** Explicit
- **Notes:** `CadWorkspace.stations.dom.test.jsx`,
  `CadViewport.stations.dom.test.jsx`.
  - While `shopPick` is set `pointerUp` returns before selection and hands the
    station a pick (`onShopPick`: a part or a face); hover runs once a frame.
  - Decals are records drawn from the model (no state of their own): rebuilt
    when a record changes, re-posed on every pose (a gizmo drag via
    `updateMarks`), hidden with their parts, in the unfold view's stand-in,
    while the press brake shows and under the replay's mask. A decal's
    texture is applied only while its entry is still the one it loaded for
    (`shopDecor.js`).
  - Every station edit is kernel-inert, and so is a group edit
    (`sameKernelInput` treats `groups` and an instance's `groupId` as inert
    since SM-3).

### Laser station

- **Where:** `CadWorkspace.jsx` (`shopSession` with `station: 'laser'`,
  derived `laserView`), `laserStation.js` (the derived station),
  `LaserStation.jsx` (`LaserBed`: the run loop)
- **States:** see `cad-laser`
- **Treatment:** Explicit
- **Notes:** `CadWorkspace.laser.dom.test.jsx`,
  `CadWorkspace.nest.dom.test.jsx`, `CadWorkspace.stationExits.dom.test.jsx`,
  `laserStation.test.js`, `sheetNest.test.js`.
  - The sheet is derived (`laserStation.js` `sheetNest`: every blank of one
    stock and thickness, first fit on shelves); one cut is a job of blanks
    (see `cad-laser`). The bed draws the sheet's other blanks under the job's
    and a Sheet switch past one sheet.
  - The bed is an overlay over the viewport
    (`.cad-model-view > .cad-laser-bed`), not part of the 3D scene or the shop
    layer: the 3D view behind it is untouched while it shows.
  - One requestAnimationFrame loop per run token (the effect depends on the
    token only: the station it cuts is the one it started on, which is why a
    model change stops the cut), cancelled on stop, on leaving and on
    unmount; its frame rewrites only the contours and pierce marks whose
    state changed. The cut overlay's paths are keyed by `runKey`, so a stopped
    cut's partly drawn kerf is redrawn uncut.

### Replay the build

- **Where:** `CadWorkspace.jsx` (`shopSession` with `station: 'film'`,
  `filmClock`, derived `filmSceneView`, `filmView`, `filmPick`, `filmHidden`,
  `filmCamera`), `shopFilm.js` (scenes, `filmState`, `filmModel`, the clock),
  `ShopFilm.jsx` (`FilmPanel`, `FilmCaption`), `CadViewport.jsx` (`film` prop:
  `ctx.filmSaved`), `shopLayer.js` (a stroke's `clock`, `prepareStation`,
  `setHidden`), `LaserStation.jsx` (`LaserBed` `watch` / `clock`)
- **States:** see `cad-film`
- **Treatment:** Explicit
- **Notes:** `shopFilm.test.js`, `CadWorkspace.film.dom.test.jsx`,
  `CadViewport.brake.dom.test.jsx`, `scripts/verify-shop-floor-sf5.mjs`
  (docs/sketch-studio-shop-floor.md §8, SF-5).
  - One frame loop owns the film's time; the stations' own loops read its
    clock and draw nothing while it stands still.
  - Every scene entry is a new `take` (the run tokens), so a stroke or a cut
    never carries over; `filmUpdate(take, …)` applies only while the session
    is on that take. A pause landing between a frame's decision and its
    update makes `DONE` from `paused` a no-op, and the next Play finishes the
    scene.
  - The clock ref is cleared by `endFilm` and a document swap; a film dropped
    by a new selection or a model change leaves it set, which is harmless:
    it is read only while a film is on, and the next start makes a new one.
  - The viewport effect that keeps and puts back the camera runs before the
    press brake's, so the brake's saved camera and key are put back with it.

### Replay `before` snapshot

- **Where:** `CadWorkspace.jsx` (`startFilm` builds `before`; `putBackFilm`)
- **States:** none of its own: the twelve values the film puts away as it
  starts (`shopSession`, `brakeSession`, `brakeBlocked`, `brakePicker`,
  `brakeFocus`, `brakeProblem`, `shopProblem`, `shopNotice`, `shopGate`,
  `panel`, `sheetFlat`, `propertiesOpen`)
- **Treatment:** Left
- **Notes:** `CadWorkspace.film.dom.test.jsx`,
  `CadWorkspace.stationExits.dom.test.jsx`.
  - The two lists (what `startFilm` keeps, what `putBackFilm` sets) sit a few
    lines apart; a value added to one goes in the other in the same change.
  - `putBackFilm` is the one way back, for End replay and for a model change
    under the film; the sessions come back through their tables
    (`resumeSession`), the very objects, so caches keyed on them still hold.
  - A film started from the brake's Finished card keeps the card
    (`brakeBlocked`) and no session; Back to the press brake shows the card
    again.

### Print image upload

- **Where:** `CadWorkspace.jsx` (`uploadPrintImage`, `imageAsked`,
  `latestShop`), `printImage.js` (the decode and fit)
- **States:** decoding / landed / dropped
- **Treatment:** Left
- **Notes:** `CadWorkspace.stationExits.dom.test.jsx`, `printImage.test.js`.
  - The image is asked for by the print session on show when the file is
    chosen; it lands only there: the session on show (`latestShop`) must
    still be that one (its `key`) when the decode ends, else nothing is
    committed or written to any draft (a station closed, or closed and
    opened again, meanwhile).
  - Each choice takes a number (`imageAsked`); only the last chosen lands,
    whichever decodes last.
  - Landed: with a print selected at `artwork` when it was asked, the print
    becomes that image (one commit); else the draft does, with its size
    readout (`imageInfo`).

### Number fields: unreadable text

- **Where:** `CadEditors.jsx` (`numberFor`, `useNumber`, `NOT_A_NUMBER`,
  `ValueField`'s `held`), used by `ShopStationPanels.jsx` (film thickness,
  print width, height, rotation) and `PressBrakePanel.jsx`
- **States:** a `ValueField` after blur shows the value, or `held` text (the
  text it could not commit, kept while the value is the one it was typed
  over)
- **Treatment:** Named (`numberFor`)
- **Notes:** `ShopStationPanels.dom.test.jsx`, `CadEditors.number.test.js`
  (the old copies, frozen, against `numberFor` over every kind of text).
  - `numberFor(values)(handler)` reads a typed number or `=expression`; text
    that reads as no number changes nothing and answers `NOT_A_NUMBER`, and
    the field drops `held`: it shows the value in force again, as every
    number box in the app does on commit (`src/hooks/useNumericDraft.js`).
  - Other consumers of `ValueField` keep `held`: text they cannot commit stays
    on screen while their error line refers to it. The field's live session
    (focus, debounce, Enter / blur, Esc, Ctrl+Z / Ctrl+Y) is the "Live field
    session" entry on `docs/state-machines/cad-workspace.md`.

### Flange gaps Set outcome

- **Where:** `ShopPanels.jsx` (`FlangeGapsSet`: `outcome`, `ways`, `refusal`)
- **States:** nothing said / said (the set's words) / said with the brake's
  note / refused
- **Treatment:** Left
- **Notes:** `CadWorkspace.gaps.dom.test.jsx`
  (docs/sketch-studio-corner-gaps.md §4.3, §4.5).
  - A set's words show only while the outline is the one it made
    (`outcome.profile`): an Undo takes them away.
  - After a set that moved something, the brake's sequence is checked off the
    click (a `setTimeout` 0) and written only onto the outcome it was started
    for (`o === pending`); the timer is cleared in the effect's cleanup.
  - `ways` are keyed by row key: a row that is gone leaves an inert entry; a
    set row's entry is dropped so the next Set reads it as it now is.

### Add bend's "just added"

- **Where:** `ShopPanels.jsx` (`AddBendForm`: `addedAt`)
- **States:** waiting for the next bend / editing
- **Treatment:** Left
- **Notes:** `addedAt` is the bend count the Add produced; the form reads as
  "added" only while the part still has exactly that many bends, so a bend
  removed or added elsewhere (an Undo) ends it, and any change of an input
  clears it. The form is keyed by the feature (`FeatureForm`), so another
  part starts it afresh.
