import {
  JOINERY_TOUCH_TOLERANCE,
  roundJoineryValue,
  toPositiveNumber,
  toPositiveInteger,
  toNonNegativeNumber,
} from '../jointDefaults';

const DEFAULT_DRAFT_DEPTH = 12;
const DEFAULT_TENON_DEPTH_FACTOR = 0.6;
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
  type: 'tab_slot',
  label: 'Tab-and-Slot',
  description: 'Repeated male tabs on the source edge and matching slots on the target edge.',
  fabrication: { process: 'milling', operationKind: 'tab-slot', hardware: null },
  minThickness: 6,
  strength: 'high',
  difficulty: 'medium',
  cncFriendly: true,
  materials: ['plywood', 'mdf', 'lumber'],

  normalizeParameters(parameters = {}) {
    return {
      count: toPositiveInteger(parameters.count),
      tabWidth: toPositiveNumber(parameters.tabWidth),
      spacing: toNonNegativeNumber(parameters.spacing, 0),
      edgeOffset: toNonNegativeNumber(parameters.edgeOffset, 0),
      depth: toPositiveNumber(parameters.depth),
    };
  },

  computeDefaults(context) {
    const overlapLength = context?.overlap?.length || 0;
    const targetThickness = context?.targetThickness ?? null;
    const minThicknessValue = context?.minThickness ?? null;
    const count = computeRepeatCount(overlapLength, Math.max((minThicknessValue || DEFAULT_DRAFT_DEPTH) * 3, 70), 1, 5);
    const edgeOffset = computeDefaultEdgeMargin(context, 6);
    const spacing = count > 1 ? computeDefaultEdgeMargin(context, 4) : 0;
    const usableLength = Math.max(0, overlapLength - edgeOffset * 2 - Math.max(0, count - 1) * spacing);
    const tabWidth = count > 0 ? usableLength / count : usableLength;

    return this.normalizeParameters({
      count,
      tabWidth,
      spacing,
      edgeOffset,
      depth: targetThickness ? targetThickness * DEFAULT_TENON_DEPTH_FACTOR : DEFAULT_DRAFT_DEPTH,
    });
  },

  validate(joint, context, parameters, helpers) {
    const reasons = [];

    helpers.validatePositiveDimension(parameters, 'tabWidth', 'Tab width', reasons);
    helpers.validatePositiveDimension(parameters, 'depth', 'Tab depth', reasons);

    if (!Number.isInteger(parameters.count) || parameters.count < 1) {
      reasons.push('Tab count must be an integer greater than zero.');
    }

    if (
      context.targetThickness != null &&
      (parameters.depth || 0) > context.targetThickness + JOINERY_TOUCH_TOLERANCE
    ) {
      reasons.push('Tab depth exceeds the target material thickness.');
    }

    const pattern = helpers.buildRepeatedPatternResult(context, parameters, 'tabWidth');
    if (pattern.error) {
      reasons.push(pattern.error);
    }

    return reasons;
  },

  buildGeometry(joint, context, helpers) {
    const intervals = helpers.buildRepeatedIntervals(context, joint.parameters, 'tabWidth');
    if (!intervals?.length) {
      return { error: 'The tab-and-slot pattern could not be laid out on the selected overlap.' };
    }

    const maleIntervals = intervals.map((interval) => helpers.shrinkInterval(interval, joint.tolerance?.clearance));
    const femaleIntervals = intervals.map((interval) =>
      helpers.expandInterval(interval, joint.tolerance?.clearance, context.overlap),
    );
    const overlapDrivenSourceReliefIntervals =
      context.contactKind === 'penetration' ? helpers.buildComplementIntervals(context.overlap, maleIntervals) : null;
    const sourceModifications =
      context.contactKind === 'penetration'
        ? overlapDrivenSourceReliefIntervals.map((reliefInterval) => ({
            ...reliefInterval,
            depth: joint.parameters.depth,
            mode: 'cut',
          }))
        : maleIntervals.map((interval) => ({
            ...interval,
            depth: joint.parameters.depth,
            mode: 'add',
          }));

    return {
      partModifications: [
        ...(sourceModifications.length
          ? [
              {
                partId: context.sourcePart.id,
                edgeKey: context.sourceEdge.edgeKey,
                modifications: sourceModifications,
              },
            ]
          : []),
        {
          partId: context.targetPart.id,
          edgeKey: context.targetEdge.edgeKey,
          modifications: femaleIntervals.map((interval) => ({
            ...interval,
            depth: joint.parameters.depth,
            mode: 'cut',
          })),
        },
      ],
      occupiedRegions: [
        ...helpers.buildOccupiedRegions(
          joint,
          context.sourcePart.id,
          context.sourceEdge.edgeKey,
          context.contactKind === 'penetration' ? [context.overlap] : maleIntervals,
        ),
        ...helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, femaleIntervals),
      ],
    };
  },
};
