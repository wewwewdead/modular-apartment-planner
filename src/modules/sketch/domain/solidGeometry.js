import { planeLocalToWorld } from './drawingPlane';

const DEFAULT_NORMAL = { x: 0, y: 0, z: 1 };
const DEFAULT_U_AXIS = { x: 1, y: 0, z: 0 };
const DEFAULT_V_AXIS = { x: 0, y: 1, z: 0 };

function cloneVector(vector, fallback) {
  return {
    x: Number.isFinite(vector?.x) ? vector.x : fallback.x,
    y: Number.isFinite(vector?.y) ? vector.y : fallback.y,
    z: Number.isFinite(vector?.z) ? vector.z : fallback.z,
  };
}

function normalizeVector(vector, fallback) {
  const candidate = cloneVector(vector, fallback);
  const length = Math.hypot(candidate.x, candidate.y, candidate.z) || 1;
  return {
    x: candidate.x / length,
    y: candidate.y / length,
    z: candidate.z / length,
  };
}

function dedupeProfilePoints(points) {
  const normalized = [];
  for (const point of points || []) {
    const candidate = {
      u: Number.isFinite(point?.u) ? point.u : 0,
      v: Number.isFinite(point?.v) ? point.v : 0,
    };
    const previous = normalized[normalized.length - 1];
    if (previous && Math.hypot(candidate.u - previous.u, candidate.v - previous.v) < 0.001) {
      continue;
    }
    normalized.push(candidate);
  }

  if (normalized.length > 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.hypot(first.u - last.u, first.v - last.v) < 0.001) {
      normalized.pop();
    }
  }

  return normalized;
}

export function clonePlaneDefinition(plane = {}) {
  const normal = normalizeVector(plane.normal, DEFAULT_NORMAL);
  const uAxis = normalizeVector(plane.uAxis, DEFAULT_U_AXIS);
  const vAxis = normalizeVector(plane.vAxis, DEFAULT_V_AXIS);
  return {
    normal,
    uAxis,
    vAxis,
    up: normalizeVector(plane.up, vAxis),
    sourcePartId: plane.sourcePartId || null,
    sourceFace: plane.sourceFace || null,
  };
}

export function getSolidPlane(part) {
  return {
    origin: {
      x: Number.isFinite(part?.position?.x) ? part.position.x : 0,
      y: Number.isFinite(part?.position?.y) ? part.position.y : 0,
      z: Number.isFinite(part?.position?.z) ? part.position.z : 0,
    },
    ...clonePlaneDefinition(part?.plane),
  };
}

export function normalizeSolidProfile(points) {
  const profile = dedupeProfilePoints(points);
  if (profile.length >= 3) return profile;
  return [
    { u: 0, v: 0 },
    { u: 600, v: 0 },
    { u: 600, v: 400 },
    { u: 0, v: 400 },
  ];
}

export function getSolidBaseVertices(part) {
  const plane = getSolidPlane(part);
  const profilePoints = normalizeSolidProfile(part.profilePoints);
  return profilePoints.map((point) => planeLocalToWorld(point.u, point.v, plane));
}

export function getSolidVertices(part) {
  const base = getSolidBaseVertices(part);
  const plane = getSolidPlane(part);
  const depth = Number.isFinite(part?.extrusionDepth) ? part.extrusionDepth : 120;
  const top = base.map((point) => ({
    x: point.x + plane.normal.x * depth,
    y: point.y + plane.normal.y * depth,
    z: point.z + plane.normal.z * depth,
  }));
  return { base, top };
}

export function getSolidBounds(part) {
  const { base, top } = getSolidVertices(part);
  const vertices = [...base, ...top];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

function centroid(points) {
  if (!points.length) return { x: 0, y: 0, z: 0 };
  const totals = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y,
    z: sum.z + point.z,
  }), { x: 0, y: 0, z: 0 });
  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
    z: totals.z / points.length,
  };
}

export function getSolidEdgeMidpoints(part) {
  const { base, top } = getSolidVertices(part);
  const points = [];

  for (let index = 0; index < base.length; index += 1) {
    const nextIndex = (index + 1) % base.length;
    points.push(midpoint(base[index], base[nextIndex]));
    points.push(midpoint(top[index], top[nextIndex]));
    points.push(midpoint(base[index], top[index]));
  }

  return points;
}

function getAxisFacePair(normal) {
  if (Math.abs(normal.x) > 0.9) {
    return normal.x >= 0 ? ['-x', '+x'] : ['+x', '-x'];
  }
  if (Math.abs(normal.y) > 0.9) {
    return normal.y >= 0 ? ['-y', '+y'] : ['+y', '-y'];
  }
  return normal.z >= 0 ? ['-z', '+z'] : ['+z', '-z'];
}

export function getSolidFaceCenters(part) {
  const { base, top } = getSolidVertices(part);
  const plane = getSolidPlane(part);
  const [baseFaceId, topFaceId] = getAxisFacePair(plane.normal);
  const bounds = getSolidBounds(part);
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;

  return [
    { ...centroid(base), faceId: baseFaceId },
    { ...centroid(top), faceId: topFaceId },
    { x: bounds.max.x, y: cy, z: cz, faceId: '+x' },
    { x: bounds.min.x, y: cy, z: cz, faceId: '-x' },
    { x: cx, y: bounds.max.y, z: cz, faceId: '+y' },
    { x: cx, y: bounds.min.y, z: cz, faceId: '-y' },
    { x: cx, y: cy, z: bounds.max.z, faceId: '+z' },
    { x: cx, y: cy, z: bounds.min.z, faceId: '-z' },
  ];
}

export function projectDomainPointToView(point, view) {
  switch (view) {
    case 'top':
      return { x: point.x, y: point.y };
    case 'front':
      return { x: point.x, y: -(point.z || 0) };
    case 'side':
      return { x: point.y, y: -(point.z || 0) };
    default:
      return { x: point.x, y: point.y };
  }
}

export function getSolidProjectionBounds(part, view) {
  const { base, top } = getSolidVertices(part);
  const projected = [...base, ...top].map((point) => projectDomainPointToView(point, view));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of projected) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    svgX: minX,
    svgY: minY,
    svgWidth: maxX - minX,
    svgHeight: maxY - minY,
  };
}

export function projectSolidOutlineToView(part, view) {
  const plane = getSolidPlane(part);
  const normal = plane.normal;
  const canProjectProfile = (
    (view === 'top' && Math.abs(normal.z) > 0.9)
    || (view === 'front' && Math.abs(normal.y) > 0.9)
    || (view === 'side' && Math.abs(normal.x) > 0.9)
  );

  if (!canProjectProfile) return null;

  return getSolidBaseVertices(part).map((point) => projectDomainPointToView(point, view));
}
