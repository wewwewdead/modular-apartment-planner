import { getMidpoint } from './canvasMath';

const DEFAULT_STEPS = 24;

function interpolateQuadratic(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: (mt * mt * p0.x) + (2 * mt * t * p1.x) + (t * t * p2.x),
    y: (mt * mt * p0.y) + (2 * mt * t * p1.y) + (t * t * p2.y),
  };
}

export function getArcPath(entity) {
  return `M ${entity.start.x} ${entity.start.y} Q ${entity.control.x} ${entity.control.y} ${entity.end.x} ${entity.end.y}`;
}

export function getArcSamplePoints(entity, steps = DEFAULT_STEPS) {
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push(interpolateQuadratic(entity.start, entity.control, entity.end, t));
  }

  return points;
}

export function getArcSegments(entity, steps = DEFAULT_STEPS) {
  const points = getArcSamplePoints(entity, steps);
  return points.slice(1).map((point, index) => ({
    start: points[index],
    end: point,
    segmentIndex: index,
  }));
}

export function getArcMidpoint(entity) {
  return interpolateQuadratic(entity.start, entity.control, entity.end, 0.5);
}

export function getArcBoundingBox(entity) {
  const points = getArcSamplePoints(entity);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function getArcReferencePoint(entity, sourceKey) {
  if (sourceKey === 'start') {
    return entity.start;
  }

  if (sourceKey === 'end') {
    return entity.end;
  }

  if (sourceKey === 'control') {
    return entity.control;
  }

  if (sourceKey === 'midpoint') {
    return getArcMidpoint(entity);
  }

  return getMidpoint(entity.start, entity.end);
}
