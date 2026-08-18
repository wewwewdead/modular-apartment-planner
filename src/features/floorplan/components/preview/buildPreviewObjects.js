import * as THREE from 'three';
import {
  buildFloorBatchGroup,
  taggedBoxGeometry,
  taggedCylinderGeometry,
  unitOutlineGeometry,
} from './previewBatching';

/**
 * Two selection accents, because the two previews answer different questions.
 * On the floorplan a highlight means "this is the object you picked" — green,
 * the selection colour the rest of the app uses. Inside a wall or ceiling
 * assembly editor it means "this is the piece of material you picked", and that
 * is orange, the same #ffb45c the drawing beside it already strokes a selected
 * board with. One editor, one selection colour, in both of its panes.
 */
export const SELECTION_ACCENTS = Object.freeze({
  plan: Object.freeze({
    surface: new THREE.Color(0xcdeedd),
    emissive: new THREE.Color(0x0f8f74),
    outline: new THREE.Color(0x0f8f74),
  }),
  assembly: Object.freeze({
    surface: new THREE.Color(0xffe0bd),
    emissive: new THREE.Color(0xc4661a),
    outline: new THREE.Color(0xffb45c),
  }),
});

function planPointToWorld(point, elevation = 0) {
  return new THREE.Vector3(point.x, elevation, point.y);
}

function planAngleToWorldRotation(angle = 0) {
  return -angle;
}

function createShape(outline, holes = []) {
  const shape = new THREE.Shape();
  outline.forEach((point, index) => {
    if (index === 0) {
      // Flip plan Y here so the rotated extrusion preserves the blueprint's handedness.
      shape.moveTo(point.x, -point.y);
      return;
    }
    shape.lineTo(point.x, -point.y);
  });
  shape.closePath();

  holes.forEach((hole) => {
    if (!hole?.length) return;
    const path = new THREE.Path();
    hole.forEach((point, index) => {
      if (index === 0) {
        path.moveTo(point.x, -point.y);
        return;
      }
      path.lineTo(point.x, -point.y);
    });
    path.closePath();
    shape.holes.push(path);
  });

  return shape;
}

function createVerticalShape(outline, holes = []) {
  const shape = new THREE.Shape();
  outline.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();

  holes.forEach((hole) => {
    if (!hole?.length) return;
    const path = new THREE.Path();
    hole.forEach((point, index) => {
      if (index === 0) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
    });
    path.closePath();
    shape.holes.push(path);
  });
  return shape;
}

function applySelectedSurfaceStyle(material, accent) {
  if (material.color) {
    material.color.lerp(accent.surface, 0.36);
  }
  if ('emissive' in material && material.emissive) {
    material.emissive.copy(accent.emissive);
    material.emissiveIntensity = material.transparent ? 0.12 : 0.22;
  }
  if (material.transparent) {
    material.opacity = Math.min(0.82, Math.max(material.opacity ?? 1, 0.58));
  }
}

// ── Shared material helpers ──
// Non-selected meshes use the palette material directly (no clone).
// Only selection overlays clone for highlight styling.

