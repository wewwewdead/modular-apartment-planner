import { describe, expect, it } from 'vitest';
import { distancePointToSegment, findTopmostEntityAtPoint, hitTestCircle, hitTestEllipse, hitTestLine, hitTestRect, hitTestText } from './hitTest';

describe('hitTest', () => {
  it('computes distance from a point to a segment', () => {
    expect(distancePointToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4);
  });

  it('hit tests lines with tolerance', () => {
    expect(hitTestLine({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, { x: 50, y: 3 }, 4)).toBe(true);
    expect(hitTestLine({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, { x: 50, y: 6 }, 4)).toBe(false);
  });

  it('hit tests rects and circles', () => {
    expect(hitTestRect({ type: 'rect', x: 10, y: 20, width: 40, height: 30 }, { x: 15, y: 25 }, 2)).toBe(true);
    expect(hitTestCircle({ type: 'circle', cx: 50, cy: 50, r: 20 }, { x: 60, y: 60 }, 2)).toBe(true);
    expect(hitTestEllipse({ type: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 10, rotation: 0 }, { x: 65, y: 50 }, 2)).toBe(true);
  });

  it('hit tests text labels using their approximated text box', () => {
    expect(hitTestText({ type: 'text', x: 100, y: 40, text: 'Desk', fontSize: 100, rotation: 0 }, { x: 120, y: 70 }, 2)).toBe(true);
    expect(hitTestText({ type: 'text', x: 100, y: 40, text: 'Desk', fontSize: 100, rotation: 0 }, { x: 10, y: 10 }, 2)).toBe(false);
  });

  it('returns the topmost matching entity', () => {
    const entities = [
      { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 50, height: 50 },
      { id: 'circle-1', type: 'circle', cx: 25, cy: 25, r: 15 },
    ];

    expect(findTopmostEntityAtPoint(entities, { x: 25, y: 25 }, 2)?.id).toBe('circle-1');
  });
});
