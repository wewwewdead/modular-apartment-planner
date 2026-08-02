import { deriveConceptualLoadPath } from './structuralCoordination';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_STRUCTURAL_REALIZATION_PROFILE = Object.freeze({
  id: 'kappa_small_rc_frame_realization_v1',
  columnWidth: 300,
  columnDepth: 300,
  beamWidth: 250,
  beamDepth: 400,
  slabSupportMode: 'generated_beams_and_existing_loadbearing_walls',
  foundationBasis: 'not_modeled_professional_design_required',
  source: 'configured_owner_structural_coordination_assumptions_not_capacity_design',
});

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createStructuralRealizationProfile(overrides = {}) {
  return {
    ...DEFAULT_STRUCTURAL_REALIZATION_PROFILE,
    ...overrides,
    columnWidth: finitePositive(overrides.columnWidth, DEFAULT_STRUCTURAL_REALIZATION_PROFILE.columnWidth),
    columnDepth: finitePositive(overrides.columnDepth, DEFAULT_STRUCTURAL_REALIZATION_PROFILE.columnDepth),
    beamWidth: finitePositive(overrides.beamWidth, DEFAULT_STRUCTURAL_REALIZATION_PROFILE.beamWidth),
    beamDepth: finitePositive(overrides.beamDepth, DEFAULT_STRUCTURAL_REALIZATION_PROFILE.beamDepth),
    slabSupportMode: DEFAULT_STRUCTURAL_REALIZATION_PROFILE.slabSupportMode,
    foundationBasis: DEFAULT_STRUCTURAL_REALIZATION_PROFILE.foundationBasis,
    source: DEFAULT_STRUCTURAL_REALIZATION_PROFILE.source,
  };
}

