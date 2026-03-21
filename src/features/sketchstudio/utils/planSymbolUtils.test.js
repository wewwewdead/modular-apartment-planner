import { describe, expect, it } from 'vitest';
import {
  buildPlanSymbolFromParts,
  buildPlanSymbolShapeFromGenericPart,
} from './planSymbolUtils';

describe('planSymbolUtils', () => {
  it('builds polygon symbols for panel-like parts', () => {
    const shape = buildPlanSymbolShapeFromGenericPart({
      id: 'panel-1',
      role: 'panel',
      parametric: {
        origin: { x: 0, y: 0, z: 0 },
        extents: { width: 600, depth: 18, height: 900 },
      },
    });

    expect(shape.polygons).toHaveLength(1);
    expect(shape.polygons[0].points).toHaveLength(4);
  });

  it('builds circle symbols for legs', () => {
    const shape = buildPlanSymbolShapeFromGenericPart({
      id: 'leg-1',
      role: 'leg',
      parametric: {
        origin: { x: 20, y: 20, z: 0 },
        extents: { width: 40, depth: 40, height: 400 },
      },
    });

    expect(shape.circles).toHaveLength(1);
    expect(shape.circles[0].r).toBeGreaterThan(0);
  });

  it('adds template front-edge detail for cabinet helpers', () => {
    const symbol = buildPlanSymbolFromParts([{
      id: 'part-1',
      role: 'panel',
      parametric: {
        origin: { x: 0, y: 0, z: 0 },
        extents: { width: 600, depth: 400, height: 18 },
      },
    }], {
      objectLike: {
        generator: { type: 'cabinetBox' },
      },
    });

    expect(symbol.lines.some((line) => line.id === 'cabinetBox-front-edge')).toBe(true);
  });
});

