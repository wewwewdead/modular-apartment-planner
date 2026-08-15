import { describe, expect, it } from 'vitest';
import {
  ARC_FLATTEN_TOLERANCE,
  collectEntityIntersections,
  createBezierCurve,
  createCircleCurve,
  createSegmentCurve,
  dedupeIntersectionPoints,
  flattenCurveToPoints,
  getEntityCurves,
  intersectCurves,
  intersectEntities,
} from './intersectionUtils';

function line(id, x1, y1, x2, y2) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', meta: {} };
}

function circle(id, cx, cy, r) {
  return { id, type: 'circle', cx, cy, r, layerId: 'default', meta: {} };
}

function arc(id, start, control, end) {
  return { id, type: 'arc', start, control, end, layerId: 'default', meta: {} };
}

function polyline(id, points, closed = false) {
  return { id, type: 'polyline', points, closed, layerId: 'default', meta: {} };
}

function rect(id, x, y, width, height, rotation = 0) {
  return { id, type: 'rect', x, y, width, height, rotation, layerId: 'default', meta: {} };
}

function sortPoints(points) {
  return [...points].sort((left, right) => left.x - right.x || left.y - right.y);
}

describe('intersectionUtils segment x segment', () => {
  it('finds the crossing of two segments', () => {
    const points = intersectEntities(line('a', 0, 0, 100, 100), line('b', 0, 100, 100, 0));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(50, 9);
    expect(points[0].y).toBeCloseTo(50, 9);
  });

  it('finds a crossing at apartment scale', () => {
    const points = intersectEntities(line('a', 1000, 4500, 9000, 4500), line('b', 6250, 1200, 6250, 8800));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(6250, 6);
    expect(points[0].y).toBeCloseTo(4500, 6);
  });

  it('reports a shared endpoint of two non-parallel segments', () => {
    const points = intersectEntities(line('a', 0, 0, 100, 0), line('b', 100, 0, 100, 100));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(100, 9);
    expect(points[0].y).toBeCloseTo(0, 9);
  });

  it('reports nothing for segments that miss each other', () => {
    expect(intersectEntities(line('a', 0, 0, 10, 0), line('b', 50, -50, 50, 50))).toEqual([]);
  });

  it('reports nothing for parallel segments', () => {
    expect(intersectEntities(line('a', 0, 0, 100, 0), line('b', 0, 25, 100, 25))).toEqual([]);
  });

  it('reports nothing for collinear segments that overlap', () => {
    // Documented policy: an overlap is an infinite point set, never a cut.
    expect(intersectEntities(line('a', 0, 0, 100, 0), line('b', 50, 0, 150, 0))).toEqual([]);
  });

  it('reports nothing for collinear segments that touch end to end', () => {
    expect(intersectEntities(line('a', 0, 0, 100, 0), line('b', 100, 0, 200, 0))).toEqual([]);
  });

  it('reports nothing for a degenerate zero-length segment', () => {
    expect(intersectEntities(line('a', 40, 40, 40, 40), line('b', 0, 40, 100, 40))).toEqual([]);
  });
});

describe('intersectionUtils segment x circle', () => {
  it('finds both crossings of a secant line', () => {
    const points = sortPoints(intersectEntities(line('a', -200, 0, 200, 0), circle('c', 0, 0, 100)));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-100, 9);
    expect(points[1].x).toBeCloseTo(100, 9);
  });

  it('reports a single point for a tangent line', () => {
    const points = intersectEntities(line('a', -200, 100, 200, 100), circle('c', 0, 0, 100));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(0, 6);
    expect(points[0].y).toBeCloseTo(100, 9);
  });

  it('reports a single point for a tangent line at apartment scale', () => {
    const points = intersectEntities(line('a', 0, 7400, 12000, 7400), circle('c', 5000, 4000, 3400));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(5000, 3);
  });

  it('clips crossings to the segment it was given', () => {
    const points = intersectEntities(line('a', 0, 0, 200, 0), circle('c', 0, 0, 100));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(100, 9);
  });

  it('reports nothing when the line misses the circle', () => {
    expect(intersectEntities(line('a', -200, 500, 200, 500), circle('c', 0, 0, 100))).toEqual([]);
  });
});

