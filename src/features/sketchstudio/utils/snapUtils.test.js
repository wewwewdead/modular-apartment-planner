import { describe, expect, it } from 'vitest';
import { collectSnapPointsFromEntities, findNearestSnapPoint, snapWorldPoint } from './snapUtils';

describe('snapUtils', () => {
  const entities = [
    { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, visible: true },
    { id: 'rect-1', type: 'rect', x: 50, y: 50, width: 40, height: 20, visible: true },
    { id: 'circle-1', type: 'circle', cx: 150, cy: 80, r: 20, visible: true },
  ];

  it('collects endpoints, corners, centers, and midpoints', () => {
    expect(collectSnapPointsFromEntities(entities)).toHaveLength(12);
  });

  it('finds the nearest snap point within tolerance', () => {
    const snapPoints = collectSnapPointsFromEntities(entities);
    const nearest = findNearestSnapPoint(snapPoints, { x: 52, y: 52 }, 5);

    expect(nearest).toMatchObject({ x: 50, y: 50, sourceEntityId: 'rect-1', sourceType: 'corner' });
  });

  it('returns null snap data when nothing is close enough', () => {
    expect(snapWorldPoint({ worldPoint: { x: 500, y: 500 }, entities, toleranceWorld: 5 })).toEqual({
      point: null,
      sourceEntityId: null,
      entityType: null,
      sourceType: null,
      sourceKey: null,
      snapType: null,
    });
  });

  it('collects ellipse snap points', () => {
    const ellipseSnaps = collectSnapPointsFromEntities([
      { id: 'ellipse-1', type: 'ellipse', cx: 100, cy: 100, rx: 40, ry: 20, rotation: 0, visible: true },
    ]);

    expect(ellipseSnaps).toHaveLength(5);
    expect(ellipseSnaps[0]).toMatchObject({ sourceType: 'center' });
  });

  it('falls back to isometric grid snapping when enabled', () => {
    const snap = snapWorldPoint({
      worldPoint: { x: 43, y: 24 },
      entities: [],
      toleranceWorld: 10,
      enabled: true,
      enableIsometricGrid: true,
      viewportZoom: 1,
    });

    expect(snap.snapType).toBe('grid');
    expect(snap.point).not.toBeNull();
  });
});
