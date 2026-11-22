# State machines: 3D preview and analysis studies

One page of the registry. The treatments (Explicit, Named, Left) and the rules
that hold for every machine are on the front page, `docs/state-machines.md`:
read that first.

The three.js preview (render loop, view modes, walk and inspect navigation)
and the study workers.

Preview paths are under `src/features/floorplan/components/preview/`; the
others are relative to `src/`.

## Explicit machines

<!-- The indented lines in each block are checked against the code by
     src/shared/machineRegistry.test.js. -->

### `preview-load` — a preview pane's road to a picture

`loadPhase.js` (`previewLoadMachine`), owned by `createPreviewViewport.js`
(`loadPhase`, sent events by `sendLoadEvent`) and reported to
`ThreePreviewPanel.jsx` through `setLoadStatusHandler`. `building` until a
world arrives; `compiling` while the first world's programs link behind the
frame hold; `ready` once a frame of the world is on the canvas; `waking` from
a suspension until the catch-up frame is drawn; `lost` when the canvas reports
`webglcontextlost`.

The events: COMPILE when `holdFramesUntil` starts a hold (the world gate or a
see-through mode's first toggle), FRAME when the frame loop draws an
interactive frame or a refine sample of a world, WAKE from `setSuspended(false)`,
LOSE from `handleContextLost`. What the table leaves out is deliberate: a hold
over a picture already on screen is not a loading state, so `ready` takes no
COMPILE; a pane put to sleep before its first picture keeps its phase, so only
`ready` takes WAKE; and `lost` takes nothing, so a compile, a wake or a frame
that lands after the loss cannot call a dead pane ready. Nothing leaves `lost`
but disposing the viewport and building another: the panel's Try again, which
remounts. There is no in-place restore (see WebGL context below).

`building --FRAME--> ready` is a first world that needs no hold: walk mode (the
gate only holds in inspect) or a renderer without `compile`.
`waking --COMPILE--> compiling` is a woken pane whose catch-up world brings new
lights or a material no frame has drawn with.

The panel: `phase === 'lost'` is shown through the same failure presentation
as a viewport that could not start (`PanePlaceholder` with its error and Try
again, `data-loading-state="error"`), with words that say the graphics context
was lost; Save image is disabled and the refining spinner hidden while lost.
Tests: `createPreviewViewport.dom.test.js` (every move, driven through the real
viewport with the GPU stubbed out, and the loss), `ThreePreviewPanel.dom.test.jsx`
(what the panel shows).

    building --COMPILE--> compiling
    building --FRAME--> ready
    building --LOSE--> lost
    compiling --FRAME--> ready
    compiling --LOSE--> lost
    ready --WAKE--> waking
    ready --LOSE--> lost
    waking --COMPILE--> compiling
    waking --FRAME--> ready
    waking --LOSE--> lost

## Named definitions

Each is the one copy of a rule. Import it; never restate it.

- `deriveStudyStatus` (`src/features/floorplan/hooks/useStudyWorker.js`): What
  a study panel is told (`idle` / `running` / `ready` / `error` /
  `unavailable`, and `stale`), from the stored result and the current inputs.

## Machines

### Render loop and compile gate

- **Where:** `createPreviewViewport.js` (`animationFrame`,
  `renderLoopRunning`, `suspended`, `disposed`, `contextLost`,
  `lightCompileGate`, `sceneDirty`), frame policy in `refineSchedule.js`
- **States:** stopped → running (interactive / settle / refine) → held →
  stopped; suspended; lost; disposed
- **Treatment:** Left
- **Notes:** `refineSchedule.test.js` pins the frame policy only. The loop is
  started only by `startRenderLoop`, which does nothing while disposed, lost
  or suspended. There is ONE hold slot, `lightCompileGate`, shared by the world
  gate (`startLightCompileGate`) and a see-through mode's first toggle
  (`requestViewMode`), both through `holdFramesUntil`: a newer hold replaces
  an older one, whose release then does nothing. A newer see-through request
  releases the hold its predecessor set, and only that one. The hold only
  applies in inspect mode. A lost context cancels the frame, the warm-up timer
  and the hold, and nothing restarts the loop afterwards.
- **Open:** a see-through hold set while the first world's hold is pending
  replaces it, so the see-through compile's release can let frames draw while
  the world's programs are still linking: one hitch, the freeze the gate exists
  to prevent (needs a GPU to see; the gate is performance-tuned and was left
  alone).
- **Open:** `compileScenePrograms.js` polls `program.isReady()` every 10 ms
  until every program is ready. If a lost context ever made
  `COMPLETION_STATUS_KHR` read anything but true the poll would never end. The
  extension's specification has a lost context answer true, so this was not
  changed; confirm with `WEBGL_lose_context` while a first compile is pending.

### See-through view mode

- **Where:** `createPreviewViewport.js` (`viewMode`, `requestedViewMode`,
  `viewModeToken`, `viewModeGate`, `viewModeFade`), `viewMode.js`
- **States:** settled → compiling → fading → settled
- **Treatment:** Left
- **Notes:** `viewMode.test.js`. The panel's `viewMode` is the request; the
  viewport's is what is on screen (`getViewMode`). Save image names its file
  after the mode on screen, read at the click
  (`ThreePreviewPanel.dom.test.jsx`).

### Navigation mode

- **Where:** `ThreePreviewPanel.jsx` (`navigationMode`), `createPreviewViewport.js`
  (`navigationMode`, `setNavigationMode`), `createWalkNavigation.js`,
  `createInspectNavigation.js`
- **States:** inspect / walk-ready / walk-active, × physical or no-clip, ×
  input suspended
- **Treatment:** Left
- **Notes:** `createWalkNavigation.test.js`. The viewport's copies (its
  `navigationMode`, the orbit controls' `enabled`, the walk's `enabled`,
  `refineProfile` and the progressive renderer's copy of it) all change inside
  the one `setNavigationMode`, so they cannot disagree. The hand-kept pair is
  the panel's state and the viewport's, kept by three writers: the effect that
  pushes the panel's mode down, `handleViewPresetChange` (a preset is an
  inspect view, and `setOrthographicView` refuses outside inspect), and the
  walk exit handler (Escape, or a lost context, sends the viewport's change
  back up). Losing pointer lock or window focus clears held movement keys.
  Unlocked, the walk answers only Escape, on key-down and on key-up alike: every
  other key-up reaches the listeners its key-down reached (the plan's Space pan
  latches on the key-down and lets go on the key-up).
