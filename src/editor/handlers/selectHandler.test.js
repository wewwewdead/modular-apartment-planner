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

/**
 * Slab plate editing.
 *
 * A 6000 x 4000 plate. Corner handles move one vertex; the round handle at an
 * edge midpoint pushes that whole edge out along its outward normal, which is
 * how a floor grows into a cantilever over the storey below.
 *
 *      (0,0)────────edge 0────────(6000,0)      outward normal of edge 0 = -y
 *        │                            │
 *        │                            │
 *    (0,4000)──────────────────(6000,4000)
 *
 * Every frame is measured from the boundary as it stood at mousedown, so a slow
 * drag cannot accumulate its own edits (the "gravity" trap the wall drag had).
 */
describe('selectHandler — slab plate editing', () => {
  const PLATE = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ];

  function slabFloor() {
    return {
      id: 'floor_1',
      walls: [],
      columns: [],
      doors: [],
      windows: [],
      rooms: [],
      fixtures: [],
      railings: [],
      beams: [],
      stairs: [],
      landings: [],
      sectionCuts: [],
      slabs: [{ id: 'slab_1', floorId: 'floor_1', boundaryPoints: PLATE.map((p) => ({ ...p })), thickness: 200 }],
    };
  }

  /**
   * A chevron plate: the same 6000 x 4000 footprint with its top edge folded
   * down to a V at (3000, 2000). Pulling the bottom edge (edge 3) up past that
   * apex is the shortest route to a boundary that crosses itself.
   */
  const CHEVRON = [
    { x: 0, y: 0 },
    { x: 3000, y: 2000 },
    { x: 6000, y: 0 },
    { x: 6000, y: 6000 },
    { x: 0, y: 6000 },
  ];

  function chevronFloor() {
    const floor = slabFloor();
    floor.slabs[0].boundaryPoints = CHEVRON.map((point) => ({ ...point }));
    return floor;
  }

  function createSlabHarness({
    handle,
    index,
    start,
    snapEnabled = true,
    floor = slabFloor(),
    slabId = 'slab_1',
    floorBelow = null,
    showFloorBelowUnderlay = false,
  } = {}) {
    let toolState = {};
    const dispatched = [];

    const handler = createSelectHandler({
      dispatch: (action) => {
        dispatched.push(action);
        // The store commits per pointer-move, so the handler reads back its own
        // edits on the next frame — exactly the condition the origin snapshot
        // exists to survive.
        if (action.type === 'SLAB_UPDATE') {
          floor.slabs = floor.slabs.map((slab) => (slab.id === action.slab.id ? { ...slab, ...action.slab } : slab));
        }
      },
      editorDispatch: (action) => {
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      getFloor: () => floor,
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled,
      floorBelow,
      showFloorBelowUnderlay,
    });

    handler.onMouseDown(start, {
      button: 0,
      target: { dataset: { handle, index: String(index), ...(slabId ? { slabId } : {}) } },
    });

    return {
      dispatched,
      slabUpdates: () => dispatched.filter((action) => action.type === 'SLAB_UPDATE'),
      getBoundary: () => floor.slabs[0].boundaryPoints,
      getToolState: () => toolState,
      move(modelPos) {
        handler.onMouseMove(modelPos, {}, toolState, 'slab_1', 'slab');
      },
      up(modelPos) {
        handler.onMouseUp(modelPos, { button: 0 }, toolState);
      },
      key(e) {
        handler.onKeyDown(e, toolState, 'slab_1', 'slab');
      },
    };
  }

  it('moves a single vertex to the snapped cursor and leaves the rest alone', () => {
    const harness = createSlabHarness({ handle: 'slab-vertex', index: 2, start: { x: 6000, y: 4000 } });

    harness.move({ x: 6523, y: 4011 });

    expect(harness.getBoundary()).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6500, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  });

  it('pushes the whole edge out along its normal, carrying both of its vertices', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    harness.move({ x: 3000, y: -600 });

    expect(harness.getBoundary()).toEqual([
      { x: 0, y: -600 },
      { x: 6000, y: -600 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    // The number has to be on screen while the pointer is down: 600mm out.
    expect(harness.getToolState().slabEdgeDrag).toEqual({ offset: 600, point: { x: 3000, y: -600 } });
  });

  it('ignores cursor travel ALONG the edge, which would otherwise shear the plate', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    harness.move({ x: 5000, y: 0 });

    expect(harness.getBoundary()).toEqual(PLATE);
    // Nothing moved, so nothing was committed — the project stays clean.
    expect(harness.dispatched.filter((action) => action.type === 'SLAB_UPDATE')).toHaveLength(0);
  });

  it('stays cumulative from mousedown over a slow drag (gravity regression)', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    // 20 steps of 50mm. Measured against the live slab instead of the mousedown
    // snapshot, each frame would re-add the previous frame's push.
    for (let step = 1; step <= 20; step += 1) {
      harness.move({ x: 3000, y: -step * 50 });
    }

    expect(harness.getBoundary()[0]).toEqual({ x: 0, y: -1000 });
    expect(harness.getBoundary()[1]).toEqual({ x: 6000, y: -1000 });
  });

  it('pulls the edge back in on the reverse drag', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    harness.move({ x: 3000, y: -600 });
    harness.move({ x: 3000, y: 300 });

    expect(harness.getBoundary()[0]).toEqual({ x: 0, y: 300 });
    expect(harness.getToolState().slabEdgeDrag.offset).toBe(-300);
  });

  it('does nothing for a degenerate edge with no outward direction', () => {
    const floor = slabFloor();
    // Two coincident vertices: the edge between them has no direction.
    floor.slabs[0].boundaryPoints = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
    ];
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 0, y: 0 }, floor });

    harness.move({ x: 0, y: -600 });

    expect(harness.dispatched.filter((action) => action.type === 'SLAB_UPDATE')).toHaveLength(0);
  });

  it('moves nothing when the handle drag has lost its mousedown snapshot', () => {
    // No slab id on the handle means no snapshot was captured. Falling back to
    // the live boundary would make an edge push re-apply its own offset every
    // frame, so the drag does nothing at all instead.
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 }, slabId: null });

    harness.move({ x: 3000, y: -600 });

    expect(harness.slabUpdates()).toHaveLength(0);
    expect(harness.getBoundary()).toEqual(PLATE);
  });

  it('Escape puts the plate back exactly where the drag found it', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    harness.move({ x: 3000, y: -600 });
    expect(harness.getBoundary()[0]).toEqual({ x: 0, y: -600 });

    harness.key({ key: 'Escape' });

    // A slab commits per pointer-move, so cancelling has to restore geometry —
    // clearing the drag state alone would leave the last frame standing.
    expect(harness.getBoundary()).toEqual(PLATE);
    expect(harness.slabUpdates().at(-1).slab.boundaryPoints).toEqual(PLATE);
    expect(harness.getToolState().slabEditOrigin).toBeNull();
    expect(harness.getToolState().slabEdgeDrag).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });

  it('Escape reverts a vertex drag the same way', () => {
    const harness = createSlabHarness({ handle: 'slab-vertex', index: 2, start: { x: 6000, y: 4000 } });

    harness.move({ x: 6523, y: 4011 });
    expect(harness.getBoundary()[2]).toEqual({ x: 6500, y: 4000 });

    harness.key({ key: 'Escape' });

    expect(harness.getBoundary()).toEqual(PLATE);
  });

  it('Escape dispatches nothing when the drag never changed the boundary', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    // Travel along the edge moves nothing, so there is nothing to put back.
    harness.move({ x: 5000, y: 0 });
    harness.key({ key: 'Escape' });

    expect(harness.slabUpdates()).toHaveLength(0);
    expect(harness.getToolState().slabEditOrigin).toBeNull();
  });

  it('stops at the last valid shape when the edge drag would fold the plate through itself', () => {
    // Chevron edge 3 is the bottom edge; its outward normal is +y, so pulling
    // the cursor up gives a negative offset. Past the V apex at y=2000 the
    // bottom edge crosses the folded top and the plate is no longer a floor.
    const harness = createSlabHarness({
      handle: 'slab-edge',
      index: 3,
      start: { x: 3000, y: 6000 },
      floor: chevronFloor(),
    });

    harness.move({ x: 3000, y: 3000 }); // 3000 in — still clear of the apex
    expect(harness.getBoundary()[3]).toEqual({ x: 6000, y: 3000 });
    expect(harness.slabUpdates()).toHaveLength(1);

    harness.move({ x: 3000, y: 1000 }); // 5000 in — crosses the folded top
    expect(harness.slabUpdates()).toHaveLength(1);
    expect(harness.getBoundary()[3]).toEqual({ x: 6000, y: 3000 });
    // The readout is dropped with the frame, so the number on screen never
    // describes a shape that was not applied.
    expect(harness.getToolState().slabEdgeDrag.offset).toBe(-3000);

    harness.move({ x: 3000, y: 2500 }); // back to a valid region — follows again
    expect(harness.slabUpdates()).toHaveLength(2);
    expect(harness.getBoundary()[3]).toEqual({ x: 6000, y: 2500 });
    expect(harness.getToolState().slabEdgeDrag.offset).toBe(-3500);
  });

  it('refuses the vertex drag frames that would cross the boundary, and takes the next valid one', () => {
    const harness = createSlabHarness({ handle: 'slab-vertex', index: 2, start: { x: 6000, y: 4000 } });

    // Dragging the corner across to the far side folds edge 1 through edge 3.
    harness.move({ x: -1000, y: 2000 });
    expect(harness.slabUpdates()).toHaveLength(0);
    expect(harness.getBoundary()).toEqual(PLATE);

    harness.move({ x: 6500, y: 4000 });
    expect(harness.getBoundary()[2]).toEqual({ x: 6500, y: 4000 });
  });

  it('clears the drag snapshot and the readout on release', () => {
    const harness = createSlabHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

    harness.move({ x: 3000, y: -600 });
    expect(harness.getToolState().slabEditOrigin).not.toBeNull();

    harness.up({ x: 3000, y: -600 });

    expect(harness.getToolState().slabEditOrigin).toBeNull();
    expect(harness.getToolState().slabEdgeDrag).toBeNull();
    expect(harness.getToolState().dragging).toBe(false);
  });

  /**
   * Snapping the plate to the floor below.
   *
   * The ghost underlay carries a wall along y=-1000 and a column corner-post at
   * (6180, 4020). Edge 0's outward normal is -y, so pushing it out 1000 lands it
   * dead on that wall line — 1000, not the 950 the 50mm grid would round 960 to.
   * That difference is the whole test: the plate stops ON its support instead of
   * 50mm shy of it.
   */
  describe('snapping to the floor below', () => {
    function ghostFloor() {
      return {
        id: 'floor_0',
        walls: [
          { id: 'wall_below', start: { x: 0, y: -1000 }, end: { x: 6000, y: -1000 }, thickness: 200 },
          { id: 'post_below', start: { x: 6180, y: 4020 }, end: { x: 6180, y: 8000 }, thickness: 200 },
        ],
        columns: [],
      };
    }

    function ghostHarness(overrides) {
      return createSlabHarness({ floorBelow: ghostFloor(), showFloorBelowUnderlay: true, ...overrides });
    }

    it('clicks the dragged edge onto the wall line below', () => {
      const harness = ghostHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

      harness.move({ x: 3000, y: -960 });

      expect(harness.getBoundary()[0]).toEqual({ x: 0, y: -1000 });
      expect(harness.getBoundary()[1]).toEqual({ x: 6000, y: -1000 });
      // The readout reports the offset that was applied, not the raw travel.
      expect(harness.getToolState().slabEdgeDrag.offset).toBe(1000);
    });

    it('falls back to the grid once the edge is out of the reference line reach', () => {
      const harness = ghostHarness({ handle: 'slab-edge', index: 0, start: { x: 3000, y: 0 } });

      // 1130 out: past the wall line below by more than the 100mm tolerance.
      harness.move({ x: 3000, y: -1130 });

      expect(harness.getBoundary()[0]).toEqual({ x: 0, y: -1150 });
      expect(harness.getToolState().slabEdgeDrag.offset).toBe(1150);
    });

    it('prefers a reference point to the grid on a vertex drag', () => {
      const harness = ghostHarness({ handle: 'slab-vertex', index: 2, start: { x: 6000, y: 4000 } });

      // The grid would round this to (6150, 4050); the wall corner below is 36mm
      // away and wins.
      harness.move({ x: 6150, y: 4040 });

      expect(harness.getBoundary()[2]).toEqual({ x: 6180, y: 4020 });
    });

    it('leaves the plate on the grid while the ghost is hidden', () => {
      const edge = createSlabHarness({
        handle: 'slab-edge',
        index: 0,
        start: { x: 3000, y: 0 },
        floorBelow: ghostFloor(),
        showFloorBelowUnderlay: false,
      });
      edge.move({ x: 3000, y: -960 });

      expect(edge.getBoundary()[0]).toEqual({ x: 0, y: -950 });
      expect(edge.getToolState().slabEdgeDrag.offset).toBe(950);

      const vertex = createSlabHarness({
        handle: 'slab-vertex',
        index: 2,
        start: { x: 6000, y: 4000 },
        floorBelow: ghostFloor(),
        showFloorBelowUnderlay: false,
      });
      vertex.move({ x: 6150, y: 4040 });

      expect(vertex.getBoundary()[2]).toEqual({ x: 6150, y: 4050 });
    });

    it('leaves the plate on the raw cursor while snapping is off', () => {
      const harness = ghostHarness({
        handle: 'slab-vertex',
        index: 2,
        start: { x: 6000, y: 4000 },
        snapEnabled: false,
      });

      harness.move({ x: 6150, y: 4040 });

      expect(harness.getBoundary()[2]).toEqual({ x: 6150, y: 4040 });
    });

    it('still refuses a reference-snapped frame that folds the plate through itself', () => {
      const harness = createSlabHarness({
        handle: 'slab-edge',
        index: 3,
        start: { x: 3000, y: 6000 },
        floor: chevronFloor(),
        floorBelow: {
          id: 'floor_0',
          walls: [
            // 3000 in from the chevron's bottom edge: clear of the apex.
            { id: 'shallow', start: { x: 0, y: 3000 }, end: { x: 6000, y: 3000 } },
            // 5000 in: past the apex, where the plate crosses itself.
            { id: 'deep', start: { x: 0, y: 1000 }, end: { x: 6000, y: 1000 } },
          ],
          columns: [],
        },
        showFloorBelowUnderlay: true,
      });

      // Reference-snapped to the shallow line — -3000, not the grid's -2950.
      harness.move({ x: 3000, y: 3040 });
      expect(harness.getBoundary()[3]).toEqual({ x: 6000, y: 3000 });
      expect(harness.getToolState().slabEdgeDrag.offset).toBe(-3000);

      // The deep line is in reach of the cursor, but landing on it folds the
      // plate: the whole frame goes, readout included, and the plate holds.
      harness.move({ x: 3000, y: 1040 });
      expect(harness.slabUpdates()).toHaveLength(1);
      expect(harness.getBoundary()[3]).toEqual({ x: 6000, y: 3000 });
      expect(harness.getToolState().slabEdgeDrag.offset).toBe(-3000);
    });
  });
});

