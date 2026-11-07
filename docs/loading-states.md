# Loading states — every wait answered, nothing frozen

Spec for the loading states across the app: route changes, opening a project,
the floor-plan 3D preview, the ceiling and wall assembly editors, sheets,
Sketch Studio's workshop and kernel, analyses, exports. Written 2026-11-05 by
Fable after reading the code and measuring it in a real browser; built by
Opus; audited by Fable against this document.

## 1. The problem, in the user's words

> Can you add some loading state during loading? Like if I'm opening the
> ceiling assembly editor or anything that has loading data in my software …
> make a loading state UX- and UI-friendly and have a delightful taste of the
> design.

Two things are being asked for. The first is coverage: every wait in the app
should say that something is happening. The second is quality: the states
should feel like part of this product, not a spinner bolted on.

There is a third thing the user did not ask for but will feel: most of the
waits that matter are not "loading" at all, they are the main thread frozen.
A spinner cannot spin while the page is frozen. So a loading state here is
only honest if the heavy work is moved out of the way of the paint. Section 6
says how.

## 2. What the app does today (verified)

### 2.1 Measured transitions

Dev build, headless Chrome 1600 × 1000 on ANGLE/D3D11, fixture
`scripts/fixtures/bench-ceiling-project.json` (3 floors, a 12 × 10 m ceiling
with 38 boards and 2,414 screws). Times are from the click. "Freeze" is the
longest gap between two animation frames, i.e. how long nothing on the page
could move. Scripts: this session's scratchpad `measure-loading*.mjs`; the
verify script in section 8 is their successor.

| Transition                                          | First visible response              | Ready                                 | Freeze | What the user sees meanwhile                                                                           |
| --------------------------------------------------- | ----------------------------------- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| A. Home → Floorplan (cold route)                    | top bar 109 ms, toolbar 228 ms      | 3D canvas 2.0 s                       | 1.19 s | bar + "Opening workspace…" pill, then "LOADING 3D PREVIEW" shimmer that stops moving during the freeze |
| B. Load Project → browser draft                     | modal closes 516 ms                 | walls drawn 536 ms                    | 325 ms | nothing: the card does not react, then the modal vanishes                                              |
| C. Ceilings → Edit (ceiling assembly editor)        | status bar 458 ms                   | 3D pane 2.77 s                        | 2.09 s | blank, then the editor with an empty dark 3D pane, frozen                                              |
| C′. Same, CPU-profiled                              | 424 ms                              | 2.32 s                                | 1.63 s | —                                                                                                      |
| J. Reopen the same editor (warm caches)             | 748 ms                              | 758 ms                                | 365 ms | blank                                                                                                  |
| H. Close the ceiling editor                         | 192 ms                              | 196 ms                                | 94 ms  | fine                                                                                                   |
| E. Wall → Design Inside Face (wall assembly editor) | status bar 445 ms                   | 3D canvas 894 ms, then a 1.68 s block | 1.68 s | blank, then a frozen editor                                                                            |
| D. Model → Sheets                                   | 149 ms                              | 154 ms                                | 123 ms | fine ("Rendering 3D preview…" text flashes)                                                            |
| F. Home → Sketch Studio (cold route)                | 1.36 s                              | —                                     | none   | bar + pill (works)                                                                                     |
| G. Sketch Studio → 3D Model & workshop              | plain `<p>` 51 ms, workspace 863 ms | kernel ready 1.16 s                   | none   | an unstyled paragraph, then an empty viewport with "Rebuilding solids…" in the status line             |
| K. Sheet → Export PDF                               | download starts 70 ms               | —                                     | none   | fine                                                                                                   |

### 2.2 The editor freeze, attributed

The CPU profile of C′ puts 1,614 ms of the 2,091 ms of long tasks in one
native function: `getProgramInfoLog`. Mechanism, in three 0.183.2:

- `createPreviewViewport.js` ~765/792 calls `compileScenePrograms(renderer,
scene, camera, target)` (`compileScenePrograms.js` 25), which calls
  `renderer.compile(scene, camera)` and then polls `program.isReady()` — the
  intent is KHR_parallel_shader_compile, i.e. links that run off the main
  thread.
