# Roof & truss system — industrial accuracy, covering colour, gable closure

Spec for the floorplan workspace's Roof and Truss modes. Written 2026-11-03 by
Fable after reading the code and a research pass; to be built by Opus in three
phases (RT-1, RT-2, RT-3, in that order, each shippable on its own); audited by
Fable against this document after each phase.

All dimensions in this document are millimetres unless a unit is written.

## 1. The problem, in the user's words

> Can we enhance the truss and roof system? We need it to be more accurate and
> more industrial level of tools. I also want to change colour of the roof so I
> can simulate my own idea using this software. And also what tools we need so I
> can cover this roof opening here [screenshot: a gable roof over a two-storey
> > block; the triangle between the top of the end wall and the two roof slopes
> > is open air, the trusses are visible through it; there is no fascia, barge,
> > soffit or gable cladding anywhere].

What the code does today (verified 2026-11-03):

- **Truss model** (`src/domain/trussModels.js`): a `trussSystem` holds
  `trussInstances`; each instance is `{trussTypeId, span, rise, pitch, spacing,
count, bearingOffsets, overhangs, supportMode, …}`. `rise` is the single
  geometric source of truth; `pitch` (percent) is derived
  (`deriveTrussPitchFromRise`). Types: shed, gable, flat, box_gable, hip,
  pyramid_hipped, domed, dropped_eaves. Every profile builder in
  `src/truss/profile.js` returns centre-line `nodes` + `members`
  (`topChord`/`bottomChord`/`web`), a `roofOutline` and `topChordRuns`.
  **No member cross-sections are stored anywhere**; the 3D builder uses
  constants `DEFAULT_CHORD_THICKNESS = 90`, `DEFAULT_WEB_THICKNESS = 60`
  (`src/geometry/trussGeometry.js:23-24`) and draws square boxes on the
  centre-lines (`createSegmentDescriptor`, line 535). Consequences: the bottom
  chord is buried 45 mm into the support beam, the top chord meets the bottom
  chord at a zero-height heel, and purlins pass through the top chord.
- **Gable overhang tails are horizontal.** `buildGableProfile` puts both
  overhang nodes at `z = 0` (`profile.js:232-234, 268`), so the top chord
  runs level past the heel instead of continuing the slope. Shed tails do
  continue the slope (line 293).
- **Web patterns are approximate**: `webPattern.diagonalMode` only chooses
  between a mirrored zigzag ('gable') and an alternating zigzag; there is no
  Fink/Howe/King-post geometry, no gable-end studs, no scissor/raised-heel.
- **Purlins** (`src/truss/purlins.js`, `trussGeometry.js:233`) are sampled on
  the top-chord centre-line and drawn as boxes centred on it, not rotated to
  the slope. `purlinSystem` = `{enabled, spacing, startOffset, endOffset,
overhangStart, overhangEnd, width, depth, material}`.
- **Roof model** (`src/domain/roofModels.js`): ONE `roofSystem` per project:
  `{roofType, trussAttachmentId, pitchSource, attachedShapeProfile,
baseElevation, attachmentOffset, boundaryPolygon, slabThickness (180),
finishSlope, pitch {slope %, direction, ridgeOffset, overhang}, parapets,
drains, roofOpenings, roofPlanes, roofEdges, ridges, valleys, hips}`.
  A roof can only be created from a truss system
  (`createRoofSystemForProject` returns null without an attachable truss;
  `RoofEmptyState` in `RoofProperties.jsx:54`). When attached, roof type,
  slope, direction, ridge offset and boundary are derived from the truss
  (`src/truss/roofAttachment.js`, `deriveRoofStateFromTrussSystem` line 101)
  and the roof base elevation is `truss.baseElevation + roofOutline[0].z +
purlinDepth` (lines 15-21, 38-43).
- **Roof body**: `buildRoofPlaneGeometry` (`src/geometry/roofPlaneGeometry.js:814`)
  gives per-plane outlines and `getSurfaceElevation(point, 'top'|'bottom')`
  where bottom = `baseElevation + rise(point)` and top = bottom +
  `slabThickness` measured **vertically** (lines 916-919). Gable/shed use the
  preset formula (lines 896-912); box_gable/pyramid_hipped/domed/dropped_eaves
  sample `attachedShapeProfile` (`buildProfileDrivenRoofGeometry`, line 565);
  hip uses `buildHipRoofGeometry` (321); custom uses planes. Note the preset
  gable formula measures the ridge rise from the **overhang-offset** outline,
  so an attached gable roof's ridge sits `slope × overhang` above the truss
  ridge (75 mm at 25 % with a 300 overhang) while the eave tip sits on the
  horizontal tail. `normalizeAttachedShapeProfile` (`roofModels.js:97-116`)
  and `sampleShapeProfileRise` (`roofPlaneGeometry.js:228`) clamp rise to
  `≥ 0`, which is what forbids a tail below the heel.
- **3D**: `buildRoofPreviewObjects` (`src/geometry/roof3dGeometry.js:139`)
  emits one `roofMesh` descriptor (per-plane top+bottom faces + vertical
  quads around the outer boundary, `createRoofMeshObject` in
  `buildPreviewObjects.js:206-259`) plus parapets, drains, openings. Material
  is the single palette key `roof` (`materials.js:256`, `0xb4b8bc`, roughness
  0.9, detail family `concrete`). **There is no per-object colour anywhere in
  the preview**: colour is always `materialPalette[descriptor.materialKey]`.
  The roof pseudo-floor's cache key is `{ roofSystem }` only
  (`src/three/scene/buildPreviewScene.js:171`); trusses are in their floor's
  group with `sourceKey.trussSystems` (line 147).
- **Walls** always have flat tops (`resolveWallVerticalSpan`,
  `src/domain/wallFit.js:393`; auto height = lowest crossing beam soffit).
  Nothing in the wall fit, the 3D builders, the elevation scene
  (`src/elevations/scene.js:50 buildWallRects`) or the section scene looks at
  the roof or the trusses. The gable triangle is open in every view.
- **Nothing exists** for fascia, barge, soffit, gutter (only a derived gutter
  LENGTH in `src/roof/drainage.js`), ridge capping, downpipes, gable infill or
  gable vents. The only hook is that roof outline edges are already
  classified (`buildRoofBoundaryEdges`, `src/geometry/roofPlanGeometry.js:117`,
  roles `eave | gable_end | rake_edge | high_edge | low_eave | perimeter`;
  custom roofs: `eave | high_edge | rake`).
- **Quantities**: `quantityTakeoff.js:409-414` sums `roofPlanes` only, so
  preset gable/hip/shed roofs report **0 m² of roofing**. No truss, purlin or
  trim quantities exist. `RoofScheduleSummary.jsx` shows net/projected area,
  parapet and derived gutter length, drains, openings.
- **State/UI**: all mutations go through `ROOF_UPDATE` /
  `TRUSS_SYSTEM_UPDATE` / `TRUSS_INSTANCE_UPDATE` in
  `src/features/floorplan/store/floorplanReducer.js` (lines 540, 587, 628);
  every project update re-runs `syncProjectStructures`
  (`projectStateHelpers.js:11`) = wall heights → truss sync → roof sync →
  canonical building, so normalizers run on every edit and every load.
  `RoofProperties.jsx` and `TrussProperties.jsx` still use the old
  `InputField` pattern; the PanelKit primitives are in
  `components/properties/PanelKit.jsx` (`Section`, `Field`, `NumberField`,
  `SelectField`, `Readout`, `Hint`, `Note`, `Status`).
  Hooks: `useProject()` for project + dispatch, `useEditorState()` for
  selection/mode, `useToolSettings()` for armed tool values; never `useEditor`
  outside SvgCanvas (see memory `project_perf_overhaul`).
- **Persistence**: `CURRENT_SCHEMA_VERSION = 29` (`src/domain/projectVersion.js`);
  migrations are `src/persistence/migrations/migration_N_to_M.js`
  (latest 28→29), auto-registered; unknown fields survive deserialize and
  the normalizers fill defaults on load (`normalizeTrussSystem`,
  `syncRoofSystemAttachment`).

## 2. Research summary → principles

Sources: MiTek AU Roof Truss Installation Manual 2024, MiTek UK Trussed Rafter
Handbook, Simpson Truss Studio hip-set help, Medeek Truss plugin parameter
list, Lysaght Custom Orb / Trimdek / Klip-Lok design guides, NZ MRM Code of
Practice, Monier/BMI tile datasheets, COLORBOND colour pages, RAL Classic
table, Revit / ArchiCAD RoofMaker / Chief Architect docs. The numbers used
below are repeated here so this file stands alone.

