import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock THREE.js — we test logic, not WebGL
vi.mock('three', () => {
  class MockColor {
    constructor(hex, green, blue) {
      this.hex = hex;
      // Three accepts either a packed hex or three channels; the luminaire
      // materials are built from a lamp's measured RGB, so keep both readings.
      if (green !== undefined) {
        this.r = hex;
        this.g = green;
        this.b = blue;
      }
    }
    lerp() {
      return this;
    }
    copy(other) {
      // Recorded, not ignored: the selection accent is asserted through it.
      if (other && 'hex' in other) this.hex = other.hex;
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
      this.emissive = props.emissive ? new MockColor(props.emissive) : new MockColor(0);
      this.emissiveIntensity = props.emissiveIntensity ?? 0;
      this.transparent = props.transparent || false;
      this.opacity = props.opacity || 1;
      this.depthFunc = null;
      this.userData = {};
      this.disposed = false;
    }
    clone() {
      const c = new MockMaterial();
      c.color = new MockColor(this.color.hex);
      c.emissive = new MockColor(this.emissive.hex);
      c.transparent = this.transparent;
      c.opacity = this.opacity;
      return c;
    }
    dispose() {
      this.disposed = true;
    }
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
      // A built world is frozen (see `staticMatrices`), so every node it holds
      // has to answer the two calls that freezing is made of.
      this.matrixAutoUpdate = true;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    updateMatrix() {}
    updateMatrixWorld() {}
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
      this.renderOrder = 0;
      this.matrixAutoUpdate = true;
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    updateMatrix() {}
    updateMatrixWorld() {}
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => (c.traverse ? c.traverse(fn) : fn(c)));
    }
  }

  class MockLineSegments {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.isLineSegments = true;
      this.userData = {};
      this.renderOrder = 0;
      // Box outlines are one shared unit geometry sized by the object's own
      // scale, so a line segment now has one.
      this.scale = { x: 1, y: 1, z: 1, set() {} };
      this.matrixAutoUpdate = true;
      this.children = [];
    }
    updateMatrix() {}
    updateMatrixWorld() {}
    traverse(fn) {
      fn(this);
    }
  }

  // Lights are Object3Ds with a shadow attached: enough of one to record what
  // the builders configure, and to be traversed and disposed like any other node.
  class MockLight {
    constructor(color, intensity = 0, distance = 0) {
      this.color = color;
      this.intensity = intensity;
      this.distance = distance;
      this.decay = 1;
      this.position = new MockVector3();
      this.userData = {};
      this.castShadow = false;
      this.visible = true;
      this.isLight = true;
      this.children = [];
      this.parent = null;
      this.disposed = false;
      this.matrixAutoUpdate = true;
      this.shadow = {
        mapSize: {
          x: 0,
          y: 0,
          set(width, height) {
            this.x = width;
            this.y = height;
          },
        },
        camera: { near: 0, far: 0 },
        bias: 0,
        normalBias: 0,
        autoUpdate: true,
        needsUpdate: false,
      };
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    updateMatrix() {}
    updateMatrixWorld() {}
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => (c.traverse ? c.traverse(fn) : fn(c)));
    }
    dispose() {
      this.disposed = true;
    }
  }

  class MockPointLight extends MockLight {
    constructor(color, intensity, distance, decay) {
      super(color, intensity, distance);
      this.decay = decay ?? 1;
      this.isPointLight = true;
    }
  }

  class MockSpotLight extends MockLight {
    constructor(color, intensity, distance, angle, penumbra, decay) {
      super(color, intensity, distance);
      this.angle = angle;
      this.penumbra = penumbra;
      this.decay = decay ?? 1;
      this.isSpotLight = true;
      this.target = new MockGroup();
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
    PointLight: MockPointLight,
    SpotLight: MockSpotLight,
    Shape: MockShape,
    Path: MockPath,
    BoxGeometry: MockGeometry,
    ExtrudeGeometry: MockGeometry,
    CylinderGeometry: MockGeometry,
    SphereGeometry: MockGeometry,
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

import {
  MAX_FIXTURE_SHADOW_LIGHTS,
  SELECTION_ACCENTS,
  buildPreviewObjectRoot,
  buildSelectionOverlay,
  ensureOutlines,
  readAssemblyPart,
} from './buildPreviewObjects';
import { MAX_ACTIVE_FIXTURE_LIGHTS } from './previewPerf';
import { disposeScene } from './disposeScene';
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
    'electricalPlate',
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
    'ceilingLuminaire',
    'ceilingOpeningTrim',
    'ceilingOpeningHousing',
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

  it('builds a traced vertical wall-panel extrusion with cut holes', () => {
    const panel = {
      ...createDescriptor('panel-1', 'wall', 'wall', 'wallPanel'),
      outline: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1200 },
        { x: 0, y: 900 },
      ],
      holes: [
        [
          { x: 200, y: 200 },
          { x: 400, y: 200 },
          { x: 400, y: 400 },
          { x: 200, y: 400 },
        ],
      ],
      origin: { x: 10, y: 20 },
      baseElevation: 100,
      depth: 6,
      rotation: 0.5,
    };
    const scene = createSceneDescriptor([
      { floorId: 'f1', name: 'Ground', elevation: 0, visible: true, objects: [panel] },
    ]);

    const object = buildPreviewObjectRoot(scene, palette).meshMap.get('panel-1').object;

    expect(object.position).toMatchObject({ x: 10, y: 100, z: 20 });
    expect(object.rotation.y).toBe(-0.5);
  });

  it('builds per-type electrical device groups with details on the mounted face', () => {
    const device = (id, deviceType, faceSign) => ({
      ...createDescriptor(id, 'electricalDevice', 'electricalPlate', 'electricalDevice'),
      size: { x: 100, y: 120, z: 40 },
      deviceType,
      faceSign,
    });
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [
          device('e-outlet', 'outlet', 1),
          device('e-outlet-flip', 'outlet', -1),
          device('e-switch', 'switch', 1),
          device('e-gfci', 'outlet-gfci', 1),
        ],
      },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);

    // outlet: plate + two socket cylinders; switch: plate + tilted toggle;
    // gfci: plate + decora insert + 2 sockets + 2 buttons — types are distinct
    const outlet = meshMap.get('e-outlet').object;
    const switchDev = meshMap.get('e-switch').object;
    const gfci = meshMap.get('e-gfci').object;
    expect(outlet.children).toHaveLength(3);
    expect(switchDev.children).toHaveLength(2);
    expect(gfci.children).toHaveLength(6);
    expect(switchDev.children[1].rotation.x).not.toBe(0);

    // details sit proud of the plate on the mounted face, flipping with side
    expect(outlet.children[1].position.z).toBeGreaterThan(0);
    const flipped = meshMap.get('e-outlet-flip').object;
    expect(flipped.children[1].position.z).toBeLessThan(0);
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

  it('rakes stair-attached railings along the slope with vertical balusters', () => {
    const raked = {
      ...createDescriptor('r1', 'railing', 'railing_handrail', 'railing', { sourceId: 'r1' }),
      railingType: 'handrail',
      size: { x: 2500, y: 1000, z: 50 },
      slopeRise: 1575,
      baseElevation: 962.5,
    };
    const flat = {
      ...createDescriptor('r2', 'railing', 'railing_handrail', 'railing', { sourceId: 'r2' }),
      railingType: 'handrail',
      size: { x: 2500, y: 1000, z: 50 },
    };
    const scene = createSceneDescriptor([
      { floorId: 'f1', name: 'Ground', elevation: 0, visible: true, objects: [raked, flat] },
    ]);

    const { meshMap } = buildPreviewObjectRoot(scene, palette);

    const rakedMeshes = meshMap.get('r1').object.children.filter((child) => child.isMesh);
    const [topRail, ...balusters] = rakedMeshes;
    expect(topRail.rotation.z).toBeCloseTo(Math.atan2(1575, 2500), 5);
    // Baluster feet climb the pitch line: last one sits a full rise above the first
    const firstY = balusters[0].position.y;
    const lastY = balusters[balusters.length - 1].position.y;
    expect(lastY - firstY).toBeCloseTo(1575, 5);

    const flatMeshes = meshMap.get('r2').object.children.filter((child) => child.isMesh);
    expect(flatMeshes[0].rotation.z).toBe(0);
    expect(flatMeshes[1].position.y).toBe(flatMeshes[flatMeshes.length - 1].position.y);
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

/**
 * Inside a wall or ceiling assembly editor the preview highlights the piece of
 * material the drawing has selected, not the wall it belongs to — and it does it
 * in the editor's own orange rather than the plan's green, so the two panes read
 * as one selection.
 */
describe('assembly part selection', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  const boardsAndFraming = () =>
    createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [
          createDescriptor('w1:int:P1:3d', 'wall', 'wall', 'box', {
            sourceId: 'w1',
            wallDetailKind: 'panel',
            wallDetailElementId: 'P1',
            assemblySide: 'interior',
          }),
          createDescriptor('w1:int:P2:3d', 'wall', 'wall', 'box', {
            sourceId: 'w1',
            wallDetailKind: 'panel',
            wallDetailElementId: 'P2',
            assemblySide: 'interior',
          }),
          // Same board id on the far face: a different piece of material.
          createDescriptor('w1:ext:P1:3d', 'wall', 'wall', 'box', {
            sourceId: 'w1',
            wallDetailKind: 'panel',
            wallDetailElementId: 'P1',
            assemblySide: 'exterior',
          }),
          createDescriptor('w1:stud:3d', 'wall', 'wall', 'box', {
            sourceId: 'w1',
            wallDetailKind: 'framing',
            wallDetailElementId: 'S1',
            assemblySide: 'core',
          }),
        ],
      },
    ]);

  it('lights one board of one face, not every board of the wall', () => {
    const { meshMap } = buildPreviewObjectRoot(boardsAndFraming(), palette);

    const overlay = buildSelectionOverlay(
      meshMap,
      { part: { kind: 'panel', id: 'P1', side: 'interior' } },
      palette,
      'assembly',
    );

    expect(overlay).not.toBeNull();
    expect(overlay.children.length).toBe(1);
  });

  it('answers for framing whichever face is being drawn — the core has no side', () => {
    const { meshMap } = buildPreviewObjectRoot(boardsAndFraming(), palette);

    for (const side of ['interior', 'exterior']) {
      const overlay = buildSelectionOverlay(
        meshMap,
        { part: { kind: 'framing', id: 'S1', side } },
        palette,
        'assembly',
      );
      expect(overlay?.children.length).toBe(1);
    }
  });

  it('ignores a part id that belongs to another kind of piece', () => {
    const { meshMap } = buildPreviewObjectRoot(boardsAndFraming(), palette);

    // A screw called P1 is not the board called P1.
    const overlay = buildSelectionOverlay(
      meshMap,
      { part: { kind: 'fastener', id: 'P1', side: 'interior' } },
      palette,
      'assembly',
    );
    expect(overlay).toBeNull();
  });

  it('tints orange for an assembly editor and green for the plan', () => {
    const { meshMap } = buildPreviewObjectRoot(boardsAndFraming(), palette);

    const assembly = buildSelectionOverlay(
      meshMap,
      { part: { kind: 'panel', id: 'P1', side: 'interior' } },
      palette,
      'assembly',
    );
    expect(assembly.children[0].material.emissive.hex).toBe(SELECTION_ACCENTS.assembly.emissive.hex);

    const plan = buildSelectionOverlay(meshMap, { selectedId: 'w1', selectedType: 'wall' }, palette);
    expect(plan.children[0].material.emissive.hex).toBe(SELECTION_ACCENTS.plan.emissive.hex);
    expect(SELECTION_ACCENTS.assembly.emissive.hex).not.toBe(SELECTION_ACCENTS.plan.emissive.hex);
  });

  it('makes each board its own pick target, so a click can name one', () => {
    const { meshMap } = buildPreviewObjectRoot(boardsAndFraming(), palette);

    const parts = [...meshMap.values()].map((entry) => {
      let node = entry.object;
      while (node && !node.userData?.previewTarget) node = node.children?.[0];
      return node?.userData.previewTarget.part;
    });

    expect(parts).toContainEqual({ kind: 'panel', id: 'P1', side: 'interior' });
    expect(parts).toContainEqual({ kind: 'panel', id: 'P1', side: 'exterior' });
    expect(parts).toContainEqual({ kind: 'framing', id: 'S1', side: 'core' });
  });
});

