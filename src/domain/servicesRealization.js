import { routeLength } from './servicesCoordination';
import { DESIGN_CONFIDENCE } from './trustModels';
import { WET_FIXTURE_TYPES } from './wetCoreModels';

export const DEFAULT_SERVICES_REALIZATION_PROFILE = Object.freeze({
  id: 'lambda_small_apartment_systems_realization_v1',
  electricalRiserWidth: 450,
  electricalRiserDepth: 450,
  electricalOpeningClearance: 100,
  panelWidth: 800,
  panelDepth: 300,
  panelClearance: 600,
  waterPumpWidth: 800,
  waterPumpDepth: 800,
  waterTankWidth: 1200,
  waterTankDepth: 1200,
  outdoorUnitWidthPerUnit: 900,
  outdoorUnitDepth: 600,
  equipmentClearance: 600,
  minimumDrainSlopePercent: 1,
  electricalPointsPerUnit: 3,
  source: 'configured_owner_systems_coordination_assumptions_not_trade_design',
});

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createServicesRealizationProfile(overrides = {}) {
  const result = { ...DEFAULT_SERVICES_REALIZATION_PROFILE, ...overrides };
  for (const field of [
    'electricalRiserWidth',
    'electricalRiserDepth',
    'electricalOpeningClearance',
    'panelWidth',
    'panelDepth',
    'panelClearance',
    'waterPumpWidth',
    'waterPumpDepth',
    'waterTankWidth',
    'waterTankDepth',
    'outdoorUnitWidthPerUnit',
    'outdoorUnitDepth',
    'equipmentClearance',
    'minimumDrainSlopePercent',
  ])
    result[field] = positive(overrides[field], DEFAULT_SERVICES_REALIZATION_PROFILE[field]);
  result.electricalPointsPerUnit = Math.max(
    1,
    Math.round(
      positive(overrides.electricalPointsPerUnit, DEFAULT_SERVICES_REALIZATION_PROFILE.electricalPointsPerUnit),
    ),
  );
  result.source = DEFAULT_SERVICES_REALIZATION_PROFILE.source;
  return result;
}

const GENERATED_COLLECTIONS = Object.freeze([
  'drainageRoutes',
  'electricalRisers',
  'panelZones',
  'electricalPoints',
  'waterEquipmentZones',
  'outdoorUnitZones',
  'slabOpenings',
]);

