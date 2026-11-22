# Phase B1: the 3D workshop viewport — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §5. Files changed: `CadViewport.jsx`, `placementLayer.js`, `marks.js`,
`sketchPlane.js`. Not changed: `shopLayer.js`, `CadSketcher.jsx`, `viewMode.js`.

## How it was measured

- **DOM counters** (jsdom, `CadViewport.renders.dom.test.jsx`): `renderer.render` calls per React commit,
  run against the code as it was before the phase (all four tests failed on the count only, every
  content assertion held) and after.
- **Browser** (headless Chrome via Playwright, Vite dev server on 5182, 1600 × 1000): probe scripts
  outside the repo wrap `gl.clear` (one per `renderer.render`, autoClear) per canvas, `gl.linkProgram`,
  the worker's snapshot messages (typed-array bytes), pointermove listener time on the canvas, and
  layout reads (`offsetWidth` / `getBoundingClientRect`). Each probe ran on the pre-phase files
  (rebuilt byte-for-byte by reversing each edit: same line counts and the same lines at every cited
  position as the files read before the change) and on the final files, back to back. Dev build:
  milliseconds are indicative, counters are the evidence.
- Models: the Welded table example (9 parts, 83 kB of tessellation), two default boards, the kiosk
  example (37 instances, 2.14 MB of tessellation).

## B1.1 One render per commit

| Case                                              | Before        | After         |
| ------------------------------------------------- | ------------- | ------------- |
| (a) snapshot arriving with a part selected (DOM)  | 9             | 1             |
| (b) selection click (DOM)                         | 7             | 1             |
| (c) one translate-drag move (DOM)                 | 2             | 1             |
| (d) one orbit step with placement handles (DOM)   | 2             | 1             |
| selection click, welded table (browser)           | 6             | 1             |
| translate drag, 20 moves (browser)                | 40 (2 / move) | 20 (1 / move) |
| drop: release + model commit + snapshot (browser) | 18            | 4             |
| Undo with the part selected: 2 commits (browser)  | 16            | 2             |
| orbit with hole placement handles (browser)       | 2 / move      | 1 / move      |

Press brake, `scripts/verify-brake-hands-on.mjs`'s own drag-cost record (dev build, 300 × 100 blank,
90 positions, "render" = the workspace's commit-to-draw time per position), before → after: the
card's punch-line drag mean 19.72 → 13.53 ms (median 23.1 → 7.2), the backgauge fingers' drag mean
17.95 → 16.59 ms (median 14.8 → 9.6). One run each, back to back; worst cases are noisy (43.8 →
30.7, 35.7 → 39.2).

The 4 draws left on a drop are TransformControls' own property changes on release (`dragging`,
`axis`: event-driven, one each) and the two commits, one draw each.

## B1.2 Snapshot upload without copies

Bytes copied per snapshot into three's attributes: welded table 82,896 → 0; kiosk 2,137,392 → 0.
Bounds are left to three: the kernel's `bounds` is OpenCascade's box (`BRepBndLib.Add`, enlarged by
the shape tolerance), not proven tight to the tessellation.

## B1.3 Snap-highlight material

Programs linked during a free-move drag of a board along a second one (24 moves, 14 of them holding
an aligned snap): 14 → 1 (the first use of the colour). Welded table drag, 20 moves: 3 → 1; a second
pass over the same drag: 3 → 0.

## B1.4 Pointer scans

- Prefilter, structural: ray-to-segment tests (`Ray.distanceSqToSegment`) over 200 random scenes
  15,962 → 1,941 (`marks.prefilter.test.js`), identical results over 3,000 random scenes.
- Kiosk, Measure hover, 144 paced moves × 3 runs, pointermove handler ms / move: before 3.39–3.96
  (second run 3.45–3.54); with only the prefilter reverted 3.34–3.47; after 2.87–3.19.
- **rAF coalescing skipped**: Chrome delivers pointermove aligned to animation frames. Frames per
  pointermove stayed ≥ 1.0 even with moves sent unpaced (1.00–1.28), so scans per frame were already
  one; coalescing could only add a frame of latency or break synchronous reads.

## B1.5 Face outline cache

- Microbenchmark (Node, a plate meshed like the kernel's, a small face picked 20 times, identical
  output checked per pick): 88,646 vertices 26.7 → 0.21 ms per newly picked face; 378,806 vertices
  167 → 0.53 ms. Vertices taken to world space per pick: the whole mesh → 4 (the face and its rim).
  Adjacency builds: one per newly hovered face → one per geometry.
- Kiosk (small meshes), a fresh print-station face pick (`cadShopTarget`), ms per pick over 37
  points × 3 rounds: run 1 1.42–1.86 → 1.16–1.41, run 2 1.60–2.48 → 1.70–2.02: within noise at these
  mesh sizes, where the raycast dominates.
- Print-station hover on one face: face picks (`faceOutline` calls) per hover frame 1 → 0 after the
  first, the drawn outline object kept (`CadViewport.faces.dom.test.jsx`).

## B1.6 Smaller items

- Hidden viewport (drawing focus, `display: none`): draws during two Undo / Redo pairs 63 → 0; one
  draw on return.
- Pose effect: `instances.find` / `parts.find` per group (3N linear scans per run) → two maps per run.
- `powerPreference: 'high-performance'` on the workshop renderer.
- **`placeHud` size cache skipped**: during a kiosk translate drag the six `offsetWidth` /
  `offsetHeight` reads per move cost 0.005–0.008 ms together. No win to take.
- **Canvas rect cache skipped**: four rect reads per move cost 0.155–0.178 ms together, two of them
  TransformControls' own; a cached rect goes stale on a move without a resize (a scroll, a panel
  shifting the canvas) and would offset every pick.
- Optional sketcher items not attempted.
