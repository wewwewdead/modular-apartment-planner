# State machines: Sketch Studio CAD sketcher

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The in-viewport sketcher: `sketchReducer` in `sketchTools.js` and its owner
`CadSketcher.jsx`.

Paths are under `src/features/sketchstudio/cad/`.

## Named definitions

Each is the one copy of a rule. Import it; never restate it. All three are in
`sketchMode.js`.

- `NO_MODE`: every field a mode owns, at rest: `tool`, `points` (a frozen
  empty array), `chainStart`, `pending`, `offsetFrom`, `reliefCut`, `box`,
  `op`, `drag`. The selection is not in it: each way out says what it does
  with the selection. Every action that leaves every mode spreads it: `tool`
  (with the new tool and an empty selection), `select-all` and `select-ids`
  (with their selection), an action's start (`startOp`, the selection kept),
  Undo / Redo (`stepHistory`, the tool kept) and the tool rung of `escape`.
  A field a new mode adds goes into `NO_MODE`, and all six clear it.
- `sketchMode(state)`: which mode the state is in, in the order Esc takes
  them: `box`, `drag`, `action`, `tool`, `selection`, `idle`. The window's Esc
  reads it (`idle`: Esc finishes the sketch).
- `modeViolations(state)`: the rules a state keeps, as the words of each one
  it breaks ([] when none): a tool with a selection; an action and a tool
  together; a box or a drag under a tool or an action; an action with nothing
  selected; a selected entity or dimension that no longer exists; a dimension
  selected with entities; a half-drawn shape (`points`) with no tool;
  `chainStart` outside Line, `pending` outside Dimension, `offsetFrom` outside
  Offset or naming an entity gone; `reliefCut` (the relief readout) outside
  Relief.
- Not converted on purpose: `delete` and `fix` do not spread `NO_MODE` (a fix
  must not end a half-drawn chain, and neither ends the tool); the Zero
  click and `zero-reset` clear only `tool` and `points`, the rest being empty
  under Zero.
- Tests: `sketchMode.test.js`. A seeded random walk (32 walks of 150 steps,
  each begun with the next tool on) sends every action type of the reducer,
  with the inputs the component sends, and asserts `modeViolations` is empty
  after each step; it also asserts the walk went through every mode, a relief
  cut, a selected dimension, Copy's copies and a fix. Another test reads the
  reducer's `case` labels from the source, so a new action cannot go
  unwalked. The Esc question is compared with the window's old list over all
  64 combinations, and each action that now spreads `NO_MODE` with its frozen
  hand-written list over the walk's states (the only difference: `reliefCut`
  cleared).

## Machines

### In-viewport sketcher

- **Where:** `sketchTools.js` (`sketchReducer`, `createSketchState`), owned by
  `CadSketcher.jsx` (`useReducer`; its `press` ref; the Check panel's
  `checkOpen`, `checkHover`, `checkFocus`). The modes are not a field: they
  are read off which mode fields are set (`sketchMode`).
- **States:** the `sketchMode` names, each with its own steps:
  - `idle`: no tool, nothing selected.
  - `selection`: entities (`selectedIds`, drawing order) or one dimension
    (`selectedDimensionId`), no tool.
  - `box`: a box being dragged from a press that began on nothing.
  - `drag`: the selection being dragged from a press on a selected entity.
  - `action`: Move and Copy base → target, Rotate centre → angle, Mirror
    first → second, Pattern its numbers.
  - `tool`: a Draw tool (Line, Rectangle, Center rectangle, Circle, 3-point
    arc, Slot, Polygon: first point → next points, typed HUD), Zero (one
    state), Dimension (first → second, a point held → place, a span or circle
    pending → first; `dimensionStep`), Relief (one state), Trim, Extend,
    Fillet, Chamfer (one state each), Offset (choose → side, from
    `offsetFrom`).
  - Beside any of these: the Check panel open or closed (component state).
- **Treatment:** Named (`sketchMode.js` `NO_MODE`, `sketchMode`,
  `modeViolations`)
