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

function createShape(outline) {
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
  const geometry = new THREE.ExtrudeGeometry(createShape(descriptor.outline), {
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

function createObjectForDescriptor(descriptor, materialPalette, isSelected) {
  if (descriptor.geometry === 'prism') {
    return createPrismObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'stair') {
    return createStairObject(descriptor, materialPalette, isSelected);
  }

  if (descriptor.geometry === 'window') {
    return createWindowObject(descriptor, materialPalette, isSelected);
  }

  return createBoxObject(descriptor, materialPalette, isSelected);
}

function matchesSelection(descriptor, selection) {
  if (!selection?.selectedId || selection.selectedType !== descriptor.kind) return false;
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
