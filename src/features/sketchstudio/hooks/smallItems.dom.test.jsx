/* @vitest-environment jsdom */
/**
 * Perf pass 3, C6, the smaller items, through the real studio:
 *   - the canvas rect is read once and kept, and read again after anything that
 *     can move the canvas (a press, the pointer entering, a window resize or
 *     scroll, another canvas element);
 *   - the wheel listener is bound once per canvas element, not once per
 *     viewport change, and every notch still zooms from the latest viewport;
 *   - the cutting list holds the entities a drag started from and catches up
 *     when it ends;
 *   - more than 50 selected entities put `is-large-selection` on the canvas
 *     (glow and transitions off, in the styles); 50 or fewer leave the canvas
 *     element exactly as it was.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useSketchStudio from './useSketchStudio';
import useSketchViewport from './useSketchViewport';
import SketchStudioLayout from '../components/SketchStudioLayout';
import { SELECTION_GLOW_LIMIT } from '../components/DraftingCanvas';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';
import { getNextZoom, zoomAtPoint } from '../utils/canvasMath';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const line = (id, x1, y1, x2, y2) => ({
  id,
  type: 'line',
  x1,
  y1,
  x2,
  y2,
  layerId: 'default',
  visible: true,
  meta: {},
});

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

function mountStudio(entities) {
  const studioRef = { current: null };
  const view = render(
    <MemoryRouter>
      <ConfirmDialogProvider>
        <Harness studioRef={studioRef} />
      </ConfirmDialogProvider>
    </MemoryRouter>,
  );
  act(() => studioRef.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  return { get: () => studioRef.current, view, canvas: () => view.container.querySelector('svg.sketchStudioCanvas') };
}

describe('C6: the canvas rect', () => {
  function mountViewport() {
    const canvas = document.createElement('div');
    let left = 100;
    canvas.getBoundingClientRect = vi.fn(() => ({
      left,
      top: 50,
      width: 800,
      height: 600,
      right: left + 800,
      bottom: 650,
    }));
    const canvasRef = { current: canvas };
    const state = {
      viewport: { zoom: 1, panX: 0, panY: 0 },
      ui: { activeTool: 'select', snapEnabled: true, orthoEnabled: false, viewMode: 'plan' },
    };
    const view = renderHook(() =>
      useSketchViewport(state, () => {}, canvasRef, { visibleEntities: [], editableEntities: [] }),
    );
    return { view, canvas, canvasRef, moveCanvas: () => (left += 10) };
  }

  it('is read once across moves, and again after a press, an enter, a resize, a scroll or a new canvas', () => {
    const { view, canvas, canvasRef, moveCanvas } = mountViewport();
    const read = (x) => view.result.current.readCanvasPoint({ clientX: x, clientY: 80 });

    expect(read(150)).toEqual({ x: 50, y: 30 });
    expect(read(160)).toEqual({ x: 60, y: 30 });
    expect(canvas.getBoundingClientRect).toHaveBeenCalledTimes(1);

    for (const invalidate of [
      () => canvas.dispatchEvent(new Event('pointerdown')),
      () => canvas.dispatchEvent(new Event('pointerenter')),
      () => window.dispatchEvent(new Event('resize')),
      () => document.dispatchEvent(new Event('scroll')),
    ]) {
      const left = moveCanvas();
      const calls = canvas.getBoundingClientRect.mock.calls.length;
      // Moved but not yet invalidated: the kept rect still answers.
      expect(read(400)).toEqual({ x: 400 - (left - 10), y: 30 });
      invalidate();
      expect(read(400)).toEqual({ x: 400 - left, y: 30 });
      expect(read(401)).toEqual({ x: 401 - left, y: 30 });
      expect(canvas.getBoundingClientRect.mock.calls.length).toBe(calls + 1);
    }

    // Another element: read from it at once.
    const other = document.createElement('div');
    other.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 });
    canvasRef.current = other;
    expect(read(7)).toEqual({ x: 7, y: 80 });
  });
});

describe('C6: the wheel listener', () => {
  it('is bound once per canvas, and each notch zooms from the latest viewport', () => {
    const env = mountStudio([line('a', 0, 0, 100, 0)]);
    const canvas = env.canvas();
    const addEventListener = vi.spyOn(canvas, 'addEventListener');
    const removeEventListener = vi.spyOn(canvas, 'removeEventListener');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 });
    act(() => canvas.dispatchEvent(new Event('pointerenter')));

    let expected = env.get().viewport;
    for (const deltaY of [-100, -100, 100, -100]) {
      act(() => {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: 300, clientY: 200, cancelable: true }));
      });
      expected = zoomAtPoint(expected, { x: 300, y: 200 }, getNextZoom(expected.zoom, deltaY));
      expect(env.get().viewport).toEqual(expected);
    }
    expect(addEventListener.mock.calls.filter(([type]) => type === 'wheel')).toHaveLength(0);
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'wheel')).toHaveLength(0);
  });

  it('follows the canvas through a switch to the 3D workspace and back', () => {
    const env = mountStudio([line('a', 0, 0, 100, 0)]);
    act(() => env.get().setWorkspaceMode('model'));
    expect(env.canvas()).toBeNull();
    act(() => env.get().setWorkspaceMode('draft'));
    const canvas = env.canvas();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 });
    const before = env.get().viewport.zoom;
    act(() => {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 10, cancelable: true }));
    });
    expect(env.get().viewport.zoom).toBe(getNextZoom(before, -100));
  });
});

describe('C6: the cutting list during a drag', () => {
  it('holds the rows the drag started from, then shows the final ones', () => {
    const rect = {
      id: 'shelf',
      type: 'rect',
      x: 0,
      y: 0,
      width: 600,
      height: 18,
      rotation: 0,
      materialId: 'birch-plywood-18',
      thickness: 18,
      layerId: 'default',
      visible: true,
      meta: {},
    };
    const env = mountStudio([rect]);
    act(() => env.get().toggleCraftsmanMode());
    const bomText = () => env.view.container.querySelector('table')?.textContent ?? '';
    expect(bomText()).toContain('600');

    // Select the shelf on its top edge, then drag its bottom-right handle.
    act(() => env.get().onCanvasPointerMove(pointer({ x: 300, y: 0 })));
    act(() => env.get().onCanvasPointerDown(pointer({ x: 300, y: 0, buttons: 1 })));
    act(() => env.get().onCanvasPointerUp(pointer({ x: 300, y: 0 })));
    act(() => env.get().onCanvasClick(pointer({ x: 300, y: 0 })));
    expect(env.get().selection.selectedIds).toEqual(['shelf']);
    const handle = env.get().selectedHandles.find((candidate) => candidate.id === 'bottomRight');
    act(() =>
      env.get().handleBindings.onHandlePointerDown(handle, {
        button: 0,
        pointerId: 1,
        stopPropagation() {},
        preventDefault() {},
        currentTarget: { setPointerCapture() {} },
      }),
    );
    for (const x of [700, 800, 900]) {
      act(() => env.get().onCanvasPointerMove(pointer({ x, y: 18, buttons: 1 })));
      expect(env.get().document.entities[0].width).toBe(x);
      expect(bomText(), `frame ${x}`).toContain('600');
      expect(bomText()).not.toContain(String(x));
    }
    act(() => env.get().onCanvasPointerUp(pointer({ x: 900, y: 18 })));
    expect(env.get().interaction.mode).toBe('idle');
    expect(bomText()).toContain('900');
    expect(bomText()).not.toContain('600');
  });
});

describe('C6: the large-selection class', () => {
  it('leaves the canvas element as it was up to the limit and marks it past the limit', () => {
    const lines = Array.from({ length: SELECTION_GLOW_LIMIT + 1 }, (_, index) =>
      line(`l${index}`, 0, index * 10, 100, index * 10),
    );
    const env = mountStudio(lines);
    const className = () => env.canvas().getAttribute('class');

    expect(className()).toBe('sketchStudioCanvas ');
    for (const count of [1, SELECTION_GLOW_LIMIT]) {
      act(() => env.get().loadTemplate({ document: { ...sampleDocument, entities: lines } }));
      // Select `count` lines by a marquee over them.
      act(() => env.get().onCanvasPointerDown(pointer({ x: -30, y: -30, buttons: 1 })));
      act(() => env.get().onCanvasPointerMove(pointer({ x: 105, y: (count - 1) * 10 + 5, buttons: 1 })));
      act(() => env.get().onCanvasPointerUp(pointer({ x: 105, y: (count - 1) * 10 + 5 })));
      expect(env.get().selection.selectedIds).toHaveLength(count);
      expect(className()).toBe('sketchStudioCanvas ');
    }

    act(() => env.get().onCanvasPointerDown(pointer({ x: -30, y: -30, buttons: 1 })));
    act(() => env.get().onCanvasPointerMove(pointer({ x: 105, y: SELECTION_GLOW_LIMIT * 10 + 5, buttons: 1 })));
    act(() => env.get().onCanvasPointerUp(pointer({ x: 105, y: SELECTION_GLOW_LIMIT * 10 + 5 })));
    expect(env.get().selection.selectedIds).toHaveLength(SELECTION_GLOW_LIMIT + 1);
    expect(className()).toBe('sketchStudioCanvas  is-large-selection');
    // The entities themselves carry the same classes as for a small selection.
    expect(env.canvas().querySelectorAll('.sketchStudioEntity.is-selected')).toHaveLength(SELECTION_GLOW_LIMIT + 1);
  });
});