describe('intersectionUtils circle x circle', () => {
  it('finds both crossings of overlapping circles', () => {
    const points = sortPoints(intersectEntities(circle('a', 0, 0, 100), circle('b', 120, 0, 100)));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(60, 9);
    expect(points[1].x).toBeCloseTo(60, 9);
    expect(Math.abs(points[0].y)).toBeCloseTo(80, 9);
    expect(points[0].y).toBeCloseTo(-points[1].y, 9);
  });

  it('reports a single point for externally tangent circles', () => {
    const points = intersectEntities(circle('a', 0, 0, 100), circle('b', 200, 0, 100));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(100, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
  });

  it('reports a single point for internally tangent circles', () => {
    const points = intersectEntities(circle('a', 0, 0, 100), circle('b', 50, 0, 50));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(100, 6);
  });

  it('reports nothing for concentric circles of different radii', () => {
    expect(intersectEntities(circle('a', 3000, 3000, 500), circle('b', 3000, 3000, 900))).toEqual([]);
  });

  it('reports nothing for identical concentric circles', () => {
    expect(intersectEntities(circle('a', 0, 0, 500), circle('b', 0, 0, 500))).toEqual([]);
  });

  it('reports nothing for separated circles', () => {
    expect(intersectEntities(circle('a', 0, 0, 100), circle('b', 900, 0, 100))).toEqual([]);
  });
});

describe('intersectionUtils arcs', () => {
  const symmetricArc = arc('arc-1', { x: -100, y: 0 }, { x: 0, y: -200 }, { x: 100, y: 0 });

  it('finds both crossings of a line through an arc', () => {
    const points = sortPoints(intersectEntities(line('a', -200, -50, 200, -50), symmetricArc));

    expect(points).toHaveLength(2);
    // The Bézier is exact here: y = -50 at t where 2t(1-t)*(-200) = -50.
    points.forEach((point) => expect(point.y).toBeCloseTo(-50, 9));
    expect(points[0].x).toBeCloseTo(-points[1].x, 9);
  });

  it('reports one point where a line is tangent to the arc apex', () => {
    const points = intersectEntities(line('a', -200, -100, 200, -100), symmetricArc);

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(0, 6);
    expect(points[0].y).toBeCloseTo(-100, 9);
  });

  it('reports nothing when a line clears the arc', () => {
    expect(intersectEntities(line('a', -200, -150, 200, -150), symmetricArc)).toEqual([]);
  });

  it('clips arc crossings to the line segment', () => {
    const points = intersectEntities(line('a', 0, -50, 200, -50), symmetricArc);

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeGreaterThan(0);
  });

  it('finds arc-to-circle crossings within the documented tolerance', () => {
    const bigArc = arc('arc-2', { x: -400, y: 0 }, { x: 0, y: -800 }, { x: 400, y: 0 });
    const points = intersectEntities(bigArc, circle('c', 0, -400, 100));

    expect(points).toHaveLength(2);
    points.forEach((point) => {
      expect(Math.hypot(point.x, point.y + 400)).toBeCloseTo(100, 6);
    });
  });

  it('finds arc-to-arc crossings', () => {
    const up = arc('arc-3', { x: -100, y: 0 }, { x: 0, y: -200 }, { x: 100, y: 0 });
    const down = arc('arc-4', { x: -100, y: -100 }, { x: 0, y: 100 }, { x: 100, y: -100 });
    const points = sortPoints(intersectEntities(up, down));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-points[1].x, 6);
  });

  it('finds arc crossings at apartment scale', () => {
    const spanningArc = arc('arc-5', { x: 1000, y: 5000 }, { x: 5000, y: -1000 }, { x: 9000, y: 5000 });
    const points = sortPoints(intersectEntities(line('a', 0, 3000, 12000, 3000), spanningArc));

    expect(points).toHaveLength(2);
    points.forEach((point) => expect(point.y).toBeCloseTo(3000, 6));
    expect(points[0].x).toBeCloseTo(10000 - points[1].x, 6);
  });

  it('flattens an arc no further than the documented chord tolerance', () => {
    const curve = createBezierCurve({ x: -400, y: 0 }, { x: 0, y: -800 }, { x: 400, y: 0 });
    const points = flattenCurveToPoints(curve, ARC_FLATTEN_TOLERANCE);

    expect(points.length).toBeGreaterThan(4);
    expect(points[0]).toEqual({ x: -400, y: 0 });
    expect(points.at(-1)).toEqual({ x: 400, y: 0 });
  });
});

