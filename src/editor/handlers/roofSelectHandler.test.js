import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/models';
import { createDrain, createRoofSystem } from '@/domain/roofModels';
import floorplanReducer, { initializeFloorplanState } from '@/features/floorplan/store/floorplanReducer';
import { createRoofSelectHandler } from './roofSelectHandler';
import { createRoofDrainPlaceHandler } from './roofDrainPlaceHandler';
import { createRoofOpeningPlaceHandler } from './roofOpeningPlaceHandler';
import { createRoofParapetPlaceHandler } from './roofParapetPlaceHandler';
import { findContextRoofAt } from './roofContextPick';
import { getProjectRoofs, resolveActiveRoof } from '@/domain/projectRoofs';

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
  const state = initializeFloorplanState({ ...createProject('Roof drag'), roofSystems: [roofSystem] });
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
      roofSystem: state.project.roofSystems[0],
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
    key: (key) =>
      handler().onKeyDown({ key }, state.editor.toolState, state.editor.selectedId, state.editor.selectedType),
  };
}

const drainOf = (state) => state.project.roofSystems[0].drains.find((drain) => drain.id === 'drain_1');

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

  it('Delete mid-drag ends the drag, and a later Escape does not bring the drain back', () => {
    const driver = createDriver(roofState());

    driver.press(DRAIN_AT);
    driver.move({ x: DRAIN_AT.x + 200, y: DRAIN_AT.y });
    driver.key('Delete');

    expect(drainOf(driver.getState())).toBeUndefined();
    expect(driver.getState().editor.toolState.dragging).toBe(false);

    driver.escape();
    expect(drainOf(driver.getState())).toBeUndefined();
  });

  it('Escape still ends a drag whose selection has gone, and cancels nothing', () => {
    const driver = createDriver(roofState());

    driver.press(DRAIN_AT);
    driver.move({ x: DRAIN_AT.x + 200, y: DRAIN_AT.y });
    // Ctrl+Z mid-drag: the undo, then the deselect the toolbar sends with it.
    driver.send({ type: 'UNDO' });
    driver.send({ type: 'DESELECT' });
    const undone = driver.getState();

    driver.escape();

    expect(driver.getState().editor.toolState.dragging).toBe(false);
    // The gesture's entry went with the undo; cancelling now would put back
    // whatever came before the drag.
    expect(driver.getState().project).toBe(undone.project);
    expect(driver.getState().history).toBe(undone.history);
  });
});

/*
 * Several roofs (docs/multi-roof.md §5.2). The roof tools work on the active
 * roof; the others are drawn as context. A select click off the active roof
 * that lands in another one switches to it; a place tool stays put and says so.
 */
function flatRoof(id, name, x0, x1, baseElevation = 3000) {
  return createRoofSystem(name, {
    id,
    roofType: 'flat',
    baseElevation,
    boundaryPolygon: [
      { x: x0, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: 6000 },
      { x: x0, y: 6000 },
    ],
  });
}

