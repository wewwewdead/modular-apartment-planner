import * as THREE from 'three';

/**
 * The set of meshes walk-mode rays are allowed to hit, and a spatial index over
 * them.
 *
 * ## Why this exists
 *
 * The walk controller casts nine to fifteen rays per animation frame, and every
 * one of them used to go through `raycaster.intersectObjects([worldRoot,
 * ground], true)` — a recursive walk of the entire preview graph, every mesh on
 * every floor, plus every edge-outline `LineSegments` beside them, allocating an
 * intersection object per hit and sorting the lot before the first one was even
 * looked at. On the playground project that is 1196 nodes and 588 meshes per
 * ray. The collidability rules were then applied *per hit*, which meant walking
 * each hit's parent chain looking for a hidden floor group.
 *
 * Every one of those facts is known before the ray is cast. Which meshes are
 * collidable changes only when the world changes; where they are changes only
 * when the world changes; and a ray a few metres long cannot possibly reach most
 * of them. So the set is collected once per world change, each mesh's
 * world-space box is precomputed alongside it, and a bounding volume hierarchy
 * over those boxes turns "test everything" into "test the handful the ray
 * actually passes through".
 *
 * ## What it deliberately does not change
 *
 * The collidable set is exactly what `isCollidable` used to decide per hit:
 * meshes only, nothing under a hidden node, and never a door leaf (the preview
 * draws every door closed and a tour that stops at each of them is a tour of the
 * hallway). Hidden floors and doors are resolved *at collect time* rather than
 * per hit, which is the whole saving — but the answer is the same one.
 *
 * The narrow phase is still `Mesh.raycast`, so a hit carries the same distance,
 * point, face and normal three would have produced. This index decides which
 * meshes are asked, never what an intersection means.
 *
 * ## Staleness
 *
 * A stale index is the one failure mode that matters: it would let the body walk
 * through a wall that was built a frame ago. Two independent guards, because the
 * cost of either being wrong is a bug nobody would think to look for here:
 *
 *  1. `invalidate()` is called by every viewport path that swaps world content —
 *     `setWorld` (including the scene cache's same-root incremental rebuild) and
 *     `rebuildGround`.
 *  2. `sync()` compares a cheap structural signature of the sources on every
 *     use: the source objects themselves, and each one's immediate children with
 *     their `visible` flags. That covers everything the incremental cache can do
 *     to a reused root — it rebuilds a floor into a *new* group object, and it
 *     flips a floor group's `visible` to change the preview scope — so even a
 *     missed `invalidate()` cannot survive a frame.
 */

/** Meshes per BVH leaf. Below this, testing them all beats another split. */
const LEAF_SIZE = 4;

/**
 * Mesh count above which the hierarchy earns its build cost.
 *
 * Under it the flat list with a box precheck is already faster than the tree
 * traversal's bookkeeping, and a walk through an empty site should not pay to
 * index six meshes.
 */
const BVH_MIN_MESHES = 24;

const workingBox = new THREE.Box3();

