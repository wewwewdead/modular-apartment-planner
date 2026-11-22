/**
 * `syncCanonicalBuilding` keeps the identity of every part of the building it
 * did not change (docs/perf-pass-3.md D1.2).
 *
 * Two promises, each against an oracle:
 *   - what it hands back serialises byte for byte as the function did before
 *     it shared anything (the old body is kept below, verbatim, as the oracle),
 *     over the repo's fixtures and a spread of edits — a save must never look
 *     like an edit;
 *   - a part that came out the same is the very object it was given, so the
 *     3D preview's per-floor key, the lifecycle panel's seed keys and the plan
 *     overlays see an untouched slice as untouched.
 * The input is deep-frozen before every call: the sync must never write into
 * it (history entries alias the live project).
 */
import { describe, expect, it } from 'vitest';
import demoData from '@/pages/playground-demo.json';
import benchEnvelope from '../../scripts/fixtures/bench-ceiling-project.json';
import { deserializeProject } from '@/persistence/deserialize';
import { normalizeProjectEnvelope } from '@/persistence/projectEnvelope';
import { syncProjectStructures } from './projectStateHelpers';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createColumnStack, syncCanonicalBuilding } from './buildingModels';
import { createProject } from './models';
import { createSpaceProgram } from './apartmentProgram';
import { createQuantityProfile } from './quantityTakeoff';
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
import { DESIGN_CONFIDENCE } from './trustModels';

// ---------------------------------------------------------------------------
// The oracle: `syncCanonicalBuilding` as it was before D1.2, verbatim.

function legacyCreateSystem(projectId, kind, overrides = {}) {
  return {
    id: `${projectId || 'project'}_${kind}_system`,
    kind,
    confidence: DESIGN_CONFIDENCE.MODELED,
    professionalReviewRequired: true,
    ...overrides,
  };
}

function legacyCompareFloorOrder(floorOrder, a, b) {
  return (
    (floorOrder.get(a.floorId) ?? Number.MAX_SAFE_INTEGER) - (floorOrder.get(b.floorId) ?? Number.MAX_SAFE_INTEGER)
  );
}

function legacySyncCanonicalBuilding(project) {
  if (!project?.building) return project;

  const floorOrder = new Map((project.floors || []).map((floor, index) => [floor.id, index]));
  const existingStacks = new Map(
    (project.building.systems?.structural?.columnStacks || []).map((stack) => [stack.id, stack]),
  );
  const existingWallStacks = new Map(
    (project.building.systems?.structural?.wallStacks || []).map((stack) => [stack.id, stack]),
  );
  const refsByStack = new Map();
  const wallRefsByStack = new Map();
  const roomIdsByUnitInstance = new Map();
  const fixtureRefsByShaft = new Map();

  for (const floor of project.floors || []) {
    for (const wall of floor.walls || []) {
      if (!wall.stackId) continue;
      const refs = wallRefsByStack.get(wall.stackId) || [];
      refs.push({ floorId: floor.id, wallId: wall.id });
      wallRefsByStack.set(wall.stackId, refs);
      if (!existingWallStacks.has(wall.stackId)) existingWallStacks.set(wall.stackId, { id: wall.stackId });
    }
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
      columnRefs: (refsByStack.get(stack.id) || []).sort((a, b) => legacyCompareFloorOrder(floorOrder, a, b)),
    }))
    .filter((stack) => stack.columnRefs.length > 0 || stack.intent === 'planned');

  const wallStacks = [...existingWallStacks.values()]
    .map((stack) => ({
      ...stack,
      wallRefs: (wallRefsByStack.get(stack.id) || []).sort((a, b) => legacyCompareFloorOrder(floorOrder, a, b)),
    }))
    .filter((stack) => stack.wallRefs.length > 0);

  const structural = project.building.systems?.structural || legacyCreateSystem(project.id, 'structural');
  const plumbing = project.building.systems?.plumbing || legacyCreateSystem(project.id, 'plumbing');
  const electrical = project.building.systems?.electrical || legacyCreateSystem(project.id, 'electrical');
  const water = project.building.systems?.water || legacyCreateSystem(project.id, 'water');
  const mechanical = project.building.systems?.mechanical || legacyCreateSystem(project.id, 'mechanical');
  const egress = project.building.systems?.egress || legacyCreateSystem(project.id, 'egress');
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
        solarStudyTargets: (project.building.site?.solarStudyTargets || []).map((target) => ({
          ...target,
          polygon: (target.polygon || []).map((point) => ({ ...point })),
        })),
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
          wallStacks,
          realizationProfile: createStructuralRealizationProfile(structural.realizationProfile),
          realization: createStructuralRealizationState(structural.realization),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures.

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

