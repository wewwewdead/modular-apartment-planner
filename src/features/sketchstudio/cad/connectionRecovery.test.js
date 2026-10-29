import { describe, expect, it } from 'vitest';
import { emptyModel, removeInstance, validateReferences } from './model.js';
import { createBlankSketchDocument } from '../utils/sketchDocumentUtils.js';
import { deserializeSketchWorkspace, serializeSketchWorkspace } from '../utils/workspaceSerializationUtils.js';
import sketchStudioReducer from '../store/sketchStudioReducer.js';
import initialState from '../store/sketchStudioInitialState.js';

function fixture() {
  return {
    ...emptyModel(),
    parts: [{ id: 'part', name: 'Plate', features: [{ id: 'box', type: 'box', width: 100, depth: 100, height: 10 }] }],
    instances: ['a', 'b', 'c'].map((id, index) => ({
      id,
      partId: 'part',
      position: [index * 100, 0, 0],
      rotation: [0, 0, 0],
    })),
    connections: [
      { id: 'outgoing', type: 'fixed', from: 'a', to: 'b', offset: [0, 0, 10] },
      { id: 'incoming', type: 'weld', from: 'c', to: 'a' },
      { id: 'valid', type: 'weld', from: 'b', to: 'c' },
    ],
  };
}

describe('connection recovery', () => {
  it.each(['workspace', 'bare document'])(
    'reopens a saved %s with orphaned links and preserves the remaining model',
    (format) => {
      const model = fixture();
      // Reproduce an older save: the instance was removed without its connections.
      model.instances = model.instances.filter((instance) => instance.id !== 'a');
      const document = { ...createBlankSketchDocument(), model };
      const input = format === 'workspace' ? { kind: 'sketchstudio-workspace', version: 2, document } : document;
      const before = JSON.stringify(input);
      const reopened = deserializeSketchWorkspace(before);
      expect(reopened.document.model).toEqual({ ...model, connections: [model.connections[2]] });
      expect(validateReferences(reopened.document.model)).toEqual([]);
      expect(deserializeSketchWorkspace(serializeSketchWorkspace(reopened)).document.model).toEqual(
        reopened.document.model,
      );
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it('removes incoming and outgoing connections with the instance and restores them on undo', () => {
    const model = fixture();
    model.sheets[0].instanceIds = ['a', 'b'];
    model.sheets[0].annotations = [
      { id: 'removed', type: 'note', instanceId: 'a', text: 'A' },
      { id: 'kept', type: 'note', text: 'Assembly note' },
    ];
    const before = JSON.stringify(model);
    const removed = removeInstance(model, 'a');
    expect(removed.instances.map((instance) => instance.id)).toEqual(['b', 'c']);
    expect(removed.connections).toEqual([model.connections[2]]);
    expect(removed.parts).toEqual(model.parts);
    expect(removed.sheets[0].instanceIds).toEqual(['b']);
    expect(removed.sheets[0].annotations).toEqual([model.sheets[0].annotations[1]]);
    expect(validateReferences(removed)).toEqual([]);
    expect(JSON.stringify(model)).toBe(before);
    const state = sketchStudioReducer(initialState, { type: 'SET_CAD_MODEL', payload: model });
    const deleted = sketchStudioReducer(state, { type: 'SET_CAD_MODEL', payload: removed });
    const undone = sketchStudioReducer(deleted, { type: 'UNDO' });
    expect(undone.document.model).toEqual(model);
    expect(sketchStudioReducer(undone, { type: 'REDO' }).document.model).toEqual(removed);
  });

  it('still reports unrelated broken references instead of discarding parts', () => {
    const model = fixture();
    model.instances[0].partId = 'missing-part';
    const reopened = deserializeSketchWorkspace(JSON.stringify({ ...createBlankSketchDocument(), model }));
    expect(reopened.document.model).toEqual(model);
    expect(validateReferences(reopened.document.model)).toContainEqual({
      instanceId: 'a',
      message: 'Broken part reference: missing-part',
    });
  });
});
