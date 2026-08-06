import { describe, it, expect } from 'vitest';
import {
  shadowOffset,
  massShadowPieces,
  castShadows,
  shadowRangeEnvelope,
  sunHoursGrid,
  shadowArea,
  shadowCoverageOfPlot,
} from './shadowProjection';
import { multiPolygonArea } from '@/geometry/polygonBoolean';

const DEG = Math.PI / 180;

/** A 10 m x 10 m footprint at the origin, extruded to `height` mm. */
function box(height, { base = 0, origin = { x: 0, y: 0 }, size = 10000 } = {}) {
  const footprint = [
    { x: origin.x, y: origin.y },
    { x: origin.x + size, y: origin.y },
    { x: origin.x + size, y: origin.y + size },
    { x: origin.x, y: origin.y + size },
  ];
  return {
    id: 'box',
    footprint,
    holes: [],
    baseElevation: base,
    topElevations: footprint.map(() => height),
    sloped: false,
  };
}

function courtyardMass(height = 1000) {
  const footprint = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  return {
    id: 'courtyard',
    footprint,
    holes: [
      [
        { x: 3000, y: 3000 },
        { x: 7000, y: 3000 },
        { x: 7000, y: 7000 },
        { x: 3000, y: 7000 },
      ],
    ],
    baseElevation: 0,
    topElevations: footprint.map(() => height),
    sloped: false,
  };
}

