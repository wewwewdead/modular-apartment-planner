import { describe, expect, it } from 'vitest';
import { computeIsometricAngle, computeScreenAngle, formatAngleText, getAngleDimensionGeometry } from './angleUtils';

const VERTEX = { x: 449, y: 409 };

describe('angleUtils degenerate rays', () => {
  it('reports no angle when a ray collapses onto the vertex', () => {
    const geometry = getAngleDimensionGeometry({
      vertex: VERTEX,
      p1: { ...VERTEX },
      p2: { x: 520, y: 560 },
      arcRadius: 60,
    });

    expect(geometry.angleDeg).toBeNull();
    expect(geometry.arcPath).toBeNull();
    expect(geometry.arcSamples).toEqual([]);
  });

  it('leaves a collapsed ray collapsed instead of pointing it along +x', () => {
    const geometry = getAngleDimensionGeometry({
      vertex: VERTEX,
      p1: { ...VERTEX },
      p2: { x: 520, y: 560 },
      arcRadius: 60,
    });

    expect(geometry.ray1.x2).toBeCloseTo(VERTEX.x, 6);
    expect(geometry.ray1.y2).toBeCloseTo(VERTEX.y, 6);
    expect(geometry.ray2.x2).not.toBeCloseTo(VERTEX.x, 6);
  });

  it('never lets a degenerate ray read as a right angle', () => {
    // The live bug: sourceRefs slid p1 onto the vertex, and every formula here
    // answered acos(0) for the zero vector it was handed.
    const isoGeometry = getAngleDimensionGeometry({
      vertex: VERTEX,
      p1: { ...VERTEX },
      p2: { x: 520, y: 560 },
      arcRadius: 60,
      isometricPlane: 'right',
    });

    expect(isoGeometry.angleDeg).not.toBe(90);
    expect(isoGeometry.angleDeg).toBeNull();
  });

  it('returns null rather than 90° for zero vectors', () => {
    expect(computeIsometricAngle({ x: 0, y: 0 }, { x: 1, y: 0 }, 'right')).toBeNull();
    expect(computeIsometricAngle({ x: 1, y: 0 }, { x: 0, y: 0 }, 'right')).toBeNull();
    expect(computeScreenAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(computeScreenAngle({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });

  it('keeps measuring real angles', () => {
    const geometry = getAngleDimensionGeometry({
      vertex: { x: 0, y: 0 },
      p1: { x: 100, y: 0 },
      p2: { x: 0, y: 100 },
      arcRadius: 40,
    });

    expect(geometry.angleDeg).toBeCloseTo(90, 6);
    expect(geometry.arcPath).toContain('M ');
    expect(geometry.arcSamples.length).toBeGreaterThan(0);
    expect(computeScreenAngle({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 6);
  });

  it('formats a missing angle as an em dash instead of NaN', () => {
    expect(formatAngleText(null)).toBe('—');
    expect(formatAngleText(116.25)).toBe('116.3°');
  });
});
