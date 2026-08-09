/* @vitest-environment jsdom */
/**
 * Frame-rate pins for dragging on the plan canvas.
 *
 * Sliding a window along its wall used to stall: every pointer-move event ran a
 * model edit, a whole-project coordination pass and a re-render, and a mouse
 * reports moves several times per frame. Two things keep that in budget, and
 * both are invisible from the outside — only their absence is visible, as lag —
 * so they are pinned here:
 *
 *   - moves are coalesced to one per animation frame, so N events between two
 *     frames cost one edit, not N;
 *   - the drag is bracketed as one gesture, so it costs one undo entry and one
 *     coordination pass instead of one of each per frame.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject, createWall, createWindow } from '@/domain/models';
import { DEFAULT_ZOOM } from '@/domain/defaults';
import { FloorplanProvider, useFloorplanContext } from '../../context/FloorplanContext';
import { DaylightStudyProvider } from '../../context/DaylightStudyContext';
import SvgCanvas from './SvgCanvas';

afterEach(cleanup);

// The canvas maps client pixels to model millimetres with the initial viewport
// (pan 400,300 at DEFAULT_ZOOM) over a zero-origin rect in jsdom.
const PAN_X = 400;
const PAN_Y = 300;
const toClient = (modelX, modelY) => ({
  clientX: PAN_X + modelX * DEFAULT_ZOOM,
  clientY: PAN_Y + modelY * DEFAULT_ZOOM,
});

const WALL_LENGTH = 8000;
const WINDOW_START_OFFSET = 3000;
const WINDOW_WIDTH = 1200;

function projectWithWindow() {
  const project = createProject('Drag');
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH, y: 0 });
  const windowItem = createWindow(wall.id, WINDOW_START_OFFSET, WINDOW_WIDTH);

  return {
    project: {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0 ? { ...floor, walls: [wall], windows: [windowItem] } : floor,
      ),
    },
    windowId: windowItem.id,
  };
}

// Published from an effect rather than during render, so the probe stays a pure
// component. Every assertion runs after an `act()`, by which point effects have
// flushed and this holds the committed store.
const storeBox = { current: null };
const store = () => storeBox.current;

function StoreProbe() {
  const context = useFloorplanContext();

  useEffect(() => {
    storeBox.current = context;
  });

  return null;
}

function renderCanvas(initialProject) {
  // A data router, because the workspace registers an unsaved-changes blocker.
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
              </DaylightStudyProvider>
            </FloorplanProvider>
          </ClipboardProvider>
        </ConfirmDialogProvider>
      ),
    },
  ]);

  return render(<RouterProvider router={router} />);
}

/** Drives the animation frames the canvas schedules, one batch at a time. */
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
    pending: () => callbacks.length,
    flush() {
      const due = callbacks.splice(0, callbacks.length);
      act(() => {
        for (const entry of due) entry.callback(performance.now());
      });
    },
  };
}

function pointerEvent(type, position, init = {}) {
  // jsdom has no PointerEvent constructor; React only reads these fields.
  const event = new MouseEvent(type, { bubbles: true, button: 0, ...position, ...init });
  return event;
}

describe('plan canvas drag cost', () => {
  let frames;

  beforeEach(() => {
    frames = createFrameClock();
    storeBox.current = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** `offset` is the window's centre along the wall, so that is where it is grabbed. */
  function grabWindow(svg) {
    act(() => {
      svg.dispatchEvent(pointerEvent('pointerdown', toClient(WINDOW_START_OFFSET, 0)));
    });
  }

  function movePointer(svg, modelX) {
    act(() => {
      svg.dispatchEvent(pointerEvent('pointermove', toClient(modelX, 0)));
    });
  }

  function releasePointer(svg, modelX) {
    act(() => {
      svg.dispatchEvent(pointerEvent('pointerup', toClient(modelX, 0)));
      // The gesture closes on the window-level listener, as it does in the app.
      window.dispatchEvent(pointerEvent('pointerup', toClient(modelX, 0)));
    });
  }

  function windowOffset(windowId) {
    return store().state.entities.windows.find((entry) => entry.id === windowId).offset;
  }

  it('coalesces a burst of pointer moves into one model edit per frame', () => {
    const { project, windowId } = projectWithWindow();
    const view = renderCanvas(project);
    const svg = view.container.querySelector('svg');

    expect(windowOffset(windowId)).toBe(WINDOW_START_OFFSET);

    grabWindow(svg);
    // Past the 4 px threshold, so this frame promotes the pending drag to a drag.
    movePointer(svg, 3600);
    frames.flush();
    const versionAfterPromotion = store().state.changeVersion;

    // Five moves land inside a single frame; only the newest position matters.
    for (const modelX of [3700, 3800, 3900, 4000, 4100]) movePointer(svg, modelX);
    expect(frames.pending()).toBe(1);
    frames.flush();

    // The window followed the pointer to the newest position...
    expect(windowOffset(windowId)).toBeCloseTo(4100, 6);
    // ...at a cost of one project edit, not five.
    expect(store().state.changeVersion).toBe(versionAfterPromotion + 1);
  });

  it('costs one undo entry and one coordination pass for the whole drag', () => {
    const { project, windowId } = projectWithWindow();
    const view = renderCanvas(project);
    const svg = view.container.querySelector('svg');

    const historyBefore = store().state.history.length;
    const derivedBefore = store().state.derived;
    const projectBeforeDrag = store().state.project;

    grabWindow(svg);
    movePointer(svg, 3600);
    frames.flush();

    for (const modelX of [3800, 4000, 4200, 4400]) {
      movePointer(svg, modelX);
      frames.flush();
      // Mid-drag the geometry moves but the whole-project models hold still.
      expect(windowOffset(windowId)).toBeCloseTo(modelX, 6);
      expect(store().state.derived).toBe(derivedBefore);
    }

    expect(store().state.history).toHaveLength(historyBefore + 1);

    releasePointer(svg, 4400);

    // Released: the coordination pass runs once, against the settled project.
    expect(store().state.derived).not.toBe(derivedBefore);
    expect(store().state.history).toHaveLength(historyBefore + 1);
    expect(windowOffset(windowId)).toBeCloseTo(4400, 6);

    // And one undo puts the window back where the drag started.
    act(() => {
      store().dispatch({ type: 'UNDO' });
    });
    expect(store().state.project).toBe(projectBeforeDrag);
    expect(windowOffset(windowId)).toBe(WINDOW_START_OFFSET);
  });
});
