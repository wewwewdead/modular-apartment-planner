import { dot, normalize, perpendicular, subtract } from '@/geometry/point';
import { polygonArea, polygonCentroid, signedPolygonArea } from '@/geometry/polygon';

const EPSILON = 1e-6;
const ANGLE_THRESHOLD = 0.18;

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : null;
}

function clonePoints(points = []) {
  return points.map(clonePoint).filter(Boolean);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function pointKey(point) {
  return `${Number(point?.x || 0).toFixed(3)},${Number(point?.y || 0).toFixed(3)}`;
}

function edgeIdFromGeometryKey(geometryKey, prefix = 'roof_edge') {
  return `${prefix}_${String(geometryKey || 'edge').replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function normalizeDirection(direction = null) {
  const x = Number(direction?.x);
  const y = Number(direction?.y);
  const length = Math.hypot(x, y);
  if (!length) {
    return { x: 0, y: 1 };
  }
  return { x: x / length, y: y / length };
}

function uniqueSequentialPoints(points = []) {
  const unique = [];

  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-4) {
      unique.push(point);
    }
  }

  if (unique.length > 1) {
    const first = unique[0];
    const last = unique[unique.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= 1e-4) {
      unique.pop();
    }
  }

  return unique;
}

function ensureCounterClockwise(points = []) {
  const normalized = uniqueSequentialPoints(clonePoints(points));
  return signedPolygonArea(normalized) >= 0 ? normalized : [...normalized].reverse();
}

function buildRoofEdgeGeometryKey(startPoint, endPoint) {
  const startKey = pointKey(startPoint);
  const endKey = pointKey(endPoint);
  return [startKey, endKey].sort().join('|');
}

function segmentLength(startPoint, endPoint) {
  return Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
}

function classifyPlaneEdge(plane, startPoint, endPoint) {
  const vector = subtract(endPoint, startPoint);
  const length = Math.hypot(vector.x, vector.y) || 1;
  const direction = { x: vector.x / length, y: vector.y / length };
  const interiorNormal = normalize(perpendicular(direction));
  const slopeDirection = normalizeDirection(plane.slopeDirection);
  const slopeAlignment = dot(slopeDirection, interiorNormal);

  if (slopeAlignment > ANGLE_THRESHOLD) {
    return { relation: 'away', slopeAlignment };
  }
  if (slopeAlignment < -ANGLE_THRESHOLD) {
    return { relation: 'toward', slopeAlignment };
  }
  return { relation: 'neutral', slopeAlignment };
}

function classifySharedEdge(entries = []) {
  const relations = entries.map((entry) => entry.relation);
  if (relations.every((relation) => relation === 'toward')) return 'valley';
  if (relations.every((relation) => relation === 'away')) return 'ridge';
  if (relations.some((relation) => relation === 'away') && relations.some((relation) => relation === 'neutral')) {
    return 'hip';
  }
  if (relations.some((relation) => relation === 'toward') && relations.some((relation) => relation === 'neutral')) {
    return 'valley';
  }
  return 'transition';
}

function classifyPerimeterEdge(entry) {
  switch (entry.relation) {
    case 'toward':
      return 'eave';
    case 'away':
      return 'high_edge';
    default:
      return 'rake';
  }
}

function normalizePlane(plane, index, roofBaseElevation) {
  const boundaryPoints = ensureCounterClockwise(plane?.boundaryPoints || []);
  if (boundaryPoints.length < 3 || polygonArea(boundaryPoints) <= 1) {
    return null;
  }

  return {
    id: plane?.id || `roof_plane_${index + 1}`,
    name: plane?.name || `Plane ${index + 1}`,
    boundaryPoints,
    slope: Math.max(0, Number(plane?.slope || 0)),
    slopeDirection: normalizeDirection(plane?.slopeDirection ?? plane?.direction),
    baseElevation: isFiniteNumber(plane?.baseElevation) ? plane.baseElevation : roofBaseElevation,
    heightRule: plane?.heightRule ?? 'base_low_edge',
    material: plane?.material ?? '',
    planeType: plane?.planeType ?? 'roof_plane',
    centroid: polygonCentroid(boundaryPoints),
  };
}

function createRelationshipCollection(edges = [], role = 'ridge') {
  return edges
    .filter((edge) => edge.edgeRole === role)
    .map((edge, index) => ({
      id: edge.id,
      edgeId: edge.id,
      name: edge.name || `${role.charAt(0).toUpperCase() + role.slice(1)} ${index + 1}`,
      startPoint: clonePoint(edge.startPoint),
      endPoint: clonePoint(edge.endPoint),
      planeIds: [...new Set(edge.planeIds || [])],
    }));
}

function buildPerimeterLoops(perimeterEdges = []) {
  const available = perimeterEdges
    .filter((edge) => edge.sourceStartPoint && edge.sourceEndPoint)
    .map((edge) => ({
      ...edge,
      startKey: pointKey(edge.sourceStartPoint),
      endKey: pointKey(edge.sourceEndPoint),
      visited: false,
    }));
  const loops = [];

  function takeNextEdge(currentKey) {
    const direct = available.find((edge) => !edge.visited && edge.startKey === currentKey);
    if (direct) return { edge: direct, reversed: false };

    const reversed = available.find((edge) => !edge.visited && edge.endKey === currentKey);
    if (reversed) return { edge: reversed, reversed: true };

    return null;
  }

  for (const initial of available) {
    if (initial.visited) continue;

    initial.visited = true;
    const points = [clonePoint(initial.sourceStartPoint), clonePoint(initial.sourceEndPoint)];
    const startKey = pointKey(initial.sourceStartPoint);
    let currentKey = pointKey(initial.sourceEndPoint);
    let guard = 0;

    while (currentKey !== startKey && guard < available.length + 2) {
      guard += 1;
      const next = takeNextEdge(currentKey);
      if (!next) break;

      next.edge.visited = true;
      const nextPoint = next.reversed
        ? clonePoint(next.edge.sourceStartPoint)
        : clonePoint(next.edge.sourceEndPoint);
      points.push(nextPoint);
      currentKey = pointKey(nextPoint);
    }

    if (currentKey === startKey && points.length >= 4) {
      points.pop();
      const loop = uniqueSequentialPoints(points);
      if (loop.length >= 3 && polygonArea(loop) > 1) {
        loops.push(loop);
      }
    }
  }

  return loops.sort((a, b) => polygonArea(b) - polygonArea(a));
}

export function deriveCustomRoofTopology(roofSystem) {
  const roofBaseElevation = Number(roofSystem?.baseElevation || 0);
  const roofPlanes = (roofSystem?.roofPlanes || [])
    .map((plane, index) => normalizePlane(plane, index, roofBaseElevation))
    .filter(Boolean);
  const overrideMap = new Map(
    (roofSystem?.roofEdges || [])
      .filter(Boolean)
      .map((edge) => [edge.geometryKey || edge.id, edge])
  );

  const seamMap = new Map();

  for (const plane of roofPlanes) {
    const boundaryPoints = plane.boundaryPoints || [];
    for (let index = 0; index < boundaryPoints.length; index += 1) {
      const startPoint = boundaryPoints[index];
      const endPoint = boundaryPoints[(index + 1) % boundaryPoints.length];
      if (segmentLength(startPoint, endPoint) <= EPSILON) continue;

      const geometryKey = buildRoofEdgeGeometryKey(startPoint, endPoint);
      const classification = classifyPlaneEdge(plane, startPoint, endPoint);
      const entry = {
        geometryKey,
        planeId: plane.id,
        startPoint: clonePoint(startPoint),
        endPoint: clonePoint(endPoint),
        relation: classification.relation,
        slopeAlignment: classification.slopeAlignment,
      };

      if (!seamMap.has(geometryKey)) {
        seamMap.set(geometryKey, []);
      }
      seamMap.get(geometryKey).push(entry);
    }
  }

  const roofEdges = [...seamMap.entries()].map(([geometryKey, entries]) => {
    const first = entries[0];
    const startPoint = clonePoint(first.startPoint);
    const endPoint = clonePoint(first.endPoint);
    const planeIds = [...new Set(entries.map((entry) => entry.planeId))];
    const isPerimeter = planeIds.length === 1;
    const derivedRole = isPerimeter
      ? classifyPerimeterEdge(first)
      : classifySharedEdge(entries);
    const override = overrideMap.get(geometryKey) || null;
    const roleOverride = override?.edgeRole && override.edgeRole !== 'derived'
      ? override.edgeRole
      : null;
    const edgeRole = roleOverride || derivedRole;

    return {
      id: override?.id || edgeIdFromGeometryKey(geometryKey),
      name: override?.name ?? '',
      geometryKey,
      startPoint,
      endPoint,
      sourceStartPoint: clonePoint(first.startPoint),
      sourceEndPoint: clonePoint(first.endPoint),
      planeIds,
      derivedRole,
      edgeRole,
      roleOverride,
      isPerimeter,
      length: segmentLength(startPoint, endPoint),
    };
  });

  const perimeterLoops = buildPerimeterLoops(roofEdges.filter((edge) => edge.isPerimeter));

  return {
    roofPlanes,
    roofEdges,
    ridges: createRelationshipCollection(roofEdges, 'ridge'),
    valleys: createRelationshipCollection(roofEdges, 'valley'),
    hips: createRelationshipCollection(roofEdges, 'hip'),
    perimeterLoops,
  };
}

export { buildRoofEdgeGeometryKey };
