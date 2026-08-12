import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

function projectWithGrid() {
  const project = createProject('Grid Move');
  const result = executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
    gridId: 'grid_move',
    xAxisCount: 2,
    yAxisCount: 2,
    xSpacing: 4000,
    ySpacing: 5000,
  });
  return result.project;
}

function transform(project, overrides = {}) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
    gridId: 'grid_move',
    ...overrides,
  });
}

describe('TransformStructuralGrid', () => {
  it('moves the grid origin and sets its rotation', () => {
    const result = transform(projectWithGrid(), { origin: { x: 2500, y: -1200 }, rotation: 39 });

    expect(result.ok).toBe(true);
    const grid = result.project.building.systems.structural.gridSystems[0];
    expect(grid.origin).toEqual({ x: 2500, y: -1200 });
    expect(grid.rotation).toBe(39);
    // Axis layout is untouched — this is a transform, not a re-setup.
    expect(grid.axes).toHaveLength(4);
    expect(grid.setup).toMatchObject({ kind: 'regular', xSpacing: 4000 });
  });

  it('keeps the existing rotation when only the origin is given', () => {
    const rotated = transform(projectWithGrid(), { origin: { x: 0, y: 0 }, rotation: 51 }).project;
    const moved = transform(rotated, { origin: { x: 1000, y: 1000 } });

    expect(moved.ok).toBe(true);
    expect(moved.project.building.systems.structural.gridSystems[0].rotation).toBe(51);
  });

  it('carries grid-pinned column stacks along with the transform', () => {
    const project = projectWithGrid();
    const populated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'grid_move',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 300,
    });
    expect(populated.ok).toBe(true);

    const result = transform(populated.project, { origin: { x: 2000, y: 3000 }, rotation: 0 });
    expect(result.ok).toBe(true);
    const stacks = result.project.building.systems.structural.columnStacks;
    expect(stacks.length).toBeGreaterThan(0);
    // First stack sits on axis 1/A — the transformed grid origin itself.
    expect(stacks[0].origin).toEqual({ x: 2000, y: 3000 });
  });

  it('rotates stack origins around the grid origin', () => {
    const project = projectWithGrid();
    const populated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'grid_move',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 300,
    });
    const result = transform(populated.project, { origin: { x: 0, y: 0 }, rotation: 90 });

    const stacks = result.project.building.systems.structural.columnStacks;
    // Axis 2 sits 4000 along local x; rotated 90° (clockwise in y-down SVG
    // space) it lands on +y.
    const moved = stacks.find((stack) => Math.abs(stack.origin.y - 4000) < 1e-6);
    expect(moved).toBeTruthy();
    expect(Math.abs(moved.origin.x)).toBeLessThan(1e-6);
  });

  it('removes the grid but keeps realized columns and their stacks, unpinned', () => {
    const project = projectWithGrid();
    const populated = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: 'grid_move',
      floorIds: project.floors.map((floor) => floor.id),
      columnWidth: 300,
      columnDepth: 300,
    });
    const floorColumnsBefore = populated.project.floors[0].columns.length;
    expect(floorColumnsBefore).toBeGreaterThan(0);

    const result = executeBuildingCommand(populated.project, {
      type: BUILDING_COMMANDS.REMOVE_STRUCTURAL_GRID,
      gridId: 'grid_move',
    });

    expect(result.ok).toBe(true);
    expect(result.project.building.systems.structural.gridSystems).toHaveLength(0);
    expect(result.project.floors[0].columns).toHaveLength(floorColumnsBefore);
    // syncCanonicalBuilding rebuilds a stack for every column that carries a
    // stackId — the reverse index of real geometry survives grid deletion,
    // but the recreated stacks no longer reference the removed grid.
    const stacks = result.project.building.systems.structural.columnStacks;
    expect(stacks.length).toBeGreaterThan(0);
    expect(stacks.every((stack) => !stack.gridIntersection?.gridId)).toBe(true);
    expect(stacks.every((stack) => stack.columnRefs.length > 0)).toBe(true);
  });

  it('removes intent-only stacks along with the grid', () => {
    const result = executeBuildingCommand(projectWithGrid(), {
      type: BUILDING_COMMANDS.REMOVE_STRUCTURAL_GRID,
      gridId: 'grid_move',
    });

    expect(result.ok).toBe(true);
    expect(result.project.building.systems.structural.gridSystems).toHaveLength(0);
    expect(result.project.building.systems.structural.columnStacks).toHaveLength(0);
  });

  it('rejects removing a grid that does not exist', () => {
    const result = executeBuildingCommand(projectWithGrid(), {
      type: BUILDING_COMMANDS.REMOVE_STRUCTURAL_GRID,
      gridId: 'grid_missing',
    });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('grid-not-found');
  });

  it.each([
    ['an unknown grid', { gridId: 'grid_missing', origin: { x: 0, y: 0 } }, 'grid-not-found'],
    ['a non-finite origin', { origin: { x: Number.NaN, y: 0 } }, 'invalid-grid-transform'],
    ['a non-finite rotation', { rotation: Number.POSITIVE_INFINITY }, 'invalid-grid-transform'],
  ])('rejects %s', (_label, overrides, code) => {
    const result = transform(projectWithGrid(), overrides);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(code);
    expect(result.project.building.systems.structural.gridSystems[0].origin).toEqual({ x: 0, y: 0 });
  });
});
