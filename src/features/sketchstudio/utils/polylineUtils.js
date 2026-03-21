import { getMidpoint } from './canvasMath';

export function appendPolylineVertex(points, point) {
  return [...points, point];
}

export function removeLastPolylineVertex(points) {
  return points.slice(0, -1);
}

export function getPolylineSegments(entity) {
  if (!entity?.points?.length || entity.points.length < 2) {
    return [];
  }

  const segments = entity.points.slice(1).map((point, index) => ({
    start: entity.points[index],
    end: point,
    segmentIndex: index,
  }));

  if (entity.closed && entity.points.length > 2) {
    segments.push({
      start: entity.points.at(-1),
      end: entity.points[0],
      segmentIndex: entity.points.length - 1,
    });
  }

  return segments;
}

export function getPolylineMidpoints(entity) {
  return getPolylineSegments(entity).map((segment) => ({
    ...getMidpoint(segment.start, segment.end),
    segmentIndex: segment.segmentIndex,
  }));
}

export function getPolylineBoundingBox(entity) {
  if (!entity?.points?.length) {
    return null;
  }

  const xs = entity.points.map((point) => point.x);
  const ys = entity.points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
