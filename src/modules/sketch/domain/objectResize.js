import { getPartCorners } from './partGeometry';
import { clampDimension } from './validation';

const OBJECT_BOUNDS_EXCLUDED_TYPES = new Set(['dimension', 'cutout', 'hole']);
const AXIS_EPSILON = 0.0001;

export function isObjectGeometryPart(part) {
  return !OBJECT_BOUNDS_EXCLUDED_TYPES.has(part?.type);
}

export function getPartsBounds3d(parts = []) {
  const geometryParts = (parts || []).filter(isObjectGeometryPart);
  if (!geometryParts.length) {
    return {
      empty: true,
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      width: 0,
      depth: 0,
      height: 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const part of geometryParts) {
    for (const point of getPartCorners(part)) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    }
  }

  return {
    empty: false,
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxY - minY),
    height: Math.max(0, maxZ - minZ),
  };
}

function scaleCoordinate(value, anchor, factor) {
  return anchor + (value - anchor) * factor;
}

export function scalePoint3d(point = { x: 0, y: 0, z: 0 }, anchor, scaleFactors) {
  return {
    x: scaleCoordinate(point.x || 0, anchor.x, scaleFactors.x),
    y: scaleCoordinate(point.y || 0, anchor.y, scaleFactors.y),
    z: scaleCoordinate(point.z || 0, anchor.z, scaleFactors.z),
  };
}

function getScaleFactorForVector(vector = {}, scaleFactors) {
  if (Math.abs(vector.x || 0) > 0.9) return scaleFactors.x;
  if (Math.abs(vector.y || 0) > 0.9) return scaleFactors.y;
  return scaleFactors.z;
}

function scalePanel(part, anchor, scaleFactors) {
  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    width: clampDimension(part.width * scaleFactors.x),
    depth: clampDimension(part.depth * scaleFactors.y),
    thickness: clampDimension(part.thickness * scaleFactors.z),
  };
}

function scaleLeg(part, anchor, scaleFactors) {
  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    width: clampDimension(part.width * scaleFactors.x),
    depth: clampDimension(part.depth * scaleFactors.y),
    height: clampDimension(part.height * scaleFactors.z),
  };
}

function scaleFrame(part, anchor, scaleFactors) {
  const isYAxis = part.axis === 'y';
  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    width: clampDimension(part.width * (isYAxis ? scaleFactors.x : scaleFactors.y)),
    height: clampDimension(part.height * scaleFactors.z),
    length: clampDimension(part.length * (isYAxis ? scaleFactors.y : scaleFactors.x)),
  };
}

function scaleSolid(part, anchor, scaleFactors) {
  const uScale = getScaleFactorForVector(part.plane?.uAxis, scaleFactors);
  const vScale = getScaleFactorForVector(part.plane?.vAxis, scaleFactors);
  const extrusionScale = getScaleFactorForVector(part.plane?.normal, scaleFactors);

  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    extrusionDepth: clampDimension((part.extrusionDepth || 120) * extrusionScale),
    profilePoints: (part.profilePoints || []).map((point) => ({
      u: point.u * uScale,
      v: point.v * vScale,
    })),
  };
}

function scaleCutout(part, anchor, scaleFactors) {
  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    width: clampDimension(part.width * scaleFactors.x),
    height: clampDimension(part.height * scaleFactors.z),
    depth: clampDimension(part.depth * scaleFactors.y),
    offsetX: Number.isFinite(part.offsetX) ? part.offsetX * scaleFactors.x : part.offsetX,
    offsetY: Number.isFinite(part.offsetY) ? part.offsetY * scaleFactors.y : part.offsetY,
  };
}

function scaleHole(part, anchor, scaleFactors) {
  const diameterScale = (scaleFactors.x + scaleFactors.y) / 2;
  return {
    ...part,
    position: scalePoint3d(part.position, anchor, scaleFactors),
    diameter: clampDimension(part.diameter * diameterScale),
    depth: clampDimension(part.depth * scaleFactors.z),
    offsetX: Number.isFinite(part.offsetX) ? part.offsetX * scaleFactors.x : part.offsetX,
    offsetY: Number.isFinite(part.offsetY) ? part.offsetY * scaleFactors.y : part.offsetY,
  };
}

