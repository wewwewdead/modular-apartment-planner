import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock THREE.js — the cache only needs Group semantics (add/remove/clear/
// traverse) plus geometry.dispose(); the heavy geometry classes are stubbed the
// same way buildPreviewObjects.test.js does.
vi.mock('three', () => {
  class MockVector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    copy() {
      return this;
    }
    set() {
      return this;
    }
  }
  class MockQuaternion {
    setFromUnitVectors() {
      return this;
    }
    copy() {
      return this;
    }
  }
  class MockGeometry {
    rotateX() {
      return this;
    }
    translate() {
      return this;
    }
    setAttribute() {}
    computeVertexNormals() {}
    dispose() {
      this.disposed = true;
    }
  }
  class MockMaterial {
    constructor() {
      this.color = { lerp() {}, copy() {} };
      this.emissive = { copy() {} };
    }
    clone() {
      return new MockMaterial();
    }
    dispose() {}
  }
  class MockMesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.position = new MockVector3();
      this.rotation = { x: 0, y: 0, z: 0, copy() {} };
      this.scale = { x: 1, y: 1, z: 1, copy() {} };
      this.quaternion = new MockQuaternion();
      this.userData = {};
      this.name = '';
      this.children = [];
      this.parent = null;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => (c.traverse ? c.traverse(fn) : fn(c)));
    }
  }
  class MockGroup {
    constructor() {
      this.children = [];
      this.userData = {};
      this.name = '';
      this.visible = true;
      this.position = new MockVector3();
      this.rotation = { x: 0, y: 0, z: 0, copy() {} };
      this.scale = { x: 1, y: 1, z: 1, copy() {} };
      this.quaternion = new MockQuaternion();
      this.parent = null;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    remove(child) {
      this.children = this.children.filter((c) => c !== child);
      if (child) child.parent = null;
    }
    clear() {
      this.children.forEach((c) => (c.parent = null));
      this.children = [];
      return this;
    }
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => (c.traverse ? c.traverse(fn) : fn(c)));
    }
  }
  class MockLineSegments {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.userData = {};
    }
    traverse(fn) {
      fn(this);
    }
  }
  class MockShape {
    constructor() {
      this.holes = [];
    }
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  class MockPath {
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  return {
    Vector2: class {},
    Vector3: MockVector3,
    Quaternion: MockQuaternion,
    Group: MockGroup,
    Mesh: MockMesh,
    LineSegments: MockLineSegments,
    Shape: MockShape,
    Path: MockPath,
    Color: class {
      lerp() {}
      copy() {}
    },
    BoxGeometry: MockGeometry,
    ExtrudeGeometry: MockGeometry,
    CylinderGeometry: MockGeometry,
    BufferGeometry: MockGeometry,
    EdgesGeometry: MockGeometry,
    Float32BufferAttribute: class {},
    MeshStandardMaterial: MockMaterial,
    LineBasicMaterial: MockMaterial,
    ShapeUtils: { triangulateShape: () => [] },
    LessEqualDepth: 4,
    DoubleSide: 2,
    SRGBColorSpace: 'srgb',
  };
});

import { createPreviewSceneCache } from './previewSceneCache';
import * as THREE from 'three';

function createMockPalette() {
  const palette = {};
  ['wall', 'slab', 'door', 'window', 'windowFrame', 'outline'].forEach((key) => {
    palette[key] = new THREE.MeshStandardMaterial();
  });
  return palette;
}

function createDescriptor(id, kind = 'wall') {
  return {
    id,
    kind,
    materialKey: 'wall',
    geometry: 'box',
    metadata: { sourceId: id },
    center: { x: 0, y: 0 },
    baseElevation: 0,
    size: { x: 100, y: 100, z: 100 },
    rotation: 0,
  };
}

function createFloorDescriptor(floorId, sourceFloor, objects, visible = true) {
  return {
    floorId,
    name: floorId,
    elevation: 0,
    visible,
    objects,
    bounds: null,
    sourceKey: { floor: sourceFloor, trussSystems: [] },
  };
}

function createScene(floors) {
  return {
    activeFloorId: floors[0]?.floorId || null,
    visibleFloorIds: floors.filter((f) => f.visible).map((f) => f.floorId),
    floors,
    roofLayerId: null,
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100, minElevation: 0, maxElevation: 100 },
    groundLevel: 0,
    hasVisibleObjects: true,
  };
}

