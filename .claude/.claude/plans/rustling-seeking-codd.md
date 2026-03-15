# Assembly-Driven UX Refactor for Sketch Studio

## Context

The template/assembly infrastructure was implemented in a previous conversation — 4 templates, parameter forms, reducer actions, dialog, sidebar integration. However, the **UX still treats 2D drawing as primary and assemblies as secondary**:

- Toolbar has 7 drawing tools, 0 assembly tools
- Templates hidden behind modals (tiny sidebar icon or empty state)
- No assembly visualization on the 2D canvas (no bounding box, no name label)
- Clicking a part selects that part, even if it belongs to an assembly
- No way to drag/delete an assembly as a unit on canvas
- "Start Drawing" is the primary empty-state button

**Goal:** Make assembly-level interaction the default on the canvas. Users click assemblies, not individual parts. Double-click to enter edit mode for individual part manipulation. Add visual assembly grouping, toolbar entry point, and assembly-level drag/delete.

---

## Implementation Steps

### Step 1: New reducer actions in SketchProvider

**File:** `src/modules/sketch/app/SketchProvider.jsx`

Add two new cases:

**`ASSEMBLY_MOVE`** — batch-move all parts in an assembly by a 3D delta, single undo step
- action: `{ assemblyId, delta: { dx, dy, dz } }`
- Find assembly, iterate its partIds, add delta to each part's position
- Skip dimension-type parts
- Call `sanitizePart`, `applyConstraints`, `updateBoundDimensions` for each moved part
- Single `applyUpdate` call

**`ASSEMBLY_DELETE_WITH_PARTS`** — delete assembly AND all its parts (current `ASSEMBLY_DELETE` only detaches parts)
- action: `{ assemblyId }`
- Collect partIds + their children (parentId references), same cascade pattern as `PART_DELETE`
- Remove constraints referencing deleted parts
- Unbind dimensions bound to deleted parts
- Remove parts and assembly in single `applyUpdate`

### Step 2: New editor action in SketchEditorProvider

**File:** `src/modules/sketch/app/SketchEditorProvider.jsx`

Add `ENTER_ASSEMBLY_EDIT` action:
```
case 'ENTER_ASSEMBLY_EDIT':
  return { ...state, activeAssemblyId: action.assemblyId, selectedId: action.assemblyId, selectedType: 'assembly' };
```

**State semantics (using existing `activeAssemblyId`):**
- `activeAssemblyId === null` → **Normal mode**: clicks on parts promote to assembly selection
- `activeAssemblyId === someId` → **Edit mode**: clicks select individual parts within that assembly

No new state fields needed — reuse the existing `activeAssemblyId` for both "new parts go here" (existing) and "editing inside this assembly" (new).

### Step 3: Assembly bounding box renderer

**New file:** `src/modules/sketch/renderers/AssemblyBoundingBoxRenderer.jsx`

Takes: `assembly`, `parts` (filtered to this assembly), `view`, `zoom`, `isSelected`, `isEditMode`

Computation:
- For each part, call `projectPartToView(part, view)` → get `{svgX, svgY, svgWidth, svgHeight}`
- Track min/max to get bounding rect in projected 2D space
- Works identically for all 3 views since projection handles view mapping

Renders:
- Dashed `<rect>` with 8/zoom padding, steelblue color (`#4682B4`)
- `<text>` label above top-left: assembly name, 12/zoom font size
- When `isSelected`: solid border instead of dashed, bolder stroke
- When `isEditMode`: thinner dotted border to indicate editable state
- All strokes use `vectorEffect="non-scaling-stroke"`
- Skip rendering if 0 parts

### Step 4: Part dimming support in PartRenderer

**File:** `src/modules/sketch/renderers/PartRenderer.jsx`

Add `dimmed` prop (default `false`). When true, set `opacity={0.3}` on the `<g>` wrapper. This visually deemphasizes parts outside the active assembly during edit mode.

### Step 5: Rewrite selectHandler for assembly-aware interaction

**File:** `src/modules/sketch/editor/handlers/selectHandler.js`

The handler signature needs additional context: `activeAssemblyId`, `selectedId`, `selectedType` (some already passed).

**Normal mode** (`activeAssemblyId === null`):
- Hit-test all parts (existing logic)
- If hit part has `assemblyId`: promote to assembly selection (`SELECT_OBJECT` with `objectType: 'assembly'`, `id: assemblyId`). Store `dragAssemblyId` in toolState for drag.
- If hit part has no `assemblyId`: select as part (current behavior)
- **Drag**: if `dragAssemblyId`, compute 3D delta from view (top: dx/dy, front: dx/dz, side: dy/dz), dispatch `ASSEMBLY_MOVE`
- **Delete**: if `selectedType === 'assembly'`, dispatch `ASSEMBLY_DELETE_WITH_PARTS`

**Edit mode** (`activeAssemblyId !== null`):
- Hit-test only parts where `part.assemblyId === activeAssemblyId`
- Select/drag at part level (current behavior)
- Delete dispatches `PART_DELETE` (existing)

**Double-click** (new `onDoubleClick` method):
- Normal mode + assembly selected → enter edit mode via `ENTER_ASSEMBLY_EDIT`
- `handleDoubleClick` callback already exists in SketchCanvas but no handler implemented it

