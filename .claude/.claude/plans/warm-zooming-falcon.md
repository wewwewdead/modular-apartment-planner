# Smart Snapping & Inference System for 3D Sketch Tools

## Context

The 3D sketch tools (implemented in the previous refactor) let users draw panels, legs, and frames directly in 3D. However, **placing components relative to existing parts is very difficult** — e.g., adding table legs at the corners of a tabletop. The only snap available is a fixed 50mm grid. There's no way to snap to corners, edges, midpoints, or face centers of existing geometry. There's also no visual feedback (face highlighting on hover, snap point indicators, alignment guides).

The goal is to add SketchUp-style inference and smart snapping so that building compound furniture feels precise and intuitive.

---

## Design Approach

**Inference-first snap priority**: When placing or moving parts, the system first tries to snap to geometric features of existing parts (corners, edge midpoints, face centers). Only if no inference point is within threshold does it fall back to grid snap.

**Pure-function engine + Three.js overlay**: The snap logic is pure functions operating on domain coordinates (testable, no Three.js dependency). The visual indicators are a separate Three.js overlay following the existing `DrawingPlaneOverlay` pattern.

**Screen-space threshold**: Snap activation uses a 15px screen-space threshold, converted to world-space at runtime. This ensures consistent feel at any zoom level.

**Hover detection**: A new `onHover` method on handlers provides face/corner highlighting without interfering with the existing pointer event flow.

---

## New Files (4)

### 1. `src/modules/sketch/domain/partGeometry.js`
Centralized part geometry extraction. Replaces 3 duplicated `getPartDimensions` functions.

```
getPartDimensions(part) → {width, depth, height}
getPartCorners(part) → [{x,y,z}, ...] (8 corners)
getPartEdgeMidpoints(part) → [{x,y,z}, ...] (12 midpoints)
getPartFaceCenters(part) → [{x,y,z,faceId}, ...] (6 face centers)
getPartFaceCorners(part, faceId) → [{x,y,z}, ...] (4 corners of one face)
```

### 2. `src/modules/sketch/editor/inferenceEngine.js`
Pure-function snap engine.

```
InferencePoint = {x, y, z, type: 'corner'|'midpoint'|'faceCenter', partId, faceId}
SnapResult = {point: {x,y,z}, inference: InferencePoint|null, snapped: boolean}

collectInferencePoints(parts, {excludePartId?}) → InferencePoint[]
findNearestInference(cursor, points, thresholdMm) → SnapResult|null
findNearestInferenceOnPlane(cursor, points, plane, thresholdMm) → SnapResult|null
findAlignmentAxes(cursor, points, thresholdMm) → [{axis, value, points}]
computeWorldThreshold(camera, domElement, screenPx, refPoint) → mm
```

### 3. `src/modules/sketch/editor/inferenceCache.js`
Simple memoization — recomputes inference points only when `parts` array reference changes.

```
createInferenceCache() → { getPoints(parts, excludePartId?), invalidate() }
```

### 4. `src/modules/sketch/renderers/SnapOverlay.js`
Three.js visual indicators following the `createDrawingPlaneOverlay()` pattern.

- **Snap point dot**: `THREE.Sprite` with color-coded circle (green=corner, cyan=midpoint, blue=faceCenter), constant screen size via `sizeAttenuation: false`
- **Face hover highlight**: `THREE.LineLoop` outlining the hovered face's 4 edges, offset 0.5mm along normal to avoid z-fighting, `depthTest: false`
- **Alignment guide lines**: `THREE.LineSegments` with `LineDashedMaterial`, axis-colored (red=X, green=Y, blue=Z)

```
createSnapOverlay() → {
  group,
  updateSnapIndicator(snapResult),
  updateHoverFace(part, faceId),
  updateAlignmentLines(alignments),
  clear(),
  dispose()
}
```

---

## Modified Files (8)

### 5. `src/modules/sketch/editor/snap.js`
Add `smartSnap3d()` — the unified entry point that chains inference → grid.

```js
smartSnap3d(point, { inferencePoints, gridSize, plane?, camera, domElement }) → SnapResult
```

