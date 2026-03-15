import {
  findNearestInference,
  findNearestInferenceOnPlane,
  findNearestFlushSnap,
  computeWorldThreshold,
} from './inferenceEngine';

export function snapToGrid(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point, gridSize) {
  return {
    x: snapToGrid(point.x, gridSize),
    y: snapToGrid(point.y, gridSize),
  };
}

/**
 * Snap a 3D point to the nearest grid intersection on a given plane.
 * Projects to plane local coords, snaps, then converts back.
 */
export function snapPoint3d(point, gridSize, plane) {
  if (!plane) {
    return {
      x: snapToGrid(point.x, gridSize),
      y: snapToGrid(point.y, gridSize),
      z: snapToGrid(point.z, gridSize),
    };
  }

  // Project point onto plane local coords
  const dx = point.x - plane.origin.x;
  const dy = point.y - plane.origin.y;
  const dz = point.z - plane.origin.z;
  const u = dx * plane.uAxis.x + dy * plane.uAxis.y + dz * plane.uAxis.z;
  const v = dx * plane.vAxis.x + dy * plane.vAxis.y + dz * plane.vAxis.z;

  // Snap in local coords
  const su = snapToGrid(u, gridSize);
  const sv = snapToGrid(v, gridSize);

  // Convert back to world
  return {
    x: plane.origin.x + su * plane.uAxis.x + sv * plane.vAxis.x,
    y: plane.origin.y + su * plane.uAxis.y + sv * plane.vAxis.y,
    z: plane.origin.z + su * plane.uAxis.z + sv * plane.vAxis.z,
  };
}

/**
 * Smart 3D snap — inference-first, then grid fallback.
 *
 * @param {{x: number, y: number, z: number}} point - Raw cursor position in domain coords
 * @param {Object} options
 * @param {Array} [options.inferencePoints] - Pre-collected inference points
 * @param {number} [options.gridSize] - Grid snap size in mm (default 50)
 * @param {Object} [options.plane] - Drawing plane (for on-plane inference)
 * @param {Object} [options.camera] - Three.js camera (for screen-space threshold)
 * @param {Object} [options.domElement] - Renderer DOM element
 * @param {number} [options.screenPx] - Screen-space threshold in px (default 15)
 * @param {Array} [options.flushPoints] - Pre-computed flush snap points
 * @returns {import('./inferenceEngine').SnapResult}
 */
export function smartSnap3d(point, options = {}) {
  const {
    inferencePoints,
    gridSize = 50,
    plane,
    camera,
    domElement,
    screenPx = 15,
    flushPoints,
  } = options;

  const thresholdMm = (camera && domElement)
    ? computeWorldThreshold(camera, domElement, screenPx, point)
    : gridSize; // fallback: use grid size as threshold

  // 1. Try point inference snap first (corner > midpoint > faceCenter)
  if (inferencePoints && inferencePoints.length > 0) {
    const inferenceResult = plane
      ? findNearestInferenceOnPlane(point, inferencePoints, plane, thresholdMm)
      : findNearestInference(point, inferencePoints, thresholdMm);

    if (inferenceResult) {
      return inferenceResult;
    }
  }

  // 2. Try flush face snap (single-axis, parts butt up against each other)
  if (flushPoints && flushPoints.length > 0) {
    const flushResult = findNearestFlushSnap(point, flushPoints, thresholdMm);
    if (flushResult) {
      return flushResult;
    }
  }

  // 3. Fall back to grid snap
  const gridSnapped = plane
    ? snapPoint3d(point, gridSize, plane)
    : {
        x: snapToGrid(point.x, gridSize),
        y: snapToGrid(point.y, gridSize),
        z: snapToGrid(point.z, gridSize),
      };

  return {
    point: gridSnapped,
    inference: null,
    snapped: true,
  };
}
