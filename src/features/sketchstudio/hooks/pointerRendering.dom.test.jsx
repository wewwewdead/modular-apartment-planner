/* @vitest-environment jsdom */
/**
 * Perf pass 3, C2: what a pointer move re-renders, through the real studio
 * (useSketchStudio + SketchStudioLayout + DraftingCanvas).
 *
 * Every arc shape calls `getArcPath` once per render and nothing else on the
 * pointer path does (hit tests and snaps flatten arcs with `getArcSegments`),
 * so counting `getArcPath` counts entity re-renders:
 *   - a move over empty space re-renders no entity;
 *   - a hover change re-renders only the entities whose hover state changed;
 *   - a pan frame re-renders no entity.
 * And the readouts that moved off React state onto the cursor channel still
 * read what they read before, at the moment they are read: the status bar's
 * X / Y (synchronously after the move, and after an unrelated re-render) and
 * the precision HUD's position.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const counts = vi.hoisted(() => ({ arcPaths: 0 }));

vi.mock('../utils/arcUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getArcPath: (...args) => {
      counts.arcPaths += 1;
      return actual.getArcPath(...args);
    },
  };
});

import useSketchStudio from './useSketchStudio';
import SketchStudioLayout from '../components/SketchStudioLayout';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// Twenty arcs in a row, each peaking at (x + 20, 20) halfway along.
const ARCS = Array.from({ length: 20 }, (_, index) => ({
  id: `arc-${index}`,
  type: 'arc',
  start: { x: index * 100, y: 0 },
  control: { x: index * 100 + 20, y: 40 },
  end: { x: index * 100 + 40, y: 0 },
  layerId: 'default',
  visible: true,
  meta: {},
}));
const onArc = (index) => ({ x: index * 100 + 20, y: 20 });
const EMPTY = { x: 950, y: 600 };

function pointer({ x, y, button = 0, buttons = 0 }) {
  return {
    clientX: x,
    clientY: y,
    button,
    buttons,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} },
  };
}

function Harness({ studioRef }) {
  const studio = useSketchStudio();
  useLayoutEffect(() => {
    studioRef.current = studio;
  });
  return <SketchStudioLayout {...studio} />;
}

function mountStudio() {
  const studioRef = { current: null };
  const view = render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <Harness studioRef={studioRef} />
      </ConfirmDialogProvider>
    </MemoryRouter>,
  );
  act(() => studioRef.current.loadTemplate({ document: { ...sampleDocument, entities: ARCS } }));
  const statusText = () => view.container.querySelector('.sketchStudioStatusBar').textContent;
  return { get: () => studioRef.current, view, statusText };
}

function arcRendersDuring(fn) {
  counts.arcPaths = 0;
  act(fn);
  return counts.arcPaths;
}

describe('C2: pointer moves re-render only what changed', () => {
  it('a move over empty space re-renders no entity', () => {
    const env = mountStudio();
    act(() => env.get().onCanvasPointerMove(pointer(EMPTY)));

    for (let index = 1; index <= 5; index += 1) {
      expect(arcRendersDuring(() => env.get().onCanvasPointerMove(pointer({ x: EMPTY.x + index, y: EMPTY.y })))).toBe(
        0,
      );
    }
  });

  it('a hover change re-renders only the entities whose hover state changed', () => {
    const env = mountStudio();
    act(() => env.get().onCanvasPointerMove(pointer(EMPTY)));

    expect(arcRendersDuring(() => env.get().onCanvasPointerMove(pointer(onArc(3))))).toBe(1);
    expect(env.get().hover.hoveredId).toBe('arc-3');
    // Along the same arc: the hover did not change.
    expect(arcRendersDuring(() => env.get().onCanvasPointerMove(pointer({ x: onArc(3).x + 1, y: 20 })))).toBe(0);
    expect(arcRendersDuring(() => env.get().onCanvasPointerMove(pointer(onArc(7))))).toBe(2);
    expect(env.get().hover.hoveredId).toBe('arc-7');
    expect(arcRendersDuring(() => env.get().onCanvasPointerMove(pointer(EMPTY)))).toBe(1);
    expect(env.get().hover.hoveredId).toBeNull();
    expect(env.view.container.querySelectorAll('.is-hovered')).toHaveLength(0);
  });

  it('a pan frame re-renders no entity, and the drawing moves', () => {
    const env = mountStudio();
    act(() => env.get().onCanvasPointerMove(pointer(EMPTY)));
    act(() => env.get().onCanvasPointerDown(pointer({ ...EMPTY, button: 1, buttons: 4 })));

    for (let index = 1; index <= 4; index += 1) {
      expect(
        arcRendersDuring(() =>
          env.get().onCanvasPointerMove(pointer({ x: EMPTY.x + index * 10, y: EMPTY.y, button: 1, buttons: 4 })),
        ),
      ).toBe(0);
    }
    expect(env.get().viewport).toMatchObject({ panX: 40, panY: 0 });
    expect(env.view.container.querySelector('.sketchStudioCanvas > g').getAttribute('transform')).toBe(
      'translate(40 0) scale(1)',
    );
  });
});

describe('C2: the cursor readouts on the cursor channel', () => {
  it('the status bar reads the cursor synchronously after each move, and after other re-renders', () => {
    const env = mountStudio();
    expect(env.statusText()).toContain('X 0.0');
    expect(env.statusText()).toContain('Y 0.0');

    act(() => {
      env.get().onCanvasPointerMove(pointer({ x: 123.456, y: 78.9 }));
      // Written by the move itself, before React renders anything.
      expect(env.statusText()).toContain('X 123.5');
      expect(env.statusText()).toContain('Y 78.9');
    });
    expect(env.statusText()).toContain('X 123.5');

    // A hover change (a real re-render), then empty space again.
    act(() => env.get().onCanvasPointerMove(pointer(onArc(2))));
    expect(env.statusText()).toContain(`X ${onArc(2).x.toFixed(1)}`);
    act(() => env.get().onCanvasPointerMove(pointer({ x: 640.04, y: 333.35 })));
    expect(env.statusText()).toContain('X 640.0Y');
    expect(env.statusText()).toContain('Y 333.4');

    // Something unrelated re-renders the status bar: it still shows the cursor.
    act(() => env.get().toggleOrtho());
    expect(env.statusText()).toContain('Ortho On');
    expect(env.statusText()).toContain('X 640.0Y');
    expect(env.statusText()).toContain('Y 333.4');
  });

  it('the status bar follows the cursor through a pan, in world units under the cursor', () => {
    const env = mountStudio();
    act(() => env.get().onCanvasPointerMove(pointer({ x: 500, y: 500 })));
    act(() => env.get().onCanvasPointerDown(pointer({ x: 500, y: 500, button: 1, buttons: 4 })));
    act(() => env.get().onCanvasPointerMove(pointer({ x: 560, y: 530, button: 1, buttons: 4 })));
    // The view moved with the cursor, so the world point under it is unchanged.
    expect(env.statusText()).toContain('X 500.0');
    expect(env.statusText()).toContain('Y 500.0');
  });

  it('the status bar shows the snapped point during a handle drag, as before', () => {
    const env = mountStudio();
    act(() =>
      env.get().loadTemplate({
        document: {
          ...sampleDocument,
          entities: [
            { id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layerId: 'default', visible: true, meta: {} },
            { id: 'm', type: 'line', x1: 200, y1: 50, x2: 300, y2: 50, layerId: 'default', visible: true, meta: {} },
          ],
        },
      }),
    );
    act(() => env.get().onCanvasPointerMove(pointer({ x: 50, y: 0 })));
    act(() => env.get().onCanvasPointerDown(pointer({ x: 50, y: 0 })));
    act(() => env.get().onCanvasPointerUp(pointer({ x: 50, y: 0 })));
    act(() => env.get().onCanvasClick(pointer({ x: 50, y: 0 })));
    expect(env.get().selection.selectedIds).toEqual(['l']);

    act(() =>
      env.get().handleBindings.onHandlePointerDown(
        { id: 'end' },
        {
          button: 0,
          pointerId: 1,
          stopPropagation() {},
          preventDefault() {},
          currentTarget: { setPointerCapture() {} },
        },
      ),
    );
    // 4 px from the other line's start: the end snaps onto (200, 50).
    act(() => env.get().onCanvasPointerMove(pointer({ x: 203, y: 52, buttons: 1 })));
    expect(env.get().interaction.mode).toBe('handle-drag');
    expect(env.statusText()).toContain('X 200.0');
    expect(env.statusText()).toContain('Y 50.0');
  });

  it('the precision HUD sits 18 px right and below the cursor and follows it', () => {
    const env = mountStudio();
    act(() => env.get().setActiveTool('line'));
    act(() => env.get().onCanvasPointerMove(pointer({ x: 900, y: 500 })));
    act(() => env.get().onCanvasClick(pointer({ x: 900, y: 500 })));
    expect(env.get().draft.type).toBe('line');

    const hud = () => env.view.container.querySelector('[data-precision-hud]');
    act(() => env.get().onCanvasPointerMove(pointer({ x: 950, y: 520 })));
    expect(hud().style.left).toBe('968px');
    expect(hud().style.top).toBe('538px');
    act(() => {
      env.get().onCanvasPointerMove(pointer({ x: 1010, y: 610 }));
      expect(hud().style.left).toBe('1028px');
      expect(hud().style.top).toBe('628px');
    });
    expect(hud().style.left).toBe('1028px');
    expect(hud().style.top).toBe('628px');
  });
});
