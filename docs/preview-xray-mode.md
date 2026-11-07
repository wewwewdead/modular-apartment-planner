# 3D preview see-through modes — Solid, X-ray, Wireframe

Spec for a see-through viewing mode in the floor-plan 3D preview
(`src/features/floorplan/components/preview/`), covering the main model pane
and the wall/ceiling assembly editors' panes. Written 2026-11-07 by Fable after
reading the code; to be built by Opus; audited by Fable against this document.

## 1. The ask, in the user's words

> can you read the codebase where we can add this: X-Ray Mode (or Wireframe /
> Transparent Mode). … make the X-Ray Mode robust and delightful to use, it
> should be intuitive and optimize.

What people want from an X-ray in a building model is to see _through the
skin_ — walls, roof, ceilings, floor slabs — to what the skin hides: the
structural frame, the stairs, the furniture layout, the studs inside a framed
wall, the hangers above a ceiling, the service runs. A plain "everything 50%
transparent" (SketchUp-style) does not deliver that: four nested translucent
layers turn into mud, and the structure you came to see is as faint as the
skin. So the hero mode here is a _tiered_ X-ray: the skin ghosts, the structure
and contents stay solid. Wireframe is the secondary, drawing-office mode:
edges only with a faint fill.

## 2. What the code does today (verified 2026-11-07)

### 2.1 Where a viewing mode lives

- `ThreePreviewPanel.jsx` owns the pane-local viewing state: `previewScope`
  (152), `navigationMode`, `renderStyle` (154), `interiorLightsOn`,
  `nightMode`, `viewPreset`. The header `.actions` row (597–706) holds two
  segmented groups (`Inspect|Walk`, `Lights|Night`, 598–635), the style
  `<select>`, the floor-scope `<select>`, the View `<select>`, Reset, Save
  image, Focus. The footer (800–803) carries `primaryFooter`/`secondaryFooter`
  (564–577), both per-mode strings. The section carries
  `data-preview-pane`/`data-loading-state` (582–583) for scripts.
- Nothing about X-ray exists anywhere: `grep -ri "wireframe|xray|x-ray"` over
  `src/` returns nothing.
- `renderStyle.js` holds the two render styles as plain config objects
  (`RENDER_STYLE_PRESETS`: outlines, grid, ground, sky, ambientOcclusion, …)
  and the localStorage preference helpers. The viewport applies a style in
  `applyStyleToRenderer` (`createPreviewViewport.js` 1264): tone mapping,
  `applyRenderStyleToPalette`, `progressive.setStyle`,
  `applyOutlineVisibility` on both roots, grid, ground.

### 2.2 How a mesh gets its material, and why it matters

- Every object mesh is `createMesh(geometry, materialPalette[descriptor.materialKey])`
  (`buildPreviewObjects.js` 107, used at 201/256/267/315/349/386/403/448/572/
  635/644/953). Non-selected meshes use the **shared palette instance
  directly** — no clones. The palette (`materials.js` 201–409) is ~90 keys of
  `MeshStandardMaterial`/`MeshPhysicalMaterial`, all `side: DoubleSide`, with
  three aliases (`roof` → `roof_slab`, `roofGutter`/`roofDownpipe` →
  `roofTrim`, 395–397). Keys that are transparent _by design_: `window`,
  `roofOpening`, `railing_glass` (glass), `windowGlow` (depthWrite false,
  FrontSide), `systemElectrical`/`systemWater`/`systemMechanical` (0.62–0.72).
  Materials built outside the palette: the luminaire lens
  (`ownedByPreviewObject` + `fixtureLens`, 1009–1038) and the selection
  overlay's tinted clones (`selectionMaterials.js`, cached per palette).
- Batching (`previewBatching.js`) folds tagged boxes/cylinders into one
  `InstancedMesh` per `(unit, material.uuid, castShadow, receiveShadow)` per
  floor (bucket key at 304). `isBatchableMaterial` (173) **rejects
  `material.transparent`**, so any transparent material un-batches everything
  that uses it. `batchesStillFit` (249) refuses a refill when
  `batch.material !== bucket.material` (262) or the shadow flags differ (264) —
  a runtime swap of `batch.material` or `batch.castShadow` would silently turn
  every drag frame in that mode into a full batch rebuild.
- The scene cache (`previewSceneCache.js` `build`, 135) rebuilds only floors
  whose `sourceKey` changed, and inside a rebuilt floor carries over objects
  whose descriptor is unchanged. So after any rebuild the world is a **mix of
  new meshes (fresh palette materials) and carried-over meshes** (whatever
  material they were left holding). Both roots are frozen
  (`freezeStaticMatrices`, 203–204) after every build.
- `setWorld` (1546) runs on every build (15×/s during a drag): re-applies
  outlines (`applyOutlineVisibility` 1129, which can cut missing outlines
  lazily via `ensureOutlines`), ground, bounds, `applySun` → `applyInteriorLighting`
  (one traversal), debounced shader warm-up (841), and the compile gate when
  `!hadWorld || lightsChanged || hasUnpreparedMaterial(root|batchRoot)` (803,
  812). The gate holds the last presented frame (inspect mode only, ≤ 4 s)
  until `compileScenePrograms` resolves — that is the mechanism that keeps a
  new program's first link off the frame (docs/loading-states.md §6.2).

### 2.3 three.js facts that decide the design (checked in node_modules/three 0.183.2)

1. **`material.transparent` is part of the program key.**
   `WebGLPrograms.js:252` — `opaque: material.transparent === false && blending
=== NormalBlending && alphaToCoverage === false`, emitted as `#define OPAQUE`
   (562), which forces `diffuseColor.a = 1.0` in the fragment shader. Flipping
   `transparent` on a live material therefore does nothing until
   `needsUpdate`, and then it **relinks a new program** — on every toggle, in
   both directions, for every material flipped. In-place mutation of the
   palette (the way roof colours and the style switch work) is **not** an
   option for opacity. `opacity`, `depthWrite`, `castShadow` and colour are
   uniforms/state and cost nothing.
2. **Shadows ignore transparency.** `WebGLShadowMap.js` has no transparency
   handling: a ghosted wall casts a full shadow unless `castShadow` is false.
3. **GTAO sees ghosts.** `GTAOPass.js:505` renders the scene with a
   `MeshNormalMaterial` override (`_renderOverride`), which ignores
   `depthWrite`/opacity, so ambient occlusion would be computed from ghost
   geometry and stain the solid structure behind it. AO must be off in
   see-through modes.
4. **Raycasting ignores `visible` and the collision index reads it.**
   `Raycaster` tests layers only; `previewCollisionIndex.js` collects
   `visible` meshes (72, 285) and takes a structural signature from `visible`
   flags (90–94). A see-through mode must never touch `visible` — walls stay
   solid to walk against, and picking keeps working through a ghost.
5. **`LightShadow.intensity`** (r166+) exists as a uniform, should a mode ever
   want to dim rather than drop shadows. Not needed by this spec.
6. **Program sharing.** `proceduralDetail.js` 267 pins
   `customProgramCacheKey = 'preview-procedural-detail-v1'` and
   `cloneWithProceduralDetail` (229) clones a material so that it shares the
   detailed program family — the trick `selectionMaterials.js` uses so a tint
   costs no link. Clones that differ only in `transparent` therefore collapse
   onto **one** extra program for the whole ghost set (plus one per distinct
   `side`/map/metalness family that is not already compiled — expect 1–3 new
   programs on the first toggle, zero afterwards).

### 2.4 Picking and the walk

`pickObjectAt` (893) raycasts `worldRoot` (layer 1 enabled, so batched source
meshes are hit), collapses hits to the first per target, and prefers a target
on `pickContext.activeFloorId`. Walk physics (`createWalkPhysics` +
`previewCollisionIndex`) raycasts the same meshes by `visible` and
`previewTarget.kind !== 'door'`. Neither reads materials.

## 3. Decisions

1. **Three modes, one control.** `solid` (default) · `xray` · `wireframe`.
   A segmented group next to `Lights|Night`, not a fourth `<select>`: one
   click, state visible at a glance, `aria-pressed` for scripts.
2. **X-ray is tiered.** Palette keys are assigned a _tier_; the mode's policy
   says what each tier does:

   | tier        | keys                                                                                                                                                                                                                                                                                                                                                                                             | solid        | xray                                                | wireframe              |
   | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------- | ---------------------- |
   | `skin`      | wall, wallFiberCement, wallPlywood, wallMixedBoard, wallRainscreen, wallRainscreenWarm, wallRainscreenDeep, ceilingBoard, ceilingBoardPlywood, ceilingHatch, roof_slab (+`roof`), roof_metal, roof_tile, roof_membrane, roofRidgeCap, roofTrim (+`roofGutter`, `roofDownpipe`), roofSoffit, gableInfill, parapet, door, windowFrame                                                              | base         | ghost twin, α **0.16**                              | ghost twin, α **0.05** |
   | `deck`      | slab                                                                                                                                                                                                                                                                                                                                                                                             | base         | ghost twin, α **0.30**                              | ghost twin, α 0.05     |
   | `core`      | wallCoreSteel, wallCoreTimber — the fallback core box of a framed wall whose layout derives no members (an emptied custom frame), which stands in for studs but is not studs (added by §12; since §13 every other framed wall draws its real members)                                                                                                                                            | base         | ghost twin, α **0.07**                              | ghost twin, α 0.05     |
   | `structure` | column, beam, stair, landing, wallFramingSteel, wallFramingTimber, wallFastener, wallFastenerContrast, wallFastenerConstruction, ceilingFraming, ceilingFramingTimber, ceilingHanger, ceilingFastener, ceilingOpeningTrim, ceilingOpeningHousing, ceilingLuminaire, ceilingDiffuser, trussChord (+\_timber/\_metal), trussWeb (+…), trussPurlin (+…), drain, railing_handrail, railing_guardrail | base         | **base (solid)**                                    | ghost twin, α 0.05     |
   | `contents`  | fixture_kitchenTop, fixture_toilet, fixture_lavatory, fixture_table, fixture_tv, fixture_sofa, fixture_bed, fixtureAccentMetal, fixtureAccentDark, fixtureAccentCeramic, fixtureAccentFabric, fixtureAccentWood, electricalPlate, shower, plantLeaf, plantLeafDeep, plantPot                                                                                                                     | base         | **base (solid)**                                    | ghost twin, α 0.05     |
   | `glazing`   | window, roofOpening, railing_glass                                                                                                                                                                                                                                                                                                                                                               | base opacity | opacity × 0.4                                       | opacity × 0.15         |
   | `systems`   | systemElectrical, systemWater, systemMechanical                                                                                                                                                                                                                                                                                                                                                  | base opacity | opacity × 1.4, capped 0.95 (the runs are the point) | opacity × 0.1          |
   | `glow`      | windowGlow                                                                                                                                                                                                                                                                                                                                                                                       | as today     | hidden                                              | hidden                 |
   | `outline`   | outline                                                                                                                                                                                                                                                                                                                                                                                          | opacity 0.7  | 0.5                                                 | 0.9                    |
   | (none)      | lens (`fixtureLens`), selection clones                                                                                                                                                                                                                                                                                                                                                           | untouched    | untouched                                           | untouched              |

   Every palette material key MUST have a tier; a test enumerates the palette
   and fails on an unassigned key, so a new material cannot silently fall
   through. The α values are starting points: Opus may tune within
   skin 0.12–0.20, deck 0.25–0.35, wireframe fill 0.04–0.08 by looking at the
   screenshots in §7, and records the chosen values in §9.
   (All surfaces are `DoubleSide`, so a ghost wall blends twice — front and
   back face — and reads at roughly `1-(1-α)²`; the numbers above are per face.)

