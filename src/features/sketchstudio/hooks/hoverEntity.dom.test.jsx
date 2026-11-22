/* @vitest-environment jsdom */
/**
 * Mirror about a clicked line, and a fastener placed on a part, both need the
 * entity under the cursor. The viewport hook used to resolve it only for
 * select, offset and fillet, so neither ever saw one -- and the click-flow tests
 * hid that by handing the click a hovered entity directly. These go through
 * the real pointer path: the real viewport hook, its snap and its hit test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useSketchStudio from './useSketchStudio';
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

const SHAPE = line('shape', 300, 100, 400, 100);
const AXIS = line('axis', 200, 0, 200, 400);

function mountStudio(entities = [SHAPE, AXIS]) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  view.result.current.canvasRef.current = canvas;
  const studio = () => view.result.current;
  const run = (name, ...args) => act(() => studio()[name](...args));
  return { studio, run };
}

/** Move to `at` and click there, as the canvas sees it. */
function moveAndClick(env, at) {
  env.run('onCanvasPointerMove', pointer(at));
  env.run('onCanvasPointerDown', pointer(at));
  env.run('onCanvasPointerUp', pointer(at));
  env.run('onCanvasClick', pointer(at));
}

describe('mirror', () => {
  function armMirror() {
    const env = mountStudio();
    moveAndClick(env, { x: 350, y: 100 });
    expect(env.studio().selection.selectedIds).toEqual(['shape']);
    env.run('setActiveTool', 'mirror');
    return env;
  }

  it('mirrors about a line clicked on its body, in one click', () => {
    const env = armMirror();
    moveAndClick(env, { x: 201, y: 130 });

    const copies = env.studio().document.entities.filter((entity) => !['shape', 'axis'].includes(entity.id));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ x1: 100, y1: 100, x2: 0, y2: 100 });
    expect(env.studio().draft.type).toBeNull();
  });

  it('starts a free axis at a point snap on the line, as before', () => {
    const env = armMirror();
    // The axis line's end: a definite point, so it is where the axis starts.
    moveAndClick(env, { x: 201, y: 1 });

    expect(env.studio().document.entities).toHaveLength(2);
    expect(env.studio().draft).toMatchObject({ type: 'mirror', points: [{ x: 200, y: 0 }] });
  });
});

describe('fastener', () => {
  it('previews against the part under the cursor and places onto it', () => {
    const env = mountStudio();
    env.run('setActiveTool', 'fastener');
    env.run('onCanvasPointerMove', pointer({ x: 350, y: 101 }));
    expect(env.studio().draft.hoverPartId).toBe('shape');

    moveAndClick(env, { x: 350, y: 101 });

    const placed = env.studio().document.entities.at(-1);
    expect(placed).toMatchObject({ type: 'feature', targetPartId: 'shape' });
  });
});
