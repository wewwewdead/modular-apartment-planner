/* @vitest-environment jsdom */
/**
 * Object snap overrides Ortho. With Ortho on, the line tool used to apply the
 * axis lock AFTER snapping, so closing a rectangle onto its first corner put
 * the endpoint a fraction of a millimetre off the corner the snap marker
 * showed -- and the 3D import then refused the loop as "not closed". These
 * tests drive the real viewport hook (real snapWorldPoint, real
 * getConstrainedDraftPoint) through the click, move-preview and handle-drag
 * paths.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useSketchViewport from './useSketchViewport';
import useSketchToolClick from './useSketchToolClick';
import useSketchPointer from './useSketchPointer';
import { SKETCH_STUDIO_ACTIONS } from '../store/sketchStudioActions';
import { collectDraftingProfiles } from '../cad/draftingProfiles';

const A = { x: 100, y: 100 };

function buildState({ entities = [], draft = {}, ui = {}, interaction = {} }) {
  return {
    document: {
      entities,
      layers: [{ id: 'default', visible: true, locked: false }],
      units: 'mm',
      groupIndex: {},
    },
    draft: { precisionInput: {}, points: [], sourceRefs: [], ...draft },
    selection: { selectedIds: [] },
    interaction: { suppressNextClick: false, mode: 'idle', ...interaction },
    hover: { hoveredId: null },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    ui: {
      activeLayerId: 'default',
      activeHardwareId: null,
      viewMode: 'plan',
      isometricPlane: 'top',
      orthoEnabled: true,
      snapEnabled: true,
      activeTool: 'line',
      ...ui,
    },
  };
}

function mountViewport(state) {
  const entities = state.document.entities;
  return renderHook(() =>
    useSketchViewport(state, vi.fn(), { current: null }, { visibleEntities: entities, editableEntities: entities }),
  ).result.current;
}

// Real snap resolution against the drawing, exactly as the canvas does it.
function viewportHookFor(viewport, cursor, snapOverride) {
  return {
    readCanvasPoint: () => ({ x: 0, y: 0 }),
    readWorldPoint: () => cursor,
    getOrthoReferencePoint: viewport.getOrthoReferencePoint,
    resolveSnap: (point, anchorPoint, options) => snapOverride ?? viewport.resolveSnap(point, anchorPoint, options),
    resolvePointerState: (_screen, _viewport, options = {}) => ({
      worldPoint: cursor,
      snap: snapOverride ?? viewport.resolveSnap(cursor, options.anchorPoint ?? null),
      hoveredEntity: null,
    }),
  };
}

function lineDraft(startPoint) {
  return { type: 'line', step: 'pickEnd', startPoint, currentPoint: startPoint, points: [startPoint] };
}

/** Click the line tool once with a draft starting at `startPoint`; returns the committed line. */
function clickLineEnd(entities, startPoint, cursor, { ui, snap } = {}) {
  const state = buildState({ entities, draft: lineDraft(startPoint), ui });
  const viewport = mountViewport(state);
  const dispatch = vi.fn();
  const options = {
    activeTool: 'line',
    editableEntities: entities,
    draftPreview: null,
    commitPrecisionDraft: vi.fn(),
    getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
  };
  const { result } = renderHook(() =>
    useSketchToolClick(state, dispatch, viewportHookFor(viewport, cursor, snap), options),
  );
  result.current.handleCanvasClick({ button: 0, shiftKey: false });
  const commit = dispatch.mock.calls
    .map(([action]) => action)
    .find((a) => a.type === SKETCH_STUDIO_ACTIONS.COMMIT_ENTITY);
  return commit?.payload ?? null;
}

/** Move the pointer with a line draft open; returns the preview `currentPoint`. */
function moveLinePreview(entities, startPoint, cursor, { ui } = {}) {
  const state = buildState({ entities, draft: lineDraft(startPoint), ui });
  const viewport = mountViewport(state);
  const dispatch = vi.fn();
  const options = {
    activeTool: 'line',
    editableEntities: entities,
    isSpacePanActiveRef: { current: false },
    selectionBounds: null,
    getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
  };
  const { result } = renderHook(() => useSketchPointer(state, dispatch, viewportHookFor(viewport, cursor), options));
  result.current.handlePointerMove({ clientX: 0, clientY: 0, pointerId: 1 });
  const patch = dispatch.mock.calls.map(([action]) => action).find((a) => a.type === SKETCH_STUDIO_ACTIONS.PATCH_DRAFT);
  return patch?.payload?.currentPoint ?? null;
}