1. **A truss is a profile with real members.** Industrial tools define a truss
   by span, pitch (degrees and rise:run), heel height, overhang per side,
   top/bottom chord and web sizes, and a named web pattern
   (King post 2/2, Queen 4/2, Fink 4/3, Howe 4/4, Fan 6/3, Double Fink 6/5,
   Double Howe 6/6 … — "TC panels / BC panels"). Standard heel = top-chord
   depth measured vertically (`depth / cos θ`) above the bottom chord; raised
   ("energy") heels of 100/200/300 are a toggle. The top chord continues the
   slope over the overhang and is plumb-cut at the fascia.
2. **A gable end is closed by a gable end frame** ("raking truss" AU/NZ,
   "gable end frame" US, "spandrel panel" UK): the end truss gets vertical
   studs at ≤ 600 (IRC ≤ 610, NZ 400) under the raking top chord, is sheathed
   and clad, and the cladding laps the wall below. Chief Architect generates
   these "attic walls" automatically whenever a wall stops below a roof plane;
   Revit attaches the wall top to the roof. Gable overhangs are carried by
   outriggers/lookouts over a dropped end truss; verge sprockets or
   cantilevered battens for small (≤ 300) overhangs.
3. **A roof edge is a kit**: fascia (steel 185 × 38; timber 190–230 × 19–25),
   barge/verge board on rakes, eaves lining = boxed soffit (4.5 FC) or raked
   soffit, eave gutter (115 Quad, 150 Half Round, 125 D), downpipes
   (100 × 50, Ø 90/100), ridge capping (girth 350–405), barge capping, apron
   flashings. Revit models them as edge-hosted sweeps picked per edge; Medeek
   as a global "fascia/soffit style" switch (box / gable / angled).
4. **The covering is a product with rules**: cover width, rib height, BMT,
   mass, minimum pitch, maximum batten/purlin spacing, colour range.
   Corrugated 762 cover / 16 rib / 0.42: min 5°, internal support ≤ 1200,
   overhang ≤ 200. Trapezoidal (Trimdek-type) 762 / 29: min 2°, ≤ 1900.
   Concealed-fix (Klip-Lok 700) 700 / 41: min 1–2°, ≤ 2700. Standing seam
   ~305 / 25–38: min 3°. Concrete tile: gauge 295–345 (330), headlap 75–100,
   40–54 kg/m², min 15° sarked / 20° unsarked. Terracotta: gauge 310–330,
   min 20°/25°. Membrane: 2 %. Truss spacing: AU 600/900/1200 (tile roofs
   ≤ 900, sheet ≤ 1200), UK ≤ 600, NZ ≤ 900 heavy / ≤ 1200 light, US 610.
   Eave overhang menu 300/450/600, NZ hard limit 750.
