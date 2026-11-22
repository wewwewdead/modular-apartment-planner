import { getAngleDimensionGeometry } from './angleUtils';
import { getArcSegments } from './arcUtils';
import { getDimensionGeometry } from './dimensionUtils';
import {
  buildEntityIdLookup,
  getRectCorners,
  getTextCorners,
  resolveAngleDimensionPoints,
  resolveLinearDimensionPoints,
} from './entityUtils';
import { getPolylineSegments } from './polylineUtils';
import { getTextLeaderGeometry } from './textLeaderUtils';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const xi = polygon[index].x;
    const yi = polygon[index].y;
    const xj = polygon[previous].x;
    const yj = polygon[previous].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-6) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const t = clamp(projection, 0, 1);
  const closestX = start.x + dx * t;
  const closestY = start.y + dy * t;

  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function getSegmentIntersectionPoint(a1, a2, b1, b2) {
  const denominator = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);

  if (denominator === 0) {
    return null;
  }

  const ua = ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denominator;
  const ub = ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denominator;

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
    return null;
  }

  return {
    x: a1.x + ua * (a2.x - a1.x),
    y: a1.y + ua * (a2.y - a1.y),
  };
}

export function hitTestLine(entity, point, tolerance) {
  return distancePointToSegment(point, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 }) <= tolerance;
}

export function hitTestRect(entity, point, tolerance) {
  const corners = Object.values(getRectCorners(entity));

  if (pointInPolygon(point, corners)) {
    return true;
  }

  return corners.some(
    (corner, index) => distancePointToSegment(point, corner, corners[(index + 1) % corners.length]) <= tolerance,
  );
}

export function hitTestCircle(entity, point, tolerance) {
  const distance = Math.hypot(point.x - entity.cx, point.y - entity.cy);
  return distance <= entity.r + tolerance;
}

export function hitTestEllipse(entity, point, tolerance) {
  const radians = ((entity.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(-radians);
  const sin = Math.sin(-radians);
  const dx = point.x - entity.cx;
  const dy = point.y - entity.cy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const rx = Math.max(entity.rx, 1e-6);
  const ry = Math.max(entity.ry, 1e-6);
  const normalized =
    (localX * localX) / ((rx + tolerance) * (rx + tolerance)) +
    (localY * localY) / ((ry + tolerance) * (ry + tolerance));

  return normalized <= 1;
}

// True when `point` is farther than `tolerance` outside the box around
// `points`: every chord drawn between points of that box (or, for an arc,
// between samples of a curve that stays inside its control points' box) is
// then farther than `tolerance` away, and the chords need not be built. The
// slack, a billionth of the magnitudes involved, covers the rounding in the
// samples and in the distance test; a NaN anywhere never rejects.
function isOutsidePointBox(points, point, tolerance) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const magnitude = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY));
  const reach = tolerance + 1e-9 * (1 + Math.abs(tolerance) + Math.abs(point.x) + Math.abs(point.y) + magnitude);

  return point.x < minX - reach || point.x > maxX + reach || point.y < minY - reach || point.y > maxY + reach;
}

export function hitTestPolyline(entity, point, tolerance) {
  if (entity?.points?.length >= 2 && isOutsidePointBox(entity.points, point, tolerance)) {
    return false;
  }

  return getPolylineSegments(entity).some(
    (segment) => distancePointToSegment(point, segment.start, segment.end) <= tolerance,
  );
}

export function hitTestArc(entity, point, tolerance) {
  if (
    entity.start &&
    entity.control &&
    entity.end &&
    isOutsidePointBox([entity.start, entity.control, entity.end], point, tolerance)
  ) {
    return false;
  }

  return getArcSegments(entity).some(
    (segment) => distancePointToSegment(point, segment.start, segment.end) <= tolerance,
  );
}

// `entityById` (buildEntityIdLookup(entities)) is optional: it answers as the
// scan of `entities` would.
export function hitTestDimension(entity, point, tolerance, entities, entityById = null) {
  const { p1, p2 } = resolveLinearDimensionPoints(entity, entities, entityById);
  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });

  return (
    distancePointToSegment(
      point,
      { x: geometry.ext1.x1, y: geometry.ext1.y1 },
      { x: geometry.ext1.x2, y: geometry.ext1.y2 },
    ) <= tolerance ||
    distancePointToSegment(
      point,
      { x: geometry.ext2.x1, y: geometry.ext2.y1 },
      { x: geometry.ext2.x2, y: geometry.ext2.y2 },
    ) <= tolerance ||
    distancePointToSegment(
      point,
      { x: geometry.dimLine.x1, y: geometry.dimLine.y1 },
      { x: geometry.dimLine.x2, y: geometry.dimLine.y2 },
    ) <= tolerance
  );
}