3. **Ghosts are twin materials, swapped at runtime; never in-place flips.**
   Because of §2.3(1). A twin = `cloneWithProceduralDetail(source)` with
   `transparent: true`, `depthWrite: false`, `opacity` per mode, colour
   cool-tinted (`color.lerp(0xa9b7c6, 0.35)` _from the source colour_, so a
   re-sync never compounds), same `side`, same family. Twins are owned by the
   palette (`userData.ownedByPalette`, `ghostTwin: true`, `paletteKey`,
   `tier`), created lazily per key on first need, kept for the palette's life
   so their programs stay cached, and disposed by `disposeMaterialPalette`.
   Transparent-by-design keys (glazing/systems/glow) have no twin: their
   opacity is a uniform, scaled in place from a `userData.baseOpacity`
   recorded at palette creation.
4. **Batching keys on the _base_ material.** `buildFloorBatchGroup` buckets by
   `node.userData.baseMaterial || node.material` and builds batches with the
   base; `isBatchableMaterial` tests the base; `batchesStillFit` compares
   `batch.userData.baseMaterial` and `batch.userData.castShadowBuilt`. The
   mode is then applied to the new batch group like to any mesh. This is what
   keeps a drag in X-ray on the refill path and keeps the draw-call count
   identical to Solid.
5. **Ghosts cast no shadows; AO is off; outlines are on.** Ghosted meshes and
   batches get `castShadow = false` (built value remembered in
   `userData.castShadowBuilt`), `markShadowsDirty()`. The effective style in a
   see-through mode is `{...style, ambientOcclusion: false, outlines: true}` —
   AO because of §2.3(3), outlines because a ghost without edges is a smear
   and because wireframe _is_ the outlines. Grid, ground, sky, tone mapping
   stay the base style's.
6. **Clicks pick what you can see.** In X-ray, `pickObjectAt` prefers targets
   whose hit mesh holds a base (non-twin) material: solid-on-active-floor →
   solid-anywhere → ghost-on-active-floor → ghost-anywhere. In Wireframe
   everything is a ghost, so the order degrades to today's. Walk collisions
   are unchanged (§2.3(4)).
