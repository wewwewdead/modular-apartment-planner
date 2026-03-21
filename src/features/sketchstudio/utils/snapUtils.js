import { getArcMidpoint, getArcSegments } from './arcUtils';
import { distancePointToSegment, getSegmentIntersectionPoint } from './hitTest';
import { getRectCorners } from './entityUtils';
import { findNearestIsometricGridSnap, getEllipseSnapPoints } from './isometricUtils';
import { getPolylineSegments } from './polylineUtils';

function buildEmptySnap() {
  return {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  };
}

function buildSnapPoint({ x, y, entityId, entityType, sourceType, sourceKey, snapType = sourceType }) {
  return {
    x,
    y,
    sourceEntityId: entityId,
    entityType,
    sourceType,
    sourceKey,
    snapType,
  };
}

export function collectSnapPointsFromEntities(entities) {
  return entities
    .filter((entity) => entity.visible !== false)
    .flatMap((entity) => {
      if (entity.type === 'line') {
        const start = buildSnapPoint({
          x: entity.x1,
          y: entity.y1,
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'endpoint',
          sourceKey: 'start',
        });
        const end = buildSnapPoint({
          x: entity.x2,
          y: entity.y2,
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'endpoint',
          sourceKey: 'end',
        });
        const midpoint = {
          x: (entity.x1 + entity.x2) / 2,
          y: (entity.y1 + entity.y2) / 2,
        };

        return [
          start,
          end,
          buildSnapPoint({
            x: midpoint.x,
            y: midpoint.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'segment',
          }),
        ];
      }

      if (entity.type === 'rect') {
        const corners = getRectCorners(entity);
        return [
          buildSnapPoint({ x: corners.topLeft.x, y: corners.topLeft.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'topLeft' }),
          buildSnapPoint({ x: corners.topRight.x, y: corners.topRight.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'topRight' }),
          buildSnapPoint({ x: corners.bottomLeft.x, y: corners.bottomLeft.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'bottomLeft' }),
          buildSnapPoint({ x: corners.bottomRight.x, y: corners.bottomRight.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'bottomRight' }),
          buildSnapPoint({
            x: (corners.topLeft.x + corners.topRight.x) / 2,
            y: (corners.topLeft.y + corners.topRight.y) / 2,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'top',
          }),
          buildSnapPoint({
            x: (corners.topRight.x + corners.bottomRight.x) / 2,
            y: (corners.topRight.y + corners.bottomRight.y) / 2,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'right',
          }),
          buildSnapPoint({
            x: (corners.bottomLeft.x + corners.bottomRight.x) / 2,
            y: (corners.bottomLeft.y + corners.bottomRight.y) / 2,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'bottom',
          }),
          buildSnapPoint({
            x: (corners.topLeft.x + corners.bottomLeft.x) / 2,
            y: (corners.topLeft.y + corners.bottomLeft.y) / 2,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'left',
          }),
        ];
      }

      if (entity.type === 'circle') {
        return [
          buildSnapPoint({
            x: entity.cx,
            y: entity.cy,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'center',
            sourceKey: 'center',
          }),
        ];
      }

      if (entity.type === 'ellipse') {
        return getEllipseSnapPoints(entity).map((snapPoint) => buildSnapPoint({
          x: snapPoint.x,
          y: snapPoint.y,
          entityId: entity.id,
          entityType: entity.type,
          sourceType: snapPoint.sourceType,
          sourceKey: snapPoint.sourceKey,
          snapType: snapPoint.snapType,
        }));
      }

      if (entity.type === 'feature') {
        if (entity.shape === 'circle') {
          return [
            buildSnapPoint({
              x: entity.cx,
              y: entity.cy,
              entityId: entity.id,
              entityType: entity.type,
              sourceType: 'center',
              sourceKey: 'center',
            }),
          ];
        }

        if (entity.shape === 'rect') {
          return [
            buildSnapPoint({ x: entity.x, y: entity.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'topLeft' }),
            buildSnapPoint({ x: entity.x + entity.width, y: entity.y, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'topRight' }),
            buildSnapPoint({ x: entity.x, y: entity.y + entity.height, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'bottomLeft' }),
            buildSnapPoint({ x: entity.x + entity.width, y: entity.y + entity.height, entityId: entity.id, entityType: entity.type, sourceType: 'corner', sourceKey: 'bottomRight' }),
          ];
        }

        if (entity.shape === 'ellipse') {
          return getEllipseSnapPoints(entity).map((snapPoint) => buildSnapPoint({
            x: snapPoint.x,
            y: snapPoint.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: snapPoint.sourceType,
            sourceKey: snapPoint.sourceKey,
            snapType: snapPoint.snapType,
          }));
        }

        if (entity.shape === 'polygon') {
          return (entity.points || []).map((point, index) => buildSnapPoint({
            x: point.x,
            y: point.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'vertex',
            sourceKey: String(index),
            snapType: 'endpoint',
          }));
        }
      }

      if (entity.type === 'polyline') {
        const vertexPoints = entity.points.map((point, index) => buildSnapPoint({
          x: point.x,
          y: point.y,
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'vertex',
          sourceKey: String(index),
          snapType: 'endpoint',
        }));
        const midpoints = getPolylineSegments(entity).map((segment) => buildSnapPoint({
          x: (segment.start.x + segment.end.x) / 2,
          y: (segment.start.y + segment.end.y) / 2,
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'midpoint',
          sourceKey: `segment-${segment.segmentIndex}`,
        }));
        return [...vertexPoints, ...midpoints];
      }

      if (entity.type === 'arc') {
        return [
          buildSnapPoint({
            x: entity.start.x,
            y: entity.start.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'arcPoint',
            sourceKey: 'start',
            snapType: 'endpoint',
          }),
          buildSnapPoint({
            x: entity.end.x,
            y: entity.end.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'arcPoint',
            sourceKey: 'end',
            snapType: 'endpoint',
          }),
          buildSnapPoint({
            x: entity.control.x,
            y: entity.control.y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'arcPoint',
            sourceKey: 'control',
            snapType: 'control',
          }),
          buildSnapPoint({
            x: getArcMidpoint(entity).x,
            y: getArcMidpoint(entity).y,
            entityId: entity.id,
            entityType: entity.type,
            sourceType: 'midpoint',
            sourceKey: 'midpoint',
          }),
        ];
      }

      return [];
    });
}