function createMesh(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addOutline(object3d, materialPalette) {
  const geometry = object3d.geometry;
  if (!geometry) return;

  // A box's twelve edges are the unit box's twelve edges scaled, so the whole
  // model draws one set of them rather than measuring its own for every stud.
  // `EdgesGeometry` is the most expensive thing a rebuild does per mesh — it
  // walks the triangles looking for shared edges — and on a building made of
  // boxes that is nearly all of it.
  const unit = geometry.userData?.batchUnit;
  if (unit?.key === 'box') {
    const outline = new THREE.LineSegments(unitOutlineGeometry(unit.key), materialPalette.outline);
    outline.scale.set(unit.scaleX, unit.scaleY, unit.scaleZ);
    object3d.add(outline);
    return;
  }

  const edges = new THREE.EdgesGeometry(geometry, 20);
  const outline = new THREE.LineSegments(edges, materialPalette.outline);
  object3d.add(outline);
}

function createPrismObject(descriptor, materialPalette) {
  const geometry = new THREE.ExtrudeGeometry(createShape(descriptor.outline, descriptor.holes), {
    depth: descriptor.height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, descriptor.baseElevation, 0);

  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  addOutline(mesh, materialPalette);
  return mesh;
}

function createRoofMeshObject(descriptor, materialPalette) {
  const positions = [];

  function pushVertex(point, elevation) {
    positions.push(point.x, elevation, point.y);
  }

  function pushTriangle(a, b, c, surface) {
    pushVertex(a, surface === 'top' ? a.topElevation : a.bottomElevation);
    pushVertex(b, surface === 'top' ? b.topElevation : b.bottomElevation);
    pushVertex(c, surface === 'top' ? c.topElevation : c.bottomElevation);
  }

  function pushQuad(a, b) {
    pushVertex(a, a.topElevation);
    pushVertex(b, b.topElevation);
    pushVertex(b, b.bottomElevation);

    pushVertex(a, a.topElevation);
    pushVertex(b, b.bottomElevation);
    pushVertex(a, a.bottomElevation);
  }

  for (const surface of descriptor.surfaces || []) {
    const outline = surface.outline || [];
    if (outline.length < 3) continue;

    const contour = outline.map((point) => new THREE.Vector2(point.x, -point.y));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);

    for (const face of faces) {
      const a = outline[face[0]];
      const b = outline[face[1]];
      const c = outline[face[2]];
      pushTriangle(a, b, c, 'top');
      pushTriangle(c, b, a, 'bottom');
    }
  }

  const outerBoundary = descriptor.outerBoundary || [];
  for (let index = 0; index < outerBoundary.length; index += 1) {
    const start = outerBoundary[index];
    const end = outerBoundary[(index + 1) % outerBoundary.length];
    pushQuad(start, end);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  addOutline(mesh, materialPalette);
  return mesh;
}

function createBoxObject(descriptor, materialPalette) {
  const geometry = taggedBoxGeometry(
    Math.max(descriptor.size.x, 1),
    Math.max(descriptor.size.y, 1),
    Math.max(descriptor.size.z, 1),
  );
  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  const center = planPointToWorld(descriptor.center, descriptor.baseElevation + descriptor.size.y / 2);
  mesh.position.copy(center);
  mesh.rotation.y = planAngleToWorldRotation(descriptor.rotation);
  addOutline(mesh, materialPalette);
  return mesh;
}

/**
 * A screw head, tapering away from whoever is looking at it: out of the wall
 * face for a wall screw, down out of the boards for a ceiling one (`axis:
 * 'vertical'`, driven up into the furring).
 *
 * Ceiling heads carry no outline. A ceiling holds an order of magnitude more
 * screws than a wall face does — several hundred on an ordinary room — and an
 * edge line on a 4 mm disc seen flat-on from below buys nothing for twice the
 * objects in the scene.
 */
/**
 * Ceiling screw heads are all one size and there are hundreds of them, so they
 * share a geometry instead of each triangulating their own — most of the cost of
 * drawing them, and most of the buffers they would otherwise hold on the GPU.
 * `shared` keeps `disposeScene` off them: they outlive any one floor group, and
 * a rebuild that replaced some of them would otherwise pull the buffers out from
 * under the ones it carried over. Wall screws are sized from an editable field,
 * so they keep building their own — they are batched all the same, which is
 * what most of that cost was.
 */
const SHARED_FASTENER_GEOMETRIES = new Map();

function sharedFastenerGeometry(narrow, wide, depth) {
  const key = `${narrow}:${wide}:${depth}`;
  const cached = SHARED_FASTENER_GEOMETRIES.get(key);
  if (cached) return cached;
  const geometry = taggedCylinderGeometry(narrow, wide, depth, 12);
  geometry.userData = { ...geometry.userData, shared: true };
  SHARED_FASTENER_GEOMETRIES.set(key, geometry);
  return geometry;
}

function createFastenerObject(descriptor, materialPalette) {
  const wide = Math.max(descriptor.radius || 6, 1);
  const narrow = Math.max(wide * 0.72, 1);
  const vertical = descriptor.axis === 'vertical';
  const depth = Math.max(descriptor.depth || 5, 1);
  const geometry = vertical
    ? sharedFastenerGeometry(narrow, wide, depth)
    : taggedCylinderGeometry(wide, narrow, depth, 12);
  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  mesh.position.copy(planPointToWorld(descriptor.center, descriptor.baseElevation + descriptor.size.y / 2));
  if (vertical) {
    mesh.rotation.y = planAngleToWorldRotation(descriptor.rotation);
  } else {
    /*
     * A wall screw lies on its side, and where that quarter-turn is spent
     * matters. Baking it into the geometry — `geometry.rotateX` — is what this
     * used to do, and it left the cylinder untaggable: `taggedCylinderGeometry`
     * records the unit shape a geometry is a scaled copy of, and a geometry
     * with a rotation cooked into its vertices is not a scaled copy of
     * anything. Six hundred screws on a wall face then meant six hundred draw
     * calls the batcher had to leave alone.
     *
     * Spending it on the mesh instead leaves the geometry a plain cylinder, so
     * every screw on the wall folds into one instanced call — and the world
     * transform is unchanged, because 'YXZ' composes as Ry·Rx and Ry(θ)·Rx(90°)
     * is exactly what the baked geometry produced under `rotation.y = θ`.
     */
    mesh.rotation.set(Math.PI / 2, planAngleToWorldRotation(descriptor.rotation), 0, 'YXZ');
    addOutline(mesh, materialPalette);
  }
  return mesh;
}

function createWallPanelObject(descriptor, materialPalette) {
  const geometry = new THREE.ExtrudeGeometry(createVerticalShape(descriptor.outline, descriptor.holes), {
    depth: descriptor.depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -descriptor.depth / 2);

  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  mesh.position.copy(planPointToWorld(descriptor.origin, descriptor.baseElevation));
  mesh.rotation.y = planAngleToWorldRotation(descriptor.rotation);
  addOutline(mesh, materialPalette);
  return mesh;
}

function createStairObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const risers = Math.max(1, descriptor.numberOfRisers || 1);

  for (let index = 0; index < risers; index += 1) {
    const geometry = taggedBoxGeometry(
      Math.max(descriptor.treadDepth, 1),
      Math.max(descriptor.riserHeight, 1),
      Math.max(descriptor.width, 1),
    );
    const step = createMesh(geometry, materialPalette[descriptor.materialKey]);
    step.position.set(descriptor.treadDepth * (index + 0.5), descriptor.riserHeight * (index + 0.5), 0);
    addOutline(step, materialPalette);
    group.add(step);
  }

  group.position.copy(planPointToWorld(descriptor.startPoint, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation((descriptor.angle * Math.PI) / 180);
  return group;
}

function createSegment3DObject(descriptor, materialPalette) {
  const start = new THREE.Vector3(descriptor.start.x, descriptor.start.y, descriptor.start.z);
  const end = new THREE.Vector3(descriptor.end.x, descriptor.end.y, descriptor.end.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 1);
  const crossSectionHeight = Math.max(descriptor.crossSection?.height || descriptor.thickness || 1, 1);
  const crossSectionWidth = Math.max(descriptor.crossSection?.width || descriptor.thickness || 1, 1);
  const geometry = taggedBoxGeometry(length, crossSectionHeight, crossSectionWidth);
  const mesh = createMesh(geometry, materialPalette[descriptor.materialKey]);
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.clone().normalize(),
  );

  mesh.position.copy(midpoint);
  mesh.quaternion.copy(quaternion);
  addOutline(mesh, materialPalette);
  return mesh;
}

function createWindowObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const { x: width, y: height, z: depth } = descriptor.size;

  const frameWidth = Math.max(40, Math.min(width, height) * 0.06);
  const glassThickness = Math.max(depth * 0.15, 10);
  const mullionWidth = frameWidth * 0.5;

  const frameMaterial = materialPalette.windowFrame;
  const glassMaterial = materialPalette.window;

  // Frame rails
  const frameRails = [
    // top
    { sx: width, sy: frameWidth, sz: depth, px: 0, py: (height - frameWidth) / 2, pz: 0 },
    // bottom
    { sx: width, sy: frameWidth, sz: depth, px: 0, py: -(height - frameWidth) / 2, pz: 0 },
    // left
    { sx: frameWidth, sy: height - frameWidth * 2, sz: depth, px: -(width - frameWidth) / 2, py: 0, pz: 0 },
    // right
    { sx: frameWidth, sy: height - frameWidth * 2, sz: depth, px: (width - frameWidth) / 2, py: 0, pz: 0 },
  ];

  for (const rail of frameRails) {
    const geo = taggedBoxGeometry(Math.max(rail.sx, 1), Math.max(rail.sy, 1), Math.max(rail.sz, 1));
    const mesh = createMesh(geo, frameMaterial);
    mesh.position.set(rail.px, rail.py, rail.pz);
    addOutline(mesh, materialPalette);
    group.add(mesh);
  }

  // Glass pane (no outline — dark edges look wrong on glass)
  const innerW = width - frameWidth * 2;
  const innerH = height - frameWidth * 2;
  const glassGeo = new THREE.BoxGeometry(Math.max(innerW, 1), Math.max(innerH, 1), Math.max(glassThickness, 1));
  const glassMesh = createMesh(glassGeo, glassMaterial);
  glassMesh.castShadow = false;
  group.add(glassMesh);

  // Type-specific mullions
  const windowType = descriptor.windowType || 'standard';
  const mullions = [];

  if (windowType === 'standard') {
    // 2 horizontal bars at 1/3 and 2/3 height
    const thirdH = innerH / 3;
    mullions.push({ sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -thirdH / 2 + innerH / 6, pz: 0 });
    mullions.push({ sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: thirdH / 2 - innerH / 6, pz: 0 });
    // Positions: at -innerH/6 and +innerH/6 from center = 1/3 and 2/3 of inner height
    mullions.length = 0; // clear and redo cleanly
    mullions.push(
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -innerH / 2 + innerH / 3, pz: 0 },
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -innerH / 2 + (innerH * 2) / 3, pz: 0 },
    );
  } else if (windowType === 'casement') {
    // 1 vertical center bar
    mullions.push({ sx: mullionWidth, sy: innerH, sz: depth, px: 0, py: 0, pz: 0 });
  } else if (windowType === 'awning') {
    // 1 horizontal bar at ~30% from top
    mullions.push({ sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: innerH / 2 - innerH * 0.3, pz: 0 });
  } else if (windowType === 'jalousie') {
    // 5 evenly-spaced horizontal bars
    for (let i = 1; i <= 5; i++) {
      const y = -innerH / 2 + (innerH * i) / 6;
      mullions.push({ sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: y, pz: 0 });
    }
  }
  // 'fixed' — no mullions

  for (const m of mullions) {
    const geo = taggedBoxGeometry(Math.max(m.sx, 1), Math.max(m.sy, 1), Math.max(m.sz, 1));
    const mesh = createMesh(geo, frameMaterial);
    mesh.position.set(m.px, m.py, m.pz);
    addOutline(mesh, materialPalette);
    group.add(mesh);
  }

  // Position and rotate the group
  const center = planPointToWorld(descriptor.center, descriptor.baseElevation + height / 2);
  group.position.copy(center);
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Fixture helpers ──

function addBox(group, materialKey, sx, sy, sz, px, py, pz, materialPalette) {
  const geo = taggedBoxGeometry(Math.max(sx, 1), Math.max(sy, 1), Math.max(sz, 1));
  const mesh = createMesh(geo, materialPalette[materialKey]);
  mesh.position.set(px, py, pz);
  addOutline(mesh, materialPalette);
  group.add(mesh);
  return mesh;
}

function addCylinder(group, materialKey, rTop, rBot, h, segs, px, py, pz, materialPalette) {
  const geo = taggedCylinderGeometry(Math.max(rTop, 0.5), Math.max(rBot, 0.5), Math.max(h, 0.5), segs);
  const mesh = createMesh(geo, materialPalette[materialKey]);
  mesh.position.set(px, py, pz);
  addOutline(mesh, materialPalette);
  group.add(mesh);
  return mesh;
}

function buildKitchenTopFixture(group, W, H, D, palette) {
  const mat = 'fixture_kitchenTop';
  // Cabinet body
  addBox(group, mat, W, H * 0.88, D, 0, H * 0.44, 0, palette);
  // Countertop slab
  addBox(group, mat, W + 20, H * 0.04, D + 18, 0, H * 0.9, 0, palette);
  // Stovetop area
  addBox(group, 'fixtureAccentDark', W * 0.48, 5, D * 0.7, -W * 0.18, H * 0.921, 0, palette);
  // 4 burner rings (2x2 grid on left half)
  const burnerOffsets = [
    { x: -W * 0.3, z: -D * 0.15, r: D * 0.13 },
    { x: -W * 0.3, z: D * 0.15, r: D * 0.13 },
    { x: -W * 0.08, z: -D * 0.15, r: D * 0.1 },
    { x: -W * 0.08, z: D * 0.15, r: D * 0.1 },
  ];
  for (const b of burnerOffsets) {
    addCylinder(group, 'fixtureAccentMetal', b.r, b.r, 8, 16, b.x, H * 0.921, b.z, palette);
  }
  // Sink basin
  addBox(group, 'fixtureAccentCeramic', W * 0.22, H * 0.06, D * 0.5, W * 0.22, H * 0.88, 0, palette);
}

function buildToiletFixture(group, W, H, D, palette) {
  const mat = 'fixture_toilet';
  // Cistern box
  addBox(group, mat, W * 0.75, H * 0.75, D * 0.3, 0, H * 0.375, -D * 0.35, palette);
  // Cistern cap
  addBox(group, mat, W * 0.7, H * 0.04, D * 0.26, 0, H * 0.77, -D * 0.35, palette);
  // Bowl outer
  const bowlOuter = addCylinder(group, mat, W * 0.38, W * 0.3, H * 0.65, 20, 0, H * 0.325, D * 0.12, palette);
  bowlOuter.scale.z = 0.75;
  // Bowl inner
  const bowlInner = addCylinder(
    group,
    'fixtureAccentCeramic',
    W * 0.3,
    W * 0.24,
    H * 0.15,
    20,
    0,
    H * 0.58,
    D * 0.12,
    palette,
  );
  bowlInner.scale.z = 0.75;
  // Seat rim
  const seatRim = addCylinder(group, mat, W * 0.37, W * 0.37, H * 0.05, 20, 0, H * 0.66, D * 0.12, palette);
  seatRim.scale.z = 0.75;
}

function buildLavatoryFixture(group, W, H, D, palette) {
  const mat = 'fixture_lavatory';
  const scaleZ = D / W;
  // Pedestal column
  addBox(group, mat, W * 0.25, H * 0.75, D * 0.25, 0, H * 0.375, 0, palette);
  // Pedestal base
  addBox(group, mat, W * 0.35, H * 0.03, D * 0.35, 0, H * 0.015, 0, palette);
  // Basin outer
  const basinOuter = addCylinder(group, mat, W * 0.46, W * 0.38, H * 0.15, 20, 0, H * 0.825, 0, palette);
  basinOuter.scale.z = scaleZ;
  // Basin inner
  const basinInner = addCylinder(
    group,
    'fixtureAccentCeramic',
    W * 0.38,
    W * 0.3,
    H * 0.1,
    20,
    0,
    H * 0.86,
    0,
    palette,
  );
  basinInner.scale.z = scaleZ;
  // Basin rim
  const basinRim = addCylinder(group, mat, W * 0.47, W * 0.47, H * 0.02, 20, 0, H * 0.9, 0, palette);
  basinRim.scale.z = scaleZ;
  // Faucet stem
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.08, D * 0.04, 0, H * 0.94, -D * 0.3, palette);
  // Faucet spout
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.02, D * 0.12, 0, H * 0.96, -D * 0.18, palette);
}

