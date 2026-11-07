# Night crossing and section view — two freezes, attributed, and the fix

Spec for the builder (Opus 5.5, high). Written 2026-11-07 by Fable after
reproducing both reports in headless Chrome against the dev server. Every
number below was measured, every line reference was read. Where a choice is
left to the builder it says so; flag any further judgment call in the summary
you hand back.

Companion: `docs/loading-states.md` — its principles (§3), kit (§4) and
verification conventions (§8) apply here unchanged.

## 1. The problem, in the user's words

> there's a bug on the sun, when i slide the sun an shadow to night, it will
> freeze and also the section like view open section, when i click it it will
> freeze to before the data is loaded. can you also add loading state there?

Two reports, three defects:

- **A. Sun & Shadow time slider dragged past sunset** — the page freezes for
  ~0.7 s at the exact minute the sun goes below the horizon, and the 3D
  preview is the one doing it.
- **A′. Turning the sun study on** (web build only) — the same kind of
  freeze, ~0.8 s, the first time the study starts in a session.
- **B. "Open section view" / the toolbar's Section view** — the whole UI
  blocks for 1.0–1.3 s before the section appears. There is no loading
  state; the click does nothing visible until the drawing lands.

## 2. What happens today (verified)

Fixture: `scripts/fixtures/bench-ceiling-project.json` with the site given a
location (Manila, 14.5995 / 120.9842, `Asia/Manila`, north 0) so the study
can run; December solstice default; sunset at the site 17:26. Dev server on
5199, headless Chrome on ANGLE/D3D11, 1600×1000. Probe: rAF gap, long-task
observer, a `linkProgram` / `getProgramInfoLog` patch, CDP CPU profile.
Scripts (read them, they are the base of §6):
`C:\Users\johnm\AppData\Local\Temp\claude\C--Users-johnm-modular-apartment-planner\51faa29a-931c-47e8-bb0c-28722199c7bf\scratchpad\repro-freezes.mjs`,
`…\repro-freezes-2.mjs`, `…\repro-freezes-3.mjs`.

### 2.1 Measured

