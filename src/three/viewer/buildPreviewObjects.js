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

function createMeshMaterial(materialPalette, materialKey, isSelected) {
  const material = materialPalette[materialKey].clone();
  if (isSelected) applySelectedSurfaceStyle(material);
  return material;
}

function createOutlineMaterial(materialPalette, isSelected) {
  const material = materialPalette.outline.clone();
  if (isSelected) {
    material.color.copy(SELECTED_OUTLINE_COLOR);
    material.opacity = 1;
  }
  return material;
}

function addOutline(object3d, materialPalette, isSelected) {
  if (!object3d.geometry) return;
  const edges = new THREE.EdgesGeometry(object3d.geometry, 20);
  const outline = new THREE.LineSegments(edges, createOutlineMaterial(materialPalette, isSelected));
  object3d.add(outline);
}

function createPrismObject(descriptor, materialPalette, isSelected) {
  const geometry = new THREE.ExtrudeGeometry(createShape(descriptor.outline, descriptor.holes), {
    depth: descriptor.height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, descriptor.baseElevation, 0);

  const mesh = new THREE.Mesh(geometry, createMeshMaterial(materialPalette, descriptor.materialKey, isSelected));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  return mesh;
}

function createRoofMeshObject(descriptor, materialPalette, isSelected) {
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

  const mesh = new THREE.Mesh(geometry, createMeshMaterial(materialPalette, descriptor.materialKey, isSelected));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  return mesh;
}

function createBoxObject(descriptor, materialPalette, isSelected) {
  const geometry = new THREE.BoxGeometry(
    Math.max(descriptor.size.x, 1),
    Math.max(descriptor.size.y, 1),
    Math.max(descriptor.size.z, 1)
  );
  const mesh = new THREE.Mesh(geometry, createMeshMaterial(materialPalette, descriptor.materialKey, isSelected));
  const center = planPointToWorld(
    descriptor.center,
    descriptor.baseElevation + descriptor.size.y / 2
  );
  mesh.position.copy(center);
  mesh.rotation.y = planAngleToWorldRotation(descriptor.rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  return mesh;
}

function createStairObject(descriptor, materialPalette, isSelected) {
  const group = new THREE.Group();
  const risers = Math.max(1, descriptor.numberOfRisers || 1);

  for (let index = 0; index < risers; index += 1) {
    const geometry = new THREE.BoxGeometry(
      Math.max(descriptor.treadDepth, 1),
      Math.max(descriptor.riserHeight, 1),
      Math.max(descriptor.width, 1)
    );
    const step = new THREE.Mesh(geometry, createMeshMaterial(materialPalette, descriptor.materialKey, isSelected));
    step.position.set(
      descriptor.treadDepth * (index + 0.5),
      descriptor.riserHeight * (index + 0.5),
      0
    );
    step.castShadow = true;
    step.receiveShadow = true;
    addOutline(step, materialPalette, isSelected);
    group.add(step);
  }

  group.position.copy(planPointToWorld(descriptor.startPoint, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation(descriptor.angle * Math.PI / 180);
  return group;
}

function createSegment3DObject(descriptor, materialPalette, isSelected) {
  const start = new THREE.Vector3(descriptor.start.x, descriptor.start.y, descriptor.start.z);
  const end = new THREE.Vector3(descriptor.end.x, descriptor.end.y, descriptor.end.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 1);
  const crossSectionHeight = Math.max(descriptor.crossSection?.height || descriptor.thickness || 1, 1);
  const crossSectionWidth = Math.max(descriptor.crossSection?.width || descriptor.thickness || 1, 1);
  const geometry = new THREE.BoxGeometry(
    length,
    crossSectionHeight,
    crossSectionWidth
  );
  const mesh = new THREE.Mesh(geometry, createMeshMaterial(materialPalette, descriptor.materialKey, isSelected));
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.clone().normalize()
  );

  mesh.position.copy(midpoint);
  mesh.quaternion.copy(quaternion);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  return mesh;
}

function createWindowObject(descriptor, materialPalette, isSelected) {
  const group = new THREE.Group();
  const { x: width, y: height, z: depth } = descriptor.size;

  const frameWidth = Math.max(40, Math.min(width, height) * 0.06);
  const glassThickness = Math.max(depth * 0.15, 10);
  const mullionWidth = frameWidth * 0.5;

  const frameMaterial = createMeshMaterial(materialPalette, 'windowFrame', isSelected);
  const glassMaterial = createMeshMaterial(materialPalette, 'window', isSelected);

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
    const geo = new THREE.BoxGeometry(
      Math.max(rail.sx, 1), Math.max(rail.sy, 1), Math.max(rail.sz, 1)
    );
    const mesh = new THREE.Mesh(geo, frameMaterial);
    mesh.position.set(rail.px, rail.py, rail.pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, materialPalette, isSelected);
    group.add(mesh);
  }

  // Glass pane (no outline — dark edges look wrong on glass)
  const innerW = width - frameWidth * 2;
  const innerH = height - frameWidth * 2;
  const glassGeo = new THREE.BoxGeometry(
    Math.max(innerW, 1), Math.max(innerH, 1), Math.max(glassThickness, 1)
  );
  const glassMesh = new THREE.Mesh(glassGeo, glassMaterial);
  glassMesh.castShadow = false;
  glassMesh.receiveShadow = true;
  group.add(glassMesh);

  // Type-specific mullions
  const windowType = descriptor.windowType || 'standard';
  const mullions = [];

  if (windowType === 'standard') {
    // 2 horizontal bars at 1/3 and 2/3 height
    const thirdH = innerH / 3;
    mullions.push(
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -thirdH / 2 + innerH / 6, pz: 0 },
    );
    mullions.push(
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: thirdH / 2 - innerH / 6, pz: 0 },
    );
    // Positions: at -innerH/6 and +innerH/6 from center = 1/3 and 2/3 of inner height
    mullions.length = 0; // clear and redo cleanly
    mullions.push(
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -innerH / 2 + innerH / 3, pz: 0 },
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: -innerH / 2 + (innerH * 2) / 3, pz: 0 },
    );
  } else if (windowType === 'casement') {
    // 1 vertical center bar
    mullions.push(
      { sx: mullionWidth, sy: innerH, sz: depth, px: 0, py: 0, pz: 0 },
    );
  } else if (windowType === 'awning') {
    // 1 horizontal bar at ~30% from top
    mullions.push(
      { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: innerH / 2 - innerH * 0.3, pz: 0 },
    );
  } else if (windowType === 'jalousie') {
    // 5 evenly-spaced horizontal bars
    for (let i = 1; i <= 5; i++) {
      const y = -innerH / 2 + (innerH * i) / 6;
      mullions.push(
        { sx: innerW, sy: mullionWidth, sz: depth, px: 0, py: y, pz: 0 },
      );
    }
  }
  // 'fixed' — no mullions

  for (const m of mullions) {
    const geo = new THREE.BoxGeometry(
      Math.max(m.sx, 1), Math.max(m.sy, 1), Math.max(m.sz, 1)
    );
    const mesh = new THREE.Mesh(geo, frameMaterial);
    mesh.position.set(m.px, m.py, m.pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, materialPalette, isSelected);
    group.add(mesh);
  }

  // Position and rotate the group
  const center = planPointToWorld(
    descriptor.center,
    descriptor.baseElevation + height / 2
  );
  group.position.copy(center);
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Fixture helpers ──

