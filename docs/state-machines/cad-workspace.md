# State machines: Sketch Studio CAD workspace

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

How `CadWorkspace.jsx` starts, switches and ends every tool and session:
operations, sketch, mate, measure, holes, the shop route, exports, the kernel
build.

Paths are under `src/features/sketchstudio/cad/`.

## Explicit machines

<!-- The indented lines in each block are checked against the code by
     src/shared/machineRegistry.test.js. -->

### `cad-mate` — the mate-faces session

`src/features/sketchstudio/cad/toolSession.js` (`MATE`), owned by
`CadWorkspace.jsx` (`mateSession`; `null` is `idle`). The first pick chooses
the face to move, the second the face it sits against, and the second pick
commits the move. `END` is every write of `null`: Done and a new selection
keep a placed move, Cancel mate puts it back, Escape ends a pick, Measure
starting ends it, and another document ends it without putting anything back
(see "Document swap"). A selection change always ends the session
(`resetSelectionTools`), which is why `pickMateFace` sets its own selection
with the raw setters.
Tests: `toolSession.test.js`, `CadWorkspace.tools.dom.test.jsx`,
`CadWorkspace.sessions.dom.test.jsx`.

    idle --START--> moving
    moving --PICK--> target
    moving --END--> idle
    target --PICK--> placed
    target --END--> idle
    placed --END--> idle

### `cad-pdf-run` — a sheet PDF export

`src/features/sketchstudio/cad/toolSession.js` (`PDF_RUN`), owned by
`CadWorkspace.jsx` (`pdfRun.stage`; `null` is `idle`). A run that finds a
sheet it cannot print stops on a report instead of writing.

- `runSheetsPdf` writes `working` as a literal for its three callers (Export
  PDF, the report's Export the other N, the refit effect). Its `finally`
  writes the report or `null` (idle), only while its export generation is
  still the live one.
- Through the table: the report (`REPORT`), Fit to page (`FIT`), the status
  bar's Cancel (`cancelWork`: `CANCEL` ends a working run and a refit, keeps a
  report) and the refit's end on an Undo (`CANCEL`).
- Written as `null` directly: the panel's Cancel on a report or a refit
  (`pdfActions.cancel`; on a working run it aborts the controller instead) and
  Dismiss. `DONE` and `SKIP` are in the table but never sent: success ends in
  the `finally`, and Skip starts a fresh run.
- Fit to page commits, then waits for that commit to be on show and rebuilt
  (`refit`). An Undo that puts back the model from before the fix, after the
  fix had reached the workspace, ends the refit (`pdfRun.left` records that
  the model moved off `pdfRun.before`; without it the first render after the
  fix, which in a test harness can still show the old model, would end it).
- Another document ends any run: a working one is aborted and its generation
  dropped, so the picked file keeps what it had.

Tests: `toolSession.test.js`, `CadWorkspace.pdf.dom.test.jsx`.

    idle --START--> working
    working --REPORT--> report
    working --DONE--> idle
    working --CANCEL--> idle
    report --START--> working
    report --SKIP--> working
    report --FIT--> refit
    report --DISMISS--> idle
    refit --START--> working
    refit --CANCEL--> idle

## Named definitions

Each is the one copy of a rule. Import it; never restate it.

- `openTools` (`src/features/sketchstudio/cad/toolSession.js`): every open
  tool, in order: `operation`, `sketch`, `mate`, `measure`, `hole`, `brake`,
  then the shop session's station (`paint`, `print`, `laser`, `film`). Every
  "is another tool open" rule in `CadWorkspace.jsx` reads this list (the
  workspace computes it once per render as `tools`), never the first name, so
  two tools open at once cannot hide each other and a station added to the
  shop session reaches every rule. The named sets the rules need:
  - `LIGHT_TOOLS` (Measure, the hole tool): every other tool's entry ends
    them, so the ribbon, Place holes / Move holes and the Delete-mark key do
    not wait for them.
  - `SELECTION_FREE_TOOLS` (operation, Measure, the hole tool): a selection
    change cancels an operation, ends the hole tool and leaves Measure; every
    other open tool disables the parts tree.
  - `ROUTE_WAITS_FOR` (operation, sketch, mate): the tools outside the shop
    the route waits for (`routeBusy`); the stations, the brake, Measure and
    the hole tool are left by `goStation` itself.
  - `toolOpenBesides(tools, except)`: whether a tool outside `except` is open.
