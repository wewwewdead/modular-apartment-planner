/* @vitest-environment jsdom */
/**
 * The sheet canvas's render costs (perf pass 3, D2.3):
 *   - the scene is built once per project or sheet change and handed to both
 *     renderers, the sheet on screen and the hidden PDF root; a pan frame
 *     builds nothing and redraws neither;
 *   - a pan sends one PAN per animation frame, with every move in it, and
 *     whatever is left on release, so it ends exactly where the per-move pan
 *     ended;
 *   - the wheel listener is bound once and the <svg>'s box is measured once
 *     per press, not per move;
 *   - the hidden PDF root still follows every edit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ClipboardProvider } from '@/app/ClipboardProvider';
import { ConfirmDialogProvider } from '@/ui/ConfirmDialog';
import { createProject } from '@/domain/models';
import { createSheet, createSheetViewport } from '@/domain/sheetModels';
import * as sheetLayout from '@/sheets/layout';
import * as structuralCoordination from '@/domain/structuralCoordination';
import { ZOOM_FACTOR } from '@/domain/defaults';
import { FloorplanProvider, useFloorplanContext } from '../../context/FloorplanContext';
import { DaylightStudyProvider } from '../../context/DaylightStudyContext';
import SheetCanvas from './SheetCanvas';
import SheetRenderer from './SheetRenderer';

vi.mock('@/sheets/layout', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildSheetScene: vi.fn(actual.buildSheetScene) };
});

vi.mock('@/domain/structuralCoordination', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deriveConceptualLoadPath: vi.fn(actual.deriveConceptualLoadPath) };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  const floorId = project.floors[0].id;
  const viewports = [
    createSheetViewport('plan', floorId, { id: 'vp', x: 60, y: 60, width: 120, height: 80, lockAutoLayout: true }),
    createSheetViewport('structural_plan', floorId, {
      id: 'vp_struct',
      x: 200,
      y: 60,
      width: 120,
      height: 80,
      lockAutoLayout: true,
    }),
  ];
  return { ...project, sheets: [createSheet('A', { id: 'sheet', viewports })] };
}

/** Drives the animation frames the canvas schedules. */
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
  return view;
}

// jsdom has no PointerEvent constructor; React only reads these fields.
const pointer = (type, init = {}) => new MouseEvent(type, { bubbles: true, button: 0, ...init });

const builds = () => sheetLayout.buildSheetScene.mock.calls.length;

