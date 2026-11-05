import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createProject, createStair, createWall, createWindow } from '@/domain/models';
import { createCeiling, createCeilingDetailing, createCeilingLightFixture } from '@/domain/ceilingModels';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

/**
 * A pointer drag emits one project mutation per frame. These guard the two
 * things that made that expensive: a coordination pass and an undo entry for
 * every frame of the drag.
 */

function planWithWindow() {
  let state = initializeFloorplanState(createProject());
  const floorId = state.project.floors[0].id;
  const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
  state = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall });
  const windowItem = createWindow(wall.id, 2000, 1200);
  state = floorplanReducer(state, { type: 'WINDOW_ADD', floorId, window: windowItem });
  return { state, floorId, windowId: windowItem.id };
}

function slideWindow(state, floorId, windowId, offset) {
  return floorplanReducer(state, { type: 'WINDOW_UPDATE', floorId, window: { id: windowId, offset } });
}

/**
 * A framed bay with a stair standing in it. The beam is what gives the
 * structure-fitting pass real work to do, so a stair drag through this plan
 * genuinely exercises the wall-fit memo rather than its empty-pool shortcut.
 */
function framedBayWithStair() {
  let state = initializeFloorplanState(createProject());
  const floorId = state.project.floors[0].id;
  const start = createColumn(0, 0, 300, 300, { height: 3000 });
  const end = createColumn(6000, 0, 300, 300, { height: 3000 });
  state = floorplanReducer(state, { type: 'COLUMN_ADD', floorId, column: start });
  state = floorplanReducer(state, { type: 'COLUMN_ADD', floorId, column: end });
  state = floorplanReducer(state, {
    type: 'BEAM_ADD',
    floorId,
    beam: createBeam({ kind: 'column', id: start.id }, { kind: 'column', id: end.id }, 200, 400, 3000),
  });
  state = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall: createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }) });
  const stair = createStair({ x: 2000, y: 2000 }, 1000, 16, 175, 250);
  state = floorplanReducer(state, { type: 'STAIR_ADD', floorId, stair });
  return { state, floorId, stairId: stair.id };
}

function slideStair(state, floorId, stairId, x) {
  return floorplanReducer(state, { type: 'STAIR_UPDATE', floorId, stair: { id: stairId, startPoint: { x, y: 2000 } } });
}

