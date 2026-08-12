import { describe, expect, it } from 'vitest';
import { createSelectHandler } from './selectHandler';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { ELECTRICAL_PLATE } from '@/domain/defaults';

/**
 * Wall drag = PREVIEW-THEN-COMMIT.
 *
 * During the drag no WALL_UPDATE is dispatched: the handler publishes preview
 * geometry (dragged wall + one-hop healed neighbors) into editor toolState.
 * Mouseup validates and dispatches exactly once; Escape cancels with nothing
 * dispatched. Because the committed floor never changes mid-drag, snapping
 * always runs against pre-edit geometry and drags are cumulative from
 * mousedown — the historical snap "gravity" trap cannot occur.
 *
 * Fixture (mm):  A(0,-3000)┐            ┌B(4000,-3000)
 *                          A            B
 *                   J1(0,0)●────W──────●J2(4000,0)
 */
function makeFloor() {
  return {
    walls: [
      { id: 'wallA', start: { x: 0, y: -3000 }, end: { x: 0, y: 0 }, thickness: 100 },
      { id: 'wallW', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 },
      { id: 'wallB', start: { x: 4000, y: 0 }, end: { x: 4000, y: -3000 }, thickness: 100 },
    ],
    columns: [],
    doors: [],
    windows: [],
  };
}

function createDragHarness({ zoom = 0.1, snapEnabled = true, floor = makeFloor() } = {}) {
  const mousedown = { x: 2000, y: 0 };
  let toolState = {
    pendingDrag: false,
    dragging: true,
    dragType: 'move',
    startPos: { ...mousedown },
    originalPos: { ...mousedown },
  };
  const dispatched = [];
  const statusMessages = [];

  const handler = createSelectHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      if (action.type === 'SET_STATUS_MESSAGE') statusMessages.push(action.message);
    },
    getFloor: () => floor,
    activeFloorId: 'floor_1',
    viewport: { zoom },
    snapEnabled,
    activePhaseId: 'phase_active',
  });

  return {
    dispatched,
    statusMessages,
    getToolState: () => toolState,
    move(modelPos, e = { shiftKey: false }) {
      handler.onMouseMove(modelPos, e, toolState, 'wallW', 'wall');
    },
    up(modelPos) {
      handler.onMouseUp(modelPos, { button: 0 }, toolState);
    },
    key(e) {
      handler.onKeyDown(e, toolState, 'wallW', 'wall');
    },
  };
}

