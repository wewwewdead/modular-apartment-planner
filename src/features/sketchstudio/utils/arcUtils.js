import { getMidpoint } from './canvasMath';

const DEFAULT_STEPS = 24;
const AXIS_EPSILON = 1e-9;

export function getQuadraticPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: (mt * mt * p0.x) + (2 * mt * t * p1.x) + (t * t * p2.x),
    y: (mt * mt * p0.y) + (2 * mt * t * p1.y) + (t * t * p2.y),
  };
}

function getQuadraticExtremaT(p0, p1, p2) {
  const denominator = p0 - (2 * p1) + p2;
  if (Math.abs(denominator) <= AXIS_EPSILON) {
    return null;
  }

  const t = (p0 - p1) / denominator;
  if (t <= 0 || t >= 1) {
    return null;
  }

  return t;
}

export function solveThreePointCircle(p1, p2, p3) {
  const determinant = (2 * ((p1.x * (p2.y - p3.y)) + (p2.x * (p3.y - p1.y)) + (p3.x * (p1.y - p2.y))));
  if (Math.abs(determinant) <= AXIS_EPSILON) {
    return null;
  }

  const p1Sq = (p1.x * p1.x) + (p1.y * p1.y);
  const p2Sq = (p2.x * p2.x) + (p2.y * p2.y);
  const p3Sq = (p3.x * p3.x) + (p3.y * p3.y);

  const center = {
    x: ((p1Sq * (p2.y - p3.y)) + (p2Sq * (p3.y - p1.y)) + (p3Sq * (p1.y - p2.y))) / determinant,
    y: ((p1Sq * (p3.x - p2.x)) + (p2Sq * (p1.x - p3.x)) + (p3Sq * (p2.x - p1.x))) / determinant,
  };

  const radius = Math.hypot(p1.x - center.x, p1.y - center.y);
  if (!Number.isFinite(radius) || radius <= AXIS_EPSILON) {
    return null;
  }

  return { center, radius };
}

export function getArcCircularApproximation(entity) {
  if (!entity?.start || !entity?.end || !entity?.control) {
    return null;
  }

  const midpoint = getArcMidpoint(entity);
  return solveThreePointCircle(entity.start, midpoint, entity.end);
}

export function getArcPath(entity) {
  return `M ${entity.start.x} ${entity.start.y} Q ${entity.control.x} ${entity.control.y} ${entity.end.x} ${entity.end.y}`;
}

export function getArcSamplePoints(entity, steps = DEFAULT_STEPS) {
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push(getQuadraticPoint(entity.start, entity.control, entity.end, t));
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
  return getQuadraticPoint(entity.start, entity.control, entity.end, 0.5);
}

export function getArcBoundingBox(entity) {
  const points = [entity.start, entity.end];
  const tX = getQuadraticExtremaT(entity.start.x, entity.control.x, entity.end.x);
  const tY = getQuadraticExtremaT(entity.start.y, entity.control.y, entity.end.y);
  if (tX != null) {
    points.push(getQuadraticPoint(entity.start, entity.control, entity.end, tX));
  }
  if (tY != null) {
    points.push(getQuadraticPoint(entity.start, entity.control, entity.end, tY));
  }

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
