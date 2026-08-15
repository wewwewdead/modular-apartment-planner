import { describe, expect, it } from 'vitest';
import { buildTrimPath, computeSketchTrim, getPathParameter, isTrimmableEntity, resolveTrimSpans } from './trimUtils';

function line(id, x1, y1, x2, y2, extra = {}) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta: {}, ...extra };
}

function circle(id, cx, cy, r) {
  return { id, type: 'circle', cx, cy, r, layerId: 'default', visible: true, meta: {} };
}

function arc(id, start, control, end) {
  return { id, type: 'arc', start, control, end, layerId: 'default', visible: true, meta: {} };
}

function polyline(id, points, closed = false) {
  return { id, type: 'polyline', points, closed, layerId: 'default', visible: true, meta: {} };
}

function rect(id, x, y, width, height) {
  return { id, type: 'rect', x, y, width, height, rotation: 0, layerId: 'default', visible: true, meta: {} };
}

function distanceFromCircle(point, cx, cy) {
  return Math.hypot(point.x - cx, point.y - cy);
}

describe('trimUtils entity support', () => {
  it('accepts the five trimmable primitives and nothing else', () => {
    expect(isTrimmableEntity(line('a', 0, 0, 1, 1))).toBe(true);
    expect(isTrimmableEntity(circle('c', 0, 0, 5))).toBe(true);
    expect(isTrimmableEntity(arc('r', { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }))).toBe(true);
    expect(
      isTrimmableEntity(
        polyline('p', [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ]),
      ),
    ).toBe(true);
    expect(isTrimmableEntity(rect('r1', 0, 0, 10, 10))).toBe(true);
    expect(isTrimmableEntity({ type: 'text' })).toBe(false);
    expect(isTrimmableEntity({ type: 'dimension' })).toBe(false);
    expect(buildTrimPath({ type: 'text' })).toBeNull();
  });
});

