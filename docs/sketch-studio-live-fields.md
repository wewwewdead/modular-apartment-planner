# Phase L — Live property fields: the model follows what you type

Spec for the Sketch Studio "3D Model & workshop" workspace
(`src/features/sketchstudio/cad/`). Written 2026-11-01 by Fable after reading the
code; built by Opus; audited by Fable against this document. Phases H–K
(`docs/sketch-studio-direct-placement.md`, `-cut-placement.md`, `-hole-row.md`)
stay as they are; this phase changes how the panel fields commit.

## 1. The problem, in the user's words

> Can we make it dynamically update the position of the hole if I change the
> number of rows in the properties tab, instead of updating it after I click
> Enter? Do it in all tools please. Dynamically update if I change the
> properties.

Verified: every numeric or text field in the workstation's Properties panel is
`ValueField` (`CadEditors.jsx:9`), a text draft over `ExpressionInput` that
calls `onChange` **only on blur** (Enter blurs). So typing `6` into _Holes in
row_, `50` into _Spacing (mm)_, `25` into _Length (mm)_ or `3` into _Depth
(mm)_ changes nothing until Enter or a click elsewhere. There are ~70 call
sites: `CadEditors.jsx` (24: `VectorFields`, pattern/reference fields,
`CutSizeFields`, `CutLocationFields`, `RowFields`, sketch form, constraint
editor), `OperationPanel.jsx` (9: part name, placed profile sizes, sweep
section/wall/bend, profile fields), `SketchPanels.jsx` (2: name, distance),
`CadWorkspace.jsx` (7: hole-tool template, mate offset, fabrication, part name,
instance Position/Rotation via `VectorFields`), `SheetEditor.jsx` (10),
`HardwarePanel.jsx` (`HardwareFields`), `ConnectionEditor.jsx` (offset),
`ProfileEditor.jsx` (sizes).

Two things stand in the way of simply committing on every keystroke:

1. **Value-keyed remounts.** About 40 call sites give the field a key that
   contains its value (`key={`diameter-${feature.diameter}`}`,
   `key={`row-count-${count}`}`, `key={`${sheet.id}-${key}-${sheet[key]}`}`,
   `VectorFields`' `key={`${index}-${component}`}` …). Under live commits each
   keystroke would change the key, remount the input and drop focus after one
   character.
2. **Undo spam and transient invalid values.** Committed paths (the tree
   editor's `FeatureForm`, instance Position/Rotation, sheets, connections,
   fabrication) go through `commit` → `setCadModel` →
   `SET_CAD_MODEL` → `finalizeUndoableState` (`store/sketchStudioReducer.js`
   ~193, ~208), one history entry per call; typing `150` would be three undo
   steps and would briefly rebuild the model with `1` and `15`. The reducer
   already supports `options.skipHistory`; `SET_CAD_MODEL` just never passes it.

Draft paths (`setOperationDraft` through `OperationPanel`'s `onChange`,
`changeSketchOperation`, the hole-tool `holeTemplate`, `mateSession`) have no
history; their previews already rebuild from state through `useCadModel`
(50 ms debounce, worker `supersede`), so for them live commits are purely a
field change.

## 2. Principles

1. **The model follows the field.** A valid value is applied as soon as it is
   typed (after a short settle), in every panel: operation previews, the tree
   editor, instances, sheets, connections, hardware, fabrication.
2. **Invalid text never commits.** Empty, `-`, `1.`, `=pi` (unresolvable) wait
   for Enter/blur, where today's error reporting applies. Live validation
   failures are silent.
3. **Focus is never lost** while typing; the caret stays where it was.
4. **One undo step per field edit.** Typing `1`,`5`,`0` then Tab is one
   history entry; Undo restores the value before typing.
5. Enter, Tab and click-away still commit; **Escape reverts** to the value the
   field had when it was focused.
6. Structural side effects wait for the commit (Enter/blur): typing `1` on the
   way to `12` in _Holes in row_ must not delete the row.
7. Browser scripts and tests that `fill()` then press Enter keep passing.

## 3. The field contract (`ValueField`, `CadEditors.jsx`)

```jsx
<ValueField label value onChange(next, meta) asText live={true} />
// meta = { live: boolean, session: string }
```

- **Draft** text state as today. A `focused` ref; a `session` id created on
  focus (`uid('field')`), cleared on blur.
- **Live commit:** on every input change, if `live` (default `true`): compute
  the committable value — `asText` → the text; else a finite `Number(text)`;
  else, when the text starts with `=`, `evaluateSketchExpression(text,
{ context: useContext(ParameterContext).values })` finite → the **string**
  (an expression stays an expression). If committable and different from the
  last committed value, schedule `onChange(value, { live: true, session })`
  after `LIVE_DEBOUNCE_MS = 150` (restart the timer on each keystroke). Not
  committable → do nothing live.
- **Enter / blur:** cancel the timer; if the trimmed text differs from
  `String(value ?? '')` commit as today (`onChange(valueOrText, { live: false,
session })`, so a non-numeric non-expression text still reaches the consumer
  and its error shows); Enter blurs as today. After blur the draft syncs to
  the prop (so `050` reads `50`).
- **Escape:** cancel the timer; if a live commit happened this session,
  `onChange(startValue, { live: false, session, revert: true })` with the
  value captured at focus; set the draft to it; blur.
- **Prop sync:** `useEffect(() => { if (!focused.current) setDraft(String(value
?? '')) }, [value])`. While focused the draft is never overwritten by props
  (a live commit echoing back `50` must not turn the draft `50.` into `50`).
- **↑ / ↓ (should):** when no suggestion list is open and the draft is a plain
  finite number, step it by 1 (Shift = 10) and commit immediately with
  `{ live: true, session }`. (Today the key does nothing in the field; the
  workspace's ↑/↓ row-count handler is blocked while an input has focus by
  `editableTarget`, so there is no clash.)
- **Remove every value-bearing key** on `ValueField` / `VectorFields` call
  sites (the list in §1 item 1; grep `key={\`` next to `<ValueField`in`CadEditors.jsx`, `OperationPanel.jsx`, `SketchPanels.jsx`, `CadWorkspace.jsx`,
`SheetEditor.jsx`, `HardwarePanel.jsx`, `ConnectionEditor.jsx`,
`ProfileEditor.jsx`). Keys that identify the **object** stay
(`key={`${sheet.id}-${key}`}`, `key={feature.id}`on forms, the index in`VectorFields`); the value part goes. A field must keep its identity across
  its own commits; switching the selected feature/sheet still remounts through
  the object key.
- `VectorFields` passes `meta` through: `onChange(value.map(...), meta)`.

## 4. Consumers that must respect `meta.live`

- `RowFields` (`CadEditors.jsx` ~765): count `1` removes the row **only when
  `!meta.live`**; counts outside `minCount…100` are ignored live (no inline
  error); creating a row from a single hole on `≥ 2` may happen live; the
  `guard` shows errors only for commits. `onSeedCount` live is fine (the rubber
  row recounts).
- Every other validating handler that `throw`s (e.g. spacing ≤ 0) must swallow
  the error when `meta.live` and report it on commit as today.
- Handlers that do not validate (`update(key, value)` in `FeatureForm`,
  `HardwareFields`, `SheetEditor`, `changeInstance`, `ProfileEditor`,
  `ConnectionEditor`, fabrication) need no change beyond accepting the extra
  argument.
- `OperationPanel` `updateFeature` keeps its `stopInference` rule (an
  Operation select change, not a field).

## 5. One undo step per edit session

- `hooks/useSketchStudio.js` ~204: `setCadModel: (model, meta) => dispatch({
type: 'SET_CAD_MODEL', payload: model, meta })`.
- `store/sketchStudioReducer.js` ~208: `SET_CAD_MODEL` →
  `finalizeUndoableState(state, next, { skipHistory: action.meta?.skipHistory })`.
- `CadWorkspace.jsx` `commit(next, meta)` (~305): a ref `fieldSession` holds
  the session of the last commit. `skipHistory = Boolean(meta?.session) &&
meta.session === fieldSession.current`; then `fieldSession.current =
meta?.session ?? null`. Result: the **first** commit of a typing session
  (live or not) pushes history with the pre-typing snapshot; later live
  commits and the final Enter/blur/Escape commit of the same session replace
  the model without a new entry; any commit without a session (a drag, a
  button, a select) resets it so the next keystroke pushes again.
- Getting `meta` to `commit`: the chains are `ValueField → RowFields /
CutSizeFields / … → FeatureForm → tree `onChange` → changePart → commit`,
  `VectorFields → changeInstance → commit`, `SheetEditor → onChange →
changeSheet → commit`, `HardwareFields → …`, `ConnectionEditor → …`. Two
  acceptable implementations — pick one and say which:
  1. thread the second `meta` argument through every `onChange` in those
     chains (explicit; many signatures);
  2. a `FieldSessionContext` whose provider (in `CadWorkspace`) exposes a ref;
     `ValueField` writes `{ session, live }` into it synchronously right
     before calling `onChange` and clears it right after; `commit` reads it
     synchronously. React calls the chain synchronously inside the same event
     (or the same debounce callback), so the read is reliable; the ref must be
     cleared in a `finally`.
     Either way **no committed path may be missed**: `changePart`,
     `changeInstance`, `changeSheet`, connections, fabrication, part/instance
     names, hardware feature edits in the tree.
- Draft paths: nothing to do (no history).

## 6. What the user sees

- Operation panel (Hole row _Holes in row_ / _Spacing_ / _Row length_, Hole
  _Diameter_ / _Depth_, Extrude _Length_, Pattern _Total copies_ / _Spacing
  XYZ_, Fillet _Radius_, Sweep section sizes, placed profile sizes, hardware
  sizes, part name): the ghost, handles, placement line and preview follow the
  typed value ~150 ms after the last keystroke. The status line may read
  "Preview failed · Hole 2 of 15 removes no material" between keystrokes of
  `150`; it clears with the next valid value. The last good preview mesh stays
  on screen (`useCadModel` keeps `snapshot` on error).
- Tree editor (any feature field, Row of holes, hardware, instance
  Position/Rotation, connections, sheets, fabrication): the model rebuilds as
  you type (the worker supersedes stale builds); one Undo per edit session.
- Enter/Tab/click-away commit; Escape puts the pre-edit value back; a value
  that cannot be parsed waits for Enter and then shows today's error.
- Not changed: the 2D drafting side panel (`components/EntityFieldEditors.jsx`,
  its own reducer), the Named parameters table (`ParametersPanel.jsx`, own
  validation flow), the sketcher's typed HUD (a deliberate "type + Enter"
  mechanic), `JsonEditor` (Apply button), selects and checkboxes (already
  instant), floorplan fields.