describe('drag gestures', () => {
  it('records one history entry for a whole drag, not one per frame', () => {
    const { state, floorId, windowId } = planWithWindow();
    const historyBefore = state.history.length;
    const projectBeforeDrag = state.project;

    let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    for (let offset = 2100; offset <= 3000; offset += 100) {
      dragged = slideWindow(dragged, floorId, windowId, offset);
    }
    dragged = floorplanReducer(dragged, { type: 'END_DRAG_GESTURE' });

    expect(dragged.history).toHaveLength(historyBefore + 1);
    expect(dragged.project.floors[0].windows[0].offset).toBe(3000);

    // One undo steps back over the entire drag.
    const undone = floorplanReducer(dragged, { type: 'UNDO' });
    expect(undone.project).toBe(projectBeforeDrag);
    expect(undone.project.floors[0].windows[0].offset).toBe(2000);
  });

  it('still records one entry per edit outside a gesture', () => {
    const { state, floorId, windowId } = planWithWindow();
    const historyBefore = state.history.length;

    let edited = state;
    for (let offset = 2100; offset <= 2300; offset += 100) {
      edited = slideWindow(edited, floorId, windowId, offset);
    }

    expect(edited.history).toHaveLength(historyBefore + 3);
  });

  it('holds the coordination models still during a drag and refreshes them on release', () => {
    const { state, floorId } = planWithWindow();
    const derivedBefore = state.derived;

    let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    dragged = floorplanReducer(dragged, {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }),
    });

    // Geometry is live mid-drag; the whole-project models are not recomputed.
    expect(dragged.project.floors[0].walls).toHaveLength(2);
    expect(dragged.derived).toBe(derivedBefore);
    expect(dragged.gesture.derivedStale).toBe(true);

    const released = floorplanReducer(dragged, { type: 'END_DRAG_GESTURE' });
    expect(released.derived).not.toBe(derivedBefore);
    expect(released.gesture.derivedStale).toBe(false);
    expect(released.derived.quantityTakeoff).toEqual(
      floorplanReducer(released, { type: 'END_DRAG_GESTURE' }).derived.quantityTakeoff,
    );
  });

  it('leaves state untouched when a release arrives with no drag open', () => {
    const { state } = planWithWindow();
    expect(floorplanReducer(state, { type: 'END_DRAG_GESTURE' })).toBe(state);
  });

  it('recovers a lost release: the next gesture still settles the stale models', () => {
    const { state, floorId } = planWithWindow();
    const derivedBefore = state.derived;

    // Drag one: the pointer-up never arrives (released off-window, alt-tab).
    let abandoned = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    abandoned = floorplanReducer(abandoned, {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }),
    });
    expect(abandoned.derived).toBe(derivedBefore);

    // Drag two begins without the first ever ending; the stale flag carries over
    // so its release recomputes what the abandoned drag left behind.
    const reopened = floorplanReducer(abandoned, { type: 'BEGIN_DRAG_GESTURE' });
    expect(reopened.gesture.derivedStale).toBe(true);

    const released = floorplanReducer(reopened, { type: 'END_DRAG_GESTURE' });
    expect(released.derived).not.toBe(derivedBefore);
  });

  it('a settled edit after a lost release refreshes the models itself', () => {
    const { state, floorId } = planWithWindow();
    const derivedBefore = state.derived;

    let abandoned = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    abandoned = floorplanReducer(abandoned, {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 0, y: 0 }, { x: 0, y: 4000 }),
    });
    // A keyboard/panel edit with the gesture flag stuck open would otherwise keep
    // skipping the coordination pass forever.
    const settled = floorplanReducer(floorplanReducer(abandoned, { type: 'END_DRAG_GESTURE' }), {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 8000, y: 0 }, { x: 8000, y: 4000 }),
    });

    expect(settled.derived).not.toBe(derivedBefore);
    expect(settled.gesture.derivedStale).toBe(false);
  });

  it('drags a stair on the same terms as anything else on the plan', () => {
    const { state, floorId, stairId } = framedBayWithStair();
    const historyBefore = state.history.length;
    const derivedBefore = state.derived;
    const projectBeforeDrag = state.project;
    const wallsBefore = state.project.floors[0].walls;

    let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    for (let x = 2100; x <= 3000; x += 100) {
      dragged = slideStair(dragged, floorId, stairId, x);

      // Nothing on the plan moved except the stair: the structure-fitting pass
      // has to recognise the walls it already settled and hand them back by
      // reference. Re-fitting them would churn geometry every frame and break
      // the preview's ability to tell what actually changed.
      expect(dragged.project.floors[0].walls).toBe(wallsBefore);
    }

    expect(dragged.derived).toBe(derivedBefore);
    expect(dragged.gesture.derivedStale).toBe(true);
    expect(dragged.project.floors[0].stairs[0].startPoint.x).toBe(3000);

    const released = floorplanReducer(dragged, { type: 'END_DRAG_GESTURE' });
    expect(released.derived).not.toBe(derivedBefore);
    expect(released.history).toHaveLength(historyBefore + 1);
    expect(floorplanReducer(released, { type: 'UNDO' }).project).toBe(projectBeforeDrag);
  });

  it('keeps undo working across a gesture that changed nothing', () => {
    const { state } = planWithWindow();
    const opened = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    const closed = floorplanReducer(opened, { type: 'END_DRAG_GESTURE' });

    expect(closed.history).toEqual(state.history);
    expect(closed.project).toBe(state.project);
  });
});

/**
 * The ceiling RCP's edits are read by none of the whole-project coordination
 * models, so the editor sends them with `coordination: 'defer'` and settles the
 * models itself when it goes idle or closes (see `createDragGesture`).
 */
