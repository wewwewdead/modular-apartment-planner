import { generateId } from './ids';
import { CURRENT_PROJECT_VERSION } from './projectVersion';
import { getDefaultActiveFloorId, getFloorTopElevation, getProjectFloor } from './floorModels';
import { deriveBeamSupportedInstanceGeometry } from '@/truss/beamSupports';
import {
  normalizePlanLengthScale,
  normalizePlanOffset,
  normalizeRotationDegrees,
} from '@/truss/systemTransform';

const TRUSS_FAMILIES = new Set(['shed', 'gable', 'flat']);
const TRUSS_SHAPES = new Set(['shed', 'gable', 'flat', 'hip', 'box_gable', 'pyramid_hipped', 'domed', 'dropped_eaves']);
const TRUSS_ATTACHED_ROOF_TYPES = new Set([
  'flat',
  'shed',
  'gable',
  'hip',
  'box_gable',
  'pyramid_hipped',
  'domed',
  'dropped_eaves',
]);
const DEFAULT_SUPPORT_LENGTH = 12000;
const DEFAULT_SPACING = 1200;
const DEFAULT_COUNT = 5;
const DEFAULT_SPAN = 6000;
const DEFAULT_RISE = 1200;
const DEFAULT_PITCH = 20;
const DEFAULT_PURLIN_SPACING = 900;
const DEFAULT_PURLIN_START_OFFSET = 300;
const DEFAULT_PURLIN_END_OFFSET = 300;
const DEFAULT_PURLIN_OVERHANG_START = 0;
const DEFAULT_PURLIN_OVERHANG_END = 0;
const DEFAULT_PURLIN_WIDTH = 75;
const DEFAULT_PURLIN_DEPTH = 50;
const DEFAULT_PURLIN_MATERIAL = 'timber';
const DEFAULT_TRUSS_MATERIAL = 'timber';
export const TRUSS_MATERIALS = ['timber', 'metal'];
export const TRUSS_SUPPORT_MODES = {
  BEAM_PAIR: 'beam_pair',
};

function normalizePhaseId(phaseId = null) {
  return typeof phaseId === 'string' && phaseId ? phaseId : null;
}