- `WebGLProgram.getUniforms` runs `onFirstUse`, which — while
  `renderer.debug.checkShaderErrors` is true, the default — calls
  `gl.getProgramInfoLog`, and that query cannot answer until the link has
  finished. _Where_ it runs was mis-read when this section was first written
  (it said inside `renderer.compile`). Verified during the build against
  `three.module.js` 0.183.2: `getProgram` only sets
  `materialProperties.uniformsList = null`; the `getUniforms()` call is
  lazy, in `getUniformList` from `setProgram` — the first frame that draws
  with the program. So `renderer.compile` never blocks, and the readiness
  poll is honoured; the freeze came from the first _world_, which the gate
  did not cover (it only ran when a world already existed), so the first
  frame was drawn at once and the driver finished every link on this thread.
  Section 6.2 records what was built instead of the original lead.

The cost is per pane and per set of materials × lights, not per ceiling: the
wall editor (E) pays 1.68 s for a plain wall, the main workspace (A) pays
930 ms. It will not get smaller for small projects. Section 6 is the fix.

The ~450 ms before the editor paints anything (C, E) is the editor's own first
render: `deriveCeilingDetail`, `createCeilingDetailPreviewProject`, the snap
target memos (`CeilingDetailEditor.jsx` 720–810) and the first commit of a
~1,600-node SVG, all in the render that follows the `OPEN_*_DETAIL_EDITOR`
dispatch. Section 5.4 moves the paint ahead of it.

### 2.3 Loading UI that already exists

- `src/app/RouteProgress.jsx` + `.module.css`: instant 3 px indeterminate top
  bar, a status pill held back 100 ms, a 12 px spinner, reduced-motion
  variant, `RouteHydrateFallback` for direct loads. This is the model for
  everything below: it answers the click instantly, keeps the old page
  visible, is honest about not knowing progress, and is quiet.
