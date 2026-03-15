import { subtract, normalize, perpendicular, scale, add, dot } from './point';
import { segmentLength } from './line';

export function wallOutline(wall) {
  const dir = normalize(subtract(wall.end, wall.start));
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const offset = scale(perp, halfThick);

  return [
    add(wall.start, offset),
    add(wall.end, offset),
    subtract(wall.end, offset),
    subtract(wall.start, offset),
  ];
}

export function wallLength(wall) {
  return segmentLength(wall.start, wall.end);
}

export function positionOnWall(wall, offset) {
  const dir = normalize(subtract(wall.end, wall.start));
  return add(wall.start, scale(dir, offset));
}

export function wallDirection(wall) {
  return normalize(subtract(wall.end, wall.start));
}

export function wallAngle(wall) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.atan2(dy, dx);
}

export function projectPointOnWall(wall, point) {
  const dir = subtract(wall.end, wall.start);
  const len = segmentLength(wall.start, wall.end);
  if (len === 0) return 0;
  const toPoint = subtract(point, wall.start);
  const t = dot(toPoint, dir) / (len * len);
  return Math.max(0, Math.min(len, t * len));
}

export function doorOutlineOnWall(wall, door) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const halfWidth = door.width / 2;

  const center = positionOnWall(wall, door.offset);
  const start = add(center, scale(dir, -halfWidth));
  const end = add(center, scale(dir, halfWidth));

  return {
    center,
    start,
    end,
    p1: add(start, scale(perp, halfThick)),
    p2: add(end, scale(perp, halfThick)),
    p3: subtract(end, scale(perp, halfThick)),
    p4: subtract(start, scale(perp, halfThick)),
    angle: wallAngle(wall),
    width: door.width,
    openDirection: door.openDirection,
  };
}

export function windowOutlineOnWall(wall, window_) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const halfWidth = window_.width / 2;

  const center = positionOnWall(wall, window_.offset);
  const start = add(center, scale(dir, -halfWidth));
  const end = add(center, scale(dir, halfWidth));

  return {
    center,
    start,
    end,
    p1: add(start, scale(perp, halfThick)),
    p2: add(end, scale(perp, halfThick)),
    p3: subtract(end, scale(perp, halfThick)),
    p4: subtract(start, scale(perp, halfThick)),
    angle: wallAngle(wall),
    width: window_.width,
  };
}