function buildTableFixture(group, W, H, D, palette) {
  const mat = 'fixture_table';
  // Tabletop
  addBox(group, mat, W, H * 0.05, D, 0, H * 0.975, 0, palette);
  // Front apron
  addBox(group, mat, W * 0.9, H * 0.06, D * 0.03, 0, H * 0.92, D * 0.44, palette);
  // Back apron
  addBox(group, mat, W * 0.9, H * 0.06, D * 0.03, 0, H * 0.92, -D * 0.44, palette);
  // Left apron
  addBox(group, 'fixtureAccentWood', W * 0.03, H * 0.06, D * 0.8, -W * 0.44, H * 0.92, 0, palette);
  // Right apron
  addBox(group, 'fixtureAccentWood', W * 0.03, H * 0.06, D * 0.8, W * 0.44, H * 0.92, 0, palette);
  // 4 legs
  const legR = W * 0.02;
  const legH = H * 0.88;
  const legY = H * 0.44;
  const legPositions = [
    { x: -W * 0.43, z: -D * 0.4 },
    { x: -W * 0.43, z: D * 0.4 },
    { x: W * 0.43, z: -D * 0.4 },
    { x: W * 0.43, z: D * 0.4 },
  ];
  for (const lp of legPositions) {
    addCylinder(group, 'fixtureAccentWood', legR, legR, legH, 8, lp.x, legY, lp.z, palette);
  }
}

function buildTvFixture(group, W, H, D, palette) {
  const mat = 'fixture_tv';
  // Screen panel
  addBox(group, mat, W, H * 0.56, D * 0.3, 0, H * 0.72, 0, palette);
  // Bezel top
  addBox(group, 'fixtureAccentDark', W * 1.01, H * 0.012, D * 0.35, 0, H * 1.0, 0, palette);
  // Bezel bottom
  addBox(group, 'fixtureAccentDark', W * 1.01, H * 0.025, D * 0.35, 0, H * 0.435, 0, palette);
  // Stand neck
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.15, D * 0.5, 0, H * 0.365, 0, palette);
  // Stand base
  addBox(group, 'fixtureAccentMetal', W * 0.3, H * 0.02, D * 1.8, 0, H * 0.01, 0, palette);
}