describe('selectHandler wall drag — preview-then-commit', () => {
  it('publishes preview (moved wall + healed neighbors) and dispatches NOTHING during the drag', () => {
    const harness = createDragHarness();

    for (let step = 1; step <= 10; step += 1) {
      harness.move({ x: 2000, y: step * 30 });
    }

    expect(harness.dispatched).toHaveLength(0);

    const preview = harness.getToolState().wallDragPreview;
    expect(preview.blocked).toBeNull();
    const wallEdit = preview.edits.find((edit) => edit.id === 'wallW');
    expect(wallEdit.start.y).toBeCloseTo(300, 5);
    // Neighbors heal live in the preview — joins visibly hold during the drag.
    const aEdit = preview.edits.find((edit) => edit.id === 'wallA');
    expect(aEdit.end.y).toBeCloseTo(300, 5);
    const bEdit = preview.edits.find((edit) => edit.id === 'wallB');
    expect(bEdit.start.y).toBeCloseTo(300, 5);
  });

  it('mouseup commits exactly ONE WALL_UPDATE carrying the full cumulative move (gravity regression)', () => {
    const harness = createDragHarness();

    // Slow 30-step drag, 900mm total — 9x the 100mm snap radius. Historically
    // the incremental+snap loop trapped the wall at y=0 forever.
    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: 2000, y: step * 30 });
    }
    harness.up({ x: 2000, y: 900 });

    expect(harness.dispatched).toHaveLength(1);
    const action = harness.dispatched[0];
    expect(action.type).toBe('WALL_UPDATE');
    expect(action.wall.id).toBe('wallW');
    expect(action.wall.start.y).toBeCloseTo(900, 5);
    expect(action.wall.end.y).toBeCloseTo(900, 5);
    expect(action.phaseId).toBe('phase_active');
    // Drag state fully cleared after commit.
    expect(harness.getToolState().wallDragPreview).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });

  it('still snaps within the radius (intended stickiness, pre-edit targets)', () => {
    const harness = createDragHarness();

    harness.move({ x: 2000, y: 30 });
    harness.move({ x: 2000, y: 60 }); // cumulative 60mm < 100mm snap radius

    const preview = harness.getToolState().wallDragPreview;
    const wallEdit = preview.edits.find((edit) => edit.id === 'wallW');
    expect(wallEdit.start).toMatchObject({ x: 0, y: 0 });
    expect(wallEdit.end).toMatchObject({ x: 4000, y: 0 });
  });

  it('blocked proposals show a toast on mouseup and dispatch nothing', () => {
    const floor = makeFloor();
    // Shorten wallA so the heal collapses it: wallA from (0,-150) to (0,0).
    floor.walls = floor.walls.map((wall) => (wall.id === 'wallA' ? { ...wall, start: { x: 0, y: -150 } } : wall));
    const harness = createDragHarness({ floor });

    // Fast flick 800mm down (negative y): wallA would need to shrink below
    // MIN_WALL_LENGTH... actually pull perpendicular far enough to overextend.
    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: 2000, y: step * 30 });
    }
    const preview = harness.getToolState().wallDragPreview;
    expect(preview.blocked).toBe('over-extension');

    harness.up({ x: 2000, y: 900 });
    expect(harness.dispatched).toHaveLength(0);
    expect(harness.statusMessages.length).toBeGreaterThan(0);
    expect(harness.statusMessages[0]).toMatch(/blocked/i);
    expect(harness.getToolState().wallDragPreview).toBeNull();
  });

  it('Escape cancels the drag: preview cleared, nothing dispatched', () => {
    const harness = createDragHarness();

    harness.move({ x: 2000, y: 300 });
    expect(harness.getToolState().wallDragPreview).not.toBeNull();

    harness.key({ key: 'Escape' });

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().wallDragPreview).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });
});

describe('selectHandler sectionCut drag — preview-then-commit', () => {
  function createSectionHarness() {
    const floor = {
      walls: [],
      columns: [],
      doors: [],
      windows: [],
      sectionCuts: [
        { id: 'sec1', startPoint: { x: 0, y: 1000 }, endPoint: { x: 5000, y: 1000 }, depth: 2000, direction: 1 },
      ],
    };
    const mousedown = { x: 2500, y: 1000 };
    let toolState = {
      pendingDrag: false,
      dragging: true,
      dragType: 'move',
      startPos: { ...mousedown },
      originalPos: { ...mousedown },
    };
    const dispatched = [];

    const handler = createSelectHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: (action) => {
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      getFloor: () => floor,
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled: true,
      activePhaseId: null,
    });

    return {
      dispatched,
      getToolState: () => toolState,
      move(modelPos) {
        handler.onMouseMove(modelPos, { shiftKey: false }, toolState, 'sec1', 'sectionCut');
      },
      up(modelPos) {
        handler.onMouseUp(modelPos, { button: 0 }, toolState);
      },
      key(e) {
        handler.onKeyDown(e, toolState, 'sec1', 'sectionCut');
      },
    };
  }

  it('dispatches NOTHING during the drag; preview carries the cumulative position (gravity regression)', () => {
    const harness = createSectionHarness();

    // Slow 30-step drag, 900mm total. The old per-event incremental commits
    // lagged the full pipeline and could drop deltas on torn reads.
    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: 2500, y: 1000 + step * 30 });
    }

    expect(harness.dispatched).toHaveLength(0);
    const preview = harness.getToolState().wallDragPreview;
    expect(preview.sectionCutEdits[0].startPoint.y).toBeCloseTo(1900, 5);
    expect(preview.sectionCutEdits[0].endPoint.y).toBeCloseTo(1900, 5);
  });

  it('mouseup commits exactly ONE SECTION_UPDATE with the full move', () => {
    const harness = createSectionHarness();

    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: 2500, y: 1000 + step * 30 });
    }
    harness.up({ x: 2500, y: 1900 });

    expect(harness.dispatched).toHaveLength(1);
    const action = harness.dispatched[0];
    expect(action.type).toBe('SECTION_UPDATE');
    expect(action.sectionCut.id).toBe('sec1');
    expect(action.sectionCut.startPoint.y).toBeCloseTo(1900, 5);
    expect(action.sectionCut.endPoint.y).toBeCloseTo(1900, 5);
    expect(harness.getToolState().wallDragPreview).toBeNull();
  });

  it('Escape cancels a section drag with nothing dispatched', () => {
    const harness = createSectionHarness();

    harness.move({ x: 2500, y: 1300 });
    expect(harness.getToolState().wallDragPreview).not.toBeNull();

    harness.key({ key: 'Escape' });

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().wallDragPreview).toBeNull();
  });
});