function boundsOf(regions) {
  const points = regions.flatMap((region) => region.outline);
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

describe('shadowOffset', () => {
  it('points north when the sun is due south', () => {
    // North up (northAngle 0), sun due south at 45 degrees: a 10 m point casts
    // 10 m of shadow straight up the screen, which is north.
    const offset = shadowOffset({ altitude: 45 * DEG, azimuth: 180 * DEG, northAngle: 0, height: 10000 });

    expect(offset.x).toBeCloseTo(0, 6);
    expect(offset.y).toBeCloseTo(-10000, 6);
  });

  it('points west when the sun is due east', () => {
    const offset = shadowOffset({ altitude: 45 * DEG, azimuth: 90 * DEG, northAngle: 0, height: 10000 });

    expect(offset.x).toBeCloseTo(-10000, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });

  it('scales shadow length as height over tan(altitude)', () => {
    const steep = shadowOffset({ altitude: 60 * DEG, azimuth: 180 * DEG, height: 10000 });
    const shallow = shadowOffset({ altitude: 30 * DEG, azimuth: 180 * DEG, height: 10000 });

    expect(Math.hypot(steep.x, steep.y)).toBeCloseTo(10000 / Math.tan(60 * DEG), 6);
    expect(Math.hypot(shallow.x, shallow.y)).toBeCloseTo(10000 / Math.tan(30 * DEG), 6);
    expect(Math.hypot(shallow.x, shallow.y)).toBeGreaterThan(Math.hypot(steep.x, steep.y));
  });

  it('rotates with the site north angle', () => {
    // Turning north 90 degrees clockwise turns every bearing with it, so a
    // south sun now throws its shadow toward screen-right.
    const offset = shadowOffset({ altitude: 45 * DEG, azimuth: 180 * DEG, northAngle: 90, height: 10000 });

    expect(offset.x).toBeCloseTo(10000, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });

  it('returns no displacement at ground level or with the sun down', () => {
    expect(shadowOffset({ altitude: 45 * DEG, azimuth: 0, height: 0 })).toEqual({ x: 0, y: 0 });
    expect(shadowOffset({ altitude: -5 * DEG, azimuth: 0, height: 10000 })).toEqual({ x: 0, y: 0 });
  });
});

describe('castShadows', () => {
  it('casts nothing when the sun is below the horizon', () => {
    expect(castShadows([box(10000)], { altitude: -1 * DEG, azimuth: 0 })).toEqual([]);
    expect(castShadows([box(10000)], { altitude: 0.5 * DEG, azimuth: 0 })).toEqual([]);
  });

  it('always covers the ground the building stands on', () => {
    const regions = castShadows([box(10000)], { altitude: 45 * DEG, azimuth: 180 * DEG });
    const bounds = boundsOf(regions);

    // The footprint spans 0..10000 in both axes and must fall inside the shadow.
    expect(bounds.minX).toBeLessThanOrEqual(0);
    expect(bounds.maxX).toBeGreaterThanOrEqual(10000);
    expect(bounds.maxY).toBeGreaterThanOrEqual(10000);
  });

  it('produces the exact area of a swept box shadow', () => {
    // A 10 m square, 10 m tall, sun due south at 45 degrees: the shadow is the
    // footprint swept 10 m north — a 10 m x 20 m rectangle, 200 m².
    const regions = castShadows([box(10000)], { altitude: 45 * DEG, azimuth: 180 * DEG });

    expect(shadowArea(regions)).toBeCloseTo(10000 * 20000, -3);
  });

  it('lengthens the shadow as the sun drops', () => {
    const high = shadowArea(castShadows([box(10000)], { altitude: 60 * DEG, azimuth: 180 * DEG }));
    const low = shadowArea(castShadows([box(10000)], { altitude: 20 * DEG, azimuth: 180 * DEG }));

    expect(low).toBeGreaterThan(high);
  });

  it('merges overlapping buildings into one shadow region', () => {
    const masses = [box(10000), box(10000, { origin: { x: 5000, y: 0 } })];
    const regions = castShadows(masses, { altitude: 45 * DEG, azimuth: 180 * DEG });

    expect(regions).toHaveLength(1);
    // 15 m wide once merged, swept 10 m north over a 10 m depth.
    expect(shadowArea(regions)).toBeCloseTo(15000 * 20000, -3);
  });

  it('keeps well-separated buildings as separate regions', () => {
    const masses = [box(10000), box(10000, { origin: { x: 80000, y: 0 } })];
    const regions = castShadows(masses, { altitude: 45 * DEG, azimuth: 180 * DEG });

    expect(regions).toHaveLength(2);
  });

  it('keeps an open courtyard unshaded where no inner wall reaches it', () => {
    const regions = castShadows([courtyardMass()], { altitude: 45 * DEG, azimuth: 180 * DEG });
    const courtyardCenter = { x: 5000, y: 5000 };

    expect(regions).toHaveLength(1);
    expect(regions[0].holes.length).toBeGreaterThan(0);
    expect(regions[0].holes.some((hole) => hole.some((point) => point.y > courtyardCenter.y))).toBe(true);
    expect(shadowArea(regions)).toBeLessThan(10000 * 11000);
  });

  it('subtracts the full courtyard under an overhead sun', () => {
    const regions = castShadows([courtyardMass()], { altitude: Math.PI / 2, azimuth: 180 * DEG });

    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(1);
    expect(shadowArea(regions)).toBeCloseTo(10000 * 10000 - 4000 * 4000, -3);
  });

  it('detaches the shadow of an elevated mass from its footprint', () => {
    // A slab floating 20 m up with a 5 m rise, sun at 45 degrees: its shadow
    // starts 20 m north of the footprint, not on it.
    const elevated = box(25000, { base: 20000 });
    const regions = castShadows([elevated], { altitude: 45 * DEG, azimuth: 180 * DEG });
    const bounds = boundsOf(regions);

    expect(bounds.maxY).toBeCloseTo(10000 - 20000, -2);
    expect(bounds.minY).toBeCloseTo(-25000, -2);
  });

  it('projects each roof vertex from its own height, not a single ridge height', () => {
    // A shed roof over a 10 m square, low edge 3 m, high edge 8 m. With north
    // up and the sun due south at 45 degrees, shadows run north (-y) by exactly
    // the height of whatever casts them, so the shadow's northern tip pins down
    // which edge the projection actually used.
    const footprint = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const shedRidgeSouth = {
      id: 'shed-south',
      footprint,
      holes: [],
      baseElevation: 3000,
      topElevations: [3000, 3000, 8000, 8000],
      sloped: true,
    };
    const shedRidgeNorth = { ...shedRidgeSouth, id: 'shed-north', topElevations: [8000, 8000, 3000, 3000] };
    const sun = { altitude: 45 * DEG, azimuth: 180 * DEG };

    // Ridge on the far (south) side: the near edge is only 3 m up, so the
    // shadow reaches just 3 m past the building.
    expect(boundsOf(castShadows([shedRidgeSouth], sun)).minY).toBeCloseTo(-3000, -2);

    // Flip the ridge to the north edge and the same roof throws 8 m instead.
    expect(boundsOf(castShadows([shedRidgeNorth], sun)).minY).toBeCloseTo(-8000, -2);

    // A box at ridge height over-shades whenever the ridge is on the far side —
    // which is exactly the error a flat-prism approximation would make.
    const flat = castShadows([box(8000, { base: 3000 })], sun);
    expect(shadowArea(castShadows([shedRidgeSouth], sun))).toBeLessThan(shadowArea(flat));
    expect(shadowArea(castShadows([shedRidgeNorth], sun))).toBeCloseTo(shadowArea(flat), -3);
  });
});

describe('massShadowPieces', () => {
  it('emits both caps plus one quad per footprint edge', () => {
    const pieces = massShadowPieces(box(10000), { altitude: 45 * DEG, azimuth: 180 * DEG });

    expect(pieces).toHaveLength(2 + 4);
  });

  it('emits nothing for a degenerate footprint', () => {
    const degenerate = { footprint: [{ x: 0, y: 0 }], topElevations: [1000], baseElevation: 0 };

    expect(massShadowPieces(degenerate, { altitude: 45 * DEG, azimuth: 180 * DEG })).toEqual([]);
  });
});

describe('shadowRangeEnvelope', () => {
  it('covers at least as much ground as any single moment within it', () => {
    const masses = [box(10000)];
    const samples = [
      { altitude: 30 * DEG, azimuth: 90 * DEG },
      { altitude: 60 * DEG, azimuth: 180 * DEG },
      { altitude: 30 * DEG, azimuth: 270 * DEG },
    ];

    const envelope = shadowRangeEnvelope(masses, samples);
    const envelopeArea = shadowArea(envelope);

    for (const sample of samples) {
      expect(envelopeArea).toBeGreaterThanOrEqual(shadowArea(castShadows(masses, sample)) - 1);
    }
  });

  it('sweeps a fan from east through west across a day', () => {
    const samples = [
      { altitude: 20 * DEG, azimuth: 90 * DEG },
      { altitude: 50 * DEG, azimuth: 180 * DEG },
      { altitude: 20 * DEG, azimuth: 270 * DEG },
    ];
    const bounds = boundsOf(shadowRangeEnvelope([box(10000)], samples));

    // Morning sun in the east throws shadow west, evening sun the other way.
    expect(bounds.minX).toBeLessThan(-20000);
    expect(bounds.maxX).toBeGreaterThan(30000);
  });

  it('ignores samples with the sun below the horizon', () => {
    const samples = [
      { altitude: 45 * DEG, azimuth: 180 * DEG },
      { altitude: -10 * DEG, azimuth: 300 * DEG },
    ];
    const envelope = shadowRangeEnvelope([box(10000)], samples);

    expect(shadowArea(envelope)).toBeCloseTo(10000 * 20000, -3);
  });

  it('does not fill a courtyard while unioning the daily envelope', () => {
    const overhead = { altitude: Math.PI / 2, azimuth: 180 * DEG };
    const envelope = shadowRangeEnvelope([courtyardMass()], [overhead, overhead]);

    expect(envelope).toHaveLength(1);
    expect(envelope[0].holes).toHaveLength(1);
    expect(shadowArea(envelope)).toBeCloseTo(10000 * 10000 - 4000 * 4000, -3);
  });
});

describe('sunHoursGrid', () => {
  const openBounds = { minX: -40000, minY: -40000, maxX: 40000, maxY: 40000 };

  it('gives full daylight hours to open ground with no buildings', () => {
    const samples = Array.from({ length: 8 }, (_, index) => ({
      altitude: 45 * DEG,
      azimuth: (60 + index * 15) * DEG,
    }));
    const grid = sunHoursGrid({ masses: [], sunSamples: samples, bounds: openBounds, cellSize: 5000, stepMinutes: 60 });

    expect(grid.maxHours).toBeCloseTo(8, 5);
    expect(grid.compliantFraction).toBe(1);
  });

  it('records fewer sun hours under a building than in the open', () => {
    const samples = Array.from({ length: 8 }, (_, index) => ({
      altitude: 45 * DEG,
      azimuth: (120 + index * 15) * DEG,
    }));
    const grid = sunHoursGrid({
      masses: [box(10000)],
      sunSamples: samples,
      bounds: openBounds,
      cellSize: 2500,
      stepMinutes: 60,
    });

    const cellAt = (x, y) => {
      const column = Math.floor((x - grid.origin.x) / grid.cellSize);
      const row = Math.floor((y - grid.origin.y) / grid.cellSize);
      return grid.hours[row * grid.columns + column];
    };

    // Directly under the building: permanently shaded.
    expect(cellAt(5000, 5000)).toBe(0);
    // Far to the south, upwind of every shadow: never shaded.
    expect(cellAt(5000, 35000)).toBeCloseTo(8, 5);
    // Just north of the building: shaded some of the time, not all.
    const north = cellAt(5000, -5000);
    expect(north).toBeGreaterThan(0);
    expect(north).toBeLessThan(8);
  });

  it('coarsens the grid rather than exceeding the cell budget', () => {
    const grid = sunHoursGrid({
      masses: [],
      sunSamples: [{ altitude: 45 * DEG, azimuth: 180 * DEG }],
      bounds: { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000 },
      cellSize: 100,
      maxCells: 10000,
    });

    expect(grid.columns * grid.rows).toBeLessThanOrEqual(10000);
    expect(grid.cellSize).toBeGreaterThan(100);
  });

  it('masks cells outside a target and area-weights compliance', () => {
    const targetPolygon = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ];
    const grid = sunHoursGrid({
      masses: [],
      sunSamples: [
        { altitude: 45 * DEG, azimuth: 120 * DEG },
        { altitude: 45 * DEG, azimuth: 180 * DEG },
      ],
      bounds: { minX: 0, minY: 0, maxX: 20000, maxY: 20000 },
      targetPolygon,
      cellSize: 10000,
      stepMinutes: 60,
      thresholdHours: 2,
    });

    expect(Array.from(grid.mask)).toEqual([1, 0, 0, 0]);
    expect(grid.assessedAreaMm2).toBeCloseTo(10000 * 10000, -3);
    expect(grid.targetAreaMm2).toBeCloseTo(grid.assessedAreaMm2, -3);
    expect(grid.compliantAreaMm2).toBeCloseTo(grid.assessedAreaMm2, -3);
    expect(grid.compliantFraction).toBe(1);
    expect(grid.meanSunHours).toBeCloseTo(2, 5);
  });

  it('returns null without usable bounds', () => {
    expect(sunHoursGrid({ masses: [], sunSamples: [], bounds: null })).toBeNull();
    expect(sunHoursGrid({ masses: [], sunSamples: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } })).toBeNull();
  });
});

describe('shadowCoverageOfPlot', () => {
  const neighbour = [
    { x: 0, y: -30000 },
    { x: 10000, y: -30000 },
    { x: 10000, y: -20000 },
    { x: 0, y: -20000 },
  ];

  it('reports nothing when the shadow falls elsewhere', () => {
    const regions = castShadows([box(10000)], { altitude: 45 * DEG, azimuth: 0 });

    expect(shadowCoverageOfPlot(regions, neighbour)).toBe(0);
  });

  it('reports full coverage when the shadow swallows the plot', () => {
    // A 40 m tower with the sun low in the south throws shadow far to the north.
    const regions = castShadows([box(40000)], { altitude: 30 * DEG, azimuth: 180 * DEG });

    expect(shadowCoverageOfPlot(regions, neighbour)).toBeCloseTo(1, 3);
  });

  it('reports a partial fraction for a partly shaded plot', () => {
    const regions = castShadows([box(25000)], { altitude: 45 * DEG, azimuth: 180 * DEG });
    const coverage = shadowCoverageOfPlot(regions, neighbour);

    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });

  it('discounts holes in the shadow', () => {
    const ring = [{ outline: neighbour, holes: [] }];
    const withHole = [
      {
        outline: neighbour,
        holes: [
          [
            { x: 2000, y: -28000 },
            { x: 8000, y: -28000 },
            { x: 8000, y: -22000 },
            { x: 2000, y: -22000 },
          ],
        ],
      },
    ];

    expect(shadowCoverageOfPlot(ring, neighbour)).toBeCloseTo(1, 3);
    expect(shadowCoverageOfPlot(withHole, neighbour)).toBeLessThan(0.7);
  });
});

describe('shadowArea', () => {
  it('subtracts holes from the covered ground', () => {
    const regions = [
      {
        outline: [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
          { x: 10000, y: 10000 },
          { x: 0, y: 10000 },
        ],
        holes: [
          [
            { x: 2000, y: 2000 },
            { x: 4000, y: 2000 },
            { x: 4000, y: 4000 },
            { x: 2000, y: 4000 },
          ],
        ],
      },
    ];

    expect(shadowArea(regions)).toBe(10000 * 10000 - 2000 * 2000);
    expect(multiPolygonArea(regions)).toBe(shadowArea(regions));
  });
});