/** A structured copy, so freezing a fixture never freezes another test's. */
function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

/**
 * A building with every slice populated: site, brief, unit program, accepted
 * and detailed test fit (rooms with units, wet fixtures), realised structure
 * (grid, column stacks) and realised building systems (shafts, risers, panels,
 * points, drainage, egress), a quantity profile.
 */
function richProject() {
  let project = createProject('Identity apartment');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Municipal road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: { targetStoreys: 2, targetUnitCount: 4, targetBudget: 10_000_000, currency: 'PHP' },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'id_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [],
    },
    targetCount: 4,
    parkingRequirement: 0,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
    unitDepth: 5000,
    corridorWidth: 1500,
    stairWidth: 2400,
    stairDepth: 4500,
    wetCoreWidth: 1200,
    wetCoreDepth: 1800,
    structuralBayTarget: 5500,
    floorToFloorHeight: 3000,
    planningCostPerSquareMeter: 25_000,
    currency: 'PHP',
  });
  project = run(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
  const option = project.building.testFitOptions.find(
    (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
  );
  project = run(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id });
  project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
    currency: 'PHP',
    reinforcementAllowanceKgPerM3: 100,
    excavationDepth: 500,
    unitRates: {},
  });
  return project;
}

/** A building that has lost every field the sync normalises (an old or hand-edited file). */
function sparseProject() {
  const project = createProject('Sparse');
  const { id, name, use, jurisdiction, brief } = project.building;
  return {
    ...project,
    building: {
      id,
      name,
      use,
      jurisdiction,
      brief,
      site: { boundary: [] },
      systems: { structural: { id: 'legacy_structural', columnStacks: [{ id: 'orphan_stack', intent: 'planned' }] } },
    },
  };
}

let richCache = null;
const FIXTURES = {
  'playground demo (loaded)': () => deserializeProject(copy(demoData)).project,
  'bench ceiling project (loaded)': () => deserializeProject(copy(benchEnvelope)).project,
  'bench ceiling project (as stored, never synced)': () => normalizeProjectEnvelope(copy(benchEnvelope)).data,
  'a new project': () => createProject('Fresh'),
  'a building missing its normalised fields': () => sparseProject(),
  'a fully populated building': () => copy((richCache ||= richProject())),
};

// ---------------------------------------------------------------------------
// Edits: plan edits the sync reads (and some it does not), and edits to each
// building slice. Each takes a project and returns a new one, never mutating.

const mapFloor = (project, index, update) => ({
  ...project,
  floors: project.floors.map((floor, floorIndex) => (floorIndex === index ? update(floor) : floor)),
});

const floorIndexWith = (project, key) =>
  Math.max(
    0,
    project.floors.findIndex((floor) => (floor[key] || []).length),
  );

const mapBuilding = (project, update) => ({ ...project, building: update(project.building) });

const mapSystems = (project, update) =>
  mapBuilding(project, (building) => ({ ...building, systems: update(building.systems || {}) }));

function reverseKeysDeep(value) {
  if (Array.isArray(value)) return value.map(reverseKeysDeep);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .reverse()
      .map((key) => [key, reverseKeysDeep(value[key])]),
  );
}

const firstShaftId = (project) => project.building?.systems?.plumbing?.shafts?.[0]?.id || 'shaft_missing';
const firstUnitId = (project) => project.building?.unitInstances?.[0]?.id || 'unit_missing';

