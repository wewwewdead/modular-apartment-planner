# The "All day" sun-study freeze on the time slider

Spec for the fix. Written 2026-11-07 after the night-crossing fix
(`docs/night-section-freezes.md`) shipped and the user reported the freeze
again: "the bug is still there when i turned on the sun, like if i slide from
2pm to 7pm it will freeze."

## 1. What happens

With the sun study in **All day** mode, every step of the time-of-day slider
freezes the whole window for 1.2–1.8 s. Moment and Sun hours modes are fine
(≤ 40 ms per step). It reproduces in the Electron desktop app on the user's own
projects and in headless Chrome on the bench fixture, with the night-crossing
fix in place. The slider feels dead: a drag from 14:00 to 19:00 arrives at
19:00 seconds late, one frozen step at a time.

Two more defects come from the same root cause and are fixed by the same
change:

- The **All day** readouts are wrong. The bench fixture's envelope area is
  reported as 111,900 m²; the true envelope is 4,932 m² (22× over).
  `targetShadowFraction` for a target polygon is likewise inflated, because
  `shadowCoverageOfPlot` intersects the plot with every overlapping piece.
- The drawn envelope (and, at some moments, the instant shadow) is a stack of
  thousands of overlapping polygons drawn as ONE `fill-rule="evenodd"` path,
  so wherever an even number of pieces overlap the fill cancels to nothing:
  holes appear inside solid shadow.

## 2. Measurements

All numbers from this session. Scripts and raw logs are in the session
scratchpad (`repro-allday.mjs`, `repro-electron-variants.mjs`,
`envelope*.probe.test.js` → `envelope-probe*.json`).

### 2.1 Slider step, frame gap from the input event (ms)

