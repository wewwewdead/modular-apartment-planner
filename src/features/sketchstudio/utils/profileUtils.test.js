import { describe, expect, it } from 'vitest';
import {
  buildLoopFromConnectedSegments,
  closePolyline,
  computeProfileBoundingBox,
  extractProfileLoops,
  getClosedProfileArea,
  isPolylineClosed,
} from './profileUtils';

describe('profileUtils', () => {
  it('detects and closes polylines', () => {
    const polyline = {
      type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      closed: false,
    };

    expect(isPolylineClosed(polyline)).toBe(false);
    expect(closePolyline(polyline).closed).toBe(true);
  });

  it('computes area and loop extraction for closed profiles', () => {
    const closed = {
      id: 'polyline-1',
      type: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      closed: true,
    };

    expect(getClosedProfileArea(closed)).toBe(10000);
    expect(extractProfileLoops([closed])).toHaveLength(1);
    expect(computeProfileBoundingBox(closed.points)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    });
  });

  it('extracts loops from connected lines', () => {
    const loops = extractProfileLoops([
      { id: 'line-1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'line-2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 80 },
      { id: 'line-3', type: 'line', x1: 100, y1: 80, x2: 0, y2: 80 },
      { id: 'line-4', type: 'line', x1: 0, y1: 80, x2: 0, y2: 0 },
    ]);

    expect(loops).toHaveLength(1);
    expect([...loops[0].sourceEntityIds].sort()).toEqual(['line-1', 'line-2', 'line-3', 'line-4']);
  });

  it('ignores isometric projection polylines when extracting loops', () => {
    const loops = extractProfileLoops([
      {
        id: 'polyline-1',
        type: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 100 }],
        closed: true,
        meta: { projectionMode: 'isometric', isometricPlane: 'top' },
      },
    ]);

    expect(loops).toHaveLength(0);
  });

  it('builds loop points from a closed segment set', () => {
    const loop = buildLoopFromConnectedSegments([
      { entityId: 'line-1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { entityId: 'line-2', start: { x: 100, y: 0 }, end: { x: 100, y: 80 } },
      { entityId: 'line-3', start: { x: 100, y: 80 }, end: { x: 0, y: 80 } },
      { entityId: 'line-4', start: { x: 0, y: 80 }, end: { x: 0, y: 0 } },
    ]);

    expect(loop).toHaveLength(4);
  });
});
