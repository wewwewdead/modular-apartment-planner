import { generateId } from '@/domain/ids';

export const CONSTRUCTION_ANNOTATION_TYPES = {
  GUIDE_POINT: 'guide_point',
  GUIDE_LINE: 'guide_line',
  REFERENCE_PLANE: 'reference_plane',
  SECTION_PLANE: 'section_plane',
};

export const CONSTRUCTION_DEFAULT_PLANE_SIZE = 1600;

function clonePoint(point = {}) {
  return {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    z: Number(point.z) || 0,
  };
}

function cloneVector(vector = {}, fallback = { x: 0, y: 0, z: 1 }) {
  return {
    x: Number.isFinite(vector.x) ? vector.x : fallback.x,
    y: Number.isFinite(vector.y) ? vector.y : fallback.y,
    z: Number.isFinite(vector.z) ? vector.z : fallback.z,
  };
}

export function clonePlaneFrame(plane = {}) {
  return {
    origin: clonePoint(plane.origin),
    normal: cloneVector(plane.normal),
    up: cloneVector(plane.up, { x: 0, y: 1, z: 0 }),
    uAxis: cloneVector(plane.uAxis, { x: 1, y: 0, z: 0 }),
    vAxis: cloneVector(plane.vAxis, { x: 0, y: 1, z: 0 }),
    sourcePartId: plane.sourcePartId || null,
    sourceFace: plane.sourceFace || null,
  };
}

export function createGuidePoint(position, overrides = {}) {
  return {
    id: overrides.id || generateId('annot'),
    type: CONSTRUCTION_ANNOTATION_TYPES.GUIDE_POINT,
    position: clonePoint(position),
    label: overrides.label || 'Guide Point',
    visible: overrides.visible ?? true,
    source: overrides.source || 'manual',
    ...overrides,
  };
}

export function createGuideLine(startPoint, endPoint, overrides = {}) {
  return {
    id: overrides.id || generateId('annot'),
    type: CONSTRUCTION_ANNOTATION_TYPES.GUIDE_LINE,
    startPoint: clonePoint(startPoint),
    endPoint: clonePoint(endPoint),
    label: overrides.label || 'Guide Line',
    visible: overrides.visible ?? true,
    source: overrides.source || 'manual',
    ...overrides,
  };
}

export function createReferencePlane(plane, overrides = {}) {
  return {
    id: overrides.id || generateId('annot'),
    type: CONSTRUCTION_ANNOTATION_TYPES.REFERENCE_PLANE,
    plane: clonePlaneFrame(plane),
    size: Number(overrides.size) || CONSTRUCTION_DEFAULT_PLANE_SIZE,
    label: overrides.label || 'Reference Plane',
    visible: overrides.visible ?? true,
    source: overrides.source || 'manual',
    ...overrides,
  };
}

export function createSectionPlane(plane, overrides = {}) {
  return {
    id: overrides.id || generateId('annot'),
    type: CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE,
    plane: clonePlaneFrame(plane),
    size: Number(overrides.size) || CONSTRUCTION_DEFAULT_PLANE_SIZE,
    label: overrides.label || 'Section Plane',
    visible: overrides.visible ?? true,
    enabled: overrides.enabled ?? true,
    source: overrides.source || 'manual',
    ...overrides,
  };
}

export function isConstructionAnnotation(annotation) {
  return Object.values(CONSTRUCTION_ANNOTATION_TYPES).includes(annotation?.type);
}

export function getConstructionAnnotations(annotations = []) {
  return (annotations || []).filter(isConstructionAnnotation);
}

export function signedDistanceToPlane(point, plane) {
  const origin = plane?.origin || { x: 0, y: 0, z: 0 };
  const normal = plane?.normal || { x: 0, y: 0, z: 1 };
  const dx = (point.x || 0) - origin.x;
  const dy = (point.y || 0) - origin.y;
  const dz = (point.z || 0) - origin.z;
  return dx * normal.x + dy * normal.y + dz * normal.z;
}
