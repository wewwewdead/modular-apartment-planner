import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { HISTORY_LIMIT } from '@/domain/projectStateHelpers';
import floorplanReducer, { initializeFloorplanState } from './floorplanReducer';

function wallFixture(id, x1, y1, x2, y2) {
  return { ...createWall({ x: x1, y: y1 }, { x: x2, y: y2 }), id };
}

/**
 * Loads a two-room plan directly (PROJECT_LOAD skips per-action reconciles):
 * an 8000x3000 rectangle split by a divider at x=4000, rooms pre-named.
 */
function loadTwoRoomState() {
  let state = initializeFloorplanState(createProject());
  const floorId = state.project.floors[0].id;
  const project = {
    ...state.project,
    floors: state.project.floors.map((floor) =>
      floor.id === floorId
        ? {
            ...floor,
            walls: [
              wallFixture('bottom', 0, 0, 8000, 0),
              wallFixture('right', 8000, 0, 8000, 3000),
              wallFixture('top', 8000, 3000, 0, 3000),
              wallFixture('left', 0, 3000, 0, 0),
              wallFixture('divider', 4000, 0, 4000, 3000),
            ],
            rooms: [
              {
                id: 'room_kitchen',
                name: 'Kitchen',
                points: [
                  { x: 0, y: 0 },
                  { x: 4000, y: 0 },
                  { x: 4000, y: 3000 },
                  { x: 0, y: 3000 },
                ],
                labelPosition: { x: 2000, y: 1500 },
                color: '#123456',
                area: 12000000,
                phaseId: null,
              },
              {
                id: 'room_living',
                name: 'Living',
                points: [
                  { x: 4000, y: 0 },
                  { x: 8000, y: 0 },
                  { x: 8000, y: 3000 },
                  { x: 4000, y: 3000 },
                ],
                labelPosition: { x: 6000, y: 1500 },
                color: '#654321',
                area: 12000000,
                phaseId: null,
              },
            ],
          }
        : floor,
    ),
  };
  state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });
  return { state, floorId };
}

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

  it('stores history entries by reference and shares unchanged floors (structural sharing)', () => {
    const initialState = initializeFloorplanState(createProject());
    const projectBeforeEdit = initialState.project;
    const secondFloor = { ...projectBeforeEdit.floors[0], id: 'floor-untouched', levelIndex: 1, name: 'Level 2' };

    const twoFloorState = floorplanReducer(initialState, { type: 'FLOOR_ADD', floor: secondFloor });
    const editedFloorId = twoFloorState.project.floors[0].id;
    const untouchedFloor = twoFloorState.project.floors.find((floor) => floor.id === 'floor-untouched');
    const wall = createWall({ x: 0, y: 0 }, { x: 2400, y: 0 });

    const withWall = floorplanReducer(twoFloorState, { type: 'WALL_ADD', floorId: editedFloorId, wall });

    // The prior project is stored by reference, not deep-cloned.
    const priorSnapshot = withWall.history[withWall.history.length - 1];
    expect(priorSnapshot).toBe(twoFloorState.project);

    // The untouched floor is shared by identity between current state and the
    // snapshot — this is the structural-sharing regression guard.
    const currentUntouchedFloor = withWall.project.floors.find((floor) => floor.id === 'floor-untouched');
    const snapshotUntouchedFloor = priorSnapshot.floors.find((floor) => floor.id === 'floor-untouched');
    expect(currentUntouchedFloor).toBe(untouchedFloor);
    expect(snapshotUntouchedFloor).toBe(currentUntouchedFloor);
  });

  it('round-trips exact prior project state through undo and redo', () => {
    const initialState = initializeFloorplanState(createProject());
    const floorId = initialState.project.floors[0].id;
    const projectBeforeEdit = initialState.project;
    const wall = createWall({ x: 0, y: 0 }, { x: 2400, y: 0 });

    const withWall = floorplanReducer(initialState, { type: 'WALL_ADD', floorId, wall });
    const projectAfterEdit = withWall.project;

    const undone = floorplanReducer(withWall, { type: 'UNDO' });
    // Undo restores the exact prior project object by identity.
    expect(undone.project).toBe(projectBeforeEdit);

    const redone = floorplanReducer(undone, { type: 'REDO' });
    expect(redone.project).toBe(projectAfterEdit);
  });

  it('caps the history stack and evicts the oldest snapshot past the limit', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const totalEdits = HISTORY_LIMIT + 10;

    for (let index = 0; index < totalEdits; index += 1) {
      const wall = createWall({ x: index, y: 0 }, { x: index + 100, y: 0 });
      state = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall });
    }

    expect(state.history).toHaveLength(HISTORY_LIMIT);
    // Oldest snapshot (empty floor) was evicted; earliest retained snapshot has walls.
    expect(state.history[0].floors[0].walls.length).toBeGreaterThan(0);
  });

  it('clears history when a project is loaded or created new', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    state = floorplanReducer(state, {
      type: 'WALL_ADD',
      floorId,
      wall: createWall({ x: 0, y: 0 }, { x: 2400, y: 0 }),
    });
    state = floorplanReducer(state, { type: 'UNDO' });
    expect(state.history.length + state.future.length).toBeGreaterThan(0);

    const loaded = floorplanReducer(state, { type: 'PROJECT_LOAD', project: createProject() });
    expect(loaded.history).toEqual([]);
    expect(loaded.future).toEqual([]);

    const reset = floorplanReducer(loaded, { type: 'PROJECT_NEW', project: createProject() });
    expect(reset.history).toEqual([]);
    expect(reset.future).toEqual([]);
  });
});

