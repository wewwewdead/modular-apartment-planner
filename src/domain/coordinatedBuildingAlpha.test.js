import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { syncCanonicalBuilding } from './buildingModels';
import { derivePreliminaryPackage } from './documentPackage';
import {
  createDoor,
  createFixture,
  createFloor,
  createProject,
  createRoom,
  createSectionCut,
  createSlab,
  createStair,
  createWall,
} from './models';
import { deriveApartmentProgram } from './apartmentProgram';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { createRoofSystem } from './roofModels';
import { deriveSiteFeasibility } from './siteModels';
import { deriveWetCoreCoordination } from './wetCoreModels';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Alpha acceptance scenario', () => {
  it('coordinates a two-storey four-unit concept through feasibility, structure, systems, quantities, and documents', () => {
    let project = createProject('Alpha Four-Unit Apartment');
    project.floors.push(createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 }));
    project = syncCanonicalBuilding(project);

    project = execute(project, {
      type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
      updates: {
        targetStoreys: 2,
        targetUnitCount: 4,
        targetBudget: 8_000_000,
        currency: 'PHP',
        parkingRequirement: 1,
        preferredStructuralSystem: 'reinforced_concrete_frame',
        roofType: 'flat',
      },
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      boundaryId: 'alpha_property',
      width: 16_000,
      depth: 24_000,
      origin: { x: -2000, y: -3000 },
      northAngle: 15,
      frontEdgeIndex: 0,
      roadName: 'Access Road',
      setbacks: { front: 2000, rear: 2000, left: 1000, right: 1000 },
    });

    const unitType = {
      id: 'alpha_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [
        {
          id: 'alpha_living_sleeping',
          spaceType: 'living_sleeping',
          name: 'Living / sleeping',
          minCount: 1,
          maxCount: 1,
        },
        { id: 'alpha_bathroom', spaceType: 'bathroom', name: 'Bathroom', minCount: 1, maxCount: 1 },
        { id: 'alpha_kitchen', spaceType: 'kitchen', name: 'Kitchen', minCount: 1, maxCount: 1 },
      ],
    };
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
      unitType,
      targetCount: 4,
      parkingRequirement: 1,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES,
      typeId: unitType.id,
      count: 4,
      floorIds: project.floors.map((floor) => floor.id),
    });

    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'alpha_grid',
      name: 'Primary RC Grid',
      xAxisCount: 3,
      yAxisCount: 3,
      xSpacing: 4000,
      ySpacing: 3000,
      origin: { x: 0, y: 0 },
      rotation: 0,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'alpha_grid',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 300,
    });

    project = {
      ...project,
      floors: project.floors.map((floor) => {
        const instances = project.building.unitInstances.filter((instance) => instance.floorId === floor.id);
        const rooms = instances.flatMap((instance, unitIndex) => {
          const baseX = unitIndex * 6000;
          return [
            {
              ...createRoom(`${instance.name} Living / sleeping`, rectangle(baseX, 0, 4000, 4000)),
              id: `${instance.id}_living`,
              unitInstanceId: instance.id,
              spaceType: 'living_sleeping',
              spaceRequirementId: 'alpha_living_sleeping',
              useCategory: 'rentable',
            },
            {
              ...createRoom(`${instance.name} Bathroom`, rectangle(baseX + 4000, 0, 2000, 2000)),
              id: `${instance.id}_bathroom`,
              unitInstanceId: instance.id,
              spaceType: 'bathroom',
              spaceRequirementId: 'alpha_bathroom',
              useCategory: 'rentable',
            },
            {
              ...createRoom(`${instance.name} Kitchen`, rectangle(baseX + 4000, 2000, 2000, 2000)),
              id: `${instance.id}_kitchen`,
              unitInstanceId: instance.id,
              spaceType: 'kitchen',
              spaceRequirementId: 'alpha_kitchen',
              useCategory: 'rentable',
            },
          ];
        });
        const wall = { ...createWall({ x: 0, y: -500 }, { x: 12_000, y: -500 }), id: `${floor.id}_front_wall` };
        return {
          ...floor,
          rooms,
          walls: [wall],
          doors: [{ ...createDoor(wall.id, 6000, 900), id: `${floor.id}_entry_door` }],
          slabs: [createSlab(floor.id, rectangle(0, 0, 12_000, 7000), 200, floor.elevation)],
          fixtures: instances.map((instance, index) => ({
            ...createFixture('toilet', index * 6000 + 5000, 1000),
            id: `${instance.id}_toilet`,
          })),
        };
      }),
    };
    const ground = project.floors[0];
    const upper = project.floors[1];
    ground.stairs = [
      {
        ...createStair(
          { x: 10_000, y: 500 },
          1000,
          18,
          3000 / 18,
          280,
          { angle: 90 },
          { fromFloorId: ground.id, toFloorId: upper.id },
        ),
        id: 'alpha_stair',
      },
    ];
    ground.sectionCuts = [{ ...createSectionCut({ x: -1000, y: 3500 }, { x: 13_000, y: 3500 }), id: 'alpha_section' }];
    project.roofSystem = createRoofSystem('Flat Roof', {
      id: 'alpha_roof',
      roofType: 'flat',
      baseElevation: 6000,
      boundaryPolygon: rectangle(0, 0, 12_000, 7000),
    });
    project = syncCanonicalBuilding(project);

    for (const floor of project.floors) {
      project = execute(project, {
        type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
        beamId: `${floor.id}_beam_1`,
        floorId: floor.id,
        startColumnId: floor.columns[0].id,
        endColumnId: floor.columns[1].id,
        width: 250,
        depth: 450,
      });
    }
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'alpha_wet_shaft',
      name: 'Primary Wet Shaft',
      origin: { x: 6000, y: 1000 },
      width: 700,
      depth: 900,
      servedFloorIds: project.floors.map((floor) => floor.id),
      maxFixtureDistance: 6000,
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.ASSIGN_NEARBY_WET_FIXTURES,
      shaftId: 'alpha_wet_shaft',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
      serviceKind: 'plumbing',
      serviceId: 'alpha_wet_shaft',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: 100,
      unitRates: { concrete: 7000, reinforcement: 70 },
    });

    const site = deriveSiteFeasibility(project);
    const program = deriveApartmentProgram(project);
    const wetCore = deriveWetCoreCoordination(project);
    const takeoff = deriveQuantityTakeoff(project);
    expect(site.buildableEnvelope.status).toBe('checked');
    expect(site.areaLedger.grossFloorArea.value).toBeGreaterThan(0);
    expect(program).toMatchObject({ configured: true, totalUnitInstances: 4, linkedUnitInstances: 4 });
    expect(project.building.systems.structural.columnStacks).toHaveLength(9);
    expect(project.floors.every((floor) => floor.columns.length === 9 && floor.beams.length === 1)).toBe(true);
    expect(wetCore).toMatchObject({ wetFixtureCount: 4, assignedFixtureCount: 4 });
    expect(takeoff.items.find((item) => item.id === 'concrete').quantity).toBeGreaterThan(0);
    expect(takeoff.items.find((item) => item.id === 'reinforcement').quantity).toBeGreaterThan(0);

    project = execute(project, {
      type: BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE,
      packageId: 'alpha',
    });
    const packageManifest = derivePreliminaryPackage(project);
    const issues = validateBuildingCoordination(project);
    expect(packageManifest).toMatchObject({
      readyDeliverableCount: 13,
      totalDeliverableCount: 15,
      outOfDate: false,
    });
    expect(packageManifest.missingDeliverables.map((entry) => entry.id)).toEqual(['site_access', 'roof_drainage']);
    expect(packageManifest.generatedSheetCount).toBeGreaterThanOrEqual(12);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([
      expect.objectContaining({ ruleId: 'ROOF_DRAINAGE.NO_DRAIN' }),
    ]);
    expect(issues).toContainEqual(expect.objectContaining({ ruleId: 'STAIR.HEADROOM_NOT_VERIFIED' }));
    expect(issues.every((issue) => issue.professionalReviewRequired)).toBe(true);
  });
});
