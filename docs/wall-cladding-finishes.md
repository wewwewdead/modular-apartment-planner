# Wall cladding & finishes (CL-1 … CL-3)

Spec written 2026-11-10 by Fable from a read of the wall, preview and takeoff
code. Opus 5.5 (high) builds one phase at a time; Fable audits each phase before
the next is handed over. Line anchors were verified against the working tree on
the day of writing — re-check any anchor before relying on it.

## 1. The target

The reference photo (a four-storey apartment block) is made of five things:

| #   | What you see                                            | What it is                                                                  |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Off-white and blue-grey wall fields                     | Painted smooth panels / stucco, one colour per volume                       |
| 2   | Thin dark lines dividing the fields                     | Expressed reveal joints between panels                                      |
| 3   | Orange blocks and bands beside and between windows      | Accent panels: rectangles of a second colour, set out from the window edges |
| 4   | Warm brown horizontal boards on the bay and tower       | Timber plank siding, board-to-board tone variation                          |
| 5   | The cladding runs unbroken past floor lines and columns | An outboard / bypass facade                                                 |

The app already builds 5 (`outboardOffset`, `framingMode: 'bypass'`, the bay
macro, board overhangs) and 2 (the wall detail editor's panel grid with reveal
gaps). It cannot do 1, 3 or 4 at all: a board has exactly one colour, fixed by
its material.

| Phase | Delivers                                                                                                     | Covers |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------ |
| CL-1  | A finish (paint / render / timber stain, any colour, sheen) on every wall face                               | 1      |
| CL-2  | Plank siding as a board material, drawn by the shader, set out on a project datum                            | 4      |
| CL-3  | Accent panels: coloured rectangles on a face, free or attached to an opening; finish schedule in the takeoff | 3      |

Out of scope for all three (listed so nobody builds them by accident): colour on
columns and beams, coloured elevation sheets, parapet copings, colour on the
gable infill (it has its own control).

## 2. Verified code state

### 2.1 The wall model (`src/domain/wallAssemblies.js`)

- `WALL_BOARD_MATERIALS` (:11-16): `none`, `fiber_cement`, `plywood`,
  `rainscreen`. Default thicknesses at :28-42.
- A wall's `assembly` has `interior` and `exterior` board layers, normalised by
  `normalizeBoardLayer` (:107-118) to exactly
  `{material, thickness, layerCount, overhangStart, overhangEnd}`. A masonry wall
  carries the same two layer objects with material `none` (:213-214).
- `deriveWallAssemblyLayers(assembly, length)` (:278-304) is what the plan and
  the 3D builder read: per face `{side, sign, material, thickness, layerCount,
buildUp, centerOffset, overhangStart, overhangEnd, u0, u1}`.
- `boardLayerUSpan` (:135-146) is the one seam for how far a board runs.
- `resolveWallAssembly(wall)` (:252-256) is called per wall per rebuild; arc
  walls lose their overhangs there.

### 2.2 3D (`src/three/scene/objectBuilders.js`, preview folder)

- Material choice is a palette-key string on the descriptor:
  `boardMaterialKey(material)` (:239-243), `panelMaterialKey` (:246-248),
  `rainscreenToneKey(panel)` (:233-237, three corten tones cycled
  `(column + 2·row) % 3`), `fastenerMaterialKey` (:254-259).
- Call sites: plain skins `buildSkinDescriptors` (:337-361, key at :354);
  cassettes `buildRainscreenDescriptors` (:377-404, key at :380); detailed
  panels and fasteners in `buildDetailedWallObjects` (:448-568, keys at :468,
  :494, :520, :559); the wall dispatcher `buildWallObjects` (:570-695) — arc
  walls one prism keyed `'wall'` (:575-591), masonry one box per segment keyed
  `'wall'` (:594-613), framed fallback core + skins (:671-693).
- The preview has **no per-object colour**. Every mesh is
  `materialPalette[descriptor.materialKey]`
  (`buildPreviewObjects.js`: box :267, wall panel :349, prism :201). The roof got
  its colour by mutating shared palette instances
  (`applyRoofAppearanceToPalette`, `materials.js` :633-666), which only works
  because there is one roof per project. Walls are many, so that route is closed.
- Batching (`previewBatching.js`) buckets on material **identity** per floor; a
  material is batchable unless transparent, an array, `ownedByPreviewObject` or
  `fixtureLens` (:187-193). Every distinct material is one instanced draw call
  per floor.
- Descriptor carry-over: `descriptorsEqual` (`buildPreviewObjects.js`
  :1739-1757) compares descriptors structurally, so a material key must be a
  deterministic value — never random, never an object identity.
- See-through modes read a material's tier from
  `MATERIAL_TIERS[material.userData.paletteKey]` (`viewMode.js` :204-207).
  Ghost twins and selection tints are made per source instance
  (`ghostMaterialFor`, `materials.js` :502-531; `selectionMaterials.js`).
- World space is plan space: `planPointToWorld` (`buildPreviewObjects.js`
  :33-35) maps plan `(x, y)` at elevation `e` to world `(x, e, y)` in
  millimetres, with no recentring.

### 2.3 A latent shader bug this work depends on

`proceduralDetail.js` computes the world position the micro-relief is sampled
at as `(modelMatrix * vec4(transformed, 1.0)).xyz` (:104-107). three r183
applies `instanceMatrix` to `mvPosition` and to its own `worldPosition`
(`project_vertex`, `worldpos_vertex`), **not** to `transformed` and not to
`objectNormal`. So on every batched (instanced) box the detail pattern is
sampled inside the unit box — one constant value — and the grain axis is picked
from the un-rotated normal. Nothing in `src` mentions `USE_INSTANCING`. Batched
boxes are most of the model, so Realistic currently shows relief only on
non-batched meshes (slabs, traced panels, roofs).

This was found by reading, not by measurement: CL-1 must confirm it with a
before/after picture and fix it (§5.6). CL-2's course lines are drawn by the
same shader on batched skin boxes and cannot work without the fix.

### 2.4 2D and takeoff

- Plan: `WallRenderer.jsx` fills each board skin from `BOARD_COLORS`
  (:23-27; the `fill=` is in the `wall-board-skin` polygon, ≈ :218).
- Wall detail editor: `faceColor(material)` (`WallDetailEditor.jsx` :352-358),
  used for the panel fill at :3454 and :3473.
- Project elevations (`src/elevations/scene.js`) project wall prisms only; no
  board, joint or colour reaches them.
- Takeoff (`quantityTakeoff.js` :333-383): board area per material, net of
  openings, plus one undifferentiated paint area.
- The board pickers are three hard-coded option lists: `WallProperties.jsx`
  :653-656 and :681-684, `WallDetailEditor.jsx` :2558-2561.

### 2.5 Edits and the store

- A wall property edit is `WALL_UPDATE` on the property-only path
  (`floorplanReducer.js` :1039-1047). Every settled project edit reruns the
  whole-project coordination models (:1962-2001).
