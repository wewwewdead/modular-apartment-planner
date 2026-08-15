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
      grainAngle: null,
      isMixedMaterial: false,
      isMixedThickness: false,
      isMixedGrainAngle: false,
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
      grainAngle: null,
      isMixedMaterial: true,
      isMixedThickness: true,
      isMixedGrainAngle: false,
    });
  });

  it('shares a grain angle only when every selected part agrees on the axis', () => {
    const entities = [
      { id: 'rect-1', materialId: 'birch-plywood-18', thickness: 18, grainAngle: 0 },
      // 180 is the same fibre axis as 0, so this is NOT a mixed selection.
      { id: 'rect-2', materialId: 'birch-plywood-18', thickness: 18, grainAngle: 180 },
    ];

    const state = getMaterialSelectionState(entities, ['rect-1', 'rect-2']);
    expect(state.grainAngle).toBe(0);
    expect(state.isMixedGrainAngle).toBe(false);
  });

  it('reports a mixed grain angle across differently oriented parts', () => {
    const entities = [
      { id: 'rect-1', materialId: 'birch-plywood-18', thickness: 18, grainAngle: 0 },
      { id: 'rect-2', materialId: 'birch-plywood-18', thickness: 18, grainAngle: 90 },
    ];

    const state = getMaterialSelectionState(entities, ['rect-1', 'rect-2']);
    expect(state.grainAngle).toBeNull();
    expect(state.isMixedGrainAngle).toBe(true);
  });
});
