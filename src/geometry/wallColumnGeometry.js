import { add, subtract, scale, dot, normalize, perpendicular, distance } from './point';
import { nearestPointOnSegment } from './line';
import { columnOutline, columnFaces, columnCenterlines, columnCenter, columnAxes } from './columnGeometry';

const EPSILON = 1e-6;
const CENTERLINE_ALIGNMENT_THRESHOLD = 0.92;

function makeOutline(start, end, thickness) {
  const dir = normalize(subtract(end, start));
  const perp = perpendicular(dir);
  const halfThick = thickness / 2;
  const offset = scale(perp, halfThick);

  return [
    add(start, offset),
    add(end, offset),
    subtract(end, offset),
    subtract(start, offset),
  ];
}

function findColumn(columns, columnId) {
  return (columns || []).find((column) => column.id === columnId) || null;
}

function raySegmentIntersection(origin, direction, start, end) {
  const segment = subtract(end, start);
  const cross = direction.x * segment.y - direction.y * segment.x;

  if (Math.abs(cross) < EPSILON) return null;

  const delta = subtract(start, origin);
  const t = (delta.x * segment.y - delta.y * segment.x) / cross;
  const u = (delta.x * direction.y - delta.y * direction.x) / cross;

  if (t < -EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;

  return {
    t,
    point: add(origin, scale(direction, Math.max(0, t))),
  };
}

function findTrimPoint(origin, otherPoint, attachment, columns) {
  if (!attachment?.columnId) return { ...origin };

  const column = findColumn(columns, attachment.columnId);
  if (!column) return { ...origin };

  const direction = normalize(subtract(otherPoint, origin));
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) {
    return { ...origin };
  }

  const polygon = columnOutline(column);
  let best = null;

  for (let i = 0; i < polygon.length; i += 1) {
    const hit = raySegmentIntersection(origin, direction, polygon[i], polygon[(i + 1) % polygon.length]);
    if (!hit) continue;
    if (!best || hit.t < best.t) {
      best = hit;
    }
  }

  return best ? best.point : { ...origin };
}

function cloneAttachment(attachment) {
  return attachment ? { ...attachment } : null;
}

function rankCandidate(current, candidate) {
  if (!current) return true;
  if (candidate.priority !== current.priority) return candidate.priority < current.priority;
  return candidate.distance < current.distance;
}

function setBestCandidate(best, candidate) {
  if (!candidate) return best;
  if (!rankCandidate(best, candidate)) return best;
  return candidate;
}

function buildFaceAttachment(column, face, point) {
  const offset = dot(subtract(point, face.midpoint), face.tangent);
  return {
    kind: 'column',
    columnId: column.id,
    featureType: 'face',
    featureIndex: face.index,
    offset,
  };
}

function buildCenterlineAttachment(column, centerline, point) {
  const center = columnCenter(column);
  return {
    kind: 'column',
    columnId: column.id,
    featureType: 'centerline',
    featureIndex: centerline.index,
    offset: dot(subtract(point, center), centerline.axis),
  };
}

export function resolveColumnAttachmentPoint(column, attachment) {
  if (!column || !attachment) return null;

  if (attachment.featureType === 'corner') {
    const corners = columnOutline(column);
    return corners[attachment.featureIndex] ? { ...corners[attachment.featureIndex] } : null;
  }

  if (attachment.featureType === 'face') {
    const face = columnFaces(column).find((entry) => entry.index === attachment.featureIndex);
    if (!face) return null;
    const clamped = Math.max(-face.length / 2, Math.min(face.length / 2, attachment.offset || 0));
    return add(face.midpoint, scale(face.tangent, clamped));
  }

  if (attachment.featureType === 'centerline') {
    const centerline = columnCenterlines(column).find((entry) => entry.index === attachment.featureIndex);
    if (!centerline) return null;
    return add(columnCenter(column), scale(centerline.axis, attachment.offset || 0));
  }

  return null;
}

export function syncWallAttachmentPoints(wall, columns = []) {
  let nextWall = { ...wall };

  for (const endpoint of ['start', 'end']) {
    const attachmentKey = `${endpoint}Attachment`;
    const attachment = nextWall[attachmentKey];
    if (!attachment) continue;

    const column = findColumn(columns, attachment.columnId);
    if (!column) {
      nextWall = { ...nextWall, [attachmentKey]: null };
      continue;
    }

    const point = resolveColumnAttachmentPoint(column, attachment);
    if (!point) {
      nextWall = { ...nextWall, [attachmentKey]: null };
      continue;
    }

    nextWall = {
      ...nextWall,
      [endpoint]: point,
      [attachmentKey]: cloneAttachment(attachment),
    };
  }

  return nextWall;
}

