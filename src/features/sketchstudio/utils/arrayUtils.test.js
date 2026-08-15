import { describe, expect, it } from 'vitest';
import {
  buildArrayPreviewEntities,
  clampArrayCount,
  computeLinearArray,
  computePolarArray,
  getPolarStepDegrees,
  MAX_ARRAY_COUNT,
  rotateEntityCopy,
} from './arrayUtils';

function base(id, type, extra) {
  return { id, type, layerId: 'default', locked: false, visible: true, meta: {}, ...extra };
}

const ORIGIN = { x: 0, y: 0 };

describe('arrayUtils count handling', () => {
  it('floors the count and never goes below two instances', () => {
    expect(clampArrayCount(4.7)).toEqual({ count: 4, capped: false });
    expect(clampArrayCount(1)).toEqual({ count: 2, capped: false });
    expect(clampArrayCount('abc')).toEqual({ count: 2, capped: false });
  });

  it('caps the count and flags it', () => {
    expect(clampArrayCount(5000)).toEqual({ count: MAX_ARRAY_COUNT, capped: true });
  });

  it('caps the produced copies', () => {
    const entity = base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
    const result = computeLinearArray([entity], ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 5000,
    });

    expect(result.capped).toBe(true);
    expect(result.count).toBe(MAX_ARRAY_COUNT);
    expect(result.createdEntities).toHaveLength(MAX_ARRAY_COUNT - 1);
  });
});

describe('arrayUtils linear', () => {
  const entity = base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });

  it('places count - 1 copies at k * spacing along the picked direction', () => {
    const result = computeLinearArray([entity], ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 4,
    });

    expect(result.count).toBe(4);
    expect(result.spacing).toBeCloseTo(100, 9);
    expect(result.createdEntities).toHaveLength(3);
    expect(result.createdEntities.map((copy) => copy.x1)).toEqual([100, 200, 300]);
    expect(result.entities).toHaveLength(4);
  });

  it('honours an explicit spacing over the picked distance', () => {
    const result = computeLinearArray([entity], ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 3,
      spacing: 250,
    });

    expect(result.spacing).toBe(250);
    expect(result.createdEntities.map((copy) => copy.x1)).toEqual([250, 500]);
  });

  it('follows a diagonal direction', () => {
    const result = computeLinearArray([entity], ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 30, y: 40 },
      count: 3,
    });

    expect(result.createdEntities[0].x1).toBeCloseTo(30, 9);
    expect(result.createdEntities[0].y1).toBeCloseTo(40, 9);
    expect(result.createdEntities[1].x1).toBeCloseTo(60, 9);
    expect(result.createdEntities[1].y1).toBeCloseTo(80, 9);
  });

  it('works at apartment scale', () => {
    const stud = base('rect-1', 'rect', { x: 1000, y: 2000, width: 45, height: 90, rotation: 0 });
    const result = computeLinearArray([stud], ['rect-1'], {
      basePoint: { x: 1000, y: 2000 },
      targetPoint: { x: 1600, y: 2000 },
      count: 5,
    });

    expect(result.createdEntities.map((copy) => copy.x)).toEqual([1600, 2200, 2800, 3400]);
  });

  it('returns null without a selection or a real offset', () => {
    expect(computeLinearArray([entity], [], { basePoint: ORIGIN, targetPoint: { x: 10, y: 0 }, count: 3 })).toBeNull();
    expect(computeLinearArray([entity], ['line-1'], { basePoint: ORIGIN, targetPoint: ORIGIN, count: 3 })).toBeNull();
  });
});

describe('arrayUtils polar stepping', () => {
  it('divides a full turn by the count so the last copy is not the original', () => {
    expect(getPolarStepDegrees(360, 4)).toBeCloseTo(90, 9);
    expect(getPolarStepDegrees(720, 8)).toBeCloseTo(90, 9);
  });

  it('divides a partial sweep by count - 1 so the last copy lands on the angle', () => {
    expect(getPolarStepDegrees(180, 3)).toBeCloseTo(90, 9);
    expect(getPolarStepDegrees(90, 4)).toBeCloseTo(30, 9);
  });

  it('defaults to a full turn', () => {
    expect(getPolarStepDegrees(0, 4)).toBeCloseTo(90, 9);
    expect(getPolarStepDegrees(undefined, 4)).toBeCloseTo(90, 9);
  });
});

