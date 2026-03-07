import { pointInPolygon, signedPolygonArea } from './polygon';
import { nearestPointOnSegment, segmentIntersection } from './line';
import { columnOutline } from './columnGeometry';
import { ENDPOINT_MERGE_TOLERANCE, MIN_ROOM_AREA } from '@/domain/defaults';

function projectParameter(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
}

function pointsEqual(a, b, tolerance) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}

function pointOnSegment(point, start, end, tolerance) {
  const t = projectParameter(point, start, end);
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  const { point: projected } = nearestPointOnSegment(point, start, end);
  const dx = projected.x - point.x;
  const dy = projected.y - point.y;
  if (dx * dx + dy * dy > tolerance * tolerance) return null;
  return Math.max(0, Math.min(1, t));
}

function findOrAddVertex(vertices, point, tolerance) {
  for (let i = 0; i < vertices.length; i++) {
    if (pointsEqual(vertices[i], point, tolerance)) {
      return i;
    }
  }
  vertices.push({ x: point.x, y: point.y });
  return vertices.length - 1;
}

function addUniqueEdge(edgeSet, edges, from, to) {
  if (from === to) return;
  const key = from < to ? `${from}-${to}` : `${to}-${from}`;
  if (edgeSet.has(key)) return;
  edgeSet.add(key);
  edges.push({ from, to });
}

function addUniqueEdgePoint(edgePoints, edgeIndex, vi, t) {
  const points = edgePoints[edgeIndex];
  const existing = points.find(point => point.vi === vi);
  if (existing) {
    existing.t = Math.min(existing.t, Math.max(0, Math.min(1, t)));
    return;
  }
  points.push({ vi, t: Math.max(0, Math.min(1, t)) });
}

function pointOnPolygonBoundary(point, polygon, tolerance) {
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (pointOnSegment(point, start, end, tolerance) !== null) {
      return true;
    }
  }
  return false;
}

function pointInsideOrOnColumn(point, column, tolerance) {
  const outline = columnOutline(column);
  return pointInPolygon(point, outline) || pointOnPolygonBoundary(point, outline, tolerance);
}

function normalizeWallsForColumns(walls, columns, tolerance) {
  if (!columns.length) return walls;

  return walls.map(wall => {
    let start = { ...wall.start };
    let end = { ...wall.end };

    const startColumn = columns.find(column => pointInsideOrOnColumn(start, column, tolerance));
    if (startColumn) {
      start = { x: startColumn.x, y: startColumn.y };
    }

    const endColumn = columns.find(column => pointInsideOrOnColumn(end, column, tolerance));
    if (endColumn) {
      end = { x: endColumn.x, y: endColumn.y };
    }

    return {
      ...wall,
      start,
      end,
    };
  });
}

function roomPolygonKey(points, precision = ENDPOINT_MERGE_TOLERANCE) {
  if (!points?.length) return '';

  const labels = points.map(point => {
    const x = Math.round(point.x / precision);
    const y = Math.round(point.y / precision);
    return `${x}:${y}`;
  });

  const variants = [];
  for (let i = 0; i < labels.length; i++) {
    variants.push(labels.slice(i).concat(labels.slice(0, i)).join('|'));
  }

  const reversed = [...labels].reverse();
  for (let i = 0; i < reversed.length; i++) {
    variants.push(reversed.slice(i).concat(reversed.slice(0, i)).join('|'));
  }

  variants.sort();
  return variants[0];
}

function buildRawSegments(walls, vertices, tolerance) {
  const segments = [];

  for (const wall of walls) {
    const from = findOrAddVertex(vertices, wall.start, tolerance);
    const to = findOrAddVertex(vertices, wall.end, tolerance);
    if (from === to) continue;
    segments.push({ from, to });
  }

  for (let i = 0; i < segments.length; i++) {
    const segA = segments[i];
    const a1 = vertices[segA.from];
    const a2 = vertices[segA.to];

    for (let j = i + 1; j < segments.length; j++) {
      const segB = segments[j];
      const b1 = vertices[segB.from];
      const b2 = vertices[segB.to];
      const intersection = segmentIntersection(a1, a2, b1, b2);
      if (!intersection) continue;
      findOrAddVertex(vertices, intersection, tolerance);
    }
  }

  return segments;
}

function buildColumnSegments(columns, vertices, tolerance) {
  const segments = [];

  for (const column of columns) {
    const corners = columnOutline(column);
    const edgePoints = new Array(corners.length).fill(null).map(() => []);

    for (let vi = 0; vi < vertices.length; vi++) {
      const vertex = vertices[vi];
      for (let edgeIndex = 0; edgeIndex < corners.length; edgeIndex++) {
        const c1 = corners[edgeIndex];
        const c2 = corners[(edgeIndex + 1) % corners.length];
        const t = pointOnSegment(vertex, c1, c2, tolerance);
        if (t === null) continue;
        addUniqueEdgePoint(edgePoints, edgeIndex, vi, t);
      }
    }

    for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
      const prevEdge = (cornerIndex - 1 + corners.length) % corners.length;
      const nextEdge = cornerIndex;
      if (edgePoints[prevEdge].length === 0 || edgePoints[nextEdge].length === 0) continue;

      const cornerVi = findOrAddVertex(vertices, corners[cornerIndex], tolerance);
      addUniqueEdgePoint(edgePoints, prevEdge, cornerVi, 1);
      addUniqueEdgePoint(edgePoints, nextEdge, cornerVi, 0);
    }

    for (let edgeIndex = 0; edgeIndex < edgePoints.length; edgeIndex++) {
      const points = edgePoints[edgeIndex];
      if (points.length < 2) continue;

      points.sort((a, b) => a.t - b.t);
      const orderedVertices = [];
      for (const point of points) {
        if (orderedVertices[orderedVertices.length - 1] !== point.vi) {
          orderedVertices.push(point.vi);
        }
      }

      for (let i = 0; i < orderedVertices.length - 1; i++) {
        const from = orderedVertices[i];
        const to = orderedVertices[i + 1];
        if (from !== to) {
          segments.push({ from, to });
        }
      }
    }
  }

  return segments;
}

