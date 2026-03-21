import { describe, expect, it } from 'vitest';
import { createLayer, getEditableEntities, getVisibleEntities, moveEntitiesToLayer, toggleLayerLock, toggleLayerVisibility } from './layerUtils';

describe('layerUtils', () => {
  const document = {
    layers: [
      { id: 'default', name: 'Default', visible: true, locked: false },
      { id: 'hidden', name: 'Hidden', visible: false, locked: false },
    ],
    entities: [
      { id: 'line-1', type: 'line', layerId: 'default', visible: true, locked: false },
      { id: 'line-2', type: 'line', layerId: 'hidden', visible: true, locked: false },
    ],
  };

  it('creates layers and filters visible/editable entities', () => {
    expect(createLayer(document.layers, 'Cut Parts').id).toBe('cut-parts');
    expect(getVisibleEntities(document).map((entity) => entity.id)).toEqual(['line-1']);
    expect(getEditableEntities(document).map((entity) => entity.id)).toEqual(['line-1']);
  });

  it('toggles lock and visibility', () => {
    expect(toggleLayerVisibility(document.layers, 'default')[0].visible).toBe(false);
    expect(toggleLayerLock(document.layers, 'default')[0].locked).toBe(true);
  });

  it('moves entities between layers', () => {
    expect(moveEntitiesToLayer(document.entities, ['line-1'], 'hidden')[0].layerId).toBe('hidden');
  });
});
