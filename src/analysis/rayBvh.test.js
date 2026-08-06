import { describe, expect, it } from 'vitest';
import { BVH_CONSTANTS, bruteForceIntersectsRay, bvhIntersectsRay, buildBvh } from './rayBvh';

/** Deterministic pseudo-random, so a failure is always reproducible. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomTriangles(count, seed, extent = 10000) {
  const random = makeRandom(seed);
  const positions = new Float32Array(count * 9);
  for (let index = 0; index < count * 9; index += 9) {
    const cx = (random() - 0.5) * extent;
    const cy = (random() - 0.5) * extent;
    const cz = random() * extent;
    for (let corner = 0; corner < 3; corner += 1) {
      positions[index + corner * 3] = cx + (random() - 0.5) * extent * 0.15;
      positions[index + corner * 3 + 1] = cy + (random() - 0.5) * extent * 0.15;
      positions[index + corner * 3 + 2] = cz + (random() - 0.5) * extent * 0.15;
    }
  }
  return positions;
}

/** One axis-aligned quad in the z = height plane, spanning [-half, half]. */
function quadAt(height, half = 1000) {
  return new Float32Array([
    -half,
    -half,
    height,
    half,
    -half,
    height,
    half,
    half,
    height,
    -half,
    -half,
    height,
    half,
    half,
    height,
    -half,
    half,
    height,
  ]);
}

describe('agreement with brute force', () => {
  it('matches on thousands of random rays against random geometry', () => {
    // The only test that really matters: the acceleration structure must never
    // change the answer, only the time taken to get it.
    const positions = randomTriangles(400, 12345);
    const bvh = buildBvh(positions);
    const random = makeRandom(999);

    let hits = 0;
    for (let trial = 0; trial < 3000; trial += 1) {
      const ox = (random() - 0.5) * 12000;
      const oy = (random() - 0.5) * 12000;
      const oz = (random() - 0.5) * 12000;
      let dx = random() - 0.5;
      let dy = random() - 0.5;
      let dz = random() - 0.5;
      const norm = Math.hypot(dx, dy, dz) || 1;
      dx /= norm;
      dy /= norm;
      dz /= norm;

      const expected = bruteForceIntersectsRay(positions, 400, ox, oy, oz, dx, dy, dz);
      expect(bvhIntersectsRay(bvh, ox, oy, oz, dx, dy, dz)).toBe(expected);
      if (expected) hits += 1;
    }

    // A test where nothing ever hits would pass trivially.
    expect(hits).toBeGreaterThan(200);
  });

  it('matches when the ray range is bounded', () => {
    const positions = randomTriangles(200, 4242);
    const bvh = buildBvh(positions);
    const random = makeRandom(77);

    for (let trial = 0; trial < 1500; trial += 1) {
      const ox = (random() - 0.5) * 8000;
      const oy = (random() - 0.5) * 8000;
      const oz = (random() - 0.5) * 8000;
      let dx = random() - 0.5;
      let dy = random() - 0.5;
      let dz = random() - 0.5;
      const norm = Math.hypot(dx, dy, dz) || 1;
      dx /= norm;
      dy /= norm;
      dz /= norm;
      const maxDistance = 500 + random() * 6000;

      expect(bvhIntersectsRay(bvh, ox, oy, oz, dx, dy, dz, maxDistance)).toBe(
        bruteForceIntersectsRay(positions, 200, ox, oy, oz, dx, dy, dz, maxDistance),
      );
    }
  });
});