- `activeTool` (`src/features/sketchstudio/cad/toolSession.js`): the first of
  `openTools`, or null: which tool owns the viewport's clicks (`runningTool`
  in the workspace; the Unfold view, the Shop tab's first click). `weld` and
  `assembly` went with their stations (ST-1).
- Tests: `toolSession.test.js` compares each converted rule with the
  hand-written list it replaced over every combination of sessions (one
  truth table per rule, the old expression kept in the test).

## Machines

### Workspace tool session

- **Where:** `CadWorkspace.jsx` (`operationDraft`, `sketchSession`,
  `mateSession`, `measureSession`, `holeMode`, `brakeSession`, `shopSession`,
  `pendingStation`, `reopen`, `panel`, `busy`, `pdfRun`)
- **States:** idle / operation / sketch pick / sketch draw / mate / measuring
  / hole place / hole move / press brake / a station or the replay / busy
- **Treatment:** Named (`toolSession.js` `openTools`, `activeTool`)
- **Notes:** `CadWorkspace.*.dom.test.jsx`, the cases above in
  `CadWorkspace.sessions.dom.test.jsx`.
  - Rules over the open tools. Each reads `openTools` plus a named set:
    `measureBlocked` (any tool but Measure), `placeable`, the group keys and
    the placement keys (any tool), the reopen effect (any tool started
    meanwhile keeps the view), `routeBusy` (`ROUTE_WAITS_FOR`), the ribbon's
    `commandsOff` and the hole buttons (any tool but `LIGHT_TOOLS`), the
    origin plane tiles (no tool), the parts tree (`SELECTION_FREE_TOOLS`), the
    viewport's `holeMode` prop (no operation, brake or station; a sketch and a
    mate end the hole tool as they open), the Delete-mark key (no tool but
    `LIGHT_TOOLS`: a mark deleted under a stroke or a draft broke it), and the
    pending station (dropped once any tool opens).
  - Rules that are their own on purpose, each with a comment saying so: the
    empty-model Start list (names the four tools an empty model can have),
    the header's New / Open / Undo / Redo (wait only for the replay: a
    document rule), and the status line (a priority chain of words). The
    draw and export buttons that wait on `busy || operationDraft` are about
    the draft model, not the tools.
  - Entries. Each operation entry (`beginOperation`, `addFeature`,
    `openSketchDraft`) ends the hole tool and Measure; a sketch, a mate and
    Measure end each other and the operation (`resetModesForSketch`); the
    press brake, a station (`openShopStation`) and the replay (`startFilm`)
    end the hole tool and Measure.
  - Exits. `resetSelectionTools` is the one exit a selection change takes:
    it ends an operation (restoring isolation), the hole tool, a mate, the
    press brake, the shop session, the gate and a waiting station, and drops
    the selected mark, the sketch and feature shown and the panel. Another
    document ends everything (see "Document swap").
  - `beginOperation` awaits the kernel's references for a fillet, chamfer or
    shell; after the await it opens nothing when the selected part
    (`latestSelectedId`) or the model moved meanwhile.
  - `busy` is one boolean for four async flows (an operation's references,
    Generate views, a file export, a sheet PDF) and the status bar's Cancel.
    Every flow clears it only while it owns it: the export generation it
    started under is still the live one, and (for the references and the
    views, which do not take a new generation) it found the flag free. An
    export or a PDF run started meanwhile, a Cancel or another document takes
    it over.
