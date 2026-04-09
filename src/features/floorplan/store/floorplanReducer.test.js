import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

describe('floorplanReducer', () => {
  it('initializes derived collections from the project', () => {
    const state = initializeFloorplanState(createProject());

    expect(state.floors).toHaveLength(1);
    expect(state.rooms).toEqual([]);
    expect(state.walls).toEqual([]);
    expect(state.phases).toEqual([]);
    expect(state.entities.floor?.id).toBe(state.project.floors[0].id);
    expect(state.viewport).toEqual(state.editor.viewport);
    expect(state.selection.selectedId).toBeNull();
  });

  it('keeps the derived viewport in sync with editor viewport updates', () => {
    const state = initializeFloorplanState(createProject());
    const nextState = floorplanReducer(state, {
      type: 'SET_VIEWPORT',
      viewport: {
        zoom: 2,
        panX: 120,
        panY: 80,
      },
    });

    expect(nextState.editor.viewport).toEqual(nextState.viewport);
    expect(nextState.viewport.zoom).toBe(2);
    expect(nextState.viewport.panX).toBe(120);
    expect(nextState.viewport.panY).toBe(80);
  });

  it('tracks project history for wall mutations with undo and redo', () => {
    const initialState = initializeFloorplanState(createProject());
    const floorId = initialState.project.floors[0].id;
    const wall = createWall({ x: 0, y: 0 }, { x: 2400, y: 0 });

    const withWall = floorplanReducer(initialState, { type: 'WALL_ADD', floorId, wall });
    expect(withWall.project.floors[0].walls).toHaveLength(1);
    expect(withWall.history).toHaveLength(1);

    const undone = floorplanReducer(withWall, { type: 'UNDO' });
    expect(undone.project.floors[0].walls).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = floorplanReducer(undone, { type: 'REDO' });
    expect(redone.project.floors[0].walls).toHaveLength(1);
    expect(redone.history).toHaveLength(1);
  });
});
