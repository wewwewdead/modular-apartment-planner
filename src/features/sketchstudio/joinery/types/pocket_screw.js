import {
  JOINERY_TOUCH_TOLERANCE,
  roundJoineryValue,
  toPositiveNumber,
  toPositiveInteger,
  toNonNegativeNumber,
} from '../jointDefaults';

const DEFAULT_DRAFT_DEPTH = 12;
const DEFAULT_POCKET_DIAMETER = 9.5;
const DEFAULT_PILOT_DIAMETER = 3.5;
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
  type: 'pocket_screw',
  label: 'Pocket Screw Joint',
  description: 'Pocket bores in the source part with matching pilot drilling in the target part.',
  fabrication: { process: 'drilling', operationKind: 'pocket-screw', hardware: { kind: 'pocket-screw' } },
  minThickness: 12,
  strength: 'medium',
  difficulty: 'easy',
  cncFriendly: false,
  materials: ['plywood', 'mdf', 'lumber'],

  normalizeParameters(parameters = {}) {
    return {
      pocketDiameter: toPositiveNumber(parameters.pocketDiameter),
      pilotDiameter: toPositiveNumber(parameters.pilotDiameter),
      count: toPositiveInteger(parameters.count),
      spacing: toNonNegativeNumber(parameters.spacing, 0),
      edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
      pocketOffset: toNonNegativeNumber(parameters.pocketOffset, 0),
      depth: toPositiveNumber(parameters.depth),
    };
  },

  computeDefaults(context) {
    const overlapLength = context?.overlap?.length || 0;
    const sourceThickness = context?.sourceThickness ?? null;
    const minThicknessValue = context?.minThickness ?? null;
    const count = computeRepeatCount(
      overlapLength,
      Math.max((minThicknessValue || DEFAULT_DRAFT_DEPTH) * 5, 110),
      1,
      4,
    );
    const edgeOffset = computeDefaultEdgeMargin(context, 8);
    const usableLength = Math.max(0, overlapLength - edgeOffset * 2);
    const spacing = count > 1 ? usableLength / (count - 1) : 0;

    return this.normalizeParameters({
      pocketDiameter: DEFAULT_POCKET_DIAMETER,
      pilotDiameter: DEFAULT_PILOT_DIAMETER,
      count,
      spacing,
      edgeOffset,
      pocketOffset: roundJoineryValue((sourceThickness || minThicknessValue || 12) * 0.75),
      depth: roundJoineryValue((sourceThickness || minThicknessValue || 12) * 0.75),
    });
  },

  validate(joint, context, parameters, helpers) {
    const reasons = [];

    helpers.validatePositiveDimension(parameters, 'pocketDiameter', 'Pocket diameter', reasons);
    helpers.validatePositiveDimension(parameters, 'pilotDiameter', 'Pilot diameter', reasons);
    helpers.validatePositiveDimension(parameters, 'depth', 'Pocket depth', reasons);

    if (!Number.isInteger(parameters.count) || parameters.count < 1) {
      reasons.push('Pocket count must be an integer greater than zero.');
    }

    if (
      context.sourceThickness != null &&
      (parameters.depth || 0) > context.sourceThickness + JOINERY_TOUCH_TOLERANCE
    ) {
      reasons.push('Pocket depth exceeds the source material thickness.');
    }

    if (
      context.sourceThickness != null &&
      (parameters.pocketOffset || 0) > context.sourceThickness + JOINERY_TOUCH_TOLERANCE
    ) {
      reasons.push('Pocket offset exceeds the source material thickness.');
    }

    const pattern = helpers.buildRepeatedPatternResult(
      context,
      {
        ...parameters,
        pocketDiameter: Math.max(parameters.pocketDiameter || 0, parameters.pilotDiameter || 0),
      },
      'pocketDiameter',
    );
    if (pattern.error) {
      reasons.push(pattern.error);
    }

    return reasons;
  },

  buildGeometry(joint, context, helpers) {
    const layoutIntervals = helpers.buildRepeatedEdgeIntervalsRaw(context.overlap, {
      count: joint.parameters.count,
      width: Math.max(joint.parameters.pocketDiameter || 0, joint.parameters.pilotDiameter || 0),
      spacing: joint.parameters.spacing,
      edgeOffset: joint.parameters.edgeOffset,
    });

    if (!layoutIntervals?.length) {
      return { error: 'The pocket screw pattern could not be laid out on the selected overlap.' };
    }

    const fabricationState = helpers.getJointFabricationState(context);
    const sourceCenters = helpers.buildHoleCenters(context.sourceEdge, layoutIntervals, joint.parameters.pocketOffset);
    const targetCenters = helpers.buildHoleCenters(context.targetEdge, layoutIntervals, joint.parameters.edgeOffset);
    const pilotDepth =
      context.targetThickness != null
        ? Math.min(joint.parameters.depth || 0, context.targetThickness)
        : joint.parameters.depth || 0;

    return {
      featureEntities: [
        ...sourceCenters.map((center, index) =>
          helpers.createCircleFeatureEntity(
            joint,
            context.sourcePart,
            'source',
            center,
            joint.parameters.pocketDiameter,
            joint.parameters.depth,
            'pocket-bore',
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
            (joint.parameters.pilotDiameter || 0) + (joint.tolerance?.clearance || 0),
            pilotDepth,
            'pilot-hole',
            fabricationState,
            index,
          ),
        ),
      ],
      occupiedRegions: [
        ...helpers.buildOccupiedRegions(joint, context.sourcePart.id, context.sourceEdge.edgeKey, layoutIntervals),
        ...helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, layoutIntervals),
      ],
    };
  },
};