function buildSofaFixture(group, W, H, D, palette) {
  const mat = 'fixture_sofa';
  // Base frame
  addBox(group, mat, W, H * 0.15, D, 0, H * 0.075, 0, palette);
  // Backrest
  addBox(group, mat, W * 0.92, H * 0.52, D * 0.2, 0, H * 0.5, -D * 0.4, palette);
  // Left armrest
  addBox(group, mat, W * 0.06, H * 0.38, D * 0.85, -W * 0.47, H * 0.34, D * 0.05, palette);
  // Right armrest
  addBox(group, mat, W * 0.06, H * 0.38, D * 0.85, W * 0.47, H * 0.34, D * 0.05, palette);
  // 3 seat cushions
  const cushionW = W * 0.28;
  const cushionH = H * 0.14;
  const cushionD = D * 0.58;
  const cushionY = H * 0.22;
  const cushionZ = D * 0.1;
  for (const cx of [-W * 0.28, 0, W * 0.28]) {
    addBox(group, 'fixtureAccentFabric', cushionW, cushionH, cushionD, cx, cushionY, cushionZ, palette);
  }
}

function buildBedFixture(group, W, H, D, palette) {
  const mat = 'fixture_bed';
  // Bed frame
  addBox(group, mat, W, H * 0.3, D, 0, H * 0.15, 0, palette);
  // Headboard
  addBox(group, 'fixtureAccentWood', W, H * 0.65, D * 0.04, 0, H * 0.325, -D * 0.48, palette);
  // Mattress (slightly inset, sits on frame)
  addBox(group, mat, W * 0.94, H * 0.3, D * 0.9, 0, H * 0.45, D * 0.03, palette);
  // Left pillow
  addBox(group, 'fixtureAccentCeramic', W * 0.32, H * 0.12, D * 0.16, -W * 0.22, H * 0.66, -D * 0.36, palette);
  // Right pillow
  addBox(group, 'fixtureAccentCeramic', W * 0.32, H * 0.12, D * 0.16, W * 0.22, H * 0.66, -D * 0.36, palette);
}

const FIXTURE_BUILDERS = {
  kitchenTop: buildKitchenTopFixture,
  toilet: buildToiletFixture,
  lavatory: buildLavatoryFixture,
  table: buildTableFixture,
  tv: buildTvFixture,
  sofa: buildSofaFixture,
  bed: buildBedFixture,
};

