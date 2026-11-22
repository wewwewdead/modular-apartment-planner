# State machines: Sketch Studio 2D

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The drafting studio outside `cad/`: canvas gestures, tool drafts, undo, and
document persistence.

Paths are under `src/features/sketchstudio/`.

## Explicit machines

<!-- The indented lines in each block are checked against the code by
     src/shared/machineRegistry.test.js. -->

### `sketch-persistence` — Sketch Studio document status

`src/features/sketchstudio/hooks/sketchPersistenceMachine.js`, owned by
`useSketchPersistence.js`; every status write goes through
`advancePersistenceMeta`, which also clears the error message unless the event
brings one. `isDirty` is derived separately from a snapshot comparison. The
2D status bar (`useSketchStudio.js`) and the top bar (`TopBar.jsx`, after its
error, saving and rename checks) read it before `status`; the 3D workshop
footer (`cad/CadWorkspace.jsx`) reads only `isDirty`, so it calls every
non-dirty status "Saved", `recovered` and `idle` included. Loading, opening,
starting a save and a save finishing either way replace the status whatever it
was, so those five events are accepted from every state. Closing the save
picker undoes `SAVE`: the hook sends the `RESUME_*` event for the status it
noted when the save began. `DISMISS` (the error toast timing out) drops the
message and keeps the status. Tests: `sketchPersistenceMachine.test.js`,
`useSketchPersistence.dom.test.jsx`.

    idle --LOAD--> idle
    idle --OPEN--> opened
    idle --SAVE--> saving
    idle --SAVED--> saved
    idle --FAIL--> error
    idle --RECOVER--> recovered
    idle --EDIT--> dirty
    recovered --LOAD--> idle
    recovered --OPEN--> opened
    recovered --SAVE--> saving
    recovered --SAVED--> saved
    recovered --FAIL--> error
    recovered --EDIT--> dirty
    opened --LOAD--> idle
    opened --OPEN--> opened
    opened --SAVE--> saving
    opened --SAVED--> saved
    opened --FAIL--> error
    opened --EDIT--> dirty
    saving --LOAD--> idle
    saving --OPEN--> opened
    saving --SAVE--> saving
    saving --SAVED--> saved
    saving --FAIL--> error
    saving --EDIT--> dirty
    saving --RESUME_IDLE--> idle
    saving --RESUME_RECOVERED--> recovered
    saving --RESUME_OPENED--> opened
    saving --RESUME_SAVED--> saved
    saving --RESUME_ERROR--> error
    saving --RESUME_DIRTY--> dirty
    saved --LOAD--> idle
    saved --OPEN--> opened
    saved --SAVE--> saving
    saved --SAVED--> saved
    saved --FAIL--> error
    saved --EDIT--> dirty
    error --LOAD--> idle
    error --OPEN--> opened
    error --SAVE--> saving
    error --SAVED--> saved
    error --FAIL--> error
    error --EDIT--> dirty
    error --DISMISS--> error
    dirty --LOAD--> idle
    dirty --OPEN--> opened
    dirty --SAVE--> saving
    dirty --SAVED--> saved
    dirty --FAIL--> error
    dirty --CLEAN--> idle

## Named definitions

Each is the one copy of a rule. Import it; never restate it.

- `INTERACTION_END`, `interactionEndAction`, `isInteractionInFlight`
  (`src/features/sketchstudio/store/interactionEnd.js`): How each Sketch
  Studio canvas gesture ends for each cause: release, abort, Escape, undo.
  Read at run time for abort (pointer-cancel, window blur, a move with no
  button held), Escape, undo and redo (both use the `undo` column). The
  release is hand-written in `useSketchPointer.js` (pointer-up), because it
  also decides click suppression; `interactionEnd.dom.test.jsx` pins it to the
  `release` column. `isInteractionInFlight` is the guard every key that must
  wait for a release uses (tool shortcuts, Delete, the arrow nudges, Ctrl+G
  and Ctrl+Shift+G).
- `HOVER_DRAFT_TOOLS` (`src/features/sketchstudio/hooks/sketchConstants.js`):
  The Sketch Studio tools whose draft a bare pointer move creates when there
  is none and patches afterwards (fillet, chamfer, trim, extend, fastener).
  Escape leaves these tools for Select, undo goes past them to the history,
  and undo or redo keeps their draft and its typed value.
