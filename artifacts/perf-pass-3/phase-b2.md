# Phase B2: the 3D workshop's React side and kernel pipeline — measurements (2026-11-22)

Spec: `docs/perf-pass-3.md` §6. Files changed: `kernel.worker.js`, `kernel.js` (timing only), `model.js`,
`useCadModel.js` (a comment), `CadWorkspace.jsx`, `SheetsPanel.jsx`, `sheetMetal.js`. Tests added:
`kernel.worker.test.js`, `kernel.timing.test.js`, `CadWorkspace.derive.dom.test.jsx`, `sheetMetal.memo.test.js`;
changed: `shopModel.test.js`, `useCadModel.dom.test.jsx`.

## How it was measured

- **Browser** (headless Chrome via Playwright, Vite dev server on 5183, 1600 × 1000): a probe script outside
  the repo wraps `window.Worker` to log every kernel request and reply (build posted, build run = a reply
  with a result, build skipped = the "Superseded model revision." reply), reads `cadFilm().builds`, and a
  temporary counter in `sheetMetal.js` (`foldSheet` calls and executions; removed afterwards). Run once on
  the pre-phase files (rebuilt from the final ones by reversing each edit: the same line counts as before,
  66 / 957 / 1663 / 8173 for the worker, `model.js`, `sheetMetal.js`, `CadWorkspace.jsx`) and once on the
  final files, back to back. Dev build: milliseconds are indicative, counters are the evidence.
- **DOM / unit counters** (jsdom): render-count tests through `vi.mock` wrappers, run on the pre-phase
  and final files.
- **Event-loop check** for B2.1: the worker's queue logic with a 200 ms busy "build" in a real Worker
  in headless Chrome, with no wait, a `setTimeout(0)` wait and a `MessageChannel` wait.

## B2.1 The worker's stale-build skip

Event-loop check (real Worker, revisions 1 … 7 posted 20 ms apart during build 1, a drawing request
between them):

| Wait before the check   | Kernel awake              | Kernel waking (WASM init) |
| ----------------------- | ------------------------- | ------------------------- |
| none (before)           | 7 builds run, newest last | 2 run (1, 7)              |
| `setTimeout(0)`         | 2 run (1, 7)              | 2 run                     |
| `MessageChannel` (kept) | 2 run (1, 7)              | 2 run                     |

The drawing request answered in its place in every case.

| Kiosk, six `]` turns 120 ms apart on Front display (browser) | Before   | After                       |
| ------------------------------------------------------------ | -------- | --------------------------- |
| builds posted                                                | 6        | 6                           |
| builds run                                                   | 6        | 2                           |
| builds answered "Superseded"                                 | 0        | 4                           |
| last press → "Model current"                                 | 8 516 ms | 2 364 ms (2 358 on a rerun) |

Unit (`kernel.worker.test.js`, fake `self`, a 60 ms build, six edits during build 2): builds run for
revisions 3 … 8: 6 → 1 (the pre-phase worker fails the test on the count only).

## B2.2 Edits the kernel never sees

| Kernel builds started (browser)                             | Before | After |
| ----------------------------------------------------------- | ------ | ----- |
| Add a Measure mark (one board)                              | 1      | 0     |
| Hide Front display (kiosk)                                  | 1      | 0     |
| Show it again                                               | 1      | 0     |
| Rename Front display (kiosk, an instance with its own name) | 1      | 0     |
| A turn (control)                                            | 1      | 1     |

(`cadFilm().builds` and the worker log agree on every row.) After Hide the viewport shows the part
hidden (`cadViewMode().bodies`: 1 not visible).

## B2.3 Derivations that run when nothing needs them

Calls per case, DOM (`CadWorkspace` with a kernel stand-in that keeps one snapshot per model, three
legs, the assembly sheet generated):

Each cell: layoutParts / sheetSvg / treeRows / buildCutList / shopRecordRows / modelPoses.