- **Notes (the sketch session):**
  - `returnTo` (OE-1, docs/sketch-studio-outline-edit-sheet-nest.md §3.3) is
    a record or null. `{ panel: 'shop-draw' }`: Draw → Draw the outline, a
    row's Edit. `{ panel: 'shop-cut', outline }`: Cut from sheet's Edit
    outline (the outline carries the stock and thickness chosen).
    `{ panel: 'shop-laser', instanceId, instanceIds? }`: the laser's Edit
    outline (SN-1: `instanceIds` is the laser's named job, so the laser
    reopens on it). `{ panel: 'part', instanceId, featureId }`: the
    sheet-metal form's Edit outline, the Tree's ↳ Edit sketch on a sheet-metal
    feature, and
    `editSketch` with no `returnTo` on a sketch a sheet-metal part is cut
    from. Null: the Sketch tab's own flow (the "… finished / updated" panel).
  - `editSketch(id, { returnTo })` passes it through `beginSketch`; a record
    leaves the open shop station first (`leaveStations`). `returnFromSketch`
    is the one way back for Finish and Cancel: Draw with the row chosen (a
    Cut-from-sheet outline no longer closed goes there too), Cut from sheet on
    the outline, the laser on its part, or the part selected with its feature
    open. A finish with a record splits separate outlines into sketches
    (`outlineSketches`, one commit).
  - The guard: a finish of a sketch sheet-metal features are made from is
    refused while one of them no longer folds on it (`shopRoute.js`
    `outlineEditRefusal`). Nothing is committed, the session stays with
    `refusal: { message, entities }` (the status line shows it while the
    drawing is the one refused) and the message is the error line; Cancel
    clears that line.
  - SD-1 (docs/sketch-studio-sketch-dimensions.md): the session carries
    `dimensions` (the sketch's reference dimensions; `editSketch` passes them
    as stored), and Finish is `finishSketch(entities, dimensions)`:
    `sketchFromSession` writes the key only when there are any,
    `outlineSketches` gives each split outline its own (`sketchDimensions.js`
    `splitDimensions`).
  - BR-1 (docs/sketch-studio-bend-relief.md §3.4): the session carries
    `sheet`, the sheet the Relief tool sizes for: a cut part's own
    `{ thickness, stock, fixed: true }`, else what Cut from sheet handed
    over, else the remembered `sketchRelief`. Session-only.

### Mate session

- **Where:** `CadWorkspace.jsx`
- **States:** see `cad-mate`
- **Treatment:** Explicit

### Document swap

- **Where:** `CadWorkspace.jsx` (`shownDocumentId`, `sessionDocument`, the
  effect on `document.id`)
- **States:** the document on show; a new id is a swap
- **Treatment:** Left
- **Notes:** `CadWorkspace.sessions.dom.test.jsx`,
  `CadWorkspace.pdf.dom.test.jsx`, `CadWorkspace.place.dom.test.jsx` (edits
  to the same document never refit). New, Open, Import and a template swap
  the document under a workspace that stays mounted (no `key`: the kernel
  worker must stay alive). The render frames the new document once
  (`fitKey`). One effect on the id ends every session of the one before as a
  cancel, never a commit: `resetSelectionTools`, then the selection, the
  sketch session, Measure, a mark being saved, a reopen, a sheet's pending
  views, the brake's and the station's lines, the unfold view, the replay's
  clock, and an export or PDF run (a new generation, a working PDF aborted,
  `busy` and `pdfRun` cleared). A placed mate keeps nothing in the new
  document: nothing is put back.

### Pending after a commit

- **Where:** `CadWorkspace.jsx` (`reopen`, `pendingStation`,
  `pendingDrawings`, `pdfRun.stage === 'refit'`)
- **States:** waiting for a commit to be the model on show (and, for most,
  rebuilt); then done or dropped
