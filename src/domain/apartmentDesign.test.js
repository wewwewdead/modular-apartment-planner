import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createProject, createRoom } from './models';
import { deriveApartmentDesignCoordination, validateApartmentDesignCoordination } from './apartmentDesign';
import { validateBuildingCoordination } from './buildingGraph';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function acceptedTestFit() {
  let project = createProject('Iota apartment design');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: { targetStoreys: 2, targetUnitCount: 4, targetBudget: 10_000_000, currency: 'PHP' },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'iota_studio',
      name: 'Iota Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [
        { id: 'iota_living', name: 'Living / sleeping', spaceType: 'living_sleeping', minCount: 1, maxCount: 1 },
        { id: 'iota_kitchen', name: 'Kitchen', spaceType: 'kitchen', minCount: 1, maxCount: 1 },
        { id: 'iota_bath', name: 'Bathroom', spaceType: 'bathroom', minCount: 1, maxCount: 1 },
      ],
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
  const feasible = project.building.testFitOptions.find(
    (option) => !option.findings.some((finding) => finding.severity === 'error'),
  );
  return run(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: feasible.id });
}

describe('Iota apartment design closure', () => {
  it('details an accepted test fit into rooms, openings, furniture, stairs, and circulation relationships', () => {
    let project = acceptedTestFit();
    expect(validateApartmentDesignCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'APARTMENT.DESIGN_NOT_DETAILED' }),
    );
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_APARTMENT_DESIGN_PROFILE,
      bathroomWidth: 1400,
      serviceBandDepth: 2000,
      entryDoorWidth: 900,
      internalDoorWidth: 800,
      exteriorWindowWidth: 1200,
      minimumSharedBoundary: 300,
      minimumDaylightGlazingRatio: 0.08,
      fixtureClearances: { bed: 300, kitchenTop: 300, toilet: 200, lavatory: 200 },
      stairWidth: 1000,
      targetRiserHeight: 175,
      treadDepth: 250,
      minimumHeadroom: 2000,
      maximumEgressTravelDistance: 30_000,
    });
    const result = executeBuildingCommand(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.undo).toMatchObject({ kind: 'project_snapshot' });
    project = result.project;

    expect(project.building.apartmentDesign).toMatchObject({
      status: 'detailed',
      sourceTestFitId: project.building.acceptedTestFitId,
      detailedUnitInstanceIds: expect.arrayContaining(project.building.unitInstances.map((entry) => entry.id)),
    });
    expect(project.floors.flatMap((floor) => floor.rooms).filter((room) => room.spaceType === 'unit_block')).toEqual(
      [],
    );
    for (const instance of project.building.unitInstances) {
      const floor = project.floors.find((entry) => entry.id === instance.floorId);
      const rooms = floor.rooms.filter((room) => room.unitInstanceId === instance.id);
      expect(rooms.map((room) => room.spaceType).sort()).toEqual(['bathroom', 'kitchen', 'living_sleeping']);
      expect(floor.doors.some((door) => door.unitInstanceId === instance.id && door.role === 'unit_entry')).toBe(true);
      expect(floor.windows.some((window) => window.unitInstanceId === instance.id)).toBe(true);
      expect(floor.fixtures.filter((fixture) => fixture.unitInstanceId === instance.id)).toHaveLength(4);
    }
    expect(project.floors[0].stairs).toHaveLength(1);
    expect(project.floors[1].slabs[0].openings).toContainEqual(expect.objectContaining({ purpose: 'stair' }));
    expect(project.building.systems.egress.exits).toHaveLength(2);
    expect(project.building.systems.egress.routes).toHaveLength(4);

    const derived = deriveApartmentDesignCoordination(project);
    expect(derived).toMatchObject({
      detailedUnitCount: 4,
      adjacencyCompleteUnitCount: 4,
      egressCompleteUnitCount: 4,
      actualStairCount: 1,
    });
    expect(validateApartmentDesignCoordination(project).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(
      validateBuildingCoordination(project).filter(
        (issue) =>
          issue.severity === 'error' &&
          ['apartment_design_coordination', 'egress_coordination', 'vertical_coordination'].includes(issue.category),
      ),
    ).toEqual([]);
  });

  it('protects authored geometry and invalidates detailing when its assumptions change', () => {
    let project = acceptedTestFit();
    project.floors[0].rooms.push(
      createRoom('Owner room', [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ]),
    );
    expect(executeBuildingCommand(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT })).toMatchObject({
      ok: false,
      error: { code: 'authored-apartment-geometry-protected' },
    });

    project = acceptedTestFit();
    project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
    project.building.apartmentDesignProfile.minimumDaylightGlazingRatio = 0.12;
    expect(validateApartmentDesignCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'APARTMENT.DESIGN_OUTDATED' }),
    );
  });

  it('reports traceable furniture conflicts, solar exposure, and configured accessibility intent', () => {
    let project = acceptedTestFit();
    const profile = project.building.apartmentDesignProfile;
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_APARTMENT_DESIGN_PROFILE,
      ...profile,
      accessibleEntryDoorWidth: 1000,
      accessibleCirculationWidth: 1600,
      solarExposureWatchOrientations: ['north', 'east', 'south', 'west'],
    });
    project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
    project.building.brief.accessibilityRequirements = 'Step-free units and accessible common circulation requested';
    const firstUnitFixtures = project.floors[0].fixtures.filter(
      (fixture) => fixture.unitInstanceId === project.building.unitInstances[0].id,
    );
    firstUnitFixtures[1].roomId = firstUnitFixtures[0].roomId;
    firstUnitFixtures[1].x = firstUnitFixtures[0].x;
    firstUnitFixtures[1].y = firstUnitFixtures[0].y;

    const issues = validateApartmentDesignCoordination(project);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'APARTMENT.FIXTURE_CLEARANCE_CONFLICT',
          evidence: expect.objectContaining({ resultKind: 'verified_geometry' }),
        }),
        expect.objectContaining({ ruleId: 'ENV.SOLAR_EXPOSURE_REVIEW', professionalReviewRequired: true }),
        expect.objectContaining({ ruleId: 'ACCESS.CORRIDOR_WIDTH_BELOW_INTENT' }),
        expect.objectContaining({ ruleId: 'ACCESS.ENTRY_DOOR_WIDTH_BELOW_INTENT' }),
      ]),
    );
  });

  it('checks every bedroom adjacency independently in a two-bedroom unit', () => {
    const project = createProject('Two-bedroom adjacency');
    const floor = project.floors[0];
    const room = (id, spaceType, points) => ({
      ...createRoom(id, points),
      id,
      spaceType,
      unitInstanceId: 'unit_2br',
      useCategory: 'rentable',
    });
    floor.rooms = [
      room('living', 'living', [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 2000 },
        { x: 0, y: 2000 },
      ]),
      room('bedroom_1', 'bedroom', [
        { x: 1000, y: 0 },
        { x: 2000, y: 0 },
        { x: 2000, y: 1000 },
        { x: 1000, y: 1000 },
      ]),
      room('bedroom_2', 'bedroom', [
        { x: 2000, y: 1000 },
        { x: 3000, y: 1000 },
        { x: 3000, y: 2000 },
        { x: 2000, y: 2000 },
      ]),
      room('kitchen', 'kitchen', [
        { x: -1000, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1000 },
        { x: -1000, y: 1000 },
      ]),
      room('bathroom', 'bathroom', [
        { x: -1000, y: 1000 },
        { x: 0, y: 1000 },
        { x: 0, y: 2000 },
        { x: -1000, y: 2000 },
      ]),
    ];
    project.building.unitTypes = [{ id: 'type_2br', category: 'two_bedroom', spaceRequirements: [] }];
    project.building.unitInstances = [
      {
        id: 'unit_2br',
        typeId: 'type_2br',
        floorId: floor.id,
        roomIds: floor.rooms.map((entry) => entry.id),
      },
    ];
    const requirements = deriveApartmentDesignCoordination(project).units[0].adjacencyRequirements;
    expect(requirements.filter((entry) => entry.secondType === 'bedroom')).toEqual([
      expect.objectContaining({ secondRoomId: 'bedroom_1', satisfied: true }),
      expect.objectContaining({ secondRoomId: 'bedroom_2', satisfied: false }),
    ]);
  });
});
