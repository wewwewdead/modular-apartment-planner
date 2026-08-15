import { createEntityId, createBaseEntity } from './entityUtils';
import {
  findFilletableCorner,
  getRectEdgePairForCorner,
  rectToLines,
  resolveCornerEdges,
  updateCornerLineEndpoint,
} from './filletUtils';

/**
 * Chamfer — the fillet's straight-cut sibling.
 *
 * The corner resolution is literally the fillet's (`findFilletableCorner`,
 * `resolveCornerEdges`), so a line-line junction, a polyline vertex, and a rect
 * corner are all found the same way with the same tolerance. The only difference
 * is what replaces the corner: a fillet inserts a tangent arc, a chamfer inserts
 * a straight edge.
 *
 * A single DISTANCE is used for both setbacks (the equal-setback, "45 degree"
 * chamfer), because that is the value shops actually specify. The setback is
 * auto-clamped to 90% of the shorter edge, exactly like the fillet radius, so a
 * chamfer can never eat past a neighbouring corner.
 */

const DEFAULT_CHAMFER_DISTANCE = 50;
const MIN_CHAMFER_DISTANCE = 5;
const MAX_CHAMFER_DISTANCE = 1000;
const CHAMFER_DISTANCE_STEP = 10;

export {
  DEFAULT_CHAMFER_DISTANCE,
  MIN_CHAMFER_DISTANCE,
  MAX_CHAMFER_DISTANCE,
  CHAMFER_DISTANCE_STEP,
  findFilletableCorner as findChamferableCorner,
};

/**
 * @returns `{ point1, point2, cornerPoint, distance }` — the same contract shape
 *   as `computeSketchFillet`, with `distance` reporting the setback actually
 *   used after clamping. Null when the corner is unusable.
 */
export function computeSketchChamfer(corner, distance) {
  const edges = resolveCornerEdges(corner);

  if (!edges) {
    return null;
  }

  const { cornerPoint, dir1, dir2, edgeLength1, edgeLength2 } = edges;
  const requested = Number(distance);

  if (!Number.isFinite(requested) || requested <= 0) {
    return null;
  }

  const maxDistance = Math.min(edgeLength1, edgeLength2) * 0.9;

  if (maxDistance <= 1) {
    return null;
  }

  const effectiveDistance = Math.min(requested, maxDistance);

  return {
    point1: { x: cornerPoint.x + dir1.x * effectiveDistance, y: cornerPoint.y + dir1.y * effectiveDistance },
    point2: { x: cornerPoint.x + dir2.x * effectiveDistance, y: cornerPoint.y + dir2.y * effectiveDistance },
    cornerPoint: { ...cornerPoint },
    distance: effectiveDistance,
  };
}

function createChamferLine(point1, point2, entities, layerId, distance) {
  return createBaseEntity(
    {
      id: createEntityId('line', entities),
      type: 'line',
      x1: point1.x,
      y1: point1.y,
      x2: point2.x,
      y2: point2.y,
      meta: { chamferDistance: distance },
    },
    layerId,
  );
}

export function applyChamfer(entities, corner, geometry, layerId) {
  const { point1, point2 } = geometry;

  if (corner.type === 'line-line') {
    const nextEntities = entities.map((entity) => {
      if (entity.id === corner.entity1.id) {
        return updateCornerLineEndpoint(entity, corner.entity1Endpoint, point1);
      }

      if (entity.id === corner.entity2.id) {
        return updateCornerLineEndpoint(entity, corner.entity2Endpoint, point2);
      }

      return entity;
    });

    return [...nextEntities, createChamferLine(point1, point2, nextEntities, layerId, geometry.distance)];
  }

  if (corner.type === 'rect-corner') {
    // A chamfered rect is no longer a rect: explode to four lines, cut the two
    // that meet at the picked corner, and bridge them.
    const rect = corner.entity;
    const lines = rectToLines(rect, entities, rect.layerId || layerId);
    const [lineIndex1, endpoint1, lineIndex2, endpoint2] = getRectEdgePairForCorner(corner.cornerKey);

    lines[lineIndex1] = updateCornerLineEndpoint(lines[lineIndex1], endpoint1, point1);
    lines[lineIndex2] = updateCornerLineEndpoint(lines[lineIndex2], endpoint2, point2);

    const withoutRect = entities.filter((entity) => entity.id !== rect.id);
    const allEntities = [...withoutRect, ...lines];

    return [...allEntities, createChamferLine(point1, point2, allEntities, rect.layerId || layerId, geometry.distance)];
  }

  if (corner.type === 'polyline-vertex') {
    const polyline = corner.entity;
    const nextPoints = [...polyline.points];
    nextPoints.splice(corner.vertexIndex, 1, point1, point2);

    return entities.map((entity) => (entity.id === polyline.id ? { ...entity, points: nextPoints } : entity));
  }

  return entities;
}
