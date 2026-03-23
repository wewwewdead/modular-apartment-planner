import { describe, expect, it } from 'vitest';
import { createBlankSketchDocument } from './sketchDocumentUtils';
import {
  DEFAULT_SKETCH_UI,
  DEFAULT_SKETCH_VIEWPORT,
  deserializeSketchWorkspace,
} from './workspaceSerializationUtils';

describe('workspaceSerializationUtils', () => {
  it('accepts a legacy bare document file', () => {
    const document = createBlankSketchDocument({ name: 'Legacy Sketch' });
    const deserialized = deserializeSketchWorkspace(JSON.stringify(document));

    expect(deserialized.document.name).toBe('Legacy Sketch');
    expect(deserialized.objectDraft).toBeNull();
    expect(deserialized.viewport).toEqual(DEFAULT_SKETCH_VIEWPORT);
    expect(deserialized.ui).toEqual({
      ...DEFAULT_SKETCH_UI,
      activeLayerId: 'default',
    });
  });

  it('rejects apartment planner project files', () => {
    expect(() => deserializeSketchWorkspace(JSON.stringify({
      name: 'Apartment Project',
      floors: [],
      sheets: [],
    }))).toThrow('apartment planner project');
  });
});
