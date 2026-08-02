import { generateId } from './ids';
import { createSpaceProgram } from './apartmentProgram';
import { createQuantityProfile } from './quantityTakeoff';
import { DESIGN_CONFIDENCE } from './trustModels';
import { createDesignAssumption, createDocumentationModel } from './professionalHandoff';
import { createParkingPlan } from './siteAccessModels';
import {
  createElectricalPoint,
  createEquipmentCoordinationProfile,
  createEquipmentZone,
} from './equipmentCoordination';
import { createTestFitOption, createTestFitProfile } from './testFitModels';
import { createApartmentDesignProfile, createApartmentDesignState } from './apartmentDesign';
import { createStructuralRealizationProfile, createStructuralRealizationState } from './structuralRealization';
import { createServicesRealizationProfile, createServicesRealizationState } from './servicesRealization';
import { createCostRealizationProfile, createCostRealizationState } from './costRealization';
import { createDocumentationRealizationProfile, createDocumentationRealizationState } from './documentationRealization';
import { createProfessionalExchangeProfile, createProfessionalExchangeState } from './professionalExchange';

export { DESIGN_CONFIDENCE };

export const DEFAULT_JURISDICTION = Object.freeze({
  countryCode: 'PH',
  countryName: 'Philippines',
  unitSystem: 'metric',
});

function stableProjectId(projectId, suffix) {
  return `${projectId || 'project'}_${suffix}`;
}

function createSystem(projectId, kind, overrides = {}) {
  return {
    id: stableProjectId(projectId, `${kind}_system`),
    kind,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    ...overrides,
  };
}

export function createStructuralGrid(name = 'Primary Grid', options = {}) {
  return {
    id: options.id ?? generateId('grid'),
    name,
    rotation: options.rotation ?? 0,
    origin: options.origin ? { ...options.origin } : { x: 0, y: 0 },
    axes: (options.axes || []).map((axis) => ({ ...axis })),
  };
}

export function createGridAxis(label, orientation, offset, options = {}) {
  return {
    id: options.id ?? generateId('axis'),
    label,
    orientation,
    offset,
  };
}

export function createColumnStack(origin, options = {}) {
  return {
    id: options.id ?? generateId('colstack'),
    name: options.name ?? '',
    origin: { x: origin.x, y: origin.y },
    gridIntersection: options.gridIntersection ? { ...options.gridIntersection } : null,
    familyId: options.familyId ?? null,
    columnRefs: (options.columnRefs || []).map((ref) => ({ ...ref })),
    confidence: DESIGN_CONFIDENCE.MODELED,
  };
}

