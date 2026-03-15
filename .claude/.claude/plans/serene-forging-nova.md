# Plan: Add Railings to 3D Preview

## Context

The railing tool is fully implemented in the 2D plan view (placement, selection, properties panel, SVG rendering) but railings do **not** appear in the 3D preview panel. The 3D preview system renders all other elements (walls, beams, columns, stairs, doors, windows, fixtures, slabs, landings) but has zero railing support. This plan adds railing 3D rendering with type-specific visuals.

## 3D Pipeline Overview

The 3D system uses a two-stage pipeline:
1. **Scene descriptors** (`objectBuilders.js`) — creates data objects describing each element's geometry, position, material
2. **Three.js meshes** (`buildPreviewObjects.js`) — converts descriptors into actual 3D meshes

Additionally, `materials.js` defines materials and `previewInspection.js` handles click-to-inspect info cards.

## Files to Modify

| File | Changes |
|------|---------|
| `src/three/scene/objectBuilders.js` | Add `buildRailingObjects()`, include in `buildFloorPreviewObjects()` |
| `src/three/viewer/buildPreviewObjects.js` | Add `createRailingObject()` with type-specific 3D rendering, add `'railing'` case to dispatcher |
| `src/three/viewer/materials.js` | Add `railing_glass`, `railing_handrail`, `railing_guardrail` materials |
| `src/three/viewer/previewInspection.js` | Add `'railing'` to inspectable types, labels, find, title, and row functions |

## Implementation Steps

### Step 1: Materials (`src/three/viewer/materials.js`)

Add three railing materials before the `outline` entry:

```js
railing_glass: new THREE.MeshStandardMaterial({
  color: 0x8dc8ef,
  roughness: 0.15,
  metalness: 0.02,
  transparent: true,
  opacity: 0.45,
  side: THREE.DoubleSide,
}),
railing_handrail: new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.35,
  metalness: 0.4,
  side: THREE.DoubleSide,
}),
railing_guardrail: new THREE.MeshStandardMaterial({
  color: 0x95a3b0,
  roughness: 0.8,
  metalness: 0.08,
  side: THREE.DoubleSide,
}),
```

### Step 2: Scene Descriptors (`src/three/scene/objectBuilders.js`)

Add `buildRailingObjects()` — uses existing `createLinearBoxDescriptor()` (same pattern as beams).

```js
function buildRailingObjects(floor, floorLevel) {
  return (floor.railings || []).map((railing) =>  {
    const descriptor = createLinearBoxDescriptor(
      railing.id,
      'railing',
      railing.startPoint,
      railing.endPoint,
      railing.width,
      floorLevel,
      railing.height,
      {
        sourceId: railing.id,
        floorId: floor.id,
        materialKey: 'railing_' + railing.type,
      }
    );
    descriptor.geometry = 'railing';
    descriptor.railingType = railing.type;
    return descriptor;
  });
}
```

Add `...buildRailingObjects(floor, floorLevel),` to the return array in `buildFloorPreviewObjects()`.

### Step 3: 3D Mesh Creation (`src/three/viewer/buildPreviewObjects.js`)

Add `createRailingObject()` with type-specific visuals. Reuses existing helpers: `addBox()`, `addCylinder()`, `createMeshMaterial()`, `addOutline()`, `planPointToWorld()`, `planAngleToWorldRotation()`.

**Visual approach per type:**
- **Glass**: Thin transparent glass panel (full height), with top and bottom metal rails
- **Handrail**: Top rail + vertical posts (balusters) spaced ~300mm apart
- **Guardrail**: Solid opaque panel, similar to glass but thicker and opaque

All use a `THREE.Group` positioned at center, rotated to match start→end direction.

Add `'railing'` case in `createObjectForDescriptor()`:
```js
if (descriptor.geometry === 'railing') {
  return createRailingObject(descriptor, materialPalette, isSelected);
}
```

### Step 4: Inspection (`src/three/viewer/previewInspection.js`)

- Add `'railing'` to `INSPECTABLE_TYPES` set
- Add `railing: 'Railing'` to `TYPE_LABELS`
- Add `case 'railing'` to `findObjectInFloor()`: `return (floor.railings || []).find(r => r.id === selectedId) || null;`
- Add `case 'railing'` to `titleForObject()`: capitalize railing type + short ID
- Add `case 'railing'` to `rowsForObject()`: show Length, Height, Width, Type
- Import `railingLength` from `@/geometry/railingGeometry`

## Verification

1. `npx vite build` — no errors
2. Place a railing in 2D plan view, switch to 3D preview — railing appears
3. All three types render with distinct 3D visuals (glass=transparent panel, handrail=posts+rail, guardrail=solid)
4. Clicking a railing in 3D shows inspection info card with length, height, width, type
5. Changing railing type in properties panel updates the 3D appearance
6. Selection highlighting works on railings in 3D