function manyRoofState(roofs) {
  const state = initializeFloorplanState({ ...createProject('Many roofs'), roofSystems: roofs });
  return floorplanReducer(state, { type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
}

// The canvas hands the tools the active roof and the others, as SvgCanvas does.
function roofCtx(state, send) {
  const active = resolveActiveRoof(state.project, state.editor.activeRoofId);
  return {
    dispatch: send,
    editorDispatch: send,
    roofSystem: active,
    contextRoofSystems: getProjectRoofs(state.project).filter((roof) => roof.id !== active?.id),
    viewport: { zoom: 0.1 },
  };
}

function manyRoofDriver(roofs) {
  let state = manyRoofState(roofs);
  const actions = [];
  const send = (action) => {
    actions.push(action);
    state = floorplanReducer(state, action);
  };
  const press = (factory, point, event = {}) =>
    factory(roofCtx(state, send)).onMouseDown(
      point,
      { button: 0, target: { dataset: {} }, ...event },
      state.editor.toolState,
    );
  return { getState: () => state, actions, send, press };
}

describe('roof select with several roofs', () => {
  const twoRoofs = () => [flatRoof('roof_a', 'Main roof', 0, 8000), flatRoof('roof_b', 'Garage roof', 10000, 18000)];

  it('a click in another roof makes it the active roof and selects it, and starts no drag', () => {
    const driver = manyRoofDriver(twoRoofs());
    expect(resolveActiveRoof(driver.getState().project, driver.getState().editor.activeRoofId).id).toBe('roof_a');

    driver.press(createRoofSelectHandler, { x: 14000, y: 3000 });

    const { editor, entities } = driver.getState();
    expect(editor.activeRoofId).toBe('roof_b');
    expect(editor.selectedId).toBe('roof_b');
    expect(editor.selectedType).toBe('roofSystem');
    expect(editor.toolState.dragging).toBeFalsy();
    expect(entities.roofSystem.id).toBe('roof_b');
  });

  it('the active roof is still hit first, and a miss on every roof deselects', () => {
    const driver = manyRoofDriver(twoRoofs());
    // Inside the active roof the press lands on it (its derived flat plane).
    driver.press(createRoofSelectHandler, { x: 4000, y: 3000 });
    expect(driver.getState().editor.selectedId).toBe('roof_a-flat');

    driver.press(createRoofSelectHandler, { x: 9000, y: 3000 });
    expect(driver.getState().editor.selectedId).toBeNull();
    expect(resolveActiveRoof(driver.getState().project, driver.getState().editor.activeRoofId).id).toBe('roof_a');
  });

  it('picks the highest roof where outlines overlap, then the smallest', () => {
    const low = flatRoof('roof_low', 'Low', 0, 10000, 3000);
    const high = flatRoof('roof_high', 'High', 4000, 20000, 6000);
    const small = flatRoof('roof_small', 'Small', 4000, 6000, 3000);
    expect(findContextRoofAt([low, high], { x: 5000, y: 3000 }).id).toBe('roof_high');
    expect(findContextRoofAt([low, small], { x: 5000, y: 3000 }).id).toBe('roof_small');
    expect(findContextRoofAt([low, small], { x: 30000, y: 3000 })).toBeNull();
  });
});

describe('roof place tools with several roofs', () => {
  const message = 'That is Garage roof. Select it first to work on it.';
  const twoRoofs = () => [flatRoof('roof_a', 'Main roof', 0, 8000), flatRoof('roof_b', 'Garage roof', 10000, 18000)];
  const added = (driver) => driver.actions.filter((action) => /_ADD$/.test(action.type));

  it('a drain press on another roof names it and places nothing', () => {
    const driver = manyRoofDriver(twoRoofs());
    driver.press(createRoofDrainPlaceHandler, { x: 14000, y: 3000 });
    expect(driver.getState().editor.statusMessage).toBe(message);
    expect(added(driver)).toEqual([]);
    expect(driver.getState().editor.activeRoofId).toBeNull();

    // Off every roof, the old message.
    driver.press(createRoofDrainPlaceHandler, { x: 9000, y: 3000 });
    expect(driver.getState().editor.statusMessage).toBe('Place drains inside the roof boundary.');

    // On the active roof the drain lands there.
    driver.press(createRoofDrainPlaceHandler, { x: 4000, y: 3000 });
    expect(added(driver)).toHaveLength(1);
    expect(added(driver)[0].roofId).toBe('roof_a');
  });

  it('a roof opening press on another roof names it and starts no outline', () => {
    const driver = manyRoofDriver(twoRoofs());
    driver.press(createRoofOpeningPlaceHandler, { x: 14000, y: 3000 });
    expect(driver.getState().editor.statusMessage).toBe(message);
    expect(driver.getState().editor.toolState.roofOpeningPoints || []).toEqual([]);
  });

  it('a parapet press inside another roof names it and starts no free parapet', () => {
    const driver = manyRoofDriver(twoRoofs());
    driver.press(createRoofParapetPlaceHandler, { x: 14000, y: 3000 });
    expect(driver.getState().editor.statusMessage).toBe(message);
    expect(driver.getState().editor.toolState.roofParapetStart || null).toBeNull();

    // Off every roof a free parapet still starts, as before.
    driver.press(createRoofParapetPlaceHandler, { x: 9000, y: 3000 });
    expect(driver.getState().editor.toolState.roofParapetStart).toEqual({ x: 9000, y: 3000 });
  });
});