- **Open:** the panel's `walkUiState.navigationMode` and `canLock` are written
  by the viewport's `emitWalkUiState` and never read.
- **Open:** walk-ready eats the first Escape for the whole window (it leaves
  the walk, and a plan tool or a dialog behind it sees nothing). Kept on
  purpose for now (`docs/state-machines-pass-2.md` §11).

### WebGL context

- **Where:** `createPreviewViewport.js` (`createPreviewViewport`,
  `buildPreviewViewport`, `handleContextLost`, `releaseContextWhenIdle`),
  `renderToImage.js`
- **States:** creating → live → disposed → released; creating → failed
  (handed back); live → lost → disposed → released
- **Treatment:** Left
- **Notes:** A start that throws hands back what it had built (`started`: the
  clock's document listener, the walk's and the orbit's listeners, the
  renderer, its canvas and its context), then rethrows for the panel to show;
  pinned in `createPreviewViewport.dom.test.js`. On `webglcontextlost` the
  viewport stops (see `preview-load`); three's own listener has already called
  `preventDefault`, so the viewport does not. `webglcontextrestored` is not
  handled on purpose: three re-initialises its own state, but every render
  target, environment map and program of this viewport would need rebuilding,
  and a remount is that rebuild. The listener is removed on dispose, before
  `releaseContextWhenIdle` loses the context on purpose. `renderToImage.js` is
  the one-shot sheet-image context: created, used, disposed and lost in a
  `finally`.

### View preset and camera

- **Where:** `createPreviewViewport.js` (`viewPresetName`, `presetDirection`,
  `activeCamera`, `setActiveCamera`), `createInspectNavigation.js`
- **States:** free / iso preset / elevation
- **Treatment:** Left
- **Notes:** Three copies of "which camera": the viewport's `activeCamera`, the
  inspect navigation's own `camera`, and the progressive renderer's; the
  viewport's `setActiveCamera` sets all three. Ways out of a preset: orbiting
  away, entering walk, Reset View, Fit, the View menu.
- **Open:** the inspect navigation's `resetView` and `setProjectionPreset` go
  back to the perspective camera on their own, without telling the other two
  copies. No caller can reach that today (each has already called
  `setActiveCamera`, or cannot be in an elevation), but a new caller could.

### Progressive accumulation

- **Where:** `createProgressiveRenderer.js`, `refineSchedule.js`
- **States:** empty → interactive → refining(n) → converged
- **Treatment:** Left
- **Notes:** Policy already pure and tested. The viewport tells the panel when
  the picture converges or restarts (`setRenderStatusHandler`); a lost context
  reports it not converged, which turns Save image off.

### Key-light shadow pass

- **Where:** `createPreviewViewport.js` (`setKeyLightShadowPass`)
- **States:** never allocated / live / parked
- **Treatment:** Left
- **Notes:** State lives on three.js objects.

### Viewport start and retry

- **Where:** `ThreePreviewPanel.jsx` (`ThreePreviewPanel` with its
  `attempt` key, `viewportError`, the mount effect that creates the viewport)
- **States:** creating → live, or creating → failed (placeholder with Try
  again) → remount; live → lost → remount
- **Treatment:** Left
- **Notes:** Try again remounts the whole body (`key={attempt}`), since every
  effect that wires the viewport up runs once per mount. A lost context takes
  the same way out (`ThreePreviewPanel.dom.test.jsx`). Unmount disposes the
  viewport, then the scene cache.

