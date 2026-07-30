import { describe, expect, it } from 'vitest';
import { buildRoofPlaneGeometry, getRoofSurfaceElevation } from './roofPlaneGeometry';
import { createRoofSystem } from '@/domain/roofModels';

// A 8000 (x) by 6000 (y) rectangular footprint. Pitch direction is +y,
// so the ridge (perpendicular) runs along the x axis.
const RECT = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 6000 },
  { x: 0, y: 6000 },
];

function roof(roofType, pitchOverrides = {}) {
  return createRoofSystem('Test Roof', {
    roofType,
    boundaryPolygon: RECT,
    baseElevation: 3000,
    slabThickness: 180,
    pitch: { slope: 25, overhang: 0, ridgeOffset: 0, direction: { x: 0, y: 1 }, ...pitchOverrides },
  });
}

describe('buildRoofPlaneGeometry - flat roof', () => {
  it('produces a single flat plane with no ridge/hip/valley', () => {
    const g = buildRoofPlaneGeometry(roof('flat'));
    expect(g.roofType).toBe('flat');
    expect(g.planes).toHaveLength(1);
    expect(g.planes[0].planeType).toBe('flat');
    expect(g.ridges).toHaveLength(0);
    expect(g.hips).toHaveLength(0);
    expect(g.valleys).toHaveLength(0);
    expect(g.ridgeSegment).toBeNull();
  });

  it('has zero rise everywhere; top elevation is base + slab thickness', () => {
    const g = buildRoofPlaneGeometry(roof('flat'));
    expect(g.getRiseAtPoint(g.centroid)).toBe(0);
    expect(g.minBottomElevation).toBe(3000);
    expect(g.maxTopElevation).toBe(3180);
  });
});

describe('buildRoofPlaneGeometry - gable roof', () => {
  it('produces exactly two sloped planes and one ridge', () => {
    const g = buildRoofPlaneGeometry(roof('gable'));
    expect(g.roofType).toBe('gable');
    expect(g.planes).toHaveLength(2);
    expect(g.planes.map((p) => p.planeType).sort()).toEqual(['gable_left', 'gable_right']);
    expect(g.ridges).toHaveLength(1);
    expect(g.hips).toHaveLength(0);
    expect(g.valleys).toHaveLength(0);
  });

  it('orients the ridge along the x axis (perpendicular to the +y pitch direction)', () => {
    const g = buildRoofPlaneGeometry(roof('gable'));
    expect(g.ridgeDirection.x).toBeCloseTo(-1, 6);
    expect(g.ridgeDirection.y).toBeCloseTo(0, 6);
    // The ridge segment endpoints share the mid-span y (3000) and span the full x extent.
    expect(g.ridgeSegment.start.y).toBeCloseTo(3000, 6);
    expect(g.ridgeSegment.end.y).toBeCloseTo(3000, 6);
    const xs = [g.ridgeSegment.start.x, g.ridgeSegment.end.x].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[1]).toBeCloseTo(8000, 6);
  });

  it('computes peak rise as slope% times the half-span (pitch->height math)', () => {
    const g = buildRoofPlaneGeometry(roof('gable'));
    // slope 25% over half-span 3000mm (y in [0,6000], ridge at 3000): rise = 0.25 * 3000 = 750.
    expect(g.getRiseAtPoint({ x: 4000, y: 3000 })).toBeCloseTo(750, 6);
    // At the eaves (y = 0 and y = 6000) the rise falls back to zero.
    expect(g.getRiseAtPoint({ x: 4000, y: 0 })).toBeCloseTo(0, 6);
    expect(g.getRiseAtPoint({ x: 4000, y: 6000 })).toBeCloseTo(0, 6);
    // Halfway up one slope: 25% of 1500 = 375.
    expect(g.getRiseAtPoint({ x: 4000, y: 1500 })).toBeCloseTo(375, 6);
  });

  it('resolves top and bottom surface elevations at the ridge', () => {
    const rs = roof('gable');
    // bottom = base + rise; top = base + slab + rise. At ridge: rise 750.
    expect(getRoofSurfaceElevation(rs, { x: 4000, y: 3000 }, 'bottom')).toBeCloseTo(3750, 6);
    expect(getRoofSurfaceElevation(rs, { x: 4000, y: 3000 }, 'top')).toBeCloseTo(3930, 6);
  });

  it('scales the peak rise linearly with slope', () => {
    const gentle = buildRoofPlaneGeometry(roof('gable', { slope: 10 }));
    const steep = buildRoofPlaneGeometry(roof('gable', { slope: 50 }));
    // 10% of 3000 = 300; 50% of 3000 = 1500.
    expect(gentle.getRiseAtPoint({ x: 4000, y: 3000 })).toBeCloseTo(300, 6);
    expect(steep.getRiseAtPoint({ x: 4000, y: 3000 })).toBeCloseTo(1500, 6);
  });
});

