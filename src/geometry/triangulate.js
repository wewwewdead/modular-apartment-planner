/**
 * Ear-clipping triangulation for simple polygons, with holes.
 *
 * Needed because the solar study raycasts against the building as a triangle
 * mesh, and a prism's end caps are arbitrary polygons — a merged floor plate is
 * a ring with the rooms as holes, and a fan from the centroid would fold itself
 * inside out on the first concave corner.
 *
 * Points carry an optional `z`, preserved through the hole bridging and the
 * clipping, so a sloped roof plane's cap comes out at the right height without
 * the caller re-deriving elevations from an index map.
 *
 * Hole elimination follows the standard approach: for each hole, cast a ray
 * from its rightmost vertex towards +x, find the outer edge it hits, pick a
 * mutually visible outer vertex, and splice the hole into the outline as a
 * zero-width bridge. That turns a polygon with holes into one simple polygon
 * that ear clipping can eat.
 */

/** Twice the signed area. Positive and negative just mean opposite windings. */
function doubleSignedArea(points) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total;
}

function copyPoint(point) {
  return { x: point.x, y: point.y, z: point.z ?? 0 };
}

/** Return a copy wound the way the caller wants. */
function oriented(points, wantPositive) {
  const copy = points.map(copyPoint);
  const positive = doubleSignedArea(copy) > 0;
  return positive === wantPositive ? copy : copy.reverse();
}

function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = cross(ax, ay, bx, by, px, py);
  const d2 = cross(bx, by, cx, cy, px, py);
  const d3 = cross(cx, cy, ax, ay, px, py);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

/**
 * The outline vertex a hole should bridge to.
 *
 * Cast right from the hole's rightmost point. The first outline edge crossed
 * gives a candidate; if any reflex outline vertex lies inside the triangle
 * formed by the hole point, the crossing and the candidate, that vertex is in
 * the way and the one at the shallowest angle takes its place. This is the
 * classic construction, and it is what stops a bridge from cutting across the
 * polygon it is meant to stay inside.
 */
function findBridgeIndex(outline, holePoint) {
  let bestX = -Infinity;
  let bestIndex = -1;

  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    // Only edges straddling the ray's y can be crossed by it.
    if (holePoint.y > Math.max(current.y, next.y) || holePoint.y < Math.min(current.y, next.y)) continue;
    if (current.y === next.y) continue;

    const t = (holePoint.y - current.y) / (next.y - current.y);
    const x = current.x + (next.x - current.x) * t;
    if (x < holePoint.x || x <= bestX) continue;

    bestX = x;
    bestIndex = current.x > next.x ? index : (index + 1) % outline.length;
  }

  if (bestIndex < 0) return -1;

  const candidate = outline[bestIndex];
  let bestAngle = Math.abs(holePoint.y - candidate.y) / Math.abs(holePoint.x - candidate.x || 1e-9);
  let chosen = bestIndex;

  for (let index = 0; index < outline.length; index += 1) {
    if (index === bestIndex) continue;
    const point = outline[index];
    if (point.x < holePoint.x || point.x > bestX) continue;
    if (!pointInTriangle(point.x, point.y, holePoint.x, holePoint.y, bestX, holePoint.y, candidate.x, candidate.y)) {
      continue;
    }

    const angle = Math.abs(holePoint.y - point.y) / Math.abs(holePoint.x - point.x || 1e-9);
    if (angle < bestAngle) {
      bestAngle = angle;
      chosen = index;
    }
  }

  return chosen;
}

function rightmostIndex(points) {
  let best = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].x > points[best].x) best = index;
  }
  return best;
}

/**
 * Splice every hole into the outline, producing one simple polygon.
 *
 * Holes go in rightmost-first: a hole further right can only bridge to the
 * outline or to a hole already spliced in, never to one still waiting, so the
 * order removes the need to re-test.
 */