export function collectSnapSegmentsFromEntities(entities) {
  return entities.flatMap((entity) => {
    if (entity.visible === false) {
      return [];
    }

    if (entity.type === 'line') {
      return [{
        start: { x: entity.x1, y: entity.y1 },
        end: { x: entity.x2, y: entity.y2 },
        entityId: entity.id,
        entityType: entity.type,
        sourceType: 'segment',
        sourceKey: 'segment',
      }];
    }

    if (entity.type === 'rect') {
      const corners = getRectCorners(entity);
      return [
        { start: corners.topLeft, end: corners.topRight, entityId: entity.id, entityType: entity.type, sourceType: 'segment', sourceKey: 'top' },
        { start: corners.topRight, end: corners.bottomRight, entityId: entity.id, entityType: entity.type, sourceType: 'segment', sourceKey: 'right' },
        { start: corners.bottomRight, end: corners.bottomLeft, entityId: entity.id, entityType: entity.type, sourceType: 'segment', sourceKey: 'bottom' },
        { start: corners.bottomLeft, end: corners.topLeft, entityId: entity.id, entityType: entity.type, sourceType: 'segment', sourceKey: 'left' },
      ];
    }

    if (entity.type === 'polyline') {
      return getPolylineSegments(entity).map((segment) => ({
        start: segment.start,
        end: segment.end,
        entityId: entity.id,
        entityType: entity.type,
        sourceType: 'segment',
        sourceKey: `segment-${segment.segmentIndex}`,
      }));
    }

    if (entity.type === 'feature' && entity.shape === 'polygon') {
      return getPolylineSegments({
        type: 'polyline',
        points: entity.points || [],
        closed: entity.closed !== false,
      }).map((segment) => ({
        start: segment.start,
        end: segment.end,
        entityId: entity.id,
        entityType: entity.type,
        sourceType: 'segment',
        sourceKey: `segment-${segment.segmentIndex}`,
      }));
    }

    if (entity.type === 'arc') {
      return getArcSegments(entity).map((segment) => ({
        start: segment.start,
        end: segment.end,
        entityId: entity.id,
        entityType: entity.type,
        sourceType: 'segment',
        sourceKey: `segment-${segment.segmentIndex}`,
      }));
    }

    if (entity.type === 'feature' && entity.shape === 'rect') {
      return [
        {
          start: { x: entity.x, y: entity.y },
          end: { x: entity.x + entity.width, y: entity.y },
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'segment',
          sourceKey: 'top',
        },
        {
          start: { x: entity.x + entity.width, y: entity.y },
          end: { x: entity.x + entity.width, y: entity.y + entity.height },
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'segment',
          sourceKey: 'right',
        },
        {
          start: { x: entity.x + entity.width, y: entity.y + entity.height },
          end: { x: entity.x, y: entity.y + entity.height },
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'segment',
          sourceKey: 'bottom',
        },
        {
          start: { x: entity.x, y: entity.y + entity.height },
          end: { x: entity.x, y: entity.y },
          entityId: entity.id,
          entityType: entity.type,
          sourceType: 'segment',
          sourceKey: 'left',
        },
      ];
    }

    return [];
  });
}

