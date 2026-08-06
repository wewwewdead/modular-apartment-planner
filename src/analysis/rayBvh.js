/**
 * A bounding volume hierarchy over triangles, with an any-hit shadow-ray query.
 *
 * A solar study asks one question millions of times: *is anything between this
 * sensor and the sun?* Answered by testing every triangle it is quadratic in
 * the building and takes minutes; answered against a BVH it is logarithmic and
 * takes seconds. That is the whole reason this file exists.
 *
 * **Why not `three-mesh-bvh`.** It is the obvious choice and it is good, but it
 * would pull Three.js into `src/analysis/`, and the first line of
 * `buildingMassing.js` explains why that boundary is worth keeping: analysis
 * takes dumb geometry it can project and sample, so a change to how the model
 * *looks* can never quietly change what a study *computes*. A median-split BVH
 * with an ordered traversal is two hundred lines, has the same asymptotics, is
 * testable against brute force, and keeps the worker bundle free of a renderer.
 *
 * **Any-hit, not closest-hit.** A shadow ray does not care which triangle
 * blocks it or how far away, only that one does, so traversal returns the
 * moment anything is hit. That is worth roughly a factor of two over finding
 * the nearest intersection and throwing the distance away.
 *
 * Everything is flat typed arrays. Millions of queries make object allocation
 * the dominant cost, so there is none in the hot path.
 */

/** Triangles per leaf. Below this, testing them all beats splitting again. */
const LEAF_SIZE = 8;

/** Candidate split positions evaluated per axis. */
const SPLIT_BINS = 12;

/** Guards against zero-area triangles and rays that graze an edge. */
const EPSILON = 1e-9;

/**
 * Build a BVH over a triangle soup.
 *
 * @param {Float32Array} positions  Nine floats per triangle: ax ay az bx by bz cx cy cz.
 * @param {number} [triangleCount]  Defaults to positions.length / 9.
 */
