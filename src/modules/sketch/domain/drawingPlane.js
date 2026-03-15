/**
 * Drawing plane geometry - pure functions, no React/Three.js dependencies.
 * A drawing plane defines a 2D coordinate system embedded in 3D space.
 */

import { getPartDimensions } from './partGeometry';
import { getSolidPlane } from './solidGeometry';

function crossProduct(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-10) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Create a drawing plane oriented perpendicular to the camera direction.
 * @param {Object} cameraDirDomain - Normalized camera direction in domain coords {x,y,z}
 * @param {Object} originDomain - Origin point in domain coords {x,y,z}
 */
export function cameraPlaneFromDirection(cameraDirDomain, originDomain) {
  const normal = normalize(cameraDirDomain);
  const worldUp = { x: 0, y: 0, z: 1 };

  // Check if camera is looking straight up or down
  const dot = Math.abs(normal.x * worldUp.x + normal.y * worldUp.y + normal.z * worldUp.z);
  let uAxis;
  if (dot > 0.99) {
    // Fallback: use world Y as "up" reference when looking straight up/down
    uAxis = normalize(crossProduct({ x: 0, y: 1, z: 0 }, normal));
  } else {
    uAxis = normalize(crossProduct(worldUp, normal));
  }
  const vAxis = normalize(crossProduct(normal, uAxis));

  return {
    origin: { ...originDomain },
    normal,
    up: vAxis,
    uAxis,
    vAxis,
    sourcePartId: null,
    sourceFace: null,
  };
}

