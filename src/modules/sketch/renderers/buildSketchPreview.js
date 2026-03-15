import * as THREE from 'three';
import { getSolidPlane } from '../domain/solidGeometry';
import { CONSTRUCTION_ANNOTATION_TYPES } from '../domain/constructionModels';

const SELECTED_TINT = 0xB8860B;
const EDGE_COLOR = 0x1a1a1a;
const GUIDE_COLOR = 0x4682B4;
const REFERENCE_PLANE_COLOR = 0x3A6EA5;
const SECTION_PLANE_COLOR = 0xC05A3E;

const MATERIAL_APPEARANCE = {
  plywood:       { color: 0xD2B48C, roughness: 0.75, metalness: 0.02 },
  mdf:           { color: 0xC4A882, roughness: 0.85, metalness: 0.0  },
  particleboard: { color: 0xBFA76A, roughness: 0.9,  metalness: 0.0  },
  hardwood:      { color: 0x8B6914, roughness: 0.6,  metalness: 0.03 },
  softwood:      { color: 0xDEB887, roughness: 0.7,  metalness: 0.02 },
  metal:         { color: 0xA8A8A8, roughness: 0.3,  metalness: 0.8  },
};

const DEFAULT_APPEARANCE = {
  panel:  MATERIAL_APPEARANCE.plywood,
  leg:    { color: 0x8B7355, roughness: 0.6,  metalness: 0.03 },
  frame:  { color: 0xA0522D, roughness: 0.6,  metalness: 0.03 },
  solid:  { color: 0xC6A46A, roughness: 0.7,  metalness: 0.05 },
  mesh3d: { color: 0xC6A46A, roughness: 0.7,  metalness: 0.05 },
};

function getMaterialAppearance(material, partType) {
  if (material && MATERIAL_APPEARANCE[material]) return MATERIAL_APPEARANCE[material];
  return DEFAULT_APPEARANCE[partType] || MATERIAL_APPEARANCE.plywood;
}

function createPartMaterial(part, isSelected) {
  const appearance = getMaterialAppearance(part.material, part.type);
  return new THREE.MeshStandardMaterial({
    color: isSelected ? SELECTED_TINT : appearance.color,
    roughness: appearance.roughness,
    metalness: appearance.metalness,
  });
}

/**
 * Face index mapping for BoxGeometry.
 * Three.js BoxGeometry has 6 groups (2 triangles each):
 * group 0: +x, group 1: -x, group 2: +y, group 3: -y, group 4: +z, group 5: -z
 */
const BOX_FACE_IDS = ['+x', '-x', '+y', '-y', '+z', '-z'];

function createBoxMesh(width, height, depth, material) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.faceIds = BOX_FACE_IDS;
  return mesh;
}

function createCylinderMesh(diameter, height, material) {
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 16);
  return new THREE.Mesh(geometry, material);
}

function addEdges(mesh) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.7 })
  );
  mesh.add(line);
}

function domainPointToThree(point) {
  return new THREE.Vector3(point.x, point.z, point.y);
}

function domainVectorToThree(vector) {
  return new THREE.Vector3(vector.x, vector.z, vector.y);
}

