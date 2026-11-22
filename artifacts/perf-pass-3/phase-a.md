# Phase A: the planner's 3D preview — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §4. All browser numbers: headless Chrome (`channel: 'chrome'`, ANGLE/D3D11 on
this machine's GPU), dev server on port 5181, `/playground` (3 storeys, 2 built on, stairs, one truss
system, one roof), desktop user agent (Electron token → `IS_DESKTOP_APP`, refine supersample 2), window
1600×1000 at DPR 1, preview pane canvas 447×704. Headless rAF runs at 144 Hz here (6.9 ms intervals).
Probe scripts: `phase-a-probes/` (they write into the session scratchpad; `pixels-a3.mjs` needs the
temporary harness module described under A3, deleted afterwards; `probe-overlay.mjs` needed two
temporary counters in the panel, also removed).

## A1. Render-scale governor — DONE

Structural counters (`window.__previewPerf.snapshot()`, now with `interactiveGap {p50Ms, p95Ms,
over20MsFraction}` and `progressive.interactiveScale` / `progressive.governor`):

| Case                                                                                                                                         | Before                                    | After                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| This GPU (holds 144 fps), 4 orbits × 90 moves                                                                                                | scale 1 (constant)                        | scale 1, `governor.changes` 0, interactive gap p50 7.0 / p95 7.1 ms, 0 % over 20 ms                                            |
| Progressive renderer at scale 1, seeded fixed scene, interactive / sample 0 / converged, AO on / off / transparent backdrop                  | —                                         | bit-identical to the HEAD renderer (0 differing pixels in all 9 images)                                                        |
| Simulated GPU-bound machine (`probe-gov.mjs`: a frame that drew holds the next rAF back by 30 ms × pixel ratio, quantised to vsync), orbit 1 | gap p95 34.8 ms at scale 1 (first window) | stepped to 0.58 mid-orbit after the first full window; then p50 13.9 / p95 14.1 ms, 0 % over 20 ms                             |
| Same, orbits 2–6                                                                                                                             | —                                         | trial step-up to 0.7 at orbit 4 failed (14.7 ms of work quantises to 20.8 ms on 144 Hz), back to 0.58, wait 3 → 6              |
| Same, settled image                                                                                                                          | 894×1408 (2×)                             | 894×1408 (2×) — refine not governed                                                                                            |
| Walk mode, same simulation (`probe-walk.mjs`, no-clip fly, W held 1.5 s ×3)                                                                  | —                                         | one mid-walk step to 0.58; settled walk refine at 259×408 (= governed size), 12 samples, **0** MSAA reallocations on each stop |
| Save image in that governed walk                                                                                                             | —                                         | accumulation re-rendered at 447×704 (scale 1), same 12 samples, PNG saved                                                      |

Unit traces (`renderScaleGovernor.test.js`, 19 tests): steady 60 never engages (40 orbits); 16.5 ms of
GPU work never engages; one 250 ms long task, and two long tasks in one window, do not step down; steady
30 fps steps to 0.58 only after ≥ 20 frames / 0.5 s and holds; short gestures decide at the next gesture
start, never mid-gesture; 144 Hz at 72 fps and at 144 fps hold; 144 Hz at ~40 fps steps; 50 Hz panel and a
30 fps rAF cap never engage; a submission-bound frame never engages; scene-dirty frames and broken loops are
ignored; occlusion drops only at 0.5 still over budget and is restored first; trial step-up doubles the
wait to the 24 cap; reset restarts the wait and keeps the rung; walk (one long gesture, IDLE frames)
steps once; nothing is judged before the display interval is known; refine-gap reporting.

## A2. Refine budget from the frame gap — DONE

| Case                                                                        | Before                                                                    | After                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| This GPU, inspect refine                                                    | 128 samples (cap)                                                         | 128 samples (gap 6.9 ms → 2500 / 6.9 = 362, capped) |
| This GPU, walk refine                                                       | 12                                                                        | 12                                                  |
| Simulated GPU-bound (30 ms per canvas-pixel frame, so 120 ms per 2× sample) | 128 by submit time (≈ 15 s of saturated GPU, by arithmetic: 128 × 120 ms) | 19–20 samples (≈ 2.4 s, the documented 2500 ms)     |

## A3. Composer memory — DONE (MSAA rule changed from the spec's, see report)

| Counter (this GPU, 447×704 canvas, 2× refine)                        | Before                         | After                                                    |
| -------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| MSAA resolves (`blitFramebuffer`) per interactive frame with AO      | 3.98                           | 1.33                                                     |
| `bindFramebuffer` per interactive frame                              | 30.65                          | 17.37                                                    |
| MSAA resolves over a 128-sample refine                               | 690                            | 229                                                      |
| Multisampled renderbuffers allocated per gear shift                  | 4 (2 targets × colour + depth) | 2 (1 target)                                             |
| Scene-target samples: interactive / 2× refine / 1.5× refine          | 8 / 8 / 8                      | 8 / 4 / 8                                                |
| Estimated offscreen chain (`getStats().vramMB`), interactive 447×704 | 78 MB (260 B/px)               | 48 MB                                                    |
| Same, 2× refine 894×1408                                             | 312 MB                         | 134 MB                                                   |
| 2560×1440 window refine (14.7 MP, by `estimateOffscreenBytes`)       | 3.57 GiB (260 B/px)            | 1.54 GiB (112 B/px)                                      |
| 4K window refine at DPR 1 (canvas 8.3 MP)                            | 33 MP asked for, ≈ 8.0 GiB     | capped to 16 MP (supersample 1.389, keeps 8×), ≈ 2.4 GiB |

