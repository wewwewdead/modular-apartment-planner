# Sketch Studio press brake: hands on the sheet

Status: spec, 2026-11-15. Follows `docs/sketch-studio-fab-shop.md`,
`docs/sketch-studio-shop-floor.md`, `docs/sketch-studio-brake-flip-tooling.md`
and `docs/sketch-studio-brake-tool-length.md` (all built). Two phases,
**HO-1** then **HO-2**, one builder run each (Opus 5.5, effort high), audited
between. Nothing here changes the model, the saved file, the fold or the
collision rules: it is all how the operator reaches what already exists.

## 1. What the user asked for

"On the shop let's make the UI/UX more intuitive and improve user experience
on it. Like if I want to flip the sheet metal I don't really need to find the
button: it should be on the 3D bending preview controls UI, like the rotate
parts on the 3D workshop. It should be delightful, with a taste that shows
care and professional being."

Read as: what the operator does to the sheet with their hands is done **on
the sheet, in the 3D view**, the way Rotate part puts rings on the part. The
right-hand panel stays the controller's record of the set-up; it stops being
the only place to act.

Scope is the Bend station, the one the user named and the busiest. The other
stations are §9.

## 2. What is there today (read 2026-11-15)

Seen in `artifacts/sketch-cad/brake-flip-bt2/01-flip-and-turn-controls.png`
and `artifacts/sketch-cad/brake-tool-length/01-third-line-fitted.png`
(1366 × 768), and in the code:

- **The 3D scene cannot be touched.** Every mesh of the station has
  `raycast = () => {}` (`shopLayer.js` `solid`, the punch line, the collision
  paint) and the viewport's click path returns as soon as
  `shopLayer.stationOpen()` (`CadViewport.jsx`, "The press brake owns the
  viewport: its picks are on the flat map"). Orbit, pan and zoom are all the
  view answers to.
- **Flip and turn live in the panel, apart, below the fold.** Flip sheet is a
  switch on the angle's row; Turn sheet around is a button under the line
  fields (`PressBrakePanel.jsx`). At 1366 × 768 the panel scrolls, so neither
  is in view when the station opens on a part with a two-point line.
- **The view toolbar shows the wrong commands.** With the brake open it still
  lists Unfold, Move part, Rotate part, **Flip Horizontal, Flip Vertical**
  (greyed), Place holes, Move holes, Measure. A user looking for "flip" finds
  two dead buttons that flip something else.
- **The hint line is the model's**: "… Click a part to select", which does
  nothing here.
- **The sheet turns over, but only for a flip.** `shopLayer.js` `planTurn` /
  `turnMatrixAt` / `startTurn` (500 ms, `TURN_MS`) run when `flipped` differs
  between two poses (`setStation`: `before.flipped !== station.pose.flipped`).
  Turn sheet around and a newly picked gauge edge jump.
- **L is set on the flat-blank card** (drag the punch line, `FlatPatternMap`)
  or typed; the amber backgauge fingers in 3D, which are what sets L on a real
  machine, are scenery.
- **The blades are chosen in the panel** (Blades row → picker); the punch and
  die in 3D are scenery.

## 3. What was read (siblings this must agree with)

- **Rotate part** (`CadViewport.jsx`, `rotateDial.js`, `gizmoHud.js`,
  `rotateKeys.js`): rings on the part; `startDial` measures the swept angle in
  the ring's plane with a 4 px dead zone (`DEADZONE_PX`) and an edge-on
  fallback; `createRotateFeedback` draws the swept sector; the readout is one
  DOM box written directly (`.cad-gizmo-hud`), never a React render per frame;
  digits + Enter apply an exact value (`typeKey`, `typedHtml`); `AXIS_COLORS`.
- **The print's drag** (`CadViewport.jsx` `printDown` / `printMove` /
  `endPrintDrag`): a capture-phase pointer handler that takes the press before
  OrbitControls, disables `controls`, captures the pointer, and treats a press
  without travel (`CLICK_PX`) as a click. The pattern for every handle here.
