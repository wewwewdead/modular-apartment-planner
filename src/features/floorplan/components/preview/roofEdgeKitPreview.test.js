/**
 * The roof-edge kit and the roof's covering family, built through the real
 * pipeline (descriptors → THREE, batching on), plus the `up` vector that
 * `segment3d` gained for them (docs/roof-truss-industrial.md §5.2).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFloorObjectGroup, buildPreviewObjectRoot } from './buildPreviewObjects';
import { createMaterialPalette } from './materials';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { deserializeProject } from '@/persistence/deserialize';
import demoData from '@/pages/playground-demo.json';

function roofFloor() {
  const { project } = deserializeProject(demoData);
  const scene = buildPreviewScene(project);
  return { project, scene, floor: scene.floors.find((entry) => entry.floorId === project.roofSystem.id) };
}

function localAxis(object, axis) {
  object.updateMatrixWorld(true);
  const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  object.matrixWorld.extractBasis(...basis);
  return basis[axis].normalize();
}

function segmentScene(descriptor) {
  return {
    floors: [{ floorId: 'f1', name: 'F', elevation: 0, visible: true, objects: [descriptor] }],
  };
}

function segment(overrides = {}) {
  return {
    id: 'seg',
    kind: 'roofSystem',
    geometry: 'segment3d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3000, y: 1500, z: 0 },
    crossSection: { height: 200, width: 25 },
    materialKey: 'roofTrim',
    metadata: { sourceId: 'roof' },
    ...overrides,
  };
}

describe('segment3d with an up vector', () => {
  const palette = createMaterialPalette();

  it('pins the cross-section height to `up` squared to the member', () => {
    const { meshMap } = buildPreviewObjectRoot(segmentScene(segment({ up: { x: 0, y: 1, z: 0 } })), palette);
    const mesh = meshMap.get('seg').object;
    const along = new THREE.Vector3(3000, 1500, 0).normalize();
    expect(localAxis(mesh, 0).distanceTo(along)).toBeLessThan(1e-6);
    // World up with its component along the rake removed: the board stays in
    // the vertical plane of its edge, its face plumb.
    const expectedUp = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y).normalize();
    expect(localAxis(mesh, 1).distanceTo(expectedUp)).toBeLessThan(1e-6);
    expect(Math.abs(localAxis(mesh, 2).z)).toBeCloseTo(1, 6);
  });

  it('rolls a strip onto a sloped plane', () => {
    const normal = new THREE.Vector3(0, 0.8, 0.6);
    const { meshMap } = buildPreviewObjectRoot(
      segmentScene(segment({ end: { x: 3000, y: 0, z: 0 }, up: { x: normal.x, y: normal.y, z: normal.z } })),
      palette,
    );
    expect(localAxis(meshMap.get('seg').object, 1).distanceTo(normal)).toBeLessThan(1e-6);
  });

  it('keeps the shortest-rotation path when no `up` is given', () => {
    const { meshMap } = buildPreviewObjectRoot(segmentScene(segment({ end: { x: 0, y: 0, z: 2000 } })), palette);
    const mesh = meshMap.get('seg').object;
    const expected = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    expect(mesh.quaternion.angleTo(expected)).toBeLessThan(1e-6);
  });
});

describe('the playground roof in 3D', () => {
  const { project, floor } = roofFloor();

  it('builds the kit as part of the roof layer, every piece pointing back at the roof', () => {
    const parts = new Set(floor.objects.map((descriptor) => descriptor.metadata?.part).filter(Boolean));
    // The playground roof is a hip: fascia and gutter all round, no barge.
    for (const part of ['fascia', 'gutter', 'downpipe', 'ridgeCap', 'soffit']) expect(parts.has(part), part).toBe(true);
    for (const descriptor of floor.objects.filter((entry) => entry.metadata?.part)) {
      expect(descriptor.kind).toBe('roofSystem');
      expect(descriptor.metadata.sourceId).toBe(project.roofSystem.id);
    }
  });

  it('draws the body in the covering family and the kit in its own keys', () => {
    const body = floor.objects.find((descriptor) => descriptor.id === project.roofSystem.id);
    expect(body.materialKey).toBe('roof_metal');
    const keys = new Set(floor.objects.filter((d) => d.metadata?.part).map((d) => d.materialKey));
    expect([...keys].sort()).toEqual(['roofDownpipe', 'roofGutter', 'roofRidgeCap', 'roofSoffit', 'roofTrim']);
  });

  it('meshes every descriptor with a palette material and an outline', () => {
    const palette = createMaterialPalette();
    const { entries } = buildFloorObjectGroup(floor, palette, null, { batch: true });
    for (const descriptor of floor.objects) {
      const entry = entries.get(descriptor.id);
      expect(entry, descriptor.id).toBeTruthy();
      let mesh = null;
      entry.object.traverse((node) => {
        if (!mesh && node.isMesh) mesh = node;
      });
      expect(mesh.material).toBe(palette[descriptor.materialKey]);
      // Outlines are cut here (palette default) and marked on the mesh.
      expect(mesh.children.some((child) => child.isLineSegments)).toBe(true);
    }
  });

  it('keeps the roof layer cache honest about what the kit reads', () => {
    const { scene } = roofFloor();
    const roof = scene.floors.find((entry) => entry.floorId === project.roofSystem.id);
    expect(roof.sourceKey.trussSystem?.id).toBe(project.roofSystem.trussAttachmentId);
    expect(roof.sourceKey.groundElevation).toBe(0);
  });
});
