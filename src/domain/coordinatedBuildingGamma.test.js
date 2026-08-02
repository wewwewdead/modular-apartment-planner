import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createSlab } from './models';
import { syncCanonicalBuilding } from './buildingModels';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { deriveConceptualLoadPath } from './structuralCoordination';
import { deriveQuantityTakeoff } from './quantityTakeoff';

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result;
}

describe('Apartment Planner Gamma acceptance', () => {
  it('coordinates two-level slab/beam/column relationships, openings, load paths, quantities, and structural sheets', () => {
    let project = createProject('Gamma structural coordination');
    const upper = createFloor('Second Floor', 1, { elevation: 3000, floorToFloorHeight: 3000 });
    project = syncCanonicalBuilding({ ...project, floors: [project.floors[0], upper] });
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'gamma_grid',
      xAxisCount: 3,
      yAxisCount: 2,
      xSpacing: 4000,
      ySpacing: 4000,
    }).project;
    project = run(project, {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'gamma_grid',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 300,
    }).project;
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_COORDINATION,
      maxBeamPlanningSpan: 8500,
      maxSlabPlanningSpan: 4500,
      maxCantileverPlanningLength: 1500,
      minOpeningClearanceFromColumn: 300,
    }).project;

    for (const floor of project.floors) {
      const at = (x, y) => floor.columns.find((column) => column.x === x && column.y === y);
      project = run(project, {
        type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
        floorId: floor.id,
        beamId: `${floor.id}_beam_south`,
        startColumnId: at(0, 0).id,
        endColumnId: at(8000, 0).id,
      }).project;
      project = run(project, {
        type: BUILDING_COMMANDS.CREATE_BEAM_BETWEEN_SUPPORTS,
        floorId: floor.id,
        beamId: `${floor.id}_beam_north`,
        startColumnId: at(0, 4000).id,
        endColumnId: at(8000, 4000).id,
      }).project;
    }
    project = {
      ...project,
      floors: project.floors.map((floor) => ({
        ...floor,
        slabs: [
          {
            ...createSlab(floor.id, rectangle(0, 0, 8000, 4000), 150, floor.elevation),
            id: `${floor.id}_slab`,
            name: `${floor.name} slab zone`,
          },
        ],
      })),
    };
    let result = run(project, {
      type: BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS,
      maxPlanningSpan: 4500,
    });
    project = result.project;
    expect(project.floors.every((floor) => floor.slabs[0].supportRefs.length === 2)).toBe(true);

    for (const floor of project.floors) {
      project = run(project, {
        type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
        floorId: floor.id,
        slabId: `${floor.id}_slab`,
        openingId: `${floor.id}_shaft_opening`,
        origin: { x: 3800, y: 1700 },
        width: 400,
        depth: 600,
        purpose: 'plumbing_shaft',
      }).project;
    }
    const ruleIds = run(project, {
      type: BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE,
      packageId: 'gamma',
    }).validation.issues.map((issue) => issue.ruleId);
    project = run(project, {
      type: BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE,
      packageId: 'gamma',
    }).project;

    expect(ruleIds).not.toContain('STRUCT.SLAB_SUPPORTS_INCOMPLETE');
    expect(ruleIds).not.toContain('STRUCT.SLAB_OPENING_INTERSECTS_BEAM');
    expect(ruleIds).not.toContain('STRUCT.BEAM_SPAN_EXCEEDS_ASSUMPTION');
    const loadPath = deriveConceptualLoadPath(project);
    expect(loadPath.summary).toMatchObject({ relationshipCount: 18, unsupportedNodeCount: 0 });
    expect(loadPath.nodes).toHaveLength(18);
    const concrete = deriveQuantityTakeoff(project).items.find((item) => item.id === 'concrete');
    expect(concrete.inputs.slabOpeningsDeductedM2).toBeCloseTo(0.48, 6);
    const structuralSheets = project.sheets.filter((sheet) => sheet.number.startsWith('S-'));
    expect(structuralSheets).toHaveLength(2);
    expect(structuralSheets.every((sheet) => sheet.viewports[0].sourceView === 'structural_plan')).toBe(true);
    expect(structuralSheets.every((sheet) => sheet.notes.some((note) => note.includes('not capacity design')))).toBe(
      true,
    );
  });
});
