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
  return getJointTypeEntry(type).supportsAutoOverlapDepth === true;
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
  if (Number.isFinite(numeric)) return numeric;
  if (value != null && value !== '') {
    console.warn(`toFiniteNumber: "${value}" is not a finite number, using fallback ${fallback}`);
  }
  return fallback;
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

/**
 * Joint fit classes.
 *
 * CONVENTION: the FEMALE part widens by the fit clearance; the MALE part stays
 * nominal. A tenon, tab or panel edge is therefore always cut to its drawn size,
 * and only the mortise, slot or channel that receives it grows. That keeps the
 * visible reference surfaces exactly where the design put them, and it means a
 * fit change never moves a male part's outside dimension.
 *
 * `standard` is the LEGACY class and is what every joint that predates this
 * setting normalizes to. It adds ZERO fit clearance, so an old document's
 * geometry is bit-for-bit what it always was; the pre-existing
 * `tolerance.clearance` allowance is a separate, untouched knob that continues
 * to behave exactly as before, and the fit clearance composes on top of it.
 */
export const JOINT_FIT_CLASSES = Object.freeze({
  LEGACY: 'standard',
  GLUE: 'glue',
  PISTON: 'piston',
  LOOSE: 'loose',
  CUSTOM: 'custom',
});

/**
 * Side clearance in mm added to the female opening, per joint type and fit class.
 *
 * `glue` leaves room for a glue line, `piston` is a hand-press fit for dry
 * assembly, `loose` is a knock-together / painted-finish fit. Types absent from
 * this table take no fit clearance at all:
 *  - butt has no female geometry to widen;
 *  - dowel and pocket_screw size their holes from hardware data (pilot and
 *    dowel diameters), which is already the right source of truth.
 */
export const JOINT_FIT_CLEARANCES_MM = Object.freeze({
  dado: Object.freeze({ standard: 0, glue: 0.1, piston: 0.04, loose: 0.3 }),
  rabbet: Object.freeze({ standard: 0, glue: 0.1, piston: 0.04, loose: 0.3 }),
  tab_slot: Object.freeze({ standard: 0, glue: 0.1, piston: 0.04, loose: 0.3 }),
  mortise_tenon: Object.freeze({ standard: 0, glue: 0.1, piston: 0.04, loose: 0.3 }),
});

/** Clearance at or beyond this is a sloppy joint, not a fit. */
export const MAX_SANE_FIT_CLEARANCE_MM = 1;
/** Interference below this is a press fit no hand assembly will survive. */
export const MIN_SANE_FIT_CLEARANCE_MM = -0.1;

const FIT_CLASS_VALUES = new Set(Object.values(JOINT_FIT_CLASSES));

/** Whether a joint type takes a fit clearance at all. */
export function supportsJointFitClearance(type) {
  return Object.hasOwn(JOINT_FIT_CLEARANCES_MM, type);
}

export function isKnownJointFitClass(fit) {
  return FIT_CLASS_VALUES.has(fit);
}

/**
 * Unrecognized fit strings are PRESERVED rather than rewritten - a document may
 * carry a label this build does not know, and silently relabelling a saved joint
 * is worse than ignoring it. An unknown class simply contributes no clearance,
 * exactly like the legacy class.
 */
export function normalizeJointFitClass(fit) {
  if (typeof fit !== 'string' || !fit) {
    return JOINT_FIT_CLASSES.LEGACY;
  }
  // 'legacy' is accepted as a friendly alias for the wire value 'standard'.
  return fit === 'legacy' ? JOINT_FIT_CLASSES.LEGACY : fit;
}

/**
 * The side clearance (mm) a joint's female geometry should widen by.
 *
 * @param {string} type joint type id.
 * @param {{ fit?: string, clearanceMm?: number }} tolerance the joint's tolerance block.
 * @returns {number} 0 for legacy joints and for types that take no fit clearance.
 */
export function resolveJointFitClearance(type, tolerance = null) {
  if (!supportsJointFitClearance(type)) {
    return 0;
  }

  const fit = normalizeJointFitClass(tolerance?.fit);
  if (fit === JOINT_FIT_CLASSES.CUSTOM) {
    const custom = Number(tolerance?.clearanceMm);
    return Number.isFinite(custom) ? custom : 0;
  }

  return JOINT_FIT_CLEARANCES_MM[type][fit] ?? 0;
}

/** Fit choices for a joint type's editor, or [] when the type takes no fit. */
export function getJointFitOptions(type) {
  if (!supportsJointFitClearance(type)) {
    return [];
  }

  const table = JOINT_FIT_CLEARANCES_MM[type];

  return [
    { value: JOINT_FIT_CLASSES.LEGACY, label: 'Standard — no added clearance' },
    { value: JOINT_FIT_CLASSES.PISTON, label: `Piston — +${table.piston}mm (hand-press, dry fit)` },
    { value: JOINT_FIT_CLASSES.GLUE, label: `Glue — +${table.glue}mm (room for a glue line)` },
    { value: JOINT_FIT_CLASSES.LOOSE, label: `Loose — +${table.loose}mm (knock-together, painted)` },
    { value: JOINT_FIT_CLASSES.CUSTOM, label: 'Custom clearance…' },
  ];
}

/** Human-readable fit note for assembly documentation. */
export function describeJointFit(type, tolerance = null) {
  if (!supportsJointFitClearance(type)) {
    return null;
  }

  const fit = normalizeJointFitClass(tolerance?.fit);
  const clearance = roundJoineryValue(resolveJointFitClearance(type, tolerance)) ?? 0;

  return {
    fit,
    clearanceMm: clearance,
    label: isKnownJointFitClass(fit) && fit !== JOINT_FIT_CLASSES.LEGACY ? fit : `${fit} (no added clearance)`,
    // Same sentence everywhere the fit is documented, so the shop note and the
    // panel never disagree about which half of the joint moved.
    note: `${fit} fit — female opening widened by ${clearance}mm total; male part stays nominal`,
  };
}

export function createDefaultTolerance(input = {}, legacyClearance = null) {
  const normalizedClearance = toNonNegativeNumber(input?.clearance ?? legacyClearance, DEFAULT_JOINT_CLEARANCE);
  const customClearance = Number(input?.clearanceMm);

  return {
    clearance: roundJoineryValue(normalizedClearance) ?? DEFAULT_JOINT_CLEARANCE,
    fit: normalizeJointFitClass(input?.fit),
    clearanceMm: Number.isFinite(customClearance) ? (roundJoineryValue(customClearance) ?? 0) : null,
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
