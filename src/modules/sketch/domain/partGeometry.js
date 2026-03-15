/**
 * Centralized part geometry extraction — pure functions, no React/Three.js deps.
 * Replaces duplicated getPartDimensions in drawingPlane.js and extrusion.js.
 */

import { getSolidBounds, getSolidEdgeMidpoints, getSolidFaceCenters, getSolidVertices } from './solidGeometry';

/**
 * Get uniform dimensions for any part type.
 * @param {Object} part
 * @returns {{ width: number, depth: number, height: number }}
 */
export function getPartDimensions(part) {
  switch (part.type) {
    case 'panel':
      return { width: part.width, depth: part.depth, height: part.thickness };
    case 'leg':
      return { width: part.width, depth: part.depth, height: part.height };
    case 'frame': {
      const w = part.axis === 'y' ? part.width : part.length;
      const d = part.axis === 'y' ? part.length : part.width;
      return { width: w, depth: d, height: part.height };
    }
    case 'solid': {
      const bounds = getSolidBounds(part);
      return {
        width: bounds.max.x - bounds.min.x,
        depth: bounds.max.y - bounds.min.y,
        height: bounds.max.z - bounds.min.z,
      };
    }
    default:
      return { width: part.width || 100, depth: part.depth || 100, height: part.height || part.thickness || 18 };
  }
}

/**
 * Get the 8 corner points of a part's bounding box in domain coordinates.
 * @param {Object} part
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function getPartCorners(part) {
  if (part.type === 'solid') {
    const { base, top } = getSolidVertices(part);
    return [...base, ...top];
  }

  const { position } = part;
  const dims = getPartDimensions(part);
  const x0 = position.x;
  const y0 = position.y;
  const z0 = position.z;
  const x1 = x0 + dims.width;
  const y1 = y0 + dims.depth;
  const z1 = z0 + dims.height;

  return [
    { x: x0, y: y0, z: z0 },
    { x: x1, y: y0, z: z0 },
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x0, y: y0, z: z1 },
    { x: x1, y: y0, z: z1 },
    { x: x0, y: y1, z: z1 },
    { x: x1, y: y1, z: z1 },
  ];
}

/**
 * Get the 12 edge midpoints of a part's bounding box.
 * @param {Object} part
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function getPartEdgeMidpoints(part) {
  if (part.type === 'solid') {
    return getSolidEdgeMidpoints(part);
  }

  const { position } = part;
  const dims = getPartDimensions(part);
  const x0 = position.x;
  const y0 = position.y;
  const z0 = position.z;
  const x1 = x0 + dims.width;
  const y1 = y0 + dims.depth;
  const z1 = z0 + dims.height;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const mz = (z0 + z1) / 2;

  return [
    // Bottom face edges (z=z0)
    { x: mx, y: y0, z: z0 },
    { x: mx, y: y1, z: z0 },
    { x: x0, y: my, z: z0 },
    { x: x1, y: my, z: z0 },
    // Top face edges (z=z1)
    { x: mx, y: y0, z: z1 },
    { x: mx, y: y1, z: z1 },
    { x: x0, y: my, z: z1 },
    { x: x1, y: my, z: z1 },
    // Vertical edges
    { x: x0, y: y0, z: mz },
    { x: x1, y: y0, z: mz },
    { x: x0, y: y1, z: mz },
    { x: x1, y: y1, z: mz },
  ];
}

/**
 * Get the 6 face centers of a part's bounding box.
 * @param {Object} part
 * @returns {Array<{x: number, y: number, z: number, faceId: string}>}
 */
export function getPartFaceCenters(part) {
  if (part.type === 'solid') {
    return getSolidFaceCenters(part);
  }

  const { position } = part;
  const dims = getPartDimensions(part);
  const cx = position.x + dims.width / 2;
  const cy = position.y + dims.depth / 2;
  const cz = position.z + dims.height / 2;

  return [
    { x: cx, y: cy, z: position.z + dims.height, faceId: '+z' },
    { x: cx, y: cy, z: position.z, faceId: '-z' },
    { x: position.x + dims.width, y: cy, z: cz, faceId: '+x' },
    { x: position.x, y: cy, z: cz, faceId: '-x' },
    { x: cx, y: position.y + dims.depth, z: cz, faceId: '+y' },
    { x: cx, y: position.y, z: cz, faceId: '-y' },
  ];
}

/**
 * Get the 4 corner points of a specific face.
 * @param {Object} part
 * @param {string} faceId - '+x', '-x', '+y', '-y', '+z', '-z'
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function getPartFaceCorners(part, faceId) {
  if (part.type === 'solid') {
    const { base, top } = getSolidVertices(part);
    const bounds = getSolidBounds(part);

    const normal = part.plane?.normal || { x: 0, y: 0, z: 1 };
    const normalFace = Math.abs(normal.x) > 0.9
      ? (normal.x >= 0 ? '+x' : '-x')
      : Math.abs(normal.y) > 0.9
        ? (normal.y >= 0 ? '+y' : '-y')
        : (normal.z >= 0 ? '+z' : '-z');
    const oppositeFace = normalFace.startsWith('+')
      ? `-${normalFace.slice(1)}`
      : `+${normalFace.slice(1)}`;

    if (faceId === oppositeFace) return base;
    if (faceId === normalFace) return top;

    const x0 = bounds.min.x;
    const y0 = bounds.min.y;
    const z0 = bounds.min.z;
    const x1 = bounds.max.x;
    const y1 = bounds.max.y;
    const z1 = bounds.max.z;

    switch (faceId) {
      case '+z': return [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }];
      case '-z': return [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }];
      case '+x': return [{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }];
      case '-x': return [{ x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }];
      case '+y': return [{ x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }];
      case '-y': return [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }];
      default: return [];
    }
  }

  const { position } = part;
  const dims = getPartDimensions(part);
  const x0 = position.x;
  const y0 = position.y;
  const z0 = position.z;
  const x1 = x0 + dims.width;
  const y1 = y0 + dims.depth;
  const z1 = z0 + dims.height;

  switch (faceId) {
    case '+z': return [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }];
    case '-z': return [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }];
    case '+x': return [{ x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z1 }];
    case '-x': return [{ x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y0, z: z1 }];
    case '+y': return [{ x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }];
    case '-y': return [{ x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }, { x: x0, y: y0, z: z1 }];
    default: return [];
  }
}