export function createStructuralRealizationState(overrides = {}) {
  return {
    status: overrides.status || 'not_realized',
    sourceTestFitId: overrides.sourceTestFitId || null,
    sourceApartmentDesignSignature: overrides.sourceApartmentDesignSignature || '',
    inputSignature: overrides.inputSignature || '',
    generatedEntityRefs: Object.fromEntries(
      ['columnStacks', 'columns', 'beams'].map((collection) => [
        collection,
        [...(overrides.generatedEntityRefs?.[collection] || [])],
      ]),
    ),
    skippedBeamSegments: (overrides.skippedBeamSegments || []).map((entry) => ({
      ...entry,
      openingIds: [...(entry.openingIds || [])],
    })),
    foundationStatus: overrides.foundationStatus || 'not_modeled',
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

export function structuralRealizationInputSignature(
  project,
  profile = createStructuralRealizationProfile(project?.building?.systems?.structural?.realizationProfile),
) {
  const building = project?.building || {};
  const option = (building.testFitOptions || []).find((entry) => entry.id === building.acceptedTestFitId);
  const grid = (building.systems?.structural?.gridSystems || []).find((entry) => entry.id === option?.proposedGrid?.id);
  return hashValue({
    acceptedTestFitId: option?.id || null,
    testFitInputSignature: option?.inputSignature || null,
    apartmentDesign: {
      status: building.apartmentDesign?.status || 'not_detailed',
      inputSignature: building.apartmentDesign?.inputSignature || '',
    },
    grid: grid ? { id: grid.id, origin: grid.origin, rotation: grid.rotation, axes: grid.axes } : null,
    floors: (project?.floors || []).map((floor) => ({
      id: floor.id,
      elevation: floor.elevation,
      floorToFloorHeight: floor.floorToFloorHeight,
      slabs: (floor.slabs || []).map((slab) => ({
        id: slab.id,
        boundaryPoints: slab.boundaryPoints,
        openings: (slab.openings || [])
          .filter((opening) => !opening.generatedByServicesRealizationId)
          .map((opening) => ({
            id: opening.id,
            purpose: opening.purpose,
            boundaryPoints: opening.boundaryPoints,
          })),
      })),
    })),
    profile,
  });
}

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'structural_coordination',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function deriveStructuralRealization(project) {
  const structural = project?.building?.systems?.structural || {};
  const profile = createStructuralRealizationProfile(structural.realizationProfile);
  const state = createStructuralRealizationState(structural.realization);
  const currentInputSignature = structuralRealizationInputSignature(project, profile);
  const floorIds = (project?.floors || []).map((floor) => floor.id);
  const columns = new Map();
  const beams = new Map();
  for (const floor of project?.floors || []) {
    for (const column of floor.columns || []) columns.set(column.id, { floorId: floor.id, entity: column });
    for (const beam of floor.beams || []) beams.set(beam.id, { floorId: floor.id, entity: beam });
  }
  const stacks = new Map((structural.columnStacks || []).map((stack) => [stack.id, stack]));
  const generatedStacks = state.generatedEntityRefs.columnStacks.map((id) => stacks.get(id)).filter(Boolean);
  const generatedColumns = state.generatedEntityRefs.columns.map((id) => columns.get(id)).filter(Boolean);
  const generatedBeams = state.generatedEntityRefs.beams.map((id) => beams.get(id)).filter(Boolean);
  const continuousStackCount = generatedStacks.filter((stack) => {
    const served = new Set((stack.columnRefs || []).map((ref) => ref.floorId));
    return floorIds.every((floorId) => served.has(floorId));
  }).length;
  const supportedBeamCount = generatedBeams.filter(({ floorId, entity }) => {
    const floor = (project.floors || []).find((entry) => entry.id === floorId);
    const ids = new Set((floor?.columns || []).map((column) => column.id));
    return [entity.startRef, entity.endRef].every((ref) => ref?.kind === 'column' && ids.has(ref.id));
  }).length;
  const slabs = (project?.floors || []).flatMap((floor) =>
    (floor.slabs || []).map((slab) => ({ floorId: floor.id, slab })),
  );
  const coordinatedSlabCount = slabs.filter(({ slab }) => (slab.supportRefs || []).length >= 2).length;
  const loadPath = deriveConceptualLoadPath(project);
  return {
    profile,
    state,
    currentInputSignature,
    outOfDate: state.status === 'realized' && state.inputSignature !== currentInputSignature,
    gridId:
      (project?.building?.testFitOptions || []).find((entry) => entry.id === project?.building?.acceptedTestFitId)
        ?.proposedGrid?.id || null,
    generatedStackCount: generatedStacks.length,
    generatedColumnCount: generatedColumns.length,
    generatedBeamCount: generatedBeams.length,
    continuousStackCount,
    supportedBeamCount,
    slabCount: slabs.length,
    coordinatedSlabCount,
    loadPath,
    skippedBeamSegments: state.skippedBeamSegments,
    foundationStatus: state.foundationStatus,
    professionalReviewRequired: true,
  };
}

export function validateStructuralRealization(project) {
  const building = project?.building || {};
  const derived = deriveStructuralRealization(project);
  const issues = [];
  if (building.apartmentDesign?.status === 'detailed' && derived.state.status !== 'realized') {
    issues.push(
      issue(
        'STRUCT.REALIZATION_REQUIRED',
        'warning',
        'The accepted apartment design still has only a proposed structural grid and has not been realized as columns, beams, and slab supports.',
        [{ type: 'building', id: building.id }],
        { acceptedTestFitId: building.acceptedTestFitId, apartmentDesignStatus: building.apartmentDesign.status },
        'missing_coordination_geometry',
      ),
    );
    return issues;
  }
  if (derived.state.status !== 'realized') return issues;
  if (derived.state.sourceTestFitId !== building.acceptedTestFitId) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_SOURCE_MISMATCH',
        'error',
        'Structural realization references a different accepted test fit.',
        [{ type: 'building', id: building.id }],
        { sourceTestFitId: derived.state.sourceTestFitId, acceptedTestFitId: building.acceptedTestFitId },
        'verified_relationship',
      ),
    );
  }
  if (derived.state.sourceApartmentDesignSignature !== building.apartmentDesign?.inputSignature) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_APARTMENT_BASIS_MISMATCH',
        'error',
        'Structural realization references a different apartment-design basis.',
        [{ type: 'building', id: building.id }],
        {
          sourceApartmentDesignSignature: derived.state.sourceApartmentDesignSignature,
          currentApartmentDesignSignature: building.apartmentDesign?.inputSignature,
        },
        'verified_relationship',
      ),
    );
  }
  if (derived.outOfDate) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_OUTDATED',
        'warning',
        'Structural realization is out of date with its grid, apartment design, slab openings, levels, or modeled member assumptions.',
        [{ type: 'building', id: building.id }],
        { storedInputSignature: derived.state.inputSignature, currentInputSignature: derived.currentInputSignature },
      ),
    );
  }
  for (const [collection, actualCount] of [
    ['columnStacks', derived.generatedStackCount],
    ['columns', derived.generatedColumnCount],
    ['beams', derived.generatedBeamCount],
  ]) {
    const expectedCount = derived.state.generatedEntityRefs[collection].length;
    if (actualCount === expectedCount) continue;
    issues.push(
      issue(
        'STRUCT.REALIZATION_REFERENCE_BROKEN',
        'error',
        'Structural realization contains missing generated-entity references.',
        [{ type: 'structuralRealization', id: building.id }],
        { collection, expectedCount, actualCount },
        'verified_relationship',
      ),
    );
  }
  if (derived.continuousStackCount < derived.generatedStackCount) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_STACKS_INCOMPLETE',
        'error',
        'One or more generated column stacks do not continue through every modeled level.',
        [{ type: 'structuralRealization', id: building.id }],
        { generatedStackCount: derived.generatedStackCount, continuousStackCount: derived.continuousStackCount },
        'verified_relationship',
      ),
    );
  }
  if (derived.supportedBeamCount < derived.generatedBeamCount) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_BEAM_SUPPORTS_INCOMPLETE',
        'error',
        'One or more generated beams lack two valid same-level column supports.',
        [{ type: 'structuralRealization', id: building.id }],
        { generatedBeamCount: derived.generatedBeamCount, supportedBeamCount: derived.supportedBeamCount },
        'verified_relationship',
      ),
    );
  }
  if (derived.coordinatedSlabCount < derived.slabCount) {
    issues.push(
      issue(
        'STRUCT.REALIZATION_SLAB_SUPPORTS_INCOMPLETE',
        'warning',
        'One or more slab zones have fewer than two explicit support relationships.',
        [{ type: 'structuralRealization', id: building.id }],
        { slabCount: derived.slabCount, coordinatedSlabCount: derived.coordinatedSlabCount },
        'verified_relationship',
      ),
    );
  }
  for (const skipped of derived.skippedBeamSegments) {
    issues.push(
      issue(
        'STRUCT.OPENING_REQUIRES_FRAMING_RESOLUTION',
        'warning',
        'A proposed grid beam was omitted because it crossed a modeled slab opening; a structural engineer must resolve trimming and framing.',
        [{ type: 'floor', id: skipped.floorId }],
        skipped,
        'verified_geometry',
      ),
    );
  }
  issues.push(
    issue(
      'STRUCT.FOUNDATION_NOT_MODELED',
      'warning',
      'Column stacks stop at the lowest modeled level; foundations, soil capacity, and ground support are not modeled.',
      [{ type: 'building', id: building.id }],
      { foundationStatus: derived.foundationStatus, configuredBasis: derived.profile.foundationBasis },
      'missing_engineering_basis',
    ),
  );
  return issues;
}
