import { JOINT_TYPES } from './jointTypes';

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
const DEFAULT_DADO_DEPTH_FACTOR = 0.33;
const DEFAULT_RABBET_DEPTH_FACTOR = 0.5;
const DEFAULT_TENON_DEPTH_FACTOR = 0.6;
const DEFAULT_DOWEL_DIAMETER_FACTOR = 0.35;
const DEFAULT_POCKET_DIAMETER = 9.5;
const DEFAULT_PILOT_DIAMETER = 3.5;
const DEFAULT_REPEAT_MARGIN_FACTOR = 0.5;
const DEFAULT_DRAFT_DEPTH = 12;

export function supportsAutoOverlapDepth(type) {
  return (
    type === JOINT_TYPES.DADO
    || type === JOINT_TYPES.RABBET
    || type === JOINT_TYPES.MORTISE_TENON
    || type === JOINT_TYPES.TAB_SLOT
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

  if (
    placementMode === JOINT_PLACEMENT_MODES.AUTO_CONTACT
    && supportsAutoOverlapDepth(type)
    && !hasExplicitDepth
  ) {
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
  const normalizedClearance = toNonNegativeNumber(
    input?.clearance ?? legacyClearance,
    DEFAULT_JOINT_CLEARANCE,
  );

  return {
    clearance: roundJoineryValue(normalizedClearance) ?? DEFAULT_JOINT_CLEARANCE,
    fit: typeof input?.fit === 'string' && input.fit ? input.fit : 'standard',
  };
}

function getFabricationDefaultsByType(type) {
  switch (type) {
    case JOINT_TYPES.DADO:
      return {
        process: 'milling',
        operationKind: 'slot',
        hardware: null,
      };
    case JOINT_TYPES.RABBET:
      return {
        process: 'milling',
        operationKind: 'profile-step',
        hardware: null,
      };
    case JOINT_TYPES.MORTISE_TENON:
      return {
        process: 'milling',
        operationKind: 'tenon-mortise',
        hardware: null,
      };
    case JOINT_TYPES.DOWEL:
      return {
        process: 'drilling',
        operationKind: 'paired-holes',
        hardware: { kind: 'dowel' },
      };
    case JOINT_TYPES.POCKET_SCREW:
      return {
        process: 'drilling',
        operationKind: 'pocket-screw',
        hardware: { kind: 'pocket-screw' },
      };
    case JOINT_TYPES.TAB_SLOT:
      return {
        process: 'milling',
        operationKind: 'tab-slot',
        hardware: null,
      };
    case JOINT_TYPES.BUTT:
    default:
      return {
        process: 'assembly',
        operationKind: 'butt',
        hardware: null,
      };
  }
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
  switch (type) {
    case JOINT_TYPES.DADO:
    case JOINT_TYPES.RABBET:
    case JOINT_TYPES.MORTISE_TENON:
      return {
        width: toPositiveNumber(parameters.width),
        depth: toPositiveNumber(parameters.depth),
        inset: toNonNegativeNumber(parameters.inset, 0),
        offset: toFiniteNumber(parameters.offset, 0),
      };
    case JOINT_TYPES.DOWEL:
      return {
        dowelDiameter: toPositiveNumber(parameters.dowelDiameter),
        count: toPositiveInteger(parameters.count),
        spacing: toNonNegativeNumber(parameters.spacing, 0),
        edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
        depth: toPositiveNumber(parameters.depth),
      };
    case JOINT_TYPES.POCKET_SCREW:
      return {
        pocketDiameter: toPositiveNumber(parameters.pocketDiameter),
        pilotDiameter: toPositiveNumber(parameters.pilotDiameter),
        count: toPositiveInteger(parameters.count),
        spacing: toNonNegativeNumber(parameters.spacing, 0),
        edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
        pocketOffset: toNonNegativeNumber(parameters.pocketOffset, 0),
        depth: toPositiveNumber(parameters.depth),
      };
    case JOINT_TYPES.TAB_SLOT:
      return {
        count: toPositiveInteger(parameters.count),
        tabWidth: toPositiveNumber(parameters.tabWidth),
        spacing: toNonNegativeNumber(parameters.spacing, 0),
        edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
        depth: toPositiveNumber(parameters.depth),
      };
    case JOINT_TYPES.BUTT:
    default:
      return {
        offset: toFiniteNumber(parameters.offset, 0),
      };
  }
}

export function mergeJointParameters(type, baseParameters = {}, patchParameters = {}) {
  return normalizeJointParameters(type, {
    ...baseParameters,
    ...patchParameters,
  });
}

function computeRepeatCount(span, minimumPitch, minCount = 1, maxCount = 4) {
  if (!(span > 0)) {
    return minCount;
  }

  const estimated = Math.floor(span / Math.max(minimumPitch, 1));
  return Math.max(minCount, Math.min(maxCount, estimated || minCount));
}

function computeDefaultEdgeMargin(context, fallback = 6) {
  return roundJoineryValue((context?.minThickness || fallback) * DEFAULT_REPEAT_MARGIN_FACTOR) || fallback;
}

export function computeJointDefaultParameters(type, context = null) {
  const overlapLength = context?.overlap?.length || 0;
  const sourceThickness = context?.sourceThickness ?? null;
  const targetThickness = context?.targetThickness ?? null;
  const minThickness = context?.minThickness ?? (
    sourceThickness != null && targetThickness != null
      ? Math.min(sourceThickness, targetThickness)
      : null
  );

  switch (type) {
    case JOINT_TYPES.DADO:
      return normalizeJointParameters(type, {
        width: overlapLength || null,
        depth: targetThickness ? targetThickness * DEFAULT_DADO_DEPTH_FACTOR : null,
        inset: 0,
        offset: 0,
      });

    case JOINT_TYPES.RABBET:
      return normalizeJointParameters(type, {
        width: overlapLength || null,
        depth: targetThickness ? targetThickness * DEFAULT_RABBET_DEPTH_FACTOR : null,
        inset: 0,
        offset: 0,
      });

    case JOINT_TYPES.MORTISE_TENON:
      return normalizeJointParameters(type, {
        width: overlapLength ? Math.max((minThickness || DEFAULT_DRAFT_DEPTH) * 1.5, overlapLength * 0.6) : null,
        depth: targetThickness ? targetThickness * DEFAULT_TENON_DEPTH_FACTOR : DEFAULT_DRAFT_DEPTH,
        inset: 0,
        offset: 0,
      });

    case JOINT_TYPES.DOWEL: {
      const count = computeRepeatCount(overlapLength, Math.max((minThickness || DEFAULT_DRAFT_DEPTH) * 4, 80), 1, 4);
      const edgeOffset = computeDefaultEdgeMargin(context, 6);
      const usableLength = Math.max(0, overlapLength - (edgeOffset * 2));
      const spacing = count > 1 ? usableLength / (count - 1) : 0;

      return normalizeJointParameters(type, {
        dowelDiameter: minThickness ? minThickness * DEFAULT_DOWEL_DIAMETER_FACTOR : 8,
        count,
        spacing,
        edgeOffset,
        depth: minThickness ? minThickness * 0.6 : DEFAULT_DRAFT_DEPTH,
      });
    }

    case JOINT_TYPES.POCKET_SCREW: {
      const count = computeRepeatCount(overlapLength, Math.max((minThickness || DEFAULT_DRAFT_DEPTH) * 5, 110), 1, 4);
      const edgeOffset = computeDefaultEdgeMargin(context, 8);
      const usableLength = Math.max(0, overlapLength - (edgeOffset * 2));
      const spacing = count > 1 ? usableLength / (count - 1) : 0;

      return normalizeJointParameters(type, {
        pocketDiameter: DEFAULT_POCKET_DIAMETER,
        pilotDiameter: DEFAULT_PILOT_DIAMETER,
        count,
        spacing,
        edgeOffset,
        pocketOffset: roundJoineryValue((sourceThickness || minThickness || 12) * 0.75),
        depth: roundJoineryValue((sourceThickness || minThickness || 12) * 0.75),
      });
    }

    case JOINT_TYPES.TAB_SLOT: {
      const count = computeRepeatCount(overlapLength, Math.max((minThickness || DEFAULT_DRAFT_DEPTH) * 3, 70), 1, 5);
      const edgeOffset = computeDefaultEdgeMargin(context, 6);
      const spacing = count > 1 ? computeDefaultEdgeMargin(context, 4) : 0;
      const usableLength = Math.max(0, overlapLength - (edgeOffset * 2) - (Math.max(0, count - 1) * spacing));
      const tabWidth = count > 0 ? usableLength / count : usableLength;

      return normalizeJointParameters(type, {
        count,
        tabWidth,
        spacing,
        edgeOffset,
        depth: targetThickness ? targetThickness * DEFAULT_TENON_DEPTH_FACTOR : DEFAULT_DRAFT_DEPTH,
      });
    }

    case JOINT_TYPES.BUTT:
    default:
      return normalizeJointParameters(type, {
        offset: 0,
      });
  }
}
