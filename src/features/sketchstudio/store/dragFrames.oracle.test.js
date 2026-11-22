/**
 * Perf pass 3, C4: a drag frame no longer normalises the layers, variables,
 * joints and 3D model it carries through unchanged; it reuses them. The
 * document each frame writes, and the one the drag's end resolves, must be the
 * documents the old lightweight resolver produced. The old resolver is kept
 * below, verbatim, as the oracle; a drag runs through the real reducer and
 * every frame and the end are deep-compared with the oracle's chain.
 */

import { describe, expect, it, vi } from 'vitest';

const counts = vi.hoisted(() => ({ normalizeModel: 0 }));

vi.mock('../cad/model', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    normalizeModel: (...args) => {
      counts.normalizeModel += 1;
      return actual.normalizeModel(...args);
    },
  };
});

import sketchStudioReducer from './sketchStudioReducer';
import sketchStudioInitialState from './sketchStudioInitialState';
import {
  endHandleDrag,
  endTransform,
  loadWorkspaceSnapshot,
  setDocumentEntities,
  setSelection,
  startHandleDrag,
  startTransform,
} from './sketchStudioActions';
import sampleDocument from '../data/sampleDocument';
import { furnitureExample } from '../cad/examples';
import { resolveAllEntities } from '../utils/parametricEngine';
import { normalizeSketchDocument } from '../utils/sketchDocumentUtils';
import { resolveSketchDocument } from '../utils/sketchDocumentResolver';
import { updateEntityFromHandle } from '../utils/handleUtils';
import { rotateEntities, translateEntities } from '../utils/transformUtils';
import { updateEntityInList } from '../utils/entityUtils';

// The oracle: resolveSketchDocumentLightweight before perf pass 3, verbatim
// (normalizeSketchDocument called without options is the old normalisation).
function oracleResolveSketchDocumentLightweight(document) {
  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  return {
    ...normalizedDocument,
    entities: resolvedEntities,
  };
}

function withoutRuntime(document) {
  const { groupIndex: _groupIndex, ...rest } = document;
  return rest;
}

const rect = (id, x, y, width, height, extras = {}) => ({
  id,
  type: 'rect',
  x,
  y,
  width,
  height,
  rotation: 0,
  layerId: 'default',
  visible: true,
  meta: {},
  ...extras,
});

function buildDocument() {
  return {
    ...sampleDocument,
    name: 'Drag frames',
    variables: [
      { id: 'v-w', name: 'w', value: 120, unit: 'mm' },
      { id: 'v-t', name: 't', value: 18, unit: 'mm' },
    ],
    joints: [{ id: 'j1', type: 'butt', sourcePartId: 'r1', targetPartId: 'r2' }],
    layers: [
      { id: 'default', name: 'Default', visible: true, locked: false },
      { id: 'notes', name: 'Notes', visible: true, locked: false },
    ],
    entities: [
      rect('r1', 0, 0, 100, 50, { thickness: 18 }),
      rect('r2', 100, 0, 100, 50, { thickness: 18 }),
      // Bound to a variable: every resolve re-applies `w`.
      rect('r3', 300, 0, 10, 40, { parametricExpressions: { width: '=w' } }),
      {
        id: 'l1',
        type: 'line',
        x1: 0,
        y1: 100,
        x2: 200,
        y2: 100,
        layerId: 'notes',
        visible: true,
        meta: { groupId: 'g1' },
      },
      {
        id: 'l2',
        type: 'line',
        x1: 0,
        y1: 120,
        x2: 200,
        y2: 140,
        layerId: 'notes',
        visible: true,
        meta: { groupId: 'g1' },
      },
      {
        id: 'd1',
        type: 'dimension',
        subtype: 'horizontal',
        p1: { x: 0, y: 100 },
        p2: { x: 200, y: 100 },
        offset: 20,
        units: 'mm',
        visible: true,
        meta: { sourceRefs: [null, { entityId: 'l1', sourceType: 'endpoint', sourceKey: 'end' }] },
      },
    ],
    model: furnitureExample('desk'),
  };
}

function loadedState() {
  return sketchStudioReducer(
    { ...sketchStudioInitialState, history: { past: [], future: [] } },
    loadWorkspaceSnapshot({ document: buildDocument(), viewport: { zoom: 1, panX: 0, panY: 0 }, ui: {} }),
  );
}