/**
 * Manual dimensions are thin overlays: they lie inside rooms and cross walls by
 * construction, so testing them AFTER those area fills made them unclickable —
 * and therefore undeletable from the canvas. They now rank above railings,
 * beams, walls, rooms and slabs, but still below the small solid targets they
 * measure between (openings, columns, fixtures).
 *
 * Hit tolerance is (SNAP_DISTANCE_PX / zoom) * 2.5 = 250mm at zoom 0.1.
 */
describe('selectHandler — manual dimension hit priority', () => {
  function annotationFloor(overrides = {}) {
    return {
      id: 'floor_1',
      walls: [],
      columns: [],
      doors: [],
      windows: [],
      rooms: [],
      fixtures: [],
      railings: [],
      beams: [],
      stairs: [],
      landings: [],
      slabs: [],
      sectionCuts: [],
      annotations: [],
      ...overrides,
    };
  }

  function createAnnotationHarness(floor) {
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
      key(e) {
        handler.onKeyDown(e, toolState, selected?.id, selected?.type);
      },
    };
  }

  // 6000x5000 room with a horizontal dimension measuring 1000->5000 at y=2000,
  // offset 300, so the dimension LINE runs at y=2300 — deep inside the room.
  function roomFloor() {
    return annotationFloor({
      rooms: [
        {
          id: 'room_1',
          points: [
            { x: 0, y: 0 },
            { x: 6000, y: 0 },
            { x: 6000, y: 5000 },
            { x: 0, y: 5000 },
          ],
        },
      ],
      annotations: [
        {
          id: 'anno_1',
          type: 'dimension',
          mode: 'horizontal',
          startPoint: { x: 1000, y: 2000 },
          endPoint: { x: 5000, y: 2000 },
          offset: 300,
          textOverride: '',
        },
      ],
    });
  }

  it('selects a dimension lying inside a room, not the room', () => {
    const harness = createAnnotationHarness(roomFloor());
    harness.down({ x: 3000, y: 2300 });

    expect(harness.getSelected()).toEqual({ id: 'anno_1', type: 'annotation' });
  });

  it('selects a dimension where its segment crosses a wall, not the wall', () => {
    // Vertical dimension at x=3000 spanning y=-1500..1500, straight across a
    // 200-thick wall running along y=0.
    const floor = annotationFloor({
      walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 }],
      annotations: [
        {
          id: 'anno_1',
          type: 'dimension',
          mode: 'vertical',
          startPoint: { x: 3000, y: -1500 },
          endPoint: { x: 3000, y: 1500 },
          offset: 0,
          textOverride: '',
        },
      ],
    });
    const harness = createAnnotationHarness(floor);
    harness.down({ x: 3000, y: 0 });

    expect(harness.getSelected()).toEqual({ id: 'anno_1', type: 'annotation' });
  });

  it('keeps the window clickable when a dimension extension line starts at its edge', () => {
    // Window centred at x=2000, 1200 wide: body spans x=1400..2600, y=-100..100.
    // The dimension measures from that right edge (2600,0) to (5000,0), so its
    // extension line rises out of the window jamb.
    const floor = annotationFloor({
      walls: [{ id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 }],
      windows: [{ id: 'win_1', wallId: 'wall_1', offset: 2000, width: 1200, height: 1200, sillHeight: 900 }],
      annotations: [
        {
          id: 'anno_1',
          type: 'dimension',
          mode: 'horizontal',
          startPoint: { x: 2600, y: 0 },
          endPoint: { x: 5000, y: 0 },
          offset: 800,
          textOverride: '',
        },
      ],
    });

    // 100mm inside the jamb — well within the 250mm annotation band, yet the
    // window body still owns the click.
    const onWindow = createAnnotationHarness(floor);
    onWindow.down({ x: 2500, y: 0 });
    expect(onWindow.getSelected()).toEqual({ id: 'win_1', type: 'window' });

    // Off the window body, the same extension line is reachable.
    const offWindow = createAnnotationHarness(floor);
    offWindow.down({ x: 2650, y: 400 });
    expect(offWindow.getSelected()).toEqual({ id: 'anno_1', type: 'annotation' });
  });

  it('still selects the room when the click is clear of every dimension segment', () => {
    const harness = createAnnotationHarness(roomFloor());
    harness.down({ x: 3000, y: 4500 }); // 2200mm below the dimension line

    expect(harness.getSelected()).toEqual({ id: 'room_1', type: 'room' });
  });

  it('deletes the selected dimension with the Delete key', () => {
    const harness = createAnnotationHarness(roomFloor());
    harness.down({ x: 3000, y: 2300 });
    harness.key({ key: 'Delete' });

    expect(harness.dispatched).toContainEqual({
      type: 'ANNOTATION_DELETE',
      floorId: 'floor_1',
      annotationId: 'anno_1',
    });
    expect(harness.getSelected()).toBeNull();
  });
});

