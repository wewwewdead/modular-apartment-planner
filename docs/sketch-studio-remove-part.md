# Phase M.1 — Removing hardware (and any part's only feature) without breaking the model

Bug-fix spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-01 by Fable after reading the
code; to be built by Opus; audited by Fable. It follows Phase M
(`docs/sketch-studio-hardware-holes.md`); its rules and process notes apply.

## 1. The bug, in the user's words

> When I tried to remove the bolts that are added, or hardware that are added,
> it throws an error: "Hex bolt M3 has no active solid features. Last valid
> geometry is shown; current-design exports are disabled."

## 2. Cause (verified)

Selecting a bolt instance opens its part's feature section in the Properties
panel. `CadWorkspace.jsx:305` picks the feature to show as
`part.features.find(f => f.id === featureId) || part.features.at(-1)`, so for a
hardware part (which has exactly one feature, `hardware`) the section
**HARDWARE · FEATURE 1** is open at once, with its fields and two buttons
(`CadWorkspace.jsx` ~2951–2971):

- **Suppress** → `changePart` with the feature `suppressed: true`;
- **Remove feature** → `changePart({ ...part, features: part.features.filter(f => f.id !== feature.id) })`.

Either one commits a part definition with **no enabled feature**. The kernel
then throws at `kernel.js:427` (`${part.name} has no active solid features.`)
for every instance of it, `useCadModel` records the error, and the banner at
`CadWorkspace.jsx:2089–2093` adds "Last valid geometry is shown;
current-design exports are disabled." The broken model is already committed
(the error comes from the rebuild), so the user is left with three invisible
bolts and a red banner. The same happens to a board whose only `box` feature
is removed, and to any part whose last enabled feature is removed or
suppressed.

**Remove instance** (`CadWorkspace.jsx` ~2973–2981, `removeInstance` in
`model.js:112`) works and is the right action for _one_ bolt: it drops the
instance with its concentric connection, marks and sheet references, and the
part definition stays with its feature. But it sits at the bottom, and the
button the user reaches first — "Remove feature" under the bolt's fields —
breaks the model.

## 3. Fix

### 3.1 `model.js` — `removePart(model, partId)`

A pure helper next to `removeInstance`:

- If any feature of any **other** part (enabled or suppressed) has
  `toolPartId === partId` → `throw new Error(`"${name}" is the Boolean tool of
  "${otherName}" (${feature.type}); remove that feature first.`)`. (Leaving
  the reference would be a "Broken tool reference" diagnostic,
  `model.js:258`.)
- Otherwise: run `removeInstance` for every instance whose `partId` is the
  part (so connections, marks, `sheet.instanceIds` and instance-anchored
  annotations are cleaned exactly as today), then drop the part from
  `parts`, drop every sheet whose `sheet.partId === partId` (a part detail
  sheet of a deleted part has nothing to show; `validateReferences` would
  flag it at `model.js:280`), and drop any remaining `sheet.annotations`
  whose `a.partId === partId` (hole chains / callouts of that part,
  `model.js:284`). Return the new model. Everything else untouched.

### 3.2 Properties panel — the feature section (`CadWorkspace.jsx` ~2951–2971)

Define `sole` = the shown feature is the part's only **enabled** feature
(`part.features.filter(f => !f.suppressed)` has length 1 and it is this
feature). When `sole`:

- **Suppress** is rendered `disabled` with
  `title="The only active feature of a part cannot be suppressed; remove the part instead."`
- **Remove feature** is replaced by a `cad-danger` button
  **Remove part · N instances** (`N instance` when 1; the count = instances
  whose `partId` is the part) that runs, through `perform` so a refusal shows
  in the error line:
  `commit(removePart(model, part.id)); select(null); setFeatureId(null);`
- A `cad-help` line above it: _This is the only active feature of
  {part.name}: removing it removes the part and its N instances. To remove
  just this one, use Remove instance below._

When not `sole`: unchanged (Suppress / Remove feature as today).

### 3.3 Remove instance (should)

When **Remove instance** removes the **last** instance of a `hardware` part
(a part whose only feature is `type: 'hardware'`), also drop the definition
(`removePart` after `removeInstance`, or `removePart` directly — it removes
the instance too). Reason: hardware definitions are created by Add hardware
and never reused by hand; a bolt with no instances lingers under _Reusable
definitions · N_ and in the definitions count for nothing. Boards, tubes and
other parts keep their definition as today (the _Reusable definitions_ list
can place them again). _Should; report if cut._