### 6. `src/modules/sketch/renderers/SketchViewport.jsx`
- Create `snapOverlayRef` and `inferenceCacheRef` in component
- Add `SnapOverlay.group` to scene root (and to `isOverlayObject` exclusion list)
- Pass `inferenceCache` and `viewportRef` into handler context via `create3dHandler`
- **Relax the `handlePointerMove` guard** (line 338): always call `tool.onHover(intersection)` for snap indicators, only call `tool.onPointerMove` during active interaction
- Add `useEffect` hooks watching `toolState.snapResult` and `toolState.hoverPartId/hoverFaceId` to update `SnapOverlay`
- Add snap type indicator to status bar

### 7. `src/modules/sketch/editor/handlers3d/index.js`
Pass `inferenceCache` and `viewport` through handler context.

### 8. `src/modules/sketch/editor/handlers3d/drawRectHandler3d.js`
- Replace `snapToGrid` calls with `smartSnap3d` (passes drawing plane for on-plane inference)
- Store `snapResult` in toolState for overlay rendering
- Add `onHover` method for hover snap preview

### 9. `src/modules/sketch/editor/handlers3d/selectHandler3d.js`
- Replace grid-snap of drag delta with `smartSnap3d` of target position (excluding dragged part)
- Add `onHover` method that detects face under cursor → dispatches `hoverPartId`/`hoverFaceId` to toolState

### 10. `src/modules/sketch/editor/handlers3d/pushPullHandler3d.js`
- Snap extrusion distance to inference points along the extrusion axis (e.g., snap shelf depth to match adjacent shelf)
- Add `onHover` for face highlight

### 11. `src/modules/sketch/domain/drawingPlane.js`
Replace local `getPartDimensions` with import from `partGeometry.js`.

### 12. `src/modules/sketch/domain/extrusion.js`
Replace local `getPartDimensions` with import from `partGeometry.js`.

---

## Implementation Sequence

### Phase 1 — Core Engine (files 1-3, 5)
Create `partGeometry.js`, `inferenceEngine.js`, `inferenceCache.js`. Add `smartSnap3d` to `snap.js`. All pure functions, no UI changes yet.

### Phase 2 — Visual Overlay (file 4, partial 6)
Create `SnapOverlay.js`. Wire into `SketchViewport.jsx` (create ref, add to scene, exclude from raycasting).

### Phase 3 — Handler Integration (files 6-10)
- Add `onHover` to all 3 handlers
- Replace grid snap with `smartSnap3d` in all handlers
- Relax `handlePointerMove` guard in viewport
- Wire `toolState.snapResult` → overlay updates

### Phase 4 — Cleanup (files 11-12)
Replace duplicated `getPartDimensions` in `drawingPlane.js` and `extrusion.js`.

---

## Key Implementation Details

### Hover event flow
```
pointermove (always) → raycast → tool.onHover(intersection)
  → handler computes snap candidates, dispatches hoverPartId/hoverFaceId/snapResult
  → useEffect sees toolState change → updates SnapOverlay

pointermove (during drag/draw) → raycast → tool.onPointerMove(intersection)
  → handler uses smartSnap3d for placement, dispatches snapResult
  → useEffect sees toolState change → updates SnapOverlay
```

### Snap priority
1. Inference corner (within 15px screen distance)
2. Inference edge midpoint (within 15px)
3. Inference face center (within 15px)
4. Grid snap (always, 50mm)

### Coordinate system
All inference engine functions work in **domain coordinates** (x=width, y=depth, z=height). The SnapOverlay converts to Three.js at render time: `threeX = domainX, threeY = domainZ, threeZ = domainY`.

### Performance
~50 parts × 26 points each = ~1300 inference points. Linear scan per mouse move is negligible. Cache invalidates automatically when parts array reference changes (React state immutability).

---

## Verification

1. **Draw a panel** on the ground plane → the panel's 8 corners should show green dots when hovering near them
2. **Select Leg tool, hover near a panel corner** → green snap dot appears at corner → click-drag → leg snaps precisely to corner position
3. **Move a leg** near another leg's corner → snap dot appears → release → leg placed at exact corner
4. **Hover over a panel face** → face edges highlight in gold → drawing plane switches to that face
5. **Draw on a face** → inference points of the source face (4 corners, 4 edge midpoints, 1 center) available as snap targets
6. **Push/pull** from a face → extrusion distance snaps to neighboring part edges along the extrusion axis
7. **Status bar** shows "Snap: corner" or "Snap: midpoint" when snapped to inference
8. **Disable snap** (toolbar toggle) → all inference and grid snapping disabled, free placement
9. **Zoom in/out** → snap activation threshold stays consistent (always ~15px on screen)
10. **Sheet mode** → unaffected, still reads domain data directly
