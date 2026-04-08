# Phase 6 QA Checklist

Phase 6 scope:

- `SvgCanvas` floor-scene extraction
- drag interaction stability
- save/load and dirty-state verification
- offline route and revisit verification
- render-pressure profiling during pointer move and drag

## Setup

1. Start the app with `npm run dev`.
2. Use a project with at least:
   - one floor with walls, doors/windows, slab, stair, landing, railing, fixtures
   - one section cut
   - phase-filtered content if available
3. Warm both `/floorplan` and `/sketch` online before running offline checks.

## Render Profiling

Enable profiling in development only:

- URL flag: `http://localhost:5173/floorplan?renderProfile=1`
- Or console/local storage: `localStorage.setItem('map.debug.renderProfile', '1')` then reload

Available profiler helpers:

- `window.__MAP_RENDER_PROFILE__?.reset()`
- `window.__MAP_RENDER_PROFILE__?.flush()`

Tracked components:

- `SvgCanvas`
- `FloorScene`
- `FloorPlanLayer`
- `CanvasStatusBar`

Recommended profiling passes:

1. Reset counters.
2. Perform one scenario for 3-5 seconds.
3. Flush counters and record the console table.
4. Reset before the next scenario.

Expected interpretation:

- Plain pointer hover should increase `SvgCanvas` and `CanvasStatusBar`, but `FloorPlanLayer` should stay mostly flat.
- Preview-only tool movement can rerender `FloorScene`, but should not drive `FloorPlanLayer` unless floor geometry actually changes.
- True geometry drag is allowed to rerender `FloorPlanLayer`.
- If hover-only movement increments `FloorPlanLayer`, inspect prop churn into `FloorScene`.

## Drag Flows

### Floorplan

- [ ] Marquee selection drag updates the marquee box smoothly and commits region selection on pointer up.
- [ ] Wall handle drag keeps endpoint handles aligned and respects snap/shift constraints.
- [ ] Section-cut handle drag preserves minimum valid length and updates selection overlay correctly.
- [ ] Railing anchor drag preserves minimum valid length and updates selection overlay correctly.
- [ ] Slab vertex drag updates only the targeted vertex and keeps overlay handles aligned.
- [ ] Door drag slides along the parent wall without jumping off-axis.
- [ ] Window drag slides along the parent wall without jumping off-axis.
- [ ] Fixture / stair / landing / column move drags keep selection and cursor behavior stable.
- [ ] Undo after drag end restores pre-drag geometry.
- [ ] Redo after drag end reapplies the drag result.

### SketchStudio

- [ ] Pointer move during selection drag keeps selection box stable.
- [ ] Handle drag updates only the targeted handle.
- [ ] Transform move drag works without losing selection.
- [ ] Rotate / flip / move transform controls remain responsive during drag.
- [ ] Constrained entities stay aligned when snap / ortho / constraint logic is active.
- [ ] Undo after drag end restores the previous geometry.
- [ ] Redo after drag end reapplies the geometry change.

## Save / Load / Dirty State

### Floorplan

- [ ] Save a new project file and confirm the file picker path is remembered for the next save.
- [ ] Save an existing project file and confirm no duplicate “save as” prompt appears.
- [ ] Open browser drafts and load a saved draft successfully.
- [ ] Import a JSON project file successfully.
- [ ] Export a JSON project file and reopen it successfully.
- [ ] Dirty indicator clears after save.
- [ ] Dirty indicator becomes true again after a new edit.
- [ ] Undo/redo transitions dirty state as expected relative to the last saved version.
- [ ] Loading or importing while dirty shows the confirm dialog.

### SketchStudio

- [ ] Save current sketch to the current file handle.
- [ ] Save As writes a new file when the name/path changes.
- [ ] Open an existing sketch file successfully.
- [ ] Import a sketch file successfully.
- [ ] Dirty status returns to idle/saved after save and back to dirty after another edit.

## Offline Flows

- [ ] Service worker registers without errors on initial online load.
- [ ] `/floorplan` loads directly while online, then reopens offline after being warmed.
- [ ] `/sketch` loads directly while online, then reopens offline after being warmed.
- [ ] Offline revisit preserves the expected shell and cached assets for warmed routes.
- [ ] Cold offline load behavior is understood and documented if a route was never warmed.
- [ ] Network-unavailable fallback does not break the app shell after a previously successful warm load.

## Notes

- `public/sw.js` is network-first with cache fallback. Warm-cache revisit is the primary supported offline scenario.
- The floor-scene refactor should not change rendering behavior; any visual deltas in plan/section/elevation are regressions.
- Profiling logs are intentionally dev-only and should stay silent in production builds.
