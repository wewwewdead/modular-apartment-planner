/**
 * True parallel-edge polygon offsetting for kerf compensation.
 *
 * Each edge is displaced along its outward normal by the offset distance, then
 * each new vertex is computed as the intersection of the two adjacent offset
 * edge lines (a miter join). This yields exactly `distance` of clearance on
 * every edge regardless of corner angle — unlike a bisector displacement, which
 * only clears `distance * sin(theta/2)` and undersizes acute/right-angle corners.
 *
 * Positive distance expands the polygon outward; negative shrinks it inward.
 */

const EPSILON = 1e-9;

/**
 * Signed area (shoelace) times 2. Positive/negative encodes winding order.
 * @param {{x:number,y:number}[]} points
 * @returns {number}
 */
export function signedAreaX2(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum;
}

/**
 * Drop consecutive duplicate/coincident points (including the wrap-around pair).
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number,y:number}[]}
 */
function dedupePoints(points) {
  const cleaned = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.abs(previous.x - point.x) < EPSILON && Math.abs(previous.y - point.y) < EPSILON) {
      continue;
    }
    cleaned.push({ x: point.x, y: point.y });
  }

  // Remove trailing point coincident with the first (closes the wrap-around).
  while (
    cleaned.length > 1 &&
    Math.abs(cleaned[0].x - cleaned[cleaned.length - 1].x) < EPSILON &&
    Math.abs(cleaned[0].y - cleaned[cleaned.length - 1].y) < EPSILON
  ) {
    cleaned.pop();
  }

  return cleaned;
}

/**
 * Build the outward-offset line for the edge from `a` to `b`.
 * The line is represented by a point on it plus its unit direction.
 * `winding` is +1 when the polygon is CCW in standard (y-up) math coords.
 * @returns {{ px:number, py:number, dx:number, dy:number } | null}
 */
function offsetEdgeLine(a, b, distance, winding) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const length = Math.hypot(ex, ey);
  if (length < EPSILON) {
    return null;
  }

  const ux = ex / length;
  const uy = ey / length;

  // For a CCW polygon the outward normal of edge (a->b) is the right-hand
  // normal (uy, -ux). Flip for CW input so the offset always moves outward.
  const normalX = uy * winding;
  const normalY = -ux * winding;

  return {
    px: a.x + normalX * distance,
    py: a.y + normalY * distance,
    dx: ux,
    dy: uy,
  };
}

/**
 * Intersect two lines given as point + direction. Returns null when the lines
 * are (near) parallel, in which case the caller should fall back to the shared
 * offset point of the incoming edge.
 */
function intersectLines(line1, line2) {
  const cross = line1.dx * line2.dy - line1.dy * line2.dx;
  if (Math.abs(cross) < EPSILON) {
    return null;
  }

  const wx = line2.px - line1.px;
  const wy = line2.py - line1.py;
  const t = (wx * line2.dy - wy * line2.dx) / cross;

  return {
    x: line1.px + line1.dx * t,
    y: line1.py + line1.dy * t,
  };
}

/**
 * Offset a closed polygon by `distance` using true parallel-edge offsetting.
 *
 * @param {{x:number,y:number}[]} points Polygon vertices (closed implicitly).
 * @param {number} distance Positive expands outward, negative shrinks inward.
 * @param {{ miterLimit?: number }} [options]
 * @returns {{x:number,y:number}[]} Offset polygon in the same winding order.
 */
export function offsetPolygon(points, distance, options = {}) {
  const cleaned = dedupePoints(points || []);
  if (cleaned.length < 3 || !Number.isFinite(distance) || Math.abs(distance) < EPSILON) {
    return cleaned;
  }

  const miterLimit = Number.isFinite(options.miterLimit) ? options.miterLimit : 4;

  // signedAreaX2 > 0 => CCW in standard math coords. The offset direction only
  // depends on the sign of distance relative to winding, so encode winding as
  // +1 (CCW) / -1 (CW) and let a negative distance flip it naturally.
  const winding = signedAreaX2(cleaned) >= 0 ? 1 : -1;
  const count = cleaned.length;

  // Precompute the offset line for every edge (edge i goes vertex i -> i+1).
  const edgeLines = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % count];
    edgeLines[i] = offsetEdgeLine(a, b, distance, winding);
  }

  const result = [];
  for (let i = 0; i < count; i += 1) {
    // Vertex i is the join between the previous edge (i-1) and edge (i).
    const prevEdge = edgeLines[(i - 1 + count) % count];
    const nextEdge = edgeLines[i];

    // Degenerate neighbouring edge: fall back to whichever offset line exists.
    if (!prevEdge && !nextEdge) {
      result.push({ x: cleaned[i].x, y: cleaned[i].y });
      continue;
    }
    if (!prevEdge || !nextEdge) {
      const line = prevEdge || nextEdge;
      result.push({ x: line.px, y: line.py });
      continue;
    }

    const intersection = intersectLines(prevEdge, nextEdge);
    if (!intersection) {
      // Collinear or near-parallel edges: the offset lines coincide (or nearly
      // so). The shared offset point is the correct, stable vertex.
      result.push({ x: nextEdge.px, y: nextEdge.py });
      continue;
    }

    // Miter-limit guard: clamp runaway spikes at sharp reflex corners.
    const miterDx = intersection.x - cleaned[i].x;
    const miterDy = intersection.y - cleaned[i].y;
    const miterLength = Math.hypot(miterDx, miterDy);
    const maxMiter = Math.abs(distance) * miterLimit;
    if (maxMiter > 0 && miterLength > maxMiter) {
      const scale = maxMiter / miterLength;
      result.push({
        x: cleaned[i].x + miterDx * scale,
        y: cleaned[i].y + miterDy * scale,
      });
      continue;
    }

    result.push(intersection);
  }

  return result;
}