function createGuidePointMesh(annotation, isSelected) {
  const geometry = new THREE.SphereGeometry(isSelected ? 10 : 7, 12, 12);
  const material = new THREE.MeshBasicMaterial({
    color: isSelected ? SELECTED_TINT : GUIDE_COLOR,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(domainPointToThree(annotation.position || { x: 0, y: 0, z: 0 }));
  mesh.renderOrder = 950;
  return mesh;
}

function createGuideLineMesh(annotation, isSelected) {
  const start = domainPointToThree(annotation.startPoint || { x: 0, y: 0, z: 0 });
  const end = domainPointToThree(annotation.endPoint || { x: 0, y: 0, z: 0 });
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineDashedMaterial({
    color: isSelected ? SELECTED_TINT : GUIDE_COLOR,
    transparent: true,
    opacity: 0.8,
    dashSize: 40,
    gapSize: 18,
    depthTest: false,
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 949;
  return line;
}

function createPlaneAnnotationMesh(annotation, isSelected) {
  const plane = annotation.plane;
  if (!plane) return null;

  const size = Math.max(200, Number(annotation.size) || 0);
  const color = annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
    ? SECTION_PLANE_COLOR
    : REFERENCE_PLANE_COLOR;
  const opacity = annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
    ? (annotation.enabled === false ? 0.1 : 0.18)
    : 0.12;

  const fillMaterial = new THREE.MeshBasicMaterial({
    color: isSelected ? SELECTED_TINT : color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? SELECTED_TINT : color,
    transparent: true,
    opacity: 0.65,
    depthTest: false,
  });

  const planeGeometry = new THREE.PlaneGeometry(size, size, 1, 1);
  const mesh = new THREE.Mesh(planeGeometry, fillMaterial);
  const basis = new THREE.Matrix4().makeBasis(
    domainVectorToThree(plane.uAxis),
    domainVectorToThree(plane.vAxis),
    domainVectorToThree(plane.normal)
  );
  basis.setPosition(domainPointToThree(plane.origin));
  mesh.applyMatrix4(basis);
  mesh.renderOrder = 930;

  const edges = new THREE.EdgesGeometry(planeGeometry);
  const outline = new THREE.LineSegments(edges, outlineMaterial);
  outline.applyMatrix4(basis);
  outline.renderOrder = 931;

  const group = new THREE.Group();
  group.add(mesh);
  group.add(outline);
  return group;
}

/**
 * Apply domain rotation to a mesh.
 * Domain rotation (x, y, z) maps to Three.js as (x, z, y).
 */
function applyPartRotation(mesh, part) {
  const rot = part.rotation;
  if (!rot) return;
  if (rot.x === 0 && rot.y === 0 && rot.z === 0) return;
  // Domain x -> Three x, domain y -> Three z, domain z -> Three y
  mesh.rotation.set(rot.x, rot.z, rot.y);
}

/**
 * Apply domain flip to a mesh.
 * Flip is a boolean {x, y, z} — negative scale on the corresponding Three.js axis.
 * When an odd number of axes is flipped, face winding inverts, so we use DoubleSide.
 */
function applyPartFlip(mesh, part) {
  const flip = part.flip;
  if (!flip || (!flip.x && !flip.y && !flip.z)) return;
  // Domain x -> Three x, domain y -> Three z, domain z -> Three y
  mesh.scale.set(
    flip.x ? -1 : 1,
    flip.z ? -1 : 1,
    flip.y ? -1 : 1
  );
  const flippedCount = (flip.x ? 1 : 0) + (flip.y ? 1 : 0) + (flip.z ? 1 : 0);
  if (flippedCount % 2 === 1) {
    mesh.traverse((child) => {
      if (child.material) child.material.side = THREE.DoubleSide;
    });
  }
}

function createPanelMesh(part, isSelected) {
  const material = createPartMaterial(part, isSelected);
  const mesh = createBoxMesh(part.width, part.thickness, part.depth, material);
  mesh.position.set(
    part.position.x + part.width / 2,
    part.position.z + part.thickness / 2,
    part.position.y + part.depth / 2
  );
  applyPartRotation(mesh, part);
  applyPartFlip(mesh, part);
  addEdges(mesh);
  return mesh;
}

function createLegMesh(part, isSelected) {
  const material = createPartMaterial(part, isSelected);

  if (part.profile === 'round') {
    const mesh = createCylinderMesh(part.width, part.height, material);
    mesh.position.set(
      part.position.x + part.width / 2,
      part.position.z + part.height / 2,
      part.position.y + part.depth / 2
    );
    applyPartRotation(mesh, part);
    applyPartFlip(mesh, part);
    addEdges(mesh);
    return mesh;
  }

  const mesh = createBoxMesh(part.width, part.height, part.depth, material);
  mesh.position.set(
    part.position.x + part.width / 2,
    part.position.z + part.height / 2,
    part.position.y + part.depth / 2
  );
  applyPartRotation(mesh, part);
  applyPartFlip(mesh, part);
  addEdges(mesh);
  return mesh;
}

function createFrameMesh(part, isSelected) {
  const material = createPartMaterial(part, isSelected);
  let w, h, d;

  if (part.axis === 'y') {
    w = part.width;
    h = part.height;
    d = part.length;
  } else {
    w = part.length;
    h = part.height;
    d = part.width;
  }

  const mesh = createBoxMesh(w, h, d, material);
  mesh.position.set(
    part.position.x + w / 2,
    part.position.z + h / 2,
    part.position.y + d / 2
  );
  applyPartRotation(mesh, part);
  applyPartFlip(mesh, part);
  addEdges(mesh);
  return mesh;
}

function createSolidMesh(part, isSelected) {
  const material = createPartMaterial(part, isSelected);
  const shape = new THREE.Shape();
  const points = part.profilePoints || [];
  if (points.length < 3) return null;

  shape.moveTo(points[0].u, points[0].v);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index].u, points[index].v);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1, part.extrusionDepth || 120),
    bevelEnabled: false,
    steps: 1,
  });
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);

  const plane = getSolidPlane(part);
  const origin = domainPointToThree(plane.origin);
  const uAxis = domainVectorToThree(plane.uAxis);
  const vAxis = domainVectorToThree(plane.vAxis);
  const normal = domainVectorToThree(plane.normal);
  const basis = new THREE.Matrix4().makeBasis(uAxis, vAxis, normal);
  basis.setPosition(origin);
  mesh.applyMatrix4(basis);
  applyPartFlip(mesh, part);
  addEdges(mesh);
  return mesh;
}