const EDITS = {
  'move a fixture': (project) => {
    const index = floorIndexWith(project, 'fixtures');
    return mapFloor(project, index, (floor) => ({
      ...floor,
      fixtures: (floor.fixtures || []).map((fixture, i) => (i === 0 ? { ...fixture, x: fixture.x + 250 } : fixture)),
    }));
  },
  'add a fixture on a shaft': (project) =>
    mapFloor(project, 0, (floor) => ({
      ...floor,
      fixtures: [
        ...(floor.fixtures || []),
        { id: 'fx_shaft', type: 'toilet', x: 100, y: 100, plumbingShaftId: firstShaftId(project) },
      ],
    })),
  'delete a fixture': (project) => {
    const index = floorIndexWith(project, 'fixtures');
    return mapFloor(project, index, (floor) => ({ ...floor, fixtures: (floor.fixtures || []).slice(1) }));
  },
  'move a column': (project) => {
    const index = floorIndexWith(project, 'columns');
    return mapFloor(project, index, (floor) => ({
      ...floor,
      columns: (floor.columns || []).map((column, i) => (i === 0 ? { ...column, x: column.x + 100 } : column)),
    }));
  },
  'add a column on a new stack': (project) =>
    mapFloor(project, 0, (floor) => ({
      ...floor,
      columns: [
        ...(floor.columns || []),
        { id: 'col_new', x: 500, y: 700, width: 300, depth: 300, stackId: 'stack_new' },
      ],
    })),
  'add a column to an existing stack on the top floor': (project) => {
    const stackId = project.building?.systems?.structural?.columnStacks?.[0]?.id || 'stack_new';
    return mapFloor(project, project.floors.length - 1, (floor) => ({
      ...floor,
      columns: [...(floor.columns || []), { id: 'col_top', x: 0, y: 0, width: 300, depth: 300, stackId }],
    }));
  },
  'delete a stacked column': (project) => {
    const index = project.floors.findIndex((floor) => (floor.columns || []).some((column) => column.stackId));
    if (index < 0) return project;
    return mapFloor(project, index, (floor) => {
      const doomed = floor.columns.find((column) => column.stackId);
      return { ...floor, columns: floor.columns.filter((column) => column !== doomed) };
    });
  },
  'add a wall to a bay stack': (project) =>
    mapFloor(project, 0, (floor) => ({
      ...floor,
      walls: [
        ...(floor.walls || []),
        { id: 'wall_bay', start: { x: 0, y: 0 }, end: { x: 2000, y: 0 }, thickness: 150, stackId: 'bay_1' },
      ],
    })),
  'delete a wall': (project) => {
    const index = floorIndexWith(project, 'walls');
    return mapFloor(project, index, (floor) => ({ ...floor, walls: (floor.walls || []).slice(1) }));
  },
  'add a room to a unit': (project) =>
    mapFloor(project, 0, (floor) => ({
      ...floor,
      rooms: [
        ...(floor.rooms || []),
        { id: 'room_unit', name: 'Extra', points: [], unitInstanceId: firstUnitId(project) },
      ],
    })),
  'delete a room': (project) => {
    const index = floorIndexWith(project, 'rooms');
    return mapFloor(project, index, (floor) => ({ ...floor, rooms: (floor.rooms || []).slice(1) }));
  },
  'reverse the floors': (project) => ({ ...project, floors: [...project.floors].reverse() }),
  'add a floor': (project) => ({ ...project, floors: [...project.floors, { id: 'floor_extra', walls: [] }] }),
  'redraw the site boundary': (project) =>
    mapBuilding(project, (building) => ({
      ...building,
      site: {
        ...building.site,
        boundary: [
          { x: 0, y: 0 },
          { x: 9000, y: 0 },
          { x: 9000, y: 9000 },
        ],
      },
    })),
  'add a solar study target': (project) =>
    mapBuilding(project, (building) => ({
      ...building,
      site: {
        ...building.site,
        solarStudyTargets: [...(building.site?.solarStudyTargets || []), { id: 't1', polygon: [{ x: 1, y: 2 }] }],
      },
    })),
  'move a shaft': (project) =>
    mapSystems(project, (systems) => ({
      ...systems,
      plumbing: {
        ...(systems.plumbing || {}),
        shafts: (systems.plumbing?.shafts || [{ id: 'shaft_a', origin: { x: 0, y: 0 } }]).map((shaft, i) =>
          i === 0 ? { ...shaft, origin: { x: (shaft.origin?.x || 0) + 300, y: shaft.origin?.y || 0 } } : shaft,
        ),
      },
    })),
  'add an electrical point': (project) =>
    mapSystems(project, (systems) => ({
      ...systems,
      electrical: {
        ...(systems.electrical || {}),
        points: [...(systems.electrical?.points || []), { id: 'pt_new', kind: 'outlet', position: { x: 1, y: 1 } }],
      },
    })),
  'edit the structural coordination profile': (project) =>
    mapSystems(project, (systems) => ({
      ...systems,
      structural: {
        ...(systems.structural || {}),
        coordinationProfile: { ...(systems.structural?.coordinationProfile || {}), maxBeamPlanningSpan: 5000 },
      },
    })),
  'reorder the unit instances': (project) =>
    mapBuilding(project, (building) => ({
      ...building,
      unitInstances: [...(building.unitInstances || [])].reverse(),
    })),
  'add an assumption': (project) =>
    mapBuilding(project, (building) => ({
      ...building,
      assumptions: [...(building.assumptions || []), { id: 'as_1', title: 'Soil', statement: 'Assumed 100 kPa' }],
    })),
  'drop the normalised slices': (project) =>
    mapBuilding(project, (building) => {
      const {
        spaceProgram: _spaceProgram,
        testFitProfile: _testFitProfile,
        quantityProfile: _quantityProfile,
        documentation: _documentation,
        ...rest
      } = building;
      return {
        ...rest,
        site: { ...building.site, parkingPlan: undefined },
        systems: { ...building.systems, realization: undefined },
      };
    }),
  'reverse every key order in the building': (project) => mapBuilding(project, reverseKeysDeep),
  'add an unknown building key': (project) =>
    mapBuilding(project, (building) => ({ ...building, futureField: { nested: [1, 2, { a: 3 }] } })),
  'rename the project (no building change)': (project) => ({ ...project, name: `${project.name} 2` }),
};

