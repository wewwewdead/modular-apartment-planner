# Phase I — Starting a sketch without the welcome card

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-10-31 by Fable after reading
the code and driving the real app; to be built by Opus and audited by Fable
against this document. Phase H's spec (`sketch-studio-direct-placement.md`)
is the model for how precisely this is meant to be read.

## 1. The problem, in the user's words

> If I start a new 3D drawing it shows a modal "start sketch" etc. It's just
> a bad UX. Can we improve it for a better UX?

What the app does today (verified in headless Chrome, 2026-10-31):

1. Entering **3D Model & workshop**, or pressing **New** inside it, shows a
   430 px card (`.cad-empty`, `CadWorkspace.jsx` ~1898–1932, `cad.css` 446–475)
   floating over the centre of the viewport: "From a precise model to the
   workshop." plus six unrelated buttons (Start a sketch, Design parameters,
   Create tube member, Welded table example, Pump bracket drawing study,
   Import 2D profiles). It reads as a modal and hides the origin.
2. **Start a sketch** does not start a sketch. It switches the ribbon to the
   Sketch tab and opens the _Properties_ panel at the far right with a form:
   "Sketch on a plane", a `Plane` dropdown of `XY / XZ / YZ`, an `Offset (mm)`
   field and a **Start sketch** button (`panel === 'sketch-plane'`,
   CadWorkspace.jsx ~2242–2272; `startPlaneSketch` ~611). The card stays on
   screen behind it. Three clicks spanning the whole window, one of them a
   dropdown of axis letters with no picture, before the first line can be drawn.
