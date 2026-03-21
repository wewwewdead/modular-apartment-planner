import { calculateDistance, normalizeVector } from './canvasMath';
import { createBaseEntity, createEntityId, getRectCenter } from './entityUtils';
import { distancePointToSegment } from './hitTest';
import { getPolylineSegments } from './polylineUtils';
import { isPolylineClosed } from './profileUtils';

function signedDistanceFromLine(start, end, point) {
  return ((end.x - start.x) * (point.y - start.y)) - ((end.y - start.y) * (point.x - start.x));
}

function polygonCentroid(points) {
  const sum = points.reduce((accumulator, point) => ({
    x: accumulator.x + point.x,
    y: accumulator.y + point.y,
  }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

export function normalizeOffsetDistance(rawValue) {
  const numericValue = Math.abs(Number(rawValue));
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function measureOffsetDistance(entity, pointerPoint) {
  if (!entity || !pointerPoint) {
    return 0;
  }

  if (entity.type === 'line') {
    return distancePointToSegment(pointerPoint, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
  }

  if (entity.type === 'rect') {
    const corners = [
      { x: entity.x, y: entity.y },
      { x: entity.x + entity.width, y: entity.y },
      { x: entity.x + entity.width, y: entity.y + entity.height },
      { x: entity.x, y: entity.y + entity.height },
    ];
    return corners.reduce((nearest, corner, index) => Math.min(
      nearest,
      distancePointToSegment(pointerPoint, corner, corners[(index + 1) % corners.length]),
    ), Number.POSITIVE_INFINITY);
  }

  if (entity.type === 'polyline') {
    return getPolylineSegments(entity).reduce((nearest, segment) => Math.min(
      nearest,
      distancePointToSegment(pointerPoint, segment.start, segment.end),
    ), Number.POSITIVE_INFINITY);
  }

  return 0;
}

export function getOffsetSideSign(entity, pointerPoint) {
  if (entity.type === 'line') {
    return signedDistanceFromLine({ x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }, pointerPoint) >= 0 ? 1 : -1;
  }

  if (entity.type === 'rect') {
    const center = getRectCenter(entity);
    return calculateDistance(pointerPoint, center) >= Math.max(entity.width, entity.height) / 2 ? 1 : -1;
  }

  if (entity.type === 'polyline' && isPolylineClosed(entity)) {
    const center = polygonCentroid(entity.points);
    return calculateDistance(pointerPoint, center) >= 1 ? 1 : -1;
  }

  return 1;
}

export function offsetLineEntity(entity, pointerPoint, rawDistance, entities, layerId = entity.layerId) {
  const distance = normalizeOffsetDistance(rawDistance);

  if (!distance) {
    return null;
  }

  const direction = normalizeVector({
    x: entity.x2 - entity.x1,
    y: entity.y2 - entity.y1,
  });
  const side = getOffsetSideSign(entity, pointerPoint);
  const normal = {
    x: -direction.y * distance * side,
    y: direction.x * distance * side,
  };

  return createBaseEntity({
    id: createEntityId('line', entities),
    type: 'line',
    x1: entity.x1 + normal.x,
    y1: entity.y1 + normal.y,
    x2: entity.x2 + normal.x,
    y2: entity.y2 + normal.y,
  }, layerId);
}

export function offsetRectEntity(entity, pointerPoint, rawDistance, entities, layerId = entity.layerId) {
  const distance = normalizeOffsetDistance(rawDistance) * getOffsetSideSign(entity, pointerPoint);

  if (!distance) {
    return null;
  }

  const nextWidth = entity.width + (distance * 2);
  const nextHeight = entity.height + (distance * 2);

  if (nextWidth <= 0 || nextHeight <= 0) {
    return null;
  }

  return createBaseEntity({
    ...entity,
    id: createEntityId('rect', entities),
    x: entity.x - distance,
    y: entity.y - distance,
    width: nextWidth,
    height: nextHeight,
  }, layerId);
}

export function offsetPolylineEntity(entity, pointerPoint, rawDistance, entities, layerId = entity.layerId) {
  if (!isPolylineClosed(entity)) {
    return null;
  }

  const distance = normalizeOffsetDistance(rawDistance);

  if (!distance) {
    return null;
  }

  const centroid = polygonCentroid(entity.points);
  const side = getOffsetSideSign(entity, pointerPoint);
  const points = entity.points.map((point) => {
    const direction = normalizeVector({
      x: point.x - centroid.x,
      y: point.y - centroid.y,
    });

    return {
      x: point.x + (direction.x * distance * side),
      y: point.y + (direction.y * distance * side),
    };
  });

  return createBaseEntity({
    id: createEntityId('polyline', entities),
    type: 'polyline',
    points,
    closed: true,
  }, layerId);
}