export function findNearestSnapPoint(snapPoints, worldPoint, tolerance) {
  let nearestPoint = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const snapPoint of snapPoints) {
    const distance = Math.hypot(worldPoint.x - snapPoint.x, worldPoint.y - snapPoint.y);

    if (distance <= tolerance && distance < nearestDistance) {
      nearestPoint = snapPoint;
      nearestDistance = distance;
    }
  }

  return nearestPoint;
}

export function findIntersectionSnapPoint(segments, worldPoint, tolerance) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < segments.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < segments.length; otherIndex += 1) {
      const intersection = getSegmentIntersectionPoint(
        segments[index].start,
        segments[index].end,
        segments[otherIndex].start,
        segments[otherIndex].end,
      );

      if (!intersection) {
        continue;
      }

      const distance = Math.hypot(worldPoint.x - intersection.x, worldPoint.y - intersection.y);

      if (distance <= tolerance && distance < nearestDistance) {
        nearest = {
          ...buildSnapPoint({
            x: intersection.x,
            y: intersection.y,
            entityId: segments[index].entityId,
            entityType: segments[index].entityType,
            sourceType: 'segment',
            sourceKey: segments[index].sourceKey,
            snapType: 'intersection',
          }),
          secondaryEntityId: segments[otherIndex].entityId,
        };
        nearestDistance = distance;
      }
    }
  }

  return nearest;
}