7. **The first toggle compiles off-thread, later toggles are instant.**
   `setViewMode` ensures the twins the mode needs exist; if any lacks a
   `currentProgram`, it compiles them through `compileScenePrograms` using the
   `extras` path (warm-up meshes carrying the twins, compiled against the
   scene's lights and the offscreen target) and only swaps when the promise
   resolves (timeout 4 s → swap anyway). In inspect mode the existing gate
   holds the last frame meanwhile (the panel's `catchingUp` bar/pill appears
   only past 300 ms, which is the loading-states rule); in walk mode nothing
   is held and the swap lands when ready. Second and later toggles: a
   traversal, ~1–2 ms, no links.
8. **Crossfade (should, not must).** Entering a see-through mode: twins start
   at `opacity 1, depthWrite true` (indistinguishable from solid), tween to
   the target α over 220 ms with ease-out on interactive frames, then
   `depthWrite false` on the last frame; leaving reverses, then swaps back to
   base. `prefers-reduced-motion: reduce` → no tween. If the fade looks worse
   than a cut in the screenshots, drop it and say so in §9.
9. **Keyboard.** `X` toggles Solid ↔ X-ray (from Wireframe, `X` → Solid);
   `Shift+X` toggles Wireframe ↔ Solid. Active when the pointer is over the
   pane, the pane has focus (the `viewportWrap` takes focus on pointerdown,
   `tabIndex={-1}`), or the walk holds the mouse. Guarded by `isTypingTarget`
   (`src/utils/keyboard.js`) and by `ctrlKey/metaKey/altKey` (Ctrl+X is the
   plan's cut, `SvgCanvas.jsx` 660). No 2D shortcut uses plain `x`/`X`
   (checked).
10. **Not persisted.** Pane-local state like `previewScope`; resets to Solid
    on mount. The main pane keeps it through suspension (it stays mounted);
    each assembly pane has its own. Nothing enters the editor slice, history,
    the saved file, or `renderToImage` (sheet stills build their own palette
    and never see a mode).
11. **Same control in the assembly panes.** The tier table already does the
    right thing there — ceiling boards ghost, furring/hangers stay solid; wall
    boards ghost, studs stay solid. Every framed wall draws its real frame,
    detailed or not, the way a ceiling always draws its furring (§13); the
    schematic core slab is only the fallback for a framed wall with no
    derivable members, and it ghosts (§12). That is a better "look at the
    frame" than stripping boards, and the per-face `Hide boards` switches keep
    working on top of it. The compile gate in those panes behaves exactly as
    it does for a new lamp.
12. **Save image** keeps working and the file name gains `-xray` /
    `-wireframe` before `.png` (`imageFileName`, 37).

## 4. The build

### 4.1 `preview/viewMode.js` (new, pure, unit-tested)

```js
export const VIEW_MODES = Object.freeze({ SOLID: 'solid', XRAY: 'xray', WIREFRAME: 'wireframe' });
export const DEFAULT_VIEW_MODE = VIEW_MODES.SOLID;
export const MATERIAL_TIERS = { wall: 'skin', slab: 'deck', column: 'structure', /* …every palette key… */ };
export const GHOST_TINT = 0xa9b7c6;
export const GHOST_TINT_AMOUNT = 0.35;
export const CROSSFADE_MS = 220;
export function tierOf(material)            // material.userData.paletteKey → tier | null
export function viewModePolicy(mode, tier)  // → { ghost: boolean, opacity: number|null, opacityScale: number|null, hidden: boolean, castShadow: boolean }
export function outlineOpacityFor(mode)     // 0.7 | 0.5 | 0.9
export function effectiveRenderStyle(style, mode) // {...style, outlines, ambientOcclusion}
export function nextViewMode(mode, { wireframe = false } = {}) // the X / Shift+X rule (§3.9)
export function isSeeThrough(mode)
export function imageFileSuffix(mode)       // '' | '-xray' | '-wireframe'
export function choosePickTarget(hits, { activeFloorId, isGhostHit }) // §3.6, pure, over an ordered hit list
export function applyViewModeToWorld(root, batchRoot, materialPalette, mode) // the traversal in §4.3, pure THREE, no renderer
export const VIEW_MODE_COPY = { … }         // labels, titles, footer lines (§6)
```

### 4.2 `materials.js`

- Stamp `userData.paletteKey` on every material once aliases are set (loop
  `Object.entries(palette)` after line 397; skip non-materials and keys already
  stamped so an alias keeps its first key) and `userData.baseOpacity` on the
  transparent-by-design ones.
- `ghostMaterialFor(materialPalette, source)` — lazy twin per source (§3.3),
  registry in a `WeakMap` keyed by palette like `selectionMaterials.js`;
  `ghostMaterialsOf(palette)`; `syncGhostMaterials(palette)` copies `color`
  (then re-tints), `roughness`, `metalness` (+`envMapIntensity`,
  `needsUpdate` on a metalness flip, mirroring `setMaterialAppearance`),
  `emissive`/`emissiveIntensity` from each source to its twin. Call it at the
  end of `applyRoofAppearanceToPalette` when `changed`, and pass
  `ghostMaterialsOf(palette)` to `setDetailScale` in
  `applyRenderStyleToPalette` (418) beside the selection clones.
- `disposeMaterialPalette` (513) disposes the twins.

### 4.3 `createPreviewViewport.js`

- State: `let viewMode = DEFAULT_VIEW_MODE`. `effectiveStyle()` =
  `effectiveRenderStyle(style, viewMode)`; `applyStyleToRenderer`,
  `applyOutlineVisibility` (its `style.outlines` reads), `progressive.setStyle`
  and the `materialPalette.outlinesEnabled` write all use the effective style.
  `applyWindowGlow` hides the glow (`visible = false`) in a see-through mode.
  The outline material's opacity follows `outlineOpacityFor(viewMode)`.
- `applyViewModeToWorld(root, batchRoot, palette, mode)` (lives in
  `viewMode.js`, called from here): for every `Mesh`/`InstancedMesh` whose
  material (or `userData.baseMaterial`) carries a `paletteKey`: record
  `userData.baseMaterial` and `userData.castShadowBuilt` once; resolve the
  policy for its tier; set `material` to the twin or the base, `castShadow`
  per policy (built value when not ghosted), opacity-scale the
  transparent-by-design ones from `baseOpacity`. Skip `LineSegments`, lights,
  lens materials (`fixtureLens`/`ownedByPreviewObject`), selection clones. Stamp
  `userData.viewModeApplied = mode` on each immediate child group of the roots
  and skip groups already stamped with the current mode, so an incremental
  rebuild only walks the floors it rebuilt (the cache hands reused groups
  back untouched). Idempotent: applying the same mode twice is a no-op.
- `setViewMode(mode)` (public): no-op if equal; ensure twins; compile
  unprepared twins per §3.7 (reuse/generalise `startLightCompileGate` to
  accept the promise and the apply callback — keep its inspect-only hold rule
  and its "a later gate supersedes" rule); on ready: apply to both roots,
  the effective-style bits (`progressive.setStyle`, outlines, outline
  opacity), `applyWindowGlow`, start the crossfade (§3.8) or cut,
  `markShadowsDirty()`, `invalidate()`. Expose `getViewMode()`.
- `setWorld` (1546): after `applyOutlineVisibility` and before the
  `hasUnpreparedMaterial` check, `if (viewMode !== SOLID) applyViewModeToWorld(...)`
  — new meshes arrive holding base materials and must be ghosted before they
  are drawn; `hasUnpreparedMaterial` then catches a twin for a material family
  the scene has not drawn before (a first roof while in X-ray) and gates it.
- `pickObjectAt` (893): replace the two-line preference with
  `choosePickTarget(targets, { activeFloorId, isGhostHit })` where a ghost hit
  is `hit.object.material?.userData?.ghostTwin === true`.
- The crossfade runs inside `renderFrame` as a `sceneDirty` source: while a
  transition is active, write the eased opacity to every twin in use, flip
  `depthWrite` at the end, and keep `invalidate()`-ing. Reduced motion → skip.
- `captureImage` unchanged. `dispose` needs nothing new (palette disposal
  covers twins).

### 4.4 `previewBatching.js`

- `isBatchableMesh`: resolve `const base = node.userData.baseMaterial || node.material`
  and test `isBatchableMaterial(base)`; bucket key uses `base.uuid`; batch is
  built with `base`; `batch.userData.baseMaterial = base`,
  `batch.userData.castShadowBuilt = bucket.castShadow` (from the meshes' built
  flags: use `mesh.userData.castShadowBuilt ?? mesh.castShadow` when bucketing
  so a ghosted mesh does not land in a no-shadow bucket).
- `batchesStillFit`: compare `batch.userData.baseMaterial !== bucket.material`
  and `(batch.userData.castShadowBuilt ?? batch.castShadow) !== bucket.castShadow`.
- Comments: say why in both places (this file's header already explains the
  layer trick; add a short paragraph on base materials).

### 4.5 `ThreePreviewPanel.jsx`

- `const [viewMode, setViewMode] = useState(DEFAULT_VIEW_MODE)`; effect →
  `viewportRef.current?.setViewMode(viewMode)`.
- Header: a third `modeToggle` group `role="group" aria-label="Preview
see-through mode"` with buttons `Solid` / `X-ray` / `Wireframe`
  (`aria-pressed`, titles from `VIEW_MODE_COPY`), placed directly after the
  `Lights|Night` group (616–635). Shown in every pane, assembly panes
  included.
- `data-view-mode={viewMode}` on the `<section>`; the title line gains
  ` · X-ray` / ` · Wireframe` when not solid.
- Footer `secondaryFooter`: in a see-through mode the mode's line (§6) replaces
  the style line; the walk lines keep precedence as today.
- Keyboard per §3.9: one `keydown` listener on `window` registered by the
  panel, gated by a `hoveredRef` (pointerenter/leave on `viewportWrap`),
  `section.contains(document.activeElement)`, or `walkUiState.isLocked`.
- Save image: `imageFileName(project?.name, viewPreset, viewMode)`.

### 4.6 CSS

`ThreePreviewPanel.module.css`: nothing new beyond reusing `.modeToggle`,
`.modeButton`, `.modeButtonActive`. If the header wraps to a third line at
the narrowest split-view width, shorten `Wireframe` to `Wire` with the full
word in the title and say so in §9 — do not add a fourth `<select>`.

### 4.7 Scope

Floor-plan 3D preview panes only: main model pane, wall-detail pane,
ceiling-detail pane. Not: the 2D plan (it already ghosts the floor below),
sheets/`renderToImage`, Sketch Studio's `CadViewport`, Electron-specific code.

## 5. Order of work

1. `viewMode.js` + tests (tier coverage, policies, next-mode rule, pick
   preference, `applyViewModeToWorld` on a real THREE graph).
2. `materials.js` twins + sync + dispose + tests.
3. `previewBatching.js` base-material bucketing + refill tests.
4. Viewport: `setViewMode`, effective style, setWorld re-apply, pick, shadows,
   glow, crossfade.
5. Panel: control, key, footer, title, file name.
6. `scripts/verify-xray-mode.mjs` + screenshots; full suite; lint; build.

## 6. Copy

- Buttons: **Solid** — title "Everything as built". **X-ray** — title "See
  through walls, roof, ceilings and slabs; structure, stairs and furniture stay
  solid (X)". **Wireframe** — title "Edges only, with a faint fill (Shift+X)".
- Footer, X-ray: "X-ray: walls, roof, ceilings and slabs are see-through;
  structure, stairs and furniture stay solid. Clicks pick what you can see."
- Footer, Wireframe: "Wireframe: edges only. Clicks pick the nearest object."
- Title suffix: " · X-ray", " · Wireframe".
- Nothing else: the first-toggle compile uses the existing catching-up
  bar/pill if it runs past 300 ms (it normally will not).

## 7. Verification — `scripts/verify-xray-mode.mjs`

Playwright, same harness as `verify-presentation-visuals.mjs` (chrome channel,
d3d11 ANGLE by default, `FLOORPLAN_VERIFY_URL`, `renderProfile=1`,
`localStorage.previewPerf = '1'` so `window.__previewPerf` is published; dev
server on 5199; `MSYS_NO_PATHCONV=1`). Artifacts in
`artifacts/floorplan/xray-mode/`. Each check prints `ok`/`FAIL`, exit 1 on
any failure.

1. **Control present and wired**: the group `aria-label="Preview see-through
mode"` has three buttons; clicking each sets `data-view-mode` and
   `aria-pressed`; `X` and `Shift+X` over the pane cycle as §3.9; typing `x`
   in the project-name input does nothing.
2. **First toggle cost**: programs before (`__previewPerf.programs().length`),
   click X-ray, wait for `data-view-mode="xray"` and two frames: programs
   delta ≤ 4; longest long task (PerformanceObserver `longtask`) in the 1 s
   after the click ≤ 150 ms (dev build).
3. **Later toggles are free**: Solid → X-ray → Wireframe → Solid → X-ray:
   programs unchanged after the first; each toggle's long tasks ≤ 50 ms.
4. **Draw calls**: `snapshot().render.calls` in X-ray within 1.15× of Solid,
   in Wireframe within 1.15× (same batches, one outline per floor).
5. **Batching survives a rebuild in X-ray**: while in X-ray, change a wall's
   thickness through the properties panel (select a wall by clicking its
   accent in the plan, edit the thickness field, Enter) → after settle, calls
   still within 1.15× of the Solid baseline and programs unchanged.
6. **Walk is unaffected**: enter Walk in X-ray (click pane, pointer lock
   works headless per memory), hold `W` for 600 ms; frame gaps ≤ 100 ms; exit.
7. **Pixels**: screenshots `01-solid`, `02-xray`, `03-wireframe` at
   `iso_northeast` after refine (`refined` → Save image enabled), plus
   `04-xray-elevation_front`. The probe has to be a pixel where X-ray
   _reveals_ something — a white model's ghosted wall over a ghosted slab
   over pale ground barely changes colour (measured 2026-11-07: Δ 19 at a
   plain wall face, median 21 over 31 wall faces; the first version of this
   check asked for > 40 there and could not pass in this palette). So:
   (a) **a truss member hidden under the roof** — project the centre of a
   truss member whose nearest Solid hit is a roof face and whose hit list
   holds that member behind it; Solid vs X-ray channel delta > 40/255 (the
   dark timber shows through the ghosted roof); (b) a sky/background pixel
   unchanged across modes (< 6/255); (c) **Wireframe takes it away again** —
   over _every_ member that meets the probe rule (about 200 on the
   playground, read off the same three screenshots), the median Wireframe vs
   X-ray delta > 20/255. A population rather than the one probe: a member is
   ~4 px wide at this view, and in Wireframe its centre pixel is as likely to
   land on one of its two 0.9-opacity outline edges (navy, close in value to
   a lit steel chord) as on the faint fill between them — measured
   2026-11-07, the single probe sat at exactly 30.0 while the population ran
   1…91 with median 31. Record the probe's world point and pixel, the
   population size and both medians (a, c) in `verification.json`.
8. **Pick-through**: in X-ray click a pixel on a ghost wall with a column
   behind it (playground has columns; pick coordinates by projection) →
   `selectedType` becomes `column`; in Solid the same click selects the wall.
   Record both panel titles (`Selected Object` card).
9. **Save image** in X-ray → anchor download name ends `-xray.png`.
10. **Refine resumes**: after each toggle the `refined` state (Save image
    enabled) returns within 3 s.

Also required: `npx vitest run` green, `npm run lint` with 0 errors (42
pre-existing warnings), `npm run build` clean.

## 8. Constraints

- No per-frame cost outside the 220 ms crossfade; no shader link after the
  first toggle in a pane's life; no change to `visible` flags; no new consumer
  of `useEditor()`; the panel keeps using `useEditorState()` only.
- Keep the loading-states contracts (`docs/loading-states.md` §6.2): nothing
  draws with a program that has not linked; the gate is inspect-only and
  superseded by a later gate.
- Keep the `previewSceneCache`/`previewBatching` contracts (see those files'
  headers): batches never under `worldRoot`, never raycast an InstancedMesh,
  refill path intact.
- Prettier/ESLint as the repo configures; comments explain _why_ in the house
  voice; no TypeScript.
- Do not commit. The tree already carries uncommitted loading-states and
  numeric-input work; leave it as is.

## 9. Deviations and tuning (Opus fills in)

Record here every place the build departs from this document and why, the
final α values, whether the crossfade stayed, and the measured numbers from
§7.

Filled in 2026-11-07 by Opus. Measured on the dev server (5199), headless
Chrome, ANGLE/D3D11, 1600×1000, `/playground`, Realistic style (the fresh
profile default), the main pane in focus mode at `iso_northeast`.

### 9.1 Final values

- **α per face**: X-ray skin **0.14**, deck **0.26**; Wireframe fill **0.05**
  on every ghostable tier. Outline opacity 0.7 / 0.5 / 0.9 (unchanged).
  Glazing ×0.4 / ×0.15, systems ×1.4 capped 0.95 / ×0.1 (unchanged).
  Tuned from 0.16 / 0.30 by comparing the two screenshots
  (`artifacts/floorplan/xray-mode/tuning/`): the difference is small, but the
  ground-floor furniture and stair read a touch cleaner through two ghost walls
  plus the upper slab at 0.14 / 0.26, and the ghosts still read as walls
  because the outlines carry their edges. Wireframe at 0.05 already reads as
  "edges with a breath of fill"; left alone.
- **Core** (added by §12; since §13 the fallback core of a framed wall whose
  layout derives no members): X-ray **0.07**, Wireframe **0.05**. See §12.5
  for how it was chosen.
- **Tint**: `GHOST_TINT` 0xa9b7c6 at 0.35, as specified. The constants live in
  `materials.js` (which makes the twins) and `viewMode.js` re-exports them —
  defining them in `viewMode.js` would have made the two modules import each
  other.
- **Crossfade: kept**, 220 ms ease-out cubic, cut under
  `prefers-reduced-motion: reduce`. Frames grabbed mid-fade show a clean
  dissolve; the leaving fade's near-opaque frames show the outlines' usual
  z-fight dashes on large faces for under 220 ms, which is what outlined
  surfaces look like in Shaded anyway. Ambient occlusion stays off, outlines
  stay on and the window glow stays hidden for the whole fade in either
  direction (the style follows the see-through side); shadow casters change
  once, when the fade lands.

### 9.2 Deviations from §3–§6

1. **Twins are `forceSinglePass`.** Not in §3.3. three draws a
   `transparent` + `DoubleSide` material as two calls (back faces, then front
   faces; `WebGLRenderer.renderObject` and `prepareMaterial`) and sets
   `needsUpdate` on each, so without it every ghosted batch would cost two draw
   calls, re-derive two program keys a frame, and compile separate
   `BackSide`/`FrontSide` programs. One pass still blends both faces (§3.2's
   `1-(1-α)²` holds); for a uniformly tinted ghost the lost back-to-front
   ordering inside one mesh is invisible.
2. **Outlines are re-merged after a lazy cut** (`previewBatching.remergeFloorOutlines`,
   called from the viewport's `applyOutlines`). §3.5/§7.4 assume "one outline
   per floor", but Realistic builds no outlines, so turning X-ray on made
   `ensureOutlines` cut one `LineSegments` per mesh — hundreds of draw calls
   on the toggle. The helper rewrites only each floor's merged line object in
   the batch root (instance buffers untouched, merged outline kept as the
   group's last child), so the next drag still refills. Realistic → Shaded
   benefits the same way. `ensureOutlines`'s comment says so.
3. **`compileScenePrograms` gained `includeScene` (default true).** The first
   toggle compiles only its warm-up group (`extras`, still against the scene's
   lights and the offscreen target), not the whole scene again. Warm-ups borrow
   each real mesh's geometry and instancing: one per (twin, plain|instanced)
   pair present in the world, plus a `LineSegments` for the outline material
   if a Realistic pane never compiled it. A per-viewport `WeakMap` remembers
   which pairs were issued, so later toggles find nothing to compile.
4. **Pick preference counts glass and hidden-material meshes as see-through**
   in X-ray/Wireframe, besides `ghostTwin`. A window in a ghost wall would
   otherwise be the "solid" hit in front of the column behind it.
   `choosePickTarget` itself is exactly §3.6; the viewport's `isGhostHit` adds
   the glass rule.
5. **The Wireframe button reads "Wire"** (§4.6 applied): measured header
   heights at the split view's pane widths, before → with "Wireframe" → with
   "Wire": 1600 px window (pane 448 px) 176 → 216 → 176; 1280 (358 px)
   214 → 254 → 216; 1440 (403 px) 176 → 216 → 216; 1920 (538 px) 176 → 176 → 176. The header already wrapped past a third line at these widths before
   this build; "Wire" takes back the line the control added at 1600 and 1280.
   The button carries `aria-label="Wireframe"` and the title
   "Wireframe: edges only, with a faint fill (Shift+X)"; title suffix and
   footer still say Wireframe. `VIEW_MODE_COPY` has `label` (face) and `name`.
6. **Keyboard extras**: `event.repeat` is ignored; a suspended pane ignores the
   keys; the `viewportWrap` (`tabIndex={-1}`) focuses itself on pointerdown
   explicitly (the canvas can swallow the press) and has no focus ring.
7. **Selection overlay is unchanged** in see-through modes: a selected ghost
   wall is drawn by its opaque tinted overlay. Judgment call — the selection
   is the one thing that should not be see-through.
8. **`applyViewModeToWorld(…, { during })`** carries the crossfade: a mesh
   that is a ghost in either mode holds its twin for the fade and casts as in
   the mode being left; the group stamp is `prev>next` during a fade, so the
   landing re-walks every group once. It returns whether any caster changed.
9. **Debug hooks** on `window.__previewPerf` (perf-gated, like the rest of it)
   for the verify script: `viewMode()`, `probe(x, y)`, `project([x,y,z])`,
   `centers(kind)`, `drawables()`, `batches()`, and `camera().position`.
   `probe` hits and `centers` entries carry the mesh uuid (and `centers` the
   base palette key), and `centers` resolves the pick target up the tree, so
   members whose target sits on their object group are found.

### 9.3 Verify-script deviations (`scripts/verify-xray-mode.mjs`)

- **Frames are vsync-paced by default**; `FLOORPLAN_VERIFY_UNPACED=1` restores
  verify-presentation-visuals' `--disable-frame-rate-limit --disable-gpu-vsync`.
  Unpaced, the later toggles measured long tasks of 50–177 ms, every one of
  them the refine's _first sample_ (~490 ms after the click) blocking inside a
  `drawElementsInstanced`/`uniformMatrix4fv` call (WebGL prototype wrapped to
  time calls: the time is GPU backpressure, not script — the CPU profile of
  that window is idle/(program)). Controls: with reduced motion (no fade) the
  stall vanishes; with vsync pacing it vanishes; and an unpaced plain orbit
  drag _in Solid, before any toggle_ stalls the same first sample by
  98–104 ms. Any run of uncapped interactive frames queues GPU work faster
  than it drains; no display produces that.
- **§7.4** is measured two ways: `drawables()` (the scene pass's draw list,
  counted structurally) and the last interactive frame's `render.calls`. The
  latter includes GTAO's normal pass, which re-draws the scene in Solid, so
  X-ray/Wireframe come out far below Solid on it.
- **§7.5 edits the wall's Height, not its thickness**: a straight wall's
  properties have no Thickness field (its thickness is the assembly's — "Built
  thickness" is a readout). The wall is selected by walking points along its
  plan outline until the panel shows the wall-only Assembly select (plan
  picking prefers doors, windows and the columns at wall ends; an earlier run
  that clicked the bbox centre edited a door's 2100 mm height). Refill is
  proven by identity: the ids of all 50 instanced batches are unchanged.
- **§7.6**: at the playground spawn the _Physical_ walk does not move under W
  in Solid either (the body steps, the camera stays put — pre-existing), so the
  frame-gap check runs as specified and movement is proved in No-clip (C, W, C).
- **§7.7** (rewritten by Fable after the first run; the old plain-wall probe
  measured Δ 19 against > 40, because a ghosted wall over ghosted slabs over
  pale ground barely changes colour in this palette). The background probe is
  the top-centre of the visible picture (focus mode's floating panels cover
  the canvas corners), checked empty by a ray. The truss probe is the first
  member — chords, then purlins, then webs, each in scene order — that meets
  every one of: a chord/web/purlin palette key (never the gableInfill end
  closures); centre on screen and not under a panel; nearest hit a `roof_*`
  face; that very mesh further down the ray; **and no other truss member on
  the ray**. Two facts the spec text did not have: members are
  `trussInstance` descriptors (the end closures are the `trussSystem` ones),
  so both kinds are read and the palette key decides; and identical trusses
  seen from a corner stack along the same screen lines, so without the
  "alone on its ray" rule a pixel measures a stack of members and outlines.
  The member pixels are sampled **as the single centre pixel**, not 3×3: a
  member is about 4 px wide at this distance and Wireframe draws its two edges
  at 0.9, so a 3×3 block is mostly outline, as dark as the metal chord it
  outlines (3×3 gave (c) Δ 9.8 at the same member). The backdrop is still
  averaged 5×5. (a) is asserted on the single probe; (c) on the median over
  every member that meets the same rule (209 on the playground), read from the
  same three screenshots. The probe's world point and pixel, its hit list, the
  population size, both medians and both sorted delta lists are in
  `verification.json` (`metrics.probes.trussPixel`, `metrics.pixels`).

### 9.4 §7 results (final run, `verification.json`)

| #   | check                                       | measured                                                                                                                                                                                                                                                                                                                      | result |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | control, clicks, X / Shift+X, typing guard  | 3 buttons Solid / X-ray / Wire; clicks and keys cycle as §3.9; `x` typed into a text field with the pointer over the pane left Solid                                                                                                                                                                                          | ok     |
| 2   | first toggle                                | programs 29 → 32 (Δ 3, listed: two ghost-family programs named `slab-ghost` and `wall-ghost` after the first twin to use each — by the warm-up design, the plain and the instanced variant — and the outline's LineBasic); longest long task in the 1 s after the click 0 ms; the first Wireframe toggle afterwards adds none | ok     |
| 3   | later toggles                               | Wireframe, Solid, X-ray, Wireframe, Solid, X-ray: programs 32 every time; longest long task 0 ms each (paced; see §9.3 for unpaced)                                                                                                                                                                                           | ok     |
| 4   | draw calls                                  | draw list Solid 155, X-ray 144, Wireframe 144 (0.929×; the hidden glow panes outweigh the added merged outlines); last interactive frame 367 / 191 / 147                                                                                                                                                                      | ok     |
| 5   | rebuild in X-ray                            | wall height 3000 → 2700: 50 batches refilled in place, draw list 150 → 150, programs 32 → 32, rebuild frame 101 calls vs Solid 175                                                                                                                                                                                            | ok     |
| 6   | walk                                        | pointer lock on; Physical: 104 frames over 600 ms, worst gap 7.2 ms; No-clip: moved 1,089 mm, worst gap 7.2 ms; still X-ray                                                                                                                                                                                                   | ok     |
| 7a  | truss member under the roof, Solid vs X-ray | probe `trussChord_metal` at pixel (781, 345), world (−3835, 6090, −1109) mm; hits roof_metal ×2 then the chord: [189,191,189] → [100,106,109], **Δ 89.0** (> 40). Population (209 members meeting the rule): median **84**, min 41, max 136                                                                                   | ok     |
| 7b  | background unchanged                        | (801, 220): Δ 0.0 (< 6)                                                                                                                                                                                                                                                                                                       | ok     |
| 7c  | Wireframe vs X-ray, population              | 209 members: median **31** (> 20), min 1, max 91. The probe's own Δ 30.0 ([100,106,109] → [130,132,135]) is recorded, not asserted                                                                                                                                                                                            | ok     |
| 8   | pick-through                                | X-ray "first floor · Column", Solid "first floor · Wall" at the same pixel                                                                                                                                                                                                                                                    | ok     |
| 9   | Save image                                  | `lomboy-iso_northeast-xray.png`                                                                                                                                                                                                                                                                                               | ok     |
| 10  | refine resumes                              | 1087 (first, includes the compile), 1006, 1007, 791, 883, 964, 822 ms                                                                                                                                                                                                                                                         | ok     |

**History of 7.7.** The first version probed a plain wall face (Δ 19.2
against > 40, unreachable in a white model on pale ground); the second made
(c) a single-probe check, which landed on Δ 30.0 against > 30 because a
~4 px member's centre pixel in Wireframe is as likely to hit one of its two
0.9-opacity navy edges as the faint fill between them. (c) is now the median
over the whole qualifying population, which is what the mode actually does
to the members; the single probe's value stays in `verification.json`.

The screenshots (`02-xray`, `02-xray-detail`, `03-wireframe`,
`04-xray-elevation_front`) show skin ghosted; trusses, columns, beams, stair
and furniture solid; outlines present; no AO stains; no shadows from ghosts. A
wall-editor pane smoke test (not in §7) showed boards and door ghosted over
solid steel studs, and the suspended main pane stayed Solid.

Suite: `npx vitest run` 430 files / 5,241 tests passed (1 skipped, pre-existing);
`npm run lint` 0 errors, 42 warnings (none in `preview/`); `npm run build`
clean.

## 10. Audit checklist (Fable)

- Tier table complete: test enumerates `createMaterialPalette()` keys.
- `WebGLPrograms` `opaque` fact honoured: no `transparent` flip on a shared
  palette material anywhere (grep).
- `isBatchableMesh`/`batchesStillFit` read base materials; refill test exists
  and passes against real THREE.
- `setWorld` re-applies the mode before the `hasUnpreparedMaterial` check.
- `applyViewModeToWorld` never touches `visible`, lights, lens materials.
- Pick preference pure and tested; walk collision signature unchanged.
- Verify script runs green on a fresh dev server; screenshots look right
  (skin ghosted, structure/contents solid, no AO stains, no shadow from
  ghosts, outlines present in Realistic X-ray).
- Suite, lint, build clean; nothing committed.

## 11. Follow-ups (not this build)

- **Cut plane**: `renderer.clippingPlanes` + a draggable height — pairs with
  X-ray and is cheap.
- **Ghost other floors**: ghost every floor but the active one (the 2D plan's
  floor-below rule in 3D).
- A per-object "see-through" toggle in the properties panel, reusing the
  twins.
- Sketch Studio `CadViewport` X-ray for hardware inside parts (it already dims
  inactive parts, 1690).

## 12. Bug: framed walls stay solid in X-ray (2026-11-07, Fable diagnosis; Opus builds)

### 12.1 Symptom

A wall whose Assembly is **HardieFlex / fiber cement** (`WallProperties.jsx` 605) — or Plywood, or Mixed board: any preset with `system: 'framed'`
(`wallAssemblies.js` 169–190) — does not go see-through in X-ray. A CHB
masonry wall (the default preset, 194) does. The user's words: "when i go
xray, the hardiflex wall is not going see through walls at all."

### 12.2 Cause (verified against source)

`src/three/scene/objectBuilders.js` `buildWallObjects`, 605–660. When
detailing is off and no face is stripped, a framed wall segment is drawn as
**three boxes**:

- a schematic **core** box, `wallAssemblyCoreDepth(assembly)` deep (75 mm for
  a single 75 mm stud frame; `wallAssemblies.js` 262–266), with
  `materialKey: coreMaterialKey` = `wallFramingSteel` / `wallFramingTimber`
  and `assemblySide: 'core'` (605–606, 648–659);
- two board boxes (6 mm each for fiber cement) in `wallFiberCement` /
  `wallPlywood` / the rainscreen tones (`buildSkinDescriptors`).

`MATERIAL_TIERS` (`viewMode.js` 100–101) puts `wallFramingSteel` and
`wallFramingTimber` under `structure`, which X-ray keeps solid. That is right
for the **real** framing members — `buildFramingMemberDescriptors` (405–428),
drawn for a detailed face and for a stripped face (`includeWhenDisabled`) —
because studs are what an X-ray is for. But the schematic core is not studs:
it is a stand-in slab the full depth of the frame that happens to wear the
stud material. So X-ray ghosts the two 6 mm boards and leaves a solid 75 mm
slab between them, and the wall reads exactly as opaque as in Solid.

Why nobody caught it: §3.11's "wall boards ghost, studs stay solid" was
written for the detailed/stripped paths; the §7.8 pick-through probe only
accepts `paletteKey === 'wall'` (`verify-xray-mode.mjs` 385); and the
playground demo has no framed wall (`src/pages/playground-demo.json` carries
no `preset`), so every wall the script ever looked at was CHB.

Consumers of the framing keys outside the three files above: none
(`grep wallFramingSteel|wallFramingTimber` over `src`/`scripts` non-test →
`materials.js` 43–44, 240–241; `viewMode.js` 100–101; `objectBuilders.js`
409, 606). Selection highlights and the wall-editor readouts key on
`assemblySide`, not the material.

### 12.3 Fix

The twin design is untouched. The schematic core gets its own material, so it
can carry its own tier (a tier is read off `userData.paletteKey`, and an
alias keeps the first key's tier — `stampPaletteKeys` — so this must be a
distinct instance, not an alias; batching buckets by material identity, so a
core box and a real stud on the same floor must not share one material
either, or one `InstancedMesh` would have to be both solid and ghost).

1. **`materials.js`** — two new palette entries placed right after the
   framing pair, with the framing materials' exact parameters so Solid is
   pixel-identical before and after:
   `wallCoreSteel: metal({ color: 0xb4bcc2, roughness: 0.42 })`,
   `wallCoreTimber: surface({ color: 0xb07740, roughness: 0.76 })`.
   `DETAIL_ASSIGNMENTS`: `wallCoreSteel: 'metal'`, `wallCoreTimber: 'timber'`.
   If `CLASSIC_SURFACES` has entries for the framing pair, mirror them for
   the core pair. Keep the doc comment honest: say what the core keys are for.
2. **`viewMode.js`** — new tier `CORE: 'core'` in `TIERS` and
   `GHOSTABLE_TIERS`; `MATERIAL_TIERS` gains `wallCoreSteel: 'core'`,
   `wallCoreTimber: 'core'` under a comment that says a schematic core is a
   stand-in for studs, not studs; `GHOST_OPACITY.xray.core` and
   `GHOST_OPACITY.wireframe.core = 0.05`.
   **X-ray value: start at 0.07, band 0.06–0.08.** Rationale: the core
   represents a stud frame, and in a 75 × 400 mm steel frame the studs,
   tracks and noggins cover roughly 12–15 % of the wall's area; a ghost box
   blended on two faces at 0.07 reads at `1 − 0.93² ≈ 0.135`, i.e. the
   average of what the real members would show. It must be _below_ skin
   (0.14): the wall already has four board faces in front of and behind it.
   Tune inside the band against a screenshot of a framed wall next to a CHB
   wall and record the final value in §12.5.
3. **`objectBuilders.js` 605–606** — the schematic `coreMaterialKey` becomes
   `wallCoreTimber` / `wallCoreSteel`. **Lines 408–409 (real members) stay**
   `wallFramingTimber` / `wallFramingSteel`. The stripped-face path (613–629)
   already draws real members and is untouched.
4. **Tests.** `objectBuilders.test.js` 138 and 590 expect the new core keys;
   add one test that a detailed wall's framing members still wear
   `wallFramingSteel` while an undetailed framed wall's core wears
   `wallCoreSteel` (the two paths must not drift together again).
   `materials.test.js`: add `wallCoreSteel` to "makes the real metals metal"
   (123) and both core keys to the detail-assignment list (150–165).
   `viewMode.test.js`: the palette-enumeration test (54–63) passes once the
   tiers exist; add a row for `core` (ghost in xray at the chosen α with
   `castShadow` false; ghost at 0.05 in wireframe; nothing in solid) and
   assert `GHOST_OPACITY.xray.core < GHOST_OPACITY.xray.skin`. Check
   `previewBatching.js` `isBatchableMaterial` (≈212) does not whitelist keys.
5. **Spec.** Add a `core` row to the §3.2 table, fix §3.11's wording
   ("studs stay solid; a schematic core ghosts"), and add the final values to
   §9.1 and §12.5.
6. **Verify script** `scripts/verify-xray-mode.mjs` — a new §7.10 check,
   "framed wall": the script has to get a framed wall on screen first (the
   demo has none). Either drive the UI — select a wall in the plan and set
   the Assembly `<select>` (`WallProperties.jsx` 599–610, option value
   `fiber_cement`) — or seed the project the way
   `verify-night-section-freezes.mjs` 75–95 does with
   `apartment-planner-projects` plus a recovery key; pick whichever is less
   brittle and say which in §12.5. Then, in Solid, find a pixel whose
   `perf.probe` ray enters through a `wallCoreSteel` or `wallFiberCement` hit
   with a column (or beam/stair) behind it on the same ray, the way the §7.8
   probe finds a column behind a `wall`. The check is twofold: (a) after the
   X-ray toggle settles, every hit on that ray whose `paletteKey` is a core
   or board key holds a material with `userData.ghostTwin === true`, opacity
   equal to its tier's α, and `castShadow === false` (read inside the
   `page.evaluate`, through the hit's mesh — the probe raycasts the source
   meshes, not the batches, so also confirm through `perf.batches()` that the
   batch holding the core draws the twin, if `batches()` exposes materials;
   if it does not, say so); (b) the pixel's Solid → X-ray Δ, logged and
   checked against a threshold you set from the measured value with margin
   (as §7.7 did; a pale column behind a pale wall is a small Δ, so if the
   measured Δ is under ~15 choose a darker target behind the wall — a truss
   member or a dark fixture — rather than lowering the bar to noise).
   Re-run the whole script; all existing checks must still pass.

### 12.4 Constraints

- Everything in §8 still holds: no rebuild on a mode toggle, no new program
  links after the first toggle (the core twins join the same ghost program
  family — `cloneWithProceduralDetail` of a `metal`/`surface` material; the
  program count after the first X-ray toggle may rise only if the twins are
  genuinely new program keys, which they should not be — measure and report
  §7.2 before/after).
- Solid output byte-identical: same colours, roughness, metalness, detail
  family; the only Solid-visible change is one more batch bucket per floor
  that has both a framed-wall core and real studs.
- `visible` is never touched; the walk still collides with a ghosted core.
- No change to sheets/`renderToImage`, the 2D plan, or the saved file.

### 12.5 Outcome (Opus fills in)

Final core α, the §7.10 probe chosen and its numbers, §7.2 program counts
before/after, suite/lint/build results, and every judgment call made.

Filled in 2026-11-07 by Opus. Same harness as §9 (dev server 5199, headless
Chrome, ANGLE/D3D11, 1600×1000, `/playground`, Realistic, focus mode,
`iso_northeast`).

**The fix as built.** `materials.js`: `wallCoreSteel` / `wallCoreTimber`
right after the framing pair, the framing pair's exact parameters, detail
families `metal` / `timber`; `CLASSIC_SURFACES` has no framing entries, so
nothing to mirror. `viewMode.js`: `TIERS.CORE`, in `GHOSTABLE_TIERS`,
`MATERIAL_TIERS` rows under a "stand-in for studs, not studs" comment,
`GHOST_OPACITY.xray.core = 0.07`, `.wireframe.core = 0.05`.
`objectBuilders.js` 605–610: only the schematic `coreMaterialKey` changed
(plus a comment); 408–409 (real members) untouched. `previewBatching.js`
`isBatchableMaterial` (187, not ≈212 — 212 is `isBatchableMesh`'s call to it)
whitelists no keys; unchanged.

**Final α: 0.07** (X-ray), 0.05 (Wireframe). Tuned from screenshots and
pixels, the re-clad wall standing next to the CHB walls
(`artifacts/floorplan/xray-mode/tuning/framed-core/`): over the wall's 490
face pixels the X-ray luminance median was 173.3 / 172.9 / 172.6 at 0.06 /
0.07 / 0.08, and the median difference from the same pixels with the wall
still CHB was 6.05 / 6.0 / 6.0. Inside the band the core is invisible to the
eye: the four 6 mm board faces at the skin's 0.14 dominate (a ray through a
framed wall crosses four board faces and two core faces, ≈ 1 − 0.86⁴·0.93² ≈
0.53 coverage, against 1 − 0.86² ≈ 0.26 for a CHB wall). So the band cannot
be tuned by eye on this wall; 0.07 is kept for §12.3's reasoning (the stud
fraction), and it sits below the skin as required. The same wall with the core
left solid (bug, emulated by putting `wallCoreSteel` back in `structure`)
reads as a dark steel slab: X-ray luminance 103.6, 70 below the CHB
reference.

**How a framed wall gets on screen: UI, not seeding.** §7.11 runs last (it
changes the model every earlier check measured). It re-enters focus mode at
`iso_northeast`, deselects by clicking empty backdrop, finds the §7.8 pixel
(a plain `wall` face with a column behind it; the rule is now one string,
`COLUMN_BEHIND_WALL`, shared by §7.8 and §7.11), clicks it **in the 3D pane**
(selects `wall_mmh5igl4_6`), sets the floating properties panel's Assembly
`<select>` to `fiber_cement`, and clicks the backdrop again. Why: seeding
needs `/floorplan` plus a stored project and a recovery flow, and the rest of
the script runs on `/playground`'s demo; and plan-side selection (the
`WallProperties` route §12.3.6 names) proved brittle — the target wall's plan
polygon is off-screen in the 608 px split-view plan (screen x ≈ 1442 against a
plan right edge at 864) and the plan has no zoom-to-fit. The 3D click picks
exactly the wall the script already knows has a column behind it. The backdrop
click matters: a selected wall is drawn by its opaque overlay in every mode
(§9.2.7), which on the first exploration run made the re-clad wall look solid
in X-ray for the wrong reason.

**The §7.11 probe.** A pixel whose ray enters the re-clad wall through a
`wallFiberCement` face (not a wall end), crosses its core, has only this
wall's board/core hits in front, and meets something X-ray keeps solid —
fixtures first, then stairs, beams, columns, each in scene order. Columns were
tried first: Δ 3–28 at single pixels (pale column behind a pale wall, §12.3.6's
warning), so fixtures lead. Chosen: `fixtureAccentFabric` (fixture) at
(1102, 730); 14 targets meet the rule.

- (a) on that ray after the X-ray toggle settled: `wallFiberCement` ghost
  α 0.14 → `wallCoreSteel` ghost α 0.07 → `wallFiberCement` 0.14 →
  `wallCoreSteel` 0.07 → `wallFiberCement` 0.14 ×2 → `fixtureAccentFabric`
  solid; every ghost `depthWrite false`, `castShadow false`. Batches: one
  `wallCoreSteel` batch (9 instances, the wall's segments) drawing the twin at
  0.07, no shadow; the `wallFiberCement` batch (18) at 0.14. `batches()` only
  returned uuids, so the perf-gated debug handle gained `batchMaterials()`
  and the `probe` hits gained `baseKey`, `opacity`, `depthWrite`,
  `castShadow` (`createPreviewViewport.js` debug block, `previewPerf.js`).
- (b) reveal at the probe, Solid → X-ray: [193,194,193] → [175.6,172.4,167.7],
  **Δ 25.3** (threshold > 12; median 24.0 over the 14 targets). **This is not
  a regression check**: with the core left solid the same pixels change _more_
  (Δ 96–97 at these fixture pixels, median 93 across the face) because the boards
  ghost and the steel shows dark. So (b) also asserts **parity**: over the
  wall's 490 face pixels (5 px grid over its screen box; first hit a board of
  this wall, core on the ray), the X-ray picture of the HardieFlex wall
  against the X-ray picture of the same pixels while the wall was CHB:
  **median Δ 6** (threshold < 20; bug 70.4). Luminance 172.9 vs CHB 169.9.
  Both pixel samples are 3×3 means.
- Programs: 34 before re-cladding (after the earlier toggles), 34 in Solid
  after, 34 after the X-ray toggle — the core's base and twin both landed on
  programs already linked. Asserted equal.

Screenshots: `05-xray-chb`, `06-solid-chb`, `07-solid-framed`,
`08-xray-framed`; tuning set in `tuning/framed-core/` (0.06 / 0.07 / 0.08,
the solid-core bug, crops). All values in `verification.json`
(`metrics.framedWall`).

**§7.2 before/after.** Before (the 04:09 run of §9.4): 29 → 32, Δ 3. After:
31 → 34, Δ 3; later toggles 34 throughout; §7.5 34 → 34. The +2 on the base
count is not this change: an A/B on the same tree with the two new palette
entries commented out gives 31 at the same point (24 scene programs plus
the env/background/output ones), so it came with other uncommitted work since
04:09. Every other §7 row passed with numbers within noise of §9.4 (draw list
155 / 144 / 144; truss Δ 89.0, medians 84 / 31; refine 828–1229 ms).

**Suite, lint, build.** `npx vitest run`: 434 files, 5,276 passed, 1 skipped
(pre-existing). A first full run had one 5 s timeout in
`CadWorkspace.place.dom.test.jsx` (Sketch Studio, untouched; passes alone and
in the second full run). `npm run lint`: 0 errors, 42 warnings (unchanged).
`npm run build`: clean.

**Tests added/changed.** `objectBuilders.test.js`: 138 → `wallCoreTimber`,
590 → `wallCoreSteel`, and a new test that a detailed face and a stripped face
draw `wallFramingSteel` members while the undetailed wall's core is
`wallCoreSteel` (`wallCoreTimber` for timber framing). `materials.test.js`:
`wallCoreSteel` in "makes the real metals metal", both core keys in the
detail list, and a new test that the core pair matches the framing pair
(type, colour, roughness, metalness, envMapIntensity, side, detail family) as
separate instances in both looks. `viewMode.test.js`: the `core` policy row
(tier of both keys, X-ray ghost at `GHOST_OPACITY.xray.core` in 0.06–0.08 and
below skin, no shadow, Wireframe 0.05, nothing in Solid), `core` added to the
Wireframe loop, and a real-THREE playground test with two walls re-clad in
HardieFlex (one undetailed, one detailed): the cores, batches included, hold
the twin and stop casting in X-ray while the studs keep `wallFramingSteel`
and their shadows; Solid restores both.

**Judgment calls and spec corrections.**

1. The new check is **§7.11**, not §7.10: §7 and the script already number
   "Refine resumes" §7.10.
2. §12.3.6(b) as written (Solid → X-ray Δ over a threshold) does not
   discriminate the bug (above); the parity condition was added and carries
   the regression. The reveal is still asserted as specified.
3. The probe must enter through a board face (`wallFiberCement` first), not
   "a `wallCoreSteel` or `wallFiberCement` hit": the first exploration probe
   entered through a core end at a wall end and sat on outlines (parity 55).
4. Debug hooks extended (two files outside §12's list) because (a) cannot be
   read otherwise: the probe exposed no opacity/shadow, `batches()` no
   materials. Additive and perf-gated; existing consumers unchanged.
5. UI over seeding, via the 3D pane rather than the plan (above).
6. A framed wall in X-ray reads about twice as opaque as a CHB wall (four
   board faces). Within §12's design, but if the user expects HardieFlex to
   read as clear as CHB, the boards need their own α (a `board` tier) — not
   done here. **Still open after §13** (§13 draws the studs; it does not
   change the boards' α): between the studs the re-clad wall measures median
   Δ 9.8 against the same pixels as CHB in X-ray.
7. The re-clad wall's Solid look changes as any assembly change does
   (thickness 87 mm); Solid of an _existing_ framed wall is unchanged by this
   fix (same parameters, pinned by the new materials test).

## 13. Bug: X-ray shows no studs inside a framed wall (2026-11-07, Fable diagnosis; Opus builds)

### 13.1 Symptom

The user, after §12 landed: "why on xray mode or wire mode the inside framing
studs is not visible? … why you not consider that there's a stud framing
inside these kind of walls? same like ceilings."

Put a HardieFlex / plywood / mixed-board wall (any `system: 'framed'` preset)
in the model, switch the 3D pane to X-ray: the boards ghost (§12 fixed that)
and the wall is an empty translucent slab. No studs, no tracks, no noggins,
no headers. Wireframe draws the wall as one outlined box. Yet the same wall's
2D plan draws every stud, and a ceiling in the same X-ray shows its furring,
carriers and hangers above the ghosted boards.

### 13.2 Cause (verified against source)

The 3D preview only draws a framed wall's real members on two paths, and
neither is the one a wall is normally on:

- `src/three/scene/objectBuilders.js` `buildWallObjects` (552–676). After
  the segment split and layer resolution, an undetailed framed wall with
  every face boarded falls through to 645–669: per segment, one schematic
  **core box** (`${segment.id}:core`, `wallAssemblyCoreDepth(assembly)` deep,
  `materialKey` `wallCoreSteel`/`wallCoreTimber`, `assemblySide: 'core'`)
  plus the board boxes. The core is a stand-in slab; it has no members in it.
- Real members come from `buildFramingMemberDescriptors` (406–428, one
  `createLinearBoxDescriptor` per member of `deriveWallFramingMembers`) and
  are built only when (a) a face is **detailed** — `resolveWallDetailing(wall)
.enabled` and that side enabled, 619–622 → `buildDetailedWallObjects`; the
  flag is set by "open the wall detail editor" (`WallProperties.jsx`
  `openWallDetailEditor`, 354–377) and nothing else — or (b) a face is
  **stripped** through the "3D view" section's board-visibility buttons
  (`SET_WALL_BOARD_VISIBILITY`, `WallProperties.jsx` 824;
  `hiddenWallBoards` → `buildPreviewScene` `hiddenBoardSides`), 633–643,
  with `includeWhenDisabled: true`.
- §12 saw the core slab staying solid, gave it the `core` tier and ghosted it
  at α 0.07. That made the wall see-through and left nothing to see through
  to: the mode's whole point, per §1 ("the studs inside a framed wall"), was
  never reachable for an ordinary wall.

What the user compares it to, and is right about:

- **Ceilings** build their frame on every path: `src/geometry/ceilingGeometry.js`
  `buildCeilingPreviewObjects` (531) → `buildAssemblyDescriptors` (592–700)
  emits boards, every furring/carrier member (`ceilingFraming` /
  `ceilingFramingTimber`, 603, 664–678), hangers (`ceilingHanger`, 683–695),
  opening trim and luminaires, cached per derived assembly
  (`cachedAssemblyDescriptors`, 577). `hideBoards` only _removes_ the boards;
  the frame is never conditional. So X-ray's tier table (`ceilingBoard` skin,
  `ceilingFraming`/`ceilingHanger` structure) delivers the frame for free.
- **The 2D plan** draws studs for every framed wall, detailed or not:
  `WallRenderer.jsx` 182 calls `deriveWallFramingLayout(renderData.bodyWall,
openings)` unconditionally.
- The frame is not optional in the model either: `deriveWallFramingMembers`'s
  own comment (`wallDetailing.js` 913–918) says "the detailing flag governs
  drawing and takeoff, not whether the studs exist", and `includeWhenDisabled`
  exists for exactly this.

So the wall builder is the odd one out. The 3D preview treated the frame as a
_documentation_ detail; the ceiling builder, the plan and the domain all treat
it as what the wall is made of.

Measured (Fable, vitest bench, 2026-11-07; 30 × 6 m fiber-cement walls, 2,700
high, one door and one window each, default 50 × 75 steel frame at 400 mm,
one noggin row):

|                                                     | per wall                                                                                 | 30 walls                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| members, wall with door + window                    | 27 (10 stud, 4 king, 4 trimmer, 2 bottom track, 1 top track, 3 noggin, 2 header, 1 sill) | 810                          |
| members, plain 6 m wall                             | 19                                                                                       | —                            |
| `deriveWallFramingMembers`                          | 0.07–0.13 ms                                                                             | 2.1–3.7 ms                   |
| `buildFloorPreviewObjects`, today (core slab)       | —                                                                                        | 600 descriptors, 3.0–10 ms   |
| `buildFloorPreviewObjects`, members path (stripped) | —                                                                                        | 1,050 descriptors, 6.7–10 ms |

Member ids are deterministic (`${wall.id}:auto:stud:…`, `…:track:top:0`,
`wallAssemblies.js` 589–655), so the scene cache's descriptor carry-over
works for them across rebuilds; members are plain boxes, so `previewBatching`
folds them into one `InstancedMesh` per (framing material, floor).

### 13.3 Decision

**The 3D preview draws the real frame of every framed wall, always — the
ceiling contract.** Boards over members, on every path; the schematic core
box survives only as the fallback for a framed wall whose layout yields no
members (zero length; an arc wall never reaches this code — 560–573 draws it
as one prism). Detailing and board-stripping keep their meaning (panels
hand-drawn in the editor; boards removed) but no longer decide whether the
wall has studs.

Rejected:

- _Build members only in see-through modes._ The builders are view-agnostic
  (§4.7, §8): a mode toggle must not rebuild floors, and the walk/pick
  geometry must not differ per mode. The cost of always building them is
  small (table above) and batched.
- _Ghost the core harder, or draw a stud "texture" on it._ That is §12 again;
  the user wants the members, and they exist.
- _Any new persisted field or setting._ None: the frame is derived.

Consequences that are intended:

- Solid output is pixel-identical on wall faces (opaque boards hide the
  members) and at opening reveals and run ends: the end studs at u = 0 and
  u = length, the tracks, the trimmers (inner face on the jamb line), header
  and sill are all frame-depth boxes on the same planes the core slab was cut
  on. A _double_ frame (`frameCount: 2`) shows its two frames and the gap at a
  free end, which is what a double frame looks like.
- X-ray: boards ghost at 0.14, members solid in the framing keys (structure
  tier) — exactly what §3.11 claimed. Wireframe: members at 0.05 with their
  outlines, so a framed wall reads as a frame.
- Clicks in X-ray: a pixel on a stud selects the wall (solid hit), a pixel
  between studs picks what is behind. "Clicks pick what you can see" holds.
- The walk collides with the same boards as before plus the members; no
  behaviour change.
- Sheets (`renderToImage.js` 37 builds the same scene) gain members under
  opaque boards: invisible, a few more instances. The 2D plan, elevations,
  sections, takeoff and the saved file are untouched.

### 13.4 The build

1. **`objectBuilders.js` `buildWallObjects`** (633–669). Replace the
   stripped-face gate with the general rule: after `rainscreen` is resolved,
   derive `members = buildFramingMemberDescriptors(context, assembly,
{ includeWhenDisabled: true })` for every framed wall on this path; if
   `members.length`, return `[...members, ...buildSkinDescriptors(segments,
skinLayers, normal, assembly, boardRun), ...rainscreen]` whether or not a
   face is stripped; only when no member derives fall through to the core
   slab (keep that block, keep `coreMaterialKey`, keep `assemblySide:
'core'` on it). Rewrite the two comments (604–610 "The schematic core
   wears…" and 633–637 "With a face stripped…") to say what is now true: the
   frame is drawn for every framed wall, like a ceiling's; the core is the
   fallback for a wall that has no derivable frame. The detailed path
   (619–622 → `buildDetailedWallObjects`) is unchanged — it already draws
   members.
   Do not touch `buildFramingMemberDescriptors`, `wallCore*` palette entries,
   or `MATERIAL_TIERS` rows; the `core` tier stays for the fallback.
2. **Comments that now lie.** `wallDetailing.js` 913–918 (`includeWhenDisabled`
   doc: "…to show the frame behind a wall whose boards are hidden" → the
   preview draws the frame of every framed wall); `viewMode.js` 92–100 and
   the `GHOST_OPACITY` comment (~165–175) ("The schematic core of an
   undetailed framed wall…" → the fallback core of a framed wall with no
   derivable members); `objectBuilders.test.js` 599–602 (the "used to share
   the framing keys" comment stays true but add that the core is now a
   fallback only). Keep the house voice: say why.
3. **Tests.**
   - `objectBuilders.test.js` 128–145 ("carries the selected board-wall
     assembly…"): the undetailed plywood wall now has no `core` descriptor;
     assert its framing members wear `wallFramingTimber` and carry
     `wallDetailKind: 'framing'`, `framingKind`, and `metadata.wallAssembly`
     as before; boards unchanged.
   - 575–598 (the pinned 3-descriptor fiber-cement wall): re-pin. Boards keep
     their ids (`-segment-1:interior`/`:exterior`), sizes
     `{6000, 2700, 6}` and `center.y` ±40.5; pin the exact member count and
     kinds the generator emits for this plain 6 m wall (the bench says 19),
     with ids `${wallId}:auto:…:3d`, all `wallFramingSteel`, `assemblySide:
'core'`, member depth 75 (`size.z`). Assert there is no `:core`
     descriptor.
   - 599–640 ("dresses real framing members…"): the schematic assertions flip
     — an undetailed wall now yields `> 1` members in `wallFramingSteel`
     (timber → `wallFramingTimber`) and no `wallCore*` descriptor; add the
     fallback case: a framed wall that derives no members (find a case that
     reaches the builder with an empty layout — e.g. a framed assembly whose
     custom framing mode holds zero members — and if none exists, say so and
     test the fallback branch by stubbing `deriveWallFramingMembers`) still
     gets exactly one `wallCore*` box per segment, so a wall never vanishes.
   - Add: _members are present with and without a stripped face, with and
     without detailing, and their ids are identical across the three paths_
     (carry-over depends on it).
   - `viewMode.test.js` 395–445 (real-THREE, two re-clad playground walls):
     `cores.length > 0` is now false. Rewrite: both walls draw
     `wallFramingSteel` meshes (instanced), no `wallCore*` mesh exists for
     either; in X-ray the boards hold the `wallFiberCement` twin at
     `GHOST_OPACITY.xray.skin` and `castShadow false`, the members keep the
     base material and their built `castShadow`; in Wireframe the members
     hold the `wallFramingSteel` twin at 0.05; Solid restores all. Keep the
     pure `core` policy row (109–110 and the policy table) — the tier still
     exists for the fallback.
   - `materials.test.js` core-pair tests (125, 161–162, 435–436) stay.
   - Run the wall-detail editor's DOM tests and the `wallPreviewContext`,
     `previewSceneCache`, `previewBatching` tests; nothing there should
     change, but say so.
4. **Perf evidence, in §13.6.** (a) Time `cache.build(buildPreviewScene(...))`
   in the real-THREE test harness on the playground with _every_ straight
   wall re-clad to fiber cement, before and after (median of 5 warm runs),
   and the descriptor count per floor. (b) In the verify script (§7.5 already
   edits a wall's height in X-ray and proves refill by batch identity): add
   the same measurement on the re-clad wall after §7.11 — the batches
   (including the `wallFramingSteel` one) refill in place. (c) A whole-floor
   drag is 15 rebuilds/s; state the per-rebuild cost the members add on the
   playground floor with all walls framed and keep it under 5 ms on the dev
   machine, or memoize `deriveWallFramingMembers` per (wall object, openings
   identity) and say so.
5. **Verify script `scripts/verify-xray-mode.mjs` §7.11, rewritten** (the
   current (a)/(b) assert a `wallCore*` batch and _parity_ with CHB — both
   are the bug now). Same set-up as today (focus mode, `iso_northeast`,
   deselect, `COLUMN_BEHIND_WALL` target, click in the 3D pane, Assembly
   `<select>` → `fiber_cement`, deselect; CHB reference shots first). Then:
   - **(a) structure.** `perf.centers('wall')` holds ≥ 10 entries with
     `sourceId === wall` and `paletteKey === 'wallFramingSteel'`; no entry and
     no `perf.batchMaterials()` row with a `wallCore*` key exists for this
     wall; after the X-ray toggle settles the `wallFiberCement` batch is a
     ghost at 0.14 / `depthWrite false` / `castShadow false` and the
     `wallFramingSteel` batch holds its base material (`ghost === false`)
     with `castShadow` equal to its built value; after a Wireframe toggle the
     `wallFramingSteel` batch is a ghost at 0.05. Programs: the X-ray toggle
     adds none over Solid-after-re-clad; log the Solid delta the re-clad
     itself causes (a framing material family entering a scene that had none
     may link through the existing gate — allow ≤ 2, state the measured value).
   - **(b) studs are revealed — pixel pairs.** For every vertical member of
     the wall (`centers` entries of this wall with `paletteKey
'wallFramingSteel'` whose box is taller than it is wide or deep:
     `size[1] > size[0] && size[1] > size[2]` — studs, kings, trimmers; the
     kind tag is not exposed), project its centre (and ±0.2·height lifts) to
     `P_on`, and the same point shifted along the wall's plan axis by half
     the stud spacing (200 mm; read the axis from the wall's board box) to
     `P_off`. Keep a pair only if, in Solid, both pixels' first `probe` hit is
     a `wallFiberCement` face of this wall, `P_on`'s ray then meets that
     member's mesh, and `P_off`'s ray meets no `wallFraming*` mesh of this
     wall before leaving the wall. Read both pixels (3×3 means) off the Solid
     and X-ray screenshots. Assert: Solid median |ΔP_on − P_off| < 8 (both
     are board), X-ray median |ΔP_on − P_off| > `FRAMED_STUD_CONTRAST_MIN`,
     set from the measured value with margin (the stud is `metal 0xb4bcc2`
     at roughness 0.42 behind a board ghosted to 0.14 — expect a clear step;
     if it measures under ~15, switch the wall's framing to timber through
     the properties panel's framing-material `<select>` (`WallProperties.jsx`
     740–743, value `timber`) and say so rather than lowering the bar). This
     discriminates: with the old core slab both pixels are the same
     ghost-over-ghost and the X-ray median is ≈ 0. Record pair count, both
     medians and the sorted deltas in `verification.json`
     (`metrics.framedWall`).
   - **(c) between the studs the wall still reads like a wall.** Over the
     `P_off` pixels, X-ray vs the same pixels with the wall CHB: median Δ
     < 20 (today's parity idea, kept where it is true).
   - Drop `FRAMED_CORE_ALPHA`, `FRAMED_PARITY_MEDIAN_MAX`,
     `FRAMED_REVEAL_DELTA_MIN` and the header comment at 40–50; write the new
     constants' rationale there. Screenshots `07-solid-framed`,
     `08-xray-framed` plus `09-wireframe-framed`. Every earlier check must
     still pass; §7.8's pick-through stays on the CHB wall it uses today.
6. **Spec and memory text.** Fix §3.11 ("…a schematic core (an undetailed
   framed wall's stand-in slab, §12) ghosts" → every framed wall draws its
   frame; the core is the fallback), the §3.2 `core` row's description, §12's
   closing "open design question" (a `board` tier is still open), and add the
   outcome to §13.6. Fable updates the memory file.

### 13.5 Constraints

- §8 and §12.4 hold: no rebuild on a mode toggle, no `visible` writes, batching
  refill path intact, Solid faces pixel-identical, no new `useEditor()`
  consumer, no commit (the tree carries other uncommitted work).
- No change to the wall detail editor's own pane behaviour (`assemblyDriven`
  → `createWallDetailPreviewProject`, detailed path) beyond what the shared
  builder change implies; smoke-test it and say what you saw.
- Member geometry, ids and metadata come from `buildFramingMemberDescriptors`
  unchanged — the three paths must emit the same members.
- Prettier/ESLint as configured; comments say why; no TypeScript.

### 13.6 Outcome (Opus fills in)

Descriptor counts and build times before/after (§13.4.4), the §7.11 numbers
and thresholds, programs across the re-clad, suite/lint/build results, the
wall-editor smoke test, and every judgment call.

Filled in 2026-11-07 by Opus. Verify harness as §9 and §12.5 (headless Chrome,
ANGLE/D3D11, 1600×1000, `/playground`, Realistic, focus mode,
`iso_northeast`). A dev server was already listening on 5199 and serving this
tree (checked by fetching `objectBuilders.js` from it and finding the new
code), so the runs used it; none was started or stopped.

**The fix as built.** `objectBuilders.js` `buildWallObjects` (the members
block is at 653–665 now; §13.4.1's 633–669 had drifted by a few lines): the
stripped-face gate is gone — every framed wall on the undetailed path draws
`buildFramingMemberDescriptors(…, { includeWhenDisabled: true })` plus its
skins and rainscreen, stripped or not; only a wall that derives no member falls
through to the core slab (block, `coreMaterialKey`, `assemblySide: 'core'`
kept). The detailed path, `buildFramingMemberDescriptors`, the `wallCore*`
palette entries and the `MATERIAL_TIERS` rows are untouched. The call goes
through a small memo, `wallFrameDescriptors` (438–446; see judgment call 1).
Comments rewritten in `objectBuilders.js` (the core-key comment and the members
block), `wallDetailing.js` (`includeWhenDisabled`), `viewMode.js` (the `core`
tier rows and the `GHOST_OPACITY` note) and `objectBuilders.test.js`.

**Descriptors and build times (§13.4.4 a, c).** A temporary vitest bench
(deleted afterwards) on the playground with every straight wall re-clad to
`fiber_cement` (10 walls on "first floor", 12 on "2ndflvor"; the trusses' floor
and the roof have none), real THREE, `cache.build(buildPreviewScene(…))`. Each
figure is the median of five rounds, each round itself a median (cold build:
5 warm runs on a fresh cache after 2 warm-ups; drags: 30 frames after 15 warm-ups
on one cache). "Before" is the shipped §12 code (core slab), emulated by
forcing the member list empty; "after" is the fix, with and without the memo.

|                                                                  | CHB playground    | framed, before        | framed, after (no memo) | framed, after (memo) |
| ---------------------------------------------------------------- | ----------------- | --------------------- | ----------------------- | -------------------- |
| descriptors, first floor / 2ndflvor (of which wall)              | 82 / 86 (41 / 44) | 164 / 174 (123 / 132) | 372 / 402 (331 / 360)   | same                 |
| cold build, outlines on (Shaded)                                 | 16.6 ms           | 22.6 ms               | 28.8 ms                 | 26.9 ms¹             |
| cold build, outlines off (Realistic)                             | 10.7 ms           | 14.7 ms               | 21.4 ms                 | 19.4 ms¹             |
| whole-floor drag frame (2ndflvor, every wall moves), outlines on | 5.13 ms           | 7.08 ms               | 12.91 ms                | **11.74 ms**         |
| same, outlines off                                               | 4.32 ms           | 5.69 ms               | 10.34 ms                | **9.57 ms**          |
| one-wall drag frame (one 2ndflvor wall moves), outlines on       | 3.61 ms           | 4.58 ms               | 8.46 ms                 | **7.10 ms**          |
| same, outlines off                                               | 3.35 ms           | 3.91 ms               | 6.73 ms                 | **6.33 ms**          |

¹ The memo stays warm across the cold runs (same project objects), so the
no-memo column is the honest cold cost.

What the members add per rebuild, with the memo: **+4.66 ms** (whole-floor
drag, outlines on), **+3.88 ms** (outlines off), +2.52 / +2.42 ms (one-wall
drag). Under the 5 ms bar, narrowly in Shaded. Without the memo it was +5.83 /
+4.65 / +3.88 / +2.82 ms. A CPU profile of the whole-floor drag (inspector,
200 frames, before the memo) says where the rest goes: `cache.build` 50 %,
`createObjectForDescriptor` 32 % (of which `createBoxObject` 26 % and the
per-box `new THREE.BoxGeometry` in `taggedBoxGeometry` 17 %), GC 14 %,
`buildFramingMemberDescriptors` 11.8 % (`deriveWallFramingMembers` 8.4 %). So
what is left is mesh construction for ~230 more boxes on the dragged floor, not
the layout: every box still triangulates its own `BoxGeometry` even though the
batch draws it with the shared unit box. Sharing or skipping that geometry for
batched boxes (`previewBatching.js` / `buildPreviewObjects.js`) is the next
lever; out of §13's files, not done.

**§7.11 as rebuilt** (set-up unchanged: focus, `iso_northeast`, deselect,
`COLUMN_BEHIND_WALL`, click in the 3D pane, Assembly → `fiber_cement`, deselect;
CHB reference shots first). Final run, all 15 checks `ok`:

- (a) wall `wall_mmh5igl4_6`: `perf.centers('wall')` holds **38** framing
  entries for it, all `wallFramingSteel` (26 of them vertical), **0** `wallCore*`
  entries, and no `wallCore*` batch row in Solid, X-ray or Wireframe. X-ray:
  the `wallFiberCement` batch (18 instances) is a ghost at 0.14,
  `depthWrite false`, no shadow; the `wallFramingSteel` batch (38) holds its
  base material and casts, as it did in Solid. Wireframe: the stud batch is a
  ghost at 0.05, no shadow. Programs 34 before the re-clad → **34** in Solid
  after it (re-clad Δ 0; ≤ 2 allowed) → 34 X-ray → 34 Wireframe.
- (b) **22 pairs** (P_on on a stud, P_off 200 mm along the wall). Solid median
  |on − off| **0.1** (< 8; deltas 0–2.1, one pair 15.4). X-ray median **63.2**
  (> 45; every pair 35.9–98.1) — the first pair reads [193,194,193] /
  [193,194,193] in Solid and [101,106,109] on the stud vs [156,158,158]
  between in X-ray (rounded).
- (c) between the studs, X-ray against the same pixels with the wall CHB:
  median **9.8** (< 20; spread 1.6–66.4 — the tail was not investigated).
- Refill (§13.4.4 b, a third check): the re-clad wall selected in Solid
  ("first floor · Wall"), Height 2550 → 2295 in X-ray: **52 batches refilled
  in place**, the `wallFramingSteel` batch the same instance before and after
  (×38), programs 34 → 34.
- Screenshots `05-xray-chb`, `06-solid-chb`, `07-solid-framed`,
  `08-xray-framed`, `09-wireframe-framed`; values in `verification.json`
  (`metrics.framedWall`: `rule`, `programs`, `batches`, `pixels` with the
  three sorted delta lists, `refill`).

Thresholds and why they discriminate (both A/B runs were full script runs on
the same server, the source edit reverted straight after and checked with
`cmp`):

- _Old core slab_ (member list forced empty): §7.11(a) FAIL (0 framing
  entries, 9 core entries, a core batch in each mode), (b, c) FAIL (0 pairs),
  refill FAIL (no stud batch); every other check ok.
- _Members built but ghosted in X-ray_ (`wallFramingSteel` moved to the `core`
  tier): (a) FAIL (stud batch "GHOST no shadow"); the X-ray pair median fell
  to **33.7**, not to zero — a 0.07 ghost still carries its 0.5 outlines. That
  run passed (b) against a first bar of 30, so the bar went up to
  **`FRAMED_STUD_CONTRAST_MIN = 45`**: 18 under the fix, 11 over the ghosted
  studs. `FRAMED_SOLID_PAIR_MAX = 8` and `FRAMED_PARITY_MEDIAN_MAX = 20` are
  §13.4.5's values; `FRAMED_MEMBERS_MIN = 10` (§13.4.5's "≥ 10"),
  `FRAMED_PAIRS_MIN = 10` (22 measured), `FRAMED_RECLAD_PROGRAMS_MAX = 2`.
  `FRAMED_CORE_ALPHA`, `FRAMED_PARITY_MEDIAN_MAX`'s old meaning,
  `FRAMED_REVEAL_DELTA_MIN` and the old header comment are gone; the new
  constants carry their rationale in the header.

**Solid unchanged.** The old-core run's `07-solid-framed` against the fix's,
pixel for pixel: mean max-channel difference 0.115 over the frame (0.497 over a
210 × 240 box round the re-clad wall), p99 3 (6), max 29 (27) — the same as two
runs of the fixed code against each other (0.112, 0.486, p99 2 (6), max 31
(28)), which is the progressive renderer's sample noise. Steel at 0.42
roughness was never needed: no timber switch.

**Every other §7 row** in the final run: §7.2 31 → 34 (Δ 3), longest task
0 ms; §7.3 34 throughout, 0 ms; §7.4 draw list 155 / 144 / 144; §7.5 3000 →
2700, 50 batches refilled, 34 → 34; §7.6 worst gaps 7.2 / 7.1 ms, no-clip
1,114 mm; §7.7 Δ 89.0, medians 84 / 31 over 209, background 0.0; §7.8 Column /
Wall; §7.9 `lomboy-iso_northeast-xray.png`; §7.10 786–1084 ms. Within noise of
§9.4 and §12.5.

**Wall-editor smoke test** (a scratch Playwright script, not in the repo):
`/playground`, a wall selected in the plan, Assembly → HardieFlex, "Design
Inside Face" — the wall pane (`data-preview-pane="wall"`) reached `ready`.
Solid: boards and door, as before. X-ray: the boards ghost at 0.14 (two board
batches, 20 and 522 instances) over the solid steel frame (19 members, base
material, casting) with the door opening framed. Wireframe: everything at
0.05 with edges. Solid again: all base. The main model pane stayed Solid
throughout. The console showed one 404 and React duplicate-key warnings for
`WALL.PRODUCT_PROFILE_NOT_FULLY_VERIFIED` / `WALL.JURISDICTION_PROFILE_NOT_VERIFIED`
on that wall; those come from the wall validation list, which reads nothing
from the 3D builder; not A/B-checked against the old code.

**Tests.** `objectBuilders.test.js`: the plywood-assembly test (127) asserts
`wallFramingTimber` members with `wallDetailKind`, `framingKind` and
`wallAssembly` and no `:core`; the pinned fibre-cement wall (585) is re-pinned
to its 19 members (16 studs, two tracks, one noggin; ids
`${wallId}:auto:…:3d`, `wallFramingSteel`, `assemblySide 'core'`, 75 deep, on
the centreline) and its two unchanged boards; the framing-keys test (654) flips;
new: the fallback (one `wallCore*` box per segment, boards kept, steel and
timber, and with a face stripped), the same member ids and geometry across
boarded / one face stripped / both stripped / detailed (704), and the memo
re-deriving when the floor changes under an unchanged wall (726: a door added
brings trimmers and a header, and no stud stands in the doorway; it fails
with the floor dropped from the cache key, checked). Two tests §13.4.3 did not
list pinned the old core and were updated: the rainscreen cassette count (23 →
41, the 19 members) and "moves the core and both skins" (now the frame).
`viewMode.test.js` (388–451): both re-clad walls draw `wallFramingSteel`
source meshes on the batched layer and no `wallCore*` mesh; X-ray: boards hold
the `wallFiberCement` twin at the skin's α with no shadow, members keep the
base and their built shadow; Wireframe: members hold the stud twin at 0.05;
Solid restores all. The pure `core` policy row stays. Wall-detail DOM tests,
`buildPreviewScene`, `exposedWallFrame`, `exposedCeilingBoards`,
`previewSceneCache` (both files) and `previewBatching` tests pass unchanged
(15 files, 239 tests); there is no `wallPreviewContext` test file.

**Suite, lint, build.** `npx vitest run`: 433 files passed, 1 skipped (434);
5,279 tests passed, 1 skipped. `npm run lint`: 0 errors, 42 warnings (none in
the touched files). `npm run build`: clean (the usual chunk-size advisory).
The verify script is also clean under `npx eslint` and Prettier.

**Judgment calls and departures.**

1. **Memo keyed on (wall, floor), around the call.** §13.4.4(c) offered
   memoizing `deriveWallFramingMembers` per (wall, openings identity). The
   members also read the floor's span and slab bands (`resolveWallDetailFrame`)
   and the descriptors its columns (`getWallRenderData`), so an openings-only
   key could go stale on a slab or column edit; the key is the floor object,
   the rule `resolveWallDetailFrame`'s own cache uses. It caches the descriptor
   list, not just the layout, so `buildFramingMemberDescriptors` stays
   untouched (§13.4.1); the detailed path still calls it directly. It hits for
   every floor a drag does not touch, and misses for the dragged floor — about
   a fifth of the added cost saved, as measured above.
2. **The fallback test uses a real case**, no stub: a custom frame with every
   member deleted and detailing switched off derives nothing.
3. **The wall's plan axis** for P_off is read off its own vertical members
   (the two furthest apart), not the board box: `centers()` gives world-aligned
   boxes, which say nothing about a wall at an angle.
4. **P_off tries +200 then −200 mm**: a stud at a wall end has its
   between-stud neighbour on one side only. "Before leaving the wall" is the
   leading run of hits whose `sourceId` is the wall.
5. **The refill measurement is a third check** of §7.11, run last (it edits
   the wall); the wall is selected in Solid, because in X-ray a click on its
   ghost board picks what is behind it.
6. **`06-solid-chb` is still saved** but no longer read; (c) compares X-ray
   shots only.
7. **The bar for (b) is 45, not "~15"**: §13.4.5's hint assumed the old
   core's ≈ 0; the regression it must also catch (ghosted studs, 33.7) sits far
   above that.
8. **The remaining drag cost** (mesh construction) is reported, not fixed:
   it lives in the batching/mesh builders, outside §13.
9. **§12's open question** (a `board` tier so a framed wall reads as clear as
   CHB) stays open; §12.5's call 6 says so. §3.2's `core` row, §3.11 and §9.1
   now describe the core as the fallback.
