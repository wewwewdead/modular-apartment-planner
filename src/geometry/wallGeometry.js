import { subtract, normalize, perpendicular, scale, add, dot } from './point';
import { segmentLength } from './line';
import { MIN_WALL_LENGTH } from '@/domain/defaults';
import { arcWallOutline, arcWallLength } from './filletGeometry';

export function wallOutline(wall) {
  if (wall.controlPoint) {
    return arcWallOutline(wall);
  }
  const dir = normalize(subtract(wall.end, wall.start));
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const offset = scale(perp, halfThick);

  return [add(wall.start, offset), add(wall.end, offset), subtract(wall.end, offset), subtract(wall.start, offset)];
}

export function wallLength(wall) {
  if (wall.controlPoint) {
    return arcWallLength(wall);
  }
  return segmentLength(wall.start, wall.end);
}

export function resizeWallFromStart(wall, requestedLength, minLength = MIN_WALL_LENGTH) {
  const targetLength = Math.max(minLength, Number(requestedLength) || 0);
  const direction = normalize(subtract(wall.end, wall.start));
  const safeDirection = direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction;

  return {
    start: wall.start,
    end: add(wall.start, scale(safeDirection, targetLength)),
  };
}

export function clampWallOpeningOffset(length, width, offset) {
  const safeLength = Math.max(0, Number(length) || 0);
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeOffset = Number(offset) || 0;
  const halfWidth = safeWidth / 2;

  if (safeLength <= 0) return 0;
  if (safeWidth >= safeLength) return safeLength / 2;

  return Math.max(halfWidth, Math.min(safeLength - halfWidth, safeOffset));
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

// Which face of the wall a point falls on: the sign of the cross product of the
// wall direction with the vector to the point. 'right' is the +perpendicular
// face, matching how deviceOutlineOnWall offsets a device.
export function wallSideOfPoint(wall, point) {
  const dir = wallDirection(wall);
  const toPoint = subtract(point, wall.start);
  return dir.x * toPoint.y - dir.y * toPoint.x >= 0 ? 'right' : 'left';
}

// Snap a wall-mounted device flush against columns standing on (or hard
// against) the wall: when the device centre comes within `snapDistance` of a
// position where its `deviceWidth` footprint would touch a column side, return
// that flush position. Columns clear of the wall band never capture the device.
export function snapOffsetToWallColumns(wall, offset, columns, deviceWidth, snapDistance = 150) {
  const dir = wallDirection(wall);
  const length = wallLength(wall);
  const halfDevice = deviceWidth / 2;
  // How far off the wall centreline a column may sit and still count as "on the
  // wall": half the wall plus a tolerance for columns drawn hard against a face.
  const lateralReach = wall.thickness / 2 + 50;

  let best = null;
  for (const column of columns || []) {
    const rotation = ((column.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    let tMin = Infinity;
    let tMax = -Infinity;
    let latMin = Infinity;
    let latMax = -Infinity;
    for (const corner of [
      { x: -column.width / 2, y: -column.depth / 2 },
      { x: column.width / 2, y: -column.depth / 2 },
      { x: column.width / 2, y: column.depth / 2 },
      { x: -column.width / 2, y: column.depth / 2 },
    ]) {
      const world = {
        x: column.x + corner.x * cos - corner.y * sin,
        y: column.y + corner.x * sin + corner.y * cos,
      };
      const toCorner = subtract(world, wall.start);
      const t = dot(toCorner, dir);
      const lateral = dir.x * toCorner.y - dir.y * toCorner.x;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
      latMin = Math.min(latMin, lateral);
      latMax = Math.max(latMax, lateral);
    }

    if (latMin > lateralReach || latMax < -lateralReach) continue;
    if (tMax < 0 || tMin > length) continue;

    for (const target of [tMin - halfDevice, tMax + halfDevice]) {
      if (target < halfDevice || target > length - halfDevice) continue;
      const distance = Math.abs(offset - target);
      if (distance < snapDistance && (!best || distance < best.distance)) {
        best = { target, distance };
      }
    }
  }

  return best ? best.target : offset;
}

// Plan footprint of a surface-mounted device: a `size` square centred on the
// wall face the device mounts to. Devices are never openings, so this outline
// exists only for hit-testing and selection — it never trims the wall.
export function deviceOutlineOnWall(wall, device, size) {
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const half = size / 2;
  const sideSign = device.side === 'left' ? -1 : 1;

  const center = add(positionOnWall(wall, device.offset), scale(perp, (sideSign * wall.thickness) / 2));

  return {
    center,
    angle: wallAngle(wall),
    p1: add(add(center, scale(dir, -half)), scale(perp, half)),
    p2: add(add(center, scale(dir, half)), scale(perp, half)),
    p3: add(add(center, scale(dir, half)), scale(perp, -half)),
    p4: add(add(center, scale(dir, -half)), scale(perp, -half)),
  };
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