export function buildBvh(positions, triangleCount = Math.floor(positions.length / 9)) {
  const count = Math.max(0, triangleCount);

  const order = new Uint32Array(count);
  const centroids = new Float32Array(count * 3);
  const triBounds = new Float32Array(count * 6);

  for (let triangle = 0; triangle < count; triangle += 1) {
    order[triangle] = triangle;
    const base = triangle * 9;

    for (let axis = 0; axis < 3; axis += 1) {
      const a = positions[base + axis];
      const b = positions[base + 3 + axis];
      const c = positions[base + 6 + axis];
      triBounds[triangle * 6 + axis] = Math.min(a, b, c);
      triBounds[triangle * 6 + 3 + axis] = Math.max(a, b, c);
      centroids[triangle * 3 + axis] = (a + b + c) / 3;
    }
  }

  /*
   * Two nodes per triangle, which is the only bound that actually holds.
   *
   * The tempting estimate is 2·ceil(N / LEAF_SIZE) — the node count of a
   * *balanced* tree whose leaves are full. Splits are not guaranteed balanced:
   * a degenerate distribution can put one triangle in each leaf, giving 2N−1
   * nodes. Under-allocating does not throw, because writing past the end of a
   * typed array is silently discarded — it produces a tree whose deep nodes
   * read back as `undefined`, and rays quietly miss geometry they should hit.
   */
  const maxNodes = Math.max(1, 2 * count + 1);
  const bounds = new Float32Array(maxNodes * 6);
  const leftChild = new Int32Array(maxNodes).fill(-1);
  const start = new Int32Array(maxNodes);
  const length = new Int32Array(maxNodes);

  let nodeCount = 0;

  function boundsOf(node, from, to) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let index = from; index < to; index += 1) {
      const triangle = order[index] * 6;
      if (triBounds[triangle] < minX) minX = triBounds[triangle];
      if (triBounds[triangle + 1] < minY) minY = triBounds[triangle + 1];
      if (triBounds[triangle + 2] < minZ) minZ = triBounds[triangle + 2];
      if (triBounds[triangle + 3] > maxX) maxX = triBounds[triangle + 3];
      if (triBounds[triangle + 4] > maxY) maxY = triBounds[triangle + 4];
      if (triBounds[triangle + 5] > maxZ) maxZ = triBounds[triangle + 5];
    }

    const slot = node * 6;
    bounds[slot] = minX;
    bounds[slot + 1] = minY;
    bounds[slot + 2] = minZ;
    bounds[slot + 3] = maxX;
    bounds[slot + 4] = maxY;
    bounds[slot + 5] = maxZ;
  }

  /** Partition [from, to) about a plane on `axis`; returns the split index. */
  function partition(from, to, axis, position) {
    let left = from;
    for (let index = from; index < to; index += 1) {
      if (centroids[order[index] * 3 + axis] < position) {
        const swap = order[index];
        order[index] = order[left];
        order[left] = swap;
        left += 1;
      }
    }
    return left;
  }

  /*
   * `node` is allocated by the caller, and a node's two children are always
   * allocated as an adjacent pair. That adjacency is load-bearing: the
   * traversal pushes `left` and `left + 1`, so if the children were numbered as
   * they were reached — left child, then its entire subtree, then the right
   * child — "left + 1" would name a grandchild and whole branches of the tree
   * would never be visited.
   */
  function build(node, from, to) {
    boundsOf(node, from, to);

    const items = to - from;
    if (items <= LEAF_SIZE) {
      leftChild[node] = -1;
      start[node] = from;
      length[node] = items;
      return;
    }

    // Split the widest axis of the *centroid* spread, not of the bounds: a few
    // long thin triangles can stretch the bounds without saying anything about
    // where the work actually is.
    let bestAxis = 0;
    let bestSpread = -1;
    let bestMin = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      let minimum = Infinity;
      let maximum = -Infinity;
      for (let index = from; index < to; index += 1) {
        const value = centroids[order[index] * 3 + axis];
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
      }
      if (maximum - minimum > bestSpread) {
        bestSpread = maximum - minimum;
        bestAxis = axis;
        bestMin = minimum;
      }
    }

    let middle = from;
    if (bestSpread > EPSILON) {
      // Try a few evenly spaced planes and take the most balanced. Cheaper than
      // a full surface-area heuristic and close enough on building massing,
      // which is mostly axis-aligned boxes.
      let bestBalance = Infinity;
      for (let bin = 1; bin < SPLIT_BINS; bin += 1) {
        const position = bestMin + (bestSpread * bin) / SPLIT_BINS;
        let left = 0;
        for (let index = from; index < to; index += 1) {
          if (centroids[order[index] * 3 + bestAxis] < position) left += 1;
        }
        if (left === 0 || left === items) continue;
        const balance = Math.abs(left - (items - left));
        if (balance < bestBalance) {
          bestBalance = balance;
          middle = position;
        }
      }
      middle = bestBalance === Infinity ? from : partition(from, to, bestAxis, middle);
    }

    // Every centroid on one side — split down the middle rather than recursing
    // forever on the same set.
    if (middle <= from || middle >= to) middle = (from + to) >> 1;

    const left = nodeCount;
    nodeCount += 2;
    leftChild[node] = left;
    build(left, from, middle);
    build(left + 1, middle, to);
  }

  if (count > 0) {
    nodeCount = 1;
    build(0, 0, count);
  }

  return { positions, order, bounds, leftChild, start, length, nodeCount, triangleCount: count };
}

/**
 * Möller-Trumbore, double-sided.
 *
 * Double-sided on purpose: the massing mesh is built from footprints whose
 * winding is whatever the model happened to produce, and a shadow ray that
 * ignored back faces would sail straight through half the building.
 */
function hitsTriangle(positions, triangle, ox, oy, oz, dx, dy, dz, maxDistance) {
  const base = triangle * 9;
  const ax = positions[base];
  const ay = positions[base + 1];
  const az = positions[base + 2];

  const e1x = positions[base + 3] - ax;
  const e1y = positions[base + 4] - ay;
  const e1z = positions[base + 5] - az;
  const e2x = positions[base + 6] - ax;
  const e2y = positions[base + 7] - ay;
  const e2z = positions[base + 8] - az;

  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;

  const determinant = e1x * px + e1y * py + e1z * pz;
  if (determinant > -EPSILON && determinant < EPSILON) return false;

  const inverse = 1 / determinant;
  const tx = ox - ax;
  const ty = oy - ay;
  const tz = oz - az;

  const u = (tx * px + ty * py + tz * pz) * inverse;
  if (u < 0 || u > 1) return false;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;

  const v = (dx * qx + dy * qy + dz * qz) * inverse;
  if (v < 0 || u + v > 1) return false;

  const distance = (e2x * qx + e2y * qy + e2z * qz) * inverse;
  return distance > EPSILON && distance < maxDistance;
}

