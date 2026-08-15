import { describe, expect, it } from 'vitest';
import { computeSketchExtend, findExtendCandidate, getExtendableEnds, isExtendableEntity } from './extendUtils';

function line(id, x1, y1, x2, y2) {
  return { id, type: 'line', x1, y1, x2, y2, layerId: 'default', visible: true, meta: {} };
}

function arc(id, start, control, end) {
  return { id, type: 'arc', start, control, end, layerId: 'default', visible: true, meta: {} };
}

function polyline(id, points, closed = false) {
  return { id, type: 'polyline', points, closed, layerId: 'default', visible: true, meta: {} };
}

describe('extendUtils candidates', () => {
  it('accepts lines, arcs, and open polylines only', () => {
    expect(isExtendableEntity(line('a', 0, 0, 1, 0))).toBe(true);
    expect(isExtendableEntity(arc('b', { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }))).toBe(true);
    expect(
      isExtendableEntity(
        polyline('c', [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]),
      ),
    ).toBe(true);
    expect(
      isExtendableEntity(
        polyline(
          'd',
          [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
          true,
        ),
      ),
    ).toBe(false);
    expect(isExtendableEntity({ type: 'circle' })).toBe(false);
    expect(isExtendableEntity({ type: 'rect' })).toBe(false);
  });

  it('exposes only the two free ends of an open polyline', () => {
    const path = polyline('p', [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);

    expect(getExtendableEnds(path)).toEqual([
      { endKey: 'start', point: { x: 0, y: 0 } },
      { endKey: 'end', point: { x: 100, y: 0 } },
    ]);
  });

  it('picks the closest end within tolerance and nothing outside it', () => {
    const entities = [line('a', 0, 0, 100, 0)];

    expect(findExtendCandidate(entities, { x: 98, y: 2 }, 10)).toMatchObject({ endKey: 'end' });
    expect(findExtendCandidate(entities, { x: 3, y: 1 }, 10)).toMatchObject({ endKey: 'start' });
    expect(findExtendCandidate(entities, { x: 50, y: 0 }, 10)).toBeNull();
    expect(findExtendCandidate(entities, { x: 500, y: 500 }, 10)).toBeNull();
  });
});

describe('extendUtils line', () => {
  it('grows the end to the first blocker along its direction', () => {
    const target = line('target', 0, 0, 100, 0);
    const entities = [target, line('blocker', 300, -100, 300, 100), line('far', 600, -100, 600, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.entity.id).toBe('target');
    expect(result.entity.x2).toBeCloseTo(300, 6);
    expect(result.entity.y2).toBeCloseTo(0, 6);
    expect(result.entity.x1).toBe(0);
    expect(result.entities).toHaveLength(3);
  });

  it('grows the start end backwards', () => {
    const target = line('target', 100, 0, 200, 0);
    const entities = [target, line('blocker', -50, -100, -50, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'start' });

    expect(result.entity.x1).toBeCloseTo(-50, 6);
    expect(result.entity.x2).toBe(200);
  });

  it('ignores geometry that already touches the end it is growing from', () => {
    const target = line('target', 0, 0, 100, 0);
    const entities = [target, line('touching', 100, -100, 100, 100), line('blocker', 300, -100, 300, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.entity.x2).toBeCloseTo(300, 6);
  });

  it('returns null when nothing is in the way', () => {
    const target = line('target', 0, 0, 100, 0);

    expect(computeSketchExtend([target], { entity: target, endKey: 'end' })).toBeNull();
    expect(
      computeSketchExtend([target, line('behind', -300, -100, -300, 100)], { entity: target, endKey: 'end' }),
    ).toBeNull();
  });

  it('extends at apartment scale', () => {
    const target = line('target', 1000, 4000, 4000, 4000);
    const entities = [target, line('blocker', 8500, 1000, 8500, 7000)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.entity.x2).toBeCloseTo(8500, 6);
    expect(result.entity.y2).toBeCloseTo(4000, 6);
  });

  it('reports the added span so the tool can preview it', () => {
    const target = line('target', 0, 0, 100, 0);
    const entities = [target, line('blocker', 300, -100, 300, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.addedSpanPoints[0]).toEqual({ x: 100, y: 0 });
    expect(result.addedSpanPoints.at(-1).x).toBeCloseTo(300, 6);
  });
});

describe('extendUtils polyline', () => {
  it('moves the terminal vertex along the terminal segment', () => {
    const target = polyline('target', [
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    const entities = [target, line('blocker', 300, -100, 300, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.entity.points).toHaveLength(3);
    expect(result.entity.points[0]).toEqual({ x: 0, y: 100 });
    expect(result.entity.points.at(-1).x).toBeCloseTo(300, 6);
    expect(result.entity.points.at(-1).y).toBeCloseTo(0, 6);
  });

  it('moves the first vertex when the start end is picked', () => {
    const target = polyline('target', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    const entities = [target, line('blocker', -200, -100, -200, 100)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'start' });

    expect(result.entity.points[0].x).toBeCloseTo(-200, 6);
    expect(result.entity.points.at(-1)).toEqual({ x: 100, y: 100 });
  });

  it('returns null with no blocker', () => {
    const target = polyline('target', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    expect(computeSketchExtend([target], { entity: target, endKey: 'end' })).toBeNull();
  });
});

describe('extendUtils arc', () => {
  // x(t) = 100 * (2t - 1), y(t) = -400 * t * (1 - t)
  const target = arc('target', { x: -100, y: 0 }, { x: 0, y: -200 }, { x: 100, y: 0 });

  it('continues along its own curve to the blocker and stays an arc', () => {
    const entities = [target, line('blocker', 200, -200, 200, 500)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'end' });

    expect(result.entity.type).toBe('arc');
    expect(result.entity.id).toBe('target');
    // Untouched end stays put.
    expect(result.entity.start).toEqual({ x: -100, y: 0 });
    // x(1.5) = 200, y(1.5) = 300.
    expect(result.entity.end.x).toBeCloseTo(200, 4);
    expect(result.entity.end.y).toBeCloseTo(300, 3);
  });

  it('continues the start end backwards along the same curve', () => {
    const entities = [target, line('blocker', -200, -200, -200, 500)];
    const result = computeSketchExtend(entities, { entity: target, endKey: 'start' });

    expect(result.entity.end).toEqual({ x: 100, y: 0 });
    // x(-0.5) = -200, y(-0.5) = 300.
    expect(result.entity.start.x).toBeCloseTo(-200, 4);
    expect(result.entity.start.y).toBeCloseTo(300, 3);
  });

  it('keeps the extended arc on the original parabola', () => {
    const entities = [target, line('blocker', 200, -200, 200, 500)];
    const extended = computeSketchExtend(entities, { entity: target, endKey: 'end' }).entity;
    const evaluate = (entity, t) => ({
      x: (1 - t) * (1 - t) * entity.start.x + 2 * (1 - t) * t * entity.control.x + t * t * entity.end.x,
      y: (1 - t) * (1 - t) * entity.start.y + 2 * (1 - t) * t * entity.control.y + t * t * entity.end.y,
    });
    // The original arc's own end (t = 1) sits at 1/1.5 of the extended one.
    const sample = evaluate(extended, 1 / 1.5);

    expect(sample.x).toBeCloseTo(100, 3);
    expect(sample.y).toBeCloseTo(0, 3);
  });

  it('returns null when the extension path is clear', () => {
    expect(computeSketchExtend([target], { entity: target, endKey: 'end' })).toBeNull();
  });

  it('returns null when the blocker sits beyond the probe window', () => {
    // The probe stops one parameter unit past the end, i.e. at x(2) = 300.
    const entities = [target, line('blocker', 1000, -2000, 1000, 5000)];

    expect(computeSketchExtend(entities, { entity: target, endKey: 'end' })).toBeNull();
  });
});

describe('extendUtils guards', () => {
  it('returns null without a candidate', () => {
    expect(computeSketchExtend([], null)).toBeNull();
    expect(computeSketchExtend([], {})).toBeNull();
  });

  it('never uses the target itself as a blocker', () => {
    const target = polyline('target', [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 50, y: 100 },
      { x: 50, y: -100 },
    ]);
    // The terminal segment points straight down; extending it would re-cross the
    // polyline's own first segment if self-intersection counted.
    expect(computeSketchExtend([target], { entity: target, endKey: 'end' })).toBeNull();
  });
});
