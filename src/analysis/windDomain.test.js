import { describe, expect, it } from 'vitest';
import { createProject, createWall } from '@/domain/models';
import { rotate } from '@/geometry/point';
import { buildAnalysisMassing } from './buildingMassing';
import { computeWindStudy } from './windRunner';
import { createWindStudyState } from './windState';
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

/* -------------------------------------------------------------------------- */
/* First-principles physics: rotational symmetry of the whole wind path        */
/* -------------------------------------------------------------------------- */

/**
 * `windDirectionBasis` reads a meteorological bearing (where the wind comes
 * FROM) and negates it into the direction the air travels in a y-down model
 * space. That is exactly the kind of double convention that has silently
 * inverted analyses in this codebase before, and no behavioural test can see
 * it: a wrong-but-consistent basis still produces a plausible-looking field.
 *
 * The invariant that does see it: turning the building and the wind by the same
 * angle must produce the same flow. `flow(d + t) = R_t . flow(d)` for the
 * standard rotation matrix R_t, so rotating every model coordinate by +37 deg
 * and adding 37 deg to `directionDeg` describes one physical situation twice.
 * 37 is deliberately not a multiple of 90: an axis-aligned angle would survive
 * several sign errors that an oblique one will not.
 */
const ROTATION_DEG = 37;

/** L-shaped block, so a mirrored or transposed basis cannot pass by symmetry. */
const L_BLOCK = [
  { x: -8000, y: -3500 },
  { x: 8000, y: -3500 },
  { x: 8000, y: 3500 },
  { x: 1000, y: 3500 },
  { x: 1000, y: 8000 },
  { x: -2000, y: 8000 },
  { x: -2000, y: 3500 },
  { x: -8000, y: 3500 },
];

function rotatedBlockProject(angleDeg) {
  const project = createProject('Rotation invariance');
  const corners = L_BLOCK.map((point) => rotate(point, { x: 0, y: 0 }, angleDeg));
  project.floors[0].walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 500, { height: 9000 }),
  );
  return project;
}

function rotationSettings(directionDeg) {
  return createWindStudyState({
    enabled: true,
    mode: 'direction',
    directionDeg,
    resolution: 48,
    iterations: 150,
    domainPadding: 10000,
  });
}

/**
 * Mean and peak amplification over a disc centred on the rotation origin.
 *
 * The comparison cannot use `result.summary`: the reported summary covers the
 * whole world-aligned result grid, whose extent is the massing's axis-aligned
 * bounding box, and rotating an L by 37 deg grows that box by a third. Averaging
 * over different amounts of untouched far field would compare padding, not
 * physics. A disc is rotation-invariant and sits inside both grids.
 */
function amplificationInDisc(result, radiusMm) {
  const grid = result.grid;
  let peak = 0;
  let total = 0;
  let assessed = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.origin.y + (row + 0.5) * grid.cellSize;
    for (let column = 0; column < grid.columns; column += 1) {
      const index = row * grid.columns + column;
      if (grid.obstacles[index]) continue;
      const x = grid.origin.x + (column + 0.5) * grid.cellSize;
      if (Math.hypot(x, y) > radiusMm) continue;
      const value = grid.amplification[index];
      peak = Math.max(peak, value);
      total += value;
      assessed += 1;
    }
  }
  return { peak, mean: assessed ? total / assessed : 0, assessed };
}

describe('wind physics — rotational symmetry', () => {
  it('rasterizes the same wind-aligned domain when scene and wind turn together', () => {
    const base = buildWindDomain({
      masses: buildAnalysisMassing(rotatedBlockProject(0), { includeRoof: false }),
      directionDeg: 0,
      resolution: 48,
      domainPadding: 10000,
    });
    const turned = buildWindDomain({
      masses: buildAnalysisMassing(rotatedBlockProject(ROTATION_DEG), { includeRoof: false }),
      directionDeg: ROTATION_DEG,
      resolution: 48,
      domainPadding: 10000,
    });

    // s and t are dot products of two co-rotated vectors, so the wind-aligned
    // extents are invariant by construction — unless the basis is wrong.
    expect(turned.columns).toBe(base.columns);
    expect(turned.rows).toBe(base.rows);
    expect(turned.cellSize / base.cellSize).toBeCloseTo(1, 9);
    expect(turned.minS - base.minS).toBeCloseTo(0, 3);
    expect(turned.minT - base.minT).toBeCloseTo(0, 3);

    let solid = 0;
    let disagreeing = 0;
    for (let index = 0; index < base.obstacles.length; index += 1) {
      if (base.obstacles[index]) solid += 1;
      if (base.obstacles[index] !== turned.obstacles[index]) disagreeing += 1;
    }
    expect(solid).toBeGreaterThan(50);
    // Only cells the footprint edge clips can legitimately differ, and only
    // through rounding: a wrong basis moves hundreds of cells, not a handful.
    expect(disagreeing / solid).toBeLessThan(0.02);
  });

  it('keeps mean and peak amplification when scene and wind turn by 37 degrees', () => {
    const base = computeWindStudy({ project: rotatedBlockProject(0), windStudy: rotationSettings(0) });
    const turned = computeWindStudy({
      project: rotatedBlockProject(ROTATION_DEG),
      windStudy: rotationSettings(ROTATION_DEG),
    });

    // 12 m disc: contains the block and its near field, and fits inside both
    // result grids (the tighter one reaches 13.75 m below the origin).
    const baseDisc = amplificationInDisc(base, 12000);
    const turnedDisc = amplificationInDisc(turned, 12000);
    // Both discs must be well populated. Their cell counts are NOT equal and
    // should not be asserted to be: the world-aligned result raster needs a
    // coarser cell and more solid cells to cover an oblique wall than a
    // straight one, which is precisely why the values below have tolerances.
    expect(baseDisc.assessed).toBeGreaterThan(400);
    expect(turnedDisc.assessed).toBeGreaterThan(400);

    // Not equality: the two runs resample onto differently aligned rasters, so
    // the far field is sampled at different points. The bars are the plan's.
    const meanDelta = Math.abs(turnedDisc.mean - baseDisc.mean) / baseDisc.mean;
    const peakDelta = Math.abs(turnedDisc.peak - baseDisc.peak) / baseDisc.peak;
    expect(meanDelta).toBeLessThan(0.05);
    expect(peakDelta).toBeLessThan(0.1);
    expect(baseDisc.peak).toBeGreaterThan(1);
  });
});