- Three bare Suspense fallbacks: `FloorplanWorkspace.jsx` 348 ("Loading 3D
  preview..." in `App.module.css .previewFallback`, uppercase with a shimmer),
  `CeilingDetailEditor.jsx` 3221 and `WallDetailEditor.jsx` 3714 ("Loading
  live … preview…" in `WallDetailEditor.module.css .previewLoading`, 10 px
  text on `#111820`), `SketchStudioLayout.jsx` 163 (an inline-styled `<p>`).
- `SheetViewportContent.jsx` 140–200: a real `loading | ready | empty | error`
  state machine for sheet 3D thumbnails, rendered as plain text.
- Sketch Studio: `CadWorkspace.jsx` status line ("Rebuilding solids…",
  "Preparing workshop output…", `busy`), `TemplateGallery.jsx` ("Loading..."
  on the card), `ExportBar.jsx` (`exporting` disables the button).
- Analyses: `useDaylightGrid` / `useSolarAccess` expose `status` + `progress`
  (`DaylightPanel.jsx` 114, `SolarAccessPanel.jsx` 130 print "Sampling … n of
  m"); `SunStudyPanel.jsx` 502 has a `progressTrack` with `data-busy`.
- `ProjectLifecyclePanel.jsx` 5214: the exchange ZIP button swaps its label to
  "Rendering complete PDF and DXFs…" while running.
- `src/styles/global.css` 161: a global `prefers-reduced-motion` rule that
  collapses every animation to 0.01 ms. `src/styles/variables.css` has the
  motion tokens (`--ease-out`, `--ease-in-out-soft`, `--duration-micro` …
  `--duration-smooth`, `--duration-hero`), `--color-accent`,
  `--color-accent-subtle`, `--color-surface-elevated`, `--shadow-floating`,
  `--radius-xl`, `--font-ui`.

### 2.4 Waits with no state at all

- Opening a browser draft (B): the clicked card does nothing for 500 ms.
- Opening a project file or `.apz` archive from disk
  (`useFloorplan.js` ~197, `persistence/projectArchive.js` with a lazy
  `jszip`): nothing while the file is read and unpacked.
- The editors' first ~450 ms (C, E): nothing at all on screen.
- The 3D pane in both editors and the main workspace while it builds and
  compiles: a dark empty box (editors) or a shimmer that stops (workspace).
- Sketch Studio: the CAD viewport is empty until the first kernel build
  (~1.1 s); opening or importing a `.sketch.json` (`useSketchPersistence.js`
  218–260) shows nothing while the file is read.
- Sheet PNG export at 600 DPI: only the after-the-fact status message.
- Lifecycle "Generate deterministic alternatives" / "Generate preliminary
  package" (`ProjectLifecyclePanel.jsx` 1412, `onExecuteCommand`): synchronous
  reducer commands, unmeasured on large projects.
- Realistic render refinement: `refined` only disables Save image
  (`ThreePreviewPanel.jsx` 621); nothing says the image is still improving.
- Electron: the window waits for `ready-to-show` (good) but its
  `backgroundColor` is `#1a1a2e`, a navy that flashes before the light UI.

## 3. Principles — the taste

These are the rules every state below follows. They are the spec's answer to
"UX- and UI-friendly" and "delightful"; the kit in section 4 encodes them so
no screen has to re-decide them.

1. **Answer within 100 ms.** Every click that starts a wait changes something
   on the very next frame: the control goes to its pressed/busy state and, for
   anything that replaces or covers the view, the top bar starts. The bar is
   the one element with no delay.
2. **Paint before you work.** Nothing heavy runs in the same task as the
   click. The shell, skeleton or placeholder is committed and painted first
   (`afterPaint`, section 4), and the heavy work runs after it — in a
   transition, in chunks, in a worker, or asynchronously on the GPU. The test
   is mechanical: while a loading state is on screen, no gap between
   animation frames may exceed 150 ms. A block that cannot be avoided (one is
   allowed, section 6) is capped at 400 ms and may start only after the
   placeholder has painted a frame.
3. **Keep the context.** Overlay, do not blank. Leaving a page: the page you
   are leaving stays under a bar and a pill. Entering an editor: the editor's
   own frame appears at once with skeletons where its content will be. A
   model that is being rebuilt stays visible under a thin bar; it is never
   replaced by a placeholder it will come back to.
4. **Honest about progress.** Indeterminate motion when nothing can report
   progress (module fetch, shader compile, a kernel build). Counts only when
   they are real and already exist ("Sampling Living room — 3 of 12"). Never a
   percentage that is invented. The words say what is actually happening:
   "Compiling ceiling materials", not "Loading".
5. **Timed, not twitchy.** Below 100 ms: only the instant response from rule 1.
   100–300 ms: the region shows its quiet placeholder (paper, shimmer,
   silhouette), no words. From 300 ms: the words appear, verb first. From
   2 s: a second, smaller line says what it is waiting on. From 10 s: a way
   out ("Go back" / "Cancel") wherever cancelling is possible, and the words
   admit it ("This is taking longer than expected"). Once words have appeared
   they stay at least 400 ms; nothing flickers. Ends are fades
   (`--duration-smooth`), never hard cuts. A warm reopen that finishes under
   150 ms shows no words at all.
6. **One family.** Bar, pill, spinner, shimmer, skeleton and silhouette share
   one motion vocabulary: the existing `RouteProgress` bar and spinner, the
   accent colour, `--ease-out` for arrivals, `--ease-in-out-soft` for loops,
   durations from `variables.css`. Reduced motion is already global; the bar
   additionally becomes a static accent band (as `RouteProgress` does) so it
   still reads as "busy".
7. **Delight comes from fit, and it is free.** The flavour is the drafting
   table the app already is: placeholders are faint grid paper; where the
   thing being prepared is known, its silhouette is drawn on that paper as a
   single hairline — the ceiling's boundary, the wall's elevation with its
   openings, the floor's slab outline, the sheet's frame — breathing slowly
   (opacity 0.35 → 0.6 over 2.4 s) until the real thing fades in over it in
   one 300 ms crossfade. Copy is calm, specific and uses the real nouns and
   numbers it already has ("Laying out 38 boards and 2,414 screws"). All of
   it is CSS and inline SVG from data already in memory: nothing is fetched,
   nothing is computed for the placeholder that costs more than a frame.
   Not in this product: bouncing dots, pulsing logos, emoji, "please wait",
   spinners under 12 px, two indicators in one region, or animation that
   keeps running after the wait is over.
8. **Errors take the loading state's place.** Same region, same shape, the
   reason in one sentence and a retry or a way back. No wait is open-ended:
   each has a timeout after which it becomes the error/"taking longer" state
   rather than a spinner forever.
9. **Accessible by construction.** The words carry `role="status"
aria-live="polite"` (once per region, not per line); the region carries
   `aria-busy="true"`; focus is never moved by a loading state; placeholders
   reserve the final layout so nothing shifts when content arrives.

## 4. The kit — `src/ui/loading/`

One folder, small components, every state in section 5 built from them. CSS
Modules, tokens from `variables.css`, no dependencies.

- `LoadingBar` — the indeterminate 3 px bar. Props: `active`, `placement:
'viewport' | 'region'` (fixed to the top of the window, or absolute to the
  top of its positioned parent), `delayMs` (default 0). Lifted from
  `RouteProgress.module.css`; `RouteProgress` then composes it.
- `LoadingPill` — spinner + words. Props: `label`, `detail` (second line,
  shown from 2 s or when given with `showDetail`), `delayMs` (default 300),
  `minVisibleMs` (default 400), `placement: 'viewport' | 'region'`,
  `action` (`{ label, onClick }`, the 10 s way out). Owns the delay and the
  minimum-visible timing (`useDelayedFlag`). `role="status"`.
- `PanePlaceholder` — the region placeholder. Props: `label`, `detail`,
  `tone: 'paper' | 'dark'` (paper = `--color-panel-bg` with a faint 8 mm
  grid; dark = `#111820` with the same grid at low alpha, for 3D panes),
  `silhouette` (`{ viewBox, children }` — inline SVG the caller supplies,
  drawn as a hairline in the accent at the breathing opacity), `delayMs` for
  the words (300), `state: 'loading' | 'error'`, `error` (`{ message,
onRetry, onBack }`). Fills its parent, reserves layout, sets `aria-busy`,
  exposes `data-loading-state` on its root for scripts.
- `Skeleton` — `Skeleton.Row`, `Skeleton.Field`, `Skeleton.Text` blocks with
  the shared shimmer; used for sidebar section bodies while an editor opens.
- `BusyButton` — a button that keeps its width, swaps its label for spinner +
  verb while `busy`, is disabled while busy, holds the busy look at least
  400 ms, and renders `error` inline beside it. Used for draft cards, export
  items, template cards, lifecycle generators, ZIP buttons.
- hooks: `useDelayedFlag(active, { delayMs, minVisibleMs })`;
  `useAfterPaint(callback, deps)` and `afterPaint()` (a promise that resolves
  after two animation frames, i.e. after the current commit has painted);
  `useLoadingPhase` is NOT a thing — each screen keeps its own small state.
- `loadingCopy.js` — every string from section 7, with the number formatting
  helpers, so copy is reviewed in one place.

Tests: one DOM test file per component (fake timers for delay / minimum
visible; `prefers-reduced-motion` attribute; `aria-busy` / `role=status`),
plus a `RouteProgress` regression (`src/routes.dom.test.jsx` must stay
green).

## 5. Where each state goes

Each case lists what the user sees over time and what the verify script
asserts. Thresholds are for the dev build on the fixture in 2.1.

### 5.1 Route navigation (keep, re-base on the kit)

`RouteProgress` = `LoadingBar` (viewport) + `LoadingPill` (viewport,
`delayMs` 100 as today). Copy per destination: "Opening the floor plan…",
"Opening Sketch Studio…", "Opening the playground…". `RouteHydrateFallback` =
a full-window `PanePlaceholder` (paper, no silhouette, the app's wordmark
above "Opening…"). Accept: bar visible ≤ 100 ms after the click.

### 5.2 Floor-plan workspace — the main 3D preview's first build (A)

The preview region shows `PanePlaceholder` (tone dark, silhouette = active
floor's slab outlines from `project.floors[i].slabs`, label "Building the
model…", detail "Compiling materials for 3 floors") from the moment the
workspace mounts, through the Suspense fallback AND the viewport's own
build-and-compile, until the first frame is drawn, then one crossfade. The
same placeholder returns (words only after 300 ms) for the catch-up rebuild
when a detail editor closes (copy "Catching up…"). Accept: toolbar ≤ 250 ms;
after the toolbar paints, no frame gap > 150 ms (section 6); the pane carries
`data-loading-state="loading"` until its first frame and `"ready"` after.

### 5.3 Opening a project (B, and files / archives)

- Browser draft: the clicked card is a `BusyButton` ("Opening…" with the
  spinner) and the viewport `LoadingBar` runs; the modal closes when
  `PROJECT_LOAD` has been dispatched and painted. The reducer work (325 ms
  today) runs after the busy state has painted (`afterPaint` then
  `startTransition`).
- File / archive from disk: same bar; the pill says "Reading <file name>…"
  then "Unpacking archive…" for `.apz`; a file that is neither becomes the
  inline error "This isn't a project file (.json) or archive (.apz)." on the
  Project File card with the picker still available.
- Accept: busy state visible ≤ 100 ms after the click; no gap > 150 ms while
  busy.

### 5.4 Ceiling assembly editor (C, J, H) — the headline case

Timeline from the click on Edit:

1. ≤ 100 ms: the Edit button is in its busy look and the viewport
   `LoadingBar` starts.
2. ≤ 150 ms: the editor's frame is on screen: title bar with the ceiling's
   name, status bar, the sidebar with its section headers (real) and
   `Skeleton` bodies, the canvas area as a `PanePlaceholder` (paper,
   silhouette = `ceiling.boundaryPolygon`), the 3D pane as a
   `PanePlaceholder` (dark, same silhouette). This requires the editor to
   mount a shell first: `CeilingDetailEditor` renders its frame with a
   `phase: 'opening'` and schedules the heavy derivation (`deriveCeilingDetail`,
   `createCeilingDetailPreviewProject`, snap targets — today's memos at
   720–810) after paint, inside `startTransition`, moving to `phase: 'ready'`
   when it lands. The derived values keep their memo contracts; only when
   they first run changes.
3. As soon as `detail` exists (target ≤ 500 ms): the 2D plan fades in over
   its placeholder; the sidebar bodies replace their skeletons. The 2D canvas
   is interactive from here even though the 3D pane is not ready.
4. The 3D pane: placeholder words at 300 ms — "Preparing live preview…", then
   "Compiling ceiling materials…" while the compile gate runs (section 6),
   then the first frame crossfades in and the words fade. The pane never
   shows a black box.
5. Warm reopen (J): identical flow; because it finishes faster the words may
   never appear (rule 5), but the frame still paints first.
6. Close (H): already 192 ms; keep. The main preview shows its "Catching
   up…" placeholder only if the catch-up build exceeds 300 ms.

Accept: frame ≤ 150 ms; 2D plan ≤ 500 ms; words in the 3D pane at 300 ms
(± 50); from the frame paint to the 3D first frame no gap > 150 ms once
section 6 is done (exception rule in 3.2 otherwise); time to the 3D first
frame not worse than today's 2.77 s, target ≤ 1.5 s; the 3D pane root carries
`data-loading-state` (`loading` → `compiling` → `ready`).

### 5.5 Wall assembly editor (E)

Identical to 5.4 through the shared `WallCanvasChrome` / `WallDetailUiKit`
(the memory `detail-editor-canvas-fit` notes the two editors share chrome and
CSS). Silhouette = the wall's elevation rectangle with its door and window
openings cut out, from data the editor already derives. Copy: "Compiling wall
materials…".

### 5.6 Sheets (D) and sheet 3D thumbnails

Fast today. Replace the text in `SheetViewportContent` with a small-variant
`PanePlaceholder` (paper, silhouette = the viewport frame) — words only after
300 ms, so most renders show only the paper. Error state stays, restyled.

### 5.7 Sketch Studio

- Route: 5.1.
- `CadWorkspace` Suspense fallback (`SketchStudioLayout.jsx` 163): a
  `PanePlaceholder` ("Opening the workshop…") that fills the workspace area
  instead of the inline-styled paragraph.
- Kernel boot: until the first snapshot the 3D viewport shows a
  `PanePlaceholder` (dark, no silhouette, "Waking the solid kernel…" then
  "Building 3 parts…" with the real part count). After the first snapshot,
  rebuilds keep the model visible with a region `LoadingBar` at the top of
  the viewport plus the existing status-line text; never a placeholder over a
  model that is about to come back.
- Open / import a sketch file (`useSketchPersistence.js`): viewport
  `LoadingBar` + pill "Reading <file name>…"; errors already surface inline.
- Template gallery: the card is a `BusyButton` ("Opening…").
- Exports (`ExportBar`, `CadWorkspace` ~1072–1133 `busy`): `BusyButton` with
  "Packing workshop ZIP…" / "Rendering sheet PDF…"; the status-line text
  stays as the secondary signal.

### 5.8 Analyses (daylight, solar access, sun study)

The hooks already carry `status` / `progress`; only the UI unifies: the sun
study's `progressTrack` becomes the region `LoadingBar`; the daylight and
solar "running" lines become a `LoadingPill` (region, no delay since the user
pressed Run) with the existing counts as the label; stale results dim under a
region bar labelled "Recomputing…" rather than disappearing.

### 5.9 Exports and downloads in the floor plan

Sheet PDF / PNG menu items (`SheetProperties.jsx` 33–50) become `BusyButton`s
("Rendering A3 PDF…", "Rendering PNG at 600 DPI…") and the viewport
`LoadingBar` runs; the existing completion status message stays. The exchange
ZIP button (`ProjectLifecyclePanel.jsx` 5214) and the workshop ZIP (5.7) use
the same component.

### 5.10 Lifecycle generators

Measure "Generate deterministic alternatives" and "Generate preliminary
package" on the fixture with the verify script. Any command over 100 ms runs
through `afterPaint` + `startTransition` behind a `BusyButton`; under 100 ms
is left alone.

### 5.11 Realistic refinement

While `refined` is false, the pane's status strip shows a 12 px spinner with
"Refining…"; it fades when the renderer reports converged. Save image stays
disabled as today, and its tooltip says why.

### 5.12 Electron

Change `backgroundColor` in `electron/main.cjs` to the app's page background
so the first paint is not a navy flash. No splash screen; `ready-to-show`
already does the right thing.

## 6. Required engineering: paint first, compile without blocking

The states above are only honest if the page can draw them. Two changes are
required, and the verify script measures both.

### 6.1 Shell-first mounting

`CeilingDetailEditor`, `WallDetailEditor` and the project-open path commit a
cheap first render and run their heavy derivation after `afterPaint()` inside
`startTransition`. Rule: nothing that takes more than a few milliseconds runs
in the render that follows the opening dispatch. The attribution for the
~450 ms is in 2.2; whether the derivation itself gets faster is optional —
the requirement is only that it no longer sits between the click and the
first paint.

### 6.2 The shader compile must not block the main thread

Today's `compileScenePrograms` gate must stay — the ceiling-light work
(`docs/ceiling-light-placement.md` §10) depends on every program being linked
before the first frame — and the link must actually run in parallel.

The original lead here (switch `renderer.debug.checkShaderErrors` off around
`renderer.compile()`) was tested and changed nothing, for the reason §2.2 now
gives: the compile was never where the block was. What is built instead, all
in `preview/`:

- **The first world is gated.** `createPreviewViewport` draws no frame until
  a world exists, and the first world waits for the parallel-compile poll
  like every later one (`setWorld` starts the gate for `!hadWorld` too). By
  the time the first frame asks a program for its uniforms the link is done,
  so `checkShaderErrors` stays on and three's own link check costs nothing;
  no diagnostics are lost. The panel's placeholder covers the wait and the
  viewport reports it (`setLoadStatusHandler`: building → compiling → ready,
  waking on resume), with `parallelShaderCompile` so the placeholder can say
  "This GPU compiles on the main thread" where the extension is missing.
- **Everything the first frame links on its own is compiled in the gate
  too.** Three things were still linked at first use, inside the frame:
  the studio environment (`createEnvironment.prepareStudioEnvironment`:
  the room _that `fromScene` will draw_, kept alive until it has been drawn
  — a disposed stand-in hands its programs back and three destroys them —
  plus the generator's blur, GGX and background-box passes compiled in a
  stage of their own, with no lights, because the light count is part of a
  program's identity and the generator draws them as bare meshes); the
  cube-map background box (`createBackgroundWarmup`, a copy of three's
  `WebGLBackground` box compiled against the scene's lights via
  `compileScenePrograms`'s `extras`); and the post-processing passes'
  full-screen materials (`getCompileWarmups`, via `standalone`). The studio
  backdrop is built on the CPU as a cube texture, because three's
  equirect-to-cube conversion of the old canvas image was a shader compiled
  mid-frame.

Measured in the verify script: during an editor open `getProgramInfoLog`
self time ≤ 50 ms and no frame gap > 150 ms from the frame paint to the
first 3D frame (the first frame itself went from ~500 ms to under 20 ms).
The audit's link probe is the check that the warm-ups hold: no program
source may link twice in one GL context during a pane's first picture.

## 7. Copy

Verb first, sentence case, the real ellipsis character (…), no exclamation
marks, no "please", numbers formatted with thousands separators. All of it
lives in `loadingCopy.js`.

| Where                    | Label                                                  | Detail (from 2 s, or when known)                                          |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Route → floor plan       | Opening the floor plan…                                | —                                                                         |
| Route → Sketch Studio    | Opening Sketch Studio…                                 | —                                                                         |
| Direct load              | Opening…                                               | —                                                                         |
| Draft card               | Opening…                                               | —                                                                         |
| Project file             | Reading `<file name>`…                                 | —                                                                         |
| Archive                  | Unpacking archive…                                     | —                                                                         |
| Bad file                 | This isn't a project file (.json) or archive (.apz).   | —                                                                         |
| Main 3D preview          | Building the model…                                    | Compiling materials for `<n>` floors                                      |
| Catch-up after an editor | Catching up…                                           | —                                                                         |
| Ceiling editor frame     | Preparing the ceiling editor…                          | Laying out `<n>` boards and `<m>` screws                                  |
| Ceiling 3D pane          | Preparing live preview… → Compiling ceiling materials… | This GPU compiles on the main thread (only when the extension is missing) |
| Wall editor frame        | Preparing the wall editor…                             | Laying out `<n>` boards                                                   |
| Wall 3D pane             | Preparing live preview… → Compiling wall materials…    | as above                                                                  |
| Sheet thumbnail          | Rendering preview…                                     | —                                                                         |
| Workshop chunk           | Opening the workshop…                                  | —                                                                         |
| Kernel boot              | Waking the solid kernel… → Building `<n>` parts…       | —                                                                         |
| Kernel rebuild           | Rebuilding solids… (existing)                          | —                                                                         |
| Sketch file              | Reading `<file name>`…                                 | —                                                                         |
| Template card            | Opening…                                               | —                                                                         |
| Workshop ZIP             | Packing workshop ZIP…                                  | —                                                                         |
| Sheet PDF / PNG          | Rendering A3 PDF… / Rendering PNG at 600 DPI…          | —                                                                         |
| Exchange ZIP             | Rendering complete PDF and DXFs… (existing)            | —                                                                         |
| Daylight                 | Sampling `<room>` — `<n>` of `<m>` (existing)          | —                                                                         |
| Solar access             | Tracing `<n>` of `<m>` sensors (existing)              | —                                                                         |
| Recompute                | Recomputing…                                           | —                                                                         |
| Refinement               | Refining…                                              | —                                                                         |
| Over 10 s                | This is taking longer than expected.                   | with the action "Go back" / "Cancel"                                      |
| Any failure              | `<one sentence with the reason>`                       | with "Try again" and/or "Go back"                                         |

## 8. Verification

- `scripts/verify-loading-states.mjs` — grown from this session's
  `measure-loading.mjs` / `-2` / `-3` (fixture seeding through localStorage,
  long-task observer, rAF-gap probe, CDP profiler for the editor open):
  runs A, B, C, J, H, E, D, G, K, prints the table from 2.1 with pass/fail
  against the thresholds in section 5, and additionally asserts the DOM: the
  editor frame exists ≤ 150 ms after the click, `[data-loading-state]` goes
  `loading` → `compiling` → `ready` on the 3D pane, words appear at
  300 ± 50 ms and stay ≥ 400 ms, and no frame gap > 150 ms while any
  `[aria-busy="true"]` is on the page (exceptions from 3.2 listed in the
  script with their cap). Same invocation convention as the other scripts
  (`npx vite --port 5199 --strictPort`, `MSYS_NO_PATHCONV=1 node …`).
- DOM tests for the kit (section 4) and the editors' shell-first mount (the
  frame renders before `deriveCeilingDetail` runs; `CeilingDetailEditor.dom.test.jsx`
  and `WallDetailEditor.dom.test.jsx` stay green).
- `npm test` and `npm run lint` green.

## 9. Out of scope

- Splitting the assembly editors into their own chunks (the
  `walldetail-lazy-split` follow-up). The shell-first mount in 5.4 is what
  that split would need, so it must not be designed against.
- Faster derivation in the editors beyond moving it behind the paint.
- Changing the light pool or the compile gate's contract from the
  ceiling-light work.
- Any Electron splash beyond the background colour.
