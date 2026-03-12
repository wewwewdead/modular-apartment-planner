import { add, distance, dot, midpoint, normalize, perpendicular, scale, subtract } from './point';
import { distanceToSegment, nearestPointOnSegment } from './line';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { pointInPolygon, polygonCentroid, signedPolygonArea } from './polygon';
import { wallLength, wallOutline } from './wallGeometry';

const DRAIN_HIT_PADDING = 180;
const EDGE_EPSILON = 1e-4;
const PARAPET_ALIGNMENT_THRESHOLD = 0.82;

function classifyParapetEdge(edge, roofGeometry, axisRange) {
  const roofType = roofGeometry.roofType || 'flat';
  const axisSpan = Math.max(0, axisRange.max - axisRange.min);
  const axisTolerance = Math.max(180, axisSpan * 0.08);
  const midpointAxis = edge.axisValue;
  const nearLow = midpointAxis >= axisRange.max - axisTolerance;
  const nearHigh = midpointAxis <= axisRange.min + axisTolerance;
  const alongSlope = Math.abs(dot(edge.direction, roofGeometry.direction || { x: 0, y: 1 })) >= PARAPET_ALIGNMENT_THRESHOLD;

  if (roofType === 'flat') {
    return { role: 'perimeter', label: 'Perimeter Edge', allowed: true };
  }

  if (roofType === 'shed') {
    if (nearHigh) return { role: 'high_edge', label: 'High Edge', allowed: true };
    if (nearLow) return { role: 'low_eave', label: 'Low Eave', allowed: false };
    if (alongSlope) return { role: 'rake_edge', label: 'Rake Edge', allowed: true };
    return { role: 'transition_edge', label: 'Transition Edge', allowed: false };
  }

  if (roofType === 'gable') {
    if (nearHigh || nearLow) return { role: 'eave', label: 'Eave', allowed: false };
    if (alongSlope) return { role: 'gable_end', label: 'Gable End', allowed: true };
    return { role: 'transition_edge', label: 'Transition Edge', allowed: false };
  }

  return { role: 'edge', label: 'Edge', allowed: false };
}

function classifyCustomBoundaryEdge(edge, roofGeometry, outlineOrientation) {
  const baseNormal = normalize(perpendicular(edge.direction));
  const interiorNormal = outlineOrientation >= 0
    ? baseNormal
    : scale(baseNormal, -1);
  const samplePoint = add(edge.midpoint, scale(interiorNormal, 40));
  const plane = roofGeometry.findPlaneAtPoint(samplePoint) || roofGeometry.findPlaneAtPoint(edge.midpoint);
  const slopeDirection = plane?.slopeDirection || { x: 0, y: 0 };
  const slopeAlignment = dot(slopeDirection, interiorNormal);

  if (slopeAlignment < -0.18) {
    return {
      role: 'eave',
      label: 'Eave',
      allowed: true,
      planeId: plane?.id || null,
    };
  }

  if (slopeAlignment > 0.18) {
    return {
      role: 'high_edge',
      label: 'High Edge',
      allowed: true,
      planeId: plane?.id || null,
    };
  }

  return {
    role: 'rake',
    label: 'Rake Edge',
    allowed: true,
    planeId: plane?.id || null,
  };
}

function polygonPoints(points = []) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function polygonPath(points = []) {
  return points.length ? `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} Z` : '';
}

function ensurePoint(point) {
  return point ? { x: point.x, y: point.y } : { x: 0, y: 0 };
}