/* ── Picking one cantilever off the plan ──────────────────────────────────
 *
 * An overhang indicator is drawn along a stretch of a slab's own edge, so
 * "was that click on the overhang or on the plate?" cannot be answered by
 * geometry — the two are in the same place. It is answered by what the pointer
 * was actually over: the indicator carries its own hit stroke and its own data
 * attributes, and only a click that lands on that stroke means the run.
 */
describe('selectHandler — picking an overhang run', () => {
  const PLATE = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ];

  function overhangFloor() {
    return {
      id: 'floor_1',
      walls: [],
      columns: [],
      doors: [],
      windows: [],
      rooms: [],
      fixtures: [],
      railings: [],
      beams: [],
      stairs: [],
      landings: [],
      sectionCuts: [],
      annotations: [],
      electricalDevices: [],
      slabs: [{ id: 'slab_1', floorId: 'floor_1', boundaryPoints: PLATE, thickness: 200 }],
    };
  }

  function createPickHarness() {
    const floor = overhangFloor();
    const editorActions = [];
    let toolState = {};

    const handler = createSelectHandler({
      dispatch: () => {},
      editorDispatch: (action) => {
        editorActions.push(action);
        if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      },
      project: { building: { systems: {} } },
      getFloor: () => floor,
      activeFloorId: 'floor_1',
      viewport: { zoom: 0.1 },
      snapEnabled: true,
    });

    return {
      editorActions,
      getToolState: () => toolState,
      down: (modelPos, dataset = {}) => handler.onMouseDown(modelPos, { button: 0, target: { dataset } }),
      key: (key) => handler.onKeyDown({ key }, toolState, 'slab_1', 'slab'),
    };
  }

  it('selects the run that was clicked, along with the plate it belongs to', () => {
    const harness = createPickHarness();

    harness.down({ x: 3000, y: 4000 }, { overhangSlab: 'slab_1', overhangEdge: '2' });

    expect(harness.editorActions).toEqual([{ type: 'SELECT_OVERHANG_EDGE', slabId: 'slab_1', edgeIndex: 2 }]);
  });

  it('selects the plate with no run in mind when the click lands anywhere else on it', () => {
    const harness = createPickHarness();

    harness.down({ x: 3000, y: 2000 });

    expect(harness.editorActions[0]).toEqual({ type: 'SELECT_OBJECT', id: 'slab_1', objectType: 'slab' });
    expect(harness.editorActions.some((action) => action.type === 'SELECT_OVERHANG_EDGE')).toBe(false);
  });

  it('lets the plate edge handle keep its drag, indicator or no indicator', () => {
    // The edge handle sits at the midpoint of the very edge an indicator runs
    // along. Dragging it is how the cantilever got there, so it outranks the
    // annotation drawn on top of the result.
    const harness = createPickHarness();

    harness.down({ x: 3000, y: 4000 }, { handle: 'slab-edge', index: '2', slabId: 'slab_1', overhangSlab: 'slab_1' });

    expect(harness.getToolState()).toMatchObject({ dragging: true, handle: 'slab-edge', handleIndex: 2 });
    expect(harness.editorActions.some((action) => action.type === 'SELECT_OVERHANG_EDGE')).toBe(false);
  });

  it('gives the run back on Escape and leaves the plate selected', () => {
    const harness = createPickHarness();

    harness.key('Escape');

    expect(harness.editorActions).toEqual([{ type: 'CLEAR_OVERHANG_EDGE_SELECTION' }]);
  });
});