**Escape in edit mode**:
- Exit edit mode: dispatch `SET_ACTIVE_ASSEMBLY` with `null`, keep assembly selected

### Step 6: SketchCanvas integration

**File:** `src/modules/sketch/renderers/SketchCanvas.jsx`

Changes:
1. Import and render `AssemblyBoundingBoxRenderer` for each assembly (after parts, before dimensions)
2. Pass `dimmed={activeAssemblyId && part.assemblyId !== activeAssemblyId}` to each `PartRenderer`
3. Update Escape key handler: if `activeAssemblyId` is set, let tool handler exit edit mode instead of switching tool
4. Add edit-mode indicator in status bar: "Editing: [assembly name]"
5. Pass `activeAssemblyId` to `useSketchTool` context (it's already available via `useSketchEditor`)

### Step 7: "New Object" toolbar button

**File:** `src/modules/sketch/ui/SketchToolbar.jsx`

Add a prominent "New Object" button before the tool palette in model mode:
- Uses `setShowTemplateDialog` from `useSketchProject()` (already imported)
- Styled with sketch accent color border/background (distinct from plain icon buttons)
- Has a `+` icon and "New Object" text label
- Positioned between Project actions and Parts tool palette

**File:** `src/modules/sketch/ui/SketchToolbar.module.css`

Add `.newObjectBtn` class:
- `display: flex; align-items: center; gap: 6px; padding: 6px 14px`
- Accent border (`rgba(184,134,11,0.3)`), accent background (`rgba(184,134,11,0.08)`)
- Font: `var(--font-ui)`, 12px, weight 600
- Hover: stronger background, slight lift

### Step 8: Empty state button reordering

**File:** `src/modules/sketch/ui/SketchEmptyState.jsx`

- Make "Create from Template" the primary button (`btnPrimary` class)
- Make "Start Drawing" secondary (`btnSecondary` class)
- Update subtitle to be more assembly-oriented

---

## Files Summary

### New files (1)
| File | Purpose |
|---|---|
| `src/modules/sketch/renderers/AssemblyBoundingBoxRenderer.jsx` | Dashed bounding box + name label for assemblies on canvas |

### Modified files (7)
| File | Change |
|---|---|
| `src/modules/sketch/app/SketchProvider.jsx` | Add `ASSEMBLY_MOVE` and `ASSEMBLY_DELETE_WITH_PARTS` reducer actions |
| `src/modules/sketch/app/SketchEditorProvider.jsx` | Add `ENTER_ASSEMBLY_EDIT` action |
| `src/modules/sketch/editor/handlers/selectHandler.js` | Assembly-aware selection, drag, double-click, delete, edit mode |
| `src/modules/sketch/renderers/SketchCanvas.jsx` | Assembly bounding boxes, part dimming, escape routing, status bar |
| `src/modules/sketch/renderers/PartRenderer.jsx` | Add `dimmed` prop for opacity control |
| `src/modules/sketch/ui/SketchToolbar.jsx` + `.module.css` | Add "New Object" button |
| `src/modules/sketch/ui/SketchEmptyState.jsx` | Swap primary/secondary button roles |

### Unchanged (reused as-is)
- Template system (`domain/templates/*`, `TemplateDialog`, `TemplateParamsForm`) — fully implemented
- `TEMPLATE_GENERATE/REGENERATE/DETACH` actions — fully implemented
- Assembly properties in `SketchPropertiesPanel` — fully implemented
- Template badge in `SketchSidebar` — fully implemented
- `viewProjection.js` — bounding box computation uses existing `projectPartToView`
- `partPlaceHandler.js` — already assigns parts to `activeAssemblyId`

---

## Interaction Flow

```
Normal Mode (default):
  Click part in assembly  → selects the assembly (bounding box highlights)
  Click unassigned part   → selects the part (current behavior)
  Click empty space       → deselects
  Drag assembly           → moves all parts together (ASSEMBLY_MOVE)
  Delete with assembly    → ASSEMBLY_DELETE_WITH_PARTS
  Double-click assembly   → enters edit mode

Edit Mode (activeAssemblyId set):
  Non-assembly parts      → dimmed to 30% opacity
  Click part in assembly  → selects that individual part
  Click outside assembly  → deselects (stays in edit mode)
  Drag part               → moves that part only (existing)
  Delete part             → PART_DELETE (existing)
  Escape                  → exits edit mode, assembly stays selected
  Drawing tools           → new parts auto-assigned to active assembly (existing)
```

---

## Verification

1. Create a Table from template → assembly bounding box appears with "Table 1200×600" label
2. Click any part of the table → assembly is selected (bounding box solid, all parts grouped)
3. Drag the selected assembly → all 5 parts move together in current view
4. Switch to Front view → bounding box recomputes correctly
5. Double-click the assembly → enter edit mode (non-table parts dim, border changes to dotted)
6. Click a leg → individual part selected, properties panel shows leg properties
7. Drag the leg → only that leg moves
8. Press Escape → exit edit mode, assembly re-selected
9. Press Delete with assembly selected → assembly and all parts deleted, single undo step
10. Undo → entire assembly restored
11. "New Object" button visible in toolbar → opens template dialog
12. Empty state → "Create from Template" is the primary (styled) button
13. Create an unassigned panel → clicking it selects the panel directly (no assembly promotion)
14. Build passes, no console errors