function createBoundsFromPoints(points = []) {
  if (!points.length) {
    return {
      minX: -1000,
      maxX: 1000,
      minY: -1000,
      maxY: 1000,
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointAlongEdge(edge, offset) {
  return {
    x: edge.start.x + (edge.direction.x * offset),
    y: edge.start.y + (edge.direction.y * offset),
  };
}

export function buildRoofBoundaryEdges(roofSystem) {
  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const outline = (roofGeometry.roofOutline || roofSystem?.boundaryPolygon || []).map(ensurePoint);
  if (outline.length < 2) return [];
  const outlineOrientation = signedPolygonArea(outline) >= 0 ? 1 : -1;
  const axisRange = roofGeometry.roofOutline?.length
    ? {
        min: Math.min(...roofGeometry.roofOutline.map((point) => dot(subtract(point, roofGeometry.centroid), roofGeometry.direction))),
        max: Math.max(...roofGeometry.roofOutline.map((point) => dot(subtract(point, roofGeometry.centroid), roofGeometry.direction))),
      }
    : { min: 0, max: 0 };

  return outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length];
    const length = distance(start, end);
    const vector = subtract(end, start);
    const safeLength = length || 1;
    const midpointPoint = midpoint(start, end);
    const edge = {
      index,
      start,
      end,
      length,
      direction: {
        x: vector.x / safeLength,
        y: vector.y / safeLength,
      },
      midpoint: midpointPoint,
      axisValue: dot(subtract(midpointPoint, roofGeometry.centroid), roofGeometry.direction || { x: 0, y: 1 }),
    };
    const parapetPlacement = roofGeometry.roofType === 'custom'
      ? classifyCustomBoundaryEdge(edge, roofGeometry, outlineOrientation)
      : classifyParapetEdge(edge, roofGeometry, axisRange);

    return {
      ...edge,
      parapetPlacement,
    };
  }).filter((edge) => edge.length > EDGE_EPSILON);
}

export function buildRoofParapetCandidateEdges(roofSystem) {
  return buildRoofBoundaryEdges(roofSystem).filter((edge) => edge.parapetPlacement?.allowed);
}

export function projectPointToRoofEdge(edge, point) {
  if (!edge || !point) return null;
  const projection = nearestPointOnSegment(point, edge.start, edge.end);
  return {
    point: projection.point,
    offset: clamp(projection.t * edge.length, 0, edge.length),
    distance: distance(point, projection.point),
  };
}

export function findNearestRoofEdge(roofSystem, point, maxDistance = Infinity) {
  return findNearestRoofEdgeMatching(roofSystem, point, maxDistance, () => true);
}

export function findNearestRoofEdgeMatching(roofSystem, point, maxDistance = Infinity, predicate = () => true) {
  const edges = buildRoofBoundaryEdges(roofSystem).filter(predicate);
  let best = null;

  for (const edge of edges) {
    const hitDistance = distanceToSegment(point, edge.start, edge.end);
    if (hitDistance > maxDistance) continue;
    if (!best || hitDistance < best.distance) {
      best = {
        edge,
        distance: hitDistance,
        ...projectPointToRoofEdge(edge, point),
      };
    }
  }

  return best;
}

export function findNearestParapetCandidateEdge(roofSystem, point, maxDistance = Infinity) {
  return findNearestRoofEdgeMatching(
    roofSystem,
    point,
    maxDistance,
    (edge) => edge.parapetPlacement?.allowed
  );
}

export function buildRoofEdgeAttachmentForPoints(roofSystem, startPoint, endPoint, preferredEdgeIndex = null) {
  const edges = buildRoofBoundaryEdges(roofSystem);
  if (!edges.length || !startPoint || !endPoint) return null;

  const pickEdge = preferredEdgeIndex != null
    ? edges.find((edge) => edge.index === preferredEdgeIndex)
    : findNearestRoofEdge(roofSystem, midpoint(startPoint, endPoint))?.edge;

  if (!pickEdge) return null;

  const projectedStart = projectPointToRoofEdge(pickEdge, startPoint);
  const projectedEnd = projectPointToRoofEdge(pickEdge, endPoint);
  if (!projectedStart || !projectedEnd) return null;

  return {
    type: 'roof_edge',
    edgeIndex: pickEdge.index,
    startOffset: projectedStart.offset,
    endOffset: projectedEnd.offset,
  };
}

export function buildParapetEdgeAttachmentForPoints(roofSystem, startPoint, endPoint, preferredEdgeIndex = null) {
  const edges = buildRoofParapetCandidateEdges(roofSystem);
  if (!edges.length || !startPoint || !endPoint) return null;

  const pickEdge = preferredEdgeIndex != null
    ? edges.find((edge) => edge.index === preferredEdgeIndex)
    : findNearestParapetCandidateEdge(roofSystem, midpoint(startPoint, endPoint))?.edge;

  if (!pickEdge) return null;

  const projectedStart = projectPointToRoofEdge(pickEdge, startPoint);
  const projectedEnd = projectPointToRoofEdge(pickEdge, endPoint);
  if (!projectedStart || !projectedEnd) return null;

  return {
    type: 'roof_edge',
    edgeIndex: pickEdge.index,
    startOffset: projectedStart.offset,
    endOffset: projectedEnd.offset,
  };
}

