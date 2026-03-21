import { describe, expect, it } from 'vitest';
import { getArcBoundingBox, getArcPath, getArcSamplePoints } from './arcUtils';

describe('arcUtils', () => {
  it('builds a quadratic svg path', () => {
    expect(getArcPath({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      control: { x: 50, y: 50 },
    })).toContain('Q 50 50 100 0');
  });

  it('samples points and computes bounding boxes', () => {
    const arc = {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      control: { x: 50, y: 50 },
    };

    expect(getArcSamplePoints(arc)).toHaveLength(25);
    expect(getArcBoundingBox(arc).maxY).toBeGreaterThan(20);
  });
});
