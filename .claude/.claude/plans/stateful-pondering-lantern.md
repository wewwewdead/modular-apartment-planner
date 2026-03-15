# Plan: Multiple Section Cuts + Fix Elevation View Door/Window Rendering

## Context

Two issues to address:

1. **Multiple section cuts**: Currently `floor.sectionCut` is a single object — only one section cut per floor. Users want to place as many as needed. Need to change to an array (`floor.sectionCuts`).

2. **Elevation views don't show doors/windows correctly**: In `buildElevationScene()` (elevations/scene.js), elements are sorted ascending by depth (`a.depth - b.depth`). In SVG, later elements render on top. This means the *back wall* (highest depth) paints over everything — including doors/windows on the *front wall*. For a correct painter's algorithm, we need descending depth (`b.depth - a.depth`) so far objects draw first (behind) and near objects draw last (on top). The same issue exists in `buildSectionScene()` (sections/scene.js).

---

## Part 1: Multiple Section Cuts

### 1.1 `src/domain/models.js` — data model

- Change `createFloor()`: `sectionCut: null` → `sectionCuts: []`
- Add helper `nextSectionLabel(existingCuts)` that returns "Section A-A", "Section B-B", etc. based on what labels already exist

### 1.2 `src/app/ProjectProvider.jsx` — reducer actions

Replace the three section actions:

- `SECTION_SET` → `SECTION_ADD`: push `action.sectionCut` to `f.sectionCuts` array
- `SECTION_UPDATE`: find by `action.sectionCut.id` in `f.sectionCuts`, merge updates
- `SECTION_DELETE`: takes `action.sectionId`, filter it out of `f.sectionCuts`

### 1.3 `src/editor/handlers/sectionPlaceHandler.js` — placement

- Always create a new section cut (remove the "overwrite existing" logic)
- Use `SECTION_ADD` instead of `SECTION_SET`
- Auto-generate label via `nextSectionLabel(floor.sectionCuts)`

### 1.4 `src/renderers/SvgCanvas.jsx` — plan view

- Change: `<SectionCutRenderer sectionCut={floor.sectionCut} .../>` → map over `floor.sectionCuts` rendering a `SectionCutRenderer` for each

### 1.5 `src/renderers/SheetViewportContent.jsx` — sheet plan view

- Same: map over `floor.sectionCuts` for `SectionCutRenderer`

### 1.6 `src/renderers/SectionCutRenderer.jsx`

- No changes needed (already accepts a single `sectionCut` prop)

### 1.7 `src/editor/handlers/selectHandler.js` — hit testing & dragging

- Hit test: loop over `floor.sectionCuts` array instead of checking single `floor.sectionCut`
- Drag/update: find section cut by `selectedId` in `floor.sectionCuts` array
- Delete: dispatch `SECTION_DELETE` with `sectionId: selectedId`

### 1.8 `src/renderers/SelectionOverlay.jsx` — selection handles

- Find section cut by ID: `floor.sectionCuts.find(s => s.id === selectedId)` instead of `floor.sectionCut?.id === selectedId ? floor.sectionCut : null`

### 1.9 `src/ui/PropertiesPanel.jsx` — properties & count

- Section count display: `floor.sectionCuts.length` instead of ternary
- Find selected section cut from array by ID
- Delete: dispatch `SECTION_DELETE` with `sectionId: selectedId`
- "Add viewport" sourceRefId: use `floor.sectionCuts[0]?.id` as default

### 1.10 `src/sheets/sources.js` — viewport sources

- `collectPlanPoints()`: iterate over `floor.sectionCuts` array
- `buildSectionSource()`: find the specific section cut by `sourceRefId` from `floor.sectionCuts`. Pass it explicitly to `buildSectionScene`.

### 1.11 `src/sections/scene.js` — section scene builder

- Change `buildSectionScene(floor)` signature to `buildSectionScene(floor, sectionCut)` — accept the specific section cut as a parameter instead of reading `floor.sectionCut`

### 1.12 `src/renderers/SectionRenderer.jsx`

- Check `floor.sectionCuts?.length` instead of `floor.sectionCut`
- Pass first section cut: `buildSectionScene(floor, floor.sectionCuts[0])`

### 1.13 `src/persistence/deserialize.js` — migration

- Migrate old `floor.sectionCut` (single) → `floor.sectionCuts` (array)
- If `floor.sectionCut` exists, wrap it: `floor.sectionCuts = [floor.sectionCut]`
- If neither exists, set `floor.sectionCuts = []`
- Delete the old `floor.sectionCut` property
- Apply existing backfill logic to each element in the array

---

## Part 2: Fix Elevation & Section View Depth Sorting

### 2.1 `src/elevations/scene.js` — line 174: reverse sort

**Before:**
```javascript
.sort((a, b) => a.depth - b.depth);
```

**After:**
```javascript
.sort((a, b) => b.depth - a.depth);
```

This ensures far objects (high depth) render first in SVG (behind), and near objects (low depth, including front-wall doors/windows) render last (on top, visible).

### 2.2 `src/sections/scene.js` — lines 294-296: reverse depth within groups

**Before:**
```javascript
.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return a.depth - b.depth;
});
```

**After:**
```javascript
.sort((a, b) => {
    if (a.renderMode !== b.renderMode) return a.renderMode === 'projection' ? -1 : 1;
    return b.depth - a.depth;
});
```

Same fix applied to `stairElements` sort on line 300.

---

## Verification

1. **Multiple section cuts**: Use Section tool (Q) to draw multiple section cuts on the same floor. Each should appear with sequential labels (A-A, B-B, C-C). Select, drag, delete individual ones. Verify sheet viewports still reference section cuts correctly.
2. **Elevation views**: Create a rectangular room with a door and window. Open Front/Rear/Left/Right elevation viewports on a sheet. Doors and windows should be visible as colored rectangles on the wall face closest to the viewer, not hidden behind back walls.
3. **Section views**: Add a section cut, create a section viewport. Doors/windows behind the cut should render with correct depth ordering.