export function resolveParapetLine(parapet, roofSystem = null) {
  if (!parapet) return null;

  const attachment = parapet.attachment;
  if (roofSystem && attachment?.type === 'roof_edge') {
    const edge = buildRoofBoundaryEdges(roofSystem).find((entry) => entry.index === attachment.edgeIndex);
    if (edge) {
      const startOffset = clamp(Number(attachment.startOffset ?? 0), 0, edge.length);
      const endOffset = clamp(
        Number(attachment.endOffset ?? edge.length),
        0,
        edge.length
      );

      return {
        startPoint: pointAlongEdge(edge, startOffset),
        endPoint: pointAlongEdge(edge, endOffset),
        edge,
        attachment,
      };
    }
  }

  if (!parapet?.startPoint || !parapet?.endPoint) return null;
  return {
    startPoint: ensurePoint(parapet.startPoint),
    endPoint: ensurePoint(parapet.endPoint),
    edge: null,
    attachment: attachment || null,
  };
}

export function getParapetRenderData(parapet, roofSystem = null) {
  const resolved = resolveParapetLine(parapet, roofSystem);
  if (!resolved?.startPoint || !resolved?.endPoint) return null;

  const outline = wallOutline({
    start: resolved.startPoint,
    end: resolved.endPoint,
    thickness: parapet.thickness ?? 0,
  });

  return {
    startPoint: resolved.startPoint,
    endPoint: resolved.endPoint,
    edge: resolved.edge,
    attachment: resolved.attachment,
    outline,
    points: polygonPoints(outline),
    length: wallLength({
      start: resolved.startPoint,
      end: resolved.endPoint,
    }),
  };
}

export function parapetContainsPoint(parapet, point, roofSystem = null) {
  const renderData = getParapetRenderData(parapet, roofSystem);
  return renderData ? pointInPolygon(point, renderData.outline) : false;
}

export function getDrainRenderData(drain) {
  const radius = Math.max(40, (drain?.diameter ?? 0) / 2);
  const position = ensurePoint(drain?.position);
  return {
    center: position,
    radius,
    innerRadius: Math.max(20, radius * 0.45),
  };
}

export function drainContainsPoint(drain, point) {
  const renderData = getDrainRenderData(drain);
  return distance(renderData.center, point) <= (renderData.radius + DRAIN_HIT_PADDING);
}

export function getRoofOpeningRenderData(opening) {
  const boundaryPoints = (opening?.boundaryPoints || []).map(ensurePoint);
  return {
    boundaryPoints,
    points: polygonPoints(boundaryPoints),
  };
}

export function roofOpeningContainsPoint(opening, point) {
  const boundaryPoints = opening?.boundaryPoints || [];
  return boundaryPoints.length >= 3 ? pointInPolygon(point, boundaryPoints) : false;
}

export function roofContainsPoint(roofSystem, point) {
  const boundary = buildRoofPlaneGeometry(roofSystem).roofOutline || roofSystem?.boundaryPolygon || [];
  if (boundary.length < 3 || !pointInPolygon(point, boundary)) return false;
  return !(roofSystem?.roofOpenings || []).some((opening) => roofOpeningContainsPoint(opening, point));
}