- `ColourField` (`PanelKit.jsx` :244) commits on every `input` event of the
  system colour picker. Dragging in the picker is therefore one undo entry and
  one coordination pass per event. The roof colour has this problem today.
- `BEGIN_DRAG_GESTURE` / `END_DRAG_GESTURE` (:1916-1935) make a burst of edits
  one undo step with one coordination pass at the end.
  `docs/state-machines.md` is the registry for that machine.
- Wall colours are reusable from the roof work: `normalizeHexColour`,
  `catalogueColour`, `customColour` and the RAL list in
  `src/domain/roofCoveringCatalog.js` (:316-395).

### 2.6 Siblings read, and the contract they share

Ceilings (`ceilingGeometry.js`), the roof covering (`roofCoveringCatalog.js`,
`RoofCoveringSections.jsx`), the rainscreen path and the board-overhang work all
follow one rule: **a single domain function answers a question, and the plan, the
elevation drawing, the 3D preview and the bill all read it.** Finishes follow
it: `deriveWallAssemblyLayers` carries the finish, and nothing else decides what
a face looks like.

## 3. Design

A face has a **material** (what it is built from: thickness, bill line) and a
**finish** (what you see: kind, colour, sheen). They are separate, because the
photo's orange panel and white panel are the same board.

- The finish lives on the board layer: `assembly.interior.finish`,
  `assembly.exterior.finish`. Masonry walls use the same two layer objects.
- A face with no `finish` key is **stock**: it looks exactly as it does today.
  Every existing wall is stock, so no migration and no schema bump.
- In 3D a finish is a palette material made on demand and found by a
  self-describing key string. Same key, same instance, one draw call per floor.
- CL-2's plank courses are a shader pattern on the same skin boxes — no extra
  meshes.
- CL-3's accents cut the skin into rectangles; each rectangle is a box with its
  own key.

## 4. Data model

```js
// on assembly.interior / assembly.exterior — absent means stock
finish: {
  kind: 'paint' | 'render' | 'timber',
  colour: { hex: '#E0701F', name: 'Signal Orange', catalogue: 'facade' },
  sheen: 'matte' | 'satin' | 'gloss',
}
```

Kinds allowed per face:

| Face                    | Stock looks like   | Kinds offered                   |
| ----------------------- | ------------------ | ------------------------------- |
| `fiber_cement`          | pale sheet         | paint, render                   |
| `plywood`               | raw plywood        | paint, timber                   |
| `rainscreen`            | three corten tones | paint (one colour, joints stay) |
| masonry face            | plaster white      | paint, render                   |
| `none` on a framed wall | no board           | none                            |
| `siding` (CL-2)         | —                  | timber (default), paint         |

Rules:

1. `normalizeBoardLayer` keeps a valid finish and **omits the key** otherwise.
   A stock layer must stay deep-equal to today's output (the `-0` rule at :142
   exists for the same reason).
2. A finish whose kind the face does not offer is dropped on normalisation, so
   changing the board material needs no special handling in the UI.
3. Switching the assembly preset rebuilds the assembly from defaults
   (`WallProperties.jsx` :605) and so clears finishes. That is existing
   behaviour for every other layer field; keep it.
4. Colour is `{hex, name, catalogue}`; hex is `#RRGGBB` upper case. No solar
   absorptance on walls.

## 5. CL-1 — face finishes

### 5.1 `src/domain/wallFinishes.js` (new, pure, no THREE)

- `WALL_FINISH_KINDS`, `WALL_FINISH_SHEENS`, labels for both.
- `WALL_COLOUR_CATALOG`: `facade` (16 swatches below), `timber` (10 below),
  and `ral` re-exported from the roof catalogue. All hexes are approximate
  screen renderings; say so in the file header, as the roof catalogue does.
- `wallFinishKindsFor(system, material)` — the table in §4.
- `normalizeWallFinish(value, system, material)` → finish or `null`.
- `defaultWallFinish(kind, material)` — paint: Warm White matte; render: Bone
  matte; timber: Ipe satin.
- `wallFinishMaterialKey(layer, system)` → `null` for stock, else
  `wallFinish:<kind>:<substrate>:<HEX6>:<sheen>` with substrate one of `fc`,
  `ply`, `cassette`, `masonry` (CL-2 adds `siding` and course fields).
- `parseWallFinishMaterialKey(key)` — the inverse; `null` for anything else.
- `wallFinishHex(layer)`, `wallFinishDrawingTint(hex)` (the hex mixed 60 %
  toward `#f4f1ea`, for drawings that put dimensions over the fill),
  `describeWallFinish(finish)` (`Paint · Signal Orange · matte`).
- `MASONRY_FINISH_COAT = 10` (mm).

Facade swatches: Warm White `#F2EEE4`, Bone `#E4DDCC`, Pale Stone `#D6D2C4`,
Stone Grey `#A9A9A2`, Fog Blue `#AEBBC4`, Slate Blue `#6F8597`, Graphite
`#45494D`, Charcoal `#2F3338`, Signal Orange `#E0701F`, Terracotta `#C4572E`,
Ochre `#C99A3B`, Sand `#CDB991`, Olive `#7C8356`, Moss `#56684A`, Brick Red
`#8E3B2B`, Sky `#8DB3CF`.

Timber swatches: Ipe `#6B4226`, Teak `#A0703F`, Western Red Cedar `#A8643C`,
Merbau `#7A3E24`, Mahogany `#8A4B32`, Narra `#B5763A`, Yakal `#8C6A3F`, Thermo
Ash `#6E4B2F`, Charred `#2B2623`, Weathered Grey `#8C8A84`.

### 5.2 `wallAssemblies.js`

- `normalizeBoardLayer(layer, fallbackMaterial, system)` adds the finish per
  §4 rule 1. Both `createWallAssembly` branches pass their system.
- `deriveWallAssemblyLayers` adds `finish` (or leaves it off) to each layer it
  returns. This is the only place a consumer learns a face's finish.
- `withoutBoardOverhangs` already spreads the layer; confirm finishes survive on
  arc walls.

### 5.3 3D descriptors (`objectBuilders.js`)

- One helper, `layerMaterialKey(layer, system)`:
  `wallFinishMaterialKey(layer, system) || boardMaterialKey(layer.material)`.
  Use it at every call site listed in §2.2. `panelMaterialKey` and the cassette
  path cycle corten tones only when the face is stock; a painted cassette face
  uses its one finish key for every cassette. Tonal fasteners follow the face's
  key.
- Framed walls otherwise build exactly the descriptors they build now. A stock
  wall must produce byte-identical descriptors — the existing tests are the pin.
- Masonry, when at least one face has a finish:
  - the **body** box takes the exterior face's key (or `'wall'`), so end caps,
    jamb reveals and the top of the wall read as the outside colour;
  - an **interior skin** `MASONRY_FINISH_COAT` thick is added when the interior
    face's look differs from the body's, keyed by the interior finish or
    `'wall'`, with `assemblySide: 'interior'`;
  - body thickness is reduced by the coat and the body is shifted outward by
    half of it, so body + skin tile the wall's thickness exactly and both outer
    faces stay where they are today.
  - No finish on either face → the single box, unchanged.