function addBox(group, materialKey, sx, sy, sz, px, py, pz, materialPalette, isSelected) {
  const geo = new THREE.BoxGeometry(Math.max(sx, 1), Math.max(sy, 1), Math.max(sz, 1));
  const mesh = new THREE.Mesh(geo, createMeshMaterial(materialPalette, materialKey, isSelected));
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  group.add(mesh);
}

function addCylinder(group, materialKey, rTop, rBot, h, segs, px, py, pz, materialPalette, isSelected) {
  const geo = new THREE.CylinderGeometry(Math.max(rTop, 0.5), Math.max(rBot, 0.5), Math.max(h, 0.5), segs);
  const mesh = new THREE.Mesh(geo, createMeshMaterial(materialPalette, materialKey, isSelected));
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, materialPalette, isSelected);
  group.add(mesh);
  return mesh;
}

function buildKitchenTopFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_kitchenTop';
  // Cabinet body
  addBox(group, mat, W, H * 0.88, D, 0, H * 0.44, 0, palette, sel);
  // Countertop slab
  addBox(group, mat, W + 20, H * 0.04, D + 18, 0, H * 0.90, 0, palette, sel);
  // Stovetop area
  addBox(group, 'fixtureAccentDark', W * 0.48, 5, D * 0.7, -W * 0.18, H * 0.921, 0, palette, sel);
  // 4 burner rings (2x2 grid on left half)
  const burnerOffsets = [
    { x: -W * 0.30, z: -D * 0.15, r: D * 0.13 },
    { x: -W * 0.30, z: D * 0.15, r: D * 0.13 },
    { x: -W * 0.08, z: -D * 0.15, r: D * 0.10 },
    { x: -W * 0.08, z: D * 0.15, r: D * 0.10 },
  ];
  for (const b of burnerOffsets) {
    addCylinder(group, 'fixtureAccentMetal', b.r, b.r, 8, 16, b.x, H * 0.921, b.z, palette, sel);
  }
  // Sink basin
  addBox(group, 'fixtureAccentCeramic', W * 0.22, H * 0.06, D * 0.5, W * 0.22, H * 0.88, 0, palette, sel);
}

function buildToiletFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_toilet';
  // Cistern box
  addBox(group, mat, W * 0.75, H * 0.75, D * 0.30, 0, H * 0.375, -D * 0.35, palette, sel);
  // Cistern cap
  addBox(group, mat, W * 0.70, H * 0.04, D * 0.26, 0, H * 0.77, -D * 0.35, palette, sel);
  // Bowl outer
  const bowlOuter = addCylinder(group, mat, W * 0.38, W * 0.30, H * 0.65, 20, 0, H * 0.325, D * 0.12, palette, sel);
  bowlOuter.scale.z = 0.75;
  // Bowl inner
  const bowlInner = addCylinder(group, 'fixtureAccentCeramic', W * 0.30, W * 0.24, H * 0.15, 20, 0, H * 0.58, D * 0.12, palette, sel);
  bowlInner.scale.z = 0.75;
  // Seat rim
  const seatRim = addCylinder(group, mat, W * 0.37, W * 0.37, H * 0.05, 20, 0, H * 0.66, D * 0.12, palette, sel);
  seatRim.scale.z = 0.75;
}

function buildLavatoryFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_lavatory';
  const scaleZ = D / W;
  // Pedestal column
  addBox(group, mat, W * 0.25, H * 0.75, D * 0.25, 0, H * 0.375, 0, palette, sel);
  // Pedestal base
  addBox(group, mat, W * 0.35, H * 0.03, D * 0.35, 0, H * 0.015, 0, palette, sel);
  // Basin outer
  const basinOuter = addCylinder(group, mat, W * 0.46, W * 0.38, H * 0.15, 20, 0, H * 0.825, 0, palette, sel);
  basinOuter.scale.z = scaleZ;
  // Basin inner
  const basinInner = addCylinder(group, 'fixtureAccentCeramic', W * 0.38, W * 0.30, H * 0.10, 20, 0, H * 0.86, 0, palette, sel);
  basinInner.scale.z = scaleZ;
  // Basin rim
  const basinRim = addCylinder(group, mat, W * 0.47, W * 0.47, H * 0.02, 20, 0, H * 0.90, 0, palette, sel);
  basinRim.scale.z = scaleZ;
  // Faucet stem
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.08, D * 0.04, 0, H * 0.94, -D * 0.30, palette, sel);
  // Faucet spout
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.02, D * 0.12, 0, H * 0.96, -D * 0.18, palette, sel);
}

function buildTableFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_table';
  // Tabletop
  addBox(group, mat, W, H * 0.05, D, 0, H * 0.975, 0, palette, sel);
  // Front apron
  addBox(group, mat, W * 0.90, H * 0.06, D * 0.03, 0, H * 0.92, D * 0.44, palette, sel);
  // Back apron
  addBox(group, mat, W * 0.90, H * 0.06, D * 0.03, 0, H * 0.92, -D * 0.44, palette, sel);
  // Left apron
  addBox(group, 'fixtureAccentWood', W * 0.03, H * 0.06, D * 0.80, -W * 0.44, H * 0.92, 0, palette, sel);
  // Right apron
  addBox(group, 'fixtureAccentWood', W * 0.03, H * 0.06, D * 0.80, W * 0.44, H * 0.92, 0, palette, sel);
  // 4 legs
  const legR = W * 0.02;
  const legH = H * 0.88;
  const legY = H * 0.44;
  const legPositions = [
    { x: -W * 0.43, z: -D * 0.40 },
    { x: -W * 0.43, z: D * 0.40 },
    { x: W * 0.43, z: -D * 0.40 },
    { x: W * 0.43, z: D * 0.40 },
  ];
  for (const lp of legPositions) {
    addCylinder(group, 'fixtureAccentWood', legR, legR, legH, 8, lp.x, legY, lp.z, palette, sel);
  }
}

function buildTvFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_tv';
  // Screen panel
  addBox(group, mat, W, H * 0.56, D * 0.3, 0, H * 0.72, 0, palette, sel);
  // Bezel top
  addBox(group, 'fixtureAccentDark', W * 1.01, H * 0.012, D * 0.35, 0, H * 1.00, 0, palette, sel);
  // Bezel bottom
  addBox(group, 'fixtureAccentDark', W * 1.01, H * 0.025, D * 0.35, 0, H * 0.435, 0, palette, sel);
  // Stand neck
  addBox(group, 'fixtureAccentMetal', W * 0.04, H * 0.15, D * 0.5, 0, H * 0.365, 0, palette, sel);
  // Stand base
  addBox(group, 'fixtureAccentMetal', W * 0.30, H * 0.02, D * 1.8, 0, H * 0.01, 0, palette, sel);
}

function buildSofaFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_sofa';
  // Base frame
  addBox(group, mat, W, H * 0.15, D, 0, H * 0.075, 0, palette, sel);
  // Backrest
  addBox(group, mat, W * 0.92, H * 0.52, D * 0.20, 0, H * 0.50, -D * 0.40, palette, sel);
  // Left armrest
  addBox(group, mat, W * 0.06, H * 0.38, D * 0.85, -W * 0.47, H * 0.34, D * 0.05, palette, sel);
  // Right armrest
  addBox(group, mat, W * 0.06, H * 0.38, D * 0.85, W * 0.47, H * 0.34, D * 0.05, palette, sel);
  // 3 seat cushions
  const cushionW = W * 0.28;
  const cushionH = H * 0.14;
  const cushionD = D * 0.58;
  const cushionY = H * 0.22;
  const cushionZ = D * 0.10;
  for (const cx of [-W * 0.28, 0, W * 0.28]) {
    addBox(group, 'fixtureAccentFabric', cushionW, cushionH, cushionD, cx, cushionY, cushionZ, palette, sel);
  }
}