export function createServicesRealizationState(overrides = {}) {
  return {
    status: overrides.status || 'not_realized',
    sourceTestFitId: overrides.sourceTestFitId || null,
    sourceApartmentDesignSignature: overrides.sourceApartmentDesignSignature || '',
    sourceStructuralRealizationSignature: overrides.sourceStructuralRealizationSignature || '',
    inputSignature: overrides.inputSignature || '',
    generatedEntityRefs: Object.fromEntries(
      GENERATED_COLLECTIONS.map((collection) => [collection, [...(overrides.generatedEntityRefs?.[collection] || [])]]),
    ),
    unresolvedItems: (overrides.unresolvedItems || []).map((entry) => ({ ...entry })),
    hydraulicDesignStatus: 'not_performed',
    electricalDesignStatus: 'not_performed',
    equipmentSizingStatus: 'not_performed',
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

function hashValue(value) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function servicesRealizationInputSignature(
  project,
  profile = createServicesRealizationProfile(project?.building?.systems?.realizationProfile),
) {
  const building = project?.building || {};
  const structural = building.systems?.structural || {};
  return hashValue({
    acceptedTestFitId: building.acceptedTestFitId || null,
    apartmentDesignSignature: building.apartmentDesign?.inputSignature || '',
    structuralRealizationSignature: structural.realization?.inputSignature || '',
    floors: (project?.floors || []).map((floor) => ({
      id: floor.id,
      elevation: floor.elevation,
      rooms: (floor.rooms || []).map((room) => ({
        id: room.id,
        spaceType: room.spaceType,
        unitInstanceId: room.unitInstanceId,
        points: room.points,
      })),
      fixtures: (floor.fixtures || []).map((fixture) => ({
        id: fixture.id,
        fixtureType: fixture.fixtureType,
        x: fixture.x,
        y: fixture.y,
        roomId: fixture.roomId,
        plumbingShaftId: fixture.plumbingShaftId,
      })),
      columns: (floor.columns || []).map((column) => ({
        id: column.id,
        x: column.x,
        y: column.y,
        width: column.width,
        depth: column.depth,
      })),
      beams: (floor.beams || []).map((beam) => ({
        id: beam.id,
        startRef: beam.startRef,
        endRef: beam.endRef,
        width: beam.width,
        depth: beam.depth,
      })),
      slabs: (floor.slabs || []).map((slab) => ({
        id: slab.id,
        boundaryPoints: slab.boundaryPoints,
        openings: (slab.openings || [])
          .filter((opening) => !opening.generatedByServicesRealizationId)
          .map((opening) => ({ id: opening.id, purpose: opening.purpose, boundaryPoints: opening.boundaryPoints })),
      })),
    })),
    shafts: (building.systems?.plumbing?.shafts || []).map((shaft) => ({
      id: shaft.id,
      origin: shaft.origin,
      width: shaft.width,
      depth: shaft.depth,
      servedFloorIds: shaft.servedFloorIds,
    })),
    unitInstances: (building.unitInstances || []).map((instance) => ({
      id: instance.id,
      typeId: instance.typeId,
      floorId: instance.floorId,
      roomIds: instance.roomIds,
    })),
    profile,
  });
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
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

export function deriveServicesRealization(project) {
  const systems = project?.building?.systems || {};
  const profile = createServicesRealizationProfile(systems.realizationProfile);
  const state = createServicesRealizationState(systems.realization);
  const refs = state.generatedEntityRefs;
  const plumbing = systems.plumbing || {};
  const electrical = systems.electrical || {};
  const water = systems.water || {};
  const mechanical = systems.mechanical || {};
  const openingIds = new Set(
    (project?.floors || []).flatMap((floor) =>
      (floor.slabs || []).flatMap((slab) => (slab.openings || []).map((opening) => opening.id)),
    ),
  );
  const actual = {
    drainageRoutes: refs.drainageRoutes.filter((id) => (plumbing.drainageRoutes || []).some((entry) => entry.id === id))
      .length,
    electricalRisers: refs.electricalRisers.filter((id) =>
      (electrical.riserZones || []).some((entry) => entry.id === id),
    ).length,
    panelZones: refs.panelZones.filter((id) => (electrical.panelZones || []).some((entry) => entry.id === id)).length,
    electricalPoints: refs.electricalPoints.filter((id) => (electrical.points || []).some((entry) => entry.id === id))
      .length,
    waterEquipmentZones: refs.waterEquipmentZones.filter((id) =>
      (water.equipmentZones || []).some((entry) => entry.id === id),
    ).length,
    outdoorUnitZones: refs.outdoorUnitZones.filter((id) =>
      (mechanical.outdoorUnitZones || []).some((entry) => entry.id === id),
    ).length,
    slabOpenings: refs.slabOpenings.filter((id) => openingIds.has(id)).length,
  };
  const generatedRoutes = (plumbing.drainageRoutes || []).filter((entry) => refs.drainageRoutes.includes(entry.id));
  return {
    profile,
    state,
    currentInputSignature: servicesRealizationInputSignature(project, profile),
    outOfDate:
      state.status === 'realized' && state.inputSignature !== servicesRealizationInputSignature(project, profile),
    actualEntityCounts: actual,
    expectedEntityCounts: Object.fromEntries(Object.entries(refs).map(([key, ids]) => [key, ids.length])),
    totalDrainagePlanningLength: generatedRoutes.reduce((total, route) => total + routeLength(route.points), 0),
    unresolvedItems: state.unresolvedItems,
    professionalReviewRequired: true,
  };
}

export function validateServicesRealization(project) {
  const building = project?.building || {};
  const structural = building.systems?.structural || {};
  const derived = deriveServicesRealization(project);
  const issues = [];
  if (structural.realization?.status === 'realized' && derived.state.status !== 'realized') {
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_REQUIRED',
        'warning',
        'The coordinated structural basis has not yet been realized as simplified building-system routes, risers, points, equipment reservations, and penetrations.',
        [{ type: 'building', id: building.id }],
        { structuralRealizationStatus: structural.realization.status },
        'missing_coordination_geometry',
      ),
    );
    return issues;
  }
  if (derived.state.status !== 'realized') return issues;
  if (derived.state.sourceTestFitId !== building.acceptedTestFitId)
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_SOURCE_MISMATCH',
        'error',
        'Systems realization references a different accepted test fit.',
        [{ type: 'building', id: building.id }],
        { sourceTestFitId: derived.state.sourceTestFitId, acceptedTestFitId: building.acceptedTestFitId },
        'verified_relationship',
      ),
    );
  if (derived.state.sourceApartmentDesignSignature !== building.apartmentDesign?.inputSignature)
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_APARTMENT_BASIS_MISMATCH',
        'error',
        'Systems realization references a different apartment-design basis.',
        [{ type: 'building', id: building.id }],
        {
          sourceApartmentDesignSignature: derived.state.sourceApartmentDesignSignature,
          currentApartmentDesignSignature: building.apartmentDesign?.inputSignature,
        },
        'verified_relationship',
      ),
    );
  if (derived.state.sourceStructuralRealizationSignature !== structural.realization?.inputSignature)
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_STRUCTURAL_BASIS_MISMATCH',
        'error',
        'Systems realization references a different structural-realization basis.',
        [{ type: 'building', id: building.id }],
        {
          sourceStructuralRealizationSignature: derived.state.sourceStructuralRealizationSignature,
          currentStructuralRealizationSignature: structural.realization?.inputSignature,
        },
        'verified_relationship',
      ),
    );
  if (derived.outOfDate)
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_OUTDATED',
        'warning',
        'Systems realization is out of date with the apartments, structural frame, shafts, fixtures, levels, or configured assumptions.',
        [{ type: 'building', id: building.id }],
        { storedInputSignature: derived.state.inputSignature, currentInputSignature: derived.currentInputSignature },
      ),
    );
  for (const [collection, expected] of Object.entries(derived.expectedEntityCounts)) {
    const actual = derived.actualEntityCounts[collection];
    if (actual === expected) continue;
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_REFERENCE_BROKEN',
        'error',
        'Systems realization contains missing generated-entity references.',
        [{ type: 'servicesRealization', id: building.id }],
        { collection, expected, actual },
        'verified_relationship',
      ),
    );
  }
  for (const unresolved of derived.unresolvedItems)
    issues.push(
      issue(
        'SYSTEMS.REALIZATION_UNRESOLVED',
        'warning',
        unresolved.message || 'A building-system coordination item requires professional resolution.',
        [{ type: 'servicesRealization', id: building.id }],
        unresolved,
        'verified_geometry',
      ),
    );
  const generatedRoutes = (building.systems?.plumbing?.drainageRoutes || []).filter((route) =>
    derived.state.generatedEntityRefs.drainageRoutes.includes(route.id),
  );
  const routedFixtureIds = new Set(generatedRoutes.map((route) => route.targetFixtureId).filter(Boolean));
  for (const floor of project?.floors || []) {
    for (const fixture of (floor.fixtures || []).filter(
      (entry) => WET_FIXTURE_TYPES.has(entry.fixtureType) && entry.plumbingShaftId,
    )) {
      if (routedFixtureIds.has(fixture.id)) continue;
      issues.push(
        issue(
          'SYSTEMS.WET_FIXTURE_ROUTE_MISSING',
          'error',
          'An assigned wet fixture has no realized branch-drainage relationship.',
          [{ type: 'fixture', id: fixture.id }],
          { floorId: floor.id, plumbingShaftId: fixture.plumbingShaftId },
          'verified_relationship',
        ),
      );
    }
  }
  return issues;
}
