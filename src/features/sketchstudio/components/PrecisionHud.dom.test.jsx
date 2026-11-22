/* @vitest-environment jsdom */
/**
 * The precision HUD takes focus as soon as a draft has a value to type, so
 * every key the user presses next lands in its input, not on the canvas. The
 * window key handler skips typing targets, which left Escape dead until a click
 * took the focus away. Escape in the HUD must do what Escape on the canvas
 * does. These drive the real studio hook and the real HUD component.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import useSketchStudio from '../hooks/useSketchStudio';
import PrecisionHud from './PrecisionHud';
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

function mountStudio(entities = []) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  view.result.current.canvasRef.current = canvas;
  const studio = () => view.result.current;
  const run = (name, ...args) => act(() => studio()[name](...args));
  return { studio, run };
}

/** The HUD for the studio's current draft, focused the way the canvas focuses it. */
function showHud(env) {
  const { precisionHud, precisionBindings } = env.studio();
  expect(precisionHud?.inputs?.length).toBeGreaterThan(0);
  render(
    <PrecisionHud
      precisionHud={precisionHud}
      cursorScreen={{ x: 10, y: 10 }}
      onInputChange={precisionBindings.onInputChange}
      onSubmit={precisionBindings.onSubmit}
      onToggleChange={precisionBindings.onToggleChange}
    />,
  );
  const input = document.querySelector('.sketchStudioPrecisionInput');
  expect(document.activeElement).toBe(input);
  return input;
}

describe('Escape in the precision HUD', () => {
  it('cancels a line being drawn, as Escape on the canvas does', () => {
    const env = mountStudio();
    env.run('setActiveTool', 'line');
    env.run('onCanvasClick', pointer({ x: 100, y: 100 }));
    env.run('onCanvasPointerMove', pointer({ x: 300, y: 140 }));
    expect(env.studio().draft.type).toBe('line');

    const input = showHud(env);
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    expect(env.studio().draft.type).toBeNull();
    expect(env.studio().activeTool).toBe('line');
  });

  it('leaves a hover tool for the select tool, as Escape on the canvas does', () => {
    const env = mountStudio([line('a', 0, 0, 100, 0), line('b', 100, 0, 100, 100)]);
    env.run('setActiveTool', 'fillet');
    env.run('onCanvasPointerMove', pointer({ x: 100, y: 0 }));
    expect(env.studio().draft.hoveredCorner).toBeTruthy();

    const input = showHud(env);
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    expect(env.studio().draft.type).toBeNull();
    expect(env.studio().activeTool).toBe('select');
  });

  it('leaves the other keys to the input', () => {
    const env = mountStudio();
    env.run('setActiveTool', 'line');
    env.run('onCanvasClick', pointer({ x: 100, y: 100 }));
    env.run('onCanvasPointerMove', pointer({ x: 300, y: 140 }));

    const input = showHud(env);
    act(() => {
      fireEvent.keyDown(input, { key: 'r' });
    });

    // Typing a letter into the box is not the Rectangle shortcut.
    expect(env.studio().activeTool).toBe('line');
    expect(env.studio().draft.type).toBe('line');
  });
});