function createFixtureObject(descriptor, materialPalette) {
  const builder = FIXTURE_BUILDERS[descriptor.fixtureType];
  if (!builder) {
    return createBoxObject(descriptor, materialPalette);
  }

  const group = new THREE.Group();
  const W = descriptor.size.x;
  const H = descriptor.size.y;
  const D = descriptor.size.z;

  builder(group, W, H, D, materialPalette);

  group.position.copy(planPointToWorld(descriptor.center, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Electrical devices ──
// Local frame: x along the wall, y up from the plate bottom, z across the wall;
// descriptor.faceSign picks which ±z face carries the sockets/toggles so the
// details always face the room the device serves.

function buildOutletDevice(group, W, H, D, face, palette) {
  for (const dy of [-26, 26]) {
    const socket = addCylinder(group, 'fixtureAccentDark', 15, 15, 6, 16, 0, H / 2 + dy, face * (D / 2 + 3), palette);
    socket.rotation.x = Math.PI / 2;
  }
}

function buildGfciOutletDevice(group, W, H, D, face, palette) {
  // Decora-style rectangular insert with test/reset buttons between the sockets
  addBox(group, 'fixtureAccentCeramic', 56, 90, 8, 0, H / 2, face * (D / 2 + 4), palette);
  addBox(group, 'fixtureAccentDark', 40, 26, 6, 0, H / 2 + 26, face * (D / 2 + 8), palette);
  addBox(group, 'fixtureAccentDark', 40, 26, 6, 0, H / 2 - 26, face * (D / 2 + 8), palette);
  addBox(group, 'fixtureAccentMetal', 22, 10, 5, 0, H / 2 + 4, face * (D / 2 + 8), palette);
  addBox(group, 'fixtureAccentMetal', 22, 10, 5, 0, H / 2 - 8, face * (D / 2 + 8), palette);
}

function build220vOutletDevice(group, W, H, D, face, palette) {
  // Single heavy round receptacle on a wider plate
  addBox(group, 'electricalPlate', W + 16, H + 8, D, 0, H / 2, 0, palette);
  const socket = addCylinder(group, 'fixtureAccentDark', 30, 30, 10, 20, 0, H / 2, face * (D / 2 + 5), palette);
  socket.rotation.x = Math.PI / 2;
  const pin = addCylinder(group, 'fixtureAccentMetal', 9, 9, 6, 12, 0, H / 2, face * (D / 2 + 12), palette);
  pin.rotation.x = Math.PI / 2;
}

function buildSwitchDevice(group, W, H, D, face, palette) {
  const toggle = addBox(group, 'fixtureAccentMetal', 14, 32, 24, 0, H / 2, face * (D / 2 + 10), palette);
  toggle.rotation.x = face * -0.45;
}

function build3waySwitchDevice(group, W, H, D, face, palette) {
  // Flat rocker paddle — visually distinct from the single-pole toggle
  addBox(group, 'fixtureAccentCeramic', 46, 80, 10, 0, H / 2, face * (D / 2 + 5), palette);
  addBox(group, 'fixtureAccentDark', 46, 4, 4, 0, H / 2, face * (D / 2 + 10), palette);
}

function buildDimmerSwitchDevice(group, W, H, D, face, palette) {
  const knob = addCylinder(group, 'fixtureAccentMetal', 20, 22, 16, 20, 0, H / 2, face * (D / 2 + 8), palette);
  knob.rotation.x = Math.PI / 2;
  addBox(group, 'fixtureAccentDark', 4, 14, 4, 0, H / 2 + 8, face * (D / 2 + 15), palette);
}

const ELECTRICAL_DEVICE_BUILDERS = {
  outlet: buildOutletDevice,
  'outlet-gfci': buildGfciOutletDevice,
  'outlet-220v': build220vOutletDevice,
  switch: buildSwitchDevice,
  'switch-3way': build3waySwitchDevice,
  'switch-dimmer': buildDimmerSwitchDevice,
};

function createElectricalDeviceObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const W = descriptor.size.x;
  const H = descriptor.size.y;
  const D = descriptor.size.z;
  const face = descriptor.faceSign ?? 1;

  const builder = ELECTRICAL_DEVICE_BUILDERS[descriptor.deviceType];
  // 220v draws its own, wider plate
  if (builder !== build220vOutletDevice) {
    addBox(group, descriptor.materialKey, W, H, D, 0, H / 2, 0, materialPalette);
  }
  (builder || buildOutletDevice)(group, W, H, D, face, materialPalette);

  group.position.copy(planPointToWorld(descriptor.center, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Ceiling luminaires ──
//
// Local frame: the origin is the fixture's centre on the board underside, +y up
// into the plenum, −y down into the room, x along the ceiling's U axis. Every
// builder works in that frame; the group is placed and spun once at the end.
//
// The lens of a recessed fitting sits just *below* its trim rather than inside
// it. A ring would have to be lathed or extruded per fixture, and a glowing disc
// a few millimetres proud reads the same from the floor for a fraction of the
// geometry.

/** How hard a lit lens glows. Above the tone curve's shoulder, which is the point. */
const LENS_EMISSIVE_INTENSITY = 3;

/**
 * And what it looks like switched off: not black — glass still catches the room
 * — but nowhere near lit. `setInteriorLighting` swings a lens between the two.
 */
export const UNLIT_LENS_EMISSIVE_INTENSITY = 0.06;

/** Shadow map edge for a fixture. One eighth of the sun's, for a light that reaches one room. */
const FIXTURE_SHADOW_MAP_SIZE = 1024;

/**
 * At most this many luminaires cast shadows per floor.
 *
 * A shadow-casting light is a full extra render pass over the scene (six, for a
 * point light's cube map), and a flat can easily hold thirty downlights. The
 * brightest are the ones whose shadows are legible, so they are the ones that
 * keep the budget; the rest still light the room, they just do not occlude.
 */
export const MAX_FIXTURE_SHADOW_LIGHTS = 8;

const FIXTURE_AIM_REST = Object.freeze({ x: 0, y: -1, z: 0 });
const FIXTURE_AIM_AXIS = new THREE.Vector3(0, -1, 0);

/**
 * The emissive material for one fixture's lenses and bulbs.
 *
 * Per fixture, not per palette: the colour is the lamp's own colour temperature,
 * and two fixtures on the same ceiling can be a 2200 K filament and a 4000 K
 * panel. `ownedByPreviewObject` is what tells `disposeScene` this one dies with
 * the mesh instead of belonging to the shared palette.
 */
function createFixtureLensMaterial(descriptor) {
  const { r = 1, g = 1, b = 1 } = descriptor.emissive?.color || {};
  const material = new THREE.MeshStandardMaterial({
    // The body colour is what the lens looks like unlit, so it is the lamp's
    // colour with the light taken out of it.
    color: new THREE.Color(r * 0.32, g * 0.32, b * 0.32),
    emissive: new THREE.Color(r, g, b),
    roughness: 0.35,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.emissiveIntensity = LENS_EMISSIVE_INTENSITY;
  material.userData = {
    ownedByPreviewObject: true,
    fixtureLens: true,
    litEmissiveIntensity: LENS_EMISSIVE_INTENSITY,
  };
  return material;
}

/**
 * A lamp casts no shadow of itself: the source sits below its own glass, so all
 * shadowing it can produce is acne on the fitting it lives in.
 */
function addLensMesh(group, geometry, material, px, py, pz) {
  const mesh = createMesh(geometry, material);
  mesh.castShadow = false;
  mesh.position.set(px, py, pz);
  group.add(mesh);
  return mesh;
}

/** Turn a part so its own −y points where the fixture is aimed. */
function orientToAim(object, aim) {
  const direction = new THREE.Vector3(aim.x, aim.y, aim.z);
  if (direction.length() < 1e-6) return object;
  object.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(FIXTURE_AIM_AXIS, direction.normalize()));
  return object;
}

/**
 * The aim arrives as a world vector — the ceiling's frame already applied — and
 * the group it is used inside is about to be spun by that same frame. Taking the
 * rotation back out here is what stops an eyeball on a rotated ceiling from
 * being turned twice.
 */
function aimInFixtureSpace(aim, rotation) {
  const cos = Math.cos(rotation || 0);
  const sin = Math.sin(rotation || 0);
  return { x: aim.x * cos + aim.z * sin, y: aim.y, z: cos * aim.z - sin * aim.x };
}

function buildRecessedCanLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  addCylinder(group, 'ceilingOpeningTrim', radius, radius, 8, 24, 0, -4, 0, palette);
  addCylinder(
    group,
    'ceilingOpeningHousing',
    radius * 0.82,
    radius * 0.82,
    fixture.canDepth,
    20,
    0,
    fixture.canDepth / 2,
    0,
    palette,
  );
  addLensMesh(group, new THREE.CylinderGeometry(radius * 0.78, radius * 0.78, 6, 24), fixture.lens, 0, -11, 0);
}

function buildGimbalLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  addCylinder(group, 'ceilingOpeningTrim', radius, radius, 8, 24, 0, -4, 0, palette);
  addCylinder(
    group,
    'ceilingOpeningHousing',
    radius * 0.85,
    radius * 0.85,
    fixture.canDepth,
    20,
    0,
    fixture.canDepth / 2,
    0,
    palette,
  );

  // The eyeball: a cup on a swivel, and the lamp looking out of it.
  const pivot = -radius * 0.5;
  const cup = addCylinder(group, 'fixtureAccentDark', radius * 0.72, radius * 0.72, radius, 20, 0, 0, 0, palette);
  cup.position.set(fixture.aim.x * radius * 0.5, pivot + fixture.aim.y * radius * 0.5, fixture.aim.z * radius * 0.5);
  orientToAim(cup, fixture.aim);

  const reach = radius * 0.95;
  const lens = addLensMesh(
    group,
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 6, 24),
    fixture.lens,
    fixture.aim.x * reach,
    pivot + fixture.aim.y * reach,
    fixture.aim.z * reach,
  );
  orientToAim(lens, fixture.aim);
}

function buildWaferLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  // No can at all — the whole point of a wafer is that it fits where one will not.
  addCylinder(group, 'ceilingOpeningTrim', radius, radius, 6, 28, 0, -3, 0, palette);
  addCylinder(group, 'ceilingOpeningHousing', radius * 0.45, radius * 0.45, 30, 12, 0, 15, 0, palette);
  addLensMesh(group, new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 5, 28), fixture.lens, 0, -8, 0);
}

function buildFlushDomeLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const height = Math.max(fixture.bulbLength * 0.9, 90);
  addCylinder(group, 'fixtureAccentMetal', radius * 0.55, radius * 0.55, 20, 20, 0, -10, 0, palette);
  // The drum is the diffuser, so the whole of it glows.
  addLensMesh(
    group,
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.55, height, 28),
    fixture.lens,
    0,
    -20 - height / 2,
    0,
  );
}

function buildSemiFlushLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const drop = fixture.drop;
  const height = Math.max(fixture.bulbLength * 0.9, 90);
  addCylinder(group, 'fixtureAccentMetal', radius * 0.45, radius * 0.45, 16, 20, 0, -8, 0, palette);
  if (drop > 40) addCylinder(group, 'fixtureAccentMetal', 12, 12, drop - 20, 10, 0, -10 - (drop - 20) / 2, 0, palette);
  // Centred on the lamp: the drop is where the lamp is, not where the glass starts.
  addLensMesh(group, new THREE.CylinderGeometry(radius * 0.9, radius * 0.62, height, 28), fixture.lens, 0, -drop, 0);
}

function buildCylinderDownlightLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const height = Math.max(fixture.bulbLength + 60, 160);
  addCylinder(group, 'fixtureAccentMetal', radius * 1.05, radius * 1.05, 12, 24, 0, -6, 0, palette);
  addCylinder(group, 'fixtureAccentMetal', radius, radius, height, 24, 0, -12 - height / 2, 0, palette);
  addLensMesh(group, new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, 6, 24), fixture.lens, 0, -12 - height, 0);
}

function buildPendantLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const shadeHeight = Math.max(radius * 0.8, 60);
  const cordLength = Math.max(fixture.drop - shadeHeight, 20);
  addCylinder(group, 'fixtureAccentMetal', radius * 0.4, radius * 0.4, 14, 16, 0, -7, 0, palette);
  addCylinder(group, 'fixtureAccentDark', 6, 6, cordLength, 8, 0, -cordLength / 2, 0, palette);
  addCylinder(
    group,
    'fixtureAccentMetal',
    radius * 0.28,
    radius,
    shadeHeight,
    24,
    0,
    -cordLength - shadeHeight / 2,
    0,
    palette,
  );
  // The lamp hangs at the shade's mouth, which is the elevation the light source
  // was derived at.
  addLensMesh(group, new THREE.SphereGeometry(fixture.bulbRadius, 16, 12), fixture.lens, 0, -fixture.drop, 0);
}

function buildChandelierLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const drop = fixture.drop;
  const armLength = radius * 0.82;
  addCylinder(group, 'fixtureAccentMetal', radius * 0.22, radius * 0.22, 14, 16, 0, -7, 0, palette);
  addCylinder(group, 'fixtureAccentMetal', 10, 10, drop, 8, 0, -drop / 2, 0, palette);
  addCylinder(group, 'fixtureAccentMetal', radius * 0.16, radius * 0.26, 70, 16, 0, -drop + 35, 0, palette);

  for (let index = 0; index < fixture.bulbCount; index += 1) {
    const angle = (index / fixture.bulbCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // rotation.y turns local +x by −angle, so the arm has to be spun back to lie
    // along the radius it was placed on.
    const arm = addBox(
      group,
      'fixtureAccentMetal',
      armLength,
      10,
      10,
      (cos * armLength) / 2,
      -drop,
      (sin * armLength) / 2,
      palette,
    );
    arm.rotation.y = -angle;
    addLensMesh(
      group,
      new THREE.SphereGeometry(fixture.bulbRadius, 12, 10),
      fixture.lens,
      cos * armLength,
      -drop + fixture.bulbRadius,
      sin * armLength,
    );
  }
}

function buildTrackHeadLuminaire(group, fixture, palette) {
  const radius = fixture.radius;
  const barLength = Math.max(radius * 12, 600);
  const headLength = Math.max(fixture.bulbLength + 40, 110);
  // The track the head is clipped to, along the ceiling's U axis.
  addBox(group, 'fixtureAccentDark', barLength, 26, radius * 1.4, 0, -13, 0, palette);

  const pivot = -26 - radius * 0.6;
  const head = addCylinder(
    group,
    'fixtureAccentMetal',
    radius,
    radius * 0.9,
    headLength,
    20,
    (fixture.aim.x * headLength) / 2,
    pivot + (fixture.aim.y * headLength) / 2,
    (fixture.aim.z * headLength) / 2,
    palette,
  );
  orientToAim(head, fixture.aim);

  const reach = headLength + 3;
  const lens = addLensMesh(
    group,
    new THREE.CylinderGeometry(radius * 0.86, radius * 0.86, 6, 20),
    fixture.lens,
    fixture.aim.x * reach,
    pivot + fixture.aim.y * reach,
    fixture.aim.z * reach,
  );
  orientToAim(lens, fixture.aim);
}

function buildTrofferLuminaire(group, fixture, palette) {
  const width = fixture.width;
  const length = fixture.length;
  // Pan in the plenum, flange on the boards, and the panel face below both.
  addBox(group, 'ceilingOpeningHousing', width, 110, length, 0, 55, 0, palette);
  addBox(group, 'ceilingOpeningTrim', width + 24, 12, length + 24, 0, -6, 0, palette);
  addLensMesh(
    group,
    new THREE.BoxGeometry(Math.max(width - 30, 1), 8, Math.max(length - 30, 1)),
    fixture.lens,
    0,
    -16,
    0,
  );
}

const CEILING_LIGHT_FIXTURE_BUILDERS = {
  recessed_can_4: buildRecessedCanLuminaire,
  recessed_can_6: buildRecessedCanLuminaire,
  gimbal_recessed: buildGimbalLuminaire,
  wafer_led: buildWaferLuminaire,
  surface_flush: buildFlushDomeLuminaire,
  semi_flush: buildSemiFlushLuminaire,
  cylinder_downlight: buildCylinderDownlightLuminaire,
  pendant: buildPendantLuminaire,
  chandelier_5: buildChandelierLuminaire,
  track_head: buildTrackHeadLuminaire,
  troffer_2x2: buildTrofferLuminaire,
  troffer_2x4: buildTrofferLuminaire,
};

function createCeilingLightFixtureObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const aperture = descriptor.aperture || {};
  const bulb = descriptor.bulb || {};
  const radius = Math.max(aperture.radiusMm ?? (aperture.widthMm ?? 200) / 2, 10);
  const bulbLength = Math.max(bulb.lengthMm || 110, 10);

  const fixture = {
    radius,
    width: Math.max(aperture.widthMm ?? radius * 2, 20),
    length: Math.max(aperture.lengthMm ?? radius * 2, 20),
    bulbRadius: Math.max((bulb.diameterMm || 60) / 2, 5),
    bulbLength,
    bulbCount: Math.max(bulb.count || 1, 1),
    // Deep enough to hold the lamp, shallow enough to stay in a real plenum.
    canDepth: Math.min(Math.max(bulbLength + 60, 120), 240),
    drop: Math.max(descriptor.dropMm || 0, 0),
    aim: aimInFixtureSpace(descriptor.aim || FIXTURE_AIM_REST, descriptor.rotation),
    lens: createFixtureLensMaterial(descriptor),
  };

  const builder = CEILING_LIGHT_FIXTURE_BUILDERS[descriptor.fixtureType] || buildRecessedCanLuminaire;
  builder(group, fixture, materialPalette);

  group.position.copy(planPointToWorld(descriptor.center, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);
  return group;
}

/**
 * Shadow settings for a fixture light, in millimetres.
 *
 * `normalBias` is 20 *world units*, not the sub-unit figure a metre-scaled scene
 * would take — the same reason the sun's own bias is scaled to the model.
 *
 * The map renders once and then holds. The renderer drives shadows by hand
 * (`shadowMap.autoUpdate = false`) and flips `needsUpdate` on every accumulated
 * sample so the jittered sun can soften its own edges; a fixture never moves, so
 * opting out of that is the difference between one shadow pass per lamp and one
 * per lamp per sample — a hundred and twenty-eight of them, for the same picture.
 */
function configureFixtureShadow(light) {
  light.shadow.mapSize.set(FIXTURE_SHADOW_MAP_SIZE, FIXTURE_SHADOW_MAP_SIZE);
  light.shadow.camera.near = 50;
  light.shadow.camera.far = 30000;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 20;
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
}

/** How far in front of the lamp a spot's target sits. Direction only; distance is arbitrary. */
const FIXTURE_TARGET_DISTANCE = 2000;

function createCeilingLightSourceObject(descriptor) {
  const group = new THREE.Group();
  const { r = 1, g = 1, b = 1 } = descriptor.color || {};
  const color = new THREE.Color(r, g, b);
  const position = descriptor.position || { x: 0, y: 0, z: 0 };
  const intensity = Math.max(descriptor.intensity || 0, 0);
  const distance = Math.max(descriptor.distanceMm || 0, 0);
  const isSpot = descriptor.lightType === 'spot';

  const light = isSpot
    ? new THREE.SpotLight(color, intensity, distance, descriptor.angleRad, descriptor.penumbra ?? 0.35, 2)
    : new THREE.PointLight(color, intensity, distance, 2);
  // Physical falloff either way — the intensity handed over is already candela
  // scaled for a millimetre world, and inverse-square is what makes it read like
  // the lamp on the box.
  light.decay = 2;
  light.position.set(position.x, position.y, position.z);
  light.castShadow = Boolean(descriptor.castShadow);
  // `baseIntensity` is the descriptor's own candela figure, kept on the light so
  // the viewport can rescale the lamp for the rig it is being seen under without
  // reaching back to the descriptor — and, more importantly, so that a light
  // which survives an incremental scene rebuild is always rescaled from the same
  // base rather than compounding the factor it already carries. The descriptor
  // itself stays pure photometry: it is cached by source key, so a descriptor
  // that changed with the time of day would never be rebuilt at all.
  light.userData = { isFixtureLight: true, baseIntensity: intensity };
  if (light.castShadow) configureFixtureShadow(light);
  group.add(light);

  if (isSpot) {
    const aim = descriptor.aim || FIXTURE_AIM_REST;
    // The target rides in the same group as the light, so the pair moves and is
    // disposed as one thing.
    light.target.position.set(
      position.x + aim.x * FIXTURE_TARGET_DISTANCE,
      position.y + aim.y * FIXTURE_TARGET_DISTANCE,
      position.z + aim.z * FIXTURE_TARGET_DISTANCE,
    );
    group.add(light.target);
  }

  return group;
}

