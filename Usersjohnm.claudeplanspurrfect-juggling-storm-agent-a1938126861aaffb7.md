# Implementation Plan: TODOs 1-5 for Modular Apartment Planner

## Overview

Five architecture TODOs addressing code quality, test coverage, and structural organization in the Sketch Studio feature. Implementation order: TODO 5 (small fixes) then TODO 4 (math tests) then TODO 3 (component extraction) then TODO 1 (hook refactor) then TODO 2 (joint registry). TODOs 1 and 2 can run in parallel worktrees since they touch disjoint directory trees.

---

## TODO 5: Small Fixes Bundle (~50 lines changed)

### Fix 5.1: Move parametricEngine.js out of craftsman/utils/

**Why:** sketchDocumentResolver.js (core resolution pipeline) imports from craftsman/utils/parametricEngine.js, creating an upward dependency from shared sketch-studio code into the optional craftsman module.

**Source file:** src/features/sketchstudio/craftsman/utils/parametricEngine.js
**Destination:** src/features/sketchstudio/utils/parametricEngine.js

**Also move:** src/features/sketchstudio/craftsman/utils/parametricEngine.test.js to src/features/sketchstudio/utils/parametricEngine.test.js

**4 import updates required (not just 2 -- ParametricPanel.jsx was missed in initial spec):**

1. src/features/sketchstudio/utils/sketchDocumentResolver.js line 1: Change from craftsman/utils/parametricEngine to ./parametricEngine

2. src/features/sketchstudio/craftsman/**tests**/parametricResolve.test.js line 6: Change from ../utils/parametricEngine to ../../utils/parametricEngine

3. src/features/sketchstudio/craftsman/components/ParametricPanel.jsx line 2: Change from ../utils/parametricEngine to ../../utils/parametricEngine

4. The moved test file keeps its ./parametricEngine import (no change since it moves alongside).

**Verification:** npx vitest run, npm run build.

---

### Fix 5.2: Defensive colon-split parsing

**File:** src/features/sketchstudio/joinery/jointSerializationUtils.js line 163

Change split(":") to split(":", 3). Makes the 3-segment contract explicit. 1 line changed.

---

### Fix 5.3: Separate cloneJoint from normalizeJoint

**File:** src/features/sketchstudio/joinery/jointSerializationUtils.js lines 225-227

Replace cloneJoint (which just calls normalizeJoint) with a proper deep-copy that calls normalizeJoint and then restores the original ID from joint.id if present. Add a test in jointSerializationUtils.test.js confirming ID preservation.

~8 lines in source, ~5 lines in test.

---

### Fix 5.4: Gate useSketchBOM behind craftsmanMode + deduplicate computation

**Step A** -- Gate in SketchStudioLayout.jsx line 82: Pass ui.craftsmanMode ? document.entities : [] to useSketchBOM.

**Step B** -- Remove duplicate in CraftsmanSidebar.jsx: Remove the useSketchBOM import (line 8) and call (line 96). Add bomRows, totalCost, costByMaterial to destructured props.

**Step C** -- Pass BOM data as props from SketchStudioLayout: Add bomRows, totalCost, costByMaterial props to CraftsmanSidebar JSX.

~10 lines across 2 files.

---

### Fix 5.5: Clear recovery after successful file save

**File:** src/features/sketchstudio/hooks/useSketchPersistence.js

Add clearSketchRecovery to the import from shared/sketchAssetStorage (lines 18-20). Call clearSketchRecovery() after line 247 (after status:saved), before the catch block.

## 2 lines changed.

## TODO 4: Math Utility Tests

### filletUtils.test.js

**Location:** src/features/sketchstudio/utils/filletUtils.test.js

**Functions:** findFilletableCorner (line 195), computeSketchFillet (line 212), applyFillet (line 339), constants.

**~15 test cases:** findFilletableCorner: finds line-line corner, returns null when no shared endpoint, picks closest corner, finds polyline vertex, finds rect corner, returns null for empty entities, returns null beyond tolerance. computeSketchFillet: 90-degree corner, auto-clamp radius, null for parallel edges, null for coincident edges, polyline-vertex corners. applyFillet: line-line (shortens + inserts arc), rect (replaces with lines+arc), polyline (modifies points). constants: export values.