- Arc walls: the prism takes the exterior face's key (or `'wall'`); no skin.

### 5.4 Palette materials (`materials.js`)

- `paletteMaterialFor(palette, key)`: returns `palette[key]` when it exists;
  for a wall-finish key it builds the material, stores it at `palette[key]` and
  returns it; for any other unknown key it returns `undefined` as today.
- Building one: `cloneWithProceduralDetail` of the substrate's stock material
  (`fc` → `wallFiberCement`, `ply` → `wallPlywood`, `cassette` →
  `wallRainscreen`, `masonry` → `wall`), then colour from the hex, roughness
  from sheen (`matte 0.9`, `satin 0.6`, `gloss 0.35`; a render is never below
  0.8), metalness 0, and the detail family: paint keeps the substrate's family,
  render uses a new `render` family (start from
  `{frequency: 0.03, strength: 1.1, grain: 1, roughness: 0.2, albedo: 0.06, mottle: 0.04}`
  and tune by eye against `plaster`), timber uses `timber`.
- `userData`: `paletteKey` = the key, `tier: 'skin'`, `ownedByPalette: true`,
  no `ownedByPreviewObject`. `tierOf` (`viewMode.js`) returns
  `material.userData.tier` when present, else the table lookup.
- `buildPreviewObjects.js`: the box, wall-panel, prism and fastener builders
  call `paletteMaterialFor` instead of indexing the palette.
- `pruneWallFinishMaterials(palette, liveKeys, cap = 48)`: when more than `cap`
  finish materials exist, dispose and delete those whose key is not live, with
  their ghost twin and selection tints. Called from `previewSceneCache.build`
  after the floor loop with the keys in `meshMap`. A colour-picker drag makes
  one material per hex; this is what stops it accumulating.

### 5.5 2D

- `WallRenderer.jsx`: skin fill is `wallFinishHex(layer)` when set, else
  `BOARD_COLORS`. Add `data-finish-kind` to the skin polygon (`stock` when
  none) — the verify script reads it.
- `WallDetailEditor.jsx`: the panel fill is `wallFinishDrawingTint(hex)` when
  the active face has a finish, else `faceColor(material)`. No new editor
  controls in CL-1.

### 5.6 Shader instancing fix (`proceduralDetail.js`)

In `DETAIL_VERTEX_BODY`, apply `instanceMatrix` to position and normal under
`#ifdef USE_INSTANCING` before the model matrix, normalising the normal the way
three's `defaultnormal_vertex` does for non-uniform scale. Bump the cache key
to `…-v2`.

Capture Realistic-style screenshots of the playground before and after. The
expected change is that walls, studs and other batched boxes gain the relief
that slabs already show. If the after picture is worse (noise too strong on
large flat walls), tune the family strengths rather than leaving the bug —
and say what was tuned.

### 5.7 Properties panel (`WallProperties.jsx`)

A `Section id="wall.finishes" title="Finishes"` after Assembly, default open,
with a summary such as `Outside: Paint · Signal Orange`.

- One block per face that can take a finish: both faces of a masonry wall, each
  boarded face of a framed wall.
- Per face: `SelectField` Finish (Stock + the kinds from
  `wallFinishKindsFor`); when not stock, `ColourField` with catalogues
  `facade` + `ral` (`timber` first for the timber kind) and a Sheen select.
- Masonry needs to know which face is outside: show the existing Inside side
  select and Flip button for masonry too.
- `ColourField` gains optional `onPickStart` / `onPickEnd`: start on the first
  picker `input` after the last end; end on the native `change` event and on
  blur. The wall panel wires them to `BEGIN_DRAG_GESTURE` /
  `END_DRAG_GESTURE`. Swatch clicks and hex entry stay ordinary edits. Read
  `docs/state-machines.md` first and add this user of the gesture machine to it.
  Do not wire the roof's colour field in this phase.
- "Apply this finish to": `Whole facade stack` (walls sharing `stackId`,
  disabled when the wall has none), `Matching walls on this floor`,
  `Matching walls in the building`. Matching means same system and same
  material on that face. One action, `WALL_FACE_FINISH_APPLY
{floorId, wallId, side, scope}`, one undo step (`SLAB_PROJECT_BAY` at
  `floorplanReducer.js` :1318 is the precedent for a multi-object single step).

### 5.8 Tests and verification

Unit (vitest):

- `wallFinishes.test.js`: normalisation, kinds per face, key round trip, stock
  → `null`.
- `wallAssemblies.test.js`: a stock layer has no `finish` key and deep-equals
  today's output; a finish survives create → resolve; a kind the face does not
  offer is dropped; arc walls keep finishes.
