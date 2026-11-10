import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { createDrain, createRoofSystem } from '@/domain/roofModels';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { createRoofSelectHandler } from './roofSelectHandler';

/**
 * A roof drag rewrites the project on every pointer frame, exactly like a
 * column drag on the plan, so Escape has to put it back the same way: through
 * the store's drag gesture, which still holds the pre-drag project.
 */

const DRAIN_AT = { x: 3000, y: 3000 };

function roofState() {
  const roofSystem = createRoofSystem('Flat Roof', {
    id: 'roof_1',
    roofType: 'flat',
    boundaryPolygon: [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    drains: [createDrain(DRAIN_AT, { id: 'drain_1' })],
  });
  const state = initializeFloorplanState({ ...createProject('Roof drag'), roofSystem });
  return floorplanReducer(state, { type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
}

// The canvas rebuilds the handler whenever the roof changes, so each event
// gets one built from the roof as the store has it now.
function createDriver(initialState) {
  let state = initialState;
  const send = (action) => {
    state = floorplanReducer(state, action);
  };
  const handler = () =>
    createRoofSelectHandler({
      dispatch: send,
      editorDispatch: send,
      roofSystem: state.project.roofSystem,
      viewport: { zoom: 0.1 },
    });

  return {
    getState: () => state,
    send,
    press: (point) => {
      send({ type: 'BEGIN_DRAG_GESTURE' });
      handler().onMouseDown(point, { button: 0, target: { dataset: {} } }, state.editor.toolState);
    },
    move: (point) =>
      handler().onMouseMove(point, {}, state.editor.toolState, state.editor.selectedId, state.editor.selectedType),
    escape: () =>
      handler().onKeyDown(
        { key: 'Escape' },
        state.editor.toolState,
        state.editor.selectedId,
        state.editor.selectedType,
      ),
  };
}

const drainOf = (state) => state.project.roofSystem.drains.find((drain) => drain.id === 'drain_1');

describe('roof select drag', () => {
  it('Escape mid-drag puts the drain back and leaves no undo step', () => {
    const before = roofState();
    const driver = createDriver(before);

    driver.press(DRAIN_AT);
    expect(driver.getState().editor.selectedId).toBe('drain_1');
    for (const dx of [100, 200, 300]) driver.move({ x: DRAIN_AT.x + dx, y: DRAIN_AT.y });
    expect(drainOf(driver.getState()).position.x).toBeCloseTo(DRAIN_AT.x + 300, 6);

    driver.escape();

    const after = driver.getState();
    expect(after.project).toBe(before.project);
    expect(after.history).toHaveLength(before.history.length);
    expect(drainOf(after).position).toEqual(DRAIN_AT);
    expect(after.editor.toolState.dragging).toBe(false);
    // The release that follows the key finds nothing left to settle.
    expect(floorplanReducer(after, { type: 'END_DRAG_GESTURE' })).toBe(after);
  });

  it('Escape before the pointer has moved changes nothing in the project', () => {
    const before = roofState();
    const driver = createDriver(before);

    driver.press(DRAIN_AT);
    const pressed = driver.getState();
    driver.escape();

    expect(driver.getState().project).toBe(pressed.project);
    expect(driver.getState().history).toBe(pressed.history);
    expect(driver.getState().editor.toolState.dragging).toBe(false);
  });
});