**Test data:** Two intersecting lines at 90 degrees at origin. For radius 50: tangent distance = 50, tangentPoint1=(50,0), tangentPoint2=(0,50), controlPoint=(0,0).

### sketchExpressionUtils.test.js

**Location:** src/features/sketchstudio/utils/sketchExpressionUtils.test.js

**Functions:** evaluateSketchExpression (line 211), findVariableReferencesInDocument (line 285).

**~20 test cases:** evaluateSketchExpression: plain number string, plain numeric, arithmetic ops (4), operator precedence, parentheses, variable resolution, dot-path context, undefined variable error, empty expression error, malformed tokens, emptyStringValue option, requireFormulaPrefix, = prefix stripping, division by zero. findVariableReferencesInDocument: entity parametricExpressions, constraint distanceExpression, empty variable name, no refs.

---

## TODO 3: Component Extraction

### 3A: JointPanel.jsx (830 lines to 3 files)

**Extract JointForm.jsx (lines 237-663):** New file at src/features/sketchstudio/craftsman/components/JointForm.jsx. Move JointForm-only helpers (getRectPartOptions, getEntityById, getEdgeOptionsForEntity, supportsAutoDepthMode, formatNumericValue, formatEdgeLabel). Copy JointStatus (10 lines) as private component.

**Extract ExistingJointList.jsx (lines 665-719):** New file at src/features/sketchstudio/craftsman/components/ExistingJointList.jsx. Copy JointStatus as private component. Props: joints, diagnostics, selectedIds, onEdit, onToggle, onRemove.

**Remaining JointPanel.jsx (~140 lines):** Coordinator helpers (buildJointFormState, buildSeedJoint, buildJointFromForm, orderSelectedJoineryEntities) + lines 721-830.

### 3B: RightPanel.jsx (829 lines to 4-5 files)

**Extract EntityPropertyFields.jsx (lines 27-160):** Named function exports for renderReadOnlyRows, renderEditableField, renderEditableTextField, renderEditableFields. Import computeIsometricAngle from ../utils/angleUtils.

**Extract SelectionActions.jsx (lines 162-193):** Pure JSX component.

**Extract ConstraintForm.jsx (lines 297-568):** Imports constraint utils for entity/point/segment options.

**Extract ConstraintsSection.jsx (lines 570-714):** Include serializeConstraintReference (19-25), buildConstraintForm (195-232), buildConstraintPayload (234-295) as private helpers. Import ConstraintForm and ParametricPanel.

## **Remaining RightPanel.jsx (~115 lines):** Lines 716-829 coordinator.

## TODO 1: Hook Coordinator Refactor

**Source:** src/features/sketchstudio/hooks/useSketchStudio.js (1,547 lines)
**Target:** Coordinator under 400 lines.

### Extraction 1: useSketchDraftCommit.js (~120 lines)

New file: src/features/sketchstudio/hooks/useSketchDraftCommit.js. Lines 181-300. Receives: state, dispatch, draftPreview. Returns: commitPrecisionDraft.

### Extraction 2: useSketchTransform.js (~75 lines)

New file: src/features/sketchstudio/hooks/useSketchTransform.js. Lines 302-368. Receives: state, dispatch, readCanvasPoint, readWorldPoint, selectedIds, selectedEntity, selectionBounds. Returns: handleTransformPointerDown, handleRotateSelection, handleFlipSelection, handleToggleBrokenLines, handleHandlePointerDown.

### Extraction 3: useSketchKeyboard.js (~210 lines)

New file: src/features/sketchstudio/hooks/useSketchKeyboard.js. Lines 370-581. Receives: state, dispatch, isSpacePanActiveRef, commitPrecisionDraft, handleUndo, handleRedo. Side-effect-only (no return value).

### Extraction 4: useSketchPointer.js (~370 lines)