function expectSameSave(input) {
  const expected = JSON.stringify(legacySyncCanonicalBuilding(input));
  const actual = JSON.stringify(syncCanonicalBuilding(deepFreeze(input)));
  expect(actual).toBe(expected);
}

describe('syncCanonicalBuilding saves exactly what it saved before it shared structure', () => {
  for (const [fixtureName, makeFixture] of Object.entries(FIXTURES)) {
    it(`${fixtureName}: as given, synced again, and after every edit`, () => {
      const raw = makeFixture();
      expectSameSave(copy(raw));
      const synced = syncCanonicalBuilding(copy(raw));
      // Synced again: the case that reuses every slice.
      expectSameSave(synced);
      for (const [, edit] of Object.entries(EDITS)) {
        // On a project the sync has seen (reuse kicks in) …
        expectSameSave(edit(syncCanonicalBuilding(copy(raw))));
        // … and on one it has not.
        expectSameSave(edit(copy(raw)));
      }
    });

    it(`${fixtureName}: every edit in turn, each fed the last one's result`, () => {
      let project = syncCanonicalBuilding(copy(makeFixture()));
      for (const [, edit] of Object.entries(EDITS)) {
        const input = edit(project);
        expectSameSave(input);
        project = syncCanonicalBuilding(input);
      }
    });
  }
});

