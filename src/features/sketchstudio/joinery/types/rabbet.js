import { JOINERY_TOUCH_TOLERANCE, toPositiveNumber, toNonNegativeNumber, toFiniteNumber } from '../jointDefaults';

export default {
  type: 'rabbet',
  label: 'Rabbet',
  description: 'A stepped edge cut in the target part that receives the source part.',
  fabrication: { process: 'milling', operationKind: 'profile-step', hardware: null },
  minThickness: 6,
  strength: 'medium',
  difficulty: 'easy',
  cncFriendly: true,
  materials: ['plywood', 'mdf', 'lumber'],

  normalizeParameters(parameters = {}) {
    return {
      width: toPositiveNumber(parameters.width),
      depth: toPositiveNumber(parameters.depth),
      inset: toNonNegativeNumber(parameters.inset, 0),
      offset: toFiniteNumber(parameters.offset, 0),
    };
  },

  computeDefaults(context) {
    const overlapLength = context?.overlap?.length || 0;
    const targetThickness = context?.targetThickness ?? null;

    return this.normalizeParameters({
      width: overlapLength || null,
      depth: targetThickness ? targetThickness * 0.5 : null,
      inset: 0,
      offset: 0,
    });
  },

  validate(joint, context, parameters, helpers) {
    const reasons = [];

    helpers.validatePositiveDimension(parameters, 'width', 'Width', reasons);
    helpers.validatePositiveDimension(parameters, 'depth', 'Depth', reasons);

    const femaleAllowanceState = helpers.getFemaleAllowanceState(joint, context, parameters);
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
        start < context.targetEdge.start - JOINERY_TOUCH_TOLERANCE ||
        end > context.targetEdge.end + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Receiving width plus width offset exceeds the available target edge span.');
      }
    }

    if (
      context.targetThickness != null &&
      (parameters.depth || 0) > context.targetThickness + JOINERY_TOUCH_TOLERANCE
    ) {
      reasons.push('Depth exceeds the target material thickness.');
    }

    return reasons;
  },

  buildGeometry(joint, context, helpers) {
    const { femaleInterval } = helpers.buildFemaleClearanceIntervals(joint, context);
    if (!femaleInterval) {
      return { error: 'Rabbet dimensions do not fit within the available overlap.' };
    }

    return {
      partModifications: [
        {
          partId: context.targetPart.id,
          edgeKey: context.targetEdge.edgeKey,
          modifications: [
            {
              ...femaleInterval,
              depth: joint.parameters.depth,
              mode: 'cut',
            },
          ],
        },
      ],
      occupiedRegions: helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, [
        femaleInterval,
      ]),
    };
  },
};