describe('deferred coordination for assembly edits', () => {
  function planWithCeiling() {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    state = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall: createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }) });
    const ceiling = createCeiling('Ceiling', {
      floorId,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ],
    });
    state = floorplanReducer(state, { type: 'CEILING_ADD', ceiling });
    return { state, floorId, ceilingId: ceiling.id };
  }

  function placeLight(state, ceilingId, u, options = {}) {
    const ceiling = state.project.ceilings.find((entry) => entry.id === ceilingId);
    const fixtures = [...ceiling.detailing.lighting.fixtures, createCeilingLightFixture({ u, v: 1500 })];
    return floorplanReducer(state, {
      type: 'CEILING_UPDATE',
      ceiling: {
        id: ceilingId,
        detailing: createCeilingDetailing({ ...ceiling.detailing, lighting: { fixtures } }),
      },
      ...options,
    });
  }

  it('records one history entry, leaves the models untouched and flags them stale', () => {
    const { state, ceilingId } = planWithCeiling();
    const historyBefore = state.history.length;

    const placed = placeLight(state, ceilingId, 1000, { coordination: 'defer' });

    expect(placed.project.ceilings[0].detailing.lighting.fixtures).toHaveLength(1);
    expect(placed.history).toHaveLength(historyBefore + 1);
    expect(placed.derived).toBe(state.derived);
    expect(placed.gesture.active).toBe(false);
    expect(placed.gesture.derivedStale).toBe(true);
    expect(placed.gesture.deferredCoordination).toBe(true);
  });

  it("survives a plain pointer release and settles on the editor's own END", () => {
    const { state, ceilingId } = planWithCeiling();
    const placed = placeLight(state, ceilingId, 1000, { coordination: 'defer' });

    // The floor plan under the overlay fires END on every window pointer-up —
    // including the mouse-up of the click that placed the light.
    expect(floorplanReducer(placed, { type: 'END_DRAG_GESTURE' })).toBe(placed);

    const settled = floorplanReducer(placed, { type: 'END_DRAG_GESTURE', settleDeferred: true });
    expect(settled.derived).not.toBe(state.derived);
    expect(settled.gesture.derivedStale).toBe(false);
    expect(settled.gesture.deferredCoordination).toBe(false);
    expect(settled.derived.quantityTakeoff).toEqual(placeLight(state, ceilingId, 1000).derived.quantityTakeoff);
    // A second settle has nothing left to do.
    expect(floorplanReducer(settled, { type: 'END_DRAG_GESTURE', settleDeferred: true })).toBe(settled);
  });

  it('keeps deferring across consecutive deferred edits, one history entry each', () => {
    const { state, ceilingId } = planWithCeiling();
    const historyBefore = state.history.length;
    let placed = state;
    for (const u of [1000, 2000, 3000]) placed = placeLight(placed, ceilingId, u, { coordination: 'defer' });

    expect(placed.history).toHaveLength(historyBefore + 3);
    expect(placed.derived).toBe(state.derived);
    expect(placed.gesture.derivedStale).toBe(true);
  });

  it('is settled by the next ordinary edit of any kind', () => {
    const { state, floorId, ceilingId } = planWithCeiling();
    const placed = placeLight(state, ceilingId, 1000, { coordination: 'defer' });
    const walled = floorplanReducer(placed, {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 0, y: 4000 }, { x: 6000, y: 4000 }),
    });

    expect(walled.derived).not.toBe(state.derived);
    expect(walled.gesture.derivedStale).toBe(false);
    expect(walled.gesture.deferredCoordination).toBe(false);
  });

  it('changes nothing inside an open drag gesture', () => {
    const { state, ceilingId } = planWithCeiling();
    const historyBefore = state.history.length;
    let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    dragged = placeLight(dragged, ceilingId, 1000, { coordination: 'defer' });
    dragged = placeLight(dragged, ceilingId, 1200, { coordination: 'defer' });

    expect(dragged.gesture.active).toBe(true);
    expect(dragged.derived).toBe(state.derived);
    expect(dragged.history).toHaveLength(historyBefore + 1);

    // The drag's own release settles it — no settleDeferred needed.
    const released = floorplanReducer(dragged, { type: 'END_DRAG_GESTURE' });
    expect(released.derived).not.toBe(state.derived);
    expect(released.gesture).toEqual({
      active: false,
      historyRecorded: false,
      derivedStale: false,
      deferredCoordination: false,
    });
  });

  it('undoes deferred edits one at a time', () => {
    const { state, ceilingId } = planWithCeiling();
    const first = placeLight(state, ceilingId, 1000, { coordination: 'defer' });
    const second = placeLight(first, ceilingId, 2000, { coordination: 'defer' });

    const undone = floorplanReducer(second, { type: 'UNDO' });
    expect(undone.project).toBe(first.project);
    expect(undone.project.ceilings[0].detailing.lighting.fixtures).toHaveLength(1);
    const undoneTwice = floorplanReducer(undone, { type: 'UNDO' });
    expect(undoneTwice.project).toBe(state.project);
    expect(floorplanReducer(undoneTwice, { type: 'REDO' }).project).toBe(first.project);
  });
});