Pixels (seeded fixed scene through the real renderer vs the HEAD renderer, `pixels-a3.mjs`):

- Plain write buffer alone: **bit-identical** in all 15 images (interactive, sample 0, converged × AO,
  no AO, transparent backdrop, AO toggled on→off→on, AO toggled off→on→off).
- Final (plain write buffer + 4× at 2× refine): interactive frames identical; DPR 2 (1.5× refine, keeps
  8×) identical in all 21 images; DPR 1 sample 0 differs on 1.0 % of pixels, converged (16 samples) on
  0.9 %; 83–100 % of differing pixels sit on a ≥ 12-level edge step, the rest differ by ≤ 1/255
  (converged) / ≤ 3/255 (sample 0).
- Edge residual (tilted black card on white, RMS px; no AA = 0.29): interactive 0.0393 → 0.0393;
  sample 0 0.0127 (8×) → 0.0265 (4×), still below the 0.0393 frame it follows; converged 0.0035 → 0.0038.
  Rejected: 2× MSAA at 2× refine (the spec's rule) gives sample 0 = 0.0626, worse than the interactive
  frame; 4× at 1.5× refine gives sample 0 = 0.0634 vs 0.0515 with 8×.

## A4. Rebuild path during a plan drag — PARTLY DONE

Fixture drag on the ground floor, 2 × 30 paced moves, preview visible (`probe-drag.mjs`; dev build, so
React StrictMode runs every memo twice — the second, identical call is free with the memo):

| Counter                                                                                                              | Before                                 | After                                                  |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Scene descriptors built during the drag                                                                              | 112                                    | 112                                                    |
| Descriptor objects regenerated (sum over the drag)                                                                   | 50 848 (454 per descriptor, all)       | 23 829                                                 |
| Descriptor time (sum) / per descriptor                                                                               | 95.1 ms / 0.85 ms                      | 42.9 ms / 0.38 ms                                      |
| Per committed project (vitest micro-bench, no StrictMode)                                                            | 0.89 ms, 454 objects                   | 0.38 ms, 202 objects (the 252 truss objects come back) |
| Same, if `project.building.systems` kept identity (D1.2)                                                             | 0.90 ms                                | 0.20 ms (untouched floors come back whole)             |
| `cache.build + setWorld` per rebuild (mean)                                                                          | 2.29 ms                                | 2.02 ms                                                |
| Selection overlay rebuilds: drag of the selected fixture / 6 undo-redo rebuilds after it (undo clears the selection) | 7 / 6 (before: by code, one per build) | 7 / 1 (the clearing one; 5 kept)                       |
| Overlay rebuild cost (median, measured before)                                                                       | 0.9 ms (max 2.0)                       | 0 when kept                                            |

Why untouched floors still rebuild in today's drag: every commit hands back a new `project.building.systems`,
which is in every floor's `sourceKey` (measured: `systems` changed on 56 / 56 commits for every floor).
That is D1.2's item, outside this phase's files.

Skipped: ground and grid reuse — measured 0.026 ms (grid) + 0.031 ms (ground) per rebuild, and reusing the
grid object keeps its old `Object3D.id`, which changes the transparent draw order against meshes at the
same depth. Skipped: the optional per-floor freeze / outline flags — with every floor re-keyed per commit
(above) there is nothing for a per-floor flag to skip until D1.2 lands.

## A5. Resize — DONE

12-step window resize (`probe-a.mjs`; the pane goes 447 → 397 px wide):

| Counter                                                         | Before  | After A3 | After A5 |
| --------------------------------------------------------------- | ------- | -------- | -------- |
| `texStorage2D` calls (one per chain reallocation in these runs) | 13      | 13       | 4        |
| MSAA renderbuffers allocated                                    | 52      | 26       | 8        |
| `texImage2D`                                                    | 78      | 78       | 24       |
| Final drawing buffer                                            | 397×664 | 397×664  | 397×664  |

(The 13 / 4 include the refine's own step-up after the drag.)

## A6. Chrome over the canvas — DONE

| Counter                                                                                                                                  | Before                                                            | After |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| `backdrop-filter` inside the preview pane (computed styles, pane loaded)                                                                 | 2 (compass 8 px, Refining chip 6 px)                              | 0     |
| `backdrop-filter` in `PanePlaceholder.module.css` (by reading the CSS; the placeholder is gone once the pane is loaded, so not measured) | 1 (`.words`, 6 px)                                                | 0     |
| Compass needle style writes after an orbit's release (settle + 128-sample refine + damping tail, `probe-compass.mjs`)                    | 275 (one per frame; every value distinct, from the damping drift) | 45    |

Background alphas raised: compass gradient 0.9 / 0.8 → 0.97 / 0.93; Refining chip
`--color-surface-glass` (0.72) → `rgba(255,255,255,0.92)`; placeholder chip 0.86 → 0.94 (light),
0.82 → 0.92 (dark).

## Tests

`npx vitest run src/features/floorplan/components/preview src/three/scene` → 46 files, 594 tests passed
(baseline for the same paths at the start: 40 files, 549 tests). `npx eslint src/features/floorplan/components/preview src/three/scene` → clean.
