import { describe, expect, it } from 'vitest';
import { createColumn, createFixture, createFloor, createProject, createWall } from './models';
import { syncCanonicalBuilding } from './buildingModels';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

function makeTwoFloorProject() {
  const project = createProject('Command Test');
  const ground = project.floors[0];
  const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
  const stackId = 'stack_1';
  const groundColumn = { ...createColumn(0, 0, 300, 300, { stackId }), id: 'column_ground' };
  const upperColumn = { ...createColumn(0, 0, 300, 300, { stackId }), id: 'column_upper' };
  const supportColumn = { ...createColumn(4000, 0), id: 'column_support' };
  ground.columns = [groundColumn, supportColumn];
  upper.columns = [upperColumn];
  return syncCanonicalBuilding({ ...project, floors: [ground, upper] });
}

describe('building command contract', () => {
  it('configures a continuous wet-service shaft and assigns nearby fixtures with explicit relationships', () => {
    let project = makeTwoFloorProject();
    project.floors[0].fixtures = [{ ...createFixture('toilet', 1000, 1000), id: 'fixture_near' }];
    project.floors[1].fixtures = [{ ...createFixture('lavatory', 7000, 7000), id: 'fixture_far' }];
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: 'shaft_primary',
      name: 'Primary Shaft',
      origin: { x: 0, y: 0 },
      width: 600,
      depth: 800,
      servedFloorIds: project.floors.map((floor) => floor.id),
      maxFixtureDistance: 2500,
    });
    expect(result.ok).toBe(true);
    expect(result.project.building.systems.plumbing.shafts[0]).toMatchObject({
      id: 'shaft_primary',
      servedFloorIds: project.floors.map((floor) => floor.id),
      professionalReviewRequired: true,
    });

    project = result.project;
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.ASSIGN_NEARBY_WET_FIXTURES,
      shaftId: 'shaft_primary',
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].fixtures[0].plumbingShaftId).toBe('shaft_primary');
    expect(result.project.floors[1].fixtures[0].plumbingShaftId).toBeNull();
    expect(result.project.building.systems.plumbing.shafts[0].fixtureRefs).toEqual([
      { floorId: project.floors[0].id, fixtureId: 'fixture_near' },
    ]);
    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({ ruleId: 'SYSTEM.WET_FIXTURE_UNASSIGNED' }),
    );
  });

  it('configures a rectangular site, frontage, and setbacks atomically', () => {
    const project = makeTwoFloorProject();
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      width: 12000,
      depth: 20000,
      northAngle: 12,
      frontEdgeIndex: 0,
      roadName: 'Barangay Road',
      setbacks: { front: 3000, rear: 2000, left: 1000, right: 1000 },
    });

    expect(result.ok).toBe(true);
    expect(result.project.building.site).toMatchObject({
      northAngle: 12,
      lotSetup: {
        kind: 'rectangle',
        width: 12000,
        depth: 20000,
        frontEdgeIndex: 0,
        roadName: 'Barangay Road',
      },
      roadEdges: [{ edgeIndex: 0, roadName: 'Barangay Road' }],
    });
    expect(result.project.building.site.edgeSetbacks).toEqual([
      expect.objectContaining({ edgeIndex: 0, distance: 3000, classification: 'front' }),
      expect.objectContaining({ edgeIndex: 1, distance: 1000, classification: 'left' }),
      expect.objectContaining({ edgeIndex: 2, distance: 2000, classification: 'rear' }),
      expect.objectContaining({ edgeIndex: 3, distance: 1000, classification: 'right' }),
    ]);
    expect(result.changes.derived.find((change) => change.kind === 'area_ledger_recomputed').ledger).toMatchObject({
      lotArea: { value: 240000000 },
      buildableArea: { value: 150000000 },
    });
    expect(result.undo).toEqual({ kind: 'project_snapshot', project });
  });

  it('rejects incomplete rectangular site assumptions without mutating the project', () => {
    const project = makeTwoFloorProject();
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      width: 12000,
      depth: 20000,
      frontEdgeIndex: 0,
      setbacks: { front: 3000, rear: 2000, left: 1000 },
    });

    expect(result).toMatchObject({ ok: false, project, error: { code: 'invalid-rectangular-setbacks' } });
  });

  it('defines a property boundary, then derives feasibility from configured edge setbacks', () => {
    let project = makeTwoFloorProject();
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.DEFINE_PROPERTY_BOUNDARY,
      boundaryId: 'property_1',
      boundary: [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
        { x: 10000, y: 20000 },
        { x: 0, y: 20000 },
      ],
      northAngle: 15,
    });
    expect(result.ok).toBe(true);
    expect(result.project.building.site).toMatchObject({ boundaryId: 'property_1', northAngle: 15 });
    expect(result.validation.introduced[0].ruleId).toBe('SITE.SETBACKS_INCOMPLETE');

    project = result.project;
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_SITE_SETBACKS,
      edgeSetbacks: [
        { edgeIndex: 0, distance: 3000, classification: 'front' },
        { edgeIndex: 1, distance: 1000 },
        { edgeIndex: 2, distance: 2000, classification: 'rear' },
        { edgeIndex: 3, distance: 1000 },
      ],
      roadEdges: [{ edgeIndex: 0, roadName: 'Access Road' }],
    });
    expect(result.ok).toBe(true);
    expect(result.validation.resolved).toContainEqual(expect.objectContaining({ ruleId: 'SITE.SETBACKS_INCOMPLETE' }));
    expect(result.validation.issues).toEqual([]);
    expect(result.changes.derived.find((change) => change.kind === 'area_ledger_recomputed').ledger).toMatchObject({
      lotArea: { value: 200000000, provenance: 'exact_from_geometry' },
      buildableArea: { value: 120000000, provenance: 'derived_from_configured_assumption' },
    });
  });

  it('generates a structural grid with stable command-supplied IDs', () => {
    const project = makeTwoFloorProject();
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.GENERATE_STRUCTURAL_GRID,
      gridId: 'grid_main',
      name: 'Main Grid',
      xOffsets: [4000, 0, 4000],
      yOffsets: [0, 3500],
    });

    expect(result.ok).toBe(true);
    const [grid] = result.project.building.systems.structural.gridSystems;
    expect(grid.id).toBe('grid_main');
    expect(grid.axes.map((axis) => [axis.id, axis.label, axis.orientation, axis.offset])).toEqual([
      ['grid_main_x_1', '1', 'vertical', 0],
      ['grid_main_x_2', '2', 'vertical', 4000],
      ['grid_main_y_1', 'A', 'horizontal', 0],
      ['grid_main_y_2', 'B', 'horizontal', 3500],
    ]);
    expect(result.undo).toEqual({ kind: 'project_snapshot', project });
    expect(result.changes.derived[1]).toMatchObject({ kind: 'coordination_validation_recomputed' });
  });

  it('configures a regular grid and refreshes linked stack intent without moving columns', () => {
    let project = makeTwoFloorProject();
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'grid_regular',
      name: 'Apartment Grid',
      xAxisCount: 3,
      yAxisCount: 2,
      xSpacing: 4000,
      ySpacing: 3500,
      origin: { x: 0, y: 0 },
      rotation: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.project.building.systems.structural.gridSystems[0]).toMatchObject({
      id: 'grid_regular',
      setup: { kind: 'regular', xAxisCount: 3, yAxisCount: 2, xSpacing: 4000, ySpacing: 3500 },
    });

    project = result.project;
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_COLUMN_STACK,
      stackId: 'stack_regular',
      gridIntersection: {
        gridId: 'grid_regular',
        xAxisId: 'grid_regular_x_2',
        yAxisId: 'grid_regular_y_2',
      },
    });
    project = result.project;
    const originalColumnPosition = {
      x: project.floors[0].columns[0].x,
      y: project.floors[0].columns[0].y,
    };

    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'grid_regular',
      name: 'Apartment Grid',
      xAxisCount: 3,
      yAxisCount: 2,
      xSpacing: 4500,
      ySpacing: 4000,
      origin: { x: 1000, y: 2000 },
      rotation: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.project.building.systems.structural.gridSystems).toHaveLength(1);
    expect(
      result.project.building.systems.structural.columnStacks.find((stack) => stack.id === 'stack_regular').origin,
    ).toEqual({ x: 5500, y: 6000 });
    expect({ x: result.project.floors[0].columns[0].x, y: result.project.floors[0].columns[0].y }).toEqual(
      originalColumnPosition,
    );
    expect(result.changes.domain).toContainEqual(
      expect.objectContaining({ entityType: 'columnStackOrigins', movedColumnGeometry: false }),
    );
  });

  it('populates deterministic grid stacks and modeled columns continuously across selected levels', () => {
    let project = makeTwoFloorProject();
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'grid_population',
      xAxisCount: 2,
      yAxisCount: 2,
      xSpacing: 4000,
      ySpacing: 3500,
    });
    project = result.project;
    const originalColumnCounts = project.floors.map((floor) => floor.columns.length);
    const command = {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'grid_population',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 350,
    };
    result = executeBuildingCommand(project, command);

    expect(result.ok).toBe(true);
    const gridStacks = result.project.building.systems.structural.columnStacks.filter(
      (stack) => stack.gridIntersection?.gridId === 'grid_population',
    );
    expect(gridStacks).toHaveLength(4);
    result.project.floors.forEach((floor, index) => {
      expect(floor.columns).toHaveLength(originalColumnCounts[index] + 4);
      for (const stack of gridStacks) {
        expect(floor.columns).toContainEqual(expect.objectContaining({ stackId: stack.id, width: 300, depth: 350 }));
      }
    });
    expect(result.changes.domain[0]).toMatchObject({
      createdStackCount: 4,
      createdColumnCount: 8,
      engineeringCapacityVerified: false,
    });

    const repeated = executeBuildingCommand(result.project, command);
    expect(repeated.ok).toBe(true);
    expect(repeated.changes.domain[0]).toMatchObject({ createdStackCount: 0, createdColumnCount: 0 });
    expect(repeated.project.floors.map((floor) => floor.columns.length)).toEqual(
      result.project.floors.map((floor) => floor.columns.length),
    );
  });

  it('creates a planned stack and explicitly assigns an existing column', () => {
    let project = makeTwoFloorProject();
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_COLUMN_STACK,
      stackId: 'stack_planned',
      origin: { x: 8000, y: 0 },
      name: 'C3',
    });
    expect(result.ok).toBe(true);
    expect(result.project.building.systems.structural.columnStacks).toContainEqual(
      expect.objectContaining({ id: 'stack_planned', intent: 'planned', columnRefs: [] }),
    );

    project = result.project;
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.ASSIGN_COLUMN_TO_STACK,
      floorId: project.floors[0].id,
      columnId: 'column_support',
      stackId: 'stack_planned',
    });
    expect(result.ok).toBe(true);
    expect(result.project.floors[0].columns.find((column) => column.id === 'column_support').stackId).toBe(
      'stack_planned',
    );
    expect(
      result.project.building.systems.structural.columnStacks.find((stack) => stack.id === 'stack_planned').columnRefs,
    ).toEqual([{ floorId: project.floors[0].id, columnId: 'column_support' }]);
  });

  it('derives a planned stack origin from a rotated structural-grid intersection', () => {
    let project = makeTwoFloorProject();
    let result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.GENERATE_STRUCTURAL_GRID,
      gridId: 'grid_rotated',
      origin: { x: 1000, y: 2000 },
      rotation: 90,
      xOffsets: [0, 4000],
      yOffsets: [0, 3000],
    });
    project = result.project;
    result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_COLUMN_STACK,
      stackId: 'stack_on_grid',
      gridIntersection: {
        gridId: 'grid_rotated',
        xAxisId: 'grid_rotated_x_2',
        yAxisId: 'grid_rotated_y_2',
      },
    });

    expect(result.ok).toBe(true);
    const stack = result.project.building.systems.structural.columnStacks.find((entry) => entry.id === 'stack_on_grid');
    expect(stack.origin.x).toBeCloseTo(-2000, 5);
    expect(stack.origin.y).toBeCloseTo(6000, 5);
    expect(result.validation.issues).toEqual([]);

    const linkedColumn = {
      ...project.floors[0].columns.find((column) => column.id === 'column_support'),
      stackId: 'stack_on_grid',
    };
    const withLinkedColumn = syncCanonicalBuilding({
      ...result.project,
      floors: result.project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              columns: floor.columns.map((column) => (column.id === linkedColumn.id ? linkedColumn : column)),
            }
          : floor,
      ),
    });
    const rejectedMove = executeBuildingCommand(withLinkedColumn, {
      type: BUILDING_COMMANDS.MOVE_COLUMN,
      floorId: withLinkedColumn.floors[0].id,
      columnId: linkedColumn.id,
      to: { x: -1900, y: 6000 },
      scope: 'stack',
    });
    expect(rejectedMove.ok).toBe(false);
    expect(rejectedMove.error.code).toBe('grid-linked-stack-move');
  });

  it('moves one column instance and reports the resulting stack misalignment', () => {
    const project = makeTwoFloorProject();
    const upperFloorId = project.floors[1].id;
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.MOVE_COLUMN,
      floorId: upperFloorId,
      columnId: 'column_upper',
      to: { x: 100, y: 0 },
      scope: 'instance',
    });

    expect(result.ok).toBe(true);
    expect(result.validation.introduced).toHaveLength(1);
    expect(result.validation.introduced[0]).toMatchObject({
      ruleId: 'STRUCT.COLUMN_STACK_MISALIGNED',
      evidence: { inputs: { offset: 100 } },
    });
    expect(result.undo.project).toBe(project);
  });

  it('moves a complete stack, its attached walls, and the stored stack axis together', () => {
    const project = makeTwoFloorProject();
    project.floors[0].walls = [
      {
        ...createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }),
        id: 'wall_attached',
        startAttachment: {
          kind: 'column',
          columnId: 'column_ground',
          featureType: 'centerline',
          featureIndex: 0,
          offset: 0,
        },
      },
    ];
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.MOVE_COLUMN,
      floorId: project.floors[0].id,
      columnId: 'column_ground',
      to: { x: 250, y: 500 },
      scope: 'stack',
    });

    expect(result.ok).toBe(true);
    expect(result.project.floors[0].columns.find((column) => column.id === 'column_ground')).toMatchObject({
      x: 250,
      y: 500,
    });
    expect(result.project.floors[1].columns.find((column) => column.id === 'column_upper')).toMatchObject({
      x: 250,
      y: 500,
    });
    expect(result.project.floors[0].walls[0].start).toEqual({ x: 250, y: 500 });
    expect(
      result.project.building.systems.structural.columnStacks.find((stack) => stack.id === 'stack_1').origin,
    ).toEqual({ x: 250, y: 500 });
    expect(result.validation.issues).toEqual([]);
  });

  it('creates beams only between valid supports on one level', () => {
    const project = makeTwoFloorProject();
    const floorId = project.floors[0].id;
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      beamId: 'beam_1',
      floorId,
      startColumnId: 'column_ground',
      endColumnId: 'column_support',
    });

    expect(result.ok).toBe(true);
    expect(result.project.floors[0].beams[0]).toMatchObject({
      id: 'beam_1',
      startRef: { kind: 'column', id: 'column_ground' },
      endRef: { kind: 'column', id: 'column_support' },
      floorLevel: 0,
    });
    expect(result.validation.issues).toEqual([]);

    const rejected = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      beamId: 'beam_bad',
      floorId,
      startColumnId: 'column_ground',
      endColumnId: 'missing',
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.error.code).toBe('beam-support-not-found');
    expect(rejected.project).toBe(project);
    expect(rejected.undo).toBeNull();
  });

  it('creates a distinct roof ring beam at the top of a storey', () => {
    let project = makeTwoFloorProject();
    const floorId = project.floors[1].id;
    project.floors[1].columns.push({ ...createColumn(4000, 0), id: 'column_upper_support' });

    const floorBeamResult = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      beamId: 'beam_floor',
      floorId,
      startColumnId: 'column_upper',
      endColumnId: 'column_upper_support',
      floorLevel: 3000,
    });
    expect(floorBeamResult.ok).toBe(true);
    project = floorBeamResult.project;

    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      beamId: 'beam_roof',
      floorId,
      startColumnId: 'column_upper',
      endColumnId: 'column_upper_support',
      floorLevel: 6000,
      placementRole: 'roof_ring',
    });

    expect(result.ok).toBe(true);
    expect(result.project.floors[1].beams).toHaveLength(2);
    expect(result.project.floors[1].beams[1]).toMatchObject({
      id: 'beam_roof',
      floorLevel: 6000,
      placementRole: 'roof_ring',
    });
  });

  it('rejects a beam elevation outside the active storey', () => {
    const project = makeTwoFloorProject();
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
      beamId: 'beam_above_storey',
      floorId: project.floors[0].id,
      startColumnId: 'column_ground',
      endColumnId: 'column_support',
      floorLevel: 6000,
    });

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('invalid-beam-floor-level');
  });
});
