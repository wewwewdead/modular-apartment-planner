# Presentation visuals — the plan canvas and the 3D preview

Spec for the floor plan workspace (`src/features/floorplan/`). Written
2026-11-02 by Fable after reading the code, running three code inventories,
researching the rendering techniques, and probing the running app; to be built
by Opus; audited by Fable against this document.

## 1. The ask, in the user's words

> Can we achieve this kind of visual? The 2D and the 3D on the apartment
> planner? Ignore the text there, just focus on the visual. I want my 2D and 3D
> visual to be like that so it will make my app more delightful and
> professional.

The reference is a concept board for a two-storey, four-unit apartment on a
tapered lot. A copy is at
`artifacts/floorplan/presentation-visuals/reference-board.png` (the folder is
git-ignored; the original is in the user's Downloads). Baseline screenshots of
the app as it is today are in
`artifacts/floorplan/presentation-visuals/baseline-2026-11-02/`.

Short answer, which this spec commits to:

- **2D: yes, closely.** Everything in the reference plan is flat vector art
  (solid walls, tinted zones, soft shadows, shaded furniture symbols, plants,
  swing arcs, stair arrows, chained dimensions). SVG does all of it.
- **3D: yes, as a clean "white model" visualisation** — white plaster, dark
  frames, reflective glass with a warm glow behind it, soft contact shadows,
  ambient occlusion, plants, a light studio backdrop, and proper isometric and
  orthographic elevation presets. The reference's isometric is an AI-painted
  photoreal image; a real-time viewport will not match its texture detail, and
  this spec does not chase that. The target is the look a SketchUp/Enscape
  "white card" render has, which reads as professional on its own.

## 2. Reading the reference (the visual language, element by element)

Colours below are eyeballed from the image. The relationships are the
acceptance criteria; the hex values are starting points to tune by eye with
the reference open beside the app.

### 2.1 The plan

| Element          | What the reference does                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural walls | Solid near-black fill (`≈ #2a2e35`), crisp, no visible seams at corners or tees. Thick: exterior and party walls.                                                                                                           |
| Partition walls  | White fill with a thin dark outline (`≈ 1 px`), visibly thinner than the structural walls.                                                                                                                                  |
| Floors by zone   | Bedroom/private = warm beige (`≈ #f4dfbd`); kitchenette and T&B (wet) = light blue (`≈ #bfe0f3`); entry, corridor, landing, stairs (circulation) = light grey (`≈ #dcdfe3`); the entrance has a fine tile grid.             |
| Depth            | A faint darkening of the floor along the inside of the walls, and the whole plan floats on a white card with a soft grey drop shadow.                                                                                       |
| Furniture        | Shaded top-down symbols with small drop shadows: bed with white duvet, two pillows and a darker headboard; kitchen counter with a sink and a hob; toilet; lavatory; shower in the wet zone; round potted plants in corners. |
| Doors            | A thin dark leaf line and a thin **solid** quarter-circle arc.                                                                                                                                                              |
| Windows          | A white gap in the wall carrying two or three thin parallel lines (frame, glazing, frame).                                                                                                                                  |
| Stairs           | Light grey treads with thin riser lines, an arrow along the run, and **UP** / **DN** text.                                                                                                                                  |
| Dimensions       | Thin dark chain lines with small **filled** arrowheads; labels in a bold sans-serif (`≈ 5.31 m`).                                                                                                                           |
| Labels           | Room name in bold uppercase, a smaller sub-label, and the area; tiny rooms get a white rounded chip (`KIT.`, `T&B`).                                                                                                        |
| Background       | Pure white card, no grid.                                                                                                                                                                                                   |

### 2.2 The 3D views

| Element   | What the reference does                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera    | Isometric three-quarter from the front-left with a little perspective; separate front/rear/left/right elevations in true orthographic.             |
| Walls     | Off-white plaster, slightly warm; the RC frame is plastered over, not shown as a darker cage.                                                      |
| Openings  | Dark charcoal window and door frames; glass reflects the sky and shows a warm interior glow; a dark timber slat screen as the one accent material. |
| Ground    | A light grey paving plinth, with a soft shadow pooling under the building and in corners (ambient occlusion).                                      |
| Backdrop  | A flat, light grey studio gradient; no horizon line, no grid.                                                                                      |
| Entourage | Planters with green plants at the entrance and on the balcony; thin dark railings.                                                                 |

## 3. What the code does today (verified)

### 3.1 The plan canvas

- One token object styles every plan, section and elevation renderer for both
  the canvas and the sheets: `DRAWING_GRAPHICS` in `src/sheets/standards.js:33–87`.
  Plan walls are `cutFill '#dbe1e7'` with `cutStroke '#1f2833'` at 1.45 px.
  Rooms are one flat `roomFill '#f6f8fa'`. Everything is a pale grey line
  drawing; see `baseline-2026-11-02/03-plan-focused.png`.
- Layer order inside `FloorPlanLayer.jsx:56–79`: FixtureDefs, slabs, rooms,
  walls, beams, stairs, landings, railings, columns, fixtures, doors, windows,
  electrical, section cuts, annotations. `FloorScene.jsx:82–153` places the
  site overlay, the sun shadow overlay and the ghost floor underlay beneath it,
  and ceilings, analysis overlays, grid, wet-core, selection and tool previews
  above it.
- `RoomRenderer.jsx:14–20` draws one polygon per room with the flat fill and
  ignores `room.color`, `room.useCategory` and `room.spaceType`. `createRoom`
  (`src/domain/models.js:364–379`) stores all three; `useCategory` is one of
  `rentable | circulation | service | shared | parking`
  (`src/domain/apartmentProgram.js:5–11`); `spaceType` values in use are
  `living, bedroom, bathroom, kitchen, living_sleeping, shared_corridor,
rentable_space` (`apartmentDesign*.js`). `RoomProperties.jsx` edits only
  Name, Phase and a Color picker; zone/space classification lives in the
  lifecycle panel only.
- `WallRenderer.jsx` draws one rectangle per wall (`getWallRenderData`,
  trimmed at columns), branching only on the assembly system: masonry walls
  get the cut fill (lines 121–129); framed walls get a core, board skins,
  studs and an outline (69–119). `wall.structuralRole`
  (`'loadbearing' | 'nonstructural'`, default nonstructural,
  `models.js:164`) is never read by a renderer. Walls meeting at a corner draw
  two overlapping stroked rectangles, so every join shows seams. `wall.thickness`
  defaults to `WALL_THICKNESS`.
- `DoorRenderer.jsx:118–147` paints a white mask over the wall, then a leaf
  line (1.1 px) and a **dashed** swing arc in the hidden-line style.
  `WindowRenderer.jsx:215–241` does the same mask, then three parallel lines.
  Neither draws a frame, sill or glazing tint.
- `StairRenderer.jsx` draws a white outline, 0.72 px tread lines and an
  open-headed arrow; there is no UP/DN text. `stairArrow` in
  `src/geometry/stairGeometry.js:71–91` already returns `start`, `end`,
  `headA`, `headB`. The stair model (`models.js:273–308`) carries
  `floorRelation.fromFloorId / toFloorId`.
- Fixtures (`FixtureRenderer.jsx`, defs in `FixtureDefs.jsx`) are the only
  furniture: `kitchenTop, toilet, lavatory, table, tv, sofa, bed`
  (`src/editor/tools.js:58–66`, sizes in `src/domain/defaults.js:78–91`). They
  already have two-stop gradients and one `feDropShadow` filter
  (`dy 30, stdDeviation 25`, world mm). There is no shower, no plant, no
  wardrobe. The Toolbar lists each type as its own button
  (`Toolbar.jsx:119–126, 476–484`); the Display group already sits past 2300 px
  and is off-screen on a 1600 px window (see memory `floorplan-toolbar-overflow`).
- Dimensions and tags: `BlueprintAnnotationLayer.jsx`. Arrowheads are open
  chevrons (lines 16–26, geometry `src/annotations/dimensions.js:21–31`,
  80 mm). Text is `var(--font-blueprint)` (JetBrains Mono), zoom-compensated by
  `textScale = 0.1 / zoom` (line 227). Room tags are
  `[name, area]` (`src/annotations/tags.js:64`), name 150 mm weight 600, area
  112 mm muted. The canvas already suppresses every derived dimension
  (`PLAN_CANVAS_ANNOTATIONS`, `FloorPlanLayer.jsx:36–40`); do not touch that.
- Strokes are screen pixels (`vectorEffect="non-scaling-stroke"` everywhere);
  geometry, glyph sizes and dash arrays are world millimetres. Default zoom 0.1.
- Background is `--color-background: #fafaf8` on the container
  (`SvgCanvas.module.css:1–7`); the grid is two `userSpaceOnUse` patterns
  (`GridRenderer.jsx`) using `--color-grid-minor #e6e4de` and
  `--color-grid-major #d0cdc5`. There is no paper, card or page shadow on the
  canvas.
- `src/geometry/polygonBoolean.js` already wraps `polygon-clipping`:
  `unionPolygons(rings)` returns `[{ outline, holes }]` regions and falls back
  to the unmerged set on degenerate input (lines 99–131).
- Sheets reuse the same leaf renderers (`SheetViewportContent.jsx:72–99`) with
  no zoom context. The hand-written vector PDF exporter
  (`src/export/sheetExport.js:826–862`) handles only `svg g rect line polygon
polyline path text image`; it has **no** support for `filter`, gradients,
  `pattern` or `clip-path`. The PNG export rasterises the live SVG, so it keeps
  all of them.
- Tests: 21 `*.test.jsx` files in `renderers/` render leaf components with
  `renderToStaticMarkup` and no provider. `FloorPlanLayer.test.jsx:84–93`
  asserts the plan markup contains no `<text` and no `mm` when tags are off.
  Hit-testing is geometric except for selection handles (`data-handle`), but
  `scripts/verify-plan-canvas-dimensions.mjs` counts `[data-type="wall"]`.

### 3.2 The 3D preview

- The realistic pipeline is already strong and must be kept: `EffectComposer`
  → `RenderPass` → `GTAOPass` → progressive Halton accumulation → `OutputPass`
  (`createProgressiveRenderer.js:202–226`), ACES tone mapping, PMREM image-based
  lighting from `RoomEnvironment` or the painted sun sky
  (`createEnvironment.js`), sun-disc jitter for soft shadows, procedural
  micro-relief. Styles: `RENDER_STYLE_PRESETS` in `renderStyle.js:59–111`
  (`shaded`, `realistic`; realistic is the default).
- What makes today's render look like a beige box with a grey cage
  (`baseline-2026-11-02/06-preview-realistic.png`): the palette in
  `materials.js:137–277`. `wall` is warm beige `0xcfc8ba`; `column 0x94989b`,
  `beam 0x898d91`, `slab 0x8b8d8c` are mid grey, so the RC frame reads as dark
  bands; `windowFrame 0xe8eaed` is light grey; `window` glass is
  `0xb6d4e8` at opacity 0.28 over nothing (there is no interior behind it);
  `roof 0xa2a7ab`; `door 0xb9854f`. The ground is a fading disc at `0x9a958c`
  (`createGroundPlane.js:61–69`, retinted by `applyGroundColor`,
  `createPreviewViewport.js:877–895`). The studio backdrop is a vertical sweep
  from `rgb(232,236,241)` to `rgb(150,156,164)` (`createEnvironment.js:63–85`).
- `materials.test.js` pins **relationships**, not colours: fibre cement ≥ 2.2×
  the slab's reflectance; slab roughness − sheet roughness > 0.15; wall vs
  sheet roughness differ by > 0.12 with wall detail strength > 3× sheet; the
  ceiling board is lighter than wall and slab; `column`, `beam`, `slab` are
  darker than `wallFiberCement`; metalness is 0 or 1; `windowFrame, column,
beam, slab, wall, wallFiberCement` are dielectric; glass is transparent,
  roughness < 0.1, `envMapIntensity > 1.5`.
- Geometry: walls are box segments around openings (no CSG); windows are four
  frame rails + one glass box + mullions (`buildPreviewObjects.js:397–480`);
  doors are a closed leaf box with knobs; fixtures are primitive-built; unknown
  fixture types become a box. No plants, no site, no plinth.
- Camera: perspective only, FOV 42, `OrbitControls`. Direction presets exist in
  `previewConfig.js:6–17` (`plan_aligned`, four `iso_*`, `front_aligned`,
  `side_aligned`) and `viewport.setProjectionPreset(name)` exists
  (`createPreviewViewport.js:1286`), but the panel offers only Reset View
  (`ThreePreviewPanel.jsx:491`). There is no orthographic camera anywhere in the
  preview.
- Stills: `renderToImage.js` renders one frame offscreen with a duplicate
  preset table, Shaded by default, no GTAO. The sheet "Axonometric View"
  (`SheetViewportContent.jsx:28–70`, source `src/sheets/sources.js:277–304`)
  calls it with `iso_northeast` at 1600×1000 and no `style`, so sheets get the
  flat shaded box. The live viewport has no save-image control and no
  `preserveDrawingBuffer`.
- Performance contracts that bind every change below (details in memory
  `project_perf_overhaul` and `preview3d-performance`): the `sourceKey` scene
  cache and descriptor carry-over (descriptors stay pure data); materials are
  owned by the palette and style switches change uniforms only; frozen
  matrices after each build; `SOURCE_ONLY_LAYER` instanced batching per
  material (every new material is a draw call; transparent and owned materials
  are never batched); 24 active / 8 shadow fixture-light budget; shadows render
  on demand; the `suspended` prop; the 66 ms rebuild throttle.

### 3.3 Elevations and sections (SVG)

`ElevationSceneLayer.jsx` draws depth-sorted, visibility-clipped polygons with
flat fills from `DRAWING_GRAPHICS.elevation` (`#f7f8fa` walls, `#dfe5ea`
slabs/beams/columns, `#edf3f7` windows, white doors) and 0.6 px opening
details (`OpeningDetails.jsx`). No materials, no shadows, no ground band. It is
shared by the canvas (`Front/Rear/Left/Right` in the toolbar) and the sheets.
See `baseline-2026-11-02/04-front-elevation.png`.

## 4. Research notes (what to use, what to avoid)

- **2D "rendered plan" convention.** Rendered-plan tutorials agree on the
  recipe: floor fills first, a crisp (not blurred) wall shadow on a multiply
  layer at a consistent 45° whose depth is about the wall thickness at
  drawing scale, furniture with a lighter, optional shadow so structure stays
  dominant, and neutral mid-tone floors so shadows read. This spec follows
  that: the wall shadow is a crisp geometric band, not a filter.
- **SVG filters.** `feDropShadow`/`feGaussianBlur` re-rasterise the filtered
  subtree on every repaint and cost per pixel of the filter region. Use at
  most two filtered elements on the canvas (the building card shadow and the
  shared fixture shadow), keep `stdDeviation` modest, never filter per wall or
  per room. The existing fixture filter already follows this pattern.
- **Ambient occlusion.** `GTAOPass` is the best quality option built into
  three r183 and the app already runs it with the mandatory `setSceneClipBox`.
  Keep it; do not add N8AO or SSAO.
- **Glass.** Keep the app's reflective-not-transmissive glass
  (`materials.js:113–135`): transmission needs a framebuffer copy per frame and
  blurs an interior that is not there. What the reference shows behind the
  glass is a warm, dim interior, which is a cheap emissive pane (section 6.2).
- **Shadows.** `PCFShadowMap` with the existing sun-disc jitter already gives
  soft penumbrae after accumulation; do not switch to `VSMShadowMap` (light
  bleeding on thin members, 32-bit float targets). Contact-shadow softness
  under the building comes from the ground plane receiving the jittered sun
  plus GTAO.
- **Orthographic elevations.** `OrbitControls` supports `OrthographicCamera`
  (it zooms via `camera.zoom`). `RenderPass.camera` and `GTAOPass.camera` are
  plain properties and can be swapped; the clip box and scene bounds do not
  depend on the camera.
- **Furniture symbols.** No open-source top-down furniture SVG set with a
  usable licence turned up; the symbols stay hand-drawn primitives, which also
  keeps them parametric in width/depth.

## 5. Decisions

These are made so the build does not have to re-decide them.

- **D1 — Two plan styles, chosen by a React context, defaulting to drafting
  where no provider exists.** `PLAN_STYLES = { DRAFTING: 'drafting',
PRESENTATION: 'presentation' }`. `SvgCanvas` provides the editor's choice;
  `SheetViewportContent` provides nothing, so sheets, exports and every
  existing unit test render drafting unchanged. The preference persists in
  `localStorage` under `floorplan.plan.style` (same discipline as
  `RENDER_STYLE_STORAGE_KEY`); it is editor state like `showGrid`, never part of
  the project. **Default is presentation** on the canvas: it is what the user
  asked to see.
- **D2 — Zone fills come from a resolver, not from `room.color`.**
  `resolveRoomZone(room)` returns one of `private | wet | circulation | shared |
outdoor | unassigned` using, in order: an explicit new optional `room.zone`
  field; `room.spaceType`; `room.useCategory`; then keywords in `room.name`
  (`bed, living, unit, rental, owner, studio, dining, study → private`;
  `t&b, toilet, bath, cr, kitchen, kit, laundry, utility, wash → wet`;
  `hall, corridor, entry, entrance, lobby, stair, landing, passage, foyer →
circulation`; `balcony, terrace, deck, garden, yard → outdoor`). A
  `room.color` that the user has changed from the default `ROOM_COLOR`
  (`#E8F0FE`) overrides the zone tint in presentation; the untouched default is
  ignored, as it is today. `RoomProperties` gains a **Zone** select above the
  colour field with an "Auto" option (null) and the five zones.
- **D3 — Wall tiers.** In presentation, a wall is **solid** (dark fill) when
  `structuralRole === 'loadbearing'` **or** `thickness >= 150` and the
  assembly is masonry; everything else, including every framed assembly, is a
  **partition** (white with outline). Columns join the solid tier. Each tier is
  drawn as **one unioned multipolygon path** (`unionPolygons`) so corners and
  tees are seamless, with the per-wall `data-id`/`data-type="wall"` polygons
  kept underneath as invisible hit/test hooks. During an active drag gesture
  (the reducer's `BEGIN_DRAG_GESTURE` / `END_DRAG_GESTURE` bracket,
  `floorplanReducer.js:1864–1868`; expose the flag through the editor state if
  it is not already readable) the union is skipped and the per-wall polygons
  draw with fill and stroke, so dragging costs what it costs today.
- **D4 — Depth without filters where possible.** The wall shadow is a crisp
  band inside each room: an even-odd path made of the room ring plus the same
  ring translated by (+160, +160) mm, clipped to the room, filled
  `rgba(28,32,40,0.10)`. One `clipPath` per room, no filter. The only new
  filter is the building card shadow: a single path (union of solid walls +
  rooms + slabs) with `feDropShadow dx=0 dy=160 stdDeviation=220` in
  `rgba(24,28,36,0.16)`, drawn beneath the rooms.
- **D5 — Typography.** Presentation text is Manrope (`var(--font-ui)`), which
  is already self-hosted: room names 700 uppercase with 0.04 em tracking, areas
  500 muted, dimension labels 600 on a white rounded chip. Drafting keeps
  JetBrains Mono. Both keep the existing zoom compensation.
- **D6 — New fixture types `shower` and `plant`**, each with a plan symbol and
  a 3D builder, because the reference leans on both and they are the two
  cheapest "delight" items. The seven toolbar fixture buttons become one
  **Furniture** button that opens a popover grid of the nine types (keyboard F
  unchanged). This _shortens_ the toolbar; do not add buttons to it.
- **D7 — 3D palette moves to a white model with a dark frame line.** Walls
  become warm white plaster; columns and beams become a light warm grey one
  step below the wall (a plastered frame with a shadow line, not a cage);
  window and door frames become charcoal; glass gets more sky and a warm glow
  pane behind it; the ground becomes a light paving tone; the backdrop
  becomes a gentler, lighter sweep. All existing material tests must still
  pass; the only test that changes is where this spec says so.
- **D8 — Presets, not a new navigation mode.** A **View** select in the panel
  header (Free · Iso NE/NW/SE/SW · Front/Rear/Left/Right). Iso presets are the
  existing perspective directions. The four elevations switch the active camera
  to an `OrthographicCamera` fitted to the model; any orbit drag or Reset View
  returns to perspective. FOV stays 42 everywhere.
- **D9 — Sheets.** The sheet "Axonometric View" renders with
  `style: 'realistic'`. Sheet plans stay drafting (the PDF exporter cannot
  draw filters or gradients). A presentation plan on paper is a follow-up, not
  this spec.
- **D10 — No textures, no photoreal chase.** No image assets, no transmission,
  no bloom pass, no new AO library. Everything stays procedural so the Electron
  offline build and the perf contracts are untouched.

## 6. The build

Four phases, each shippable and verifiable on its own. Keep each as its own
commit series.

### Phase A — Presentation plan style (2D)

**A.1 Style plumbing.**

- `src/features/floorplan/components/renderers/PlanStyleContext.js`:
  `PLAN_STYLES`, `PlanStyleProvider`, `usePlanStyle()` (returns
  `'drafting'` with no provider), `readPlanStylePreference()` /
  `persistPlanStylePreference()` with the try/catch storage discipline from
  `renderStyle.js:118–135`.
- Editor state: `planStyle` next to `showGrid` in `floorplanReducer.js:272`,
  `SET_PLAN_STYLE` action, initialised from the preference. Expose it through
  `useEditorState` (see memory `project_perf_overhaul` before adding a
  consumer; it is a per-change value, not per-frame).
- `SvgCanvas.jsx` wraps the world group in `PlanStyleProvider` and sets
  `data-plan-style` on the `<svg>` so scripts can read it.
- Toggle: a third icon button in `CanvasOverlayControls.jsx` (bottom-right
  stack), `aria-label="Presentation style"`, `aria-pressed`, tooltip
  "Presentation style — tinted zones, solid walls, furniture shading. Off for
  the drafting line drawing." Not in the toolbar.
- Tokens: a new `PRESENTATION_GRAPHICS` export in `src/sheets/standards.js`
  beside `DRAWING_GRAPHICS`; renderers pick `const g = style === 'presentation'
? PRESENTATION_GRAPHICS : DRAWING_GRAPHICS`. Starting values:

```js
export const PRESENTATION_GRAPHICS = {
  plan: {
    wallSolidFill: '#2b2f36',
    wallSolidStroke: '#1a1d22',
    wallSolidStrokeWidth: 0.6,
    wallPartitionFill: '#ffffff',
    wallPartitionStroke: '#2b2f36',
    wallPartitionStrokeWidth: 1,
    columnFill: '#2b2f36',
    zoneFill: {
      private: '#f4dfbd',
      wet: '#bfe0f3',
      circulation: '#dcdfe3',
      shared: '#d9e8d4',
      outdoor: '#e7eadf',
      unassigned: '#f1efe9',
    },
    zoneShadow: 'rgba(28,32,40,0.10)',
    zoneShadowDepth: 160,
    cardShadow: { color: 'rgba(24,28,36,0.16)', dy: 160, blur: 220 },
    stairFill: '#e6e8eb',
    treadStroke: '#6b7280',
    treadStrokeWidth: 0.6,
    arrowStroke: '#2b2f36',
    arrowStrokeWidth: 1.2,
    doorLeafFill: '#2b2f36',
    doorLeafThickness: 45,
    swingStroke: '#7b8591',
    swingStrokeWidth: 0.7,
    glazingFill: '#cfe6f5',
    glazingBand: 0.34,
    frameStroke: '#2b2f36',
    frameStrokeWidth: 0.9,
    slabEdgeStroke: '#9aa3ad',
    slabEdgeStrokeWidth: 0.7,
    beamStroke: '#9aa3ad',
    beamDash: '4 3',
    gridMinor: '#f1efe9',
    gridMajor: '#e2dfd6',
  },
  annotation: {
    dimensionStroke: '#3a4049',
    dimensionStrokeWidth: 0.8,
    arrowLength: 70,
    arrowHalfWidthRatio: 0.4,
    arrowFilled: true,
    text: '#1c2128',
    textMuted: '#5b6671',
    fontFamily: 'var(--font-ui)',
    dimensionTextWeight: 600,
    roomNameWeight: 700,
    roomNameTransform: 'uppercase',
    roomNameTracking: '0.04em',
    chipFill: 'rgba(255,255,255,0.92)',
    chipRadiusPx: 4,
  },
};
```

**A.2 Rooms and zones.**

- `src/domain/roomZones.js`: `ROOM_ZONES`, `resolveRoomZone(room)` per D2, and
  `zoneLabel(zone)`. Pure, tested.
- `RoomRenderer.jsx`: in presentation, fill from
  `PRESENTATION_GRAPHICS.plan.zoneFill[zone]` (or the user's custom colour),
  `data-zone={zone}` on the room group, then the wall-shadow band (D4) as a
  second element in the same group with `pointer-events: none`. Selected rooms
  keep the 0.72 opacity cue.
- `createRoom` gains `zone: null`; `ROOM_UPDATE` already merges fields.
  Serialisation: confirm the serializer copies unknown room fields; if it
  whitelists, add `zone` and bump nothing (an absent key is `null`).
- `RoomProperties.jsx`: add the **Zone** select (Auto + five zones) above
  Color using the panel kit (`properties-panel-kit` memory: engraved readouts
  for derived values). Relabel Color as "Custom fill" and add a small "Use
  zone colour" action that resets to `ROOM_COLOR`.
- Playground and fresh projects have **zero rooms** until Auto-detect Rooms is
  run (`03-plan-focused.png`, Rooms 0). The verify script must click
  "Auto-detect Rooms" first. Consider whether `detectRooms` should name rooms
  so the keyword fallback has something to read; do not change its geometry.

**A.3 Walls, columns, card shadow.**

- `src/geometry/planPresentationGeometry.js`: `wallTier(wall)` (D3),
  `buildWallTierRegions(walls, columns)` → `{ solid: regions, partition:
regions }` using `getWallRenderData(...).outline` for each wall and the
  column outlines, unioned per tier with `unionPolygons`; and
  `buildPlanCardRegion(floor)` (union of solid-tier walls, rooms, slabs).
  Memoise by the `walls`/`columns` array identities. Tests: a corner and a tee
  produce one ring with no interior edge; a 100 mm nonstructural masonry wall
  is a partition; a 150 mm one is solid; a loadbearing 100 mm wall is solid;
  framed walls are partitions.
- `WallRenderer.jsx`: in presentation (and not mid-drag), draw per-wall
  invisible polygons (`fill="none" stroke="none" pointer-events="none"`,
  keeping `data-id`, `data-type="wall"`, `data-wall-system`,
  `data-wall-preset`), then one `<path data-type="wall-union"
data-wall-tier="partition">` and one `data-wall-tier="solid"` (solid last so
  it wins at junctions), even-odd, `strokeLinejoin="miter"`. Framed walls do
  **not** draw studs or skins in presentation. The outboard drawn-axis dashed
  line stays (it carries meaning). Mid-drag: the drafting per-wall branch with
  presentation colours.
- `ColumnRenderer.jsx`: in presentation, columns are drawn into the solid
  union; keep their own `data-type="column"` polygons invisible for hooks.
- Card shadow: a `PlanCardShadow` element rendered by `FloorPlanLayer` before
  the slabs: `<defs><filter id="plan-card-shadow">…</filter></defs>` and the
  card path with `fill="#ffffff"` so the building's own footprint is white
  under the zones. Measure (A.7) before accepting the filter; the fallback is
  three offset fills at 0.06/0.04/0.02 opacity with no filter.

**A.4 Openings and stairs.**

- Doors: leaf becomes a filled 45 mm rectangle in `doorLeafFill`; the swing
  arc becomes a solid 0.7 px line in `swingStroke`; the white mask stays. Same
  for double and sliding (sliding: two offset 45 mm panels, no arc).
- Windows: inside the mask, a glazing band rectangle of `thickness ×
glazingBand` centred on the wall line in `glazingFill`, with two frame lines
  at the wall faces in `frameStroke`. Type variants (casement/awning arcs,
  jalousie slats) stay, drawn in `frameStroke`.
- Stairs: `stairFill`, tread lines in `treadStroke`, the arrow with a
  **filled** head polygon (reuse `headA/headB/end`), and a `<text>` label at
  `arrow.start` offset 120 mm back along the run: `UP` unless
  `stair.floorRelation.toFloorId === floor.id && fromFloorId !== floor.id`,
  then `DN`. Manrope 700, 10 px via the same `textScale` the annotation layer
  uses (the stair renderer needs `useCanvasZoom()`); rotate with the run and
  keep it upright (reuse the `normalizeTextAngle` idea from
  `dimensions.js:17`). `data-stair-label`. Drafting is unchanged, so
  `FloorPlanLayer.test` keeps passing with no provider.

**A.5 Fixtures.**

- Upgrade the seven symbols to the reference's level while staying
  parametric: bed = duvet with a soft fold line and rounded corners, two
  pillows with a top highlight, a headboard band in a darker tone; sofa =
  seat cushions with a back and arms, soft inner highlight; kitchenTop = light
  counter, inset sink in `glazingFill`, four hob rings, a thin edge highlight;
  toilet = cistern + bowl with a seat ring; lavatory = oval basin with tap dot;
  table = top with leg dots; tv = slim dark bar. Keep the single
  `#fixture-shadow` filter and raise it to `dy 40, stdDeviation 35,
rgba(0,0,0,0.14)`.
- New `shower` (900 × 900): tray in `glazingFill` with a centre drain and a
  glass line on the open side. New `plant` (two sizes via width: 500 and
  800): pot circle in `#6b6b6b`, canopy of 6–7 overlapping leaf ellipses in
  two greens (`#6aa35a`, `#4f8a45`) rotated around the centre with a light
  centre highlight. Add both to `FIXTURE_TYPES`, `FIXTURE_DEFAULTS`,
  `fixtureGeometry.fixtureOutline`, the placement preview, the Toolbar icon
  set (`ToolbarIcons.jsx`), and `DETAIL_ASSIGNMENTS` / the 3D dispatcher
  (Phase B.3). Plan symbols are drawn in **both** styles; presentation only
  changes shading tokens.
- Toolbar: replace the seven buttons with one **Furniture** button (keyboard
  F, `aria-haspopup`) opening a popover grid of nine items; the active type
  shows in the button's tooltip and as a pressed state. Update
  `Toolbar.dom.test.jsx`. Measure the toolbar width before and after and
  record both in the PR.

**A.6 Annotations and grid.**

- `BlueprintAnnotationLayer.jsx`: in presentation, filled arrowheads
  (`<polygon>`), Manrope text per D5, a rounded chip (`rx = chipRadiusPx ×
textScale × 10`) instead of the square mask, room name uppercase. Dimensions
  that are manual keep their `data-dimension-source="manual"`.
- `GridRenderer.jsx` / `SvgCanvas.jsx`: in presentation the two patterns use
  `gridMinor` / `gridMajor`; the Toggle Grid button still governs visibility.
- Canvas background stays `--color-background`.

**A.7 Measure, then accept.** With `?renderProfile=1`
(`renderProfiling.jsx`) and the playground floor after Auto-detect Rooms,
record FloorPlanLayer commit time and a 30-frame pan in both styles. Budget:
presentation ≤ drafting + 2 ms per frame on the pan, and the union + card
shadow build ≤ 3 ms on the playground floor. If the card-shadow filter breaks
the budget, use the no-filter fallback and say so in the PR.

### Phase B — 3D white model

**B.1 Palette (`materials.js`).** Change values, keep factories:

| key                                              | from                     | to                                                                                                                                                                  | note                                                                                         |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `wall`                                           | `0xcfc8ba` r0.9          | `0xe9e5dd` r0.88                                                                                                                                                    | warm white plaster; ceiling board `0xf0ece4` stays lighter (test)                            |
| `column`, `beam`                                 | `0x94989b`, `0x898d91`   | `0xcbc8c1`, `0xc6c3bc` r0.9                                                                                                                                         | plastered frame one step below the wall; still darker than `wallFiberCement 0xdee0dd` (test) |
| `slab`                                           | `0x8b8d8c`               | keep                                                                                                                                                                | the test needs sheet/slab ≥ 2.2; the slab edge is the plinth line                            |
| `stair`, `landing`                               | grey                     | `0xd2cfc8` r0.9                                                                                                                                                     | not under any test                                                                           |
| `roof`, `parapet`                                | `0xa2a7ab`, `0xa0a5aa`   | `0xb4b8bc`, `0xd9d6cf`                                                                                                                                              | roof a notch lighter; parapet reads as render                                                |
| `windowFrame`                                    | `0xe8eaed` r0.38         | `0x2f3338` r0.5                                                                                                                                                     | charcoal powder coat; dielectric (test)                                                      |
| `door`                                           | `0xb9854f`               | `0x5a3f2b` r0.62                                                                                                                                                    | dark stained timber                                                                          |
| `window`                                         | `0xb6d4e8` op0.28 env2.2 | `0x9fc3dc` op0.4 env2.8                                                                                                                                             | more sky in the glass                                                                        |
| `railing_handrail`, `railing_guardrail`          | pale metal               | `0x2f3338` metal r0.4 / `0x3a3f45` r0.5                                                                                                                             | thin dark rails as in the reference                                                          |
| **new** `windowGlow`                             | —                        | `MeshStandardMaterial { color 0x2b2826, emissive 0xffc98a, emissiveIntensity 0.35, roughness 1, transparent true, opacity 0.6, depthWrite false, side DoubleSide }` | the warm interior; `userData.ownedByPalette`; never batched (transparent)                    |
| **new** `plantLeaf`, `plantLeafDeep`, `plantPot` | —                        | `0x5f9a4c` r0.8, `0x3f7a3a` r0.85, `0x4a4a4a` r0.7                                                                                                                  | three fixed instances (draw-call rule)                                                       |
| **new** `shower`                                 | —                        | `0xe6eef3` r0.2                                                                                                                                                     | tray                                                                                         |

Update `materials.test.js` only by adding: `windowFrame` reflectance <
0.1 (it is dark now), `windowGlow` is transparent and emissive, the plant
tones are exactly three shared instances (same pattern as the corten test).
Every existing assertion must pass without edits; if one fails, the colour is
wrong, not the test.

**B.2 Window glow.** In `createWindowObject` add a glow pane
(`BoxGeometry innerW × innerH × 2`) 20 mm behind the glass towards the wall
interior, `windowGlow` material, `castShadow = receiveShadow = false`, no
outline, not tagged for batching. `applyInteriorLighting` sets
`palette.windowGlow.emissiveIntensity`: lights off → 0.08; day with lights →
0.35; night with lights → 1.6; night without → 0.08. In walk mode
`palette.windowGlow.opacity = 0` so the view out of a window is not dimmed
(the viewport knows `navigationMode`). These are uniform changes, so the
style/lighting switch stays recompile-free.

**B.3 Plants and shower in 3D.** Dispatcher entries in
`buildPreviewObjects.js` for `fixture_plant` (pot = `CylinderGeometry`
tagged for batching; canopy = three overlapping `IcosahedronGeometry(r, 1)`
in `plantLeaf`/`plantLeafDeep`, scaled by the fixture width; height
`1.3 × width`) and `fixture_shower` (tray box 40 mm high + a 1900 mm glass
panel on the open side in `railing_glass`). Add both to `DETAIL_ASSIGNMENTS`
(`smooth`, `fabric` for leaves is fine). Descriptors stay pure data.

**B.4 Ground, backdrop, light.**

- `DEFAULT_GROUND_COLOR` → `0xc9c6c0`; `createGroundPlane` material colour
  the same; keep the alpha fade. `applyGroundColor` keeps its sun tinting.
- Studio backdrop sweep → `rgb(246,247,249)` at 0, `rgb(232,234,237)` at
  0.5, `rgb(214,217,221)` at 1.
- Keep the light rig and all calibration constants. If the white walls now
  clip, lower `RENDER_STYLE_PRESETS.realistic.exposure` to 0.9; do not touch
  `STUDIO_ENVIRONMENT_INTENSITY` or `SKY_ENVIRONMENT_INTENSITY`.

**B.5 View presets and orthographic elevations.**

- Panel header: a **View** select (`aria-label="Preview view preset"`) with
  `free, iso_northeast, iso_northwest, iso_southeast, iso_southwest,
elevation_front, elevation_rear, elevation_left, elevation_right`. Iso
  options call `viewport.setProjectionPreset`. Elevations call a new
  `viewport.setOrthographicView(name)`.
- `createPreviewViewport.js`: an `OrthographicCamera` created once; a
  `activeCamera` getter used by the render pass, GTAO pass, controls and the
  picker. `setOrthographicView` fits the ortho frustum to the model bounds
  with 6 % padding on the axis named by `ELEVATION_VIEWS` in
  `src/elevations/projection.js:1–26` (`horizontalAxis` / `depthAxis` per
  view; reuse them so the 2D and 3D elevations agree on "front"),
  disables rotate on the controls, and marks the scene dirty. Any `start`
  from OrbitControls rotate, `resetView`, or choosing `free` restores the
  perspective camera. `renderToImage.js` gets the same `projection:
'orthographic'` option and drops its duplicate `PRESETS` table in favour of
  `previewConfig.PRESETS` plus the elevation axes.
- Compass and `fitCameraToBox` keep working for perspective; add
  `fitOrthographicCamera` beside it in `previewCameraMath.js` with a unit
  test.

**B.6 Save image.** A **Save image** button in the panel header. It waits
for the progressive renderer to report convergence (`getRenderStats`), then
calls `viewport.captureImage()` which renders one presented frame and reads
`renderer.domElement.toDataURL('image/png')` synchronously in the same call
(no `preserveDrawingBuffer`), and downloads `<project>-<view>.png`. Disabled
with a tooltip while refining. In Electron it must also work (a data-URL
anchor download is fine).

**B.7 Sheets.** `SheetViewportContent.jsx` passes `style: 'realistic'`; the
cache key includes the style. Bump nothing else.

### Phase C — Elevation presentation (SVG) and polish

- `ElevationSceneLayer.jsx` reads `usePlanStyle()`. In presentation:
  wall `#f2f0eb`; slab/beam/column `#dcd9d3`; roof `#c9ccd0`; window glazing
  `#bcd8ea` with a 1.2 px `#2f3338` frame rectangle from `OpeningDetails`;
  door `#5a3f2b`; railings `#2f3338`; a ground band rectangle 600 mm deep in
  `#e4e5e8` under the ground line; a crisp building shadow band 250 mm to the
  right of every wall element at `rgba(28,32,40,0.08)` (same even-odd trick
  as the plan). Drafting unchanged; sheets unchanged (no provider).
- Section view: no change in this spec.

### Phase D — optional, only if A–C land clean

**Save plan image.** A canvas action that serialises the world `<g>` with a
fitted `viewBox`, inlines the Manrope `@font-face` as a data URL (fetch
`/fonts/manrope-latin.woff2`), rasterises at 3× into a canvas and downloads a
PNG with a white card margin. Shadows and gradients survive because this is
the browser's own rasteriser, not the PDF exporter.

## 7. Verification

**Unit (vitest).** New tests for `roomZones` (every resolver branch; the
custom-colour override), `planPresentationGeometry` (tiers, seamless
corner/tee union, degenerate fallback), `PlanStyleContext` (no provider →
drafting; storage round-trip), `RoomRenderer` under both styles (`data-zone`,
shadow band present only in presentation), `WallRenderer` presentation
(`data-type="wall-union"` × 2, per-wall hooks still present, mid-drag branch),
`StairRenderer` labels (`UP` / `DN` rule), `FixtureRenderer` for `shower` and
`plant`, `BlueprintAnnotationLayer` filled heads and font family,
`fitOrthographicCamera`, `materials.test.js` additions, `buildPreviewObjects`
window glow pane and plant/shower builders (descriptor purity, no batching of
the glow pane). Every existing test passes unchanged except
`Toolbar.dom.test.jsx` (popover) and the explicit `materials.test.js`
additions.

**Browser (`scripts/verify-presentation-visuals.mjs`).** Playwright Chrome,
headless, `FLOORPLAN_VERIFY_URL` default `http://localhost:5199/playground`,
artifacts to `artifacts/floorplan/presentation-visuals/`. Steps and asserts:

1. Load, click **Auto-detect Rooms**, read `svg[data-plan-style]` =
   `presentation`.
2. Count `[data-zone]` groups > 0; count `[data-type="wall-union"]` = 2;
   `[data-type="wall"]` count equals the Walls count in the properties panel;
   at least one `[data-stair-label]` with text `UP`; `.annotations polygon`
   with a non-`none` fill exists after placing one manual dimension (M).
3. Toggle the overlay button → `drafting`: `[data-type="wall-union"]` = 0,
   `[data-zone]` = 0, no `<text>` under `.stairs`.
4. Focus the canvas, pan 30 frames in each style; record mean frame time from
   `window.__MAP_RENDER_PROFILE__` (enabled by `?renderProfile=1`, see
   `renderProfiling.jsx:3–5`) and fail if presentation exceeds drafting by
   more than 2 ms.
5. Screenshot the focused plan in presentation (`plan-presentation.png`) and
   drafting (`plan-drafting.png`).
6. Focus the preview; for each View option wait for convergence
   (`window.__previewPerf.snapshot().progressive.samples` reaching
   `targetSamples`) and screenshot (`preview-<view>.png`); assert the
   orthographic views report `camera.isOrthographicCamera` through a small
   debug getter on `window.__previewPerf`.
7. Click **Save image**; assert a PNG data URL longer than 100 kB was produced
   (intercept the anchor download).
8. Switch to Sheets; assert the Axonometric viewport image is non-empty and
   that its render style is realistic (the cache key is observable through
   `data-sheet-preview-style` on the `<image>`).

**Visual acceptance (Fable's audit, reference open beside the app).**

- Plan: solid walls read as one black line-work with no seams; partitions
  visibly thinner and white; three zone tints clearly distinct and muted; the
  plan floats on a white card with a soft shadow; furniture has shading and a
  shadow; plants read as plants at default zoom; doors show solid arcs; stairs
  show UP/DN; room names are bold uppercase; dimension heads are filled.
- 3D: walls white, frame a shade darker not a cage; frames charcoal; glass
  shows sky and a warm interior; soft ground shadow and visible corner AO;
  light flat backdrop; plants green; iso presets frame the whole building;
  elevation presets are true orthographic (parallel verticals, no
  convergence); night mode makes the windows glow.
- Nothing in drafting style, sheets, exports or the wall/ceiling detail
  editors changed.

## 8. Constraints

- Do not change `PLAN_CANVAS_ANNOTATIONS` or the no-derived-dimensions rule.
- Do not emit filters, gradients, patterns or `clip-path` in **drafting**
  style: the PDF exporter cannot draw them.
- Keep every renderer default to drafting with no provider; new tests that
  want presentation wrap in `PlanStyleProvider`.
- Keep `data-id` / `data-type` hooks on every object in both styles.
- Keep millimetre world units and non-scaling strokes; new text uses the
  existing `textScale` compensation.
- Honour all 3D perf contracts in section 3.2. New materials are palette-owned
  and fixed in number (three plant tones, one glow, one shower).
- Do not add a `postprocessing`/N8AO dependency, textures, HDRs or fonts.
- Do not widen the toolbar.
- Electron must keep working offline (nothing fetched from the network).
- Memory notes to read first: `project_perf_overhaul`, `preview3d-performance`,
  `drag-performance-gestures`, `preview-view-toggles` (the sourceKey trap),
  `floorplan-toolbar-overflow`, `properties-panel-kit`, `plan-canvas-dimensions`.

## 9. Out of scope (follow-ups, not this build)

- A presentation plan on sheets and in the vector PDF.
- A timber slat screen as a wall board material (the reference's accent).
- People, cars and trees as entourage; site paving and the lot in 3D.
- Section view presentation style.
- Dimension chains added automatically to the presentation plan (the user
  asked for a clean canvas; overall dimensions belong to the sheets).

## 10. Audit checklist

Fable will check, in this order: every existing vitest passes except the two
named files; the new tests exist and test the rule, not the implementation;
`scripts/verify-presentation-visuals.mjs` passes against a fresh dev server
and its screenshots match the visual acceptance list; the perf numbers from
A.7 and step 4 are in the PR; `git grep` shows no filter/gradient in a
drafting code path; the sheet PDF export of the playground sheet is
byte-comparable to before this change (same elements, same order); toolbar
width is smaller than before; `npm run build` is clean; and the three
baseline screenshots are re-captured into
`artifacts/floorplan/presentation-visuals/after/` for side-by-side comparison.
