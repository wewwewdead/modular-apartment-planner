import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock THREE.js — we test logic, not WebGL
vi.mock('three', () => {
  class MockColor {
    constructor(hex) {
      this.hex = hex;
    }
    lerp() {
      return this;
    }
    copy() {
      return this;
    }
  }

  class MockVector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    addVectors(a, b) {
      this.x = a.x + b.x;
      this.y = a.y + b.y;
      this.z = a.z + b.z;
      return this;
    }
    subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    clone() {
      return new MockVector3(this.x, this.y, this.z);
    }
    normalize() {
      return this;
    }
    length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
  }

  class MockVector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
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
    dispose() {}
  }

  class MockMaterial {
    constructor(props = {}) {
      this.color = props.color ? new MockColor(props.color) : new MockColor(0);
      this.emissive = new MockColor(0);
      this.emissiveIntensity = 0;
      this.transparent = props.transparent || false;
      this.opacity = props.opacity || 1;
      this.depthFunc = null;
    }
    clone() {
      const c = new MockMaterial();
      c.color = new MockColor(this.color.hex);
      c.emissive = new MockColor(this.emissive.hex);
      c.transparent = this.transparent;
      c.opacity = this.opacity;
      return c;
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
      this.castShadow = false;
      this.receiveShadow = false;
      this.renderOrder = 0;
      this.userData = {};
      this.name = '';
      this.children = [];
      this.isMesh = true;
      this.parent = null;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => c.traverse?.(fn) || fn(c));
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
      this.renderOrder = 0;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => c.traverse?.(fn) || fn(c));
    }
  }

  class MockLineSegments {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.isLineSegments = true;
      this.userData = {};
      this.renderOrder = 0;
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
    Color: MockColor,
    Vector2: MockVector2,
    Vector3: MockVector3,
    Quaternion: MockQuaternion,
    Group: MockGroup,
    Mesh: MockMesh,
    LineSegments: MockLineSegments,
    Shape: MockShape,
    Path: MockPath,
    BoxGeometry: MockGeometry,
    ExtrudeGeometry: MockGeometry,
    CylinderGeometry: MockGeometry,
    BufferGeometry: MockGeometry,
    EdgesGeometry: MockGeometry,
    Float32BufferAttribute: class {},
    MeshStandardMaterial: MockMaterial,
    LineBasicMaterial: MockMaterial,
    ShapeUtils: { triangulateShape: () => [] },
    MOUSE: { ROTATE: 0, PAN: 2 },
    LessEqualDepth: 4,
    DoubleSide: 2,
    SRGBColorSpace: 'srgb',
  };
});

import { buildPreviewObjectRoot, buildSelectionOverlay } from './buildPreviewObjects';
import * as THREE from 'three';

function createMockPalette() {
  const palette = {};
  const keys = [
    'wall',
    'slab',
    'roof',
    'column',
    'beam',
    'stair',
    'landing',
    'door',
    'window',
    'windowFrame',
    'outline',
    'fixture_kitchenTop',
    'fixture_toilet',
    'fixture_lavatory',
    'fixture_table',
    'fixture_tv',
    'fixture_sofa',
    'fixture_bed',
    'fixtureAccentDark',
    'fixtureAccentMetal',
    'fixtureAccentCeramic',
    'fixtureAccentWood',
    'fixtureAccentFabric',
    'railing_handrail',
    'railing_glass',
    'railing_guardrail',
    'parapet',
    'roofOpening',
    'trussChord',
    'trussWeb',
    'trussPurlin',
    'trussChord_metal',
    'trussWeb_metal',
    'trussPurlin_metal',
  ];
  for (const key of keys) {
    palette[key] = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  }
  return palette;
}

function createDescriptor(id, kind, materialKey = 'wall', geometry = 'box', metadata = {}) {
  return {
    id,
    kind,
    materialKey,
    geometry,
    metadata,
    center: { x: 0, y: 0 },
    baseElevation: 0,
    size: { x: 100, y: 100, z: 100 },
    rotation: 0,
  };
}

function createSceneDescriptor(floors) {
  return {
    activeFloorId: floors[0]?.floorId || null,
    visibleFloorIds: floors.filter((f) => f.visible).map((f) => f.floorId),
    floors,
    roofLayerId: null,
    bounds: { minX: 0, maxX: 10000, minY: 0, maxY: 10000, minElevation: 0, maxElevation: 3000 },
    groundLevel: 0,
    hasVisibleObjects: true,
  };
}

