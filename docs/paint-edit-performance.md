# Paint-edit and idle frame cost (PP-1)

User report, 2026-11-11: "if I add some paint or colour to walls the UI is fps dropping, and also if
I scroll the properties panel it is fps dropping — can we fix that bug or that leak?"

## 1. What was measured

Playground project, floorplan workspace, 1600 × 900, headless Chrome against the dev server, one
wall selected and switched to fibre cement. Scripts in the session scratchpad: `paintperf.js`
(per-phase frame/CPU/WebGL counters), `paintperf2.js` (Chrome traces + running animations),
`paintperf3.js` (pulse A/B + CPU profiles), `paintperf-con.js` (console warnings). Headless Chrome
runs rAF at ~144 Hz on a software GPU, so read the numbers as ratios, not as the user's frame rate.

No leak was found: heap returns to ~50 MB after a 40-colour picker drag, DOM nodes and listeners are
flat over an 8 s idle, and the 3D pane draws nothing while idle. What was found is one always-on
cost and one per-edit cost.

### 1.1 Always-on: the Save button's "unsaved" pulse repaints the page every frame

`Toolbar.module.css` `.saveBtn[data-dirty='true']::after` runs `warmPulse 2s infinite`, which
animates **`box-shadow`** (and opacity). A box-shadow animation cannot run on the compositor, so
from the first edit of a session until the next save the browser runs the whole main-thread
pipeline — style, pre-paint, paint, layerize, commit — on every frame, forever.

| 2.5 s idle, wall selected                   | main frames (`ProxyMain::BeginMainFrame`) | `Paint` events | main-frame time |
| ------------------------------------------- | ----------------------------------------- | -------------- | --------------- |
| project clean (nothing edited)              | 0                                         | 0              | 0 ms            |
| project dirty, pulse running                | 361                                       | 722            | 380 ms          |
| project dirty, pulse killed by injected CSS | 0                                         | 0              | 0 ms            |

It is the only running animation on the page (`document.getAnimations()`). Painting a wall is simply
the edit that dirtied the project. Scrolling the properties panel with the pulse running costs
647 ms of main-frame time per 3.7 s; with it killed, 83 ms per 2.5 s — the scroll itself is cheap,
the pulse is what it is competing with.

### 1.2 Per edit: a colour change re-derives the building

CPU profile of one swatch click (321 ms busy JS) and of a 20-colour picker drag at 20 colours/s
(1,240 ms busy JS in ~1 s of dragging — saturated; 8 long tasks / 465 ms in the 40-colour run):