describe('selectHandler building-service drag', () => {
  function serviceFloor() {
    return {
      id: 'floor_1',
      level: 0,
      walls: [],
      columns: [],
      doors: [],
      windows: [],
      fixtures: [],
      railings: [],
      beams: [],
      stairs: [],
      landings: [],
      rooms: [],
      slabs: [],
      sectionCuts: [],
    };
  }

  function serviceProject() {
    return {
      building: {
        systems: {
          plumbing: {
            shafts: [
              {
                id: 'shaft_1',
                name: 'Wet shaft',
                origin: { x: 1000, y: 1000 },
                width: 600,
                depth: 800,
                servedFloorIds: ['floor_1'],
                maxFixtureDistance: 3000,
              },
            ],
          },
          electrical: {
            riserZones: [
              {
                id: 'riser_1',
                name: 'Electrical riser',
                origin: { x: 2500, y: 1000 },
                width: 400,
                depth: 400,
                servedFloorIds: ['floor_1'],
                openingClearance: 100,
              },
            ],
            panelZones: [
              {
                id: 'panel_1',
                name: 'Electrical panel',
                kind: 'electrical_panel',
                floorId: 'floor_1',
                location: 'floor',
                origin: { x: 4000, y: 1000 },
                width: 800,
                depth: 300,
                rotation: 0,
                clearance: 600,
                capacity: null,
                unitCount: 4,
                servedFloorIds: ['floor_1'],
              },
            ],
          },
        },
      },
    };
  }

  function dragService(start, end) {
    let toolState = {};
    let selected = null;
    const dispatched = [];
    const editorDispatch = (action) => {
      if (action.type === 'SELECT_OBJECT') selected = { id: action.id, type: action.objectType };
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    };
    const handler = createSelectHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch,
      project: serviceProject(),
      getFloor: () => serviceFloor(),
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled: true,
    });

    handler.onMouseDown(start, { button: 0, target: { dataset: {} } }, toolState);
    handler.onMouseMove(end, { shiftKey: false }, toolState, selected.id, selected.type);
    handler.onMouseMove(end, { shiftKey: false }, toolState, selected.id, selected.type);

    return { selected, dispatched, toolState };
  }

  function gridProject({ rotation = 0 } = {}) {
    return {
      building: {
        systems: {
          structural: {
            gridSystems: [
              {
                id: 'grid_1',
                name: 'Primary Grid',
                origin: { x: 0, y: 0 },
                rotation,
                axes: [
                  { id: 'x1', label: '1', orientation: 'vertical', offset: 0 },
                  { id: 'x2', label: '2', orientation: 'vertical', offset: 4000 },
                  { id: 'y1', label: 'A', orientation: 'horizontal', offset: 0 },
                  { id: 'y2', label: 'B', orientation: 'horizontal', offset: 5000 },
                ],
              },
            ],
            columnStacks: [],
          },
        },
      },
      floors: [],
    };
  }

  function interact(project, floor, start, end) {
    let toolState = {};
    let selected = null;
    const dispatched = [];
    const editorDispatch = (action) => {
      if (action.type === 'SELECT_OBJECT') selected = { id: action.id, type: action.objectType };
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
    };
    const handler = createSelectHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch,
      project,
      getFloor: () => floor,
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled: true,
    });

    handler.onMouseDown(start, { button: 0, target: { dataset: {} } }, toolState);
    if (end && selected) {
      handler.onMouseMove(end, { shiftKey: false }, toolState, selected.id, selected.type);
      handler.onMouseMove(end, { shiftKey: false }, toolState, selected.id, selected.type);
    }
    return { selected, dispatched, toolState };
  }

  it('selects the grid by its axis bubble and previews the whole-grid move', () => {
    // Vertical axis 1 spans the horizontal range 0..5000 plus a 700mm
    // extension, so its first bubble sits at (0, -700).
    const result = interact(gridProject(), serviceFloor(), { x: 0, y: -700 }, { x: 2000, y: 500 });

    expect(result.selected).toEqual({ id: 'grid_1', type: 'structuralGrid' });
    expect(result.dispatched).toHaveLength(0);
    expect(result.toolState.wallDragPreview.gridTransform).toEqual({
      gridId: 'grid_1',
      origin: { x: 2000, y: 1200 },
      rotation: 0,
    });
  });

  it('finds the bubble of a rotated grid where it is drawn, not where it started', () => {
    // Rotated 90° clockwise (y-down), the bubble at (0, -700) lands on (700, 0).
    const result = interact(gridProject({ rotation: 90 }), serviceFloor(), { x: 700, y: 0 }, null);

    expect(result.selected).toEqual({ id: 'grid_1', type: 'structuralGrid' });
  });

  it('selects a grid line only when nothing else is under the cursor', () => {
    const emptyFloor = serviceFloor();
    const onLine = interact(gridProject(), emptyFloor, { x: 2000, y: 0 }, null);
    expect(onLine.selected).toEqual({ id: 'grid_1', type: 'structuralGrid' });

    // A wall running along the same axis line wins the click.
    const walledFloor = {
      ...serviceFloor(),
      walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, thickness: 100 }],
    };
    const onWall = interact(gridProject(), walledFloor, { x: 2000, y: 0 }, null);
    expect(onWall.selected).toEqual({ id: 'wall_1', type: 'wall' });
  });

  it.each([
    {
      label: 'wet-service shaft',
      start: { x: 1000, y: 1000 },
      end: { x: 1300, y: 1400 },
      selectedType: 'plumbingShaft',
      commandType: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      idField: 'shaftId',
      id: 'shaft_1',
    },
    {
      label: 'electrical riser',
      start: { x: 2500, y: 1000 },
      end: { x: 2800, y: 1400 },
      selectedType: 'electricalRiser',
      commandType: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
      idField: 'riserId',
      id: 'riser_1',
    },
    {
      label: 'electrical panel',
      start: { x: 4000, y: 1000 },
      end: { x: 4300, y: 1400 },
      selectedType: 'electricalPanelZone',
      commandType: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      idField: 'zoneId',
      id: 'panel_1',
    },
  ])(
    'selects and dynamically moves the $label from the canvas',
    ({ start, end, selectedType, commandType, idField, id }) => {
      const result = dragService(start, end);

      expect(result.selected).toEqual({ id, type: selectedType });
      expect(result.dispatched).toHaveLength(1);
      expect(result.dispatched[0]).toMatchObject({
        type: 'EXECUTE_BUILDING_COMMAND',
        command: {
          type: commandType,
          [idField]: id,
          origin: end,
        },
      });
      expect(result.toolState.startPos).toEqual(end);
    },
  );
});