- `HOVER_ENTITY_TOOLS` (`src/features/sketchstudio/hooks/sketchConstants.js`):
  The tools for which the viewport hook resolves the entity under the cursor
  (select, offset, fillet, mirror, fastener). Every other tool skips the hit
  test. `sketchConstants.test.js` compares it with the hand-written list it
  replaced; the only difference is mirror and fastener, added on purpose.

## Machines

### Canvas interaction mode

- **Where:** `store/sketchStudioInitialState.js` (`interaction`),
  `store/sketchStudioReducer.js`, `hooks/useSketchPointer.js`,
  `hooks/useSketchKeyboard.js`, `hooks/useSketchHistory.js`,
  `hooks/useSketchTransform.js` (presses on the move frame and the handles)
- **States:** idle / drawing (a draft is open) / panning / selection-box /
  handle-drag / transform (move or rotate; copy pending → active)
- **Treatment:** Named (`store/interactionEnd.js`)
- **Notes:** `sketchStudioReducer.test.js`, `orthoSnapOverride.dom.test.jsx`.
  `interactionEnd.dom.test.jsx` pins every way out against the table.
  `drawing` is set by `START_DRAFT`, by `END_PAN` when a draft is open, and by
  undo or redo while a hover tool is armed. `COMMIT_ENTITY` and
  `CANCEL_DRAFT` empty the draft and set `idle`; the marquee and drag ends set
  `idle` without looking at the draft (they happen only under Select, which
  has none). Only
  `handlePointerLeave` reads the difference (it clears the hover and snap
  marker only when idle); `isInteractionInFlight` is false for both.
  The move frame and the endpoint handles take presses only under the Select
  tool. Under any other tool the press goes through to the canvas, so the
  click on the end of the line just drawn starts the next line.
  `anchor-drag` (never started) and `isPointerDown` (never read) were removed
  on 2026-11-21; neither was saved in a file or in history.
  `_needsFullResolution` (reducer) marks a document resolved without joinery
  during a drag; the drag's end resolves it fully. An extra resolve is its
  only failure mode. The ways out:
  - Release: pointer-up, hand-written per mode (see `INTERACTION_END`).
  - Abort: pointer-cancel, window blur, and a pointer move whose `buttons` is
    0 (the release was lost). All three keep the work, as the table says.
  - Escape: cancels a drag and restores the selection the drag started with
    (`startSelectedIds`); during a pan it ends only the pan. Click suppression
    is armed only when a click will follow (`panButton`).
  - Undo and redo: both end a gesture through the `undo` column and do
    nothing else; the redo stays for the next press.
  - Tool shortcuts, Delete, the arrow nudges and the group keys wait for the
    release. `SET_ACTIVE_TOOL` from the mouse drops a gesture with no commit,
    but no toolbar can be reached mid-drag.
  - A new document (`LOAD_WORKSPACE_SNAPSHOT`) resets everything, history
    included. Unmount takes the reducer with it.

### Click suppression

- **Where:** `interaction.suppressNextClick`; armed in
  `hooks/useSketchPointer.js` (a left-button pan release, a marquee that
  moved, a handle drag that changed the document, a transform past 3 px) and
  `hooks/useSketchKeyboard.js` (Escape mid-gesture); consumed by the next
  click in `hooks/useSketchToolClick.js`
- **States:** clear / armed
- **Treatment:** Left
- **Notes:** It never times out: it relies on a click following the release
  that armed it, which is why it is armed only for a left-button release.
  Undo, redo and a new document clear it.
- **Open:** undo or redo during a left-button pan or a drag ends it without
  arming suppression, so the release's click lands on the canvas (with
  Select: the selection changes).

### Space pan

- **Where:** `isSpacePanActiveRef` (`hooks/useSketchStudio.js`), set and
  cleared in `hooks/useSketchKeyboard.js`, read on press in
  `hooks/useSketchPointer.js`
- **States:** off / held
- **Treatment:** Left
- **Notes:** Cleared on Space keyup and on window blur.

### Tool draft steps

