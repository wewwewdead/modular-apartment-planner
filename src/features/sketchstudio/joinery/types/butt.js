import { toFiniteNumber } from '../jointDefaults';

export default {
  type: 'butt',
  label: 'Butt Joint',
  description: 'Face-to-edge or edge-to-edge assembly metadata with no additional cut geometry.',
  fabrication: { process: 'assembly', operationKind: 'butt', hardware: null },
  minThickness: 3,
  strength: 'low',
  difficulty: 'easy',
  cncFriendly: false,
  materials: ['plywood', 'mdf', 'lumber', 'metal', 'acrylic'],

  normalizeParameters(parameters = {}) {
    return {
      offset: toFiniteNumber(parameters.offset, 0),
    };
  },

  computeDefaults() {
    return this.normalizeParameters({ offset: 0 });
  },

  validate() {
    // Butt joints have no type-specific validation rules.
  },

  buildGeometry(joint, context, helpers) {
    return {
      occupiedRegions: [
        ...helpers.buildOccupiedRegions(joint, context.sourcePart.id, context.sourceEdge.edgeKey, [context.overlap]),
        ...helpers.buildOccupiedRegions(joint, context.targetPart.id, context.targetEdge.edgeKey, [context.overlap]),
      ],
    };
  },
};