| Where                                                                              | Swatch click | 20-colour drag        | Why it is waste for a look-only edit                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floorplanReducer` → `computeDerivedModels`                                        | 76 ms        | 40 ms                 | quantity takeoff (63 ms, of which `buildTrussSystemGeometry` 56 ms), feasibility, documentation, cost, coordination — all re-run because the project object changed                                                                                                                                 |
| `syncProjectStructures` → `syncProjectRoofSystem` → `resolveRoofAttachmentContext` | —            | 43 ms / 33 ms         | roof attachment recomputed for a wall whose geometry did not change                                                                                                                                                                                                                                 |
| `buildPreviewScene` + `previewSceneCache.build`                                    | 20 ms        | 89 ms + 58 ms         | every floor's descriptors and the truss system geometry rebuilt per colour                                                                                                                                                                                                                          |
| `cloneWithProceduralDetail`                                                        | —            | 21.6 ms               | `material.clone()` → three's `Material.copy` does `JSON.parse(JSON.stringify(userData))`; `userData` holds `detailUniforms` (shader uniforms with textures), so every new finish material serialises textures. **94 × "THREE.Texture: Unable to serialize Texture."** in the console during one run |
| `compileScenePrograms`                                                             | —            | 37 ms                 | shader warm-up walk per colour, though a finish links no new program (0 `linkProgram` calls measured)                                                                                                                                                                                               |
| `renderFrame` (Realistic refine restarted)                                         | 135 ms       | 287 ms                | by design after a change; the count is the problem during a drag                                                                                                                                                                                                                                    |
| React (`jsxDEV` self, `Sidebar`, `Toolbar`, `WallProperties`)                      | 38 ms        | 265 ms + 36 + 30 + 23 | whole-app re-render per colour (dev-build overhead inflates this)                                                                                                                                                                                                                                   |

One finish change also costs ~26,000 WebGL draw calls (the Realistic accumulation); a 40-colour drag
57,000.

## 2. The fix

### 2.1 The pulse runs on the compositor (must)

Keep the visual — a small dot on the Save button that breathes while there are unsaved changes —
but animate only `opacity` and/or `transform`, on an element that gets its own layer, so no main
frame is needed. A static glow (box-shadow or a blurred pseudo-element) whose _opacity_ pulses does
it. Remove the dead duplicate `@keyframes warmPulse` in `src/styles/global.css` if nothing uses it.
Honour `prefers-reduced-motion` (static dot). Check the other `infinite` animations
(`src/ui/loading/*`, the three placeholder stylesheets) animate only opacity/transform; fix any that
do not, leave the rest.

### 2.2 A new finish material does not serialise its source (must)

`cloneWithProceduralDetail` (`preview/proceduralDetail.js`) must clone without pushing
`userData.detailUniforms` (or a ghost twin / selection clone) through `JSON.stringify`. The clone's
`userData` must still be its own object and end up exactly as today (the callers in `materials.js`
rewrite `paletteKey`, `tier`, `ownedByPalette` and delete the twins). Zero "Unable to serialize
Texture" warnings afterwards.

### 2.3 A look-only edit does not rebuild geometry (must, within the guardrails)

A wall finish, sheen or accent-colour change alters no length, opening, level, member or count
except the finish schedule. Make the expensive derivations skip when their real inputs are
unchanged, by **input identity**, the way the app already does elsewhere
(`docs/perf-robustness-pass.md`; the structure-fit WeakSet memo; `previewSceneCache` descriptor
carry-over):

- `buildTrussSystemGeometry` (called from the takeoff, the preview scene and the roof attachment
  sync on every edit): memoise on the identity of what it actually reads. A wall paint must build
  zero truss geometry.
- `syncProjectRoofSystem` / `resolveRoofAttachmentContext`: no work when nothing they read changed.
- The takeoff, cost, documentation and coordination passes may stay per-edit if, with the truss
  memo in, a finish-only `WALL_UPDATE` reduces in the target below. Do not build a general
  incremental-derivation framework.

Guardrails: a memo is keyed on object identity (WeakMap), never on a hand-rolled hash of a subset
of fields; if you cannot show which inputs a function reads, do not memoise it. Every memo gets a
test that a real geometric edit (move a wall end, change a truss pitch) still invalidates it and
that results are deep-equal to the unmemoised function. Persistence, undo/redo and project load
must hand back correct results (immutability is what makes identity safe — confirm the reducer
never mutates the objects you key on; if it does, say so and stop).

### 2.4 A picker drag commits at a bounded rate (must)

`ColourField` (`properties/PanelKit.jsx`) dispatches on every native `input` event of the system
picker — the pointer rate. Coalesce: commit the latest colour at most once per frame and no more
than ~15 times a second, with a trailing commit so the final colour always lands, and a flush on
pick end / blur / unmount **before** `onPickEnd` closes the gesture (`BEGIN_DRAG_GESTURE` …
`END_DRAG_GESTURE`, `docs/state-machines.md` — one undo step per pick must still hold). The swatch
and the typed hex stay immediate. The picker's own swatch and the hex text must keep following the
pointer without waiting for the commit. The roof colour field uses the same component and gets the
same behaviour.

### 2.5 Not in this pass

The whole-app re-render per project change (`Sidebar`, `Toolbar`) and the Realistic refine restart
are noted, not fixed, unless a one-line memo boundary obviously removes one — report what you saw.
`compileScenePrograms` running per colour: skip it when no new material _family_ appeared only if
that is provably safe; otherwise leave it and report.

## 3. Acceptance

Re-run the scratchpad scripts (same machine, same dev server) and report before/after:

1. Idle, project dirty, 2.5 s: `ProxyMain::BeginMainFrame` ≤ 5 and `Paint` ≤ 5 (was 361 / 722),
   with the pulse still running (`document.getAnimations()` shows it, animating only
   opacity/transform) and visibly pulsing in two screenshots a second apart.
2. Properties-panel scroll, project dirty: main-frame time within 25 % of the pulse-killed figure
   (83 ms per 2.5 s).
3. Console: 0 "Unable to serialize Texture" warnings across the `paintperf-con.js` run (was 94).
4. Swatch click: `buildTrussSystemGeometry` absent from the profile; `floorplanReducer` inclusive
   ≤ 40 ms (was 81 ms); busy JS ≤ 230 ms (was 321 ms).
5. 40-colour picker drag at 20 colours/s: long tasks ≤ 2 (was 8); busy JS for the 20-colour profile
   ≤ 700 ms (was 1,240 ms); exactly one undo step for the whole pick; the wall ends on the last
   colour sent.
6. Targets are targets: report the real numbers, and if one is missed say which cost is left and
   why, rather than moving the line.
7. Whole suite: `npx vitest run` (all of it — the reducer and domain are touched), `npm run lint`
   0 errors, `npm run build`. `node scripts/verify-wall-cladding.mjs`, `verify-wall-siding.mjs`
   and `verify-wall-accents.mjs` still pass if they run against the dev server.

## 4. As built (2026-11-11)

**Pulse.** The dot's glow is static (`Toolbar.module.css`, `will-change: opacity`); the breathing
is a Web Animation started by `useSaveDotBreathing` in `Toolbar.jsx`, opacity only, cancelled on
save/unmount, skipped under reduced motion. Two measured reasons it is not the CSS animation the
spec sketched: a CSS `animation` fires `animationiteration` every cycle and Chrome wakes the main
thread for ~7 frames each time (7–14 main frames per 2.5 s, over the ≤ 5 target); and an animated
`transform` made every scroll main frame re-walk the property trees (scroll ~125 ms per 2.5 s
against ~100 for opacity alone). The dead `warmPulse` in `global.css` is gone. Of the other
infinite animations, `LoadingBar` (animated `left`) and `Skeleton` (animated
`background-position`) now move by transform; the spinner and the three placeholders already
animated opacity/transform and were left.

**Clone.** `cloneWithProceduralDetail` hands the source to `Material.clone` with a `userData`
that lacks `detailUniforms` for that one call, then puts the source's own object back; the rest of
`userData` still gets three's JSON copy, so the clone's `userData` is its own object and equal to
what it was.

**Look-only edits.** Two syncs now keep identity (`src/domain/structuralSharing.js`):
`syncProjectTrussSystems` and `syncProjectRoofSystem` hand back the object they were given when
the one they built is deep-equal to it (a full comparison of every field, not a key). That is what
makes the two identity memos hit: `buildTrussSystemGeometry` (WeakMap on the truss system; reads
the system and the constant default catalogue only) and the truss half of
`resolveRoofAttachmentContext` (WeakMap on the attached system, default catalogue only; the
roof's overhang, the one roof input it reads, is applied per call and its datum remembered for
the last overhang). Tests: `src/features/floorplan/store/paintEditIdentity.test.js` (finish edit
and wall move hit; support-beam move, truss rise and roof overhang miss; undo/redo and
save/reload; every consumer run against a deep-frozen geometry) and `structuralSharing.test.js`.
Known wart: the playground's first edit after load re-keys once, because the end-closure colour
normaliser fills `solarAbsorptance` (null → 0) only on its second pass.

**Picker.** `ColourField` coalesces picker `input`s (`useCoalescedCommit`: latest value, one
frame, ≥ 67 ms apart, trailing commit), shows the live colour from local state, and flushes on
`change`/blur/unmount before `onPickEnd`. Swatches and typed hex are immediate and cancel a
waiting picker colour. `docs/state-machines.md` notes it.

**Measured after** (same machine, same dev server; scripts and outputs in the session
scratchpad `pp1\`):

| §3                                              | Before                                     | After                                                                                            | Script                                                |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1. idle dirty 2.5 s: main frames / Paint        | 361 / 722                                  | 0 / 0 (pulse running: `Animation`, opacity only; screenshots 1 s apart at opacity 0.46 and 1.00) | `paintperf3.js` trace A, `paintperf2.js`, `checks.js` |
| 2. panel scroll, dirty: main-frame ms per 2.5 s | 647 ms / 3.7 s (pulse on); 83 pulse killed | 99–102 (target ≤ 104); 84–86 with the dot paused                                                 | `paintperf3.js` trace C, `scrollab.js`                |
| 3. "Unable to serialize Texture"                | 94                                         | 0                                                                                                | `paintperf-con.js`                                    |
| 4. swatch: truss geometry / reducer / busy JS   | 56 ms / 81 / 321                           | absent / 26–29 / 252–274 (target ≤ 230: **missed**)                                              | `paintperf3.js`, `prof.js`                            |
| 5. 40-colour drag long tasks; 20-colour busy JS | 8; 1,240                                   | 0–1; 941–986 (target ≤ 700: **missed**)                                                          | `paintperf.js`, `paintperf3.js`, `prof.js`            |
| 5. one undo step / ends on last colour          | —                                          | yes / yes                                                                                        | `checks.js`                                           |

What is left in the two misses: the Realistic refine restarted by each edit (`renderSample`,
~105–130 ms per edit, by design, §2.5); the whole-app React re-render per project change (§2.5:
`performWorkUntilDeadline` ~15 ms for a swatch, ~570 ms across the 20-colour drag in the dev
build); the per-commit preview rebuild and interactive frame (~10 ms a commit). The scripted drag
also runs at ~14 colours/s (measured — the Playwright round trip, not the 20/s it was written
for), under the 15/s cap, so coalescing removes no commit from it (40 of 40 committed); a 60 Hz
in-page drag commits 19–20 of 60.