- `objectBuilders.test.js`: existing cases pass unmodified; a painted exterior
  changes only that face's keys; painted cassettes share one key and stock ones
  still cycle three; detailed panels and tonal fasteners follow; masonry body +
  skin tile the thickness (bounds equal the plain box's) and masonry stock is
  the single box.
- `materials.test.js`: same key → same instance; colour, roughness, tier,
  batchable; disposed with the palette; prune removes only dead keys.
- `viewMode.test.js`: a finish material is skin tier and ghosts.
- `proceduralDetail.test.js`: the compiled vertex source contains the
  instancing block.
- `previewBatching.test.js`: two walls with one finish share a batch; two
  colours make two.
- `WallProperties.dom.test.jsx` and `floorplanReducer.test.js`: the section,
  the dispatches, the gesture bracket, the apply action (one history entry,
  only matching walls, nothing else on them changed).

Guard script `scripts/verify-wall-cladding.mjs`, on `/playground`, following
`scripts/verify-roof-covering.mjs`: select a wall, make it framed if it is not,
set the outside finish to Paint + Signal Orange, assert the plan skin's fill and
`data-finish-kind`, undo once and assert it is stock again, and save 3D
screenshots before and after to `artifacts/floorplan/wall-cladding/`.

Gates: `npx vitest run` shows no failure that is not in the baseline,
`npm run lint` has 0 errors, `npm run build` passes, the guard script passes.

## 6. CL-2 — plank siding (design; brief finalised after the CL-1 audit)

- `WALL_BOARD_MATERIALS.SIDING = 'siding'`, default thickness 19, and on the
  layer `course: {orientation: 'horizontal' | 'vertical', exposure: 140,
joint: 6}`. Default finish timber · Ipe · satin; paint also offered
  (fibre-cement planks).
- The three hard-coded board pickers become one exported option list.
- 3D: no new geometry. The finish key gains the course fields; the detail
  shader gains `uCoursePitch`, `uCourseJoint`, `uCourseAxis`, `uCourseTone`
  (and a board-length stagger). It darkens an antialiased groove at each course
  line, shifts each board's tone by a hash of its index, fades both to their
  average once a board is under a pixel, and tilts the normal at the groove.
  Lines and tone are pattern, not relief: they stay in the Shaded style; only
  the normal tilt follows `detailScale`. Vertical boards run the grain
  vertically.
- Set-out is on a **project datum**, not per wall: horizontal courses fall at
  world elevations `k × pitch`, vertical boards at `k × pitch` along the wall's
  own direction measured from the plan origin. Boards therefore line up around
  corners and from storey to storey with no user effort. The detail editor
  draws the same lines from the same helper.
- Detail editor: a siding face is one field per face (not sheets), cut by
  openings; sheet-size and edge-support checks do not apply; no generated
  fasteners.
- Takeoff: siding area in m² and board length in m (area ÷ pitch), own line.

### 6.1 CL-2 brief (final, 2026-11-10, after the CL-1 audit)

Where this and the design notes above disagree, this section wins.

**Data.**

- `WALL_BOARD_MATERIALS.SIDING = 'siding'`, default thickness 19.
- On a siding layer only: `course: {orientation, exposure, joint}` —
  `orientation` `'horizontal'` (default) or `'vertical'`, `exposure` 40–400
  (default 140), `joint` 0–30 (default 6). Pitch = exposure + joint, the same
  face-plus-gap convention as `RAINSCREEN_MODULE`. Every other layer has no
  `course` key, so non-siding walls stay deep-equal to today's output.
- A siding face always has a look. With no stored finish it is drawn as
  timber · Ipe · satin, and its Finish select has no Stock entry. Kinds
  offered: timber, paint.
- `SIDING_BOARD_LENGTH = 3600` (mm), a domain constant: the shader's butt-joint
  stagger and the bill's board count both read it.

**One option list.** Export the board options (value + label) from
`wallAssemblies.js` and use it in the three pickers (`WallProperties.jsx` ×2,
`WallDetailEditor.jsx` ×1) and in the two `boardMaterialLabel` helpers
(`WallProperties.jsx`, `wallDetailSelectionReadout.js`). Siding gets a stock
plan tint in `WallRenderer.jsx` and a drawing tint in the detail editor for the
case where a caller has no finish to read.

**Key.** A siding key carries its courses:
`wallFinish:<kind>:siding:<HEX6>:<sheen>:<h|v><exposure>j<joint>`, for example
`wallFinish:timber:siding:6B4226:satin:h140j6`. `parseWallFinishMaterialKey`
returns the course as well. Keys for the other substrates are unchanged.

**Set-out helper** (domain, pure; the shader, the detail drawing and the tests
all use these numbers):

- horizontal: a joint centre-line lies at every world elevation `k × pitch`;
  in a wall's own drawing that is `v = k × pitch − frame.base`;
- vertical: a joint centre-line lies wherever `dot(P, d) = k × pitch`, with `P`
  the plan point and `d` the wall's unit direction; in the wall's drawing that
  is `u = k × pitch − dot(bodyWall.start, d)`.

World space is plan space (§2.2), so the shader computes the same thing from
the fragment's world position: `y` for horizontal, and for vertical the dot of
`(x, z)` with the horizontal tangent of the face normal (the sign of the
tangent does not move the lines).

**Shader** (`proceduralDetail.js`; one program for every detailed material, so
all of this sits behind `if (uCoursePitch > 0.0)` — a branch on a uniform, which
keeps the derivatives legal):

- uniforms from `userData.detailFamily`: `coursePitch`, `courseJoint`,
  `courseAxis` (0 horizontal, 1 vertical), `courseTone`, `courseLength`; zero
  for every material that is not siding;
- skip faces whose normal is mostly vertical (`abs(n.y) > 0.5`): a top face
  that lands on a course line would otherwise go dark all over, and the
  tangent is undefined there;
- groove: darken an antialiased band `courseJoint` wide centred on each
  course line (`fwidth` of the course coordinate for the edge);
- butt joints: along the board, a thin groove every `courseLength`, offset per
  course by a hash of the course index so joints stagger;
- tone: multiply the albedo by `1 ± courseTone` from a hash of (course index,
  board-length segment index, the face's plane), so each physical board has
  its own tone and two walls do not show matching rings at the same height.
  Start with `courseTone` 0.22 for timber and 0.03 for paint;
- once a course is under about a pixel, fade grooves and tone to their mean
  rather than letting them alias;
- the groove also tilts the normal, and that part follows `detailScale`;
  grooves and tone do not — they must still show in the Shaded style, where
  `uDetailStrength` is 0, so this code cannot live inside the existing
  `uDetailStrength > 0.0` branches;
- vertical boards stretch the grain noise along world Y instead of along the
  wall.

Bump the program cache key.

**3D descriptors.** No new geometry: siding skins are the boxes
`buildSkinDescriptors` already makes, keyed by the siding key. A stock-path
wall and a detailed one must show the same lines, which they will because the
pattern is in world space.

**Wall detail (`wallDetailing.js`, `WallDetailEditor.jsx`).**

- Grid mode on a siding face: one source rectangle covering the board span ×
  the frame height (a field, not sheets), cut by openings like any panel.
  Custom mode still works; a drawn panel is a field of siding.
- `validateFace`: on a siding face skip the checks that are about sheets —
  panel edge support, stock size, thickness profile, joint system and reveal,
  fastener spacing. Framing checks stay.
- Generated fasteners: none on a siding face. Manual ones still draw.
- The drawing shows the course lines from the set-out helper, as one
  non-interactive path per face clipped to the panel regions, at the drawing's
  hairline weight.

**Properties.** In `WallProperties.jsx`, when a face's board is siding:
Orientation, Exposure and Joint fields under that face's thickness, with a
`Readout` of the pitch and the number of courses over the wall's height.

**Takeoff.** Mirror every place `rainscreenBoard` / `rainscreen_board`
appears (`quantityTakeoff.js`, `ProjectLifecyclePanel.jsx`, any rate table):
siding area in m², net of openings, and board length in m (area ÷ pitch). If a
rate has to be invented, mark it as an assumption the way the catalogue marks
approximate figures.

**Tests.**

- set-out helper: a wall whose base is 300 with pitch 146 has its first line
  at v = 138; vertical lines for a wall that starts off-grid; two walls
  meeting at a corner share their horizontal lines;
- key round trip with a course; non-siding layers carry no `course`;
- materials: a siding material's detail family carries the course uniforms,
  two faces with the same finish and course share an instance, a different
  exposure is a different instance;
- shader source: the course block is outside the `uDetailStrength` branches;
- wall detail: one field in grid mode, no generated fasteners, none of the
  sheet warnings; takeoff numbers for a known wall;
- existing tests pass without edits.

**Guard.** Extend `scripts/verify-wall-cladding.mjs` (or add a sibling): put
plank siding on the outside of a framed wall, then in a front-on view count the
dark course lines along one vertical scan of the wall and assert the count is
within one of height ÷ pitch; repeat in the Shaded style; save close-ups of the
wall and of a corner where two siding walls meet.

**Out of scope for CL-2:** accents, the finish schedule, elevation sheets,
profiles (shiplap, board-and-batten), per-board geometry.

## 7. CL-3 — accent panels (design; brief finalised after the CL-2 audit)

- `assembly[side].accents: [{id, label, u, v, width, height, finish,
anchor: {openingId, du, dv} | null}]`. `v` is measured from the finished
  floor (`datumV`), like a sill height. An anchored accent is placed relative
  to its opening's lower-left corner and follows the opening; `u`/`v` are kept
  as the fallback if the opening is deleted.
- One derivation, `deriveWallFaceRegions(wall, floor, side)`: the face
  rectangle minus openings, split into base regions and accent regions by
  rectangle subtraction (`subtractRectangles` exists in `wallDetailing.js`
  :172-174). 3D skins, detailed panels, the detail drawing and the bill all
  read it.
- Wall detail editor: an Accent tool (drag a rectangle), select / move / resize
  / delete, finish controls, and "Add accent at opening" (left, right, above,
  below, head band, sill band) which creates anchored accents — the photo's
  pattern in a few clicks.
- Takeoff: a finish schedule — area per finish and colour, across the project.

### 7.1 CL-3 brief (final, 2026-11-10, after the CL-2 audit)

Where this and the design notes above disagree, this section wins.

**What an accent is.** A rectangle on one face of a wall that is finished
differently from the rest of that face: the reference photo's orange blocks.
It is the same board in another finish, so it changes no thickness, no board
quantity and no joint.

**Data** — on a board layer, `accents`, omitted when empty (stock rule):

```js
accents: [
  {
    id,
    label,
    u,
    v,
    width,
    height, // mm; u from the wall start, v from the FINISHED FLOOR
    finish: { kind, colour, sheen }, // any kind the face offers; required
    anchor: null | { openingId, du, dv },
  },
];
```

- `v` is measured from the floor datum, like a sill height, so it may be
  negative on a bypass wall. In the wall's drawing the rectangle starts at
  `frame.datumV + v`.
- Anchored: while the wall still has that door or window, the accent's lower-left
  corner is the opening's lower-left corner plus `(du, dv)`, so it follows the
  opening when it moves. `u`/`v` are kept up to date on every edit and are the
  fallback when the opening is gone.
- Limits: at most 64 per face; width and height at least 10; whole millimetres.
- Faces: boarded faces of framed walls, siding and rainscreen included. Not
  masonry and not arc walls in this phase — say so in the panel rather than
  offering a control that does nothing.
- On a siding face an accent keeps the courses: it is the same boards in
  another finish, and its key carries the face's course.
- Default finish for a new accent: paint · Signal Orange · matte (timber · Teak
  · satin where the face does not offer paint).

**One derivation** — new `src/domain/wallAccents.js`, pure:

- `resolveWallAccents(wall, floor, side)` → each accent with its rectangle in
  the wall's own drawing (`u0, u1, v0, v1`, anchors applied, clipped to the
  board span × frame height), `anchorMissing`, and its net area.
- `splitRectByAccents(rect, accents)` → pieces `{rect, accentId | null}` that
  tile `rect` exactly. Where accents overlap, the later one in the list wins.
- Everything that draws or bills a face goes through these two. Memoise per
  wall and floor the way `resolveWallDetailFrame` does (`wallDetailing.js`,
  the `detailFrames` WeakMap).

**3D (`objectBuilders.js`).**

- A face with no accents takes exactly the path and builds exactly the
  descriptors it does now.
- A face with accents, undetailed: the skin becomes boxes placed in the wall's
  u/v on `bodyWall`, the way cassettes and panel fragments already are — the
  face rectangle minus openings, split by `splitRectByAccents`. It must cover
  exactly what the stock skin covers: the run trimmed to the column faces
  (`trimStartAlong` … `trimEndAlong` in the preview context) plus the layer's
  overhangs. Test that the pieces' total area and overall bounds equal the
  stock skin's.
- Detailed faces and cassettes: each rectangular fragment is split the same
  way. A traced (polygonal) panel is not split; it takes the accent whose
  rectangle holds its centroid, if any.
- Keys: `wallFinishMaterialKey({...layer, finish: accent.finish}, system)`.
- Ids are deterministic and only differ from today's when accents exist:
  `<base id>:accent:<accent id>:<n>` and `<base id>:base:<n>`.
- Accent pieces carry `wallDetailKind: 'accent'`, `wallDetailElementId:
accent.id` and `assemblySide`, so the detail editor's selection lights the
  accent in its 3D pane and a click there selects it (the contract
  `readAssemblyPart` in `buildPreviewObjects.js` already implements).

**Wall detail editor.**

- Accents draw over the boards and under the dimensions: fill is the drawing
  tint of the accent's colour, openings cut them, selection follows the
  editor's existing selection styling (colour changes, line weight does not).
- An Accent tool: drag a rectangle to add one. Pick a free shortcut key
  (V, H, P, T, S, N, F, M are taken) and register the tool wherever the other
  tools are registered, `docs/state-machines.md` included if the draw gesture
  is listed there.
- Select, drag to move, delete with the key the other parts use, and exact
  fields in the selection panel: label, from wall start, above floor, width,
  height, finish kind, colour, sheen, and an Attach-to select (None, or one of
  the wall's openings). Moving an anchored accent rewrites `du`/`dv`.
- "Add accent at opening": choose an opening, a placement and a size (default
  600), and it creates an anchored accent —
  Left `[u0−s, u0] × [v0, v1]`, Right `[u1, u1+s] × [v0, v1]`,
  Above `[u0, u1] × [v1, v1+s]`, Below `[u0, u1] × [v0−s, v0]`.
- Accent edits dispatch `WALL_UPDATE {id, assembly}` only, as the finish
  controls do: they must not rewrite thickness or the structural role. A drag
  is one undo step, the way the editor's other drags are.
- A live drag must stay cheap: one wall's skin re-derives, nothing else.

**Properties panel.** In the Finishes section, per face: a readout of the
accent count, "Edit accents" (opens the wall detail editor on that face),
"Clear accents", and "Copy accents to the facade stack" —
`WALL_FACE_ACCENTS_APPLY {floorId, wallId, side, scope: 'stack'}`, one undo
step, which replaces the accents on the same face of the other walls in the
stack with copies that have new ids and no anchor (their resolved `u`/`v`
carry over, which lands them in the same place on an identical wall above).

**Checks** (`validateWallDetail`): a warning for an accent with no visible
area (off the face or wholly inside an opening) and an info for an anchor
whose opening is gone.

**Takeoff.** A finish schedule: one line per distinct finish (kind, colour,
sheen) across the project, in m², no rate, zero lines omitted. A face's own
finish counts its board area less its accents; each accent counts its net
area. Use the same area basis the board lines use, so that for any wall the
schedule lines sum to its finished board area. Masonry faces with a finish
are included by their net face area. Stock faces are not listed.

**Tests.**

- `wallAccents.test.js`: anchors follow an opening and fall back when it is
  gone; clipping; overlap order; `splitRectByAccents` tiles exactly (areas sum,
  no overlap) for nested, overlapping and edge-touching cases; `v` from the
  datum on a bypass wall.
- `wallAssemblies.test.js`: no `accents` key when empty; normalisation and
  limits; an accent whose finish the face cannot carry is dropped.
- `objectBuilders.test.js`: existing cases untouched; area and bounds equal
  the stock skin; accent keys and metadata; deterministic ids; cassettes and
  detailed panels split; siding accents keep the course.
- Editor and panel DOM tests for draw, select, edit, anchor, delete, clear and
  copy; reducer test for the copy action.
- Takeoff: the schedule sums to the finished board area for a known wall.

**Guard** `scripts/verify-wall-accents.mjs`: on a framed wall with a window,
add an accent to the right of the window through "Add accent at opening" and
assert its rectangle in the drawing; move the window 300 mm and assert the
accent moved 300 mm with it; draw a second accent with the tool; check the 3D
preview turned the accent's colour beside the window; undo back to no accents.

**Demonstration picture.** Last, drive the playground in a script (do not
save anything into the demo project) to something like the reference photo:
painted fields in two colours, orange accents beside windows on at least two
storeys, plank siding on one wall. Save Realistic pictures from two angles to
`artifacts/floorplan/wall-cladding/reference-look-*.png`.

**Out of scope for CL-3:** accents on masonry and arc walls, non-rectangular
accents, coloured elevation sheets, colour on columns and beams.

## 8. Rules for every phase

1. Stock walls are untouched: same descriptors, same plan markup, same bill.
2. No `Math.random`, no per-object materials, no material arrays on meshes.
3. One derivation per question; the plan, the drawing, 3D and the bill read it.
4. The preview's cost stays flat: a finish adds at most one instanced draw call
   per distinct finish per floor, and no meshes on framed walls.
5. The working tree holds about 170 uncommitted files from earlier passes. Do
   not revert, reformat or "clean up" anything outside the phase. Do not
   commit.
6. Match the surrounding code: comment density, naming, PanelKit primitives,
   `useNumericDraft`-backed number boxes, British spelling in prose.
7. Report every judgment call and every place the spec turned out to be wrong.

## 9. Judgment calls (the user may overrule)

1. Finish is separate from material, stored on the board layer, stock by
   absence — no migration.
2. Masonry takes the exterior colour on its body and a 10 mm interior skin,
   rather than a skin on both faces, so corners and reveals read as outside.
3. Painted cassettes are one colour; the corten tone cycle is stock only.
4. Plank courses are a shader pattern, not one box per board: a four-storey
   plank wall would otherwise be several hundred meshes, each with collision,
   picking and outline cost.
5. Courses are set out from a project datum so they align across walls.
6. Accents are a layer over the face, not a property of panels, so they work
   on walls nobody has detailed and can follow a window.
7. The shader instancing fix changes how every batched box looks in Realistic.
   That is the look the detail families were written for, but it is a visible
   change the user did not ask for by name.
8. The colour picker is bracketed as a gesture for walls only; the roof's
   field keeps its per-event commits until someone asks.

## 10. Status

### CL-1 — built 2026-11-10 (Opus 5.5 high), audited by Fable the same day — PASS, uncommitted

Audit, on the auditor's own runs: 489 test files / 5878 tests pass (baseline
488 / 5818), lint 0 errors / 40 warnings, build passes, guard 14/14. Read
against the source: stock layers carry no `finish` key, the masonry body and
skin offsets, the instancing block, the key codec, prune, the gesture bracket.
Probed in Chrome beyond the guard: a painted framed wall ghosts in X-ray, the
wall detail editor opens on it with the tinted fill (`#ECBD99` for Signal
Orange) and its classic-palette 3D pane shows the colour; a painted masonry
wall draws. Not run by anyone: sheet stills, prune through the scene cache
past 48 colours. Seen during the probe and not caused by CL-1: the detail
editor's coordination list warns about duplicate React keys when both faces
raise the same check.

What landed:

- `src/domain/wallFinishes.js` (new): kinds, sheens, labels, the `facade` (16)
  / `timber` (10) / shared `ral` catalogues, `wallFinishKindsFor`,
  `normalizeWallFinish`, `defaultWallFinish`, `sameWallFinish`,
  `wallFinishMaterialKey` / `parseWallFinishMaterialKey`, `wallFinishHex`,
  `wallFinishDrawingTint`, `describeWallFinish`, `wallCatalogueColour`,
  `customWallColour`, `MASONRY_FINISH_COAT = 10`.
- `wallAssemblies.js`: `normalizeBoardLayer(layer, fallback, system)` keeps a
  valid finish and omits the key otherwise; `deriveWallAssemblyLayers` carries
  `finish` (omitted on stock). New `withWallFaceFinish`, `wallFacesMatch`,
  `WALL_FINISH_APPLY_SCOPES`, `applyWallFaceFinishToFloors`.
- `objectBuilders.js`: `layerMaterialKey` at every §2.2 call site; finished
  cassettes share one key, stock ones still cycle three; tonal screws follow
  the face; finished masonry = body (outside key) + 10 mm inside skin
  (`<segment>:interior`), stock masonry the single box; arc prism takes the
  outside key.
- `materials.js`: `paletteMaterialFor`, `pruneWallFinishMaterials` (cap 48,
  called from `previewSceneCache.build`), `wallFinishMaterialKeys`,
  `WALL_FINISH_ROUGHNESS`, `WALL_RENDER_MIN_ROUGHNESS`; per-source twin
  disposal. `selectionMaterials.js`: `disposeSelectionMaterialsFor`.
  `viewMode.tierOf` reads `userData.tier` first. `proceduralDetail.js`: new
  `render` family (spec starting values kept — on the playground it reads
  about 1.5× the fine-scale texture of painted plaster, which is the intended
  step, not noise) and the `USE_INSTANCING` block, cache key `…-v2`.
- `buildPreviewObjects.js`: prism, box, fastener and wall-panel builders call
  `paletteMaterialFor`.
- `WallRenderer.jsx`: skin fill = finish hex or stock tint; `data-finish-kind`.
  `WallDetailEditor.jsx`: board fill = `wallFinishDrawingTint` of the active
  face's finish, else `faceColor`.
- `PanelKit.ColourField`: `onPickStart` / `onPickEnd`. New
  `properties/WallFinishesSection.jsx`, mounted after Assembly in
  `WallProperties.jsx` (and in the arc-wall panel, outside face only). Masonry
  now shows Inside side + Flip. Reducer: `WALL_FACE_FINISH_APPLY`.
  `docs/state-machines.md` registers the picker as a gesture opener.
- Guard `scripts/verify-wall-cladding.mjs`; pictures in
  `artifacts/floorplan/wall-cladding/` (`wall-stock`, `wall-signal-orange`,
  `wall-stock-after-undo`; shader `shader-{before,after}-{iso,closeup,closer}`
  with `shader-{before,after}.json` measurements; render/paint probes
  `probe-{render,paint}-masonry-{iso,close}`).

§2.3 confirmed by measurement, not only by reading: on the playground's front
elevation (Realistic), the mean luminance step between neighbouring pixels on
a patch of plain wall went 0.039 → 0.179 (close-up) and 0.124 → 0.275 (closer)
with the fix; the before pictures are perfectly flat. Nothing needed tuning.

Deviations and corrections:

1. §2.5 — `catalogueColour` / `customColour` are not reusable as they stand:
   both return `solarAbsorptance` (and `customColour` falls back to the roof's
   Shale Grey), which §4 rule 4 rules out for walls. Wall equivalents
   (`wallCatalogueColour`, `customWallColour`) were added; `normalizeHexColour`
   and the RAL list are reused.
2. §5.5 vs §8.1 — `data-finish-kind="stock"` on a stock skin is an added
   attribute, so stock plan markup is not byte-identical (fill and geometry
   are). §5.5 was followed because the guard reads it.
3. §5.8 guard — Paint and the swatch are two edits (choosing Paint commits Warm
   White), so one Undo returns Warm White, not stock. The guard undoes each
   step and also drives a five-event picker drag and checks one Undo takes it
   back. The wall is picked in the 3D preview (Iso NW), not on the plan: on the
   playground a 250 mm beam runs over every facade wall and the plan hit test
   ranks beams above walls, so the wall cannot be clicked in plan at all.
4. `normalizeWallFinish` repairs a finish with a valid kind but a bad colour or
   sheen (kind defaults) instead of dropping it, as `normalizeRoofColour` does.
5. `defaultWallFinish(kind)` takes no material argument (nothing in CL-1 reads
   it; CL-2 can add it for siding).
6. The panel writes a finish as a plain `WALL_UPDATE {id, assembly}`, not
   through the panel's general assembly path, which also rewrites `thickness`
   and resets a load-bearing declaration on framed walls.
7. Changing a face's kind starts from that kind's default colour (spec
   defaults), rather than keeping the previous colour.
8. Arc walls get a Finishes section (outside face only), since the prism wears
   the outside key and the arc panel has no Assembly section to follow.
9. "Whole facade stack" applies to every wall with the same `stackId` whose
   face can carry the finish; faces that cannot are left alone, not cleared.
   Matching (floor / building) is same system and same board on that face.

Known warts for CL-2 / CL-3:

- The 2D plan shows finishes only on framed skins in the drafting style;
  masonry walls (a cut fill) and the presentation style show none.
- A framed arc wall's inside finish (reachable only through "apply to
  matching") draws in the plan but not in 3D.
- The detail editor's tonal screw heads keep the stock face tint.
- `hiddenBoardSides` is not applied to the masonry inside skin.
- A stray window pointer-up or blur (`useDragGestureRelease`) can close a pick
  gesture early; the rest of that pick then commits per event.
- The finish key has no course fields yet; CL-2 extends
  `wallFinishMaterialKey` / `parseWallFinishMaterialKey` and the substrate map.

### CL-2 — built 2026-11-10 (Opus 5.5 high), audited by Fable the same day — PASS, uncommitted

Audit, on the auditor's own runs: 490 test files / 5914 tests pass, lint 0
errors / 40 warnings, build passes, siding guard 14/14 (17 course lines counted
in Realistic and in Shaded against height ÷ pitch = 17.47, every line within
8.1 mm of the set-out), CL-1 guard still 14/14. Read against the source: the
set-out helper, the course shader block and where it is injected, the layer
normalisation, the takeoff lines. Probed in Chrome beyond the guard: vertical
boards and painted siding both draw with no console errors. Not run by anyone:
siding in X-ray, in the classic palette pane beyond the one editor picture, and
in sheet stills.

Gates on the builder's runs: `npx vitest run` 490 files / 5914 tests pass (1
skipped), lint 0 errors / 40 warnings, build passes, `verify-wall-siding.mjs`
14/14 and `verify-wall-cladding.mjs` 14/14 against a fresh dev server.