function subdivideSegments(rawSegments, vertices, tolerance) {
  const edges = [];
  const edgeSet = new Set();

  for (const segment of rawSegments) {
    const start = vertices[segment.from];
    const end = vertices[segment.to];
    const splitPoints = [];

    for (let vi = 0; vi < vertices.length; vi++) {
      const t = pointOnSegment(vertices[vi], start, end, tolerance);
      if (t === null) continue;
      splitPoints.push({ t, vi });
    }

    splitPoints.sort((a, b) => a.t - b.t);

    const orderedVertices = [];
    for (const split of splitPoints) {
      if (orderedVertices[orderedVertices.length - 1] !== split.vi) {
        orderedVertices.push(split.vi);
      }
    }

    for (let i = 0; i < orderedVertices.length - 1; i++) {
      addUniqueEdge(edgeSet, edges, orderedVertices[i], orderedVertices[i + 1]);
    }
  }

  return edges;
}

function buildAdjacency(vertices, edges) {
  const adjacency = new Array(vertices.length).fill(null).map(() => []);
  const halfEdges = new Set();

  for (const edge of edges) {
    const forward = `${edge.from}-${edge.to}`;
    const backward = `${edge.to}-${edge.from}`;
    if (!halfEdges.has(forward)) {
      halfEdges.add(forward);
      adjacency[edge.from].push(edge.to);
    }
    if (!halfEdges.has(backward)) {
      halfEdges.add(backward);
      adjacency[edge.to].push(edge.from);
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const origin = vertices[i];
    adjacency[i].sort((a, b) => {
      const angleA = Math.atan2(vertices[a].y - origin.y, vertices[a].x - origin.x);
      const angleB = Math.atan2(vertices[b].y - origin.y, vertices[b].x - origin.x);
      return angleA - angleB;
    });
  }

  return { adjacency, halfEdges };
}

function traceFaces(vertices, edges) {
  const { adjacency, halfEdges } = buildAdjacency(vertices, edges);
  const nextHalfEdge = new Map();

  for (const key of halfEdges) {
    const [uText, vText] = key.split('-');
    const u = Number.parseInt(uText, 10);
    const v = Number.parseInt(vText, 10);
    const neighbors = adjacency[v];
    const index = neighbors.indexOf(u);
    if (index === -1) continue;
    const nextIndex = (index - 1 + neighbors.length) % neighbors.length;
    nextHalfEdge.set(key, `${v}-${neighbors[nextIndex]}`);
  }

  const visited = new Set();
  const cycles = [];

  for (const startKey of halfEdges) {
    if (visited.has(startKey)) continue;

    const cycle = [];
    let current = startKey;
    let steps = 0;
    const maxSteps = halfEdges.size + 1;

    while (!visited.has(current) && steps < maxSteps) {
      visited.add(current);
      const [uText] = current.split('-');
      cycle.push(Number.parseInt(uText, 10));
      const next = nextHalfEdge.get(current);
      if (!next) break;
      current = next;
      steps++;
    }

    if (current === startKey && cycle.length >= 3) {
      cycles.push(cycle);
    }
  }

  return cycles;
}

export function detectRoomFaces(walls, columns = [], mergeTolerance = ENDPOINT_MERGE_TOLERANCE) {
  if (walls.length < 3) return [];

  const normalizedWalls = normalizeWallsForColumns(walls, columns, mergeTolerance);
  const vertices = [];
  const wallSegments = buildRawSegments(normalizedWalls, vertices, mergeTolerance);
  const columnSegments = buildColumnSegments(columns, vertices, mergeTolerance);
  const edges = subdivideSegments([...wallSegments, ...columnSegments], vertices, mergeTolerance);
  const cycles = traceFaces(vertices, edges);
  const faces = [];
  const seenKeys = new Set();

  for (const cycle of cycles) {
    const points = cycle.map(index => vertices[index]);
    const signedArea = signedPolygonArea(points);
    const area = Math.abs(signedArea);
    if (signedArea <= 0 || area < MIN_ROOM_AREA) continue;

    const key = roomPolygonKey(points, mergeTolerance);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    faces.push({
      key,
      area,
      points: points.map(point => ({ x: point.x, y: point.y })),
    });
  }

  return faces;
}

export function detectRooms(walls, columns = [], mergeTolerance = ENDPOINT_MERGE_TOLERANCE) {
  return detectRoomFaces(walls, columns, mergeTolerance).map(face => ({
    points: face.points,
    area: face.area,
  }));
}

export function findRoomFaceAtPoint(walls, columns = [], point, mergeTolerance = ENDPOINT_MERGE_TOLERANCE) {
  const faces = detectRoomFaces(walls, columns, mergeTolerance);
  const containingFaces = faces.filter(face => pointInPolygon(point, face.points));
  if (containingFaces.length === 0) return null;

  containingFaces.sort((a, b) => a.area - b.area);
  return containingFaces[0];
}

export { roomPolygonKey };
