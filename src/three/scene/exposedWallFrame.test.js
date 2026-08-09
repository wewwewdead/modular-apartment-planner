import { describe, expect, it } from 'vitest';
import { createFloor, createProject, createWall } from '@/domain/models';
import { WALL_ASSEMBLY_PRESETS } from '@/domain/wallAssemblies';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { buildFloorPreviewObjects } from './objectBuilders';
import { buildPreviewScene } from './buildPreviewScene';

// Board faces are hidden so the frame behind them can be inspected in 3D. Every
// wall descriptor tags itself with `assemblySide`: 'core' is framing, and
// 'interior'/'exterior' are the two board faces.
const wallsOf = (objects) => objects.filter((object) => object.metadata?.wallId);
const sidesIn = (objects) => new Set(objects.map((object) => object.metadata?.assemblySide));

function floorWith(preset) {
  const floor = createFloor('Ground Floor', 0);
  floor.elevation = 0;
  floor.walls = [
    {
      ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 150, { assembly: { preset }, height: 2400 }),
      id: 'wall_1',
    },
  ];
  return floor;
}

// `mixed_board` boards both faces, which is what makes per-side visible.
const build = (hiddenSides) =>
  wallsOf(
    buildFloorPreviewObjects(floorWith(WALL_ASSEMBLY_PRESETS.MIXED_BOARD), {
      hiddenBoardSides: hiddenSides ? new Map([['wall_1', hiddenSides]]) : undefined,
    }),
  );

describe('hiding board faces in the 3D preview', () => {
  it('shows both faces and the frame normally', () => {
    expect(sidesIn(build(null))).toEqual(new Set(['core', 'interior', 'exterior']));
  });

  it('hides only the inside face, leaving the outside clad', () => {
    const sides = sidesIn(build(['interior']));

    expect(sides.has('interior')).toBe(false);
    expect(sides.has('exterior')).toBe(true);
    expect(sides.has('core')).toBe(true);
  });

  it('hides only the outside face, leaving the inside clad', () => {
    const sides = sidesIn(build(['exterior']));

    expect(sides.has('exterior')).toBe(false);
    expect(sides.has('interior')).toBe(true);
    expect(sides.has('core')).toBe(true);
  });

  it('hides both faces, leaving the frame alone', () => {
    expect(sidesIn(build(['interior', 'exterior']))).toEqual(new Set(['core']));
  });

  // The point of the toggle: a solid core slab is not a frame to inspect.
  it('exposes real studs and tracks even though detailing is off', () => {
    const framing = build(['interior']).filter((object) => object.metadata.assemblySide === 'core');

    expect(framing.every((object) => object.metadata.wallDetailKind === 'framing')).toBe(true);
    const kinds = new Set(framing.map((object) => object.metadata.framingKind));
    expect(kinds.has('stud')).toBe(true);
    expect(kinds.has('bottom_track')).toBe(true);
    expect(kinds.has('top_track')).toBe(true);
  });

  it('leaves other walls fully clad', () => {
    const floor = floorWith(WALL_ASSEMBLY_PRESETS.MIXED_BOARD);
    floor.walls.push({
      ...createWall({ x: 0, y: 3000 }, { x: 4000, y: 3000 }, 150, {
        assembly: { preset: WALL_ASSEMBLY_PRESETS.MIXED_BOARD },
        height: 2400,
      }),
      id: 'wall_2',
    });

    const objects = wallsOf(
      buildFloorPreviewObjects(floor, { hiddenBoardSides: new Map([['wall_1', ['interior', 'exterior']]]) }),
    );
    const sidesFor = (wallId) => sidesIn(objects.filter((object) => object.metadata.wallId === wallId));

    expect(sidesFor('wall_1')).toEqual(new Set(['core']));
    expect(sidesFor('wall_2')).toEqual(new Set(['core', 'interior', 'exterior']));
  });

  // A CHB wall has no frame inside, so the panel never offers the control — but
  // the builder must not strip a masonry wall to nothing if an id leaks through.
  it('never empties a masonry wall', () => {
    const objects = wallsOf(
      buildFloorPreviewObjects(floorWith(WALL_ASSEMBLY_PRESETS.CHB), {
        hiddenBoardSides: new Map([['wall_1', ['interior', 'exterior']]]),
      }),
    );

    expect(objects.length).toBeGreaterThan(0);
  });
});

describe('the control is a viewing state, not a model edit', () => {
  const setSides = (state, wallId, hiddenSides) =>
    floorplanReducer(state, { type: 'SET_WALL_BOARD_VISIBILITY', wallId, hiddenSides });

  it('records the faces chosen and clears back to nothing', () => {
    let state = initializeFloorplanState(createProject());
    expect(state.editor.hiddenWallBoards).toEqual({});

    state = setSides(state, 'wall_1', ['interior']);
    expect(state.editor.hiddenWallBoards).toEqual({ wall_1: ['interior'] });

    state = setSides(state, 'wall_1', ['interior', 'exterior']);
    expect(state.editor.hiddenWallBoards).toEqual({ wall_1: ['interior', 'exterior'] });

    // Nothing hidden has exactly one representation: the key is dropped.
    state = setSides(state, 'wall_1', []);
    expect(state.editor.hiddenWallBoards).toEqual({});
  });

  it('ignores a side that is not a real face', () => {
    const state = setSides(initializeFloorplanState(createProject()), 'wall_1', ['sideways']);

    expect(state.editor.hiddenWallBoards).toEqual({});
  });

  it('is a no-op when the selection has not changed', () => {
    const before = setSides(initializeFloorplanState(createProject()), 'wall_1', ['interior']);
    const after = setSides(before, 'wall_1', ['interior']);

    expect(after).toBe(before);
  });

  it('never touches the project, history or the dirty flag', () => {
    const before = initializeFloorplanState(createProject());
    const after = setSides(before, 'wall_1', ['interior']);

    expect(after.project).toBe(before.project);
    expect(after.history).toBe(before.history);
    expect(after.isDirty).toBe(before.isDirty);
    expect(after.changeVersion).toBe(before.changeVersion);
  });

  it('forgets hidden faces when another project is loaded', () => {
    let state = setSides(initializeFloorplanState(createProject()), 'wall_1', ['interior']);

    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project: createProject() });

    expect(state.editor.hiddenWallBoards).toEqual({});
  });
});

describe('preview scene cache invalidation', () => {
  const project = () => ({ floors: [floorWith(WALL_ASSEMBLY_PRESETS.MIXED_BOARD)] });
  const keyFor = (hiddenWallBoards) =>
    buildPreviewScene(project(), { hiddenWallBoards }).floors[0].sourceKey.strippedHere;

  it('changes the floor source key when a face is hidden', () => {
    // A matching key would let the cache reuse the old geometry and the control
    // would silently do nothing on screen.
    expect(keyFor({ wall_1: ['interior'] })).not.toBe(keyFor({}));
  });

  it('distinguishes one hidden face from the other', () => {
    expect(keyFor({ wall_1: ['interior'] })).not.toBe(keyFor({ wall_1: ['exterior'] }));
  });

  it('distinguishes one hidden face from both', () => {
    expect(keyFor({ wall_1: ['interior'] })).not.toBe(keyFor({ wall_1: ['interior', 'exterior'] }));
  });

  it('keeps the key stable for a floor holding no hidden wall', () => {
    expect(keyFor({ wall_on_another_floor: ['interior'] })).toBe(keyFor({}));
  });
});
