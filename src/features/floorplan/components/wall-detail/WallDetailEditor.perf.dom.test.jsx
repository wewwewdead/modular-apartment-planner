/* @vitest-environment jsdom */
/**
 * The wall detail editor's render costs (perf pass 3, D2.4), mirroring the
 * ceiling editor's:
 *   - every edit goes out with `coordination: 'defer'` and the coordination
 *     pass is settled once the editor has been idle, or straight away when it
 *     closes;
 *   - a frame pan moves the view once per animation frame and re-renders none
 *     of the elevation's committed layers;
 *   - the drawing's box is measured once per press and kept only while the
 *     button is held: a hover between clicks measures afresh.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createFloor, createWall } from '@/domain/models';
import { createWallDetailing } from '@/domain/wallDetailing';
import * as selectionReadout from './wallDetailSelectionReadout';
import { COORDINATION_SETTLE_DELAY_MS } from '../ceiling-detail/useDeferredCoordination';
import WallDetailEditor from './WallDetailEditor';

const mocks = vi.hoisted(() => ({
  project: null,
  dispatch: vi.fn(),
  editorDispatch: vi.fn(),
  editor: null,
}));

vi.mock('@/features/floorplan/context/FloorplanContext', () => ({
  useProject: () => ({ project: mocks.project, dispatch: mocks.dispatch }),
  useEditor: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
  useEditorState: () => ({ ...mocks.editor, dispatch: mocks.editorDispatch }),
}));

vi.mock('@/features/floorplan/components/preview/ThreePreviewPanel', () => ({ default: () => null }));

// Called once per screw each time the screw layer renders (the screw's title).
vi.mock('./wallDetailSelectionReadout', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, describeSelectedFastener: vi.fn(actual.describeSelectedFastener) };
});

const RECT = { left: 0, top: 0, width: 900, height: 810, right: 900, bottom: 810, x: 0, y: 0 };
let svgRect = RECT;
let svgMeasures = 0;

beforeEach(() => {
  const floor = createFloor('Ground', 0);
  const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
    assembly: { preset: 'fiber_cement', framing: { spacing: 400, nogginRows: 1 } },
  });
  wall.assembly.detailing = createWallDetailing({ enabled: true, sides: { interior: { enabled: true } } });
  floor.walls = [wall];
  mocks.project = { id: 'project', floors: [floor] };
  mocks.editor = { wallDetailEditor: { floorId: floor.id, wallId: wall.id } };
  mocks.dispatch.mockReset();
  mocks.editorDispatch.mockReset();
  svgRect = RECT;
  svgMeasures = 0;
  // The drawing's own box can be moved by a test; everything else sits at RECT.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function measure() {
    if (this.matches?.('svg[data-tool]')) {
      svgMeasures += 1;
      return svgRect;
    }
    return RECT;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const canvas = (container) => container.querySelector('svg[data-tool]');
const frame = (container) => canvas(container).parentElement;
const actions = () => mocks.dispatch.mock.calls.map(([action]) => action);

/** Drives the animation frames the editor schedules. */
function createFrameClock() {
  const callbacks = [];
  let nextHandle = 1;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.push({ handle, callback });
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle) => {
    const index = callbacks.findIndex((entry) => entry.handle === handle);
    if (index >= 0) callbacks.splice(index, 1);
  });
  return {
    flush() {
      const due = callbacks.splice(0, callbacks.length);
      act(() => {
        for (const entry of due) entry.callback(performance.now());
      });
    },
  };
}