## 7. Edge cases (handle and test)

- Typing `1`,`5`,`0` quickly (< 150 ms apart) → one live commit of `150`;
  slowly → `1`, `15`, `150`, each replacing the last without new history.
- `50.` → no live commit (not finite as typed? `Number('50.')` is 50 — treat
  text ending in `.` or `e`/`-` as not committable so the draft is not echoed
  back); `-` → nothing; ``(cleared) → nothing live, blur → today's behaviour
(text`''`reaches the consumer only for`asText`; numeric fields ignore it
  as today — verify what today does and keep it).
- `=pit` → nothing; `=pitch` → live commit of the string; `=pitch*2` →
  live commit; parameter missing → waits for Enter, then today's error.
- _Holes in row_ `1` live → row kept; Enter → row removed. `150` live → ignored
  (max 100), Enter → inline error.
- Focus retained across the tree editor's model commit and the operation
  panel's draft update (same input element before and after; caret position
  unchanged).
- Flip direction (a button) after typing in _Spacing_: the Direction readout
  and the `VectorFields` update although the Spacing field was focused a moment
  ago (blur commits first; then the button).
- External change while a field is **not** focused updates its text (a drag
  changes depth → _Depth (mm)_ shows the new number).
- Escape after live edits restores the pre-edit value and makes no extra undo
  entry (the session's single entry is replaced, so Undo after Escape undoes
  the edit that preceded the session — i.e. nothing of this session remains).
- Two fields edited in a row → two undo entries; a gizmo drag between two
  typing sessions in the same field → three entries.
