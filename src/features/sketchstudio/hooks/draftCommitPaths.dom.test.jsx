/* @vitest-environment jsdom */
/**
 * A draft is committed three ways: a click on the canvas, Enter on the page,
 * and Enter in the precision HUD's box. They are three pieces of code and had
 * drifted: Enter applied a fillet at the radius from before the last `[` or
 * `]`, Enter in the fillet and chamfer boxes did nothing, and Enter closed a
 * two-point polyline a click would have left open. These drive the real studio
 * hook and, for the HUD, the real HUD component.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import useSketchStudio from './useSketchStudio';
import PrecisionHud from '../components/PrecisionHud';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

function line(id, x1, y1, x2, y2) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta: {} };
}

function pointer({ x = 0, y = 0 } = {}) {
  return {
    clientX: x,
    clientY: y,
    button: 0,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} },
  };
}

function press(key) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

// A square corner at (100, 0): a fillet or chamfer of size s pulls line a's
// end back to x = 100 - s.
const CORNER = [line('a', 0, 0, 100, 0), line('b', 100, 0, 100, 100)];

function mountStudio(entities = CORNER) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  view.result.current.canvasRef.current = canvas;
  const studio = () => view.result.current;
  const run = (name, ...args) => act(() => studio()[name](...args));
  const entity = (id) => studio().document.entities.find((candidate) => candidate.id === id);
  return { studio, run, entity };
}

function hoverCorner(tool) {
  const env = mountStudio();
  env.run('setActiveTool', tool);
  env.run('onCanvasPointerMove', pointer({ x: 100, y: 0 }));
  expect(env.studio().draft.hoveredCorner).toBeTruthy();
  return env;
}

describe('a corner tool after [ or ]', () => {
  it.each(['fillet', 'chamfer'])('%s: Enter applies the new size, as a click does', (tool) => {
    const byEnter = hoverCorner(tool);
    press('[');
    press('Enter');

    const byClick = hoverCorner(tool);
    press('[');
    byClick.run('onCanvasClick', pointer({ x: 100, y: 0 }));

    expect(byClick.entity('a').x2).toBeCloseTo(60, 6);
    expect(byEnter.entity('a').x2).toBeCloseTo(60, 6);
  });

  it.each(['fillet', 'chamfer'])('%s: the preview shows the new size before anything moves', (tool) => {
    const env = hoverCorner(tool);
    press(']');
    const preview = env.studio().draftPreview;
    expect(preview.radius ?? preview.distance).toBe(60);
  });
});

describe('Enter in a corner tool HUD box', () => {
  function hud(env) {
    const { precisionHud, precisionBindings } = env.studio();
    return (
      <PrecisionHud
        precisionHud={precisionHud}
        cursorScreen={{ x: 10, y: 10 }}
        onInputChange={precisionBindings.onInputChange}
        onSubmit={precisionBindings.onSubmit}
        onToggleChange={precisionBindings.onToggleChange}
      />
    );
  }

  it.each(['fillet', 'chamfer'])('%s: applies the typed size at the hovered corner', (tool) => {
    const env = hoverCorner(tool);
    const view = render(hud(env));
    const input = document.querySelector('.sketchStudioPrecisionInput');
    expect(document.activeElement).toBe(input);

    act(() => {
      fireEvent.change(input, { target: { value: '25' } });
    });
    view.rerender(hud(env));
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(env.entity('a').x2).toBeCloseTo(75, 6);
    expect(env.studio().activeTool).toBe(tool);
  });
});

describe('Enter on a polyline', () => {
  function drawPolyline(points, cursor) {
    const env = mountStudio([]);
    env.run('setActiveTool', 'polyline');
    for (const point of points) {
      env.run('onCanvasPointerMove', pointer(point));
      env.run('onCanvasClick', pointer(point));
    }
    env.run('onCanvasPointerMove', pointer(cursor));
    press('Enter');
    expect(env.studio().draft.type).toBeNull();
    return env.studio().document.entities.at(-1);
  }

  it('leaves two points open even with the cursor on the first', () => {
    const polyline = drawPolyline(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
      { x: 104, y: 102 },
    );
    expect(polyline).toMatchObject({ type: 'polyline', closed: false });
    expect(polyline.points).toHaveLength(2);
  });

  it('closes three points with the cursor on the first, as a click there does', () => {
    const polyline = drawPolyline(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
      ],
      { x: 104, y: 102 },
    );
    expect(polyline).toMatchObject({ type: 'polyline', closed: true });
    expect(polyline.points).toHaveLength(3);
  });

  it('leaves three points open with the cursor elsewhere', () => {
    const polyline = drawPolyline(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 300 },
      ],
      { x: 500, y: 500 },
    );
    expect(polyline).toMatchObject({ type: 'polyline', closed: false });
  });
});
