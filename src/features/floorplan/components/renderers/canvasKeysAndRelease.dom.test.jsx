/* @vitest-environment jsdom */
/**
 * Plan-canvas keyboard routing and pointer-release robustness:
 *   - a tool's own letter (the door's F flip, the fixture's R turn) is not
 *     taken by the global tool shortcuts;
 *   - a double-click with a placement tool places one opening, not two;
 *   - a cancelled pointer ends a drag like a release does;
 *   - the Space-pan latch lets go when the key comes up anywhere, or focus leaves;
 *   - an open wall/ceiling detail editor keeps plan shortcuts from firing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import Modal from '@/ui/Modal';
import { createColumn, createProject, createWall } from '@/domain/models';
import { DEFAULT_ZOOM } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { FloorplanProvider, useFloorplanContext } from '../../context/FloorplanContext';
import { DaylightStudyProvider } from '../../context/DaylightStudyContext';
import SvgCanvas from './SvgCanvas';

afterEach(cleanup);

// Initial viewport: pan 400,300 at DEFAULT_ZOOM over a zero-origin rect in jsdom.
const toClient = (modelX, modelY) => ({
  clientX: 400 + modelX * DEFAULT_ZOOM,
  clientY: 300 + modelY * DEFAULT_ZOOM,
});

function projectWith({ walls = [], columns = [] } = {}) {
  const project = createProject('Keys');
  return {
    ...project,
    floors: project.floors.map((floor, index) => (index === 0 ? { ...floor, walls, columns } : floor)),
  };
}

const storeBox = { current: null };
const store = () => storeBox.current;

function StoreProbe() {
  const context = useFloorplanContext();
  useEffect(() => {
    storeBox.current = context;
  });
  return null;
}

function renderCanvas(initialProject, extra = null) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <ClipboardProvider>
            <FloorplanProvider initialProject={initialProject}>
              <DaylightStudyProvider>
                <StoreProbe />
                <SvgCanvas />
                {extra}
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);
  const view = render(<RouterProvider router={router} />);
  return view.container.querySelector('svg');
}

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

// jsdom has no PointerEvent constructor; React only reads these fields.
const pointer = (type, position, init = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...position, ...init });

const editorState = () => store().state.editor;
const floor0 = () => store().state.project.floors[0];

function setTool(tool) {
  act(() => store().dispatch({ type: 'SET_TOOL', tool }));
}

function press(key, target = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('plan canvas keys and releases', () => {
  let frames;

  beforeEach(() => {
    frames = createFrameClock();
    storeBox.current = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function hover(svg, modelX, modelY) {
    act(() => {
      svg.dispatchEvent(pointer('pointermove', toClient(modelX, modelY)));
    });
    frames.flush();
  }

  function click(svg, modelX, modelY) {
    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(modelX, modelY)));
      svg.dispatchEvent(pointer('pointerup', toClient(modelX, modelY)));
      window.dispatchEvent(pointer('pointerup', toClient(modelX, modelY)));
    });
  }

  describe('keys a tool uses for itself', () => {
    it('F flips the door swing and keeps the door tool', () => {
      const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
      const svg = renderCanvas(projectWith({ walls: [wall] }));
      setTool(TOOLS.DOOR);
      hover(svg, 3000, 0);
      expect(editorState().toolState.openDirection).toBe('left');

      press('f');

      expect(editorState().activeTool).toBe(TOOLS.DOOR);
      expect(editorState().toolState.openDirection).toBe('right');
    });

    it('F flips the electrical face and keeps the electrical tool', () => {
      const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
      const svg = renderCanvas(projectWith({ walls: [wall] }));
      setTool(TOOLS.ELECTRICAL);
      hover(svg, 3000, 200);
      const side = editorState().toolState.previewSide;
      expect(side).toBeTruthy();

      press('f');

      expect(editorState().activeTool).toBe(TOOLS.ELECTRICAL);
      expect(editorState().toolState.previewSide).toBe(side === 'left' ? 'right' : 'left');
    });

    it('R turns the fixture preview and keeps the fixture tool', () => {
      renderCanvas(projectWith());
      setTool(TOOLS.FIXTURE);

      press('r');

      expect(editorState().activeTool).toBe(TOOLS.FIXTURE);
      expect(editorState().toolState.previewRotation).toBe(90);
    });

    it('leaves F and R as tool shortcuts for every other tool', () => {
      renderCanvas(projectWith());
      setTool(TOOLS.WALL);
      press('f');
      expect(editorState().activeTool).toBe(TOOLS.FIXTURE);
      setTool(TOOLS.SELECT);
      press('r');
      expect(editorState().activeTool).toBe(TOOLS.ROOM);
    });
  });

  it('a double-click with the door tool places one door', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    const svg = renderCanvas(projectWith({ walls: [wall] }));
    setTool(TOOLS.DOOR);
    hover(svg, 3000, 0);

    click(svg, 3000, 0);
    click(svg, 3000, 0);

    expect(floor0().doors).toHaveLength(1);
  });

  it('a double-click with the window tool places one window', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    const svg = renderCanvas(projectWith({ walls: [wall] }));
    setTool(TOOLS.WINDOW);
    hover(svg, 3000, 0);

    click(svg, 3000, 0);
    click(svg, 3000, 0);

    expect(floor0().windows).toHaveLength(1);
  });

  it('a double-click with the electrical tool places one device', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    const svg = renderCanvas(projectWith({ walls: [wall] }));
    setTool(TOOLS.ELECTRICAL);
    hover(svg, 3000, 200);

    click(svg, 3000, 200);
    click(svg, 3000, 200);

    expect(floor0().electricalDevices).toHaveLength(1);
  });

  it('a pointercancel mid column-drag ends the drag; later moves do not move the column', () => {
    const column = createColumn(2000, 2000, 300, 300, { height: 3000 });
    const svg = renderCanvas(projectWith({ columns: [column] }));
    const historyBefore = store().state.history.length;

    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(2000, 2000)));
    });
    hover(svg, 2400, 2000);
    hover(svg, 2800, 2000);
    const draggedX = floor0().columns[0].x;
    expect(draggedX).toBeGreaterThan(2000);

    act(() => {
      svg.dispatchEvent(pointer('pointercancel', toClient(0, 0)));
    });

    expect(store().state.gesture.active).toBe(false);
    expect(store().state.history).toHaveLength(historyBefore + 1);
    expect(editorState().toolState.dragging).toBeFalsy();

    // The button is up: hovering on must not drag the column along.
    hover(svg, 4000, 2000);
    hover(svg, 5000, 2000);
    expect(floor0().columns[0].x).toBe(draggedX);
  });

  it('a window blur mid column-drag ends the drag; moves after coming back do not move the column', () => {
    const column = createColumn(2000, 2000, 300, 300, { height: 3000 });
    const svg = renderCanvas(projectWith({ columns: [column] }));
    const historyBefore = store().state.history.length;

    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(2000, 2000)));
    });
    hover(svg, 2400, 2000);
    hover(svg, 2800, 2000);
    const draggedX = floor0().columns[0].x;
    expect(draggedX).toBeGreaterThan(2000);

    // Alt-Tab away with the button held.
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(store().state.gesture.active).toBe(false);
    expect(store().state.history).toHaveLength(historyBefore + 1);
    expect(editorState().toolState.dragging).toBeFalsy();

    // Back, button still held, dragging on: no longer a drag, and no undo
    // step per frame either.
    hover(svg, 4000, 2000);
    hover(svg, 5000, 2000);
    expect(floor0().columns[0].x).toBe(draggedX);
    expect(store().state.history).toHaveLength(historyBefore + 1);
  });

  it('the capture a normal release gives up does not end the drag a second time', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    const svg = renderCanvas(projectWith({ walls: [wall] }));
    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(4000, 0)));
    });
    hover(svg, 4000, 300);
    hover(svg, 4000, 600);
    expect(editorState().toolState.wallDragPreview?.proposal).toBeTruthy();
    const versionBefore = store().state.changeVersion;

    // In one task, as a browser delivers them: the release, then the
    // lostpointercapture that follows it, before React has re-rendered.
    act(() => {
      svg.dispatchEvent(pointer('pointerup', toClient(4000, 600)));
      svg.dispatchEvent(pointer('lostpointercapture', toClient(4000, 600)));
      window.dispatchEvent(pointer('pointerup', toClient(4000, 600)));
    });

    // The wall drag committed once.
    expect(store().state.changeVersion).toBe(versionBefore + 1);
    expect(editorState().toolState.dragging).toBeFalsy();
    expect(store().state.gesture.active).toBe(false);
  });

  it('maps the hover through the zoom on screen before the wheel burst commits', async () => {
    const svg = renderCanvas(projectWith());
    setTool(TOOLS.FIXTURE);
    const at = { clientX: 700, clientY: 500 };

    act(() => {
      for (let i = 0; i < 3; i += 1) {
        svg.dispatchEvent(
          new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 900, clientY: 350 }),
        );
      }
    });
    // Inside the settle window: the store still holds the old zoom.
    const zoomBefore = store().state.editor.viewport?.zoom ?? store().state.viewport?.zoom;
    act(() => {
      svg.dispatchEvent(pointer('pointermove', at));
    });
    frames.flush();
    const during = { x: editorState().toolState.previewX, y: editorState().toolState.previewY };

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const zoomAfter = store().state.editor.viewport?.zoom ?? store().state.viewport?.zoom;
    expect(zoomAfter).not.toBe(zoomBefore);
    act(() => {
      svg.dispatchEvent(pointer('pointermove', { clientX: at.clientX + 40, clientY: at.clientY }));
    });
    frames.flush();
    act(() => {
      svg.dispatchEvent(pointer('pointermove', at));
    });
    frames.flush();

    expect(during).toEqual({ x: editorState().toolState.previewX, y: editorState().toolState.previewY });
  });

  it('Escape mid column-drag puts the column back and leaves no undo step', () => {
    const column = createColumn(2000, 2000, 300, 300, { height: 3000 });
    const svg = renderCanvas(projectWith({ columns: [column] }));
    const historyBefore = store().state.history.length;
    const projectBefore = store().state.project;

    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(2000, 2000)));
    });
    hover(svg, 2400, 2000);
    hover(svg, 2800, 2000);
    expect(floor0().columns[0].x).toBeGreaterThan(2000);

    press('Escape');
    expect(floor0().columns[0].x).toBe(2000);
    expect(store().state.project).toBe(projectBefore);
    expect(store().state.history).toHaveLength(historyBefore);

    // Moves before the button comes up, and the release, change nothing.
    hover(svg, 3200, 2000);
    act(() => {
      svg.dispatchEvent(pointer('pointerup', toClient(3200, 2000)));
      window.dispatchEvent(pointer('pointerup', toClient(3200, 2000)));
    });
    expect(floor0().columns[0].x).toBe(2000);
    expect(store().state.history).toHaveLength(historyBefore);
  });

  describe('the Space-pan latch', () => {
    it('lets go when Space comes up inside a text field', () => {
      const svg = renderCanvas(projectWith());
      press(' ');
      expect(svg.style.cursor).toBe('grab');

      const input = document.createElement('input');
      document.body.appendChild(input);
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      });
      input.remove();

      expect(svg.style.cursor).not.toBe('grab');
    });

    it('lets go when the window loses focus', () => {
      const svg = renderCanvas(projectWith());
      press(' ');
      expect(svg.style.cursor).toBe('grab');

      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      expect(svg.style.cursor).not.toBe('grab');
    });
  });

  it('an Escape a dialog takes does not also cancel the wall being drawn behind it', () => {
    function DialogOverCanvas() {
      const [open, setOpen] = useState(true);
      return open ? (
        <Modal title="Rename" onClose={() => setOpen(false)}>
          <p>Dialog body</p>
        </Modal>
      ) : null;
    }
    const svg = renderCanvas(projectWith(), <DialogOverCanvas />);
    setTool(TOOLS.WALL);
    // The first point of a wall: the run is waiting for its second click.
    click(svg, 1000, 1000);
    expect(editorState().toolState.start).toBeTruthy();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    // A real key press is cancelable; the dialog marks the one it takes.
    const escape = () =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
    escape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(editorState().toolState.start).toBeTruthy();

    // With the dialog gone, Escape is the plan's again.
    escape();
    expect(editorState().toolState.start).toBeFalsy();
  });

  it('shows a refused wall edit once, not again each time the canvas comes back', () => {
    const wall = (id, x1, y1, x2, y2) => ({ ...createWall({ x: x1, y: y1 }, { x: x2, y: y2 }), id });
    const project = projectWith({
      walls: [
        wall('bottom', 0, 0, 8000, 0),
        wall('right', 8000, 0, 8000, 3000),
        wall('top', 8000, 3000, 0, 3000),
        wall('left', 0, 3000, 0, 0),
        wall('divider', 4000, 0, 4000, 3000),
      ],
    });
    const canvasShown = { set: null };
    function ToggledCanvas() {
      const [shown, setShown] = useState(true);
      useEffect(() => {
        canvasShown.set = setShown;
      }, []);
      return shown ? <SvgCanvas /> : null;
    }
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <ConfirmDialogProvider>
            <ClipboardProvider>
              <FloorplanProvider initialProject={project}>
                <DaylightStudyProvider>
                  <StoreProbe />
                  <ToggledCanvas />
                </DaylightStudyProvider>
              </FloorplanProvider>
            </ClipboardProvider>
          </ConfirmDialogProvider>
        ),
      },
    ]);
    render(<RouterProvider router={router} />);

    // Sliding the divider off the walls it tees into is refused.
    act(() =>
      store().dispatch({
        type: 'WALL_UPDATE',
        floorId: floor0().id,
        wall: { id: 'divider', start: { x: 9500, y: 0 }, end: { x: 9500, y: 3000 } },
      }),
    );
    expect(editorState().lastRejection).toBeTruthy();
    expect(editorState().statusMessage).toBeTruthy();
    act(() => store().dispatch({ type: 'CLEAR_STATUS_MESSAGE' }));

    // Away to another view and back: the old refusal is not news.
    act(() => canvasShown.set(false));
    act(() => canvasShown.set(true));
    expect(editorState().lastRejection).toBeTruthy();
    expect(editorState().statusMessage).toBeFalsy();
  });

  it('plan shortcuts stay quiet behind an open wall detail editor', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 8000, y: 0 });
    renderCanvas(projectWith({ walls: [wall] }));
    act(() => store().dispatch({ type: 'OPEN_WALL_DETAIL_EDITOR', floorId: floor0().id, wallId: wall.id }));
    const selected = editorState().selectedId;

    press('w');
    press('Delete');

    expect(editorState().activeTool).toBe(TOOLS.SELECT);
    expect(floor0().walls).toHaveLength(1);
    expect(editorState().selectedId).toBe(selected);

    act(() => store().dispatch({ type: 'CLOSE_WALL_DETAIL_EDITOR' }));
    press('w');
    expect(editorState().activeTool).toBe(TOOLS.WALL);
  });
});