function createMesh3dMesh(part, isSelected) {
  const material = createPartMaterial(part, isSelected);
  const vertices = part.vertices3d || [];
  if (vertices.length < 3) return null;

  // Convert domain vertices to Three.js coords
  const threeVerts = vertices.map((v) => new THREE.Vector3(v.x, v.z, v.y));

  // Compute best-fit plane normal via Newell's method
  const normal = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < threeVerts.length; i++) {
    const curr = threeVerts[i];
    const next = threeVerts[(i + 1) % threeVerts.length];
    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }
  normal.normalize();
  if (normal.lengthSq() < 0.001) {
    normal.set(0, 1, 0);
  }

  // Build a local 2D coordinate system for triangulation
  const uDir = new THREE.Vector3();
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);
  const up = (absY <= absX && absY <= absZ) ? new THREE.Vector3(0, 1, 0)
    : (absX <= absZ) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  uDir.crossVectors(up, normal).normalize();
  const vDir = new THREE.Vector3().crossVectors(normal, uDir).normalize();

  const centroid = new THREE.Vector3(0, 0, 0);
  for (const v of threeVerts) centroid.add(v);
  centroid.divideScalar(threeVerts.length);

  // Project to 2D
  const pts2d = threeVerts.map((v) => {
    const d = new THREE.Vector3().subVectors(v, centroid);
    return new THREE.Vector2(d.dot(uDir), d.dot(vDir));
  });

  // Triangulate via THREE.ShapeUtils
  const shape = new THREE.Shape(pts2d);
  const triangleIndices = THREE.ShapeUtils.triangulateShape(pts2d, []);

  // Build front face geometry
  const positions = [];
  const indices = [];
  for (let i = 0; i < threeVerts.length; i++) {
    positions.push(threeVerts[i].x, threeVerts[i].y, threeVerts[i].z);
  }
  for (const tri of triangleIndices) {
    indices.push(tri[0], tri[1], tri[2]);
  }

  const thickness = part.thickness || 0;
  if (thickness > 0) {
    // Add offset surface (back face)
    const offset = normal.clone().multiplyScalar(thickness);
    const nVerts = threeVerts.length;
    for (let i = 0; i < threeVerts.length; i++) {
      const v = threeVerts[i].clone().add(offset);
      positions.push(v.x, v.y, v.z);
    }
    // Back face triangles (reversed winding)
    for (const tri of triangleIndices) {
      indices.push(tri[0] + nVerts, tri[2] + nVerts, tri[1] + nVerts);
    }
    // Side faces connecting front and back
    for (let i = 0; i < nVerts; i++) {
      const i2 = (i + 1) % nVerts;
      const a = i, b = i2, c = i2 + nVerts, d = i + nVerts;
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  material.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geometry, material);
  addEdges(mesh);
  return mesh;
}

