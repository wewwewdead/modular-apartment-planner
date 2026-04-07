import { JOINERY_TOUCH_TOLERANCE, toPositiveNumber, toNonNegativeNumber, toFiniteNumber } from '../jointDefaults';

const DEFAULT_DRAFT_DEPTH = 12;
const DEFAULT_TENON_DEPTH_FACTOR = 0.6;

export default {
  type: 'mortise_tenon',
  label: 'Mortise and Tenon',
  description: 'A male tenon on the source edge and a matching female mortise in the target edge.',
  fabrication: { process: 'milling', operationKind: 'tenon-mortise', hardware: null },
  minThickness: 12,
  strength: 'very-high',
  difficulty: 'hard',
  cncFriendly: true,
  materials: ['lumber'],

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
    const minThicknessValue = context?.minThickness ?? null;

    return this.normalizeParameters({
      width: overlapLength ? Math.max((minThicknessValue || DEFAULT_DRAFT_DEPTH) * 1.5, overlapLength * 0.6) : null,
      depth: targetThickness ? targetThickness * DEFAULT_TENON_DEPTH_FACTOR : DEFAULT_DRAFT_DEPTH,
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

  supportsAutoOverlapDepth: true,

  summary(joint) {
    const widthWithOffset = (joint.parameters.width || 0) + (joint.parameters.offset || 0) || '?';
    return `${joint.sourcePartId || 'Unset'} → ${joint.targetPartId || 'Unset'} · ${widthWithOffset}mm × ${joint.parameters.depth || '?'}mm`;
  },

  buildGeometry(joint, context, helpers) {
    const { nominalInterval, femaleInterval } = helpers.buildFemaleClearanceIntervals(joint, context);
    if (!nominalInterval || !femaleInterval) {
      return { error: 'Mortise and tenon dimensions do not fit within the available overlap.' };
    }

    const maleInterval = nominalInterval;
    const overlapDrivenSourceReliefIntervals =
      context.contactKind === 'penetration' ? helpers.buildComplementIntervals(context.overlap, [maleInterval]) : null;
    const sourceModifications =
      context.contactKind === 'penetration'
        ? overlapDrivenSourceReliefIntervals.map((reliefInterval) => ({
            ...reliefInterval,
            depth: joint.parameters.depth,
            mode: 'cut',
          }))
        : [
            {
              ...maleInterval,
              depth: joint.parameters.depth,
              mode: 'add',
            },
          ];

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
          modifications: [
            {
              ...femaleInterval,
              depth: joint.parameters.depth,
              mode: 'cut',
            },
          ],
        },
      ],
      occupiedRegions: [
        ...helpers.buildOccupiedRegions(
          joint,
          context.sourcePart.id,
          context.sourceEdge.edgeKey,
          context.contactKind === 'penetration' ? [context.overlap] : [maleInterval],
        ),
        ...helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, [femaleInterval]),
      ],
    };
  },
};