### Click-versus-drag pick

- **Where:** `createPreviewViewport.js` (`pointerDown`, `handlePointerDown`,
  `handlePointerUp`, `handlePointerCancel`)
- **States:** idle → down → picked (released within
  `CLICK_DISTANCE_THRESHOLD`) or dropped (moved further)
- **Treatment:** Left
- **Notes:** Ends on `pointercancel`, `pointerleave`, a button other than the
  left, walk mode (both handlers re-check it) and dispose.
- **Open:** `navigationModifierActive` and `setNavigationModifierActive` are
  dead (no caller), as are `setInspectLeftButtonRotateEnabled` and
  `getLoadPhase`.

### Scene rebuild throttle

- **Where:** `ThreePreviewPanel.jsx` (`lastBuildAt`, the trailing timer in the
  rebuild effect, `MIN_SCENE_REBUILD_INTERVAL_MS`)
- **States:** idle / trailing build pending
- **Treatment:** Left
- **Notes:** The effect re-runs for each new descriptor and its cleanup
  cancels the timer it set, so the last descriptor of a drag is always built.
  A suspended pane returns early; waking re-runs it once.

### Suspended project hold

- **Where:** `ThreePreviewPanel.jsx` (`useHeldWhileSuspended`)
- **States:** live / held
- **Treatment:** Left
- **Notes:** The snapshot is taken on the edge into suspension, during render;
  the awake path does no state work.

### Shader warm-up debounce

- **Where:** `createPreviewViewport.js` (`shaderWarmupTimer`,
  `scheduleShaderWarmup`, `SHADER_WARMUP_DEBOUNCE_MS`)
- **States:** idle → pending → compiling → idle
- **Treatment:** Left
- **Notes:** Each world change restarts the timer. Cleared on dispose and on a
  lost context.

### Axis indicator

- **Where:** `createPreviewViewport.js` (`axisIndicatorInstance`,
  `setAxisIndicator`)
- **States:** none / set
- **Treatment:** Left
- **Open:** dead: `setAxisIndicator` has no caller. The slot is module-level,
  so if it were ever used it would be shared by every pane.

### Study job

- **Where:** `features/floorplan/hooks/useStudyWorker.js`
- **States:** idle / running / ready / error / unavailable, plus `stale`; all
  derived from the stored result's key
- **Treatment:** Named (`deriveStudyStatus`)
- **Notes:** `studyWorkerLifecycle.dom.test.jsx`. Status is derived on
  purpose: do not store it. The result is written from three places only: the
  worker's `message` handler, its `error` and `messageerror` listeners (which
  answer the pending request with an error and drop a crashed worker), and the
  post timer. The run effect writes the pending request once more, to adopt an
  answer already on screen, which drops the pending request.
- **Open:** a retry after an error (toggling the panel off and on) keeps
  reporting `error` until the reply, because the post clears only progress and
  `unavailable`; a repeat failure looks like no retry.

### Study worker process

- **Where:** `useStudyWorker.js`, `analysis/latestRequestOnly.js`
- **States:** not built → alive → crashed (rebuilt on next run) or terminated
  (deactivate, unmount)
- **Treatment:** Left
- **Notes:** `latestRequestOnly.test.js`. The worker stays warm; supersession
  is by id.

### Sun-day path

- **Where:** `features/floorplan/hooks/useSunDayStudy.js`
- **States:** off / sync / worker first run (stand-in) / worker result / stale
- **Treatment:** Left
- **Notes:** `useSunDayStudy.dom.test.jsx`.

### Sun-panel location editor

- **Where:** `features/floorplan/components/SunStudyPanel.jsx`
  (`editingFromKey`, `locationSubmission`, `dismissedCommand`, `draft`,
  `draftError`)
- **States:** closed / editing / forced open by a rejection / dismissed
- **Treatment:** Left
- **Notes:** Editing is keyed on the stored location, so a save that moves it
  closes the form and a rejection leaves it open with the command's reason.
  A Save records the `lastCommand` it was sent after; when the next record
  says the save was accepted, the form closes, which covers a save that changed
  only the label (or nothing) and clears the key, so an undo that puts the old
  location back does not open the form again. `SunStudyPanel.dom.test.jsx`.

### Sun-panel mask form

- **Where:** `features/floorplan/components/SunStudyPanel.jsx` (`targetDraft`,
  `targetDraftError`, `targetSubmission`, `addTarget`)
- **States:** typing → sent → adopted (accepted: the select picks the new mask
  and the form clears) or rejected (the typed points stay, with the reason under
  the form)
- **Treatment:** Left
- **Notes:** The outcome is read from the next `lastCommand` record, settled
  during render; the patch of `targetId` goes out from an effect, once per
  accepted submission. `SunStudyPanel.dom.test.jsx`.
- **Open:** Remove patches `targetId` before knowing whether the remove was
  accepted; harmless, since it falls back to a mask that exists.