/**
 * A luminaire arrives as two descriptors — the fitting and the light — and this
 * is where they become a THREE group of meshes and a real light with a shadow
 * budget to answer to.
 */
describe('ceiling luminaires', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  const fixtureMetadata = (elementId) => ({
    sourceId: 'ceiling_1',
    ceilingId: 'ceiling_1',
    floorId: 'f1',
    ceilingDetailKind: 'fixture',
    ceilingDetailElementId: elementId,
  });

  function lightDescriptor(id, overrides = {}) {
    return {
      id: `${id}:light`,
      kind: 'ceiling',
      geometry: 'ceilingLightSource',
      lightType: 'point',
      position: { x: 2000, y: 2675, z: 2500 },
      aim: { x: 0, y: -1, z: 0 },
      color: { r: 1, g: 0.78, b: 0.55 },
      intensity: 63.66 * 1e6,
      angleRad: null,
      penumbra: 0.35,
      castShadow: true,
      distanceMm: 0,
      metadata: fixtureMetadata(id),
      ...overrides,
    };
  }

  function housingDescriptor(id, overrides = {}) {
    return {
      id: `${id}:fixture`,
      kind: 'ceiling',
      geometry: 'ceilingLightFixture',
      fixtureType: 'recessed_can_6',
      aperture: { radiusMm: 95 },
      bulb: { diameterMm: 95, lengthMm: 136, count: 1, flat: false },
      dropMm: 0,
      aim: { x: 0, y: -1, z: 0 },
      emissive: { color: { r: 1, g: 0.78, b: 0.55 } },
      center: { x: 2000, y: 2500 },
      baseElevation: 2700,
      rotation: 0,
      materialKey: 'ceilingLuminaire',
      metadata: { ...fixtureMetadata(id), materialKey: 'ceilingLuminaire' },
      ...overrides,
    };
  }

  function bounceDescriptor(id, overrides = {}) {
    return {
      id,
      kind: 'ceiling',
      geometry: 'ceilingLightSource',
      role: 'bounce',
      lightType: 'point',
      position: { x: 2000, y: 2700, z: 2500 },
      aim: { x: 0, y: -1, z: 0 },
      color: { r: 1, g: 0.78, b: 0.55 },
      intensity: 7e5,
      angleRad: null,
      penumbra: 0,
      castShadow: false,
      distanceMm: 0,
      metadata: { sourceId: 'ceiling_1', ceilingId: 'ceiling_1', floorId: 'f1', ceilingDetailKind: 'bounce' },
      ...overrides,
    };
  }

  function buildFloor(objects) {
    return buildFloors([objects]);
  }

  /** One scene, several floors — which is the only scale the budgets are set at. */
  function buildFloors(floorObjects, visibility = []) {
    return buildPreviewObjectRoot(
      createSceneDescriptor(
        floorObjects.map((objects, index) => ({
          floorId: `f${index + 1}`,
          name: `Level ${index + 1}`,
          elevation: index * 3000,
          visible: visibility[index] ?? true,
          objects,
        })),
      ),
      palette,
    );
  }

  function findFixtureLight(object) {
    let found = null;
    object.traverse((node) => {
      if (node.userData?.isFixtureLight) found = node;
    });
    return found;
  }

  function findLensMaterials(object) {
    const materials = [];
    object.traverse((node) => {
      if (node.material?.userData?.fixtureLens && !materials.includes(node.material)) materials.push(node.material);
    });
    return materials;
  }

  it('builds a point light with the intensity the descriptor asked for', () => {
    const { meshMap } = buildFloor([lightDescriptor('lt_1')]);
    const light = findFixtureLight(meshMap.get('lt_1:light').object);

    expect(light.isPointLight).toBe(true);
    // Already candela × 1e6 when it arrived: nothing here rescales it.
    expect(light.intensity).toBe(63.66 * 1e6);
    expect(light.decay).toBe(2);
    expect(light.distance).toBe(0);
    expect(light.position).toMatchObject({ x: 2000, y: 2675, z: 2500 });
    expect(light.userData.isFixtureLight).toBe(true);
    // The photometric figure is kept alongside the live one: the viewport scales
    // a lamp for the rig it is being seen under, and it has to rescale from the
    // descriptor's own number every time rather than from last frame's result.
    expect(light.userData.baseIntensity).toBe(63.66 * 1e6);
    // Millimetre-sized shadow settings, rendered once and then left alone.
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize).toMatchObject({ x: 1024, y: 1024 });
    expect(light.shadow.camera).toMatchObject({ near: 50, far: 30000 });
    expect(light.shadow.bias).toBe(-0.0005);
    expect(light.shadow.normalBias).toBe(20);
    expect(light.shadow.autoUpdate).toBe(false);
    expect(light.shadow.needsUpdate).toBe(true);
  });

  it('gives a spot its cone and a target to point at', () => {
    const { meshMap } = buildFloor([
      lightDescriptor('lt_spot', {
        lightType: 'spot',
        angleRad: Math.PI / 3,
        aim: { x: 1, y: 0, z: 0 },
      }),
    ]);
    const group = meshMap.get('lt_spot:light').object;
    const light = findFixtureLight(group);

    expect(light.isSpotLight).toBe(true);
    expect(light.angle).toBeCloseTo(Math.PI / 3, 9);
    expect(light.penumbra).toBe(0.35);
    // The target travels with the light rather than sitting loose in the scene.
    expect(group.children).toContain(light.target);
    expect(light.target.position).toMatchObject({ x: 4000, y: 2675, z: 2500 });
  });

  it('leaves a light with no shadow alone when the fixture asked for none', () => {
    const { meshMap } = buildFloor([lightDescriptor('lt_dark', { castShadow: false })]);
    const light = findFixtureLight(meshMap.get('lt_dark:light').object);

    expect(light.castShadow).toBe(false);
    expect(light.shadow.autoUpdate).toBe(true);
  });

  it('caps the shadow casters, keeping the brightest', () => {
    const count = MAX_FIXTURE_SHADOW_LIGHTS + 1;
    const objects = Array.from({ length: count }, (_, index) =>
      // Ascending brightness, so `lt_0` is the one that has to lose.
      lightDescriptor(`lt_${index}`, { intensity: (index + 1) * 1e6 }),
    );
    const { meshMap } = buildFloor(objects);

    const casting = objects.filter(
      (descriptor) => findFixtureLight(meshMap.get(descriptor.id).object).castShadow === true,
    );
    expect(casting).toHaveLength(MAX_FIXTURE_SHADOW_LIGHTS);
    expect(findFixtureLight(meshMap.get('lt_0:light').object).castShadow).toBe(false);
    // The descriptor still says what the user asked for; only the light was demoted.
    expect(meshMap.get('lt_0:light').descriptor.castShadow).toBe(true);
  });

  /**
   * The renderer charges for a shadow pass; it has never heard of a floor. A cap
   * spent per floor is therefore a cap spent as many times as the building has
   * storeys, which is what a two-storey lit project used to do — sixteen 1024²
   * maps beside the sun's own, for a budget written as eight.
   */
  it('spends the shadow budget once for the whole building, not once per floor', () => {
    const ground = Array.from({ length: MAX_FIXTURE_SHADOW_LIGHTS }, (_, index) =>
      lightDescriptor(`lt_g${index}`, { intensity: (index + 1) * 1e6 }),
    );
    const upper = Array.from({ length: MAX_FIXTURE_SHADOW_LIGHTS }, (_, index) =>
      lightDescriptor(`lt_u${index}`, { intensity: 100e6 + (index + 1) * 1e6 }),
    );
    const { meshMap } = buildFloors([ground, upper]);

    const casting = [...ground, ...upper].filter(
      (descriptor) => findFixtureLight(meshMap.get(descriptor.id).object).castShadow === true,
    );
    expect(casting).toHaveLength(MAX_FIXTURE_SHADOW_LIGHTS);
    // Every lamp upstairs outshines every lamp downstairs, so the upper floor
    // takes the whole budget rather than each floor helping itself to one.
    expect(casting.every((descriptor) => descriptor.id.startsWith('lt_u'))).toBe(true);
  });

  it('gives no budget to a floor that is not on screen', () => {
    // Brighter, and more of them than the budget holds — but hidden, so never in
    // the render list and never charged for.
    const hidden = Array.from({ length: MAX_FIXTURE_SHADOW_LIGHTS }, (_, index) =>
      lightDescriptor(`lt_h${index}`, { intensity: 9e6 }),
    );
    const shown = [lightDescriptor('lt_shown', { intensity: 1e6 })];
    const { meshMap } = buildFloors([shown, hidden], [true, false]);

    expect(findFixtureLight(meshMap.get('lt_shown:light').object).castShadow).toBe(true);
    expect(findFixtureLight(meshMap.get('lt_h0:light').object).castShadow).toBe(false);
  });

  it('keeps the brightest lamps alight and folds the rest into the room’s own fill', () => {
    const overflow = 3;
    const lamps = Array.from({ length: MAX_ACTIVE_FIXTURE_LIGHTS + overflow }, (_, index) =>
      lightDescriptor(`lt_${String(index).padStart(2, '0')}`, {
        intensity: (index + 1) * 1e6,
        castShadow: false,
        bounceLightId: 'ceiling_1:bounce:0.0',
        fillIntensity: 2e5,
      }),
    );
    const fill = bounceDescriptor('ceiling_1:bounce:0.0', { intensity: 7e5 });
    const { meshMap } = buildFloor([...lamps, fill]);

    const suppressed = lamps.filter((descriptor) => !findFixtureLight(meshMap.get(descriptor.id).object).visible);
    expect(suppressed.map((descriptor) => descriptor.id)).toEqual(['lt_00:light', 'lt_01:light', 'lt_02:light']);
    for (const descriptor of suppressed) {
      expect(findFixtureLight(meshMap.get(descriptor.id).object).userData.budgetSuppressed).toBe(true);
    }
    // The dimmest lamps lost their light, not their lumens: the same flux is in
    // the room, spread over the sphere instead of thrown through the beam.
    const fillLight = findFixtureLight(meshMap.get(fill.id).object);
    expect(fillLight.visible).toBe(true);
    expect(fillLight.userData.budgetSuppressed).toBe(false);
    expect(fillLight.userData.baseIntensity).toBeCloseTo(7e5 + overflow * 2e5, 6);
    expect(fillLight.intensity).toBeCloseTo(fillLight.userData.baseIntensity, 6);
  });

  it('does not compound the fold when the same scene is built again', () => {
    const lamps = Array.from({ length: MAX_ACTIVE_FIXTURE_LIGHTS + 1 }, (_, index) =>
      lightDescriptor(`lt_${String(index).padStart(2, '0')}`, {
        intensity: (index + 1) * 1e6,
        castShadow: false,
        bounceLightId: 'ceiling_1:bounce:0.0',
        fillIntensity: 4e5,
      }),
    );
    const fill = bounceDescriptor('ceiling_1:bounce:0.0', { intensity: 7e5 });

    const first = buildFloor([...lamps, fill]);
    const second = buildFloor([...lamps, fill]);
    const intensityOf = (built) => findFixtureLight(built.meshMap.get(fill.id).object).userData.baseIntensity;

    expect(intensityOf(first)).toBeCloseTo(7e5 + 4e5, 6);
    expect(intensityOf(second)).toBeCloseTo(intensityOf(first), 6);
  });

  it('never lets a suppressed lamp keep a shadow map', () => {
    const lamps = Array.from({ length: MAX_ACTIVE_FIXTURE_LIGHTS + 2 }, (_, index) =>
      lightDescriptor(`lt_${String(index).padStart(2, '0')}`, { intensity: (index + 1) * 1e6 }),
    );
    const { meshMap } = buildFloor(lamps);

    for (const descriptor of lamps) {
      const light = findFixtureLight(meshMap.get(descriptor.id).object);
      if (!light.visible) expect(light.castShadow).toBe(false);
    }
    const casting = lamps.filter((descriptor) => findFixtureLight(meshMap.get(descriptor.id).object).castShadow);
    expect(casting).toHaveLength(MAX_FIXTURE_SHADOW_LIGHTS);
  });

  it('breaks a tie on intensity by id, so the same lamps are demoted every build', () => {
    const objects = Array.from({ length: MAX_FIXTURE_SHADOW_LIGHTS + 2 }, (_, index) =>
      lightDescriptor(`lt_${String(index).padStart(2, '0')}`, { intensity: 5e6 }),
    );

    const first = buildFloor(objects);
    const second = buildFloor(objects);
    const demoted = (built) =>
      objects
        .filter((descriptor) => findFixtureLight(built.meshMap.get(descriptor.id).object).castShadow === false)
        .map((descriptor) => descriptor.id);

    expect(demoted(first)).toEqual(['lt_08:light', 'lt_09:light']);
    expect(demoted(second)).toEqual(demoted(first));
  });

  it('builds the fitting out of palette parts and one emissive material of its own', () => {
    const { meshMap } = buildFloor([housingDescriptor('lt_1')]);
    const object = meshMap.get('lt_1:fixture').object;

    expect(object.position).toMatchObject({ x: 2000, y: 2700, z: 2500 });

    const lenses = findLensMaterials(object);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].userData).toMatchObject({
      ownedByPreviewObject: true,
      fixtureLens: true,
      litEmissiveIntensity: 3,
    });
    expect(lenses[0].emissiveIntensity).toBe(3);
    // Housing parts come off the shared palette, uncloned.
    expect(object.children.some((child) => child.material === palette.ceilingOpeningTrim)).toBe(true);
  });

  it('draws every fixture type in the catalog rather than falling back to a box', () => {
    const types = [
      ['recessed_can_4', { radiusMm: 70 }],
      ['gimbal_recessed', { radiusMm: 70 }],
      ['wafer_led', { radiusMm: 89 }],
      ['surface_flush', { radiusMm: 165 }],
      ['semi_flush', { radiusMm: 177 }],
      ['cylinder_downlight', { radiusMm: 60 }],
      ['pendant', { radiusMm: 100 }],
      ['chandelier_5', { radiusMm: 275 }],
      ['track_head', { radiusMm: 37 }],
      ['troffer_2x4', { widthMm: 603, lengthMm: 1213 }],
    ];
    const objects = types.map(([fixtureType, aperture], index) =>
      housingDescriptor(`lt_${fixtureType}`, {
        fixtureType,
        aperture,
        dropMm: fixtureType === 'pendant' ? 900 : fixtureType === 'chandelier_5' ? 600 : 0,
        bulb: { diameterMm: 60, lengthMm: 110, count: fixtureType === 'chandelier_5' ? 5 : 1, flat: false },
        center: { x: index * 1000, y: 0 },
        aim: fixtureType === 'track_head' ? { x: 1, y: 0, z: 0 } : { x: 0, y: -1, z: 0 },
      }),
    );
    const { meshMap } = buildFloor(objects);

    for (const [fixtureType] of types) {
      const object = meshMap.get(`lt_${fixtureType}:fixture`).object;
      expect(object.children.length, fixtureType).toBeGreaterThan(1);
      expect(findLensMaterials(object), fixtureType).toHaveLength(1);
    }

    // Five candles, five glowing bulbs, one material between them.
    const chandelier = meshMap.get('lt_chandelier_5:fixture').object;
    const glowing = chandelier.children.filter((child) => child.material?.userData?.fixtureLens);
    expect(glowing).toHaveLength(5);
    for (const bulb of glowing) expect(bulb.castShadow).toBe(false);
  });

  it('names the fixture as an assembly part, so a click in 3D lands on it', () => {
    const descriptor = housingDescriptor('lt_1');
    expect(readAssemblyPart(descriptor)).toEqual({ kind: 'fixture', id: 'lt_1', side: null });

    const { meshMap } = buildFloor([descriptor, lightDescriptor('lt_1')]);
    for (const id of ['lt_1:fixture', 'lt_1:light']) {
      expect(meshMap.get(id).object.userData.previewTarget.part).toEqual({
        kind: 'fixture',
        id: 'lt_1',
        side: null,
      });
    }
  });

  it('keeps the selection overlay off the light, so selecting a lamp does not double it', () => {
    const { meshMap } = buildFloor([housingDescriptor('lt_1'), lightDescriptor('lt_1')]);

    const overlay = buildSelectionOverlay(meshMap, { part: { kind: 'fixture', id: 'lt_1' } }, palette, 'assembly');
    expect(overlay.children).toHaveLength(1);
    expect(findFixtureLight(overlay.children[0])).toBeNull();
  });
});

