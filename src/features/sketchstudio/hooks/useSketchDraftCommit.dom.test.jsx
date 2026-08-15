/* @vitest-environment jsdom */
/**
 * The precision HUD keeps focus while a value is typed, so the global Enter
 * binding is suppressed and `commitPrecisionDraft` is the only path that can
 * land the angle tool's typed value.
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getDraftPreviewEntity } from './sketchConstants';
import useSketchDraftCommit from './useSketchDraftCommit';

function buildAngleState(ui) {
  const draft = {
    type: 'angle',
    step: 'pickSecond',
    startPoint: null,
    currentPoint: { x: 500, y: 0 },
    points: [
      { x: 0, y: 1000 },
      { x: 0, y: 0 },
    ],
    sourceRefs: [],
    precisionInput: { angle: '90' },
  };

  return {
    document: {
      entities: [],
      layers: [
        { id: 'default', visible: true, locked: false },
        { id: 'dimensions', visible: true, locked: false },
      ],
      units: 'mm',
    },
    draft,
    ui: { activeLayerId: 'default', activeHardwareId: null, ...ui },
  };
}

function commitAngleDraft(ui) {
  const state = buildAngleState(ui);
  const dispatch = vi.fn();
  const draftPreview = getDraftPreviewEntity(state.draft, state.document, 'default', state.ui);
  const { result } = renderHook(() => useSketchDraftCommit(state, dispatch, draftPreview));

  result.current.commitPrecisionDraft();

  return { dispatch, draftPreview };
}

describe('useSketchDraftCommit', () => {
  it('commits the angle draft with the plane inferred from its rays', () => {
    const { dispatch, draftPreview } = commitAngleDraft({ viewMode: 'isometric', isometricPlane: 'top' });

    expect(dispatch).toHaveBeenCalledTimes(1);

    const entity = dispatch.mock.calls[0][0].payload;

    expect(entity.type).toBe('angle-dimension');
    expect(entity.layerId).toBe('dimensions');
    expect(entity.isometricPlane).toBe('right');
    expect(entity.p2.x).toBeCloseTo(draftPreview.p2.x, 6);
    expect(entity.p2.y).toBeCloseTo(draftPreview.p2.y, 6);
  });

  it('commits the angle draft in screen space while the plan view is active', () => {
    const { dispatch } = commitAngleDraft({ viewMode: 'plan', isometricPlane: 'top' });

    const entity = dispatch.mock.calls[0][0].payload;

    expect(entity.isometricPlane).toBeUndefined();
    expect(entity.p2.x).toBeCloseTo(500, 6);
    expect(entity.p2.y).toBeCloseTo(0, 6);
  });
});

describe('useSketchDraftCommit isometric provenance', () => {
  function commitLine(ui) {
    const state = {
      document: { entities: [], layers: [{ id: 'default', visible: true, locked: false }], units: 'mm' },
      draft: { type: 'line', startPoint: { x: 0, y: 0 }, currentPoint: { x: 100, y: 100 }, precisionInput: {} },
      ui: { activeLayerId: 'default', activeHardwareId: null, ...ui },
    };
    const dispatch = vi.fn();
    const { result } = renderHook(() => useSketchDraftCommit(state, dispatch, { x2: 100, y2: 100 }));

    result.current.commitPrecisionDraft();

    return dispatch.mock.calls[0][0].payload;
  }

  it('stamps the drawing plane on a typed line in isometric mode', () => {
    expect(commitLine({ viewMode: 'isometric', isometricPlane: 'right' }).meta.isometricPlane).toBe('right');
  });

  it('leaves a typed plan-mode line unstamped', () => {
    expect(commitLine({ viewMode: 'plan', isometricPlane: 'right' }).meta.isometricPlane).toBeUndefined();
  });
});