export function detachColumnAttachments(wall, columns = [], columnId) {
  const syncedWall = syncWallAttachmentPoints(wall, columns);
  let nextWall = syncedWall;

  for (const endpoint of ['start', 'end']) {
    const attachmentKey = `${endpoint}Attachment`;
    if (nextWall[attachmentKey]?.columnId !== columnId) continue;
    nextWall = {
      ...nextWall,
      [attachmentKey]: null,
    };
  }

  return nextWall;
}

export function getWallRenderData(wall, columns = []) {
  const syncedWall = syncWallAttachmentPoints(wall, columns);
  const trimStart = findTrimPoint(syncedWall.start, syncedWall.end, syncedWall.startAttachment, columns);
  const trimEnd = findTrimPoint(syncedWall.end, syncedWall.start, syncedWall.endAttachment, columns);
  const outline = makeOutline(trimStart, trimEnd, syncedWall.thickness);

  return {
    wall: syncedWall,
    renderWall: {
      ...syncedWall,
      start: trimStart,
      end: trimEnd,
    },
    outline,
    trimStart,
    trimEnd,
  };
}

export function snapWallEndpoint(modelPos, {
  walls = [],
  columns = [],
  snapDist,
  chainStart = null,
  otherPoint = null,
  ignoreWallId = null,
} = {}) {
  let best = null;
  const directionHint = otherPoint && distance(otherPoint, modelPos) > EPSILON
    ? normalize(subtract(modelPos, otherPoint))
    : null;

  const consider = (point, priority, attachment = null) => {
    const candidateDistance = distance(modelPos, point);
    if (candidateDistance > snapDist) return;
    best = setBestCandidate(best, {
      point: { x: point.x, y: point.y },
      attachment: cloneAttachment(attachment),
      priority,
      distance: candidateDistance,
    });
  };

  if (chainStart) {
    consider(chainStart, 0, null);
  }

  for (const wall of walls) {
    if (wall.id === ignoreWallId) continue;
    consider(wall.start, 1, null);
    consider(wall.end, 1, null);
  }

  for (const column of columns) {
    const corners = columnOutline(column);
    corners.forEach((corner, index) => {
      consider(corner, 2, {
        kind: 'column',
        columnId: column.id,
        featureType: 'corner',
        featureIndex: index,
      });
    });

    for (const face of columnFaces(column)) {
      consider(face.midpoint, 3, buildFaceAttachment(column, face, face.midpoint));
    }

    if (directionHint) {
      for (const centerline of columnCenterlines(column)) {
        if (Math.abs(dot(directionHint, centerline.axis)) < CENTERLINE_ALIGNMENT_THRESHOLD) continue;
        const center = columnCenter(column);
        const projection = dot(subtract(modelPos, center), centerline.axis);
        if (Math.abs(projection) > centerline.halfLength + snapDist) continue;
        const point = add(center, scale(centerline.axis, projection));
        consider(point, 4, buildCenterlineAttachment(column, centerline, point));
      }
    }

    for (const face of columnFaces(column)) {
      const { point } = nearestPointOnSegment(modelPos, face.start, face.end);
      consider(point, 5, buildFaceAttachment(column, face, point));
    }
  }

  for (const wall of walls) {
    if (wall.id === ignoreWallId) continue;
    const { point, t } = nearestPointOnSegment(modelPos, wall.start, wall.end);
    if (t <= 0.001 || t >= 0.999) continue;
    consider(point, 6, null);
  }

  if (!best) return null;
  return {
    point: best.point,
    attachment: best.attachment,
  };
}

export function resolveWallEndpoint(wall, endpointKey, columns = []) {
  const syncedWall = syncWallAttachmentPoints(wall, columns);
  return { ...syncedWall[endpointKey] };
}

export function resolveWallEndpoints(wall, columns = []) {
  const syncedWall = syncWallAttachmentPoints(wall, columns);
  return {
    start: { ...syncedWall.start },
    end: { ...syncedWall.end },
    startAttachment: cloneAttachment(syncedWall.startAttachment),
    endAttachment: cloneAttachment(syncedWall.endAttachment),
  };
}

export function resolveCenterlineAxis(column, featureIndex) {
  const { xAxis, yAxis } = columnAxes(column);
  return featureIndex === 1 ? yAxis : xAxis;
}
