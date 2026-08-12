import { describe, expect, it } from 'vitest';
import { createProject } from './models';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';

function projectWithGrid() {
  const result = executeBuildingCommand(createProject('Grid Bays'), {
    type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
    gridId: 'grid_bays',
    xAxisCount: 4,
    yAxisCount: 3,
    xSpacing: 4000,
    ySpacing: 5000,
  });
  return result.project;
}

function withStacks(project) {
  const result = executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
    gridId: 'grid_bays',
    floorIds: project.floors.map((floor) => floor.id),
    columnWidth: 300,
    columnDepth: 300,
  });
  expect(result.ok).toBe(true);
  return result.project;
}

function setBay(project, overrides = {}) {
  return executeBuildingCommand(project, {
    type: BUILDING_COMMANDS.SET_STRUCTURAL_GRID_BAY_SPACING,
    gridId: 'grid_bays',
    orientation: 'vertical',
    bayIndex: 0,
    spacing: 6000,
    ...overrides,
  });
}

function grid(project) {
  return project.building.systems.structural.gridSystems[0];
}

function offsets(project, orientation) {
  return grid(project)
    .axes.filter((axis) => axis.orientation === orientation)
    .sort((a, b) => a.offset - b.offset)
    .map((axis) => axis.offset);
}

/** Bay distances read off the axes — what every other bay must keep. */
function spacings(project, orientation) {
  const sorted = offsets(project, orientation);
  return sorted.slice(1).map((offset, index) => offset - sorted[index]);
}

function stackAt(project, xAxisId, yAxisId) {
  return project.building.systems.structural.columnStacks.find(
    (stack) => stack.gridIntersection?.xAxisId === xAxisId && stack.gridIntersection?.yAxisId === yAxisId,
  );
}

describe('SetStructuralGridBaySpacing', () => {
  it('widens one numbered bay and carries every downstream axis by the same delta', () => {
    const result = setBay(projectWithGrid(), { bayIndex: 0, spacing: 6000 });

    expect(result.ok).toBe(true);
    // Axis 1 held; 2, 3 and 4 all moved +2000, so 2→3 and 3→4 are still 4000.
    expect(offsets(result.project, 'vertical')).toEqual([0, 6000, 10000, 14000]);
    expect(spacings(result.project, 'vertical')).toEqual([6000, 4000, 4000]);
    // The lettered direction is a different set of axes and never moves.
    expect(offsets(result.project, 'horizontal')).toEqual([0, 5000, 10000]);
  });

  it('narrows a middle bay without disturbing the bays before it', () => {
    const result = setBay(projectWithGrid(), { bayIndex: 1, spacing: 3000 });

    expect(result.ok).toBe(true);
    expect(offsets(result.project, 'vertical')).toEqual([0, 4000, 7000, 11000]);
    expect(spacings(result.project, 'vertical')).toEqual([4000, 3000, 4000]);
  });

  it('edits a lettered bay and leaves the numbered axes alone', () => {
    const result = setBay(projectWithGrid(), { orientation: 'horizontal', bayIndex: 0, spacing: 2500 });

    expect(result.ok).toBe(true);
    expect(offsets(result.project, 'horizontal')).toEqual([0, 2500, 7500]);
    expect(spacings(result.project, 'horizontal')).toEqual([2500, 5000]);
    expect(offsets(result.project, 'vertical')).toEqual([0, 4000, 8000, 12000]);
  });

  it('re-resolves pinned stacks downstream of the edited bay and only those', () => {
    const project = withStacks(projectWithGrid());
    expect(stackAt(project, 'grid_bays_x_2', 'grid_bays_y_1').origin).toEqual({ x: 4000, y: 0 });

    const result = setBay(project, { bayIndex: 0, spacing: 6000 });
    expect(result.ok).toBe(true);

    // Axis 1 is upstream of bay 0 — its stacks are exactly where they were.
    expect(stackAt(result.project, 'grid_bays_x_1', 'grid_bays_y_1').origin).toEqual({ x: 0, y: 0 });
    expect(stackAt(result.project, 'grid_bays_x_1', 'grid_bays_y_3').origin).toEqual({ x: 0, y: 10000 });
    // Axes 2 and 4 are downstream, so their pins follow the +2000 shift.
    expect(stackAt(result.project, 'grid_bays_x_2', 'grid_bays_y_1').origin).toEqual({ x: 6000, y: 0 });
    expect(stackAt(result.project, 'grid_bays_x_4', 'grid_bays_y_2').origin).toEqual({ x: 14000, y: 5000 });
  });

  it('reports the re-pinning without claiming realized columns moved', () => {
    const result = setBay(withStacks(projectWithGrid()), { bayIndex: 0, spacing: 6000 });

    expect(result.changes.domain).toEqual([
      { operation: 'replace', entityType: 'structuralGrid', id: 'grid_bays' },
      { operation: 'recompute', entityType: 'columnStackOrigins', gridId: 'grid_bays', movedColumnGeometry: false },
    ]);
  });

  it('stops the grid claiming a uniform spacing it no longer has', () => {
    const before = projectWithGrid();
    expect(grid(before).setup).toMatchObject({ kind: 'regular', xSpacing: 4000, ySpacing: 5000 });

    const result = setBay(before, { bayIndex: 0, spacing: 6000 });

    expect(grid(result.project).setup).toEqual({ kind: 'custom', xAxisCount: 4, yAxisCount: 3 });
  });

  it('treats re-entering the distance a bay already has as a no-op', () => {
    const before = projectWithGrid();
    const result = setBay(before, { bayIndex: 1, spacing: 4000 });

    expect(result.ok).toBe(true);
    expect(result.changes.domain).toEqual([]);
    expect(offsets(result.project, 'vertical')).toEqual([0, 4000, 8000, 12000]);
    // Nothing changed, so the grid is still the regular one it was set up as.
    expect(grid(result.project).setup).toMatchObject({ kind: 'regular', xSpacing: 4000 });
  });

  it.each([
    ['an unknown grid', { gridId: 'grid_missing' }, 'grid-not-found'],
    ['an unknown orientation', { orientation: 'diagonal' }, 'invalid-bay-orientation'],
    ['a missing orientation', { orientation: undefined }, 'invalid-bay-orientation'],
    ['a bay index past the last bay', { bayIndex: 3 }, 'invalid-bay-index'],
    ['a negative bay index', { bayIndex: -1 }, 'invalid-bay-index'],
    ['a fractional bay index', { bayIndex: 1.5 }, 'invalid-bay-index'],
    ['a zero spacing', { spacing: 0 }, 'invalid-bay-spacing'],
    ['a negative spacing', { spacing: -4000 }, 'invalid-bay-spacing'],
    ['a non-finite spacing', { spacing: Number.NaN }, 'invalid-bay-spacing'],
  ])('rejects %s', (_label, overrides, code) => {
    const result = setBay(projectWithGrid(), overrides);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(code);
    expect(offsets(result.project, 'vertical')).toEqual([0, 4000, 8000, 12000]);
  });
});
