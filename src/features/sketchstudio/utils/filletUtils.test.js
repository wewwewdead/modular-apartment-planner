import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILLET_RADIUS,
  MIN_FILLET_RADIUS,
  MAX_FILLET_RADIUS,
  FILLET_RADIUS_STEP,
  findFilletableCorner,
  computeSketchFillet,
  applyFillet,
} from './filletUtils';

describe('filletUtils', () => {
  describe('constants', () => {
    it('exports expected defaults', () => {
      expect(DEFAULT_FILLET_RADIUS).toBe(50);
      expect(MIN_FILLET_RADIUS).toBe(5);
      expect(MAX_FILLET_RADIUS).toBe(1000);
      expect(FILLET_RADIUS_STEP).toBe(10);
    });
  });

  describe('findFilletableCorner', () => {
    it('finds a line-line corner at a shared endpoint', () => {
      const entities = [
        { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
        { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
      ];
      const corner = findFilletableCorner(entities, { x: 100, y: 0 }, 5);
      expect(corner).not.toBeNull();
      expect(corner.type).toBe('line-line');
      expect(corner.cornerPoint.x).toBeCloseTo(100);
      expect(corner.cornerPoint.y).toBeCloseTo(0);
    });

    it('returns null when no corner is near the point', () => {
      const entities = [
        { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
        { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
      ];
      const corner = findFilletableCorner(entities, { x: 500, y: 500 }, 5);
      expect(corner).toBeNull();
    });

    it('returns null with fewer than 2 lines', () => {
      const entities = [{ id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }];
      const corner = findFilletableCorner(entities, { x: 100, y: 0 }, 5);
      expect(corner).toBeNull();
    });

    it('finds a polyline vertex corner', () => {
      const entities = [
        {
          id: 'p1',
          type: 'polyline',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ];
      const corner = findFilletableCorner(entities, { x: 100, y: 0 }, 5);
      expect(corner).not.toBeNull();
      expect(corner.type).toBe('polyline-vertex');
    });

    it('finds a rect corner', () => {
      const entities = [
        { id: 'r1', type: 'rect', x: 0, y: 0, width: 100, height: 80, rotation: 0 },
      ];
      const corner = findFilletableCorner(entities, { x: 0, y: 0 }, 5);
      expect(corner).not.toBeNull();
      expect(corner.type).toBe('rect-corner');
    });
  });

  describe('computeSketchFillet', () => {
    it('computes fillet geometry for a 90-degree line-line corner', () => {
      const corner = {
        type: 'line-line',
        cornerPoint: { x: 100, y: 0 },
        entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
        entity1Endpoint: 'end',
        entity2: { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100 },
        entity2Endpoint: 'start',
      };
      const result = computeSketchFillet(corner, 20);
      expect(result).not.toBeNull();
      expect(result.tangentPoint1).toBeDefined();
      expect(result.tangentPoint2).toBeDefined();
      expect(result.controlPoint).toBeDefined();
      expect(result.radius).toBeCloseTo(20);
    });

    it('returns null for nearly parallel edges', () => {
      const corner = {
        type: 'line-line',
        cornerPoint: { x: 100, y: 0 },
        entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
        entity1Endpoint: 'end',
        entity2: { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 200, y2: 0.01 },
        entity2Endpoint: 'start',
      };
      const result = computeSketchFillet(corner, 20);
      expect(result).toBeNull();
    });

    it('auto-clamps radius when edges are too short', () => {
      const corner = {
        type: 'line-line',
        cornerPoint: { x: 10, y: 0 },
        entity1: { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
        entity1Endpoint: 'end',
        entity2: { id: 'l2', type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
        entity2Endpoint: 'start',
      };
      const result = computeSketchFillet(corner, 50);
      expect(result).not.toBeNull();
      expect(result.radius).toBeLessThan(50);
    });

    it('computes fillet for a polyline vertex', () => {
      const corner = {
        type: 'polyline-vertex',
        cornerPoint: { x: 100, y: 0 },
        prevPoint: { x: 0, y: 0 },
        nextPoint: { x: 100, y: 100 },
      };
      const result = computeSketchFillet(corner, 20);
      expect(result).not.toBeNull();
      expect(result.tangentPoint1.x).toBeLessThan(100);
      expect(result.tangentPoint2.y).toBeGreaterThan(0);
    });
  });

  describe('applyFillet', () => {
    it('trims two lines and adds an arc entity', () => {
      const entities = [
        { id: 'l1', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, visible: true },
        { id: 'l2', type: 'line', x1: 100, y1: 0, x2: 100, y2: 100, visible: true },
      ];
      const corner = {
        type: 'line-line',
        cornerPoint: { x: 100, y: 0 },
        entity1: entities[0],
        entity1Endpoint: 'end',
        entity2: entities[1],
        entity2Endpoint: 'start',
      };
      const geometry = {
        tangentPoint1: { x: 80, y: 0 },
        tangentPoint2: { x: 100, y: 20 },
        controlPoint: { x: 100, y: 0 },
        radius: 20,
      };
      const result = applyFillet(entities, corner, geometry, 'default');
      expect(result.length).toBe(3);
      const arc = result.find((e) => e.type === 'arc');
      expect(arc).toBeDefined();
    });
  });
});
