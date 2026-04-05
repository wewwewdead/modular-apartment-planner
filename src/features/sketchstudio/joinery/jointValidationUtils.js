import { JOINT_TYPES, getJointTypeLabel } from './jointTypes';
import { JOINERY_TOUCH_TOLERANCE } from './jointDefaults';
import { applyInsetToOverlap, buildRepeatedEdgeIntervals } from './jointResolvers';

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

  const baseWidth = Math.min(
    Math.max(Number(parameters?.width) || 0, JOINERY_TOUCH_TOLERANCE),
    insetOverlap.length,
  );
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

  const baseWidth = Math.min(
    Math.max(Number(parameters?.width) || 0, JOINERY_TOUCH_TOLERANCE),
    insetOverlap.length,
  );
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

  const reasons = [];
  const warnings = [];

  switch (joint.type) {
    case JOINT_TYPES.DADO: {
      validatePositiveDimension(parameters, 'width', 'Width', reasons);
      validatePositiveDimension(parameters, 'depth', 'Depth', reasons);

      const widthOffsetState = getWidthOffsetState(context, parameters);
      if (!widthOffsetState) {
        reasons.push('Inset leaves no usable overlap for this joint.');
      } else {
        if (widthOffsetState.effectiveWidth <= JOINERY_TOUCH_TOLERANCE) {
          reasons.push('Width offset reduces the joint width to zero or less.');
        }

        const halfWidth = widthOffsetState.effectiveWidth / 2;
        const start = widthOffsetState.center - halfWidth;
        const end = widthOffsetState.center + halfWidth;

        if (
          start < context.targetEdge.start - JOINERY_TOUCH_TOLERANCE
          || end > context.targetEdge.end + JOINERY_TOUCH_TOLERANCE
        ) {
          reasons.push('Width plus width offset exceeds the available target edge span.');
        }
      }

      if (
        context.targetThickness != null
        && (parameters.depth || 0) > context.targetThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Depth exceeds the target material thickness.');
      }

      break;
    }

    case JOINT_TYPES.RABBET:
    case JOINT_TYPES.MORTISE_TENON: {
      validatePositiveDimension(parameters, 'width', 'Width', reasons);
      validatePositiveDimension(parameters, 'depth', 'Depth', reasons);

      const femaleAllowanceState = getFemaleAllowanceState(joint, context, parameters);
      if (!femaleAllowanceState) {
        reasons.push('Inset leaves no usable overlap for this joint.');
      } else {
        if (femaleAllowanceState.femaleWidth <= JOINERY_TOUCH_TOLERANCE) {
          reasons.push('Width offset plus clearance reduces the receiving joint width to zero or less.');
        }

        const halfWidth = femaleAllowanceState.femaleWidth / 2;
        const start = femaleAllowanceState.center - halfWidth;
        const end = femaleAllowanceState.center + halfWidth;

        if (
          start < context.targetEdge.start - JOINERY_TOUCH_TOLERANCE
          || end > context.targetEdge.end + JOINERY_TOUCH_TOLERANCE
        ) {
          reasons.push('Receiving width plus width offset exceeds the available target edge span.');
        }
      }

      if (
        context.targetThickness != null
        && (parameters.depth || 0) > context.targetThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Depth exceeds the target material thickness.');
      }

      break;
    }

    case JOINT_TYPES.DOWEL: {
      validatePositiveDimension(parameters, 'dowelDiameter', 'Dowel diameter', reasons);
      validatePositiveDimension(parameters, 'depth', 'Drill depth', reasons);

      if (!Number.isInteger(parameters.count) || parameters.count < 1) {
        reasons.push('Dowel count must be an integer greater than zero.');
      }

      if (
        context.minThickness != null
        && (parameters.dowelDiameter || 0) > context.minThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Dowel diameter exceeds the available material thickness.');
      }

      if (
        context.minThickness != null
        && (parameters.depth || 0) > context.minThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Drill depth exceeds the available material thickness.');
      }

      const pattern = buildRepeatedPatternResult(context, parameters, 'dowelDiameter');
      if (pattern.error) {
        reasons.push(pattern.error);
      }

      break;
    }

    case JOINT_TYPES.POCKET_SCREW: {
      validatePositiveDimension(parameters, 'pocketDiameter', 'Pocket diameter', reasons);
      validatePositiveDimension(parameters, 'pilotDiameter', 'Pilot diameter', reasons);
      validatePositiveDimension(parameters, 'depth', 'Pocket depth', reasons);

      if (!Number.isInteger(parameters.count) || parameters.count < 1) {
        reasons.push('Pocket count must be an integer greater than zero.');
      }

      if (
        context.sourceThickness != null
        && (parameters.depth || 0) > context.sourceThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Pocket depth exceeds the source material thickness.');
      }

      if (
        context.sourceThickness != null
        && (parameters.pocketOffset || 0) > context.sourceThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Pocket offset exceeds the source material thickness.');
      }

      const pattern = buildRepeatedPatternResult(context, {
        ...parameters,
        pocketDiameter: Math.max(parameters.pocketDiameter || 0, parameters.pilotDiameter || 0),
      }, 'pocketDiameter');
      if (pattern.error) {
        reasons.push(pattern.error);
      }

      break;
    }

    case JOINT_TYPES.TAB_SLOT: {
      validatePositiveDimension(parameters, 'tabWidth', 'Tab width', reasons);
      validatePositiveDimension(parameters, 'depth', 'Tab depth', reasons);

      if (!Number.isInteger(parameters.count) || parameters.count < 1) {
        reasons.push('Tab count must be an integer greater than zero.');
      }

      if (
        context.targetThickness != null
        && (parameters.depth || 0) > context.targetThickness + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Tab depth exceeds the target material thickness.');
      }

      const pattern = buildRepeatedPatternResult(context, parameters, 'tabWidth');
      if (pattern.error) {
        reasons.push(pattern.error);
      }

      break;
    }

    case JOINT_TYPES.BUTT:
    default:
      break;
  }

  const draftThicknessWarning = buildDraftThicknessWarning(context);
  if (draftThicknessWarning) {
    warnings.push(draftThicknessWarning);
  }

  if (
    context.sourceThickness != null
    && context.targetThickness != null
    && context.sourceThickness !== context.targetThickness
    && joint.type === JOINT_TYPES.TAB_SLOT
  ) {
    warnings.push('Tab-and-slot joints are easiest to manufacture when both parts share the same thickness.');
  }

  return reasons.length ? buildInvalidState(reasons) : buildValidState(warnings);
}

function regionsOverlap(firstRegion, secondRegion) {
  return firstRegion.partId === secondRegion.partId
    && firstRegion.edgeKey === secondRegion.edgeKey
    && Math.max(firstRegion.start, secondRegion.start)
      < Math.min(firstRegion.end, secondRegion.end) - JOINERY_TOUCH_TOLERANCE;
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
  const validationState = joint?.validationState || createValidationState('invalid', {
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
