# Phase D1: planner domain and store — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §8. Browser numbers: headless Chrome (`channel: 'chrome'`), dev server on port
5184, `/playground` (3 storeys, a truss, a roof), 1600×1000. Probe scripts: `phase-d1-probes/`
(`probe-drag.mjs` is Phase A's fixture drag with the port changed; `probe-lifecycle.mjs` counts stage-form
remounts). Node numbers: temporary vitest benches through the real reducer (deleted afterwards). This machine
was shared with another builder during the run, so wall-clock numbers are noisy; the counters are the
evidence, and the timing A/Bs were interleaved in one process.

## D1.2 `syncCanonicalBuilding` keeps identity — DONE

Fixture drag through the reducer, playground, 30 commits (node, `buildPreviewScene` with a descriptor memo):

| Counter                                                                 | Before                          | After                                                         |
| ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| Commits that changed `project.building`                                 | 30 / 30                         | 0 / 30                                                        |
| Commits that changed `project.building.systems`                         | 30 / 30                         | 0 / 30                                                        |
| Floor preview `sourceKey`s changed (3 storeys + 1 roof layer)           | 91 (every storey, every commit) | 32 (the dragged storey 30×; top storey + roof once, see note) |
| Descriptor objects regenerated over the drag                            | 12 779                          | 2 747                                                         |
| Column drag (MOVE_COLUMN command per frame): building / systems changed | 30 / 30                         | 0 / 30                                                        |

Browser, Phase A's fixture drag (2 × 30 paced moves, preview visible, dev build / StrictMode):

| Counter                                        | Before  | After D1.2 | After D1 (all)  |
| ---------------------------------------------- | ------- | ---------- | --------------- |
| Descriptor objects regenerated (sum over drag) | 23 829  | 4 879      | 4 879           |
| Descriptor time, sum                           | 74.9 ms | 47.6 ms    | 52.2 ms (noise) |
| `cache.build + setWorld` per rebuild, median   | 3.4 ms  | 2.0 ms     | 2.2 ms          |

`syncCanonicalBuilding` cost (same input, interleaved A/B, 400 calls × 8 rounds): playground 0.069 → 0.110 ms,
bench-ceiling project 0.039 → 0.084 ms. The structural-sharing pass adds ≈ 0.04–0.06 ms per sync (two syncs
per building-command frame). In the drag bench `syncProjectStructures` medians were 0.175 ms before and
0.34–0.89 ms after across three noisy runs; the A/B above is the trustworthy figure.

Lifecycle panel stage forms (browser, `probe-lifecycle.mjs`: type a draft into the stage's first field, then
the same 60-move fixture drag; counts replacements of the stage root):

| Stage                                                   | Before: remounts / draft kept | After: remounts / draft kept |
| ------------------------------------------------------- | ----------------------------- | ---------------------------- |
| Brief                                                   | 0 / yes                       | 0 / yes                      |
| Site, Spaces, Structure, Systems, Quantities, Documents | 56 / no (each)                | 0 / yes (each)               |
| Validate (no form)                                      | 0                             | 0                            |

Note: on a freshly loaded playground the first commit also rebuilds the top storey and the roof because the
TRUSS sync is not idempotent on its first pass (`trussSystems[0].endClosures.colour.solarAbsorptance`
null → 0). Pre-existing, out of scope, reported.

Side questions: (a) both syncs kept (the reducer's second sync now returns the commandSuccess building
object unchanged); (b) `deriveAreaLedger` on the command path skipped — 0.005–0.006 ms per call, and
END_DRAG_GESTURE does not recompute `lastCommand.changes`.

## D1.1 Derivations repeated within one edit — DONE

Executions per settled `WALL_UPDATE` through the reducer (temporary counters, removed):

| Function                                                         | Playground (0 scenarios) before → after | Nu project (2 scenarios, issued docs) before → after |
| ---------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| deriveGeometry (takeoff measuring)                               | 16 → 1                                  | 63 → 1                                               |
| deriveQuantityTakeoff (pricing pass only now)                    | 16 → 4                                  | 63 → 8                                               |
| deriveFeasibilityEconomics                                       | 11 → 1                                  | 38 → 3 (null + each scenario)                        |
| deriveFeasibilityComparison (not memoised)                       | 11 → 2                                  | 11 → 2                                               |
| deriveCostRealization                                            | 10 → 1                                  | 10 → 1                                               |
| deriveDocumentationRealization                                   | 3 → 1                                   | 3 → 1                                                |
| deriveProfessionalHandoff                                        | 2 → 1                                   | 2 → 1                                                |
| record() calls (fingerprints hashed only for unseen objects now) | 306 → 153                               | 540 → 270                                            |

Settled-edit time (whole reducer, coordination pass included), interleaved A/B with the memos switched off
by a temporary flag (12 runs each):

| Project                             | No memo, min / median        | Memo, min / median          |
| ----------------------------------- | ---------------------------- | --------------------------- |
| Playground (quiet run)              | 23.7 / 33.5 ms               | 10.2 / 14.6 ms              |
| Nu, 2 scenarios (quiet run)         | 43.6 / 52.7 ms               | 15.4 / 19.8 ms              |
| Playground (loaded machine, 2 runs) | 51.6 / 108.8, 38.6 / 71.9 ms | 22.7 / 35.7, 16.6 / 30.1 ms |
| Nu (loaded machine, 2 runs)         | 89.1 / 100.8, 51.0 / 61.5 ms | 30.6 / 39.6, 21.3 / 25.1 ms |

A memo hit (identity snapshot of project, building, storeys and storey entries): 6–8 µs.

## D1.3 Autosave — DONE

jsdom, localStorage with 11 drafts (4 × bench-ceiling, 4 × playground, 3 starters; 419 k chars):

| Part of the autosave task                             | Before  | After                         |
| ----------------------------------------------------- | ------- | ----------------------------- |
| Save (serialize + setItem + index), sync part         | 0.39 ms | 0.39 ms (unchanged)           |
| Draft prune in the same task, first in session (cold) | 8.0 ms  | 0 (moved to an idle callback) |
| Same, once drafts are known to hold work (warm)       | 0.08 ms | 0 (moved)                     |

## Tests (last runs)

- `npx vitest run src/domain src/features/floorplan/store src/persistence src/features/floorplan/hooks` →
  105 files, 1292 tests passed.
- `npx vitest run src/features/floorplan src/three src/geometry src/roof src/truss src/sheets src/sections
src/elevations src/analysis src/editor` → 221 files, 2908 tests passed.
- eslint on every touched file → clean.
