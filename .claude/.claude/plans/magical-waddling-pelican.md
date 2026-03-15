# Fix Fixtures Sinking Into Slab on Elevated Floors

## Context
In the 3D preview, fixtures on elevated floors appear to "sink into" the slab. The root cause is that **fixture bottom faces and slab top faces are exactly coplanar** (both at `floorLevel`), causing z-fighting — a common 3D rendering artifact where two surfaces at the same depth compete for visibility, producing flickering/overlap that looks like the fixture is partially embedded in the slab.

On the ground floor this is less noticeable because the camera typically views from above. On elevated floors, the camera angle often reveals the slab-fixture junction, making the z-fighting visible.

Additionally, there's a secondary bug: **slabs manually placed on elevated (non-duplicated) floors get `elevation=0`** (the default), rendering them at ground level instead of at the floor elevation. This is in `createSlabPlaceHandler`.

## Elevation Math (current)
- Slab top = `slab.elevation` (absolute). For duplicated floors, correctly offset by `elevationDelta`.
- Slab bottom = `slab.elevation - slab.thickness`
- Fixture base = `floorLevel` = `getFloorElevation(floor)` (absolute)
- Result: fixture bottom === slab top → **z-fighting**

## Changes

### 1. `src/three/scene/objectBuilders.js` — Offset fixture base above slab surface
In `buildFixtureObjects`, compute the maximum slab top elevation on the floor and use it (+ tiny offset) as the fixture base, instead of raw `floorLevel`.

```js
function buildFixtureObjects(floor, floorLevel) {
  // Sit fixtures on top of the highest slab surface (or floorLevel if no slabs)
  const slabs = floor.slabs || [];
  const slabTop = slabs.length > 0
    ? Math.max(...slabs.map(s => s.elevation ?? floorLevel))
    : floorLevel;
  const fixtureBase = Math.max(slabTop, floorLevel) + 1; // +1mm prevents z-fighting

  return (floor.fixtures || []).map((fixture) => {
    const descriptor = createBoxDescriptor(
      ...
      fixtureBase,   // was: floorLevel
      ...
    );
    ...
  });
}
```

The `+1` (1mm) is visually imperceptible but eliminates z-fighting. Using `slabTop` also handles cases where the slab surface is above `floorLevel`.

### 2. `src/editor/handlers/slabPlaceHandler.js` — Fix slab elevation for elevated floors
When creating a slab on any floor, set its elevation to the floor's absolute elevation (not the default `SLAB_ELEVATION = 0`).

```js
import { getFloorElevation } from '@/domain/floorModels';

// In commitSlab():
const slab = createSlab(floor.id, points, undefined, getFloorElevation(floor));
```

This ensures manually placed slabs on elevated floors render at the correct height.

## Files to modify
1. `src/three/scene/objectBuilders.js` — `buildFixtureObjects` (line ~322)
2. `src/editor/handlers/slabPlaceHandler.js` — `commitSlab` (line ~20)

## Verification
1. `npm run dev`
2. Create ground floor with walls + slab + fixtures → 3D preview: fixtures sit cleanly on slab, no flickering
3. Duplicate floor → on Floor 1, fixtures should sit on slab with no z-fighting/sinking
4. Create new empty floor above → draw a slab → slab should render at correct elevation in 3D
5. Place fixture on that floor → fixture sits on slab surface, no sinking
6. Rotate camera to view the slab-fixture junction from below → no visual artifacts
