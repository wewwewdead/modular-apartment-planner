import { describe, expect, it } from 'vitest';
import { createColumn, createFloor, createSlab } from '@/domain/models';
import { createSelectHandler } from './selectHandler';

/**
 * Every way a select-tool drag ends — release, Escape, the end of a marquee —
 * and every press that starts a move leaves the same idle drag state behind.
 * A key one of them forgot outlived its drag: a slab edit origin left by a
 * handle drag whose release never arrived would turn the next column move's
 * Escape into a slab restore.
 */

const IDLE = {
  dragging: false,
  pendingDrag: false,
  dragType: null,
  handle: null,
  handleIndex: null,
  startPos: null,
  originalPos: null,
  currentPos: null,
  wallDragPreview: null,
  slabEditOrigin: null,
  slabEdgeDrag: null,
};

const SLAB_RING = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

// What a slab edge-handle drag leaves when its release is lost.
const LEFT_BY_A_LOST_SLAB_DRAG = {
  handle: 'slab-edge',
  handleIndex: 1,
  currentPos: { x: 10, y: 10 },
  slabEditOrigin: { slabId: 'slab_1', boundaryPoints: SLAB_RING.map((point) => ({ ...point, x: point.x - 500 })) },
  slabEdgeDrag: { offset: 500, point: { x: 6500, y: 2000 } },
};

function createHarness(initialToolState = {}) {
  const floor = createFloor('Ground', 0);
  floor.columns = [{ ...createColumn(8000, 2000, 300, 300), id: 'col_1' }];
  floor.slabs = [{ ...createSlab(floor.id, SLAB_RING, 200, 0), id: 'slab_1' }];
  const project = { floors: [floor], building: {} };

  let toolState = { ...initialToolState };
  let selection = { id: null, type: null };
  const dispatched = [];
  const handler = createSelectHandler({
    dispatch: (action) => dispatched.push(action),
    editorDispatch: (action) => {
      if (action.type === 'UPDATE_TOOL_STATE') toolState = { ...toolState, ...action.payload };
      if (action.type === 'SELECT_OBJECT') selection = { id: action.id, type: action.objectType };
    },
    project,
    getProject: () => project,
    getFloor: () => floor,
    activeFloorId: floor.id,
    viewport: { zoom: 0.1 },
    snapEnabled: false,
  });

  return {
    dispatched,
    getToolState: () => toolState,
    press: (point) => handler.onMouseDown(point, { button: 0, target: { dataset: {} } }, toolState),
    release: (point) => handler.onMouseUp(point, { button: 0 }, toolState),
    escape: () => handler.onKeyDown({ key: 'Escape' }, toolState, selection.id, selection.type),
  };
}

describe('select tool drag state', () => {
  it('a move press starts from idle, whatever an earlier drag left', () => {
    const harness = createHarness(LEFT_BY_A_LOST_SLAB_DRAG);

    harness.press({ x: 8000, y: 2000 });

    expect(harness.getToolState()).toEqual({
      ...IDLE,
      pendingDrag: true,
      dragType: 'move',
      startPos: { x: 8000, y: 2000 },
      originalPos: { x: 8000, y: 2000 },
    });
  });

  it('Escape on that move puts the column back rather than restoring a slab', () => {
    const harness = createHarness(LEFT_BY_A_LOST_SLAB_DRAG);

    harness.press({ x: 8000, y: 2000 });
    harness.escape();

    expect(harness.dispatched).toEqual([{ type: 'CANCEL_DRAG_GESTURE' }]);
    expect(harness.getToolState()).toEqual(IDLE);
  });

  it('the end of a marquee leaves the same idle state as any other release', () => {
    const harness = createHarness({ ...LEFT_BY_A_LOST_SLAB_DRAG, pendingDrag: true, originalPos: { x: 1, y: 1 } });

    harness.press({ x: 20000, y: 20000 });
    expect(harness.getToolState().dragType).toBe('marquee');
    harness.release({ x: 20000, y: 20000 });

    expect(harness.getToolState()).toEqual(IDLE);
  });

  it('a release and an Escape after a move both end idle', () => {
    const released = createHarness();
    released.press({ x: 8000, y: 2000 });
    released.release({ x: 8000, y: 2000 });
    expect(released.getToolState()).toEqual(IDLE);

    const escaped = createHarness();
    escaped.press({ x: 8000, y: 2000 });
    escaped.escape();
    expect(escaped.getToolState()).toEqual(IDLE);
  });
});
