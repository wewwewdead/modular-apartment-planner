import { describe, expect, it } from 'vitest';
import { createBeam, createColumn, createElectricalDevice, createProject, createWall } from '@/domain/models';
import { createCeiling } from '@/domain/ceilingModels';
import { createWallDetailing } from '@/domain/wallDetailing';
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
    expect(state.editor.lifecycleStage).toBe('brief');
  });

  it('switches lifecycle stages as transient editor state', () => {
    const state = initializeFloorplanState(createProject());
    const nextState = floorplanReducer(state, { type: 'SET_LIFECYCLE_STAGE', stage: 'validate' });

    expect(nextState.editor.lifecycleStage).toBe('validate');
    expect(nextState.project).toBe(state.project);
    expect(nextState.history).toHaveLength(0);
    expect(floorplanReducer(nextState, { type: 'SET_LIFECYCLE_STAGE', stage: 'unknown' })).toBe(nextState);
  });

  it('focuses one pane at a time, and toggling the same pane leaves focus', () => {
    const state = initializeFloorplanState(createProject());

    const canvasFocused = floorplanReducer(state, { type: 'TOGGLE_FOCUS_PANEL', panel: 'canvas' });
    expect(canvasFocused.editor.focusedPanel).toBe('canvas');

    // Switching straight to the other pane, without leaving focus first.
    const previewFocused = floorplanReducer(canvasFocused, { type: 'TOGGLE_FOCUS_PANEL', panel: 'preview' });
    expect(previewFocused.editor.focusedPanel).toBe('preview');

    const restored = floorplanReducer(previewFocused, { type: 'TOGGLE_FOCUS_PANEL', panel: 'preview' });
    expect(restored.editor.focusedPanel).toBeNull();
  });

  it('leaves focus outright when handed no panel', () => {
    // What Escape dispatches. Toggling against whichever pane happens to be
    // focused would be a race; this cannot land on the wrong one.
    const state = initializeFloorplanState(createProject());
    const focused = floorplanReducer(state, { type: 'TOGGLE_FOCUS_PANEL', panel: 'preview' });

    expect(floorplanReducer(focused, { type: 'TOGGLE_FOCUS_PANEL', panel: null }).editor.focusedPanel).toBeNull();
    // And is harmless when nothing is focused.
    expect(floorplanReducer(state, { type: 'TOGGLE_FOCUS_PANEL', panel: null }).editor.focusedPanel).toBeNull();
  });

  it('keeps focus out of history and off the project', () => {
    const state = initializeFloorplanState(createProject());
    const focused = floorplanReducer(state, { type: 'TOGGLE_FOCUS_PANEL', panel: 'canvas' });

    // A view state, not an edit: undo must not have anything to undo.
    expect(focused.project).toBe(state.project);
    expect(focused.history).toHaveLength(0);
  });

  it('starts with nothing focused', () => {
    expect(initializeFloorplanState(createProject()).editor.focusedPanel).toBeNull();
  });

  it('opens and closes the wall-detail workspace as transient editor state', () => {
    const state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const opened = floorplanReducer(state, { type: 'OPEN_WALL_DETAIL_EDITOR', floorId, wallId: 'wall_1' });

    expect(opened.editor.wallDetailEditor).toEqual({ floorId, wallId: 'wall_1' });
    expect(opened.editor.selectedId).toBe('wall_1');
    expect(opened.project).toBe(state.project);
    expect(opened.history).toHaveLength(0);

    const openedExterior = floorplanReducer(state, {
      type: 'OPEN_WALL_DETAIL_EDITOR',
      floorId,
      wallId: 'wall_1',
      side: 'exterior',
    });
    expect(openedExterior.editor.wallDetailEditor).toEqual({ floorId, wallId: 'wall_1', side: 'exterior' });

    const closed = floorplanReducer(opened, { type: 'CLOSE_WALL_DETAIL_EDITOR' });
    expect(closed.editor.wallDetailEditor).toBeNull();
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

  it('gives the 3D scene cache a fresh floor reference after a wall-detail customization', () => {
    const { state, floorId } = loadTwoRoomState();
    const previousFloor = state.project.floors.find((floor) => floor.id === floorId);
    const previousWall = previousFloor.walls.find((wall) => wall.id === 'divider');
    const detailing = createWallDetailing({
      enabled: true,
      sides: {
        interior: {
          enabled: true,
          layout: {
            mode: 'custom',
            customPanels: [{ id: 'panel-live', u: 100, v: 100, width: 800, height: 1200 }],
          },
        },
      },
    });

    const next = floorplanReducer(state, {
      type: 'WALL_UPDATE',
      floorId,
      wall: {
        id: previousWall.id,
        assembly: { preset: 'fiber_cement', detailing },
      },
    });
    const nextFloor = next.project.floors.find((floor) => floor.id === floorId);
    const nextWall = nextFloor.walls.find((wall) => wall.id === 'divider');

    expect(nextFloor).not.toBe(previousFloor);
    expect(nextWall).not.toBe(previousWall);
    expect(nextWall.assembly.detailing.sides.interior.layout.customPanels[0]).toMatchObject({
      id: 'panel-live',
      u: 100,
      v: 100,
    });
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

describe('walls fitted to the structure above them', () => {
  // 3400 columns carrying a 450-deep beam: a wall under it is 2950, not 3000.
  function beamState() {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const columns = [
      { ...createColumn(0, 0, 300, 300, { height: 3400 }), id: 'col_a' },
      { ...createColumn(6000, 0, 300, 300, { height: 3400 }), id: 'col_b' },
    ];
    const beam = {
      ...createBeam({ kind: 'column', id: 'col_a' }, { kind: 'column', id: 'col_b' }, 250, 450, 3400),
      id: 'beam_top',
    };
    const project = {
      ...state.project,
      floors: state.project.floors.map((floor) =>
        floor.id === floorId ? { ...floor, columns, beams: [beam] } : floor,
      ),
    };
    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });
    return { state, floorId };
  }

  const wallOf = (state, floorId) => state.project.floors.find((floor) => floor.id === floorId).walls[0];

  it('drops a newly drawn wall onto the beam soffit', () => {
    const { state, floorId } = beamState();
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }), id: 'wall_1' };
    expect(wall.height).toBe(3000);

    const next = floorplanReducer(state, { type: 'WALL_ADD', floorId, wall });

    expect(wallOf(next, floorId).height).toBe(2950);
  });

  it('refits the wall when the beam it runs under gets deeper', () => {
    const { state, floorId } = beamState();
    let next = floorplanReducer(state, {
      type: 'WALL_ADD',
      floorId,
      wall: { ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }), id: 'wall_1' },
    });

    next = floorplanReducer(next, { type: 'BEAM_UPDATE', floorId, beam: { id: 'beam_top', depth: 700 } });

    expect(wallOf(next, floorId).height).toBe(2700);
  });

  it('leaves a wall pinned to a fixed height where the user put it', () => {
    const { state, floorId } = beamState();
    let next = floorplanReducer(state, {
      type: 'WALL_ADD',
      floorId,
      wall: { ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }), id: 'wall_1' },
    });

    next = floorplanReducer(next, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'wall_1', height: 2400, heightMode: 'manual' },
    });

    expect(wallOf(next, floorId).height).toBe(2400);
  });
});