// Draw the repro rectangle click by click: every corner but the last is a
// free (unsnapped) ortho click, exactly like the user's session.
function drawOrthoRectangle(ui) {
  const lines = [];
  const commit = (start, cursor) => {
    const line = clickLineEnd(lines, start, cursor, { ui });
    lines.push(line);
    return { x: line.x2, y: line.y2 };
  };
  const B = commit(A, { x: 400.37, y: 101.2 });
  const C = commit(B, { x: 399.1, y: 300.84 });
  const D = commit(C, { x: 100.62, y: 299.5 });
  // Cursor lands within snap range of the first corner, not on it.
  commit(D, { x: 101.5, y: 100.8 });
  return lines;
}

describe('object snap overrides ortho on the line tool', () => {
  it('closes an ortho rectangle exactly on its first corner and imports as one profile', () => {
    const lines = drawOrthoRectangle();
    const closing = lines.at(-1);

    expect(closing.x2).toBe(A.x);
    expect(closing.y2).toBe(A.y);
    // Free clicks stay axis-locked: corner D keeps the raw cursor x.
    expect(lines[2].y2).toBe(lines[2].y1);

    const { candidates, rejected } = collectDraftingProfiles(lines);
    expect(rejected).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceIds).toHaveLength(4);
  });

  it('keeps the ortho lock when nothing is snapped', () => {
    const line = clickLineEnd([], A, { x: 300.4, y: 107 });
    expect(line.x2).toBeCloseTo(300.4, 9);
    expect(line.y2).toBe(A.y);
  });

  it('keeps the ortho lock for a segment-derived (nearest) snap', () => {
    const wall = { id: 'line_v', type: 'line', x1: 300, y1: 0, x2: 300, y2: 500, layerId: 'default', visible: true };
    const line = clickLineEnd([wall], A, { x: 301, y: 130 });
    // The nearest snap picked (300, 130); ortho then pins y to the start.
    expect(line.x2).toBe(300);
    expect(line.y2).toBe(A.y);
  });

  it('also lets a midpoint snap win over ortho', () => {
    const edge = { id: 'line_h', type: 'line', x1: 0, y1: 300, x2: 401, y2: 300, layerId: 'default', visible: true };
    const line = clickLineEnd([edge], A, { x: 199, y: 297 });
    expect(line.x2).toBe(200.5);
    expect(line.y2).toBe(300);
  });

  it('previews the same snapped point the click will commit', () => {
    const first = { id: 'line_1', type: 'line', x1: A.x, y1: A.y, x2: 400, y2: 100, layerId: 'default', visible: true };
    const D = { x: 100.62, y: 300.84 };
    expect(moveLinePreview([first], D, { x: 101.5, y: 100.8 })).toEqual(A);
    // Unsnapped preview is still axis-locked.
    expect(moveLinePreview([first], D, { x: 160, y: 200 })).toEqual({ x: 100.62, y: 200 });
  });

  it('closes exactly on the first corner in isometric view too', () => {
    const ui = { viewMode: 'isometric', isometricPlane: 'top' };
    const first = { id: 'line_1', type: 'line', x1: A.x, y1: A.y, x2: 360, y2: 250, layerId: 'default', visible: true };
    const line = clickLineEnd([first], { x: 140.3, y: 320.7 }, { x: 101.5, y: 100.8 }, { ui });
    expect({ x: line.x2, y: line.y2 }).toEqual(A);
    expect(line.meta.isometricPlane).toBe('top');
  });

  it('drags a line endpoint exactly onto another endpoint with ortho on', () => {
    const target = {
      id: 'line_1',
      type: 'line',
      x1: A.x,
      y1: A.y,
      x2: 400,
      y2: 100,
      layerId: 'default',
      visible: true,
    };
    const dragged = {
      id: 'line_2',
      type: 'line',
      x1: 100.62,
      y1: 300.84,
      x2: 100.62,
      y2: 200,
      layerId: 'default',
      visible: true,
    };
    const entities = [target, dragged];
    const drag = (cursor) => {
      const state = buildState({
        entities,
        ui: { activeTool: 'select' },
        interaction: { mode: 'handle-drag', handleDrag: { entityId: 'line_2', handleId: 'end' } },
      });
      const viewport = mountViewport(state);
      const dispatch = vi.fn();
      const { result } = renderHook(() =>
        useSketchPointer(state, dispatch, viewportHookFor(viewport, cursor), {
          activeTool: 'select',
          editableEntities: entities,
          isSpacePanActiveRef: { current: false },
          selectionBounds: null,
          getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
        }),
      );
      result.current.handlePointerMove({ clientX: 0, clientY: 0, pointerId: 1 });
      const update = dispatch.mock.calls
        .map(([action]) => action)
        .find((a) => a.type === SKETCH_STUDIO_ACTIONS.SET_DOCUMENT_ENTITIES);
      return update.payload.find((e) => e.id === 'line_2');
    };

    const snapped = drag({ x: 101.5, y: 100.8 });
    expect({ x: snapped.x2, y: snapped.y2 }).toEqual(A);

    // Free drag keeps the ortho lock against the fixed start point.
    const free = drag({ x: 130, y: 180 });
    expect({ x: free.x2, y: free.y2 }).toEqual({ x: 100.62, y: 180 });
  });
});