New file: src/features/sketchstudio/hooks/useSketchPointer.js. Lines 584-952. Receives: state, dispatch, canvasRef, isSpacePanActiveRef, all viewport sub-hook callbacks, activeTool, editableEntities, selectedIds, selectionBounds, draftPreview. Returns: handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handlePointerLeave.

### Extraction 5: useSketchToolClick.js (~490 lines)

New file: src/features/sketchstudio/hooks/useSketchToolClick.js. Lines 954-1442. Receives: state, dispatch, readCanvasPoint, viewport callbacks, activeTool, editableEntities, draftPreview, commitPrecisionDraft. Returns: handleCanvasClick.

### Resulting coordinator (~330 lines)

~40 lines imports + ~15 lines useReducer/refs/memos + ~15 lines existing sub-hooks + ~10 lines draftPreview+precisionHud memos + ~10 lines simple dispatch wrappers + ~30 lines new sub-hook composition + ~150 lines return API object.

### Extraction order: DraftCommit then Transform then Keyboard then Pointer then ToolClick. Run tests after each.

---

## TODO 2: Joint Registry Refactor

### Step 1: Create type files in src/features/sketchstudio/joinery/types/

7 files: butt.js (~40), dado.js (~80), rabbet.js (~70), mortiseTenon.js (~90), dowel.js (~85), pocketScrew.js (~100), tabSlot.js (~90). Each exports: type, label, description, parameterFields, fabrication, manufacturing metadata, normalizeParameters(), computeDefaults(), validate(), buildGeometry().

Type files import shared helpers from parent modules. Export these currently-private functions from jointGeometryUtils.js: createRectFeatureEntity, createCircleFeatureEntity, buildOccupiedRegions, buildComplementIntervals, shrinkInterval, expandInterval, buildNominalInterval, buildWidthOffsetInterval, buildFemaleClearanceIntervals, buildRepeatedIntervals, buildHoleCenters, getJointFabricationState.

### Step 2: Create jointRegistry.js (~50 lines)

New file: src/features/sketchstudio/joinery/jointRegistry.js. Map of type string to registration object. Exports getJointTypeRegistration(type) and getAllJointTypeRegistrations().

### Steps 3-5: Refactor switches one at a time

1. jointDefaults.js getFabricationDefaultsByType (lines 129-174)
2. jointDefaults.js normalizeJointParameters (lines 192-235)
3. jointDefaults.js computeJointDefaultParameters (lines 257-346)
4. jointValidationUtils.js validateResolvedJoint (lines 127-287)
5. jointGeometryUtils.js buildJointGeometry (lines 814-832)

Run tests after each switch replacement.

### Steps 6-8: Migrate metadata and clean up

6. Copy metadata from craftsman/data/joints.js into type registrations. Map finger to tab_slot, pocket-hole to pocket_screw.
7. Rewrite assemblyGenerator.js line 8 to import from registry instead of craftsman/data/joints.js.
8. Delete craftsman/data/joints.js after verifying no other imports.

### Step 9: Per-type tests in src/features/sketchstudio/joinery/types/**tests**/

7 test files (~30-50 lines each) covering normalizeParameters, computeDefaults, validate, buildGeometry.

---

## Summary Table

| Phase | TODO                         | Est. LOC | Files touched/created |
| ----- | ---------------------------- | -------- | --------------------- |
| 1     | TODO 5: Small Fixes          | ~50      | 5 touched, 0 created  |
| 2     | TODO 4: Math Tests           | ~250 new | 0 touched, 2 created  |
| 3     | TODO 3: Component Extraction | ~100     | 2 touched, 6 created  |
| 4     | TODO 1: Hook Refactor        | ~150     | 1 touched, 5 created  |
| 5     | TODO 2: Joint Registry       | ~400     | 5 touched, 10 created |

TODOs 1 and 2 can run in parallel (hooks/ vs joinery/).

## Risk Assessment

TODO 5 lowest risk. TODO 4 zero risk (additive only). TODO 3 low risk (pure extraction). TODO 1 medium risk (mitigated by incremental extraction with test runs). TODO 2 highest risk (mitigated by incremental switch-by-switch migration with test runs).
