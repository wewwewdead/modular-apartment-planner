/**
 * Gable-end closures through the real pipeline (descriptors → THREE): the
 * `verticalPolygon` panel lands where its descriptor's bounds say, carries an
 * outline, and is cut by its vent (docs/roof-truss-industrial.md §6.1, §6.5).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPreviewObjectRoot } from './buildPreviewObjects';
import { createMaterialPalette } from './materials';
import { createTrussSystem } from '@/domain/trussModels';
import { buildEndClosureObjects } from '@/truss/endClosures';

function gableSystem(endClosures = undefined) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'f1',
    baseElevation: 3000,
    endClosures,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
      },
    ],
  });
}

function build(descriptors) {
  const palette = createMaterialPalette();
  palette.outlinesEnabled = true;
  const { meshMap } = buildPreviewObjectRoot(
    { floors: [{ floorId: 'f1', name: 'F', elevation: 0, visible: true, objects: descriptors }] },
    palette,
  );
  return { meshMap, palette };
}

function worldBox(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry.computeBoundingBox();
    box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
  });
  return box;
}

describe('verticalPolygon closures in 3D', () => {
  it('builds a mesh with an outline whose world box matches the descriptor bounds', () => {
    const descriptors = buildEndClosureObjects(gableSystem());
    const { meshMap, palette } = build(descriptors);

    for (const descriptor of descriptors) {
      const object = meshMap.get(descriptor.id).object;
      expect(object.isMesh).toBe(true);
      expect(object.material).toBe(palette.gableInfill);
      expect(object.children.some((child) => child.isLineSegments)).toBe(true);

      const box = worldBox(object);
      const { bounds } = descriptor;
      // World x = plan x, world y = elevation, world z = plan y.
      expect(box.min.x).toBeCloseTo(bounds.minX, 3);
      expect(box.max.x).toBeCloseTo(bounds.maxX, 3);
      expect(box.min.z).toBeCloseTo(bounds.minY, 3);
      expect(box.max.z).toBeCloseTo(bounds.maxY, 3);
      expect(box.min.y).toBeCloseTo(bounds.minElevation, 3);
      expect(box.max.y).toBeCloseTo(bounds.maxElevation, 3);
    }
  });

  it('cuts the vent through the panel and puts the dark box behind it', () => {
    const vented = { start: { vent: { enabled: true, width: 600, height: 300, sillOffset: 300 } } };
    const descriptors = buildEndClosureObjects(gableSystem(vented));
    const { meshMap } = build(descriptors);
    const panel = meshMap.get('ts_1-closure-start').object;
    const plain = build(buildEndClosureObjects(gableSystem())).meshMap.get('ts_1-closure-start').object;
    // The hole adds its own walls to the extrusion.
    expect(panel.geometry.attributes.position.count).toBeGreaterThan(plain.geometry.attributes.position.count);

    const box = worldBox(meshMap.get('ts_1-closure-start-vent').object);
    expect(box.min.y).toBeCloseTo(3300, 3);
    expect(box.max.y).toBeCloseTo(3600, 3);
    // Behind the panel: on the roof-space side (+x) of End A, clear of its face.
    expect(box.min.x).toBeGreaterThan(worldBox(panel).max.x - 1e-6);
  });
});