describe('syncCanonicalBuilding keeps what it did not change', () => {
  it('hands back the very same building for an edit the building does not read', () => {
    for (const makeFixture of Object.values(FIXTURES)) {
      const synced = syncProjectStructures(makeFixture());
      if (!synced.building) continue;
      const moved = syncProjectStructures(deepFreeze(EDITS['move a fixture'](synced)));
      expect(moved.building).toBe(synced.building);
      expect(moved).not.toBe(synced);
    }
  });

  it('keeps every slice but the ones a new column stack touches', () => {
    const synced = syncProjectStructures(FIXTURES['a fully populated building']());
    const before = synced.building;
    const after = syncProjectStructures(deepFreeze(EDITS['add a column on a new stack'](synced))).building;

    expect(after).not.toBe(before);
    expect(after.systems).not.toBe(before.systems);
    expect(after.systems.structural).not.toBe(before.systems.structural);
    expect(after.systems.structural.columnStacks).not.toBe(before.systems.structural.columnStacks);
    // The stacks that were there are the stacks that were there.
    before.systems.structural.columnStacks.forEach((stack, index) => {
      expect(after.systems.structural.columnStacks[index]).toBe(stack);
    });
    expect(after.systems.structural.columnStacks.at(-1)).toMatchObject({ id: 'stack_new' });
    for (const key of ['gridSystems', 'wallStacks', 'realizationProfile', 'realization']) {
      expect(after.systems.structural[key]).toBe(before.systems.structural[key]);
    }
    for (const key of [
      'plumbing',
      'electrical',
      'water',
      'mechanical',
      'egress',
      'realization',
      'realizationProfile',
    ]) {
      expect(after.systems[key]).toBe(before.systems[key]);
    }
    for (const key of [
      'site',
      'brief',
      'spaceProgram',
      'unitTypes',
      'unitInstances',
      'testFitProfile',
      'testFitOptions',
      'apartmentDesignProfile',
      'apartmentDesign',
      'quantityProfile',
      'costRealization',
      'documentationRealization',
      'professionalExchange',
      'assumptions',
      'documentation',
    ]) {
      expect(after[key]).toBe(before[key]);
    }
  });

  it('keeps the other shafts, systems and slices when a wet fixture joins a shaft', () => {
    const synced = syncProjectStructures(FIXTURES['a fully populated building']());
    const shafts = synced.building.systems.plumbing.shafts;
    expect(shafts.length).toBeGreaterThan(0);
    const after = syncProjectStructures(deepFreeze(EDITS['add a fixture on a shaft'](synced))).building;

    expect(after.systems.plumbing).not.toBe(synced.building.systems.plumbing);
    expect(after.systems.plumbing.shafts[0].fixtureRefs).toContainEqual(
      expect.objectContaining({ fixtureId: 'fx_shaft' }),
    );
    shafts.slice(1).forEach((shaft, index) => expect(after.systems.plumbing.shafts[index + 1]).toBe(shaft));
    expect(after.systems.structural).toBe(synced.building.systems.structural);
    expect(after.systems.electrical).toBe(synced.building.systems.electrical);
    expect(after.site).toBe(synced.building.site);
    expect(after.unitInstances).toBe(synced.building.unitInstances);
  });

  it('gives a building missing its normalised fields all of them on the first sync', () => {
    const sparse = deepFreeze(sparseProject());
    const synced = syncCanonicalBuilding(sparse);
    for (const key of [
      'levelIds',
      'spaceProgram',
      'unitInstances',
      'testFitProfile',
      'quantityProfile',
      'documentation',
      'costRealization',
      'professionalExchange',
    ]) {
      expect(synced.building[key], key).toBeDefined();
    }
    expect(synced.building.site.parkingPlan).toBeDefined();
    expect(synced.building.systems.plumbing).toMatchObject({ shafts: [], wetZones: [], drainageRoutes: [] });
    expect(synced.building.systems.structural.realization).toBeDefined();
    expect(synced.building.systems.structural.columnStacks).toEqual([
      expect.objectContaining({ id: 'orphan_stack', columnRefs: [] }),
    ]);
    // The parts it was given and kept as they were are still its own.
    expect(synced.building.jurisdiction).toBe(sparse.building.jurisdiction);
    expect(synced.building.brief).toBe(sparse.building.brief);
    expect(synced.building).not.toBe(sparse.building);
  });

  it('does not reuse a slice whose keys came in a different order', () => {
    const synced = syncCanonicalBuilding(FIXTURES['a new project']());
    const shuffled = EDITS['reverse every key order in the building'](synced);
    const resynced = syncCanonicalBuilding(deepFreeze(shuffled));
    // The created slices come back in their canonical order, not the given one.
    expect(Object.keys(resynced.building.spaceProgram)).toEqual(Object.keys(synced.building.spaceProgram));
    expect(resynced.building.spaceProgram).not.toBe(shuffled.building.spaceProgram);
  });
});
