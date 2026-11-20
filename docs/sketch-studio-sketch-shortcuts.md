# Sketch Studio — keys for the sketch tools (SK-1)

Status: **SK-1 built + audited 2026-11-19 (§6, §7), uncommitted; awaiting the user's verdict.**

Related: `docs/sketch-studio-sketch-dimensions.md` (D), `docs/sketch-studio-bend-relief.md`
(Relief, R until this), `docs/state-machines.md` (the "In-viewport sketcher tool" row).

## 1. What the user asked for

2026-11-19: "in drawing the line tool and other tools there doesnt have keyboard shortcut,
can you fix it?"

## 2. What is there today (read 2026-11-19)

- `CadSketcher.jsx`, the window `keydown` handler: Esc, Enter, Delete / Backspace, and a
  `toggles` map `{ d: 'dimension', r: 'relief' }`. It returns at once when the event comes
  from an `input`, `select` or `textarea`.
- While Line, Rectangle, Center rectangle, Circle or 3-point arc is on, the focus is kept
  in the HUD field by the cursor (the effect on `state.tool` / `state.field`). So a letter
  pressed while drawing is typed into that field and never reaches the handler: a key
  for these tools has to be read in the field's own `fieldKey` as well.
- A HUD field's text is a number unless it starts with "=" (`evaluateEntry`,
  parameters.js): only then are letters part of a value. `1e3` is a number, so a letter
  after digits must stay the field's.
- The workspace's own letter keys are off while a sketch is open (`busy` includes
  `sketchSession`, CadWorkspace.jsx near :1175). Its Ctrl+Z / Ctrl+Y / Delete handler
  (near :4960) and the viewport's key handler (CadViewport.jsx near :1240) must be read
  before a key is given to the sketcher: one key press does one thing.

## 3. Design

| Key     | Tool                                                                    |
| ------- | ----------------------------------------------------------------------- |
| L       | Line                                                                    |
| R       | Rectangle                                                               |
| Shift+R | Center rectangle                                                        |
| C       | Circle                                                                  |
| A       | 3-point arc                                                             |
| D       | Dimension (as today)                                                    |
| B       | Relief (was R: R is the rectangle in every CAD the user will have used) |
| Ctrl+Z  | Undo last                                                               |

- A tool's key turns it on; pressed again while it is on, it turns it off (as D does
  today). It is the same `tool` action the bar's button dispatches, so a half-drawn shape
  is dropped exactly as a click on the button drops it.
- No Ctrl / Meta / Alt (except Ctrl+Z, also Meta+Z), no key repeat.
- From the window handler: as today (not from an input, select or textarea).
- From a HUD field (`fieldKey`): a tool key acts only while that field's own text is
  empty; the letter is not typed. With anything typed in the field the key is the
  field's (digits then `e`, or an "=" expression). The Snap box and the Relief options
  boxes never take tool keys.
- Ctrl+Z in sketch mode is the bar's Undo last and nothing else: it must not also undo
  the model. From a HUD field too (an empty one or not: a text field's own undo is not
  worth keeping there). Not from the Snap box or the Relief options boxes.
