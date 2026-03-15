# Sketch V2: Parametric Object-Drafting Workspace Refactor

## Context

The Sketch module was recently refactored from a shapes/layers system to a parts/assemblies system. While the basic structure works (build passes, parts render across views), a thorough audit revealed critical bugs, missing features, and architectural gaps that prevent it from working as a serious dimension-driven drafting workspace.

**Key weaknesses:**
- `viewToModelExtents()` silently loses a dimension when creating frames in Front/Side view
- Dimensions are non-interactive (can't select, edit, or delete after creation)
- Dimensions are purely annotation — they don't drive geometry
- Grid snap toggle exists in UI but no handler implements it
- No constraint/attachment system for relationships between parts
- No domain-level validation (NaN/negative dimensions silently accepted)
- Sidebar shows flat parts list, not a hierarchical assembly tree
- SVG export skips dimension annotations entirely
- No part or assembly cloning
- Properties panel rejects dimension selection (`part.type === 'dimension'` → shows "no selection")

**Goal:** Fix bugs, add constraints, make dimensions interactive and geometry-driving, add validation, improve the sidebar tree, add snapping, add cloning, and include dimensions in export — all incrementally without breaking the app.

---

## Step 1: Fix `viewToModelExtents()` Frame Bug

The frame type uses 3 dimensions (`width`, `height`, `length`) but `viewToModelExtents()` only sets 2 when drawing in Front or Side view. The invisible-axis dimension stays at its factory default.

**Modify** `src/modules/sketch/domain/viewProjection.js`
- In `viewToModelExtents()`, each frame case must return all 3 fields. The invisible axis should default to the frame's cross-section `height` (making a square cross-section when not specified):
  - Top: `{ length: w, width: h }` → add `height: h` (square cross-section)
  - Front: `{ length: w, height: h }` → add `width: 40` (default cross-section)
  - Side: `{ width: w, height: h }` → add `length: w` (match visible width as length default)
- Actually: simpler fix — the invisible axis already has a factory default (40 for width, 500 for length). The real fix is to document this behavior and optionally set the invisible axis to a sensible value. Since `createFrame()` spreads `...overrides`, any field NOT in extents keeps its factory default. This is acceptable IF we document it. But we should set the cross-section to match what's drawn. Fix the `front` case to include `width: 40` and `side` case to include `length: 500` explicitly (matching factory defaults), so the behavior is clear.

---

## Step 2: Add Domain-Level Validation

**Create** `src/modules/sketch/domain/validation.js`

Pure functions:
- `validatePartDimensions(part)` → `{ valid, errors[] }` — checks all numeric dimension props are positive, finite, ≤ 100000mm
- `validatePartPosition(part)` → `{ valid, errors[] }` — checks x/y/z are finite
- `validateCutoutFit(cutout, parent)` → `{ valid, errors[] }` — checks cutout fits within parent bounds
- `clampDimension(value, min=1, max=100000)` → clamped number

**Modify** `src/modules/sketch/ui/SketchPropertiesPanel.jsx`
- Use `clampDimension` on blur for all NumberInput fields (prevents NaN/negative/extreme values from reaching the reducer)

**Modify** `src/modules/sketch/app/SketchProvider.jsx`
- In `PART_ADD` and `PART_UPDATE`, run `validatePartDimensions` and `validatePartPosition`; clamp invalid values silently (don't block the action, just sanitize)

---

## Step 3: Make Dimensions Interactive & Selectable

**Modify** `src/modules/sketch/renderers/DimensionRenderer.jsx`
- Add `isSelected` prop
- Remove `pointerEvents: 'none'` from outer `<g>`
- Add invisible wide stroke along dimension line for easier clicking (transparent rect or thick transparent line)
- Add selection highlight (dashed outline around dimension figure when selected)
- Export `projectDimensionPoint` for reuse in selectHandler

**Modify** `src/modules/sketch/editor/handlers/selectHandler.js`
- Remove `p.type !== 'dimension'` filter from `hitTestParts` (line 6)
- For dimension parts: project start/end to 2D via `projectDimensionPoint`, build a `createDimensionFigure`, use `hitTestDimensionFigure` from `@/annotations/dimensions` for hit-testing
- Fall through to existing AABB test for non-dimension parts

**Modify** `src/modules/sketch/renderers/SketchCanvas.jsx`
- Pass `isSelected={dim.id === selectedId}` to each `DimensionRenderer`

**Modify** `src/modules/sketch/ui/SketchPropertiesPanel.jsx`
- Remove the `part.type === 'dimension'` early return (line 137)
- Add `DimensionPropertiesFields` component showing: measured value (read-only), offset (editable), text override (editable), start/end points (read-only)

Reuse: `hitTestDimensionFigure` from `src/annotations/dimensions.js`, `createDimensionFigure` from same file.

---

## Step 4: Add Grid Snapping

**Create** `src/modules/sketch/editor/snap.js`
- `snapToGrid(value, gridSize)` → `Math.round(value / gridSize) * gridSize`
- `snapPoint(point, gridSize)` → `{ x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) }`

**Modify** `src/modules/sketch/editor/handlers/partPlaceHandler.js`
- Accept `snapEnabled` from context (already passed but unused)
- Snap `startPos` and `endPos` in `onMouseDown` and `onMouseUp` when `snapEnabled` is true
- Use `SKETCH_GRID_MINOR` (50mm) as grid size

**Modify** `src/modules/sketch/editor/handlers/dimensionHandler.js`
- Snap click points when `snapEnabled`

**Modify** `src/modules/sketch/editor/handlers/selectHandler.js`
- Snap drag target position after computing delta when `snapEnabled`

---

## Step 5: Constraint / Attachment Domain Model

**Create** `src/modules/sketch/domain/constraintModels.js`
- `createConstraint({ type, sourcePartId, targetPartId, sourceAnchor, targetAnchor, offset })` → constraint object with `id`
- Types: `'attach_face'`, `'align_edge'`, `'center_axis'`, `'inset_edge'`, `'flush_surface'`
- Anchors: `'top'`, `'bottom'`, `'left'`, `'right'`, `'front'`, `'back'`, `'center'`

**Create** `src/modules/sketch/domain/constraintResolver.js`
- `resolveConstraints(constraints, parts)` → `Map<partId, { x, y, z }>` of resolved positions
- Simple arithmetic resolution per constraint type:
  - `attach_face`: source anchor face touches target anchor face + offset
  - `align_edge`: align one axis coordinate
  - `center_axis`: center source on target along axis
  - `inset_edge`: offset from opposite edge
  - `flush_surface`: attach_face with offset=0
- Uses `getPartExtents()` from `viewProjection.js` to compute bounding boxes
- No solver — processes constraints in order, single pass

**Modify** `src/modules/sketch/domain/sketchModels.js`
- Add `constraints: []` to `createSketchProject`

**Modify** `src/modules/sketch/app/SketchProvider.jsx`
- Add `CONSTRAINT_ADD`, `CONSTRAINT_UPDATE`, `CONSTRAINT_DELETE` reducer actions
- After `PART_UPDATE` / `PART_ADD`: call `resolveConstraints()` and apply resulting positions to affected parts (cascade without recording individual history entries for the cascade)

**Modify** `src/modules/sketch/persistence/sketchDeserialize.js`
- Ensure `constraints` array initialized on load

**Modify** `src/modules/sketch/ui/SketchPropertiesPanel.jsx`
- Add a Constraints section: list constraints on the selected part, with delete button
- Add "Add Constraint" that opens a constraint form (type dropdown, target part dropdown, anchor selects, offset input)

---

## Step 6: Dimension-Driven Editing

**Create** `src/modules/sketch/domain/dimensionBinding.js`

Pure functions:
- `bindDimensionToPart(dimension, part, property)` → returns updated dimension with `boundPartId`, `boundProperty`, `boundAxis` set, and start/end points computed from part geometry
- `updateBoundDimensionEndpoints(dimension, part)` → returns updated dimension with recalculated start/end from current part geometry
- `applyDimensionValueToPart(dimension, newMeasurement, part)` → returns `{ partId, changes }` (e.g., `{ partId: 'panel_1', changes: { width: 625 } }`)

**Modify** `src/modules/sketch/domain/partModels.js`
- Add optional fields to `createDimension`: `boundPartId: null`, `boundProperty: null`, `boundAxis: null`

**Modify** `src/modules/sketch/app/SketchProvider.jsx`
- After `PART_UPDATE`: find dimensions with matching `boundPartId` and call `updateBoundDimensionEndpoints` to keep dimension endpoints in sync with part geometry

**Modify** `src/modules/sketch/ui/SketchPropertiesPanel.jsx`
- When a dimension is selected and has `boundPartId`: show the measured value as an editable number input
- On change: call `applyDimensionValueToPart` → dispatch `PART_UPDATE` for the bound part (dimension endpoints auto-update via the reducer cascade above)
- Add "Bind to Part" UI: dropdown of nearby parts + property dropdown

**Modify** `src/modules/sketch/editor/handlers/dimensionHandler.js`
- On dimension creation: if the start/end points snap to a part edge, auto-bind the dimension to that part's corresponding property

---

## Step 7: Hierarchical Assembly Tree + Part Cloning

**Modify** `src/modules/sketch/ui/SketchSidebar.jsx`
- Replace flat parts list with a tree structure:
  ```
  Assemblies
    ▸ Assembly 1 (3 parts)
        Panel "Tabletop"
          Cutout "Cable hole"
        Leg "Leg TL"
    ▸ Assembly 2
  Unassigned Parts
    Frame "Rail"
  ```
- Group parts by `assemblyId` (unassigned → "Unassigned Parts")
- Within each assembly, nest parts with `parentId` under their parent
- Expandable/collapsible assemblies (local `Set<expandedIds>` state)
- Add duplicate button (clone icon) on each part and assembly row

**Modify** `src/modules/sketch/ui/SketchSidebar.module.css`
- Add `.indent` class for nested children (padding-left per depth level)
- Add `.expandToggle` for expand/collapse arrows

**Modify** `src/modules/sketch/app/SketchProvider.jsx`
- Add `PART_CLONE` action: deep-copy part with new ID, offset position by +50mm on X/Y, clone children (cutouts/holes with matching `parentId`), add to same assembly if applicable
- Add `ASSEMBLY_CLONE` action: clone assembly + all its parts, update all cross-references

**Modify** `src/modules/sketch/ui/SketchPropertiesPanel.jsx`
- Add "Duplicate" button in part properties header

---

## Step 8: Dimensions in SVG Export

**Modify** `src/modules/sketch/export/sketchSheetExport.js`
- Add `renderDimensionsSvg(dimensions, view, offsetX, offsetY, scale)` function:
  - For each dimension: project start/end to 2D via view, build figure with `createDimensionFigure`, render as SVG lines + arrows + text
  - Scale strokes and font to paper coordinates
- Call `renderDimensionsSvg` inside the per-view loop, after `renderViewSvg`
- Update `getPartsBounds` to optionally include dimension figure bounds so they don't clip

Reuse: `createDimensionFigure` from `src/annotations/dimensions.js`

---

## Step Dependencies

```
Step 1 (frame extents bug)      — no dependencies
Step 2 (validation)             — no dependencies
Step 3 (interactive dimensions) — no dependencies
Step 4 (grid snapping)          — no dependencies
Step 5 (constraints)            — depends on Step 2
Step 6 (dimension binding)      — depends on Steps 2, 3
Step 7 (sidebar tree + cloning) — no dependencies
Step 8 (dimensions in export)   — depends on Step 3
```

Steps 1–4 and 7 can all be done independently. Steps 5 and 6 build on validation. Step 8 builds on interactive dimensions.

Recommended serial order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**

---

## File Summary

### New files (4)
| File | Step | Purpose |
|------|------|---------|
| `domain/validation.js` | 2 | Part dimension/position validation, clamping |
| `editor/snap.js` | 4 | Grid snap utility functions |
| `domain/constraintModels.js` | 5 | Constraint factory + types |
| `domain/constraintResolver.js` | 5 | Arithmetic constraint resolution |
| `domain/dimensionBinding.js` | 6 | Dimension↔Part binding logic |

### Modified files (13)
| File | Steps | Changes |
|------|-------|---------|
| `domain/viewProjection.js` | 1 | Fix frame extents to include all 3 dimensions |
| `domain/partModels.js` | 6 | Add bound fields to createDimension |
| `domain/sketchModels.js` | 5 | Add `constraints: []` to project model |
| `app/SketchProvider.jsx` | 2,5,6,7 | Validation, constraint actions, dimension cascade, cloning |
| `app/SketchEditorProvider.jsx` | — | No changes needed |
| `renderers/DimensionRenderer.jsx` | 3 | Interactive, selectable, selection highlight |
| `renderers/SketchCanvas.jsx` | 3 | Pass isSelected to DimensionRenderer |
| `editor/handlers/selectHandler.js` | 3,4 | Dimension hit-testing, grid snap on drag |
| `editor/handlers/partPlaceHandler.js` | 4 | Grid snap on placement |
| `editor/handlers/dimensionHandler.js` | 4,6 | Grid snap, auto-bind to part |
| `ui/SketchPropertiesPanel.jsx` | 2,3,5,6,7 | Clamping, dimension fields, constraints UI, bind UI, duplicate |
| `ui/SketchSidebar.jsx` | 7 | Hierarchical tree, expand/collapse, clone button |
| `ui/SketchSidebar.module.css` | 7 | Indent/nesting styles |
| `export/sketchSheetExport.js` | 8 | Dimension rendering in export |
| `persistence/sketchDeserialize.js` | 5 | Initialize constraints on load |

### Shared infrastructure reused (not modified)
- `src/annotations/dimensions.js` — `createDimensionFigure()`, `hitTestDimensionFigure()`
- `src/domain/ids.js` — `generateId()`
- `src/geometry/point.js` — distance, add, subtract, normalize, scale
- `src/sheets/paper.js` — paper presets for export
- `src/modules/sketch/domain/viewProjection.js` — `getPartExtents()` used by constraint resolver

---

## Verification

After each step, run `npm run build` and verify no errors.

After all steps:
1. Navigate to `/sketch` → empty state appears
2. Click "Try Demo Object" → desk renders in top view with parts in sidebar tree
3. Switch views (Top / Front / Side) → parts re-project correctly
4. Draw a frame in Front view → all 3 dimensions are set (check via properties panel)
5. Select a dimension → properties panel shows offset + text override fields → edit offset → dimension moves
6. Enable snap → draw a panel → position snaps to 50mm grid
7. Create a constraint: select a leg, add "attach_face bottom→top" to tabletop → leg snaps to top of tabletop
8. Place a dimension between two panel edges → bind to panel width → edit dimension value → panel width updates
9. Expand assembly in sidebar → shows parts nested under assembly, cutouts under parent panels
10. Click duplicate on a part → clone appears offset by 50mm
11. Click "Export SVG" → downloaded SVG includes dimension annotations
12. Refresh page → project auto-loaded with constraints and bindings intact