/** Everything under a node that is switched off is out of the world. */
function isNodeVisible(object) {
  for (let node = object; node; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

/**
 * Structural signature of the collision sources.
 *
 * Deliberately shallow — the sources themselves, then one entry per immediate
 * child and its visibility. That is precisely the granularity the preview scene
 * cache works at: a rebuilt floor arrives as a new group object, and a scope
 * change arrives as a flipped `visible` on an existing one. Going deeper would
 * cost a full traversal on every step to detect something that cannot happen
 * without one of those two showing up here first.
 */
function writeSignature(sources, out) {
  out.length = 0;
  for (const source of sources) {
    out.push(source, source.visible);
    const children = source.children;
    out.push(children.length);
    for (const child of children) {
      out.push(child, child.visible);
    }
  }
}

function signatureEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Slab test against box `slot`, returning the entry distance or -1 for a miss.
 *
 * The `far` clamp is the half of this that matters most: a wall ray is three
 * metres long in a building tens of metres across, and a bounding-sphere test —
 * which is all `Mesh.raycast` does on its own — has no notion of how far the ray
 * reaches.
 */
function boxEntryDistance(boxes, slot, ox, oy, oz, ix, iy, iz, far) {
  let tMin = ((ix >= 0 ? boxes[slot] : boxes[slot + 3]) - ox) * ix;
  let tMax = ((ix >= 0 ? boxes[slot + 3] : boxes[slot]) - ox) * ix;

  const tyMin = ((iy >= 0 ? boxes[slot + 1] : boxes[slot + 4]) - oy) * iy;
  const tyMax = ((iy >= 0 ? boxes[slot + 4] : boxes[slot + 1]) - oy) * iy;
  if (tMin > tyMax || tyMin > tMax) return -1;
  if (tyMin > tMin) tMin = tyMin;
  if (tyMax < tMax) tMax = tyMax;

  const tzMin = ((iz >= 0 ? boxes[slot + 2] : boxes[slot + 5]) - oz) * iz;
  const tzMax = ((iz >= 0 ? boxes[slot + 5] : boxes[slot + 2]) - oz) * iz;
  if (tMin > tzMax || tzMin > tMax) return -1;
  if (tzMin > tMin) tMin = tzMin;
  if (tzMax < tMax) tMax = tzMax;

  if (tMax < 0 || tMin > far) return -1;
  return tMin < 0 ? 0 : tMin;
}

/**
 * Median-split hierarchy over the mesh boxes.
 *
 * Over boxes rather than triangles, which is what makes it cheap enough to
 * rebuild whenever a wall is dragged: the narrow phase stays `Mesh.raycast`, so
 * nothing here has to know a triangle from a hole in the ground. Children are
 * allocated as an adjacent pair so the traversal can name the second one as
 * `left + 1` — the same contract `src/analysis/rayBvh.js` documents, and for the
 * same reason.
 */
function buildBoxBvh(boxes, count) {
  const order = new Uint32Array(count);
  const centroids = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    order[index] = index;
    const slot = index * 6;
    centroids[index * 3] = (boxes[slot] + boxes[slot + 3]) / 2;
    centroids[index * 3 + 1] = (boxes[slot + 1] + boxes[slot + 4]) / 2;
    centroids[index * 3 + 2] = (boxes[slot + 2] + boxes[slot + 5]) / 2;
  }

  // 2N-1 is the only bound that holds: a degenerate split can leave one mesh in
  // each leaf, and under-allocating a typed array fails silently.
  const maxNodes = Math.max(1, 2 * count + 1);
  const bounds = new Float32Array(maxNodes * 6);
  const leftChild = new Int32Array(maxNodes).fill(-1);
  const start = new Int32Array(maxNodes);
  const length = new Int32Array(maxNodes);
  let nodeCount = 0;

  const boundsOf = (node, from, to) => {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = from; index < to; index += 1) {
      const slot = order[index] * 6;
      if (boxes[slot] < minX) minX = boxes[slot];
      if (boxes[slot + 1] < minY) minY = boxes[slot + 1];
      if (boxes[slot + 2] < minZ) minZ = boxes[slot + 2];
      if (boxes[slot + 3] > maxX) maxX = boxes[slot + 3];
      if (boxes[slot + 4] > maxY) maxY = boxes[slot + 4];
      if (boxes[slot + 5] > maxZ) maxZ = boxes[slot + 5];
    }
    const slot = node * 6;
    bounds[slot] = minX;
    bounds[slot + 1] = minY;
    bounds[slot + 2] = minZ;
    bounds[slot + 3] = maxX;
    bounds[slot + 4] = maxY;
    bounds[slot + 5] = maxZ;
  };

  const build = (node, from, to) => {
    boundsOf(node, from, to);
    const items = to - from;
    if (items <= LEAF_SIZE) {
      leftChild[node] = -1;
      start[node] = from;
      length[node] = items;
      return;
    }

    // Widest spread of the centroids, not of the boxes: one long beam can
    // stretch the bounds without saying anything about where the meshes are.
    let bestAxis = 0;
    let bestSpread = -1;
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
      }
    }

    // Median by nth-element rather than a full sort: the tree only needs the
    // halves, not an ordering inside them.
    const middle = (from + to) >> 1;
    quickSelect(order, centroids, bestAxis, from, to - 1, middle);

    const left = nodeCount;
    nodeCount += 2;
    leftChild[node] = left;
    build(left, from, middle);
    build(left + 1, middle, to);
  };

  if (count > 0) {
    nodeCount = 1;
    build(0, 0, count);
  }

  return { bounds, leftChild, start, length, order, nodeCount };
}

/** Hoare partition around a pivot, recursing only into the half holding `nth`. */
function quickSelect(order, centroids, axis, low, high, nth) {
  let from = low;
  let to = high;
  while (from < to) {
    const pivot = centroids[order[(from + to) >> 1] * 3 + axis];
    let left = from;
    let right = to;
    while (left <= right) {
      while (centroids[order[left] * 3 + axis] < pivot) left += 1;
      while (centroids[order[right] * 3 + axis] > pivot) right -= 1;
      if (left <= right) {
        const swap = order[left];
        order[left] = order[right];
        order[right] = swap;
        left += 1;
        right -= 1;
      }
    }
    if (nth <= right) to = right;
    else if (nth >= left) from = left;
    else return;
  }
}