describe('selectHandler structural grid drag — preview-then-commit', () => {
  function createGridHarness({ rotation = 0, origin = { x: 0, y: 0 }, handle = null } = {}) {
    const project = {
      building: {
        systems: {
          structural: {
            gridSystems: [
              {
                id: 'grid_1',
                name: 'Primary Grid',
                origin,
                rotation,
                axes: [
                  { id: 'x1', label: '1', orientation: 'vertical', offset: 0 },
                  { id: 'x2', label: '2', orientation: 'vertical', offset: 4000 },
                  { id: 'y1', label: 'A', orientation: 'horizontal', offset: 0 },
                  { id: 'y2', label: 'B', orientation: 'horizontal', offset: 5000 },
                ],
              },
            ],
            columnStacks: [],
          },
        },
      },
      floors: [],
    };
    const floor = { id: 'floor_1', walls: [], columns: [], doors: [], windows: [], rooms: [] };
    const mousedown = { x: 0, y: 0 };
    let toolState = {
      pendingDrag: false,
      dragging: true,
      dragType: 'move',
      startPos: { ...mousedown },
      originalPos: { ...mousedown },
    };
    const dispatched = [];

    const handler = createSelectHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: (action) => {
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      project,
      getFloor: () => floor,
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled: true,
    });

    // The rotate grip is an SVG element carrying data-handle, so a real
    // mousedown on it is what opens a handle drag.
    if (handle) {
      handler.onMouseDown({ ...mousedown }, { button: 0, target: { dataset: { handle } } }, toolState);
    }

    return {
      dispatched,
      getToolState: () => toolState,
      move(modelPos, e = { shiftKey: false }) {
        handler.onMouseMove(modelPos, e, toolState, 'grid_1', 'structuralGrid');
      },
      up(modelPos) {
        handler.onMouseUp(modelPos, { button: 0 }, toolState);
      },
      key(e) {
        handler.onKeyDown(e, toolState, 'grid_1', 'structuralGrid');
      },
    };
  }

  it('dispatches NOTHING during the drag and previews the cumulative origin', () => {
    const harness = createGridHarness();

    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: step * 40, y: step * 30 });
    }

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().wallDragPreview.gridTransform).toEqual({
      gridId: 'grid_1',
      origin: { x: 1200, y: 900 },
      rotation: 0,
    });
  });

  it('mouseup commits exactly ONE transform carrying the full move (gravity regression)', () => {
    const harness = createGridHarness();

    for (let step = 1; step <= 30; step += 1) {
      harness.move({ x: step * 40, y: step * 30 });
    }
    harness.up({ x: 1200, y: 900 });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0]).toMatchObject({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
        gridId: 'grid_1',
        origin: { x: 1200, y: 900 },
      },
    });
    expect(harness.getToolState().wallDragPreview).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });

  it('Escape cancels the grid drag: preview cleared, nothing dispatched', () => {
    const harness = createGridHarness();

    harness.move({ x: 800, y: 300 });
    expect(harness.getToolState().wallDragPreview).not.toBeNull();

    harness.key({ key: 'Escape' });

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().wallDragPreview).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });

  it('keeps the committed rotation when the grid is only moved', () => {
    const harness = createGridHarness({ rotation: 37, origin: { x: 500, y: 500 } });

    harness.move({ x: 300, y: 200 });
    harness.up({ x: 300, y: 200 });

    expect(harness.dispatched[0].command).toMatchObject({
      type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
      origin: { x: 800, y: 700 },
      rotation: 37,
    });
  });

  it('turns the grid to the pointer angle about its origin, clockwise-positive', () => {
    const harness = createGridHarness({ origin: { x: 1000, y: 1000 }, handle: 'grid-rotate' });

    // The handle rides the local +x axis, so a pointer straight out to the
    // right is 0°, and one straight DOWN the screen is +90° in y-down space.
    harness.move({ x: 6000, y: 1000 });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBe(0);

    harness.move({ x: 1000, y: 6000 });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBe(90);

    harness.move({ x: 1000, y: -4000 });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBe(-90);

    // Rotating never moves the origin.
    expect(harness.getToolState().wallDragPreview.gridTransform.origin).toEqual({ x: 1000, y: 1000 });
    expect(harness.dispatched).toHaveLength(0);
  });

  it('snaps rotation to 15° steps while Shift is held', () => {
    const harness = createGridHarness({ handle: 'grid-rotate' });

    // atan2(2000, 5000) ≈ 21.8° → nearest 15° step.
    harness.move({ x: 5000, y: 2000 }, { shiftKey: true });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBe(15);

    harness.move({ x: 5000, y: 2000 });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBeCloseTo(21.8, 1);
  });

  it('commits the rotation once on mouseup, origin included', () => {
    const harness = createGridHarness({ origin: { x: 2000, y: 0 }, rotation: 0, handle: 'grid-rotate' });

    // Sweep the grip round to 45°: it ends level with the origin diagonally.
    for (let step = 1; step <= 20; step += 1) {
      harness.move({ x: 2000 + step * 100, y: step * 100 });
    }
    expect(harness.dispatched).toHaveLength(0);

    harness.up({ x: 4000, y: 2000 });

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0]).toMatchObject({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.TRANSFORM_STRUCTURAL_GRID,
        gridId: 'grid_1',
        origin: { x: 2000, y: 0 },
        rotation: 45,
      },
    });
    expect(harness.getToolState().wallDragPreview).toBeNull();
  });

  it('Escape cancels a rotation with nothing dispatched', () => {
    const harness = createGridHarness({ handle: 'grid-rotate' });

    harness.move({ x: 3000, y: 3000 });
    expect(harness.getToolState().wallDragPreview.gridTransform.rotation).toBe(45);

    harness.key({ key: 'Escape' });

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.getToolState().wallDragPreview).toBeNull();
  });
});