- **Notes:**
  - The state. One pure reducer object plus the component's `press` ref; the
    component only turns canvas events into snapped `click` / `move` actions
    (the snapped point and kind, the raw point, the tolerance, Shift). Settings
    that survive every mode change: `entities`, `dimensions`, `parameters`,
    `nextId`, `nextDimensionId`, `boundary`, `history`, `construction`
    (armed), `relief`, `shapes`, `pattern`, `zero`, `lastPoint`, `angleStep`
    and the cursor group (`cursor`, `snapKind`, `raw`, `tolerance`, `shift`,
    set by `move`). Mode fields: those of `NO_MODE`, the selection, and the
    typed scratch `typed`, `field`, `message`, which `reset` clears in every
    action that changes mode. `createSketchState` does not create `reliefCut`
    or the cursor group: they appear when first set.
  - What each mode owns. `selection`: `selectedIds` or `selectedDimensionId`
    (a dimension is selected alone). `box`: `box` ({ from, to, mode, add })
    and `press.box`. `drag`: `drag` ({ grab, to }), `press.grab`,
    `press.dragging`, a selection. `action`: `op` ({ kind, step, base /
    center / first, copies, confirm, keep, remove }), a selection, `typed`,
    `field`. A Draw tool: `tool`, `points`, `chainStart` (Line only),
    `typed`, `field`. Zero: `tool`, `typed`. Dimension: `tool`, `points` (the
    held point), `pending`. Relief: `tool`, `reliefCut` after a cut. Offset:
    `tool`, `offsetFrom`.
  - Ways out of `box`: the release applies it (`box-end`); Esc drops it first
    of anything (`escape`, the selection as it was); `pointercancel`, window
    blur and a move with no button held drop it (`box-cancel`); a tool,
    `select-all`, `select-ids`, an action's start and Undo / Redo end it
    (`NO_MODE`). `box` and `box-end` take nothing under a tool or an action
    (a box met by one is dropped on the release, selecting nothing).
  - Ways out of `drag` (nothing moves until the release; the overlay draws
    the selection offset): the release (`drag-end`: the selection moved by
    grab → to, one step, none for no move); Esc (`escape`) and
    `pointercancel`, window blur, a move with no button held (`drag-cancel`)
    put it back with no step; a tool, `select-all`, `select-ids`, an action's
    start, Undo / Redo (`NO_MODE`) and `delete` end it. `drag` starts only
    with no tool, no action and a selection.
  - Ways out of `action` (every one clears `op`): Esc (before the tool and the
    selection; the selection stays), its key or button again (`endOp`),
    another action's key or button (ends this one first, then starts on the
    selection that leaves), a tool, `select-all`, `select-ids`, `delete`,
    Undo / Redo (dropped in the same press), a Check fix that takes its whole
    selection (ended as Esc ends it), the final click or Enter (Move, Rotate,
    Mirror, `mirror-zero`, Pattern's Apply), Finish / Cancel / unmount.
    Copy's copies that still exist become the selection when it ends by Esc,
    its key or button again, another action's start or a fix (`endOp`); a
    tool, `select-all`, `select-ids`, `delete` and Undo / Redo set the
    selection their own way.
  - Ways out of `tool`: Esc (Dimension: the held point or the pending
    dimension first, back to first, then the tool; Offset: the chosen entity
    first, then the tool; otherwise the tool and its half-drawn shape at
    once), the same tool's key or button
    again, another tool, `select-all`, `select-ids`, an action's start
    (`NO_MODE`), the Zero click and `zero-reset` (Zero only), Finish / Cancel /
    unmount. Undo / Redo drop the half-drawn shape and keep the tool. Enter
    with nothing typed ends a polyline and keeps Line; `finish-chain`
    (double-click) does the same and leaves `pending`.
  - Ways out of `selection`: Esc (when no box, drag, action or tool is up),
    a click on nothing, a tool (clears it), `delete`, a new `select`, a box,
    `select-all`, `select-ids`. Undo / Redo and a Check fix keep of
    `selectedIds` and `selectedDimensionId` what still exists. An Edit tool's
    and Relief's click leave it empty (it is empty under a tool anyway).
  - Esc's order in the reducer (`escape`): box, drag, action, a half-made
    dimension, Offset's choice, the tool (`NO_MODE`), the selection. The
    window's Esc dispatches it unless `sketchMode` is `idle`, when it finishes
    the sketch (`finish`, refused while there are dimensions and no entities:
    `finishRefusal`, the message, the sketcher stays). A HUD field's Esc
    (`fieldKey`) dispatches `escape` too. With the focus in the Check panel
    Esc closes Check first and goes no further.
  - The `press` ref: `{ at, start, free, box, grab, dragging }` or null.
    `pointerDown` replaces it for any button (null for a non-left one) and
    fills `start`, `free` (began on nothing) and `grab` (began on a selected
    entity: held by its nearest key point within the snap tolerance, else
    the press point) only with no tool and no action. `move` sets `box` or
    `dragging` once the press passes 4 px (`CLICK_PIXELS`). Cleared by: the
    left release (`pointerUp`), `dropBox` (`pointercancel`, window blur, a
    move with no button held for pointer events), the window's Esc while a
    box or drag is up, the pointer effect's cleanup (unmount, a new viewport
    or frame), and a layout effect on `state.box` / `state.drag`: when the
    reducer ends the box or the drag by anything else (a tool key, Ctrl+A,
    Ctrl+Z, an action, a Check row) the press goes too, so the next move
    cannot start them again and the release applies nothing.
  - The release (`pointerUp`): a box applies (`box` to the release point,
    then `box-end`); a drag lands (`drag`, then `drag-end`); past 4 px
    otherwise nothing; under a tool or an action a `click` with the snapped
    point, kind, raw point, tolerance, Shift and angle step; else `select` of
    what is under it (dimensions first: their labels let clicks through),
    Shift / Ctrl / Meta toggling. `select` takes nothing under a tool or an
    action. A double-click under Line is `finish-chain`.
  - `click` goes to the action first, then Dimension, Relief, the Edit tools,
    then the Draw tools and Zero (`click`).
  - Keys (window `keydown`, not from an input, select or textarea): Esc as
    above; Enter is `enter`; Delete / Backspace with a selection is `delete`;
    Ctrl+A `select-all`; X `construction`; Z the Zero tool on or off; M, K, Q,
    I, G an action on or off (`SKETCH_COMMAND_KEYS` / `sketchCommand`); L, R,
    Shift+R, C, A, S, P, T, E, F, H, O, D, B a tool on or off (`SKETCH_KEYS` /
    `sketchKey`, the bar button's own `tool` action), never with Ctrl / Meta /
    Alt or on a repeat. A HUD field's `fieldKey` takes X, Z, the action keys
    and the tool keys only while it is empty (typed text keeps its letters),
    plus Tab (`field`), Enter and Esc. Ctrl+Z / Meta+Z is Undo last, Ctrl+Y /
    Ctrl+Shift+Z (Meta too) Redo: a capture listener on the window takes both
    first (`stopImmediatePropagation`) so the studio's own (`useSketchKeyboard`)
    never also undoes the model while the sketcher is open; in a box other
    than the HUD they are that box's own text undo. A held Ctrl+Z repeats.
  - History (`sketchHistory.js`): `history` is `{ undo, redo }` stacks of
    `{ entities, dimensions }` snapshots (never mutated: two references a step),
    at most 200 (`HISTORY_LIMIT`), this session's only (a sketch just
    reopened has nothing to undo; Undo last is disabled). Every action that
    changes the drawing goes through `commit` and clears redo: an added
    entity, a kept dimension, a relief, an Edit tool's cut, `delete`, `edit`,
    `fix`, `construction` on a selection, an action's apply, a drag that
    moved. `tool`, `move`, `select`, `box`, `typed`, `relief`, `shapes`,
    `pattern`, the Zero click and `zero-reset` never do. Undo / Redo drop the half-drawn shape in the
    same press as the step (never a step of its own); with no step to take
    only the half-drawn shape goes; with none either, nothing. `nextId` never
    goes back, so ids are not reused.
  - Selection (`sketchSelect.js`): a click selects alone, Shift / Ctrl +
    click adds or takes out (`select` with `toggle`; on nothing it changes
    nothing), a click on nothing clears; a dimension is selected alone; the
    same selection keeps its array (`chosenIds`: the overlay rebuilds the
    entity batch for a new array only). The box: right on screen takes what
    lies wholly inside (`mode` 'inside'), left what it touches ('touching'),
    Shift adds (`boxSelect`, `boxSelection`); a press on an entity or a
    dimension is a click, never a box. A box is never history. A press on an
    entity not selected stays a click; while a selection moves (a drag,
    Move's / Copy's target, Rotate's angle) snap leaves it out.
  - The selection row: `edit` `{ id, patch }` (one entity, no tool, no
    action; `NumericInput`, Enter or blur commits) is `editEntity` +
    `followDimensions`, one step; a refusal or the join note ("This end joins
    1 other: it stays.") is `message`, shown in the row while it is up.
    `construction` flips the selection (one step) with a selection and no
    tool, else arms `construction`, which marks what the Draw tools add.
  - Dimension (`docs/sketch-studio-sketch-dimensions.md` §3.3): a first click
    on a point goes to second, on a line / rectangle side / circle / arc
    straight to place (`sketchDimensions.js` `dimensionPick`); the place click
    keeps the dimension (one step) and returns to first with the tool on; a
    refusal is the message and stays. The place step snaps to the grid only
    (`NO_TARGETS`). Enter and double-click do nothing in it.
  - Relief (`docs/sketch-studio-bend-relief.md` §3.2): a move previews the
    relief at the pick, a click cuts it into the outline (`sketchRelief.js`
    `reliefPick` + `cutRelief`, one step) with the tool on and sets
    `reliefCut`, which the readout shows as "… cut" until the cursor moves or
    the drawing changes; every way out of the tool clears it. A refusal is the
    message with nothing changed; Enter does nothing. Its settings (`relief`:
    shape, typed sizes, sheet) change by the `relief` action only and are
    reported up (`onReliefChange`) for the next sketch.
  - Zero (`docs/sketch-studio-hand-drawing.md` §6): its HUD is X, Y; a click
    on any snapped point, or Enter on typed X, Y (from the zero as it is, `@`
    from the last point), sets `zero` and ends the tool; Esc ends it with the
    zero unchanged; `zero-reset` (Reset zero) puts it back at `[0, 0]` and
    ends the tool. `zero` is never history and only changes what is shown and
    what a typed X / Y means (`sketchZero.js` `fromZero` / `toZero`); it is
    created from `sketch.zero` and handed to `onFinish` as `{ zero }` only
    when moved or stored.
  - The HUD (`sketchPairs`): typing in one pair deletes the other pair's
    typed text, the last typed wins; `lastPoint` (where `@` measures from with
    no point of the tool's own) is set by the Draw tools' clicks and is no
    history.
  - Slot and Polygon (§7): first click → second click, typed Length / Angle
    or size / Angle taken exactly, a refused size is the message with nothing
    added. Their options, the rectangles' corner radius and the Edit tools'
    sizes (`shapes`, `mergeShapes`) change by the `shapes` action only and are
    reported up (`onShapeOptionsChange`).
  - Actions (§7.3, §7.4): `op` with nothing selected is the message ("Select
    what to move first.") and no change. Move: base (a click, or typed ΔX, ΔY
    and Enter moves at once) → target (a click or typed ΔX, ΔY / X, Y applies,
    one step, the action ends, the selection what it moved). Copy: the same
    but stays on at the target, one step a copy (`op.copies`). Rotate: centre
    → angle (a click at the cursor's angle in `angleStep`, or a typed Angle;
    one step, ends). Mirror: first → second (a click over an unselected line,
    the second axis point, or `mirror-zero` applies: one step, ends). Pattern:
    its numbers (`pattern`); `pattern-apply` or Enter applies as one step,
    the selection the original; over 2 000 new shapes the first press only
    sets `op.confirm`, any number changed clears it. Move, Rotate and Mirror
    apply only on their last click, so Esc reverts by never having applied;
    Copy's copies are kept and selected.
  - The Edit tools (§8): Trim, Extend, Fillet, Chamfer, Offset have no HUD
    boxes. A move works out the hover once (`editHover`, memoised on the tool,
    entities, cursor, raw point, tolerance, `shapes`, `offsetFrom`, `nextId`)
    for the preview, the red `cut` piece and the readout; a click applies the
    same answer (`sketchTrim.js`, `sketchCorner.js`, `sketchOffset.js`) as one
    step with the selection empty and the tool on; a refusal is the message;
    Enter does nothing. Offset's first click chooses (`offsetFrom`, no step,
    never history), the second adds the copy and goes back to choose;
    `offsetFrom` is cleared by Esc (first), a tool, Undo / Redo, `delete`
    (with nothing selected it lets go of the choice only), `select-all`,
    `select-ids`, `fix`, an action's start, the copy's click, Finish / Cancel
    / unmount.
  - Check (`sketchCheck.js` `checkDrawing`, memoised on the entities and the
    zero): its panel (`checkOpen`) opens from the bar's Check or the status
    line's "… to fix" button and closes by Close, the bar's Check again or
    Esc with the focus in it; Finish / Cancel / unmount close it with the
    sketcher. A row's click is `select-ids` (ends every mode, selects its
    entities) and frames its place (`onLookAt(…, { place: true })`: the
    camera only). Its fix is `fix` (`applyFix`, one step; a refusal is the
    message): the selection keeps what still exists, a selected dimension the
    fix pruned is let go, an action whose whole selection went ends as Esc
    ends it, Offset's choice is cleared; the tool and a half-drawn shape stay.
  - The workspace is told what is in hand (`onHandChange`: the tool, the
    action's kind and step, the selection, `offsetFrom`) when that changes
    (`handKey`; box and drag left out on purpose); the Sketching panel's Now
    block reads it (`sketchHelp.js`). The idle status line and the panel both
    say Esc finishes the sketch.
  - Module-level memo caches, one entry each, keyed by identity: `lastHover`
    (Relief), `lastEdit` (`editHover`), `lastPlan` (`patternPlan`).
  - Ways out of the whole sketcher: Finish / Cancel / unmount drop the whole
    state; the pointer effect's cleanup clears `press`; a new session
    remounts it (`key`).
  - Tests: `sketchMode.test.js`, `sketchOnFace.test.js`,
    `sketchDimensionTool.test.js`, `sketchReliefTool.test.js`,
    `sketchSelect.test.js`, `sketchHistory.test.js`, `sketchEdit.test.js`,
    `sketchHandDrawing.test.js` (no box or click selection under a tool or an
    action), `sketchZero.test.js`, `sketchTyping.test.js`,
    `sketchIntersect.test.js`, `sketchSnap.test.js`, `sketchCheck.test.js` (a
    fix leaves a sound selection), `sketchShapes.test.js`,
    `sketchTransform.test.js`, `sketchPattern.test.js`,
    `sketchActions.test.js` (Copy then another action acts on the copies),
    `sketchTrim.test.js`, `sketchCorner.test.js`, `sketchOffset.test.js`,
    `sketchEditTools.test.js`, `sketchHelp.test.js`, `sketchKeys.test.js`,
    `CadSketcher.dom.test.jsx` (the real pointer sequence: box, drag, Esc,
    `pointercancel`, blur, a missed release, a tool key or Ctrl+A in the
    middle of a box, Ctrl+Z in the middle of a drag),
    `CadWorkspace.sketchKeys.dom.test.jsx`,
    `CadWorkspace.sketchZero.dom.test.jsx`.
- **Open:**
  - A second pointer (a touch finger, a pen) replaces `press` without
    `box-cancel`, which would leave `state.box` up until Esc or the next box
    (suspected, 2026-11-21; no test).
  - A press on a selected entity, Esc before it passes 4 px, then a release
    within 4 px selects the entity again (suspected; trivial).
  - A tool key, Ctrl+A or Ctrl+Z before a press passes 4 px: the state has no
    box or drag yet, so the press stays. A box press under the new tool is
    refused by the reducer and its release does nothing; a grab press after
    Ctrl+A or Ctrl+Z still becomes a drag of the selection as it now is.
  - `checkHover` keeps a problem id after a fix removes its row (no
    `mouseleave` or `blur` on an unmounted row); ids are not reused, so it
    highlights nothing until Undo brings that entity back (suspected,
    cosmetic).