function runDrag({ start, frames, end }) {
  let state = start(loadedState());
  let oracleDocument = state.document;
  const startDocument = state.document;

  let reducerNormalizeModelCalls = 0;
  frames.forEach((makeEntities, index) => {
    const entities = makeEntities(state);
    counts.normalizeModel = 0;
    state = sketchStudioReducer(state, setDocumentEntities(entities));
    reducerNormalizeModelCalls += counts.normalizeModel;
    oracleDocument = oracleResolveSketchDocumentLightweight({ ...oracleDocument, entities });
    expect(withoutRuntime(state.document), `frame ${index + 1}`).toEqual(withoutRuntime(oracleDocument));
    expect(state._needsFullResolution).toBe(true);
  });
  const normalizeModelPerFrame = reducerNormalizeModelCalls / frames.length;

  state = sketchStudioReducer(state, end());
  const oracleEnd = resolveSketchDocument(oracleDocument);
  expect(withoutRuntime(state.document), 'drag end').toEqual(withoutRuntime(oracleEnd.document));
  expect(state.jointDiagnostics).toEqual(oracleEnd.jointDiagnostics);
  expect(state.manufacturingPreviewEntities).toEqual(oracleEnd.manufacturingPreviewEntities);
  expect(state.manufacturingExportEntities).toEqual(oracleEnd.manufacturingExportEntities);
  expect(state._needsFullResolution).toBe(false);
  // One undo entry, holding the document the drag started from.
  expect(state.history.past.at(-1).document).toBe(startDocument);

  return { state, normalizeModelPerFrame };
}

describe('C4: drag frames against the pre-change lightweight resolver', () => {
  it('a move: every frame and the end match, and no frame normalises the 3D model', () => {
    const ids = ['r1', 'l1', 'l2'];
    const deltas = [
      { x: 1, y: 0 },
      { x: 5, y: -3 },
      { x: 40.5, y: 12.25 },
      { x: 0, y: 0 },
      { x: -7, y: 3 },
    ];
    const { normalizeModelPerFrame } = runDrag({
      start: (state) => {
        const selected = sketchStudioReducer(state, setSelection(ids));
        return sketchStudioReducer(
          selected,
          startTransform({
            type: 'move',
            copyMode: 'off',
            copiedEntityIds: [],
            pointerId: 1,
            startWorld: { x: 0, y: 0 },
            startAngle: 0,
            pivot: null,
            entityIds: ids,
            startEntities: selected.document.entities,
          }),
        );
      },
      frames: deltas.map(
        (delta) => (state) => translateEntities(state.interaction.transform.startEntities, ids, delta),
      ),
      end: endTransform,
    });
    expect(normalizeModelPerFrame).toBe(0);
  });

  it('a rotation of the variable-bound rect', () => {
    runDrag({
      start: (state) =>
        sketchStudioReducer(
          sketchStudioReducer(state, setSelection(['r3'])),
          startTransform({
            type: 'rotate',
            copyMode: 'off',
            copiedEntityIds: [],
            pointerId: 1,
            startWorld: { x: 0, y: 0 },
            startAngle: 0,
            pivot: { x: 305, y: 20 },
            entityIds: ['r3'],
            startEntities: state.document.entities,
          }),
        ),
      frames: [0.1, 0.4, Math.PI / 2, 0].map(
        (angle) => (state) =>
          rotateEntities(state.interaction.transform.startEntities, ['r3'], { x: 305, y: 20 }, angle),
      ),
      end: endTransform,
    });
  });

  it('a handle drag on a line end', () => {
    runDrag({
      start: (state) =>
        sketchStudioReducer(
          sketchStudioReducer(state, setSelection(['l1'])),
          startHandleDrag({ entityId: 'l1', handleId: 'end', pointerId: 1 }),
        ),
      frames: [
        { x: 210, y: 100 },
        { x: 250, y: 130 },
        { x: 200, y: 100 },
      ].map(
        (point) => (state) =>
          updateEntityInList(state.document.entities, 'l1', (entity) => updateEntityFromHandle(entity, 'end', point)),
      ),
      end: endHandleDrag,
    });
  });
});
