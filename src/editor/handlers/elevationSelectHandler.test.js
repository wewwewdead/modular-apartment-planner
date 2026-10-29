import { describe, expect, it } from 'vitest';
import { createFloor, createSlab, createWall, createWindow } from '@/domain/models';
import { createElevationSelectHandler } from './elevationSelectHandler';

/**
 * Dragging a window in the elevation view. The sill is clamped to the wall it
 * is on, so the handler has to clamp against the span the elevation actually
 * drew — a bypass wall is taller than the height stored on it, and a drag that
 * clamped to the stored number would stop short of glass that is on screen.
 */

const WALL_START = { x: 0, y: 0 };
const WALL_END = { x: 6000, y: 0 };

const PLATE = [
  { x: -1000, y: -2000 },
  { x: 7000, y: -2000 },
  { x: 7000, y: 2000 },
  { x: -1000, y: 2000 },
];

function makeProject({ framingMode = 'platform' } = {}) {
  const floor = createFloor('First', 1, { elevation: 3000 });
  const wall = { ...createWall(WALL_START, WALL_END, 200, { height: 2400 }), framingMode };
  const windowItem = { ...createWindow(wall.id, 3000, 1200), height: 1200, sillHeight: 900 };
  floor.walls = [wall];
  floor.windows = [windowItem];
  floor.slabs = [createSlab(floor.id, PLATE, 250, 3000)];
  return { project: { floors: [floor] }, floor, wall, windowItem };
}

function dragTo(project, floor, windowItem, sceneHeight) {
  const dispatched = [];
  const handler = createElevationSelectHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: () => {},
    project,
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewMode: 'elevation_front',
  });

  handler.onMouseMove(
    { x: 3000, y: -sceneHeight },
    {},
    { dragging: true, dragType: 'elevation-window-move' },
    windowItem.id,
    'window',
  );

  return dispatched.find((action) => action.type === 'WINDOW_UPDATE') || null;
}

describe('dragging a window up an elevation', () => {
  it('does not select a window covered by a nearer facade', () => {
    const { project, floor, wall } = makeProject();
    floor.walls.push(createWall({ x: 0, y: -2000 }, { x: 6000, y: -2000 }, 200, { height: wall.height }));
    const actions = [];
    const handler = createElevationSelectHandler({
      dispatch: () => {},
      editorDispatch: (action) => actions.push(action),
      project,
      getFloor: () => floor,
      activeFloorId: floor.id,
      viewMode: 'elevation_front',
    });
    handler.onMouseDown({ x: 3000, y: -4500 }, { button: 0 });
    expect(actions).toEqual([{ type: 'DESELECT' }]);
  });

  it('clamps a platform wall at its own height above the floor', () => {
    const { project, floor, windowItem } = makeProject();

    // 2400 tall, 1200 of window: the sill cannot go past 1200.
    const update = dragTo(project, floor, windowItem, 9999);

    expect(update.window.sillHeight).toBe(1200);
  });

  it('clamps a bypass wall at the floor above, which is where its glass can reach', () => {
    const { project, floor, windowItem } = makeProject({ framingMode: 'bypass' });

    // The wall runs 2750..6000, so 3000 of it is above the floor: 1800 of sill.
    const update = dragTo(project, floor, windowItem, 9999);

    expect(update.window.sillHeight).toBe(1800);
  });

  it('measures a bypass sill from the floor, not from the underside below it', () => {
    const { project, floor, windowItem } = makeProject({ framingMode: 'bypass' });

    // Dragged to 4200 absolute, which is 1200 above the floor at 3000.
    const update = dragTo(project, floor, windowItem, 4200);

    expect(update.window.sillHeight).toBeCloseTo(1200, 6);
  });
});