- Each bar button says its key: `title` ("Line (L)", "Center rectangle (Shift+R)", "Undo
  last (Ctrl+Z)") and `aria-keyshortcuts`. The button's text and accessible name do not
  change (tests and scripts find the buttons by name).
- The "Sketching" help panel (CadWorkspace.jsx, `panel === 'sketching'`) gains one
  paragraph listing the keys; its Relief paragraph says B. The guide's "Bend reliefs"
  section and `docs/sketch-studio-bend-relief.md` §8 say B (one line in §8: "SK-1 moved
  the key from R to B"). `docs/state-machines.md`: the sketcher row lists the keys.

## 4. Acceptance

- Reducer / pure: a small `sketchKeys` table (or the like) is the single source for the
  handler, the field handler and the button titles; a test pins the table.
- `CadSketcher.dom.test.jsx` (added cases): each key turns its tool on from the canvas
  focus and off again; L while Circle is on switches to Line from an empty HUD field and
  types nothing; with "12" in the field, `e` stays in the field and the tool does not
  change; with "=" first, letters stay in the field; a key with Ctrl does nothing; B
  toggles Relief and R now gives Rectangle (the existing "R toggles" case is rewritten);
  Ctrl+Z removes the last entity and calls nothing on the workspace; each button's
  `title`.
- A workspace DOM test: in a sketch, Ctrl+Z after drawing one line removes the line and
  leaves `model` untouched; out of a sketch Ctrl+Z still undoes the model.
- Browser: extend `scripts/verify-bend-relief-br1.mjs` only where it pressed R (if it
  did); add `scripts/verify-sketch-shortcuts-sk1.mjs` in the style of
  `scripts/verify-sketch-dimensions-sd1.mjs`: draw a rectangle with R and typed sizes, a
  circle with C, a line chain with L, an arc with A, Ctrl+Z twice, D for a dimension, B
  for a relief on a drawn cross, Esc, Finish; no page error, no `.cad-error`; a
  screenshot of the bar with a tooltip is not needed.
- Still passing: the whole unit suite (7115 before), lint 0 errors, `npm run build`,
  `verify-sketch-dimensions-sd1`, `verify-bend-relief-br1`, `verify-start-sketch`,
  `verify-outline-edit-oe1`, `verify-sketch-cad`.

## 5. Design calls that are the spec's own (the user has not ruled)

- R moves from Relief to Rectangle, Relief takes B.
- Shift+R for Center rectangle rather than a letter of its own.
- Ctrl+Z is included although only tool keys were asked for.

## 6. SK-1 as built (2026-11-19)

Built as §3 says, with the differences below. No model key, nothing persisted.

**Files.** Changed: `sketchTools.js` (`SKETCH_KEYS`, the table; `sketchKey(event)`, what a
press is: a tool, `'undo'` or null), `CadSketcher.jsx` (the window handler reads the
table, `fieldKey` takes a tool key from an empty field, a capture listener for Ctrl+Z,
the bar buttons' `title` / `aria-keyshortcuts`, one `toggle` for button and keys),
`CadWorkspace.jsx` (the "Sketching" help: a Keys paragraph, Relief (B)). Tests: new
`sketchKeys.test.js` (pins the table and the press rules), new
`CadWorkspace.sketchKeys.dom.test.jsx` (the studio's real reducer, history and
`useSketchKeyboard`), three cases added to `CadSketcher.dom.test.jsx`, the "R toggles"
case rewritten (B toggles, R gives Rectangle), `CadWorkspace.relief.dom.test.jsx` reads
"Relief (B)". Script: new `scripts/verify-sketch-shortcuts-sk1.mjs`
(`verify-bend-relief-br1` never pressed R: unchanged). Docs: the guide's "Bend reliefs"
(B, and Undo last's Ctrl+Z), `sketch-studio-bend-relief.md` §8 (one line), the
state-machines sketcher row.

**Where Ctrl+Z went before SK-1.** Not to `CadWorkspace.jsx`: its handler near :4960 is
the replay's hold (it swallows Ctrl+Z / Y and Delete only while the film plays). The
model's Ctrl+Z is the studio's `useSketchKeyboard` (hooks/, mounted by
`useSketchStudio`): a window `keydown` listener that runs `handleUndo` on Ctrl/Meta+Z
before any editable-target or workspace-mode check, so in a sketch Ctrl+Z (from the
canvas, the HUD, the Snap box, anywhere) undid the model under the open sketch. That
listener re-subscribes on every studio render, so its order against the sketcher's
window listener is not fixed. SK-1 takes Ctrl+Z on the window's capture phase while the
sketcher is mounted (draw stage only) and calls `stopImmediatePropagation`: nothing
after it sees the press. Out of a sketch nothing changed.

**Differences from §3 and choices.**

1. Ctrl+Z in a box other than the HUD (the Snap box, the Relief options, and any other
   field on the page while sketching) is that box's own text undo: the sketcher does
   not undo, and the model's undo is held back too (the press stops at the capture,
   the default is left). §3 said only "not from the Snap box or the Relief options";
   letting the studio undo the model from there would have been "Ctrl+Z in sketch mode
   undoes the model" again. The model's Undo button still works during a sketch.
2. A held Ctrl+Z goes on undoing (as the model's does); the "no key repeat" of §3 is
   kept for the tool keys.
3. Shift counts exactly: Shift+R is Center rectangle, Shift+L / Shift+D / … are no key.
   Before SK-1 Shift+D also toggled Dimension (the old map lower-cased the key). Caps
   Lock gives "D" without Shift, which still works.
4. Ctrl+Shift+Z and Ctrl+Y (the studio's redo) are not held back: the sketcher has no
   redo. While sketching they still redo the model when it has something to redo (a
   model Undo made before or during the sketch), as before SK-1.
5. D and B also act from an empty HUD field, like the drawing tools' keys. One existing
   assertion changed for it: `CadSketcher.dom.test.jsx` "A drawing tool's field keeps
   its D" now types "12" first (D in an empty field is now Dimension).
6. "Empty" is the field's text exactly `''` (a typed space keeps the letter).
7. The help paragraph says "Ctrl+Z is Undo last: while you sketch it never undoes the
   model."

**Wrong in §2 / §4.** §2 points at CadWorkspace.jsx :4960 as "its Ctrl+Z / Ctrl+Y /
Delete handler": that is the film hold; the model's Ctrl+Z is `useSketchKeyboard` (see
above). §4's workspace test needs that hook mounted: CadWorkspace alone has no Ctrl+Z.

**Warts.**

- Ctrl+Z from the Snap box is the browser's text undo of a `NumericInput`; it changes
  the box's text without committing it (as any typing there).
- The tool keys are letters by `event.key`: on a non-Latin layout they do nothing (as the
  workspace's own keys).
- A tool key pressed in a HUD field after Tab (the second field empty, the first
  typed) switches the tool and drops what was typed in the first, as a click on the
  bar does.

## 7. Audit (2026-11-19)

Read: `SKETCH_KEYS` / `sketchKey` (sketchTools.js), the window handler, the capture
listener for Ctrl+Z and `fieldKey` (CadSketcher.jsx), `useSketchKeyboard.js` (its Ctrl+Z
and Ctrl+Y sit before its `workspaceMode === 'model'` return, its letter keys after it:
the 2D studio's tool keys never fire in the 3D workspace). Reran: the six sketcher test
files (42 passed), lint on the changed files (clean), `verify-sketch-shortcuts-sk1`
(pass), the whole suite alone (586 files, 7123 passed, 1 skipped). Nothing sent back.

Left as built: Ctrl+Y and Ctrl+Shift+Z still redo the model while a sketch is open (as
before SK-1; the sketcher has no redo).