- **Where:** `hooks/useSketchToolClick.js` (click: creates and advances),
  `hooks/useSketchPointer.js` (hover: patches `currentPoint` and previews,
  creates the hover drafts), `hooks/useSketchKeyboard.js` (`[`, `]`,
  Backspace, Enter), `hooks/useSketchDraftCommit.js` (the precision HUD's
  commit), `hooks/sketchConstants.js` (`HOVER_DRAFT_TOOLS`, the builders),
  `store/sketchStudioReducer.js` (`draft.type`, `draft.step`, `points.length`)
- **States:** per tool: none → pick… → commit; the hover drafts are created by
  the first move and patched by the next ones
- **Treatment:** Left
- **Notes:** `modifyToolClick.dom.test.jsx`, `useSketchToolClick.dom.test.jsx`,
  `useSketchDraftCommit.dom.test.jsx`, `draftCommitPaths.dom.test.jsx`,
  `hoverEntity.dom.test.jsx`. `step` is written by most tools and read only
  for arc, dimension and angle; the other tools infer their phase from
  `points.length`. A tool switch, Escape and a commit empty the draft. Undo
  cancels a non-hover draft first; for a hover tool it goes to the history
  and keeps the draft's type and typed value (fillet radius, chamfer
  distance), dropping only the preview.
  Three paths commit a draft. Click is `useSketchToolClick.js`. Enter is the
  window key handler in `useSketchKeyboard.js`, which never sees a key typed
  into a HUD box; for line, rect, circle, holeCircle, cutoutRect, fastener
  and offset it calls the HUD path. HUD is `commitPrecisionDraft` in
  `useSketchDraftCommit.js`, run by Enter in a HUD box. Per tool:
  - line, rect, circle: click takes the snapped (and Ortho) click point and
    cancels the draft when no entity comes out; Enter and HUD build the same
    entity from the preview, the last move's point, and leave the draft when
    none comes out.
  - holeCircle, cutoutRect: all three build from the preview; click cancels on
    a null entity, Enter and HUD leave the draft.
  - fastener (no HUD box, so Enter only): click places plain hardware with
    the hovered part as `targetPartId`, and pattern hardware (hinge, handle)
    as a group of holes oriented to that part, leaving the draft; Enter places
    plain hardware at the preview point with no `targetPartId`, and does
    nothing for pattern hardware.
  - offset: click (second) and Enter / HUD use the same builder and cancel on
    null. They agree.
  - polyline (no HUD box): a click appends, and commits only by closing
    (three points and the click on the first). Enter commits with two points
    or more, closed under the same rule (three points and the cursor on the
    first), open otherwise; it is the only way to commit an open polyline.
  - arc, dimension, text, trim, extend: click only. Text is the one tool that
    returns to Select after its commit.
  - angle: click commits at the snapped point and fills the third source-ref
    slot from that snap (the line-to-line shortcut commits on the second line);
    Enter and HUD commit at the last move's point with that slot empty.
  - mirror (no HUD box): a click on a line's body mirrors about that line at
    once; a click on a definite point (an end, the middle, a crossing) or off
    any line starts a free axis, and the second click commits it; Enter
    commits the free axis at the last move's point.
  - array: click (second) commits at the snapped click point; Enter commits at
    the last move's point once a base point exists; HUD (count, spacing,
    angle) does the same without that guard, and a null result toasts.
  - fillet, chamfer: click finds the corner at the click point and applies the
    current size; Enter applies at the hovered corner from the preview, which
    `[` and `]` rebuild at once; HUD (radius or distance box) applies at the
    hovered corner with the size read from the box. All three keep the tool
    and the draft and clear the hovered corner.
- **Open:** the three commit paths are still three copies. Left drifting: a
  null entity cancels on click but not on Enter or in the HUD (line, rect,
  circle, holeCircle, cutoutRect); Enter drops the angle's third source-ref
  slot; Enter ignores fastener pattern hardware and the hovered part; a size
  typed into the fillet or chamfer box is not previewed until the mouse
  moves. A draft survives a switch of `viewMode` or `isometricPlane` and of
  the workspace mode to 3D and back (SUSPECTED harmless, not traced).

### Precision HUD focus

