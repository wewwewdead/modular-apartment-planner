import { describe, it, expect } from 'vitest';
import { buildAnalysisMassing, massingBounds, massingTopElevation } from './buildingMassing';
import { createWall, createColumn, createSlab } from '@/domain/models';
import { multiPolygonArea } from '@/geometry/polygonBoolean';

/**
 * A closed 10 m x 10 m box of walls. Wall centrelines run corner to corner, so
 * the outer face sits half a wall thickness beyond each corner.
 */
function squareWalls({ size = 10000, thickness = 200, height = 3000 } = {}) {
  const corners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  return corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], thickness, { height }),
  );
}

function floorOf(overrides = {}) {
  return {
    id: 'floor_1',
    elevation: 0,
    floorToFloorHeight: 3000,
    walls: [],
    columns: [],
    slabs: [],
    ...overrides,
  };
}

describe('buildAnalysisMassing', () => {
  it('returns nothing for an empty project', () => {
    expect(buildAnalysisMassing({ floors: [] })).toEqual([]);
    expect(buildAnalysisMassing({})).toEqual([]);
  });

  it('merges a ring of equal-height walls into one mass', () => {
    const masses = buildAnalysisMassing({ floors: [floorOf({ walls: squareWalls() })] });

    expect(masses).toHaveLength(1);
    expect(masses[0].baseElevation).toBe(0);
    expect(new Set(masses[0].topElevations)).toEqual(new Set([3000]));
    expect(masses[0].sloped).toBe(false);
  });

  it('leaves the courtyard inside a closed ring as a hole', () => {
    const [mass] = buildAnalysisMassing({ floors: [floorOf({ walls: squareWalls() })] });

    expect(mass.holes).toHaveLength(1);

    // Wall outlines run corner to corner along the centreline, so the four
    // rectangles are each 10 m x 200 mm and overlap in a 100 mm square at every
    // corner — the union is not a tidy 10.2 m ring.
    const wallArea = 4 * 10000 * 200;
    const cornerOverlap = 4 * 100 * 100;
    expect(multiPolygonArea([{ outline: mass.footprint, holes: mass.holes }])).toBeCloseTo(
      wallArea - cornerOverlap,
      -3,
    );
  });

  it('separates walls of different heights into their own masses', () => {
    const walls = [
      ...squareWalls({ height: 3000 }),
      createWall({ x: 20000, y: 0 }, { x: 30000, y: 0 }, 200, { height: 9000 }),
    ];
    const masses = buildAnalysisMassing({ floors: [floorOf({ walls })] });

    expect(masses).toHaveLength(2);
    expect(masses.map((mass) => Math.max(...mass.topElevations)).sort((a, b) => a - b)).toEqual([3000, 9000]);
  });

  it('offsets upper floors by their elevation', () => {
    const project = {
      floors: [
        floorOf({ id: 'ground', elevation: 0, walls: squareWalls() }),
        floorOf({ id: 'first', elevation: 3000, walls: squareWalls() }),
      ],
    };
    const masses = buildAnalysisMassing(project);

    expect(masses).toHaveLength(2);
    expect(masses.map((mass) => mass.baseElevation).sort((a, b) => a - b)).toEqual([0, 3000]);
    expect(massingTopElevation(masses)).toBe(6000);
  });

  it('drops solids too short to shade anything', () => {
    // A 50 mm kerb is below the minimum mass height and should not appear.
    const walls = [createWall({ x: 0, y: 0 }, { x: 10000, y: 0 }, 200, { height: 50 })];

    expect(buildAnalysisMassing({ floors: [floorOf({ walls })] })).toEqual([]);
  });

  it('includes free-standing columns by default and drops them on request', () => {
    const floor = floorOf({ columns: [createColumn(5000, 5000, 400, 400, { height: 3000 })] });

    expect(buildAnalysisMassing({ floors: [floor] })).toHaveLength(1);
    expect(buildAnalysisMassing({ floors: [floor] }, { includeColumns: false })).toEqual([]);
  });

  it('treats an elevated slab as a shading solid at its own elevation', () => {
    const balcony = createSlab(
      'floor_1',
      [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 2000 },
        { x: 0, y: 2000 },
      ],
      200,
      2800,
    );
    const floor = floorOf({ id: 'floor_1', elevation: 3000, slabs: [balcony] });

    const [mass] = buildAnalysisMassing({ floors: [floor] });
    // Floor elevation plus the slab's own offset within that floor.
    expect(mass.baseElevation).toBe(5800);
    expect(buildAnalysisMassing({ floors: [floor] }, { includeSlabs: false })).toEqual([]);
  });

  it('restricts to the requested floors', () => {
    const project = {
      floors: [
        floorOf({ id: 'ground', elevation: 0, walls: squareWalls() }),
        floorOf({ id: 'first', elevation: 3000, walls: squareWalls() }),
      ],
    };
    const masses = buildAnalysisMassing(project, { floorIds: ['first'] });

    expect(masses).toHaveLength(1);
    expect(masses[0].baseElevation).toBe(3000);
  });

  it('survives a roof system it cannot solve', () => {
    // Roof topology is the most failure-prone geometry in the app; a study that
    // omits the roof beats one that throws mid-render.
    const project = {
      floors: [floorOf({ walls: squareWalls() })],
      roofSystem: { boundaryPolygon: [{ x: 0, y: 0 }], roofType: 'hip' },
    };

    expect(() => buildAnalysisMassing(project)).not.toThrow();
    expect(buildAnalysisMassing(project)).toHaveLength(1);
  });

  it('adds sloped roof planes with per-vertex top elevations', () => {
    // Roof slope is a percentage in this model, not a ratio.
    const project = {
      floors: [],
      roofSystem: {
        id: 'roof_1',
        roofType: 'gable',
        baseElevation: 3000,
        slabThickness: 0,
        boundaryPolygon: [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 8000 },
          { x: 0, y: 8000 },
        ],
        pitch: { slope: 50, direction: { x: 0, y: 1 }, ridgeOffset: 0, overhang: 0 },
      },
    };

    const masses = buildAnalysisMassing(project);

    // A gable resolves to two planes, each sloping away from the ridge.
    expect(masses.length).toBe(2);
    for (const mass of masses) {
      expect(mass.id.startsWith('roof:')).toBe(true);
      expect(mass.topElevations).toHaveLength(mass.footprint.length);
      expect(mass.sloped).toBe(true);
      expect(Math.max(...mass.topElevations)).toBeGreaterThan(mass.baseElevation);
    }
    // The ridge sits above the eaves the roof springs from.
    expect(massingTopElevation(masses)).toBeGreaterThan(3000);
  });

  it('keeps a flat roof slab, which can overhang the walls below', () => {
    const project = {
      floors: [],
      roofSystem: {
        id: 'roof_flat',
        roofType: 'flat',
        baseElevation: 3000,
        slabThickness: 200,
        boundaryPolygon: [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 8000 },
          { x: 0, y: 8000 },
        ],
        pitch: { slope: 0, direction: { x: 0, y: 1 }, ridgeOffset: 0, overhang: 0 },
      },
    };

    const masses = buildAnalysisMassing(project);

    expect(masses).toHaveLength(1);
    expect(masses[0].sloped).toBe(false);
    expect(masses[0].baseElevation).toBe(3000);
    expect(Math.max(...masses[0].topElevations)).toBe(3200);
  });
});

describe('massingBounds', () => {
  it('spans every mass footprint', () => {
    const project = {
      floors: [
        floorOf({
          walls: [...squareWalls(), createWall({ x: 20000, y: 0 }, { x: 30000, y: 0 }, 200, { height: 3000 })],
        }),
      ],
    };
    const bounds = massingBounds(buildAnalysisMassing(project));

    expect(bounds.minX).toBeLessThanOrEqual(-100);
    expect(bounds.maxX).toBeGreaterThanOrEqual(30000);
  });

  it('is null when there is nothing to shade', () => {
    expect(massingBounds([])).toBeNull();
  });
});