- **Measure** (`marks.js` `measureCandidates`): screen-space snapping to
  projected edges, mm per pixel dividing by `camera.zoom`.
- **The station's facts and advice** (`CadWorkspace.jsx`, `brakeFacts` /
  `brakeAdvice`, `LIVE_DEBOUNCE_MS` 150): facts (`brakeStation({ advise:
false })`) on every change, searched advice only once the session is still,
  used only for the identical session / model / params. Measured at the BT-2
  follow-up: about 13 ms a facts-only station, 23 ms mean per drag position.
- **The side view** (`BrakeSideView.jsx`): hears every pose from the layer
  (`onStationPose`) and rewrites its SVG in place.
- **Which way a flip goes** (by reading `pressBrake.js`, not measured): with
  a bend in the die `brakeFrame` keeps the back side at the backgauge, so a
  flip swaps left and right (half a turn about the machine's Y); a blank with
  no line turns about the bed's axis (`flatFrame`). Handles take their axis
  from the two poses as built, never from an assumption (§5.2).
- `docs/state-machines.md` (`cad-brake`): the builder reads it first.

## 4. Design direction

This section is the taste brief. Where a rule below and a detail in §5 – §6
disagree on screen, the rule wins and the report says what changed.

1. **The view is the work, the panel is the record.** Anything done to the
   sheet by hand (turn it over, turn it round, push it to the fingers, choose
   the edge that goes back) is done on the sheet. Anything keyed into the
   controller (angle, shape, lengths) stays in the panel, and the thing it
   belongs to in the view leads there in one click.
2. **One language with the workshop.** A handle here behaves like Rotate
   part's rings: press and drag turns, a press without travel acts, the
   readout sits by the cursor in the `.cad-gizmo-hud` look, Esc cancels, Alt
   frees the snap, digits + Enter set an exact value. No new idiom.
3. **Same word everywhere.** "Flip sheet", "Turn sheet around", "backgauge",
   "punch", "die". Never "heading", "alternate", "trial", "gizmo" on screen.
4. **Quiet at rest, clear on approach.** Handles are thin and at about 60 %
   strength until the pointer nears; then full strength, a name, its key and
   what would happen. Nothing animates at rest and nothing loops (an infinite
   animation cost this app its frame rate once: `docs/paint-edit-performance.md`).
5. **Know before you act.** Where the outcome can be worked out cheaply, the
   handle says it before the click ("Flipped over it clears" / "Flipped over:
   the part hits the die at 62°").
6. **Never silently dead.** A control that cannot act is either not drawn or
   says why in its title. No greyed button without a reason.
7. **The sheet is one rigid thing.** While dragged it never deforms, jumps or
   passes through the tooling; it lands on exactly the pose the station
   computes.
8. **Motion is short and has a reason.** At most `TURN_MS`, the existing
   ease, always a real movement of the sheet. With `prefers-reduced-motion:
reduce` every turn (the existing turn-over included) lands at once.
9. **Fit the app.** Colours from the shop tokens (`cad.css`, `--shop-*`) and
   `AXIS_COLORS`; cards and chips in the existing card look; 1366 × 768 is the
   floor: nothing new overlaps the side view, the flat-blank card, the view
   cube or the hint line, and the toolbar stays on the rows it has now.
10. **Reachable without a mouse.** Every handle has a toolbar button and a
    key; focus rings show; pointer targets are at least 24 px.

## 5. HO-1: flip and turn, on the sheet

### 5.1 The view toolbar speaks sheet

While the press brake is open (`brakeSession`), the model's part commands are
not rendered in `.cad-view-toolbar`: Unfold, Move part, Rotate part, Flip
Horizontal, Flip Vertical, Place holes, Move holes, Measure and their option
rows. In their place, where Flip Horizontal / Flip Vertical stood, a group
`role="group" aria-label="Sheet"`:

- **Flip over** — `aria-pressed` = flipped. Title: "Flip the sheet over: the
  machine always bends up, so a bend down is made with the sheet turned over
  (F)".
- **Turn around** — title: "Turn the sheet around: the other side of the
  punch line goes to the backgauge (T)". With no line: disabled, title "Pick
  the punch line first".

Both disabled while a stroke runs. The names are chosen so no existing query
matches them: the panel keeps its switch "Flip sheet" and its button "Turn
sheet around" untouched (tests and `verify-brake-flip-bt2.mjs` find them by
those names; Playwright's name match is by substring). Standard view,
Orthographic, Fit, the see-through modes and Split drawing stay.

Check and report: what Move part / Rotate part and the M / R keys do today
with the brake open (`chooseGizmo` does not look at `brakeSession`); with the
buttons gone the keys must do nothing there.

### 5.2 The grip

Two handles drawn on the sheet in the station scene, at a constant size on
screen, standing where the operator's hands would be: the middle of the
part's edge nearest the operator (the front of its machine-frame box, on the
part, not in the air), kept inside the free part of the view (the rect
`frameStation` already computes clear of the cards).

- **Flip** — an open hoop with an arrowhead at each end, standing over the
  edge, about the axis the flip turns on.
- **Turn** — a flat ring with one arrowhead, lying just over the sheet, about
  the vertical. Drawn only with a punch line picked (with none, picking the
  edge is the turn: HO-2).

Each takes the axis of the rotation between the pose now and the pose after
(§5.4 gives both), and the `AXIS_COLORS` of the machine axis nearest it, so
they read as Rotate part's rings do. Meshes, not 1 px GL lines; an unseen,
wider picker under each (at least 24 px across), as TransformControls does;
drawn over the scene (no depth test) so the sheet never buries them, hidden
when the anchor leaves the canvas. Starting sizes, to be judged on the
screenshots and changed if they read badly: radius about 34 px, stroke 3 px.

Shown only when the station is being set up: not during a stroke, a turn, a
scrub of a made step (Before / After), the replay film, or on the Blocked /
Finished cards. The workspace says so with one prop; the layer never guesses
from the view.

**Hover.** Full strength within 120 ms, cursor `grab`, a chip by the handle
(the `.cad-gizmo-hud` look, its own class): the name and key, and under it
the outcome when a hit is pending (§5.4).

|      | line 1                  | line 2 (a hit is pending)                           |
| ---- | ----------------------- | --------------------------------------------------- |
| flip | `Flip sheet · F`        | `Flipped over it clears` / `Flipped over: {fact}`   |
| turn | `Turn sheet around · T` | `Turned around it clears` / `Turned around: {fact}` |

`{fact}` is the first refusal or collision of the tried hit, the fact without
its remedy, as the blade picker's cards word it (`PressBrakePanel.jsx`
`verdictOf`: move it somewhere both can use).