function eliminateHoles(outline, holes) {
  let polygon = outline;

  const ordered = holes
    .filter((hole) => hole.length >= 3)
    .map((hole) => oriented(hole, false))
    .map((hole) => ({ points: hole, index: rightmostIndex(hole) }))
    .sort((a, b) => b.points[b.index].x - a.points[a.index].x);

  for (const hole of ordered) {
    const bridge = findBridgeIndex(polygon, hole.points[hole.index]);
    if (bridge < 0) continue;

    const spliced = polygon.slice(0, bridge + 1);
    for (let step = 0; step <= hole.points.length; step += 1) {
      spliced.push(copyPoint(hole.points[(hole.index + step) % hole.points.length]));
    }
    spliced.push(copyPoint(polygon[bridge]));
    polygon = spliced.concat(polygon.slice(bridge + 1));
  }

  return polygon;
}

function isEar(points, indices, position) {
  const count = indices.length;
  const previous = (position - 1 + count) % count;
  const next = (position + 1) % count;
  const a = points[indices[previous]];
  const b = points[indices[position]];
  const c = points[indices[next]];

  // Reflex or collinear corners are not ears. Positive winding throughout, so
  // convex means a positive cross product.
  if (cross(a.x, a.y, b.x, b.y, c.x, c.y) <= 0) return false;

  for (let offset = 0; offset < count; offset += 1) {
    if (offset === position || offset === previous || offset === next) continue;
    const point = points[indices[offset]];
    if (!pointInTriangle(point.x, point.y, a.x, a.y, b.x, b.y, c.x, c.y)) continue;

    /*
     * Only a reflex corner can actually block an ear, and testing for that is
     * not an optimisation here — it is what makes bridged holes work at all.
     *
     * Splicing a hole into the outline leaves the bridge endpoints duplicated,
     * and a duplicate sits exactly on the boundary of any triangle its twin
     * belongs to. An inclusive containment test therefore reports it as "in the
     * way", every candidate ear gets rejected, and the polygon comes back with
     * no triangles at all — which is precisely what happened before this
     * condition existed. A convex corner cannot enclose anything, duplicate or
     * not, so it never blocks.
     */
    const before = points[indices[(offset - 1 + count) % count]];
    const after = points[indices[(offset + 1) % count]];
    if (cross(before.x, before.y, point.x, point.y, after.x, after.y) <= 0) return false;
  }

  return true;
}

/**
 * Triangulate a polygon, with optional holes.
 *
 * @param {Array<{x: number, y: number, z?: number}>} outline
 * @param {Array<Array<{x: number, y: number, z?: number}>>} [holes]
 * @returns {{vertices: Array<{x: number, y: number, z: number}>, indices: number[]}}
 *   `indices` is a flat list of triangle corners into `vertices`. Empty when the
 *   polygon is degenerate — callers get nothing rather than garbage.
 */
export function triangulate(outline, holes = []) {
  if (!outline || outline.length < 3) return { vertices: [], indices: [] };

  const vertices = eliminateHoles(oriented(outline, true), holes);
  if (vertices.length < 3) return { vertices: [], indices: [] };

  const indices = vertices.map((_, index) => index);
  const triangles = [];

  // Each pass must remove at least one ear; the guard stops a self-intersecting
  // polygon from spinning forever rather than returning a partial fan.
  let guard = indices.length * 2;
  while (indices.length > 3 && guard > 0) {
    let clipped = false;
    for (let position = 0; position < indices.length; position += 1) {
      if (!isEar(vertices, indices, position)) continue;
      const count = indices.length;
      triangles.push(indices[(position - 1 + count) % count], indices[position], indices[(position + 1) % count]);
      indices.splice(position, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
    guard -= 1;
  }

  if (indices.length === 3) triangles.push(indices[0], indices[1], indices[2]);

  return { vertices, indices: triangles };
}

export const TRIANGULATE_HELPERS = { doubleSignedArea, pointInTriangle };
