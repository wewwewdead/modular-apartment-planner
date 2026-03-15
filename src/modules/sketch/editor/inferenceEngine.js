/**
 * Inference engine — pure-function snap system for 3D sketch tools.
 * Works entirely in domain coordinates (x=width, y=depth, z=height).
 * No Three.js dependency.
 */

import { getPartCorners, getPartEdgeMidpoints, getPartFaceCenters, getPartDimensions } from '../domain/partGeometry';
import { CONSTRUCTION_ANNOTATION_TYPES } from '../domain/constructionModels';

/**
 * @typedef {Object} InferencePoint
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {'corner'|'midpoint'|'faceCenter'|'faceFlush'|'guidePoint'|'guideEndpoint'|'guideMidpoint'|'planeOrigin'|'planeCorner'} type
 * @property {string|null} partId
 * @property {string|null} [annotationId]
 * @property {string} [faceId] - Only set for faceCenter/faceFlush type
 */

/**
 * @typedef {Object} FlushSnapPoint
 * @property {'x'|'y'|'z'} faceAxis - The axis this flush snap constrains
 * @property {number} faceCoord - The origin coordinate for the moving part on faceAxis
 * @property {'faceFlush'} type
 * @property {string} partId - Static part ID
 * @property {string} faceId - Static part's face (e.g. '+x')
 * @property {string} movingFaceId - Moving part's opposing face (e.g. '-x')
 */

/**
 * @typedef {Object} SnapResult
 * @property {{x: number, y: number, z: number}} point
 * @property {InferencePoint|null} inference - The matched inference point, or null if grid-snapped
 * @property {boolean} snapped - Whether snap was applied (inference or grid)
 */

/**
 * Collect all inference points from a set of parts.
 * @param {Array} parts - Array of part objects
 * @param {Object} [options]
 * @param {string} [options.excludePartId] - Part to exclude (e.g., the one being dragged)
 * @returns {InferencePoint[]}
 */
export function collectInferencePoints(parts, options = {}) {
  const { excludePartId, annotations = [] } = options;
  const points = [];

  for (const part of parts) {
    if (part.id === excludePartId) continue;
    if (part.type === 'dimension' || part.type === 'cutout' || part.type === 'hole') continue;

    const partId = part.id;

    // Corners (8)
    for (const c of getPartCorners(part)) {
      points.push({ x: c.x, y: c.y, z: c.z, type: 'corner', partId });
    }

    // Edge midpoints (12)
    for (const m of getPartEdgeMidpoints(part)) {
      points.push({ x: m.x, y: m.y, z: m.z, type: 'midpoint', partId });
    }

    // Face centers (6)
    for (const fc of getPartFaceCenters(part)) {
      points.push({ x: fc.x, y: fc.y, z: fc.z, type: 'faceCenter', partId, faceId: fc.faceId });
    }
  }

  for (const annotation of annotations) {
    if (!annotation || annotation.visible === false) continue;

    if (annotation.type === CONSTRUCTION_ANNOTATION_TYPES.GUIDE_POINT && annotation.position) {
      points.push({
        x: annotation.position.x,
        y: annotation.position.y,
        z: annotation.position.z,
        type: 'guidePoint',
        partId: null,
        annotationId: annotation.id,
      });
      continue;
    }

    if (annotation.type === CONSTRUCTION_ANNOTATION_TYPES.GUIDE_LINE && annotation.startPoint && annotation.endPoint) {
      const midpoint = {
        x: (annotation.startPoint.x + annotation.endPoint.x) / 2,
        y: (annotation.startPoint.y + annotation.endPoint.y) / 2,
        z: (annotation.startPoint.z + annotation.endPoint.z) / 2,
      };
      points.push({
        x: annotation.startPoint.x,
        y: annotation.startPoint.y,
        z: annotation.startPoint.z,
        type: 'guideEndpoint',
        partId: null,
        annotationId: annotation.id,
      });
      points.push({
        x: annotation.endPoint.x,
        y: annotation.endPoint.y,
        z: annotation.endPoint.z,
        type: 'guideEndpoint',
        partId: null,
        annotationId: annotation.id,
      });
      points.push({
        x: midpoint.x,
        y: midpoint.y,
        z: midpoint.z,
        type: 'guideMidpoint',
        partId: null,
        annotationId: annotation.id,
      });
      continue;
    }

    if (
      (annotation.type === CONSTRUCTION_ANNOTATION_TYPES.REFERENCE_PLANE
        || annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE)
      && annotation.plane
    ) {
      const halfSize = Math.max(100, (Number(annotation.size) || 0) / 2);
      const { origin, uAxis, vAxis } = annotation.plane;
      const planeCorners = [
        { u: -halfSize, v: -halfSize },
        { u: halfSize, v: -halfSize },
        { u: halfSize, v: halfSize },
        { u: -halfSize, v: halfSize },
      ].map(({ u, v }) => ({
        x: origin.x + u * uAxis.x + v * vAxis.x,
        y: origin.y + u * uAxis.y + v * vAxis.y,
        z: origin.z + u * uAxis.z + v * vAxis.z,
      }));

      points.push({
        x: origin.x,
        y: origin.y,
        z: origin.z,
        type: 'planeOrigin',
        partId: null,
        annotationId: annotation.id,
      });

      for (const corner of planeCorners) {
        points.push({
          x: corner.x,
          y: corner.y,
          z: corner.z,
          type: 'planeCorner',
          partId: null,
          annotationId: annotation.id,
        });
      }
    }
  }

  return points;
}