describe('buildPreviewObjectRoot', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  it('returns root Group and meshMap', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall')],
      },
    ]);

    const { root, meshMap } = buildPreviewObjectRoot(scene, palette);
    expect(root).toBeDefined();
    expect(root.name).toBe('preview-root');
    expect(meshMap).toBeInstanceOf(Map);
  });

  it('meshMap contains entry for each descriptor', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall'), createDescriptor('w2', 'wall'), createDescriptor('d1', 'door')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    expect(meshMap.size).toBe(3);
    expect(meshMap.has('w1')).toBe(true);
    expect(meshMap.has('w2')).toBe(true);
    expect(meshMap.has('d1')).toBe(true);
  });

  it('meshMap entries store descriptor and materialKey', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall', 'wall')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const entry = meshMap.get('w1');
    expect(entry.descriptor.kind).toBe('wall');
    expect(entry.materialKey).toBe('wall');
    expect(entry.object).toBeDefined();
  });

  it('uses shared material references (no cloning)', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall', 'wall'), createDescriptor('w2', 'wall', 'wall')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const obj1 = meshMap.get('w1').object;
    const obj2 = meshMap.get('w2').object;
    // Both meshes should use the same material reference (not cloned)
    expect(obj1.material).toBe(obj2.material);
    expect(obj1.material).toBe(palette.wall);
  });

  it('stores floorVisible flag in meshMap entries', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall')],
      },
      {
        floorId: 'f2',
        name: 'Upper',
        elevation: 3000,
        visible: false,
        objects: [createDescriptor('w2', 'wall')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    expect(meshMap.get('w1').floorVisible).toBe(true);
    expect(meshMap.get('w2').floorVisible).toBe(false);
  });

  it('assigns previewTarget metadata to objects', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall', 'wall', 'box', { sourceId: 'src1' })],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const obj = meshMap.get('w1').object;
    expect(obj.userData.previewTarget).toBeDefined();
    expect(obj.userData.previewTarget.kind).toBe('wall');
    expect(obj.userData.previewTarget.sourceId).toBe('src1');
  });
});

describe('buildSelectionOverlay', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  it('returns null when no selection', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: null, selectedType: null }, palette);
    expect(overlay).toBeNull();
  });

  it('returns null when selected object not found', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall')],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'nonexistent', selectedType: 'wall' }, palette);
    expect(overlay).toBeNull();
  });

  it('creates overlay for matching selection', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall', 'wall', 'box', { sourceId: 'w1' })],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'w1', selectedType: 'wall' }, palette);
    expect(overlay).not.toBeNull();
    expect(overlay.name).toBe('selection-overlay');
    expect(overlay.children.length).toBe(1);
  });

  it('skips objects on hidden floors', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: false,
        objects: [createDescriptor('w1', 'wall', 'wall', 'box', { sourceId: 'w1' })],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'w1', selectedType: 'wall' }, palette);
    expect(overlay).toBeNull();
  });

  it('creates multiple overlays for truss system selection', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [
          createDescriptor('tc1', 'trussChord', 'wall', 'box', { trussSystemId: 'ts1', sourceId: 'tc1' }),
          createDescriptor('tc2', 'trussChord', 'wall', 'box', { trussSystemId: 'ts1', sourceId: 'tc2' }),
          createDescriptor('tw1', 'trussWeb', 'wall', 'box', { trussSystemId: 'ts1', sourceId: 'tw1' }),
          createDescriptor('other', 'wall', 'wall', 'box', { sourceId: 'other' }),
        ],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'ts1', selectedType: 'trussSystem' }, palette);
    expect(overlay).not.toBeNull();
    // Should match all 3 truss members, not the wall
    expect(overlay.children.length).toBe(3);
  });

  it('overlay materials are clones (not shared)', () => {
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall', 'wall', 'box', { sourceId: 'w1' })],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'w1', selectedType: 'wall' }, palette);
    // The overlay mesh material should be a clone, not the original palette material
    const overlayMesh = overlay.children[0];
    expect(overlayMesh.material).not.toBe(palette.wall);
  });
});