export function buildRoofPlanGeometry(roofSystem) {
  if (!roofSystem) {
    return {
      boundaryPoints: [],
      boundaryPointsString: '',
      boundaryPath: '',
      roofOutlinePoints: [],
      roofOutlinePointsString: '',
      roofOutlinePath: '',
      surfacePath: '',
      centroid: { x: 0, y: 0 },
      openings: [],
      parapets: [],
      drains: [],
      ridgeSegments: [],
      valleySegments: [],
      hipSegments: [],
      roofEdges: [],
      roofType: 'flat',
      pitch: null,
      roofPlanes: [],
      bounds: createBoundsFromPoints([]),
    };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const boundaryPoints = (roofSystem.boundaryPolygon || []).map(ensurePoint);
  const roofOutlinePoints = (roofGeometry.roofOutline || []).map(ensurePoint);
  const openings = (roofSystem.roofOpenings || []).map((opening) => ({
    ...opening,
    ...getRoofOpeningRenderData(opening),
  }));
  const parapets = (roofSystem.parapets || []).map((parapet) => ({
    ...parapet,
    ...getParapetRenderData(parapet, roofSystem),
  })).filter((parapet) => parapet.outline?.length);
  const drains = (roofSystem.drains || []).map((drain) => ({
    ...drain,
    ...getDrainRenderData(drain),
  }));
  const centroid = boundaryPoints.length >= 3 ? polygonCentroid(boundaryPoints) : { x: 0, y: 0 };
  const seamEdges = (roofGeometry.roofEdges || [])
    .filter((edge) => !edge.isPerimeter)
    .map((edge) => ({
      ...edge,
      startPoint: ensurePoint(edge.startPoint),
      endPoint: ensurePoint(edge.endPoint),
      points: polygonPoints([ensurePoint(edge.startPoint), ensurePoint(edge.endPoint)]),
    }));
  const ridgeSegments = roofGeometry.roofType === 'custom'
    ? seamEdges.filter((edge) => edge.edgeRole === 'ridge').map((edge) => ({
        id: edge.id,
        start: edge.startPoint,
        end: edge.endPoint,
      }))
    : (roofGeometry.ridgeSegment ? [roofGeometry.ridgeSegment] : []);
  const valleySegments = seamEdges
    .filter((edge) => edge.edgeRole === 'valley')
    .map((edge) => ({
      id: edge.id,
      start: edge.startPoint,
      end: edge.endPoint,
    }));
  const hipSegments = seamEdges
    .filter((edge) => edge.edgeRole === 'hip')
    .map((edge) => ({
      id: edge.id,
      start: edge.startPoint,
      end: edge.endPoint,
    }));
  const roofPlanes = (roofGeometry.planes || []).map((plane) => ({
    ...plane,
    outline: (plane.outline || []).map(ensurePoint),
    points: polygonPoints(plane.outline || []),
  }));

  const allPoints = [
    ...roofOutlinePoints,
    ...boundaryPoints,
    ...openings.flatMap((opening) => opening.boundaryPoints),
    ...parapets.flatMap((parapet) => parapet.outline || []),
    ...drains.flatMap((drain) => ([
      { x: drain.center.x - drain.radius, y: drain.center.y - drain.radius },
      { x: drain.center.x + drain.radius, y: drain.center.y + drain.radius },
    ])),
    ...ridgeSegments.flatMap((segment) => [segment.start, segment.end]),
    ...valleySegments.flatMap((segment) => [segment.start, segment.end]),
    ...hipSegments.flatMap((segment) => [segment.start, segment.end]),
    ...roofPlanes.flatMap((plane) => plane.outline || []),
  ];

  const boundaryPath = [
    polygonPath(boundaryPoints),
    ...openings
      .filter((opening) => opening.boundaryPoints.length >= 3)
      .map((opening) => polygonPath(opening.boundaryPoints)),
  ].filter(Boolean).join(' ');

  const roofOutlinePath = polygonPath(roofOutlinePoints);
  const surfacePath = [
    roofOutlinePath,
    ...openings
      .filter((opening) => opening.boundaryPoints.length >= 3)
      .map((opening) => polygonPath(opening.boundaryPoints)),
  ].filter(Boolean).join(' ');

  return {
    boundaryPoints,
    boundaryPointsString: polygonPoints(boundaryPoints),
    boundaryPath,
    roofOutlinePoints,
    roofOutlinePointsString: polygonPoints(roofOutlinePoints),
    roofOutlinePath,
    surfacePath,
    centroid,
    openings,
    parapets,
    drains,
    ridgeSegments,
    valleySegments,
    hipSegments,
    roofEdges: seamEdges,
    roofType: roofSystem.roofType || 'flat',
    pitch: roofGeometry.pitch,
    roofPlanes,
    bounds: createBoundsFromPoints(allPoints),
  };
}

export function buildRoofPlanBounds(roofSystem, padding = 1200) {
  const bounds = buildRoofPlanGeometry(roofSystem).bounds;
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minY: bounds.minY - padding,
    maxY: bounds.maxY + padding,
  };
}
