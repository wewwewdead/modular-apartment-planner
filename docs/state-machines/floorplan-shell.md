# State machines: floorplan shell, persistence and panels

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

Saving and opening a project, the browser draft, dialogs, the error boundary,
the Electron window, the lifecycle panel and the properties panels.

Paths are relative to `src/`.

## Explicit machines

<!-- The indented lines in each block are checked against the code by
     src/shared/machineRegistry.test.js. -->

### `project-open` — opening a floorplan project

`src/features/floorplan/hooks/projectOpenMachine.js`, owned by
`useFloorplan.js` (`openRunRef`, `beginOpenRun` / `advanceOpenRun` /
`cancelOpenRun`). A draft or a file on its way in. Each attempt has a run id;
closing the Open Project dialog cancels the live run, and a run that is
cancelled or no longer the live one neither loads, adopts a file handle,
shows progress nor reports an error. `picking` exists because a file can fail
before its reader reports any progress. The `projectOpening` object the UI
reads is drawn from these stages and keeps its own shape.
Tests: `projectOpenMachine.test.js`, `useFloorplanProjectOpen.dom.test.jsx`.

    idle --OPEN_DRAFT--> draft
    idle --PICK--> picking
    idle --READ--> reading
    picking --READ--> reading
    picking --FAIL--> idle
    picking --CANCEL--> idle
    draft --COMMIT--> idle
    draft --FAIL--> idle
    draft --CANCEL--> idle
    reading --READ--> reading
    reading --UNPACK--> unpacking
    reading --COMMIT--> idle
    reading --FAIL--> idle
    reading --CANCEL--> idle
    unpacking --UNPACK--> unpacking
    unpacking --COMMIT--> idle
    unpacking --FAIL--> idle
    unpacking --CANCEL--> idle

## Machines

### Save and dirty

Two copies can fall behind what is on screen, and "unsaved" means either.

- **Where:** the draft: `floorplanReducer.js` (`changeVersion`,
  `savedVersion`, `isDirty`, `lastSavedAt`; `MARK_SAVED`),
  `persistence/useAutosave.js`. The file:
  `features/floorplan/hooks/useFloorplan.js` (`fileBinding`, `fileBehind`,
  `fileName`, `handleSave`, `commitLoadedProject`). Readers:
  `features/floorplan/context/FloorplanContext.jsx` (`useProject` publishes
  `isDirty`, `fileBehind`, `fileName`),
  `features/floorplan/components/Toolbar.jsx` (the Save dot and its title),
  `app/useUnsavedChangesGuard.js`, `electron/main.cjs`
  (`will-prevent-unload`)
- **States:** the browser draft: clean → dirty → (5 s autosave) clean. The
  opened file: none, or bound `{ handle, version }`; behind whenever its
  version is not the store's `changeVersion` (derived, never stored).
- **Treatment:** Left
- **Notes:** The draft is the store's `isDirty`; only autosave and Save clear
  it, and each names the version it wrote, so an edit made while a write is
  out stays dirty. The file is ONE state object in `useFloorplan`, so the
  handle never moves without the version it holds: adopted at version 0 in
  the same transition as the `PROJECT_LOAD` of a file from the picker
  (`PROJECT_LOAD` starts the count at 0); replaced with the written version
  when Save succeeds; `null` for a new project, a browser draft, a plain
  import and an archive. Autosave reads `isDirty` alone: it writes the
  draft, never the file. The close guard, the four discard prompts (New,
  Open Project File, the file input, Load draft) and the Save dot read
  `isDirty || fileBehind`; the prompt names the file when only the file is
  behind, and the Save title says "not saved" or "saved as a browser draft,
  not yet in <file>". A project with no file bound behaves as it did before
  the file was tracked. A Save that fails for any reason but a closed picker
  drops the binding and says the next save will ask where to put the file.
  A Save that lands after another project replaced this one (compared by
  project id) neither binds its file nor sends `MARK_SAVED`. A held Ctrl+S
  is one save (`event.repeat` is ignored). Leaving inside the five seconds
  (a route change, or a render crash that unmounts the workspace) writes the
  draft once more from `useAutosave`'s unmount-only effect; an ordinary
  re-run of the timer writes nothing. In the playground, autosave and the
  close guard are off only while the demo it started with is on screen
  (compared by project id); a project opened or started there is kept like
  anywhere else. `lastSavedAt` is written and published but read by no
  component. Tests: `floorplanReducer.test.js`,
  `useFloorplanSave.dom.test.jsx`, `useFloorplanFileBinding.dom.test.jsx`,
  `FloorplanContext.dom.test.jsx`, `Toolbar.dom.test.jsx`.
- **Open:** the late-Save check compares project ids, so reloading the very
  project that is on screen while its Save is still writing would still be
  marked by that Save. Ctrl+S in the playground writes the demo into Browser
  Drafts. Ctrl+S in a field with an uncommitted number draft saves without
  it (the key handler ignores inputs). Electron's close dialog cannot tell
  "not saved anywhere" from "in the draft, not in the file", so its words
  ("changes that are not saved to a file") cover both and promise neither.

### Project open

- **Where:** `features/floorplan/hooks/useFloorplan.js`
- **States:** see `project-open`
- **Treatment:** Explicit
- **Notes:** A committed run also sets the file binding (see Save and dirty).
  `useFloorplanProjectOpen.dom.test.jsx`,
  `useFloorplanPersistenceErrors.dom.test.jsx`.