- **Treatment:** Left
- **Notes:** `CadWorkspace.tools.dom.test.jsx`,
  `CadWorkspace.place.dom.test.jsx`, `CadWorkspace.route.dom.test.jsx`,
  `CadWorkspace.sessions.dom.test.jsx`, `CadWorkspace.pdf.dom.test.jsx`.
  - `reopen` (Apply and place another): opens the Hole or Pocket tool again
    once the committed model is on show and rebuilt, unless a tool opened
    meanwhile. An Undo that puts back the model from before the apply, after
    the commit had reached the workspace (`reopen.left`), drops it.
  - `pendingStation` (a part Cut on the laser just made; Paint or Print
    waiting on the kernel): opens once its commit or the rebuild arrives; a
    commit that never arrives drops it, and so does any tool opening
    meanwhile (with its waiting card).
  - `pendingDrawings`: a new sheet's views, generated once its commit is on
    show and the kernel is free.
  - The refit: see `cad-pdf-run`.

### Panel

- **Where:** `CadWorkspace.jsx` (`panel`, about forty values)
- **States:** which Properties pane shows
- **Treatment:** Left
- **Notes:** most sessions write their own panel as they open and `null` as
  they are left. A session ended by a render-time rule takes its own panel
  with it where the route reads it: the press brake whose part is gone (an
  Undo) sets `panel` back from `press-brake`, or the route would still read
  Bend as the open station. `liveShopSession` ending a laser session (its
  part gone) leaves `shop-laser`, which the route does not read. It never
  ends a paint session: with every target gone the booth steps back to its
  pick (`GONE`, see `cad-paint` on `docs/state-machines/cad-stations.md`).

### Esc key stack

- **Where:** `CadWorkspace.jsx` (window `keydown` listeners: the sketch or
  mate pick, the operation, Measure, the press brake, the shop session; a
  capture listener holding undo, redo and Delete during the replay)
- **States:** none of its own: each listener is registered while its tool is
  open, and marks the Esc it handles
