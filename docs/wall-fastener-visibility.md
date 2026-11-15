# Wall fastener visibility (FV-1)

User report, 2026-11-11: "Why can't I see any fasteners in the wall?"

The screws are there. A detailed fibre-cement face on the playground wall derives 246 of them, the
takeoff counts them, the elevation draws 246 `<g class="fastenerGraphic">` and the 3D pane holds 246
instanced heads per face. Nobody can see them, for three independent reasons. All three predate the
assembly-editor UI overhaul (`docs/assembly-editor-ui.md`); none is a regression from it.

## 1. What was measured

Playground wall i7 (3704 × 3000 mm, fibre cement both faces), wall editor opened on the inside
face, 1600 × 900 window, headless Chrome. Scripts and screenshots are in the session scratchpad
(`screws.js`, `screws2.js`, `screws3.js`, `screws4.js`, folder `screws/`).

| #   | Where        | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                                                     |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | 3D pane      | **The pane looks at the face you are not editing.** The first fit and Reset View use the fixed `plan_aligned` direction (`previewConfig.PRESETS`, via `createInspectNavigation.resetView` → `fitCameraToBox`). On wall i7 that puts the camera 3.4 m out on the _outside_ face while the editor edits the _inside_ face. Changing the inside face's screws changes nothing you can see.                                                    | Live scene read: inside-face head batch mean x = 113.5, outside-face x = 22.5, camera x = −3367.                                                                             |
| B   | 3D pane      | **The default screw expression is invisible by construction.** `fasteners.appearance` defaults to `tonal` ("Quiet / panel-matched"), and `fastenerMaterialKey` (`src/three/scene/objectBuilders.js`) gives a tonal head _the board's own palette material_. The default render style, Realistic, draws no outlines. A board-coloured 8 mm disc standing 1.25 mm off a board of the same material has no pixel that differs from the board. | `screws/outside3d-realistic-tonal.png` (nothing) against `…-metal.png` and `…-construction.png` (dots) from the same camera. Shaded shows tonal heads only as outline rings. |
| C   | 2D elevation | **Heads are drawn at true scale and in the board's colour.** `FastenerGraphic` uses `r = max(headDiameter / 2, min(length, height) / 600)` — millimetres, so 5 mm on this wall — filled with `faceColor(material)` at 85 % group opacity. On screen at fit that is a **1.2 px** dot in split view and **2.2 px** in elevation-only, the same colour as the board under it.                                                                 | `screws.js` output: `screenW 1.23` / `2.21`, `fill #dedbd1`, panel fill `rgb(222, 219, 209)`.                                                                                |

Not the cause (checked, leave alone): fastener derivation (`deriveWallFasteners`), the Layers
popover (screws default on), batching (`previewBatching` — the instanced heads are in the scene,
visible, on layer 0, correctly coloured and proud of the board: board z 37.5 → 43.5, heads
44.0 → 47.0), the incremental scene cache (an appearance change reaches the live scene).

## 2. The fix

### 2.1 The 3D pane shows the face being edited (A)

- The wall editor tells its pane which face is active and the pane's **first fit** and **Reset
  View** put the camera on that face's side of the wall. Keep the existing three-quarter character
  of `plan_aligned` — if the preset direction already sits on the active face's side, use it
  unchanged; otherwise use its mirror image across the wall's plane. Do not introduce a flat
  head-on elevation view.
- When the active face changes while the editor is open (the Inside / Outside switch in step 1, or
  a 3D pick on the far face, which already calls `setActiveSide`): if the camera is on the wrong
  side of the wall plane, **mirror the camera position and orbit target across the wall's centre
  plane** — same distance, same zoom, same height, now looking at the other face. If the camera is
  already on the right side (the user orbited there, which is exactly the 3D-pick case), leave it
  alone.
- The outward normal of a face comes from the same place the scene builder gets it:
  `perpendicular(wallDirection(wall))` times the layer's `sign` (`deriveWallAssemblyLayers`). Plan
  (x, y) is world (x, z).
- `ThreePreviewPanel` and `WallLivePreview` take the new input as **primitives** (numbers / a
  string), never an object — the pane's memo is what keeps panning the elevation at 6 ms
  (`docs/assembly-editor-ui.md` §3). The model's own 3D preview (no `assemblySelection`) and the
  ceiling editor's pane pass nothing and behave exactly as today.

### 2.2 A tonal head reads as a head (B)

- A tonal head stops reusing the board's material. It gets a material of the **same hue as the face
  it sits in, visibly darker** — a painted-over screw still casts a dimple. Target: in Realistic,
  from the default editor view zoomed so a head is ≥ 6 px across, the head's centre pixel differs
  from the adjacent board pixel by ≥ 25 in at least one sRGB channel (measure it; do not eyeball).
- It must follow the face: fibre cement, plywood, gypsum, rainscreen, siding, and any CL-1 face
  finish (`wallFinishMaterialKey`), including a finish colour edited later (the palette recolours
  finish materials in place — a derived material has to follow, or be re-derived).