/**
 * Hold the floor to `MAX_FIXTURE_SHADOW_LIGHTS` shadow casters, brightest first.
 *
 * A post-pass rather than a decision in the descriptor: the descriptor records
 * what the user asked for, and a fixture that loses the budget on a crowded
 * ceiling has to win it back on its own when the neighbours are deleted. Sorted
 * by intensity and broken by id so the same floor always demotes the same lamps
 * — an unstable choice would flicker the shadows on every rebuild.
 */
function applyFixtureShadowCap(entries) {
  const lights = [];
  for (const entry of entries.values()) {
    if (entry.descriptor.geometry === 'ceilingLightSource') lights.push(entry);
  }
  if (!lights.length) return;

  lights.sort(
    (a, b) =>
      (b.descriptor.intensity || 0) - (a.descriptor.intensity || 0) ||
      String(a.descriptor.id).localeCompare(String(b.descriptor.id)),
  );

  let granted = 0;
  for (const entry of lights) {
    const allowed = Boolean(entry.descriptor.castShadow) && granted < MAX_FIXTURE_SHADOW_LIGHTS;
    if (allowed) granted += 1;
    entry.object.traverse((node) => {
      if (!node.userData?.isFixtureLight || node.castShadow === allowed) return;
      node.castShadow = allowed;
      // A map that was never rendered, or was rendered before the light was
      // demoted, has to be asked for again.
      if (allowed && node.shadow) node.shadow.needsUpdate = true;
    });
  }
}

// ── Railing ──

function createRailingObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const { x: length, y: height, z: width } = descriptor.size;
  const railingType = descriptor.railingType || 'handrail';
  const railHeight = 50; // handrail tube diameter
  const postWidth = 30;

  // Stair-attached railings rake along the run: rise is the elevation gain from
  // the local -x end to the +x end; the group sits at the mid elevation, so the
  // raked members stay centered while balusters land on the pitch line.
  const rise = descriptor.slopeRise || 0;
  const pitch = Math.atan2(rise, length);
  const rakedLength = Math.sqrt(length * length + rise * rise);
  const slopePerX = length > 0 ? rise / length : 0;

  if (railingType === 'glass') {
    // Top metal rail
    const topRail = addBox(
      group,
      'railing_handrail',
      rakedLength,
      railHeight,
      postWidth,
      0,
      height - railHeight / 2,
      0,
      materialPalette,
    );
    topRail.rotation.z = pitch;
    // Bottom metal rail
    const bottomRail = addBox(
      group,
      'railing_handrail',
      rakedLength,
      railHeight,
      postWidth,
      0,
      railHeight / 2,
      0,
      materialPalette,
    );
    bottomRail.rotation.z = pitch;
    // Glass panel (full height between rails, no outline for clean look)
    const glassH = height - railHeight * 2;
    const glassGeo = new THREE.BoxGeometry(Math.max(rakedLength, 1), Math.max(glassH, 1), Math.max(width * 0.3, 1));
    const glassMesh = createMesh(glassGeo, materialPalette.railing_glass);
    glassMesh.position.set(0, height / 2, 0);
    glassMesh.rotation.z = pitch;
    glassMesh.castShadow = false;
    group.add(glassMesh);
  } else if (railingType === 'guardrail') {
    // Solid opaque panel
    const panel = addBox(group, 'railing_guardrail', rakedLength, height, width, 0, height / 2, 0, materialPalette);
    panel.rotation.z = pitch;
  } else {
    // handrail: top rail + vertical balusters
    // Top rail
    const topRail = addBox(
      group,
      'railing_handrail',
      rakedLength,
      railHeight,
      postWidth,
      0,
      height - railHeight / 2,
      0,
      materialPalette,
    );
    topRail.rotation.z = pitch;
    // Balusters spaced ~300mm apart along the plan length, kept vertical with
    // their feet on the pitch line so they meet the raked top rail.
    const spacing = 300;
    const postCount = Math.max(2, Math.floor(length / spacing) + 1);
    const actualSpacing = length / (postCount - 1);
    for (let i = 0; i < postCount; i++) {
      const px = -length / 2 + i * actualSpacing;
      addCylinder(
        group,
        'railing_handrail',
        postWidth / 2,
        postWidth / 2,
        height - railHeight,
        8,
        px,
        slopePerX * px + (height - railHeight) / 2,
        0,
        materialPalette,
      );
    }
  }

  // Position and rotate
  const center = planPointToWorld(descriptor.center, descriptor.baseElevation);
  group.position.copy(center);
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Dispatcher ──

function createObjectForDescriptor(descriptor, materialPalette) {
  if (descriptor.geometry === 'prism') return createPrismObject(descriptor, materialPalette);
  if (descriptor.geometry === 'wallPanel') return createWallPanelObject(descriptor, materialPalette);
  if (descriptor.geometry === 'roofMesh') return createRoofMeshObject(descriptor, materialPalette);
  if (descriptor.geometry === 'stair') return createStairObject(descriptor, materialPalette);
  if (descriptor.geometry === 'segment3d') return createSegment3DObject(descriptor, materialPalette);
  if (descriptor.geometry === 'window') return createWindowObject(descriptor, materialPalette);
  if (descriptor.geometry === 'railing') return createRailingObject(descriptor, materialPalette);
  if (descriptor.geometry === 'fixture') return createFixtureObject(descriptor, materialPalette);
  if (descriptor.geometry === 'electricalDevice') return createElectricalDeviceObject(descriptor, materialPalette);
  if (descriptor.geometry === 'ceilingLightFixture')
    return createCeilingLightFixtureObject(descriptor, materialPalette);
  if (descriptor.geometry === 'ceilingLightSource') return createCeilingLightSourceObject(descriptor);
  if (descriptor.geometry === 'fastener') return createFastenerObject(descriptor, materialPalette);
  return createBoxObject(descriptor, materialPalette);
}

/**
 * Which piece of a detailed wall or ceiling assembly a mesh is — the board,
 * framing member, screw, or hanger the detail editors let you pick — or null for
 * a mesh that is a whole object rather than a part of one. `partId` is the id
 * the editor selects by, so a highlight can be driven straight from its state.
 */
export function readAssemblyPart(descriptor) {
  const metadata = descriptor?.metadata;
  if (!metadata) return null;
  const kind = metadata.wallDetailKind || metadata.ceilingDetailKind || null;
  const id = metadata.wallDetailElementId ?? metadata.ceilingDetailElementId ?? null;
  if (!kind || !id) return null;
  return { kind, id, side: metadata.assemblySide || null };
}

/**
 * A part selection names one board out of a face full of them, so the side has
 * to agree as well as the id: the same board id exists on both faces of a wall.
 * Framing is on neither face — it sits in the core — so it answers to the id
 * alone.
 */