/** Front plane — looking from -Y toward +Y */
export const FRONT_PLANE = Object.freeze({
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: -1, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  uAxis: { x: 1, y: 0, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  sourcePartId: null,
  sourceFace: null,
});

/** Side plane — looking from +X toward -X */
export const SIDE_PLANE = Object.freeze({
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  uAxis: { x: 0, y: 1, z: 0 },
  vAxis: { x: 0, y: 0, z: 1 },
  sourcePartId: null,
  sourceFace: null,
});

/** Ground plane at Z=0 (domain coords: XY plane) */
export const GROUND_PLANE = Object.freeze({
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  up: { x: 0, y: 1, z: 0 },
  uAxis: { x: 1, y: 0, z: 0 },
  vAxis: { x: 0, y: 1, z: 0 },
  sourcePartId: null,
  sourceFace: null,
});

/**
 * Given a part and a face ID, compute a drawing plane sitting on that face.
 * Face IDs: '+x', '-x', '+y', '-y', '+z', '-z'
 */
export function faceToDrawingPlane(part, faceId) {
  if (part.type === 'solid') {
    const solidPlane = getSolidPlane(part);
    const depth = Number.isFinite(part.extrusionDepth) ? part.extrusionDepth : 120;
    const normalFace = (
      Math.abs(solidPlane.normal.x) > 0.9
        ? (solidPlane.normal.x >= 0 ? '+x' : '-x')
        : Math.abs(solidPlane.normal.y) > 0.9
          ? (solidPlane.normal.y >= 0 ? '+y' : '-y')
          : (solidPlane.normal.z >= 0 ? '+z' : '-z')
    );
    const oppositeFace = normalFace.startsWith('+')
      ? `-${normalFace.slice(1)}`
      : `+${normalFace.slice(1)}`;

    if (faceId === normalFace || faceId === oppositeFace) {
      return {
        origin: faceId === normalFace
          ? {
              x: solidPlane.origin.x + solidPlane.normal.x * depth,
              y: solidPlane.origin.y + solidPlane.normal.y * depth,
              z: solidPlane.origin.z + solidPlane.normal.z * depth,
            }
          : solidPlane.origin,
        normal: solidPlane.normal,
        up: solidPlane.up,
        uAxis: solidPlane.uAxis,
        vAxis: solidPlane.vAxis,
        sourcePartId: part.id,
        sourceFace: faceId,
      };
    }
  }

  const { position } = part;
  const dims = getPartDimensions(part);

  // Center of the part in domain coords
  const cx = position.x + dims.width / 2;
  const cy = position.y + dims.depth / 2;
  const cz = position.z + dims.height / 2;

  let origin, normal, up, uAxis, vAxis;

  switch (faceId) {
    case '+z': // top face
      origin = { x: position.x, y: position.y, z: position.z + dims.height };
      normal = { x: 0, y: 0, z: 1 };
      uAxis = { x: 1, y: 0, z: 0 };
      vAxis = { x: 0, y: 1, z: 0 };
      up = { x: 0, y: 1, z: 0 };
      break;
    case '-z': // bottom face
      origin = { x: position.x, y: position.y, z: position.z };
      normal = { x: 0, y: 0, z: -1 };
      uAxis = { x: 1, y: 0, z: 0 };
      vAxis = { x: 0, y: 1, z: 0 };
      up = { x: 0, y: 1, z: 0 };
      break;
    case '+x': // right face
      origin = { x: position.x + dims.width, y: position.y, z: position.z };
      normal = { x: 1, y: 0, z: 0 };
      uAxis = { x: 0, y: 1, z: 0 };
      vAxis = { x: 0, y: 0, z: 1 };
      up = { x: 0, y: 0, z: 1 };
      break;
    case '-x': // left face
      origin = { x: position.x, y: position.y, z: position.z };
      normal = { x: -1, y: 0, z: 0 };
      uAxis = { x: 0, y: 1, z: 0 };
      vAxis = { x: 0, y: 0, z: 1 };
      up = { x: 0, y: 0, z: 1 };
      break;
    case '+y': // back face
      origin = { x: position.x, y: position.y + dims.depth, z: position.z };
      normal = { x: 0, y: 1, z: 0 };
      uAxis = { x: 1, y: 0, z: 0 };
      vAxis = { x: 0, y: 0, z: 1 };
      up = { x: 0, y: 0, z: 1 };
      break;
    case '-y': // front face
      origin = { x: position.x, y: position.y, z: position.z };
      normal = { x: 0, y: -1, z: 0 };
      uAxis = { x: 1, y: 0, z: 0 };
      vAxis = { x: 0, y: 0, z: 1 };
      up = { x: 0, y: 0, z: 1 };
      break;
    default:
      return { ...GROUND_PLANE };
  }

  return { origin, normal, up, uAxis, vAxis, sourcePartId: part.id, sourceFace: faceId };
}

/**
 * Project a 3D point onto a plane, returning local (u, v) coordinates.
 */
export function projectToPlane(point3d, plane) {
  const dx = point3d.x - plane.origin.x;
  const dy = point3d.y - plane.origin.y;
  const dz = point3d.z - plane.origin.z;
  const u = dx * plane.uAxis.x + dy * plane.uAxis.y + dz * plane.uAxis.z;
  const v = dx * plane.vAxis.x + dy * plane.vAxis.y + dz * plane.vAxis.z;
  return { u, v };
}

/**
 * Convert local (u, v) on a plane back to 3D world coordinates.
 */
export function planeLocalToWorld(u, v, plane) {
  return {
    x: plane.origin.x + u * plane.uAxis.x + v * plane.vAxis.x,
    y: plane.origin.y + u * plane.uAxis.y + v * plane.vAxis.y,
    z: plane.origin.z + u * plane.uAxis.z + v * plane.vAxis.z,
  };
}

/**
 * Map a Three.js face normal (approximate) to a canonical face ID.
 * Three.js coords: x=domain x, y=domain z, z=domain y
 */
export function identifyFace(threeNormal) {
  const ax = Math.abs(threeNormal.x);
  const ay = Math.abs(threeNormal.y);
  const az = Math.abs(threeNormal.z);

  if (ay >= ax && ay >= az) {
    return threeNormal.y > 0 ? '+z' : '-z'; // Three.js Y = domain Z
  }
  if (ax >= ay && ax >= az) {
    return threeNormal.x > 0 ? '+x' : '-x';
  }
  return threeNormal.z > 0 ? '+y' : '-y'; // Three.js Z = domain Y
}