- `fill('100')` + `press('Enter')` in a script: the fill fires one input event
  → one live commit; Enter finds the text equal to the value → no second
  commit; the model holds `100` either way.

## 8. Delivery, tests and verification

Order (report each as done / partial / not done):

1. `ValueField` live contract + prop sync + Escape + remove value keys; unit
   DOM test `ValueField.dom.test.jsx` (new): live commit after 150 ms (fake
   timers) with `meta.live`, not for `1.` / `-` / `=pit`, expression with
   context, blur commit `{ live: false }`, single commit when blur follows
   typing before the timer fires, focus/identity retained across a value prop
   update, Escape revert, prop sync when unfocused, ↑/↓ step if built.
2. Undo coalescing (§5) + `meta.live`-aware consumers (§4); tests: reducer
   `SET_CAD_MODEL` honours `meta.skipHistory`; `CadWorkspace` DOM test — type
   three digits into the tree editor's _Spacing (mm)_ → `setCadModel` called
   with `skipHistory` false then true (or `history.past` +1 with the real
   reducer), Undo restores; _Holes in row_ `1` live keeps the row, blur removes
   it; operation panel: typing `6` into _Holes in row_ updates
   `placement.row.count` (direction stage) / `feature.row.count` (Shape)
   without Enter.
3. Sweep of all call sites (§1), including `VectorFields` meta pass-through;
   existing DOM tests (`CadWorkspace.place.dom.test.jsx` `typeInto`,
   `SheetEditor.dom.test.jsx`, `ParametersPanel.dom.test.jsx`) stay green —
   adjust only where a test asserted an exact `onChange` call count that the
   new contract legitimately changes, and say so.
4. ↑/↓ stepping (should). 5. Docs + browser script.

Tests from the repo root (`npm test`, never inside `cad/`); baseline and final
counts for the cad folder and the full suite; `npm run lint` (0 errors, 42
warnings baseline). Browser: extend `scripts/verify-hole-row.mjs` — in Shape,
click _Holes in row_, select all, `pressSequentially('6')`, no Enter → within
1 s `cadPlacement().row.count === 6` and the HUD/ghost show 6 holes; restore
`4`; after Apply, in the tree editor select all in _Spacing (mm)_,
`pressSequentially('60')`, no Enter → the saved model's pitch is `60`; press
Undo once → `50`. Re-run all nine scripts (`verify-hole-row`,
`verify-cut-placement`, `verify-hole-hardware`, `verify-direct-placement`,
`verify-measure-marks`, `verify-start-sketch`, `verify-sketch-cad-editing`,
`verify-sketch-cad`, `verify-sketch-cad-offline` Chrome half) with
`CAD_VERIFY_URL=http://localhost:5180/sketch`. Docs: a short paragraph
"Typing values" in `docs/sketch-studio-cad.md` under "Sketches, constraints and
advanced fields" (fields apply as you type, Enter/Tab confirm, Esc reverts, one
Undo per edit, invalid text waits for Enter) and one sentence in the Hole rows
section.

Process rules: do not commit; stay in `src/features/sketchstudio/cad/`,
`scripts/`, `docs/` plus the two named store/hook files; match line endings
(`git ls-files --eol`; several cad files are CRLF, new files LF); stop any Vite
server and confirm nothing listens on 5180; flag every judgment call with
file:line anchors.

## 9. Acceptance checklist

- [ ] Typing `6` in _Holes in row_ during Hole row Shape moves the ghost and
      handles to 6 holes without Enter; the placement line reads "Row of 6".
- [ ] Typing `25` in Extrude _Length (mm)_ grows the preview without Enter.
- [ ] Typing in the tree editor's _Spacing (mm)_ rebuilds the part; one Undo
      restores the pre-typing value; focus and caret stay in the field.
- [ ] `1` typed in _Holes in row_ keeps the row until Enter; `1.`/`-`/`=pit`
      commit nothing; Escape reverts.
- [ ] No `ValueField`/`VectorFields` call site keys on its value; selection
      changes still reset the fields.
- [ ] All nine browser scripts pass; cad and full suites green; lint 0 errors.
