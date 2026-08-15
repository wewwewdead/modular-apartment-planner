import { describe, expect, it } from 'vitest';
import {
  applyChamfer,
  computeSketchChamfer,
  findChamferableCorner,
  CHAMFER_DISTANCE_STEP,
  DEFAULT_CHAMFER_DISTANCE,
  MAX_CHAMFER_DISTANCE,
  MIN_CHAMFER_DISTANCE,
} from './chamferUtils';

describe('chamferUtils constants', () => {
  it('exports the setback bounds the keyboard steps between', () => {
    expect(DEFAULT_CHAMFER_DISTANCE).toBe(50);
    expect(MIN_CHAMFER_DISTANCE).toBe(5);
    expect(MAX_CHAMFER_DISTANCE).toBe(1000);
    expect(CHAMFER_DISTANCE_STEP).toBe(10);
  });
});

describe('chamferUtils corner resolution', () => {
  it('reuses the fillet corner finder for line-line junctions', () => {
    const entities = [
      { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
    ];
    const corner = findChamferableCorner(entities, { x: 100, y: 0 }, 5);

    expect(corner.type).toBe('line-line');
    expect(corner.cornerPoint).toEqual({ x: 100, y: 0 });
  });

  it('finds polyline vertices and rect corners', () => {
    const polylineCorner = findChamferableCorner(
      [
        {
          id: 'p1',
          type: 'polyline',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
      { x: 100, y: 0 },
      5,
    );
    const rectCorner = findChamferableCorner(
      [{ id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 80, rotation: 0 }],
      { x: 0, y: 0 },
      5,
    );

    expect(polylineCorner.type).toBe('polyline-vertex');
    expect(rectCorner.type).toBe('rect-corner');
  });

  it('returns null away from any corner', () => {
    expect(
      findChamferableCorner(
        [
          { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
          { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
        ],
        { x: 500, y: 500 },
        5,
      ),
    ).toBeNull();
  });
});

describe('computeSketchChamfer', () => {
  const rightAngle = {
    type: 'line-line',
    cornerPoint: { x: 100, y: 0 },
    entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
    entity1Endpoint: 'end',
    entity2: { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
    entity2Endpoint: 'start',
  };

  it('sets both points back by the same distance along each edge', () => {
    const geometry = computeSketchChamfer(rightAngle, 20);

    expect(geometry.point1).toEqual({ x: 80, y: 0 });
    expect(geometry.point2).toEqual({ x: 100, y: 20 });
    expect(geometry.cornerPoint).toEqual({ x: 100, y: 0 });
    expect(geometry.distance).toBe(20);
  });

  it('cuts a 45 degree edge on a right-angle corner', () => {
    const geometry = computeSketchChamfer(rightAngle, 20);
    const angle =
      (Math.atan2(geometry.point2.y - geometry.point1.y, geometry.point2.x - geometry.point1.x) * 180) / Math.PI;

    expect(Math.abs(angle)).toBeCloseTo(45, 9);
  });

  it('returns null for nearly parallel edges', () => {
    const flat = {
      ...rightAngle,
      entity2: { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 200, y2: 0.01 },
    };

    expect(computeSketchChamfer(flat, 20)).toBeNull();
  });

  it('clamps the setback to 90% of the shorter edge', () => {
    const short = {
      type: 'line-line',
      cornerPoint: { x: 10, y: 0 },
      entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      entity1Endpoint: 'end',
      entity2: { id: 'l2', type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
      entity2Endpoint: 'start',
    };
    const geometry = computeSketchChamfer(short, 50);

    expect(geometry.distance).toBeCloseTo(9, 9);
    expect(geometry.point1).toEqual({ x: 1, y: 0 });
  });

  it('returns null when the edges are too short to cut', () => {
    const tiny = {
      type: 'line-line',
      cornerPoint: { x: 1, y: 0 },
      entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 },
      entity1Endpoint: 'end',
      entity2: { id: 'l2', type: 'line', x1: 1, y1: 0, x2: 1, y2: 1 },
      entity2Endpoint: 'start',
    };

    expect(computeSketchChamfer(tiny, 5)).toBeNull();
  });

  it('rejects a non-positive setback', () => {
    expect(computeSketchChamfer(rightAngle, 0)).toBeNull();
    expect(computeSketchChamfer(rightAngle, -10)).toBeNull();
    expect(computeSketchChamfer(rightAngle, Number.NaN)).toBeNull();
  });

  it('handles a polyline vertex from its neighbours', () => {
    const geometry = computeSketchChamfer(
      {
        type: 'polyline-vertex',
        cornerPoint: { x: 100, y: 0 },
        prevPoint: { x: 0, y: 0 },
        nextPoint: { x: 100, y: 100 },
      },
      25,
    );

    expect(geometry.point1).toEqual({ x: 75, y: 0 });
    expect(geometry.point2).toEqual({ x: 100, y: 25 });
  });

  it('works at apartment scale', () => {
    const geometry = computeSketchChamfer(
      {
        type: 'polyline-vertex',
        cornerPoint: { x: 6000, y: 4000 },
        prevPoint: { x: 1000, y: 4000 },
        nextPoint: { x: 6000, y: 9000 },
      },
      300,
    );

    expect(geometry.point1.x).toBeCloseTo(5700, 9);
    expect(geometry.point2.y).toBeCloseTo(4300, 9);
  });
});

describe('applyChamfer', () => {
  it('pulls both lines back and bridges them with a new line', () => {
    const entities = [
      { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, visible: true, meta: {} },
      { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100, visible: true, meta: {} },
    ];
    const corner = {
      type: 'line-line',
      cornerPoint: { x: 100, y: 0 },
      entity1: entities[0],
      entity1Endpoint: 'end',
      entity2: entities[1],
      entity2Endpoint: 'start',
    };
    const result = applyChamfer(entities, corner, computeSketchChamfer(corner, 20), 'default');

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'l1', x2: 80, y2: 0 });
    expect(result[1]).toMatchObject({ id: 'l2', x1: 100, y1: 20 });
    expect(result[2]).toMatchObject({ type: 'line', x1: 80, y1: 0, x2: 100, y2: 20 });
    expect(result[2].meta.chamferDistance).toBe(20);
    // No arc: this is the straight-cut sibling of the fillet.
    expect(result.some((entity) => entity.type === 'arc')).toBe(false);
  });

  it('explodes a rect into four lines plus the chamfer edge', () => {
    const rect = { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 80, rotation: 0, layerId: 'default' };
    const corner = findChamferableCorner([rect], { x: 0, y: 0 }, 5);
    const result = applyChamfer([rect], corner, computeSketchChamfer(corner, 20), 'default');

    expect(result.some((entity) => entity.type === 'rect')).toBe(false);
    expect(result.filter((entity) => entity.type === 'line')).toHaveLength(5);
    expect(new Set(result.map((entity) => entity.id)).size).toBe(result.length);
  });

  it('replaces a polyline vertex with two points and keeps one entity', () => {
    const polyline = {
      id: 'p1',
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      closed: false,
      layerId: 'default',
      meta: {},
    };
    const corner = findChamferableCorner([polyline], { x: 100, y: 0 }, 5);
    const result = applyChamfer([polyline], corner, computeSketchChamfer(corner, 25), 'default');

    expect(result).toHaveLength(1);
    expect(result[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 25 },
      { x: 100, y: 100 },
    ]);
  });

  it('leaves the entity list alone for an unknown corner type', () => {
    const entities = [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }];

    expect(applyChamfer(entities, { type: 'nonsense' }, { point1: {}, point2: {} }, 'default')).toBe(entities);
  });
});
