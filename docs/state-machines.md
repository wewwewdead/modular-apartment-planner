# State machines in this app

The registry of every place the app keeps a small set of modes and moves
between them: tool flows, drags, async jobs, save and open lifecycles, render
loops. This is the front page: the treatments, the rules, and where each
subsystem's machines are written down. The machines themselves are one page
per subsystem under `docs/state-machines/`, each small enough to read whole.

Read the subsystem's page before changing how any tool, drag, loader or save
path starts, ends or is cancelled. Nearly every bug the two audits found
(2026-11-09 and 2026-11-21) was one of three shapes: a way out of a mode that
forgot one of the mode's variables, two copies of "how this ends" that had
drifted apart, or an async result that landed after nobody wanted it.

## The pages

- `docs/state-machines/floorplan-editor.md`: the plan tools, the editor half
  of the store, selection, the drag gesture, focus mode.
- `docs/state-machines/floorplan-shell.md`: save, open, the browser draft,
  dialogs, the error boundary, the Electron window, lifecycle and properties
  panels. Explicit: `project-open`.
- `docs/state-machines/canvas-detail-editors.md`: the plan canvas, the sheet
  canvas, the wall and ceiling detail editors.
- `docs/state-machines/preview-studies.md`: the 3D preview and the study
  workers. Explicit: `preview-load`.
- `docs/state-machines/cad-workspace.md`: how the CAD workspace starts,
  switches and ends every tool and session. Explicit: `cad-mate`,
  `cad-pdf-run`.
- `docs/state-machines/cad-viewport.md`: who gets a click in the CAD
  viewport, and every drag in it.
- `docs/state-machines/cad-sketcher.md`: the in-viewport sketcher.
- `docs/state-machines/cad-stations.md`: the sheet-metal shop. Explicit:
  `cad-brake`, `cad-paint`, `cad-print`, `cad-laser`, `cad-film`.
- `docs/state-machines/sketch-2d.md`: Sketch Studio's 2D drafting studio.
  Explicit: `sketch-persistence`.

History: `docs/state-machines-pass.md` (the 2026-11-09 build) and
`docs/state-machines-pass-2.md` (the 2026-11-21 build) say what was changed,
why, and what was found and deliberately left.

## How machines are treated

- **Explicit.** The transition table is data, declared with `defineMachine`
  (`src/shared/machine.js`). To change it: change the table, then the table
  printed on its page. `src/shared/machineRegistry.test.js` fails until both
  agree.
- **Named.** The states stay in their file, but the rule every copy used to
  re-derive has ONE definition: a constant, a predicate or a decision table in
  a small pure module with its own test. To change it: change the definition,
  never a copy. If you need the rule somewhere new, import it.
- **Left.** Implicit, and fine that way: small, clear, or well tested. Read
  the notes in its entry first. If you are about to add a third flag to it,
  promote it instead.

## Rules that hold everywhere

1. **An event a state has no use for is ignored, not an error.** A reply after
   a cancel, a second click on a busy button, an Escape with nothing open.
   `machine.next` returns the same state; `machine.can` asks beforehand.
2. **Every way out of a mode clears everything the mode owns.** Tool switch,
   selection change, Escape, Delete, undo, pointer-cancel, window blur,
   unmount, floor or view change, a new document. When you add a variable to
   a mode, add it to the mode's single reset in the same change. A press or
   drag kept in a ref beside the state is one of the mode's variables.
3. **Async results carry their identity.** A run id, request id, revision or
   generation, checked when the result lands. A result for a run that is no
   longer the live one is dropped. A `finally` that clears a shared flag
   checks it still owns the flag.
4. **Escape reverts a drag.** It puts the geometry back, adds no history
   entry and keeps the selection (owner's decision, 2026-11-08).
5. **A double-click is press, press, double-click.** A handler's
   `onDoubleClick` runs after the second press has already been handled. Test
   with the real sequence.
6. **A lost release ends the drag.** A drag that listens for pointer-up also
   ends on `pointercancel`, on window blur and on a move with no button held.
   A release that never arrives must not leave the pointer dragging.

## Changing or adding a machine

1. Find its entry on the subsystem's page. Each entry has the same fields:
   **Where** (files and the identifiers that hold the state), **States**,
   **Treatment**, **Notes** (what is pinned, by which tests) and, when there
   is one, **Open** (a known gap nobody has closed).
2. Change the single definition. For a Named rule that is its module; for an
   Explicit machine its table.
3. Update the entry in the same change. A new `defineMachine` table needs a
   `### \`id\``section on a page and an entry in`MACHINES`in`src/shared/machineRegistry.test.js`.
4. Keep the pages readable: no tables (a formatter pads every row to the
   widest cell, which once grew this registry to 349 KB of spaces), lines
   under 400 characters, a page under 64 KB. The registry test checks all
   three, and that every file a page names still exists.