| #       | Transition                   | Longest frame gap                            | Programs linked                                                                                                        | `getProgramInfoLog` self time |
| ------- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| S0      | Sun study Off → On, 12:00    | **774 ms** (two long tasks, 510 + 767)       | 9: EquirectangularToCubeUV, PMREMGGXConvolution, CubemapFromEquirect, MeshStandardMaterial ×4, MeshPhysicalMaterial ×2 | 1,216 ms                      |
| S1a     | 17:20 → 17:20 (control)      | 8 ms                                         | 0                                                                                                                      | 0                             |
| S1b     | **17:20 → 17:30, sun sets**  | **697 ms** (one long task)                   | 8: MeshStandardMaterial ×4, MeshPhysicalMaterial ×2, MeshNormalMaterial ×2                                             | 700 ms                        |
| S1c     | 17:30 → 20:00                | 9 ms                                         | 0                                                                                                                      | 0                             |
| S1d     | 20:00 → 17:20, sun back up   | 19 ms                                        | 2 (MeshDepthMaterial ×2, from Chrome's program cache)                                                                  | 9 ms                          |
| S1e     | 17:20 → 17:40, second sunset | 9 ms                                         | 0                                                                                                                      | 0                             |
| N1      | 3D pane **Night** button On  | **694 ms**                                   | 10: BackgroundCubeMaterial + 9 materials                                                                               | 668 ms                        |
| N2      | Night Off                    | 9 ms                                         | 0                                                                                                                      | 0                             |
| S3 / S4 | Study Off / On again (warm)  | 32 / 26 ms                                   | 0 / 1                                                                                                                  | —                             |
| V1      | Toolbar **Section** (cold)   | **1,330 ms** (one long task, from the click) | 0                                                                                                                      | 0                             |
| V2      | Plan → Section again (warm)  | **1,040 ms**                                 | 0                                                                                                                      | 0                             |

Of the 49 ten-minute slider steps from 12:00 to 20:00, 48 are quiet (no long
task, no link, gap ≤ 60 ms). The one that is not is the minute the sun
crosses the horizon. The CPU profile of S1b is unambiguous: 698 ms of 700 ms
is `getProgramInfoLog` self time — the main thread waiting for the GPU
driver to finish linking shader programs.

### 2.2 A — the sunset crossing re-keys every program in the scene

`createPreviewViewport.js:1716`, at the end of `applySun()`:

```js
keyLight.castShadow = keyLight.intensity > 0;
```

`keyLight.intensity` goes to 0 the moment `sunIsUp` is false
(`createPreviewViewport.js:1636`), so at sunset `castShadow` flips true → false,
and at sunrise back. In three 0.183.2 that flip is a program change for
**every material drawn**, lit or not:

- `WebGLLights.setup` counts `numDirectionalShadows` from `light.castShadow`
  (`three.module.js:8662–8678`); when it changes, the lights hash changes and
  `state.version` is bumped (`8826`, `8857`, `8864`).
- `WebGLRenderer.setProgram` then sees `materialProperties.lightsStateVersion
!== lights.state.version` for every lit material (`18118`) and calls
  `getProgram`.
- `numDirLightShadows` is part of the program parameters (`7752`) **and is
  pushed into the cache key for every material**, not only lit ones
  (`getProgramCacheKeyParameters`, `7883`) — which is why `MeshNormalMaterial`
  (the GTAO normal pass) and `BackgroundCubeMaterial` relink too.
- The new programs link lazily in the first frame that draws them
  (`getUniforms` → `onFirstUse` → `getProgramInfoLog`), the mechanism
  `docs/loading-states.md` §2.2 documents. Nothing gates that frame.

The Night button (`ThreePreviewPanel.jsx:680` → `setInteriorLighting` →
`applySun`, `createPreviewViewport.js:2050`) sets `keyLight.intensity = 0`
(`1694`) and so flips the same flag — N1 is the same defect from a second
door. The `scheduleShaderWarmup()` after it (`2059`) runs 250 ms _after_ the
first frame has already linked everything on the main thread.

The comment above line 1716 explains why the flip was added: with the sun
down, a shadow pass for a light of zero intensity is a wasted render per
accumulated sample. That goal is right; the mechanism is wrong. Three has a
per-light switch that skips the pass without touching program identity:
`WebGLShadowMap.render` skips a light whose `shadow.autoUpdate === false &&
shadow.needsUpdate === false` (`three.module.js:9224`), and `LightShadow`
carries both flags (`9140`). This viewport already drives the global pass by
hand (`renderer.shadowMap.autoUpdate = false`, `:304`; `markShadowsDirty` →
`renderer.shadowMap.needsUpdate` in `onBeforeSample`, `:544–551`), so the
per-light flag slots straight in.

### 2.3 A′ — turning the study on re-links the lit materials (web build)

S0 links the six lit-material programs as well. The cause is the environment
map's size, not the light: a program's cache key includes
`envMapCubeUVHeight` (`three.module.js:7478`, `7630`, `7848`), from which the
`CUBEUV_TEXEL_WIDTH` / `CUBEUV_TEXEL_HEIGHT` / `CUBEUV_MAX_MIP` defines are
generated (`6678`). The studio environment is prefiltered at
`STUDIO_SIZE = 256` (`createEnvironment.js:36`, `:273`). The sky is a
`CanvasTexture` of **512 × 256 on the web** and 1024 × 512 only under
Electron (`createSunSky.js:207–208`), and `PMREMGenerator._fromTexture` sizes an
equirectangular prefilter at `image.width / 4` (`three.module.js:2882`) — so
the sky environment is 128 on the web and every lit material gets a new
program when `scene.environment` switches to it (`createPreviewViewport.js:1586`).
The same size difference is why `PMREMGGXConvolution` links again at S0
although the studio warm-up compiled the PMREM filters: the blur shader's
defines depend on the prefilter size.

Under Electron the sizes already match; the three one-time conversion
programs (`EquirectangularToCubeUV`, `PMREMGGXConvolution` at the matching
size, `CubemapFromEquirect` for the background) still link on first use
there.

### 2.4 B — the section view computes everything in the click's task

`SET_VIEW_MODE` (`floorplanReducer.js:1526`) is dispatched by both
`SectionCutProperties.jsx:94` ("Open section view") and the toolbar
(`Toolbar.jsx:415`). The same render commit then does all of this
synchronously:

1. `SvgCanvas.jsx:906–912` builds a full section scene
   (`buildProjectSectionScene`) in a `useMemo` whose only consumers are two
   status-bar diagnostic strings (`:916–924`, `CanvasStatusBar` props
   `:1099–1100`) and `SectionViewControls` (`:961–965`).
2. `FloorScene.jsx:171–180` → `SectionRenderer.jsx:41–44` builds the **same
   scene a second time** (same inputs, separate memo).
3. `SectionSceneLayer.jsx:130` calls `getVisibleSectionDrawables(scene)` in
   the render body. That is where the time goes: the CPU profile of V1 is
   almost entirely `polygon-clipping` (`compare`, `checkForConsuming`,
   `split`, `process`, …). `sections/visibility.js:40–77` adapts the scene and
   hands it to `elevations/visibility.js:106–141`, which for every drawable
   clips every overlapping opaque drawable to its nearer part
   (`nearerPart`) and subtracts all of them from the element in **one**
   `polygonClipping.difference` call (`polygonBoolean.js:173–185`), then
   `unionRegions` the pieces back per stroke group. 80 drawables come out for
   the first floor's first cut; the pair loop is O(n²) in the drawable count
   and each difference call carries every cut at once — the same "many
   overlapping polygons in one sweep" shape the sun study hit
   (`analysis/sunStudyPerformance.test.js`).
4. Both caches are per-object `WeakMap`s keyed on the scene
   (`sections/visibility.js:4`, `elevations/visibility.js:5`). The scene is a
   new object every time `SectionRenderer` mounts, so leaving and re-entering
   the view (V2) pays the full price again. Any model edit or a depth change
   in `SectionViewControls` (`DepthInput` → `SECTION_UPDATE`) changes the
   project identity and pays it again, with no stale state in between.
5. `RoofSectionRenderer.jsx:51` and `TrussSectionRenderer.jsx:51` call
   `buildProjectSectionScene` in their render bodies with no memo at all.

Nothing on screen changes until step 3 finishes: no bar, no words, the
toolbar button does not even show as pressed because that commit is the one
that is blocked.

The elevation views (`ElevationRenderer.jsx:7`, `ElevationSceneLayer.jsx:212`)
and the elevation click handler (`elevationSelectHandler.js:25–29`) use the
same visibility pass and the same scene-keyed caches — see §2.5.

### 2.5 Elevation views and the second floor, measured

Same session, same fixture, toolbar buttons from plan (`repro-freezes-3.mjs`):

| Transition                                  | Longest frame gap | Long task                  | Paths drawn |
| ------------------------------------------- | ----------------- | -------------------------- | ----------- |
| Front elevation                             | 204 ms            | 1 (203 ms, from the click) | 84          |
| Left elevation                              | 180 ms            | 1 (179 ms)                 | 94          |
| Rear elevation                              | 169 ms            | 1 (167 ms)                 | 72          |
| Right elevation                             | 170 ms            | 1 (169 ms)                 | 76          |
| Section, floor 1 ("first floor"), first cut | 1,077 ms          | 1 (1,075 ms)               | —           |
| Section, floor 2 ("2ndflvor"), first cut    | 1,103 ms          | 1 (1,101 ms)               | —           |

So the elevations are the same defect at a sixth of the size: one
synchronous task from the click, over the 150 ms rule, under the 300 ms
words threshold. They take the same hook and cache (§4.3), and their
placeholder will normally never reach its words. The section cost is not a
one-floor accident.

## 3. What must be true afterwards

Targets, all measured by the script in §6 on the §2 fixture, dev server:

| #       | Transition                                       | Longest frame gap                                                                                                             | Programs linked                                                                |
| ------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| S1b     | slider across sunset (first time in the session) | ≤ 50 ms                                                                                                                       | 0                                                                              |
| S1d     | slider back across sunrise                       | ≤ 50 ms                                                                                                                       | 0                                                                              |
| N1 / N2 | Night on / off                                   | ≤ 50 ms                                                                                                                       | 0                                                                              |
| S0      | study On, first time (web build sizes)           | ≤ 150 ms, and no gap > 150 ms while anything is `aria-busy`                                                                   | ≤ 3 one-time conversion programs, or 0 if they are warmed at viewport creation |
| V1      | Section view, cold                               | first visible response ≤ 100 ms; no frame gap > 150 ms from the click until the drawing is complete; drawing complete ≤ 1.5 s | 0                                                                              |
| V2      | Section view again, project unchanged            | ≤ 50 ms, no words                                                                                                             | 0                                                                              |
| V3      | depth edit / model edit while in section view    | old drawing stays under a region bar; no gap > 150 ms                                                                         | 0                                                                              |
| E       | each elevation view (Front/Rear/Left/Right)      | first visible response ≤ 100 ms; no frame gap > 150 ms; drawing complete ≤ 400 ms cold, ≤ 50 ms warm                          | 0                                                                              |

And the pictures must not change: the sun-down preview looks as it does today
(no shadow, night rig at nautical twilight), the day preview still casts
shadows, the section drawing is pixel-identical (same drawables, same
order, same clip regions) — the existing section tests pin this.

## 4. The fixes

### 4.1 A — never flip `castShadow`; skip the pass with the per-light flag

In `createPreviewViewport.js`:

- `keyLight.castShadow` is set once at creation (`:353`) and never written
  again. Delete line 1716.
- Replace it with the per-light switch: when `keyLight.intensity > 0`,
  `keyLight.shadow.autoUpdate = true` (or leave it and rely on
  `markShadowsDirty` as today); when it is 0, `keyLight.shadow.autoUpdate =
false` and `keyLight.shadow.needsUpdate = false`, so
  `WebGLShadowMap.render` skips the light (`three.module.js:9224`) while the
  program keeps its `NUM_DIR_LIGHT_SHADOWS 1` identity. Because the global
  `renderer.shadowMap.needsUpdate` is still raised by `onBeforeSample`
  (`:548`), make sure the per-light flag is what wins when the sun is down —
  read three's loop at `9220–9230` and `9417` before deciding whether
  `needsUpdate` must be cleared each sample. Keep the comment's intent
  ("nothing to cast, no pass") but describe the new mechanism and why the
  old one relinked everything.
- The shadow map that remains bound when the sun is down holds the last
  daylight pass. A light of intensity 0 contributes nothing, so a stale map
  is harmless to the picture — but confirm with the §6 pixel check (the
  sun-down frame before and after the change must be identical within
  noise) rather than by reasoning.
- The Night button goes through the same `applySun` and gets the same fix
  for free. Remove or keep `scheduleShaderWarmup()` at `:2059` as you find
  it useful; it must no longer be load-bearing.
- `aimKeyLight` (`:498–540`) keeps moving the light while the sun is down
  (the jitter re-aim); with the per-light flag off that marks nothing worth
  rendering, which is the point. If you find the per-sample re-aim still
  costs a shadow pass, gate `markShadowsDirty()` on `keyLight.intensity > 0`
  there too.

### 4.2 A′ — one environment size, and the conversion programs warmed

- Make the sky's prefilter size equal to the studio's. The simplest: paint
  the sky canvas at 1024 × 512 on every platform (`createSunSky.js:207–208`),
  so `width / 4 === STUDIO_SIZE`. Measure what `paintSky` costs per slider
  step at that size (it is a gradient fill + a radial glow + three
  `fillRect`s, `createSunSky.js:244–309`) — it must stay a few milliseconds.
  Alternatively keep 512 × 256 for the visible backdrop and prefilter from a
  separately sized source; the first option is preferred unless the paint
  cost says otherwise. Tie the two constants together in code (import
  `STUDIO_SIZE` or share a `ENVIRONMENT_PREFILTER_SIZE`) so they cannot drift
  again, with a unit test that asserts `skyCanvas.width / 4 === STUDIO_SIZE`
  (createSunSky.test.js can construct the sky under jsdom? it currently
  tests `sunWorldDirection` and `skyPalette` only — if the canvas cannot be
  created there, test the constant relationship instead).
- Warm the three one-time programs in the studio warm-up's lights-free stage
  (`createEnvironment.js:196–262`, the `passes` group that already compiles
  the PMREM filters and the `PMREM.Background` stand-in): the
  equirect→cubeUV conversion material (`PMREMGenerator`'s
  `_equirectMaterial`, name `EquirectangularToCubeUV`), the blur material
  at the _matching_ size, and the background's `CubemapFromEquirect`
  conversion (`WebGLCubeRenderTarget.fromEquirectangularTexture`'s
  ShaderMaterial). Mirror how `createBackgroundWarmup`
  (`compileScenePrograms.js:94`) builds a stand-in from `ShaderLib` so the
  linked program is the very one three will use, and keep each stand-in
  alive until the real one has drawn (the lesson in
  `docs/loading-states.md` §6.2 / memory: three destroys a program nothing
  holds). If the stand-ins cannot be made to match (verify with the link
  probe: the names must not appear again at S0), the fallback is to run
  `environment.skyEnvironment` once against a blank 1024 × 512 canvas inside
  the warm-up, after `studioEnvironmentPrepared`, so the links happen off
  the user's click.
- Either way the acceptance is the §3 S0 row, measured.

### 4.3 B — the section view: paint first, compute after, cache by project

Four parts; do them in this order and measure after each.

**4.3.1 One scene per project.** Add a cache in `src/sections/scene.js` (or a
sibling `sectionSceneCache.js`) keyed on `(project identity, floorId,
sectionCutId)`: a `WeakMap<project, Map<string, scene>>`. `buildProjectSectionScene`
stays pure; a `getProjectSectionScene(project, floorId, cutId)` wrapper is what
`SvgCanvas.jsx:885/898/911`, `SectionRenderer.jsx:42`, `RoofSectionRenderer.jsx:51`,
`TrussSectionRenderer.jsx:51` and any sheet/PDF caller use. `filteredProject`
is a stable memo for a given project + phase view, so the diagnostics build
in `SvgCanvas` and the renderer's build become one build. The visibility
caches (`sections/visibility.js:4`, `elevations/visibility.js:5`) are already
scene-keyed, so with a stable scene V2 becomes a cache hit. Do the same for
`buildProjectElevationScene` (`elevations/scene.js:312`) — the elevation
click handler rebuilds a scene on every click today (`elevationSelectHandler.js:25`).

**4.3.2 Compute off the click, in slices.** The visibility pass is the
cost, and it is naturally sliceable: each drawable's cuts and difference are
independent of the others (`elevations/visibility.js:125–138`), and the
final sort is cheap. Turn `getVisibleElevationDrawables` into a resumable
job — `createVisibilityJob(scene)` that exposes `step(budgetMs)` returning
progress `{ done, resolved, total }` — and keep the synchronous
`getVisibleElevationDrawables(scene)` as `run the job to completion` for
tests, sheets, PDF and the click handler. A hook
(`useSectionDrawables(scene)` / `useElevationDrawables(scene)` in
`src/features/floorplan/hooks/`) drives the job after paint
(`useAfterPaint` from the kit) in frames of ≤ 12 ms, yielding with
`scheduler.yield()` where it exists and `MessageChannel`/`setTimeout(0)`
otherwise (no `requestIdleCallback`: it starves under continuous input),
caching the result on the scene object exactly as today so every later
reader — including the synchronous path — gets it free. A worker is the
alternative (`sunStudy.worker.js` is the precedent and the scene is plain
data); it is more code and moves the structured-clone cost onto the click,
so prefer slicing unless the measured total cannot be brought under the §3
budget on the main thread. Your call; say which and why.

Also cut the algorithm's constant factor where it is cheap and safe: drop a
cut whose clipped bounds no longer overlap the element; skip the difference
entirely when a single cut contains the element's outline; and consider
`difference` against the union of the cuts once per element rather than N
cuts in one call only if a vitest perf test (model it on
`analysis/sunStudyPerformance.test.js`, with the §2 fixture) shows it faster.
Output must be identical — `SectionSceneLayer.test.jsx` and
`SectionRenderer.dom.test.jsx` are the pins; add a determinism test that the
sliced job and the synchronous run produce deep-equal drawables.

**4.3.3 The loading state** (the user asked for it by name). Kit rules
§3.1–3.9 of `docs/loading-states.md`:

- _Answer within 100 ms._ The `SET_VIEW_MODE` commit must be cheap: with
  4.3.1 and 4.3.2 the commit renders the section's paper and nothing heavy.
  The toolbar's Section button shows pressed on the next frame; the status
  bar's `View: section_view` updates.
- _Paint before you work._ `FloorScene`'s section branch renders the
  drawing when the hook has it and a `SectionPlaceholder` (SVG, inside the
  plan `<svg>`, a twin of `SheetPreviewPlaceholder.jsx`) when it does not:
  faint grid paper over the section's envelope — cut length × floor-stack
  height, from `sectionCutLength` and `getFloorStackBounds`
  (`floorModels.js:250`), microseconds — the ground line, the title, and the
  words after 300 ms: `LOADING_COPY.cuttingSection` ("Cutting section
  A-A…" with the cut's label, falling back to "Cutting section…"), detail
  at 2 s `LOADING_COPY.cuttingSectionDetail` ("Working out what the cut can
  see"). `data-loading-state="loading"` and `aria-busy="true"` on the
  placeholder group; `role="status"` on the words, once.
- _Keep the context._ The drawing may land progressively: as slices resolve,
  draw what is resolved (cut faces first — they sort first) over the paper,
  or land all at once with the kit's 300 ms crossfade. Progressive is
  preferred if it reads well; if partial pictures look like missing
  geometry, land at once. Say which you chose.
- _Stale, not blank._ A depth edit (`SectionViewControls`) or any model edit
  while in the view keeps the previous drawables on screen under a region
  `LoadingBar` with a `LoadingPill` labelled `LOADING_COPY.recomputing`
  (the existing "Recomputing…"), until the new job completes — the same
  shape as daylight/solar overlays (`docs/loading-states.md` §5.8). The
  3D pane's "Catching up…" (`ThreePreviewPanel.jsx:597–812`) is the visual
  precedent for a chip over a picture.
- _Warm re-entry shows no words._ V2 completes from cache under 150 ms, so
  the placeholder never gets to 300 ms; verify no words flash.
- Tests render synchronously: like `DetailEditorShell`'s `mountShellFirst`,
  give the hook a way to resolve immediately when there is no browser frame
  to wait for (e.g. run the job to completion synchronously when
  `typeof requestAnimationFrame === 'undefined'` or behind an explicit
  prop), so `SectionRenderer.dom.test.jsx` keeps passing without
  rewriting it around timers.
- Elevation views get the identical treatment (§2.5 measures them at
  170–204 ms): same hook, an `ElevationPlaceholder` (or the same component
  given the floor's elevation envelope — building extent along the view
  axis × stack height), copy `LOADING_COPY.drawingElevation` ("Drawing the
  front elevation…"). With a ≤ 400 ms cold target the words will rarely
  show; the placeholder's paper still must, because the pressed button and
  the paper are the 100 ms answer.

**4.3.4 The sheet and PDF paths** must keep rendering synchronously
(`getVisibleSectionDrawables` run-to-completion), and benefit from 4.3.1.

### 4.4 Copy

Add to `src/ui/loading/loadingCopy.js` (verb first, real nouns):

```js
cuttingSection: (label) => (label ? `Cutting section ${label}…` : 'Cutting section…'),
cuttingSectionDetail: 'Working out what the cut can see',
drawingElevation: (side) => `Drawing the ${side} elevation…`,
```

(or plain strings with a `formatSection` helper — follow the file's existing
style for `formatCount`).

## 5. Files

- `src/features/floorplan/components/preview/createPreviewViewport.js` —
  §4.1 (`:353`, `:1716`, `:544–551`, `:2050–2060`, `aimKeyLight`).
- `src/features/floorplan/components/preview/createSunSky.js` — §4.2 size.
- `src/features/floorplan/components/preview/createEnvironment.js` — §4.2
  warm-up stage; `STUDIO_SIZE` shared.
- `src/features/floorplan/components/preview/compileScenePrograms.js` — new
  stand-ins beside `createBackgroundWarmup`.
- `src/sections/scene.js`, `src/elevations/scene.js` — project-keyed caches.
- `src/elevations/visibility.js`, `src/sections/visibility.js` — the
  resumable job; synchronous wrappers unchanged in signature.
- `src/features/floorplan/hooks/useSectionDrawables.js` (new; one hook can
  serve both views).
- `src/features/floorplan/components/renderers/FloorScene.jsx`,
  `SectionRenderer.jsx`, `SectionSceneLayer.jsx`, `ElevationRenderer.jsx`,
  `ElevationSceneLayer.jsx`, `RoofSectionRenderer.jsx`,
  `TrussSectionRenderer.jsx`, `SvgCanvas.jsx` (`:880–925`, `:961–965`).
- `src/features/floorplan/components/renderers/SectionPlaceholder.jsx` (new,
  modelled on `SheetPreviewPlaceholder.jsx`).
- `src/ui/loading/loadingCopy.js`.
- `scripts/verify-night-section-freezes.mjs` (new, §6).
- Tests: `createSunSky.test.js` or a new `environmentSize.test.js`;
  `elevations/visibility.test.js` (job vs sync determinism, perf);
  `SectionRenderer.dom.test.jsx` / `SectionSceneLayer.test.jsx` stay green;
  a DOM test for the placeholder's words timing is optional — the script
  covers it.

## 6. Verification

`scripts/verify-night-section-freezes.mjs`, grown from the three scratchpad
scripts named in §2 (fixture seeded through localStorage with the Manila
site patch; `MSYS_NO_PATHCONV=1 node …`; dev server `npx vite --port 5199
--strictPort`; `--base`, `--json` like `verify-loading-states.mjs`). It must:

1. Print the §2.1 table for S0, S1a–S1e, N1, N2, V1, V2, V3 (depth 3000 →
   2000 while in section view), V-floor-2, E (Front, Left) — gap, long
   tasks, links by `SHADER_TYPE`/`SHADER_NAME`, info-log ms — with
   PASS/FAIL against §3. Note for the slider: wait ≥ 1.5 s after a step
   before reading the probe, or a freeze longer than the wait reads as a
   0 ms gap (the first scratchpad script made that mistake at 17:30).
2. Assert the DOM for V1: the toolbar Section button is `aria-pressed`
   within 100 ms; a `[data-loading-state="loading"]` placeholder exists in
   the plan `<svg>` before the drawing; words appear at 300 ± 50 ms if the
   drawing is not complete by then and stay ≥ 400 ms; `g.section-view`
   drawables count equals the synchronous count (80 for the first floor's
   first cut on this fixture — read it from the page, do not hardcode).
3. Pixel check for 4.1: screenshot the 3D pane at 17:40 before and after
   the change (run once on a baseline worktree with `--base`), mean
   absolute difference ≤ 1/255 over the pane; and at 12:00 the shadow is
   still there (the pane must differ from the 17:40 frame).
4. Exit non-zero on any FAIL.

Plus `npm test`, `npm run lint`, and `MSYS_NO_PATHCONV=1 node
scripts/verify-loading-states.mjs` still passing (it exits 1 for the known
A standing miss, see memory — compare against the current baseline, do not
make it worse).

## 7. Out of scope

- Any change to the shadow look, the night rig's numbers, the twilight
  blend, or the sun study's 2D results.
- Making section geometry itself (`buildProjectSectionScene`) faster beyond
  not building it twice; it is not where the time is.
- The elevation views' _appearance_.
- A worker for the section visibility unless slicing fails the §3 budget.
- The X-ray / wireframe modes' own compile gate (`requestViewMode`,
  `createPreviewViewport.js:1536–1562`) — unchanged contract.