export function findNearestPointOnSegment(segments, worldPoint, tolerance) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = (dx * dx) + (dy * dy);

    if (!lengthSquared) {
      continue;
    }

    const t = Math.max(0, Math.min(1, (((worldPoint.x - segment.start.x) * dx) + ((worldPoint.y - segment.start.y) * dy)) / lengthSquared));
    const candidate = {
      x: segment.start.x + dx * t,
      y: segment.start.y + dy * t,
    };
    const distance = Math.hypot(worldPoint.x - candidate.x, worldPoint.y - candidate.y);

    if (distance <= tolerance && distance < nearestDistance) {
      nearest = buildSnapPoint({
        x: candidate.x,
        y: candidate.y,
        entityId: segment.entityId,
        entityType: segment.entityType,
        sourceType: 'segment',
        sourceKey: segment.sourceKey,
        snapType: 'nearest',
      });
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function findPerpendicularSnapPoint(segments, worldPoint, anchorPoint, tolerance) {
  if (!anchorPoint) {
    return null;
  }

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const lengthSquared = (dx * dx) + (dy * dy);

    if (!lengthSquared) {
      continue;
    }

    const t = (((anchorPoint.x - segment.start.x) * dx) + ((anchorPoint.y - segment.start.y) * dy)) / lengthSquared;

    if (t < 0 || t > 1) {
      continue;
    }

    const candidate = {
      x: segment.start.x + dx * t,
      y: segment.start.y + dy * t,
    };
    const distance = Math.hypot(worldPoint.x - candidate.x, worldPoint.y - candidate.y);

    if (distance <= tolerance && distance < nearestDistance) {
      nearest = buildSnapPoint({
        x: candidate.x,
        y: candidate.y,
        entityId: segment.entityId,
        entityType: segment.entityType,
        sourceType: 'segment',
        sourceKey: segment.sourceKey,
        snapType: 'perpendicular',
      });
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function snapWorldPoint({
  worldPoint,
  entities,
  toleranceWorld,
  enabled = true,
  anchorPoint = null,
  enableIsometricGrid = false,
  viewportZoom = 1,
}) {
  if (!enabled) {
    return buildEmptySnap();
  }

  const snapPoints = collectSnapPointsFromEntities(entities);
  const snapSegments = collectSnapSegmentsFromEntities(entities);
  const nearestPoint = findNearestSnapPoint(snapPoints, worldPoint, toleranceWorld);

  if (nearestPoint) {
    return {
      point: { x: nearestPoint.x, y: nearestPoint.y },
      sourceEntityId: nearestPoint.sourceEntityId,
      entityType: nearestPoint.entityType,
      sourceType: nearestPoint.sourceType,
      sourceKey: nearestPoint.sourceKey,
      snapType: nearestPoint.snapType,
    };
  }

  const intersection = findIntersectionSnapPoint(snapSegments, worldPoint, toleranceWorld);

  if (intersection) {
    return {
      point: { x: intersection.x, y: intersection.y },
      sourceEntityId: intersection.sourceEntityId,
      entityType: intersection.entityType,
      sourceType: intersection.sourceType,
      sourceKey: intersection.sourceKey,
      snapType: intersection.snapType,
    };
  }

  const perpendicular = findPerpendicularSnapPoint(snapSegments, worldPoint, anchorPoint, toleranceWorld);

  if (perpendicular) {
    return {
      point: { x: perpendicular.x, y: perpendicular.y },
      sourceEntityId: perpendicular.sourceEntityId,
      entityType: perpendicular.entityType,
      sourceType: perpendicular.sourceType,
      sourceKey: perpendicular.sourceKey,
      snapType: perpendicular.snapType,
    };
  }

  const nearestOnSegment = findNearestPointOnSegment(snapSegments, worldPoint, toleranceWorld);

  if (nearestOnSegment) {
    return {
      point: { x: nearestOnSegment.x, y: nearestOnSegment.y },
      sourceEntityId: nearestOnSegment.sourceEntityId,
      entityType: nearestOnSegment.entityType,
      sourceType: nearestOnSegment.sourceType,
      sourceKey: nearestOnSegment.sourceKey,
      snapType: nearestOnSegment.snapType,
    };
  }

  if (enableIsometricGrid) {
    const point = findNearestIsometricGridSnap({
      worldPoint,
      toleranceWorld,
      zoom: viewportZoom,
    });

    if (point) {
      return {
        point,
        sourceEntityId: null,
        entityType: null,
        sourceType: 'grid',
        sourceKey: 'isometric',
        snapType: 'grid',
      };
    }
  }

  return buildEmptySnap();
}