describe('live-model pipeline — WALL_UPDATE', () => {
  it('heals joined neighbors and preserves room identity in ONE undoable commit', () => {
    const { state, floorId } = loadTwoRoomState();
    const projectBefore = state.project;
    const historyBefore = state.history.length;

    // Translate the left wall 500mm outward; top and bottom must extend to meet it.
    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'left', start: { x: -500, y: 3000 }, end: { x: -500, y: 0 } },
    });

    const floor = next.project.floors.find((f) => f.id === floorId);
    expect(floor.walls.find((w) => w.id === 'bottom').start.x).toBeCloseTo(-500, 5);
    expect(floor.walls.find((w) => w.id === 'top').end.x).toBeCloseTo(-500, 5);

    // Rooms re-detected with identity preserved; Kitchen grew by 500x3000.
    const kitchen = floor.rooms.find((room) => room.name === 'Kitchen');
    expect(kitchen).toBeDefined();
    expect(kitchen.color).toBe('#123456');
    expect(kitchen.area).toBeCloseTo(4500 * 3000, 0);
    expect(floor.rooms.find((room) => room.name === 'Living')).toBeDefined();

    // ONE history entry for the whole propagated commit; one UNDO restores all.
    expect(next.history.length).toBe(historyBefore + 1);
    const undone = floorplanReducer(next, { type: 'UNDO' });
    expect(undone.project).toBe(projectBefore);
  });

  it('keeps T-stem junctions on their hosts when the stem translates', () => {
    const { state, floorId } = loadTwoRoomState();
    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'divider', start: { x: 5000, y: 0 }, end: { x: 5000, y: 3000 } },
    });
    const floor = next.project.floors.find((f) => f.id === floorId);
    const divider = floor.walls.find((w) => w.id === 'divider');
    expect(divider.start).toMatchObject({ x: 5000, y: 0 });
    const kitchen = floor.rooms.find((room) => room.name === 'Kitchen');
    expect(kitchen.area).toBeCloseTo(5000 * 3000, 0);
  });

  it('rejects an invalid edit as a TRUE no-op with only the editor rejection signal', () => {
    const { state, floorId } = loadTwoRoomState();

    // Sliding the divider past the rectangle's right edge slides its
    // T-junctions off their hosts — must be rejected.
    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'divider', start: { x: 9500, y: 0 }, end: { x: 9500, y: 3000 } },
    });

    expect(next.project).toBe(state.project);
    expect(next.history.length).toBe(state.history.length);
    expect(next.changeVersion).toBe(state.changeVersion);
    expect(next.isDirty).toBe(state.isDirty);
    expect(next.editor.lastRejection).toMatchObject({ actionType: 'WALL_UPDATE', reason: 't-out-of-span' });
  });

  it('clears lastRejection on the next successful project mutation', () => {
    const { state, floorId } = loadTwoRoomState();
    const rejected = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'divider', start: { x: 9500, y: 0 }, end: { x: 9500, y: 3000 } },
    });
    expect(rejected.editor.lastRejection).not.toBeNull();

    const recovered = floorplanReducer(rejected, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'divider', start: { x: 4500, y: 0 }, end: { x: 4500, y: 3000 } },
    });
    expect(recovered.editor.lastRejection).toBeNull();
  });

  it('property-only WALL_UPDATE keeps the legacy path (no propagation, no rejection)', () => {
    const { state, floorId } = loadTwoRoomState();
    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'divider', thickness: 200 },
    });
    const divider = next.project.floors[0].walls.find((w) => w.id === 'divider');
    expect(divider.thickness).toBe(200);
    expect(next.editor.lastRejection).toBeNull();
  });
});