describe('intersectionUtils entity coverage', () => {
  it('cuts a polyline at every segment it crosses', () => {
    const path = polyline('p', [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ]);
    const points = sortPoints(intersectEntities(path, line('a', -50, 50, 150, 50)));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(0, 9);
    expect(points[1].x).toBeCloseTo(100, 9);
  });

  it('includes the closing segment of a closed polyline', () => {
    const path = polyline(
      'p',
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    const points = intersectEntities(path, line('a', -50, 50, 50, 50));

    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(0, 9);
  });

  it('treats a rect as its four edges', () => {
    const points = sortPoints(intersectEntities(rect('r', 0, 0, 200, 100), line('a', -50, 50, 250, 50)));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(0, 9);
    expect(points[1].x).toBeCloseTo(200, 9);
  });

  it('honours rect rotation', () => {
    const points = intersectEntities(rect('r', -50, -50, 100, 100, 45), line('a', 0, -200, 0, 0));
    const expected = Math.hypot(50, 50);

    expect(points).toHaveLength(1);
    expect(points[0].y).toBeCloseTo(-expected, 6);
  });

  it('samples an ellipse into edges that can be cut', () => {
    const ellipse = { id: 'e', type: 'ellipse', cx: 0, cy: 0, rx: 200, ry: 100, rotation: 0, meta: {} };
    const points = sortPoints(intersectEntities(ellipse, line('a', -400, 0, 400, 0)));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-200, 1);
    expect(points[1].x).toBeCloseTo(200, 1);
  });

  it('ignores text and dimension entities entirely', () => {
    const text = { id: 't', type: 'text', x: 0, y: 0, text: 'Label', fontSize: 100, meta: {} };
    const dimension = {
      id: 'dim-1',
      type: 'dimension',
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      offset: 40,
      subtype: 'horizontal',
      meta: {},
    };

    expect(getEntityCurves(text)).toEqual([]);
    expect(getEntityCurves(dimension)).toEqual([]);
    expect(intersectEntities(line('a', -100, 0, 100, 0), text)).toEqual([]);
    expect(intersectEntities(line('a', 0, -100, 0, 100), dimension)).toEqual([]);
  });

  it('treats a feature hole as a circular cutter', () => {
    const hole = { id: 'feature-1', type: 'feature', shape: 'circle', cx: 0, cy: 0, diameter: 200, meta: {} };
    const points = sortPoints(intersectEntities(line('a', -300, 0, 300, 0), hole));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(-100, 9);
  });
});

describe('intersectionUtils collection helpers', () => {
  it('collects every cut against a list of other entities and never self-cuts', () => {
    const target = line('target', 0, 0, 1000, 0);
    const others = [
      target,
      line('cut-1', 250, -100, 250, 100),
      line('cut-2', 750, -100, 750, 100),
      line('miss', 500, 200, 500, 400),
    ];
    const points = sortPoints(collectEntityIntersections(target, others));

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(250, 9);
    expect(points[1].x).toBeCloseTo(750, 9);
  });

  it('collapses duplicate hits reported by neighbouring segments', () => {
    const deduped = dedupeIntersectionPoints([
      { x: 10, y: 10 },
      { x: 10 + 1e-12, y: 10 },
      { x: 20, y: 10 },
    ]);

    expect(deduped).toHaveLength(2);
  });

  it('exposes primitive curve builders that intersect directly', () => {
    const points = intersectCurves(
      createSegmentCurve({ x: -10, y: 0 }, { x: 10, y: 0 }),
      createCircleCurve({ x: 0, y: 0 }, 5),
    );

    expect(sortPoints(points).map((point) => point.x)).toEqual([-5, 5]);
  });
});