5. **Colour is a catalogue plus a free picker.** COLORBOND core range with
   solar absorptance (SA) and SRI (Surfmist #E4E2D5 SA 0.33 … Monument
   #323233 SA 0.73, Night Sky #000000 0.95); RAL Classic for European metal
   roofs (7016 #373F43, 9005 #0A0A0D, 3009 #703731, 6005 #0F4336 …). NCC
   classes: light SA < 0.40, medium < 0.60, dark ≥ 0.60. Painted steel is a
   dielectric (paint) surface, not a mirror: metalness 0, roughness by finish.
6. **Outputs**: truss layout plan with labels (T1…, GT, HT, J), truss profile
   drawing with span/pitch/heel/overhang/member sizes, cutting list, roof
   covering area and sheet count, trim lengths.

## 3. Scope and phases

| Phase                           | Delivers                                                                                                                                                                                                                                                                                                                                       | Visible result                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| RT-1 Covering, colour, edge kit | `roofSystem.covering` + `roofSystem.trims`; roof colour and trim colours in 3D; fascia, barge, soffit, gutter, downpipes, ridge/barge capping as 3D objects; elevation/section lines for them; covering-rule warnings; roofing quantity fix                                                                                                    | The roof takes the user's colour; eaves and rakes are finished |
| RT-2 Gable end closure          | `trussSystem.endClosures`; gable infill panels (and shed/flat side strips) derived from the end trusses and the roof underside; vents; elevation/section/quantities                                                                                                                                                                            | The open triangle in the screenshot is closed                  |
| RT-3 Industrial truss accuracy  | Member sizes, real heel geometry, sloped overhang tails, named web patterns incl. gable studs, scissor + raised heel, purlins on the chord face and rolled to the slope, truss labels + spacing on the layout plan, truss schedule + cutting list, roof thickness perpendicular to the slope, attached roof follows the chord top face exactly | Trusses look and measure like manufactured trusses             |

Out of scope (say so in the UI only where a user would look for it): structural
design/load checks, plates and connectors, hip girder + jack sets and valley
sets (the existing step-down hip slices stay), attic/room-in-roof and
raised-tie trusses, dormers, per-plane colours on custom roofs, 2D covering
hatches on sheets.

## 4. Data model

Everything new is plain data with defaults filled by the existing normalizers
(`createRoofSystem`/`syncRoofSystemAttachment`, `createTrussSystem`/
`normalizeTrussSystem`, `createTrussInstance`/`normalizeTrussInstance`). RT-1
bumps the schema to 30 with `migration_29_to_30.js` that backfills `covering`
and `trims` unconditionally (keep any stored value); RT-2 and RT-3 add their
fields through normalizer defaults only (no further bump). Add 30 to
`SUPPORTED_SCHEMA_VERSIONS` and a case to `src/persistence/__tests__/migrations.test.js`.

### 4.1 `roofSystem.covering` (RT-1)

```js
covering: {
  kind: 'metal_corrugated' | 'metal_trapezoidal' | 'metal_concealed' | 'metal_standing_seam'
      | 'concrete_tile' | 'clay_tile' | 'slate' | 'shingle' | 'membrane' | 'concrete_slab',
  productId: string,          // key into ROOF_COVERING_CATALOG (below); '' = generic for the kind
  coverWidth: number,         // mm, sheet cover / tile gauge; from the catalog, editable
  ribHeight: number,          // mm; tiles: tile thickness
  thickness: number,          // mm, build-up of the covering layer alone (sheet + rib, or tile + batten)
  finish: 'matte' | 'satin' | 'gloss' | 'unpainted',
  colour: { hex: '#BDBFBA', name: 'Shale Grey', catalogue: 'colorbond' | 'ral' | 'custom', solarAbsorptance: 0.44 | null },
}
```

`ROOF_COVERING_CATALOG` lives in a new `src/domain/roofCoveringCatalog.js`:
one entry per product with `{id, kind, label, coverWidth, ribHeight,
thickness, minPitchDeg, maxSupportSpacing: {single, end, internal}, massKgM2,
maxTrussSpacing}`. Seed at least: corrugated 762/16 0.42 (min 5°, internal
1200, overhang 200) and 0.48 (1700); trapezoidal 762/29 0.42 (2°, 1900) and
0.48 (2600); concealed-fix 700/41 0.42 (2°, 2700); standing seam 305/25
(3°, 1500 [unverified → mark `approx: true`]); concrete tile 330 gauge
(15°, batten 330, 45 kg/m², trusses ≤ 900); terracotta 320 gauge (20°,
50 kg/m²); slate (22.5°); shingle (18.4° std, 9.5° with double underlay);
membrane (2 %, thickness 2); concrete slab (0°, thickness = `slabThickness`).
Flag approximate numbers with `approx: true` and show "≈" in the UI.

`ROOF_COLOUR_CATALOG` in the same file: the COLORBOND list (22 entries, hex +
SA where known, `sa: null` where not) and 20 RAL Classic entries (hex only).
Hexes are approximate sRGB; say so in a comment.

Legacy backfill (migration): flat roofs → `kind 'concrete_slab'`, colour
`#B4B8BC` "Preview grey", finish matte; every other type →
`'metal_corrugated'`, product corrugated 0.42, colour Shale Grey `#BDBFBA`
satin. New roofs created from a truss get the same pitched default.

`slabThickness` keeps its meaning (the roof BODY thickness drawn in 3D and
cut in section). Picking a covering suggests a build-up (a "Use" button, not
automatic): metal = rib height + 50 batten → 66–91; tile = tile 50 + batten
25 → 75; membrane = 2 + 150 deck; slab unchanged. Do not silently change a
stored thickness.

### 4.2 `roofSystem.trims` (RT-1)

```js
trims: {
  colour:  { hex, name, catalogue, solarAbsorptance },   // fascia, barge, gutter, downpipes share it
  fascia:  { enabled: true,  depth: 200, thickness: 25, drop: 0 },  // drop = how far the top of the fascia sits below the roof body underside at the eave (0 = flush)
  barge:   { enabled: true,  depth: 200, thickness: 25 },
  gutter:  { enabled: true,  profile: 'quad_115' | 'quad_150' | 'half_round_150' | 'box_200' | 'none', width: 115, depth: 90 },
  downpipes: { enabled: true, diameter: 90, maxSpacing: 12000 },
  ridgeCap:{ enabled: true,  girth: 350 },
  bargeCap:{ enabled: false, girth: 250 },
  soffit:  { mode: 'boxed' | 'raked' | 'open', thickness: 6, colour: { hex: '#E4E2D5', name: 'Surfmist', catalogue: 'colorbond', solarAbsorptance: 0.33 } },
}
```

Defaults for pitched roofs are as written; for `roofType 'flat'` and
`'custom'` every `enabled` is false and `soffit.mode = 'open'` (flat roofs
have parapets). Ridge cap, barge cap take the **covering** colour.

### 4.3 `trussSystem.endClosures` (RT-2)

```js
endClosures: {
  start: closure, end: closure,         // layout-axis ends (the first / last truss copy)
  spanStart: closure, spanEnd: closure, // span-axis sides; only drawn where the profile is tall there (shed high side, flat trusses)
}
closure = {
  mode: 'infill' | 'open',
  assemblyPreset: 'fiber_cement' | 'plywood' | 'mixed_board' | 'chb',   // WALL_ASSEMBLY_PRESETS, src/domain/wallAssemblies.js
  colour: { hex: '#E9E5DD', name: 'Wall', catalogue: 'custom', solarAbsorptance: null },
  vent: { enabled: false, shape: 'rect' | 'round' | 'triangle', width: 600, height: 300, sillOffset: 300 },
}
```

Default mode is **'infill'** for all four (judgment call: nobody wants an
open gable by default; 'open' is for exposed-truss designs). Panel thickness
= `wallAssemblyThickness(createWallAssembly(preset))`.

Amendment after RT-1 (2026-11-03): the preview has ONE `gableInfill` palette
material, so closure colour is per truss system, not per side: store it as
`endClosures.colour` and drop `colour` from each `closure`. The first truss
system's colour wins when there are several. `resolveRoofAppearance`
(`src/domain/roofCoveringCatalog.js`) must then return
`closures: [{hex}]` from the project's truss systems, and the appearance memo
in `ThreePreviewPanel.jsx` must be keyed on the truss systems too.

### 4.4 Truss accuracy fields (RT-3)

```js
// on trussSystem (all instances in a system share sizes; per-instance override is out of scope)
memberSizes: {
  topChord:    { width: 35, depth: 90 },   // width = across the truss plane (along the layout axis); depth = in-plane
  bottomChord: { width: 35, depth: 90 },
  web:         { width: 35, depth: 70 },
  preset: 'au_90x35' | 'au_90x45' | 'au_120x45' | 'na_2x4' | 'na_2x6' | 'metal_c75' | 'custom',
},
heel: { raised: 0 },                        // raised/energy heel height; 0 = standard heel
labelPrefix: 'T',                           // truss labels T1, T2 …

// on trussInstance
webPatternKey: null,   // null = the truss type's default; see §7.3 for the list
scissorBottomPitchRatio: 0.5,   // only for shape 'scissor'
```

`TRUSS_MEMBER_PRESETS` (new, in `trussModels.js`): au_70x35, au_90x35,
au_90x45, au_120x45, au_140x45, na_2x4 (38 × 89), na_2x6 (38 × 140),
na_2x8 (38 × 184), metal_c75 (C75 × 40 × 1.0: width 40, depth 75),
metal_c100 (C100 × 50 × 1.2). A preset sets all three members (webs one size
down where the family has one: 90 → 70, 2x6 → 2x4).

Derived, never stored: pitch in degrees `θ = atan(rise / run)`, heel height
`= bottomChord.depth + raised + topChord.depth / cos θ`, member lengths.

## 5. RT-1 — Covering, colour, roof-edge kit

### 5.1 Materials and colour in 3D

- Replace the single `roof` palette key with a family keyed by covering kind:
  `roof_metal` (surface, roughness 0.5, detail family `metal`),
  `roof_tile` (surface, 0.85, family `concrete`), `roof_membrane` (surface,
  0.6, family `smooth`), `roof_slab` (= today's `roof`: 0.9, `concrete`).
  Keep the `roof` key as an alias of `roof_slab` so nothing else breaks
  (`CLASSIC_SURFACES` and `DETAIL_ASSIGNMENTS` in `materials.js`).
- New keys: `roofTrim` (surface 0.55, family `smooth`), `roofSoffit`
  (surface 0.88, `plaster`), `roofRidgeCap` (same recipe as `roof_metal`),
  `gableInfill` (surface 0.8, `fibreCement`), `roofGutter` (= `roofTrim`),
  `roofDownpipe` (= `roofTrim`). Add every key to `DETAIL_ASSIGNMENTS` and
  `createMaterialPalette`; give `CLASSIC_SURFACES` the same colours so the
  wall/ceiling detail editors stay unchanged.
- **Colour application is a runtime palette mutation**, the way
  `applyGroundColor` / `applyWindowGlow` already mutate materials in
  `createPreviewViewport.js:1077-1110`. Add `applyRoofAppearance(appearance)`
  to the viewport (`appearance = {covering: {kind, hex, finish}, trims: {hex},
soffit: {hex}, closures: [{hex}]}` derived from the project in
  `ThreePreviewPanel.jsx` next to the render-style handling) that sets
  `color.setHex`, `roughness` (matte 0.75, satin 0.5, gloss 0.3; unpainted →
  switch the material to `metalness 1`, roughness 0.4) on `roof_*`,
  `roofRidgeCap`, `roofTrim`, `roofGutter`, `roofDownpipe`, `roofSoffit`,
  `gableInfill`, and sets `needsUpdate` only when metalness flips. One roof
  per project is why this is enough; it never rebuilds or recompiles and
  batching keeps working. Call it on every project change (cheap) and once
  after the palette is created, before the first frame.
- `roof3dGeometry.js` chooses `materialKey` from `covering.kind`
  (`metal_* → roof_metal`, `*_tile | slate | shingle → roof_tile`,
  `membrane → roof_membrane`, `concrete_slab → roof_slab`).
- Sheet profile relief (stretch, do last): `proceduralDetail.js` gets a
  `sheet` family that adds a sinusoidal normal ripple at the rib pitch
  (`coverWidth / 10` for corrugated) along the slope direction, scaled like
  the other families (zero in Shaded). If this costs more than an hour, leave
  `metal` and note it in the hand-back.
- Save image, Realistic/Shaded, Night, Walk: nothing to do; they read the
  palette.

### 5.2 Roof-edge kit geometry (`src/roof/roofEdgeKit.js`, new)

`buildRoofEdgeKitObjects(roofSystem, roofGeometry, context)` returns
descriptors appended by `buildRoofPreviewObjects`. `context = {trussSystem |
null, bearingOutline}` where `bearingOutline` is the plan polygon of the
supporting structure: for an attached roof the rectangle from
`collectSystemCopyBearingPoints` + the layout range (`src/truss/systemPlanAxes.js`),
for a detached roof the `boundaryPolygon` before the overhang offset. The
overhang band = `roofOutline` minus `bearingOutline`.

Edges come from `buildRoofBoundaryEdges(roofSystem)` with their roles.

| Object                         | Where                                                                                                                                                                                                  | Geometry                                                                                                                                                                                                       | Elevation rule                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fascia                         | `eave`, `low_eave`, `high_edge` edges                                                                                                                                                                  | `segment3d`, cross-section `{height: fascia.depth, width: fascia.thickness}` run along the edge, outer face flush with the roof edge                                                                           | top = roof body **underside** at the edge − `fascia.drop`; the box hangs down from there |
| Barge board                    | `gable_end`, `rake_edge`, `rake` edges                                                                                                                                                                 | `segment3d` with sloped start/end (`start.y`/`end.y` from `getSurfaceElevation(point,'bottom')` at each end), `up` = world up                                                                                  | same as fascia, following the rake                                                       |
| Gutter                         | every fascia edge                                                                                                                                                                                      | `segment3d` box `{height: gutter.depth, width: gutter.width}` hung on the fascia's outer face, top 20 below the roof top edge                                                                                  | horizontal                                                                               |
| Downpipes                      | at the plan positions `buildDerivedRoofDrainage` (`src/roof/drainage.js`) already derives for outlets; if it only derives counts, place one at each end of every gutter run and one every `maxSpacing` | `cylinder` (reuse the fixture cylinder path or a `box` of `diameter × diameter`) from gutter underside to the ground floor elevation + 150                                                                     | vertical                                                                                 |
| Ridge capping                  | each `ridges[]` segment                                                                                                                                                                                | two `segment3d` strips, one per plane, width `girth / 2`, height 8, lying ON the roof top surface with `up` = that plane's normal                                                                              | follows the ridge                                                                        |
| Barge capping (off by default) | rake edges                                                                                                                                                                                             | one strip on the top surface along the edge, `up` = plane normal                                                                                                                                               | follows the rake                                                                         |
| Soffit `boxed`                 | overhang band on fascia edges                                                                                                                                                                          | `prism` of the band polygon (clip the band to the strip behind each fascia edge: `clipPolygonToAxisBand` in `roofPlaneGeometry.js` is the tool), height `soffit.thickness`, at the fascia **bottom** elevation | horizontal                                                                               |
| Soffit `raked`                 | same band                                                                                                                                                                                              | `roofMesh` with one surface whose vertices carry `topElevation = bottomElevation + thickness` from `getSurfaceElevation(p,'bottom') − ε`                                                                       | follows the slope                                                                        |
| Soffit `open`                  | —                                                                                                                                                                                                      | nothing                                                                                                                                                                                                        | —                                                                                        |

`segment3d` gets an optional `up: {x,y,z}` (world) in the descriptor;
`createSegment3DObject` builds the quaternion from the basis `(dir, up × dir,
up)` when `up` is present and keeps today's `setFromUnitVectors` path when it
is absent. RT-3 reuses this for members and purlins.

Every descriptor: `kind: 'roofSystem'`, `metadata.sourceId = roofSystem.id`,
`metadata.part = 'fascia' | 'barge' | 'gutter' | 'downpipe' | 'ridgeCap' |
'bargeCap' | 'soffit'`, deterministic ids
(`${roof.id}-fascia-${edgeIndex}`), bounds filled. Clicking any of them lands
on "Roof" in the inspect card; add a "Trims" row to `rowsForObject` for
`roofSystem` listing what is enabled.

Corners: fascia/barge/gutter runs may simply overlap at corners (each box
extended by half its thickness past the edge end); mitres are out of scope.

### 5.3 2D

- Elevations (`src/geometry/roofElevationGeometry.js`): add fascia and barge
  as thin filled rectangles/parallelograms under the roof silhouette and the
  gutter as a line pair; style keys `roofFascia`, `roofGutter` in
  `ElevationSceneLayer.jsx`. Downpipes as vertical double lines; soffit not
  drawn.
- Sections (`src/sections/roofGeometry.js`): fascia and gutter cut
  rectangles at an eave crossed by the cut, category `roofTrim`.
- Plan: nothing new (the roof outline already is the fascia line). The
  roof plan's tags may add the covering name next to the slope tag.

### 5.4 Properties UI (`RoofProperties.jsx`)

Add two PanelKit `Section`s to `RoofSystemProperties` (existing fields may
stay as they are; do not convert the whole panel):

- **Covering** (`id: 'roof-covering'`): `SelectField` Kind; `SelectField`
  Product (filtered by kind, "Generic" first); `NumberField`s Cover width,
  Rib height, Build-up (mm) with a "Use suggested" button; `SelectField`
  Finish; **ColourField** (new shared primitive in PanelKit:
  `<input type="color">` + hex text exactly like `RoomProperties.jsx:38-62`,
  plus a swatch strip of the catalogue with a Colorbond/RAL toggle; picking a
  swatch fills hex, name, catalogue, SA; typing a hex sets `catalogue:
'custom'`, `name: hex`). `Readout`s: Solar absorptance (and its NCC class
  light/medium/dark), Mass (kg/m² × projected area ⇒ t), Sheets (ceil(true
  area / (coverWidth × sheet length along the slope)) — show "≈ n sheets"),
  Min pitch. A `Status tone="warning"` when `pitch° < minPitchDeg`, when the
  attached truss's purlin spacing > `maxSupportSpacing.internal`, or when the
  truss spacing > `maxTrussSpacing` (tile). These are advice, never blocking.
- **Edges & trims** (`id: 'roof-trims'`): ColourField Trim colour; a
  checkbox row per trim (fascia, barge, gutter, downpipes, ridge cap, barge
  cap) with its sizes behind a `reveal`; Soffit mode select + thickness +
  ColourField.

Pitch is shown as `%` **and** degrees everywhere the roof or truss panel
shows a slope (readout `25 % · 14.0°`); the input stays in % for the roof
(no behaviour change) and RT-3 adds a degrees input for the truss.

### 5.5 Quantities

- `quantityTakeoff.js`: `roofingAreaM2` = `buildRoofScheduleSummary(roof).netAreaM2`
  for preset roofs (keep the plane sum for custom). Add items `fasciaLm`,
  `bargeLm`, `gutterLm`, `downpipeCount`, `ridgeCapLm`, `soffitM2` with rate
  keys and the category `roof`; `RoofScheduleSummary` shows them as cards.

### 5.6 Tests and verification (RT-1)

- `roofCoveringCatalog.test.js`: every product has the required fields;
  min pitch and spacings are numbers; colour hexes match `/^#[0-9A-F]{6}$/`.
- `roofModels.test.js`: `createRoofSystem` fills `covering`/`trims`
  defaults; legacy input without them normalizes; flat roofs get trims off.
- `migrations.test.js`: 29→30 backfills and keeps stored values.
- `roofEdgeKit.test.js`: a 10 × 8 m attached gable roof with 300 overhangs
  yields 2 fascias, 2 gutters, 2 barge boards per gable (4), 2 ridge strips,
  boxed soffit prisms whose outline area ≈ 2 × 10.6 m × 0.3 m, elevations of
  fascia tops equal the roof underside at the eave; shed roof gets a
  high-edge fascia; flat roof gets nothing.
- `materials.test.js`: new keys exist in both looks; `applyRoofAppearance`
  sets the hex on every roof key and leaves `wall` alone.
- `RoofProperties.dom.test.jsx` (new): the Covering section renders; picking
  a swatch dispatches `ROOF_UPDATE` with `covering.colour.hex`.
- `scripts/verify-roof-covering.mjs` (Playwright; recipe: channel 'chrome',
  headless, `/playground`; when run from the scratchpad use `createRequire`
  and `MSYS_NO_PATHCONV=1`): open the playground project, Roof mode, set the
  colour to Manor Red, assert the 3D preview root carries
  `data-roof-colour="#5E1D0E"` (add that attribute to the preview root in
  `ThreePreviewPanel.jsx`, it is the cheapest honest hook), save a screenshot
  of the preview to the scratchpad for the audit, toggle fascia off and
  assert the roof inspect card's Trims row changes.

## 6. RT-2 — Gable end closure

### 6.1 Geometry (`src/truss/endClosures.js`, new)

For each truss system with `endClosures`, `buildEndClosureObjects(trussSystem,
systemGeometry, roofSystem | null)`:

1. Pick the end copies: among all instances' copies, the copy with the
   minimum layout-axis value (`projectPointOntoAxis` against
   `resolveSystemPlanAxes`) is `start`, the maximum is `end`. Hip-shaped
   instances (`shape 'hip'`) are skipped (their end slices are flat; the hip
   planes close them).
2. Closure polygon in the copy's local frame (x along the span from the
   start bearing, z up from `trussSystem.baseElevation`):
   - bottom edge: z = 0 from x = `firstStructuralX` to `lastStructuralX`
     (the bearing points, i.e. nodes with `kind !== 'overhang'`);
   - top edge: for each structural top node and at 150 mm steps in between,
     z = roof body underside at that plan point − baseElevation when a roof
     is attached (`buildRoofPlaneGeometry(roof).getSurfaceElevation(p,
'bottom')`), else the profile `roofOutline` z (RT-3 makes this the chord
     top face). Drop the closure when its height < 50 everywhere.
   - `spanStart`/`spanEnd` strips: rectangle along the layout axis between
     the first and last copy, from z = 0 to the profile's end-node z at that
     side (the shed high end, flat truss depth); skip when < 50.
3. Panel: new descriptor `geometry: 'verticalPolygon'` = `{plane: {origin,
xAxis (plan unit vector), up}, points: [{x,z}…], thickness, holes:
[[{x,z}…]]}` centred on the end copy's plan line, thickness from the
   assembly preset, `materialKey: 'gableInfill'`, `kind: 'trussSystem'`,
   `metadata.sourceId = trussSystem.id`, `metadata.trussSystemId`,
   `metadata.part = 'endClosure'`, `metadata.side`. `createVerticalPolygonObject`
   builds it with `THREE.Shape` + `ExtrudeGeometry` (depth = thickness,
   bevel off), positions it with `planPointToWorld`, rotates to the plan
   axis, calls `addOutline`. One draw call each; there are at most four.
4. Vent: when enabled, a hole in the shape (rect/round/triangle) centred on
   the span midpoint at `sillOffset` above the bottom edge, and a recessed
   box 50 deep behind it with `materialKey: 'fixtureAccentDark'`.
5. Phase: closures inherit the truss system's `phaseId` (they are part of
   its objects, so `filterProjectByPhase` already handles them).

Cache rule: the floor group that holds the truss system reads the roof, so
add `roofSystem: project.roofSystem` to that floor's `sourceKey` in
`buildPreviewScene.js` (next to `trussSystems`). Without it the closure goes
stale when the roof slope changes.

### 6.2 2D

- Elevations: `buildTrussElevationElements` gains filled polygons for each
  closure facing the viewer (category `gableInfill`, drawn before the truss
  lines so an 'open' end still shows the members); style key in
  `ElevationSceneLayer.jsx`. Vents as a hollow rect.
- Sections: a cut band where the cut crosses an end copy's plane
  (`category 'wall'`-like fill, id `closure-…`).
- Plan: a thick line on the end copy's layout line, like a wall, in Truss
  mode only.

### 6.3 UI (`TrussProperties.jsx`, system panel)

PanelKit `Section` **Gable ends** (`id: 'truss-end-closures'`): for each of
`start`/`end` (labelled "End A", "End B", matching Support A/B wording already
used) a mode select (Infill / Open), assembly preset select, ColourField,
vent toggle + shape + width + height. `spanStart`/`spanEnd` rows appear only
when the geometry says they are drawn ("High side", "Low side"). `Readout`:
closure area m² (sum). A `Hint` when the system has no attached roof: "Top
edge follows the truss top chord; attach a roof for the finished underside."

### 6.4 Quantities

`gableInfillM2` (area × 1 per side, vents subtracted) in `quantityTakeoff`
and in the inspect card of the truss system.

### 6.5 Tests and verification (RT-2)

- `endClosures.test.js`: gable 7200 span / 1800 rise / 300 overhangs / 5
  copies at 900 → two closures, polygon from x 0…7200, apex z ≈ 1800 (+ the
  roof build-up when attached), area ≈ 6.48 m² (+), spanStart/spanEnd
  absent; shed → start/end right triangles + a high-side strip of height
  `rise` and length `4 × 900`; flat (depth 900) → four strips; hip → none;
  vent hole subtracts its area; `mode 'open'` → nothing.
- `buildPreviewObjects.test.js`: a `verticalPolygon` descriptor becomes a
  mesh with outline, and its bounds match.
- `previewSceneCache.test.js`: changing `roofSystem.pitch.slope` rebuilds
  the floor that holds the truss system.
- Elevation test: the front elevation of the fixture project contains a
  `gableInfill` polygon whose apex equals the roof ridge underside.
- `scripts/verify-gable-closure.mjs`: playground, Truss mode, End A set to
  Open then back to Infill, assert the truss inspect card (click the panel
  in 3D) reports "End A: Infill · fibre cement"; screenshots of the 3D
  preview from the Front preset before/after for the audit.

## 7. RT-3 — Industrial truss accuracy

### 7.1 Member geometry (profile.js + trussGeometry.js)

Truss-local frame: x along the span from the start bearing, z up from the
bearing surface (`trussSystem.baseElevation`). Let `bc`, `tc`, `wb` be the
member depths, `θ_run` the slope angle of a top-chord run, `h_r` the raised
heel.

- Bottom chord centre-line at `z = bc / 2`; its bottom face sits on the
  bearing. Bottom-chord nodes get `z = bc / 2`.
- Top-chord **underside** line: `u(x) = bc + h_r + line(x)` where `line(x)`
  is today's profile line (0 at the heels, `rise` at the ridge, the existing
  shape rules for box_gable/pyramid/domed/dropped_eaves/hip slices
  unchanged). Top-chord centre-line (where nodes go): `u(x) + tc / (2 cos
θ_run)`. Top-chord **top face**: `u(x) + tc / cos θ_run`.
- Overhang tails continue the run: for the start tail `u(−o) = bc + h_r −
o · tan θ_run`; the tail node kind stays `'overhang'`. Shed/flat/all
  shapes use the same rule (shed already slopes; flat tails are level).
