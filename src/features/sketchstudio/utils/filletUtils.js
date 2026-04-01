import { calculateDistance, getVector, normalizeVector } from './canvasMath';
import { createArcEntity, createBaseEntity, createEntityId, getRectCorners } from './entityUtils';

const ENDPOINT_MERGE_TOLERANCE = 2;
const DEFAULT_FILLET_RADIUS = 50;
const MIN_FILLET_RADIUS = 5;
const MAX_FILLET_RADIUS = 1000;
const FILLET_RADIUS_STEP = 10;

export { DEFAULT_FILLET_RADIUS, MIN_FILLET_RADIUS, MAX_FILLET_RADIUS, FILLET_RADIUS_STEP };

function getLineEndpoints(entity) {
  return [
    { key: 'start', point: { x: entity.x1, y: entity.y1 } },
    { key: 'end', point: { x: entity.x2, y: entity.y2 } },
  ];
}

function getLineOtherEndpoint(entity, endpointKey) {
  if (endpointKey === 'start') {
    return { x: entity.x2, y: entity.y2 };
  }

  return { x: entity.x1, y: entity.y1 };
}

function findLineLineCorner(entities, worldPoint, tolerance) {
  const lines = entities.filter((entity) => entity.type === 'line');

  if (lines.length < 2) {
    return null;
  }

  const endpoints = [];

  for (const line of lines) {
    for (const ep of getLineEndpoints(line)) {
      endpoints.push({ entity: line, ...ep });
    }
  }

  // Group endpoints by proximity
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < endpoints.length; i += 1) {
    if (assigned.has(i)) {
      continue;
    }

    const group = [endpoints[i]];
    assigned.add(i);

    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (assigned.has(j)) {
        continue;
      }

      if (calculateDistance(endpoints[i].point, endpoints[j].point) <= Math.max(tolerance, ENDPOINT_MERGE_TOLERANCE)) {
        group.push(endpoints[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  // Find closest group with exactly 2 distinct lines
  let bestGroup = null;
  let bestDist = Infinity;

  for (const group of groups) {
    const entityIds = new Set(group.map((ep) => ep.entity.id));

    if (entityIds.size !== 2) {
      continue;
    }

    const centroid = {
      x: group.reduce((sum, ep) => sum + ep.point.x, 0) / group.length,
      y: group.reduce((sum, ep) => sum + ep.point.y, 0) / group.length,
    };
    const dist = calculateDistance(worldPoint, centroid);

    if (dist < bestDist && dist <= tolerance) {
      bestDist = dist;
      bestGroup = group;
    }
  }

  if (!bestGroup) {
    return null;
  }

  // Extract two distinct entities
  const seen = new Set();
  const entries = [];

  for (const ep of bestGroup) {
    if (!seen.has(ep.entity.id)) {
      seen.add(ep.entity.id);
      entries.push(ep);
    }
  }

  if (entries.length !== 2) {
    return null;
  }

  const cornerPoint = {
    x: bestGroup.reduce((sum, ep) => sum + ep.point.x, 0) / bestGroup.length,
    y: bestGroup.reduce((sum, ep) => sum + ep.point.y, 0) / bestGroup.length,
  };

  return {
    type: 'line-line',
    cornerPoint,
    entity1: entries[0].entity,
    entity1Endpoint: entries[0].key,
    entity2: entries[1].entity,
    entity2Endpoint: entries[1].key,
  };
}

function findPolylineVertexCorner(entities, worldPoint, tolerance) {
  const polylines = entities.filter((entity) => entity.type === 'polyline');
  let bestCorner = null;
  let bestDist = Infinity;

  for (const polyline of polylines) {
    const points = polyline.points;

    if (!points || points.length < 3) {
      continue;
    }

    const startIdx = polyline.closed ? 0 : 1;
    const endIdx = polyline.closed ? points.length : points.length - 1;

    for (let i = startIdx; i < endIdx; i += 1) {
      const vertex = points[i];
      const dist = calculateDistance(worldPoint, vertex);

      if (dist < bestDist && dist <= tolerance) {
        bestDist = dist;
        bestCorner = {
          type: 'polyline-vertex',
          cornerPoint: { ...vertex },
          entity: polyline,
          vertexIndex: i,
          prevPoint: points[(i - 1 + points.length) % points.length],
          nextPoint: points[(i + 1) % points.length],
        };
      }
    }
  }

  return bestCorner;
}

function findRectCorner(entities, worldPoint, tolerance) {
  const rects = entities.filter((entity) => entity.type === 'rect');
  let bestCorner = null;
  let bestDist = Infinity;

  for (const rect of rects) {
    const corners = getRectCorners(rect);
    const cornerEntries = [
      { key: 'topLeft', point: corners.topLeft, prevKey: 'bottomLeft', nextKey: 'topRight' },
      { key: 'topRight', point: corners.topRight, prevKey: 'topLeft', nextKey: 'bottomRight' },
      { key: 'bottomRight', point: corners.bottomRight, prevKey: 'topRight', nextKey: 'bottomLeft' },
      { key: 'bottomLeft', point: corners.bottomLeft, prevKey: 'bottomRight', nextKey: 'topLeft' },
    ];

    for (const entry of cornerEntries) {
      const dist = calculateDistance(worldPoint, entry.point);

      if (dist < bestDist && dist <= tolerance) {
        bestDist = dist;
        bestCorner = {
          type: 'rect-corner',
          cornerPoint: { ...entry.point },
          entity: rect,
          cornerKey: entry.key,
          prevPoint: corners[entry.prevKey],
          nextPoint: corners[entry.nextKey],
        };
      }
    }
  }

  return bestCorner;
}

export function findFilletableCorner(entities, worldPoint, tolerance) {
  // Check line-line corners first (most common), then polyline, then rect
  const lineLine = findLineLineCorner(entities, worldPoint, tolerance);

  if (lineLine) {
    return lineLine;
  }

  const polyVertex = findPolylineVertexCorner(entities, worldPoint, tolerance);

  if (polyVertex) {
    return polyVertex;
  }

  return findRectCorner(entities, worldPoint, tolerance);
}

export function computeSketchFillet(corner, radius) {
  const { cornerPoint } = corner;
  let dir1;
  let dir2;
  let edgeLength1;
  let edgeLength2;

  if (corner.type === 'line-line') {
    const other1 = getLineOtherEndpoint(corner.entity1, corner.entity1Endpoint);
    const other2 = getLineOtherEndpoint(corner.entity2, corner.entity2Endpoint);
    dir1 = normalizeVector(getVector(cornerPoint, other1));
    dir2 = normalizeVector(getVector(cornerPoint, other2));
    edgeLength1 = calculateDistance(cornerPoint, other1);
    edgeLength2 = calculateDistance(cornerPoint, other2);
  } else {
    // polyline-vertex or rect-corner: use prevPoint and nextPoint
    dir1 = normalizeVector(getVector(cornerPoint, corner.prevPoint));
    dir2 = normalizeVector(getVector(cornerPoint, corner.nextPoint));
    edgeLength1 = calculateDistance(cornerPoint, corner.prevPoint);
    edgeLength2 = calculateDistance(cornerPoint, corner.nextPoint);
  }

  // Angle between the two direction vectors
  const dotProduct = Math.max(-1, Math.min(1, dir1.x * dir2.x + dir1.y * dir2.y));
  const angle = Math.acos(dotProduct);

  // Reject nearly parallel or coincident edges
  if (angle < 0.05 || angle > Math.PI - 0.05) {
    return null;
  }

  // Tangent distance from corner to tangent point
  const halfAngle = angle / 2;
  let tangentDist = radius / Math.tan(halfAngle);
  let effectiveRadius = radius;

  // Auto-clamp radius if edges are too short
  const maxTangentDist = Math.min(edgeLength1, edgeLength2) * 0.9;
  if (maxTangentDist <= 1) {
    return null;
  }
  if (tangentDist > maxTangentDist) {
    tangentDist = maxTangentDist;
    effectiveRadius = tangentDist * Math.tan(halfAngle);
  }

  const tangentPoint1 = {
    x: cornerPoint.x + dir1.x * tangentDist,
    y: cornerPoint.y + dir1.y * tangentDist,
  };

  const tangentPoint2 = {
    x: cornerPoint.x + dir2.x * tangentDist,
    y: cornerPoint.y + dir2.y * tangentDist,
  };

  // Control point for quadratic Bezier is the original corner
  const controlPoint = { ...cornerPoint };

  return { tangentPoint1, tangentPoint2, controlPoint, radius: effectiveRadius };
}

function sampleArcPoints(start, control, end, numSegments = 8) {
  const points = [];

  for (let i = 1; i < numSegments; i += 1) {
    const t = i / numSegments;
    const mt = 1 - t;
    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }

  return points;
}

function updateLineEndpoint(entity, endpointKey, newPoint) {
  if (endpointKey === 'start') {
    return { ...entity, x1: newPoint.x, y1: newPoint.y };
  }

  return { ...entity, x2: newPoint.x, y2: newPoint.y };
}

function rectToLines(rect, entities, layerId) {
  const corners = getRectCorners(rect);
  const edges = [
    { from: corners.topLeft, to: corners.topRight },
    { from: corners.topRight, to: corners.bottomRight },
    { from: corners.bottomRight, to: corners.bottomLeft },
    { from: corners.bottomLeft, to: corners.topLeft },
  ];

  // Build lines incrementally so each gets a unique ID
  const lines = [];
  let allEntities = entities;

  for (const edge of edges) {
    const line = createBaseEntity({
      id: createEntityId('line', allEntities),
      type: 'line',
      x1: edge.from.x,
      y1: edge.from.y,
      x2: edge.to.x,
      y2: edge.to.y,
    }, layerId);
    lines.push(line);
    allEntities = [...allEntities, line];
  }

  return lines;
}

function getRectEdgePairForCorner(cornerKey) {
  // Returns [lineIndex1, endpoint1, lineIndex2, endpoint2]
  // Edges order: top(0), right(1), bottom(2), left(3)
  const map = {
    topLeft: [3, 'end', 0, 'start'],
    topRight: [0, 'end', 1, 'start'],
    bottomRight: [1, 'end', 2, 'start'],
    bottomLeft: [2, 'end', 3, 'start'],
  };

  return map[cornerKey];
}

export function applyFillet(entities, corner, geometry, layerId) {
  const { tangentPoint1, tangentPoint2, controlPoint } = geometry;
  const filletMeta = { filletRadius: geometry.radius };

  if (corner.type === 'line-line') {
    const newEntities = entities.map((entity) => {
      if (entity.id === corner.entity1.id) {
        return updateLineEndpoint(entity, corner.entity1Endpoint, tangentPoint1);
      }

      if (entity.id === corner.entity2.id) {
        return updateLineEndpoint(entity, corner.entity2Endpoint, tangentPoint2);
      }

      return entity;
    });

    const arcEntity = createArcEntity(tangentPoint1, tangentPoint2, controlPoint, newEntities, layerId, filletMeta);

    return [...newEntities, arcEntity];
  }

  if (corner.type === 'rect-corner') {
    // Convert rect to 4 lines, remove rect, fillet the corner
    const rect = corner.entity;
    const lines = rectToLines(rect, entities, rect.layerId || layerId);
    const [lineIdx1, ep1, lineIdx2, ep2] = getRectEdgePairForCorner(corner.cornerKey);

    // Trim the two lines at the corner
    lines[lineIdx1] = updateLineEndpoint(lines[lineIdx1], ep1, tangentPoint1);
    lines[lineIdx2] = updateLineEndpoint(lines[lineIdx2], ep2, tangentPoint2);

    // Replace rect with lines + arc
    const withoutRect = entities.filter((entity) => entity.id !== rect.id);
    const allEntities = [...withoutRect, ...lines];
    const arcEntity = createArcEntity(tangentPoint1, tangentPoint2, controlPoint, allEntities, rect.layerId || layerId, filletMeta);

    return [...allEntities, arcEntity];
  }

  if (corner.type === 'polyline-vertex') {
    const polyline = corner.entity;
    const idx = corner.vertexIndex;

    // Sample arc points and inline them into the polyline so closed polygons render correctly
    const arcSamples = sampleArcPoints(tangentPoint1, controlPoint, tangentPoint2, 8);
    const newPoints = [...polyline.points];
    newPoints.splice(idx, 1, tangentPoint1, ...arcSamples, tangentPoint2);

    return entities.map((entity) => {
      if (entity.id === polyline.id) {
        return { ...entity, points: newPoints };
      }

      return entity;
    });
  }

  return entities;
}
