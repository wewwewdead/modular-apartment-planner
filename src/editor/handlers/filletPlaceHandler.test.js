import { describe, expect, it } from 'vitest';
import { FILLET_DEFAULT_RADIUS, FILLET_RADIUS_STEP } from '@/domain/defaults';
import { createFloor, createProject, createWall } from '@/domain/models';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { computeFilletGeometry } from '@/geometry/filletGeometry';
import { createFilletPlaceHandler } from './filletPlaceHandler';

/**
 * The fillet tool's preview is what a click applies. Changing the radius with
 * [ and ] has to change that preview at once, or a click that follows without
 * a mouse move rounds the corner at the radius that was on screen before.
 */

function createHarness() {
  const floor = createFloor('Ground', 0);
  floor.walls = [
    { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'wall_x' },
    { ...createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }), id: 'wall_y' },
  ];

  let toolState = {};
  const dispatched = [];
  const handler = createFilletPlaceHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    },
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: 0.1 },
    activePhaseId: null,
  });

  return {
    dispatched,
    getToolState: () => toolState,
    hover: (point) => handler.onMouseMove(point, {}, toolState),
    key: (key) => handler.onKeyDown({ key }, toolState),
    press: (point) => handler.onMouseDown(point, { button: 0 }, toolState),
  };
}

function geometryAt(toolState, radius) {
  const corner = toolState.hoveredCorner;
  return computeFilletGeometry(corner.wall1, corner.wall1Endpoint, corner.wall2, corner.wall2Endpoint, radius);
}

describe('fillet radius keys', () => {
  it('] redraws the preview at the new radius', () => {
    const harness = createHarness();
    harness.hover({ x: 20, y: 20 });
    expect(harness.getToolState().previewGeometry).toEqual(geometryAt(harness.getToolState(), FILLET_DEFAULT_RADIUS));

    harness.key(']');

    const radius = FILLET_DEFAULT_RADIUS + FILLET_RADIUS_STEP;
    expect(harness.getToolState().radius).toBe(radius);
    expect(harness.getToolState().previewGeometry).toEqual(geometryAt(harness.getToolState(), radius));
  });

  it('a click after [ without moving applies the radius on screen', () => {
    const harness = createHarness();
    harness.hover({ x: 20, y: 20 });
    harness.key(']');
    harness.key(']');
    harness.key('[');
    const expected = geometryAt(harness.getToolState(), FILLET_DEFAULT_RADIUS + FILLET_RADIUS_STEP);

    harness.press({ x: 20, y: 20 });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0]).toMatchObject({
      type: 'FILLET_APPLY',
      tangentPoint1: expected.tangentPoint1,
      tangentPoint2: expected.tangentPoint2,
    });
  });

  it('the radius field redraws the preview the same way, and a click applies it', () => {
    let state = initializeFloorplanState(createProject('Fillet'));
    const floorId = state.project.floors[0].id;
    state = floorplanReducer(state, {
      type: 'PROJECT_LOAD',
      project: {
        ...state.project,
        floors: state.project.floors.map((floor) =>
          floor.id === floorId
            ? {
                ...floor,
                walls: [
                  { ...createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }), id: 'wall_x' },
                  { ...createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }), id: 'wall_y' },
                ],
              }
            : floor,
        ),
      },
    });
    state = floorplanReducer(state, { type: 'SET_TOOL', tool: 'fillet' });
    const dispatched = [];
    const send = (action) => {
      state = floorplanReducer(state, action);
    };
    const handler = createFilletPlaceHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: send,
      getFloor: (id) => state.project.floors.find((floor) => floor.id === id) || null,
      activeFloorId: floorId,
      viewport: { zoom: 0.1 },
      activePhaseId: null,
    });
    handler.onMouseMove({ x: 20, y: 20 }, {}, state.editor.toolState);
    const radius = FILLET_DEFAULT_RADIUS + 3 * FILLET_RADIUS_STEP;

    // What the properties panel's Radius field sends.
    send({ type: 'SET_FILLET_RADIUS', radius });

    expect(state.editor.toolState.radius).toBe(radius);
    const expected = geometryAt(state.editor.toolState, radius);
    expect(state.editor.toolState.previewGeometry).toEqual(expected);

    handler.onMouseDown({ x: 20, y: 20 }, { button: 0 }, state.editor.toolState);
    expect(dispatched[0]).toMatchObject({ type: 'FILLET_APPLY', tangentPoint1: expected.tangentPoint1 });
  });

  it('with no corner under the cursor only the radius changes', () => {
    const harness = createHarness();
    harness.hover({ x: 2000, y: 2000 });

    harness.key(']');

    expect(harness.getToolState()).toMatchObject({
      radius: FILLET_DEFAULT_RADIUS + FILLET_RADIUS_STEP,
      hoveredCorner: null,
      previewGeometry: null,
    });
  });
});