describe('buildRoofPlaneGeometry - shed roof', () => {
  it('produces a single sloped plane rising across the full span', () => {
    const g = buildRoofPlaneGeometry(roof('shed'));
    expect(g.planes).toHaveLength(1);
    expect(g.planes[0].planeType).toBe('shed');
    expect(g.ridges).toHaveLength(0);
    // Full span 6000 in y; the high edge rise is 25% of 6000 = 1500 -> top = 3000+180+1500.
    expect(g.maxTopElevation).toBeCloseTo(4680, 6);
  });
});

describe('buildRoofPlaneGeometry - hip roof', () => {
  it('produces four planes, one ridge, and four hip edges', () => {
    const g = buildRoofPlaneGeometry(roof('hip'));
    expect(g.roofType).toBe('hip');
    expect(g.planes).toHaveLength(4);
    expect(g.planes.map((p) => p.planeType).sort()).toEqual(['hip_end', 'hip_left', 'hip_right', 'hip_start']);
    expect(g.ridges).toHaveLength(1);
    expect(g.hips).toHaveLength(4);
    expect(g.valleys).toHaveLength(0);
  });

  it('insets the ridge from both ends by min(spanWidth/2, layoutLength/2)', () => {
    const g = buildRoofPlaneGeometry(roof('hip'));
    // spanWidth (y) = 6000 -> half 3000; layoutLength (x) = 8000 -> half 4000; inset = 3000.
    // Ridge runs from x = layoutMin+3000 (=3000) to layoutMax-3000 (=5000) at y = 3000.
    const xs = [g.ridgeSegment.start.x, g.ridgeSegment.end.x].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(3000, 6);
    expect(xs[1]).toBeCloseTo(5000, 6);
    expect(g.ridgeSegment.start.y).toBeCloseTo(3000, 6);
  });

  it('reaches the same peak rise as a gable of the same slope', () => {
    const g = buildRoofPlaneGeometry(roof('hip'));
    // Peak at the ridge line: min(sideDistance, endDistance) = 3000 -> rise 0.25*3000 = 750.
    expect(g.getRiseAtPoint({ x: 4000, y: 3000 })).toBeCloseTo(750, 6);
    expect(g.maxTopElevation).toBeCloseTo(3930, 6);
  });
});

describe('buildRoofPlaneGeometry - degenerate & concave inputs', () => {
  it('returns an empty-plane geometry (no throw) for fewer than 3 boundary points', () => {
    const rs = createRoofSystem('R', {
      roofType: 'gable',
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    let g;
    expect(() => {
      g = buildRoofPlaneGeometry(rs);
    }).not.toThrow();
    expect(g.planes).toHaveLength(0);
    expect(g.ridgeSegment).toBeNull();
  });

  it('does not throw on a concave (L-shaped) footprint', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 6000 },
      { x: 0, y: 6000 },
    ];
    const rs = createRoofSystem('R', {
      roofType: 'gable',
      boundaryPolygon: lShape,
      baseElevation: 0,
      slabThickness: 100,
      pitch: { slope: 30, overhang: 300, direction: { x: 0, y: 1 } },
    });
    let g;
    expect(() => {
      g = buildRoofPlaneGeometry(rs);
    }).not.toThrow();
    // A concave boundary reports convexBoundary=false and suppresses overhang offsetting.
    expect(g.convexBoundary).toBe(false);
    expect(g.overhangApplied).toBe(false);
    expect(g.planes.length).toBeGreaterThan(0);
  });
});