describe('the cases a solar study actually asks', () => {
  const bvh = buildBvh(quadAt(5000));

  it('blocks a ray fired straight up at an overhead slab', () => {
    expect(bvhIntersectsRay(bvh, 0, 0, 0, 0, 0, 1)).toBe(true);
  });

  it('lets a ray past once it clears the slab edge', () => {
    expect(bvhIntersectsRay(bvh, 5000, 0, 0, 0, 0, 1)).toBe(false);
  });

  it('does not treat something behind the ray as a blocker', () => {
    // Sun below the sensor: the slab is overhead, the ray goes down.
    expect(bvhIntersectsRay(bvh, 0, 0, 0, 0, 0, -1)).toBe(false);
  });

  it('respects the distance limit', () => {
    expect(bvhIntersectsRay(bvh, 0, 0, 0, 0, 0, 1, 4000)).toBe(false);
    expect(bvhIntersectsRay(bvh, 0, 0, 0, 0, 0, 1, 6000)).toBe(true);
  });

  it('hits a back face as readily as a front face', () => {
    // The massing mesh inherits whatever winding the footprints happened to
    // have, so a one-sided test would let rays through half the building.
    const above = bvhIntersectsRay(bvh, 0, 0, 9000, 0, 0, -1);
    const below = bvhIntersectsRay(bvh, 0, 0, 0, 0, 0, 1);
    expect(above).toBe(true);
    expect(below).toBe(true);
  });

  it('handles rays running exactly along an axis', () => {
    // Axis-parallel rays produce infinite slab reciprocals; the traversal has
    // to survive that rather than returning NaN comparisons.
    const wall = buildBvh(
      new Float32Array([
        0, -1000, -1000, 0, 1000, -1000, 0, 1000, 1000, 0, -1000, -1000, 0, 1000, 1000, 0, -1000, 1000,
      ]),
    );
    expect(bvhIntersectsRay(wall, -500, 0, 0, 1, 0, 0)).toBe(true);
    expect(bvhIntersectsRay(wall, 500, 0, 0, 1, 0, 0)).toBe(false);
  });
});

describe('degenerate input', () => {
  it('reports no hit for an empty mesh', () => {
    const empty = buildBvh(new Float32Array(0));
    expect(empty.triangleCount).toBe(0);
    expect(bvhIntersectsRay(empty, 0, 0, 0, 0, 0, 1)).toBe(false);
    expect(bvhIntersectsRay(null, 0, 0, 0, 0, 0, 1)).toBe(false);
  });

  it('copes with every triangle sharing a centroid', () => {
    // The split would find no spread on any axis and could recurse forever.
    const stacked = new Float32Array(64 * 9);
    for (let triangle = 0; triangle < 64; triangle += 1) {
      stacked.set([0, 0, 0, 100, 0, 0, 0, 100, 0], triangle * 9);
    }
    const bvh = buildBvh(stacked);
    expect(bvh.nodeCount).toBeGreaterThan(0);
    expect(bvhIntersectsRay(bvh, 10, 10, -100, 0, 0, 1)).toBe(true);
  });

  it('ignores a zero-area triangle instead of dividing by zero', () => {
    const degenerate = buildBvh(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(bvhIntersectsRay(degenerate, 0, 0, -10, 0, 0, 1)).toBe(false);
  });
});

describe('the structure itself', () => {
  it('keeps leaves small enough to be worth the traversal', () => {
    const bvh = buildBvh(randomTriangles(500, 31337));
    let leaves = 0;
    let largest = 0;
    for (let node = 0; node < bvh.nodeCount; node += 1) {
      if (bvh.leftChild[node] >= 0) continue;
      leaves += 1;
      largest = Math.max(largest, bvh.length[node]);
    }
    expect(leaves).toBeGreaterThan(10);
    expect(largest).toBeLessThanOrEqual(BVH_CONSTANTS.LEAF_SIZE);
  });

  it('references every triangle exactly once', () => {
    const bvh = buildBvh(randomTriangles(300, 5150));
    const seen = new Set(Array.from(bvh.order));
    expect(seen.size).toBe(300);
  });

  it('is dramatically faster than brute force on a realistic mesh', () => {
    // Not a benchmark, a guard: if a change turned the traversal into a linear
    // scan every study would still be correct and would take minutes.
    const positions = randomTriangles(4000, 2024);
    const bvh = buildBvh(positions);
    const random = makeRandom(1);
    const rays = Array.from({ length: 2000 }, () => {
      let dx = random() - 0.5;
      let dy = random() - 0.5;
      let dz = random();
      const norm = Math.hypot(dx, dy, dz) || 1;
      return [(random() - 0.5) * 9000, (random() - 0.5) * 9000, 0, dx / norm, dy / norm, dz / norm];
    });

    const bvhStart = performance.now();
    for (const ray of rays) bvhIntersectsRay(bvh, ...ray);
    const bvhMs = performance.now() - bvhStart;

    const bruteStart = performance.now();
    for (const ray of rays) bruteForceIntersectsRay(positions, 4000, ...ray);
    const bruteMs = performance.now() - bruteStart;

    expect(bvhMs).toBeLessThan(bruteMs / 3);
  });
});