- `h_r > 0` adds a vertical `heel_stud` member at each heel from the
  bottom-chord node to the top-chord node above it.
- `rise` keeps its stored meaning (the underside line's rise over the run),
  so no migration and no change to the rise↔pitch coupling.
- Members: `createSegmentDescriptor` reads `memberSizes` → `crossSection
{height: depth, width}` and sets `up` = the truss plane's in-plane
  perpendicular to the member (so depth is in the plane, width across it).
  Member ends are square (plumb/seat cuts are out of scope); overlaps at
  joints are fine.
- Readouts: heel height, pitch °, overall height (ridge top face),
  out-to-out length (span + overhangs), member lengths.

### 7.2 Attached roof follows the chord top face

- `getTrussRoofAttachmentElevation` = `baseElevation + bc + h_r + tc / cos
θ_heel + (purlins ? purlinDepth / cos θ_heel : 0)` evaluated at the start
  heel (`x = 0`).
- `buildAttachedRoofShapeProfile` emits **signed** rise = (top face z at the
  node, plus purlin depth / cos θ) − (the same at `x = 0`), tails included.
  Remove the `≥ 0` clamps in `normalizeAttachedShapeProfile`
  (`roofModels.js`), `sampleShapeProfileRise` and `resolveShapeProfilePeakBand`
  (`roofPlaneGeometry.js`). `maxRise` stays the max.
- Attached roofs of **every** type except `hip` and `custom` go through
  `buildProfileDrivenRoofGeometry` (today only four shapes do). Detached
  gable/shed keep the preset formula. This removes the `slope × overhang`
  ridge discrepancy noted in §1 and makes the eave drop with the tail.
- Roof body thickness becomes **perpendicular** to the plane: in
  `getSurfaceElevation` top = bottom + `slabThickness / cos θ_plane` (preset
  gable/shed: θ from `pitch.slope`; profile-driven: per segment; hip: per
  plane; flat: unchanged). The section and elevation builders read
  `getSurfaceElevation`, so they follow; verify `buildRoofSilhouettePolygon`
  does and fix it if it recomputes thickness itself.

### 7.3 Web patterns (`src/truss/webPatterns.js`, new)

`WEB_PATTERNS` keyed by `webPatternKey`, each `{label, families: [...],
build(metrics) → {topFractions, bottomFractions, webs: [[nodeRef, nodeRef]…]}}`
where node refs are `t<i>` / `b<i>`. `profile.js` uses the pattern instead of
`panelCount`/`diagonalMode` when an instance has `webPatternKey` (or the type
default); the old `webPattern` stays as the fallback for shapes without a
named pattern (box_gable, pyramid_hipped, domed, dropped_eaves, hip slices keep
`buildProfileFromStructuralOutline`).

Symmetric gable patterns (S = span; fractions of S):

| Key                          | TC nodes                 | BC nodes        | Webs                                                                                         |
| ---------------------------- | ------------------------ | --------------- | -------------------------------------------------------------------------------------------- |
| `king_post`                  | 0.5                      | 0.5             | b0.5–t0.5                                                                                    |
| `queen_post`                 | 0.25, 0.5, 0.75          | 0.25, 0.75      | b0.25–t0.25, b0.75–t0.75                                                                     |
| `fink` (default for 'gable') | 0.25, 0.5, 0.75          | 1/3, 2/3        | zigzag t0.25–b1/3–t0.5–b2/3–t0.75                                                            |
| `howe`                       | 0.25, 0.5, 0.75          | 0.25, 0.5, 0.75 | verticals at 0.25/0.5/0.75 + t0.25–b0.5, t0.75–b0.5                                          |
| `fan`                        | 1/6…5/6                  | 1/3, 2/3        | b1/3–{t1/6, t2/6, t3/6}, b2/3–{t3/6, t4/6, t5/6}                                             |
| `double_fink`                | 1/6…5/6                  | 1/5…4/5         | zigzag t1/6–b1/5–t2/6–b2/5–t3/6–b3/5–t4/6–b4/5–t5/6                                          |
| `double_howe`                | 1/6…5/6                  | 1/6…5/6         | verticals at every sixth + diagonals toward the ridge from b1/6→t2/6, b2/6→t3/6 and mirrored |
| `gable_studs`                | every 600 from each heel | same x          | verticals only (gable end frame)                                                             |

Mono (shed): `mono_howe` (verticals at each quarter + diagonals rising toward
the high end), `mono_fan` (today's). Flat: `warren` (today's alternating),
`pratt` (verticals + diagonals toward the centre). New shape `scissor`
(family gable): bottom chord rises to `rise × scissorBottomPitchRatio` at
mid-span with a `fink` web layout computed against the pitched bottom chord.
Add `truss_type_scissor` to `DEFAULT_TRUSS_TYPE_DEFS` and `'scissor'` to
`TRUSS_SHAPES`/attached roof types (its attached roof is a plain gable).

End copies of a system whose closure mode is `infill` are drawn with
`gable_studs` automatically (the gable end frame); the pattern is not stored
on the instance. The 2D truss detail view draws the selected copy, so
selecting an end copy shows the studded frame.

### 7.4 Purlins / battens

- Attachment points move to the top-chord top face: sample the chord run,
  then offset along the run normal by `tc / 2 + purlinDepth / 2`; purlin
  boxes get `up` = the run normal (rolled to the slope). Roof underside =
  purlin top face (§7.2 already adds `purlinDepth / cos θ`).
- `purlinSystem.role: 'purlin' | 'batten'` (label only; default by covering
  kind: tile → batten). A **"Suggest from covering"** button sets spacing to
  the catalogue's internal max (sheet) or gauge (tile) and size to 75 × 50
  (sheet) / 50 × 25 (tile). Never automatic.

### 7.5 Layout plan, labels, schedule, cutting list

- Labels: `trussSystem.labelPrefix` + instance index (T1, T2 …); end copies
  with an infill closure read `GE`; hip slices `H1…`. `TrussRenderer.jsx`
  draws the label at each copy's plan midpoint (plan view, Truss mode, and
  on sheets through the same scene) and a spacing note on the layout line
  ("5 @ 900 = 3600"). Keep text out of `PLAN_CANVAS_ANNOTATIONS` suppression
  logic (that suppresses derived DIMENSION figures; labels are object tags).