- **Where:** `components/PrecisionHud.jsx` (`data-precision-hud`),
  `hooks/useSketchKeyboard.js` (`isPrecisionHudTarget` from
  `hooks/sketchConstants.js`)
- **States:** blurred / focused
- **Treatment:** Left
- **Notes:** The HUD focuses its first box whenever a draft with a value to
  type appears (`precisionHud.tool` changes), so the next keys land in the
  box. The window key handler skips typing targets, except Escape in the HUD,
  which does what Escape on the canvas does (`PrecisionHud.dom.test.jsx`).
  Enter in the box runs the HUD commit. Other editors keep their own Escape:
  the CAD sketcher's boxes and `EntityFieldEditors.jsx` are not HUD targets.
- **Open:** tool letters, `[`, `]`, Delete and the arrows type into the box
  while it has focus.

### Document persistence

- **Where:** `hooks/useSketchPersistence.js`
- **States:** see `sketch-persistence`
- **Treatment:** Explicit
- **Notes:** New, Open and Import ask before replacing the sketch when it is
  dirty or `recovered`: a recovered sketch was never written to a file, and
  the 400 ms autosave would overwrite the one recovery slot
  (`src/shared/sketchAssetStorage.js`) right after. A reload that recovers
  asks nothing; the first New, Open or Import after it asks, until the sketch
  is saved, edited or replaced. A template load asks by another rule (any
  entities at all, `components/SketchStudioLayout.jsx`). There is no
  beforeunload guard: closing the tab relies on the autosave. The error toast
  has no close control: its 4 s timer is the dismiss, so a failure message
  clears after 4 s in the 2D workspace and on the next status change in the
  3D workspace.
- **Open:** Open and Import carry no run id: a file read lands without
  checking that it is still wanted, edits made during the read are lost
  without a second prompt, and two imports land in completion order with
  one `readingFileName` slot (SUSPECTED, not timed).

### Inline text edit

- **Where:** `components/DraftingCanvas.jsx` (`editingTextId`,
  `dismissedAutoEditId`)
- **States:** closed / auto-editing / editing / dismissed
- **Treatment:** Left
- **Notes:** Enter and blur commit, Escape cancels.
- **Open:** a click that selects another entity unmounts the editor before
  its blur; whether the typed text is kept, or written to the new selection,
  depends on the browser (SUSPECTED, not run).

### Undo history and live sessions

- **Where:** `store/sketchStudioReducer.js`, `utils/historyUtils.js`
- **States:** past / future; drag snapshots
- **Treatment:** Left
- **Notes:** `sketchStudioReducer.test.js`. Snapshots are by reference. A drag
  keeps its own snapshot and pushes one entry when it ends. The 3D live-field
  session (`SET_CAD_MODEL` with `skipHistory` / `revertSession`) pops the
  entry its first commit pushed.

### Toasts

- **Where:** `ui.toast` (`showToast`, `store/sketchStudioActions.js`) and the
  document error toast, both rendered by `components/Toast.jsx` from
  `components/SketchStudioLayout.jsx`
- **States:** hidden / shown (4 s)
- **Treatment:** Left
- **Notes:** `ui.toast` carries an id, so a new toast restarts the timer. The
  error toast has no key: a second error within 4 s keeps the first one's
  remaining time.

### Shortcut overlay

- **Where:** `ui.shortcutOverlayOpen`, `hooks/useSketchKeyboard.js`
- **States:** closed / open
- **Treatment:** Left
- **Notes:** Modal: while open, every key but Escape and `?` is swallowed.

### Template gallery load

- **Where:** `craftsman/components/TemplateGallery.jsx` (`loading`),
  `components/SketchStudioLayout.jsx` (`showGallery`)
- **States:** idle / loading
- **Treatment:** Left
- **Notes:** A second pick is refused while one loads.
- **Open:** leaving the gallery while a template loads still loads it and asks
  to replace the sketch, and `loading` clears before that question is
  answered (SUSPECTED, depends on the import's speed).

### Workshop export

- **Where:** `craftsman/components/ExportBar.jsx` (`exporting`)
- **States:** idle / exporting
- **Treatment:** Left
- **Notes:** Guarded against a second start; reset in `finally`.