function buildBedFixture(group, W, H, D, palette, sel) {
  const mat = 'fixture_bed';
  // Bed frame
  addBox(group, mat, W, H * 0.30, D, 0, H * 0.15, 0, palette, sel);
  // Headboard
  addBox(group, 'fixtureAccentWood', W, H * 0.65, D * 0.04, 0, H * 0.325, -D * 0.48, palette, sel);
  // Mattress (slightly inset, sits on frame)
  addBox(group, mat, W * 0.94, H * 0.30, D * 0.90, 0, H * 0.45, D * 0.03, palette, sel);
  // Left pillow
  addBox(group, 'fixtureAccentCeramic', W * 0.32, H * 0.12, D * 0.16, -W * 0.22, H * 0.66, -D * 0.36, palette, sel);
  // Right pillow
  addBox(group, 'fixtureAccentCeramic', W * 0.32, H * 0.12, D * 0.16, W * 0.22, H * 0.66, -D * 0.36, palette, sel);
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

function createFixtureObject(descriptor, materialPalette, isSelected) {
  const builder = FIXTURE_BUILDERS[descriptor.fixtureType];
  if (!builder) {
    return createBoxObject(descriptor, materialPalette, isSelected);
  }

  const group = new THREE.Group();
  const W = descriptor.size.x;
  const H = descriptor.size.y;
  const D = descriptor.size.z;

  builder(group, W, H, D, materialPalette, isSelected);

  group.position.copy(planPointToWorld(descriptor.center, descriptor.baseElevation));
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Railing ──

function createRailingObject(descriptor, materialPalette, isSelected) {
  const group = new THREE.Group();
  const { x: length, y: height, z: width } = descriptor.size;
  const railingType = descriptor.railingType || 'handrail';
  const railHeight = 50; // handrail tube diameter
  const postWidth = 30;

  if (railingType === 'glass') {
    // Top metal rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth,
      0, height - railHeight / 2, 0, materialPalette, isSelected);
    // Bottom metal rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth,
      0, railHeight / 2, 0, materialPalette, isSelected);
    // Glass panel (full height between rails, no outline for clean look)
    const glassH = height - railHeight * 2;
    const glassGeo = new THREE.BoxGeometry(
      Math.max(length, 1), Math.max(glassH, 1), Math.max(width * 0.3, 1)
    );
    const glassMesh = new THREE.Mesh(glassGeo,
      createMeshMaterial(materialPalette, 'railing_glass', isSelected));
    glassMesh.position.set(0, height / 2, 0);
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = true;
    group.add(glassMesh);
  } else if (railingType === 'guardrail') {
    // Solid opaque panel
    addBox(group, 'railing_guardrail', length, height, width,
      0, height / 2, 0, materialPalette, isSelected);
  } else {
    // handrail: top rail + vertical balusters
    // Top rail
    addBox(group, 'railing_handrail', length, railHeight, postWidth,
      0, height - railHeight / 2, 0, materialPalette, isSelected);
    // Balusters spaced ~300mm apart
    const spacing = 300;
    const postCount = Math.max(2, Math.floor(length / spacing) + 1);
    const actualSpacing = length / (postCount - 1);
    for (let i = 0; i < postCount; i++) {
      const px = -length / 2 + i * actualSpacing;
      addCylinder(group, 'railing_handrail',
        postWidth / 2, postWidth / 2, height - railHeight, 8,
        px, (height - railHeight) / 2, 0, materialPalette, isSelected);
    }
  }

  // Position and rotate
  const center = planPointToWorld(
    descriptor.center,
    descriptor.baseElevation
  );
  group.position.copy(center);
  group.rotation.y = planAngleToWorldRotation(descriptor.rotation);

  return group;
}

// ── Dispatcher ──

function createObjectForDescriptor(descriptor, materialPalette, isSelected) {
  if (descriptor.geometry === 'prism') {
    return createPrismObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'roofMesh') {
    return createRoofMeshObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'stair') {
    return createStairObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'segment3d') {
    return createSegment3DObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'window') {
    return createWindowObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'railing') {
    return createRailingObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'fixture') {
    return createFixtureObject(descriptor, materialPalette, isSelected);
  }

  return createBoxObject(descriptor, materialPalette, isSelected);
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

export function buildPreviewObjectRoot(sceneDescriptor, materialPalette, selection = null) {
  const root = new THREE.Group();
  root.name = 'preview-root';

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
      const isSelected = matchesSelection(descriptor, selection);
      const object = createObjectForDescriptor(descriptor, materialPalette, isSelected);
      object.name = descriptor.id;
      object.userData = {
        id: descriptor.id,
        kind: descriptor.kind,
        metadata: descriptor.metadata,
      };
      assignPreviewMetadata(object, descriptor, floor);
      floorGroup.add(object);
    }

    root.add(floorGroup);
  }

  return root;
}