/** Slab test against a node's box. Returns the near hit distance, or -1. */
function hitsBox(bounds, node, ox, oy, oz, ix, iy, iz, maxDistance) {
  const slot = node * 6;

  let tMin = ((ix >= 0 ? bounds[slot] : bounds[slot + 3]) - ox) * ix;
  let tMax = ((ix >= 0 ? bounds[slot + 3] : bounds[slot]) - ox) * ix;

  const tyMin = ((iy >= 0 ? bounds[slot + 1] : bounds[slot + 4]) - oy) * iy;
  const tyMax = ((iy >= 0 ? bounds[slot + 4] : bounds[slot + 1]) - oy) * iy;
  if (tMin > tyMax || tyMin > tMax) return -1;
  if (tyMin > tMin) tMin = tyMin;
  if (tyMax < tMax) tMax = tyMax;

  const tzMin = ((iz >= 0 ? bounds[slot + 2] : bounds[slot + 5]) - oz) * iz;
  const tzMax = ((iz >= 0 ? bounds[slot + 5] : bounds[slot + 2]) - oz) * iz;
  if (tMin > tzMax || tzMin > tMax) return -1;
  if (tzMin > tMin) tMin = tzMin;
  if (tzMax < tMax) tMax = tzMax;

  if (tMax < 0 || tMin > maxDistance) return -1;
  return Math.max(tMin, 0);
}

/** Traversal stack, reused across queries so the hot path allocates nothing. */
const STACK = new Int32Array(128);

/**
 * Does anything block the ray within `maxDistance`?
 *
 * @param {object} bvh  From `buildBvh`.
 * @param {number} ox @param {number} oy @param {number} oz  Ray origin.
 * @param {number} dx @param {number} dy @param {number} dz  Direction, unit length.
 * @param {number} [maxDistance]
 * @returns {boolean}
 */
export function bvhIntersectsRay(bvh, ox, oy, oz, dx, dy, dz, maxDistance = Infinity) {
  if (!bvh || bvh.triangleCount === 0) return false;

  const { bounds, leftChild, start, length, order, positions } = bvh;
  // Infinities here are deliberate and correct: an axis-parallel ray gives
  // ±Infinity, and the slab comparisons handle that without a special case.
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;

  let depth = 0;
  STACK[depth] = 0;
  depth += 1;

  while (depth > 0) {
    depth -= 1;
    const node = STACK[depth];
    if (hitsBox(bounds, node, ox, oy, oz, ix, iy, iz, maxDistance) < 0) continue;

    const left = leftChild[node];
    if (left < 0) {
      const from = start[node];
      const to = from + length[node];
      for (let index = from; index < to; index += 1) {
        if (hitsTriangle(positions, order[index], ox, oy, oz, dx, dy, dz, maxDistance)) return true;
      }
      continue;
    }

    // Guard rather than grow: 128 levels is far beyond any tree this build
    // produces, and silently overrunning would corrupt the traversal.
    if (depth + 2 <= STACK.length) {
      STACK[depth] = left;
      STACK[depth + 1] = left + 1;
      depth += 2;
    }
  }

  return false;
}

/** Brute-force equivalent of `bvhIntersectsRay`, for tests to check against. */
export function bruteForceIntersectsRay(positions, triangleCount, ox, oy, oz, dx, dy, dz, maxDistance = Infinity) {
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (hitsTriangle(positions, triangle, ox, oy, oz, dx, dy, dz, maxDistance)) return true;
  }
  return false;
}

export const BVH_CONSTANTS = { LEAF_SIZE, SPLIT_BINS, EPSILON };
