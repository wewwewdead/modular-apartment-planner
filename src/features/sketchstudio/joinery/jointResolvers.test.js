import { describe, expect, it } from 'vitest';
import {
  buildJoineryEntityMap,
  getRectEdgeData,
  getRectPartBounds,
  resolveJoineryContext,
  isJoineryRectGenerationSupported,
} from './jointResolvers';
import { normalizeJoint } from './jointSerializationUtils';
import { JOINT_PLACEMENT_MODES } from './jointDefaults';

function makeRect(id, x, y, width, height, extras = {}) {
  return { id, type: 'rect', x, y, width, height, rotation: 0, ...extras };
}

describe('buildJoineryEntityMap', () => {
  it('builds a map from entity arrays', () => {
    const entities = [makeRect('r1', 0, 0, 100, 50), makeRect('r2', 100, 0, 100, 50)];
    const map = buildJoineryEntityMap(entities);
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);
    expect(map.get('r1').id).toBe('r1');
    expect(map.get('r2').id).toBe('r2');
  });

  it('handles empty and null input', () => {
    expect(buildJoineryEntityMap([]).size).toBe(0);
    expect(buildJoineryEntityMap().size).toBe(0);
    expect(buildJoineryEntityMap(null).size).toBe(0);
  });
});

describe('getRectEdgeData', () => {
  const rect = makeRect('r1', 0, 0, 100, 50);

  it('returns edge data for all four edges', () => {
    for (const edgeKey of ['top', 'right', 'bottom', 'left']) {
      const edge = getRectEdgeData(rect, edgeKey);
      expect(edge).not.toBeNull();
      expect(edge.edgeKey).toBe(edgeKey);
      expect(edge.length).toBeGreaterThan(0);
      expect(edge.tangent).toBeDefined();
      expect(edge.inwardNormal).toBeDefined();
      expect(edge.outwardNormal).toBeDefined();
      expect(edge.startPoint).toBeDefined();
      expect(edge.endPoint).toBeDefined();
      expect(edge.midpoint).toBeDefined();
    }
  });

  it('returns null for invalid edge key', () => {
    expect(getRectEdgeData(rect, 'front')).toBeNull();
    expect(getRectEdgeData(rect, undefined)).toBeNull();
  });

  it('returns null for non-rect entities', () => {
    const circle = { id: 'c1', type: 'circle', cx: 50, cy: 50, radius: 25 };
    expect(getRectEdgeData(circle, 'top')).toBeNull();
  });

  it('returns null for zero-dimension rects', () => {
    const zeroRect = makeRect('r0', 0, 0, 0, 50);
    expect(getRectEdgeData(zeroRect, 'top')).toBeNull();
  });

  it('reports correct edge lengths', () => {
    const topEdge = getRectEdgeData(rect, 'top');
    const rightEdge = getRectEdgeData(rect, 'right');
    expect(topEdge.length).toBe(100);
    expect(rightEdge.length).toBe(50);
  });

  it('handles rotated rects', () => {
    const rotated = makeRect('r1', 0, 0, 100, 50, { rotation: 45 });
    const edge = getRectEdgeData(rotated, 'top');
    expect(edge).not.toBeNull();
    expect(edge.length).toBeCloseTo(100, 0);
  });
});

describe('getRectPartBounds', () => {
  it('returns bounding box for unrotated rect', () => {
    const rect = makeRect('r1', 10, 20, 100, 50);
    const bounds = getRectPartBounds(rect);
    expect(bounds.minX).toBe(10);
    expect(bounds.minY).toBe(20);
    expect(bounds.maxX).toBe(110);
    expect(bounds.maxY).toBe(70);
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(50);
  });

  it('returns expanded bounding box for rotated rect', () => {
    const rect = makeRect('r1', 0, 0, 100, 0.01, { rotation: 45 });
    const bounds = getRectPartBounds(rect);
    // A 100-wide rect rotated 45 degrees should have wider bounds than unrotated
    expect(bounds.width).toBeGreaterThan(50);
  });
});