/**
 * Disposal is where the two kinds of material part company: the palette's are
 * shared by the whole scene and outlive any group, a luminaire's lens belongs to
 * the one object that built it. A light is a third case again — it owns a shadow
 * render target that nothing else will free.
 */
describe('disposeScene', () => {
  it('frees what an object owns and leaves the shared palette alone', () => {
    const palette = createMockPalette();
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [
          {
            id: 'lt_1:fixture',
            kind: 'ceiling',
            geometry: 'ceilingLightFixture',
            fixtureType: 'recessed_can_6',
            aperture: { radiusMm: 95 },
            bulb: { diameterMm: 95, lengthMm: 136, count: 1, flat: false },
            dropMm: 0,
            aim: { x: 0, y: -1, z: 0 },
            emissive: { color: { r: 1, g: 0.8, b: 0.6 } },
            center: { x: 0, y: 0 },
            baseElevation: 2700,
            rotation: 0,
            materialKey: 'ceilingLuminaire',
            metadata: { sourceId: 'c1', ceilingDetailKind: 'fixture', ceilingDetailElementId: 'lt_1' },
          },
          {
            id: 'lt_1:light',
            kind: 'ceiling',
            geometry: 'ceilingLightSource',
            lightType: 'point',
            position: { x: 0, y: 2675, z: 0 },
            aim: { x: 0, y: -1, z: 0 },
            color: { r: 1, g: 0.8, b: 0.6 },
            intensity: 1e6,
            angleRad: null,
            penumbra: 0.35,
            castShadow: true,
            distanceMm: 0,
            metadata: { sourceId: 'c1', ceilingDetailKind: 'fixture', ceilingDetailElementId: 'lt_1' },
          },
        ],
      },
    ]);

    const { root, meshMap } = buildPreviewObjectRoot(scene, palette);
    let lens = null;
    let light = null;
    meshMap.get('lt_1:fixture').object.traverse((node) => {
      if (node.material?.userData?.fixtureLens) lens = node.material;
    });
    meshMap.get('lt_1:light').object.traverse((node) => {
      if (node.isLight) light = node;
    });

    // The conservative call the scene cache makes on every rebuild.
    disposeScene(root, { disposeMaterials: false });

    expect(lens.disposed).toBe(true);
    expect(light.disposed).toBe(true);
    expect(palette.ceilingOpeningTrim.disposed).toBe(false);
    expect(palette.ceilingOpeningHousing.disposed).toBe(false);
  });
});