describe('trimUtils line', () => {
  const target = line('target', 0, 0, 1000, 0);

  it('splits a line into two when cuts bracket the click', () => {
    const entities = [target, line('cut-1', 250, -50, 250, 50), line('cut-2', 750, -50, 750, 50)];
    const result = computeSketchTrim(entities, target, { x: 500, y: 0 });

    expect(result.removedIds).toEqual(['target']);
    expect(result.addedEntities).toHaveLength(2);
    expect(result.addedEntities.every((entity) => entity.type === 'line')).toBe(true);
    expect(result.addedEntities[0].x1).toBeCloseTo(0, 6);
    expect(result.addedEntities[0].x2).toBeCloseTo(250, 6);
    expect(result.addedEntities[1].x1).toBeCloseTo(750, 6);
    expect(result.addedEntities[1].x2).toBeCloseTo(1000, 6);
    expect(result.deletesEntity).toBe(false);
  });

  it('leaves a single piece when only one cut is on the clicked side', () => {
    const entities = [target, line('cut-1', 250, -50, 250, 50)];
    const result = computeSketchTrim(entities, target, { x: 500, y: 0 });

    expect(result.addedEntities).toHaveLength(1);
    expect(result.addedEntities[0].x1).toBeCloseTo(0, 6);
    expect(result.addedEntities[0].x2).toBeCloseTo(250, 6);
  });

  it('keeps the far piece when the click sits before the only cut', () => {
    const entities = [target, line('cut-1', 250, -50, 250, 50)];
    const result = computeSketchTrim(entities, target, { x: 100, y: 0 });

    expect(result.addedEntities).toHaveLength(1);
    expect(result.addedEntities[0].x1).toBeCloseTo(250, 6);
    expect(result.addedEntities[0].x2).toBeCloseTo(1000, 6);
  });

  it('deletes the whole line when nothing crosses it', () => {
    const entities = [target, line('miss', 250, 300, 250, 400)];
    const result = computeSketchTrim(entities, target, { x: 500, y: 0 });

    expect(result.addedEntities).toEqual([]);
    expect(result.deletesEntity).toBe(true);
    expect(result.entities.some((entity) => entity.id === 'target')).toBe(false);
  });

  it('carries layer, material, thickness, and meta onto every piece', () => {
    const styled = line('target', 0, 0, 1000, 0, {
      layerId: 'walls',
      materialId: 'ply-18',
      thickness: 18,
      meta: { groupId: 'group-1', lineStyle: 'broken' },
    });
    const entities = [styled, line('cut-1', 250, -50, 250, 50), line('cut-2', 750, -50, 750, 50)];
    const result = computeSketchTrim(entities, styled, { x: 500, y: 0 });

    result.addedEntities.forEach((piece) => {
      expect(piece.layerId).toBe('walls');
      expect(piece.materialId).toBe('ply-18');
      expect(piece.thickness).toBe(18);
      expect(piece.meta.groupId).toBe('group-1');
      expect(piece.meta.lineStyle).toBe('broken');
    });
  });

  it('gives every piece a fresh unique id', () => {
    const entities = [target, line('cut-1', 250, -50, 250, 50), line('cut-2', 750, -50, 750, 50)];
    const result = computeSketchTrim(entities, target, { x: 500, y: 0 });
    const ids = result.entities.map((entity) => entity.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('target');
  });

  it('works at apartment scale', () => {
    const wall = line('wall', 1000, 4000, 9000, 4000);
    const entities = [wall, line('cut-1', 3000, 3000, 3000, 5000), line('cut-2', 6000, 3000, 6000, 5000)];
    const result = computeSketchTrim(entities, wall, { x: 4500, y: 4000 });

    expect(result.addedEntities).toHaveLength(2);
    expect(result.addedEntities[0].x2).toBeCloseTo(3000, 6);
    expect(result.addedEntities[1].x1).toBeCloseTo(6000, 6);
  });
});

describe('trimUtils circle', () => {
  it('turns a circle into arcs when the clicked span is removed', () => {
    const target = circle('target', 0, 0, 100);
    const entities = [target, line('cut', 0, -200, 0, 200)];
    const result = computeSketchTrim(entities, target, { x: 100, y: 0 });

    expect(result.removedIds).toEqual(['target']);
    expect(result.addedEntities.every((entity) => entity.type === 'arc')).toBe(true);
    // 180 degrees survive, and a quadratic Bezier cannot carry more than a
    // quarter turn faithfully, so the remainder is split into two arcs.
    expect(result.addedEntities).toHaveLength(2);
    result.addedEntities.forEach((piece) => {
      expect(distanceFromCircle(piece.start, 0, 0)).toBeCloseTo(100, 6);
      expect(distanceFromCircle(piece.end, 0, 0)).toBeCloseTo(100, 6);
      expect(piece.start.x).toBeLessThanOrEqual(1e-6);
      expect(piece.end.x).toBeLessThanOrEqual(1e-6);
    });
  });

  it('emits a single arc when the survivor is a quarter turn or less', () => {
    const target = circle('target', 0, 0, 100);
    const entities = [
      target,
      // Tangent at 0 degrees.
      line('tangent', 100, -50, 100, 50),
      // Radial cut that only reaches the circle at 80 degrees.
      line('radial', 0, 0, 200 * Math.cos((80 * Math.PI) / 180), 200 * Math.sin((80 * Math.PI) / 180)),
    ];
    const result = computeSketchTrim(entities, target, { x: -100, y: 0 });

    expect(result.addedEntities).toHaveLength(1);
    const piece = result.addedEntities[0];
    expect(piece.type).toBe('arc');
    expect(distanceFromCircle(piece.start, 0, 0)).toBeCloseTo(100, 4);
    expect(distanceFromCircle(piece.end, 0, 0)).toBeCloseTo(100, 4);
    // The Bezier midpoint is placed to land exactly on the original circle.
    const midpoint = {
      x: (piece.start.x + 2 * piece.control.x + piece.end.x) / 4,
      y: (piece.start.y + 2 * piece.control.y + piece.end.y) / 4,
    };
    expect(distanceFromCircle(midpoint, 0, 0)).toBeCloseTo(100, 4);
  });

  it('deletes a circle that only has one intersection', () => {
    const target = circle('target', 0, 0, 100);
    const entities = [target, line('tangent', 100, -50, 100, 50)];
    const result = computeSketchTrim(entities, target, { x: -100, y: 0 });

    expect(result.addedEntities).toEqual([]);
    expect(result.deletesEntity).toBe(true);
  });

  it('deletes an uncut circle', () => {
    const target = circle('target', 0, 0, 100);
    const result = computeSketchTrim([target], target, { x: 100, y: 0 });

    expect(result.deletesEntity).toBe(true);
  });
});

describe('trimUtils arc', () => {
  const target = arc('target', { x: -100, y: 0 }, { x: 0, y: -200 }, { x: 100, y: 0 });

  it('splits an arc into two arcs', () => {
    const entities = [target, line('cut-1', -50, -200, -50, 200), line('cut-2', 50, -200, 50, 200)];
    const result = computeSketchTrim(entities, target, { x: 0, y: -100 });

    expect(result.addedEntities).toHaveLength(2);
    expect(result.addedEntities.every((entity) => entity.type === 'arc')).toBe(true);
    expect(result.addedEntities[0].start).toEqual({ x: -100, y: 0 });
    expect(result.addedEntities[0].end.x).toBeCloseTo(-50, 6);
    expect(result.addedEntities[1].start.x).toBeCloseTo(50, 6);
    expect(result.addedEntities[1].end).toEqual({ x: 100, y: 0 });
  });

  it('keeps one arc when only one side is cut', () => {
    const entities = [target, line('cut-1', -50, -200, -50, 200)];
    const result = computeSketchTrim(entities, target, { x: 0, y: -100 });

    expect(result.addedEntities).toHaveLength(1);
    expect(result.addedEntities[0].end.x).toBeCloseTo(-50, 6);
  });

  it('keeps the trimmed arc on the original curve', () => {
    const entities = [target, line('cut-1', -50, -200, -50, 200)];
    const piece = computeSketchTrim(entities, target, { x: 0, y: -100 }).addedEntities[0];
    // A sub-Bezier over [0, 0.25] traces exactly the same parabola.
    const midpoint = {
      x: (piece.start.x + 2 * piece.control.x + piece.end.x) / 4,
      y: (piece.start.y + 2 * piece.control.y + piece.end.y) / 4,
    };
    const original = (t) => ({ x: 100 * (2 * t - 1), y: -400 * t * (1 - t) });

    expect(midpoint.x).toBeCloseTo(original(0.125).x, 6);
    expect(midpoint.y).toBeCloseTo(original(0.125).y, 6);
  });

  it('deletes an uncut arc', () => {
    expect(computeSketchTrim([target], target, { x: 0, y: -100 }).deletesEntity).toBe(true);
  });
});

describe('trimUtils polyline', () => {
  it('splits an open polyline into two polylines', () => {
    const target = polyline('target', [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ]);
    const entities = [target, line('cut', -50, 50, 150, 50)];
    const result = computeSketchTrim(entities, target, { x: 50, y: 100 });

    expect(result.addedEntities).toHaveLength(2);
    expect(result.addedEntities.every((entity) => entity.type === 'polyline')).toBe(true);
    expect(result.addedEntities[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
    ]);
    expect(result.addedEntities[1].points[0].y).toBeCloseTo(50, 6);
    expect(result.addedEntities[1].points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(result.addedEntities.every((entity) => entity.closed === false)).toBe(true);
  });

  it('opens a closed polyline into a single run', () => {
    const target = polyline(
      'target',
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    const entities = [target, line('cut', -50, 50, 150, 50)];
    const result = computeSketchTrim(entities, target, { x: 50, y: 100 });

    expect(result.addedEntities).toHaveLength(1);
    expect(result.addedEntities[0].type).toBe('polyline');
    expect(result.addedEntities[0].closed).toBe(false);
    expect(result.addedEntities[0].points).toEqual([
      { x: 0, y: 50 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('deletes a closed polyline that only has one intersection', () => {
    const target = polyline(
      'target',
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    const entities = [target, line('cut', 50, 50, 50, -100)];
    const result = computeSketchTrim(entities, target, { x: 50, y: 100 });

    expect(result.addedEntities).toEqual([]);
    expect(result.deletesEntity).toBe(true);
  });
});

describe('trimUtils rect', () => {
  const target = rect('target', 0, 0, 100, 100);

  it('converts the rect to an open polyline once a span is actually removed', () => {
    const entities = [target, line('cut', -50, 50, 150, 50)];
    const result = computeSketchTrim(entities, target, { x: 50, y: 100 });

    expect(result.removedIds).toEqual(['target']);
    expect(result.addedEntities).toHaveLength(1);
    expect(result.addedEntities[0].type).toBe('polyline');
    expect(result.addedEntities[0].closed).toBe(false);
    expect(result.addedEntities[0].points).toEqual([
      { x: 0, y: 50 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(result.entities.some((entity) => entity.type === 'rect')).toBe(false);
  });

  it('deletes an uncut rect instead of converting it to a polyline', () => {
    const result = computeSketchTrim([target], target, { x: 50, y: 0 });

    expect(result.addedEntities).toEqual([]);
    expect(result.deletesEntity).toBe(true);
    expect(result.entities.some((entity) => entity.type === 'polyline')).toBe(false);
  });

  it('deletes a rect with a single intersection rather than converting it', () => {
    const entities = [target, line('cut', 50, 50, 50, -100)];
    const result = computeSketchTrim(entities, target, { x: 50, y: 100 });

    expect(result.deletesEntity).toBe(true);
    expect(result.entities.some((entity) => entity.type === 'polyline')).toBe(false);
  });
});

describe('trimUtils span resolution', () => {
  it('reports the doomed span for the hover preview', () => {
    const target = line('target', 0, 0, 1000, 0);
    const entities = [target, line('cut-1', 250, -50, 250, 50), line('cut-2', 750, -50, 750, 50)];
    const result = computeSketchTrim(entities, target, { x: 500, y: 0 });

    expect(result.removedSpanPoints[0].x).toBeCloseTo(250, 6);
    expect(result.removedSpanPoints.at(-1).x).toBeCloseTo(750, 6);
  });

  it('maps a point on the path back to its parameter', () => {
    const path = buildTrimPath(
      polyline('p', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    );

    expect(getPathParameter(path, { x: 50, y: 0 })).toBeCloseTo(0.5, 9);
    expect(getPathParameter(path, { x: 100, y: 25 })).toBeCloseTo(1.25, 9);
  });

  it('removes the whole open path when it has no cuts', () => {
    const path = buildTrimPath(line('l', 0, 0, 100, 0));
    const spans = resolveTrimSpans(path, [], 0.5);

    expect(spans.kept).toEqual([]);
    expect(spans.removed).toEqual({ start: 0, length: 1 });
  });

  it('ignores cuts that land exactly on an open path end', () => {
    const path = buildTrimPath(line('l', 0, 0, 100, 0));
    const spans = resolveTrimSpans(path, [0, 1], 0.5);

    expect(spans.kept).toEqual([]);
  });
});
