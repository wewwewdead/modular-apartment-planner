import { describe, expect, it } from 'vitest';
import { getRectDraftPreviewPolygonPoints } from './draftPreviewUtils';

describe('draftPreviewUtils', () => {
  it('builds polygon points from draw-preview rects', () => {
    expect(getRectDraftPreviewPolygonPoints({
      type: 'rect',
      startPoint: { x: 100, y: 120 },
      endPoint: { x: 200, y: 180 },
    })).toEqual([
      { x: 100, y: 120 },
      { x: 200, y: 120 },
      { x: 200, y: 180 },
      { x: 100, y: 180 },
    ]);
  });

  it('builds polygon points from resolved rect entities', () => {
    expect(getRectDraftPreviewPolygonPoints({
      type: 'rect',
      x: 40,
      y: 60,
      width: 80,
      height: 30,
      rotation: 0,
    })).toEqual([
      { x: 40, y: 60 },
      { x: 120, y: 60 },
      { x: 120, y: 90 },
      { x: 40, y: 90 },
    ]);
  });

  it('supports rotated rect entity previews', () => {
    const points = getRectDraftPreviewPolygonPoints({
      type: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 30,
    });

    expect(points).toHaveLength(4);
    expect(points[0]).not.toEqual({ x: 0, y: 0 });
  });

  it('returns null for incomplete rect previews', () => {
    expect(getRectDraftPreviewPolygonPoints({ type: 'rect' })).toBeNull();
  });
});