export function hitTestFeature(entity, point, tolerance) {
  if (entity.shape === 'circle') {
    const radius = entity.diameter / 2;
    const distance = Math.hypot(point.x - entity.cx, point.y - entity.cy);
    return distance <= radius + tolerance;
  }

  if (entity.shape === 'rect') {
    return hitTestRect(
      {
        x: entity.x,
        y: entity.y,
        width: entity.width,
        height: entity.height,
        rotation: 0,
      },
      point,
      tolerance,
    );
  }

  if (entity.shape === 'ellipse') {
    return hitTestEllipse(entity, point, tolerance);
  }

  if (entity.shape === 'polygon') {
    const polygon = entity.points || [];

    if (polygon.length < 3) {
      return false;
    }

    if (pointInPolygon(point, polygon)) {
      return true;
    }

    return polygon.some(
      (vertex, index) => distancePointToSegment(point, vertex, polygon[(index + 1) % polygon.length]) <= tolerance,
    );
  }

  return false;
}

export function hitTestText(entity, point, tolerance) {
  const corners = Object.values(getTextCorners(entity));
  const leaderGeometry = getTextLeaderGeometry(entity);

  if (pointInPolygon(point, corners)) {
    return true;
  }

  if (leaderGeometry) {
    if (distancePointToSegment(point, leaderGeometry.anchor, leaderGeometry.shaftEnd) <= tolerance) {
      return true;
    }

    if (pointInPolygon(point, leaderGeometry.arrowHead)) {
      return true;
    }

    if (
      leaderGeometry.arrowHead.some(
        (arrowPoint, index) =>
          distancePointToSegment(
            point,
            arrowPoint,
            leaderGeometry.arrowHead[(index + 1) % leaderGeometry.arrowHead.length],
          ) <= tolerance,
      )
    ) {
      return true;
    }
  }

  return corners.some(
    (corner, index) => distancePointToSegment(point, corner, corners[(index + 1) % corners.length]) <= tolerance,
  );
}

export function hitTestAngleDimension(entity, point, tolerance, entities, entityById = null) {
  const { vertex, p1, p2 } = resolveAngleDimensionPoints(entity, entities, entityById);
  const geometry = getAngleDimensionGeometry({ vertex, p1, p2, arcRadius: entity.arcRadius });

  // Check rays
  if (
    distancePointToSegment(
      point,
      { x: geometry.ray1.x1, y: geometry.ray1.y1 },
      { x: geometry.ray1.x2, y: geometry.ray1.y2 },
    ) <= tolerance
  ) {
    return true;
  }
  if (
    distancePointToSegment(
      point,
      { x: geometry.ray2.x1, y: geometry.ray2.y1 },
      { x: geometry.ray2.x2, y: geometry.ray2.y2 },
    ) <= tolerance
  ) {
    return true;
  }

  // Check arc segments
  const arcPoints = geometry.arcSamples;
  for (let i = 1; i < arcPoints.length; i += 1) {
    if (distancePointToSegment(point, arcPoints[i - 1], arcPoints[i]) <= tolerance) {
      return true;
    }
  }

  return false;
}

export function hitTestEntity(entity, point, tolerance, entities, entityById = null) {
  if (entity.type === 'line') {
    return hitTestLine(entity, point, tolerance);
  }

  if (entity.type === 'rect') {
    return hitTestRect(entity, point, tolerance);
  }

  if (entity.type === 'circle') {
    return hitTestCircle(entity, point, tolerance);
  }

  if (entity.type === 'ellipse') {
    return hitTestEllipse(entity, point, tolerance);
  }

  if (entity.type === 'polyline') {
    return hitTestPolyline(entity, point, tolerance);
  }

  if (entity.type === 'arc') {
    return hitTestArc(entity, point, tolerance);
  }

  if (entity.type === 'dimension') {
    return hitTestDimension(entity, point, tolerance, entities, entityById);
  }

  if (entity.type === 'angle-dimension') {
    return hitTestAngleDimension(entity, point, tolerance, entities, entityById);
  }

  if (entity.type === 'feature') {
    return hitTestFeature(entity, point, tolerance);
  }

  if (entity.type === 'text') {
    return hitTestText(entity, point, tolerance);
  }

  return false;
}

export function findTopmostEntityAtPoint(entities, point, tolerance) {
  // Dimension references resolve through one id lookup, built the first time
  // a dimension is tested, instead of a scan of every entity per reference.
  let entityById = null;

  for (let index = entities.length - 1; index >= 0; index -= 1) {
    const entity = entities[index];

    if (entity.visible === false) {
      continue;
    }

    if ((entity.type === 'dimension' || entity.type === 'angle-dimension') && !entityById) {
      entityById = buildEntityIdLookup(entities);
    }

    if (hitTestEntity(entity, point, tolerance, entities, entityById)) {
      return entity;
    }
  }

  return null;
}
