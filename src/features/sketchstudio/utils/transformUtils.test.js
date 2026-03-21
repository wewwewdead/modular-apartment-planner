import { describe, expect, it } from 'vitest';
import {
  computeSelectionBounds,
  mirrorEntities,
  mirrorPointAcrossAxis,
  rotateEntities,
  rotatePointAroundPivot,
  translateEntities,
} from './transformUtils';

describe('transformUtils', () => {
  it('rotates a point around a pivot', () => {
    const rotated = rotatePointAroundPivot({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0, 4);
    expect(rotated.y).toBeCloseTo(10, 4);
  });

  it('translates entity collections', () => {
    const next = translateEntities([
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      { id: 'circle-1', type: 'circle', cx: 20, cy: 20, r: 5 },
      { id: 'ellipse-1', type: 'ellipse', cx: 10, cy: 10, rx: 4, ry: 2, rotation: 0 },
    ], ['line-1'], { x: 5, y: 10 });

    expect(next[0]).toMatchObject({ x1: 5, y1: 10, x2: 15, y2: 10 });
    expect(next[1]).toMatchObject({ cx: 20, cy: 20 });
    expect(next[2]).toMatchObject({ cx: 10, cy: 10 });
  });

  it('computes grouped selection bounds', () => {
    expect(computeSelectionBounds([
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      { id: 'circle-1', type: 'circle', cx: 20, cy: 20, r: 5 },
    ], [])).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 25,
      maxY: 25,
    });
  });

  it('mirrors points across horizontal and vertical selection axes', () => {
    expect(mirrorPointAcrossAxis({ x: 10, y: 5 }, { x: 0, y: 0 }, 'horizontal')).toEqual({ x: -10, y: 5 });
    expect(mirrorPointAcrossAxis({ x: 10, y: 5 }, { x: 0, y: 0 }, 'vertical')).toEqual({ x: 10, y: -5 });
  });

  it('mirrors mixed entity collections across the selection center', () => {
    const next = mirrorEntities([
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
      { id: 'circle-1', type: 'circle', cx: 20, cy: 20, r: 5 },
      { id: 'ellipse-1', type: 'ellipse', cx: 40, cy: 10, rx: 8, ry: 4, rotation: 30 },
      { id: 'poly-1', type: 'polyline', points: [{ x: 50, y: 0 }, { x: 60, y: 10 }], closed: false },
      { id: 'arc-1', type: 'arc', start: { x: 70, y: 0 }, end: { x: 90, y: 0 }, control: { x: 80, y: 20 } },
      { id: 'feature-1', type: 'feature', shape: 'polygon', points: [{ x: 100, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 10 }] },
    ], ['line-1', 'circle-1', 'ellipse-1', 'poly-1', 'arc-1', 'feature-1'], { x: 50, y: 20 }, 'horizontal');

    expect(next[0]).toMatchObject({ x1: 100, y1: 0, x2: 90, y2: 0 });
    expect(next[1]).toMatchObject({ cx: 80, cy: 20, r: 5 });
    expect(next[2]).toMatchObject({ cx: 60, cy: 10, rotation: 150 });
    expect(next[3].points).toEqual([{ x: 50, y: 0 }, { x: 40, y: 10 }]);
    expect(next[4]).toMatchObject({
      start: { x: 30, y: 0 },
      end: { x: 10, y: 0 },
      control: { x: 20, y: 20 },
    });
    expect(next[5].points).toEqual([{ x: 0, y: 0 }, { x: -10, y: 0 }, { x: -10, y: 10 }]);
  });

  it('mirrors rotated rectangles and unbound dimensions without changing selection size', () => {
    const next = mirrorEntities([
      { id: 'rect-1', type: 'rect', x: 20, y: 30, width: 40, height: 20, rotation: 30 },
      { id: 'dim-1', type: 'dimension', p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, subtype: 'horizontal', offset: 12, meta: {} },
    ], ['rect-1', 'dim-1'], { x: 100, y: 50 }, 'vertical');

    expect(next[0]).toMatchObject({ x: 20, y: 50, width: 40, height: 20, rotation: -30 });
    expect(next[1]).toMatchObject({
      p1: { x: 0, y: 100 },
      p2: { x: 40, y: 100 },
      subtype: 'horizontal',
      offset: -12,
    });
  });

  it('rotates unbound dimensions along with the selection', () => {
    const next = rotateEntities([
      { id: 'dim-1', type: 'dimension', p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, subtype: 'horizontal', offset: 10, meta: {} },
    ], ['dim-1'], { x: 0, y: 0 }, Math.PI / 2);

    expect(next[0].p1.x).toBeCloseTo(0, 4);
    expect(next[0].p1.y).toBeCloseTo(0, 4);
    expect(next[0].p2.x).toBeCloseTo(0, 4);
    expect(next[0].p2.y).toBeCloseTo(40, 4);
    expect(next[0].subtype).toBe('vertical');
  });

  it('translates, rotates, and mirrors text entities', () => {
    const text = {
      id: 'text-1',
      type: 'text',
      x: 100,
      y: 50,
      text: 'Desk',
      fontSize: 120,
      rotation: 0,
      meta: {},
    };

    expect(translateEntities([text], ['text-1'], { x: 20, y: 15 })[0]).toMatchObject({ x: 120, y: 65 });

    const rotated = rotateEntities([text], ['text-1'], { x: 0, y: 0 }, Math.PI / 2)[0];
    expect(rotated.x).toBeCloseTo(-50, 4);
    expect(rotated.y).toBeCloseTo(100, 4);
    expect(rotated.rotation).toBe(90);

    expect(mirrorEntities([text], ['text-1'], { x: 200, y: 50 }, 'horizontal')[0]).toMatchObject({
      x: 300,
      y: 50,
      rotation: 180,
    });
  });
});
