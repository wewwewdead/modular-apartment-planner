import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createProject, createWall } from './models';
import { createFloorAboveHighest } from './floorModels';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { resolveWallStructureFit, syncProjectWallHeights } from './wallFit';

// The beam capping a storey is normally drawn while the storey ABOVE is active,
// because that is the beam framing that floor's slab. It is one physical member
// at an absolute level, and the wall below has to stop under it — even though it
// is filed in a different floor's `beams` array.
//
// This is what made the bug look ground-floor-only: the topmost storey's cap is
// placed on the storey itself, so only the floors with something above them were
// left running their walls through a beam.

const COLUMN_HEIGHT = 3000;
const BEAM_DEPTH = 450;
const BAY = 3500;

function twoStoreyState() {
  let state = initializeFloorplanState(createProject());
  const groundId = state.project.floors[0].id;

  state = floorplanReducer(state, { type: 'FLOOR_ADD', floor: createFloorAboveHighest(state.project.floors) });
  const upperId = state.project.floors[1].id;

  for (const [floorId, suffix] of [
    [groundId, 'g'],
    [upperId, 'u'],
  ]) {
    for (const [x, name] of [
      [0, 'a'],
      [BAY, 'b'],
    ]) {
      state = floorplanReducer(state, {
        type: 'COLUMN_ADD',
        floorId,
        column: { ...createColumn(x, 0, 300, 300, { height: COLUMN_HEIGHT }), id: `col_${name}_${suffix}` },
      });
    }
  }

  return { state, groundId, upperId };
}

function addBeam(state, floorId, suffix, floorLevel, id) {
  return floorplanReducer(state, {
    type: 'BEAM_ADD',
    floorId,
    beam: {
      ...createBeam(
        { kind: 'column', id: `col_a_${suffix}` },
        { kind: 'column', id: `col_b_${suffix}` },
        250,
        BEAM_DEPTH,
        floorLevel,
      ),
      id,
    },
  });
}

function addWall(state, floorId, id) {
  return floorplanReducer(state, {
    type: 'WALL_ADD',
    floorId,
    wall: { ...createWall({ x: 0, y: 0 }, { x: BAY, y: 0 }, 150), id },
  });
}

const findFloor = (state, id) => state.project.floors.find((floor) => floor.id === id);
const findWall = (state, floorId, wallId) => findFloor(state, floorId).walls.find((wall) => wall.id === wallId);

describe('a wall stops under the beam capping its storey, wherever that beam is filed', () => {
  it('fits a ground-floor wall to a beam stored on the floor above', () => {
    let { state, groundId, upperId } = twoStoreyState();
    // The upper floor's slab beam: absolute level 3000, so it occupies 2550..3000
    // — exactly the top of the ground storey.
    state = addBeam(state, upperId, 'u', COLUMN_HEIGHT, 'beam_upper_slab');
    state = addWall(state, groundId, 'wall_gf');

    const wall = findWall(state, groundId, 'wall_gf');

    expect(wall.height).toBe(COLUMN_HEIGHT - BEAM_DEPTH);
    expect(wall.baseOffset).toBe(0);
  });

  it('refits when that beam is added after the wall', () => {
    let { state, groundId, upperId } = twoStoreyState();
    state = addWall(state, groundId, 'wall_gf');
    expect(findWall(state, groundId, 'wall_gf').height).toBe(3000);

    // Adding a beam on ANOTHER floor has to invalidate this floor's memo.
    state = addBeam(state, upperId, 'u', COLUMN_HEIGHT, 'beam_upper_slab');

    expect(findWall(state, groundId, 'wall_gf').height).toBe(COLUMN_HEIGHT - BEAM_DEPTH);
  });

  it('stands on the ground floor beam while stopping under the one above', () => {
    let { state, groundId, upperId } = twoStoreyState();
    // Plinth on the ground floor topping out at 450, cap beam filed upstairs.
    state = addBeam(state, groundId, 'g', 450, 'beam_plinth');
    state = addBeam(state, upperId, 'u', COLUMN_HEIGHT, 'beam_upper_slab');
    state = addWall(state, groundId, 'wall_gf');

    const wall = findWall(state, groundId, 'wall_gf');

    expect(wall.baseOffset).toBe(450);
    expect(wall.height).toBe(COLUMN_HEIGHT - BEAM_DEPTH - 450);
  });

  it('does not reach up to a beam belonging to a storey above its own', () => {
    let { state, groundId, upperId } = twoStoreyState();
    // Only a beam capping the UPPER storey, at 6000. Nothing caps the ground
    // floor, so its wall must keep its height rather than grow to 5550.
    state = addBeam(state, upperId, 'u', 2 * COLUMN_HEIGHT, 'beam_upper_roof');
    state = addWall(state, groundId, 'wall_gf');

    expect(findWall(state, groundId, 'wall_gf').height).toBe(3000);
  });

  it('reuses the pool so an unrelated edit keeps floor identity', () => {
    let { state, groundId, upperId } = twoStoreyState();
    state = addBeam(state, upperId, 'u', COLUMN_HEIGHT, 'beam_upper_slab');
    state = addWall(state, groundId, 'wall_gf');

    const settled = state.project;

    expect(syncProjectWallHeights(settled)).toBe(settled);
  });

  it('reports the beam it used, so the panel can name it', () => {
    let { state, groundId, upperId } = twoStoreyState();
    state = addBeam(state, upperId, 'u', COLUMN_HEIGHT, 'beam_upper_slab');
    state = addWall(state, groundId, 'wall_gf');

    const fit = resolveWallStructureFit(
      findWall(state, groundId, 'wall_gf'),
      findFloor(state, groundId),
      state.project.floors,
    );

    expect(fit).toMatchObject({ beamId: 'beam_upper_slab', top: COLUMN_HEIGHT - BEAM_DEPTH });
  });
});