describe('sheet canvas render costs', () => {
  let clock;
  let view;
  let svg;

  beforeEach(() => {
    storeBox.current = null;
    clock = createFrameClock();
    view = renderSheet();
    svg = view.container.querySelector('svg');
    sheetLayout.buildSheetScene.mockClear();
  });

  function panBy(steps, { release = true } = {}) {
    act(() => {
      svg.dispatchEvent(pointer('pointerdown', { button: 1, clientX: 100, clientY: 100 }));
    });
    let x = 100;
    for (const step of steps) {
      x += step;
      act(() => {
        svg.dispatchEvent(pointer('pointermove', { clientX: x, clientY: x, buttons: 4 }));
      });
    }
    if (release) {
      act(() => {
        svg.dispatchEvent(pointer('pointerup', { button: 1, clientX: x, clientY: 100 }));
        window.dispatchEvent(pointer('pointerup', { button: 1, clientX: x, clientY: 100 }));
      });
    }
  }

  it('builds the scene once per project change, not once per renderer', () => {
    act(() => store().dispatch({ type: 'SHEET_UPDATE', sheet: { id: 'sheet', title: 'Renamed' } }));
    expect(builds()).toBe(1);
  });

  it('derives the structural viewport’s load path once for both renderers', () => {
    // A project object no renderer has drawn yet, so nothing is cached for it.
    const project = { ...store().state.project };
    const sheet = project.sheets[0];
    const scene = sheetLayout.buildSheetScene(project, sheet);
    expect(scene.viewports.map((viewport) => viewport.source.kind)).toContain('structural_plan');
    structuralCoordination.deriveConceptualLoadPath.mockClear();
    render(
      <svg>
        <SheetRenderer project={project} sheet={sheet} scene={scene} selectedId={null} selectedType={null} />
        <SheetRenderer project={project} sheet={sheet} scene={scene} selectedId="vp" selectedType="sheetViewport" />
      </svg>,
    );
    expect(structuralCoordination.deriveConceptualLoadPath).toHaveBeenCalledTimes(1);
  });

  it('a pan builds no scene and sends one PAN per frame', () => {
    const viewportBefore = store().state.editor.viewport;
    panBy([3, 4, 5], { release: false });
    // Three moves, no frame yet: nothing sent, nothing built.
    expect(store().state.editor.viewport).toBe(viewportBefore);
    expect(clock.pending()).toBe(1);
    clock.flush();
    expect(store().state.editor.viewport.panX).toBe(viewportBefore.panX + 12);
    expect(store().state.editor.viewport.panY).toBe(viewportBefore.panY + 12);
    expect(builds()).toBe(0);
  });

  it('the release sends what the last frame had not, and the pan ends where the per-move pan ended', () => {
    const viewportBefore = store().state.editor.viewport;
    panBy([3, 4]);
    expect(clock.pending()).toBe(0);
    expect(store().state.editor.viewport.panX).toBe(viewportBefore.panX + 7);
    expect(store().state.editor.viewport.panY).toBe(viewportBefore.panY + 7);
  });

  it('a window blur mid-pan keeps every move made before it', () => {
    const viewportBefore = store().state.editor.viewport;
    panBy([6, 2], { release: false });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(store().state.editor.viewport.panX).toBe(viewportBefore.panX + 8);
    expect(clock.pending()).toBe(0);
  });

  it('a wheel notch mid-pan zooms the view the pan has reached and drops nothing', () => {
    const before = store().state.editor.viewport;
    panBy([10, 10], { release: false });
    act(() => {
      svg.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 50, clientY: 40 }),
      );
    });
    // The pan's 20 px are folded into the zoom's own absolute pan, as they
    // were when every move was sent before the wheel arrived.
    const panX = before.panX + 20;
    const panY = before.panY + 20;
    const zoom = before.zoom * ZOOM_FACTOR;
    expect(store().state.editor.viewport.zoom).toBeCloseTo(zoom);
    expect(store().state.editor.viewport.panX).toBeCloseTo(50 - (50 - panX) * (zoom / before.zoom));
    expect(store().state.editor.viewport.panY).toBeCloseTo(40 - (40 - panY) * (zoom / before.zoom));
    // And no stale PAN lands after it.
    expect(clock.pending()).toBe(0);
  });

  it('binds the wheel listener once and measures the canvas once per press', () => {
    const added = vi.spyOn(svg, 'addEventListener');
    const measured = vi.spyOn(svg, 'getBoundingClientRect');
    panBy([5, 5, 5]);
    clock.flush();
    act(() => {
      svg.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, clientX: 10, clientY: 10 }),
      );
    });
    act(() => {
      svg.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, clientX: 12, clientY: 10 }),
      );
    });
    expect(added.mock.calls.filter(([type]) => type === 'wheel')).toHaveLength(0);
    // The press dropped the box; the first wheel measured it; the second reused it.
    expect(measured).toHaveBeenCalledTimes(1);
  });

  it('keeps the PDF root queryable and drawing the edited project', () => {
    const exportRoot = () => document.querySelector('[data-sheet-export-root="true"]');
    expect(exportRoot()).not.toBeNull();
    act(() =>
      store().dispatch({
        type: 'SHEET_VIEWPORT_UPDATE',
        sheetId: 'sheet',
        viewport: { ...store().state.project.sheets[0].viewports[0], x: 90, scale: 75 },
      }),
    );
    const project = store().state.project;
    const fresh = render(
      <svg>
        <SheetRenderer project={project} sheet={project.sheets[0]} selectedId={null} selectedType={null} />
      </svg>,
    );
    expect(exportRoot().innerHTML).toBe(fresh.container.querySelector('svg').innerHTML);
  });

  it('the sheet on screen is what SheetRenderer draws from its own build', () => {
    act(() => store().dispatch({ type: 'SELECT_OBJECT', id: 'vp', objectType: 'sheetViewport' }));
    const { project, editor } = store().state;
    const onScreen = svg.querySelector('g.sheet').outerHTML;
    const fresh = render(
      <svg>
        <SheetRenderer
          project={project}
          sheet={project.sheets[0]}
          selectedId={editor.selectedId}
          selectedType={editor.selectedType}
        />
      </svg>,
    );
    expect(onScreen).toBe(fresh.container.querySelector('g.sheet').outerHTML);
  });
});