| Case                                            | Before                | After                 |
| ----------------------------------------------- | --------------------- | --------------------- |
| no panel, 3 renders that change nothing         | 0 / 0 / 3 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| no panel, a new model                           | 0 / 0 / 2 / 1 / 1 / 1 | 0 / 0 / 1 / 0 / 0 / 0 |
| a selection click                               | 0 / 0 / 2 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| Hide (one commit)                               | 0 / 0 / 3 / 1 / 1 / 1 | 0 / 0 / 2 / 0 / 0 / 0 |
| pane open + Sheet panel, 3 idle renders         | 3 / 3 / 3 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| pane open + Sheet panel, a new model            | 1 / 1 / 2 / 1 / 1 / 1 | 1 / 1 / 1 / 0 / 0 / 0 |
| pane open + Sheets panel, 3 idle renders        | 6 / 3 / 6 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| pane closed + Sheets panel, 3 idle renders      | 6 / 3 / 6 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| pane closed + Sheets panel, a new model         | 2 / 1 / 3 / 1 / 1 / 1 | 1 / 0 / 1 / 0 / 0 / 0 |
| pane closed + Fabrication panel, 3 idle renders | 3 / 3 / 3 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| pane closed + Fabrication panel, a new model    | 1 / 1 / 2 / 1 / 1 / 1 | 0 / 0 / 1 / 0 / 0 / 0 |
| Cutting list panel, a new model                 | 1 / 1 / 2 / 1 / 1 / 1 | 0 / 0 / 1 / 1 / 1 / 0 |

The `treeRows` call left on a
model change is the job sheet's `jobProducts` (a memo on the model, not part of this item); the one on
Hide is the tree itself.

JSON editor keys: `JSON.stringify` of the model / sketch / connections / instance per render → once per
object (a `WeakMap` by identity, same key text). Not timed.

## B2.4 `foldSheet`

| Kiosk, Shop tab open (browser)        | Before: calls = executions | After: calls / executions |
| ------------------------------------- | -------------------------- | ------------------------- |
| rename Front display (a commit)       | 32                         | 22 / 0                    |
| turn Front display (commit + rebuild) | 32                         | 22 / 0                    |
| a tree selection                      | 0                          | 0 / 0                     |
| Hide / Show on the Assemble tab       | 10 each                    | 0 / 0                     |
| six-turn burst on the Assemble tab    | 10                         | 0 / 0                     |

(The after-run's call counts on Hide / Show and the burst are 0 because B2.3 stopped the cut list that
called them.) Kiosk blank fold times, warm, Node: 8.1 ms (face frame), 1.8, 1.4, 2.2, 0.3 ms; a fold is
3–27 kB as JSON.

Safety evidence (no caller changes a fold, nor an input after folding it):

1. Every result deep-frozen (`Object.freeze` over the whole tree) in `foldSheet`, whole `cad/` suite:
   no TypeError; the 8 files that timed out under load re-run alone with a 60 s timeout: 164 / 164 pass.
2. Inputs deep-frozen on the cached path: one in-place write, `shopExamples.js:269-270`
   (`bodyFeature.marks = …` after folding the control box's blanks). `foldSheet` never reads a feature's
   `marks` (it reads `thickness`, `stock`, `kFactor`, `base`, `bends`), so the kept fold is still right.
3. A stale-hit detector (on every cache hit, the feature without `marks`, the profile and the params
   compared as JSON with what was folded; plus the result frozen), whole `cad/` suite: no stale hit, no
   TypeError (3 failures: two time budgets, the probe's JSON cost, and the hands debounce test, which
   passes alone and in the final run).

## B2.5 Kernel timing probes

`snapshot.debug` on every build (kiosk, 37 instances, dev build, browser):

|                                               | first build | burst build 1 | burst build 2 |
| --------------------------------------------- | ----------- | ------------- | ------------- |
| buildMs (parts made and placed)               | 1 997       | 1 274         | 1 129         |
| snapshotMs                                    | 708         | 563           | 548           |
| meshMs (OpenCascade `mesh`)                   | 645         | 511           | 499           |
| edgesMs (`meshEdges`)                         | 17          | 9.5           | 10.4          |
| copyMs (typed-array copies)                   | 4.2         | 3.5           | 3.7           |
| transfer (page clock on arrival − `postedAt`) | 1.0         | 1.8           | 0.8           |

So meshing is about 90 % of the snapshot and a third of a rebuild; the copies and the transfer are
noise. That is the number D8 (tessellate once per part) was waiting for.

## Browser scripts (final files, Vite on 5183)

Pass: `verify-measure-marks`, `verify-cad-groups`, `verify-fab-shop-sm1` … `sm4`, `verify-shop-floor-sf1`,
`sf3`, `sf5`. Fail on the final files **and on the pre-phase files at the same line** (stale scripts,
not this phase): `verify-engineering-drawings` (line 27: no sheet option "Pump bracket — dimensioned
part"), `verify-assemble-and-draw` (line 232: the download it waits for never comes), and
`verify-shop-floor-sf4` (line 111: the kiosk has 14 parts, the script expects 8).
