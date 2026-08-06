import { describe, expect, it } from 'vitest';
import { buildWindDomain, massesAtSlice, sampleLocalFieldAtWorld, windDirectionBasis } from './windDomain';

const ring = {
  footprint: [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ],
  holes: [
    [
      { x: 3000, y: 3000 },
      { x: 7000, y: 3000 },
      { x: 7000, y: 7000 },
      { x: 3000, y: 7000 },
    ],
  ],
  baseElevation: 0,
  topElevations: [9000, 9000, 9000, 9000],
};

describe('wind domain', () => {
  it('converts meteorological directions into model flow vectors', () => {
    expect(windDirectionBasis(0).flow.x).toBeCloseTo(0, 8);
    expect(windDirectionBasis(0).flow.y).toBeCloseTo(1, 8);
    expect(windDirectionBasis(90).flow.x).toBeCloseTo(-1, 8);
    expect(windDirectionBasis(90).flow.y).toBeCloseTo(0, 8);
  });

  it('keeps only masses crossing pedestrian height', () => {
    const highCanopy = { ...ring, baseElevation: 3000, topElevations: [4000, 4000, 4000, 4000] };
    expect(massesAtSlice([ring, highCanopy], 1500)).toEqual([ring]);
  });

  it('rasterizes walls but leaves the courtyard fluid', () => {
    const domain = buildWindDomain({
      masses: [ring],
      directionDeg: 0,
      sliceHeight: 1500,
      resolution: 100,
      domainPadding: 5000,
    });
    const field = domain.obstacles;
    expect(sampleLocalFieldAtWorld(domain, field, 1000, 1000, 0)).toBe(1);
    expect(sampleLocalFieldAtWorld(domain, field, 5000, 5000, 1)).toBe(0);
    expect(sampleLocalFieldAtWorld(domain, field, -3000, -3000, 1)).toBe(0);
  });

  it('does not lose a wall thinner than one CFD cell', () => {
    const thinWall = {
      ...ring,
      footprint: [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
        { x: 10000, y: 200 },
        { x: 0, y: 200 },
      ],
      holes: [],
    };
    const domain = buildWindDomain({
      masses: [thinWall],
      directionDeg: 0,
      resolution: 32,
      domainPadding: 10000,
    });
    expect(domain.cellSize).toBeGreaterThan(200);
    expect(domain.obstacles.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });
});