function scaleDimension(part, anchor, scaleFactors) {
  return {
    ...part,
    startPoint: scalePoint3d(part.startPoint, anchor, scaleFactors),
    endPoint: scalePoint3d(part.endPoint, anchor, scaleFactors),
  };
}

export function resizePartForObject(part, anchor, scaleFactors) {
  switch (part.type) {
    case 'panel':
      return scalePanel(part, anchor, scaleFactors);
    case 'leg':
      return scaleLeg(part, anchor, scaleFactors);
    case 'frame':
      return scaleFrame(part, anchor, scaleFactors);
    case 'solid':
      return scaleSolid(part, anchor, scaleFactors);
    case 'cutout':
      return scaleCutout(part, anchor, scaleFactors);
    case 'hole':
      return scaleHole(part, anchor, scaleFactors);
    case 'dimension':
      return scaleDimension(part, anchor, scaleFactors);
    default:
      return {
        ...part,
        position: part.position ? scalePoint3d(part.position, anchor, scaleFactors) : part.position,
      };
  }
}

export function buildObjectScaleFactors(currentBounds, requestedDimensions = {}) {
  const nextDimensions = {
    width: Number.isFinite(requestedDimensions.width) ? clampDimension(requestedDimensions.width) : currentBounds.width,
    depth: Number.isFinite(requestedDimensions.depth) ? clampDimension(requestedDimensions.depth) : currentBounds.depth,
    height: Number.isFinite(requestedDimensions.height) ? clampDimension(requestedDimensions.height) : currentBounds.height,
  };

  const scaleFactors = { x: 1, y: 1, z: 1 };

  if (currentBounds.width > AXIS_EPSILON && Number.isFinite(nextDimensions.width)) {
    scaleFactors.x = nextDimensions.width / currentBounds.width;
  }
  if (currentBounds.depth > AXIS_EPSILON && Number.isFinite(nextDimensions.depth)) {
    scaleFactors.y = nextDimensions.depth / currentBounds.depth;
  }
  if (currentBounds.height > AXIS_EPSILON && Number.isFinite(nextDimensions.height)) {
    scaleFactors.z = nextDimensions.height / currentBounds.height;
  }

  return { nextDimensions, scaleFactors };
}

export function hasMeaningfulScaleChange(scaleFactors) {
  return (
    Math.abs(scaleFactors.x - 1) > AXIS_EPSILON
    || Math.abs(scaleFactors.y - 1) > AXIS_EPSILON
    || Math.abs(scaleFactors.z - 1) > AXIS_EPSILON
  );
}

export function syncManualObjectDimensions(project) {
  const objects = project.objects || [];
  if (!objects.length) return project;

  const partsByObjectId = new Map();
  for (const part of project.parts || []) {
    if (!part.objectId || !isObjectGeometryPart(part)) continue;
    const list = partsByObjectId.get(part.objectId) || [];
    list.push(part);
    partsByObjectId.set(part.objectId, list);
  }

  let changed = false;
  const nextObjects = objects.map((object) => {
    if (object.editingPolicy === 'parametric') return object;

    const bounds = getPartsBounds3d(partsByObjectId.get(object.id) || []);
    if (bounds.empty) return object;

    const nextDimensions = {
      ...object.dimensions,
      width: bounds.width,
      depth: bounds.depth,
      height: bounds.height,
    };

    const sameDimensions = (
      object.dimensions?.width === nextDimensions.width
      && object.dimensions?.depth === nextDimensions.depth
      && object.dimensions?.height === nextDimensions.height
    );

    if (sameDimensions) return object;
    changed = true;
    return {
      ...object,
      dimensions: nextDimensions,
    };
  });

  return changed ? { ...project, objects: nextObjects } : project;
}