- Truss detail (`buildTrussDetailDimensions`): add heel height, overall
  height and member size tags (`90 × 35 TC`), and draw members with their
  depth (two parallel lines) instead of a single stroke, hairline weights per
  memory `wall-detail-dimension-rendering`.
- **Truss schedule** (`src/truss/trussSchedule.js` + `TrussScheduleSummary.jsx`
  in the system panel, modelled on `RoofScheduleSummary`): per instance —
  label, type, pattern, qty, span, pitch (° and %), rise, heel, overhangs,
  spacing, TC/BC/web sizes; totals — truss count, timber length per section
  (m), purlin length, closure area. **Cutting list** (stretch): per member
  type, count × length rounded up to 100.
- `quantityTakeoff.js`: `trussCount`, `trussTimberLm` (by section key),
  `purlinLm`.

### 7.6 UI (`TrussProperties.jsx`)

- System panel: Section **Members** (preset select + three width/depth
  pairs; raised heel; label prefix); Section **Purlins** gains role,
  "Suggest from covering".
- Instance panel: Pitch input in degrees next to the % field (both write
  `rise`); Web pattern select filtered by family; Scissor ratio for scissor;
  Readouts heel height, overall height, out-to-out.
- Warnings (`Status`): spacing above the covering limit, overhang > 750,
  span/depth > 6.67 for flat trusses, pitch below the covering minimum (same
  rule as the roof panel, shown here too).

