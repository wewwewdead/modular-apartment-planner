import { JOINT_TYPES } from './jointTypes';
import { getJointTypeEntry } from './jointRegistry';

export const JOINERY_TOUCH_TOLERANCE = 0.5;
export const DEFAULT_JOINT_CLEARANCE = 0.2;
export const DEFAULT_FACE_KEY = 'front';
export const JOINT_PLACEMENT_MODES = Object.freeze({
  MANUAL_REFS: 'manual_refs',
  AUTO_CONTACT: 'auto_contact',
});
export const JOINT_PARAMETER_DEPTH_MODES = Object.freeze({
  MANUAL: 'manual',
  AUTO_OVERLAP: 'auto_overlap',
});

const ROUNDING_FACTOR = 100;

export function supportsAutoOverlapDepth(type) {
  return (
    type === JOINT_TYPES.DADO ||
    type === JOINT_TYPES.RABBET ||
    type === JOINT_TYPES.MORTISE_TENON ||
    type === JOINT_TYPES.TAB_SLOT
  );
}

export function normalizeJointPlacementMode(mode, hasExplicitReferences = false) {
  if (mode === JOINT_PLACEMENT_MODES.MANUAL_REFS || mode === JOINT_PLACEMENT_MODES.AUTO_CONTACT) {
    return mode;
  }

  return hasExplicitReferences ? JOINT_PLACEMENT_MODES.MANUAL_REFS : JOINT_PLACEMENT_MODES.AUTO_CONTACT;
}

export function normalizeJointParameterModes(type, placementMode, parameterModes = {}, parameters = {}) {
  const requestedDepthMode = parameterModes?.depth;
  const hasExplicitDepth = parameters?.depth != null;

  if (requestedDepthMode === JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP && supportsAutoOverlapDepth(type)) {
    return {
      depth:
        placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT
          ? JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP
          : JOINT_PARAMETER_DEPTH_MODES.MANUAL,
    };
  }

  if (requestedDepthMode === JOINT_PARAMETER_DEPTH_MODES.MANUAL) {
    return {
      depth: JOINT_PARAMETER_DEPTH_MODES.MANUAL,
    };
  }

  if (placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT && supportsAutoOverlapDepth(type) && !hasExplicitDepth) {
    return {
      depth: JOINT_PARAMETER_DEPTH_MODES.AUTO_OVERLAP,
    };
  }

  return {
    depth: JOINT_PARAMETER_DEPTH_MODES.MANUAL,
  };
}

export function roundJoineryValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

export function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function toNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

export function toPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export function createDefaultFaceReference(partId, input = {}) {
  if (!partId) {
    return null;
  }

  return {
    partId,
    faceKey: typeof input?.faceKey === 'string' && input.faceKey ? input.faceKey : DEFAULT_FACE_KEY,
  };
}

export function createDefaultTolerance(input = {}, legacyClearance = null) {
  const normalizedClearance = toNonNegativeNumber(input?.clearance ?? legacyClearance, DEFAULT_JOINT_CLEARANCE);

  return {
    clearance: roundJoineryValue(normalizedClearance) ?? DEFAULT_JOINT_CLEARANCE,
    fit: typeof input?.fit === 'string' && input.fit ? input.fit : 'standard',
  };
}

function getFabricationDefaultsByType(type) {
  const entry = getJointTypeEntry(type);
  return { ...entry.fabrication };
}

export function createDefaultFabrication(type, input = {}) {
  const defaults = getFabricationDefaultsByType(type);

  return {
    process: input?.process || defaults.process,
    operationKind: input?.operationKind || defaults.operationKind,
    hardware:
      input?.hardware && typeof input.hardware === 'object'
        ? { ...input.hardware }
        : defaults.hardware
          ? { ...defaults.hardware }
          : null,
    notes: typeof input?.notes === 'string' ? input.notes : '',
  };
}

export function normalizeJointParameters(type, parameters = {}) {
  return getJointTypeEntry(type).normalizeParameters(parameters);
}

export function mergeJointParameters(type, baseParameters = {}, patchParameters = {}) {
  return normalizeJointParameters(type, {
    ...baseParameters,
    ...patchParameters,
  });
}

export function computeJointDefaultParameters(type, context = null) {
  return getJointTypeEntry(type).computeDefaults(context);
}
