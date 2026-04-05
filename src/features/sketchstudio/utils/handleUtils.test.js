import { describe, expect, it } from 'vitest';
import { getEntityHandles, updateEntityFromHandle } from './handleUtils';

describe('handleUtils', () => {
  it('returns line and circle handles', () => {
    expect(getEntityHandles({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 })).toHaveLength(2);
    expect(getEntityHandles({ type: 'circle', cx: 50, cy: 50, r: 20 })).toHaveLength(2);
    expect(getEntityHandles({ type: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 10, rotation: 0 })).toHaveLength(3);
    expect(getEntityHandles({ type: 'text', x: 20, y: 30, text: 'Desk', fontSize: 100, rotation: 0 })).toEqual([
      expect.objectContaining({ id: 'size', x: 260, y: 150 }),
    ]);
    expect(getEntityHandles({
      type: 'text',
      x: 20,
      y: 30,
      text: 'Desk',
      fontSize: 100,
      rotation: 0,
      leader: { target: { x: -40, y: 120 } },
    })).toEqual([
      expect.objectContaining({ id: 'size', x: 260, y: 150 }),
      expect.objectContaining({ id: 'leaderTarget', x: -40, y: 120 }),
    ]);
  });

  it('updates geometry from a dragged line handle', () => {
    const updated = updateEntityFromHandle({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, 'end', { x: 120, y: 30 });

    expect(updated).toMatchObject({ x2: 120, y2: 30 });
  });

  it('updates circle radius from handle drag', () => {
    const updated = updateEntityFromHandle({ type: 'circle', cx: 50, cy: 50, r: 20 }, 'radius', { x: 80, y: 50 });

    expect(updated.r).toBe(30);
  });

  it('updates text font size from the resize handle', () => {
    const updated = updateEntityFromHandle(
      { type: 'text', x: 20, y: 30, text: 'Desk', fontSize: 100, rotation: 0 },
      'size',
      { x: 308, y: 174 },
    );

    expect(updated.fontSize).toBeCloseTo(120, 4);
  });

  it('scales the full text leader when resized from the size handle', () => {
    const updated = updateEntityFromHandle(
      {
        type: 'text',
        x: 20,
        y: 30,
        text: 'Desk',
        fontSize: 100,
        rotation: 0,
        leader: { target: { x: -40, y: 120 } },
      },
      'size',
      { x: 308, y: 174 },
    );

    expect(updated.fontSize).toBeCloseTo(120, 4);
    expect(updated.leader?.target.x).toBeCloseTo(-52, 4);
    expect(updated.leader?.target.y).toBeCloseTo(138, 4);
  });

  it('updates the text leader target from the leader handle', () => {
    const updated = updateEntityFromHandle(
      {
        type: 'text',
        x: 20,
        y: 30,
        text: 'Desk',
        fontSize: 100,
        rotation: 0,
        leader: { target: { x: -40, y: 120 } },
      },
      'leaderTarget',
      { x: 80, y: 90 },
    );

    expect(updated.leader?.target).toEqual({ x: 80, y: 90 });
  });
});