describe('wall-detail edits defer the coordination pass', () => {
  it('sends each edit deferred and settles once the editor has been idle', () => {
    vi.useFakeTimers();
    const { getByText } = render(<WallDetailEditor />);
    fireEvent.click(getByText('Remove all screws'));

    expect(actions()).toHaveLength(1);
    expect(actions()[0]).toMatchObject({ type: 'WALL_UPDATE', coordination: 'defer' });

    act(() => vi.advanceTimersByTime(COORDINATION_SETTLE_DELAY_MS - 1));
    expect(actions()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(actions().at(-1)).toEqual({ type: 'END_DRAG_GESTURE', settleDeferred: true });
  });

  it('settles straight away when the editor closes', () => {
    vi.useFakeTimers();
    const view = render(<WallDetailEditor />);
    fireEvent.click(view.getByText('Remove all screws'));
    mocks.editor = { wallDetailEditor: null };
    view.rerender(<WallDetailEditor />);
    expect(actions().at(-1)).toEqual({ type: 'END_DRAG_GESTURE', settleDeferred: true });
  });

  it('settles nothing when nothing was edited', () => {
    vi.useFakeTimers();
    const view = render(<WallDetailEditor />);
    act(() => vi.advanceTimersByTime(COORDINATION_SETTLE_DELAY_MS * 2));
    view.unmount();
    expect(actions()).toHaveLength(0);
  });
});

describe('a frame pan', () => {
  const press = (container, x, y) =>
    fireEvent.pointerDown(frame(container), { button: 1, buttons: 4, pointerId: 3, clientX: x, clientY: y });
  const move = (container, x, y) =>
    fireEvent.pointerMove(frame(container), { button: 1, buttons: 4, pointerId: 3, clientX: x, clientY: y });
  const release = (container, x, y) =>
    fireEvent.pointerUp(frame(container), { button: 1, buttons: 0, pointerId: 3, clientX: x, clientY: y });

  it('moves the view once per frame, to where the pointer last was', () => {
    const clock = createFrameClock();
    const { container } = render(<WallDetailEditor />);
    const before = canvas(container).style.transform;
    press(container, 400, 300);
    move(container, 410, 305);
    move(container, 430, 315);
    // Two moves, no frame yet: the view has not moved.
    expect(canvas(container).style.transform).toBe(before);
    clock.flush();
    expect(canvas(container).style.transform).toBe('translate(30px, 15px) scale(1)');
  });

  it('lands the last move on release, even before its frame', () => {
    const clock = createFrameClock();
    const { container } = render(<WallDetailEditor />);
    press(container, 400, 300);
    move(container, 450, 340);
    release(container, 450, 340);
    expect(canvas(container).style.transform).toBe('translate(50px, 40px) scale(1)');
    // And the frame that was waiting does not move it again.
    clock.flush();
    expect(canvas(container).style.transform).toBe('translate(50px, 40px) scale(1)');
  });

  it('re-renders none of the committed layers', () => {
    const clock = createFrameClock();
    const { container } = render(<WallDetailEditor />);
    const screws = container.querySelectorAll('title');
    expect([...screws].filter((node) => node.textContent.startsWith('Screw ·')).length).toBeGreaterThan(100);
    selectionReadout.describeSelectedFastener.mockClear();
    press(container, 400, 300);
    for (let step = 1; step <= 5; step += 1) {
      move(container, 400 + step * 10, 300);
      clock.flush();
    }
    release(container, 450, 300);
    expect(canvas(container).style.transform).toBe('translate(50px, 0px) scale(1)');
    expect(selectionReadout.describeSelectedFastener).not.toHaveBeenCalled();
  });
});

describe('the drawing box is pinned only while a button is held', () => {
  /** The custom board the last WALL_UPDATE carried. */
  const committedBoard = () =>
    actions().at(-1)?.wall?.assembly?.detailing?.sides?.interior?.layout?.customPanels?.at(-1) || null;

  function drawBoard(container, { moveRectMidDrag = false } = {}) {
    fireEvent.click(container.querySelector('button[title^="Draw panel"]'));
    const svg = canvas(container);
    fireEvent.pointerDown(svg, { button: 0, buttons: 1, pointerId: 1, clientX: 200, clientY: 200 });
    if (moveRectMidDrag) svgRect = { ...RECT, left: 150, right: 1050, x: 150 };
    fireEvent.pointerMove(svg, { button: 0, buttons: 1, pointerId: 1, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(svg, { button: 0, buttons: 1, pointerId: 1, clientX: 600, clientY: 600 });
    fireEvent.pointerUp(svg, { button: 0, buttons: 0, pointerId: 1, clientX: 600, clientY: 600 });
    return committedBoard();
  }

  it('measures the drawing once for a whole drag', () => {
    const { container } = render(<WallDetailEditor />);
    svgMeasures = 0;
    expect(drawBoard(container)).not.toBeNull();
    expect(svgMeasures).toBe(1);
  });

  it('maps every move of a drag through the box its press was measured in', () => {
    const control = render(<WallDetailEditor />);
    const expected = drawBoard(control.container);
    control.unmount();
    mocks.dispatch.mockReset();

    const { container } = render(<WallDetailEditor />);
    const board = drawBoard(container, { moveRectMidDrag: true });
    expect({ u: board.u, v: board.v, width: board.width, height: board.height }).toEqual({
      u: expected.u,
      v: expected.v,
      width: expected.width,
      height: expected.height,
    });
  });

  it('measures afresh for a hover between the clicks of a trace', () => {
    const { container } = render(<WallDetailEditor />);
    fireEvent.click(container.querySelector('button[title^="Trace cut panel"]'));
    const svg = canvas(container);
    const click = (x, y) => {
      fireEvent.pointerDown(svg, { button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y });
      fireEvent.pointerUp(svg, { button: 0, buttons: 0, pointerId: 1, clientX: x, clientY: y });
    };
    const lastPoint = () =>
      container.querySelector('polyline[data-preview="trace"]').getAttribute('points').trim().split(' ').at(-1);

    click(300, 300);
    click(500, 300);
    fireEvent.pointerMove(svg, { buttons: 0, pointerId: 1, clientX: 500, clientY: 500 });
    const atRect = lastPoint();
    // The drawing moves (a layout change nothing observed): the next hover has
    // to land where the pointer now is over it, not where it used to be.
    svgRect = { ...RECT, left: 150, right: 1050, x: 150 };
    fireEvent.pointerMove(svg, { buttons: 0, pointerId: 1, clientX: 650, clientY: 500 });
    expect(lastPoint()).toBe(atRect);
  });
});