**Click** (a press with no travel past `CLICK_PX`): the act at once; the sheet
turns as §5.3.

**Drag**: after the dead zone the sheet follows the pointer round the handle's
axis (`startDial`), along the same lifted path the turn-over takes
(`turnMatrixAt`, progress = swept angle / 180°, either direction), the side
view following (`phase: 'turn'`), the chip reading `Flip sheet · 120° ·
release to flip` (under 90°: `· release to leave it`). Release at 90° or more
commits and the sheet finishes the turn from where it is, without starting
over and without a jump; under 90° it eases back and nothing changes (no
session patch, no station recompute). Esc or a right press cancels the same
way, and that Esc does not also clear the line (the brake's key handler asks
`viewport.isDragging()`, as the operation keys do).

The rigid-body rule is the hard part: the pose after may be built on a fold
rooted differently from the one on screen (a turned line can swap a bend's
fixed and moving sides). Requirement, not method: from press to landing the
drawn sheet is one rigid body and the hand-over to the committed pose moves it
less than 0.5 mm and 0.5°, asserted in a test from the drawn matrices on a
part with earlier bends standing. If that cannot be guaranteed for the turn
ring, it acts on click only (still animated) and the report says why; the
flip hoop must drag.

### 5.3 Every turn of the sheet is shown

