import { describe, expect, it } from 'vitest';
import {
  createColumn,
  createDoor,
  createElectricalDevice,
  createFixture,
  createLanding,
  createProject,
  createRailing,
  createStair,
  createWall,
  createWindow,
} from '@/domain/models';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

/**
 * Escape mid-drag puts every per-frame drag back where it started (the slab
 * drag has its own restore and is not exercised here). Each family is dragged
 * through the very actions the select tool dispatches for it, then cancelled.
 */

function planWith(objects) {
  const wall = { ...createWall({ x: 0, y: 0 }, { x: 8000, y: 0 }), id: 'wall_host' };
  const project = createProject('Cancel');
  const floor = { ...project.floors[0], walls: [wall], ...objects(wall) };
  let state = initializeFloorplanState({ ...project, floors: [floor] });
  // Something already in the history, so "unchanged" means more than empty.
  state = floorplanReducer(state, {
    type: 'WALL_ADD',
    floorId: floor.id,
    wall: createWall({ x: 0, y: 6000 }, { x: 8000, y: 6000 }),
  });
  return { state, floorId: floor.id };
}

function dragThenEscape(state, frames) {
  const before = state;
  let dragged = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
  for (const action of frames) dragged = floorplanReducer(dragged, action);
  expect(dragged.project).not.toBe(before.project);
  const cancelled = floorplanReducer(dragged, { type: 'CANCEL_DRAG_GESTURE' });
  // The release that follows the key finds no gesture open.
  const released = floorplanReducer(cancelled, { type: 'END_DRAG_GESTURE' });
  return { before, cancelled, released };
}

function expectRestored({ before, cancelled, released }) {
  expect(cancelled.project).toBe(before.project);
  expect(cancelled.history).toHaveLength(before.history.length);
  expect(cancelled.history.at(-1)).toBe(before.history.at(-1));
  expect(cancelled.gesture).toMatchObject({ active: false, derivedStale: false });
  expect(cancelled.derived.validationIssues).toBe(before.derived.validationIssues);
  expect(released).toBe(cancelled);
}

const offsets = [100, 200, 300];

describe('Escape cancels a per-frame drag', () => {
  it('column', () => {
    const { state, floorId } = planWith(() => ({ columns: [{ ...createColumn(2000, 2000, 300, 300), id: 'col' }] }));
    const result = dragThenEscape(
      state,
      offsets.map((dx) => ({ type: 'COLUMN_UPDATE', floorId, column: { id: 'col', x: 2000 + dx, y: 2000 } })),
    );
    expectRestored(result);
    expect(result.cancelled.project.floors[0].columns[0]).toMatchObject({ x: 2000, y: 2000 });
  });

  it('fixture', () => {
    const { state, floorId } = planWith(() => ({ fixtures: [{ ...createFixture('toilet', 1000, 1000), id: 'fix' }] }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({ type: 'FIXTURE_UPDATE', floorId, fixture: { id: 'fix', x: 1000 + dx, y: 1000 } })),
      ),
    );
  });

  it('stair', () => {
    const { state, floorId } = planWith(() => ({ stairs: [{ ...createStair({ x: 2000, y: 2000 }), id: 'stair' }] }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({
          type: 'STAIR_UPDATE',
          floorId,
          stair: { id: 'stair', startPoint: { x: 2000 + dx, y: 2000 } },
        })),
      ),
    );
  });

  it('landing', () => {
    const { state, floorId } = planWith(() => ({
      landings: [{ ...createLanding({ x: 3000, y: 3000 }), id: 'landing' }],
    }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({
          type: 'LANDING_UPDATE',
          floorId,
          landing: { id: 'landing', position: { x: 3000 + dx, y: 3000 } },
        })),
      ),
    );
  });

  it('railing', () => {
    const { state, floorId } = planWith(() => ({
      railings: [{ ...createRailing({ x: 1000, y: 4000 }, { x: 4000, y: 4000 }), id: 'rail' }],
    }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({
          type: 'RAILING_UPDATE',
          floorId,
          railing: { id: 'rail', startPoint: { x: 1000 + dx, y: 4000 }, endPoint: { x: 4000 + dx, y: 4000 } },
        })),
      ),
    );
  });

  it('door and window', () => {
    const { state, floorId } = planWith((wall) => ({
      doors: [{ ...createDoor(wall.id, 2000, 900), id: 'door' }],
      windows: [{ ...createWindow(wall.id, 5000, 1200), id: 'win' }],
    }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({ type: 'DOOR_UPDATE', floorId, door: { id: 'door', offset: 2000 + dx } })),
      ),
    );
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({ type: 'WINDOW_UPDATE', floorId, window: { id: 'win', offset: 5000 + dx } })),
      ),
    );
  });

  it('electrical device', () => {
    const { state, floorId } = planWith((wall) => ({
      electricalDevices: [{ ...createElectricalDevice(wall.id, 3000), id: 'dev' }],
    }));
    expectRestored(
      dragThenEscape(
        state,
        offsets.map((dx) => ({
          type: 'ELECTRICAL_DEVICE_UPDATE',
          floorId,
          device: { id: 'dev', offset: 3000 + dx },
        })),
      ),
    );
  });

  it('service (a plumbing shaft, moved by building command)', () => {
    let { state } = planWith(() => ({}));
    const configure = (x) => ({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
        shaftId: 'shaft',
        name: 'Shaft',
        origin: { x, y: 1000 },
        width: 600,
        depth: 800,
        servedFloorIds: state.project.floors.map((floor) => floor.id),
        maxFixtureDistance: 2500,
      },
    });
    state = floorplanReducer(state, configure(1000));
    expect(state.project.building.systems.plumbing.shafts[0].origin.x).toBe(1000);
    const result = dragThenEscape(
      state,
      offsets.map((dx) => configure(1000 + dx)),
    );
    expectRestored(result);
    expect(result.cancelled.project.building.systems.plumbing.shafts[0].origin.x).toBe(1000);
  });

  it('leaves a gesture that changed nothing alone', () => {
    const { state } = planWith(() => ({}));
    const opened = floorplanReducer(state, { type: 'BEGIN_DRAG_GESTURE' });
    expect(floorplanReducer(opened, { type: 'CANCEL_DRAG_GESTURE' })).toBe(opened);
    expect(floorplanReducer(state, { type: 'CANCEL_DRAG_GESTURE' })).toBe(state);
  });
});