describe('createPreviewSceneCache', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  it('reuses THREE groups for floors whose source did not change', () => {
    const floorA = { id: 'fA' };
    const floorB = { id: 'fB' };

    const scene1 = createScene([
      createFloorDescriptor('fA', floorA, [createDescriptor('w1')]),
      createFloorDescriptor('fB', floorB, [createDescriptor('w2')]),
    ]);

    const cache = createPreviewSceneCache();
    const { root: root1 } = cache.build(scene1, palette);
    const groupA1 = root1.children.find((c) => c.name === 'floor-fA');
    const groupB1 = root1.children.find((c) => c.name === 'floor-fB');
    expect(groupA1).toBeDefined();
    expect(groupB1).toBeDefined();

    // Rebuild: floor A changed (new source object + new descriptors), floor B
    // untouched (same source reference => same descriptor sourceKey.floor).
    const floorA2 = { id: 'fA' }; // new reference simulates immutable update
    const scene2 = createScene([
      createFloorDescriptor('fA', floorA2, [createDescriptor('w1')]),
      createFloorDescriptor('fB', floorB, [createDescriptor('w2')]),
    ]);

    const { root: root2 } = cache.build(scene2, palette);
    const groupA2 = root2.children.find((c) => c.name === 'floor-fA');
    const groupB2 = root2.children.find((c) => c.name === 'floor-fB');

    // Same persistent root object across builds.
    expect(root2).toBe(root1);
    // Floor A rebuilt => new group reference.
    expect(groupA2).not.toBe(groupA1);
    // Floor B unchanged => SAME group reference reused (no re-triangulation).
    expect(groupB2).toBe(groupB1);
  });

  it('disposes geometries of rebuilt floors', () => {
    const floorA = { id: 'fA' };
    const scene1 = createScene([createFloorDescriptor('fA', floorA, [createDescriptor('w1')])]);

    const cache = createPreviewSceneCache();
    const { root: root1 } = cache.build(scene1, palette);
    const groupA1 = root1.children.find((c) => c.name === 'floor-fA');
    const disposeSpies = [];
    groupA1.traverse((node) => {
      if (node.geometry) disposeSpies.push(node.geometry);
    });
    expect(disposeSpies.length).toBeGreaterThan(0);

    const floorA2 = { id: 'fA' };
    const scene2 = createScene([createFloorDescriptor('fA', floorA2, [createDescriptor('w1')])]);
    cache.build(scene2, palette);

    // Every geometry from the old (rebuilt) floor group should be disposed.
    disposeSpies.forEach((geo) => expect(geo.disposed).toBe(true));
  });

  it('meshMap covers all descriptors and updates floorVisible on reuse', () => {
    const floorA = { id: 'fA' };
    const scene1 = createScene([createFloorDescriptor('fA', floorA, [createDescriptor('w1'), createDescriptor('w2')])]);

    const cache = createPreviewSceneCache();
    const { meshMap: meshMap1 } = cache.build(scene1, palette);
    expect(meshMap1.size).toBe(2);
    expect(meshMap1.get('w1').floorVisible).toBe(true);

    // Same source floor but now hidden — group is reused but visibility flips.
    const scene2 = createScene([
      createFloorDescriptor('fA', floorA, [createDescriptor('w1'), createDescriptor('w2')], false),
    ]);
    const { root, meshMap: meshMap2 } = cache.build(scene2, palette);
    const groupA = root.children.find((c) => c.name === 'floor-fA');
    expect(groupA.visible).toBe(false);
    expect(meshMap2.get('w1').floorVisible).toBe(false);
  });

  it('removes floors that disappear from the scene', () => {
    const floorA = { id: 'fA' };
    const floorB = { id: 'fB' };
    const scene1 = createScene([
      createFloorDescriptor('fA', floorA, [createDescriptor('w1')]),
      createFloorDescriptor('fB', floorB, [createDescriptor('w2')]),
    ]);

    const cache = createPreviewSceneCache();
    const { root } = cache.build(scene1, palette);
    expect(root.children.length).toBe(2);

    const scene2 = createScene([createFloorDescriptor('fA', floorA, [createDescriptor('w1')])]);
    cache.build(scene2, palette);
    expect(root.children.length).toBe(1);
    expect(root.children[0].name).toBe('floor-fA');
  });
});
