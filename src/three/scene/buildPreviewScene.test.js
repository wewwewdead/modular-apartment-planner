import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createFloor } from '@/domain/models';
import { createCeilingForProject } from '@/domain/ceilingModels';
import { buildPreviewScene } from './buildPreviewScene';

/**
 * A ceiling is filed on the floor it hangs in, but its extent comes from the
 * slab of the floor ABOVE — so the cache key that decides whether a floor's
 * geometry can be reused has to see that slab. Without it, pulling a slab edge
 * out over a cantilever leaves the ceiling below it cached at its old size.
 */

const CANTILEVERED_SLAB = [
  { x: 0, y: 0 },
  { x: 7500, y: 0 },
  { x: 7500, y: 4000 },
  { x: 0, y: 4000 },
];

function slabAbove(floorId, boundaryPoints) {
  return { id: 'slab_above', floorId, elevation: 3200, thickness: 200, boundaryPoints };
}

function stackedProject() {
  const ground = createFloor('Ground', 0, { elevation: 0, floorToFloorHeight: 3200 });
  ground.columns = [
    ['col_sw', 0, 0],
    ['col_se', 6000, 0],
    ['col_ne', 6000, 4000],
    ['col_nw', 0, 4000],
  ].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));
  ground.beams = [
    ['beam_s', 'col_sw', 'col_se'],
    ['beam_n', 'col_nw', 'col_ne'],
    ['beam_w', 'col_sw', 'col_nw'],
    ['beam_e', 'col_se', 'col_ne'],
  ].map(([id, startId, endId]) => ({
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, 3200),
    id,
  }));

  const upper = createFloor('First', 1, { elevation: 3200, floorToFloorHeight: 3200 });
  upper.slabs = [
    slabAbove(upper.id, [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]),
  ];

  const project = { id: 'project', name: 'Stack', floors: [ground, upper], ceilings: [], trussSystems: [] };
  project.ceilings = [createCeilingForProject(project, { floorId: ground.id })];
  return { project, groundId: ground.id, upperId: upper.id };
}

function pullSlabOut(project, upperId) {
  return {
    ...project,
    floors: project.floors.map((floor) =>
      floor.id === upperId ? { ...floor, slabs: [slabAbove(upperId, CANTILEVERED_SLAB)] } : floor,
    ),
  };
}

describe('preview scene cache key — ceilings under a slab above', () => {
  it('changes the key of a ceiling floor when the slab over it is dragged out', () => {
    const { project, groundId, upperId } = stackedProject();
    const pulled = pullSlabOut(project, upperId);

    const before = buildPreviewScene(project, { activeFloorId: groundId }).floors[0];
    const after = buildPreviewScene(pulled, { activeFloorId: groundId }).floors[0];

    // Nothing on the ground floor itself moved — the whole point is that its own
    // identity cannot answer for the ceiling.
    expect(after.sourceKey.floor).toBe(before.sourceKey.floor);
    expect(after.sourceKey.slabsAbove).not.toBe(before.sourceKey.slabsAbove);
    // ...and the ceiling really did follow the slab out over the cantilever.
    expect(before.bounds.maxX).toBeLessThan(7000);
    expect(after.bounds.maxX).toBeCloseTo(7500, 6);
  });

  it('leaves a floor carrying no ceiling out of it', () => {
    const { project, groundId, upperId } = stackedProject();

    const withCeiling = buildPreviewScene(project, { activeFloorId: groundId }).floors[0];
    const without = buildPreviewScene({ ...project, ceilings: [] }, { activeFloorId: groundId }).floors[0];

    expect(withCeiling.sourceKey.slabsAbove).toBe(project.floors[1].slabs);
    // No ceiling here, so the slab above is nothing to this floor and an edit up
    // there must not throw its geometry away.
    expect(without.sourceKey.slabsAbove).toBeNull();
    expect(buildPreviewScene(project, { activeFloorId: upperId }).floors[1].sourceKey.slabsAbove).toBeNull();
  });
});