/** Resolve a stored grid intersection into world coordinates. */
export function resolveGridIntersection(gridSystems = [], intersection) {
  if (!intersection?.gridId || !intersection.xAxisId || !intersection.yAxisId) return null;
  const grid = gridSystems.find((entry) => entry.id === intersection.gridId);
  if (!grid) return null;
  const xAxis = (grid.axes || []).find((axis) => axis.id === intersection.xAxisId && axis.orientation === 'vertical');
  const yAxis = (grid.axes || []).find((axis) => axis.id === intersection.yAxisId && axis.orientation === 'horizontal');
  if (!xAxis || !yAxis) return null;

  const radians = ((grid.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: grid.origin.x + xAxis.offset * cosine - yAxis.offset * sine,
    y: grid.origin.y + xAxis.offset * sine + yAxis.offset * cosine,
  };
}

export function createCanonicalBuilding(projectId, floors = [], overrides = {}) {
  const { structural: structuralOverrides, ...systemOverrides } = overrides.systems || {};
  const structural = createSystem(projectId, 'structural', {
    strategy: 'reinforced_concrete_frame',
    gridSystems: [],
    columnStacks: [],
    ...structuralOverrides,
    realizationProfile: createStructuralRealizationProfile(structuralOverrides?.realizationProfile),
    realization: createStructuralRealizationState(structuralOverrides?.realization),
  });

  return {
    id: stableProjectId(projectId, 'building'),
    name: overrides.name ?? 'Apartment Building',
    use: 'residential_apartment',
    jurisdiction: { ...DEFAULT_JURISDICTION, ...overrides.jurisdiction },
    brief: {
      projectType: 'apartment_or_boarding_house',
      targetStoreys: null,
      targetUnitCount: null,
      targetBudget: null,
      currency: 'PHP',
      accessibilityRequirements: '',
      roofType: '',
      ...overrides.brief,
    },
    site: {
      boundaryId: stableProjectId(projectId, 'property_boundary'),
      boundary: [],
      northAngle: 0,
      roadEdges: [],
      edgeSetbacks: [],
      setbacks: { front: null, rear: null, left: null, right: null },
      easements: [],
      buildableEnvelope: [],
      lotSetup: null,
      ...overrides.site,
      parkingPlan: createParkingPlan(overrides.site?.parkingPlan),
    },
    levelIds: floors.map((floor) => floor.id),
    spaceProgram: createSpaceProgram(overrides.spaceProgram),
    unitTypes: [],
    unitInstances: [],
    testFitProfile: createTestFitProfile(overrides.testFitProfile),
    testFitOptions: (overrides.testFitOptions || []).filter((entry) => entry?.id).map(createTestFitOption),
    selectedTestFitId: overrides.selectedTestFitId || null,
    acceptedTestFitId: overrides.acceptedTestFitId || null,
    apartmentDesignProfile: createApartmentDesignProfile(overrides.apartmentDesignProfile),
    apartmentDesign: createApartmentDesignState(overrides.apartmentDesign),
    quantityProfile: createQuantityProfile(overrides.quantityProfile),
    costRealizationProfile: createCostRealizationProfile(overrides.costRealizationProfile),
    costRealization: createCostRealizationState(overrides.costRealization),
    documentationRealizationProfile: createDocumentationRealizationProfile(overrides.documentationRealizationProfile),
    documentationRealization: createDocumentationRealizationState(overrides.documentationRealization),
    professionalExchangeProfile: createProfessionalExchangeProfile(overrides.professionalExchangeProfile),
    professionalExchange: createProfessionalExchangeState(overrides.professionalExchange),
    systems: {
      plumbing: createSystem(projectId, 'plumbing', { shafts: [], wetZones: [], drainageRoutes: [] }),
      electrical: createSystem(projectId, 'electrical', { riserZones: [], panelZones: [], points: [] }),
      water: createSystem(projectId, 'water', { equipmentZones: [] }),
      mechanical: createSystem(projectId, 'mechanical', { outdoorUnitZones: [] }),
      envelope: createSystem(projectId, 'envelope', { ventilationZones: [] }),
      egress: createSystem(projectId, 'egress', { exits: [], routes: [] }),
      coordinationProfile: {},
      ...systemOverrides,
      realizationProfile: createServicesRealizationProfile(systemOverrides.realizationProfile),
      realization: createServicesRealizationState(systemOverrides.realization),
      equipmentCoordinationProfile: createEquipmentCoordinationProfile(systemOverrides.equipmentCoordinationProfile),
      structural,
    },
    assumptions: (overrides.assumptions || []).filter((entry) => entry?.id).map(createDesignAssumption),
    documentation: createDocumentationModel(overrides.documentation),
  };
}

function compareFloorOrder(floorOrder, a, b) {
  return (
    (floorOrder.get(a.floorId) ?? Number.MAX_SAFE_INTEGER) - (floorOrder.get(b.floorId) ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * Synchronize relationship indexes that are persisted for portability but
 * derived from authoritative entity references. A column's stackId is the
 * source of truth; columnStacks[*].columnRefs is the reverse index.
 */
export function syncCanonicalBuilding(project) {
  if (!project?.building) return project;

  const floorOrder = new Map((project.floors || []).map((floor, index) => [floor.id, index]));
  const existingStacks = new Map(
    (project.building.systems?.structural?.columnStacks || []).map((stack) => [stack.id, stack]),
  );
  const refsByStack = new Map();
  const roomIdsByUnitInstance = new Map();
  const fixtureRefsByShaft = new Map();

  for (const floor of project.floors || []) {
    for (const column of floor.columns || []) {
      if (!column.stackId) continue;
      const refs = refsByStack.get(column.stackId) || [];
      refs.push({ floorId: floor.id, columnId: column.id });
      refsByStack.set(column.stackId, refs);

      if (!existingStacks.has(column.stackId)) {
        existingStacks.set(column.stackId, createColumnStack(column, { id: column.stackId }));
      }
    }
    for (const room of floor.rooms || []) {
      if (!room.unitInstanceId) continue;
      const roomIds = roomIdsByUnitInstance.get(room.unitInstanceId) || [];
      roomIds.push(room.id);
      roomIdsByUnitInstance.set(room.unitInstanceId, roomIds);
    }
    for (const fixture of floor.fixtures || []) {
      if (!fixture.plumbingShaftId) continue;
      const refs = fixtureRefsByShaft.get(fixture.plumbingShaftId) || [];
      refs.push({ floorId: floor.id, fixtureId: fixture.id });
      fixtureRefsByShaft.set(fixture.plumbingShaftId, refs);
    }
  }

  const columnStacks = [...existingStacks.values()]
    .map((stack) => ({
      ...stack,
      columnRefs: (refsByStack.get(stack.id) || []).sort((a, b) => compareFloorOrder(floorOrder, a, b)),
    }))
    .filter((stack) => stack.columnRefs.length > 0 || stack.intent === 'planned');

  const structural = project.building.systems?.structural || createSystem(project.id, 'structural');
  const plumbing = project.building.systems?.plumbing || createSystem(project.id, 'plumbing');
  const electrical = project.building.systems?.electrical || createSystem(project.id, 'electrical');
  const water = project.building.systems?.water || createSystem(project.id, 'water');
  const mechanical = project.building.systems?.mechanical || createSystem(project.id, 'mechanical');
  const egress = project.building.systems?.egress || createSystem(project.id, 'egress');
  return {
    ...project,
    building: {
      ...project.building,
      levelIds: (project.floors || []).map((floor) => floor.id),
      spaceProgram: createSpaceProgram(project.building.spaceProgram),
      unitTypes: project.building.unitTypes || [],
      unitInstances: (project.building.unitInstances || []).map((instance) => ({
        ...instance,
        roomIds: roomIdsByUnitInstance.get(instance.id) || [],
      })),
      testFitProfile: createTestFitProfile(project.building.testFitProfile),
      testFitOptions: (project.building.testFitOptions || []).filter((entry) => entry?.id).map(createTestFitOption),
      selectedTestFitId: project.building.selectedTestFitId || null,
      acceptedTestFitId: project.building.acceptedTestFitId || null,
      apartmentDesignProfile: createApartmentDesignProfile(project.building.apartmentDesignProfile),
      apartmentDesign: createApartmentDesignState(project.building.apartmentDesign),
      quantityProfile: createQuantityProfile(project.building.quantityProfile),
      costRealizationProfile: createCostRealizationProfile(project.building.costRealizationProfile),
      costRealization: createCostRealizationState(project.building.costRealization),
      documentationRealizationProfile: createDocumentationRealizationProfile(
        project.building.documentationRealizationProfile,
      ),
      documentationRealization: createDocumentationRealizationState(project.building.documentationRealization),
      professionalExchangeProfile: createProfessionalExchangeProfile(project.building.professionalExchangeProfile),
      professionalExchange: createProfessionalExchangeState(project.building.professionalExchange),
      assumptions: (project.building.assumptions || []).filter((entry) => entry?.id).map(createDesignAssumption),
      documentation: createDocumentationModel(project.building.documentation),
      site: {
        ...project.building.site,
        parkingPlan: createParkingPlan(project.building.site?.parkingPlan),
      },
      systems: {
        ...project.building.systems,
        plumbing: {
          ...plumbing,
          wetZones: plumbing.wetZones || [],
          drainageRoutes: plumbing.drainageRoutes || [],
          shafts: (plumbing.shafts || []).map((shaft) => ({
            ...shaft,
            fixtureRefs: fixtureRefsByShaft.get(shaft.id) || [],
          })),
        },
        electrical: {
          ...electrical,
          riserZones: electrical.riserZones || [],
          panelZones: (electrical.panelZones || []).map(createEquipmentZone),
          points: (electrical.points || []).map(createElectricalPoint),
        },
        water: {
          ...water,
          equipmentZones: (water.equipmentZones || []).map(createEquipmentZone),
        },
        mechanical: {
          ...mechanical,
          outdoorUnitZones: (mechanical.outdoorUnitZones || []).map(createEquipmentZone),
        },
        egress: {
          ...egress,
          exits: egress.exits || [],
          routes: egress.routes || [],
        },
        coordinationProfile: project.building.systems?.coordinationProfile || {},
        realizationProfile: createServicesRealizationProfile(project.building.systems?.realizationProfile),
        realization: createServicesRealizationState(project.building.systems?.realization),
        equipmentCoordinationProfile: createEquipmentCoordinationProfile(
          project.building.systems?.equipmentCoordinationProfile,
        ),
        structural: {
          ...structural,
          columnStacks,
          realizationProfile: createStructuralRealizationProfile(structural.realizationProfile),
          realization: createStructuralRealizationState(structural.realization),
        },
      },
    },
  };
}

function migratedStackKey(column) {
  const namedKey = String(column.name || '')
    .trim()
    .toLowerCase();
  if (namedKey) return `name:${namedKey}`;
  return `position:${Math.round(column.x)}:${Math.round(column.y)}:${Math.round(column.width || 0)}:${Math.round(column.depth || 0)}`;
}

/** Backfill the canonical building graph without inventing engineering approval. */
export function migrateToCanonicalBuilding(project) {
  if (project.building) return syncCanonicalBuilding(project);

  const stackIdsByKey = new Map();
  const floors = (project.floors || []).map((floor) => ({
    ...floor,
    columns: (floor.columns || []).map((column) => {
      if (column.stackId) return column;
      const key = migratedStackKey(column);
      const stackId = stackIdsByKey.get(key) || stableProjectId(project.id, `column_stack_${stackIdsByKey.size + 1}`);
      stackIdsByKey.set(key, stackId);
      return { ...column, stackId };
    }),
    beams: (floor.beams || []).map((beam) => ({
      ...beam,
      startRef:
        beam.startRef?.columnId && !beam.startRef.id ? { kind: 'column', id: beam.startRef.columnId } : beam.startRef,
      endRef: beam.endRef?.columnId && !beam.endRef.id ? { kind: 'column', id: beam.endRef.columnId } : beam.endRef,
    })),
  }));

  return syncCanonicalBuilding({
    ...project,
    floors,
    building: createCanonicalBuilding(project.id, floors),
  });
}
