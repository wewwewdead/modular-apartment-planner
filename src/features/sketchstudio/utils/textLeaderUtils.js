import { getTextCorners, getTextMetrics } from './entityUtils';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function projectPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return start;
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / ((dx * dx) + (dy * dy));
  const t = clamp(projection, 0, 1);

  return {
    x: start.x + (dx * t),
    y: start.y + (dy * t),
  };
}

function getDistanceSquared(firstPoint, secondPoint) {
  const dx = secondPoint.x - firstPoint.x;
  const dy = secondPoint.y - firstPoint.y;
  return (dx * dx) + (dy * dy);
}

export function getTextLeaderTarget(entity) {
  const target = entity?.leader?.target;
  if (!target) {
    return null;
  }

  const x = Number(target.x);
  const y = Number(target.y);

  return Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null;
}

export function getTextLeaderArrowSize(entity) {
  const fontSize = getTextMetrics(entity).fontSize;
  return clamp(fontSize * 0.14, 8, 32);
}

export function getTextLeaderGeometry(entity) {
  const target = getTextLeaderTarget(entity);
  if (!target) {
    return null;
  }

  const corners = getTextCorners(entity);
  const edgePairs = [
    [corners.topLeft, corners.topRight],
    [corners.topRight, corners.bottomRight],
    [corners.bottomRight, corners.bottomLeft],
    [corners.bottomLeft, corners.topLeft],
  ];

  const anchor = edgePairs.reduce((closestPoint, [start, end]) => {
    const candidate = projectPointToSegment(target, start, end);
    if (!closestPoint) {
      return candidate;
    }

    return getDistanceSquared(candidate, target) < getDistanceSquared(closestPoint, target)
      ? candidate
      : closestPoint;
  }, null);

  if (!anchor) {
    return null;
  }

  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const length = Math.hypot(dx, dy);

  if (length <= 0.001) {
    return null;
  }

  const arrowSize = getTextLeaderArrowSize(entity);
  const direction = {
    x: dx / length,
    y: dy / length,
  };
  const normal = {
    x: -direction.y,
    y: direction.x,
  };
  const baseCenter = {
    x: target.x - (direction.x * arrowSize),
    y: target.y - (direction.y * arrowSize),
  };
  const arrowWidth = arrowSize * 0.55;
  const leftPoint = {
    x: baseCenter.x + (normal.x * arrowWidth),
    y: baseCenter.y + (normal.y * arrowWidth),
  };
  const rightPoint = {
    x: baseCenter.x - (normal.x * arrowWidth),
    y: baseCenter.y - (normal.y * arrowWidth),
  };

  return {
    anchor,
    target,
    shaftEnd: baseCenter,
    arrowHead: [target, leftPoint, rightPoint],
  };
}
