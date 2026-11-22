/* @vitest-environment jsdom */
/**
 * Dragging a viewport on a sheet rewrites the project every frame inside one
 * store drag gesture, as a plan drag does. These pin every way that drag ends
 * besides a plain release:
 *   - Escape puts the viewport back and leaves no undo step;
 *   - a lost pointer capture, a window blur and a move with no button held each
 *     end it where it stands, so a release that never comes cannot leave the
 *     viewport following the mouse.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { createSheet, createSheetViewport } from '@/domain/sheetModels';
import { buildSheetScene } from '@/sheets/layout';
import { FloorplanProvider, useFloorplanContext } from '../../context/FloorplanContext';
import { DaylightStudyProvider } from '../../context/DaylightStudyContext';
import SheetCanvas from './SheetCanvas';

afterEach(cleanup);

const storeBox = { current: null };
const store = () => storeBox.current;

function StoreProbe() {
  const context = useFloorplanContext();
  useEffect(() => {
    storeBox.current = context;
  });
  return null;
}

function projectWithSheet() {
  const project = createProject('Sheets');
  const viewport = createSheetViewport('plan', project.floors[0].id, {
    id: 'vp',
    x: 60,
    y: 60,
    width: 120,
    height: 80,
    lockAutoLayout: true,
  });
  return { ...project, sheets: [createSheet('A', { id: 'sheet', viewports: [viewport] })] };
}

function renderSheet() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmDialogProvider>
          <ClipboardProvider>
            <FloorplanProvider initialProject={projectWithSheet()}>
              <DaylightStudyProvider>
                <StoreProbe />
                <SheetCanvas />
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);
  const view = render(<RouterProvider router={router} />);
  act(() => store().dispatch({ type: 'SET_ACTIVE_SHEET', sheetId: 'sheet' }));
  return view.container.querySelector('svg');
}

const sheet = () => store().state.project.sheets[0];
const storedViewport = () => sheet().viewports[0];

/** Where the viewport is drawn, as the canvas hit-tests it. */
function drawnViewport() {
  return buildSheetScene(store().state.project, sheet()).viewports[0];
}

/** Sheet millimetres to client pixels, over jsdom's zero-origin rect. */
function toClient(x, y) {
  const { panX, panY, zoom } = store().state.editor.viewport;
  return { clientX: panX + x * zoom, clientY: panY + y * zoom };
}

// jsdom has no PointerEvent constructor; React only reads these fields.
const pointer = (type, position, init = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...position, ...init });

describe('sheet viewport drag', () => {
  let svg;
  let centre;

  beforeEach(() => {
    storeBox.current = null;
    svg = renderSheet();
    const drawn = drawnViewport();
    centre = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
  });

  function press() {
    act(() => {
      svg.dispatchEvent(pointer('pointerdown', toClient(centre.x, centre.y)));
    });
  }

  function moveBy(dx, buttons = 1) {
    act(() => {
      svg.dispatchEvent(pointer('pointermove', toClient(centre.x + dx, centre.y), { buttons }));
    });
  }

  function release(dx) {
    act(() => {
      svg.dispatchEvent(pointer('pointerup', toClient(centre.x + dx, centre.y)));
      window.dispatchEvent(pointer('pointerup', toClient(centre.x + dx, centre.y)));
    });
  }

  it('moves the viewport and records one undo step on release', () => {
    const historyBefore = store().state.history.length;
    const xBefore = storedViewport().x;
    press();
    moveBy(10);
    moveBy(20);
    release(20);
    expect(storedViewport().x).toBeCloseTo(xBefore + 20);
    expect(store().state.history).toHaveLength(historyBefore + 1);
  });

  it('Escape mid-move puts the viewport back and leaves no undo step; the release changes nothing', () => {
    const historyBefore = store().state.history.length;
    const projectBefore = store().state.project;
    press();
    moveBy(10);
    moveBy(20);
    expect(storedViewport().x).not.toBe(projectBefore.sheets[0].viewports[0].x);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(store().state.project).toBe(projectBefore);
    expect(store().state.history).toHaveLength(historyBefore);

    // Moves before the button comes up, and the release itself, do nothing.
    moveBy(40);
    release(40);
    expect(store().state.project).toBe(projectBefore);
    expect(store().state.history).toHaveLength(historyBefore);
  });

  it('Escape after an undo mid-move drops the drag without taking a second step back', () => {
    press();
    moveBy(10);
    moveBy(20);
    // The toolbar's undo: the store goes back one entry and the selection goes.
    act(() => {
      store().dispatch({ type: 'UNDO' });
      store().dispatch({ type: 'DESELECT' });
    });
    const projectAfterUndo = store().state.project;
    const historyAfterUndo = store().state.history.length;

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(store().state.project).toBe(projectAfterUndo);
    expect(store().state.history).toHaveLength(historyAfterUndo);

    moveBy(40);
    expect(store().state.project).toBe(projectAfterUndo);
  });

  it('a lost pointer capture ends the drag where it stands', () => {
    press();
    moveBy(20);
    const dragged = storedViewport().x;
    act(() => {
      svg.dispatchEvent(pointer('lostpointercapture', toClient(centre.x + 20, centre.y)));
    });
    moveBy(60);
    expect(storedViewport().x).toBe(dragged);
  });

  it('a window blur ends the drag where it stands, as one undo step', () => {
    const historyBefore = store().state.history.length;
    press();
    moveBy(20);
    const dragged = storedViewport().x;
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    // Back in the window with the button still held: the drag is over.
    moveBy(60);
    expect(storedViewport().x).toBe(dragged);
    expect(store().state.history).toHaveLength(historyBefore + 1);
  });

  it('a move with no button held ends a drag whose release never arrived', () => {
    press();
    moveBy(20);
    const dragged = storedViewport().x;
    moveBy(60, 0);
    moveBy(80, 0);
    expect(storedViewport().x).toBe(dragged);
  });
});
