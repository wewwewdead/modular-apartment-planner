import { describe, expect, it } from 'vitest';
import { computeSketchTrim } from '../utils/trimUtils';
import { computeSketchExtend, findExtendCandidate } from '../utils/extendUtils';
import { mirrorEntitiesAcrossLine } from '../utils/mirrorUtils';
import { computeLinearArray } from '../utils/arrayUtils';
import { applyChamfer, computeSketchChamfer, findChamferableCorner } from '../utils/chamferUtils';
import { pruneDocumentAfterEntityRemoval } from '../utils/documentEditUtils';
import { resolveLinearDimensionPoints } from '../utils/entityUtils';
import sketchStudioInitialState from './sketchStudioInitialState';
import sketchStudioReducer from './sketchStudioReducer';
import { setDocument, setDocumentEntities, undo } from './sketchStudioActions';

function line(id, x1, y1, x2, y2, meta = {}) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta };
}

function rect(id, x, y, width, height) {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    thickness: 18,
    layerId: 'default',
    visible: true,
    meta: {},
  };
}

function createState(documentPatch = {}) {
  return {
    ...sketchStudioInitialState,
    document: {
      ...sketchStudioInitialState.document,
      entities: [],
      joints: [],
      layers: [...sketchStudioInitialState.document.layers],
      ...documentPatch,
    },
    selection: { selectedIds: [], selectionBox: sketchStudioInitialState.selection.selectionBox },
    history: { past: [], future: [] },
  };
}

const TRIM_TARGET = line('line-target', 0, 0, 1000, 0);
const TRIM_CUTTERS = [line('cut-1', 250, -50, 250, 50), line('cut-2', 750, -50, 750, 50)];

function trimDocument(state, clickPoint = { x: 500, y: 0 }) {
  const target = state.document.entities.find((entity) => entity.id === 'line-target');
  const result = computeSketchTrim(state.document.entities, target, clickPoint);
  return {
    result,
    action: setDocument(pruneDocumentAfterEntityRemoval(state.document, result.entities, result.removedIds)),
  };
}

describe('trim through the reducer', () => {
  it('is a single undo entry and restores the original entity', () => {
    const state = createState({ entities: [TRIM_TARGET, ...TRIM_CUTTERS] });
    const trimmedState = sketchStudioReducer(state, trimDocument(state).action);

    expect(trimmedState.history.past).toHaveLength(1);
    expect(trimmedState.document.entities.map((entity) => entity.id)).not.toContain('line-target');
    expect(trimmedState.document.entities.filter((entity) => entity.type === 'line')).toHaveLength(4);

    const undoneState = sketchStudioReducer(trimmedState, undo());

    expect(undoneState.document.entities.map((entity) => entity.id)).toContain('line-target');
    expect(undoneState.history.past).toHaveLength(0);
  });

  it('prunes joints that referenced the trimmed entity', () => {
    const state = createState({
      entities: [rect('panel', 0, 0, 200, 120), rect('shelf', 40, -18, 60, 18), TRIM_TARGET, ...TRIM_CUTTERS],
      joints: [
        {
          id: 'joint-dado',
          type: 'dado',
          sourcePartId: 'shelf',
          targetPartId: 'panel',
          sourceEdgeRef: { entityId: 'shelf', sourceType: 'segment', sourceKey: 'bottom' },
          targetEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
          parameters: { width: 60, depth: 6 },
        },
      ],
    });
    const shelf = state.document.entities.find((entity) => entity.id === 'shelf');
    const result = computeSketchTrim(state.document.entities, shelf, { x: 70, y: -18 });
    const nextState = sketchStudioReducer(
      state,
      setDocument(pruneDocumentAfterEntityRemoval(state.document, result.entities, result.removedIds)),
    );

    expect(nextState.document.entities.some((entity) => entity.id === 'shelf')).toBe(false);
    expect(nextState.document.joints).toHaveLength(0);
    expect(nextState.history.past).toHaveLength(1);
  });

  it('drops a group id once trimming leaves only one member', () => {
    const state = createState({
      entities: [
        line('line-a', 0, 0, 100, 0, { groupId: 'group-1' }),
        line('line-b', 0, 50, 100, 50, { groupId: 'group-1' }),
      ],
    });
    const target = state.document.entities[0];
    const result = computeSketchTrim(state.document.entities, target, { x: 50, y: 0 });
    const nextState = sketchStudioReducer(
      state,
      setDocument(pruneDocumentAfterEntityRemoval(state.document, result.entities, result.removedIds)),
    );

    // No cutters, so line-a is deleted outright and group-1 has one member left.
    expect(result.deletesEntity).toBe(true);
    expect(nextState.document.entities).toHaveLength(1);
    expect(nextState.document.entities[0].meta.groupId).toBeUndefined();
    expect(nextState.document.groupIndex.size).toBe(0);
  });

  it('leaves dimension source-ref slots untouched and keeps the stored points', () => {
    const dimension = {
      id: 'dim-1',
      type: 'dimension',
      subtype: 'horizontal',
      p1: { x: 0, y: 0 },
      p2: { x: 1000, y: 0 },
      offset: 40,
      text: '1000 mm',
      units: 'mm',
      layerId: 'dimensions',
      visible: true,
      meta: {
        sourceRefs: [null, { entityId: 'line-target', sourceType: 'endpoint', sourceKey: 'end' }],
      },
    };
    const state = createState({ entities: [TRIM_TARGET, ...TRIM_CUTTERS, dimension] });
    const nextState = sketchStudioReducer(state, trimDocument(state).action);
    const survivingDimension = nextState.document.entities.find((entity) => entity.id === 'dim-1');

    // Slot 0 was empty and stays empty; slot 1 still points at the vanished id.
    expect(survivingDimension.meta.sourceRefs).toEqual([
      null,
      { entityId: 'line-target', sourceType: 'endpoint', sourceKey: 'end' },
    ]);
    expect(resolveLinearDimensionPoints(survivingDimension, nextState.document.entities)).toEqual({
      p1: { x: 0, y: 0 },
      p2: { x: 1000, y: 0 },
    });
  });
});