- Constraints from the preview pipeline, all of which have bitten before:
  - a new palette key needs a class in `materials.js` (`MATERIAL_CLASS`-style map near
    `wallFastener: 'metal'`) and in `viewMode.js` (near `wallFastener: 'structure'`), or X-ray /
    Wireframe treat the head as a board;
  - heads must still batch (one instanced draw per material), so the material is shared per face
    material, opaque, and not `ownedByPreviewObject`;
  - `disposeScene` must not free a shared palette material.
- Metal, contrast and construction are unchanged. Head size stays true to scale in 3D — no
  exaggeration.

### 2.3 The elevation draws screws as legible symbols (C)

Bring the wall elevation in line with the ceiling plan, which already does this
(`CeilingScrewLayer`: `r = 3 * unitPx`, halo `r + 7 * unitPx`):

- Head radius is `max(headDiameter / 2, 3 * unitPx)` — true size once you zoom in past it, never
  smaller than a 6 px dot. `unitPx` is already computed in `WallDetailEditor` (`wallUnitsPerPixel`).
  Drop the `min(length, height) / 600` floor.
- The selected halo is `radius + 7 * unitPx` (today `radius + 7` mm — under a pixel at fit).
- Tonal stays "quiet" but must be a visible mark: fill it with the colour the board is actually
  drawn in (`panelFill` — today it uses the stock `faceColor`, which is wrong on a finished face),
  keep the ring, remove the 0.85 group opacity, and make sure the ring holds ≥ 3 : 1 contrast
  against the board fill on stock fibre cement, plywood and gypsum, and on a dark face finish (a
  dark finish needs a light ring — derive it, do not hard-code one grey).
- The slot line scales with the drawn radius as it does now.
- Rules that stand (`docs/assembly-editor-ui.md` §3): selection never changes line weight beyond
  what the code already does; no pointer/gesture math changes; `beginElementMove` hit-testing keeps
  working on the larger symbol; CAD line weights untouched.

## 3. Out of scope

- The ceiling editor's pane has the mirror-image problem (camera above, screws underneath). Not in
  this pass — note it in the hand-back if the mechanism from §2.1 would cover it cheaply.
- No change to defaults (`tonal` stays the default), to fastener derivation, takeoff, or export.

## 4. Acceptance

Measured in a real browser on the playground wall (recipe: `docs/assembly-editor-ui.md` §6), not
argued:

1. Open "Design Inside Face": the 3D pane's camera is on the inside face's side of the wall. Switch
   to Outside face: it is on the outside face's side, same distance from the orbit target (± 1 %).
   Orbit to the far side by hand, pick a board there: the camera does not jump.
2. Reset View returns to the active face's side.
3. Realistic style, default tonal expression, zoomed until a head is ≥ 6 px: head-vs-board pixel
   difference ≥ 25 in a channel, on fibre cement and on plywood.
4. Elevation at fit, split view, 1366 × 768 and 1600 × 900: every head's circle measures ≥ 5.5 px
   on screen; zoomed in until `headDiameter / 2 > 3 * unitPx` it measures true size.
5. The model's own 3D preview (floorplan workspace) opens with the camera where it opens today.
6. `npx vitest run src/features/floorplan/components/wall-detail src/features/floorplan/components/ceiling-detail src/features/floorplan/components/preview src/three`,
   `npm run lint` (0 errors) and `npm run build` pass. New behaviour has tests: the side-of-plane
   rule (pure function), the tonal material key / class mapping, the symbol radius floor.

## 5. As built (2026-11-11)

Uncommitted. Measured on the playground wall i7 (fibre cement both faces after the scripts switch it
from CHB), headless Chrome against the dev server on :5199. Scripts and screenshots:
session scratchpad `fv1/` (`camera.js`, `pixels.js`, `elevation.js`, `model.js`, `contrast.mjs`).

### 5.1 Decisions

- **Facing (A).** The wall editor computes `wallFacePreviewFacing(wall, activeLayer)`
  (`wallDetailPreviewProject.js`): normal `perpendicular(wallDirection(wall)) × layer.sign`, plane
  point the wall's midpoint carried off the drawn line by `wallOutboardOffset`. It crosses
  `WallLivePreview` → `ThreePreviewPanel` as four numbers (`faceNormalX/Z`, `facePlaneX/Z`); the
  panel turns them into a facing with `resolveFacing` in an effect declared _before_ the scene-build
  effect, so the very first `setWorld` fit already knows the face. The pure maths lives in
  `previewCameraMath.js` (`resolveFacing`, `facingSideOf`, `mirrorAcrossFacing`, `directionFacing`,
  `cameraPoseFacing`); `fitCameraToBox` takes an optional facing. `createInspectNavigation` holds it
  (`setFacing`) and uses it only in `resetView` — an explicit iso/elevation preset is never
  mirrored — and `turnToFacing()` mirrors camera + orbit target across the plane only when the camera
  is behind it. `createPreviewViewport.setFacing` calls that while a world is up in inspect mode. No
  facing (model pane, ceiling pane) = `null` = the old code path.