describe('arrayUtils polar', () => {
  it('rotates circles about the centre', () => {
    const entity = base('circle-1', 'circle', { cx: 100, cy: 0, r: 10 });
    const result = computePolarArray([entity], ['circle-1'], { center: ORIGIN, count: 4, totalAngleDegrees: 360 });

    expect(result.stepDegrees).toBeCloseTo(90, 9);
    expect(result.createdEntities).toHaveLength(3);
    expect(result.createdEntities[0].cx).toBeCloseTo(0, 9);
    expect(result.createdEntities[0].cy).toBeCloseTo(100, 9);
    expect(result.createdEntities[1].cx).toBeCloseTo(-100, 9);
    expect(result.createdEntities[2].cy).toBeCloseTo(-100, 9);
  });

  it('rotates a line through both endpoints', () => {
    const entity = base('line-1', 'line', { x1: 100, y1: 0, x2: 200, y2: 0 });
    const result = computePolarArray([entity], ['line-1'], { center: ORIGIN, count: 2, totalAngleDegrees: 180 });
    const copy = result.createdEntities[0];

    expect(copy.x1).toBeCloseTo(-100, 9);
    expect(copy.x2).toBeCloseTo(-200, 9);
  });

  it('keeps a rect a rect at a quarter turn and swaps width and height', () => {
    const entity = base('rect-1', 'rect', { x: 100, y: -10, width: 40, height: 20, rotation: 0 });
    const result = computePolarArray([entity], ['rect-1'], { center: ORIGIN, count: 4, totalAngleDegrees: 360 });
    const [quarter, half, threeQuarter] = result.createdEntities;

    expect(quarter.type).toBe('rect');
    expect(quarter.width).toBe(20);
    expect(quarter.height).toBe(40);
    expect(quarter.x).toBeCloseTo(-10, 9);
    expect(quarter.y).toBeCloseTo(100, 9);

    expect(half.width).toBe(40);
    expect(half.height).toBe(20);
    expect(half.x).toBeCloseTo(-140, 9);

    expect(threeQuarter.width).toBe(20);
    expect(threeQuarter.height).toBe(40);
  });

  it('converts a rect to a closed polyline at a non-quarter angle', () => {
    const entity = base('rect-1', 'rect', { x: 100, y: -10, width: 40, height: 20, rotation: 0 });
    const result = computePolarArray([entity], ['rect-1'], { center: ORIGIN, count: 6, totalAngleDegrees: 360 });
    const copy = result.createdEntities[0];

    expect(result.stepDegrees).toBeCloseTo(60, 9);
    expect(copy.type).toBe('polyline');
    expect(copy.closed).toBe(true);
    expect(copy.points).toHaveLength(4);
    expect(copy.width).toBeUndefined();
    expect(copy.height).toBeUndefined();
  });

  it('rotates an ellipse through its rotation field', () => {
    const entity = base('ellipse-1', 'ellipse', { cx: 100, cy: 0, rx: 40, ry: 10, rotation: 20 });
    const result = computePolarArray([entity], ['ellipse-1'], { center: ORIGIN, count: 4, totalAngleDegrees: 360 });
    const copy = result.createdEntities[0];

    expect(copy.type).toBe('ellipse');
    expect(copy.rx).toBe(40);
    expect(copy.ry).toBe(10);
    expect(copy.rotation).toBeCloseTo(110, 9);
  });

  it('rotates a feature rect the same way a rect rotates', () => {
    const entity = base('feature-1', 'feature', {
      featureType: 'cutout',
      shape: 'rect',
      x: 100,
      y: -10,
      width: 40,
      height: 20,
    });
    const quarter = rotateEntityCopy(entity, ORIGIN, 90);
    const oblique = rotateEntityCopy(entity, ORIGIN, 37);

    expect(quarter.shape).toBe('rect');
    expect(quarter.width).toBe(20);
    expect(quarter.height).toBe(40);
    expect(oblique.shape).toBe('polygon');
    expect(oblique.points).toHaveLength(4);
  });

  it('rotates arcs through their three control points', () => {
    const entity = base('arc-1', 'arc', {
      start: { x: 100, y: 0 },
      control: { x: 150, y: 50 },
      end: { x: 200, y: 0 },
    });
    const copy = rotateEntityCopy(entity, ORIGIN, 90);

    expect(copy.start.x).toBeCloseTo(0, 9);
    expect(copy.start.y).toBeCloseTo(100, 9);
    expect(copy.control.x).toBeCloseTo(-50, 9);
    expect(copy.control.y).toBeCloseTo(150, 9);
    expect(copy.end.y).toBeCloseTo(200, 9);
  });

  it('returns null without a selection, centre, or usable sweep', () => {
    const entity = base('circle-1', 'circle', { cx: 100, cy: 0, r: 10 });

    expect(computePolarArray([entity], [], { center: ORIGIN, count: 3 })).toBeNull();
    expect(computePolarArray([entity], ['circle-1'], { center: null, count: 3 })).toBeNull();
  });
});

