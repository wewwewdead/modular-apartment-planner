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
      this.renderOrder = 0;
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
  readAssemblyPart,
} from './buildPreviewObjects';
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

  function buildFloor(objects) {
    return buildPreviewObjectRoot(
      createSceneDescriptor([{ floorId: 'f1', name: 'Ground', elevation: 0, visible: true, objects }]),
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

  it('caps the shadow casters per floor, keeping the brightest', () => {
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