What landed:

- `src/domain/wallSiding.js` (new): `SIDING_BOARD_LENGTH = 3600`, the course
  limits and defaults, `normalizeSidingCourse` (whole millimetres),
  `sidingCoursePitch`, `sidingCourseKey` / `parseSidingCourseKey`
  (`h140j6`), and the set-out — `sidingCourseDatum`, `sidingJointPositions`,
  `wallSidingCourseLines`, `sidingBoardCountAcross`. The properties panel, the
  detail drawing and the tests read it; the shader computes the same thing.
- `wallAssemblies.js`: `WALL_BOARD_MATERIALS.SIDING`, 19 mm default,
  `WALL_BOARD_OPTIONS` + `wallBoardMaterialLabel` (the three pickers and the two
  label helpers read them); a siding layer always has `course` and a finish;
  no other layer has `course`; `deriveWallAssemblyLayers` carries `course`.
- `wallFinishes.js`: siding kinds (timber, paint), `resolveLayerFinish` (the
  default timber · Ipe · satin when nothing valid is stored), the `siding`
  substrate and the course suffix on its key; other keys unchanged.
- `proceduralDetail.js`: `DETAIL_COURSE` (grooves, staggered butt joints, a tone
  per board, distance fade, top/bottom faces masked), the groove bevel in the
  normal chunk, `uCourse*` uniforms (zero unless the family carries a course),
  `applyCoursePattern`, vertical-board grain, cache key `…-v3`.