### 3.4 Not changed

- `kernel.js:427` stays: an empty part in an old save still reports clearly.
- `changePart` gets no general guard (other feature-editing paths, JSON
  editor included, are left alone); say so in the report.
- No `CAD_VERSION` change; nothing new persisted.

## 4. Tests

- `model.test.js`: `removePart` on a fixture with a board (`box` + `hole`),
  a bolt part with 3 instances each concentric to the board, a mark anchored
  on bolt 2, a sheet with `instanceIds` listing bolt 1 and the board, a sheet
  with `partId` = the bolt part, and a hole-callout annotation with
  `partId` = the bolt part on the board's sheet → the bolt part, its 3
  instances, 3 connections, the mark, the bolt's entry in `instanceIds` and
  the two sheet items are gone; the board, its instance and its sheet remain;
  a second fixture where the board has a `subtract` feature with
  `toolPartId` = the bolt part → `removePart` throws the §3.1 message and
  the model is unchanged; `removeInstance` unchanged (existing tests).
- DOM, new `CadWorkspace.remove.dom.test.jsx` (reuse the stand-ins of
  `CadWorkspace.place.dom.test.jsx`): with the fixture above loaded, select
  bolt 2 in the tree → the feature section shows **Remove part · 3
  instances** and the help line, no "Remove feature", Suppress disabled;
  click it → `setCadModel` called once with parts = [board], instances =
  [board's], connections = [], `selectedId` null; select the board → its
  `hole` feature shows "Remove feature" (not sole) and clicking it keeps the
  board; its `box` feature (after the hole is removed) shows **Remove part ·
  1 instance**; "Remove instance" on bolt 2 → 2 bolts remain and the part is
  kept; (should) "Remove instance" on the last bolt → the definition is gone
  too; (should) with a `subtract` referencing the bolt part, Remove part
  shows the refusal in the error line and commits nothing.
- Browser: extend `scripts/verify-hardware-holes.mjs` **after its Undo step**:
  Redo → the three bolts are back (`savedWhen` instances +3) → select the
  second bolt in the tree (`.cad-tree` buttons named "Hex bolt M6"; pick the
  second) → **Remove instance** → saved instances +2, connections 2, no
  `.cad-error`, "Model current" → select a bolt → **Remove part · 2
  instances** → saved model = the board only (parts 1, instances 1,
  connections 0), no `.cad-error`, "Model current" → a screenshot. Then
  re-run `verify-hole-hardware`, `verify-cut-placement` and `verify-sketch-cad`
  (they touch the same panel).
- Docs: `docs/sketch-studio-cad.md` "Hardware and metric threads": two
  sentences after the seating paragraph — _To delete one bolt, select it and
  use Remove instance. A part's only feature cannot be removed or suppressed
  on its own: the button becomes Remove part and removes the definition with
  every instance of it._

## 5. Process rules

As Phase M §9: no commit; stay in `cad/`, `scripts/`, `docs/`; match line
endings (`CadWorkspace.jsx`, `model.js`, `model.test.js`, the docs and the
untracked `*.place.dom.test.jsx` are LF; `kernel.js` and `CadViewport.jsx` are
CRLF and are not touched here); run Vitest from the repo root; report baseline
and final counts (last known: cad 45 files / 498 tests, full 379 / 4638);
`npm run lint` 0 errors; stop the Vite server and confirm nothing listens on
5180; flag every judgment call with `file:line` anchors.

## 6. Acceptance

- [ ] Select a bolt → Remove part · N instances (no "Remove feature",
      Suppress disabled) → the part, every bolt and every connection are gone,
      no error banner, "Model current".
- [ ] Remove instance on one bolt removes just that bolt; (should) on the last
      bolt also the definition.
- [ ] A board's hole still has Remove feature; its sole box offers Remove part.
- [ ] A part used as a Boolean tool refuses removal with the named message.
- [ ] `verify-hardware-holes` (extended), `verify-hole-hardware`,
      `verify-cut-placement`, `verify-sketch-cad` pass; lint 0 errors; all
      tests green.