### 7.7 Tests and verification (RT-3)

- `profile.test.js`: with 90 × 35 chords, 25 % pitch, 300 overhang: heel
  height 90 + 90/cos(14.04°) = 182.8 ± 0.1; start tail underside z = 90 −
  300 × 0.25 = 15; ridge top face = 90 + 1800 + 92.8; bottom nodes at 45;
  `fink` has 4 webs at the stated nodes; `howe` 5; `fan` 6; `double_fink`
  8; `gable_studs` on a 7200 span has verticals at 600, 1200 … 6600 (11);
  raised heel 300 adds two `heel_stud` members; scissor bottom chord mid
  node at `rise × 0.5 + bc/2`.
- `roofAttachment.test.js`: attachment elevation formula; signed tail rise;
  attached gable goes through the profile path; eave underside at the
  overhang tip = attachment elevation − 300 × 0.25.
- `roofPlaneGeometry.test.js`: perpendicular thickness (180 at 25 % → 185.6
  vertical); negative profile rises accepted.
- `trussSchedule.test.js`: totals for the fixture system.
- `webPatterns.test.js`: every pattern's webs reference existing nodes; no
  duplicate members; symmetric patterns are mirror-symmetric.
- Existing tests that encode the old numbers (purlin attachments, detail
  dimensions, elevation/section truss lines, `buildPreviewObjects.test.js`)
  are updated, not deleted; each change says why in the test.
- `scripts/verify-truss-accuracy.mjs`: playground, Truss mode, select the
  instance, read the heel readout, switch pattern to Howe and assert the
  detail view's member count changes; Front-preset 3D screenshot showing the
  sloped tails and fascia meeting.

### 7.8 RT-3.1 — Roof seating follow-up (from the RT-3 audit)

The auditor's numeric probe on the playground (stored: hip, `pitchSource
'manual'` 32.5 %, roof `attachmentOffset −200`, roof overhang 510, truss
overhang 300, rise 1600 over 5050 = 31.68 %, purlins 50 deep) showed that the
follow-truss gable path seats the roof underside exactly on the purlin top
face — the roof-underside-to-chord-top gap is 52.4 = 50 / cos θ at every
sample — once the stored offset is taken out. Three residuals remain; they
are RT-3.1. Nothing else changes.

1. **Hip datum at the roof outline edge.** `resolveTrussSystemRoofSupportOffset`
   samples the support line at the truss tail tip (x = −overhangStart), but
   the preset hip formula (`getRiseAtPoint` in the hip builder) has rise 0 at
   the ROOF OUTLINE edge, which is a further `pitch.overhang` out when the
   outline is convex (`ensureRoofOutline.overhangApplied`). The hip roof
   therefore floats `slope × roofOverhang` above the purlins (161.6 mm on the
   playground). Fix: `getTrussRoofAttachmentElevation(trussSystem, { roofOverhang
= 0 })` samples the support line at x = −(overhangStart + roofOverhang) for
   a hip (the tail continues the run, so extrapolating the first support
   segment is exact; `sampleTrussOutlineZ` clamps today — extend it or
   extrapolate explicitly); `getRoofAttachmentElevation(project, roofSystem)`
   passes `roofSystem.pitch.overhang` only when the overhang is actually
   applied (convex boundary), else 0. Every other type keeps x = 0.
2. **Manual-slope attached gable/shed pivots on the heel.** Today
   `followsTrussProfile` is false for `pitchSource 'manual'` and the preset
   formula measures its rise from the outline edge, so the roof underside at
   the heel sits `slope × (overhangStart + roofOverhang)` above the purlins
   (263 mm on the playground). Fix: an attached gable/shed goes through
   `buildProfileDrivenRoofGeometry` whatever the pitch source; when the
   source is manual the profile's rises are scaled by `manualSlope /
profileSlope` (carry `slope` — the underside run slope as a ratio — on the
   `attachedShapeProfile` from `buildAttachedRoofShapeProfile`; normalizer
   default = derive from the first two points). The heel stays the fixed
   point (rise 0), the ridge lands at `manualSlope × run`, the tails at
   `−manualSlope × overhang`. That is what a hand-set slope on an attached
   roof means: it pivots on the bearing. `pitchSource 'manual'` keeps its UI
   meaning and the reducer rule that sets it.
3. **Stale `attachmentOffset` on old saves — migration 30 → 31.** Before RT-3
   the datum was the chord CENTRE-LINE z at the start tail plus the purlin
   depth (HEAD's `resolveTrussSystemRoofSupportOffset` returned
   `max(roofOutline[0].z, 0)`), and the preset ridge sat `slope × overhang`
   too high, so users pulled the roof down with the Base elevation field; the
   playground stores −200 (≈ −(0.325 × 510 + 50)). Under the new datum that
   offset drops the roof 200 mm into the trusses (every purlin through the
   covering once the slope follows the truss). `migration_30_to_31.js`: an
   ATTACHED roof (`trussAttachmentId` set) gets `attachmentOffset: 0` and its
   `baseElevation` re-derived by the normalizer; a detached roof is untouched.
   `CURRENT_SCHEMA_VERSION` 31. Do not hand-edit `playground-demo.json`;
   confirm it goes through the migration on load (`deserializeProject`).
   Judgment call §9.11.
4. **Tests.** `roofAttachment.test.js`: a synthetic project (span 7200, 25 %,
   overhang 300, 90 × 35, purlins 50 deep at 900, roof overhang 510) for
   gable-follow, gable-manual 20 %, shed-follow and hip-follow: at three
   points along every purlin, `getSurfaceElevation(topFacePoint, 'bottom') −