3. The Sketch ribbon asks the user to choose the _mechanism_ before the
   intent: **Sketch on face** (needs a part, else throws "Add a part first, or
   use Sketch on plane.") and **Sketch on plane** are separate commands, next
   to two legacy form-based ones (**New sketch** = `SketchForm`,
   **Line / arc / spline** = a 'Precision path' profile sketch).
4. Once a sketch _is_ running the experience is good (Phase A sketcher, grid,
   HUD typing, Esc-Esc saves). The problem is only the way in.

## 2. What the good tools do → principles

Fusion 360, Onshape, SolidWorks and Shapr3D agree on the way into a sketch:

- **No welcome dialog.** A new design is an empty viewport with the grid, the
  origin and the three origin planes. Guidance lives in a side panel or a
  one-line hint, never in a box over the model.
- **Planes are picked in the viewport, not from a list.** Create Sketch makes
  the three origin planes appear as translucent squares; hovering highlights
  one, clicking it starts the sketch and turns the view square to it
  (Fusion, SolidWorks). Onshape keeps Top/Front/Right visible at all times and
  scales them with the model. Shapr3D goes further: the ground grid _is_ the
  sketch plane, you just draw.
- **One command.** "Sketch" accepts a face or a plane; the user does not
  choose between "on face" and "on plane" up front.
- **Exact values stay available as the second path**: an offset field, a
  plane name, typed coordinates.

Principles for this app: keep the existing idioms (viewport hint bar,
`.cad-help` panel prose, `cad-primary` buttons, `perform()` error reporting,
Phase A `beginSketch`), change no stored schema, touch no kernel code, and
make the Properties panel the _second_ way to do what the mouse can do.

## 3. The interaction model

| Situation                                                                  | What the user sees                                                                                                                                                                                                                                                                     | What a click does                                                                                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty model, at rest** (no sketch, draft, measure, mate, hole tool)      | Grid, axes, three origin plane tiles meeting at the origin (Top·XY, Front·XZ, Right·YZ), labels at their outer corners. Hint: _Click an origin plane to start a sketch · S starts one anywhere · Solid tab adds a board or tube_. Properties shows the **Start** list (§4.4). No card. | Tile or its label → sketch starts on that plane at offset 0 (camera squares to it, sketch bar opens). Background drag still orbits.                                          |
| **New sketch** command (ribbon, Start list, or key `S`) — the _pick_ stage | Tiles appear (sized to the model), flat faces highlight on hover, hint: _New sketch: click a flat face or an origin plane · Esc cancels_. Properties: "New sketch" with the exact path (plane select, offset, Start sketch).                                                           | Flat face → sketch on that face (today's `pickSketchFace`). Tile/label → sketch on that plane at the panel's offset. Curved face → hint says so, nothing else. Esc → cancel. |
| **Sketching**                                                              | Unchanged (Phase A).                                                                                                                                                                                                                                                                   | Unchanged.                                                                                                                                                                   |
| **Model has parts, at rest**                                               | Unchanged: no tiles, "Build accurately." panel.                                                                                                                                                                                                                                        | Unchanged.                                                                                                                                                                   |

Two clicks from opening the workspace to drawing (tile → tool), versus
three clicks and a dropdown today.

## 4. Behaviour in detail

### 4.1 The welcome card goes away

Delete the `.cad-empty` block and its CSS. Nothing replaces it _in the
viewport_ except the origin plane tiles and the hint line. Its contents move
to the Start list in the Properties panel (§4.4). The "N parameters ready ·
start a sketch to use them" title (Phase C/D) becomes the first line of that
list, as a paragraph, with the same text.

### 4.2 Origin plane tiles

Geometry — build it from `planeFrame(plane, offset)` (`sketchPlane.js`) so
the tile _is_ the frame the sketch will get: the tile for plane P is the
square `origin + u·x + v·y` for `u, v ∈ [−S/2, S/2]`, **centred on the frame
origin** (the world origin shifted by the offset along the plane's own
axis). XY lies at z = offset spanning ±X/±Y, XZ at y = offset spanning
±X/±Z, YZ at x = offset spanning ±Y/±Z — check these against `NAMED_PLANES`,
do not assume. The three tiles cross at the origin like the origin planes of
Fusion, Onshape and SolidWorks; from the default isometric camera
([1, −1, 0.8]) each tile has one unoccluded quarter (Top at +x/−y, Front at
+x/+z, Right at −y/+z), so there is always a clear place to click. Sketch
(0, 0) is the tile's centre. (§11 records why the first build's
positive-quadrant tiles were replaced.)

Size `S` is the tile's edge length: empty model → 400 mm. Otherwise
`clamp(0.5 × largest extent of the displayed model bounds, 200, 3000)` mm,
recomputed when the bounds change. Tiles are world-fixed (they do not
rescale with zoom). The empty-model camera frames the origin as it did
before this phase; if a label chip would leave the canvas, clamp the chip
inside the viewport (as the gizmo HUD is clamped) rather than moving the
camera.

Names: XY = **Top**, XZ = **Front**, YZ = **Right**. These must agree with
`CadViewport.jsx` ~1476 `directions` (front = [0, −1, 0] looks at the plane
whose normal is −Y, i.e. `NAMED_PLANES.XZ`; right = [1, 0, 0] → YZ; top →
XY). Verify, then hard-code in one place (`PLANE_NAMES`).

Look: a double-sided `MeshBasicMaterial` fill, `transparent`, `depthWrite:
false`, `renderOrder` above the grid; plus an edge loop. Resting: fill
`#287fb3` at 0.06 alpha, edge `#8fa6b8`. Hovered: fill 0.22 alpha, edge
`#246e9a`, cursor `pointer`, label chip highlighted. Never pick up the
model's dimming/selection logic.

Labels: HTML chips in a **new** container `.cad-plane-labels` (not
`.cad-mark-labels` — scripts count mark labels), one `.cad-plane-label` per
tile with `data-plane="XY|XZ|YZ"`, text `Top · XY` etc., anchored at the
tile's `(+S/2, +S/2)` corner and pushed a few px outward on screen,
re-projected each frame the way mark labels are (`labelsRef` loop,
CadViewport.jsx ~321/401/470). `pointer-events: auto`: hovering a label
highlights its tile, clicking it picks the plane. Hidden with the tiles.

Visibility (a single derived boolean in CadWorkspace passed down as
`planes={{ visible, offset }}`):
`(model.parts.length === 0 && !sketchSession && !operationDraft &&
!measureSession && !mateSession && !holeMode) || sketchSession?.stage ===
'pick'`. Offset is 0 at rest and the panel's offset value during the pick.

Offset: when the panel's **Plane offset (mm)** is non-zero, _every_ tile
moves along its own axis by that amount (that is exactly what the existing
help text promises: "XY → Z, XZ → Y, YZ → X"), live as the field changes, so
what the user clicks is what they get.

Raycasting: tiles live in their own `planeLayer` group, **not** in `group`
(every existing `intersectObjects(group.children, …)` for selection, holes,
measure and placement must keep ignoring them). Test the tiles only when they
are visible. During the pick stage, cast against both the model and the
tiles and take the nearest hit; with a flat face nearest → face pick, tile
nearest → plane pick, curved face nearest → the curved hint. A click is a
click only if the pointer moved ≤ 4 px since pointerdown (match the
sketcher's `CLICK_PIXELS`), so orbiting never starts a sketch.

Script API: `element.cadPlanes()` on the viewport DOM node returns
`{ visible, size, offset, hovered: 'XY' | 'XZ' | 'YZ' | null, tiles: {
XY: [[x,y,z]×4], XZ: …, YZ: … } }`, corners in (u, v) order (−,−), (+,−),
(+,+), (−,+), in the style of `cadGizmo()` / `cadPlacement()`.

### 4.3 One "New sketch" command and its pick stage

Ribbon (Sketch tab), in this order: **New sketch** · **Import 2D profiles**
· **Freehand drafting** · **Sketch from fields** (the old "New sketch" →
`SketchForm`) · **Precision path** (the old "Line / arc / spline"). The two
old commands **Sketch on face** and **Sketch on plane** are removed; `New
sketch` replaces both. Do not name the new command "Sketch": scripts locate
the _tab_ with `getByRole('button', { name: 'Sketch', exact: true })`.

`startSketchPick` no longer requires instances. It calls
`resetModesForSketch()`, sets `sketchSession = { stage: 'pick' }`,
`panel = 'sketch-pick'`, and opens the Properties panel. `pickSketchFace`
is unchanged. Add `pickSketchPlane(plane, offset)` = today's
`startPlaneSketch` body with its arguments (frame from `planeFrame`,
`support: { type: 'plane', plane, offset }`), used by tile clicks, label
clicks and the panel's Start sketch button. Delete `panel === 'sketch-plane'`
and `sketchPlaneChoice`'s plane-only use; keep an `offset` draft state for
the pick stage.

Face hover feedback during the pick (new): outline the flat face under the
cursor with a `#287fb3` line loop drawn from `pickedFace(hit).outlineWorld`
into a pick layer; clear it when the cursor leaves. `pickedFace` copies every
vertex of the mesh, so run hover through `requestAnimationFrame` and skip the
recomputation when `(object, faceIndex)` is unchanged. Curved face → no
outline, hint _Curved face — pick a flat one_. Hovered tile → hint _Sketch on
Top (XY) · click to start_ (with a non-zero offset: _Sketch on Top (XY,
+100 mm)_). Hovered flat face → _Sketch on this face of {part name} · click
to start_. The idle pick hint is _New sketch: click a flat face or an origin
plane · Esc cancels_. These strings are asserted by the browser script; keep
them exact. Footer status during the pick: _Pick a face or plane to sketch on_.

Properties panel during the pick (`panel === 'sketch-pick'`):

```
h3  New sketch
p.cad-help  Click a flat face of a part, or one of the three origin planes in
            the view. The camera squares to it and the sketch bar opens.
h4  Exact plane
label Plane      <select aria-label="Sketch plane">XY · XZ · YZ</select>
label Offset (mm) <input aria-label="Plane offset (mm)" type="number">
                 small: moves each origin plane along its own axis
button.cad-primary  Start sketch      → pickSketchPlane(select value, offset)
button  Cancel
```

The three labels `Sketch plane`, `Plane offset (mm)`, `Start sketch` are
load-bearing: five browser scripts type the exact path through them.

Keyboard: `S` starts New sketch. Add it to `rotateKeys.js
placementKeyAction` as `{ type: 'tool', tool: 'sketch' }` with the same
guards as `D` (no modifiers, not in an editable, not while `busy`, not on
repeat) — unlike D it does **not** fire while busy. Esc during the pick keeps
working through the existing `pickingFace` effect (CadWorkspace.jsx ~1235).

### 4.4 The Start list (Properties panel, empty model)

When `model.parts.length === 0` and `panel === null` and no session/draft is
active, the default Properties content (today "Build accurately.",
CadWorkspace.jsx ~2831) is instead:

```
section.cad-start[aria-label="Start"]
  h3  Start
  p   {N} parameter(s) ready · start a sketch to use them      (only if parameters exist)
  button.cad-primary  New sketch        small: or click an origin plane in the view · S
  div.cad-inline  [Board / plate] [Tube / member]
  button  Design parameters
  h4  Examples
  div.cad-inline  [Welded table example] [Pump bracket drawing study] [Rear cover example]
  button  Import 2D profiles
  p.cad-help  Your 2D drawings stay in 2D drafting (top right).
```

Button names are exact: three scripts click `Design parameters` and `Pump
bracket drawing study` inside the old card and will be re-pointed at
`.cad-start`. Each button runs the same action the card/ribbon runs today
(`addPart('board'|'member')`, `openDesignParameters`, `loadExample('table'|
'pump'|'cover')` through `perform`, `setPanel('import-drafting')`).

With parts present the default panel stays exactly as it is.

### 4.5 After a sketch finishes

In the `sketch-finished` panel the **Extrude** button takes focus when the
panel opens (`autoFocus`), so Enter extrudes a closed profile without
reaching for the mouse. Nothing else changes there.

### 4.6 Messages to update

- `setParameterNotice(... '— next: Start a sketch or Design parameters → Build')`
  (CadWorkspace.jsx ~835) → `— next: New sketch or Design parameters → Build`.
- `startSketchPick`'s "Add a part first, or use Sketch on plane." goes away.
- `pickSketchFace`'s "…use Sketch on plane instead." → "…pick an origin plane
  instead."
- The pick hint default in CadViewport.jsx ~1527 → the new idle pick hint.

## 5. Code map (verified anchors; re-grep before editing)

- `CadWorkspace.jsx`: state `sketchSession` 210, `sketchPlaneChoice` 211,
  `panel` 242; `resetModesForSketch` ~540, `beginSketch` ~551,
  `startSketchPick` ~594, `pickSketchFace` ~602, `startPlaneSketch` ~611;
  `commands` ~1004–1046 (Sketch tab entries); the `pickingFace` Esc effect
  ~1235; welcome card ~1898–1932; panels `sketch-plane` ~2242, `sketch-pick`
  ~2273, `sketching` ~2289, `sketch-finished` ~2302, legacy `sketch` ~2423;
  default panel ~2831; footer status ~2850.
- `CadViewport.jsx`: props 42–85 (`sketchMode`, `onPickSketchFace`,
  `pickHint`); scene setup ~240–262 (grid at z = −0.5, `AxesHelper(150)`,
  layers `sketchLayer/snapLayer/rotateLayer/markLayer/measureLayer`); click
  routing ~1095–1115 (`ctx.sketchMode === 'pick'` → `pickedFace(hit)`);
  `holeCallbacks.current` 178; standard views ~1476; mark-label projection
  loop ~321/401/470 and `.cad-mark-labels` CSS 1039; hint bar JSX ~1516–1555;
  `pickedFace` ~1725 (returns `outlineWorld`, `centre`, `planar`).
- `sketchPlane.js`: `NAMED_PLANES`, `SKETCH_PLANES`, `planeFrame(plane,
offset)`, `OFFSET_AXIS`.
- `sketchOperations.js` `sketchView` 220 (what the camera frames when a
  sketch starts; unchanged).
- `rotateKeys.js` `placementKeyAction` (D → measure is the pattern for S).
- `cad.css`: `.cad-empty` 446–475 (delete), `.cad-viewport-hint` 403,
  `.cad-mark-label` 1045 (copy the chip style for `.cad-plane-label`),
  `.cad-primary` 476.
- `CadEditors.jsx` `SketchForm` 768 (legacy, rename its ribbon label only).

## 6. Rules

- No `CAD_VERSION` bump, nothing new persisted, `kernel.js` and the worker
  untouched. A sketch started from a tile is byte-identical in the model to
  one started from the old form (`support: { type: 'plane', plane, offset }`).
- One element per HUD class (Phase H audit rule): no second
  `.cad-gizmo-hud` / `.cad-placement-hud` / `.cad-measure-hud`; plane labels
  get their own container.
- Tiles never enter `group`; existing raycasts must not see them.
- Hover work is rAF-throttled; no per-frame React renders for hover (direct
  DOM/three updates via refs, as the gizmo HUD does).
- Dispose tile geometry/material when the layer is cleared; never dispose
  shared model geometry.
- Run vitest from the repo root (`npx vitest run src/features/sketchstudio/cad`),
  never from inside `cad/` (it leaves a stray `cad/node_modules/.vite`).
- Do not commit. Leave the working tree for Fable's audit.

## 7. Tests, scripts and docs that must change

Unit / DOM tests (vitest, jsdom):

- New `originPlanes.js` (pure: `PLANE_NAMES`, `planeTiles({ bounds, offset })`
  → size rule + corners via `planeFrame`, `planeHint(plane, offset)`) with
  `originPlanes.test.js`: size clamps (empty → 400; 100 mm part → 200; 10 m
  part → 3000), XZ offset +100 puts the tile at y = 100, each tile's first
  corner is the frame origin, names map.
- `rotateKeys.test.js`: `s` → `{ type: 'tool', tool: 'sketch' }`; not while
  busy; not inside an input; not with Ctrl.
- New `CadWorkspace.start.dom.test.jsx` (follow the existing
  `CadWorkspace.*.dom.test.jsx` harness): empty model renders no `.cad-empty`
  and a `.cad-start` with the listed buttons; a model with a part renders
  neither; **New sketch** → hint contains the idle pick text, panel has
  `Sketch plane` + `Plane offset (mm)` + `Start sketch`; typing offset 50 and
  Start sketch with YZ → the saved sketch after a finish has
  `support: { type: 'plane', plane: 'YZ', offset: 50 }` (or assert the
  session frame if finishing is awkward in jsdom); Esc during the pick clears
  the session; `S` key enters the pick.
- `CadViewport` tests: if the existing viewport DOM tests mock WebGL, add
  one asserting `cadPlanes()` reports three tiles when `planes.visible` and
  none when not; otherwise cover the geometry in `originPlanes.test.js` only
  and say so.

Browser scripts (Playwright, `channel: 'chrome'`, headless; a Vite dev
server is already listening at `http://127.0.0.1:5181/` — pass
`CAD_VERIFY_URL=http://127.0.0.1:5181/sketch`; restart it on the same port
if HMR gets stuck):

- `scripts/sketch-cad-steps.mjs` `sketchOnPlane` (line ~38) → click
  **New sketch**, then the exact path (labels unchanged); line ~104
  `Sketch on face` → `New sketch`.
- `scripts/verify-sketch-on-face.mjs` 50–53, 126, 236; `scripts/verify-direct-placement.mjs` 267
  → `New sketch`.
- `scripts/verify-parameters.mjs` 32, `scripts/verify-engineering-drawings.mjs` 25,
  `scripts/verify-starter-models.mjs` 22 + 100–118 → `.cad-start`, the
  parameters-ready paragraph, the new notice text.
- `scripts/verify-sketch-cad.mjs` 40 `New sketch` → `Sketch from fields`.
- New `scripts/verify-start-sketch.mjs`, screenshots to
  `artifacts/sketch-cad/start-sketch/`: fresh model → no `.cad-empty`,
  `cadPlanes().visible` with three tiles, `.cad-plane-label` ×3; hover the Top
  tile via `cadProject([200, 200, 0])` → hint _Sketch on Top (XY)_, `hovered
=== 'XY'`; click → `Sketch tools` toolbar visible, footer _Sketching_;
  draw a 100×60 rectangle by HUD typing, Esc Esc → saved sketch `support
= { plane: 'XY', offset: 0 }`, `sketch-finished` panel has focus on
  Extrude; back at rest with a sketch but no parts the tiles are still shown;
  press `S` → pick stage, hint idle text; type `Plane offset (mm)` 50, hover
  the Front tile (project a point on it at y = 50) → hint contains `+50 mm`;
  click the `Right · YZ` **label** → sketch starts, support `{ plane: 'YZ',
offset: 50 }`; Cancel sketch; add **Board / plate** from the Start list →
  tiles hidden at rest; `S` → tiles back, sized 300; hover the board's top
  face → hint _Sketch on this face of Board / plate_, click → face sketch
  (session support type 'face'); Esc Esc; drag the background 60 px during a
  pick → no sketch started. Write `verification.json` like the other scripts.
- Run every script above plus `verify-measure-marks.mjs` and
  `verify-gizmo-hud.mjs` (they depend on the hint/HUD DOM) and report each
  result verbatim.

Docs:

- `docs/sketch-studio-cad.md`: the opening and "Typical workflow" describe
  the new way in (origin planes, New sketch, S, exact plane in the panel).
- `docs/industrial-cabinet-guide.md` steps 4, 7, 9, 11, 15, 16, 21: replace
  "Sketch on plane → XY, Plane offset 100 → Start sketch" with "New sketch →
  Exact plane XY, offset 100 → Start sketch (or type the offset and click the
  Top tile)" and "Sketch on face → click …" with "New sketch → click …".
- `docs/sketch-studio-step-by-step.md` §1 checkpoint: mention the three
  origin planes at the centre of the view.

## 8. Acceptance (what the audit checks)

1. No `.cad-empty` anywhere in `src/`; no `sketch-plane` panel; no ribbon
   buttons named Sketch on face / Sketch on plane.
2. Fresh workspace: tiles + labels visible, Start list in Properties, hint
   text exact; one click on a tile is drawing.
3. New sketch with a part: faces outline on hover, tiles sized to the model,
   nearest-hit rule, Esc cancels, S enters, offset moves tiles live.
4. Exact path still works with the three unchanged labels.
5. Saved model for a tile sketch equals the old form's output.
6. All listed scripts pass against 127.0.0.1:5181; full `npx vitest run`
   green; `npm run lint` 0 errors.
7. Docs updated as listed.

## 9. Out of scope

Construction/offset planes as model features, a plane visibility toggle in
the view strip, auto-extrude after finishing, the legacy field-based sketch
forms beyond their relabel, the 2D drafting landing page, perspective
projection of labels beyond what the mark-label loop already does.

## 10. Judgment calls to flag in the report

Anything in §4 that the code made impossible or clearly worse; the final
tile colours/alphas if changed; how hover is throttled; whether the viewport
DOM tests could cover the tiles; any script that needed more than the listed
edits; anything found broken that predates this phase (report, do not fix
unless it blocks a listed script).

## 11. Amendments after the first audit (Fable, 2026-10-31)

The first build followed §4.2 as originally written (tiles in the positive
quadrant, inner corner at the origin). Fable's screenshots from the default
isometric camera showed the flaw in that design: the Front tile (y = 0,
spanning +X/+Z) stands between the viewer and the origin corner, so it lies
over the left half of the Top tile and the lower half of the Right tile. The
three tiles read as one overlapping prism, and a click on what looks like the
floor near the origin picks Front. That is why every CAD package centres its
origin planes. §4.2 now says centred; the rest of the design is unchanged.

Concretely, for the second round:

1. `originPlanes.js` `planeTiles`: corners at `u, v ∈ {−S/2, +S/2}`; label
   anchor at `(+S/2, +S/2)`; tests updated (a corner at `(−200, −200, 0)` and
   `(200, 200, 0)` for the empty XY tile; XZ at offset +100 has every corner
   at y = 100; the YZ tile's `(+S/2, +S/2)` corner is `(offset, S/2, S/2)`).
2. `CadViewport.jsx`: drop the empty-model framing change at the
   `center.set(EMPTY_TILE_SIZE / 2, …)` line (frame the origin again, size
   600 as before); clamp label chips inside the canvas instead.
3. Scripts and tests that hover a tile point: use the unoccluded quarters —
   Top `[120, −120, 0]`, Front (offset 50) `[120, 50, 120]`, Right
   `[0, −120, 120]`; the Right `.cad-plane-label` click stays.
4. **New inside the 3D workspace must stay in the 3D workspace.** Verified
   pre-existing bug, inside this phase's remit ("start a new 3D drawing"):
   with anything to confirm, New → in-app Confirm → OK lands on the 2D
   drafting screen, because `useSketchPersistence.js` `handleNewSketch`
   (~184–206) builds the blank workspace with a `ui` that omits
   `workspaceMode`, and `sketchStudioReducer.js` (~773) defaults a missing
   mode to `'draft'`. Fix: pass `workspaceMode: state.ui.workspaceMode` in
   that `ui` object (the document snapshot a few lines above already does).
   Do not change Open/import, where the file's own mode should win. Add a
   browser-script step: Board / plate → New → click the in-app **OK** →
   still `.cad-workspace`, footer _Model current_, `cadPlanes().visible`,
   `.cad-start` present, 0 instances. If `useSketchPersistence` has a unit
   test file, add a case; otherwise say so. Remove the now-false sentence in
   `docs/sketch-studio-step-by-step.md` §1 ("If you return to the drafting
   screen, click 3D Model & workshop again").
5. The `.cad-plane-label` `title` attribute may keep the words "Start a
   sketch"; the grep in acceptance item 1 is about the old card and button.
