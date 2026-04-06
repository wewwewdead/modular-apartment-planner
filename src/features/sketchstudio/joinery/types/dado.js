import { JOINERY_TOUCH_TOLERANCE, toPositiveNumber, toNonNegativeNumber, toFiniteNumber } from '../jointDefaults';

export default {
  type: 'dado',
  label: 'Dado',
  description: 'A receiving slot cut into the target part for a mating source panel.',
  fabrication: { process: 'milling', operationKind: 'slot', hardware: null },
  minThickness: 6,
  strength: 'medium-high',
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
      depth: targetThickness ? targetThickness * 0.33 : null,
      inset: 0,
      offset: 0,
    });
  },

  validate(joint, context, parameters, helpers) {
    const reasons = [];

    helpers.validatePositiveDimension(parameters, 'width', 'Width', reasons);
    helpers.validatePositiveDimension(parameters, 'depth', 'Depth', reasons);

    const widthOffsetState = helpers.getWidthOffsetState(context, parameters);
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
        start < context.targetEdge.start - JOINERY_TOUCH_TOLERANCE ||
        end > context.targetEdge.end + JOINERY_TOUCH_TOLERANCE
      ) {
        reasons.push('Width plus width offset exceeds the available target edge span.');
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
    const interval = helpers.buildWidthOffsetInterval(context, joint.parameters);
    if (!interval) {
      return { error: 'Dado dimensions do not fit within the available overlap.' };
    }

    const fabricationState = helpers.getJointFabricationState(context);

    return {
      featureEntities: [
        helpers.createRectFeatureEntity(
          joint,
          context.targetPart,
          'target',
          context.targetEdge,
          interval,
          joint.parameters.depth,
          'dado-slot',
          fabricationState,
        ),
      ],
      occupiedRegions: helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, [
        interval,
      ]),
    };
  },
};
