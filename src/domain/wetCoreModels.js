import { DESIGN_CONFIDENCE } from './trustModels';

export const WET_FIXTURE_TYPES = Object.freeze(new Set(['kitchenTop', 'toilet', 'lavatory']));

export function createPlumbingShaft(options) {
  return {
    id: options.id,
    name: options.name || 'Wet-service shaft',
    origin: { x: options.origin.x, y: options.origin.y },
    width: options.width,
    depth: options.depth,
    servedFloorIds: [...(options.servedFloorIds || [])],
    maxFixtureDistance: options.maxFixtureDistance ?? 3000,
    fixtureRefs: (options.fixtureRefs || []).map((ref) => ({ ...ref })),
    generatedByServicesRealizationId: options.generatedByServicesRealizationId || null,
    generatedByTestFitId: options.generatedByTestFitId || null,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
  };
}

export function fixtureDistanceToShaft(fixture, shaft) {
  const dx = Math.max(Math.abs(fixture.x - shaft.origin.x) - shaft.width / 2, 0);
  const dy = Math.max(Math.abs(fixture.y - shaft.origin.y) - shaft.depth / 2, 0);
  return Math.hypot(dx, dy);
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'building_systems',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function deriveWetCoreCoordination(project) {
  const shafts = project.building?.systems?.plumbing?.shafts || [];
  const wetFixtures = (project.floors || []).flatMap((floor) =>
    (floor.fixtures || [])
      .filter((fixture) => WET_FIXTURE_TYPES.has(fixture.fixtureType))
      .map((fixture) => ({ floorId: floor.id, fixture })),
  );
  return {
    shaftCount: shafts.length,
    wetFixtureCount: wetFixtures.length,
    assignedFixtureCount: wetFixtures.filter(({ fixture }) => fixture.plumbingShaftId).length,
    unassignedFixtureCount: wetFixtures.filter(({ fixture }) => !fixture.plumbingShaftId).length,
  };
}

export function validateWetCoreCoordination(project) {
  const issues = [];
  const floors = project.floors || [];
  const floorIndex = new Map(floors.map((floor, index) => [floor.id, index]));
  const shafts = project.building?.systems?.plumbing?.shafts || [];
  const shaftById = new Map(shafts.map((shaft) => [shaft.id, shaft]));

  for (const shaft of shafts) {
    const indices = (shaft.servedFloorIds || []).map((id) => floorIndex.get(id));
    if (!indices.length || indices.some((index) => index == null)) {
      issues.push(
        issue(
          'SYSTEM.SHAFT_LEVEL_REFERENCE_INVALID',
          'error',
          `${shaft.name} must reference existing served levels.`,
          [{ type: 'plumbingShaft', id: shaft.id }],
          { servedFloorIds: shaft.servedFloorIds || [] },
          'relationship_check',
        ),
      );
    } else {
      const sorted = [...new Set(indices)].sort((a, b) => a - b);
      const continuous = sorted.every((index, position) => position === 0 || index === sorted[position - 1] + 1);
      if (!continuous) {
        issues.push(
          issue(
            'SYSTEM.SHAFT_VERTICAL_DISCONTINUITY',
            'error',
            `${shaft.name} skips an intermediate level.`,
            [{ type: 'plumbingShaft', id: shaft.id }],
            { servedFloorIds: shaft.servedFloorIds, orderedLevelIds: floors.map((floor) => floor.id) },
            'relationship_check',
          ),
        );
      }
    }
  }

  for (const floor of floors) {
    for (const fixture of floor.fixtures || []) {
      if (!WET_FIXTURE_TYPES.has(fixture.fixtureType)) continue;
      if (!fixture.plumbingShaftId) {
        issues.push(
          issue(
            'SYSTEM.WET_FIXTURE_UNASSIGNED',
            'warning',
            `${fixture.name || fixture.fixtureType} is not assigned to a wet-service shaft.`,
            [{ type: 'fixture', id: fixture.id }],
            { floorId: floor.id, fixtureType: fixture.fixtureType },
            'relationship_check',
          ),
        );
        continue;
      }
      const shaft = shaftById.get(fixture.plumbingShaftId);
      if (!shaft) {
        issues.push(
          issue(
            'SYSTEM.FIXTURE_SHAFT_REFERENCE_BROKEN',
            'error',
            'Fixture references a missing plumbing shaft.',
            [{ type: 'fixture', id: fixture.id }],
            { floorId: floor.id, plumbingShaftId: fixture.plumbingShaftId },
            'relationship_check',
          ),
        );
        continue;
      }
      if (!(shaft.servedFloorIds || []).includes(floor.id)) {
        issues.push(
          issue(
            'SYSTEM.FIXTURE_OUTSIDE_SHAFT_LEVELS',
            'error',
            'Fixture is assigned to a shaft that does not serve its level.',
            [
              { type: 'fixture', id: fixture.id },
              { type: 'plumbingShaft', id: shaft.id },
            ],
            { floorId: floor.id, servedFloorIds: shaft.servedFloorIds },
            'relationship_check',
          ),
        );
      }
      const distance = fixtureDistanceToShaft(fixture, shaft);
      if (distance > shaft.maxFixtureDistance) {
        issues.push(
          issue(
            'SYSTEM.FIXTURE_TOO_FAR_FROM_SHAFT',
            'warning',
            `Fixture is ${Math.round(distance)} mm from its shaft, beyond the configured planning distance.`,
            [
              { type: 'fixture', id: fixture.id },
              { type: 'plumbingShaft', id: shaft.id },
            ],
            { distance, configuredMaximum: shaft.maxFixtureDistance, floorId: floor.id },
          ),
        );
      }
    }
  }
  return issues;
}