- **Treatment:** Left
- **Notes:** the listeners run in the order registered (pick, operation,
  Measure, brake, station); the operation, brake and station listeners skip
  an Esc already handled, the pick and Measure listeners do not. Two tools
  open at once would let the earlier one take the other's Esc, which is why
  every entry ends the light tools (a replay started over Measure used to lose
  its panel to Measure's Esc while the film played on).

### Shop floor route

- **Where:** `CadWorkspace.jsx` (`goStation`, `openStationOn`, `routeBusy`,
  `shopSubject`, `shopGate`, `pendingStation`, `cutOutline`, `leftPane`),
  `shopRoute.js` (`ROUTE`, `routeProgress`, `partProgress`, `stationEntry`),
  `ShopFloor.jsx`
- **States:** the open station: none / Draw / Cut (the outline panel or the
  laser) / Bend / Paint / Print / a gate (pick · blocked · waiting)
- **Treatment:** Named (`shopRoute.js` `stationEntry`)
- **Notes:** `shopRoute.test.js`, `CadWorkspace.route.dom.test.jsx`
  (docs/sketch-studio-shop-floor.md §4, SF-1).
  - The way in. The Shop tab's ribbon is the route;
    `goStation(key, { instanceId, outline })` is the one way into a station
    (route buttons, job board rows, Back / Next, a gate's buttons). Any station may follow any
    other: the open one is left first (`leaveStations`: the press brake, the
    shop session, the gate, a waiting station, the hole tool and Measure) and
    the subject is kept; the open station's own button does nothing.
  - Waiting. Every station waits (the route buttons, Back / Next and the job
    board rows are off) while a stroke or a laser cut runs, an export is
    busy, the replay plays, or a tool in `ROUTE_WAITS_FOR` is open.
  - What opens (`stationEntry`): the part (Cut, Bend: the subject's
    sheet-metal part, or the product's only one); a pick list
    (`kind: 'pick'`: several sheet-metal parts, none chosen; one click
    chooses); or
    what is missing and the button that makes it (`kind: 'blocked'`),
    pointing at the earliest station that fixes it in one hop (SF-1 audit).
    With no part: Cut whenever an outline is ready to cut, else Draw
    ("Nothing to bend yet: draw the outline first." → Draw on an empty model,
    "…: cut a blank first." → Cut with one outline or more); Paint / Print the
    same; a blank the fold refuses → its part form; or Draw's outline for Cut.
  - Paint and Print open only on a current model: until then
    `kind: 'waiting'` shows and `pendingStation` opens it when
    `runtime.ready` (no wait line in `.cad-error`). A tool opened while it waits drops it and its
    waiting card.
  - The subject. `shopSubject` ({ productId, instanceId, selectionKey })
    follows the selection each time the selection changes to something; a
    station clearing the selection keeps it; a station opened on a part sets
    it; its nodes going away drop it (an instance's product is always re-read
    from the instance); with none and one product, that product is it. The
    route never writes the model by itself; Draw, the gate and the subject
    are pane state, never saved. A selection change (`resetSelectionTools`)
    also drops the gate and a waiting station.
  - More. The menu runs the Shop commands that are not stations, and since
    ST-1 the Assemble tab's Group, Ungroup and Mate faces (the same commands)
    and Add bought-in item; Unfold waits while any tool runs. The open station
    is left first and put back as it was when the command refuses (Ungroup
    with no group), so the operator's picks are not lost for nothing. More →
    Add bend by numbers works on the selected sheet-metal part, else the
    subject's (`stationEntry` for Bend), and with several asks through Bend's
    own pick gate (`then: 'add-bend'`), never an error line.
  - Draw (SF-3). The Flanged panel keeps its draft in the workspace
    (`panelDraft`, `panelOpen`; pane state, never saved) so the form and the
    preview over the view edit one thing; the layout is derived
    (`panelMaker.js` `flangedPanel`) on every change; either ending makes the
    part through `cutFromSheet` and goes on to the laser, cutting, as Cut on
    the laser does (choosing a stock sheet that holds the blank when the
    model's does not).
  - Draw's outlines (OE-1). Draw lists every outline (`shopRoute.js`
    `shopOutlines`: ready to cut, then not ready with why), each with Edit
    (the sketcher, back to Draw) and Delete (one commit; Undo brings it
    back); `drawnSketch` is the row a finish chose and `outlineNotice` ({
    text, model }, pane state) the split line, shown while the model is the
    one it describes. While Draw is open with no sketch, film or laser the
    view draws the outlines (`shopOutlineView` → the viewport's
    `shopOutlines` prop, one rebuild per outline set and chosen row, `null`
    elsewhere).
  - Batch cut (SN-1, docs/sketch-studio-outline-edit-sheet-nest.md §4.8).
    `cutOutline` may be `{ kind: 'batch', items }` (the drawing's Cut all {n}
    and Cut this). With no part, Bend, Paint and Print point at Cut whenever
    an outline is ready. Cut from sheet's Cut on the laser (single or batch)
    is `cutFromSheet`: every new sketch, part and instance (Quantity: n
    instances of one part) in ONE commit, the instances laid out round the
    view's drop point (`shopParts.js` `landingPositions`; one blank lands
    exactly as before), then `pendingStation` with `instanceIds` (a batch)
    opens the laser on the first, cutting. The batch panel's left-out rows
    and quantities are panel state (Back to Draw and Cut all again starts
    afresh). `cutFromSheet` passes `standingBoxes()` (each instance's built XY
    box, else its blank's at its position) to `landingPositions`, which moves
    the whole lot along +X in its own slots until it is clear of them: a new
    cut never lands on a part.
  - The bend queue (BQ-1, same spec §7). Bend's pick gate is one row per part
    (`shopRoute.js` `bendQueue`'s text, "× copies"; the first copy in the
    gate's own order); Cut's stays per instance. Every state of Bend on a part
    (the session, the Finished card, the shop-order refusal, the error card,
    "Nothing keeps this part off the brake now.", and Bend's gate on a part
    whose blank does not fold) carries the queue under its head
    (`shell.strip`, from two parts); its Previous part, Next part and rows
    are `goStation('bend', { instanceId })`, off while the route waits. The
    punch and die carry across such a move (see `cad-brake`).
  - Job board rows. A row while the laser is open on a job (not cutting)
    whose instance is in that job makes its part the lead (`leadLaser`, the
    job kept) instead of reopening the laser; a row outside it reopens the
    laser on that part. A row with no station open also makes its part the
    subject, even when it is already the selection (the queue moves the
    subject without selecting it).
  - Cut's entry (RC-1 / RC-2, docs/sketch-studio-cut-pick.md), in order: a
    sheet-metal part the route was sent to
    (`goStation('cut', { instanceId })`: a job board row, a gate's row, Back
    / Next on a part, the picker's Open on the laser, the bend queue) → the laser on it; any outline ready
    to cut and (two or more, or any sheet-metal part in the model) → the
    picker, `cutOutline = { kind: 'pick', selected: [] }`; one outline and no
    sheet-metal part → Cut from sheet on it; none → the laser on the
    subject's part (the selection's too), the product's one part, the gate,
    or "Nothing to cut yet…". The route bar's own button passes
    `fromSelection` (`stationEntry`'s option): a part that is only the
    selection does not skip the picker while outlines wait.
  - The picker. Draw's Cut all {n} outlines opens it with every ready
    outline selected (`{ kind: 'pick', selected: ids }`); the laser's Cut
    another outline opens it with none selected on the laser's stock and
    thickness. It is controlled pane state, never saved: `cutOutline` holds
    `selected` (sketch ids, the view and the list share it), `quantities` ({
    sketchId: n }, kept while a row is unticked), `stock` and `thickness`;
    `ShopPanels.jsx` `PickCutPanel` writes every change back (`onOutline`),
    so it mounts once while open. Its rows are `readyOutlines` (a selected id
    no longer ready is ignored); a row whose blank `foldSheet` refuses at the
    stock cannot be ticked and is left out. Cut on the laser is
    `cutFromSheet({ items })` as the batch's. While the picker shows at rest
    (no sketch, film or laser) the view draws every outline, the selected
    ones chosen (`shopOutlineView(model, params, selected)`), the origin
    plane tiles are off, and the viewport gets `onPickOutline`
    (`toggleCutOutline`; null while the route waits and on every other
    panel). Edit on a row is
    `editOutline(id, { panel: 'shop-cut', outline: cutOutline })`;
    `returnFromSketch` always brings a picker back (an
    outline no longer ready leaves its list, and `outlineNotice` says so).
  - Removing parts (RC-1). Remove instance, Remove N parts / Remove group
    (`model.js` `removeInstances`) take a sheet-metal part with its last
    instance (`removePart`: its drawing sheets too; never a part another part
    uses as a Boolean tool; Add-hardware keeps its own rule) in the same one
    commit, so its outline is ready to cut again and one Undo restores both;
    the laser's Quantity still removes copies through `removeInstance` (never
    the lead). On load `removeBlanklessParts` (`sketchDocumentUtils.js`,
    after `removeEmptyParts`) removes such parts saved with no instance.

### Job sheet

- **Where:** `CadWorkspace.jsx` (`panel === 'job-sheet'`, `jobProduct`,
  `jobBatch`, derived `jobView`), `jobSheet.js`
- **States:** a panel, not a tool
- **Treatment:** Left
- **Notes:** `jobSheet.test.js`, `CadWorkspace.laser.dom.test.jsx`. Read only:
  it claims no clicks and is not in `openTools`. BQ-1 (§7.5): `jobSheet()`
  also returns `stockSheets` (Sheets to buy: one `sheetNest` per stock and
  thickness, of the batch's blanks), shown under the products and appended to
  the CSV (Step "Sheet stock"); `bendQueue.test.js`.

### PDF and export run

- **Where:** `CadWorkspace.jsx` (`pdfRun`, `busy`, `exportingType`,
  `exportGeneration`)
- **States:** see `cad-pdf-run`
- **Treatment:** Explicit
- **Notes:** `CadWorkspace.pdf.dom.test.jsx`. `busy` belongs to one flow at a
  time (see "Workspace tool session"): Generate views ending under a PDF run
  leaves the run its busy state and the status bar's Cancel. A file export
  and a PDF run each take a new generation; the status bar's Cancel and
  another document take one too, so a run they stop never writes and never
  clears `busy` for a later one.

### Auto drawing generation

- **Where:** `CadWorkspace.jsx` (`drawings`, `autoDrawn`, `pendingDrawings`,
  the effect that generates the open sheet's views)
- **States:** a sheet's views never generated, requested, cached for a model
- **Treatment:** Left
- **Notes:** `CadWorkspace.drawings.dom.test.jsx`. Runs only with the kernel
  current, nothing busy, the split pane on and no operation open; each sheet
  is tried once per model, so an error or an empty projection never loops.
  Its request is Generate views' (`requestDrawings`), so it holds `busy`
  while it runs.

### Kernel build

- **Where:** `useCadModel.js`, `workerClient.js`
- **States:** idle → building → ready / error / cancelled; worker alive,
  superseded, terminated
- **Treatment:** Left
- **Notes:** `useCadModel.dom.test.jsx`, `reliability.test.js`.
  - Two hooks: `useCadModel(model)` for the model, and
    `useCadModel(draftModel, enabled)` for an operation's preview. The preview's workers stay warm
    while it is switched off and are released after `PREVIEW_IDLE_RELEASE_MS`
    (30 s) off; one running a build it can no longer use is stopped.
  - Every async step re-checks its revision. `request()` would overwrite the
    client's revision, so it refuses unless the hook is `ready` on the current
    model: every caller is safe.
  - Kernel-inert edits (`finishes`, `prints`, `fabrication`, since SM-3
    `groups` and an instance's `groupId`; `model.js` `sameKernelInput`) keep
    the snapshot and move `source` under the same revision: no rebuild,
    `request()` keeps working (docs/sketch-studio-fab-shop.md §4.3).
  - A build is sent `kernelPayload(model)`: the model without finishes and
    prints, so a print's image never goes to a worker. (`welds` and
    `assembly` left the model with their stations, ST-1: a file that has them
    drops them on load, unread.)
  - The worker stays alive across a document swap: the workspace is not
    remounted for one (see "Document swap").

### Live field session

- **Where:** `CadEditors.jsx` (`ValueField`), `CadWorkspace.jsx`
- **States:** idle → editing (focus; `dirty` once typed) → live-committed
  (the debounced value sent while typing) → ended (Enter or blur commits
  what was typed) or reverting (Esc puts back the value the session started
  with). After a blur the field shows the value, or `held`: text it could
  not commit, kept on screen while the value is the one it was typed over.
- **Treatment:** Left
- **Notes:** `ValueField.dom.test.jsx`, `liveHistory.test.js`.
  - Esc with nothing typed and nothing sent is not the field's: it does its
    usual job (closes the tool).
  - Ctrl+Z and Ctrl+Y end the session without committing (the studio's Undo
    runs even in a field), so a later keystroke starts a new session instead
    of folding into an undone entry.
  - A number field that cannot read its text drops `held` and shows the
    value in force again (`numberFor`: "Number fields: unreadable text" on
    `docs/state-machines/cad-stations.md`).