purlinTopFace` is 0 ± 0.5 (compare at the top face point's OWN plan
   position: centre + up · depth / 2), and at the chord-top midpoints of the
   first and middle copies the gap is `purlinDepth / cos θ` ± 0.5; the manual
   gable's ridge underside is `0.20 × 3600` above the heel datum. Migration
   test: a v30 attached roof with offset −200 → 0, base re-derived; a
   detached roof keeps its base. `scripts/verify-truss-accuracy.mjs`: press
   "Reset slope" (Roof panel, shown while the source is manual) before the
   3D pictures and check the Roof panel's slope readout then equals the
   instance pitch; the iso picture must show no purlin on the covering.

## 8. Cross-cutting rules

1. **Determinism and caching.** Descriptors are pure functions of project
   data (no `Date`, no random ids, ids built from stable object ids); every
   input a floor group reads is in its `sourceKey` (`buildPreviewScene.js`).
   New geometry types are added to `createObjectForDescriptor`
   (`buildPreviewObjects.js:1551`) and call `addOutline`. Nothing moves a
   node after build (matrices are frozen). Per-object materials are
   forbidden (use palette keys + `applyRoofAppearance`).
2. **Normalizers fill defaults**; UI code never assumes a field exists on an
   old save. Every new field is read through the normalized object.
3. **Rise stays the truss's source of truth**; nothing new stores a pitch.
4. **Drag protocol**: nothing in this spec adds a drag; if one is added
   anyway, follow BEGIN/END_DRAG_GESTURE (memory `drag-performance-gestures`).
5. **Phases**: closures and trims inherit their parent's `phaseId`; no new
   `PHASE_ASSIGNABLE_KEYS` entries.
6. **Hooks**: panels use `useProject`/`useEditorState`/`useToolSettings`;
   never `useEditor` or `useToolState` (per-frame) outside SvgCanvas.
7. **Toolbar**: no new toolbar items (the Display group already overflows,
   memory `floorplan-toolbar-overflow`); everything new is a panel setting.
8. **Do not touch** the uncommitted presentation-visuals work in the tree
   beyond what this spec names; never `git stash`, reset or commit.
9. **Tests**: `npm test` must stay green (vitest, ~370 files); `npm run
lint` 0 errors; each new module has a `*.test.js`; DOM tests are
   `*.dom.test.jsx` with `// @vitest-environment jsdom`.
10. **Docs**: this file is the contract; the hand-back for each phase lists
    every file touched with line anchors, every judgment call, and every
    spec item not built.

## 9. Judgment calls made in this spec (for the user to overrule)

1. Phase order RT-1 → RT-2 → RT-3 (colour first because it is the cheapest
   visible win; closure second because it is the screenshot; accuracy last
   because it changes stored-looking geometry the most).
2. Gable closure defaults to **infill** on every system, including old saves.
3. Trims default **on** for pitched roofs on old saves too (fascia, barge,
   gutter, downpipes, ridge cap, boxed soffit); the roof will look finished
   on load. Barge cap off.
4. Legacy pitched roofs become corrugated metal in Shale Grey; flat roofs
   stay a grey slab.
5. Member sizes are per truss **system**, not per instance; AU 90 × 35
   default (user's walls use CHB, i.e. metric practice).
6. Roof body thickness switches from vertical to perpendicular in RT-3 (a
   180 slab at 25 % moves the ridge top up 5.6 mm; at 45° it would be 75).
7. Attached gable/shed roofs switch to the profile-driven path in RT-3 (fixes
   the `slope × overhang` ridge offset; the roof surface will visibly drop by
   `bc + tc/cos θ` ≈ 183 mm relative to today's chord-centre-line placement
   while the truss rises by the same amount — the building height does not
   change, the roof-to-truss fit does).
8. Trims and closures are inspected as "Roof" / "Truss System" rather than
   as their own inspect types.
9. Colour via palette mutation (one roof per project) rather than per-object
   materials; if a second roof ever appears this must move to per-roof keys.
10. Corner mitres, hip girders/jacks, plates, attic trusses, dormers,
    sheet-level covering hatches: out of scope.

11. (RT-3.1) Old saves lose their roof `attachmentOffset` on migration 30 → 31
    when the roof is attached to a truss system: the offset was a workaround
    for the pre-RT-3 datum (chord centre-line + `slope × overhang` ridge
    error) and now drops the roof into the trusses. A detached roof keeps its
    base elevation. A manual slope on an attached gable/shed now pivots on
    the heel (rise 0 at the bearing) instead of the roof outline edge.

## 10. Status

**RT-1 built by Opus and audited by Fable 2026-11-03 — PASS.** 402 test
files / 4894 tests green, lint 0 errors, `scripts/verify-roof-covering.mjs`
passes (10 checks), gable probe confirmed barge/fascia/gutter/ridge cap on a
gable roof. What RT-1 actually landed, for the later phases:

- `src/domain/roofCoveringCatalog.js` (catalog, colours, `normalizeRoofCovering`,
  `normalizeRoofTrims`, `resolveRoofAppearance`, `roofMaterialKeyForCovering`),
  `src/roof/roofEdgeKit.js` (`buildRoofEdgeKitLayout` is the single source
  for 3D, elevation, section and quantities; `resolveRoofEdgeKitContext`),
  `migration_29_to_30.js`, schema 30.
- `buildRoofPreviewObjects(roofSystem, context)` now takes the edge-kit
  context; the roof layer's `sourceKey` is `{roofSystem, trussSystem,
groundElevation}` (`buildPreviewScene.js`).
- `segment3d` descriptors accept `up` (`segmentQuaternion` in
  `buildPreviewObjects.js`). Palette keys `roof_metal|roof_tile|
roof_membrane|roof_slab|roofRidgeCap|roofTrim|roofGutter|roofDownpipe|
roofSoffit|gableInfill`; `applyRoofAppearanceToPalette` (materials.js) and
  `viewport.applyRoofAppearance`; `ThreePreviewPanel` root carries
  `data-roof-colour`.
- `PanelKit.ColourField` (`data-colour-field`, `data-swatch="<name>"`);
  `properties/RoofCoveringSections.jsx` is the pattern for a new section in
  an old-style panel.
- Deviations accepted: no gutter on a shed `high_edge`; hips get capping
  strips (part `ridgeCap`); downpipes `max(1, ceil(len/maxSpacing))` per
  gutter; sheet relief not built; takeoff reads `netSurfaceArea`.
- Playwright facts for the next scripts: the playground truss is a HIP; to
  get a gable, Truss mode → click the system card (the button whose text ends
  in "instance"/"instances") → `page.getByText('Instance 1', {exact: true}).click()`
  (a DOM `.click()` inside `page.evaluate` does NOT register for that item)
  → the instance panel's Type select is the `<select>` directly after the
  `<label>` whose text is exactly "Type" → `selectOption('truss_type_gable')`;
  the sidebar roof card then reads "… · Gable". Deselect by clicking the sky
  (canvas top 5 %) before screenshots or the inspect card covers the pane.

**RT-2 built by Opus and audited by Fable 2026-11-03 — PASS.** 406 files /
4934 tests green, lint 0 errors, `scripts/verify-gable-closure.mjs` 10/10 and
`verify-roof-covering.mjs` still 10/10 on the auditor's run; screenshots show
the gable triangle closed (infill) and the trusses visible again (open).
What RT-2 landed, for RT-3:

- `src/truss/endClosures.js`: `buildEndClosureLayout(trussSystem,
systemGeometry, roofSystem)` is the single source (3D, elevation, section,
  plan, quantities, inspection, UI); `buildEndClosureObjects`; constants
  `END_CLOSURE_MIN_HEIGHT 50`, `END_CLOSURE_SAMPLE_STEP 150`; `TOP_NODE_KINDS
= {top_chord, ridge, high_point}`; the top edge samples
  `buildRoofPlaneGeometry(roof).getSurfaceElevation(p,'bottom') −