describe('live-model pipeline — routed reducer cases', () => {
  it('WALL_DELETE reconciles rooms: deleting the divider merges the space onto one survivor', () => {
    const { state, floorId } = loadTwoRoomState();
    const next = floorplanReducer(state, { type: 'WALL_DELETE', floorId, wallId: 'divider' });
    const floor = next.project.floors.find((f) => f.id === floorId);
    expect(floor.rooms).toHaveLength(1);
    expect(['Kitchen', 'Living']).toContain(floor.rooms[0].name);
    expect(floor.rooms[0].area).toBeCloseTo(8000 * 3000, 0);
  });

  it('WALL_ADD reconciles rooms when a loop closes', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const walls = [
      wallFixture('w1', 0, 0, 4000, 0),
      wallFixture('w2', 4000, 0, 4000, 3000),
      wallFixture('w3', 4000, 3000, 0, 3000),
      wallFixture('w4', 0, 3000, 0, 0),
    ];
    for (const wall of walls) {
      state = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall });
    }
    const floor = state.project.floors.find((f) => f.id === floorId);
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0].area).toBeCloseTo(4000 * 3000, 0);
  });

  it('[R] FILLET_APPLY re-clamps a door on the trimmed wall (bypass fixed)', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const project = {
      ...state.project,
      floors: state.project.floors.map((floor) =>
        floor.id === floorId
          ? {
              ...floor,
              walls: [wallFixture('w1', 0, 0, 3000, 0), wallFixture('w2', 0, 0, 0, 3000)],
              doors: [{ id: 'door_1', wallId: 'w1', offset: 2400, width: 900, openDirection: 'left', type: 'swing' }],
            }
          : floor,
      ),
    };
    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });

    const next = floorplanReducer(state, {
      type: 'FILLET_APPLY',
      floorId,
      wall1Id: 'w1',
      wall1Endpoint: 'start',
      tangentPoint1: { x: 500, y: 0 },
      wall2Id: 'w2',
      wall2Endpoint: 'start',
      tangentPoint2: { x: 0, y: 500 },
      arcWall: {
        ...createWall({ x: 500, y: 0 }, { x: 0, y: 500 }),
        id: 'arc_1',
        controlPoint: { x: 150, y: 150 },
      },
    });

    const floor = next.project.floors.find((f) => f.id === floorId);
    // w1 is now (500,0)-(3000,0), length 2500. Door offset 2400 > 2500-450 → clamps.
    expect(floor.doors[0].offset).toBe(2050);
    expect(floor.walls.find((w) => w.id === 'arc_1')).toBeDefined();
  });

  it('FLOOR_REPLACE (paste path) reconciles rooms for the walls it changed', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const oldFloor = state.project.floors[0];

    const next = floorplanReducer(state, {
      type: 'FLOOR_REPLACE',
      floorId,
      floor: {
        ...oldFloor,
        walls: [
          wallFixture('p1', 0, 0, 4000, 0),
          wallFixture('p2', 4000, 0, 4000, 3000),
          wallFixture('p3', 4000, 3000, 0, 3000),
          wallFixture('p4', 0, 3000, 0, 0),
        ],
      },
    });

    const floor = next.project.floors.find((f) => f.id === floorId);
    expect(floor.rooms).toHaveLength(1);
    expect(floor.rooms[0].area).toBeCloseTo(4000 * 3000, 0);
  });
});

describe('live-model pipeline — performance', () => {
  it('full reducer commit on a 200-wall plan stays under the CI budget (300ms)', () => {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;

    // 50 detached 4-wall rooms = 200 walls, 50 detectable loops.
    const walls = [];
    for (let i = 0; i < 50; i += 1) {
      const ox = (i % 10) * 6000;
      const oy = Math.floor(i / 10) * 5000;
      walls.push(
        wallFixture(`r${i}a`, ox, oy, ox + 4000, oy),
        wallFixture(`r${i}b`, ox + 4000, oy, ox + 4000, oy + 3000),
        wallFixture(`r${i}c`, ox + 4000, oy + 3000, ox, oy + 3000),
        wallFixture(`r${i}d`, ox, oy + 3000, ox, oy),
      );
    }
    const project = {
      ...state.project,
      floors: state.project.floors.map((floor) => (floor.id === floorId ? { ...floor, walls } : floor)),
    };
    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });

    const kernelStart = performance.now();
    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'r0a', start: { x: 0, y: 300 }, end: { x: 4000, y: 300 } },
    });
    const elapsed = performance.now() - kernelStart;

    expect(next.project).not.toBe(state.project);
    // eslint-disable-next-line no-console
    console.log(`[bench] 200-wall WALL_UPDATE commit: ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(300);
  });
});
