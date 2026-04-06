import { JOINT_TYPES, getJointTypeLabel } from './jointTypes';
import { JOINERY_TOUCH_TOLERANCE } from './jointDefaults';
import { applyInsetToOverlap, buildRepeatedEdgeIntervals } from './jointResolvers';
import { getJointTypeEntry } from './jointRegistry';

const DIAGNOSTIC_LABELS = {
  applied: 'Applied',
  disabled: 'Disabled',
  invalid: 'Invalid',
  warning: 'Warning',
};

export function createValidationState(status = 'pending', options = {}) {
  const reasons = Array.isArray(options.reasons) ? options.reasons.filter(Boolean) : [];
  const warnings = Array.isArray(options.warnings) ? options.warnings.filter(Boolean) : [];
  const generatedEntityIds = Array.isArray(options.generatedEntityIds)
    ? Array.from(new Set(options.generatedEntityIds.filter(Boolean)))
    : [];
  const canApply = options.canApply ?? (status === 'valid' || status === 'warning');

  return {
    status,
    reasons,
    warnings,
    canApply,
    generatedEntityIds,
  };
}

function buildInvalidState(reasons) {
  return createValidationState('invalid', { reasons, canApply: false });
}

function buildValidState(warnings = []) {
  return createValidationState(warnings.length ? 'warning' : 'valid', { warnings, canApply: true });
}

function buildDraftThicknessWarning(context) {
  const partIds = Array.isArray(context?.missingThicknessPartIds)
    ? context.missingThicknessPartIds.filter(Boolean)
    : [];

  if (!partIds.length) {
    return null;
  }

  return `Draft joinery only. Assign thickness to ${partIds.join(' and ')} to enable fabrication validation and export.`;
}

function validatePositiveDimension(parameters, key, label, reasons) {
  if (!(Number(parameters?.[key]) > 0)) {
    reasons.push(`${label} must be a positive value.`);
  }
}

function getInsetOverlap(context, parameters) {
  return applyInsetToOverlap(context?.overlap, parameters?.inset || 0);
}

function getWidthOffsetState(context, parameters) {
  const insetOverlap = getInsetOverlap(context, parameters);
  if (!insetOverlap) {
    return null;
  }

  const baseWidth = Math.min(Math.max(Number(parameters?.width) || 0, JOINERY_TOUCH_TOLERANCE), insetOverlap.length);
  const effectiveWidth = baseWidth + (Number(parameters?.offset) || 0);

  return {
    insetOverlap,
    baseWidth,
    effectiveWidth,
    center: insetOverlap.center,
  };
}

function getFemaleAllowanceState(joint, context, parameters) {
  const insetOverlap = getInsetOverlap(context, parameters);
  if (!insetOverlap) {
    return null;
  }

  const baseWidth = Math.min(Math.max(Number(parameters?.width) || 0, JOINERY_TOUCH_TOLERANCE), insetOverlap.length);
  const femaleWidth = baseWidth + (Number(parameters?.offset) || 0) + (Number(joint?.tolerance?.clearance) || 0);

  return {
    insetOverlap,
    baseWidth,
    femaleWidth,
    center: insetOverlap.center,
  };
}

function buildRepeatedPatternResult(context, parameters, widthKey) {
  const intervalsResult = buildRepeatedEdgeIntervals(context?.overlap, {
    count: parameters?.count,
    width: parameters?.[widthKey],
    spacing: parameters?.spacing,
    edgeOffset: parameters?.edgeOffset,
  });

  return intervalsResult.error || !intervalsResult.intervals?.length
    ? { error: intervalsResult.error || 'The repeated joint pattern could not be resolved.' }
    : { intervals: intervalsResult.intervals };
}

const validationHelpers = {
  validatePositiveDimension,
  getWidthOffsetState,
  getFemaleAllowanceState,
  buildRepeatedPatternResult,
};

export function validateResolvedJoint(joint, context, parameters) {
  if (joint?.enabled === false) {
    return createValidationState('disabled', {
      reasons: ['Joint generation is disabled.'],
      canApply: false,
    });
  }

  if (!context || context.error) {
    return buildInvalidState([context?.error || 'The joint context could not be resolved.']);
  }

  const warnings = [];
  const entry = getJointTypeEntry(joint.type);
  const reasons = entry.validate(joint, context, parameters, validationHelpers) || [];

  const draftThicknessWarning = buildDraftThicknessWarning(context);
  if (draftThicknessWarning) {
    warnings.push(draftThicknessWarning);
  }

  if (
    context.sourceThickness != null &&
    context.targetThickness != null &&
    context.sourceThickness !== context.targetThickness &&
    joint.type === JOINT_TYPES.TAB_SLOT
  ) {
    warnings.push('Tab-and-slot joints are easiest to manufacture when both parts share the same thickness.');
  }

  return reasons.length ? buildInvalidState(reasons) : buildValidState(warnings);
}

function regionsOverlap(firstRegion, secondRegion) {
  return (
    firstRegion.partId === secondRegion.partId &&
    firstRegion.edgeKey === secondRegion.edgeKey &&
    Math.max(firstRegion.start, secondRegion.start) <
      Math.min(firstRegion.end, secondRegion.end) - JOINERY_TOUCH_TOLERANCE
  );
}

export function detectOccupiedRegionConflicts(existingRegions = [], nextRegions = []) {
  return nextRegions.reduce((messages, nextRegion) => {
    const conflictingRegion = existingRegions.find((existingRegion) => regionsOverlap(existingRegion, nextRegion));
    if (!conflictingRegion) {
      return messages;
    }

    return [
      ...messages,
      `Conflicting joinery occupies the same region as ${conflictingRegion.jointId} on ${nextRegion.partId}:${nextRegion.edgeKey}.`,
    ];
  }, []);
}

export function buildConflictValidationState(validationState, conflictMessages = []) {
  return createValidationState('warning', {
    reasons: validationState?.reasons || [],
    warnings: [...(validationState?.warnings || []), ...conflictMessages],
    canApply: false,
    generatedEntityIds: validationState?.generatedEntityIds || [],
  });
}

function buildDiagnosticMessage(validationState) {
  const reasons = validationState?.reasons || [];
  const warnings = validationState?.warnings || [];

  if (reasons.length) {
    return reasons.join(' ');
  }

  if (warnings.length) {
    return warnings.join(' ');
  }

  return null;
}

export function createJointDiagnostic(joint) {
  const validationState =
    joint?.validationState ||
    createValidationState('invalid', {
      reasons: ['Joint validation state is missing.'],
      canApply: false,
    });
  const diagnosticStatus = validationState.status === 'valid' ? 'applied' : validationState.status;

  return {
    jointId: joint.id,
    type: joint.type,
    label: joint.label || getJointTypeLabel(joint.type),
    status: diagnosticStatus,
    statusLabel: DIAGNOSTIC_LABELS[diagnosticStatus] || diagnosticStatus,
    message: buildDiagnosticMessage(validationState),
    canApply: validationState.canApply !== false,
  };
}