### Confirm dialog and modals

- **Where:** `ui/ConfirmDialog.jsx`, `ui/Modal.jsx` (`openModals`)
- **States:** closed / open, one resolver slot; open dialogs are a stack
- **Treatment:** Left
- **Notes:** `Modal.jsx` keeps a module-level stack of open dialogs (pushed
  on mount, removed on unmount). Only the top one closes on Escape, and it
  marks the press with `preventDefault()` in the capture phase, so a window
  listener added before it opened (focus mode's `FocusEscapeGuard`) sees it
  as used; the press still propagates. `Modal.dom.test.jsx`.
- **Open:** a second `confirm()` while one is open overwrites the resolver
  and the first promise never settles (no caller found that can do it). The
  canvas Escape handlers do not read `defaultPrevented`.

### Error boundary

- **Where:** `app/ErrorBoundary.jsx`, `routes.jsx`
- **States:** ok → crashed → retry
- **Treatment:** Left
- **Notes:** The boundary is above the workspace's provider, so a render
  crash unmounts the store; `useAutosave` writes the draft on that unmount
  when the project was dirty (`useFloorplanSave.dom.test.jsx`).
- **Open:** Try Again remounts the store with an empty project; the work is
  in Browser Drafts and nothing on screen says so.

### Electron window

- **Where:** `electron/main.cjs`
- **States:** hidden → shown; close → veto dialog → closed; crash → reload
  (three per minute) → the fourth asks Reload / Quit
- **Treatment:** Left
- **Notes:** No tests; `node --check electron/main.cjs` is the gate. The
  first three renderer crashes inside a minute reload on their own
  (`CRASH_RELOADS_PER_MINUTE`); the fourth shows an error dialog, and Reload
  starts a fresh count.

### Loading kit

- **Where:** `ui/loading/timing.js` (`useDelayedFlag`, `usePresence`)
- **States:** hidden → scheduled → shown → holding
- **Treatment:** Left
- **Notes:** `timing.dom.test.jsx`.

### Lifecycle stage forms

- **Where:** `features/floorplan/components/ProjectLifecyclePanel.jsx`
- **States:** seeded → dirty → rejected (draft kept) or accepted (stage
  remounts and reseeds)
- **Treatment:** Left
- **Open:** an accepted command remounts the whole stage and wipes sibling
  drafts.

### Lifecycle stage status

- **Where:** `ProjectLifecyclePanel.jsx` (`deriveLifecycleStatus`)
- **States:** ready / attention / incomplete, derived
- **Treatment:** Left
- **Notes:** A realized structure or systems stage, or detailed spaces, whose
  inputs changed since (`outOfDate`) reads "attention", as quantities and
  documents already did. `ProjectLifecyclePanel.test.jsx`.

### Realization pipeline

- **Where:** `domain/*Realization*.js`, `domain/apartmentDesign.js`,
  `domain/buildingCommands.js`
- **States:** per stage: not done → done, plus a derived "stale"; forward only
- **Treatment:** Left
- **Notes:** `coordinatedBuilding*.test.js`. Guards live with each command;
  load-time repair in `persistence/validate.js`. Factories accept any status
  string.

### Review items, markups, value engineering

- **Where:** `domain/professionalHandoff.js`,
  `domain/professionalExchange.js`, `domain/buildingCommands.js`
- **States:** any status to any status
- **Treatment:** Left
- **Notes:** Two review-item setters disagree on reopening; a markup's
  `closed` is unreachable by command.

### Numeric and text drafts

- **Where:** `hooks/useNumericDraft.js`, `hooks/useTextDraft.js`
- **States:** clean / dirty; commit on Enter, blur or a spinner step; Escape
  reverts
- **Treatment:** Left
- **Notes:** `InputField.dom.test.jsx`. Behind ~358 fields.

### Export busy state

- **Where:** `properties/SheetProperties.jsx`, `ProjectLifecyclePanel.jsx`,
  `useFloorplan.js`
- **States:** idle / running / failed, hand-rolled per button
- **Treatment:** Left
- **Notes:** Share and Save report a failure in the status message; a closed
  picker says nothing.
- **Open:** Share and Save have no busy state: a second click starts a
  second write.

### Colour pick

- **Where:** `properties/PanelKit.jsx` (`ColourField`: `pickingRef`,
  `endPick`, `useCoalescedCommit`), bracketed as a drag gesture in
  `properties/WallFinishesSection.jsx`
- **States:** idle / picking / ended
- **Treatment:** Left
- **Notes:** The native `change`, blur and unmount all end the pick through
  `endPick`, which runs once (`pickingRef`).

### Sidebar width drag

- **Where:** `features/floorplan/FloorplanWorkspace.jsx` (`SidebarResizer`,
  `dragRef`)
- **States:** idle / dragging
- **Treatment:** Left
- **Notes:** Pointer capture; pointer-up and pointer-cancel both end it
  (`finishDrag`). A view preference, not geometry: no Escape revert.
- **Open:** no `lostpointercapture`, window-blur or no-button-move ending
  (rule 6).

### Furniture menu

- **Where:** `features/floorplan/components/FurnitureMenu.jsx` (`anchor`)
- **States:** closed / open
- **Treatment:** Left
- **Notes:** Closes on an outside pointer-down, Escape, scroll and resize.