describe('selectHandler — electrical devices', () => {
  // One 6000-long wall, 200 thick, with a device 1000mm along its right face.
  function deviceFloor() {
    return {
      id: 'floor_1',
      walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 }],
      columns: [],
      doors: [],
      windows: [],
      rooms: [],
      electricalDevices: [
        { id: 'elec_1', wallId: 'wall_1', offset: 1000, side: 'right', deviceType: 'outlet', mountHeight: 300 },
      ],
    };
  }

  function createDeviceHarness(floor = deviceFloor()) {
    let toolState = {};
    let selected = null;
    const dispatched = [];

    const handler = createSelectHandler({
      dispatch: (action) => dispatched.push(action),
      editorDispatch: (action) => {
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
        if (action.type === 'SELECT_OBJECT') selected = { id: action.id, type: action.objectType };
        if (action.type === 'DESELECT') selected = null;
      },
      getFloor: () => floor,
      activeFloorId: floor.id,
      viewport: { zoom: 0.1 },
      snapEnabled: false,
    });

    return {
      dispatched,
      getSelected: () => selected,
      down(modelPos) {
        handler.onMouseDown(modelPos, { button: 0, target: { dataset: {} } }, toolState);
      },
      move(modelPos) {
        handler.onMouseMove(modelPos, {}, toolState, selected?.id, selected?.type);
      },
      key(e) {
        handler.onKeyDown(e, toolState, selected?.id, selected?.type);
      },
    };
  }

  it('hit-tests the device ahead of its host wall', () => {
    const harness = createDeviceHarness();
    harness.down({ x: 1000, y: 100 });

    expect(harness.getSelected()).toEqual({ id: 'elec_1', type: 'electricalDevice' });
  });

  it('slides the device along the wall and re-faces it to the cursor side', () => {
    const harness = createDeviceHarness();
    harness.down({ x: 1000, y: 100 });
    harness.move({ x: 2500, y: -400 }); // promotes pendingDrag -> dragging
    harness.move({ x: 2500, y: -400 });

    expect(harness.dispatched).toContainEqual({
      type: 'ELECTRICAL_DEVICE_UPDATE',
      floorId: 'floor_1',
      device: { id: 'elec_1', offset: 2500, side: 'left' },
    });
  });

  it('clamps the slid offset inside the wall by the physical plate width', () => {
    const harness = createDeviceHarness();
    harness.down({ x: 1000, y: 100 });
    harness.move({ x: 99999, y: 100 });
    harness.move({ x: 99999, y: 100 });

    const last = harness.dispatched.at(-1);
    expect(last.device.offset).toBe(6000 - ELECTRICAL_PLATE.width / 2);
  });

  it('snaps the dragged device flush against a column standing on the wall', () => {
    const floor = deviceFloor();
    // 400×400 column centred on the wall at x=3000: faces at 2800 and 3200
    floor.columns = [{ id: 'col_1', x: 3000, y: 0, width: 400, depth: 400, rotation: 0 }];
    const harness = createDeviceHarness(floor);
    harness.down({ x: 1000, y: 100 });
    harness.move({ x: 2740, y: 100 });
    harness.move({ x: 2740, y: 100 });

    const last = harness.dispatched.at(-1);
    // plate (100 wide) sits flush against the 2800 column face
    expect(last.device.offset).toBe(2800 - ELECTRICAL_PLATE.width / 2);
  });

  it('deletes the selected device', () => {
    const harness = createDeviceHarness();
    harness.down({ x: 1000, y: 100 });
    harness.key({ key: 'Delete' });

    expect(harness.dispatched).toContainEqual({
      type: 'ELECTRICAL_DEVICE_DELETE',
      floorId: 'floor_1',
      deviceId: 'elec_1',
    });
    expect(harness.getSelected()).toBeNull();
  });
});
