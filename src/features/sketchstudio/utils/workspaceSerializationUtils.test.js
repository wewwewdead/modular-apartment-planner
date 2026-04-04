import { describe, expect, it } from 'vitest';
import { createBlankSketchDocument } from './sketchDocumentUtils';
import {
  DEFAULT_SKETCH_UI,
  DEFAULT_SKETCH_VIEWPORT,
  deserializeSketchWorkspace,
  serializeSketchWorkspace,
} from './workspaceSerializationUtils';

describe('workspaceSerializationUtils', () => {
  it('accepts a legacy bare document file', () => {
    const document = createBlankSketchDocument({ name: 'Legacy Sketch' });
    delete document.variables;
    delete document.joints;
    const deserialized = deserializeSketchWorkspace(JSON.stringify(document));

    expect(deserialized.document.name).toBe('Legacy Sketch');
    expect(deserialized.document.variables).toEqual([]);
    expect(deserialized.document.joints).toEqual([]);
    expect(deserialized.objectDraft).toBeNull();
    expect(deserialized.viewport).toEqual(DEFAULT_SKETCH_VIEWPORT);
    expect(deserialized.ui).toEqual({
      ...DEFAULT_SKETCH_UI,
      activeLayerId: 'default',
    });
  });

  it('rejects apartment planner project files', () => {
    expect(() =>
      deserializeSketchWorkspace(
        JSON.stringify({
          name: 'Apartment Project',
          floors: [],
          sheets: [],
        }),
      ),
    ).toThrow('apartment planner project');
  });

  it('roundtrips persisted joints through workspace save and open flows', () => {
    const document = createBlankSketchDocument({
      name: 'Joinery Workspace',
      entities: [
        {
          id: 'panel',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
        {
          id: 'back',
          type: 'rect',
          x: 50,
          y: -18,
          width: 100,
          height: 18,
          rotation: 0,
          thickness: 6,
          layerId: 'default',
          meta: {},
        },
      ],
      joints: [
        {
          id: 'joint-rabbet',
          type: 'rabbet',
          label: 'Back Panel Rabbet',
          enabled: true,
          primaryEntityId: 'panel',
          secondaryEntityId: 'back',
          primaryEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
          secondaryEdgeRef: { entityId: 'back', sourceType: 'segment', sourceKey: 'bottom' },
          parameters: {
            width: 100,
            depth: 9,
          },
        },
      ],
    });

    const serialized = serializeSketchWorkspace({
      document,
      viewport: { zoom: 1.5, panX: 25, panY: -10 },
      ui: { activeLayerId: 'default', craftsmanMode: true },
    }, {
      savedAt: '2026-04-05T00:00:00.000Z',
    });
    const deserialized = deserializeSketchWorkspace(serialized);

    expect(deserialized.document.joints).toHaveLength(1);
    expect(deserialized.document.joints[0]).toMatchObject({
      id: 'joint-rabbet',
      type: 'rabbet',
      primaryEntityId: 'panel',
      secondaryEntityId: 'back',
      parameters: {
        width: 100,
        depth: 9,
      },
    });
    expect(deserialized.ui.craftsmanMode).toBe(true);
    expect(deserialized.viewport).toEqual({ zoom: 1.5, panX: 25, panY: -10 });
  });
});