/**
 * Find the nearest inference point to a cursor position within a threshold.
 * Uses priority: corner > midpoint > faceCenter.
 * @param {{x: number, y: number, z: number}} cursor - Cursor position in domain coords
 * @param {InferencePoint[]} points - Candidate inference points
 * @param {number} thresholdMm - Maximum distance in mm
 * @returns {SnapResult|null} - Best match or null if none within threshold
 */
export function findNearestInference(cursor, points, thresholdMm) {
  if (!points.length) return null;

  const typePriority = {
    corner: 0,
    guidePoint: 0,
    guideEndpoint: 0,
    midpoint: 1,
    guideMidpoint: 1,
    planeCorner: 1,
    faceCenter: 2,
    planeOrigin: 2,
  };
  let best = null;
  let bestDist = thresholdMm;
  let bestPriority = 3;

  for (const p of points) {
    const dx = cursor.x - p.x;
    const dy = cursor.y - p.y;
    const dz = cursor.z - p.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const priority = typePriority[p.type] ?? 3;

    if (dist < bestDist || (dist === bestDist && priority < bestPriority)) {
      best = p;
      bestDist = dist;
      bestPriority = priority;
    }
  }

  if (!best) return null;

  return {
    point: { x: best.x, y: best.y, z: best.z },
    inference: best,
    snapped: true,
  };
}

/**
 * Find the nearest inference point projected onto a drawing plane.
 * Only considers the 2D distance on the plane (ignoring normal component).
 * @param {{x: number, y: number, z: number}} cursor - Cursor position in domain coords
 * @param {InferencePoint[]} points - Candidate inference points
 * @param {Object} plane - Drawing plane with origin, uAxis, vAxis, normal
 * @param {number} thresholdMm - Maximum distance in mm (on plane)
 * @returns {SnapResult|null}
 */
export function findNearestInferenceOnPlane(cursor, points, plane, thresholdMm) {
  if (!points.length || !plane) return findNearestInference(cursor, points, thresholdMm);

  // Project cursor to plane
  const cursorU = projectOnAxis(cursor, plane.origin, plane.uAxis);
  const cursorV = projectOnAxis(cursor, plane.origin, plane.vAxis);
  const cursorN = projectOnAxis(cursor, plane.origin, plane.normal);

  const typePriority = {
    corner: 0,
    guidePoint: 0,
    guideEndpoint: 0,
    midpoint: 1,
    guideMidpoint: 1,
    planeCorner: 1,
    faceCenter: 2,
    planeOrigin: 2,
  };
  let best = null;
  let bestDist = thresholdMm;
  let bestPriority = 3;

  for (const p of points) {
    const pu = projectOnAxis(p, plane.origin, plane.uAxis);
    const pv = projectOnAxis(p, plane.origin, plane.vAxis);
    const pn = projectOnAxis(p, plane.origin, plane.normal);

    // Only consider points near the plane (within a tolerance)
    if (Math.abs(pn - cursorN) > thresholdMm) continue;

    const du = cursorU - pu;
    const dv = cursorV - pv;
    const dist = Math.sqrt(du * du + dv * dv);
    const priority = typePriority[p.type] ?? 3;

    if (dist < bestDist || (dist === bestDist && priority < bestPriority)) {
      best = p;
      bestDist = dist;
      bestPriority = priority;
    }
  }

  if (!best) return null;

  return {
    point: { x: best.x, y: best.y, z: best.z },
    inference: best,
    snapped: true,
  };
}

/**
 * Find alignment axes — cases where the cursor is nearly aligned with
 * inference points along a single axis.
 * @param {{x: number, y: number, z: number}} cursor
 * @param {InferencePoint[]} points
 * @param {number} thresholdMm
 * @returns {Array<{axis: 'x'|'y'|'z', value: number, points: InferencePoint[]}>}
 */
export function findAlignmentAxes(cursor, points, thresholdMm) {
  const axes = ['x', 'y', 'z'];
  const result = [];

  for (const axis of axes) {
    const aligned = [];
    for (const p of points) {
      if (Math.abs(cursor[axis] - p[axis]) < thresholdMm) {
        aligned.push(p);
      }
    }
    if (aligned.length > 0) {
      result.push({ axis, value: cursor[axis], points: aligned });
    }
  }

  return result;
}

/**
 * Compute the world-space threshold in mm that corresponds to a given
 * screen-space pixel distance at a reference point.
 * @param {Object} camera - Three.js camera (PerspectiveCamera or OrthographicCamera)
 * @param {Object} domElement - Renderer DOM element
 * @param {number} screenPx - Screen-space threshold in pixels (e.g., 15)
 * @param {{x: number, y: number, z: number}} refPoint - Reference point in domain coords
 * @returns {number} Threshold in mm
 */