function matchesAssemblyPart(descriptor, part) {
  const candidate = readAssemblyPart(descriptor);
  if (!candidate || !part?.id) return false;
  if (candidate.kind !== part.kind || candidate.id !== part.id) return false;
  if (!part.side || !candidate.side || candidate.side === 'core') return true;
  return candidate.side === part.side;
}

function matchesSelection(descriptor, selection) {
  if (selection?.part) return matchesAssemblyPart(descriptor, selection.part);
  if (!selection?.selectedId) return false;
  if (selection.selectedType === 'trussSystem') {
    return descriptor.metadata?.trussSystemId === selection.selectedId;
  }
  if (selection.selectedType !== descriptor.kind) return false;
  return (descriptor.metadata?.sourceId || descriptor.id) === selection.selectedId;
}

function assignPreviewMetadata(object, descriptor, floor) {
  const part = readAssemblyPart(descriptor);
  const previewTarget = {
    kind: descriptor.kind,
    sourceId: descriptor.metadata?.sourceId || descriptor.id,
    floorId: descriptor.metadata?.floorId || floor.floorId,
    // Carried so a click in the 3D pane can land on the board it hit rather than
    // on the wall the board belongs to.
    part,
  };

  object.traverse((node) => {
    node.userData = {
      ...node.userData,
      previewTarget,
    };
  });
}

/**
 * Whether two object descriptors describe the same thing to build.
 *
 * Descriptors are plain data — numbers, points, outlines — and the scene pass
 * rebuilds all of them from the project on every change, so reference equality
 * never holds and a structural comparison is the only way to tell "this mesh is
 * unchanged" from "this mesh moved". It is worth doing: comparing a whole
 * building's descriptors costs a fraction of a millisecond, triangulating them
 * costs tens.
 */
function descriptorsEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!descriptorsEqual(a[index], b[index])) return false;
    }
    return true;
  }

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!descriptorsEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Build the THREE group + local meshMap for a single floor descriptor.
 * Extracted so an incremental cache can rebuild individual floors while
 * reusing groups whose source geometry is unchanged. Returns the floor's
 * meshMap entries keyed by descriptor id (floor-local, no visibility applied
 * beyond the group flag — visibility is a per-entry concern applied by the
 * caller/cache).
 *
 * `previousEntries` are this floor's entries from the last build, if it has
 * one. An object whose descriptor is unchanged is carried over rather than
 * rebuilt — the reason a floor gets rebuilt is often that one thing on it (or
 * on a floor it depends on) moved, and re-triangulating the other three hundred
 * meshes to follow that one is what made dragging feel like wading. `add()`
 * detaches a carried-over object from the group it came from, so what remains in
 * the old group is exactly the set the caller is free to dispose.
 *
 * `options.batch` asks for the floor's boxes and cylinders to be folded into
 * instanced draw calls as well, and returns the group of them to be hung
 * somewhere the collision index and the picker will not find it — see
 * `previewBatching`. Off by default, so the one-shot `buildPreviewObjectRoot`
 * path (drawing-sheet stills) and every existing test build exactly what they
 * built before.
 */
export function buildFloorObjectGroup(floor, materialPalette, previousEntries = null, options = {}) {
  const floorGroup = new THREE.Group();
  floorGroup.name = `floor-${floor.floorId}`;
  floorGroup.visible = floor.visible;
  floorGroup.userData = {
    floorId: floor.floorId,
    floorName: floor.name,
    elevation: floor.elevation,
  };

  const entries = new Map();

  for (const descriptor of floor.objects) {
    const previous = previousEntries?.get(descriptor.id);
    const carriedOver = previous && descriptorsEqual(previous.descriptor, descriptor) ? previous.object : null;
    const object = carriedOver || createObjectForDescriptor(descriptor, materialPalette);

    // A carried-over object already carries all of this: its descriptor is
    // equal, and the cache only ever offers back entries from the same floor.
    if (!carriedOver) {
      object.name = descriptor.id;
      object.userData = {
        id: descriptor.id,
        kind: descriptor.kind,
        metadata: descriptor.metadata,
      };
      assignPreviewMetadata(object, descriptor, floor);
    }
    floorGroup.add(object);

    entries.set(descriptor.id, {
      object,
      descriptor,
      materialKey: descriptor.materialKey,
      floorVisible: floor.visible,
    });
  }

  // After the whole floor is known: which lamps get shadows is a decision about
  // the set of them, and carried-over lights have to be re-judged against the
  // ones that were just rebuilt beside them.
  applyFixtureShadowCap(entries);

  // Also after the whole floor is known, and for the same reason: a batch is a
  // statement about a set of meshes, so it can only be made once they are all
  // in place — carried-over ones included. `previousBatchGroup` may come back
  // as the returned one, refilled rather than rebuilt; the caller compares
  // identity to know whether the old one is still in use.
  const batchGroup = options.batch
    ? buildFloorBatchGroup(floorGroup, materialPalette, options.previousBatchGroup || null)
    : null;

  return { floorGroup, entries, batchGroup };
}

export function buildPreviewObjectRoot(sceneDescriptor, materialPalette) {
  const root = new THREE.Group();
  root.name = 'preview-root';
  const meshMap = new Map();

  for (const floor of sceneDescriptor.floors) {
    const { floorGroup, entries } = buildFloorObjectGroup(floor, materialPalette);
    for (const [id, entry] of entries) {
      meshMap.set(id, entry);
    }
    root.add(floorGroup);
  }

  return { root, meshMap };
}

/**
 * Build selection overlay meshes for the given selection.
 * Iterates meshMap and finds ALL matching descriptors (handles truss systems, multi-segment walls).
 * Returns a Group of overlay meshes with renderOrder=1 and LessEqual depth for visual priority.
 */
export function buildSelectionOverlay(meshMap, selection, materialPalette, accentName = 'plan') {
  if (!(selection?.selectedId || selection?.part?.id) || !meshMap.size) return null;
  const accent = SELECTION_ACCENTS[accentName] || SELECTION_ACCENTS.plan;

  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'selection-overlay';
  overlayGroup.renderOrder = 1;

  for (const [, entry] of meshMap) {
    if (!entry.floorVisible) continue;
    // A luminaire's light answers to the same id as its fitting, and there is
    // nothing to tint on a light — building one here would put a second lamp in
    // the room for as long as the fixture stayed selected.
    if (entry.descriptor.geometry === 'ceilingLightSource') continue;
    if (!matchesSelection(entry.descriptor, selection)) continue;

    const overlayObject = createObjectForDescriptor(entry.descriptor, materialPalette);

    // Apply highlight style: clone materials and tint them
    overlayObject.traverse((node) => {
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => {
            const clone = mat.clone();
            applySelectedSurfaceStyle(clone, accent);
            clone.depthFunc = THREE.LessEqualDepth;
            return clone;
          });
        } else {
          node.material = node.material.clone();
          applySelectedSurfaceStyle(node.material, accent);
          node.material.depthFunc = THREE.LessEqualDepth;
        }
      }
      if (node.isLineSegments && node.material) {
        node.material = node.material.clone();
        node.material.color.copy(accent.outline);
        node.material.opacity = 1;
        node.material.depthFunc = THREE.LessEqualDepth;
      }
      node.renderOrder = 1;
    });

    overlayGroup.add(overlayObject);
  }

  return overlayGroup.children.length > 0 ? overlayGroup : null;
}