describe('ceilings — project collection', () => {
  function ceilingState(ceilingOverrides = {}) {
    const state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const ceiling = createCeiling('Living Ceiling', { id: 'ceiling_1', floorId, ...ceilingOverrides });
    return { state, floorId, ceiling };
  }

  it('adds, updates and deletes a ceiling as undoable project state', () => {
    const { state, floorId, ceiling } = ceilingState();
    const projectBeforeAdd = state.project;

    const added = floorplanReducer(state, { type: 'CEILING_ADD', ceiling });
    expect(added.project.ceilings).toHaveLength(1);
    expect(added.project.ceilings[0]).toBe(ceiling);
    expect(added.entities.ceilings.map((entry) => entry.id)).toEqual(['ceiling_1']);
    expect(added.history).toHaveLength(1);

    const updated = floorplanReducer(added, {
      type: 'CEILING_UPDATE',
      ceiling: { id: 'ceiling_1', name: 'Renamed', baseElevation: 2600 },
    });
    expect(updated.project.ceilings[0]).toMatchObject({
      id: 'ceiling_1',
      name: 'Renamed',
      baseElevation: 2600,
      floorId,
    });
    // Shallow merge keeps untouched branches intact.
    expect(updated.project.ceilings[0].detailing).toBe(ceiling.detailing);

    const undone = floorplanReducer(updated, { type: 'UNDO' });
    expect(undone.project).toBe(added.project);
    expect(undone.project.ceilings[0].name).toBe('Living Ceiling');

    const deleted = floorplanReducer(updated, { type: 'CEILING_DELETE', ceilingId: 'ceiling_1' });
    expect(deleted.project.ceilings).toEqual([]);
    expect(floorplanReducer(deleted, { type: 'UNDO' }).project).toBe(updated.project);
    // Undoing every commit returns the exact pre-ceiling project.
    expect(
      floorplanReducer(floorplanReducer(floorplanReducer(deleted, { type: 'UNDO' }), { type: 'UNDO' }), {
        type: 'UNDO',
      }).project,
    ).toBe(projectBeforeAdd);
  });

  it('drops the ceilings of a deleted floor', () => {
    const { state, floorId, ceiling } = ceilingState();
    const otherFloor = { ...state.project.floors[0], id: 'floor-keep', levelIndex: 1, name: 'Level 2' };
    let next = floorplanReducer(state, { type: 'FLOOR_ADD', floor: otherFloor });
    next = floorplanReducer(next, { type: 'CEILING_ADD', ceiling });
    next = floorplanReducer(next, {
      type: 'CEILING_ADD',
      ceiling: createCeiling('Upper Ceiling', { id: 'ceiling_2', floorId: 'floor-keep' }),
    });

    const deleted = floorplanReducer(next, { type: 'FLOOR_DELETE', floorId, fallbackFloorId: 'floor-keep' });
    expect(deleted.project.ceilings.map((entry) => entry.id)).toEqual(['ceiling_2']);
  });

  it('shifts manual ceilings with a floor elevation change but leaves beam-attached ones alone', () => {
    const { state, floorId } = ceilingState();
    let next = floorplanReducer(state, {
      type: 'CEILING_ADD',
      ceiling: createCeiling('Manual', {
        id: 'ceiling_manual',
        floorId,
        baseElevation: 2700,
        attachment: { mode: 'manual', beamIds: [] },
      }),
    });
    next = floorplanReducer(next, {
      type: 'CEILING_ADD',
      ceiling: createCeiling('Beam-hung', {
        id: 'ceiling_beam',
        floorId,
        baseElevation: 2700,
        attachment: { mode: 'beam', beamIds: ['beam_1'] },
      }),
    });

    const raised = floorplanReducer(next, { type: 'FLOOR_UPDATE', floor: { id: floorId, elevation: 3000 } });
    const byId = Object.fromEntries(raised.project.ceilings.map((entry) => [entry.id, entry]));
    expect(byId.ceiling_manual.baseElevation).toBe(5700);
    // The beams the ceiling hangs from were shifted with the floor, so its own
    // stored snapshot must not be shifted a second time on top of them.
    expect(byId.ceiling_beam.baseElevation).toBe(2700);
  });

  it('clears ceiling phase assignments when the phase is deleted', () => {
    const { state, floorId } = ceilingState();
    let next = floorplanReducer(state, { type: 'PHASE_ADD', phase: { id: 'phase_1', name: 'Phase 1', order: 0 } });
    next = floorplanReducer(next, {
      type: 'CEILING_ADD',
      ceiling: createCeiling('Phased', { id: 'ceiling_1', floorId, phaseId: 'phase_1' }),
    });

    const deleted = floorplanReducer(next, { type: 'PHASE_DELETE', phaseId: 'phase_1' });
    expect(deleted.project.phases).toEqual([]);
    expect(deleted.project.ceilings[0].phaseId).toBeNull();
  });

  it('opens and closes the ceiling-detail workspace as transient editor state', () => {
    const state = initializeFloorplanState(createProject());
    expect(state.editor.ceilingDetailEditor).toBeNull();

    const opened = floorplanReducer(state, { type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: 'ceiling_1' });
    expect(opened.editor.ceilingDetailEditor).toEqual({ ceilingId: 'ceiling_1' });
    expect(opened.editor.selectedId).toBe('ceiling_1');
    expect(opened.editor.selectedType).toBe('ceiling');
    expect(opened.project).toBe(state.project);
    expect(opened.history).toHaveLength(0);

    const closed = floorplanReducer(opened, { type: 'CLOSE_CEILING_DETAIL_EDITOR' });
    expect(closed.editor.ceilingDetailEditor).toBeNull();
    expect(floorplanReducer(closed, { type: 'CLOSE_CEILING_DETAIL_EDITOR' })).toBe(closed);
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

describe('electrical devices', () => {
  function loadWallState() {
    let state = initializeFloorplanState(createProject());
    const floorId = state.project.floors[0].id;
    const project = {
      ...state.project,
      floors: state.project.floors.map((floor) =>
        floor.id === floorId ? { ...floor, walls: [wallFixture('host', 0, 0, 6000, 0)] } : floor,
      ),
    };
    state = floorplanReducer(state, { type: 'PROJECT_LOAD', project });
    return { state, floorId };
  }

  function addDevice(state, floorId, overrides = {}) {
    const device = { ...createElectricalDevice('host', 1000, 'outlet', 'right'), phaseId: null, ...overrides };
    return { state: floorplanReducer(state, { type: 'ELECTRICAL_DEVICE_ADD', floorId, device }), device };
  }

  it('round-trips add / update / delete', () => {
    const { state: loaded, floorId } = loadWallState();
    const { state: added, device } = addDevice(loaded, floorId);
    expect(added.project.floors[0].electricalDevices).toEqual([device]);
    expect(added.entities.electricalDevices).toHaveLength(1);

    const updated = floorplanReducer(added, {
      type: 'ELECTRICAL_DEVICE_UPDATE',
      floorId,
      device: { id: device.id, offset: 2500, side: 'left' },
    });
    expect(updated.project.floors[0].electricalDevices[0]).toMatchObject({ offset: 2500, side: 'left' });

    const deleted = floorplanReducer(updated, {
      type: 'ELECTRICAL_DEVICE_DELETE',
      floorId,
      deviceId: device.id,
    });
    expect(deleted.project.floors[0].electricalDevices).toEqual([]);
  });

  it('undo restores a deleted device', () => {
    const { state: loaded, floorId } = loadWallState();
    const { state: added, device } = addDevice(loaded, floorId);
    const deleted = floorplanReducer(added, { type: 'ELECTRICAL_DEVICE_DELETE', floorId, deviceId: device.id });

    const undone = floorplanReducer(deleted, { type: 'UNDO' });
    expect(undone.project.floors[0].electricalDevices).toEqual([device]);
  });

  it('drops devices hosted on a deleted wall', () => {
    const { state: loaded, floorId } = loadWallState();
    const { state: added } = addDevice(loaded, floorId);

    const afterDelete = floorplanReducer(added, { type: 'WALL_DELETE', floorId, wallId: 'host' });
    expect(afterDelete.project.floors[0].walls).toEqual([]);
    expect(afterDelete.project.floors[0].electricalDevices).toEqual([]);
  });

  it('re-clamps a device offset when its host wall shortens', () => {
    const { state: loaded, floorId } = loadWallState();
    const { state: added, device } = addDevice(loaded, floorId, { offset: 5800 });

    const shortened = floorplanReducer(added, {
      type: 'WALL_UPDATE',
      floorId,
      wall: { id: 'host', end: { x: 1000, y: 0 } },
    });

    // Wall is now 1000 long, so the 100mm faceplate centre cannot exceed 950.
    expect(shortened.project.floors[0].electricalDevices[0].offset).toBe(950);
    expect(shortened.project.floors[0].electricalDevices[0].id).toBe(device.id);
  });
});
