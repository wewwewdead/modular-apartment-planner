import { beforeEach, describe, expect, it } from 'vitest';
import { createFloor, createWall } from './models';
import {
  clearCeilingAssemblyCache,
  createCeiling,
  createCeilingDetailing,
  createCeilingDimension,
  createCeilingLightFixture,
  createCeilingOpening,
  deriveCeilingDetail,
  deriveCeilingFasteners,
  deriveCeilingPanels,
  deriveCeilingTakeoff,
} from './ceilingModels';

/**
 * The per-ceiling assembly cache in `ceilingModels.js`: a lighting-only edit
 * must hand back the boards, framing, hangers and screws by reference (that is
 * what lets the RCP layers and the 3D descriptors hold still while a light is
 * placed), and anything the assembly is derived from must let go of them.
 */

const BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

function buildProject() {
  const floor = createFloor('Ground', 0);
  // A partition across the ceiling, so the context has an obstruction to
  // subtract and the regions are more than the bare boundary.
  floor.walls = [createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 }, 100, { height: 3000 })];
  const ceiling = createCeiling('Ceiling', { floorId: floor.id, baseElevation: 3000, boundaryPolygon: BOUNDARY });
  return { project: { id: 'project', floors: [floor], ceilings: [ceiling] }, floor, ceiling };
}

function withCeiling(project, ceiling) {
  return { ...project, ceilings: project.ceilings.map((entry) => (entry.id === ceiling.id ? ceiling : entry)) };
}

// What the RCP editor does on every commit: the whole detailing rebuilt
// through the factory, so every sub-object is a new object.
function editDetailing(ceiling, patch) {
  return { ...ceiling, detailing: createCeilingDetailing({ ...ceiling.detailing, ...patch }) };
}

function addLight(ceiling, u, v) {
  return editDetailing(ceiling, {
    lighting: { fixtures: [...ceiling.detailing.lighting.fixtures, createCeilingLightFixture({ u, v })] },
  });
}

const HEAVY_PARTS = ['panels', 'framing', 'hangers', 'fasteners', 'regions', 'openings', 'boundaryLocal', 'elevations'];