Today only a change of the side up animates. Rule (mine; a better-founded
equivalent is welcome, reported): between two rest poses of one station the
sheet turns (`startTurn` from where it is drawn) when the side up changed
**or** the edge of the blank that faces the backgauge changed (the flat
direction pointing back: the bend normal signed by `frame.back`; a blank with
no line has a fixed one). So Turn sheet around swings the sheet round, and a
newly picked gauge edge brings that edge to the fingers. A change of L, of the
angle, of the tooling or of the bend shape never animates: the pose follows
at once, as now.

### 5.4 Knowing before acting

`CadWorkspace.jsx` works out the two acts' outcomes the way it works out the
advice: once the session has been still for `LIVE_DEBOUNCE_MS`, in `setup`
with no scrub, kept with the session / model / params they were made for and
used only while those are identical. Each is `brakeStation({ …, advise: false
})` on the session after the act: its `view` (the pose the grip turns
toward) and, when a hit is pending, whether it passes (`ok`, and the fact
when not).

- flip: `{ flip: !session.flip }`.
- turn: `turnAround(station, session)`, applied as the workspace applies it
  (a patch with `edge` is a new line: `skip`, `turned`, `punchTrim`, `dieTrim`
  reset). That rule is written three times today (`changeBrake`, the trial
  inside `brakeStation` for `pending.collision.turn`, and now here): make it
  one exported function all three call.

They reach the layer by their own prop / call, not inside `brakeView` (a new
`brakeView` re-poses the station). Until they arrive the handles show without
line 2 and a press acts as a click. The turn's outcome must agree with the
collision card's "Turn the sheet around" button whenever both exist (one
test).

Budget: nothing extra per pointer move. Measure the pair on the kiosk face
frame (Shop → More → Example: kiosk, the heaviest part in the app) and
report; over 50 ms, work each out on first hover of its handle instead.

### 5.5 Keys and the hint line

- **F** flips, **T** turns around: in `setup`, not while typing in a field,
  not with Ctrl / Meta / Alt, not on repeat. (F is already "Flip side" in the
  hardware tool, which cannot be open here.) Check the workspace's other key
  handlers for a clash and report.
- The viewport's hint line at the brake, in place of "Click a part to
  select":
  - no line: `Pick the gauge edge on the flat blank · F flips the sheet`
  - a line: `Drag a ring on the sheet to flip or turn it · F flip · T turn
  around · Enter bends · Esc clears the line`
    followed by the orbit / pan / zoom hint as the other tools have it.
- Hovering or focusing a toolbar button lights its handle (an imperative call
  on the viewport, no workspace render).

### 5.6 Acceptance (HO-1)

Unit (pure functions in a new module, e.g. `brakeHands.js`): the turn rule
of §5.3 over flip, turn with an opposite edge, turn with none (`turned`), a
new edge at 90°, an L change, an angle change; the shared patch function
against all three callers' old outputs; the fact wording; drag progress
(dead zone, both directions, the 90° threshold); the anchor on a flat blank,
a part with a flange standing at the front, the kiosk face frame, a 100 × 60
tab.

Dom (`CadWorkspace.brake.dom.test.jsx`, `CadViewport.brake.dom.test.jsx`
style): the toolbar with the brake open and closed; Flip over / Turn around
patch the session exactly as the panel's controls do; F / T, and not while
typing; disabled while stroking; the outcomes computed once after the settle
and not during 30 changes of L (spy on `brakeStation`); a handle click and a
handle drag past and short of 90° reach the workspace as the act or as
nothing; Esc mid-drag leaves the line picked; no handles in a scrub or the
film; reduced motion lands at once.

Browser, `scripts/verify-brake-hands-on.mjs`, in the style of
`verify-brake-flip-bt2.mjs`, 1366 × 768 and 1600 × 900, screenshots to
`artifacts/sketch-cad/brake-hands-on`, real pointer moves at screen points
the scene reports (`element.cadShop().station` gains the handles' client
points and what is hot):

1. 300 × 100 blank on the brake, no line: the toolbar reads Flip over / Turn
   around (disabled, with its reason), no Flip Horizontal; the flip hoop shows
   (screenshot). Click it: the sheet turns over, the side view badge reads
   Flipped over, the panel's switch agrees.