- `materials.js`: siding substrate (clones `wallPlywood`), timber → timber
  family, paint → fibre-cement family; `SIDING_COURSE_TONE` (0.22 / 0.03) and
  `SIDING_GROOVE_RELIEF` (0.5 mm).
- `wallDetailing.js`: `isSidingFace`; grid mode is one `siding-field`; no
  generated fasteners; the sheet checks skipped (below); the detail takeoff
  orders no stock sheets for a siding face.
- `WallDetailEditor.jsx`: course lines as one non-interactive path per face
  clipped to the panel regions (`.sidingCourses`, the frame hairline); siding
  drawing tint; the picker reads the option list.
- `WallProperties.jsx`: Orientation / Exposure / Joint under a siding face's
  thickness, with Pitch and Courses up (Boards along) readouts.
  `WallFinishesSection.jsx`: no Stock for siding. `WallRenderer.jsx`: siding
  plan tint. `quantityTakeoff.js`: `sidingBoard` rate, `siding_board` (m²) and
  `siding_board_length` (m, with the 3.6 m board count); lifecycle panel label.
- Guard `scripts/verify-wall-siding.mjs`; pictures `siding-{building,corner,
closeup}-{realistic,shaded}.png`, `siding-detail-editor.png`.

Deviations and findings:

1. The siding default finish is written into the normalised layer rather than
   only drawn: every normalised siding layer carries `finish`, so everything
   downstream reads one stored look. "Stock" applied to a siding face resolves
   to that default.