const DEFAULT_TRUSS_TYPE_DEFS = [
  {
    id: 'truss_type_shed',
    name: 'Mono / Shed Truss',
    family: 'shed',
    shape: 'shed',
    material: 'timber',
    defaultSpan: 6000,
    defaultRise: 1200,
    defaultPitch: 20,
    attachedRoofType: 'shed',
    webPattern: {
      key: 'mono_fan',
      label: 'Mono Fan',
      panelCount: 4,
      diagonalMode: 'fan',
    },
  },
  {
    id: 'truss_type_gable',
    name: 'Gable Truss',
    family: 'gable',
    shape: 'gable',
    material: 'timber',
    defaultSpan: 7200,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'gable',
    webPattern: {
      key: 'fink',
      label: 'Fink',
      panelCount: 6,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_flat',
    name: 'Flat Truss',
    family: 'flat',
    shape: 'flat',
    material: 'timber',
    defaultSpan: 7200,
    defaultRise: 900,
    defaultPitch: 0,
    attachedRoofType: 'flat',
    webPattern: {
      key: 'flat_pratt',
      label: 'Flat Pratt',
      panelCount: 6,
      diagonalMode: 'alternating',
    },
  },
  {
    id: 'truss_type_box_gable',
    name: 'Box Gable Truss',
    family: 'gable',
    shape: 'box_gable',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'box_gable',
    webPattern: {
      key: 'box_gable',
      label: 'Box Gable',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_hip',
    name: 'Hip Truss',
    family: 'gable',
    shape: 'hip',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1600,
    defaultPitch: 22,
    attachedRoofType: 'hip',
    webPattern: {
      key: 'hip',
      label: 'Hip',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_pyramid_hipped',
    name: 'Pyramid Hipped Truss',
    family: 'gable',
    shape: 'pyramid_hipped',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1500,
    defaultPitch: 20,
    attachedRoofType: 'pyramid_hipped',
    webPattern: {
      key: 'pyramid_hipped',
      label: 'Pyramid Hipped',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_domed',
    name: 'Domed Truss',
    family: 'gable',
    shape: 'domed',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 20,
    attachedRoofType: 'domed',
    webPattern: {
      key: 'domed',
      label: 'Domed',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
  {
    id: 'truss_type_dropped_eaves',
    name: 'Dropped Eaves Truss',
    family: 'gable',
    shape: 'dropped_eaves',
    material: 'timber',
    defaultSpan: 8400,
    defaultRise: 1800,
    defaultPitch: 25,
    attachedRoofType: 'dropped_eaves',
    webPattern: {
      key: 'dropped_eaves',
      label: 'Dropped Eaves',
      panelCount: 8,
      diagonalMode: 'fink',
    },
  },
];

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : point;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function cloneWebPattern(webPattern = {}) {
  return {
    key: webPattern.key ?? 'generic',
    label: webPattern.label ?? 'Generic',
    panelCount: Math.max(2, Math.round(webPattern.panelCount ?? 4)),
    diagonalMode: webPattern.diagonalMode ?? 'generic',
  };
}

function normalizeFamily(family = 'gable') {
  if (family === 'mono') return 'shed';
  return TRUSS_FAMILIES.has(family) ? family : 'gable';
}

function normalizeShape(shape = null, family = 'gable') {
  if (shape === 'mono') return 'shed';
  if (TRUSS_SHAPES.has(shape)) return shape;
  return normalizeFamily(family);
}

function normalizeAttachedRoofType(attachedRoofType = null) {
  if (attachedRoofType == null || attachedRoofType === '') return null;
  return TRUSS_ATTACHED_ROOF_TYPES.has(attachedRoofType) ? attachedRoofType : null;
}

function normalizeSupportMode(supportMode = null) {
  return supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR ? supportMode : null;
}

function normalizeSupportBeamIds(supportBeamIds = {}) {
  return {
    start: typeof supportBeamIds?.start === 'string' && supportBeamIds.start ? supportBeamIds.start : null,
    end: typeof supportBeamIds?.end === 'string' && supportBeamIds.end ? supportBeamIds.end : null,
  };
}

function normalizeSupportOffsetAlongAxis(value = 0) {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function clonePlanOffset(offset = null) {
  return normalizePlanOffset(offset);
}

export function normalizeTrussMaterial(material = DEFAULT_TRUSS_MATERIAL) {
  const normalized = typeof material === 'string' ? material.trim().toLowerCase() : DEFAULT_TRUSS_MATERIAL;
  if (normalized === 'wood') return 'timber';
  if (normalized === 'steel' || normalized === 'meta') return 'metal';
  return TRUSS_MATERIALS.includes(normalized) ? normalized : DEFAULT_TRUSS_MATERIAL;
}

export function createPurlinSystem(options = {}) {
  return {
    enabled: Boolean(options.enabled),
    spacing: isFiniteNumber(options.spacing) ? Math.max(100, options.spacing) : DEFAULT_PURLIN_SPACING,
    startOffset: isFiniteNumber(options.startOffset) ? Math.max(0, options.startOffset) : DEFAULT_PURLIN_START_OFFSET,
    endOffset: isFiniteNumber(options.endOffset) ? Math.max(0, options.endOffset) : DEFAULT_PURLIN_END_OFFSET,
    overhangStart: isFiniteNumber(options.overhangStart) ? Math.max(0, options.overhangStart) : DEFAULT_PURLIN_OVERHANG_START,
    overhangEnd: isFiniteNumber(options.overhangEnd) ? Math.max(0, options.overhangEnd) : DEFAULT_PURLIN_OVERHANG_END,
    width: isFiniteNumber(options.width) ? Math.max(25, options.width) : DEFAULT_PURLIN_WIDTH,
    depth: isFiniteNumber(options.depth) ? Math.max(25, options.depth) : DEFAULT_PURLIN_DEPTH,
    material: normalizeTrussMaterial(options.material ?? DEFAULT_PURLIN_MATERIAL),
  };
}

function normalizePurlinSystem(purlinSystem = {}) {
  return createPurlinSystem(purlinSystem);
}

export function createTrussNode(x = 0, z = 0, options = {}) {
  return {
    id: options.id || generateId('truss_node'),
    x,
    z,
    kind: options.kind ?? 'panel_point',
  };
}

export function createTrussMember(startNodeId = null, endNodeId = null, options = {}) {
  return {
    id: options.id || generateId('truss_member'),
    startNodeId,
    endNodeId,
    memberType: options.memberType ?? 'web',
  };
}

export function createTrussType(options = {}) {
  const family = normalizeFamily(options.family);
  return {
    id: options.id || generateId('truss_type'),
    name: options.name ?? 'Truss Type',
    family,
    shape: normalizeShape(options.shape, family),
    material: normalizeTrussMaterial(options.material),
    defaultSpan: isFiniteNumber(options.defaultSpan) ? Math.max(1000, options.defaultSpan) : DEFAULT_SPAN,
    defaultRise: isFiniteNumber(options.defaultRise) ? Math.max(0, options.defaultRise) : DEFAULT_RISE,
    defaultPitch: isFiniteNumber(options.defaultPitch) ? Math.max(0, options.defaultPitch) : DEFAULT_PITCH,
    attachedRoofType: normalizeAttachedRoofType(options.attachedRoofType),
    webPattern: cloneWebPattern(options.webPattern),
  };
}

export function getDefaultTrussTypes() {
  return DEFAULT_TRUSS_TYPE_DEFS.map((entry) => createTrussType(entry));
}

export function getTrussTypeById(trussTypeId, catalog = getDefaultTrussTypes()) {
  return catalog.find((entry) => entry.id === trussTypeId) || null;
}

export function resolveTrussType(trussTypeId, catalog = getDefaultTrussTypes()) {
  return getTrussTypeById(trussTypeId, catalog) || catalog[0] || createTrussType();
}

export function getTrussTypeAttachedRoofType(trussTypeOrId, catalog = getDefaultTrussTypes()) {
  const trussType = typeof trussTypeOrId === 'string'
    ? resolveTrussType(trussTypeOrId, catalog)
    : createTrussType(trussTypeOrId || {});
  return normalizeAttachedRoofType(trussType?.attachedRoofType);
}

export function createTrussInstance(options = {}) {
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussType = resolveTrussType(options.trussTypeId, catalog);

  return {
    id: options.id || generateId('truss_instance'),
    trussTypeId: trussType.id,
    material: normalizeTrussMaterial(options.material ?? trussType.material),
    floorId: options.floorId ?? null,
    startPoint: clonePoint(options.startPoint) || { x: -DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    endPoint: clonePoint(options.endPoint) || { x: DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    span: isFiniteNumber(options.span) ? Math.max(1000, options.span) : trussType.defaultSpan,
    rise: isFiniteNumber(options.rise) ? Math.max(0, options.rise) : trussType.defaultRise,
    pitch: isFiniteNumber(options.pitch) ? Math.max(0, options.pitch) : trussType.defaultPitch,
    spacing: isFiniteNumber(options.spacing) ? Math.max(300, options.spacing) : DEFAULT_SPACING,
    count: isFiniteNumber(options.count) ? Math.max(1, Math.round(options.count)) : DEFAULT_COUNT,
    bearingOffsets: {
      start: isFiniteNumber(options.bearingOffsets?.start) ? options.bearingOffsets.start : 0,
      end: isFiniteNumber(options.bearingOffsets?.end) ? options.bearingOffsets.end : 0,
    },
    overhangs: {
      start: isFiniteNumber(options.overhangs?.start) ? Math.max(0, options.overhangs.start) : 300,
      end: isFiniteNumber(options.overhangs?.end) ? Math.max(0, options.overhangs.end) : 300,
    },
    supportMode: normalizeSupportMode(options.supportMode),
    supportBeamIds: normalizeSupportBeamIds(options.supportBeamIds),
    supportOffsetAlongAxis: normalizeSupportOffsetAlongAxis(options.supportOffsetAlongAxis),
    roofAttachmentId: typeof options.roofAttachmentId === 'string' && options.roofAttachmentId
      ? options.roofAttachmentId
      : null,
  };
}

export function normalizeTrussInstance(instance = {}, floorId = null, catalog = getDefaultTrussTypes()) {
  return {
    ...createTrussInstance({ floorId, catalog }),
    ...instance,
    id: instance?.id || generateId('truss_instance'),
    floorId: instance?.floorId || floorId || null,
    material: normalizeTrussMaterial(instance?.material ?? resolveTrussType(instance?.trussTypeId, catalog).material),
    startPoint: clonePoint(instance?.startPoint) || { x: -DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    endPoint: clonePoint(instance?.endPoint) || { x: DEFAULT_SUPPORT_LENGTH / 2, y: 0 },
    span: isFiniteNumber(instance?.span) ? Math.max(1000, instance.span) : resolveTrussType(instance?.trussTypeId, catalog).defaultSpan,
    rise: isFiniteNumber(instance?.rise) ? Math.max(0, instance.rise) : resolveTrussType(instance?.trussTypeId, catalog).defaultRise,
    pitch: isFiniteNumber(instance?.pitch) ? Math.max(0, instance.pitch) : resolveTrussType(instance?.trussTypeId, catalog).defaultPitch,
    spacing: isFiniteNumber(instance?.spacing) ? Math.max(300, instance.spacing) : DEFAULT_SPACING,
    count: isFiniteNumber(instance?.count) ? Math.max(1, Math.round(instance.count)) : DEFAULT_COUNT,
    bearingOffsets: {
      start: isFiniteNumber(instance?.bearingOffsets?.start) ? instance.bearingOffsets.start : 0,
      end: isFiniteNumber(instance?.bearingOffsets?.end) ? instance.bearingOffsets.end : 0,
    },
    overhangs: {
      start: isFiniteNumber(instance?.overhangs?.start) ? Math.max(0, instance.overhangs.start) : 300,
      end: isFiniteNumber(instance?.overhangs?.end) ? Math.max(0, instance.overhangs.end) : 300,
    },
    supportMode: normalizeSupportMode(instance?.supportMode),
    supportBeamIds: normalizeSupportBeamIds(instance?.supportBeamIds),
    supportOffsetAlongAxis: normalizeSupportOffsetAlongAxis(instance?.supportOffsetAlongAxis),
    roofAttachmentId: typeof instance?.roofAttachmentId === 'string' && instance.roofAttachmentId
      ? instance.roofAttachmentId
      : null,
  };
}

export function createTrussSystem(name = 'Truss System', options = {}) {
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussInstances = (options.trussInstances || []).map((instance) => normalizeTrussInstance(instance, options.floorId, catalog));

  return {
    id: options.id || generateId('truss_system'),
    name,
    floorId: options.floorId ?? null,
    phaseId: normalizePhaseId(options.phaseId),
    baseElevation: isFiniteNumber(options.baseElevation) ? options.baseElevation : 0,
    planRotationOffsetDegrees: normalizeRotationDegrees(options.planRotationOffsetDegrees),
    planOffset: clonePlanOffset(options.planOffset),
    planLengthScale: normalizePlanLengthScale(options.planLengthScale),
    purlinSystem: normalizePurlinSystem(options.purlinSystem),
    trussInstances,
  };
}

export function createTrussSystemForProject(project, floorId = null, options = {}) {
  const resolvedFloorId = floorId || getDefaultActiveFloorId(project, floorId);
  const floor = getProjectFloor(project, resolvedFloorId);
  const catalog = options.catalog || getDefaultTrussTypes();
  const trussInstances = options.trussInstances?.length
    ? options.trussInstances.map((instance) => normalizeTrussInstance(instance, resolvedFloorId, catalog))
    : [];

  return createTrussSystem(options.name ?? 'Truss System', {
    ...options,
    floorId: resolvedFloorId,
    phaseId: normalizePhaseId(options.phaseId),
    baseElevation: isFiniteNumber(options.baseElevation)
      ? options.baseElevation
      : (floor ? getFloorTopElevation(floor) : 0),
    trussInstances,
    catalog,
  });
}

export function normalizeTrussSystem(trussSystem = {}, project = null, catalog = getDefaultTrussTypes()) {
  const floorId = trussSystem?.floorId || getDefaultActiveFloorId(project, trussSystem?.floorId);
  const floor = project ? getProjectFloor(project, floorId) : null;
  const roofAttachmentId = project?.roofSystem?.trussAttachmentId === trussSystem?.id
    ? project.roofSystem.id
    : null;

  const trussInstances = (trussSystem?.trussInstances || []).map((instance) => ({
    ...normalizeTrussInstance(instance, floorId, catalog),
    roofAttachmentId,
  }));

  return {
    ...createTrussSystem(trussSystem?.name || 'Truss System', { floorId, catalog }),
    ...trussSystem,
    id: trussSystem?.id || generateId('truss_system'),
    name: trussSystem?.name || 'Truss System',
    floorId,
    phaseId: normalizePhaseId(trussSystem?.phaseId),
    baseElevation: isFiniteNumber(trussSystem?.baseElevation)
      ? trussSystem.baseElevation
      : (floor ? getFloorTopElevation(floor) : 0),
    planRotationOffsetDegrees: normalizeRotationDegrees(trussSystem?.planRotationOffsetDegrees),
    planOffset: clonePlanOffset(trussSystem?.planOffset),
    planLengthScale: normalizePlanLengthScale(trussSystem?.planLengthScale),
    purlinSystem: normalizePurlinSystem(trussSystem?.purlinSystem),
    trussInstances,
  };
}

export function getProjectTrussSystems(project, floorId = null) {
  const trussSystems = project?.trussSystems || [];
  if (!floorId) return trussSystems;
  return trussSystems.filter((entry) => entry.floorId === floorId);
}

export function getProjectTrussSystem(project, trussSystemId) {
  return (project?.trussSystems || []).find((entry) => entry.id === trussSystemId) || null;
}

export function findTrussInstance(project, trussInstanceId) {
  for (const trussSystem of project?.trussSystems || []) {
    const trussInstance = (trussSystem.trussInstances || []).find((entry) => entry.id === trussInstanceId) || null;
    if (trussInstance) {
      return { trussSystem, trussInstance };
    }
  }
  return { trussSystem: null, trussInstance: null };
}

export function hasBeamSupportedTrussInstances(trussSystem) {
  return (trussSystem?.trussInstances || []).some((instance) => (
    instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
  ));
}

export function detachBeamSupportedTrussInstances(trussInstances = []) {
  return trussInstances.map((instance) => (
    instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
      ? {
          ...instance,
          supportMode: null,
          supportBeamIds: { start: null, end: null },
          supportOffsetAlongAxis: 0,
        }
      : instance
  ));
}

function syncBeamSupportedInstance(instance, floor, catalog, roofAttachmentId) {
  const normalized = normalizeTrussInstance(instance, floor?.id || instance?.floorId || null, catalog);
  if (normalized.supportMode !== TRUSS_SUPPORT_MODES.BEAM_PAIR) {
    return {
      ...normalized,
      roofAttachmentId,
    };
  }

  const derived = deriveBeamSupportedInstanceGeometry(normalized, floor);
  if (!derived.valid) {
    return null;
  }

  return {
    ...normalized,
    floorId: floor?.id || normalized.floorId || null,
    startPoint: derived.startPoint,
    endPoint: derived.endPoint,
    count: derived.count,
    supportOffsetAlongAxis: derived.effectiveOffset,
    supportBeamIds: derived.supportBeamIds,
    roofAttachmentId,
  };
}

function syncTrussSystemGeometry(trussSystem, project, catalog) {
  const normalizedSystem = normalizeTrussSystem(trussSystem, project, catalog);
  const floor = getProjectFloor(project, normalizedSystem.floorId);
  if (!floor) return null;

  const roofAttachmentId = project?.roofSystem?.trussAttachmentId === normalizedSystem.id
    ? project.roofSystem.id
    : null;
  const syncedInstances = (normalizedSystem.trussInstances || [])
    .map((instance) => syncBeamSupportedInstance(instance, floor, catalog, roofAttachmentId))
    .filter(Boolean);

  if (!syncedInstances.length) {
    return null;
  }

  const beamSupportedInstance = syncedInstances.find((instance) => (
    instance.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR
  )) || null;
  const derivedBaseElevation = beamSupportedInstance
    ? deriveBeamSupportedInstanceGeometry(beamSupportedInstance, floor)
    : null;

  return {
    ...normalizedSystem,
    baseElevation: derivedBaseElevation?.valid
      ? derivedBaseElevation.baseElevation
      : normalizedSystem.baseElevation,
    trussInstances: syncedInstances,
  };
}

export function syncProjectTrussSystems(project) {
  if (!project) return project;

  const catalog = getDefaultTrussTypes();
  const normalizedTrussSystems = (project.trussSystems || [])
    .map((trussSystem) => syncTrussSystemGeometry(trussSystem, project, catalog))
    .filter(Boolean);

  const validTrussIds = new Set(normalizedTrussSystems.map((entry) => entry.id));
  const roofSystem = project.roofSystem && project.roofSystem.trussAttachmentId && !validTrussIds.has(project.roofSystem.trussAttachmentId)
    ? {
        ...project.roofSystem,
        trussAttachmentId: null,
      }
    : project.roofSystem;

  return {
    ...project,
    version: Math.max(CURRENT_PROJECT_VERSION, Number(project.version || 0)),
    roofSystem,
    trussSystems: normalizedTrussSystems,
  };
}

export function getAllTrussInstances(project, floorId = null) {
  return getProjectTrussSystems(project, floorId).flatMap((trussSystem) => (
    (trussSystem.trussInstances || []).map((trussInstance) => ({ trussSystem, trussInstance }))
  ));
}
