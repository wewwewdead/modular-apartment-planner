import { describe, expect, it } from 'vitest';
import { createBlankObjectDraft } from './genericObjectUtils';
import { createBlankSketchDocument } from './sketchDocumentUtils';
import {
  DEFAULT_SKETCH_UI,
  DEFAULT_SKETCH_VIEWPORT,
  deserializeSketchWorkspace,
  serializeSketchWorkspace,
} from './workspaceSerializationUtils';

describe('workspaceSerializationUtils', () => {
  it('round-trips a sketch workspace with an object draft', () => {
    const document = createBlankSketchDocument({ name: 'Desk Sketch' });
    const objectDraft = createBlankObjectDraft({
      document,
      existingObjects: [],
      name: 'Desk Base',
    });

    const serialized = serializeSketchWorkspace({
      document,
      objectDraft,
      viewport: { zoom: 1.5, panX: 24, panY: -12 },
      ui: {
        activeLayerId: 'default',
        snapEnabled: false,
        orthoEnabled: true,
        viewMode: 'isometric',
        isometricPlane: 'left',
      },
    }, {
      savedAt: '2026-03-22T00:00:00.000Z',
    });
    const deserialized = deserializeSketchWorkspace(serialized);

    expect(deserialized.document.name).toBe('Desk Sketch');
    expect(deserialized.objectDraft?.name).toBe('Desk Base');
    expect(deserialized.viewport).toEqual({ zoom: 1.5, panX: 24, panY: -12 });
    expect(deserialized.ui).toEqual({
      activeLayerId: 'default',
      snapEnabled: false,
      orthoEnabled: true,
      viewMode: 'isometric',
      isometricPlane: 'left',
    });
    expect(deserialized.savedAt).toBe('2026-03-22T00:00:00.000Z');
  });

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