/** Drag `handleId` of `entityId` to `cursor`; returns the updated entity and the status-bar snap. */
function dragHandle(entities, entityId, handleId, cursor, ui = {}) {
  const state = buildState({
    entities,
    ui: { activeTool: 'select', ...ui },
    interaction: { mode: 'handle-drag', handleDrag: { entityId, handleId } },
  });
  const viewport = mountViewport(state);
  const dispatch = vi.fn();
  const { result } = renderHook(() =>
    useSketchPointer(state, dispatch, viewportHookFor(viewport, cursor), {
      activeTool: 'select',
      editableEntities: entities,
      isSpacePanActiveRef: { current: false },
      selectionBounds: null,
      getConstrainedDraftPoint: viewport.getConstrainedDraftPoint,
    }),
  );
  result.current.handlePointerMove({ clientX: 0, clientY: 0, pointerId: 1 });
  const actions = dispatch.mock.calls.map(([action]) => action);
  return {
    entity: actions
      .find((a) => a.type === SKETCH_STUDIO_ACTIONS.SET_DOCUMENT_ENTITIES)
      .payload.find((e) => e.id === entityId),
    snap: actions.find((a) => a.type === SKETCH_STUDIO_ACTIONS.SYNC_POINTER)?.payload?.snap,
  };
}

describe('handle drag never snaps an entity to itself', () => {
  const line = { id: 'line_1', type: 'line', x1: 100, y1: 200, x2: 500, y2: 200, layerId: 'default', visible: true };

  it('follows the cursor instead of sticking to its own stale endpoint', () => {
    const { entity, snap } = dragHandle([line], 'line_1', 'end', { x: 501, y: 200 }, { orthoEnabled: false });
    expect({ x: entity.x2, y: entity.y2 }).toEqual({ x: 501, y: 200 });
    // The status bar must not report the line snapping onto itself either.
    expect(snap.sourceEntityId).not.toBe('line_1');
  });

  it('still snaps onto another entity near the cursor', () => {
    const other = { id: 'line_2', type: 'line', x1: 503, y1: 201, x2: 503, y2: 400, layerId: 'default', visible: true };
    const { entity, snap } = dragHandle([line, other], 'line_1', 'end', { x: 501, y: 200 }, { orthoEnabled: false });
    expect({ x: entity.x2, y: entity.y2 }).toEqual({ x: 503, y: 201 });
    expect(snap.sourceEntityId).toBe('line_2');
  });
});

describe('ending a handle drag', () => {
  function pointerUp(moved) {
    const snapshotDocument = { entities: [], layers: [] };
    const state = buildState({
      interaction: {
        mode: 'handle-drag',
        handleDrag: { entityId: 'line_1', handleId: 'end', historySnapshot: { document: snapshotDocument } },
      },
    });
    if (!moved) state.document = snapshotDocument;
    const viewport = mountViewport(state);
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useSketchPointer(state, dispatch, viewportHookFor(viewport, { x: 0, y: 0 }), {
        activeTool: 'select',
        editableEntities: [],
        isSpacePanActiveRef: { current: false },
        selectionBounds: null,
        getConstrainedDraftPoint: (_tool, _draft, point) => point,
      }),
    );
    result.current.handlePointerUp({ pointerId: 1, currentTarget: { hasPointerCapture: () => false } });
    return dispatch.mock.calls.map(([action]) => action);
  }

  it('swallows the click that follows a drag that moved the handle, so the selection survives', () => {
    const actions = pointerUp(true);
    expect(actions.map((a) => a.type)).toEqual([
      SKETCH_STUDIO_ACTIONS.SET_SUPPRESS_NEXT_CLICK,
      SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG,
    ]);
    expect(actions[0].payload).toBe(true);
  });

  it('leaves a plain click on a handle (no movement) alone', () => {
    expect(pointerUp(false).map((a) => a.type)).toEqual([SKETCH_STUDIO_ACTIONS.END_HANDLE_DRAG]);
  });
});
