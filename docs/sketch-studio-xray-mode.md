# Sketch Studio 3D workstation — Solid, X-ray and Wireframe view modes

Spec for see-through view modes in the Sketch Studio "3D Model & workshop"
viewport (`src/features/sketchstudio/cad/CadViewport.jsx`, state in
`CadWorkspace.jsx`). Written 2026-11-07 by Fable after reading the code; to
be built by Opus 5.5; audited by Fable against this document. It is the CAD
sibling of `docs/preview-xray-mode.md` (the floor-plan 3D preview's modes,
built and audited the same day) and keeps that spec's vocabulary, keys and
non-persistence rule so the two panes feel like one product.

## 1. The ask, in the user's words

> can we also add wire and x-ray to the 3d space on sketchstudio?

"Also" = the floor-plan preview got `Solid | X-ray | Wireframe` this morning
(`docs/preview-xray-mode.md`); the user wants the same in the parts
workstation. What X-ray is _for_ in a parts assembly is different from a
building: there is no skin over a structure. What a workshop user wants to see
through to is **hardware seated in holes** (bolt shanks inside a board, pins
inside a cabinet side), **parts hidden inside other parts** (a tube inside a
sleeve, a drawer inside a carcass), and **the hidden edges of the part they
are working on** (a pocket on the far face, a hole's far end). Wireframe is
the drafting view: every edge, nothing filled.

## 2. What the code does today (verified 2026-11-07 against source)

Siblings read for this spec (per the research-before-spec rule): the
floor-plan preview's `viewMode.js` / `materials.js` / `ThreePreviewPanel.jsx`
(the contract this spec mirrors), the CAD viewport's mesh build and pose
effects, `marks.js` (Measure snapping, which reads the mesh hit),
`rotateKeys.js` (the workstation's key router), `placementLayer.js` (its own
materials, untouched), the hardware model (`hardware.js`), and the Vitest
stand-ins in `CadViewport.dom.test.jsx` / `CadWorkspace.keys.dom.test.jsx`.

### 2.1 Where view state lives

- `CadWorkspace.jsx` 218–233: pane-local view state as plain `useState` —
  `view`, `perspective`, `exploded`, `isolated`, `section`, `sectionDepth`,
  `fitKey`. Nothing is persisted (no `localStorage` use in the file); nothing
  of this enters `model` or the saved document. A view mode belongs here.
- The view toolbar (`.cad-view-toolbar`, 1745–1962) holds the Standard view
  `<select>`, the `Perspective|Orthographic` button, `Fit`, Move/Rotate
  part, the flips, hole tools, Measure, Show marks, the rotate sub-controls
  (which use the `.cad-segmented` group pattern, 1874–1884, styled in
  `cad.css` 342–359 with `aria-pressed` highlighting), the move snap, `Split
drawing`, and `Section Z`. The ribbon (`commands`, 1143+) has Assemble-tab
  commands `Isolate`, `Exploded view`, `Section` (1248–1257) but the ribbon
  is disabled while any tool runs (1572–1578), so a view toggle belongs in
  the view toolbar, not the ribbon.
- `CadViewport` receives view state as props (`isolated`, `view`,
  `perspective`, `exploded`, `section`, 60–64) and applies it in effects; the
  pose effect (1659–1703) is where per-part appearance is decided.
- Keys: `rotateKeys.js placementKeyAction` is the one router for workstation
  keys (R, M, ], [, D, S), consumed in `CadWorkspace.jsx` 401–441 from a
  `window` `keydown` listener. It bails on Ctrl/Meta/Alt, `defaultPrevented`,
  editable targets and a gizmo drag; D and S are handled _before_ the
  `!selected || busy` early return (36–39) so they work without a selection.
  The 2D studio's `useSketchKeyboard.js` 75 returns early in
  `workspaceMode === 'model'`, and no CAD file binds plain `x`/`X` (grep over
  `src/features/sketchstudio` for `'x'`/`'X'`/`KeyX` key comparisons finds
  only axis-name strings), so `X` / `Shift+X` are free.
- `grep -ri "wireframe\|xray\|x-ray" src/features/sketchstudio` → nothing.

### 2.2 How a part is drawn

- Mesh build effect (`CadViewport.jsx` 1620–1657): on **every snapshot** the
  group is emptied, every mesh's geometry _and material_ disposed, and each
  instance rebuilt as `Group [ Mesh, LineSegments ]` with a **fresh
  `MeshStandardMaterial`** (`color 0x8795a4, roughness 0.55, metalness 0.15,
side: DoubleSide`) and a fresh `LineBasicMaterial` for the edges
  (`0x3e4e5f, transparent: true, opacity: 0.65`). `group.children[0]` is the
  body, `[1]` the edges — a positional contract read by the sketcher edge
  export (157), the pose effect (1688), `createRotateFeedback` (1983, which
  _shares_ the edge geometry) and `measureAt` (537, which reads the edge
  positions for snapping). Nothing may be inserted before these two children.
- Pose effect (1659–1703), re-run on `snapshot, model, selectedId, isolated,
exploded, section, sketchMode, sketchSupportId, placing`: sets
  `group.visible` from `instance.visible` and isolation; the optimistic pose;
  the body colour (`#3687bd` selected, `#bd956b` for a wood material name,
  else `#8795a4`); the **sketch dim** (`dim` = 0.5 for the sketched-on part,
  0.28 for the rest, 1 otherwise) by flipping `transparent/opacity/depthWrite`
  on the body material in place with `needsUpdate = true`, and the edge
  opacity (0.35 dimmed / 0.65); and the section plane as
  `material.clippingPlanes` on both children. `renderer.localClippingEnabled`
  is true (240).
- Scene: `#e7ebef` background, hemisphere + directional light, grid, axes.
  No shadows, no post-processing, no batching, no instancing — none of the
  floor-plan preview's AO/shadow/batch constraints apply here.
- Picking: `pointerUp` (1396–1477) raycasts `group.children` and takes the
  first `Mesh` whose parent is visible; the same pattern in `measureAt`
  (521–525), `holeDown`, `planeTarget`, `pickPivot`. `Raycaster` ignores
  opacity, so a translucent body is still hit — good: clicks keep working
  in a see-through mode without changes.
- Measure (`marks.js measureCandidates`, 214–300): with a surface `hit`,
  candidates deeper than `hit + OCCLUSION_PX (16 px)·mm/px` are dropped
  (232–240). In a see-through mode the user _sees_ the vertex behind the
  glass part but could not snap to it — this spec relaxes that (§3.8).
- Debug hooks for scripts live on the host element: `cadGizmo`,
  `cadProject`, `cadMarks`, `cadPlanes`, `cadPlacement`, `cadHoleHandles`
  (327–1297). The host is `<div className="cad-viewport">` (1872).
- The viewport hint footer (`.cad-viewport-hint`, 1879–1917) composes
  per-tool lines; the workspace status footer (`.cad-status`, 3119+) is
  about the kernel, not the view.

### 2.3 three.js facts that decide the material design (three 0.183.2)

1. **`transparent` is in the program key** (`WebGLPrograms.js` 252 → `#define
OPAQUE`), so flipping it on a live material needs `needsUpdate` and
   relinks a program. `opacity`, `depthWrite`, `color` are plain state. The
   sketch dim already pays this per part today (1690–1695).
2. **Programs are destroyed when their last material releases them.**
   `WebGLPrograms.releaseProgram` (618–634): `--usedTimes === 0` → removed
   from the cache and `program.destroy()`. A material releases its programs
   when it is **disposed** or re-fetches on `needsUpdate`
   (`WebGLRenderer.js` 1127–1146). Consequence for this viewport: because
   every snapshot disposes every material (§2.2), a mode that lived on
   per-mesh materials would **relink the transparent program on every edit
   made in X-ray** (old materials released → program destroyed → new
   materials link it again) and on every return to X-ray after Solid. The
   floor-plan spec avoided this with palette-owned twins; here the fix is a
   viewport-owned material cache (§3.4) so no body material is ever disposed
   before unmount.
3. **Clipping plane count is in the program key too** (`numClippingPlanes`,
   `WebGLPrograms.js` 339/470). Section on/off already relinks today; with a
   cache, each (mode × section) family links once per viewport life.
4. **Transparent objects are drawn after opaque ones, sorted back-to-front
   by object depth, after `renderOrder`.** The edges are _already_ transparent
   materials, so in a see-through mode bodies and edges interleave in the
   transparent pass. `depthWrite: false` on ghost bodies means an edge behind
   a ghost passes the depth test and shows — this is the X-ray look, and the
   reason the ghost bodies must not write depth.
5. `Raycaster` ignores `opacity` and `visible` is not touched by this spec,
   so picking, hole placement, face picking and mate picking need no change.

## 3. Decisions

1. **Three modes, one control, same names and keys as the floor-plan
   preview.** `solid` (default) · `xray` · `wireframe`. A `.cad-segmented`
   group `role="group" aria-label="See-through mode"` with buttons `Solid` /
   `X-ray` / `Wire` (the third has `aria-label="Wireframe"`), placed in the
   view toolbar right after `Fit` (before Move part), always shown.
   `aria-pressed` marks the active one. `X` toggles Solid ↔ X-ray (from
   Wireframe, `X` → Solid); `Shift+X` toggles Wireframe ↔ Solid. The keys
   work with or without a selection and **while a tool runs** (it is a view
   toggle: looking through a board while seating bolts is the use case) but
   never while typing in a field, during a gizmo/placement drag, with
   Ctrl/Meta/Alt, or on key repeat. Not persisted; a remounted workspace
   starts in Solid; nothing enters `model`, history, the saved document, the
   drawings, or the exports.
2. **X-ray = other parts turn to glass; the selected part and hardware stay
   solid.** This is the tier rule for a parts model (the floor-plan tiers
   skin/deck/structure have no analogue here):

   | body                                                                                                                                | solid             | xray                                          | wireframe                         |
   | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------- | --------------------------------- |
   | selected instance (`selectedId`, when not sketching/placing — same condition as the blue colour today)                              | opaque, `#3687bd` | **opaque**, `#3687bd`                         | ghost α **0.04**, edges `#3687bd` |
   | hardware part — a part with a feature of `type: 'hardware'` (`hardware.js hardwareDefaults`, 658/670; bolts, nuts, washers, screws) | opaque            | **opaque**                                    | ghost α 0.04                      |
   | every other body                                                                                                                    | opaque            | ghost α **0.22** per face, `depthWrite false` | ghost α 0.04, `depthWrite false`  |
   | edges of an opaque body                                                                                                             | 0.65              | 0.65                                          | —                                 |
   | edges of a ghost body                                                                                                               | 0.65              | **0.55**                                      | **1.0**                           |

   Colours are kept (wood stays `#bd956b`, metal `#8795a4`): no cool tint
   like the floor-plan ghosts, because here the material colour is
   information (wood vs steel) and there is no solid "structure" to contrast
   against. Opus may tune within xray 0.18–0.30 and wireframe 0.03–0.06 from
   the screenshots in §8 and records the values in §10. All bodies are
   `DoubleSide`, so a ghost reads at ≈ `1-(1-α)²` (0.22 → ≈0.39).
   A hidden instance (`instance.visible === false`) and isolation
   (`isolated`) keep hiding parts as today in every mode; Exploded and
   Section compose with every mode unchanged.

3. **Wireframe is "every edge".** Bodies at α 0.04 with `depthWrite false`
   keep a faint fill (so faces still read and clicks still land) while every
   edge, including those behind other parts and the part's own far edges,
   draws at full strength (§2.3.4). The selected part is identified by its
   edges turning the selection blue, since its body is invisible.
4. **Materials come from a viewport-owned cache; meshes borrow, never own.**
   Replace the per-mesh materials (§2.2) with `createMaterialCache()` in
   `ctx` (§4.1): `body(color, opacity, { depthWrite })` and
   `edge(color, opacity)` return one shared material per distinct key,
   created lazily, kept for the viewport's life, and disposed only in the
   unmount cleanup (`CadViewport.jsx` 1558–1566 — the traversal there must
   stop disposing body/edge materials and dispose the cache instead). The
   snapshot rebuild disposes geometry only. Expected cache size: ≤ 3 colours
   × ≤ 5 opacities (1, 0.5, 0.28, xray, wireframe) for bodies plus a handful
   of edge keys. This (a) removes the N-materials-per-edit churn, (b) keeps
   every program ever linked alive (§2.3.2) so a toggle or an edit in X-ray
   never relinks, and (c) makes the sketch dim a material swap instead of a
   per-mesh `needsUpdate`. Section: the cache gets `setClippingPlanes(planes)`
   which writes `clippingPlanes` on every cached material (and on ones
   created later); the pose effect calls it once instead of per child.
5. **Appearance is a pure function.** `bodyAppearance({ mode, selected,
hardware, dim })` (§4.1) returns what the pose effect applies; the pose
   effect only composes inputs and swaps materials. The sketch dim composes
   as: an opaque-in-mode body uses `dim` as today; a ghost uses
   `min(ghostAlpha, dim)`; edges use `min(edgeAlpha(mode), dim < 1 ? 0.35 :
1)`. `transparent = opacity < 1`, `depthWrite = opacity === 1`.
6. **Draw order.** Ghost bodies `renderOrder = 1`, edges `renderOrder = 2`
   (set on the objects in the pose effect, below the mark layers' 34/36 and
   the hole handles' 10). Opaque bodies render in the opaque pass regardless.
   This makes every edge draw after every ghost body so edges keep full
   strength through glass and are hidden only by opaque bodies (§2.3.4).
7. **Picking is unchanged**: the nearest body under the cursor is picked,
   glass or not (Fusion behaves the same under transparency). Hole placement,
   face/plane picking, mate picking and the pivot pick are untouched.
8. **Measure sees through glass (should).** In a see-through mode `measureAt`
   (521) chooses as the occluding `hit` the first intersected mesh whose body
   is **opaque in this mode** (selected/hardware in X-ray; none in Wireframe)
   instead of the first mesh — ghost bodies no longer hide candidates. The
   existing nearest-on-screen / nearest-camera tie rules then do the rest.
   `measureCandidates` itself is unchanged.
9. **No first-toggle gate, but measure it.** This scene links one new
   program family per toggle kind (transparent `MeshStandardMaterial`,
   DoubleSide, with or without clipping) — one synchronous link, once per
   viewport life thanks to §3.4. Opus measures the first X-ray toggle on the
   cabinet starter (§8) and records it in §10; only if it exceeds 100 ms
   should a warm-up be added (one hidden-until-compiled triangle per ghost
   family rendered through `renderer.compile` at scene init), and then say so.
10. **No crossfade.** The floor-plan pane's 220 ms crossfade is not carried
    over: this viewport renders on demand (`ctx.render()` on change, no
    animation loop), and a cut is what CAD users expect.
11. **Copy.** The viewport hint footer gains a mode line when not Solid
    (§6); the host `<div className="cad-viewport">` gets `data-view-mode`.

## 4. The build

### 4.1 `cad/viewMode.js` (new, pure, unit-tested in `viewMode.test.js`)

```js
export const VIEW_MODES = Object.freeze({ SOLID: 'solid', XRAY: 'xray', WIREFRAME: 'wireframe' });
export const DEFAULT_VIEW_MODE = VIEW_MODES.SOLID;
export const GHOST_ALPHA = Object.freeze({ xray: 0.22, wireframe: 0.04 });
export const EDGE_ALPHA = Object.freeze({ solid: 0.65, xray: 0.55, wireframe: 1 });
export const DIMMED_EDGE_ALPHA = 0.35;             // today's sketch-draw edge value
export const BODY_COLORS = Object.freeze({ selected: '#3687bd', wood: '#bd956b', metal: '#8795a4' });
export const EDGE_COLOR = '#3e4e5f';
export const GHOST_RENDER_ORDER = 1, EDGE_RENDER_ORDER = 2;
export function resolveViewMode(mode)             // unknown → DEFAULT_VIEW_MODE
export function isSeeThrough(mode)
export function nextViewMode(mode, { wireframe = false } = {})  // the X / Shift+X rule (§3.1)
export function isHardwarePart(part)              // part?.features?.some(f => f.type === 'hardware')
export function bodyColorKey(part, selected)      // 'selected' | 'wood' | 'metal' (today's regex)
export function bodyAppearance({ mode, selected, hardware, dim = 1 })
  // → { opaque, opacity, depthWrite, edgeOpacity, edgeColorKey: 'edge'|'selected', renderOrder }
export function viewKeyAction(event, { dragging = false } = {})
  // → null | { type: 'view', wireframe: boolean }; guards per §3.1
export function createMaterialCache()
  // → { body(color, opacity, { depthWrite }), edge(color, opacity), setClippingPlanes(planes), size(), dispose() }
  // pure THREE (MeshStandardMaterial roughness 0.55 metalness 0.15 DoubleSide; LineBasicMaterial transparent)
export const VIEW_MODE_COPY = { … }               // §6
```

`viewKeyAction` is called from `placementKeyAction` **before** the
`!selected || busy` return (`rotateKeys.js` 36–39) so it works without a
selection and while a tool runs, after the editable/drag/modifier guards
(32–34); `placementKeyAction` returns `{ type: 'view', wireframe }` for it.
Key test: `event.key` `'x'`/`'X'` or `event.code === 'KeyX'`; `shiftKey`
picks wireframe; `repeat` → null.

### 4.2 `CadViewport.jsx`

- New prop `viewMode = DEFAULT_VIEW_MODE`. `ctx.materials =
createMaterialCache()` at scene init; disposed in the unmount cleanup; the
  cleanup traversal disposes geometry only for `group` children (other
  layers keep their own disposal).
- Mesh build (1620–1657): bodies get `ctx.materials.body(BODY_COLORS.metal,
1, { depthWrite: true })` as a placeholder and edges
  `ctx.materials.edge(EDGE_COLOR, EDGE_ALPHA.solid)`; the pose effect that
  follows assigns the real ones. Dispose geometry only.
- Pose effect (1659–1703): per group compute `appearance =
bodyAppearance({ mode, selected: isSelectedLook, hardware:
isHardwarePart(part), dim })` where `isSelectedLook` is today's condition
  (`instanceId === selectedId && !sketchMode && !placing`); set
  `mesh.material = ctx.materials.body(BODY_COLORS[bodyColorKey(part,
isSelectedLook)], appearance.opacity, { depthWrite })`,
  `edges.material = ctx.materials.edge(appearance.edgeColorKey === 'selected'
? BODY_COLORS.selected : EDGE_COLOR, appearance.edgeOpacity)`,
  `mesh.renderOrder = appearance.renderOrder`, `edges.renderOrder =
EDGE_RENDER_ORDER`. Replace the per-child `clippingPlanes` loop with one
  `ctx.materials.setClippingPlanes(plane ? [plane] : [])` before the loop.
  Add `viewMode` to the dependency list. Remove the in-place
  `transparent/opacity/depthWrite/needsUpdate` block.
- `measureAt` (521–525): in a see-through mode pick the first intersection
  whose mesh material is opaque (`material.opacity === 1`), else `null`
  (§3.8). Read the mode from `ctx.viewMode` (set by an effect).
- Host: `data-view-mode={viewMode}`; hint footer line per §6 when not Solid.
- Script hook `element.cadViewMode = () => ({ mode, programs:
renderer.info.programs.length, materials: ctx.materials.size(), bodies:
group.children.map(g => ({ id, opacity, transparent, depthWrite,
renderOrder, edgeOpacity, edgeColor: '#rrggbb', color })) })`.

### 4.3 `CadWorkspace.jsx`

- `const [viewMode, setViewMode] = useState(DEFAULT_VIEW_MODE)` beside
  `perspective` (225); pass `viewMode={viewMode}` to `<CadViewport>`.
- Toolbar: the segmented group after `Fit` (1757), titles and labels from
  `VIEW_MODE_COPY`.
- Key handler (418–441): `action.type === 'view'` →
  `setViewMode(nextViewMode(viewMode, action))` (before the `tool`/`gizmo`
  branches; `preventDefault` as the others).

### 4.4 `rotateKeys.js`

- Header comment gains X / Shift+X; `placementKeyAction` delegates to
  `viewKeyAction` per §4.1. Existing tests must keep passing unchanged.

### 4.5 CSS (`cad.css`)

- The segmented group already styles itself (342–359). Add nothing unless
  the three buttons wrap badly at the toolbar's narrow widths; if so, a
  `white-space: nowrap` on `.cad-segmented` is enough.

### 4.6 Scope

- Not touched: kernel/worker, `model.js`, drawings/sheets/exports,
  `placementLayer.js`, the 2D studio, the floor-plan preview's `viewMode.js`
  (keep the two modules independent; `cad/` imports nothing from the
  floor-plan preview — `CadWorkspace.jsx` is the only cad file importing
  from outside, and only for shared UI).

## 5. Order of work

1. `viewMode.js` + `viewMode.test.js` (pure: mode table, key guards,
   appearance table with dim composition, hardware detection, material cache
   identity/count/clipping/dispose).
2. `rotateKeys.js` delegation + test cases in `rotateKeys.test.js`.
3. `CadViewport.jsx`: cache, build/pose effects, measure occluder, hook,
   hint, `data-view-mode`; `CadViewport.xray.dom.test.jsx`.
4. `CadWorkspace.jsx`: state, control, key branch;
   `CadWorkspace.keys.dom.test.jsx` cases.
5. `scripts/verify-sketch-xray.mjs` (§8); screenshots; tune α; fill §10.

## 6. Copy

- Buttons: `Solid` · `X-ray` · `Wire` (`aria-label="Wireframe"`).
- Titles: Solid — "Parts as they are (X returns here)"; X-ray — "Other parts
  turn to glass; the selected part and hardware stay solid (X)"; Wireframe —
  "Edges only, every edge visible (Shift+X)".
- Hint footer line (prepended to the existing orbit line when not Solid):
  X-ray — "X-ray · selected part and hardware stay solid · X back to Solid";
  Wireframe — "Wireframe · every edge shows · Shift+X back to Solid".

## 7. Tests

- `viewMode.test.js`: `nextViewMode` full table (6 transitions);
  `viewKeyAction` — x/X/KeyX, shift, ignores ctrl/meta/alt/repeat/editable
  target/dragging; `isHardwarePart` — hardware feature vs box vs undefined;
  `bodyAppearance` — the §3.2 table plus dim 0.5/0.28 composition in all
  three modes (opaque body in X-ray with dim 0.5 → 0.5; ghost with dim 0.28
  → 0.22 vs 0.28 = min); `createMaterialCache` — same key → same instance,
  distinct keys → distinct, `transparent === (opacity < 1)`, `depthWrite`
  as asked, `setClippingPlanes` reaches existing and later materials,
  `dispose` disposes every material once (spy) and `size()` → 0.
- `rotateKeys.test.js`: X with no selection and while busy → view action;
  not while dragging; not in an input.
- `CadViewport.xray.dom.test.jsx` (new; reuse the renderer/controls stand-ins
  from `CadViewport.dom.test.jsx`): three instances — a plain board, the
  selected board, a bolt (part with a `hardware` feature). `viewMode='xray'`
  → plain body `opacity 0.22, transparent, depthWrite false, renderOrder 1`;
  selected and bolt bodies `opacity 1`; edges per table. `'wireframe'` →
  all three 0.04, selected edges `#3687bd` at 1.0. Back to `'solid'` → all
  1, the ghost material object is **not** disposed (spy on `dispose`), and
  a new snapshot keeps `mesh.material` identity for an unchanged key (cache
  proof). Section + xray → `clippingPlanes.length === 1` on every body and
  edge material. Sketch draw in xray → support 0.5, others 0.22.
- `CadWorkspace.keys.dom.test.jsx`: `x` → the stand-in viewport's
  `viewMode` prop `'xray'` and the X-ray button `aria-pressed`; `x` again →
  `'solid'`; `Shift+X` → `'wireframe'`; `x` from wireframe → `'solid'`; no
  toggle while typing in a field; works with nothing selected and while
  Measure is active.
- Baseline before touching anything: `npm test` from the repo root (never
  inside `cad/` — a stray `cad/node_modules/.vite` was left that way once),
  record cad-folder and full counts; final counts in §10.

## 8. Verification — `scripts/verify-sketch-xray.mjs`

Playwright, Chrome headless, same shape as `verify-measure-marks.mjs` /
`verify-hardware-holes.mjs` (`cadSteps`, `CAD_VERIFY_URL`, artifacts under
`artifacts/sketch-cad/xray/`, `verification.json` with named checks). Steps:

1. Fresh `/sketch`, `3D Model & workshop`, Board / plate (600×400×18 on the
   ground), Hole row of 4 Ø6.6 along +X, Add hardware → Hex bolt M6 seated
   in 3 holes (copy the steps of `verify-hardware-holes.mjs` 60–160). Then
   **deselect** (click empty background; the selected part stays solid in
   X-ray, so a selected board would spoil every probe) and `view('front')`,
   orthographic.
2. **Solid baseline**: `cadViewMode()` → mode `solid`, every body opacity 1;
   `programs` recorded as P0. Screenshot `01-solid.png`.
3. **X-ray by key**: focus the canvas, press `x`; the X-ray button is
   `aria-pressed`; hook → mode `xray`, board body 0.22 / depthWrite false /
   renderOrder 1, each bolt body 1.0. Screenshot `02-xray.png`. **Pixel
   probe of what X-ray reveals** (the floor-plan lesson: probe the hidden
   thing, not the glass): project a world point on a bolt shank at
   mid-thickness of the board (z = 9 on the bolt axis, from the saved
   connection/hole centre) for all three bolts, read those pixels in
   `01-solid.png` and `02-xray.png`, and assert the median per-pixel RGB
   delta > 40 (Solid shows the board face there; X-ray shows the bolt).
   Record P1 = programs.
4. **No relink on repeat**: `x` → Solid → `x` → X-ray; programs still P1.
   Then an edit in X-ray (set the board's Position X to 50 through the
   Properties field, wait for `Model current`): programs still P1 and the
   board body still 0.22 (the rebuilt mesh inherited the mode).
5. **Wireframe**: `Shift+X` → mode `wireframe`, all bodies 0.04, edges 1.0;
   screenshot `03-wire.png`; a pixel at the board face centre (away from any
   edge or bolt) is within 12/255 of the background `#e7ebef` per channel;
   a population of ≥ 10 pixels sampled along the board's silhouette edges
   has a median darker than the background by > 60. `x` → Solid (from
   Wireframe `X` goes to Solid, not X-ray).
6. **Selection in Wireframe**: click the board; hook → the board's edges
   `#3687bd`; press `Shift+X` → Solid; the board body is `#3687bd` again.
7. **Measure through glass (should)**: X-ray, top view, Measure (`d`), hover
   the bottom of a hole (a far-side vertex that Solid occludes): the measure
   HUD reads `vertex`; Esc twice. Skip with a note if the far vertex is not
   reachable in top view without orbiting.
8. **Key guards**: with the Properties "Part name" field focused, `x` does
   not change the mode. No `pageerror`; never a `.cad-error`.
9. **First-toggle cost**: measure the `x` press to the next rendered frame
   on the cabinet starter (Design parameters → Cabinet → Apply & build, 10
   instances) with `performance.now()` around the key event's resulting
   render (expose the last `render()` duration in the hook as `lastRenderMs`);
   report it in §10 (§3.9 decides whether a warm-up is needed).

Stop the Vite server afterwards and confirm nothing listens on its port.

## 9. Constraints and process rules

- No commit. Stay in `src/features/sketchstudio/cad/`, `scripts/`, `docs/`.
- Line endings: every file touched here is LF (checked: `CadViewport.jsx`,
  `CadWorkspace.jsx`, `cad.css`, `rotateKeys.js`, `marks.js`, the tests, the
  scripts); keep them LF. Prettier config applies (`npm run format:check` on
  the touched files, or match the existing style: 2 spaces, single quotes,
  120 columns).
- Keep the `[ Mesh, LineSegments ]` child order (§2.2); never dispose a body
  or edge material outside the cache; never touch `visible` for a mode.
- `npm run lint` 0 errors; all tests green from the repo root; report
  baseline and final counts.
- Flag every judgment call with `file:line` anchors in §10; if a §3 decision
  turns out wrong at the screen, say so there and do the better thing.
- Do not rebuild constraints, change the 2D studio, or touch the floor-plan
  preview.

## 10. Outcome (Opus fills in)

Built 2026-11-07 by Opus 5.5, uncommitted. All numbers below are from runs
made for this build: headless Chrome (`channel: 'chrome'`), 1600×1000, Vite
on `localhost:5180`, stopped after the run (no listener left on 5180).

- **Final α values.** X-ray ghost **0.22** (unchanged; edges of a ghost 0.55),
  Wireframe ghost **0.03** (tuned down from 0.04, `viewMode.js:39`). Why 0.03:
  at 0.04 the §8.5 face probe read `223/225/227` against `#e7ebef` = max Δ
  **12.0**, exactly on the 12/255 limit (DoubleSide → two layers, ≈ 0.078
  coverage). At 0.03 it reads `225/227/230`, Δ **9.0**; faces still tint
  faintly and clicks still land (raycasting ignores opacity). JUDGMENT CALL.
- **First-toggle cost (cabinet starter, 10 instances, nothing selected so all
  10 ghost).** Final run: key → next frame **33.1 ms**, of which the
  `render()` that linked the new programs took **10.2 ms**. The second X-ray
  toggle: 20.0 ms key → frame, render **0.5 ms**, no new programs. An earlier
  run gave 42.1 ms / 15.3 ms (second toggle 0.7 ms render). That is under
  §3.9's 100 ms, so **no warm-up was added**. Caveat: headless Chrome; a real
  GPU driver's link time may differ.
- **Programs P0 → P1.** Board + 3 bolts: **P0 = 4 → P1 = 6**. Cabinet: 4 → 6.
  The two new programs are not one "transparent family". They are the
  **BackSide and FrontSide variants**. three draws a transparent
  `DoubleSide` material in two passes, flipping `side` and setting
  `needsUpdate` (`node_modules/three/src/renderers/WebGLRenderer.js`
  2099–2111, and `prepareMaterial` 1334), and `side` is in the program key
  (`webgl/WebGLPrograms.js` 354–355). §3.9's "one new program family per
  toggle kind" holds in spirit: both variants link once per viewport life.
  **Step 4 held.** X → Solid → X → X-ray left programs at 6. The edit in
  X-ray (board X = 50, Model current) also stayed at 6, both while the board
  was selected and after deselecting. The rebuilt board was still 0.22 /
  depthWrite false. Wireframe also stayed at 6, since its ghost uses the same
  program keys with a different opacity uniform. The material cache held 6
  materials after the edit.
- **Test counts** (from the repo root; `npm test` = `vitest run`). Baseline:
  cad folder **49 files / 565 tests**; full **434 files (433 passed, 1
  skipped) / 5280 tests (5279 passed, 1 skipped)**. Final: cad **51 / 585**;
  full **436 (435 passed, 1 skipped) / 5300 (5299 passed, 1 skipped)**. New
  or changed tests: `viewMode.test.js` (12 tests),
  `CadViewport.xray.dom.test.jsx` (6), `rotateKeys.test.js` (+1),
  `CadWorkspace.keys.dom.test.jsx` (+1). `npm run lint`: **0 errors** (42
  warnings, none in touched files: `eslint` on the touched files prints
  nothing). `prettier --check` passes on every touched file. All touched files
  are LF; `CadViewport.jsx`'s working copy was CRLF before this build
  (`git ls-files --eol`: `i/lf w/crlf`) and is now LF.
- **Verify run** (`scripts/verify-sketch-xray.mjs`, final run): **17 pass, 1
  skipped**, `artifacts/sketch-cad/xray/verification.json` `status:
passed`, no page errors, no `.cad-error`.
  - Pass: §8.1 setup (the default hole row is **Ø6**, not the Ø6.6 the spec
    names; the template steps were copied unchanged). §8.2 Solid baseline. §8.3
    X by key: board 0.22 / depthWrite false / renderOrder 1 / edges 0.55, bolts
    1.0 / 0.65. **§8.3 isometric pixel probe: median max-channel Δ 66** (68,
    60, 66). Solid `201/160/117` (lit wood top face) → X-ray ≈ `135/135/136`
    (steel shank through glass). §8.4 ×2. §8.5 ×4: Wireframe bodies 0.03 /
    edges 1.0; face Δ 9.0; 30 silhouette pixels darker than the background by
    a median of 68.5 (min 54.3); X from Wireframe → Solid. §8.6 ×2: edges
    `#3687bd` @ 1 in Wireframe, then body `#3687bd` @ 1 in Solid. §8.7 Measure:
    Solid `edge` → X-ray `vertex`, HUD `vertex`. §8.8 ×3: x typed in Part name
    leaves the mode alone, Esc restores the name, the mode is not in the saved
    recovery JSON. §8.9 measured (numbers above).
  - **Skipped: §8.3 front-view probe**, with the numbers recorded. From the
    front the Solid board face `138/111/83` → X-ray `118/116/114` gives a
    max-channel Δ of **31** (Euclidean 37.2). From the rear: Δ 30 (Euclidean
    42.4). It cannot clear 40 at any α in range. Solving `xray = α·wood + (1−α)·bolt`
    gives the lit shank ≈ `112/117/123`, so even at α = 0 (fully clear) the
    largest channel difference from the lit wood face is ≈ 40. Lit wood and lit
    steel facing the same way are close in brightness. JUDGMENT CALL: the
    asserted probe is the isometric view, where the camera sees the shank
    through the strongly lit top face. The threshold (> 40) is unchanged
    (`verify-sketch-xray.mjs:263–284`).
  - Screenshots in `artifacts/sketch-cad/xray/`: `01-solid.png`,
    `01-solid-rear.png`, `01-solid-iso.png`, `02-xray.png`,
    `02-xray-rear.png`, `02-xray-iso.png`, `03-wire.png`,
    `04-wire-selected.png`, `05-measure-xray.png`, `06-cabinet-xray.png`.
- **Deviations from §3–§8 (each a judgment call):**
  1. **The sketch support stays solid in X-ray.** `bodyAppearance` gained an
     optional `support` flag (`viewMode.js:112–114`), passed from the pose
     effect (`CadViewport.jsx:1742–1746`). Without it, §7's own expectation
     ("Sketch draw in xray → support 0.5, others 0.22") is impossible: while
     sketching, `isSelectedLook` is false, so the sketched-on board would ghost
     to min(0.22, 0.5) = 0.22. That would also lose today's "support reads a
     little stronger" cue. Wireframe still ghosts it, and the support's edges
     stay the edge colour. The hardware bolt during a sketch keeps the plain
     §3.5 rule: it is opaque in X-ray, so it takes dim 0.28. The dom test
     asserts that (`CadViewport.xray.dom.test.jsx`, sketch-dim case).
  2. **Measure glass-face fallback.** `measureAt` uses the first body that is
     opaque in the mode as the occluder (`CadViewport.jsx:580`), as §3.8 says.
     When that finds nothing and the cursor is on a glass face, it re-runs
     `measureCandidates` with the glass hit (`CadViewport.jsx:608`). Without
     this, Wireframe (no opaque bodies) and empty glass areas in X-ray would
     lose the `face` snap entirely. `measureCandidates` is unchanged.
  3. **One existing `rotateKeys.test.js` assertion changed.**
     `expect(key({ key: 'x' })).toBeNull()` ("an unbound key does nothing")
     contradicts §3.1 now that X is bound. It now uses `'q'`
     (`rotateKeys.test.js:52–53`). Every other existing test is unchanged.
  4. **`renderOrder` for opaque bodies is 0.** Ghosts are 1 and edges are 2.
     A body that is transparent only because of the sketch dim also gets 1
     (`renderOrder: opacity < 1 ? 1 : 0` in `bodyAppearance`). Edges are 2 in
     every mode, Solid included, per §4.2.
  5. **The `cadViewMode` hook reports more than §4.2 lists.** It adds
     `lastRenderMs`, plus `partId`, `visible`, `edgeRenderOrder` and world
     `bounds` per body (`CadViewport.jsx:363`). `bounds` aims the shank probe
     at a z the bolt really spans. `render()` times itself into
     `ctx.lastRenderMs` (`CadViewport.jsx:435`).
  6. **The hint is its own first line** (`<div className="cad-view-mode-hint">`,
     `CadViewport.jsx:1937`), placed above the other footer lines, not glued
     onto the orbit sentence.
  7. **Verify script.** Views are framed with Fit plus two wheel notches in
     (`frame`, `verify-sketch-xray.mjs:171`), so a shank is ~10 px wide
     (0.617 mm/px). The script re-frames after the step-4 edit, because the
     edit moves the board off-centre. The §8.5 "face centre" probe uses part
     (450, 0, 9) (`:347`), not the centre: the axes helper's Z line stands at
     the world origin, which the middle of the board covered. §8.7 runs in the
     **front** view, not the top view (`:407–413`). From the top, every far
     vertex of a vertical hole lies exactly under a near one and snaps in Solid
     too. From the front, the empty hole 3's top rim, 100 mm behind the face,
     is occluded in Solid and snaps in X-ray. The script projects the probe
     after Measure starts (see residual 1). §8.8's persistence check matches
     `xray|x-ray|wireframe` and a `viewMode` key in `document.model`. The 2D
     studio already saves its own `ui.viewMode` (`plan`), so a bare
     `viewMode` regex would be a false alarm. The script imports `GHOST_ALPHA`
     from `viewMode.js`, so it tracks the module's values.
  8. `cad.css` is untouched (§4.5). The three buttons never break inside the
     group.
- **Known residuals.**
  1. At 1600 px the new group makes the view toolbar wrap to a second row
     **while Measure is on**: its `Done measuring` button is the item that no
     longer fits. The canvas then moves down ~34 px when Measure starts. Other
     tools that add toolbar controls (the rotate sub-controls) already wrapped
     before this build.
  2. A transparent DoubleSide ghost costs three's two-pass draw. Each pass sets
     `needsUpdate`, so the program cache key is recomputed (programs are reused,
     never relinked). The sketch dim already paid this per part before.
  3. The first-toggle number is from headless Chrome only.
  4. In Wireframe a hidden edge draws exactly like a visible one. Dashed hidden
     lines are §12's follow-up.

## 11. Audit checklist (Fable)

- [ ] `viewMode.js` exports and tables match §3.2/§4.1; test enumerates all six transitions.
- [ ] No per-mesh material creation remains in the build effect; cleanup disposes the cache.
- [ ] Pose effect swaps materials (no `needsUpdate` path left); `renderOrder` 1/2 set.
- [ ] `measureAt` occluder rule in see-through modes.
- [ ] `placementKeyAction` returns the view action with no selection and while busy; not while dragging/typing.
- [ ] Toolbar group placement, labels, titles, `aria-pressed`, `data-view-mode`.
- [ ] Rerun `npm test`, `npm run lint`, `scripts/verify-sketch-xray.mjs`; compare numbers with §10.
- [ ] Nothing persisted; nothing in `model`/saved document; drawings untouched.

## 12. Follow-ups (not this build)

- A per-part "see-through" flag (glass one part, keep the rest) and a
  ghost-the-tool-part option during Boolean placement.
- Hidden-line _dashed_ rendering for occluded edges in Wireframe (needs a
  second edge pass with `depthFunc Greater`).
- Carrying the mode into a 3D-viewport image export, if one is added.
