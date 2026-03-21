import { calculateDistance } from './canvasMath';
import { getRectCorners } from './entityUtils';
import { filterNonIsometricEntities } from './isometricUtils';

const DEFAULT_CLOSE_TOLERANCE = 0.5;
const CIRCLE_SEGMENTS = 16;
const LOOP_TOLERANCE = 0.5;

function pointsEqual(left, right, tolerance = LOOP_TOLERANCE) {
  return calculateDistance(left, right) <= tolerance;
}

function segmentKey(start, end) {
  const a = `${start.x}:${start.y}`;
  const b = `${end.x}:${end.y}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function roundPoint(point, precision = 1000) {
  return {
    x: Math.round(point.x * precision) / precision,
    y: Math.round(point.y * precision) / precision,
  };
}

export function isPolylineClosed(entity, tolerance = DEFAULT_CLOSE_TOLERANCE) {
  if (!entity || entity.type !== 'polyline' || entity.points.length < 3) {
    return false;
  }

  if (entity.closed) {
    return true;
  }

  return calculateDistance(entity.points[0], entity.points.at(-1)) <= tolerance;
}

export function closePolyline(entity) {
  if (!entity || entity.type !== 'polyline') {
    return entity;
  }

  return {
    ...entity,
    closed: true,
  };
}

export function normalizeLoopPoints(points = [], tolerance = DEFAULT_CLOSE_TOLERANCE) {
  if (!points.length) {
    return [];
  }

  const normalized = points.map((point) => roundPoint(point));

  if (normalized.length > 1 && pointsEqual(normalized[0], normalized.at(-1), tolerance)) {
    normalized.pop();
  }

  return normalized;
}

export function getProfilePoints(entity) {
  if (!entity) {
    return [];
  }

  if (entity.type === 'polyline' && isPolylineClosed(entity)) {
    return entity.points.map((point) => ({ ...point }));
  }

  if (entity.type === 'rect') {
    const corners = getRectCorners(entity);
    return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  }

  if (entity.type === 'circle') {
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
      const angle = (Math.PI * 2 * index) / CIRCLE_SEGMENTS;
      return {
        x: entity.cx + Math.cos(angle) * entity.r,
        y: entity.cy + Math.sin(angle) * entity.r,
      };
    });
  }

  return [];
}

export function getClosedProfileArea(entity) {
  const points = getProfilePoints(entity);

  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += (point.x * next.y) - (next.x * point.y);
  }

  return Math.abs(area / 2);
}

export function extractProfileLoops(entities) {
  return extractClosedLoopsFromEntities(entities);
}

export function computeProfileBoundingBox(points) {
  if (!points.length) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function computeProfileFootprintPayload(entity) {
  const points = getProfilePoints(entity);

  if (!points.length) {
    return null;
  }

  return {
    type: 'profile',
    points,
  };
}

function buildLineSegments(entities) {
  return entities
    .filter((entity) => entity.type === 'line')
    .map((entity) => ({
      entityId: entity.id,
      start: { x: entity.x1, y: entity.y1 },
      end: { x: entity.x2, y: entity.y2 },
    }));
}

function createNodeMap(segments, tolerance = LOOP_TOLERANCE) {
  const nodes = [];

  function getNode(point) {
    const existing = nodes.find((node) => pointsEqual(node.point, point, tolerance));

    if (existing) {
      return existing;
    }

    const nextNode = {
      id: `node-${nodes.length + 1}`,
      point: roundPoint(point),
      segments: [],
    };
    nodes.push(nextNode);
    return nextNode;
  }

  segments.forEach((segment) => {
    const startNode = getNode(segment.start);
    const endNode = getNode(segment.end);
    startNode.segments.push(segment);
    endNode.segments.push(segment);
    segment.startNode = startNode;
    segment.endNode = endNode;
  });

  return nodes;
}

export function buildLoopFromConnectedSegments(segments) {
  if (!segments.length) {
    return null;
  }

  const nodes = createNodeMap(segments);

  if (!nodes.length || nodes.some((node) => node.segments.length !== 2)) {
    return null;
  }

  const orderedPoints = [nodes[0].point];
  let currentNode = nodes[0];
  let previousSegment = null;
  let guard = 0;

  while (guard < segments.length + 2) {
    const nextSegment = currentNode.segments.find((segment) => segment !== previousSegment);

    if (!nextSegment) {
      return null;
    }

    const nextNode = nextSegment.startNode === currentNode ? nextSegment.endNode : nextSegment.startNode;

    if (nextNode.id === nodes[0].id) {
      return normalizeLoopPoints(orderedPoints);
    }

    orderedPoints.push(nextNode.point);
    previousSegment = nextSegment;
    currentNode = nextNode;
    guard += 1;
  }

  return null;
}

export function extractClosedLoopsFromEntities(entities) {
  const geometryEntities = filterNonIsometricEntities(entities);
  const explicitLoops = geometryEntities
    .filter((entity) => entity.type === 'rect' || entity.type === 'circle' || isPolylineClosed(entity))
    .map((entity) => ({
      entityId: entity.id,
      points: normalizeLoopPoints(getProfilePoints(entity)),
      area: getClosedProfileArea(entity),
      type: entity.type,
      sourceEntityIds: [entity.id],
    }))
    .filter((loop) => loop.points.length >= 3);

  const lineSegments = buildLineSegments(geometryEntities);
  if (!lineSegments.length) {
    return explicitLoops;
  }

  const unused = new Map(lineSegments.map((segment) => [segmentKey(segment.start, segment.end), segment]));
  const lineLoops = [];

  while (unused.size) {
    const [firstKey, firstSegment] = unused.entries().next().value;
    unused.delete(firstKey);
    const componentSegments = [firstSegment];
    const stack = [firstSegment];

    while (stack.length) {
      const current = stack.pop();
      const related = lineSegments.filter((segment) => (
        unused.has(segmentKey(segment.start, segment.end))
        && (
          pointsEqual(segment.start, current.start)
          || pointsEqual(segment.start, current.end)
          || pointsEqual(segment.end, current.start)
          || pointsEqual(segment.end, current.end)
        )
      ));

      related.forEach((segment) => {
        const key = segmentKey(segment.start, segment.end);
        if (!unused.has(key)) {
          return;
        }
        unused.delete(key);
        componentSegments.push(segment);
        stack.push(segment);
      });
    }

    const loopPoints = buildLoopFromConnectedSegments(componentSegments);
    if (!loopPoints || loopPoints.length < 3) {
      continue;
    }

    lineLoops.push({
      entityId: `loop-${lineLoops.length + 1}`,
      points: loopPoints,
      area: getClosedProfileArea({ type: 'polyline', points: loopPoints, closed: true }),
      type: 'segment-loop',
      sourceEntityIds: componentSegments.map((segment) => segment.entityId),
    });
  }

  return [...explicitLoops, ...lineLoops];
}

export function loopToFootprintPayload(loop) {
  const points = normalizeLoopPoints(loop?.points || []);

  if (points.length < 3) {
    return null;
  }

  return {
    type: 'profile',
    points,
  };
}