const DIMENSION_COLOR = 0x1E2433;

function createDimensionMesh(part) {
  const start = domainPointToThree(part.startPoint);
  const end = domainPointToThree(part.endPoint);

  const group = new THREE.Group();

  // Main line
  const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
  const lineMat = new THREE.LineBasicMaterial({ color: DIMENSION_COLOR, linewidth: 1, depthTest: false });
  const line = new THREE.Line(lineGeom, lineMat);
  line.renderOrder = 900;
  group.add(line);

  // Endpoints
  const dotGeom = new THREE.SphereGeometry(3, 6, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: DIMENSION_COLOR, depthTest: false });
  const dotStart = new THREE.Mesh(dotGeom, dotMat);
  dotStart.position.copy(start);
  dotStart.renderOrder = 901;
  group.add(dotStart);
  const dotEnd = new THREE.Mesh(dotGeom, dotMat);
  dotEnd.position.copy(end);
  dotEnd.renderOrder = 901;
  group.add(dotEnd);

  // Distance label as sprite
  const dx = part.endPoint.x - part.startPoint.x;
  const dy = part.endPoint.y - part.startPoint.y;
  const dz = part.endPoint.z - part.startPoint.z;
  const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#1E2433';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${distance} mm`, 64, 16);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  midpoint.y += 15; // offset above line
  sprite.position.copy(midpoint);
  sprite.scale.set(80, 20, 1);
  sprite.renderOrder = 902;
  group.add(sprite);

  return group;
}

function isPartSelected(part, selection) {
  if (!selection) return false;
  if (selection.selectedType === 'object') return part.objectId === selection.selectedId;
  if (selection.selectedType === 'assembly') return part.assemblyId === selection.selectedId;
  return part.id === selection.selectedId;
}

function isAnnotationSelected(annotation, selection) {
  return selection?.selectedType === 'annotation' && selection?.selectedId === annotation.id;
}

export function buildSketchPreviewRoot(parts, selection, annotations = []) {
  const root = new THREE.Group();

  for (const part of parts) {
    // Skip cutout, hole in 3D
    if (part.type === 'cutout' || part.type === 'hole') continue;

    const isSelected = isPartSelected(part, selection);
    let mesh;

    switch (part.type) {
      case 'panel':
        mesh = createPanelMesh(part, isSelected);
        break;
      case 'leg':
        mesh = createLegMesh(part, isSelected);
        break;
      case 'frame':
        mesh = createFrameMesh(part, isSelected);
        break;
      case 'solid':
        mesh = createSolidMesh(part, isSelected);
        break;
      case 'mesh3d':
        mesh = createMesh3dMesh(part, isSelected);
        break;
      case 'dimension':
        mesh = createDimensionMesh(part);
        break;
      default:
        continue;
    }

    if (mesh) {
      mesh.userData.previewTarget = { sourceId: part.id, kind: 'part' };
      root.add(mesh);
    }
  }

  for (const annotation of annotations || []) {
    if (!annotation || annotation.visible === false) continue;

    const isSelected = isAnnotationSelected(annotation, selection);
    let mesh = null;

    switch (annotation.type) {
      case CONSTRUCTION_ANNOTATION_TYPES.GUIDE_POINT:
        mesh = createGuidePointMesh(annotation, isSelected);
        break;
      case CONSTRUCTION_ANNOTATION_TYPES.GUIDE_LINE:
        mesh = createGuideLineMesh(annotation, isSelected);
        break;
      case CONSTRUCTION_ANNOTATION_TYPES.REFERENCE_PLANE:
      case CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE:
        mesh = createPlaneAnnotationMesh(annotation, isSelected);
        break;
      default:
        break;
    }

    if (mesh) {
      root.add(mesh);
    }
  }

  return root;
}