describe('extend through the reducer', () => {
  it('replaces the entity in place as a single undo entry', () => {
    const state = createState({ entities: [line('line-a', 0, 0, 100, 0), line('blocker', 300, -100, 300, 100)] });
    const candidate = findExtendCandidate(state.document.entities, { x: 100, y: 0 }, 10);
    const result = computeSketchExtend(state.document.entities, candidate);
    const nextState = sketchStudioReducer(state, setDocumentEntities(result.entities));

    expect(nextState.history.past).toHaveLength(1);
    expect(nextState.document.entities).toHaveLength(2);
    expect(nextState.document.entities[0].x2).toBeCloseTo(300, 6);

    const undoneState = sketchStudioReducer(nextState, undo());

    expect(undoneState.document.entities[0].x2).toBe(100);
  });
});

describe('mirror and array through the reducer', () => {
  it('mirrors a selection in one undo entry', () => {
    const state = createState({ entities: [line('line-a', 100, 0, 200, 0), line('line-b', 100, 50, 200, 50)] });
    const result = mirrorEntitiesAcrossLine(
      state.document.entities,
      ['line-a', 'line-b'],
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    );
    const nextState = sketchStudioReducer(state, setDocumentEntities(result.entities));

    expect(nextState.history.past).toHaveLength(1);
    expect(nextState.document.entities).toHaveLength(4);

    const undoneState = sketchStudioReducer(nextState, undo());

    expect(undoneState.document.entities).toHaveLength(2);
  });

  it('arrays a selection in one undo entry however many copies it makes', () => {
    const state = createState({ entities: [line('line-a', 0, 0, 50, 0)] });
    const result = computeLinearArray(state.document.entities, ['line-a'], {
      basePoint: { x: 0, y: 0 },
      targetPoint: { x: 100, y: 0 },
      count: 12,
    });
    const nextState = sketchStudioReducer(state, setDocumentEntities(result.entities));

    expect(nextState.document.entities).toHaveLength(12);
    expect(nextState.history.past).toHaveLength(1);

    const undoneState = sketchStudioReducer(nextState, undo());

    expect(undoneState.document.entities).toHaveLength(1);
  });
});

describe('chamfer through the reducer', () => {
  it('cuts a corner in one undo entry', () => {
    const state = createState({ entities: [line('line-a', 0, 0, 100, 0), line('line-b', 100, 0, 100, 100)] });
    const corner = findChamferableCorner(state.document.entities, { x: 100, y: 0 }, 10);
    const geometry = computeSketchChamfer(corner, 20);
    const nextState = sketchStudioReducer(
      state,
      setDocumentEntities(applyChamfer(state.document.entities, corner, geometry, 'default')),
    );

    expect(nextState.document.entities).toHaveLength(3);
    expect(nextState.history.past).toHaveLength(1);

    const undoneState = sketchStudioReducer(nextState, undo());

    expect(undoneState.document.entities).toHaveLength(2);
  });
});
