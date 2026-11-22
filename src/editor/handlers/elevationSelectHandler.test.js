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

/**
 * Press, move, release and keys as the canvas sends them, with the tool state
 * and selection they leave behind. At zoom 0.1 a pixel is 10 mm.
 */
function createPressHarness() {
  const { project, floor, windowItem } = makeProject();
  let toolState = {};
  let selection = { id: null, type: null };
  const dispatched = [];
  const handler = createElevationSelectHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      if (action.type === 'SELECT_OBJECT') selection = { id: action.id, type: action.objectType };
      if (action.type === 'DESELECT') selection = { id: null, type: null };
    },
    project,
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: 0.1 },
    viewMode: 'elevation_front',
  });

  return {
    windowItem,
    dispatched,
    updates: () => dispatched.filter((action) => action.type === 'WINDOW_UPDATE'),
    getToolState: () => toolState,
    getSelection: () => selection,
    press: (point) => handler.onMouseDown(point, { button: 0 }, toolState),
    move: (point) => handler.onMouseMove(point, {}, toolState, selection.id, selection.type),
    up: (point) => handler.onMouseUp(point, { button: 0 }, toolState),
    key: (key) => handler.onKeyDown({ key }, toolState, selection.id, selection.type),
  };
}

// On the window's glass: sill 900 and 1200 tall on a floor at 3000.
const ON_GLASS = { x: 3000, y: -4500 };

describe('pressing a window on an elevation', () => {
  it('a click with a wobble under 4 px selects the window and moves nothing', () => {
    const harness = createPressHarness();

    harness.press(ON_GLASS);
    harness.move({ x: ON_GLASS.x + 20, y: ON_GLASS.y - 20 });
    harness.up({ x: ON_GLASS.x + 20, y: ON_GLASS.y - 20 });

    expect(harness.getSelection().id).toBe(harness.windowItem.id);
    expect(harness.updates()).toHaveLength(0);
    expect(harness.getToolState()).toMatchObject({ dragging: false, pendingDrag: false });
  });

  it('a move past 4 px starts the drag', () => {
    const harness = createPressHarness();

    harness.press(ON_GLASS);
    harness.move({ x: ON_GLASS.x + 500, y: ON_GLASS.y });

    expect(harness.updates()).toHaveLength(1);
    expect(harness.getToolState().dragging).toBe(true);
  });

  it('Escape mid-drag hands the window back to the store to put back and ends the drag', () => {
    const harness = createPressHarness();

    harness.press(ON_GLASS);
    harness.move({ x: ON_GLASS.x + 500, y: ON_GLASS.y });
    harness.key('Escape');

    expect(harness.dispatched.at(-1)).toEqual({ type: 'CANCEL_DRAG_GESTURE' });
    expect(harness.getToolState()).toMatchObject({ dragging: false, pendingDrag: false, dragType: null });
    // The selection stays, as it does for every drag Escape reverts.
    expect(harness.getSelection().id).toBe(harness.windowItem.id);

    harness.move({ x: ON_GLASS.x + 900, y: ON_GLASS.y });
    expect(harness.updates()).toHaveLength(1);
  });

  it('Delete mid-drag ends the drag, so a later Escape does not bring the window back', () => {
    const harness = createPressHarness();

    harness.press(ON_GLASS);
    harness.move({ x: ON_GLASS.x + 500, y: ON_GLASS.y });
    harness.key('Delete');

    expect(harness.getToolState().dragging).toBe(false);

    harness.key('Escape');
    expect(harness.dispatched.map((action) => action.type)).not.toContain('CANCEL_DRAG_GESTURE');
  });
});