2. Pick an edge, L 200: both handles; hover each (screenshots with chips and
   outcomes). Drag the turn ring past half: the sheet follows, lands turned,
   the panel's L is the opposite edge's (mid-drag screenshot). Drag the flip
   hoop a quarter and let go: back where it was, session unchanged.
3. The BT-2 channel case (115 × 60, the hit that collides one way round):
   the turn ring's chip says it clears turned around, and it does.
4. F, T; then typing 45 in Bend angle types "45" and flips nothing.
5. Frames: the grip's own work per drag frame, mean and worst, reported as
   `lastTurn` is. No page errors.

All existing tests and every verify script still pass (the last audited
state: 6604 tests, 15 shop scripts; record your own baseline first); lint 0
errors; build green.

## 6. HO-2: set the hit on the sheet

### 6.1 Click the edge that goes to the backgauge

In `gauge` mode, in `setup`, every edge the flat-blank card offers
(`station.edges`) is offered on the 3D sheet: its segment carried through the
piece matrices onto the part as posed (an edge an earlier bend crosses lights
in its parts). Within 10 px of the pointer (the card's `SNAP_PX`), nearest
first, never under a grip handle or a finger: the edge lights (accent, a mesh
ribbon), cursor `pointer`, chip `Edge 3 · 300 mm · click: to the backgauge`.
Click: exactly the card's `onPickEdge`. The sheet swings that edge to the
fingers (§5.3).

Two-point lines, etched lines and leaving a segment out stay on the card.
The panel's step 1 and the card's caption say "on the sheet or on the flat
blank"; the hint line's no-line text becomes `Click an edge of the sheet: it
goes to the backgauge · F flips the sheet`. A pinned refusal string that
changes ("Pick the gauge edge on the flat blank first…") is listed in the
report with its tests.

### 6.2 Push the backgauge

With a gauged line, the amber fingers are a handle (cursor `grab`, brighter
on hover, chip `Backgauge · L 200 · drag, or click to type`).

- **Drag** along the machine's Y (pointer ray on the horizontal plane through
  the fingers): L changes by the distance dragged, the sheet riding with the
  fingers; 1 mm steps, Alt 0.1 mm; never below 0. One change per animation
  frame through the card's own `onDistance` path (so a new L resets what a new
  line resets, as now). The readout by the cursor: `L 187 mm · flange 113.4`
  (the flange from the same `readouts` the panel shows, never recomputed in
  the view), and digits + Enter set L exactly, Esc puts back the L the drag
  started from.
- **Click**: the panel opens if closed, "Backgauge L (mm)" scrolls into view,
  takes focus, its text selected.
- Not offered where a millimetre of drag is not a millimetre of L, or there
  is no gauge (a two-point line, `turned` with no opposite edge): then the
  fingers are scenery and their chip says why ("No backgauge on a two-point
  line"). Report any case found.

### 6.3 The blades lead to their picker

Hovering the punch or the die lights it (a tint, not the collision red) with
a chip: `Straight 88° punch · click to change`. Click: the panel opens, the
Blades row scrolls into view, that picker opens and takes focus (the picker's
open state moves up out of `Blades` so the workspace can ask for it). The
holder, the ram, the bed and the backgauge beam name themselves on hover and
do nothing else. Real occlusion for these picks (the first thing under the
pointer), and only this pick ever raycasts the station's meshes.

Order under the pointer: grip, fingers, blades, edges.

### 6.4 Acceptance (HO-2)

Unit: an edge's 3D segments on a flat blank and on a part whose earlier bend
crosses it; the pick order; L from a drag (steps, Alt, floor, the typed
value, Esc).

Dom: an edge click equals the card's; a finger drag of 30 positions makes 30
facts-only stations and one pair of outcomes after it settles; a finger click
focuses the field; a punch / die click opens its picker and no other; nothing
is offered in `points` mode, a scrub, a stroke, the film.

Browser, appended to `verify-brake-hands-on.mjs`: on the sheet alone (the
flat-blank card never touched) — click an edge, drag the fingers to 187, type
`150` Enter mid-drag, click the die and choose another, Enter to bend, flip
with the hoop, second hit; the result equals the same hits made through the
card and the panel (compare the stored bends). Drag cost: mean ms per finger
position against the card's punch-line drag on the same part, reported; it
must not be more than 2 ms above it.

## 7. What must not change

The model, `CAD_VERSION`, saved files; `foldSheet`, `assessBend`,
`brakeCollisions` and every number they give; the panel's layout, labels and
accessible names; the flat-blank card; the side view; the pedal (Enter,
Space, the Bend button); the replay film; the existing turn-over's look and
`TURN_MS`. `docs/state-machines.md` `cad-brake` gains no stage: a handle drag
is view-only until it commits one ordinary session patch. Read the registry
first and say in the report whether the drag's own life (idle → pressed →
dragging → settling) wants a table by its rules.

## 8. Not in scope

- Setting the bend angle by dragging the flange; a ghost of the part as the
  hit will leave it.
- Dragging the punch's or the die's ends to set their length
  (`docs/sketch-studio-brake-tool-length.md` §5).
- Two-point lines, etched lines and segments picked in 3D.
- Any change to the panel's layout or removing its Flip / Turn controls.
- Sliding the sheet along the bed. Touch gestures beyond what pointer events
  give.

## 9. Later, the same idea on the other stations (not built here)

Candidates, each its own small spec once the user has tried HO-1 / HO-2:

- **Print**: the artwork already drags on its face; add a turn handle and
  corner handles for its size on the artwork itself.
- **Paint**: hovering a part says what a click will paint; the swatch in use
  rides by the cursor.
- **Cut**: drag a blank on the laser bed to place it on the sheet.
- The view toolbar hiding the model's part commands in those stations too.

## 10. Files (expected)

New: `brakeHands.js` (pure: the turn rule, the anchor, drag progress, the
shared patch, the fact wording, L from a drag, an edge's 3D segments), a
module for the grip's THREE objects (keep it out of `shopLayer.js`, already
1223 lines), their tests, `scripts/verify-brake-hands-on.mjs`.
Changed: `shopLayer.js` (hosts the grip, the turn rule, picks, state),
`CadViewport.jsx` (capture-phase handlers after `printDown`'s pattern, the
hint line, `cadShop()`, `isDragging`, the hot-handle call), `CadWorkspace.jsx`
(the outcomes, the acts, the toolbar, keys), `brakeStation.js` (the shared
patch; the view carries what the layer needs: edges, mode, the readout),
`PressBrakePanel.jsx` (picker state lifted, L focus, `verdictOf` shared),
`FlatPatternMap.jsx` (caption), `cad.css`, `docs/state-machines.md`,
`docs/sheet-metal-shop-guide.md` (a short "Hands on the sheet" section).

## 11. Builder rules and report

- HO-1 only in the first run; stop there. HO-2 after the audit.
- Read §2 – §4 against the code before writing any; where the code disagrees
  with this spec, the code is right: say so and proceed on the code.
- Do not commit. Run vitest from the repo root. Run every
  `scripts/verify-*.mjs` that touches the shop with
  `CAD_VERIFY_URL=http://localhost:5180/sketch` and stop the dev server after.
- Look at your own screenshots before reporting, at both sizes, in Solid,
  X-ray and Wire: the handles must read against the sheet, the die and the
  background, and must not be mistaken for the punch line (orange) or a
  collision (red). Say what you changed after looking.
- Report: each judgment call; each existing expectation that changed (old,
  new, why); the measured numbers (§5.4 budget, §5.6 item 5, §6.4 drag cost);
  what F / T / M / R did before and do now; tests, lint, build and every
  verify script as run, failures included; anything in §4 you could not meet.

## 12. Open, for the user

1. The panel keeps its own Flip sheet and Turn sheet around controls. Once
   the view has them, should they go, or stay as the record?
2. After these two phases: the other stations (§9), the angle on the flange,
   or the ghost of the finished hit — which first?