/**
 * The edge overlay is a drawing convention the Realistic style does not draw,
 * and it is the default — so a world built for it should not be cutting edges
 * for every stud and hanging a second object off every mesh to hold them. What
 * matters as much is that the switch back works: a style toggle that quietly
 * left the model without its outlines would be the same bug as one that never
 * built them.
 */
describe('edge overlay, built on demand', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  const countOutlines = (object) => {
    let total = 0;
    object.traverse((node) => {
      if (node.isLineSegments) total += 1;
    });
    return total;
  };

  function buildBox(outlinesEnabled) {
    palette.outlinesEnabled = outlinesEnabled;
    const scene = createSceneDescriptor([
      { floorId: 'f1', name: 'Ground', elevation: 0, visible: true, objects: [createDescriptor('w1', 'wall')] },
    ]);
    return buildPreviewObjectRoot(scene, palette);
  }

  it('cuts them for a style that draws them', () => {
    const { meshMap } = buildBox(true);
    expect(countOutlines(meshMap.get('w1').object)).toBe(1);
    expect(meshMap.get('w1').object.userData.wantsOutline).toBeUndefined();
  });

  it('skips them for a style that does not, and leaves a note that it did', () => {
    const { meshMap } = buildBox(false);
    expect(countOutlines(meshMap.get('w1').object)).toBe(0);
    expect(meshMap.get('w1').object.userData.wantsOutline).toBe(true);
  });

  it('cuts them later, from the same meshes, when the style switches back', () => {
    const { root, meshMap } = buildBox(false);
    palette.outlinesEnabled = true;

    expect(ensureOutlines(root, palette)).toBe(true);
    expect(countOutlines(meshMap.get('w1').object)).toBe(1);
    // The note is spent, so a second switch does not hang a second line on the
    // same mesh.
    expect(meshMap.get('w1').object.userData.wantsOutline).toBeUndefined();
    expect(ensureOutlines(root, palette)).toBe(false);
    expect(countOutlines(meshMap.get('w1').object)).toBe(1);
  });

  /**
   * The accent edge is part of the highlight rather than part of the drawing —
   * green round a selected wall, orange round a selected board — and it is shown
   * in both styles. So the overlay cuts its own lines whatever the palette says
   * about the model's.
   */
  it('always gives the selection overlay its accent edge', () => {
    const { meshMap } = buildBox(false);
    const overlay = buildSelectionOverlay(meshMap, { selectedId: 'w1', selectedType: 'wall' }, palette, 'plan');

    expect(overlay.children).toHaveLength(1);
    expect(countOutlines(overlay.children[0])).toBe(1);
  });
});

