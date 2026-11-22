/**
 * Perf pass 3, C2: SYNC_POINTER keeps the state when neither the hover nor the
 * snap changed (the cursor itself travels on the cursor channel), and keeps an
 * equal snap object when only the hover changed.
 */

import { describe, expect, it } from 'vitest';
import sketchStudioReducer from './sketchStudioReducer';
import sketchStudioInitialState from './sketchStudioInitialState';
import { syncPointer } from './sketchStudioActions';
import { getEmptySnapState } from '../hooks/sketchConstants';

const snapAt = (x, y, extra = {}) => ({
  point: { x, y },
  sourceEntityId: 'a',
  entityType: 'line',
  sourceType: 'endpoint',
  sourceKey: 'start',
  snapType: 'endpoint',
  ...extra,
});

const move = (state, { hoveredId = null, snap = getEmptySnapState(), at = 1 } = {}) =>
  sketchStudioReducer(
    state,
    syncPointer({ screenPoint: { x: at, y: at }, worldPoint: { x: at * 2, y: at * 2 }, hoveredId, snap }),
  );

describe('SYNC_POINTER', () => {
  it('keeps the state for a move that changes neither the hover nor the snap', () => {
    const state = sketchStudioInitialState;
    expect(move(state, { at: 5 })).toBe(state);

    const snapped = move(state, { snap: snapAt(10, 20) });
    expect(snapped).not.toBe(state);
    expect(move(snapped, { snap: snapAt(10, 20), at: 9 })).toBe(snapped);
  });

  it('writes a hover change, keeping an equal snap object', () => {
    const state = move(sketchStudioInitialState, { snap: snapAt(10, 20) });
    const hovered = move(state, { hoveredId: 'a', snap: snapAt(10, 20), at: 7 });
    expect(hovered.hover.hoveredId).toBe('a');
    expect(hovered.snap).toBe(state.snap);
    expect(hovered.interaction.cursorWorld).toEqual({ x: 14, y: 14 });
  });

  it('writes any snap difference: the point, a field, a field present on one side only', () => {
    const state = move(sketchStudioInitialState, { snap: snapAt(10, 20) });
    for (const snap of [
      snapAt(10, 21),
      snapAt(10, 20, { snapType: 'midpoint' }),
      snapAt(10, 20, { secondaryEntityId: 'b' }),
      getEmptySnapState(),
    ]) {
      const next = move(state, { snap });
      expect(next).not.toBe(state);
      expect(next.snap).toBe(snap);
    }
  });
});