2. Course values are rounded to whole millimetres (they are part of the key).
3. The first bevel was a tilt on the one-pixel antialiased edge of the groove:
   in Realistic every groove caught the sky as a bright line brighter than its
   own shadow, and the guard's line count failed (11–13 of 17). The bevel is
   now a physical chamfer (half the joint, at least 2 mm) at 0.5 mm depth.
4. Checks skipped on a siding face: joint system, express reveal, reveal vs
   support, fastener edge clearance, perimeter spacing, guide spacing, stock
   sheet size, sheet thickness (already fibre-cement only), sheet-edge support.
   Kept: product / jurisdiction markers, application, frame material, stud
   spacing, support width, a manual screw that misses the frame, dimensions.
   Of the kept ones, every product-profile rule is judged against a SHEET
   profile (the face's `productProfileId`): on a default siding face the
   "Fiber-cement board profile is custom assumption" warning fires and names
   fibre cement — wrong for siding, left as is.
5. The guard runs at device scale 2 with the preview in focus mode (a course
   is ~23 px) and counts lines on bands of full-height columns, comparing a
   dip with both sides so a tone step between boards is not a line; it also
   checks each line lands within pitch/6 of `k × pitch`.

Known warts for CL-3:

- The detail editor's takeoff cards (shadow reveal, panel landing) and header
  (product profile) still speak sheets on a siding face.
- The course block draws on any face of a siding box with a horizontal normal,
  so a skin's end caps show set-out too (thin, rarely seen).
- Board tone hashes on the face plane, so two coplanar walls in line share
  tones at the same course; they are, physically, one run of boards.

### CL-3 — built 2026-11-10 (Opus 5.5 high), audited by Fable the same day — PASS, uncommitted

Audit, on the auditor's own runs: 491 test files / 5954 tests pass, lint 0
errors / 40 warnings, build passes, accent guard 15/15, siding guard 14/14,
CL-1 guard 14/14, all on one fresh server. Read against the source:
`splitRectByAccents` (a grid split, so it tiles by construction),
`resolveWallAccents`, and the skin builder, which splits each stock segment's
own rectangle rather than rebuilding the face — so cover is exact without a
separate clip. The demonstration pictures show the intended look. Audit
finding, not fixed: the finish schedule counts each accent's full net area, so
where two accents overlap the hidden part of the lower one is billed as well;
and the face line uses the board lines' height basis while accents use the
resolved frame, which can differ on a bypass wall. Not run by anyone: accents
in X-ray, in sheet stills, on a detailed wall in the live 3D, and
copy-to-stack in the browser.

Gates on the builder's runs: `npx vitest run` 491 files / 5954 tests pass (1
skipped), lint 0 errors / 40 warnings (none in a CL-3 file), build passes;
against one fresh dev server `verify-wall-cladding.mjs` 14/14,
`verify-wall-siding.mjs` 14/14 and `verify-wall-accents.mjs` 15/15.

