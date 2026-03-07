import { add, distance, midpoint, normalize, perpendicular, scale } from './point';
import { pointInPolygon } from './polygon';

const EPSILON = 1e-6;

export function stairDirectionAngle(stair) {
  if (typeof stair?.direction === 'number') return stair.direction;
  return stair?.direction?.angle ?? 0;
}

export function stairDirectionVector(stair) {
  const angle = (stairDirectionAngle(stair) * Math.PI) / 180;
  return normalize({
    x: Math.cos(angle),
    y: Math.sin(angle),
  });
}

export function stairTotalRise(stair) {
  return Math.max(0, (stair?.numberOfRisers || 0) * (stair?.riserHeight || 0));
}

export function stairRun(stair) {
  return Math.max(0, (stair?.numberOfRisers || 0) * (stair?.treadDepth || 0));
}

export function stairOutline(stair) {
  const startPoint = stair?.startPoint;
  if (!startPoint) return [];

  const direction = stairDirectionVector(stair);
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return [];

  const normal = perpendicular(direction);
  const halfWidth = (stair?.width || 0) / 2;
  const run = stairRun(stair);
  const endPoint = add(startPoint, scale(direction, run));
  const startOffset = scale(normal, halfWidth);
  const endOffset = scale(normal, halfWidth);

  return [
    add(startPoint, startOffset),
    add(endPoint, endOffset),
    add(endPoint, scale(normal, -halfWidth)),
    add(startPoint, scale(normal, -halfWidth)),
  ];
}

export function stairTreadLines(stair) {
  const startPoint = stair?.startPoint;
  const risers = stair?.numberOfRisers || 0;
  const treadDepth = stair?.treadDepth || 0;
  const width = stair?.width || 0;
  if (!startPoint || risers <= 0 || treadDepth <= 0 || width <= 0) return [];

  const direction = stairDirectionVector(stair);
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return [];

  const normal = perpendicular(direction);
  const halfWidth = width / 2;

  return Array.from({ length: risers }, (_, index) => {
    const treadStart = add(startPoint, scale(direction, treadDepth * index));
    return {
      start: add(treadStart, scale(normal, halfWidth)),
      end: add(treadStart, scale(normal, -halfWidth)),
    };
  });
}

export function stairArrow(stair) {
  const startPoint = stair?.startPoint;
  if (!startPoint) return null;

  const direction = stairDirectionVector(stair);
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return null;

  const run = stairRun(stair);
  const centerOffset = scale(direction, run * 0.15);
  const arrowStart = add(startPoint, centerOffset);
  const arrowEnd = add(startPoint, scale(direction, run * 0.9));
  const headLength = Math.min(250, Math.max(120, run * 0.08));
  const normal = perpendicular(direction);

  return {
    start: arrowStart,
    end: arrowEnd,
    headA: add(arrowEnd, add(scale(direction, -headLength), scale(normal, headLength * 0.45))),
    headB: add(arrowEnd, add(scale(direction, -headLength), scale(normal, -headLength * 0.45))),
  };
}

export function stairBounds(stair) {
  const outline = stairOutline(stair);
  if (!outline.length) return null;

  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function stairContainsPoint(stair, point) {
  const outline = stairOutline(stair);
  if (outline.length < 3) return false;
  return pointInPolygon(point, outline);
}

export function getStairRenderData(stair) {
  const outline = stairOutline(stair);
  if (outline.length < 3) return null;

  const startPoint = stair.startPoint;
  const run = stairRun(stair);
  const direction = stairDirectionVector(stair);
  const endPoint = add(startPoint, scale(direction, run));

  return {
    stair,
    outline,
    treads: stairTreadLines(stair),
    arrow: stairArrow(stair),
    totalRise: stairTotalRise(stair),
    run,
    angle: stairDirectionAngle(stair),
    startPoint,
    endPoint,
    center: midpoint(startPoint, endPoint),
    length: distance(startPoint, endPoint),
    bounds: stairBounds(stair),
  };
}