export function createCollisionIndex() {
  /** @type {THREE.Mesh[]} */
  let meshes = [];
  let boxes = new Float32Array(0);
  let bvh = null;
  let signature = [];
  let dirty = true;
  let builds = 0;

  const nextSignature = [];
  const hitBuffer = [];
  const stack = new Int32Array(64);

  /**
   * Walk a source subtree, keeping every collidable mesh under it.
   *
   * Written out rather than using `Object3D.traverse` because the whole point is
   * to *prune*: a hidden floor group's several hundred meshes are skipped as one
   * decision here, where `traverse` would visit them all and leave each to
   * re-discover its hidden ancestor.
   */
  const collectFrom = (node) => {
    if (node.visible === false) return;
    if (node.isMesh) {
      // Door leaves are passable — see the header of `createWalkPhysics`.
      if (node.userData?.previewTarget?.kind !== 'door') meshes.push(node);
    }
    const children = node.children;
    for (let index = 0; index < children.length; index += 1) {
      collectFrom(children[index]);
    }
  };

  const collect = (sources) => {
    meshes = [];
    for (const source of sources) {
      if (!source || !isNodeVisible(source)) continue;
      // Once per world change, not once per ray: a mesh whose world matrix has
      // never been computed has no box worth precomputing, and the render that
      // would have done it may not have happened yet.
      source.updateMatrixWorld(true);
      collectFrom(source);
    }

    const count = meshes.length;
    if (boxes.length < count * 6) boxes = new Float32Array(count * 6);

    for (let index = 0; index < count; index += 1) {
      const mesh = meshes[index];
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      workingBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      const slot = index * 6;
      boxes[slot] = workingBox.min.x;
      boxes[slot + 1] = workingBox.min.y;
      boxes[slot + 2] = workingBox.min.z;
      boxes[slot + 3] = workingBox.max.x;
      boxes[slot + 4] = workingBox.max.y;
      boxes[slot + 5] = workingBox.max.z;
    }

    bvh = count >= BVH_MIN_MESHES ? buildBoxBvh(boxes, count) : null;
    builds += 1;
  };

  return {
    /** Drop the indexed set; the next `sync` rebuilds it from scratch. */
    invalidate() {
      dirty = true;
      meshes = [];
      bvh = null;
      signature.length = 0;
    },

    /**
     * Bring the index into line with `sources`, rebuilding only when something
     * about them actually changed. Cheap enough to call every step.
     */
    sync(sources) {
      writeSignature(sources, nextSignature);
      if (!dirty && signatureEqual(signature, nextSignature)) return;
      collect(sources);
      signature = nextSignature.slice();
      dirty = false;
    },

    /**
     * Nearest collidable hit for an already-aimed raycaster, or null.
     *
     * `raycaster.far` is honoured and then *shrunk* as hits are found, so both
     * the box test and `Mesh.raycast`'s own distance check prune against the
     * best answer so far rather than against the original reach.
     */
    raycastNearest(raycaster) {
      const count = meshes.length;
      if (!count) return null;

      const ray = raycaster.ray;
      const ox = ray.origin.x;
      const oy = ray.origin.y;
      const oz = ray.origin.z;
      // Infinities are deliberate: an axis-parallel ray gives ±Infinity and the
      // slab comparisons handle it without a special case. The ground probe is
      // exactly this ray.
      const ix = 1 / ray.direction.x;
      const iy = 1 / ray.direction.y;
      const iz = 1 / ray.direction.z;

      const originalFar = raycaster.far;
      let best = null;
      let bestDistance = originalFar;

      const testMesh = (index) => {
        hitBuffer.length = 0;
        meshes[index].raycast(raycaster, hitBuffer);
        for (const hit of hitBuffer) {
          if (hit.distance < bestDistance) {
            bestDistance = hit.distance;
            best = hit;
          }
        }
        // Anything further away than the best hit cannot improve on it.
        raycaster.far = bestDistance;
      };

      if (!bvh) {
        for (let index = 0; index < count; index += 1) {
          if (boxEntryDistance(boxes, index * 6, ox, oy, oz, ix, iy, iz, bestDistance) < 0) continue;
          testMesh(index);
        }
        raycaster.far = originalFar;
        return best;
      }

      const { bounds, leftChild, start, length, order } = bvh;
      let depth = 0;
      stack[depth] = 0;
      depth += 1;

      while (depth > 0) {
        depth -= 1;
        const node = stack[depth];
        if (boxEntryDistance(bounds, node * 6, ox, oy, oz, ix, iy, iz, bestDistance) < 0) continue;

        const left = leftChild[node];
        if (left < 0) {
          const from = start[node];
          const to = from + length[node];
          for (let slot = from; slot < to; slot += 1) {
            const index = order[slot];
            if (boxEntryDistance(boxes, index * 6, ox, oy, oz, ix, iy, iz, bestDistance) < 0) continue;
            testMesh(index);
          }
          continue;
        }

        // Guard rather than grow: a median-split tree over any scene this
        // preview can build is far shallower than 64 levels, and overrunning
        // would silently corrupt the traversal.
        if (depth + 2 <= stack.length) {
          stack[depth] = left;
          stack[depth + 1] = left + 1;
          depth += 2;
        }
      }

      raycaster.far = originalFar;
      return best;
    },

    /** What the index is currently holding. Diagnostic, and used by the tests. */
    getStats() {
      return { meshes: meshes.length, nodes: bvh ? bvh.nodeCount : 0, builds };
    },
  };
}

export const COLLISION_INDEX_CONSTANTS = { LEAF_SIZE, BVH_MIN_MESHES };