| Environment                                                        | Mode        | 14:30                                                              | 15:00     | 16:00     | 17:00     | 17:30     | 18:00 |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------ | --------- | --------- | --------- | --------- | ----- |
| Headless Chrome, bench fixture (Manila)                            | Moment      | 62                                                                 | 15        | 13        | 35        | 20        | 9     |
| Headless Chrome, bench fixture                                     | **All day** | **1,668**                                                          | **1,635** | **1,828** | **1,795** | **1,755** | 35    |
| Headless Chrome, bench fixture, the two envelope `<path>`s hidden  | All day     | –                                                                  | 22        | 33        | 22        | –         | –     |
| Electron (built dist, user's project "Untitled Project", 2 floors) | Moment      | worst step 21                                                      |           |           |           |           |       |
| Electron, same                                                     | **All day** | worst step **1,177**; paced drag 14:00→19:00 longest gap **1,575** |           |           |           |           |       |
| Electron, same                                                     | Sun hours   | worst step 19; drag 28                                             |           |           |           |           |       |

18:00 is fast because the instant shadow is empty after sunset: nothing in the
layer changes, so the envelope is not re-rasterised.

No long task is reported for any of these steps (the probe's
`PerformanceObserver('longtask')` sees nothing): the main thread is free. A
Chrome trace of the 15:00 step puts the time on the **GPU raster worker**:
`RasterDecoderImpl::DoRasterCHROMIUM` 1,644 ms of the 1,715 ms `GPUTask`, main
thread `BeginMainFrame` 130 ms total. The compositor cannot produce the next
frame until that raster finishes, which is why `requestAnimationFrame` stalls
and the slider stops moving.

### 2.2 What is being rasterised

`ShadowOverlay` draws the envelope twice from the same path string — the fill
(`data-type="shadow-envelope-fill"`, `fill-rule="evenodd"`) and the dashed
outline (`data-type="shadow-envelope-outline"`). On the bench fixture that
path string is **944,628 characters**, bounding box 331 m × 93 m, made of
**8,408 regions and 45,739 vertices**. Every repaint of the sun-study layer
(any change of the instant-shadow path, i.e. every slider step) rasterises
both copies again. `decimateRegions` cannot help: Douglas–Peucker at 100 mm
still leaves 32,597 vertices, because these are real corners of thousands of
small polygons, not collinear noise.

### 2.3 Why there are 8,408 regions: the union throws and the fallback is the unmerged set

`unionRegions` (`src/geometry/polygonBoolean.js`) catches any
polygon-clipping error and returns `polygons.flatMap(...)` — every input piece,
unmerged. That fallback fires for the day envelope on BOTH projects measured,
and for many single moments:

| Union                                                                     | Bench fixture (11 masses, 44 moments)                                                  | User's `apartment_project2` (28 masses, 46 moments)               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Per-moment pieces, raw floats                                             | throws at **16 of 44** moments ("Unable to find segment …") → 247 unmerged pieces each | throws at 3 of 46 → 185 pieces                                    |
| Per-moment pieces, snapped to 1 mm                                        | **44 / 44 succeed**, mean 28 ms, max 48 ms                                             | **46 / 46**, mean 12 ms, max 25 ms                                |
| Day envelope, one `union(...)` call over the 44 moment polygons (snapped) | throws ("Unable to pop() left SweepEvent")                                             | throws                                                            |
| Day envelope, **incremental** union over the 44 moment polygons (snapped) | 1 polygon, 129 vertices, 6 holes, **4,932 m², 9 ms**, 0 skipped                        | 1 polygon, 505 vertices, 48 holes, **2,154 m², 51 ms**, 0 skipped |
| Day envelope today (`shadowRangeEnvelope`)                                | **8,408 regions, 45,739 vertices, 111,900 m²**                                         | (same failure mode)                                               |

The errors are polygon-clipping's known failure on coincident edges: every
edge quad in `massShadowPieces` shares its edges exactly with the base and top
caps and with its neighbours, and consecutive moments share the footprint
edges. Snapping the coordinates to an integer millimetre grid before the union
removes the sub-ulp disagreements that the sweep line cannot order. The
all-at-once day union still fails even snapped; merging the moments one at a
time does not, and is fast because each step is a union of two simple
polygons.

(`polygonClipping` snapped to 1 mm but with the 247-piece fallback sets as
input went into "Infinite loop when passing sweep line over endpoints" after
8 s — never pass an unmerged fallback into a further union.)

### 2.4 Where the costs sit today

- Day study (`computeDayStudy` → `shadowRangeEnvelope`): runs on the sun-study
  worker in All day / Sun hours modes (`useSunDayStudy`), 617 ms on the bench.
  Its result is what is drawn and what the readouts use.
- Instant shadow (`computeInstantShadow` → `castShadows`): main thread, once
  per slider step, 11–30 ms today (polygon-clipping `compare` dominates the
  drag profile in Moment mode). Succeeds at some moments, falls back at others.
- Raster of the sun-study layer: GPU raster worker, 1.6 s per step with the
  fallback envelope on screen.

## 3. Targets

Measured by `scripts/verify-all-day-shadow.mjs` (§6) on the dev server
(`npx vite --port 5199 --strictPort`), bench fixture with the Manila site,
headless Chrome, plus unit tests (§7).

| Check                                                               | Target                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 All day mode, slider steps 14:30/15:00/16:00/17:00/17:30         | longest frame gap ≤ 50 ms each                                                                                                                                                                                                                            |
| A2 All day mode, paced drag 14:00 → 19:00 (59 input events)         | longest frame gap ≤ 60 ms, no long task > 50 ms                                                                                                                                                                                                           |
| A3 Moment mode, same steps and drag                                 | ≤ 50 ms / ≤ 60 ms (no regression)                                                                                                                                                                                                                         |
| A4 Sun hours mode, same steps                                       | ≤ 50 ms                                                                                                                                                                                                                                                   |
| D1 `path[data-type="shadow-envelope-fill"]` `d` length on the bench | ≤ 20,000 characters (today 944,628)                                                                                                                                                                                                                       |
| D2 regions in the drawn envelope                                    | ≤ 10 (today 8,408)                                                                                                                                                                                                                                        |
| D3 the sun-study layer's total path vertices, any mode              | ≤ 5,000 at all times (a guard, §4.3)                                                                                                                                                                                                                      |
| U1 bench envelope area (`envelopeAreaMm2`)                          | 4,932 m² ± 1 % (today 111,900)                                                                                                                                                                                                                            |
| U2 bench envelope regions                                           | ≤ 10, 0 unmerged fallbacks                                                                                                                                                                                                                                |
| U3 per-moment `castShadows` on every bench sample above 1°          | 1 region (no fallback), ≤ 60 ms each                                                                                                                                                                                                                      |
| U4 `unionRegions` on the recorded throwing input (§7)               | returns a merged result, not the unmerged set                                                                                                                                                                                                             |
| P1 pixels                                                           | the All day envelope at 15:00 still covers the same ground as before (compare the bitmap of the layer rendered from the exact rings: mean difference ≤ 2/255 inside the old envelope's bounding box, after the overlapping-piece holes are gone — see §6) |

Electron is not in the script's contract; the audit reruns the Electron variant
script against the built dist (`npm run build`, then
`repro-electron-variants.mjs`) and expects the All day rows under 60 ms.

## 4. The fix

### 4.1 `unionRegions` never returns the unmerged set silently

In `src/geometry/polygonBoolean.js`:

1. **Snap before every union.** Add `snapRing(points, grid = 1)` (exported) that
   rounds x and y to the grid in millimetres, and apply it in `toLibraryRing`
   for `unionRegions`, `subtractPolygons`' inputs and `intersectionArea`. One
   millimetre is far below anything a shadow or a section cut claims; the
   analytics already quote areas to the square metre. Dedupe consecutive
   identical points a snap can create (and drop rings left with < 3 points).
2. **Fallback that still merges.** On a throw from the one-call union, do an
   incremental union: accumulate piece by piece with a try/catch per piece;
   a piece that throws is retried once with a 2 mm snap, and only if that also
   throws is it appended as its own region. Count what was appended.
3. **Report, don't hide.** `unionRegions(regions, { stats })` fills an optional
   `stats` object: `{ merged, appended, strategy: 'single' | 'incremental' }`.
   `console.warn` once per session when `appended > 0` (dev builds only), so a
   silent fallback cannot come back unnoticed. Keep the signature backwards
   compatible — every existing caller passes one argument.
4. `pairwiseUnion` keeps its shape but each pair union is guarded the same way
   (on throw, union the two incrementally rather than failing the round).

`subtractPolygons`' own catch (the section/elevation latent bug noted in
`docs/night-section-freezes.md`) is out of scope here except for the snapping
in step 1; measure whether snapping alone reduces the 60 throws there and
record the number in the PR notes, but do not change its fallback.

### 4.2 The envelope is a union of moments, not of pieces

In `src/analysis/shadowProjection.js`:

- `castShadows` stays "union of this moment's pieces" and must now succeed at
  every bench sample (U3). It keeps `minAltitudeDeg = 1`.
- `shadowRangeEnvelope` already resolves each moment first; make the final
  merge explicitly incremental over the moment results (`unionRegions` with the
  incremental strategy — pass an option `{ strategy: 'incremental' }` rather
  than relying on the throw path, since the one-call union fails on both
  projects measured and the throw costs time). The order is chronological.
- Never feed a moment that fell back (more than, say, 8 regions from a
  handful of masses) into the day union as-is: union its regions incrementally
  first. With 4.1 this should not happen; keep the guard cheap.

The day study still runs on the worker; the instant shadow still runs on the
main thread per step and must stay under 60 ms on the bench (U3).

### 4.3 The overlay guards its own complexity

In `src/features/floorplan/components/renderers/ShadowOverlay.jsx`:

- Keep `decimateRegions` for the display path.
- Add a complexity guard: count the vertices of what is about to be drawn
  (envelope + instant shadow + target). If the sun-study layer would exceed
  **5,000 vertices**, draw the envelope as a bitmap instead of a path: reuse the
  sun-hours approach (`useSunHoursImage` → a shared `useRegionsImage(regions,
bounds, maxPixels)` that fills the regions into an offscreen canvas with a
  nonzero rule at ≤ 2048 px on the long side and returns a data URL for one
  `<image>`), and drop the dashed outline in that case. Overlapping pieces then
  cannot cancel, and the raster cost is one texture whatever the input. This is
  a safeguard for inputs the union still cannot merge; on the bench fixture
  after 4.1–4.2 the path route is taken (D1, D2).
- The instant shadow keeps its path, but when it is made of more than one
  region each region is its own `<path>` with `fill-rule="nonzero"` — one
  evenodd path across overlapping regions is what produced the holes.
- The `aria`/`data-` contract: `g[data-layer="sun-study"]` gains
  `data-envelope-vertices` and `data-envelope-render="path" | "image"` so the
  verify script and tests can read them.

### 4.4 Readouts

With 4.1–4.2 `envelopeAreaMm2` and `targetShadowFraction` become correct by
construction. Add the bench numbers to `sunStudyRunner.test.js` (U1, U2).

## 5. Files

- `src/geometry/polygonBoolean.js` (+ `polygonBoolean.test.js`): snapping,
  incremental fallback, stats, guarded pairwise rounds.
- `src/analysis/shadowProjection.js` (+ `shadowProjection.test.js`):
  incremental day union, per-moment guard.
- `src/analysis/sunStudyRunner.test.js`: bench envelope area and region count.
- `src/features/floorplan/components/renderers/ShadowOverlay.jsx` (+
  `ShadowOverlay.dom.test.jsx`): complexity guard, bitmap route, per-region
  instant paths, data attributes.
- `scripts/verify-all-day-shadow.mjs` (new): §6.
- A fixture for the throwing input: `src/geometry/__fixtures__/` or inline —
  the per-moment pieces of the bench fixture at the 2.2° sample (247 pieces)
  are enough; generate them with `massShadowPieces` in the test rather than
  checking in 247 polygons.

## 6. Verify script contract (`scripts/verify-all-day-shadow.mjs`)

Same skeleton as `scripts/verify-night-section-freezes.mjs` (Playwright,
`channel: 'chrome'`, `--use-angle=d3d11`, the bench fixture seeded through
localStorage with the Manila site, `MSYS_NO_PATHCONV=1`). The slider is driven
with the same `setSlider` (native value setter + `input` event) for steps and
with `page.mouse` for the paced drag (100 moves × 16 ms). Read a step 1.5 s
after the input: the gap is the longest interval between two animation frames
from the input's `timeStamp`.

Prints one table with A1–A4 and D1–D3, PASS/FAIL per row against §3, and the
P1 pixel check: screenshot the plan `<svg>` region at 15:00 in All day mode
before (baseline run with `--base` against a pre-change server, like the night
script's `--baseline`) and after; report the mean difference inside the old
envelope's bounding box. Exit non-zero on any FAIL. Flags: `--base`, `--json`,
`--baseline`, `--only sun|overlay`.

## 7. Tests

- `polygonBoolean.test.js`: (a) the recorded throwing input — the 247 pieces of
  the bench's first sample above 1°, built in the test with
  `buildAnalysisMassing` + `massShadowPieces` — merges to ≤ 3 regions through
  `unionRegions` with `stats.appended === 0`; (b) a hand-made coincident-edge
  case (two squares sharing an edge, plus the quad between them) merges to one
  region; (c) the incremental fallback keeps every piece (area of the result
  equals the area of the one-call result on an input that does not throw).
- `shadowProjection.test.js`: bench envelope ≤ 10 regions, area 4,932 m² ± 1 %,
  every sample's `castShadows` is 1 region.
- `ShadowOverlay.dom.test.jsx`: the guard switches to `data-envelope-render=
"image"` above 5,000 vertices and stays on `"path"` below; the instant
  shadow draws one `<path>` per region with `fill-rule="nonzero"`.
- `sunStudyPerformance.test.js` stays green (a slider step must not rebuild the
  day).

## 8. Out of scope

- Replacing polygon-clipping (Clipper2 would remove this class of failure for
  sections and elevations too; note it as a follow-up, do not do it here).
- The section/elevation `subtractPolygons` fallback bug.
- The 3D pane: unaffected (the night-crossing fix holds; 0 program links across
  the whole 14:00–19:00 sweep in every run).
- The desktop app does not pick up source changes until `npm run build` is run
  again — the first "still there" report may have been an instance that had
  been running since 02:37 on a dist built before the night fix; that is a
  workflow note for the user, not a code change.

## 9. Outcome (2026-11-07, audited)

Built by Opus 5.5 (effort high), audited by Fable: every file read against this
spec, the verify script rerun, the Electron shell rerun on a fresh
`npm run build` with the user's own project, the night/section verify rerun for
the `subtractPolygons` side effect, full `npm test` (433 files, 5,272 tests)
and `eslint src/` (0 errors, 42 pre-existing warnings) rerun. Nothing
committed.

| Check                                             | Before           | After (dev server, headless Chrome)                                                              | After (Electron, built dist, user's `apartment_project2`) |
| ------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| All day slider steps                              | 1,635–1,948 ms   | 22–55 ms (14:30 is the first step after the mode switch; Opus measured 36)                       | worst step 42 ms                                          |
| All day paced drag                                | gap 2,500 ms     | gap 85–93 ms, longest task 68 ms (dev-mode React; Moment's drag was 75 ms before the change too) | gap 59 ms, no long task                                   |
| Moment steps / drag                               | 15–74 ms / 75 ms | 14–26 ms / 78–81 ms                                                                              | 39 ms / 38 ms                                             |
| Sun hours steps                                   | 14–40 ms         | 14–32 ms                                                                                         | 18 ms                                                     |
| Envelope path `d`                                 | 944,628 chars    | 4,111 chars, path route                                                                          | –                                                         |
| Envelope regions / vertices                       | 8,408 / 45,739   | 1 / 184 (121 under vitest: the app draws the phase-filtered project)                             | –                                                         |
| Envelope area, bench                              | 111,900 m²       | 4,917 m² (reference 4,932, −0.3 %)                                                               | –                                                         |
| Per-moment unions, bench                          | 28 of 44 threw   | 44 of 44 one region, 10.6–19.1 ms each                                                           | –                                                         |
| Pixels, All day 15:00 inside the old envelope box | –                | mean 0.11/255 vs the old picture                                                                 | –                                                         |
| Shader programs linked across the whole sweep     | 0                | 0                                                                                                | 0                                                         |

Rows A2/A3d (the paced drags) miss the ≤ 60 ms target on the dev server only;
Opus's production build on `vite preview` and the Electron runs pass them.
The cost there is dev-mode React rendering per input, not this bug.

**Side effect, accepted:** snapping `subtractPolygons`' inputs took the
section pipeline's `polygonClipping.difference` throws from 60 of 951 calls to
0 of 871 (the latent bug noted in `docs/night-section-freezes.md`), so sections
and elevations now draw the properly cut pieces: 118 section drawables on the
bench instead of 80–82. The night verify script still passes its section rows
(cold first response 58–61 ms, complete 1.1–1.2 s, words at 300 ms); the warm
re-entries grew with the drawable count (section warm 50–52 ms against ≤ 50,
front elevation warm 62–64 ms against ≤ 50, both were ~38 ms) — a dev-server
React commit of more nodes, not a visibility-pass cost.

Judgment calls from the build, all accepted: `intersectionArea` snaps only
when asked (`{ snap: true }`, used by `shadowCoverageOfPlot`) because six
structural tests rely on sub-millimetre slivers; the bitmap route always uses a
2048 px long side and the exact rings; `data-envelope-regions` and
`data-envelope-render="none"` were added; U3 is asserted at < 120 ms under the
parallel suite.
