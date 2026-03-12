import { generateId } from './ids';
import {
  ROOF_DRAIN_DIAMETER,
  ROOF_FINISH_SLOPE,
  ROOF_OVERHANG,
  ROOF_OPENING_CURB_HEIGHT,
  ROOF_PARAPET_HEIGHT,
  ROOF_PARAPET_THICKNESS,
  ROOF_PITCH_DIRECTION,
  ROOF_PITCH_SLOPE,
  ROOF_RIDGE_OFFSET,
  ROOF_SLAB_THICKNESS,
} from './defaults';
import { getFloorStackBounds, getOrderedFloors } from './floorModels';
import { polygonArea } from '@/geometry/polygon';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { deriveCustomRoofTopology } from '@/roof/customRoofTopology';

const ROOF_TYPES = new Set(['flat', 'shed', 'gable', 'custom']);
const ROOF_EDGE_ROLES = new Set([
  'derived',
  'ridge',
  'valley',
  'hip',
  'transition',
  'eave',
  'rake',
  'high_edge',
  'perimeter',
]);

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : point;
}

function clonePoints(points = []) {
  return points.map(clonePoint);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeRoofType(roofType = 'flat') {
  return ROOF_TYPES.has(roofType) ? roofType : 'flat';
}

function normalizeRoofEdgeRole(role = 'derived') {
  return ROOF_EDGE_ROLES.has(role) ? role : 'derived';
}

export function normalizeRoofPitchDirection(direction = null) {
  const x = Number(direction?.x);
  const y = Number(direction?.y);
  const length = Math.hypot(x, y);

  if (!length) {
    return { ...ROOF_PITCH_DIRECTION };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

export function roofPitchDirectionFromAngle(angleDegrees = 90) {
  const radians = (Number(angleDegrees || 0) * Math.PI) / 180;
  return normalizeRoofPitchDirection({
    x: Math.cos(radians),
    y: Math.sin(radians),
  });
}

export function roofPitchDirectionToAngle(direction = null) {
  const normalized = normalizeRoofPitchDirection(direction);
  const degrees = (Math.atan2(normalized.y, normalized.x) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function createRoofPitch(options = {}) {
  return {
    slope: isFiniteNumber(options.slope) ? options.slope : ROOF_PITCH_SLOPE,
    direction: normalizeRoofPitchDirection(options.direction),
    ridgeOffset: isFiniteNumber(options.ridgeOffset) ? options.ridgeOffset : ROOF_RIDGE_OFFSET,
    overhang: isFiniteNumber(options.overhang) ? options.overhang : ROOF_OVERHANG,
  };
}

function createDefaultBoundary() {
  return [
    { x: -3000, y: -3000 },
    { x: 3000, y: -3000 },
    { x: 3000, y: 3000 },
    { x: -3000, y: 3000 },
  ];
}

function boundsToPolygon(points = []) {
  if (points.length < 3) return createDefaultBoundary();

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  if (!isFiniteNumber(minX) || !isFiniteNumber(maxX) || !isFiniteNumber(minY) || !isFiniteNumber(maxY)) {
    return createDefaultBoundary();
  }

  const width = Math.max(1000, maxX - minX);
  const height = Math.max(1000, maxY - minY);
  const insetX = width < 1000 ? (1000 - width) / 2 : 0;
  const insetY = height < 1000 ? (1000 - height) / 2 : 0;

  return [
    { x: minX - insetX, y: minY - insetY },
    { x: maxX + insetX, y: minY - insetY },
    { x: maxX + insetX, y: maxY + insetY },
    { x: minX - insetX, y: maxY + insetY },
  ];
}

function largestFloorSlabBoundary(floor) {
  const slabs = (floor?.slabs || []).filter((slab) => polygonArea(slab.boundaryPoints || []) > 0);
  if (!slabs.length) return null;

  const slab = [...slabs].sort((a, b) => polygonArea(b.boundaryPoints || []) - polygonArea(a.boundaryPoints || []))[0];
  return clonePoints(slab.boundaryPoints || []);
}

function collectFloorFootprintPoints(floor) {
  const points = [];

  for (const wall of floor?.walls || []) {
    points.push(...(getWallRenderData(wall, floor.columns || []).outline || []));
  }
  for (const room of floor?.rooms || []) {
    points.push(...(room.points || []));
  }
  for (const slab of floor?.slabs || []) {
    points.push(...(slab.boundaryPoints || []));
  }
  for (const column of floor?.columns || []) {
    points.push(...columnOutline(column));
  }

  return points.filter(Boolean);
}

export function getRoofAttachmentElevation(project) {
  return getFloorStackBounds(project).maxElevation;
}

export function resolveRoofSectionFloor(project, preferredFloorId = null) {
  const orderedFloors = getOrderedFloors(project);
  if (!orderedFloors.length) return null;

  const preferredFloor = preferredFloorId
    ? orderedFloors.find((floor) => floor.id === preferredFloorId)
    : null;
  if (preferredFloor && (preferredFloor.sectionCuts || []).length) return preferredFloor;

  for (let index = orderedFloors.length - 1; index >= 0; index -= 1) {
    if ((orderedFloors[index].sectionCuts || []).length) {
      return orderedFloors[index];
    }
  }

  return preferredFloor || orderedFloors[orderedFloors.length - 1] || orderedFloors[0];
}

export function resolveRoofSectionCut(project, preferredFloorId = null, sectionCutId = null) {
  const floor = resolveRoofSectionFloor(project, preferredFloorId);
  if (!floor) return { floor: null, sectionCut: null };

  const cuts = floor.sectionCuts || [];
  const sectionCut = sectionCutId
    ? cuts.find((entry) => entry.id === sectionCutId)
    : (cuts[0] || null);

  return { floor, sectionCut };
}

export function deriveRoofBoundaryFromProject(project) {
  const orderedFloors = getOrderedFloors(project);
  const topFloor = orderedFloors[orderedFloors.length - 1] || null;
  if (!topFloor) return createDefaultBoundary();

  const slabBoundary = largestFloorSlabBoundary(topFloor);
  if (slabBoundary?.length >= 3) return slabBoundary;

  return boundsToPolygon(collectFloorFootprintPoints(topFloor));
}

export function isValidRoofPolygon(points = []) {
  return Array.isArray(points) && points.length >= 3 && polygonArea(points) > 1;
}

export function createParapet(startPoint = { x: 0, y: 0 }, endPoint = { x: 1000, y: 0 }, options = {}) {
  return {
    id: generateId('parapet'),
    name: options.name ?? '',
    startPoint: clonePoint(startPoint),
    endPoint: clonePoint(endPoint),
    attachment: options.attachment
      ? {
          type: options.attachment.type ?? 'roof_edge',
          edgeIndex: Number.isFinite(options.attachment.edgeIndex) ? options.attachment.edgeIndex : 0,
          startOffset: Number.isFinite(options.attachment.startOffset) ? options.attachment.startOffset : 0,
          endOffset: Number.isFinite(options.attachment.endOffset) ? options.attachment.endOffset : 0,
        }
      : null,
    height: options.height ?? ROOF_PARAPET_HEIGHT,
    thickness: options.thickness ?? ROOF_PARAPET_THICKNESS,
  };
}

export function createDrain(position = { x: 0, y: 0 }, options = {}) {
  return {
    id: generateId('drain'),
    name: options.name ?? '',
    position: clonePoint(position),
    diameter: options.diameter ?? ROOF_DRAIN_DIAMETER,
    invertOffset: options.invertOffset ?? 0,
  };
}

export function createRoofOpening(boundaryPoints = [], options = {}) {
  return {
    id: generateId('roof_opening'),
    name: options.name ?? '',
    type: options.type ?? 'opening',
    boundaryPoints: clonePoints(boundaryPoints),
    curbHeight: options.curbHeight ?? ROOF_OPENING_CURB_HEIGHT,
  };
}

export function createRoofPlane(boundaryPoints = [], options = {}) {
  return {
    id: options.id || generateId('roof_plane'),
    name: options.name ?? '',
    boundaryPoints: clonePoints(boundaryPoints),
    slope: isFiniteNumber(options.slope) ? options.slope : ROOF_PITCH_SLOPE,
    slopeDirection: normalizeRoofPitchDirection(options.slopeDirection ?? options.direction),
    baseElevation: isFiniteNumber(options.baseElevation) ? options.baseElevation : 0,
    heightRule: options.heightRule ?? 'base_low_edge',
    material: options.material ?? '',
    planeType: options.planeType ?? 'roof_plane',
  };
}

export function createRoofEdge(startPoint = { x: 0, y: 0 }, endPoint = { x: 1000, y: 0 }, options = {}) {
  return {
    id: options.id || generateId('roof_edge'),
    name: options.name ?? '',
    geometryKey: options.geometryKey ?? null,
    startPoint: clonePoint(startPoint),
    endPoint: clonePoint(endPoint),
    planeIds: [...new Set(options.planeIds || [])],
    edgeRole: normalizeRoofEdgeRole(options.edgeRole ?? options.role),
    derivedRole: options.derivedRole ?? null,
    isPerimeter: options.isPerimeter ?? false,
  };
}

export function createRidge(options = {}) {
  return {
    id: options.id || generateId('ridge'),
    edgeId: options.edgeId ?? null,
    name: options.name ?? '',
    startPoint: clonePoint(options.startPoint),
    endPoint: clonePoint(options.endPoint),
    planeIds: [...new Set(options.planeIds || [])],
  };
}

export function createValley(options = {}) {
  return {
    id: options.id || generateId('valley'),
    edgeId: options.edgeId ?? null,
    name: options.name ?? '',
    startPoint: clonePoint(options.startPoint),
    endPoint: clonePoint(options.endPoint),
    planeIds: [...new Set(options.planeIds || [])],
  };
}

export function createHip(options = {}) {
  return {
    id: options.id || generateId('hip'),
    edgeId: options.edgeId ?? null,
    name: options.name ?? '',
    startPoint: clonePoint(options.startPoint),
    endPoint: clonePoint(options.endPoint),
    planeIds: [...new Set(options.planeIds || [])],
  };
}

function normalizeParapets(parapets = []) {
  return parapets.map((parapet) => ({
    ...createParapet(),
    ...parapet,
    id: parapet?.id || generateId('parapet'),
    startPoint: clonePoint(parapet?.startPoint),
    endPoint: clonePoint(parapet?.endPoint),
    attachment: parapet?.attachment
      ? {
          type: parapet.attachment.type ?? 'roof_edge',
          edgeIndex: Number.isFinite(parapet.attachment.edgeIndex) ? parapet.attachment.edgeIndex : 0,
          startOffset: Number.isFinite(parapet.attachment.startOffset) ? parapet.attachment.startOffset : 0,
          endOffset: Number.isFinite(parapet.attachment.endOffset) ? parapet.attachment.endOffset : 0,
        }
      : null,
  }));
}

function normalizeDrains(drains = []) {
  return drains.map((drain) => ({
    ...createDrain(),
    ...drain,
    id: drain?.id || generateId('drain'),
    position: clonePoint(drain?.position),
  }));
}

function normalizeRoofOpenings(roofOpenings = []) {
  return roofOpenings.map((opening) => ({
    ...createRoofOpening(),
    ...opening,
    id: opening?.id || generateId('roof_opening'),
    boundaryPoints: clonePoints(opening?.boundaryPoints || []),
  }));
}

function normalizeRoofPlanes(roofPlanes = [], roofType, boundaryPolygon, baseElevation) {
  const normalized = (roofPlanes || [])
    .map((plane, index) => ({
      ...createRoofPlane(
        (plane?.boundaryPoints || []).length >= 3
          ? plane.boundaryPoints
          : (index === 0 ? boundaryPolygon : []),
        {
          ...plane,
          id: plane?.id || generateId('roof_plane'),
          baseElevation: isFiniteNumber(plane?.baseElevation) ? plane.baseElevation : baseElevation,
        }
      ),
      boundaryPoints: clonePoints(plane?.boundaryPoints || (index === 0 ? boundaryPolygon : [])),
    }))
    .filter((plane) => isValidRoofPolygon(plane.boundaryPoints));

  if (normalizeRoofType(roofType) === 'custom' && !normalized.length && isValidRoofPolygon(boundaryPolygon)) {
    return [createRoofPlane(boundaryPolygon, { name: 'Plane 1', baseElevation })];
  }

  return normalized;
}

function normalizeRoofEdges(roofEdges = []) {
  return (roofEdges || []).map((edge) => ({
    ...createRoofEdge(edge?.startPoint, edge?.endPoint, edge),
    id: edge?.id || generateId('roof_edge'),
    startPoint: clonePoint(edge?.startPoint),
    endPoint: clonePoint(edge?.endPoint),
    planeIds: [...new Set(edge?.planeIds || [])],
    edgeRole: normalizeRoofEdgeRole(edge?.edgeRole ?? edge?.role),
  }));
}

function normalizeRelationships(collection = [], createFactory) {
  return (collection || []).map((entry) => {
    const normalized = createFactory(entry);
    return {
      ...normalized,
      ...entry,
      id: entry?.id || normalized.id,
      startPoint: clonePoint(entry?.startPoint),
      endPoint: clonePoint(entry?.endPoint),
      planeIds: [...new Set(entry?.planeIds || [])],
    };
  });
}

function normalizeRoofSystemCollections(roofSystem) {
  const roofType = normalizeRoofType(roofSystem.roofType);
  const boundaryPolygon = clonePoints(roofSystem.boundaryPolygon || createDefaultBoundary());
  const roofPlanes = normalizeRoofPlanes(
    roofSystem.roofPlanes || [],
    roofType,
    boundaryPolygon,
    roofSystem.baseElevation ?? 0
  );

  if (roofType !== 'custom') {
    return {
      roofType,
      roofPlanes,
      roofEdges: normalizeRoofEdges(roofSystem.roofEdges || []),
      ridges: normalizeRelationships(roofSystem.ridges || [], createRidge),
      valleys: normalizeRelationships(roofSystem.valleys || [], createValley),
      hips: normalizeRelationships(roofSystem.hips || [], createHip),
    };
  }

  const topology = deriveCustomRoofTopology({
    ...roofSystem,
    roofType,
    boundaryPolygon,
    roofPlanes,
    roofEdges: normalizeRoofEdges(roofSystem.roofEdges || []),
  });

  return {
    roofType,
    roofPlanes: topology.roofPlanes.map((plane) => ({
      ...createRoofPlane(plane.boundaryPoints, plane),
      ...plane,
      boundaryPoints: clonePoints(plane.boundaryPoints || []),
      slopeDirection: normalizeRoofPitchDirection(plane.slopeDirection),
    })),
    roofEdges: topology.roofEdges.map((edge) => ({
      ...createRoofEdge(edge.startPoint, edge.endPoint, edge),
      ...edge,
      startPoint: clonePoint(edge.startPoint),
      endPoint: clonePoint(edge.endPoint),
      planeIds: [...new Set(edge.planeIds || [])],
      edgeRole: normalizeRoofEdgeRole(edge.edgeRole),
    })),
    ridges: topology.ridges.map((ridge) => ({
      ...createRidge(ridge),
      ...ridge,
      startPoint: clonePoint(ridge.startPoint),
      endPoint: clonePoint(ridge.endPoint),
      planeIds: [...new Set(ridge.planeIds || [])],
    })),
    valleys: topology.valleys.map((valley) => ({
      ...createValley(valley),
      ...valley,
      startPoint: clonePoint(valley.startPoint),
      endPoint: clonePoint(valley.endPoint),
      planeIds: [...new Set(valley.planeIds || [])],
    })),
    hips: topology.hips.map((hip) => ({
      ...createHip(hip),
      ...hip,
      startPoint: clonePoint(hip.startPoint),
      endPoint: clonePoint(hip.endPoint),
      planeIds: [...new Set(hip.planeIds || [])],
    })),
  };
}

export function createRoofSystem(name = 'Roof', options = {}) {
  const boundaryPolygon = clonePoints(options.boundaryPolygon || []);
  const attachmentOffset = isFiniteNumber(options.attachmentOffset)
    ? options.attachmentOffset
    : 0;
  const roofSystem = {
    id: options.id || generateId('roof'),
    roofType: normalizeRoofType(options.roofType ?? 'flat'),
    name,
    baseElevation: options.baseElevation ?? 0,
    attachmentOffset,
    boundaryPolygon: boundaryPolygon.length ? boundaryPolygon : createDefaultBoundary(),
    slabThickness: options.slabThickness ?? ROOF_SLAB_THICKNESS,
    finishSlope: options.finishSlope ?? ROOF_FINISH_SLOPE,
    pitch: createRoofPitch(options.pitch),
    parapets: normalizeParapets(options.parapets || []),
    drains: normalizeDrains(options.drains || []),
    roofOpenings: normalizeRoofOpenings(options.roofOpenings || []),
    roofPlanes: normalizeRoofPlanes(
      options.roofPlanes || [],
      options.roofType ?? 'flat',
      boundaryPolygon.length ? boundaryPolygon : createDefaultBoundary(),
      options.baseElevation ?? 0
    ),
    roofEdges: normalizeRoofEdges(options.roofEdges || []),
    ridges: normalizeRelationships(options.ridges || [], createRidge),
    valleys: normalizeRelationships(options.valleys || [], createValley),
    hips: normalizeRelationships(options.hips || [], createHip),
  };

  const collections = normalizeRoofSystemCollections(roofSystem);
  return {
    ...roofSystem,
    ...collections,
  };
}

export function createRoofSystemForProject(project, options = {}) {
  const attachmentElevation = getRoofAttachmentElevation(project);
  const attachmentOffset = isFiniteNumber(options.attachmentOffset)
    ? options.attachmentOffset
    : 0;

  return createRoofSystem(options.name ?? 'Roof', {
    ...options,
    baseElevation: options.baseElevation ?? (attachmentElevation + attachmentOffset),
    attachmentOffset,
    boundaryPolygon: options.boundaryPolygon || deriveRoofBoundaryFromProject(project),
  });
}

export function getRoofTopElevation(roofSystem) {
  if (!roofSystem) return 0;
  return (roofSystem.baseElevation ?? 0) + (roofSystem.slabThickness ?? 0);
}

export function syncRoofSystemAttachment(project, roofSystem) {
  if (!roofSystem) return null;

  const attachmentElevation = getRoofAttachmentElevation(project);
  const attachmentOffset = isFiniteNumber(roofSystem.attachmentOffset)
    ? roofSystem.attachmentOffset
    : ((roofSystem.baseElevation ?? attachmentElevation) - attachmentElevation);
  const normalizedBaseElevation = attachmentElevation + attachmentOffset;
  const baseRoofSystem = {
    ...roofSystem,
    id: roofSystem.id || generateId('roof'),
    roofType: normalizeRoofType(roofSystem.roofType ?? 'flat'),
    attachmentOffset,
    baseElevation: normalizedBaseElevation,
    boundaryPolygon: clonePoints(roofSystem.boundaryPolygon || createDefaultBoundary()),
    slabThickness: roofSystem.slabThickness ?? ROOF_SLAB_THICKNESS,
    finishSlope: roofSystem.finishSlope ?? ROOF_FINISH_SLOPE,
    pitch: createRoofPitch(roofSystem.pitch),
    parapets: normalizeParapets(roofSystem.parapets || []),
    drains: normalizeDrains(roofSystem.drains || []),
    roofOpenings: normalizeRoofOpenings(roofSystem.roofOpenings || []),
    roofPlanes: normalizeRoofPlanes(
      roofSystem.roofPlanes || [],
      roofSystem.roofType ?? 'flat',
      roofSystem.boundaryPolygon || createDefaultBoundary(),
      normalizedBaseElevation
    ),
    roofEdges: normalizeRoofEdges(roofSystem.roofEdges || []),
    ridges: normalizeRelationships(roofSystem.ridges || [], createRidge),
    valleys: normalizeRelationships(roofSystem.valleys || [], createValley),
    hips: normalizeRelationships(roofSystem.hips || [], createHip),
  };

  return {
    ...baseRoofSystem,
    ...normalizeRoofSystemCollections(baseRoofSystem),
  };
}

export function syncProjectRoofSystem(project) {
  if (!project) return project;

  const syncedRoofSystem = project.roofSystem
    ? syncRoofSystemAttachment(project, project.roofSystem)
    : null;

  return {
    ...project,
    version: Math.max(4, Number(project.version || 0)),
    roofSystem: syncedRoofSystem,
  };
}