describe('arrayUtils copy rules', () => {
  const entities = [
    base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 }),
    base('text-1', 'text', { x: 0, y: 0, text: 'Label' }),
    base('dim-1', 'dimension', { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, offset: 5, subtype: 'horizontal' }),
  ];

  it('skips text and dimensions and reports them once', () => {
    const result = computeLinearArray(entities, ['line-1', 'text-1', 'dim-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 3,
    });

    expect(result.createdEntities).toHaveLength(2);
    expect(result.createdEntities.every((copy) => copy.type === 'line')).toBe(true);
    expect(result.skippedEntities.map((entity) => entity.id)).toEqual(['text-1', 'dim-1']);
  });

  it('gives every copy a unique id across all batches', () => {
    const result = computeLinearArray(entities, ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 6,
    });
    const ids = result.entities.map((entity) => entity.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(result.createdIds).toHaveLength(5);
  });

  it('preserves material, thickness, and meta while stripping sourceRefs', () => {
    const original = {
      ...base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 }),
      layerId: 'frame',
      materialId: 'pine-45',
      thickness: 45,
      meta: { lineStyle: 'broken', sourceRefs: [{ entityId: 'line-9' }, null] },
    };
    const result = computeLinearArray([original], ['line-1'], {
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 2,
    });
    const copy = result.createdEntities[0];

    expect(copy.layerId).toBe('frame');
    expect(copy.materialId).toBe('pine-45');
    expect(copy.thickness).toBe(45);
    expect(copy.meta.lineStyle).toBe('broken');
    expect(copy.meta.sourceRefs).toBeUndefined();
  });
});

describe('arrayUtils preview', () => {
  const entity = base('line-1', 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });

  it('ghosts a linear run', () => {
    const ghosts = buildArrayPreviewEntities([entity], ['line-1'], {
      mode: 'linear',
      basePoint: ORIGIN,
      targetPoint: { x: 100, y: 0 },
      count: 3,
    });

    expect(ghosts).toHaveLength(2);
    expect(ghosts.map((ghost) => ghost.x1)).toEqual([100, 200]);
    expect(ghosts[0].id).toBe('array-ghost-0');
  });

  it('ghosts a polar ring', () => {
    const ghosts = buildArrayPreviewEntities([base('circle-1', 'circle', { cx: 100, cy: 0, r: 5 })], ['circle-1'], {
      mode: 'polar',
      center: ORIGIN,
      count: 4,
      totalAngleDegrees: 360,
    });

    expect(ghosts).toHaveLength(3);
    expect(ghosts[0].cy).toBeCloseTo(100, 9);
  });

  it('returns nothing without the inputs it needs', () => {
    expect(buildArrayPreviewEntities([entity], [], { mode: 'linear' })).toEqual([]);
    expect(buildArrayPreviewEntities([entity], ['line-1'], { mode: 'linear', basePoint: ORIGIN })).toEqual([]);
    expect(buildArrayPreviewEntities([entity], ['line-1'], { mode: 'polar', count: 3 })).toEqual([]);
  });
});