/**
 * A built world does not move, so three should not be re-deriving its matrices
 * sixty times a second — see `staticMatrices` for why the saving only exists if
 * the flag is off on every node rather than most of them.
 */
describe('static matrices', () => {
  it('freezes every node of the world it just built', () => {
    const palette = createMockPalette();
    const scene = createSceneDescriptor([
      {
        floorId: 'f1',
        name: 'Ground',
        elevation: 0,
        visible: true,
        objects: [createDescriptor('w1', 'wall'), createDescriptor('w2', 'wall')],
      },
    ]);

    const { root } = buildPreviewObjectRoot(scene, palette);
    const nodes = [];
    root.traverse((node) => nodes.push(node));

    expect(nodes.length).toBeGreaterThan(2);
    expect(nodes.filter((node) => node.matrixAutoUpdate !== false)).toEqual([]);
  });
});

/**
 * A door in the preview is a leaf with hardware on it, not a bare slab — the
 * knob is what makes it read as a door at all. The leaf keeps the door
 * material; the hardware comes off the shared metal accent, without shadows,
 * because doors are exempt from batching and every extra mesh is its own draw
 * call.
 */
describe('door objects', () => {
  let palette;

  beforeEach(() => {
    palette = createMockPalette();
  });

  function buildDoor(overrides = {}) {
    const descriptor = {
      id: 'door_1',
      kind: 'door',
      geometry: 'door',
      doorType: 'swing',
      openDirection: 'left',
      materialKey: 'door',
      metadata: { sourceId: 'door_1', floorId: 'f1' },
      center: { x: 1000, y: 0 },
      baseElevation: 0,
      size: { x: 900, y: 2100, z: 44 },
      rotation: 0,
      ...overrides,
    };
    const scene = createSceneDescriptor([
      { floorId: 'f1', name: 'Ground', elevation: 0, visible: true, objects: [descriptor] },
    ]);
    const { meshMap } = buildPreviewObjectRoot(scene, palette);
    return meshMap.get('door_1').object;
  }

  const hardwareOf = (object) => object.children.filter((child) => child.material === palette.fixtureAccentMetal);

  it('gives a swing door a knob on each face, at the latch edge, about a metre up', () => {
    const object = buildDoor();
    const hardware = hardwareOf(object);

    // Stem and head per face.
    expect(hardware).toHaveLength(4);
    for (const part of hardware) {
      expect(part.position.x).toBeCloseTo(450 - 75, 6);
      expect(part.position.y).toBeCloseTo(1020 - 2100 / 2, 6);
      expect(part.castShadow).toBe(false);
    }
    // Two on each side of the leaf.
    expect(hardware.filter((part) => part.position.z > 22)).toHaveLength(2);
    expect(hardware.filter((part) => part.position.z < -22)).toHaveLength(2);
    // The leaf itself is still the door slab.
    expect(object.children.some((child) => child.material === palette.door)).toBe(true);
  });

  it('pairs the knobs on the meeting stiles of a double door', () => {
    const object = buildDoor({ doorType: 'double', size: { x: 1800, y: 2100, z: 44 } });
    const hardware = hardwareOf(object);

    expect(hardware).toHaveLength(8);
    expect(hardware.filter((part) => part.position.x < 0)).toHaveLength(4);
    expect(hardware.filter((part) => part.position.x > 0)).toHaveLength(4);
    // And a seam where the leaves meet.
    expect(object.children.some((child) => child.material === palette.fixtureAccentDark)).toBe(true);
  });

  it('gives a sliding door a pull bar per face instead of a knob', () => {
    const object = buildDoor({ doorType: 'sliding' });
    const hardware = hardwareOf(object);

    expect(hardware).toHaveLength(2);
    expect(new Set(hardware.map((part) => Math.sign(part.position.z)))).toEqual(new Set([1, -1]));
  });

  it('keeps walk-through and picking intact: every part answers as the door', () => {
    const object = buildDoor();
    const kinds = new Set();
    object.traverse((node) => {
      if (node.userData?.previewTarget) kinds.add(node.userData.previewTarget.kind);
    });
    expect(kinds).toEqual(new Set(['door']));
  });
});
