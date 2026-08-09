import { describe, expect, it } from 'vitest';
import { createProject, createWall, createWindow } from '@/domain/models';
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

  it('keeps undo working across a gesture that changed nothing', () => {
    const { state } = planWithWindow();
    const opened = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    const closed = floorplanReducer(opened, { type: 'END_DRAG_GESTURE' });

    expect(closed.history).toEqual(state.history);
    expect(closed.project).toBe(state.project);
  });
});
