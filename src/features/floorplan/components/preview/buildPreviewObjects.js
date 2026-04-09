import * as THREE from 'three';

const SELECTED_SURFACE_COLOR = new THREE.Color(0xcdeedd);
const SELECTED_EMISSIVE_COLOR = new THREE.Color(0x0f8f74);
const SELECTED_OUTLINE_COLOR = new THREE.Color(0x0f8f74);

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

function applySelectedSurfaceStyle(material) {
  if (material.color) {
    material.color.lerp(SELECTED_SURFACE_COLOR, 0.36);
  }
  if ('emissive' in material && material.emissive) {
    material.emissive.copy(SELECTED_EMISSIVE_COLOR);
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
  if (!object3d.geometry) return;
  const edges = new THREE.EdgesGeometry(object3d.geometry, 20);
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
  const geometry = new THREE.BoxGeometry(
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

function createStairObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const risers = Math.max(1, descriptor.numberOfRisers || 1);

  for (let index = 0; index < risers; index += 1) {
    const geometry = new THREE.BoxGeometry(
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
  const geometry = new THREE.BoxGeometry(length, crossSectionHeight, crossSectionWidth);
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
    const geo = new THREE.BoxGeometry(Math.max(rail.sx, 1), Math.max(rail.sy, 1), Math.max(rail.sz, 1));
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
    const geo = new THREE.BoxGeometry(Math.max(m.sx, 1), Math.max(m.sy, 1), Math.max(m.sz, 1));
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
  const geo = new THREE.BoxGeometry(Math.max(sx, 1), Math.max(sy, 1), Math.max(sz, 1));
  const mesh = createMesh(geo, materialPalette[materialKey]);
  mesh.position.set(px, py, pz);
  addOutline(mesh, materialPalette);
  group.add(mesh);
}

function addCylinder(group, materialKey, rTop, rBot, h, segs, px, py, pz, materialPalette) {
  const geo = new THREE.CylinderGeometry(Math.max(rTop, 0.5), Math.max(rBot, 0.5), Math.max(h, 0.5), segs);
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

// ── Railing ──

function createRailingObject(descriptor, materialPalette) {
  const group = new THREE.Group();
  const { x: length, y: height, z: width } = descriptor.size;
  const railingType = descriptor.railingType || 'handrail';
  const railHeight = 50; // handrail tube diameter
  const postWidth = 30;

  if (railingType === 'glass') {
    // Top metal rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth, 0, height - railHeight / 2, 0, materialPalette);
    // Bottom metal rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth, 0, railHeight / 2, 0, materialPalette);
    // Glass panel (full height between rails, no outline for clean look)
    const glassH = height - railHeight * 2;
    const glassGeo = new THREE.BoxGeometry(Math.max(length, 1), Math.max(glassH, 1), Math.max(width * 0.3, 1));
    const glassMesh = createMesh(glassGeo, materialPalette.railing_glass);
    glassMesh.position.set(0, height / 2, 0);
    glassMesh.castShadow = false;
    group.add(glassMesh);
  } else if (railingType === 'guardrail') {
    // Solid opaque panel
    addBox(group, 'railing_guardrail', length, height, width, 0, height / 2, 0, materialPalette);
  } else {
    // handrail: top rail + vertical balusters
    // Top rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth, 0, height - railHeight / 2, 0, materialPalette);
    // Balusters spaced ~300mm apart
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
        (height - railHeight) / 2,
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
  if (descriptor.geometry === 'roofMesh') return createRoofMeshObject(descriptor, materialPalette);
  if (descriptor.geometry === 'stair') return createStairObject(descriptor, materialPalette);
  if (descriptor.geometry === 'segment3d') return createSegment3DObject(descriptor, materialPalette);
  if (descriptor.geometry === 'window') return createWindowObject(descriptor, materialPalette);
  if (descriptor.geometry === 'railing') return createRailingObject(descriptor, materialPalette);
  if (descriptor.geometry === 'fixture') return createFixtureObject(descriptor, materialPalette);
  return createBoxObject(descriptor, materialPalette);
}

function matchesSelection(descriptor, selection) {
  if (!selection?.selectedId) return false;
  if (selection.selectedType === 'trussSystem') {
    return descriptor.metadata?.trussSystemId === selection.selectedId;
  }
  if (selection.selectedType !== descriptor.kind) return false;
  return (descriptor.metadata?.sourceId || descriptor.id) === selection.selectedId;
}

function assignPreviewMetadata(object, descriptor, floor) {
  const previewTarget = {
    kind: descriptor.kind,
    sourceId: descriptor.metadata?.sourceId || descriptor.id,
    floorId: descriptor.metadata?.floorId || floor.floorId,
  };

  object.traverse((node) => {
    node.userData = {
      ...node.userData,
      previewTarget,
    };
  });
}

export function buildPreviewObjectRoot(sceneDescriptor, materialPalette) {
  const root = new THREE.Group();
  root.name = 'preview-root';
  const meshMap = new Map();

  for (const floor of sceneDescriptor.floors) {
    const floorGroup = new THREE.Group();
    floorGroup.name = `floor-${floor.floorId}`;
    floorGroup.visible = floor.visible;
    floorGroup.userData = {
      floorId: floor.floorId,
      floorName: floor.name,
      elevation: floor.elevation,
    };

    for (const descriptor of floor.objects) {
      const object = createObjectForDescriptor(descriptor, materialPalette);
      object.name = descriptor.id;
      object.userData = {
        id: descriptor.id,
        kind: descriptor.kind,
        metadata: descriptor.metadata,
      };
      assignPreviewMetadata(object, descriptor, floor);
      floorGroup.add(object);

      meshMap.set(descriptor.id, {
        object,
        descriptor,
        materialKey: descriptor.materialKey,
        floorVisible: floor.visible,
      });
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
export function buildSelectionOverlay(meshMap, selection, materialPalette) {
  if (!selection?.selectedId || !meshMap.size) return null;

  const overlayGroup = new THREE.Group();
  overlayGroup.name = 'selection-overlay';
  overlayGroup.renderOrder = 1;

  for (const [, entry] of meshMap) {
    if (!entry.floorVisible) continue;
    if (!matchesSelection(entry.descriptor, selection)) continue;

    const overlayObject = createObjectForDescriptor(entry.descriptor, materialPalette);

    // Apply highlight style: clone materials and tint them
    overlayObject.traverse((node) => {
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => {
            const clone = mat.clone();
            applySelectedSurfaceStyle(clone);
            clone.depthFunc = THREE.LessEqualDepth;
            return clone;
          });
        } else {
          node.material = node.material.clone();
          applySelectedSurfaceStyle(node.material);
          node.material.depthFunc = THREE.LessEqualDepth;
        }
      }
      if (node.isLineSegments && node.material) {
        node.material = node.material.clone();
        node.material.color.copy(SELECTED_OUTLINE_COLOR);
        node.material.opacity = 1;
        node.material.depthFunc = THREE.LessEqualDepth;
      }
      node.renderOrder = 1;
    });

    overlayGroup.add(overlayObject);
  }

  return overlayGroup.children.length > 0 ? overlayGroup : null;
}
