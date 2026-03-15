# Refine Wall-Column Interaction

## Context
Columns were just added to the editor. Wall endpoints can snap to column centers and corners (5 points), but the interaction is basic. Walls need richer snapping — edge midpoints (column face centers), centerlines, and continuous edge projection — so walls terminate cleanly at column faces in plan view.

Key insight: columns render on top of walls in SVG z-order (`SvgCanvas.jsx:204-205`), so walls that extend into a column's footprint are visually covered. This means **no clipping or wall outline modification is needed** — correct snap targets + render order = clean visuals.

## Files Overview

| File | Change | Purpose |
|------|--------|---------|
| `src/geometry/columnGeometry.js` | Modify | Add `columnEdgeMidpoints()`, `columnEdges()`, expand `columnSnapPoints()` |
| `src/editor/handlers/wallDrawHandler.js` | Modify | Add column-edge projection fallback in `snapToWalls()` |

Two files changed. No renderer, state, or UI changes needed.

---

## Step 1: Expand column geometry — `src/geometry/columnGeometry.js`

### 1a. Import `midpoint` from `./point`

Change import to:
```js
import { rotate, midpoint } from './point';
```

`midpoint` already exists at `src/geometry/point.js:8`.

### 1b. Add `columnEdgeMidpoints(column)`

Computes the center of each of the 4 edges. These are exactly where the column's horizontal/vertical centerlines intersect its faces — satisfying both "edge midpoint" and "centerline" snap requirements.

```js
export function columnEdgeMidpoints(column) {
  const corners = columnOutline(column);
  return [
    midpoint(corners[0], corners[1]),  // top edge center
    midpoint(corners[1], corners[2]),  // right edge center
    midpoint(corners[2], corners[3]),  // bottom edge center
    midpoint(corners[3], corners[0]),  // left edge center
  ];
}
```

Rotation is handled automatically — `columnOutline` applies rotation before returning corners, so midpoints of rotated corners are correct.

### 1c. Add `columnEdges(column)`

Returns the 4 edges as segment pairs. Used by `wallDrawHandler` for continuous edge projection (Step 2).

```js
export function columnEdges(column) {
  const corners = columnOutline(column);
  return corners.map((c, i) => ({
    start: c,
    end: corners[(i + 1) % corners.length],
  }));
}
```

### 1d. Expand `columnSnapPoints(column)`

Add edge midpoints to the returned array (5 → 9 discrete snap points):

```js
export function columnSnapPoints(column) {
  return [
    { x: column.x, y: column.y },
    ...columnOutline(column),
    ...columnEdgeMidpoints(column),
  ];
}
```

Since `wallDrawHandler.js` already iterates `columnSnapPoints()`, it picks up the new targets with zero handler changes for discrete snapping.

---

## Step 2: Column-edge projection fallback — `src/editor/handlers/wallDrawHandler.js`

### What & Why

Currently, `snapToWalls` has a fallback that projects onto wall segments when no discrete snap point is found (lines 43-53). Add the same pattern for column edges — if the cursor is near a column edge but not close to any of the 9 discrete points, project onto the nearest column edge.

This lets walls terminate at **any point** along a column face, not just the center or corners.

### 2a. Import `columnEdges`

Update the existing import:
```js
import { columnSnapPoints, columnEdges } from '@/geometry/columnGeometry';
```

### 2b. Add column-edge projection after column discrete snap, before wall-segment fallback

In `snapToWalls()`, the existing wall-segment fallback (line 43) fires only when `!best`. Insert column-edge projection in the same `!best` block, **before** wall-segment projection (column edges should take priority over wall interiors when both are nearby):

```js
  // If no discrete point found, try snapping to nearest point on column edges
  if (!best) {
    for (const column of (columns || [])) {
      for (const edge of columnEdges(column)) {
        const { point, t } = nearestPointOnSegment(modelPos, edge.start, edge.end);
        if (t <= 0.001 || t >= 0.999) continue;
        const d = distance(modelPos, point);
        if (d < bestDist) {
          best = point;
          bestDist = d;
        }
      }
    }
  }
```

The `t` guard skips edge endpoints (already covered by corners in discrete snap).

---

## Snap Point Summary

After these changes, wall endpoints can snap to:

| Snap target | Count per column | How |
|-------------|-----------------|-----|
| Column center | 1 | Discrete (columnSnapPoints) |
| Column corners | 4 | Discrete (columnSnapPoints) |
| Column edge midpoints (centerlines) | 4 | Discrete (columnSnapPoints) |
| Any point on column edge | continuous | Projection fallback (columnEdges + nearestPointOnSegment) |

---

## Verification

1. `npx vite build` — no errors
2. Place a column, then draw a wall toward its face → endpoint snaps to edge midpoint (face center)
3. Draw wall toward column corner → still snaps to corner
4. Draw wall toward column center → still snaps to center
5. Draw wall toward a column edge but off-center from midpoint → snaps to nearest point on edge (continuous projection)
6. Wall visually terminates cleanly at column face (column renders on top)
7. Rotated columns: place a rotated column (via properties panel), verify snap points rotate correctly
8. Multiple columns: verify snapping works independently per column