describe('isJoineryRectGenerationSupported', () => {
  it('returns true for valid rects', () => {
    expect(isJoineryRectGenerationSupported(makeRect('r1', 0, 0, 100, 50))).toBeTruthy();
  });

  it('returns false for circles', () => {
    expect(isJoineryRectGenerationSupported({ id: 'c1', type: 'circle', cx: 0, cy: 0, radius: 10 })).toBeFalsy();
  });

  it('returns false for zero-dimension rects', () => {
    expect(isJoineryRectGenerationSupported(makeRect('r1', 0, 0, 0, 50))).toBeFalsy();
    expect(isJoineryRectGenerationSupported(makeRect('r1', 0, 0, 100, 0))).toBeFalsy();
  });
});

describe('resolveJoineryContext', () => {
  const rectA = makeRect('r1', 0, 0, 100, 50, { thickness: 18 });
  const rectB = makeRect('r2', 100, 0, 100, 50, { thickness: 18 });

  function makeJoint(overrides = {}) {
    return normalizeJoint({
      type: 'butt',
      sourcePartId: 'r1',
      targetPartId: 'r2',
      placementMode: JOINT_PLACEMENT_MODES.AUTO_CONTACT,
      ...overrides,
    });
  }

  it('resolves context for two touching rects', () => {
    const joint = makeJoint();
    const map = buildJoineryEntityMap([rectA, rectB]);
    const ctx = resolveJoineryContext(joint, map);
    expect(ctx.error).toBeUndefined();
    expect(ctx.sourcePart.id).toBe('r1');
    expect(ctx.targetPart.id).toBe('r2');
    expect(ctx.overlap).toBeDefined();
    expect(ctx.overlap.length).toBeGreaterThan(0);
    expect(ctx.sourceEdge).toBeDefined();
    expect(ctx.targetEdge).toBeDefined();
    expect(ctx.sourceThickness).toBe(18);
    expect(ctx.targetThickness).toBe(18);
  });

  it('returns error for missing entity references', () => {
    const joint = makeJoint({ sourcePartId: 'missing', targetPartId: 'also-missing' });
    const map = buildJoineryEntityMap([rectA, rectB]);
    const ctx = resolveJoineryContext(joint, map);
    expect(ctx.error).toBeDefined();
    expect(ctx.code).toBe('missing_part');
  });

  it('returns error when source and target are the same part', () => {
    const joint = makeJoint({ sourcePartId: 'r1', targetPartId: 'r1' });
    const map = buildJoineryEntityMap([rectA, rectB]);
    const ctx = resolveJoineryContext(joint, map);
    expect(ctx.error).toBeDefined();
    expect(ctx.code).toBe('same_part');
  });

  it('returns error for non-rect entities', () => {
    const circle = { id: 'c1', type: 'circle', cx: 50, cy: 50, radius: 25 };
    const joint = makeJoint({ sourcePartId: 'c1', targetPartId: 'r2' });
    const map = buildJoineryEntityMap([circle, rectB]);
    const ctx = resolveJoineryContext(joint, map);
    expect(ctx.error).toBeDefined();
    expect(ctx.code).toBe('unsupported_geometry');
  });

  it('returns error for non-overlapping rects with auto-contact', () => {
    const farRect = makeRect('r3', 500, 500, 100, 50, { thickness: 18 });
    const joint = makeJoint({ sourcePartId: 'r1', targetPartId: 'r3' });
    const map = buildJoineryEntityMap([rectA, farRect]);
    const ctx = resolveJoineryContext(joint, map);
    expect(ctx.error).toBeDefined();
  });

  it('accepts an array of entities instead of a map', () => {
    const joint = makeJoint();
    const ctx = resolveJoineryContext(joint, [rectA, rectB]);
    expect(ctx.error).toBeUndefined();
    expect(ctx.sourcePart.id).toBe('r1');
  });

  it('reports missing thickness when parts lack thickness', () => {
    const thinA = makeRect('r1', 0, 0, 100, 50);
    const thinB = makeRect('r2', 100, 0, 100, 50);
    const joint = makeJoint();
    const ctx = resolveJoineryContext(joint, [thinA, thinB]);
    expect(ctx.error).toBeUndefined();
    expect(ctx.fabricationReady).toBe(false);
    expect(ctx.missingThicknessPartIds).toContain('r1');
    expect(ctx.missingThicknessPartIds).toContain('r2');
  });
});