export function computeWorldThreshold(camera, domElement, screenPx, refPoint) {
  if (!camera || !domElement) return 50; // fallback

  const width = domElement.clientWidth || domElement.offsetWidth || 1;

  if (camera.isOrthographicCamera) {
    // For ortho: pixels / (width / (right - left)) gives world units per pixel
    const worldPerPx = (camera.right - camera.left) / width;
    return screenPx * worldPerPx;
  }

  // For perspective: use distance from camera to reference point
  // Domain coords to Three.js: x=x, y=z, z=y
  const camPos = camera.position;
  const dx = refPoint.x - camPos.x;
  const dy = refPoint.z - camPos.y; // domain z -> three y
  const dz = refPoint.y - camPos.z; // domain y -> three z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // At distance d, visible width = 2 * d * tan(fov/2)
  const fovRad = (camera.fov * Math.PI) / 180;
  const visibleWidth = 2 * dist * Math.tan(fovRad / 2);
  const worldPerPx = visibleWidth / width;

  return screenPx * worldPerPx;
}

/**
 * Compute flush snap points for a moving part against all static parts.
 * For each static part's 6 faces, generates the moving part origin position
 * that would place its opposing face flush against the static face.
 *
 * @param {Array} parts - All parts in the project
 * @param {string} movingPartId - ID of the part being dragged
 * @param {{ width: number, depth: number, height: number }} movingDims - Moving part dimensions
 * @returns {FlushSnapPoint[]}
 */
export function computeFlushSnapPoints(parts, movingPartId, movingDims) {
  const points = [];

  for (const part of parts) {
    if (part.id === movingPartId) continue;
    if (part.type === 'dimension' || part.type === 'cutout' || part.type === 'hole') continue;

    const dims = getPartDimensions(part);
    const pos = part.position;
    const partId = part.id;

    // +x face: static right edge -> moving part's -x face touches it
    points.push({
      faceAxis: 'x',
      faceCoord: pos.x + dims.width,
      type: 'faceFlush',
      partId,
      faceId: '+x',
      movingFaceId: '-x',
    });

    // -x face: static left edge -> moving part's +x face touches it
    points.push({
      faceAxis: 'x',
      faceCoord: pos.x - movingDims.width,
      type: 'faceFlush',
      partId,
      faceId: '-x',
      movingFaceId: '+x',
    });

    // +y face: static back edge -> moving part's -y face touches it
    points.push({
      faceAxis: 'y',
      faceCoord: pos.y + dims.depth,
      type: 'faceFlush',
      partId,
      faceId: '+y',
      movingFaceId: '-y',
    });

    // -y face: static front edge -> moving part's +y face touches it
    points.push({
      faceAxis: 'y',
      faceCoord: pos.y - movingDims.depth,
      type: 'faceFlush',
      partId,
      faceId: '-y',
      movingFaceId: '+y',
    });

    // +z face: static top edge -> moving part's -z face touches it
    points.push({
      faceAxis: 'z',
      faceCoord: pos.z + dims.height,
      type: 'faceFlush',
      partId,
      faceId: '+z',
      movingFaceId: '-z',
    });

    // -z face: static bottom edge -> moving part's +z face touches it
    points.push({
      faceAxis: 'z',
      faceCoord: pos.z - movingDims.height,
      type: 'faceFlush',
      partId,
      faceId: '-z',
      movingFaceId: '+z',
    });
  }

  return points;
}

/**
 * Find the nearest flush snap for a candidate position.
 * Only adjusts the single axis of the nearest flush point — the other two axes stay free.
 *
 * @param {{x: number, y: number, z: number}} candidatePos - Current candidate position
 * @param {FlushSnapPoint[]} flushPoints - Pre-computed flush snap points
 * @param {number} thresholdMm - Maximum distance on the face axis to snap
 * @returns {import('./inferenceEngine').SnapResult|null}
 */
export function findNearestFlushSnap(candidatePos, flushPoints, thresholdMm) {
  if (!flushPoints || !flushPoints.length) return null;

  let best = null;
  let bestDist = thresholdMm;

  for (const fp of flushPoints) {
    const dist = Math.abs(candidatePos[fp.faceAxis] - fp.faceCoord);
    if (dist < bestDist) {
      best = fp;
      bestDist = dist;
    }
  }

  if (!best) return null;

  // Override only the constrained axis, keep the other two free
  const snappedPos = { x: candidatePos.x, y: candidatePos.y, z: candidatePos.z };
  snappedPos[best.faceAxis] = best.faceCoord;

  return {
    point: snappedPos,
    inference: {
      x: snappedPos.x,
      y: snappedPos.y,
      z: snappedPos.z,
      type: 'faceFlush',
      partId: best.partId,
      faceId: best.faceId,
      movingFaceId: best.movingFaceId,
      faceAxis: best.faceAxis,
    },
    snapped: true,
  };
}

// --- Helpers ---

function projectOnAxis(point, origin, axis) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  return dx * axis.x + dy * axis.y + dz * axis.z;
}
