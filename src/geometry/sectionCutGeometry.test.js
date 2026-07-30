import { describe, expect, it } from 'vitest';
import {
  getSectionCutRenderData,
  hitTestSectionCut,
  projectPointToSectionCut,
  sectionCutArrow,
  sectionCutAxis,
  sectionCutLength,
  sectionCutNormal,
  sectionCutPointAtAlong,
  sectionCutViewAxis,
} from './sectionCutGeometry';
import { createSectionCut } from '@/domain/models';

// A horizontal section cut from (0,0) to (1000,0), looking in the +direction.
function horizontalCut(direction = 1) {
  return createSectionCut({ x: 0, y: 0 }, { x: 1000, y: 0 }, { direction });
}

describe('sectionCut axes', () => {
  it('computes a unit axis from start to end', () => {
    expect(sectionCutAxis(horizontalCut())).toEqual({ x: 1, y: 0 });
  });

  it('computes the view normal, flipped by the direction flag', () => {
    const pos = sectionCutNormal(horizontalCut(1));
    expect(pos.x).toBeCloseTo(0, 10);
    expect(pos.y).toBeCloseTo(1, 10);
    const neg = sectionCutNormal(horizontalCut(-1));
    expect(neg.x).toBeCloseTo(0, 10);
    expect(neg.y).toBeCloseTo(-1, 10);
  });

  it('derives the view axis orthogonal to the normal', () => {
    const viewAxis = sectionCutViewAxis(horizontalCut(1));
    expect(viewAxis.x).toBeCloseTo(-1, 10);
    expect(viewAxis.y).toBeCloseTo(0, 10);
  });

  it('measures the cut length', () => {
    expect(sectionCutLength(horizontalCut())).toBe(1000);
  });

  it('returns zero length for a degenerate (zero-length) cut', () => {
    expect(sectionCutLength(createSectionCut({ x: 5, y: 5 }, { x: 5, y: 5 }))).toBe(0);
  });
});

describe('projectPointToSectionCut', () => {
  it('projects a point in front of the cut with negative offset (direction +1)', () => {
    const projection = projectPointToSectionCut(horizontalCut(1), { x: 500, y: -200 });
    expect(projection.along).toBeCloseTo(500, 6);
    expect(projection.offset).toBeCloseTo(-200, 6);
  });

  it('projects a point behind the cut with positive offset (direction +1)', () => {
    const projection = projectPointToSectionCut(horizontalCut(1), { x: 500, y: 200 });
    expect(projection.along).toBeCloseTo(500, 6);
    expect(projection.offset).toBeCloseTo(200, 6);
  });

  it('flips the offset sign when the cut direction is reversed', () => {
    const projection = projectPointToSectionCut(horizontalCut(-1), { x: 500, y: -200 });
    expect(projection.along).toBeCloseTo(500, 6);
    expect(projection.offset).toBeCloseTo(200, 6);
  });

  it('measures "along" from the near end of the cut', () => {
    const start = projectPointToSectionCut(horizontalCut(1), { x: 0, y: 0 });
    const end = projectPointToSectionCut(horizontalCut(1), { x: 1000, y: 0 });
    // along is measured against the view axis (-x here), so the end of the segment
    // is the near end (along 0) and the start is the far end (along 1000).
    expect(Math.abs(end.along - start.along)).toBeCloseTo(1000, 6);
  });
});

describe('sectionCutPointAtAlong', () => {
  it('is the inverse of projectPointToSectionCut for both directions', () => {
    for (const direction of [1, -1]) {
      const cut = horizontalCut(direction);
      for (const point of [
        { x: 0, y: 0 },
        { x: 250, y: 0 },
        { x: 1000, y: 0 },
      ]) {
        const { along } = projectPointToSectionCut(cut, point);
        const roundTrip = sectionCutPointAtAlong(cut, along);
        expect(roundTrip.x).toBeCloseTo(point.x, 6);
        expect(roundTrip.y).toBeCloseTo(point.y, 6);
      }
    }
  });

  it('maps along 0 to the end the view treats as its left edge', () => {
    // direction +1 -> the view axis runs end -> start, so along 0 sits at the cut end point.
    expect(sectionCutPointAtAlong(horizontalCut(1), 0).x).toBeCloseTo(1000, 6);
    expect(sectionCutPointAtAlong(horizontalCut(-1), 0).x).toBeCloseTo(0, 6);
  });

  it('clamps values outside the cut and tolerates a degenerate cut', () => {
    expect(sectionCutPointAtAlong(horizontalCut(1), -500).x).toBeCloseTo(1000, 6);
    expect(sectionCutPointAtAlong(horizontalCut(1), 5000).x).toBeCloseTo(0, 6);
    expect(sectionCutPointAtAlong(createSectionCut({ x: 5, y: 5 }, { x: 5, y: 5 }), 10)).toEqual({ x: 5, y: 5 });
  });
});

describe('sectionCutArrow', () => {
  it('builds a shaft along the normal and a two-point arrowhead', () => {
    const arrow = sectionCutArrow(horizontalCut(1));
    expect(arrow.shaftStart).toEqual({ x: 500, y: 100 });
    expect(arrow.shaftEnd).toEqual({ x: 500, y: 450 });
    // Arrowhead points are symmetric about the shaft along the axis (+/- 90 in x).
    expect(arrow.headA.x - arrow.headB.x).toBeCloseTo(180, 6);
    expect(arrow.headA.y).toBeCloseTo(arrow.headB.y, 6);
  });

  it('returns null for a zero-length cut (no defined axis)', () => {
    expect(sectionCutArrow(createSectionCut({ x: 0, y: 0 }, { x: 0, y: 0 }))).toBeNull();
  });
});

describe('getSectionCutRenderData', () => {
  it('returns render data for a valid cut', () => {
    const data = getSectionCutRenderData(horizontalCut(1));
    expect(data).not.toBeNull();
    expect(data.length).toBe(1000);
    expect(data.center).toEqual({ x: 500, y: 0 });
    expect(data.line.start).toEqual({ x: 0, y: 0 });
    expect(data.line.end).toEqual({ x: 1000, y: 0 });
  });

  it('returns null for a zero-length cut', () => {
    expect(getSectionCutRenderData(createSectionCut({ x: 1, y: 1 }, { x: 1, y: 1 }))).toBeNull();
  });

  it('returns null for a null section cut', () => {
    expect(getSectionCutRenderData(null)).toBeNull();
  });
});

describe('hitTestSectionCut', () => {
  it('is true for a point within tolerance of the cut line', () => {
    expect(hitTestSectionCut({ x: 500, y: 5 }, horizontalCut(1), 10)).toBe(true);
  });

  it('is false for a point beyond the tolerance', () => {
    expect(hitTestSectionCut({ x: 500, y: 50 }, horizontalCut(1), 10)).toBe(false);
  });

  it('is false for a null section cut', () => {
    expect(hitTestSectionCut({ x: 0, y: 0 }, null, 10)).toBe(false);
  });
});
