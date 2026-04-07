import {
  JOINERY_TOUCH_TOLERANCE,
  roundJoineryValue,
  toPositiveNumber,
  toPositiveInteger,
  toNonNegativeNumber,
} from '../jointDefaults';

const DEFAULT_DRAFT_DEPTH = 12;
const DEFAULT_DOWEL_DIAMETER_FACTOR = 0.35;
const DEFAULT_REPEAT_MARGIN_FACTOR = 0.5;

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

export default {
  type: 'dowel',
  label: 'Dowel Joint',
  description: 'Matched drilling operations across the source and target parts.',
  fabrication: { process: 'drilling', operationKind: 'paired-holes', hardware: { kind: 'dowel' } },
  minThickness: 6,
  strength: 'medium',
  difficulty: 'medium',
  cncFriendly: true,
  materials: ['plywood', 'mdf', 'lumber'],

  normalizeParameters(parameters = {}) {
    return {
      dowelDiameter: toPositiveNumber(parameters.dowelDiameter),
      count: toPositiveInteger(parameters.count),
      spacing: toNonNegativeNumber(parameters.spacing, 0),
      edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
      depth: toPositiveNumber(parameters.depth),
    };
  },

  computeDefaults(context) {
    const overlapLength = context?.overlap?.length || 0;
    const minThicknessValue = context?.minThickness ?? null;
    const count = computeRepeatCount(overlapLength, Math.max((minThicknessValue || DEFAULT_DRAFT_DEPTH) * 4, 80), 1, 4);
    const edgeOffset = computeDefaultEdgeMargin(context, 6);
    const usableLength = Math.max(0, overlapLength - edgeOffset * 2);
    const spacing = count > 1 ? usableLength / (count - 1) : 0;

    return this.normalizeParameters({
      dowelDiameter: minThicknessValue ? minThicknessValue * DEFAULT_DOWEL_DIAMETER_FACTOR : 8,
      count,
      spacing,
      edgeOffset,
      depth: minThicknessValue ? minThicknessValue * 0.6 : DEFAULT_DRAFT_DEPTH,
    });
  },

  validate(joint, context, parameters, helpers) {
    const reasons = [];

    helpers.validatePositiveDimension(parameters, 'dowelDiameter', 'Dowel diameter', reasons);
    helpers.validatePositiveDimension(parameters, 'depth', 'Drill depth', reasons);

    if (!Number.isInteger(parameters.count) || parameters.count < 1) {
      reasons.push('Dowel count must be an integer greater than zero.');
    }

    if (
      context.minThickness != null &&
      (parameters.dowelDiameter || 0) > context.minThickness + JOINERY_TOUCH_TOLERANCE
    ) {
      reasons.push('Dowel diameter exceeds the available material thickness.');
    }

    if (context.minThickness != null && (parameters.depth || 0) > context.minThickness + JOINERY_TOUCH_TOLERANCE) {
      reasons.push('Drill depth exceeds the available material thickness.');
    }

    const pattern = helpers.buildRepeatedPatternResult(context, parameters, 'dowelDiameter');
    if (pattern.error) {
      reasons.push(pattern.error);
    }

    return reasons;
  },

  supportsAutoOverlapDepth: false,

  summary(joint) {
    return `${joint.sourcePartId || 'Unset'} → ${joint.targetPartId || 'Unset'} · ${joint.parameters.count || '?'} dowels`;
  },

  buildGeometry(joint, context, helpers) {
    const intervals = helpers.buildRepeatedIntervals(context, joint.parameters, 'dowelDiameter');
    if (!intervals?.length) {
      return { error: 'The dowel pattern could not be laid out on the selected overlap.' };
    }

    const fabricationState = helpers.getJointFabricationState(context);
    const sourceCenters = helpers.buildHoleCenters(context.sourceEdge, intervals, joint.parameters.edgeOffset);
    const targetCenters = helpers.buildHoleCenters(context.targetEdge, intervals, joint.parameters.edgeOffset);
    const holeDiameter = (joint.parameters.dowelDiameter || 0) + (joint.tolerance?.clearance || 0);

    return {
      featureEntities: [
        ...sourceCenters.map((center, index) =>
          helpers.createCircleFeatureEntity(
            joint,
            context.sourcePart,
            'source',
            center,
            holeDiameter,
            joint.parameters.depth,
            'dowel-hole',
            fabricationState,
            index,
          ),
        ),
        ...targetCenters.map((center, index) =>
          helpers.createCircleFeatureEntity(
            joint,
            context.targetPart,
            'target',
            center,
            holeDiameter,
            joint.parameters.depth,
            'dowel-hole',
            fabricationState,
            index,
          ),
        ),
      ],
      occupiedRegions: [
        ...helpers.buildOccupiedRegions(joint, context.sourcePart.id, context.sourceEdge.edgeKey, intervals),
        ...helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, intervals),
      ],
    };
  },
};