What landed:

- `src/domain/wallAccentModel.js` (new): the stored shape — `WALL_ACCENT_LIMIT`
  (64), `WALL_ACCENT_MIN_SIZE` (10), `wallFaceTakesAccents`,
  `defaultAccentFinish`, `normalizeWallAccent(s)`. A separate module because
  `wallAssemblies.js` normalises accents and `wallAccents.js` imports
  `wallAssemblies.js`.
- `src/domain/wallAccents.js` (new, pure): `resolveWallAccents` (WeakMap memo
  per wall and floor; anchors, clipping to board span × frame height,
  `requested`, `anchorMissing`, `netArea`, `visible`), `splitRectByAccents`
  (grid cut on accent edges, later wins, then merged along rows and down
  columns), `accentAtPoint`, `ACCENT_PLACEMENTS`, `createAccentAtOpening`,
  `placeAccentAt`, `copyWallFaceAccentsToStack`.
- `wallAssemblies.js`: `normalizeBoardLayer` keeps valid accents, no key when
  empty.
- `objectBuilders.js`: a face with accents becomes u/v boxes on `bodyWall`
  covering the stock skin (column trims and overhangs included) and split by
  the accents; rainscreen cassettes, detailed fragments and the fallback layers
  split the same way; a traced panel takes the accent under its centroid. Keys
  through `wallFinishMaterialKey`, so siding accents keep the course; ids
  `<base>:base:<n>` / `<base>:accent:<id>:<n>`; accent pieces carry
  `wallDetailKind: 'accent'`. A face with no accents builds what it built
  before (pinned by the existing cases).
- `wallDetailing.js`: `WALL.ACCENT_NOT_VISIBLE` (warning) and
  `WALL.ACCENT_ANCHOR_MISSING` (info).
- `quantityTakeoff.js`: the finish schedule, `finish_<kind>_<HEX>_<sheen>` in m²,
  no rate, one line per look; a face's own finish is its board area less its
  accents, on the board lines' basis. Masonry faces by net face area.
- Reducer: `WALL_FACE_ACCENTS_APPLY` (scope `stack`, one undo step).
- `WallFinishesSection.jsx`: per face the accent count, Edit accents (opens the
  detail editor on that face), Clear accents, Copy accents to the facade
  stack; masonry and arc faces get a sentence instead.
  `WallProperties.jsx` passes `onEditAccents`.
- `WallDetailEditor.jsx`: Accent tool (A) and its glyph; accents drawn in their
  drawing tint over the boards, under the dimensions, clipped to the panel
  regions so openings cut them; select, drag (local until release, one
  `WALL_UPDATE {id, assembly}`), Delete; the selection card (label, from wall
  start, above floor, width, height, finish, colour, sheen, attach to); "Add
  accent at opening" (opening, placement, size 600) in an Accent panels
  section. `docs/state-machines.md` lists the tool.
- Tests: `wallAccents.test.js` (new) plus additions to the objectBuilders,
  wallAssemblies, quantityTakeoff, reducer, editor and panel tests.
- Guard `scripts/verify-wall-accents.mjs`; pictures `accents-{before,editor,
after,after-undo}.png`. Demonstration `scripts/demo-wall-cladding.mjs` →
  `reference-look-{iso-northwest,front}.png` (browser only, nothing saved).

Deviations and findings:

1. An accent below the minimum size is clamped up to 10 mm, not dropped; an
   accent whose finish the face cannot carry is dropped.
2. The checks run whether or not the wall is detailed; an accent is a finish,
   not a documentation option.
3. The schedule counts the visible face area, and a face's own line is floored
   at zero when accents overlap past it.
4. Colour in the editor's card is a catalogue select (facade, timber, RAL); no
   free hex there. The panel's colour field is not reused inside the editor.
5. The label field commits per keystroke (each a small undo entry); number
   fields go through `useNumericDraft` as everywhere else.
6. Copy to the stack uses each accent's requested rectangle, not the clipped
   one, so a copy on a taller wall above is not cut short.
7. An accent drag does not snap.
8. "Edit accents" opens the detail editor, which (as before CL-3) records a
   detailing entry in history on open; the guard therefore needs four undos to
   walk from two accents to none (1 → 1 → 1 → 0).
9. The guard picks the wall in 3D (the beam-over-wall plan hit test, CL-1
   deviation 3) and moves the window by clicking its outline polygon on the
   plan; the window's group box centre lands on the slab.

Known warts:

- The wall detail editor throws on a masonry wall (`assembly.framing` is
  null). It predates CL-3; "Edit accents" is not offered on masonry, so the
  panel does not lead there.
- The plan shows no accents (the plan draws a skin as one tint).
- The detail editor's 3D pane updates on release, not during an accent drag.
