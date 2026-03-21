import { describe, expect, it } from 'vitest';
import { entityIntersectsSelectionBox, getEntityIdsInSelectionBox, normalizeSelectionBox } from './selectionUtils';

describe('selectionUtils', () => {
  it('normalizes a marquee rectangle in any direction', () => {
    expect(normalizeSelectionBox({ x: 100, y: 90 }, { x: 40, y: 20 })).toMatchObject({
      x: 40,
      y: 20,
      width: 60,
      height: 70,
    });
  });

  it('detects entity intersection for line and rect', () => {
    const box = normalizeSelectionBox({ x: 0, y: 0 }, { x: 120, y: 80 });

    expect(entityIntersectsSelectionBox({ id: 'line-1', type: 'line', x1: 20, y1: 20, x2: 140, y2: 20 }, box, [])).toBe(true);
    expect(entityIntersectsSelectionBox({ id: 'rect-1', type: 'rect', x: 20, y: 20, width: 40, height: 30 }, box, [])).toBe(true);
  });

  it('returns selected ids from a marquee', () => {
    const entities = [
      { id: 'line-1', type: 'line', x1: 20, y1: 20, x2: 100, y2: 20, visible: true },
      { id: 'circle-1', type: 'circle', cx: 300, cy: 300, r: 40, visible: true },
    ];
    const box = normalizeSelectionBox({ x: 0, y: 0 }, { x: 120, y: 120 });

    expect(getEntityIdsInSelectionBox(entities, box)).toEqual(['line-1']);
  });
});