describe('ceiling assembly cache', () => {
  beforeEach(() => clearCeilingAssemblyCache());

  it('hands the heavy parts back by reference across a lighting-only edit', () => {
    const { project, ceiling } = buildProject();
    const before = deriveCeilingDetail(ceiling, project);
    const lit = addLight(ceiling, 1500, 2000);
    const after = deriveCeilingDetail(lit, withCeiling(project, lit));

    expect(before.panels.length).toBeGreaterThan(0);
    expect(before.fasteners.length).toBeGreaterThan(0);
    for (const part of HEAVY_PARTS) expect(after[part], part).toBe(before[part]);
    // The lighting itself is live.
    expect(before.lightFixtures).toHaveLength(0);
    expect(after.lightFixtures).toHaveLength(1);
    expect(after.lightFixtures[0]).toMatchObject({ u: 1500, v: 2000 });
    expect(after.takeoff.lighting.fixtureCount).toBe(1);
    expect(after.configuration.lighting.fixtures).toHaveLength(1);
  });

  it('keeps the parts across a dimension edit and re-derives the dimensions live', () => {
    const { project, ceiling } = buildProject();
    const before = deriveCeilingDetail(ceiling, project);
    const measured = editDetailing(ceiling, {
      dimensions: {
        ...ceiling.detailing.dimensions,
        manual: [createCeilingDimension({ start: { u: 0, v: 0 }, end: { u: 1000, v: 0 } })],
      },
    });
    const after = deriveCeilingDetail(measured, withCeiling(project, measured));

    expect(after.panels).toBe(before.panels);
    expect(after.fasteners).toBe(before.fasteners);
    expect(after.dimensions.length).toBe(before.dimensions.length + 1);
  });

  it('the standalone derivations share the same cached arrays', () => {
    const { project, ceiling } = buildProject();
    const detail = deriveCeilingDetail(ceiling, project);
    expect(deriveCeilingPanels(ceiling, project)).toBe(detail.panels);
    expect(deriveCeilingFasteners(ceiling, project)).toBe(detail.fasteners);
    // The takeoff without parts in hand derives through the same entry.
    expect(deriveCeilingTakeoff(ceiling, project)).toEqual(detail.takeoff);
  });

  it.each([
    [
      'a changed board size',
      (ceiling) =>
        editDetailing(ceiling, {
          face: { ...ceiling.detailing.face, layout: { ...ceiling.detailing.face.layout, boardWidth: 900 } },
        }),
    ],
    [
      'a new opening',
      (ceiling) =>
        editDetailing(ceiling, { openings: [createCeilingOpening({ u: 1000, v: 1000, width: 600, height: 600 })] }),
    ],
    [
      'a changed boundary',
      (ceiling) => ({
        ...ceiling,
        boundarySource: 'drawn',
        boundaryPolygon: BOUNDARY.map((point) => ({ x: point.x, y: point.y === 4000 ? 3500 : point.y })),
      }),
    ],
    ['a changed attachment', (ceiling) => ({ ...ceiling, attachment: { mode: 'beam', beamIds: [] } })],
    ['a changed base elevation', (ceiling) => ({ ...ceiling, baseElevation: 2800 })],
  ])('lets go of the parts on %s', (_label, edit) => {
    const { project, ceiling } = buildProject();
    const before = deriveCeilingDetail(ceiling, project);
    const edited = edit(ceiling);
    const after = deriveCeilingDetail(edited, withCeiling(project, edited));
    expect(after.panels).not.toBe(before.panels);
    expect(after.fasteners).not.toBe(before.fasteners);
  });

  it('lets go of the parts when the floor changes, and when the floor above does', () => {
    const { project, floor, ceiling } = buildProject();
    const before = deriveCeilingDetail(ceiling, project);

    const movedWall = { ...floor, walls: [createWall({ x: 2000, y: 0 }, { x: 2000, y: 4000 }, 100, { height: 3000 })] };
    const afterFloor = deriveCeilingDetail(ceiling, { ...project, floors: [movedWall] });
    expect(afterFloor.regions).not.toBe(before.regions);
    expect(afterFloor.panels).not.toBe(before.panels);

    const above = createFloor('Upper', 3200);
    const withAbove = { ...project, floors: [floor, above] };
    const first = deriveCeilingDetail(ceiling, withAbove);
    const again = deriveCeilingDetail(ceiling, { ...withAbove, floors: [floor, { ...above }] });
    expect(again.panels).not.toBe(first.panels);
  });

  it('answers exactly what an uncached derivation answers', () => {
    const { project, ceiling } = buildProject();
    const lit = addLight(addLight(ceiling, 1000, 1000), 4500, 3000);
    const litProject = withCeiling(project, lit);
    deriveCeilingDetail(ceiling, project);
    const cached = deriveCeilingDetail(lit, litProject);
    clearCeilingAssemblyCache();
    const fresh = deriveCeilingDetail(lit, litProject);
    expect(fresh.panels).not.toBe(cached.panels);
    expect(cached).toEqual(fresh);
  });

  it('holds the model and a second project with other floor objects side by side', () => {
    // The RCP editor asks with the model and its 3D pane with a stripped copy;
    // one slot per ceiling would have each evict the other on every commit.
    const { project, floor, ceiling } = buildProject();
    const copy = { ...project, floors: [{ ...floor }] };
    const model = deriveCeilingDetail(ceiling, project);
    const pane = deriveCeilingDetail(ceiling, copy);
    expect(pane.panels).not.toBe(model.panels);
    expect(deriveCeilingDetail(ceiling, project).panels).toBe(model.panels);
    expect(deriveCeilingDetail(ceiling, copy).panels).toBe(pane.panels);
  });

  it('keeps the eight ceilings asked about most recently', () => {
    const { project, floor } = buildProject();
    const ceilings = Array.from({ length: 9 }, (_, index) =>
      createCeiling(`Ceiling ${index}`, { floorId: floor.id, baseElevation: 3000, boundaryPolygon: BOUNDARY }),
    );
    const multi = { ...project, ceilings };
    const first = deriveCeilingDetail(ceilings[0], multi);
    const second = deriveCeilingDetail(ceilings[1], multi);
    for (const ceiling of ceilings.slice(2)) deriveCeilingDetail(ceiling, multi);

    // The ninth pushed the oldest out; the rest are still held.
    expect(deriveCeilingDetail(ceilings[0], multi).panels).not.toBe(first.panels);
    expect(deriveCeilingDetail(ceilings[1], multi).panels).not.toBe(second.panels);
    const third = deriveCeilingDetail(ceilings[8], multi);
    expect(deriveCeilingDetail(ceilings[8], multi).panels).toBe(third.panels);
  });
});
