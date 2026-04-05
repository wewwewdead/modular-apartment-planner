import { describe, expect, it } from 'vitest';
import { getMaterialSelectionState } from './materialSelectionUtils';

describe('getMaterialSelectionState', () => {
  it('returns shared material values when the selection matches', () => {
    const entities = [
      { id: 'rect-1', materialId: 'plywood-birch-18', thickness: 18 },
      { id: 'rect-2', materialId: 'plywood-birch-18', thickness: 18 },
    ];

    expect(getMaterialSelectionState(entities, ['rect-1', 'rect-2'])).toEqual({
      selectionCount: 2,
      selectedMaterialId: 'plywood-birch-18',
      thickness: 18,
      isMixedMaterial: false,
      isMixedThickness: false,
    });
  });

  it('reports mixed material and thickness values across a selection', () => {
    const entities = [
      { id: 'rect-1', materialId: 'plywood-birch-18', thickness: 18 },
      { id: 'rect-2', materialId: 'mdf-primed-18', thickness: 12 },
    ];

    expect(getMaterialSelectionState(entities, ['rect-1', 'rect-2'])).toEqual({
      selectionCount: 2,
      selectedMaterialId: null,
      thickness: null,
      isMixedMaterial: true,
      isMixedThickness: true,
    });
  });
});