trussSystem.baseElevation` when the roof's `trussAttachmentId` is this
  system, else the profile `roofOutline`. End copies = the layout-axis
  extremes across all instances (`collectEndCopies`); hip copies get nothing;
  a single copy gets `start` only; side strips exist when the PROFILE's end
  z ≥ 50 and their height follows the roof underside.
- `trussModels.js`: `endClosures {colour, start, end, spanStart, spanEnd}`,
  `normalizeTrussEndClosures`, `TRUSS_END_CLOSURE_*` constants (no schema
  bump).
- `buildTrussPreviewObjects(trussSystem, systemGeometry = null)`;
  `buildPreviewScene.js` builds `buildTrussSystemGeometry` once per system and
  puts `roofSystem` in the floor's `sourceKey` only for the floor holding the
  attached system. `geometry: 'verticalPolygon'` →
  `createVerticalPolygonObject` (vertical planes only).
  `resolveRoofAppearance(roofSystem, trussSystems)`; root attribute
  `data-closure-colour`.
- 2D: `buildTrussElevationElements(…, roofSystem)` and
  `buildTrussSectionElements(…, roofSystem)` also return `polygonElements`;
  styles `gableInfill`/`gableVent`/`gableInfill_cut`; plan footprints in
  `TrussRenderer.jsx` (`ClosureFootprints`).
- UI: `properties/TrussEndClosuresSection.jsx` ("Gable ends", `data-closure-side`),
  `TrussProperties.dom.test.jsx`.
- Warts RT-3 is expected to cure: (1) the closure is a PENTAGON about 150 mm
  tall at the bearings because the attached preset gable roof's underside
  sits `slope × overhang` above the heel (§7.2 fixes it: the closure must
  come out a clean triangle from the bearing level to the chord top face +
  build-up); (2) 90 mm square chords poke 1.5 mm through the 87 mm infill
  (35 mm member widths fix it). Also noted: the section band does not deduct
  vents; only the first truss system's closure colour reaches 3D.

**RT-3 built by Opus and audited by Fable 2026-11-03 — PASS on the truss,
with a roof-seating follow-up (RT-3.1, §7.8).** Every file:line anchor in the
hand-back resolves to the claimed function. Auditor's run: 411 files / 5020
tests green, lint 0 errors (42 pre-existing warnings),
`verify-truss-accuracy.mjs` 13/13, `verify-gable-closure.mjs` 11/11,
`verify-roof-covering.mjs` 10/10. Screenshots: the gable closure is a clean
triangle from the wall top to the chord top face (RT-2 pentagon wart gone, no
chord through the 87 mm panel); the sloped chord tail meets the fascia at the
eave; the detail view draws members with depth and Fink → Howe changes 4 → 5
webs; the plan tags GE / T1 and "7 @ 1950 = 11700". §7.7 numbers confirmed by
the tests (heel 182.8, tail underside 15, ridge top 1982.8, bottom nodes 45;
playground gable heel 185.5 = 90 + 90 / cos 19.6°).

What RT-3 landed (file map in the hand-back; for the follow-up):

- `src/truss/profile.js`: line-space profile → `applyMemberGeometry`
  (true perpendicular offsets via `offsetTrussOutline`, mitred at kinks,
  plumb at tail tips); `buildTrussProfile(instance, catalog, {memberSizes,
heel, webPatternKey, layoutOffset, supportLength})` returns `roofOutline`
  (= chord TOP FACE), `undersideOutline`, `centreOutline`, `lineOutline`,
  `webPatternKey`, metrics `heelHeight/overallHeight/outToOut/pitchDegrees/
topChordDepth/bottomChordDepth/webDepth/raisedHeel`;
  `buildTrussRoofSupportOutline(profile, purlinDepth)` = top face + purlins.
- `src/truss/webPatterns.js` (12 keys, `t<i>`/`b<i>` index the FULL chord
  point lists, heels included), `trussSchedule.js`, `trussAdvice.js`;
  `trussModels.js` `TRUSS_MEMBER_PRESETS`, `getTrussProfileOptions(system)`,
  `truss_type_scissor`, purlin `role`; no schema bump.
- `trussGeometry.js`: `createSegmentDescriptor` sets `crossSection {height:
depth, width}` + `up` (`memberUpVector`); `resolveEndFrameCopies` draws
  infill-closed end copies with `gable_studs` and labels them GE;
  `getTrussInstanceTag` (T1…); `buildTrussDetailDimensions` adds Overall and
  Heel; `memberOutlines` for the detail renderer.
- `roofAttachment.js`: datum at x = 0 (hip: tail tip — wrong, see §7.8.1);
  `buildAttachedRoofShapeProfile` emits signed rises over the boundary
  (tail to tail), `shape` = the ROOF type. `roofPlaneGeometry.js`:
  signed/extrapolating `sampleShapeProfileRise`, perpendicular thickness
  everywhere but flat/custom, `followsTrussProfile` for attached gable/shed
  unless `pitchSource 'manual'` (see §7.8.2), no ridge when the peak is at an
  edge.
- Accepted deviations: the studded end frame is not viewable in the 2D
  detail (nothing selects a single copy); gable studs are hidden inside the
  infill in 3D (tests prove them); elevation/section truss lines remain
  centre-line strokes; cutting-list lengths are centre-line lengths rounded
  up to 100; `'scissor'` is a truss shape, not an attached roof type.
- Audit findings → RT-3.1 (§7.8): hip datum floats `slope × roofOverhang`;
  manual-slope attached gable/shed floats `slope × (truss + roof overhang)`;
  the playground's stored `attachmentOffset −200` (a pre-RT-3 workaround,
  present at HEAD) drops the roof 200 mm into the trusses once the slope
  follows the truss — purlins through the covering. The RT-3 verify script's
  3D pictures were taken on the manual-slope roof, which is why they looked
  right.
- Warts left: detail tags crowd at low zoom (no fit-to-view in the detail
  view); `TrussProfileSection` readouts show raw `u.toDisplay` precision;
  the label-prefix field normalises on every keystroke (an emptied field
  snaps to "T"); the old purlin "Total Length" readout is the longest run,
  the schedule has the sum; hip slices keep the legacy panel layout;
  `warren`/mono patterns gained end posts; new files are LF in a CRLF tree.

**RT-3.1 built by Opus and audited by Fable 2026-11-03 — PASS.** Auditor's
run: 411 files / 5031 tests green, lint 0 errors (42 pre-existing
warnings), `verify-truss-accuracy.mjs` 18/18, `verify-gable-closure.mjs`
12/12, `verify-roof-covering.mjs` 10/10. The auditor's numeric probe on the
migrated playground: gable following the truss — roof underside − chord top
face = 52.4 (= 50 / cos θ) at every sample of the end copy and the middle
copy, purlins seated; hip following the truss — the common trusses seat
exactly (52.4), the step-down slices keep their legacy geometry (−82 … +43 at
the slice chords, purlins −4 … +14); manual 32.5 % against a 31.68 % truss
pivots on the heel (52.4 at the heel, 93.5 at the ridge). Playground roof
base after migration 5980.22 (offset 0; the demo is stored at schema 15 and
migrates on load). What landed:

- `roofAttachment.js`: `getTrussRoofAttachmentElevation(trussSystem,
{roofOverhang})`; hip datum at x = −(overhangStart + roofOverhang) via
  `sampleSupportLineZ` (extrapolates the first support segment);
  `getRoofAttachmentElevation` = `resolveRoofAttachmentContext(...).attachmentElevation`
  (one rule with the normalizer); `attachedShapeProfile.slope` carried
  (underside run slope as a ratio; `normalizeAttachedShapeProfile` derives it
  from the first two points when missing).
- `roofPlaneGeometry.js`: attached gable/shed always profile-driven;
  `scaleShapeProfileToSlope` for `pitchSource 'manual'` (pivot on the heel);
  `isConvexPolygon` moved to `geometry/polygon.js`; the profile and hip
  builders now return the real `convexBoundary` / `overhangApplied`
  (`outlineState`), so the Roof panel's overhang hint only shows when the
  overhang really is not applied.
- `migration_30_to_31.js`: attached roof (resolvable `trussAttachmentId`) →
  `attachmentOffset 0`, `baseElevation` re-derived by `syncRoofSystemAttachment`;
  detached or dangling attachment untouched. Schema 31.
- `RoofProperties.jsx`: `Status` warning when an attached gable/shed has a
  hand-set slope more than 0.05 % off the first instance's pitch ("Hand-set
  slope 32.5 % differs from the trusses (35.6 %) … Reset slope seats it.");
  `data-manual-slope-warning`.
- Scripts: both truss scripts press "Reset slope" after the gable switch;
  the gable-closure card now reports 23.00 m² (closure follows the 35.6 %
  underside).
- Wart kept: the playground demo still stores `pitchSource 'manual'` 32.5 %;
  after switching its instance to Gable (rise resets to 1800 = 35.6 %) the
  warning shows and one click on "Reset slope" seats the roof. Hip step-down
  slices and their purlins are legacy geometry (§3 scope).