- **Tonal head (B).** New palette key `wallFastenerTonal:<face key>` (`wallFastenerTonalMaterialKey`
  in `src/domain/wallFinishes.js`, next to the finish key it wraps). `paletteMaterialFor` builds it on
  first sight: `cloneWithProceduralDetail` of the face's material, colour × `TONAL_FASTENER_SHADE`
  (0.5 linear ≈ 0.73 sRGB), detail family re-pointed to `smooth` (drops siding course grooves),
  `tier: 'structure'` stated on the material (the finish precedent — no table can list colour keys;
  `tierOf` reads it first), `ownedByPalette`, opaque, shared per key. Both faces of the same stock
  board share one key, so heads still fold into one instanced batch (live scene: one batch of 492
  heads for the two fibre-cement faces). Nothing recolours a finish material in place — the hex is
  in the finish key, so it is in the head key too; a recoloured face asks for a new head.
  `pruneWallFinishMaterials` now counts and prunes tonal keys with the finishes.
- **Elevation symbol (C).** `fastenerSymbol.js`: `fastenerSymbolRadius = max(headDiameter / 2,
3 × unitPx)`, `fastenerHaloRadius = r + 7 × unitPx`, `tonalFastenerInk(panelFill)`. Tonal fill is
  `panelFill`; the ring is the same hue stepped towards black or white — whichever pole has more
  contrast room — just far enough for 3.05 : 1. The 0.85 group opacity rule is gone. Stroke widths,
  slot ratio, pointer handling unchanged.

### 5.2 Measurements (§4)

| #   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Open on Inside: camera 3449 mm in front of the **inside** face (first fit, before any edit). Switch to Outside: camera mirrored to 3449 mm in front of the **outside** face, distance to target 5549.41 → 5549.41 mm (0.0000 %), height unchanged (4372.5). Orbit half a turn by hand to the inside, click a board there: active face flips to Inside, camera moved 0.00 mm.                                                                                             |
| 2   | Active Outside, camera orbited to the inside, Reset View → back on the outside (−3448.5 mm). Active Inside, Reset View → inside (+3449.3 mm).                                                                                                                                                                                                                                                                                                                            |
| 3   | Realistic, tonal, zoomed until the head nearest the centre is ≥ 6 px: fibre cement head 8.47 px, centre (149,150,148) vs board (194,195,194) → **46**; plywood head 8.50 px, (120,77,30) vs (173,122,53) → **53**. Worst single adjacent sample 45 / 53.                                                                                                                                                                                                                 |
| 4   | Split view, at fit: all 246 heads measure **6.00 px** at both 1366 × 768 and 1600 × 900 (was 1.23 px). Selected halo sits **7.0 px** outside the head; clicking a head selects it. True size: at the editor's 5× zoom cap an 8 mm head on this 3.7 m wall never passes the 3 px floor (pxPerMm 0.479 / 0.615 → floor radius 6.27 / 4.88 mm > 4 mm), so the branch was proven with a 16 mm head: r = 8 mm, 7.66 px (= 16 × 0.479) and 9.84 px (= 16 × 0.615) — true size. |
| 5   | Floorplan workspace 3D pane: camera direction · `plan_aligned` = 1.000000 (unmirrored, as before).                                                                                                                                                                                                                                                                                                                                                                       |
| 6   | vitest (wall-detail, ceiling-detail, preview, three): 52 files, 807 tests passed. Lint 0 errors / 40 warnings (none in touched files). Build passes.                                                                                                                                                                                                                                                                                                                     |

Ring contrast (`contrast.mjs`): fibre cement 3.05, plywood 3.06, gypsum 3.06, charcoal finish as
drawn 3.07, black finish as drawn 3.05 — all ≥ 3 : 1.

### 5.3 Notes and warts

- A dark finish is _drawn_ 60 % of the way to the paper (`wallFinishDrawingTint`), so its board
  fill is a mid grey (Charcoal → `#A5A5A3`) on which no light ring can reach 3 : 1 (white gives
  2.46). The derived rule therefore rings it darker. A light ring comes out only for a genuinely
  dark fill (e.g. raw `#2F3338` → `#7A7C80`, 3.04 : 1). This meets the contrast target; it does not
  literally produce "a light ring on a dark finish" in today's drawing.
- 3D tonal heads are darker than their face on every face, including dark finishes, where the
  difference is small in absolute terms (spec asks for darker; not measured beyond FC/plywood).
- A screw that lands on an accent panel is shaded from the face's key, not the accent's (as
  before this change; the accent split happens per board, the screws are per face).
- Ceiling pane (§3): the mechanism generalises cheaply — make the facing normal 3D
  (`normalY`), let `facingSideOf`/`mirrorAcrossFacing`/`directionFacing` use the full dot product,
  and pass `(0, −1, 0)` with the board plane's elevation. Mirroring `plan_aligned` across a
  horizontal plane is exactly `bottom_aligned`, and the orbit controls already allow a polar angle
  of π. Not done.
