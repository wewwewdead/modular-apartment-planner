import { describe, expect, it } from 'vitest';
import { buildTrussCopyOrigins, getTrussSupportLength, resolveTrussLayout } from './layout';
import { createTrussInstance } from '@/domain/trussModels';

function horizontalInstance(overrides = {}) {
  return createTrussInstance({
    trussTypeId: 'truss_type_gable',
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 4800, y: 0 },
    spacing: 1200,
    count: 5,
    ...overrides,
  });
}

describe('resolveTrussLayout', () => {
  it('computes the axis and perpendicular span direction for a horizontal run', () => {
    const layout = resolveTrussLayout(horizontalInstance());
    expect(layout.axis).toEqual({ x: 1, y: 0 });
    // perpendicular((1,0)) is (-0, 1); compare numerically to avoid signed-zero mismatch.
    expect(layout.spanDirection.x).toBeCloseTo(0, 10);
    expect(layout.spanDirection.y).toBeCloseTo(1, 10);
  });

  it('normalizes a diagonal axis to unit length', () => {
    const layout = resolveTrussLayout(
      horizontalInstance({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3000, y: 4000 },
      }),
    );
    expect(layout.axis.x).toBeCloseTo(0.6, 10);
    expect(layout.axis.y).toBeCloseTo(0.8, 10);
    expect(Math.hypot(layout.axis.x, layout.axis.y)).toBeCloseTo(1, 10);
  });

  it('falls back to a +x axis when start and end coincide', () => {
    const layout = resolveTrussLayout(
      horizontalInstance({
        startPoint: { x: 100, y: 100 },
        endPoint: { x: 100, y: 100 },
        spacing: 0,
        count: 1,
      }),
    );
    expect(layout.axis).toEqual({ x: 1, y: 0 });
  });
});

describe('getTrussSupportLength', () => {
  it('uses the endpoint distance when it exceeds the spacing coverage', () => {
    // distance 4800; spacing 1200 * (count-1=4) = 4800; max = 4800.
    expect(getTrussSupportLength(horizontalInstance())).toBe(4800);
  });

  it('uses the spacing coverage when the endpoints are closer than the copies require', () => {
    // endpoints 1000 apart, but 5 copies at 1200 spacing need 4800.
    const length = getTrussSupportLength(
      horizontalInstance({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 1000, y: 0 },
        spacing: 1200,
        count: 5,
      }),
    );
    expect(length).toBe(4800);
  });

  it('never returns less than 1', () => {
    const length = getTrussSupportLength(
      horizontalInstance({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 },
        spacing: 0,
        count: 1,
      }),
    );
    expect(length).toBe(1);
  });
});

describe('buildTrussCopyOrigins', () => {
  it('produces one origin per truss copy, evenly spaced along the axis', () => {
    const origins = buildTrussCopyOrigins(horizontalInstance());
    expect(origins).toHaveLength(5);
    expect(origins.map((o) => o.origin)).toEqual([
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 2400, y: 0 },
      { x: 3600, y: 0 },
      { x: 4800, y: 0 },
    ]);
  });

  it('indexes copies sequentially', () => {
    const origins = buildTrussCopyOrigins(horizontalInstance());
    expect(origins.map((o) => o.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('offsets the first origin by supportOffsetAlongAxis', () => {
    const origins = buildTrussCopyOrigins(horizontalInstance({ supportOffsetAlongAxis: 500 }));
    expect(origins[0].origin).toEqual({ x: 500, y: 0 });
    expect(origins[1].origin).toEqual({ x: 1700, y: 0 });
  });

  it('always emits at least one copy even when count is 1', () => {
    const origins = buildTrussCopyOrigins(horizontalInstance({ count: 1 }));
    expect(origins).toHaveLength(1);
    expect(origins[0].origin).toEqual({ x: 0, y: 0 });
  });
});
