/* @vitest-environment jsdom */
/**
 * Perf pass 3, C5: the trim preview keeps the hovered target's cut points, and
 * the extend preview keeps the hovered end's extension, until the document or
 * the target changes. The preview must still be exactly what a fresh
 * computation -- the one the click makes -- gives, at every move: along one
 * target, across targets, and after the document changes under the cursor.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useSketchStudio from './useSketchStudio';
import sampleDocument from '../data/sampleDocument';
import { ConfirmDialogProvider } from '../../../ui/ConfirmDialog';
import { computeSketchTrim } from '../utils/trimUtils';
import { computeSketchExtend, findExtendCandidate } from '../utils/extendUtils';

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

function pointer({ x, y }) {
  return {
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 0,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    pointerId: 1,
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} },
  };
}

function mountStudio(entities) {
  const view = renderHook(() => useSketchStudio(), { wrapper: ConfirmDialogProvider });
  act(() => view.result.current.loadTemplate({ document: { ...sampleDocument, entities } }));
  const canvas = document.createElement('div');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 });
  view.result.current.canvasRef.current = canvas;
  const studio = () => view.result.current;
  const move = (at) => act(() => studio().onCanvasPointerMove(pointer(at)));
  return { studio, move };
}

// A horizontal target crossed by three verticals; a second target below.
const SCENE = [
  line('target', 0, 100, 400, 100),
  line('c1', 100, 0, 100, 300),
  line('c2', 200, 0, 200, 300),
  line('c3', 300, 0, 300, 150),
  line('other', 0, 250, 400, 250),
];

function freshTrimPreview(studio, targetId, at) {
  const target = studio().document.entities.find((entity) => entity.id === targetId);
  const result = computeSketchTrim(studio().document.entities, target, at);
  return result ? { points: result.removedSpanPoints, deletesEntity: result.deletesEntity } : null;
}

describe('C5: the trim preview', () => {
  it('is the fresh trim at every move, across spans, targets and document changes', () => {
    const env = mountStudio(SCENE);
    act(() => env.studio().setActiveTool('trim'));

    const path = [
      [{ x: 50, y: 101 }, 'target'],
      [{ x: 150, y: 100 }, 'target'],
      [{ x: 160, y: 99 }, 'target'],
      [{ x: 350, y: 100 }, 'target'],
      [{ x: 150, y: 250 }, 'other'],
      [{ x: 250, y: 100 }, 'target'],
    ];
    for (const [at, targetId] of path) {
      env.move(at);
      expect(env.studio().draft.trimTargetId).toBe(targetId);
      expect(env.studio().draft.trimPreview, `${at.x},${at.y}`).toEqual(freshTrimPreview(env.studio, targetId, at));
    }

    // The document changes under the cursor: c2 is gone, so the span widens.
    const before = env.studio().draft.trimPreview;
    act(() =>
      env.studio().loadTemplate({ document: { ...sampleDocument, entities: SCENE.filter((e) => e.id !== 'c2') } }),
    );
    act(() => env.studio().setActiveTool('trim'));
    env.move({ x: 250, y: 100 });
    expect(env.studio().draft.trimPreview).toEqual(freshTrimPreview(env.studio, 'target', { x: 250, y: 100 }));
    expect(env.studio().draft.trimPreview).not.toEqual(before);
  });

  it('and the click removes the span the preview showed', () => {
    const env = mountStudio(SCENE);
    act(() => env.studio().setActiveTool('trim'));
    env.move({ x: 150, y: 100 });
    const preview = env.studio().draft.trimPreview;
    act(() => env.studio().onCanvasClick(pointer({ x: 150, y: 100 })));

    const pieces = env.studio().document.entities.filter((entity) => !SCENE.some((s) => s.id === entity.id));
    expect(env.studio().document.entities.some((entity) => entity.id === 'target')).toBe(false);
    expect(preview.points.at(0)).toEqual({ x: 100, y: 100 });
    expect(preview.points.at(-1)).toEqual({ x: 200, y: 100 });
    expect(pieces.map((piece) => [piece.x1, piece.x2])).toEqual([
      [0, 100],
      [200, 400],
    ]);
  });
});

describe('C5: the extend preview', () => {
  it('is the fresh extension at every move, and follows a document change', () => {
    // A short line ending at x = 50, aimed at a wall at x = 300.
    const scene = [line('short', 0, 100, 50, 100), line('wall', 300, 0, 300, 400), line('far', 0, 300, 120, 300)];
    const env = mountStudio(scene);
    act(() => env.studio().setActiveTool('extend'));

    const fresh = (at) => {
      const entities = env.studio().document.entities;
      const candidate = findExtendCandidate(entities, at, 20);
      const result = candidate ? computeSketchExtend(entities, candidate) : null;
      return result ? { points: result.addedSpanPoints, target: result.target } : null;
    };

    for (const at of [
      { x: 49, y: 101 },
      { x: 51, y: 99 },
      { x: 119, y: 300 },
      { x: 50, y: 100 },
    ]) {
      env.move(at);
      expect(env.studio().draft.extendPreview, `${at.x},${at.y}`).toEqual(fresh(at));
    }
    expect(env.studio().draft.extendPreview.target).toEqual({ x: 300, y: 100 });

    // A nearer wall appears: the same end now stops there.
    act(() =>
      env
        .studio()
        .loadTemplate({ document: { ...sampleDocument, entities: [...scene, line('near', 150, 0, 150, 400)] } }),
    );
    act(() => env.studio().setActiveTool('extend'));
    env.move({ x: 50, y: 100 });
    expect(env.studio().draft.extendPreview).toEqual(fresh({ x: 50, y: 100 }));
    expect(env.studio().draft.extendPreview.target).toEqual({ x: 150, y: 100 });
  });
});
