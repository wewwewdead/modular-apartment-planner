import { describe, expect, it } from 'vitest';
import { createSelectHandler } from './selectHandler';

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
